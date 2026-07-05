/**
 * Tile feature handler — design doc §6.2.
 *
 * Called after each step (forward or backward) to process the tile the player
 * is now standing on. Each feature type has a distinct behavior:
 *
 *   stairs_up   → transition to the floor above (if it exists)
 *   stairs_down → transition to the floor below (if it exists)
 *   teleporter  → instant relocation to the paired tile (possibly another floor)
 *   chute       → forced descent to a lower floor (one-way)
 *   darkness    → set inDarkness flag (renderer limits visibility to 1 tile)
 *   antimagic   → set inAntimagic flag (spell casting fails in combat)
 *   treasure    → give loot to the party, then clear the tile feature
 *
 * The handler returns a FeatureResult describing what happened (for the message
 * bar) and whether a floor transition occurred.
 */

import type { GameState } from "../types";
import { FLOORS } from "../data/floors";
import { ITEMS_BY_ID } from "../data/items";
import { autoSave } from "./save";
import { equipItem, findBestEquipTarget } from "./combat";

export interface FeatureResult {
  message: string;
  /** Whether a floor transition happened (stairs, teleporter, chute). */
  changedFloor: boolean;
  /** Whether the tile feature was consumed (treasure looted). */
  consumed: boolean;
}

/**
 * Process the tile feature at the player's current position.
 * Returns null if the current tile has no feature.
 */
export function handleTileFeature(state: GameState): FeatureResult | null {
  const { floor, player } = state;
  const cell = floor.grid[player.y]?.[player.x];
  if (!cell || !cell.tile) {
    // No feature — clear darkness/antimagic flags
    state.inDarkness = false;
    state.inAntimagic = false;
    return null;
  }

  const feature = cell.tile;
  switch (feature) {
    case "stairs_up":
      return handleStairs(state, true);
    case "stairs_down":
      return handleStairs(state, false);
    case "teleporter":
      return handleTeleporter(state);
    case "chute":
      return handleChute(state);
    case "darkness":
      state.inDarkness = true;
      state.inAntimagic = false;
      return { message: "You are in a darkness zone. Visibility is reduced.", changedFloor: false, consumed: false };
    case "antimagic":
      state.inAntimagic = true;
      state.inDarkness = false;
      return { message: "You are in an anti-magic zone. Spells will fail here.", changedFloor: false, consumed: false };
    case "treasure":
      return handleTreasure(state);
    default:
      return null;
  }
}

/**
 * Handle stairs_up / stairs_down. Transitions to the adjacent floor.
 * Saves the current floor's explored tiles and restores the new floor's.
 */
function handleStairs(state: GameState, goingUp: boolean): FeatureResult {
  const currentId = state.floor.id;
  const targetId = goingUp ? currentId - 1 : currentId + 1;
  const targetFloor = FLOORS.find((f) => f.id === targetId);

  if (!targetFloor) {
    return {
      message: goingUp
        ? "These stairs lead up, but there is nothing above this floor."
        : "These stairs lead down, but there is nothing below this floor.",
      changedFloor: false,
      consumed: false,
    };
  }

  transitionToFloor(state, targetFloor, targetFloor.startX, targetFloor.startY);
  return {
    message: goingUp
      ? `You climb the stairs up to ${targetFloor.name} (Floor ${targetFloor.id}).`
      : `You descend the stairs to ${targetFloor.name} (Floor ${targetFloor.id}).`,
    changedFloor: true,
    consumed: false,
  };
}

/**
 * Handle teleporter. Finds the teleporter link for the current tile and
 * relocates the player. May transition to a different floor.
 */
function handleTeleporter(state: GameState): FeatureResult {
  const { floor, player } = state;
  const link = floor.teleporters?.find((t) => t.x === player.x && t.y === player.y);

  if (!link) {
    return { message: "You feel a strange tingling, but nothing happens.", changedFloor: false, consumed: false };
  }

  const targetFloor = FLOORS.find((f) => f.id === link.toFloorId);
  if (!targetFloor) {
    return { message: "The teleporter hums, but its destination is unknown.", changedFloor: false, consumed: false };
  }

  const changedFloor = link.toFloorId !== floor.id;
  if (changedFloor) {
    transitionToFloor(state, targetFloor, link.toX, link.toY);
  } else {
    state.player.x = link.toX;
    state.player.y = link.toY;
  }

  return {
    message: changedFloor
      ? `A teleporter whisks you away to ${targetFloor.name} (Floor ${targetFloor.id}).`
      : "A teleporter whisks you away to another part of this floor.",
    changedFloor,
    consumed: false,
  };
}

