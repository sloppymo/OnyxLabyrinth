import { describe, it, expect } from "vitest";
import type { Character, CharacterClass } from "../game/party";
import { MAGE_SPELLS, PRIEST_SPELLS } from "../data/spells";
import { HEALING_POTION } from "../data/items";
import { buildPalette, PALETTE_LETTER_SHORTCUTS } from "./combat-action-palette";

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

  it("Mage: cast enabled (spells exist), skill enabled (Analyze is universal)", () => {
    const p = buildPalette(makeChar("Mage"), MAGE_SPELLS, items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: false });
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: false });
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

  it("melee class with no available techniques: skill still enabled (Analyze is universal)", () => {
    // Level 0 Fighter has no techniques learned yet, but Analyze is always there.
    const p = buildPalette(makeChar("Fighter", { level: 0 }), [], items);
    expect(findSlot(p, "skill")).toEqual({ kind: "skill", disabled: false });
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
    // Only utility spells (light/levitate/detect/knock) are passed.
    const utilityOnly = MAGE_SPELLS.filter((s) =>
      ["light", "levitation", "detect", "knock"].includes(s.effect.kind)
    );
    const p = buildPalette(makeChar("Mage"), utilityOnly, items);
    expect(findSlot(p, "cast")).toEqual({ kind: "cast", disabled: true });
  });

  it("disables the Item (Select) affordance when inventory is empty", () => {
    const empty = buildPalette(makeChar("Fighter"), [], []);
    expect(empty.itemDisabled).toBe(true);
    const zeroCount = buildPalette(makeChar("Fighter"), [], [
      { item: HEALING_POTION, count: 0 },
    ]);
    expect(zeroCount.itemDisabled).toBe(true);
  });

  it("keeps Item enabled when consumables remain", () => {
    const p = buildPalette(makeChar("Fighter"), [], items);
    expect(p.itemDisabled).toBe(false);
  });
});

describe("PALETTE_LETTER_SHORTCUTS", () => {
  it("covers every legacy letter verb", () => {
    expect(PALETTE_LETTER_SHORTCUTS).toEqual({
      t: "technique",
      c: "cast",
      m: "cast",
      i: "item",
      f: "flee",
      r: "flee",
      h: "hide",
      n: "analyze",
      v: "move",
    });
  });

  it("includes the three verbs main.ts's old 'tcmifr' whitelist dropped", () => {
    // Regression: h/n/v reached no handler at all — combat-ui defined them but
    // the main.ts listener never forwarded them, and they are not on the
    // face-button map either, so the keys were dead.
    for (const key of ["h", "n", "v"]) {
      expect(PALETTE_LETTER_SHORTCUTS[key]).toBeDefined();
    }
  });

  it("claims no key that the controller face-button map already owns", () => {
    // Letters bound in controller-input.ts's KEYBOARD_MAP; the palette
    // whitelist intentionally shadows t/r/f, so only those three may overlap.
    const faceButtonLetters = ["a", "b", "s", "d", "w", "z", "q", "e", "r", "t", "f", "g"];
    const overlap = Object.keys(PALETTE_LETTER_SHORTCUTS).filter((k) =>
      faceButtonLetters.includes(k)
    );
    expect(overlap.sort()).toEqual(["f", "r", "t"]);
  });
});
