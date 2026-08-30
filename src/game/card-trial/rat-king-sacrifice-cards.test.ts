/**
 * Rat King sacrifice-mechanic cards (Consume the Rat). See cards.ts's header
 * comment: implemented and tested, not yet wired into RAT_KING_LIST/a deck.
 * `assembleFight`'s explicit `decks` lets a test give a hero any CardId.
 */
import { describe, expect, it } from "vitest";
import { assembleFight, handCard, playCard } from "./engine";
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

const SACRIFICE_CARD_IDS: CardId[] = ["last-litter", "feed-the-king", "one-more-rat"];

function fightWith(ratKingHand: CardId[]): CardTrialState {
  const s = assembleFight({
    fightId: 1,
    fightName: "Rat King sacrifice test",
    seed: 1,
    enemies: [
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
      "rat-king": [...SACRIFICE_CARD_IDS, ...SACRIFICE_CARD_IDS],
      "old-man": ["distant-hand", "distant-hand", "pale-ward", "pale-ward", "faultline"],
    },
  });
  dealHand(s, "rat-king", ratKingHand);
  return s;
}

describe("Rat King sacrifice-mechanic cards", () => {
  it("Last Litter deals 5 with no Rat", () => {
    const s = fightWith(["last-litter"]);
    play(s, "last-litter", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(35);
    expect(s.rat).toBeNull();
  });

  it("Last Litter consumes an existing Rat for 8 more and removes it", () => {
    const s = fightWith(["last-litter"]);
    s.rat = { row: "front" };
    play(s, "last-litter", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(27); // 40 - 5 - 8
    expect(s.rat).toBeNull();
  });

  it("Feed the King crowns the target and gains 4 Barrier with no Rat", () => {
    const s = fightWith(["feed-the-king"]);
    play(s, "feed-the-king", "dummy");
    expect(s.crownedEnemyId).toBe("dummy");
    expect(s.heroes["rat-king"].guard).toBe(4);
    expect(s.rat).toBeNull();
  });

  it("Feed the King consumes an existing Rat for 10 Barrier instead of 4", () => {
    const s = fightWith(["feed-the-king"]);
    s.rat = { row: "front" };
    play(s, "feed-the-king", "dummy");
    expect(s.crownedEnemyId).toBe("dummy");
    expect(s.heroes["rat-king"].guard).toBe(10);
    expect(s.rat).toBeNull();
  });

  it("One More Rat deals 6 with no Rat and does not spawn one", () => {
    const s = fightWith(["one-more-rat"]);
    play(s, "one-more-rat", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(34);
    expect(s.rat).toBeNull();
  });

  it("One More Rat consumes an existing Rat for 6 more and spawns a fresh one", () => {
    const s = fightWith(["one-more-rat"]);
    s.rat = { row: "back" };
    const row = s.heroes["rat-king"].row;
    play(s, "one-more-rat", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(28); // 40 - 6 - 6
    expect(s.rat).toEqual({ row });
  });

  it("does not consume a Rat that dies to the primary hit before the bonus checks it", () => {
    const s = fightWith(["last-litter"]);
    s.rat = { row: "front" };
    s.enemies.find((e) => e.id === "dummy")!.hp = 5;
    play(s, "last-litter", "dummy");
    expect(s.enemies.find((e) => e.id === "dummy")!.hp).toBe(0);
    expect(s.rat).toEqual({ row: "front" }); // target died to the base 5, bonus never triggers
  });
});
