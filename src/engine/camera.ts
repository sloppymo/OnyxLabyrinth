// Camera: position, facing, 4-directional movement, collision against walls.
// Extracted from game/state.ts during the reconciliation pass. state.ts now
// holds only the state machine; movement lives here.
//
// Collision rule: "wall", "locked", and "barred" edges block movement;
// "open" and "door" are passable. Locked doors can be unlocked with a key,
// Thief lockpick, or a knock-kind utility spell (design doc §6.2). Barred
// gates can only be opened from one specified side and cannot be picked or
// bypassed by spells. Raft-channel water is impassable via normal movement.
//
// All passability decisions go through game/traversal.ts resolveTraversal().
// This module re-exports tryUnlock for callers and provides thin movement
// helpers that delegate to the traversal resolver.

import type { GameState } from "../types";
import { DX, DY } from "../game/dungeon";
import { resolveTraversal, type Direction } from "../game/traversal";
export { tryUnlock } from "../game/doors";
export { openBarredGate, resolveTraversal } from "../game/traversal";

/** True if the player can step one tile in the given direction (ordinary
 *  movement only — does not account for raft routes or barred gates, which
 *  need the full resolveTraversal result). Used by code that only needs a
 *  boolean passability check (e.g. camp validation). For movement intent,
 *  use resolveTraversal() instead. */
export function canMove(state: GameState, dir: number): boolean {
  const result = resolveTraversal(state, dir as Direction);
  return result.kind === "step";
}

/** Step forward one tile if the cell ahead is passable. Returns the
 *  traversal result so the caller can handle raft/barred-gate cases.
 *  Does NOT execute raft routes or open gates — that's the caller's job. */
export function tryStepForward(state: GameState) {
  return resolveTraversal(state, state.player.facing as Direction);
}

/** Step backward one tile (no turning) if the cell behind is passable.
 *  Returns the traversal result for the backward direction. */
export function tryStepBackward(state: GameState) {
  const behindDir = ((state.player.facing + 2) % 4) as Direction;
  return resolveTraversal(state, behindDir);
}

/** Execute an ordinary step (caller has confirmed the result is "step"). */
export function executeStep(state: GameState, dir: number): void {
  state.player.x += DX[dir];
  state.player.y += DY[dir];
}

/** Step forward one tile if the cell ahead is not blocked by a wall.
 *  Legacy convenience — prefer tryStepForward + executeStep for new code. */
export function moveForward(state: GameState): void {
  const result = resolveTraversal(state, state.player.facing as Direction);
  if (result.kind === "step") {
    state.player.x = result.x;
    state.player.y = result.y;
  }
}

/** Step backward one tile (no turning) if the cell behind is not blocked. */
export function moveBackward(state: GameState): void {
  const behindDir = (state.player.facing + 2) % 4;
  const result = resolveTraversal(state, behindDir as Direction);
  if (result.kind === "step") {
    state.player.x = result.x;
    state.player.y = result.y;
  }
}

export function turnLeft(state: GameState): void {
  state.player.facing = ((state.player.facing + 3) % 4) as GameState["player"]["facing"];
}

export function turnRight(state: GameState): void {
  state.player.facing = ((state.player.facing + 1) % 4) as GameState["player"]["facing"];
}
