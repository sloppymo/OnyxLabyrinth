import { describe, it, expect } from "vitest";
import { effectiveAc } from "./combat-select-action-view";
import { createCombatState, type Loadout } from "../game/combat";
import { createDefaultParty } from "../game/party";
import { ITEMS_BY_ID } from "../data/items";

// --- Test helpers -----------------------------------------------------------

function makeState(loadout: Record<string, Loadout> = {}) {
  const party = createDefaultParty();
  const state = createCombatState(
    party,
    { front: [], back: [] },
    false,
    {},
    {},
    loadout
  );
  return state;
}

describe("effectiveAc", () => {
  it("is 10 for a character with no armor and no buffs", () => {
    const state = makeState();
    const c = state.party[0];
    expect(effectiveAc(state, c)).toBe(10);
  });

  it("reflects equipped armor's defenseBonus", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"];
    expect(leather?.defenseBonus).toBeGreaterThan(0);
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather!] },
    };
    const state = makeState(loadout);
    // Overwrite party with our character so ids line up.
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10 - leather!.defenseBonus!);
  });

  it("sums multiple equipped armor pieces", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"]!;
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather, leather] },
    };
    const state = makeState(loadout);
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10 - leather.defenseBonus! * 2);
  });

  it("includes persistent spell armor buffs", () => {
    const c = createDefaultParty()[0];
    const state = makeState();
    state.party[0] = c;
    state.armorBuffs[c.id] = 3;
    expect(effectiveAc(state, c)).toBe(7);
  });

  it("combines equipped armor and spell buffs", () => {
    const c = createDefaultParty()[0];
    const leather = ITEMS_BY_ID["leather"]!;
    const loadout: Record<string, Loadout> = {
      [c.id]: { armor: [leather] },
    };
    const state = makeState(loadout);
    state.party[0] = c;
    state.armorBuffs[c.id] = 3;
    expect(effectiveAc(state, c)).toBe(10 - leather.defenseBonus! - 3);
  });

  it("treats a character with no loadout entry as unarmored", () => {
    const c = createDefaultParty()[0];
    const state = makeState({});
    state.party[0] = c;
    expect(effectiveAc(state, c)).toBe(10);
  });
});
