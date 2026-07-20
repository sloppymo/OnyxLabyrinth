import { describe, it, expect } from "vitest";
import {
  ENCOUNTER_COOLDOWN,
  ENCOUNTER_PITY_FORCE,
  ENCOUNTER_PITY_START,
  encounterRollChance,
  encounterRateAt,
  encounterTableFloorId,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
  adjustArenaEncounterForSmallParty,
} from "./encounters";
import { ENEMIES_BY_ID, ENCOUNTER_TABLES } from "../data/enemies";
import { CLASSIC_FOUR_PARTY_SIZE } from "./party";

describe("encounterRollChance", () => {
  it("returns 0 during cooldown", () => {
    expect(encounterRollChance(0.08, 0)).toBe(0);
    expect(encounterRollChance(0.08, ENCOUNTER_COOLDOWN - 1)).toBe(0);
  });

  it("returns base rate between cooldown and pity start", () => {
    expect(encounterRollChance(0.08, ENCOUNTER_COOLDOWN)).toBe(0.08);
    expect(encounterRollChance(0.08, ENCOUNTER_PITY_START - 1)).toBe(0.08);
  });

  it("ramps toward 1 inside the pity band", () => {
    const mid = Math.floor((ENCOUNTER_PITY_START + ENCOUNTER_PITY_FORCE) / 2);
    const midChance = encounterRollChance(0.08, mid);
    expect(midChance).toBeGreaterThan(0.08);
    expect(midChance).toBeLessThan(1);
  });

  it("forces an encounter at pity force", () => {
    expect(encounterRollChance(0.08, ENCOUNTER_PITY_FORCE)).toBe(1);
    expect(encounterRollChance(0.08, ENCOUNTER_PITY_FORCE + 5)).toBe(1);
  });
});

describe("arenaStartFloorForLevel", () => {
  it("maps each Arena chooser level (1/3/6/9/12) to its own floor (1-5)", () => {
    expect(arenaStartFloorForLevel(1)).toBe(1);
    expect(arenaStartFloorForLevel(3)).toBe(2);
    expect(arenaStartFloorForLevel(6)).toBe(3);
    expect(arenaStartFloorForLevel(9)).toBe(4);
    expect(arenaStartFloorForLevel(12)).toBe(5);
  });
});

describe("arenaFloorForWave", () => {
  it("cycles 1→2→3→4→5 from a floor-1 start", () => {
    expect(arenaFloorForWave(1, 1)).toBe(1);
    expect(arenaFloorForWave(1, 2)).toBe(2);
    expect(arenaFloorForWave(1, 3)).toBe(3);
    expect(arenaFloorForWave(1, 4)).toBe(4);
    expect(arenaFloorForWave(1, 5)).toBe(5);
    expect(arenaFloorForWave(1, 6)).toBe(1);
  });

  it("cycles 2↔3↔4↔5 from a floor-2 start", () => {
    expect(arenaFloorForWave(2, 1)).toBe(2);
    expect(arenaFloorForWave(2, 2)).toBe(3);
    expect(arenaFloorForWave(2, 3)).toBe(4);
    expect(arenaFloorForWave(2, 4)).toBe(5);
    expect(arenaFloorForWave(2, 5)).toBe(2);
  });

  it("stays on floor 5 when started there (L12)", () => {
    expect(arenaFloorForWave(5, 1)).toBe(5);
    expect(arenaFloorForWave(5, 2)).toBe(5);
    expect(arenaFloorForWave(5, 9)).toBe(5);
  });
});

describe("rollArenaEncounter", () => {
  it("never returns a boss formation on floor 3", () => {
    for (let i = 0; i < 200; i++) {
      const entry = rollArenaEncounter(3, 5, () => Math.random());
      expect(entry).not.toBeNull();
      for (const spawn of entry!.spawns) {
        expect(ENEMIES_BY_ID[spawn.enemyId]?.isBoss).not.toBe(true);
      }
    }
  });

  it("returns something for floors 1–3", () => {
    for (const floor of [1, 2, 3]) {
      expect(rollArenaEncounter(floor, 1, () => 0)).not.toBeNull();
    }
  });
});

describe("adjustArenaEncounterForSmallParty", () => {
  it("leaves six-member packs unchanged", () => {
    const entry = ENCOUNTER_TABLES[3]![0]!;
    expect(entry.spawns.length).toBeGreaterThanOrEqual(3);
    const adjusted = adjustArenaEncounterForSmallParty(entry, 6);
    expect(adjusted.spawns).toEqual(entry.spawns);
  });

  it("drops one spawn from packs of 3+ for Classic Four", () => {
    const entry = ENCOUNTER_TABLES[5]![0]!;
    expect(entry.spawns.length).toBeGreaterThanOrEqual(3);
    const adjusted = adjustArenaEncounterForSmallParty(entry, CLASSIC_FOUR_PARTY_SIZE);
    expect(adjusted.spawns).toHaveLength(entry.spawns.length - 1);
    expect(adjusted.spawns).toEqual(entry.spawns.slice(0, -1));
  });

  it("does not trim two-enemy packs", () => {
    const twoPack = ENCOUNTER_TABLES[1]!.find((e) => e.spawns.length === 2);
    expect(twoPack).toBeDefined();
    const adjusted = adjustArenaEncounterForSmallParty(twoPack!, CLASSIC_FOUR_PARTY_SIZE);
    expect(adjusted.spawns).toEqual(twoPack!.spawns);
  });
});

describe("encounter zones", () => {
  const floor = {
    id: 1,
    encounterRate: 0.1,
    encounterZones: [
      { id: "safe", x1: 0, y1: 0, x2: 2, y2: 2, rateMul: 0 },
      { id: "hot", x1: 5, y1: 5, x2: 7, y2: 7, rateMul: 2, tableFloorId: 3 },
    ],
  };

  it("zeros rate in safe zones", () => {
    expect(encounterRateAt(floor, 1, 1)).toBe(0);
  });

  it("multiplies rate in hot zones", () => {
    expect(encounterRateAt(floor, 6, 6)).toBeCloseTo(0.2);
  });

  it("uses base rate outside zones", () => {
    expect(encounterRateAt(floor, 3, 3)).toBe(0.1);
  });

  it("overrides table floor id", () => {
    expect(encounterTableFloorId(floor, 6, 6)).toBe(3);
    expect(encounterTableFloorId(floor, 3, 3)).toBe(1);
  });
});
