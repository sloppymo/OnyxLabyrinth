/**
 * Unit tests for the Church of Saint Namanda's real gameplay logic (Heal,
 * Blessing, Uncurse, Identify). No DOM — see `engine/namanda-ui.ts` for the
 * controller that calls these.
 */
import { describe, it, expect } from "vitest";
import {
  healAtChurch,
  identifyAtChurch,
  eligibleIdentifyTargets,
  uncurseAtChurch,
  equippedCursedItems,
  blessAtChurch,
  applyNamandaBlessing,
} from "./namanda";
import { createGameState } from "./state";
import { createCombatState } from "./combat";
import { hasBuff } from "./persistent-spells";
import { FLOORS } from "../data/floors";
import {
  REMOVE_CURSE_COST,
  APPRAISE_COST,
  NAMANDA_BLESSING_COST,
  NAMANDA_BLESSING_ARMOR_BONUS,
} from "../data/service-prices";
import type { GameState } from "../types";

function makeState(): GameState {
  return createGameState(FLOORS[0]);
}

describe("healAtChurch", () => {
  it("fully restores HP/SP, clears status, revives the knocked out, and is free", () => {
    const state = makeState();
    const gold = state.partyGold;
    for (const c of state.party) {
      c.hp = 1;
      c.sp = 0;
      c.status = ["poison", "knockedOut"];
    }
    const result = healAtChurch(state);
    expect(result.ok).toBe(true);
    for (const c of state.party) {
      expect(c.hp).toBe(c.maxHp);
      expect(c.sp).toBe(c.maxSp);
      expect(c.status).toEqual([]);
    }
    expect(state.partyGold).toBe(gold); // never charges
  });

  it("does not clear persistentBuffs (unlike Camp) — an active Blessing survives", () => {
    const state = makeState();
    blessAtChurch(state);
    expect(hasBuff(state, "blessing")).toBe(true);
    healAtChurch(state);
    expect(hasBuff(state, "blessing")).toBe(true);
  });
});

describe("identify", () => {
  it("lists only unidentified inventory items", () => {
    const state = makeState();
    state.inventory = [
      { itemId: "healing-potion", identified: true },
      { itemId: "healing-potion", identified: false },
    ];
    expect(eligibleIdentifyTargets(state)).toEqual([1]);
  });

  it("identifies an eligible item and charges gold exactly once", () => {
    const state = makeState();
    state.inventory = [{ itemId: "healing-potion", identified: false }];
    const gold = state.partyGold;
    const result = identifyAtChurch(state, 0);
    expect(result.ok).toBe(true);
    expect(state.inventory[0]!.identified).toBe(true);
    expect(state.partyGold).toBe(gold - APPRAISE_COST);
  });

  it("refuses when the party can't afford it, and does not identify", () => {
    const state = makeState();
    state.partyGold = APPRAISE_COST - 1;
    state.inventory = [{ itemId: "healing-potion", identified: false }];
    const result = identifyAtChurch(state, 0);
    expect(result.ok).toBe(false);
    expect(state.inventory[0]!.identified).toBe(false);
  });

  it("refuses an already-identified item without charging", () => {
    const state = makeState();
    state.inventory = [{ itemId: "healing-potion", identified: true }];
    const gold = state.partyGold;
    const result = identifyAtChurch(state, 0);
    expect(result.ok).toBe(false);
    expect(state.partyGold).toBe(gold);
  });
});

