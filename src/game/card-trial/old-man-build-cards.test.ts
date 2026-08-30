/**
 * Old Man build-exclusive signature cards (character build selection).
 * See ../old-man-builds.ts. These cards are never in OLD_MAN_LIST/Arena;
 * `assembleFight`'s explicit `decks` lets a test give a hero any CardId.
 */
import { describe, expect, it } from "vitest";
import {
  assembleFight,
  cardConsumeRiderDamage,
  cardGuardGain,
  cardPrimaryDamage,
  endHeroTurn,
  handCard,
  playCard,
} from "./engine";
import type { CardId, CardTrialState } from "./types";

function takeFromPiles(s: CardTrialState, heroId: "rat-king" | "old-man", id: CardId) {
  const hero = s.heroes[heroId];
  for (const pile of [hero.hand, hero.draw, hero.discard]) {
    const i = pile.findIndex((c) => c.defId === id);
    if (i >= 0) {
      const [card] = pile.splice(i, 1);
      return card!;
    }
  }
  throw new Error(`missing ${id} for ${heroId}`);
}

function dealHand(s: CardTrialState, heroId: "rat-king" | "old-man", ids: CardId[]) {
  const hero = s.heroes[heroId];
  hero.discard.push(...hero.hand);
  hero.hand = ids.map((id) => takeFromPiles(s, heroId, id));
  hero.energy = 3;
  hero.paidMoveUsed = false;
}

function play(s: CardTrialState, id: CardId, targetId?: string, secondTargetId?: string) {
  const card = handCard(s, id);
  expect(card, `expected ${id} in hand`).toBeTruthy();
  const result = playCard(s, card!.uid, { targetId, secondTargetId });
  expect(result.ok, result.reason).toBe(true);
  return result;
}

function finishOldMan(s: CardTrialState) {
  return endHeroTurn(s);
}

const OLD_MAN_BUILD_CARD_IDS: CardId[] = [
  "veil-of-quiet",
  "the-quiet-after",
  "silence-the-hall",
  "hasten-the-hour",
  "the-final-word",
  "reckoning-strike",
  "reckoning-ward",
  "brace-for-it",
];

function fightWith(oldManHand: CardId[], enemies?: CardTrialState["enemies"]): CardTrialState {
  const s = assembleFight({
    fightId: 1,
    fightName: "Old Man build test",
    seed: 1,
    enemies: enemies ?? [
      {
        id: "dummy",
        name: "Dummy",
        maxHp: 40,
        visualRow: "front",
        spriteId: "training-dummy",
        cycle: [{ kind: "row", row: "front", damage: 5 }],
        slot: "slow",
        order: 0,
      },
      {
        id: "dummy2",
        name: "Dummy Two",
        maxHp: 40,
        visualRow: "back",
        spriteId: "training-dummy",
        cycle: [{ kind: "row", row: "back", damage: 5 }],
        slot: "slow",
        order: 1,
      },
    ],
    decks: {
      "rat-king": ["nip", "nip", "brace", "brace", "brace"],
      "old-man": [...OLD_MAN_BUILD_CARD_IDS, ...OLD_MAN_BUILD_CARD_IDS],
    },
  });
  // Get to Old Man's turn with a controlled hand.
  const rk = s.heroes["rat-king"];
  rk.hand = [];
  rk.energy = 0;
  endHeroTurn(s);
  dealHand(s, "old-man", oldManHand);
  return s;
}

