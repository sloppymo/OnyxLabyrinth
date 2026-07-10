/**
 * Save/load system — design doc Section 13.
 *
 * Save anywhere, anytime — including during combat (per §13: "Save anywhere,
 * anytime. Including in dungeons, during exploration, even in combat."). 10
 * slots persisted to localStorage. Auto-save on floor transition.
 *
 * Serialization: GameState is mostly JSON-safe except for `explored` and
 * `lootTaken`/`unlockedDoors` (Sets) which are converted to/from arrays. The
 * floor grid (Cell[][]) and party (Character[]) are plain objects and serialize
 * directly, but the floor itself is cloned from the immutable FLOORS definition
 * on load rather than persisted. Combat
 * state is NOT saved — if the player saves during combat, the mode is
 * converted to "dungeon" and they reload in dungeon mode at their pre-combat
 * position. This satisfies §13's "even in combat" without persisting
 * mid-round combat state.
 */

import type { GameState } from "../types";
import { FLOORS, cloneFloor } from "../data/floors";
import { defaultLoadoutForCharacter } from "./combat";

const STORAGE_PREFIX = "wizardry-clone-save-";
const SLOT_COUNT = 10;

/** Current save format version. Bump when the serialized shape changes. */
const SAVE_VERSION = 4;

/**
 * Migrate a serialized state from an older version to the current one.
 * Each step transforms one version to the next. If the save is newer than
 * the current code, return null (can't downgrade).
 */
function migrate(ser: Record<string, unknown>): SerializedState | null {
  let version = ser.version as number;
  if (version > SAVE_VERSION) return null;
  // No migrations needed yet — version 4 is the first version with this
  // infrastructure. Add `if (version === N) { ...; version = N + 1; }` blocks
  // here as the format evolves.
  if (version !== SAVE_VERSION) return null;
  return ser as unknown as SerializedState;
}
const AUTO_SAVE_KEY = "wizardry-clone-autosave";

export interface SaveSlotMeta {
  slot: number;
  empty: boolean;
  floorId: number;
  floorName: string;
  dayCount: number;
  partySummary: string;
  gold: number;
  savedAt: string; // ISO timestamp
}

interface SerializedState {
  version: number;
  mode: GameState["mode"];
  floorId: number;
  player: GameState["player"];
  party: GameState["party"];
  explored: string[]; // Set -> array
  exploredByFloor: Record<number, string[]>;
  stepsSinceEncounter: number;
  dayCount: number;
  partyGold: number;
  inventory: string[];
  keys: string[];
  unlockedDoors: string[];
  inDarkness: boolean;
  inAntimagic: boolean;
  lastDungeon: GameState["lastDungeon"];
  equipment?: GameState["equipment"];
  // Treasure state: which treasures have been looted, keyed by floor ID.
  // Each value is an array of "x,y" position strings. The floor clone is
  // restored from the immutable FLOORS definition on load.
  lootTaken: Record<number, string[]>;
  savedAt: string;
}

// --- Serialize / deserialize ----------------------------------------------

