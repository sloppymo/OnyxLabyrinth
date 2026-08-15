/**
 * Tests for the pure combat-bark-library selector. Uses hand-built fixture
 * profiles (not the real content) so these stay stable regardless of future
 * content edits — content correctness is covered by
 * src/data/combat-bark-library/{coverage,quality}.test.ts.
 */
import { describe, expect, it } from "vitest";
import { barkLineKey, selectCombatBark } from "./combat-bark-library";
import type { CombatBarkProfile } from "../data/combat-bark-library/types";

function fixedRng(...values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)]!;
    i++;
    return v;
  };
}

const HERO: CombatBarkProfile = {
  id: "hero",
  displayName: "Hero",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "fixture",
  pools: {
    combatStart: [{ text: "Alpha", weight: 1 }, { text: "Beta", weight: 1 }],
    takeHit: [{ text: "Ow" }],
    abilityUse: [
      { text: "Fireball line", abilityId: "spell-fire" },
      { text: "Ice line", abilityId: "spell-ice" },
    ],
    chemistrySelected: [
      { text: "Slime line", chemistryId: "slime-cannon" },
      { text: "Ogre line", chemistryId: "ogre-toss" },
    ],
    statusApplied: [{ text: "Poisoned line", status: "poison" }],
    chemistryWitness: [
      { text: "Source-scoped", sourceEnemyId: "minotaur" },
      { text: "Target-scoped", targetEnemyId: "slime" },
    ],
    rare: [{ text: "Once only", oncePerCombat: true }, { text: "Every time" }],
    death: [{ text: "Heavy", weight: 9 }, { text: "Light", weight: 1 }],
  },
};

const profiles = new Map<string, CombatBarkProfile>([[HERO.id, HERO]]);

describe("selectCombatBark", () => {
  it("returns null for an unknown speaker", () => {
    const result = selectCombatBark(
      { speakerId: "nobody", trigger: "combatStart", rng: fixedRng(0) },
      profiles
    );
    expect(result).toBeNull();
  });

  it("returns null when the speaker has no pool for that trigger", () => {
    const result = selectCombatBark(
      { speakerId: "hero", trigger: "victory", rng: fixedRng(0) },
      profiles
    );
    expect(result).toBeNull();
  });

  it("is deterministic: same input + same rng sequence -> same line", () => {
    const a = selectCombatBark({ speakerId: "hero", trigger: "combatStart", rng: fixedRng(0.9) }, profiles);
    const b = selectCombatBark({ speakerId: "hero", trigger: "combatStart", rng: fixedRng(0.9) }, profiles);
    expect(a).toEqual(b);
  });

  it("weighted selection: low roll picks the first candidate, high roll the last", () => {
    // death pool: Heavy weight 9, Light weight 1, total 10.
    const low = selectCombatBark({ speakerId: "hero", trigger: "death", rng: fixedRng(0.05) }, profiles);
    expect(low?.text).toBe("Heavy");
    const high = selectCombatBark({ speakerId: "hero", trigger: "death", rng: fixedRng(0.95) }, profiles);
    expect(high?.text).toBe("Light");
  });

  it("filters by abilityId — only the matching line is eligible", () => {
    const result = selectCombatBark(
      { speakerId: "hero", trigger: "abilityUse", abilityId: "spell-ice", rng: fixedRng(0) },
      profiles
    );
    expect(result?.text).toBe("Ice line");
  });

  it("filters by chemistryId", () => {
    const result = selectCombatBark(
      { speakerId: "hero", trigger: "chemistrySelected", chemistryId: "ogre-toss", rng: fixedRng(0) },
      profiles
    );
    expect(result?.text).toBe("Ogre line");
  });

  it("filters by status", () => {
    const matching = selectCombatBark(
      { speakerId: "hero", trigger: "statusApplied", status: "poison", rng: fixedRng(0) },
      profiles
    );
    expect(matching?.text).toBe("Poisoned line");
    const nonMatching = selectCombatBark(
      { speakerId: "hero", trigger: "statusApplied", status: "sleep", rng: fixedRng(0) },
      profiles
    );
    expect(nonMatching).toBeNull();
  });

  it("filters by sourceEnemyId and targetEnemyId independently", () => {
    const bySource = selectCombatBark(
      { speakerId: "hero", trigger: "chemistryWitness", sourceEnemyId: "minotaur", rng: fixedRng(0) },
      profiles
    );
    expect(bySource?.text).toBe("Source-scoped");
    const byTarget = selectCombatBark(
      { speakerId: "hero", trigger: "chemistryWitness", targetEnemyId: "slime", rng: fixedRng(0) },
      profiles
    );
    expect(byTarget?.text).toBe("Target-scoped");
  });

  it("respects oncePerCombat via alreadyUsed, still allows the non-restricted line", () => {
    const key = barkLineKey("hero", "rare", { text: "Once only", oncePerCombat: true });
    const result = selectCombatBark(
      { speakerId: "hero", trigger: "rare", rng: fixedRng(0.99), alreadyUsed: new Set([key]) },
      profiles
    );
    expect(result?.text).toBe("Every time");
  });

  it("accepts alreadyUsed as a plain array, not just a Set", () => {
    const key = barkLineKey("hero", "rare", { text: "Once only", oncePerCombat: true });
    const result = selectCombatBark(
      { speakerId: "hero", trigger: "rare", rng: fixedRng(0.99), alreadyUsed: [key] },
      profiles
    );
    expect(result?.text).toBe("Every time");
  });

  it("returns null when every eligible line has already been used", () => {
    const fixture: CombatBarkProfile = {
      id: "solo",
      displayName: "Solo",
      kind: "enemy",
      voiceMode: "articulate",
      voiceSummary: "fixture",
      pools: { death: [{ text: "Only line", oncePerCombat: true }] },
    };
    const soloProfiles = new Map([["solo", fixture]]);
    const key = barkLineKey("solo", "death", { text: "Only line", oncePerCombat: true });
    const result = selectCombatBark(
      { speakerId: "solo", trigger: "death", rng: fixedRng(0), alreadyUsed: new Set([key]) },
      soloProfiles
    );
    expect(result).toBeNull();
  });

  it("never calls Math.random — only the injected rng function", () => {
    const originalRandom = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return 0.5;
    };
    try {
      selectCombatBark({ speakerId: "hero", trigger: "combatStart", rng: fixedRng(0.2) }, profiles);
    } finally {
      Math.random = originalRandom;
    }
    expect(called).toBe(false);
  });

  it("barkLineKey is stable for identical (speaker, trigger, text) and differs otherwise", () => {
    const a = barkLineKey("hero", "combatStart", { text: "Alpha" });
    const b = barkLineKey("hero", "combatStart", { text: "Alpha" });
    const c = barkLineKey("hero", "combatStart", { text: "Beta" });
    const d = barkLineKey("villain", "combatStart", { text: "Alpha" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});
