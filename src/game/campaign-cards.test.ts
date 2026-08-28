import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_DECK_SIZE,
  activeCampaignDeck,
  createCampaignCardProgress,
  encounterRewardInstance,
  grantCampaignCard,
  normalizeCampaignCardProgress,
  normalizePendingCampaignEncounter,
  swapCampaignDeckCard,
  unusedCampaignCards,
} from "./campaign-cards";

describe("campaign card progression", () => {
  it("starts both heroes with persistent exact twelve-card decks", () => {
    const progress = createCampaignCardProgress();
    for (const heroId of ["rat-king", "old-man"] as const) {
      expect(progress[heroId].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
      expect(activeCampaignDeck(progress, heroId)).toHaveLength(CAMPAIGN_DECK_SIZE);
      expect(new Set(progress[heroId].activeDeck).size).toBe(CAMPAIGN_DECK_SIZE);
    }
  });

  it("migrates flat legacy rewards into the correct hero collections", () => {
    const progress = createCampaignCardProgress(["crack", "from-the-dark", "unknown"]);
    expect(unusedCampaignCards(progress, "old-man").map((card) => card.cardId)).toEqual(["crack"]);
    expect(unusedCampaignCards(progress, "rat-king").map((card) => card.cardId)).toEqual([
      "from-the-dark",
    ]);
  });

  it("commits an encounter reward exactly once", () => {
    const progress = createCampaignCardProgress();
    const reward = encounterRewardInstance(1, "f1-red-bone-bounty", "crack");
    expect(grantCampaignCard(progress, reward)).toBe(true);
    expect(grantCampaignCard(progress, reward)).toBe(false);
    expect(unusedCampaignCards(progress, "old-man")).toEqual([reward]);
  });

  it("swaps physical instances without changing deck size", () => {
    const progress = createCampaignCardProgress(["crack"]);
    const incoming = unusedCampaignCards(progress, "old-man")[0]!;
    const outgoing = progress["old-man"].activeDeck[0]!;
    expect(swapCampaignDeckCard(progress, "old-man", outgoing, incoming.instanceId)).toBe(true);
    expect(progress["old-man"].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
    expect(progress["old-man"].activeDeck).toContain(incoming.instanceId);
    expect(progress["old-man"].activeDeck).not.toContain(outgoing);
  });

  it("rejects a swap that would exceed the two-copy limit", () => {
    const progress = createCampaignCardProgress(["staff"]);
    const thirdStaff = unusedCampaignCards(progress, "old-man")[0]!;
    expect(
      swapCampaignDeckCard(
        progress,
        "old-man",
        progress["old-man"].activeDeck.find((id) => !id.endsWith(":staff"))!,
        thirdStaff.instanceId
      )
    ).toBe(false);
  });

  it("repairs invalid active decks while retaining valid discoveries", () => {
    const progress = createCampaignCardProgress(["crack"]);
    progress["old-man"].activeDeck = ["missing"];
    progress["old-man"].collection[0]!.mastery = 4.8;
    progress["old-man"].collection[0]!.branch = "a";
    const repaired = normalizeCampaignCardProgress(progress);
    expect(repaired["old-man"].activeDeck).toHaveLength(CAMPAIGN_DECK_SIZE);
    expect(unusedCampaignCards(repaired, "old-man").map((card) => card.cardId)).toContain("crack");
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
        ...encounterRewardInstance(5, "f5-champion-revenant", "crack"),
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

  it("rejects malformed encounter checkpoints instead of loading unsafe coordinates", () => {
    const valid = {
      encounterKey: "1:red-bones",
      floorId: 1,
      tableId: 1,
      entryId: "red-bones",
      seed: 7,
      checkpoint: { floorId: 1, x: 3, y: 4, facing: 0 },
      reward: encounterRewardInstance(1, "red-bones", "crack"),
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
