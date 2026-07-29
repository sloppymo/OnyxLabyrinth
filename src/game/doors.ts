/**
 * Locked-door unlock paths: matching key, living Thief pick, or a knock-kind
 * utility spell (Mage Knock / Priest Unseal). Shared by dungeon U-key
 * (camera.tryUnlock) and the grimoire cast path (persistent-spells).
 */

import type { GameState } from "../types";
import type { Character } from "./party";
import type { SpellDef } from "../data/spells";
import { ALL_SPELLS } from "../data/spells";
import { DX, DY, edgeInDirection, inBounds } from "./dungeon";

const DIR_NAMES = ["n", "e", "s", "w"] as const;

export interface FacingLock {
  x: number;
  y: number;
  dir: number;
  dirName: (typeof DIR_NAMES)[number];
  doorKey: string;
  keyId?: string;
}

/** Inspect the edge the party faces; null if it is not a locked door. */
export function facingLock(state: GameState): FacingLock | null {
  const { floor, player } = state;
  const dir = player.facing;
  if (!inBounds(floor.grid, player.x, player.y)) return null;
  const edge = edgeInDirection(floor.grid[player.y][player.x], dir);
  if (edge !== "locked") return null;

  const dirName = DIR_NAMES[dir];
  const doorKey = `${floor.id}:${player.x}:${player.y}:${dirName}`;
  const lockDef = floor.lockedDoors?.find(
    (d) => d.x === player.x && d.y === player.y && d.dir === dirName
  );
  return {
    x: player.x,
    y: player.y,
    dir,
    dirName,
    doorKey,
    keyId: lockDef?.keyId,
  };
}

/** Open a locked edge on both sides and record it in unlockedDoors. */
export function unlockDoorAt(state: GameState, x: number, y: number, dir: number): void {
  const { floor } = state;
  const dirName = DIR_NAMES[dir];
  const oppositeDir = (dir + 2) % 4;
  const oppositeName = DIR_NAMES[oppositeDir];
  const nx = x + DX[dir];
  const ny = y + DY[dir];

  floor.grid[y][x][dirName] = "door";
  if (inBounds(floor.grid, nx, ny)) {
    floor.grid[ny][nx][oppositeName] = "door";
  }

  state.unlockedDoors.add(`${floor.id}:${x}:${y}:${dirName}`);
  state.unlockedDoors.add(`${floor.id}:${nx}:${ny}:${oppositeName}`);
}

/** Living caster who knows an affordable knock-kind utility spell. */
export function findKnockCaster(
  state: GameState
): { caster: Character; spell: SpellDef } | null {
  for (const c of state.party) {
    if (c.hp <= 0 || c.status.includes("knockedOut")) continue;
    for (const id of c.knownSpellIds) {
      const spell = ALL_SPELLS.find((s) => s.id === id);
      if (spell?.effect.kind === "knock" && c.sp >= spell.spCost) {
        return { caster: c, spell };
      }
    }
  }
  return null;
}

/**
 * Attempt to unlock the door the party faces.
 * Order: already open → key → Thief pick → knock spell → fail.
 */
export function tryUnlock(state: GameState): string {
  const lock = facingLock(state);
  if (!lock) return "There is no locked door here.";

  if (state.unlockedDoors.has(lock.doorKey)) {
    return "This door is already unlocked.";
  }

  if (lock.keyId && state.keys.includes(lock.keyId)) {
    state.keys = state.keys.filter((k) => k !== lock.keyId);
    unlockDoorAt(state, lock.x, lock.y, lock.dir);
    return `You unlock the door with the ${lock.keyId}. The door swings open.`;
  }

  const hasThief = state.party.some(
    (c) => c.class === "Thief" && c.hp > 0 && !c.status.includes("knockedOut")
  );
  if (hasThief) {
    unlockDoorAt(state, lock.x, lock.y, lock.dir);
    return "Your Thief picks the lock. The door clicks open.";
  }

  if (!state.inAntimagic) {
    const knock = findKnockCaster(state);
    if (knock) {
      knock.caster.sp -= knock.spell.spCost;
      unlockDoorAt(state, lock.x, lock.y, lock.dir);
      return `${knock.caster.name} casts ${knock.spell.name} — the lock yields.`;
    }
  }

  return "The door is locked. You need a key, a Thief, or a Knock / Unseal spell.";
}
