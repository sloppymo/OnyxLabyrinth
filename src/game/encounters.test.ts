import { describe, it, expect } from "vitest";
import {
  ENCOUNTER_COOLDOWN,
  ENCOUNTER_PITY_FORCE,
  ENCOUNTER_PITY_START,
  encounterRollChance,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
} from "./encounters";
import { ENEMIES_BY_ID } from "../data/enemies";

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
  it("maps Arena chooser levels to the intended floors", () => {
    expect(arenaStartFloorForLevel(1)).toBe(1);
    expect(arenaStartFloorForLevel(3)).toBe(1);
    expect(arenaStartFloorForLevel(6)).toBe(2);
    expect(arenaStartFloorForLevel(9)).toBe(3);
    expect(arenaStartFloorForLevel(12)).toBe(3);
  });
});

describe("arenaFloorForWave", () => {
  it("cycles 1→2→3 from a floor-1 start", () => {
    expect(arenaFloorForWave(1, 1)).toBe(1);
    expect(arenaFloorForWave(1, 2)).toBe(2);
    expect(arenaFloorForWave(1, 3)).toBe(3);
    expect(arenaFloorForWave(1, 4)).toBe(1);
  });

  it("cycles 2↔3 from a floor-2 start", () => {
    expect(arenaFloorForWave(2, 1)).toBe(2);
    expect(arenaFloorForWave(2, 2)).toBe(3);
    expect(arenaFloorForWave(2, 3)).toBe(2);
  });

  it("stays on floor 3 when started there (L9+)", () => {
    expect(arenaFloorForWave(3, 1)).toBe(3);
    expect(arenaFloorForWave(3, 2)).toBe(3);
    expect(arenaFloorForWave(3, 9)).toBe(3);
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
