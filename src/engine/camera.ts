// Camera: position, facing, 4-directional movement, collision against walls.
// Extracted from game/state.ts during the reconciliation pass. state.ts now
// holds only the state machine; movement lives here.
//
// Collision rule: "wall" and "locked" edges block movement; "open" and "door"
// are passable. Locked doors can be unlocked with a key, Thief lockpick, or
// a knock-kind utility spell (design doc §6.2). Unlock resolution lives in
// game/doors.ts; this module re-exports tryUnlock for callers.

import type { GameState } from "../types";
import { DX, DY, edgeInDirection, inBounds } from "../game/dungeon";
export { tryUnlock } from "../game/doors";

/** True if the player can step one tile in the given direction. */
export function canMove(state: GameState, dir: number): boolean {
  const { floor, player } = state;
  if (!inBounds(floor.grid, player.x, player.y)) return false;
  const cell = floor.grid[player.y][player.x];
  const edge = edgeInDirection(cell, dir);
  if (edge === "wall" || edge === "locked") return false;
  const nx = player.x + DX[dir];
  const ny = player.y + DY[dir];
  return inBounds(floor.grid, nx, ny);
}

/** Step forward one tile if the cell ahead is not blocked by a wall. */
export function moveForward(state: GameState): void {
  if (!canMove(state, state.player.facing)) return;
  state.player.x += DX[state.player.facing];
  state.player.y += DY[state.player.facing];
}

/** Step backward one tile (no turning) if the cell behind is not blocked. */
export function moveBackward(state: GameState): void {
  const behindDir = (state.player.facing + 2) % 4;
  if (!canMove(state, behindDir)) return;
  state.player.x += DX[behindDir];
  state.player.y += DY[behindDir];
}

export function turnLeft(state: GameState): void {
  state.player.facing = ((state.player.facing + 3) % 4) as GameState["player"]["facing"];
}

export function turnRight(state: GameState): void {
  state.player.facing = ((state.player.facing + 1) % 4) as GameState["player"]["facing"];
}
