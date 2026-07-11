/**
 * Unit tests for tile-feature handling — focused on the trapped-chest
 * interaction (Inspect / Disarm / Open / Leave) added with the trap system.
 * Uses a tiny synthetic floor so trap behavior is isolated from campaign data.
 */
import { describe, it, expect } from "vitest";
import {
  handleTileFeature,
  inspectChest,
  disarmChest,
  openChest,
  leaveChest,
  swimChance,
} from "./features";
import { buildSolidGrid, carveRoom, setTile } from "./dungeon";
import { createDefaultParty } from "./party";
import {
  defaultLoadoutForCharacter,
  equipItem,
  forceEquip,
  reconcileInventoryAfterCombat,
} from "./combat";
import { ITEMS_BY_ID } from "../data/items";
import type { FloorDef } from "../data/floors";
import type { GameState, TrapType } from "../types";

/** Deterministic RNG from a fixed sequence (cycles). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeFloor(trap?: TrapType): FloorDef {
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setTile(grid, 2, 2, "treasure");
  return {
    id: 1,
    name: "Test Vault",
    width: 6,
    height: 6,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    encounterTable: [],
    treasures: [{ x: 2, y: 2, itemIds: ["healing-potion", "test-key"], trap }],
  };
}

function makeState(trap?: TrapType): GameState {
  const party = createDefaultParty();
  return {
    mode: "dungeon",
    floor: makeFloor(trap),
    player: { x: 2, y: 2, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 0,
    dayCount: 1,
    partyGold: 0,
    inventory: [],
    keys: [],
    unlockedDoors: new Set<string>(),
    lootTaken: {},
    pendingTrap: null,
    persistentBuffs: [],
    swimSkill: {},
    talkedToNPCs: [],
    npcDisposition: {},
    killedNPCs: [],
    npcTradesDone: [],
    inDarkness: false,
    inAntimagic: false,
    lastDungeon: null,
  };
}

describe("handleTreasure with traps", () => {
  it("loots an untrapped chest immediately", () => {
    const state = makeState();
    const result = handleTileFeature(state);
    expect(result?.consumed).toBe(true);
    expect(state.inventory.map((e) => e.itemId)).toContain("healing-potion");
    expect(state.keys).toContain("test-key");
    expect(state.pendingTrap).toBeNull();
    expect(state.floor.grid[2][2].tile).toBeUndefined();
  });

  it("sets pendingTrap for a trapped chest and does not loot", () => {
    const state = makeState("gas");
    const result = handleTileFeature(state);
    expect(result?.consumed).toBe(false);
    expect(result?.message).toMatch(/\[I\]nspect/);
    expect(state.pendingTrap).toEqual({ x: 2, y: 2, trapType: "gas", inspected: false });
    expect(state.inventory).toHaveLength(0);
    expect(state.floor.grid[2][2].tile).toBe("treasure");
  });
});

describe("inspectChest", () => {
  it("a living Thief identifies the trap type", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    const msg = inspectChest(state);
    expect(msg).toMatch(/Gas Bomb/);
    expect(state.pendingTrap?.inspected).toBe(true);
  });

  it("without a living Thief the hint is vague", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    for (const c of state.party) {
      if (c.class === "Thief") c.hp = 0;
    }
    const msg = inspectChest(state);
    expect(msg).not.toMatch(/Gas Bomb/);
    expect(msg).toMatch(/dangerous/);
  });
});

describe("disarmChest", () => {
  it("success disarms and loots", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    const result = disarmChest(state, seqRng([0])); // roll 0 < any chance
    expect(result.opened).toBe(true);
    expect(result.message).toMatch(/disarms/);
    expect(result.message).toMatch(/Treasure!/);
    expect(state.pendingTrap).toBeNull();
    expect(state.inventory.map((e) => e.itemId)).toContain("healing-potion");
    // No trap effect fired.
    for (const c of state.party) expect(c.hp).toBe(c.maxHp);
  });

  it("failure can fumble and fire the trap, still awarding loot", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    // Rolls: disarm fails (0.99), fumble check fires (0.0), then 2d6 = 2.
    const result = disarmChest(state, seqRng([0.99, 0, 0, 0]));
    expect(result.opened).toBe(true);
    expect(result.message).toMatch(/fumbles/);
    expect(state.pendingTrap).toBeNull();
    expect(state.inventory.map((e) => e.itemId)).toContain("healing-potion");
    for (const c of state.party) expect(c.hp).toBe(c.maxHp - 2);
  });

  it("failure can also do nothing, allowing a retry", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    // Rolls: disarm fails (0.99), fumble check safe (0.99).
    const result = disarmChest(state, seqRng([0.99, 0.99]));
    expect(result.opened).toBe(false);
    expect(state.pendingTrap).not.toBeNull();
    expect(state.inventory).toHaveLength(0);
    // Retry succeeds.
    const retry = disarmChest(state, seqRng([0]));
    expect(retry.opened).toBe(true);
  });
});

describe("openChest trap effects", () => {
  it("gas damages every living member but never below 1 HP", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    state.party[0].hp = 2; // would die to 2d6 without the floor
    // Rolls: 2d6 max (0.99, 0.99) = 12 damage.
    const result = openChest(state, seqRng([0.99]));
    expect(result.opened).toBe(true);
    expect(state.party[0].hp).toBe(1);
    expect(state.party[1].hp).toBe(state.party[1].maxHp - 12);
    expect(state.inventory.map((e) => e.itemId)).toContain("healing-potion");
  });

  it("poison inflicts poison on all living members", () => {
    const state = makeState("poison");
    handleTileFeature(state);
    const result = openChest(state, seqRng([0.5]));
    expect(result.opened).toBe(true);
    for (const c of state.party) expect(c.status).toContain("poison");
  });

  it("stunner paralyzes 1-3 members", () => {
    const state = makeState("stunner");
    handleTileFeature(state);
    // count roll 0.99 → 1 + floor(0.99*3) = 3 victims.
    openChest(state, seqRng([0.99, 0.1, 0.1, 0.1]));
    const stunned = state.party.filter((c) => c.status.includes("paralysis"));
    expect(stunned.length).toBe(3);
  });

  it("teleporter relocates the party to a carved tile and flags it", () => {
    const state = makeState("teleporter");
    handleTileFeature(state);
    const result = openChest(state, seqRng([0.5]));
    expect(result.relocated).toBe(true);
    const { x, y } = state.player;
    expect(x === 2 && y === 2).toBe(false);
    const cell = state.floor.grid[y][x];
    const carved = [cell.n, cell.e, cell.s, cell.w].some((e) => e !== "wall");
    expect(carved).toBe(true);
    // Loot was still taken as the spell fired.
    expect(state.inventory.map((e) => e.itemId)).toContain("healing-potion");
  });

  it("alarm sets the alarm flag for main.ts to force an encounter", () => {
    const state = makeState("alarm");
    handleTileFeature(state);
    const result = openChest(state, seqRng([0.5]));
    expect(result.alarm).toBe(true);
    expect(result.opened).toBe(true);
  });

  it("records the loot in lootTaken after a triggered open", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    openChest(state, seqRng([0.5]));
    expect(state.lootTaken[1]?.has("2,2")).toBe(true);
    expect(state.floor.grid[2][2].tile).toBeUndefined();
  });
});

describe("leaveChest", () => {
  it("clears the prompt, keeps the chest, and re-prompts on re-entry", () => {
    const state = makeState("gas");
    handleTileFeature(state);
    const msg = leaveChest(state);
    expect(msg).toMatch(/untouched/);
    expect(state.pendingTrap).toBeNull();
    expect(state.floor.grid[2][2].tile).toBe("treasure");
    // Step off and back on.
    state.player.x = 1;
    handleTileFeature(state);
    state.player.x = 2;
    const again = handleTileFeature(state);
    expect(again?.consumed).toBe(false);
    expect(state.pendingTrap).not.toBeNull();
  });

  it("chest actions are no-ops without an active prompt", () => {
    const state = makeState("gas");
    expect(inspectChest(state)).toBe("");
    expect(disarmChest(state).opened).toBe(false);
    expect(openChest(state).message).toBe("");
    expect(leaveChest(state)).toBe("");
  });
});

// --- Identification & cursed gear --------------------------------------------

describe("identification and cursed gear", () => {
  it("chest weapons/armor drop unidentified; consumables identified", () => {
    const state = makeState();
    state.floor.treasures = [
      { x: 2, y: 2, itemIds: ["short-sword+1", "healing-potion"] },
    ];
    const result = handleTileFeature(state);
    expect(result?.message).toContain("Unknown Weapon");
    expect(result?.message).toContain("Healing Potion");
    const sword = state.inventory.find((e) => e.itemId === "short-sword+1");
    const potion = state.inventory.find((e) => e.itemId === "healing-potion");
    expect(sword?.identified).toBe(false);
    expect(potion?.identified).toBe(true);
  });

  it("cursed gear clamps onto a party member and reveals itself", () => {
    const state = makeState();
    state.floor.treasures = [{ x: 2, y: 2, itemIds: ["cursed-blade"] }];
    const result = handleTileFeature(state);
    expect(result?.message).toMatch(/CURSED/);
    const entry = state.inventory.find((e) => e.itemId === "cursed-blade");
    expect(entry?.identified).toBe(true); // the curse reveals the item
    const stuck = state.party.some(
      (c) => state.equipment[c.id]?.weapon?.id === "cursed-blade"
    );
    expect(stuck).toBe(true);
  });

  it("equipItem never replaces cursed gear; forceEquip respects the lock", () => {
    const state = makeState();
    state.floor.treasures = [{ x: 2, y: 2, itemIds: ["cursed-blade"] }];
    handleTileFeature(state);
    const victim = state.party.find(
      (c) => state.equipment[c.id]?.weapon?.id === "cursed-blade"
    )!;
    // A strictly better sword must NOT displace the cursed blade.
    const better = ITEMS_BY_ID["short-sword+2"] ?? ITEMS_BY_ID["short-sword+1"];
    const after = equipItem(state.equipment[victim.id], better);
    expect(after.weapon?.id).toBe("cursed-blade");
    expect(forceEquip(state.equipment[victim.id], better)).toBeNull();
  });

  it("reconcileInventoryAfterCombat drops consumed items, keeps flags", () => {
    const entries = [
      { itemId: "healing-potion", identified: true },
      { itemId: "healing-potion", identified: true },
      { itemId: "short-sword+1", identified: false },
    ];
    // Combat consumed one potion.
    const counts = { "healing-potion": 1, "short-sword+1": 1 };
    const out = reconcileInventoryAfterCombat(entries, counts);
    expect(out).toHaveLength(2);
    expect(out.filter((e) => e.itemId === "healing-potion")).toHaveLength(1);
    expect(out.find((e) => e.itemId === "short-sword+1")?.identified).toBe(false);
  });
});

// --- Water ------------------------------------------------------------------

/** State standing on a water tile at (3,3) with the given depth/effect. */
function makeWaterState(
  depth: 1 | 2 | 3 | 4,
  effect?: { kind: "heal"; power: number } | { kind: "damage"; power: number } | { kind: "cure"; status: "poison" }
): GameState {
  const state = makeState();
  setTile(state.floor.grid, 3, 3, "water");
  state.floor.waters = [{ x: 3, y: 3, depth, effect }];
  state.player = { x: 3, y: 3, facing: 0 };
  return state;
}

