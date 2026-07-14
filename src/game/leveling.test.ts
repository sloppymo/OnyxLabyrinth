/**
 * Tests for leveling math and character level-up logic.
 */
import { describe, it, expect } from "vitest";
import { xpForNextLevel, levelUpChar } from "./leveling";
import { createCharacter } from "./party";
import type { Loadout } from "./combat";
import type { ItemDef } from "../data/items";

function mockItem(statBonuses: Partial<Record<"str" | "int" | "pie" | "vit" | "agi" | "luk", number>>): ItemDef {
  return {
    id: "mock-item",
    name: "Mock Item",
    type: "armor",
    slot: "body",
    price: 0,
    statBonuses,
  } as ItemDef;
}

describe("xpForNextLevel", () => {
  it("returns level * 20", () => {
    expect(xpForNextLevel(1)).toBe(20);
    expect(xpForNextLevel(5)).toBe(100);
    expect(xpForNextLevel(10)).toBe(200);
  });
});

describe("levelUpChar", () => {
  it("increments level and fully restores HP/SP", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.hp = 1;
    c.sp = 1;
    const result = levelUpChar(c);
    expect(result.level).toBe(2);
    expect(result.hp).toBe(result.maxHp);
    expect(result.sp).toBe(result.sp);
  });

  it("uses effective VIT for HP growth", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    c.stats.vit = 10;
    const without = levelUpChar(c);

    const loadout: Loadout = { armor: [mockItem({ vit: 4 })] };
    const withLoadout = levelUpChar(c, loadout);

    const expectedBaseGrowth = Math.floor((10 * 2 + 8) * 0.5);
    const expectedBoostedGrowth = Math.floor((14 * 2 + 8) * 0.5);
    expect(without.maxHp - c.maxHp).toBe(expectedBaseGrowth);
    expect(withLoadout.maxHp - c.maxHp).toBe(expectedBoostedGrowth);
  });

  it("uses effective INT for Mage SP growth", () => {
    const c = createCharacter("c1", "Dell", "Elf", "Neutral", "Mage", 0);
    c.stats.int = 10;
    const without = levelUpChar(c);

    const loadout: Loadout = { armor: [mockItem({ int: 4 })] };
    const withLoadout = levelUpChar(c, loadout);

    expect(without.maxSp - c.maxSp).toBe(Math.floor(10 * 0.5));
    expect(withLoadout.maxSp - c.maxSp).toBe(Math.floor(14 * 0.5));
  });

  it("uses effective PIE for Priest SP growth", () => {
    const c = createCharacter("c1", "Eve", "Gnome", "Good", "Priest", 0);
    c.stats.pie = 10;
    const without = levelUpChar(c);

    const loadout: Loadout = { armor: [mockItem({ pie: 4 })] };
    const withLoadout = levelUpChar(c, loadout);

    expect(without.maxSp - c.maxSp).toBe(Math.floor(10 * 0.5));
    expect(withLoadout.maxSp - c.maxSp).toBe(Math.floor(14 * 0.5));
  });

  it("grants new spells when crossing a tier threshold", () => {
    const c = createCharacter("c1", "Dell", "Elf", "Neutral", "Mage", 0);
    c.level = 2;
    c.xp = 100;
    const result = levelUpChar(c);
    expect(result.level).toBe(3);
    expect(result.knownSpellIds.length).toBeGreaterThan(c.knownSpellIds.length);
  });

  it("grants T6 spells at level 11 (Meteor Swarm / Disintegrate)", () => {
    const c = createCharacter("c1", "Dell", "Elf", "Neutral", "Mage", 0);
    c.level = 10;
    const result = levelUpChar(c);
    expect(result.level).toBe(11);
    expect(result.knownSpellIds).toContain("mage-meteor-swarm");
    expect(result.knownSpellIds).toContain("mage-disintegrate");
  });

  it("grants T7 Freezing Sphere at level 13", () => {
    const c = createCharacter("c1", "Dell", "Elf", "Neutral", "Mage", 0);
    c.level = 12;
    const result = levelUpChar(c);
    expect(result.level).toBe(13);
    expect(result.knownSpellIds).toContain("mage-freezing-sphere");
  });

  it("grants Priest Mass Regenerate at level 11 and Holy Aura at 13", () => {
    const p = createCharacter("c2", "Eve", "Gnome", "Good", "Priest", 0);
    p.level = 10;
    const at11 = levelUpChar(p);
    expect(at11.knownSpellIds).toContain("priest-mass-regenerate");

    at11.level = 12;
    const at13 = levelUpChar(at11);
    expect(at13.knownSpellIds).toContain("priest-holy-aura");
  });
});
