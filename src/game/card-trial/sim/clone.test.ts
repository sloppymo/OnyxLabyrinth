import { describe, expect, it } from "vitest";
import { playCard, playerView } from "../engine";
import { cloneFight } from "./clone";
import { createFightFromDefinition } from "./factory";

describe("cloneFight", () => {
  it("copies rules state so a play on the clone does not mutate the original", () => {
    const original = createFightFromDefinition({
      id: "clone",
      name: "Clone",
      seed: 8,
      decks: {
        "rat-king": ["nip", "brace", "tide", "lunge", "open-the-rank"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 30,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "slow",
          order: 0,
        },
      ],
    });
    const copy = cloneFight(original);
    const nip = copy.heroes["rat-king"].hand.find((c) => c.defId === "nip")!;
    playCard(copy, nip.uid, { targetId: "a" });
    expect(original.enemies[0]!.hp).toBe(30);
    expect(copy.enemies[0]!.hp).toBe(25);
    expect(playerView(original).energy).toBe(3);
    expect(playerView(copy).energy).toBe(2);
  });

  it("copies the dedicated draft stream separately from hero shuffle streams", () => {
    const original = createFightFromDefinition({
      id: "clone-draft",
      name: "Clone draft",
      seed: 4,
      decks: {
        "rat-king": ["fight-dirty", "nip", "brace", "tide", "lunge"],
        "old-man": ["the-staff-speaks", "pale-ward", "faultline", "the-threshold", "full-stop"],
      },
      enemies: [
        {
          id: "a",
          name: "A",
          maxHp: 30,
          visualRow: "front",
          cycle: [{ kind: "row", row: "front", damage: 8 }],
          slot: "slow",
          order: 0,
        },
      ],
      setup: { hands: { "rat-king": ["fight-dirty"] } },
    });
    const copy = cloneFight(original);
    playCard(copy, copy.heroes["rat-king"].hand[0]!.uid, { targetId: "a" });
    expect(original.draft).toBeNull();
    expect(copy.draft?.choices).toHaveLength(3);
    expect(original.draftStream.getState()).not.toBe(copy.draftStream.getState());
  });
});
