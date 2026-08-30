import { describe, expect, it } from "vitest";
import { comparePaired } from "./compare";
import { fixedPolicy } from "./policies";
import { createFightFromDefinition } from "./factory";
import type { FightDefinition } from "./definition";

const dummy = {
  id: "dummy",
  name: "Dummy",
  maxHp: 12,
  visualRow: "front" as const,
  cycle: [{ kind: "row" as const, row: "front" as const, damage: 1 }],
  slot: "slow" as const,
  order: 0,
};

const nips: FightDefinition = {
  id: "cmp-nips",
  name: "Nips",
  decks: {
    "rat-king": ["nip", "nip", "nip", "nip", "nip"],
    "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks"],
  },
  enemies: [dummy],
};

const braces: FightDefinition = {
  id: "cmp-braces",
  name: "Braces",
  decks: {
    "rat-king": ["brace", "brace", "brace", "brace", "brace"],
    "old-man": ["pale-ward", "pale-ward", "pale-ward", "pale-ward", "pale-ward"],
  },
  enemies: [dummy],
};

describe("comparePaired", () => {
  it("uses the same seeds for baseline and variant and reports a win-rate drop with no damage", () => {
    const report = comparePaired({
      baseline: nips,
      variant: braces,
      seeds: [1, 2, 3, 4, 5],
      policyFor: () => fixedPolicy("damage"),
      maxRounds: 8,
    });
    expect(report.seeds).toEqual([1, 2, 3, 4, 5]);
    expect(report.baseline.wins).toBe(5);
    expect(report.variant.wins).toBe(0);
    expect(report.paired).toHaveLength(5);
    expect(report.paired[0]!.seed).toBe(1);
    expect(report.variant.actionDiversity).toBeLessThanOrEqual(report.baseline.actionDiversity);
  });

  it("keeps paired shuffle streams identical when only the definition id differs", () => {
    const a = createFightFromDefinition({ ...nips, id: "pair-a" }, { shuffleKey: "shared-pair" });
    const b = createFightFromDefinition({ ...nips, id: "pair-b" }, { shuffleKey: "shared-pair" });
    expect(a.heroes["rat-king"].hand.map((card) => card.defId)).toEqual(
      b.heroes["rat-king"].hand.map((card) => card.defId),
    );
    expect(a.heroes["old-man"].hand.map((card) => card.defId)).toEqual(
      b.heroes["old-man"].hand.map((card) => card.defId),
    );
  });
});
