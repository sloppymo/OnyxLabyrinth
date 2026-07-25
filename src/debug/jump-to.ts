// Pure helpers for debug jumpTo party/inventory mutations.
// Floor placement / mode / camera live in main.ts (needs controllers + DOM).

import type { GameState, InventoryEntry } from "../types";
import { levelUpChar } from "../game/leveling";

export interface JumpToOptions {
  floorId: number;
  x: number;
  y: number;
  facing?: 0 | 1 | 2 | 3;
  partyLevel?: number;
  gold?: number;
  keys?: string[];
  items?: InventoryEntry[];
  /** When false, transitionToFloor skips writing the autosave slot. Default true. */
  autosave?: boolean;
  /** Optional encounter-cooldown override (steps since last fight). */
  stepsSinceEncounter?: number;
  /**
   * When true, clear the session unlockedDoors set before transitioning.
   * Needed by playtests that re-test the same lock after an earlier unlock.
   */
  clearUnlockedDoors?: boolean;
}

/**
 * Apply optional party/economy fields from a jumpTo call.
 * Party leveling mirrors Arena's startArena: levelUpChar loops, no XP banking.
 */
export function applyJumpPartyOptions(
  state: GameState,
  opts: Pick<JumpToOptions, "partyLevel" | "gold" | "keys" | "items">
): void {
  if (opts.partyLevel !== undefined) {
    const target = opts.partyLevel;
    state.party = state.party.map((c) => {
      let leveled = c;
      const loadout = state.equipment[c.id];
      for (let i = leveled.level; i < target; i++) {
        leveled = levelUpChar(leveled, loadout);
      }
      return leveled;
    });
  }
  if (opts.gold !== undefined) state.partyGold = opts.gold;
  if (opts.keys !== undefined) state.keys = [...opts.keys];
  if (opts.items !== undefined) state.inventory = opts.items.map((e) => ({ ...e }));
}