describe("uncurse", () => {
  function equipCursedBlade(state: GameState, charId: string): void {
    state.equipment[charId]!.weapon = {
      id: "cursed-blade",
      name: "Bloodthirsty Blade",
      type: "weapon",
      slot: "hand",
      attackBonus: -2,
      range: "close",
      price: 5,
      cursed: true,
      description: "",
    };
  }

  it("lists equipped cursed items across the party", () => {
    const state = makeState();
    const charId = state.party[0]!.id;
    equipCursedBlade(state, charId);
    const cursed = equippedCursedItems(state);
    expect(cursed).toHaveLength(1);
    expect(cursed[0]!.itemName).toBe("Bloodthirsty Blade");
  });

  it("shatters equipped cursed gear, charges gold once, and never duplicates or leaves it behind", () => {
    const state = makeState();
    const charId = state.party[0]!.id;
    equipCursedBlade(state, charId);
    const gold = state.partyGold;
    const result = uncurseAtChurch(state);
    expect(result.ok).toBe(true);
    expect(state.equipment[charId]!.weapon).toBeUndefined();
    expect(state.partyGold).toBe(gold - REMOVE_CURSE_COST);
    // Second call finds nothing left to uncurse and does not charge again.
    const second = uncurseAtChurch(state);
    expect(second.ok).toBe(false);
    expect(state.partyGold).toBe(gold - REMOVE_CURSE_COST);
  });

  it("also strips cursed items sitting unequipped in inventory", () => {
    const state = makeState();
    const charId = state.party[0]!.id;
    equipCursedBlade(state, charId);
    state.inventory.push({ itemId: "cursed-helm", identified: true });
    uncurseAtChurch(state);
    expect(state.inventory.some((e) => e.itemId === "cursed-helm")).toBe(false);
  });

  it("refuses when nothing is cursed", () => {
    const state = makeState();
    const result = uncurseAtChurch(state);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no curses/i);
  });

  it("refuses when the party can't afford it, and leaves the curse intact", () => {
    const state = makeState();
    const charId = state.party[0]!.id;
    equipCursedBlade(state, charId);
    state.partyGold = REMOVE_CURSE_COST - 1;
    const result = uncurseAtChurch(state);
    expect(result.ok).toBe(false);
    expect(state.equipment[charId]!.weapon?.cursed).toBe(true);
  });

  it("does not touch a non-cursed weapon in the same slot on another character", () => {
    const state = makeState();
    const [a, b] = state.party;
    equipCursedBlade(state, a!.id);
    const bWeaponBefore = state.equipment[b!.id]!.weapon;
    uncurseAtChurch(state);
    expect(state.equipment[b!.id]!.weapon).toEqual(bWeaponBefore);
  });
});

describe("blessing", () => {
  it("activates the blessing buff and charges gold", () => {
    const state = makeState();
    const gold = state.partyGold;
    const result = blessAtChurch(state);
    expect(result.ok).toBe(true);
    expect(hasBuff(state, "blessing")).toBe(true);
    expect(state.partyGold).toBe(gold - NAMANDA_BLESSING_COST);
  });

  it("refuses when the party can't afford it", () => {
    const state = makeState();
    state.partyGold = NAMANDA_BLESSING_COST - 1;
    const result = blessAtChurch(state);
    expect(result.ok).toBe(false);
    expect(hasBuff(state, "blessing")).toBe(false);
  });

  it("one active blessing at a time — re-blessing refreshes, never stacks", () => {
    const state = makeState();
    state.partyGold = NAMANDA_BLESSING_COST * 3;
    blessAtChurch(state);
    const before = state.persistentBuffs.filter((b) => b.kind === "blessing");
    expect(before).toHaveLength(1);
    // Let the buff tick down, then refresh it.
    before[0]!.remainingSteps = 3;
    blessAtChurch(state);
    const after = state.persistentBuffs.filter((b) => b.kind === "blessing");
    expect(after).toHaveLength(1);
    expect(after[0]!.remainingSteps).toBeGreaterThan(3);
  });

  it("applyNamandaBlessing grants +armor to the whole party only while blessed", () => {
    const state = makeState();
    const combat = createCombatState(state.party, { front: [], back: [] }, false);
    applyNamandaBlessing(state, combat);
    for (const c of state.party) expect(combat.armorBuffs[c.id]).toBeUndefined();

    blessAtChurch(state);
    const blessedCombat = createCombatState(state.party, { front: [], back: [] }, false);
    applyNamandaBlessing(state, blessedCombat);
    for (const c of state.party) {
      expect(blessedCombat.armorBuffs[c.id]).toBe(NAMANDA_BLESSING_ARMOR_BONUS);
    }
  });

  it("stacks additively with an existing armor buff rather than overwriting it", () => {
    const state = makeState();
    blessAtChurch(state);
    const combat = createCombatState(state.party, { front: [], back: [] }, false);
    const charId = state.party[0]!.id;
    combat.armorBuffs[charId] = 5; // e.g. priest-holy-aura already cast
    applyNamandaBlessing(state, combat);
    expect(combat.armorBuffs[charId]).toBe(5 + NAMANDA_BLESSING_ARMOR_BONUS);
  });
});
