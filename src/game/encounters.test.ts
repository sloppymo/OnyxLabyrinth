import { describe, it, expect } from "vitest";
import {
  ENCOUNTER_COOLDOWN,
  ENCOUNTER_PITY_FORCE,
  ENCOUNTER_PITY_START,
  encounterRollChance,
  encounterRateAt,
  encounterTableFloorId,
  zoneHeatAt,
  pityPressureFor,
  arenaStartFloorForLevel,
  arenaFloorForWave,
  rollArenaEncounter,
  adjustArenaEncounterForSmallParty,
} from "./encounters";
import { ENEMIES_BY_ID, ENCOUNTER_TABLES } from "../data/enemies";
import { getFloors } from "./floor-registry";

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

  it("mixes sprites beyond any single formation's fixed spawns", () => {
    // Floor 3's table has ~10 formations, none with more than 4 distinct
    // front-row ids. Reshuffling across the floor's full roster should
    // surface well more than that over enough rolls.
    const seenFront = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const entry = rollArenaEncounter(3, 1, Math.random);
      for (const spawn of entry!.spawns) {
        if (spawn.row === "front") seenFront.add(spawn.enemyId);
      }
    }
    expect(seenFront.size).toBeGreaterThanOrEqual(8);
  });

  it("never substitutes in a boss even after reshuffling", () => {
    for (let i = 0; i < 500; i++) {
      const entry = rollArenaEncounter(5, 1, Math.random);
      for (const spawn of entry!.spawns) {
        expect(ENEMIES_BY_ID[spawn.enemyId]?.isBoss).not.toBe(true);
      }
    }
  });

  it("keeps the winning formation's pack shape (spawn count and row split)", () => {
    const table = ENCOUNTER_TABLES[4]!;
    for (let i = 0; i < 50; i++) {
      const entry = rollArenaEncounter(4, 1, Math.random)!;
      const shapeMatch = table.some(
        (original) =>
          original.spawns.length === entry.spawns.length &&
          original.spawns.every((s, idx) => s.row === entry.spawns[idx]!.row)
      );
      expect(shapeMatch).toBe(true);
    }
  });
});

describe("adjustArenaEncounterForSmallParty", () => {
  it("drops one spawn from packs of 3+ for Arena's 4-person party", () => {
    const entry = ENCOUNTER_TABLES[5]![0]!;
    expect(entry.spawns.length).toBeGreaterThanOrEqual(3);
    const adjusted = adjustArenaEncounterForSmallParty(entry);
    expect(adjusted.spawns).toHaveLength(entry.spawns.length - 1);
    expect(adjusted.spawns).toEqual(entry.spawns.slice(0, -1));
  });

  it("does not trim two-enemy packs", () => {
    const twoPack = ENCOUNTER_TABLES[1]!.find((e) => e.spawns.length === 2);
    expect(twoPack).toBeDefined();
    const adjusted = adjustArenaEncounterForSmallParty(twoPack!);
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

describe("zoneHeatAt", () => {
  const floor = {
    encounterRate: 0.1,
    encounterZones: [
      { id: "dead", x1: 0, y1: 0, x2: 2, y2: 2, rateMul: 0 },
      { id: "quiet", x1: 4, y1: 0, x2: 6, y2: 2, rateMul: 0.5 },
      { id: "hot", x1: 8, y1: 0, x2: 10, y2: 2, rateMul: 2 },
    ],
  };

  it("reads dead in a rateMul-0 pocket", () => {
    expect(zoneHeatAt(floor, 1, 1)).toBe("dead");
  });

  it("reads quiet, normal, and hot against the floor's own base rate", () => {
    expect(zoneHeatAt(floor, 5, 1)).toBe("quiet");
    expect(zoneHeatAt(floor, 20, 20)).toBe("normal"); // outside every zone
    expect(zoneHeatAt(floor, 9, 1)).toBe("hot");
  });

  it("is independent of the step counter", () => {
    // Heat is the "where" channel — it must not encode encounter timing.
    expect(zoneHeatAt(floor, 9, 1)).toBe(zoneHeatAt(floor, 9, 1));
  });

  it("classifies every authored zone on every live floor as visibly non-normal", () => {
    // Uses the real runtime registry (campaign floors 2-3 plus the JSON packs
    // for 1/4/5), not data/floors.ts's FLOORS, which holds only 2-3. A zone
    // that read "normal" would be invisible to the player and the authoring
    // effort would be wasted.
    const floors = getFloors();
    expect(floors.map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
    let zonesChecked = 0;
    for (const floorDef of floors) {
      for (const zone of floorDef.encounterZones ?? []) {
        expect(zoneHeatAt(floorDef, zone.x1, zone.y1)).not.toBe("normal");
        zonesChecked++;
      }
    }
    expect(zonesChecked).toBeGreaterThanOrEqual(12);
  });
});

describe("pityPressureFor", () => {
  it("fills as the counter climbs", () => {
    expect(pityPressureFor(0)).toBe("cooldown");
    expect(pityPressureFor(ENCOUNTER_COOLDOWN - 1)).toBe("cooldown");
    expect(pityPressureFor(ENCOUNTER_COOLDOWN)).toBe("live");
    expect(pityPressureFor(ENCOUNTER_PITY_START - 1)).toBe("live");
    expect(pityPressureFor(ENCOUNTER_PITY_START)).toBe("ramping");
    expect(pityPressureFor(ENCOUNTER_PITY_FORCE)).toBe("ramping");
  });

  it("agrees with encounterRollChance about when rolls go live", () => {
    for (let steps = 0; steps <= ENCOUNTER_PITY_FORCE + 3; steps++) {
      const rollable = encounterRollChance(0.1, steps) > 0;
      expect(pityPressureFor(steps) === "cooldown").toBe(!rollable);
    }
  });

  it("reports ramping in a dead zone, because pity ignores rateMul", () => {
    // The two channels are orthogonal on purpose: a rateMul-0 pocket still
    // gets a forced fight at ENCOUNTER_PITY_FORCE, and the readout must be
    // able to warn about it.
    expect(pityPressureFor(ENCOUNTER_PITY_START)).toBe("ramping");
    expect(encounterRollChance(0, ENCOUNTER_PITY_FORCE)).toBe(1);
  });
});
