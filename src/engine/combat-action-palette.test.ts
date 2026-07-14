import { describe, it, expect } from "vitest";
import type { Character, CharacterClass } from "../game/party";
import { MAGE_SPELLS, PRIEST_SPELLS } from "../data/spells";
import { HEALING_POTION } from "../data/items";
import { buildPalette } from "./combat-action-palette";

function makeChar(
  cls: CharacterClass,
  overrides: Partial<Character> = {}
): Character {
  return {
    id: "c1",
    name: "Test",
    race: "Human",
    alignment: "Good",
    class: cls,
    level: 1,
    xp: 0,
    stats: { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 },
    hp: 20,
    sp: 20,
    maxHp: 20,
    maxSp: 20,
    formationSlot: 0,
    status: [],
    knownSpellIds: [],
    perkIds: [],
    ...overrides,
  };
}

const items = [{ item: HEALING_POTION, count: 2 }];

function slotKinds(palette: ReturnType<typeof buildPalette>) {
  return palette.slots.map((s) => s.kind);
}

function findSlot(palette: ReturnType<typeof buildPalette>, kind: string) {
  return palette.slots.find((s) => s.kind === kind);
}

describe("buildPalette", () => {
  it("returns the four expected face slots", () => {
    const p = buildPalette(makeChar("Fighter"), [], items);
    expect(slotKinds(p)).toEqual(["attack", "defend", "cast", "skill"]);
    expect(p.itemButton).toBe("select");
    expect(p.autoButton).toBe("start");
  });

  it("Fighter: cast disabled (no spells), skill enabled (techniques exist)", () => {
    const p = buildPalette(makeChar("Fighter"), [], items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: false });
  });

  it("Mage: cast enabled (spells exist), skill disabled (no techniques)", () => {
    const p = buildPalette(makeChar("Mage"), MAGE_SPELLS, items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: false });
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: true });
  });

  it("Thief: cast enabled if spells, skill enabled for Hide/Ambush", () => {
    const p = buildPalette(makeChar("Thief"), [], items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: false });

    const pWithSpells = buildPalette(makeChar("Thief"), PRIEST_SPELLS, items);
    expect(findSlot(pWithSpells, "cast")).toEqual({
      kind: "cast",
      disabled: false,
    });
    expect(findSlot(pWithSpells, "skill")).toEqual({
      kind: "skill",
      disabled: false,
    });
  });

  it("silenced Mage: cast disabled even with spells", () => {
    const p = buildPalette(makeChar("Mage"), MAGE_SPELLS, items, {
      silenced: true,
    });
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
  });

  it("empty spell list: cast disabled", () => {
    const p = buildPalette(makeChar("Mage"), [], items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
  });

  it("melee class with no available techniques: skill disabled", () => {
    // Level 0 Fighter has no techniques learned yet.
    const p = buildPalette(makeChar("Fighter", { level: 0 }), [], items);
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: true });
  });

  it("disables cast when provided currentSp is below the cheapest spell", () => {
    const p = buildPalette(makeChar("Mage"), MAGE_SPELLS, items, {
      currentSp: 0,
    });
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
  });

  it("keeps cast enabled when provided currentSp can afford the cheapest spell", () => {
    const p = buildPalette(makeChar("Mage"), MAGE_SPELLS, items, {
      currentSp: 1,
    });
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: false });
  });

  it("filters out utility spells when deciding cast availability", () => {
    // Only utility spells (light/levitate/detect) are passed.
    const utilityOnly = MAGE_SPELLS.filter((s) =>
      ["light", "levitation", "detect"].includes(s.effect.kind)
    );
    const p = buildPalette(makeChar("Mage"), utilityOnly, items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
  });
});
