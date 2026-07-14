/**
 * Unit tests for spell corpus helpers (tier unlocks / content caps).
 */
import { describe, it, expect } from "vitest";
import {
  MAGE_SPELLS,
  PRIEST_SPELLS,
  maxContentSpellTier,
  spellsForClass,
  spellById,
  isUtilitySpell,
} from "./spells";

describe("endgame spell corpus (T6–T7)", () => {
  it("ships Mage Meteor Swarm, Disintegrate (T6) and Freezing Sphere (T7)", () => {
    expect(spellById("mage-meteor-swarm")?.tier).toBe(6);
    expect(spellById("mage-disintegrate")?.tier).toBe(6);
    expect(spellById("mage-freezing-sphere")?.tier).toBe(7);
  });

  it("ships Priest Mass Regenerate (T6) and Holy Aura (T7)", () => {
    expect(spellById("priest-mass-regenerate")?.tier).toBe(6);
    expect(spellById("priest-holy-aura")?.tier).toBe(7);
  });

  it("reports max content tier 7 for Mage and Priest", () => {
    expect(maxContentSpellTier("Mage")).toBe(7);
    expect(maxContentSpellTier("Priest")).toBe(7);
    expect(maxContentSpellTier("Fighter")).toBe(0);
  });

  it("spellsForClass at tier 5 excludes T6+, and tier 7 includes them", () => {
    const at5 = spellsForClass("Mage", 5).map((s) => s.id);
    expect(at5).not.toContain("mage-meteor-swarm");
    const at7 = spellsForClass("Mage", 7).map((s) => s.id);
    expect(at7).toContain("mage-meteor-swarm");
    expect(at7).toContain("mage-freezing-sphere");
  });

  it("does not mark endgame combat spells as utility", () => {
    for (const id of [
      "mage-meteor-swarm",
      "mage-disintegrate",
      "mage-freezing-sphere",
      "priest-mass-regenerate",
      "priest-holy-aura",
    ]) {
      const spell = spellById(id)!;
      expect(isUtilitySpell(spell)).toBe(false);
    }
  });

  it("every spell has a positive SP cost and a description", () => {
    for (const s of [...MAGE_SPELLS, ...PRIEST_SPELLS]) {
      expect(s.spCost).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});