/**
 * Handle chute. Forced descent to a lower floor. One-way — no return chute.
 */
function handleChute(state: GameState): FeatureResult {
  const { floor, player } = state;
  const drop = floor.chuteDrops?.find((c) => c.x === player.x && c.y === player.y);

  if (!drop) {
    // Fallback: go to the next floor down
    const targetId = floor.id + 1;
    const targetFloor = FLOORS.find((f) => f.id === targetId);
    if (!targetFloor) {
      return { message: "The chute is blocked. You can't go down here.", changedFloor: false, consumed: false };
    }
    transitionToFloor(state, targetFloor, targetFloor.startX, targetFloor.startY);
    return {
      message: `You slide down the chute to ${targetFloor.name} (Floor ${targetFloor.id}).`,
      changedFloor: true,
      consumed: false,
    };
  }

  const targetFloor = FLOORS.find((f) => f.id === drop.toFloorId);
  if (!targetFloor) {
    return { message: "The chute is blocked. You can't go down here.", changedFloor: false, consumed: false };
  }

  transitionToFloor(state, targetFloor, drop.toX, drop.toY);
  return {
    message: `You slide down the chute to ${targetFloor.name} (Floor ${targetFloor.id}).`,
    changedFloor: true,
    consumed: false,
  };
}

/**
 * Handle treasure. Gives the party the items defined for this tile, then
 * clears the tile feature so it can't be looted again.
 */
function handleTreasure(state: GameState): FeatureResult {
  const { floor, player } = state;
  const treasureDef = floor.treasures?.find((t) => t.x === player.x && t.y === player.y);

  if (!treasureDef || treasureDef.itemIds.length === 0) {
    // Already looted — clear the feature
    floor.grid[player.y][player.x].tile = undefined;
    return { message: "This treasure has already been looted.", changedFloor: false, consumed: true };
  }

  // Give items to the party
  const itemNames: string[] = [];
  for (const itemId of treasureDef.itemIds) {
    state.inventory.push(itemId);
    const item = ITEMS_BY_ID[itemId];
    itemNames.push(item ? item.name : itemId);

    // Auto-equip found gear to the party member who needs it most.
    if (item && item.type !== "consumable") {
      const targetId = findBestEquipTarget(state.party, state.equipment, item);
      if (targetId) {
        state.equipment[targetId] = equipItem(state.equipment[targetId], item);
      }
    }
  }

  // Clear the treasure
  treasureDef.itemIds = [];
  floor.grid[player.y][player.x].tile = undefined;

  return {
    message: `Treasure! You found: ${itemNames.join(", ")}.`,
    changedFloor: false,
    consumed: true,
  };
}

/**
 * Transition to a new floor. Saves the current floor's explored tiles and
 * restores the new floor's explored tiles (if any).
 */
export function transitionToFloor(state: GameState, newFloor: typeof FLOORS[number], x: number, y: number): void {
  // Save current floor's explored tiles
  const currentId = state.floor.id;
  state.exploredByFloor[currentId] = Array.from(state.explored);

  // Switch to the new floor
  state.floor = newFloor;
  state.player.x = x;
  state.player.y = y;
  state.player.facing = 0;
  state.stepsSinceEncounter = 99; // allow encounter on first step
  state.inDarkness = false;
  state.inAntimagic = false;

  // Restore explored tiles for the new floor (if previously visited)
  const saved = state.exploredByFloor[newFloor.id];
  state.explored = saved ? new Set(saved) : new Set<string>();

  // Auto-save on floor transition (design doc §13).
  autoSave(state);
}

/** Check if the party has a key for a given key ID. */
export function hasKey(state: GameState, keyId: string): boolean {
  return state.keys.includes(keyId);
}

/** Add a key to the party's key inventory. */
export function addKey(state: GameState, keyId: string): void {
  if (!state.keys.includes(keyId)) {
    state.keys.push(keyId);
  }
}
