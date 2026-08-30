import { describe, expect, it } from "vitest";
import { CARD_DEFS, RAT_KING_LIST } from "./card-trial/cards";
import type { CardId } from "./card-trial/types";
import { OLD_MAN_BUILD_STARTERS } from "./old-man-builds";
import { RAT_KING_BUILD_STARTERS } from "./rat-king-builds";
import {
  CAMPAIGN_CARD_DUPLICATE_LIMIT,
  CAMPAIGN_CARD_SCHEMA_VERSION,
  CAMPAIGN_DECK_SIZE,
  CAMPAIGN_STARTER_DECKS,
  activeCampaignDeck,
  createCampaignCardProgress,
  encounterRewardInstance,
  grantCampaignCard,
  normalizeCampaignCardProgress,
  normalizePendingCampaignEncounter,
  swapCampaignDeckCard,
  unusedCampaignCards,
} from "./campaign-cards";

/** Old Man's starter with no build chosen (createCampaignCardProgress's default). */
const DEFAULT_STARTER: Record<"rat-king" | "old-man", readonly CardId[]> = {
  "rat-king": CAMPAIGN_STARTER_DECKS["rat-king"],
  "old-man": OLD_MAN_BUILD_STARTERS.legacy,
};

describe("campaign card progression", () => {
  it("starts both heroes with eight unique definitions as twelve physical cards", () => {
    const progress = createCampaignCardProgress();
    expect(progress.schemaVersion).toBe(CAMPAIGN_CARD_SCHEMA_VERSION);
    for (const heroId of ["rat-king", "old-man"] as const) {
      expect(progress[heroId].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
      expect(activeCampaignDeck(progress, heroId)).toHaveLength(CAMPAIGN_DECK_SIZE);
      expect(new Set(progress[heroId].activeDeck).size).toBe(CAMPAIGN_DECK_SIZE);
      const ids = activeCampaignDeck(progress, heroId).map((card) => card.cardId);
      expect(ids).toEqual([...DEFAULT_STARTER[heroId]]);
      expect(new Set(ids).size).toBe(8);
      expect(progress[heroId].collection.every((card) =>
        card.instanceId.startsWith(`starter:${heroId}:`) && /:\d+$/.test(card.instanceId)
      )).toBe(true);
      expect(progress[heroId].collection.some((card) =>
        /^starter:(?:rat-king|old-man):\d+:/.test(card.instanceId)
      )).toBe(false);
    }
  });

  it("migrates flat legacy rewards into unused collection without exceeding the copy cap", () => {
    const progress = createCampaignCardProgress(["faultline", "from-the-dark", "unknown"]);
    expect(unusedCampaignCards(progress, "old-man").map((card) => card.cardId)).toEqual([]);
    expect(unusedCampaignCards(progress, "rat-king").map((card) => card.cardId)).toEqual([
      "from-the-dark",
    ]);
  });

  it("commits an encounter reward exactly once and never silently edits the active deck", () => {
    const progress = createCampaignCardProgress();
    const before = [...progress["old-man"].activeDeck];
    const reward = encounterRewardInstance(1, "f1-rune-overload", "marrow-divide");
    expect(grantCampaignCard(progress, reward)).toBe(true);
    expect(grantCampaignCard(progress, reward)).toBe(false);
    expect(unusedCampaignCards(progress, "old-man")).toEqual([reward]);
    expect(progress["old-man"].activeDeck).toEqual(before);
  });

  it("refuses a third owned copy of a definition", () => {
    const progress = createCampaignCardProgress();
    expect(
      grantCampaignCard(progress, encounterRewardInstance(1, "extra-staff", "the-staff-speaks"))
    ).toBe(false);
    expect(ownedCount(progress, "the-staff-speaks")).toBe(CAMPAIGN_CARD_DUPLICATE_LIMIT);
  });

  it("swaps physical instances without changing deck size", () => {
    const progress = createCampaignCardProgress();
    grantCampaignCard(progress, encounterRewardInstance(1, "observatory", "marrow-divide"));
    const incoming = unusedCampaignCards(progress, "old-man")[0]!;
    const outgoing = progress["old-man"].activeDeck[0]!;
    expect(swapCampaignDeckCard(progress, "old-man", outgoing, incoming.instanceId)).toBe(true);
    expect(progress["old-man"].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
    expect(progress["old-man"].activeDeck).toContain(incoming.instanceId);
    expect(progress["old-man"].activeDeck).not.toContain(outgoing);
  });

  it("rejects a swap that would exceed the two-copy limit", () => {
    const progress = createCampaignCardProgress();
    progress["old-man"].collection.push({
      instanceId: "extra:the-staff-speaks",
      cardId: "the-staff-speaks",
      mastery: 0,
      branch: null,
    });
    const outgoing = progress["old-man"].activeDeck.find((id) => !id.includes(":the-staff-speaks:"))!;
    expect(
      swapCampaignDeckCard(progress, "old-man", outgoing, "extra:the-staff-speaks")
    ).toBe(false);
  });

  it("migrates old positional starter ids and keeps the saved active deck", () => {
    const collection = RAT_KING_LIST.map((cardId, index) => ({
      instanceId: `starter:rat-king:${index}:${cardId}`,
      cardId,
      mastery: 0,
      branch: null,
    }));
    const old = {
      "rat-king": {
        collection,
        activeDeck: collection.map((card) => card.instanceId),
      },
      "old-man": createCampaignCardProgress()["old-man"],
    };
    const repaired = normalizeCampaignCardProgress(old);
    expect(activeCampaignDeck(repaired, "rat-king").map((card) => card.cardId)).toEqual([
      ...RAT_KING_LIST,
    ]);
    expect(repaired["rat-king"].activeDeck).toEqual(
      RAT_KING_LIST.map((cardId) => `starter:rat-king:${cardId}:0`)
    );
    expect(repaired["rat-king"].activeDeck[0]).toBe("starter:rat-king:nip:0");
    expect(repaired.schemaVersion).toBe(CAMPAIGN_CARD_SCHEMA_VERSION);
  });

  it("repairs invalid active decks while retaining valid discoveries", () => {
    const progress = createCampaignCardProgress();
    grantCampaignCard(progress, encounterRewardInstance(1, "observatory", "marrow-divide"));
    progress["old-man"].activeDeck = ["missing"];
    progress["old-man"].collection[0]!.mastery = 4.8;
    progress["old-man"].collection[0]!.branch = "a";
    const repaired = normalizeCampaignCardProgress(progress);
    expect(repaired["old-man"].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
    expect(unusedCampaignCards(repaired, "old-man").map((card) => card.cardId)).toContain("marrow-divide");
    expect(repaired["old-man"].collection[0]!.mastery).toBe(4);
    expect(repaired["old-man"].collection[0]!.branch).toBe("a");
  });

  it("normalizes a durable encounter transaction without changing its identity", () => {
    const pending = {
      encounterKey: "5:f5-champion-revenant",
      floorId: 5,
      tableId: 5,
      entryId: "f5-champion-revenant",
      seed: -1,
      checkpoint: { floorId: 5, x: 3, y: 7, facing: 2 },
      reward: {
        ...encounterRewardInstance(5, "f5-champion-revenant", "marrow-divide"),
        mastery: 2.8,
        branch: "a",
      },
    };

    expect(normalizePendingCampaignEncounter(pending)).toEqual({
      ...pending,
      seed: 0xffffffff,
      reward: { ...pending.reward, mastery: 2 },
    });
  });

  it("allows a pending encounter with no card reward", () => {
    const pending = {
      encounterKey: "1:f1-red-bone-bounty",
      floorId: 1,
      tableId: 1,
      entryId: "f1-red-bone-bounty",
      seed: 7,
      checkpoint: { floorId: 1, x: 3, y: 4, facing: 0 },
      reward: null,
    };
    expect(normalizePendingCampaignEncounter(pending)).toMatchObject({ reward: null, entryId: "f1-red-bone-bounty" });
  });

  it("rejects malformed encounter checkpoints instead of loading unsafe coordinates", () => {
    const valid = {
      encounterKey: "1:red-bones",
      floorId: 1,
      tableId: 1,
      entryId: "red-bones",
      seed: 7,
      checkpoint: { floorId: 1, x: 3, y: 4, facing: 0 },
      reward: encounterRewardInstance(1, "red-bones", "marrow-divide"),
    };

    expect(
      normalizePendingCampaignEncounter({
        ...valid,
        checkpoint: { ...valid.checkpoint, floorId: 2 },
      })
    ).toBeNull();
    expect(
      normalizePendingCampaignEncounter({
        ...valid,
        checkpoint: { ...valid.checkpoint, x: Number.POSITIVE_INFINITY },
      })
    ).toBeNull();
    expect(
      normalizePendingCampaignEncounter({
        ...valid,
        reward: { ...valid.reward, instanceId: "" },
      })
    ).toBeNull();
  });
});

function ownedCount(
  progress: ReturnType<typeof createCampaignCardProgress>,
  cardId: keyof typeof CARD_DEFS
) {
  return progress["old-man"].collection.filter((card) => card.cardId === cardId).length
    + progress["rat-king"].collection.filter((card) => card.cardId === cardId).length;
}

describe("Old Man build selection", () => {
  it("defaults to the legacy starter with no build id given", () => {
    const progress = createCampaignCardProgress();
    expect(progress.oldManBuildId).toBe("legacy");
    const ids = activeCampaignDeck(progress, "old-man").map((card) => card.cardId);
    expect(ids).toEqual([...OLD_MAN_BUILD_STARTERS.legacy]);
  });

  it("builds Old Man's starter from the chosen build, leaving Rat King untouched", () => {
    const progress = createCampaignCardProgress([], "silent-ward");
    expect(progress.oldManBuildId).toBe("silent-ward");
    const oldManIds = activeCampaignDeck(progress, "old-man").map((card) => card.cardId);
    expect(oldManIds).toEqual([...OLD_MAN_BUILD_STARTERS["silent-ward"]]);
    const ratKingIds = activeCampaignDeck(progress, "rat-king").map((card) => card.cardId);
    expect(ratKingIds).toEqual([...CAMPAIGN_STARTER_DECKS["rat-king"]]);
  });

  it("round-trips the chosen build through normalize/clone", () => {
    const progress = createCampaignCardProgress([], "reckoning");
    const cloned = normalizeCampaignCardProgress(progress);
    expect(cloned.oldManBuildId).toBe("reckoning");
    expect(activeCampaignDeck(cloned, "old-man").map((c) => c.cardId)).toEqual(
      activeCampaignDeck(progress, "old-man").map((c) => c.cardId)
    );
  });

  it("a pre-build-selection save with no oldManBuildId field repairs to the exact legacy deck, never a different build", () => {
    // Simulates a save written before this feature existed: it has real
    // starter instance ids but no oldManBuildId at all. A wrong fallback
    // here would have silently swapped an existing player's Old Man deck.
    const legacySave = createCampaignCardProgress();
    const raw = JSON.parse(JSON.stringify(legacySave));
    delete raw.oldManBuildId;
    const repaired = normalizeCampaignCardProgress(raw);
    expect(repaired.oldManBuildId).toBe("legacy");
    expect(activeCampaignDeck(repaired, "old-man").map((c) => c.cardId)).toEqual(
      [...OLD_MAN_BUILD_STARTERS.legacy]
    );
  });

  it("an invalid active deck on a built save falls back to that same build's starter, not the legacy one", () => {
    const built = createCampaignCardProgress([], "last-hour");
    const corrupted = { ...built, "old-man": { ...built["old-man"], activeDeck: ["bogus"] } };
    const repaired = normalizeCampaignCardProgress(corrupted);
    expect(repaired.oldManBuildId).toBe("last-hour");
    expect(activeCampaignDeck(repaired, "old-man").map((c) => c.cardId)).toEqual(
      [...OLD_MAN_BUILD_STARTERS["last-hour"]]
    );
  });

  it("rejects a garbage oldManBuildId and falls back to legacy", () => {
    const built = createCampaignCardProgress();
    const raw = { ...built, oldManBuildId: "not-a-real-build" };
    const repaired = normalizeCampaignCardProgress(raw);
    expect(repaired.oldManBuildId).toBe("legacy");
  });
});

describe("Rat King build selection", () => {
  it("builds the selected Rat King starter and preserves the exact twelve-card shape", () => {
    const progress = createCampaignCardProgress([], "reckoning", "nest");
    expect(progress.ratKingBuildId).toBe("nest");
    expect(activeCampaignDeck(progress, "rat-king").map((card) => card.cardId)).toEqual([
      ...RAT_KING_BUILD_STARTERS.nest,
    ]);
    expect(activeCampaignDeck(progress, "rat-king")).toHaveLength(CAMPAIGN_DECK_SIZE);
    expect(new Set(activeCampaignDeck(progress, "rat-king").map((card) => card.cardId)).size).toBe(8);
    expect(progress.oldManBuildId).toBe("reckoning");
  });

  it("round-trips each offered Rat King build through normalization", () => {
    for (const id of ["nest", "open-rank", "king-of-heap"] as const) {
      const progress = createCampaignCardProgress([], "legacy", id);
      const cloned = normalizeCampaignCardProgress(progress);
      expect(cloned.ratKingBuildId).toBe(id);
      expect(activeCampaignDeck(cloned, "rat-king").map((card) => card.cardId)).toEqual([
        ...RAT_KING_BUILD_STARTERS[id],
      ]);
    }
  });

  it("repairs a legacy save with no ratKingBuildId to the exact old Rat King deck", () => {
    const raw = JSON.parse(JSON.stringify(createCampaignCardProgress()));
    delete raw.ratKingBuildId;
    const repaired = normalizeCampaignCardProgress(raw);
    expect(repaired.ratKingBuildId).toBe("legacy");
    expect(activeCampaignDeck(repaired, "rat-king").map((card) => card.cardId)).toEqual([
      ...CAMPAIGN_STARTER_DECKS["rat-king"],
    ]);
  });

  it("repairs an invalid active deck to the selected Rat King build, not legacy", () => {
    const built = createCampaignCardProgress([], "legacy", "open-rank");
    const corrupted = { ...built, "rat-king": { ...built["rat-king"], activeDeck: ["bogus"] } };
    const repaired = normalizeCampaignCardProgress(corrupted);
    expect(repaired.ratKingBuildId).toBe("open-rank");
    expect(activeCampaignDeck(repaired, "rat-king").map((card) => card.cardId)).toEqual([
      ...RAT_KING_BUILD_STARTERS["open-rank"],
    ]);
  });

  it("rejects a garbage Rat King build id and falls back to legacy", () => {
    const built = createCampaignCardProgress();
    const repaired = normalizeCampaignCardProgress({ ...built, ratKingBuildId: "not-a-real-build" });
    expect(repaired.ratKingBuildId).toBe("legacy");
  });
});
