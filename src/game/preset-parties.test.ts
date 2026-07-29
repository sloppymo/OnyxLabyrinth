import { describe, it, expect } from "vitest";
import { PARTY_SIZE, isPartyAlignmentValid } from "./party";
import {
  PRESET_PARTIES,
  CLASS_ROLE,
  createPresetParty,
  createDefaultParty,
  presetPartyById,
} from "./preset-parties";
import { CLASSES, type CharacterClass } from "./party";

function inBarRange(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

describe("preset parties", () => {
  it("ships exactly four presets", () => {
    expect(PRESET_PARTIES).toHaveLength(4);
    expect(PRESET_PARTIES.map((p) => p.id)).toEqual([
      "balanced",
      "iron",
      "glass",
      "blades",
    ]);
  });

  it("each preset has ATK/DEF/SUP bars in range and four valid slots", () => {
    for (const def of PRESET_PARTIES) {
      expect(inBarRange(def.atk)).toBe(true);
      expect(inBarRange(def.def)).toBe(true);
      expect(inBarRange(def.sup)).toBe(true);
      expect(def.members).toHaveLength(PARTY_SIZE);
      const slots = def.members.map((m) => m.slot).sort((a, b) => a - b);
      expect(slots).toEqual([0, 1, 2, 3]);
      const party = createPresetParty(def.id);
      expect(isPartyAlignmentValid(party)).toBe(true);
      expect(party.map((c) => c.name)).toEqual(def.members.map((m) => m.name));
      expect(party.map((c) => c.class)).toEqual(def.members.map((m) => m.cls));
    }
  });

  it("maps every playable class to a presentation role", () => {
    for (const cls of Object.keys(CLASSES) as CharacterClass[]) {
      expect(CLASS_ROLE[cls]).toBeTruthy();
    }
  });

  it("grants starter spells only to Mage and Priest members", () => {
    const iron = createPresetParty("iron");
    expect(iron.find((c) => c.class === "Priest")!.knownSpellIds.length).toBeGreaterThan(0);
    expect(iron.find((c) => c.class === "Fighter")!.knownSpellIds).toEqual([]);

    const blades = createPresetParty("blades");
    expect(blades.every((c) => c.knownSpellIds.length === 0)).toBe(true);

    const glass = createPresetParty("glass");
    expect(glass.find((c) => c.class === "Mage")!.knownSpellIds.length).toBeGreaterThan(0);
  });

  it("createDefaultParty matches balanced", () => {
    const a = createDefaultParty();
    const b = createPresetParty("balanced");
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
    expect(a.map((c) => c.class)).toEqual(b.map((c) => c.class));
  });

  it("grants Knock / Unseal to Mage and Priest starters", () => {
    const balanced = createPresetParty("balanced");
    expect(balanced.find((c) => c.class === "Mage")!.knownSpellIds).toContain("mage-knock");
    expect(balanced.find((c) => c.class === "Priest")!.knownSpellIds).toContain("priest-unseal");

    const iron = createPresetParty("iron");
    expect(iron.find((c) => c.class === "Priest")!.knownSpellIds).toContain("priest-unseal");
  });

  it("uses dynamics-first labels", () => {
    expect(PRESET_PARTIES.map((p) => p.label)).toEqual([
      "All Trades",
      "Shield Wall",
      "Glass Cannons",
      "All Steel",
    ]);
  });

  it("presetPartyById throws on unknown id", () => {
    expect(() => presetPartyById("nope" as "balanced")).toThrow(/Unknown preset/);
  });
});