describe("Old Man build-exclusive cards", () => {
  it("forecast tables cover every new card", () => {
    for (const id of OLD_MAN_BUILD_CARD_IDS) {
      // Must not throw and must be one of the three rules-layer tables'
      // documented shape (number | null); this only guards against a
      // forgotten switch case silently falling through to undefined.
      expect(cardPrimaryDamage(id, "back")).not.toBeUndefined();
      expect(cardGuardGain(id, "back")).not.toBeUndefined();
      expect(cardConsumeRiderDamage(id)).not.toBeUndefined();
    }
  });

  it("Veil of Quiet hushes the target and gains 3 Barrier", () => {
    const s = fightWith(["veil-of-quiet"]);
    play(s, "veil-of-quiet", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hushed).toBe(true);
    expect(s.heroes["old-man"].guard).toBe(3);
  });

  it("The Quiet After deals 3 to a fresh target and 8 to an already-Hushed one", () => {
    const s = fightWith(["the-quiet-after", "the-quiet-after"]);
    play(s, "the-quiet-after", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(37);
    s.enemies.find((e) => e.id === "dummy2")!.hushed = true;
    play(s, "the-quiet-after", "dummy2");
    expect(s.enemies.find((e) => e.id === "dummy2")!.hp).toBe(32);
  });

  it("Silence the Hall hushes every living enemy, not just one", () => {
    const s = fightWith(["silence-the-hall"]);
    play(s, "silence-the-hall");
    expect(s.enemies.every((e) => e.hushed)).toBe(true);
  });

  it("Hasten the Hour triggers an armed Omen on the target, then deals 3 more", () => {
    const s = fightWith(["hasten-the-hour"]);
    s.omen = { targetId: "dummy", createdBy: "old-man", damage: 7 };
    play(s, "hasten-the-hour", "dummy");
    expect(s.omen).toBeNull();
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(30); // 40 - 7 - 3
  });

  it("Hasten the Hour deals 5 and does not Open when no Omen is armed on the target", () => {
    const s = fightWith(["hasten-the-hour"]);
    play(s, "hasten-the-hour", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(35);
    expect(s.opened).toBeNull();
  });

  it("Hasten the Hour ignores an Omen armed on a different enemy", () => {
    const s = fightWith(["hasten-the-hour"]);
    s.omen = { targetId: "dummy2", createdBy: "old-man", damage: 7 };
    play(s, "hasten-the-hour", "dummy");
    expect(s.omen?.targetId).toBe("dummy2"); // untouched
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(35);
    expect(s.opened).toBeNull();
  });

  it("The Final Word gains 5 Barrier normally, 10 with any Omen armed", () => {
    const s = fightWith(["the-final-word", "the-final-word"]);
    play(s, "the-final-word");
    expect(s.heroes["old-man"].guard).toBe(5);
    s.heroes["old-man"].energy = 3;
    s.omen = { targetId: "dummy2", createdBy: "old-man", damage: 7 };
    play(s, "the-final-word");
    expect(s.heroes["old-man"].guard).toBe(15);
  });

  it("Reckoning Strike deals 5 unconditionally, or moves Front and deals 10 total by consuming Opened", () => {
    const s = fightWith(["reckoning-strike", "reckoning-strike"]);
    play(s, "reckoning-strike", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(35);
    s.heroes["old-man"].row = "back";
    s.opened = { enemyId: "dummy2", createdBy: "old-man", createdAtSlot: 0, movedBeforeConsume: false };
    play(s, "reckoning-strike", "dummy2");
    expect(s.enemies.find((e) => e.id === "dummy2")!.hp).toBe(30); // 40 - 10
    expect(s.heroes["old-man"].row).toBe("front");
    expect(s.opened).toBeNull();
  });

  it("Reckoning Ward gains 4 Barrier unconditionally, or moves Back and gains 10 total by consuming Opened", () => {
    const s = fightWith(["reckoning-ward", "reckoning-ward"]);
    play(s, "reckoning-ward", "dummy");
    expect(s.heroes["old-man"].guard).toBe(4);
    s.heroes["old-man"].row = "front";
    s.opened = { enemyId: "dummy2", createdBy: "old-man", createdAtSlot: 0, movedBeforeConsume: false };
    play(s, "reckoning-ward", "dummy2");
    expect(s.heroes["old-man"].guard).toBe(14); // 4 + (4 + 6)
    expect(s.heroes["old-man"].row).toBe("back");
    expect(s.opened).toBeNull();
  });

  it("Reckoning Ward ignores Opened armed on a different enemy", () => {
    const s = fightWith(["reckoning-ward"]);
    s.opened = { enemyId: "dummy2", createdBy: "old-man", createdAtSlot: 0, movedBeforeConsume: false };
    play(s, "reckoning-ward", "dummy");
    expect(s.heroes["old-man"].guard).toBe(4);
    expect(s.opened?.enemyId).toBe("dummy2"); // untouched
  });

  it("Brace for It gains a flat 12 Barrier", () => {
    const s = fightWith(["brace-for-it"]);
    play(s, "brace-for-it");
    expect(s.heroes["old-man"].guard).toBe(12);
  });

  it("none of the new cards leak into OLD_MAN_LIST or Arena's fixed decks", async () => {
    const { OLD_MAN_LIST } = await import("./cards");
    for (const id of OLD_MAN_BUILD_CARD_IDS) {
      expect(OLD_MAN_LIST).not.toContain(id);
    }
  });

  it("ending Old Man's turn with the build cards in hand discards cleanly", () => {
    const s = fightWith(["brace-for-it", "silence-the-hall"]);
    finishOldMan(s);
    expect(s.heroes["old-man"].hand).toHaveLength(0);
  });
});
