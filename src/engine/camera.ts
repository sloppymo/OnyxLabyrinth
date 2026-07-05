// Camera: position, facing, 4-directional movement, collision against walls.
// Extracted from game/state.ts during the reconciliation pass. state.ts now
// holds only the state machine; movement lives here.
//
// Collision rule: "wall" and "locked" edges block movement; "open" and "door"
// are passable. Locked doors can be unlocked with a key or Thief lockpick
// (design doc §6.2). The unlock attempt is handled by tryUnlock() below;
// canMove() treats locked doors as impassable until they're unlocked.

import type { GameState } from "../types";
import { DX, DY, edgeInDirection, inBounds } from "../game/dungeon";

/** Direction name for a facing value (0=N, 1=E, 2=S, 3=W). */
const DIR_NAMES = ["n", "e", "s", "w"] as const;

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

/**
 * Attempt to unlock a locked door the player is facing. Returns a status
 * string describing the result. Design doc §6.2: "Require keys (found on
 * floor) or Thief lockpick. No door is permanently impassable."
 *
 * Unlock logic:
 * 1. If the door has already been unlocked (in state.unlockedDoors), it's
 *    already open — this shouldn't normally be called in that case.
 * 2. If the party has the matching key, consume it and open the door.
 * 3. If the party has a Thief, attempt a lockpick (always succeeds in MVP).
 * 4. Otherwise, the door remains locked.
 */
export function tryUnlock(state: GameState): string {
  const { floor, player } = state;
  const dir = player.facing;
  const cell = floor.grid[player.y][player.x];
  const edge = edgeInDirection(cell, dir);
  if (edge !== "locked") return "There is no locked door here.";

  const doorKey = `${floor.id}:${player.x}:${player.y}:${DIR_NAMES[dir]}`;
  if (state.unlockedDoors.has(doorKey)) {
    return "This door is already unlocked.";
  }

  // Find the locked door definition to get the key ID.
  const lockDef = floor.lockedDoors?.find(
    (d) => d.x === player.x && d.y === player.y && d.dir === DIR_NAMES[dir]
  );

  // Check if the party has the key.
  if (lockDef && state.keys.includes(lockDef.keyId)) {
    // Consume the key and unlock the door.
    state.keys = state.keys.filter((k) => k !== lockDef.keyId);
    unlockDoor(state, player.x, player.y, dir);
    return `You unlock the door with the ${lockDef.keyId}. The door swings open.`;
  }

  // Check if the party has a Thief for lockpicking.
  const hasThief = state.party.some(
    (c) => c.class === "Thief" && c.hp > 0 && !c.status.includes("knockedOut")
  );
  if (hasThief) {
    unlockDoor(state, player.x, player.y, dir);
    return "Your Thief picks the lock. The door clicks open.";
  }

  return "The door is locked. You need a key or a Thief to pick it.";
}

/** Unlock a door: set the edge to "door" on both sides and record it. */
function unlockDoor(state: GameState, x: number, y: number, dir: number): void {
  const { floor } = state;
  const dirName = DIR_NAMES[dir];
  const oppositeDir = (dir + 2) % 4;
  const oppositeName = DIR_NAMES[oppositeDir];
  const nx = x + DX[dir];
  const ny = y + DY[dir];

  // Set this side to "door"
  floor.grid[y][x][dirName] = "door";
  // Set the opposite side to "door" too
  if (inBounds(floor.grid, nx, ny)) {
    floor.grid[ny][nx][oppositeName] = "door";
  }

  // Record the unlock so it persists
  state.unlockedDoors.add(`${floor.id}:${x}:${y}:${dirName}`);
  state.unlockedDoors.add(`${floor.id}:${nx}:${ny}:${oppositeName}`);
}
