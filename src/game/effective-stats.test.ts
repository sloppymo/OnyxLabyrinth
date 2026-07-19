/**
 * Tests for effective stats aggregation.
 */
import { describe, it, expect } from "vitest";
import { effectiveStats } from "./effective-stats";
import { createCharacter } from "./party";
import type { Loadout } from "./combat-types";
import type { ItemDef } from "../data/items";
import type { PerkDef } from "./perks";

function mockItem(overrides: Partial<ItemDef> = {}): ItemDef {
  return {
    id: "mock-item",
    name: "Mock Item",
    type: "weapon",
    price: 0,
    ...overrides,
  } as ItemDef;
}

function mockPerk(statModifiers: Partial<Record<"str" | "int" | "pie" | "vit" | "agi" | "luk", number>>): PerkDef {
  return {
    id: "mock-perk",
    class: "Fighter",
    tier: 1,
    level: 3,
    name: "Mock Perk",
    description: "For testing.",
    triggers: [],
    effect: { statModifiers },
    tags: ["passive"],
    oncePerCombat: false,
    priority: "normal",
  };
}

describe("effectiveStats", () => {
  it("returns base stats when no loadout or perks are provided", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const result = effectiveStats(c);
    expect(result).toEqual(c.stats);
  });

  it("adds weapon stat bonuses", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const loadout: Loadout = {
      weapon: mockItem({ statBonuses: { str: 2, agi: 1 } }),
      armor: [],
    };
    const result = effectiveStats(c, loadout);
    expect(result.str).toBe(c.stats.str + 2);
    expect(result.agi).toBe(c.stats.agi + 1);
  });

  it("adds armor stat bonuses from multiple pieces", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const loadout: Loadout = {
      armor: [
        mockItem({ type: "armor", slot: "body", statBonuses: { vit: 2 } }),
        mockItem({ type: "armor", slot: "helm", statBonuses: { int: 1 } }),
      ],
    };
    const result = effectiveStats(c, loadout);
    expect(result.vit).toBe(c.stats.vit + 2);
    expect(result.int).toBe(c.stats.int + 1);
  });

  it("adds perk stat modifiers", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const perks = [mockPerk({ str: 3, luk: -1 })];
    const result = effectiveStats(c, undefined, perks);
    expect(result.str).toBe(c.stats.str + 3);
    expect(result.luk).toBe(c.stats.luk - 1);
  });

  it("combines base + equipment + perk modifiers", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const loadout: Loadout = {
      weapon: mockItem({ statBonuses: { str: 2 } }),
      armor: [mockItem({ type: "armor", slot: "body", statBonuses: { str: 1, vit: 1 } })],
    };
    const perks = [mockPerk({ str: 3, vit: 2 })];
    const result = effectiveStats(c, loadout, perks);
    expect(result.str).toBe(c.stats.str + 6);
    expect(result.vit).toBe(c.stats.vit + 3);
  });

  it("floors each stat at 1 even with heavy penalties", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const perks = [mockPerk({ str: -50, agi: -50 })];
    const result = effectiveStats(c, undefined, perks);
    expect(result.str).toBe(1);
    expect(result.agi).toBe(1);
  });

  it("does not clamp stats back to the creation 3-18 ceiling", () => {
    const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
    const perks = [mockPerk({ str: 50 })];
    const result = effectiveStats(c, undefined, perks);
    expect(result.str).toBe(c.stats.str + 50);
  });
});
