// Game state machine. This module owns the shape of GameState and the
// `mode` transitions; movement/collision live in engine/camera.ts and grid
// data lives in game/dungeon.ts + data/floors.ts.
//
// At Step 2 only the "dungeon" mode is actually rendered. The other modes
// (title, party_creation, town, combat, camp, game_over) are part of the
// GameMode union so future steps can transition into them without widening
// the type.

import type { FloorDef, GameMode, GameState } from "../types";
import { cloneFloor } from "../data/floors";
import { createDefaultParty } from "./party";
import { defaultLoadoutForCharacter } from "./combat";

export type { GameMode, GameState } from "../types";

export function createGameState(floor: FloorDef): GameState {
  const party = createDefaultParty();
  return {
    mode: "town", // start in town; player chooses to enter the dungeon
    floor: cloneFloor(floor),
    player: { x: floor.startX, y: floor.startY, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 99, // allow encounter on first step
    dayCount: 1,
    partyGold: 100, // starting gold for the shop
    inventory: [
      { itemId: "healing-potion", identified: true },
      { itemId: "healing-potion", identified: true },
    ], // a couple of starter potions
    keys: [],
    unlockedDoors: new Set<string>(),
    lootTaken: {},
    eventsTriggered: {},
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

/** Transition to a new game mode. The visual fade (150ms opacity transition)
 *  is handled by main.ts via the canvas CSS `transition: opacity 0.15s` and
 *  the `transitionToMode` helper — state.ts stays pure. */
export function setMode(state: GameState, mode: GameMode): void {
  state.mode = mode;
}
