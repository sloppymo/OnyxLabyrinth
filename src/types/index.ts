// Shared type definitions for the whole game.
// Imported by both /engine and /game modules so neither has to depend on the
// other just to get a type. Runtime constants (DIRS, DX, DY) live in
// game/dungeon.ts; this file is types-only.

import type { FloorDef } from "../data/floors";
import type { Character } from "../game/party";
import type { CombatState, Loadout } from "../game/combat";
export type { FloorDef };
export type { Character };
export type { CombatState };
export type { Loadout };

// --- Edge-based grid model ---------------------------------------------------
// Each cell has four edges (N/E/S/W). An edge is open, a wall, or a door.
// This is more expressive than a per-tile WALL/FLOOR enum and is what the
// wireframe renderer consumes; tile-feature layers (stairs, teleporters, ...)
// ride on top via the optional `tile` field below.

export type EdgeType = "open" | "wall" | "door" | "locked";

export interface Cell {
  n: EdgeType;
  e: EdgeType;
  s: EdgeType;
  w: EdgeType;
  // Optional tile feature layered on top of the edge grid. Unused at Step 2
  // but locked in here so Step 11 (teleporters, chutes, stairs, darkness,
  // treasure rooms) doesn't force a second refactor of every grid consumer.
  tile?: TileFeature;
}

export type TileFeature =
  | "stairs_up"
  | "stairs_down"
  | "teleporter"
  | "chute"
  | "darkness"
  | "treasure"
  | "antimagic"
  | "water"
  | "npc"
  | "event";

export type Grid = Cell[][]; // grid[y][x]

// --- Treasure chest traps ------------------------------------------------------
// Wizardry-style trapped chests. Stepping onto a trapped treasure tile does
// not loot it; instead a modal prompt (Inspect / Disarm / Open / Leave) is
// offered while `GameState.pendingTrap` is set. See game/features.ts.

export type TrapType = "gas" | "teleporter" | "alarm" | "stunner" | "poison";

// --- Inventory ------------------------------------------------------------------
// One carried item instance. `identified` is per-instance: chest equipment
// drops unidentified and shows a generic name until appraised in town.

export interface InventoryEntry {
  itemId: string;
  identified: boolean;
}

// --- Persistent spell buffs ---------------------------------------------------
// Party-wide dungeon buffs from utility spells (Light light, Levitate
// levitation). Ticked down once per dungeon step; cleared by camping.
// See game/persistent-spells.ts.

export interface PersistentBuff {
  kind: "light" | "levitation";
  remainingSteps: number;
}

export interface PendingTrap {
  x: number;
  y: number;
  trapType: TrapType;
  /** Whether the party has Inspected the chest (reveals the trap type). */
  inspected: boolean;
}

// --- Facing / player ---------------------------------------------------------

export type Facing = 0 | 1 | 2 | 3; // 0=N, 1=E, 2=S, 3=W

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
}

// --- Game state machine ------------------------------------------------------
// Only one mode is active at a time. title / party_creation / game_over are
// not driven by anything yet at Step 2 but are part of the union so future
// steps don't have to widen it.

export type GameMode =
  | "title"
  | "party_creation"
  | "town"
  | "dungeon"
  | "combat"
  | "camp"
  | "game_over"
  | "arena";

export interface GameState {
  mode: GameMode;
  floor: FloorDef;
  player: PlayerState;
  // The party of 6 characters. Created at game start (Step 3) and persisted
  // across combat/camp/dungeon transitions. Combat mutates a clone inside
  // `combat`; post-combat, the result is applied back here.
  party: Character[];
  // Active combat state. Present only when mode === "combat".
  combat?: CombatState;
  // Explored-tile tracking for the auto-map (Step 12). Stored as "x,y" keys.
  // NOTE: Set is not JSON-serializable directly; save.ts (Step 10) must
  // serialize this as Array.from(explored) and rebuild on load.
  explored: Set<string>;
  // Per-floor explored tracking. When the player changes floors via stairs or
  // chutes, the explored set for the new floor is restored from here. Keyed
  // by floor ID. The current floor's explored set is always also in `explored`.
  exploredByFloor: Record<number, string[]>;
  // Steps since the last encounter. Design doc §6.3: no more than one
  // encounter per 8 steps. Incremented on each move; reset on encounter.
  stepsSinceEncounter: number;
  // In-dungeon day counter, advanced by 1 each time the party camps.
  // Flavor only (design doc §5.1); no mechanical penalty.
  dayCount: number;
  // Party gold. Earned from combat, spent at the town shop.
  // Design doc §8.1: "Carried gold. All gold earned in dungeon is carried
  // by the party." No banking in the MVP.
  partyGold: number;
  // Party inventory. Duplicates allowed. Shop purchases arrive identified;
  // chest weapons/armor arrive unidentified ("Unknown Weapon") until
  // appraised at the shop. Cursed gear reveals itself by clamping on.
  inventory: InventoryEntry[];
  // Keys collected by the party. Each key ID corresponds to a locked door.
  // When the party attempts to pass a locked door, the key is consumed.
  // Design doc §6.2: "Require keys (found on floor) or Thief lockpick."
  keys: string[];
  // Set of "floorId:x:y:dir" strings for locked doors that have been unlocked.
  // Prevents re-locking when the player walks back through.
  unlockedDoors: Set<string>;
  // Which treasures have been looted, keyed by floor ID. Each value is a Set of
  // "x,y" position strings. This keeps the global FLOORS definitions immutable.
  lootTaken: Record<number, Set<string>>;
  // One-time floor events already triggered, keyed by floor ID. Each value is a
  // Set of "x,y" position strings. Keeps the global FLOORS definitions immutable.
  eventsTriggered: Record<number, Set<string>>;
  // Active party-wide spell buffs (light, levitation). Ticked per step,
  // cleared by camping. Serialized in saves.
  persistentBuffs: PersistentBuff[];
  // Per-character swim skill (0-100), learned by doing: stepping through
  // water tiles raises it. Keyed by character id; absent means 0.
  swimSkill: Record<string, number>;
  // --- NPC state (all keyed by NPC id; see game/npc.ts) ---
  // NPCs already greeted (first-time vs. return greeting).
  talkedToNPCs: string[];
  // Disposition 0-100 (absent = 50). Gifts raise it; theft and fleeing
  // a fight lower it.
  npcDisposition: Record<string, number>;
  // NPCs killed by the party. Their tiles are cleared on floor load.
  killedNPCs: string[];
  // One-time barters already consumed ("npcId:giveId>receiveId").
  npcTradesDone: string[];
  // Set while the party stands on a trapped, unopened chest. While non-null,
  // dungeon movement is blocked and the Inspect/Disarm/Open/Leave keys are
  // live. Never persisted: a save can't be taken while the prompt is open.
  pendingTrap: PendingTrap | null;
  // Whether the current tile is a darkness zone (affects render depth).
  inDarkness: boolean;
  // Whether the current tile is an anti-magic zone (affects spell casting).
  inAntimagic: boolean;
  // Last dungeon position before returning to town, so re-entering the dungeon
  // resumes where the player left off instead of resetting to Floor 1.
  lastDungeon: { floorId: number; x: number; y: number; facing: Facing } | null;
  // Per-character equipped gear. Keyed by character id. Initialized from the
  // default loadout at party creation and updated by shop purchases / treasure
  // finds / post-combat persistence.
  equipment: Record<string, Loadout>;
}