describe("swimChance", () => {
  it("scales with skill, drops with depth, and clamps to 5-95%", () => {
    expect(swimChance(0, 1)).toBeCloseTo(0.6);
    expect(swimChance(0, 4)).toBeCloseTo(0.05);
    expect(swimChance(100, 1)).toBeCloseTo(0.95);
    expect(swimChance(40, 2)).toBeCloseTo(0.6);
  });
});

describe("water tiles", () => {
  it("successful swimmers take no damage and gain skill", () => {
    const state = makeWaterState(1);
    const result = handleTileFeature(state, seqRng([0, 0.5])); // roll 0 < chance, gain 1+1
    expect(result?.message).toMatch(/wade|swim/);
    expect(result?.consumed).toBe(false);
    for (const c of state.party) {
      expect(c.hp).toBe(c.maxHp);
      expect(state.swimSkill[c.id]).toBeGreaterThan(0);
    }
    expect(state.floor.grid[3][3].tile).toBe("water"); // never consumed
  });

  it("failed swimmers take depth-scaled damage, floored at 1 HP", () => {
    const state = makeWaterState(4);
    state.party[0].hp = 2;
    // Every roll 0.99: all fail (chance 5%), dmg 4×3=12, skill gain floor(0.99*2)=1.
    const result = handleTileFeature(state, seqRng([0.99]));
    expect(result?.message).toMatch(/struggle/);
    expect(state.party[0].hp).toBe(1); // floored
    expect(state.party[1].hp).toBe(state.party[1].maxHp - 12);
    expect(state.swimSkill[state.party[1].id]).toBe(1); // learning from failure
  });

  it("levitation crosses without a check", () => {
    const state = makeWaterState(4);
    state.persistentBuffs.push({ kind: "levitation", remainingSteps: 10 });
    const result = handleTileFeature(state, seqRng([0.99]));
    expect(result?.message).toMatch(/drift above/);
    for (const c of state.party) expect(c.hp).toBe(c.maxHp);
  });

  it("the Ring of Water Walking crosses without a check", () => {
    const state = makeWaterState(4);
    state.inventory.push({ itemId: "ring-of-water-walking", identified: true });
    const result = handleTileFeature(state, seqRng([0.99]));
    expect(result?.message).toMatch(/ring bears you/);
    for (const c of state.party) expect(c.hp).toBe(c.maxHp);
  });

  it("heal pools restore HP; damage pools burn (floored at 1)", () => {
    const heal = makeWaterState(1, { kind: "heal", power: 8 });
    heal.party[0].hp = 5;
    handleTileFeature(heal, seqRng([0]));
    expect(heal.party[0].hp).toBe(13);

    const burn = makeWaterState(1, { kind: "damage", power: 6 });
    burn.party[0].hp = 3;
    handleTileFeature(burn, seqRng([0]));
    expect(burn.party[0].hp).toBe(1);
    expect(burn.party[1].hp).toBe(burn.party[1].maxHp - 6);
  });

  it("cure pools wash away the status", () => {
    const state = makeWaterState(1, { kind: "cure", status: "poison" });
    for (const c of state.party) c.status.push("poison");
    handleTileFeature(state, seqRng([0]));
    for (const c of state.party) expect(c.status).not.toContain("poison");
  });
});
