import { describe, it, expect } from "vitest";
import {
  roll3d6,
  clampStat,
  applyRacialModifiers,
  rollStatsForRace,
  computeMaxHp,
  computeMaxSp,
  createCharacterRecord,
  isFrontRow,
  charRow,
  RACES,
  CLASSES,
  type Race,
  type CharacterClass,
} from "./party";
import { createPlayableDuo } from "./playable-duo";
import { createCombatTestRoster } from "./test-roster";

describe("roll3d6", () => {
  it("produces a value between 3 and 18", () => {
    for (let i = 0; i < 100; i++) {
      const v = roll3d6();
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(18);
    }
  });
});

describe("clampStat", () => {
  it("clamps to 3-18 range", () => {
    expect(clampStat(1)).toBe(3);
    expect(clampStat(3)).toBe(3);
    expect(clampStat(10)).toBe(10);
    expect(clampStat(18)).toBe(18);
    expect(clampStat(25)).toBe(18);
  });
});

describe("applyRacialModifiers", () => {
  it("applies Human modifiers (no change)", () => {
    const base = { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 };
    const result = applyRacialModifiers(base, "Human");
    expect(result).toEqual(base);
  });

  it("applies Elf modifiers (+2 INT, +2 PIE, -2 VIT)", () => {
    const base = { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 };
    const result = applyRacialModifiers(base, "Elf");
    expect(result.int).toBe(12);
    expect(result.pie).toBe(12);
    expect(result.vit).toBe(8);
    expect(result.str).toBe(10);
  });

  it("applies Dwarf modifiers (+2 STR, +2 VIT, -2 AGI)", () => {
    const base = { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 };
    const result = applyRacialModifiers(base, "Dwarf");
    expect(result.str).toBe(12);
    expect(result.vit).toBe(12);
    expect(result.agi).toBe(8);
  });
});

describe("rollStatsForRace", () => {
  it("produces stats in 3-18 range for each race", () => {
    const races: Race[] = ["Human", "Elf", "Dwarf", "Gnome", "Hobbit"];
    for (const race of races) {
      const stats = rollStatsForRace(race);
      for (const v of Object.values(stats)) {
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(18);
      }
    }
  });
});

describe("computeMaxHp", () => {
  it("computes VIT * 2 + class.hpBonus", () => {
    const stats = { str: 10, int: 10, pie: 10, vit: 12, agi: 10, luk: 10 };
    expect(computeMaxHp(stats, "Fighter")).toBe(12 * 2 + 8);
    expect(computeMaxHp(stats, "Mage")).toBe(12 * 2 + 0);
    expect(computeMaxHp(stats, "Priest")).toBe(12 * 2 + 2);
    expect(computeMaxHp(stats, "Thief")).toBe(12 * 2 + 4);
  });
});

describe("computeMaxSp", () => {
  it("computes INT * 2 for Mage, PIE * 2 for Priest, 0 for others", () => {
    const stats = { str: 10, int: 14, pie: 13, vit: 10, agi: 10, luk: 10 };
    expect(computeMaxSp(stats, "Mage")).toBe(14 * 2);
    expect(computeMaxSp(stats, "Priest")).toBe(13 * 2);
    expect(computeMaxSp(stats, "Fighter")).toBe(0);
    expect(computeMaxSp(stats, "Thief")).toBe(0);
  });
});

describe("createCharacterRecord", () => {
  it("creates a character with full HP and SP", () => {
    const char = createCharacterRecord("char1", "Test", "Human", "Neutral", "Fighter", 0);
    expect(char.name).toBe("Test");
    expect(char.race).toBe("Human");
    expect(char.class).toBe("Fighter");
    expect(char.hp).toBe(char.maxHp);
    expect(char.sp).toBe(char.maxSp);
    expect(char.status).toEqual([]);
    expect(char.formationSlot).toBe(0);
  });

  it("assigns the given id", () => {
    const a = createCharacterRecord("char-a", "A", "Human", "Neutral", "Fighter", 0);
    const b = createCharacterRecord("char-b", "B", "Human", "Neutral", "Fighter", 1);
    expect(a.id).toBe("char-a");
    expect(b.id).toBe("char-b");
  });
});

describe("createPlayableDuo", () => {
  it("creates exactly the fixed Old Man + Rat King protagonists", () => {
    const duo = createPlayableDuo();
    expect(duo.map((c) => c.id)).toEqual(["old-man", "rat-king"]);
    expect(duo.map((c) => c.name)).toEqual(["Old Man", "Rat King"]);
    expect(duo.map((c) => c.class)).toEqual(["Mage", "Thief"]);
    expect(duo[0]!.knownSpellIds).toContain("priest-light");
    expect(duo[0]!.knownSpellIds).toContain("priest-unseal");
  });
});

describe("formation helpers", () => {
  it("isFrontRow returns true for slots 0-1", () => {
    const party = createCombatTestRoster();
    expect(isFrontRow(party[0])).toBe(true);
    expect(isFrontRow(party[1])).toBe(true);
    expect(isFrontRow(party[2])).toBe(false);
    expect(isFrontRow(party[3])).toBe(false);
  });

  it("charRow returns 'front' or 'back'", () => {
    const party = createCombatTestRoster();
    expect(charRow(party[0])).toBe("front");
    expect(charRow(party[2])).toBe("back");
  });
});

describe("RACES and CLASSES", () => {
  it("has 5 races", () => {
    expect(Object.keys(RACES).length).toBe(5);
  });

  it("has 7 classes", () => {
    expect(Object.keys(CLASSES).length).toBe(7);
  });

  it("all races have modifiers defined", () => {
    for (const race of Object.values(RACES)) {
      expect(race.modifiers).toBeDefined();
      expect(race.description).toBeTruthy();
    }
  });
});
