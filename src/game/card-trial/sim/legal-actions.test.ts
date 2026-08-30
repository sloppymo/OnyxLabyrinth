import { describe, expect, it } from "vitest";
import type { CardId } from "../types";
import { playCard } from "../engine";
import { createFightFromDefinition } from "./factory";
import { legalActions } from "./legal-actions";

function fightWithRkHand(hand: readonly CardId[]) {
  return createFightFromDefinition({
    id: "legal-test",
    name: "Legal Test",
    seed: 1,
    decks: {
      "rat-king": ["nip", "brace", "tide", "open-the-rank", "swarm-the-wound"],
      "old-man": ["the-staff-speaks", "pale-ward", "sever-the-thread", "faultline", "full-stop"],
    },
    enemies: [
      {
        id: "a",
        name: "A",
        maxHp: 22,
        visualRow: "front",
        cycle: [{ kind: "row", row: "front", damage: 8 }],
        slot: "fast",
        order: 0,
      },
      {
        id: "b",
        name: "B",
        maxHp: 22,
        visualRow: "back",
        cycle: [{ kind: "row", row: "back", damage: 8 }],
        slot: "fast",
        order: 1,
      },
    ],
    setup: {
      hands: { "rat-king": hand },
    },
  });
}

describe("legalActions", () => {
  it("enumerates pass, move, untargeted cards, and one action per living enemy for single-target cards", () => {
    const s = fightWithRkHand(["brace", "nip"]);
    const actions = legalActions(s);
    expect(actions.some((a) => a.kind === "pass")).toBe(true);
    expect(actions.some((a) => a.kind === "move")).toBe(true);
    const brace = s.heroes["rat-king"].hand.find((c) => c.defId === "brace")!;
    const nip = s.heroes["rat-king"].hand.find((c) => c.defId === "nip")!;
    expect(actions).toContainEqual({ kind: "card", cardUid: brace.uid });
    expect(actions).toContainEqual({ kind: "card", cardUid: nip.uid, targetId: "a" });
    expect(actions).toContainEqual({ kind: "card", cardUid: nip.uid, targetId: "b" });
    expect(legalActions(s).filter((a) => a.kind === "card" && a.cardUid === nip.uid)).toHaveLength(2);
  });

  it("offers only affordable draft picks and never Pass while a draft is open", () => {
    const s = createFightFromDefinition({
      id: "draft-legal",
      name: "Draft legal",
      seed: 3,
      decks: {
        "rat-king": ["fight-dirty", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 22,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "fast",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["fight-dirty"] } },
    });
    const source = s.heroes["rat-king"].hand.find((c) => c.defId === "fight-dirty")!;
    playCard(s, source.uid, { targetId: "a" });
    const actions = legalActions(s);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.kind === "draft")).toBe(true);
    expect(actions.some((a) => a.kind === "pass")).toBe(false);
  });

  it("omits disabled 2-costs when only 1 energy remains", () => {
    const s = createFightFromDefinition({
      id: "energy-gate",
      name: "Energy gate",
      seed: 1,
      decks: {
        "rat-king": ["king-of-the-heap", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "the-staff-speaks", "pale-ward", "faultline", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 20,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 5 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["king-of-the-heap", "nip"] } },
    });
    s.heroes["rat-king"].energy = 1;
    const heap = s.heroes["rat-king"].hand.find((c) => c.defId === "king-of-the-heap")!;
    const nip = s.heroes["rat-king"].hand.find((c) => c.defId === "nip")!;
    const actions = legalActions(s);
    expect(actions.some((a) => a.kind === "card" && a.cardUid === heap.uid)).toBe(false);
    expect(actions.some((a) => a.kind === "card" && a.cardUid === nip.uid)).toBe(true);
    expect(actions.some((a) => a.kind === "move")).toBe(true);
  });

  it("requires a distinct second target only when Cut the Line would consume Opened", () => {
    const s = createFightFromDefinition({
      id: "cut-legal",
      name: "Cut legal",
      seed: 1,
      decks: {
        "rat-king": ["nip", "nip", "brace", "tide", "lunge"],
        "old-man": ["sever-the-thread", "the-staff-speaks", "pale-ward", "faultline", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 22,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "slow",
          order: 0,
        },
        {
          id: "b",
          name: "B",
          maxHp: 22,
          visualRow: "back",
          cycle: [{ kind: "row", row: "back", damage: 8 }],
          slot: "slow",
          order: 1,
        },
      ],
      setup: {
        hp: { "rat-king": 0 },
        opened: { enemyId: "a", createdBy: "old-man" },
        hands: { "old-man": ["sever-the-thread"] },
      },
    });
    expect(s.heroes["old-man"].hand.map((c) => c.defId)).toEqual(["sever-the-thread"]);
    const cut = s.heroes["old-man"].hand[0]!;
    const cutActs = legalActions(s).filter((a) => a.kind === "card" && a.cardUid === cut.uid);
    expect(cutActs).toContainEqual({
      kind: "card",
      cardUid: cut.uid,
      targetId: "a",
      secondTargetId: "b",
    });
    expect(cutActs).toContainEqual({ kind: "card", cardUid: cut.uid, targetId: "b" });
    expect(cutActs.some((a) => a.kind === "card" && a.targetId === "a" && !a.secondTargetId)).toBe(
      false,
    );
  });
});
