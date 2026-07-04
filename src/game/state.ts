// Game state machine. This module owns the shape of GameState and the
// `mode` transitions; movement/collision live in engine/camera.ts and grid
// data lives in game/dungeon.ts + data/floors.ts.
//
// At Step 2 only the "dungeon" mode is actually rendered. The other modes
// (title, party_creation, town, combat, camp, game_over) are part of the
// GameMode union so future steps can transition into them without widening
// the type.

import type { FloorDef, GameMode, GameState } from "../types";
import { createDefaultParty } from "./party";

export type { GameMode, GameState } from "../types";

export function createGameState(floor: FloorDef): GameState {
  return {
    mode: "town", // start in town; player chooses to enter the dungeon
    floor,
    player: { x: floor.startX, y: floor.startY, facing: 0 },
    party: createDefaultParty(),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 99, // allow encounter on first step
    dayCount: 1,
    partyGold: 100, // starting gold for the shop
    inventory: ["healing-potion", "healing-potion"], // a couple of starter potions
    keys: [],
    unlockedDoors: new Set<string>(),
    inDarkness: false,
    inAntimagic: false,
    lastDungeon: null,
  };
}

/** Transition to a new game mode. No-op for Step 2 beyond dungeon, but the
 *  helper exists so transition callsites in later steps have one place to
 *  hook validation/logging. */
export function setMode(state: GameState, mode: GameMode): void {
  state.mode = mode;
}