export function serialize(state: GameState): string {
  // Don't save combat state — reload returns to dungeon mode.
  // Save the current floor's explored tiles into exploredByFloor first.
  const exploredByFloor = { ...state.exploredByFloor };
  exploredByFloor[state.floor.id] = Array.from(state.explored);

  // Sync treasures looted on the current floor into the cross-floor record.
  const lootTaken: Record<number, string[]> = {};
  for (const [floorId, taken] of Object.entries(state.lootTaken)) {
    lootTaken[Number(floorId)] = Array.from(taken);
  }
  if (state.floor.treasures) {
    const current = new Set(lootTaken[state.floor.id] ?? []);
    for (const t of state.floor.treasures) {
      if (t.itemIds.length === 0) {
        current.add(`${t.x},${t.y}`);
      }
    }
    lootTaken[state.floor.id] = Array.from(current);
  }

  const ser: SerializedState = {
    version: SAVE_VERSION,
    mode: state.mode === "combat" ? "dungeon" : state.mode,
    floorId: state.floor.id,
    player: { ...state.player },
    party: state.party.map((c) => ({
      ...c,
      stats: { ...c.stats },
      status: [...c.status],
      knownSpellIds: [...c.knownSpellIds],
    })),
    explored: Array.from(state.explored),
    exploredByFloor,
    stepsSinceEncounter: state.stepsSinceEncounter,
    dayCount: state.dayCount,
    partyGold: state.partyGold,
    inventory: [...state.inventory],
    keys: [...state.keys],
    unlockedDoors: Array.from(state.unlockedDoors),
    inDarkness: state.inDarkness,
    inAntimagic: state.inAntimagic,
    lastDungeon: state.lastDungeon,
    equipment: { ...state.equipment },
    lootTaken,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(ser);
}

export function deserialize(json: string): GameState | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const ser = migrate(raw);
    if (!ser) {
      console.warn(
        `[save] Rejecting save: version ${raw.version} is incompatible ` +
        `with current version ${SAVE_VERSION}.`
      );
      return null;
    }

    const floorDef = FLOORS.find((f) => f.id === ser.floorId);
    if (!floorDef) return null;

    const unlockedDoors = new Set<string>(ser.unlockedDoors ?? []);

    // Rebuild per-floor looted-treasure Sets.
    const lootTaken: Record<number, Set<string>> = {};
    for (const [floorIdStr, positions] of Object.entries(ser.lootTaken ?? {})) {
      lootTaken[Number(floorIdStr)] = new Set(positions);
    }

    // Build a private mutable copy of the floor and restore runtime state.
    const floor = cloneFloor(floorDef);
    for (const doorKey of unlockedDoors) {
      const parts = doorKey.split(":");
      if (parts.length !== 4 || parseInt(parts[0]) !== floor.id) continue;
      const dx = parseInt(parts[1]);
      const dy = parseInt(parts[2]);
      const dir = parts[3] as "n" | "e" | "s" | "w";
      if (floor.grid[dy]?.[dx]) {
        floor.grid[dy][dx][dir] = "door";
      }
    }
    const taken = lootTaken[floor.id];
    if (taken) {
      for (const pos of taken) {
        const [xStr, yStr] = pos.split(",");
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const treasureDef = floor.treasures?.find((t) => t.x === x && t.y === y);
        if (treasureDef) treasureDef.itemIds = [];
        if (floor.grid[y]?.[x]) floor.grid[y][x].tile = undefined;
      }
    }

    return {
      mode: ser.mode,
      floor,
      player: { ...ser.player },
      party: ser.party.map((c) => ({
        ...c,
        stats: { ...c.stats },
        status: [...c.status],
        knownSpellIds: [...c.knownSpellIds],
      })),
      explored: new Set(ser.explored),
      exploredByFloor: ser.exploredByFloor ?? {},
      stepsSinceEncounter: ser.stepsSinceEncounter,
      dayCount: ser.dayCount,
      partyGold: ser.partyGold ?? 0,
      inventory: ser.inventory ? [...ser.inventory] : [],
      keys: ser.keys ? [...ser.keys] : [],
      unlockedDoors,
      lootTaken,
      // Never persisted (the save menu is unreachable while a trap prompt is
      // open; only the beforeunload autosave can capture one). Loading such a
      // save stands the party on the unopened chest with no prompt — stepping
      // off and back onto the tile re-prompts.
      pendingTrap: null,
      inDarkness: ser.inDarkness ?? false,
      inAntimagic: ser.inAntimagic ?? false,
      lastDungeon: ser.lastDungeon ?? null,
      equipment:
        ser.equipment ??
        Object.fromEntries(
          ser.party.map((c) => [c.id, defaultLoadoutForCharacter(c)])
        ),
    };
  } catch {
    return null;
  }
}

// --- Slot metadata (for the save/load menu) --------------------------------

function getSlotMeta(slot: number): SaveSlotMeta {
  const key = `${STORAGE_PREFIX}${slot}`;
  const raw = localStorage.getItem(key);
  if (!raw) {
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, savedAt: "" };
  }
  try {
    const ser = JSON.parse(raw) as SerializedState;
    const floor = FLOORS.find((f) => f.id === ser.floorId);
    const livingCount = ser.party.filter((c) => c.hp > 0).length;
    return {
      slot,
      empty: false,
      floorId: ser.floorId,
      floorName: floor?.name ?? `Floor ${ser.floorId}`,
      dayCount: ser.dayCount,
      partySummary: `${livingCount}/${ser.party.length} alive`,
      gold: ser.partyGold ?? 0,
      savedAt: ser.savedAt,
    };
  } catch {
    return { slot, empty: true, floorId: 0, floorName: "", dayCount: 0, partySummary: "", gold: 0, savedAt: "" };
  }
}

export function getAllSlotMetas(): SaveSlotMeta[] {
  const metas: SaveSlotMeta[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    metas.push(getSlotMeta(i));
  }
  return metas;
}

// --- Public API ------------------------------------------------------------

export function saveToSlot(state: GameState, slot: number): boolean {
  if (slot < 0 || slot >= SLOT_COUNT) return false;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${slot}`, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slot: number): GameState | null {
  if (slot < 0 || slot >= SLOT_COUNT) return null;
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
  if (!raw) return null;
  return deserialize(raw);
}

export function deleteSlot(slot: number): void {
  if (slot < 0 || slot >= SLOT_COUNT) return;
  localStorage.removeItem(`${STORAGE_PREFIX}${slot}`);
}

export function isSlotEmpty(slot: number): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${slot}`) === null;
}

export function autoSave(state: GameState): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, serialize(state));
  } catch {
    // Auto-save failure is non-fatal.
  }
}

export function loadAutoSave(): GameState | null {
  const raw = localStorage.getItem(AUTO_SAVE_KEY);
  if (!raw) return null;
  return deserialize(raw);
}

export { SLOT_COUNT };
