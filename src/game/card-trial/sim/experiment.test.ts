import { describe, expect, it } from "vitest";
import { parseSeeds, runExperiment, type CardTrialSimConfig } from "./experiment";
import type { FightDefinition } from "./definition";

const dummy: FightDefinition["enemies"][number] = {
  id: "dummy",
  name: "Dummy",
  maxHp: 12,
  visualRow: "front",
  cycle: [{ kind: "row", row: "front", damage: 1 }],
  slot: "slow",
  order: 0,
};

const config: CardTrialSimConfig = {
  id: "exp-smoke",
  name: "Experiment smoke",
  baseline: {
    id: "exp-nips",
    name: "Nips",
    decks: {
      "rat-king": ["nip", "nip", "nip", "nip", "nip"],
      "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "the-staff-speaks"],
    },
    enemies: [dummy],
  },
  variant: {
    id: "exp-braces",
    name: "Braces",
    decks: {
      "rat-king": ["brace", "brace", "brace", "brace", "brace"],
      "old-man": ["pale-ward", "pale-ward", "pale-ward", "pale-ward", "pale-ward"],
    },
    enemies: [dummy],
  },
};

describe("runExperiment", () => {
  it("parses seed ranges and paired configs", () => {
    expect(parseSeeds("1:4")).toEqual([1, 2, 3, 4]);
    expect(parseSeeds("7,9")).toEqual([7, 9]);
    const result = runExperiment({
      config,
      seeds: [1, 2, 3],
      policy: "damage",
      maxRounds: 8,
    });
    expect(result.summary.wins).toBe(3);
    expect(result.variantSummary?.wins).toBe(0);
    expect(result.dominance?.winDelta).toBe(-3);
    expect(result.fights).toHaveLength(6);
    expect(result.reportMd).toContain("Experiment smoke");
  });
});
