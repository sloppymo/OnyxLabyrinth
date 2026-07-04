/**
 * Save/load system — design doc Section 13.
 *
 * Save anywhere, anytime (except during combat). 10 slots persisted to
 * localStorage. Auto-save on floor transition (hooked when multi-floor is
 * added).
 *
 * Serialization: GameState is mostly JSON-safe except for `explored` (a
 * Set<string>) which is converted to/from an array. The floor grid (Cell[][])
 * and party (Character[]) are plain objects and serialize directly. Combat
 * state is NOT saved — if the player saves during combat, the combat is
 * discarded and they reload in dungeon mode at their pre-combat position.
 */

import type { GameState } from "../types";
import { FLOORS } from "../data/floors";

const STORAGE_PREFIX = "wizardry-clone-save-";
const SLOT_COUNT = 10;
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
  version: 3;
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
  // Treasure state: which treasures have been looted (floorId:x:y -> remaining items).
  // We serialize the floor grid's tile state by storing looted treasure positions.
  lootedTreasures: { floorId: number; x: number; y: number }[];
  savedAt: string;
}

// --- Serialize / deserialize ----------------------------------------------

function serialize(state: GameState): string {
  // Don't save combat state — reload returns to dungeon mode.
  // Save the current floor's explored tiles into exploredByFloor first.
  const exploredByFloor = { ...state.exploredByFloor };
  exploredByFloor[state.floor.id] = Array.from(state.explored);

  // Track which treasures have been looted (tile feature cleared).
  const lootedTreasures: { floorId: number; x: number; y: number }[] = [];
  for (const floor of FLOORS) {
    if (floor.treasures) {
      for (const t of floor.treasures) {
        if (t.itemIds.length === 0) {
          lootedTreasures.push({ floorId: floor.id, x: t.x, y: t.y });
        }
      }
    }
  }

  const ser: SerializedState = {
    version: 3,
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
    lootedTreasures,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(ser);
}

function deserialize(json: string): GameState | null {
  try {
    const ser = JSON.parse(json) as SerializedState;
    if (ser.version !== 3) return null;

    const floor = FLOORS.find((f) => f.id === ser.floorId);
    if (!floor) return null;

    // Restore looted treasures (clear tile features and empty item arrays).
    if (ser.lootedTreasures) {
      for (const looted of ser.lootedTreasures) {
        const f = FLOORS.find((fl) => fl.id === looted.floorId);
        if (!f || !f.treasures) continue;
        const t = f.treasures.find((tr) => tr.x === looted.x && tr.y === looted.y);
        if (t) {
          t.itemIds = [];
          if (f.grid[looted.y]?.[looted.x]) {
            f.grid[looted.y][looted.x].tile = undefined;
          }
        }
      }
    }

    // Restore unlocked doors (set edges to "door" on both sides).
    const unlockedDoors = new Set<string>(ser.unlockedDoors ?? []);
    for (const doorKey of unlockedDoors) {
      const parts = doorKey.split(":");
      if (parts.length !== 4) continue;
      const fid = parseInt(parts[0]);
      const dx = parseInt(parts[1]);
      const dy = parseInt(parts[2]);
      const dir = parts[3] as "n" | "e" | "s" | "w";
      const f = FLOORS.find((fl) => fl.id === fid);
      if (!f || !f.grid[dy]?.[dx]) continue;
      f.grid[dy][dx][dir] = "door";
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
      inDarkness: ser.inDarkness ?? false,
      inAntimagic: ser.inAntimagic ?? false,
      lastDungeon: ser.lastDungeon ?? null,
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
