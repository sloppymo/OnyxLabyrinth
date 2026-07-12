// Floor definitions. Each spell/enemy/item/floor must be defined as typed
// data here (or in the sibling data files) — never hardcoded in game logic.
//
// The campaign is three hand-carved floors — The Flooded Crypt, The Cursed
// Library, and The Forge of Ashes — linked linearly by stairs. Floor IDs must
// stay contiguous (1, 2, 3): handleStairs() in game/features.ts computes the
// target floor as currentId ± 1.
//
// Grid convention: grid[y][x]. Each cell has 4 edges (n/e/s/w). "open" =
// passable, "wall" = blocked, "door" = passable + visual marker, "locked" =
// blocked until unlocked with a key or lockpick.
//
// All floors use buildSolidGrid() as the starting point (every edge is wall),
// then corridors and rooms are carved out. Always carve symmetrically: the
// carve helpers open both sides of an edge, and doors/locks are set with
// setEdge on both adjacent cells.
//
// Key chain across the campaign:
//   crypt-key   (floor 1, open chest)  → floor 1 reliquary lock
//   lexicon-key (floor 1, reliquary)   → floor 2 forbidden wing lock
//   furnace-key (floor 2, forbidden)   → floor 3 slag vault lock
//   forge-key   (floor 3, open chest)  → floor 3 boss chamber lock
//
// "// EVENT:" comments are design annotations for a future scripted-event /
// trap system — the engine does not run them yet.

import type { Grid, TrapType } from "../types";
import {
  buildSolidGrid,
  carveRoom,
  carveHorizontal,
  carveVertical,
  setTile,
  setEdge,
} from "../game/dungeon";

export interface FloorDef {
  id: number;
  name: string;
  width: number;
  height: number;
  grid: Grid;
  startX: number;
  startY: number;
  // Base encounter rate per step (~5% on Floor 1, scaling to ~8% on Floor 3).
  encounterRate: number;
  // Enemy IDs that can appear on this floor. Unused by the encounter roller —
  // the weighted tables in data/enemies.ts are the source of truth.
  encounterTable?: string[];
  // Teleporter links: each entry maps a tile (x,y) on this floor to a
  // destination (floorId, x, y). When the player steps on a teleporter tile,
  // they are instantly relocated.
  teleporters?: TeleporterLink[];
  // Chute destinations: tiles with the "chute" feature drop the player to
  // the given floor at the given position.
  chuteDrops?: { x: number; y: number; toFloorId: number; toX: number; toY: number }[];
  // Locked door definitions: each entry specifies a tile and direction where
  // a locked door exists, and which key ID unlocks it.
  lockedDoors?: { x: number; y: number; dir: "n" | "e" | "s" | "w"; keyId: string }[];
  // Treasure room definitions: tiles with the "treasure" feature and what
  // item IDs they contain. Once looted, the tile feature is cleared.
  // `trap` marks the chest as trapped (Inspect/Disarm/Open/Leave prompt on
  // step; see game/features.ts). Untrapped chests loot immediately.
  treasures?: { x: number; y: number; itemIds: string[]; trap?: TrapType }[];
  // Water tiles (feature "water"). Depth 1-4 sets the swim difficulty; an
  // optional effect fires on everyone who enters (blessed/cursed pools).
  // Tiles are never consumed. Levitation or the Ring of Water Walking
  // crosses without a check.
  waters?: WaterDef[];
  // Dungeon NPCs (feature "npc"). Killed NPCs' tiles are cleared on floor
  // load via GameState.killedNPCs.
  npcs?: NPCDef[];
  // Scripted floor events (feature "event"): one-time or repeatable message/
  // damage/heal/reward triggers. See game/features.ts handleEvent.
  events?: EventDef[];
}

export interface EventDef {
  x: number;
  y: number;
  kind: "message" | "damage" | "heal" | "reward";
  message: string;
  /** For "damage"/"heal" kinds: HP applied to every living party member. */
  power?: number;
  /** For "reward" kind: item id added to the party's inventory. */
  itemId?: string;
  /** Whether the event fires only once (default true). */
  once?: boolean;
}

export interface WaterDef {
  x: number;
  y: number;
  /** 1 = ankle-deep (easy) … 4 = a drowning pool (hard). */
  depth: 1 | 2 | 3 | 4;
  effect?: WaterEffect;
}

export type WaterEffect =
  | { kind: "heal"; power: number }
  | { kind: "damage"; power: number }
  | { kind: "cure"; status: "poison" };

// --- Dungeon NPCs ------------------------------------------------------------
// Friendly (until provoked) characters on "npc" tiles. Interaction is modal
// (engine/npc-ui.ts): Talk (topic menu + typed keywords), Barter, Give,
// Steal, Attack, Leave. NPCs are ADDITIVE content — they hint, trade, and
// flavor, but never gate campaign progression.

export interface NPCTopicDef {
  /** Keyword that triggers this topic (also the menu label when visible). */
  key: string;
  response: string;
  /** Hidden topics never show in the menu — only typed keywords reach them. */
  hidden?: boolean;
}

export interface NPCTradeDef {
  giveItemId: string;
  receiveItemId: string;
  /** One-time trades are recorded in GameState.npcTradesDone. */
  once?: boolean;
}

export interface NPCDef {
  id: string;
  name: string;
  /** Short epithet shown under the name ("masterless swordsman"). */
  title: string;
  x: number;
  y: number;
  greeting: string;
  /** Greeting on later visits. */
  returnGreeting: string;
  topics: NPCTopicDef[];
  trades?: NPCTradeDef[];
  /** Giving this item raises disposition sharply (and may earn the reward). */
  wantsItemId?: string;
  /** Handed over once when disposition reaches 80. */
  rewardItemId?: string;
  /** Enemy formation if the party attacks (or botches a theft). */
  combatEnemyIds: string[];
}

export interface TeleporterLink {
  x: number;
  y: number;
  toFloorId: number;
  toX: number;
  toY: number;
}

// ---------------------------------------------------------------------------
// Floor 1: The Flooded Crypt — tutorial floor.
// Theme: green stagnant water seeping through cracked stone, mossy walls,
// broken sarcophagi. Slimes and shambling dead; a rare acid puddle in the
// floodwater.
//
// Shape: entry hall at the south, a processional corridor north to the
// sanctum (stairs down), a west crypt row (crypt-key), and a flooded east
// gallery leading to a locked reliquary (lexicon-key for floor 2).
// ---------------------------------------------------------------------------

function floor1(): FloorDef {
  const width = 12;
  const height = 12;
  const grid = buildSolidGrid(width, height);

  // Entry hall (south) — the party wakes here; stairs from floor 2 also land here.
  carveRoom(grid, 4, 8, 7, 10);
  // Processional corridor north from the entry hall to the sanctum.
  carveVertical(grid, 5, 2, 8);
  // North sanctum (stairs down).
  carveRoom(grid, 3, 1, 7, 2);
  // West crypt row (open treasure: crypt-key).
  carveRoom(grid, 1, 4, 3, 6);
  carveHorizontal(grid, 1, 5, 5);
  // Flooded east gallery.
  carveRoom(grid, 7, 4, 10, 6);
  carveHorizontal(grid, 5, 9, 5);
  // Reliquary (locked, south of the gallery).
  carveRoom(grid, 9, 8, 10, 9);
  carveVertical(grid, 9, 6, 8);

  // Sanctum entrance door.
  setEdge(grid, 5, 3, "n", "door");
  setEdge(grid, 5, 2, "s", "door");
  // Gallery entrance door.
  setEdge(grid, 6, 5, "e", "door");
  setEdge(grid, 7, 5, "w", "door");
  // Locked reliquary door (crypt-key, found in the west crypt).
  setEdge(grid, 9, 7, "s", "locked");
  setEdge(grid, 9, 8, "n", "locked");

  // Tile features.
  // Stairs down in the sanctum.
  setTile(grid, 5, 1, "stairs_down");
  // Black floodwater in the east gallery — visibility drops to one tile.
  setTile(grid, 8, 5, "darkness");
  setTile(grid, 9, 5, "darkness");
  // Floodwater. The gallery threshold is ankle-deep (teaches swimming on the
  // reliquary route); the west crypt hides a blessed pool; the gallery's
  // south-east corner drops into a drowning pool.
  setTile(grid, 7, 5, "water");
  setTile(grid, 2, 4, "water");
  setTile(grid, 10, 6, "water");
  // Open chest in the west crypt (holds the crypt-key).
  setTile(grid, 2, 5, "treasure");
  // Trapped chest in the west crypt — teaches trap inspection/disarming early.
  setTile(grid, 3, 5, "treasure");
  // Locked reliquary chest (holds the lexicon-key for floor 2).
  setTile(grid, 10, 9, "treasure");
  // Maro, a stranded swordsman, shelters in the crypt's south-east corner.
  setTile(grid, 3, 6, "npc");

  // Scripted events.
  setTile(grid, 5, 7, "event");
  setTile(grid, 5, 4, "event");
  setTile(grid, 1, 4, "event");
  setTile(grid, 4, 1, "event");

  return {
    id: 1,
    name: "The Flooded Crypt",
    width,
    height,
    grid,
    startX: 5,
    startY: 9,
    encounterRate: 0.05,
    lockedDoors: [
      { x: 9, y: 7, dir: "s", keyId: "crypt-key" },
    ],
    treasures: [
      // The first chest of the game is untrapped — it teaches looting safely.
      { x: 2, y: 5, itemIds: ["healing-potion", "healing-potion", "crypt-key"] },
      // A poison-needle chest just steps away: the antidote inside softens the lesson.
      { x: 3, y: 5, itemIds: ["antidote", "healing-potion"], trap: "poison" },
      { x: 10, y: 9, itemIds: ["short-sword+1", "leather", "healing-potion", "lexicon-key"], trap: "gas" },
    ],
    waters: [
      { x: 7, y: 5, depth: 1 },
      { x: 2, y: 4, depth: 2, effect: { kind: "heal", power: 8 } },
      { x: 10, y: 6, depth: 4, effect: { kind: "damage", power: 6 } },
    ],
    npcs: [
      {
        id: "maro",
        name: "Maro",
        title: "stranded swordsman",
        x: 3,
        y: 6,
        greeting:
          "A living face at last! I am Maro, once of the eastern guard. The water took my company; only I crawled out.",
        returnGreeting: "Still breathing, friend? Good. The crypt has taken enough of us.",
        topics: [
          { key: "key", response: "The monks buried their key with their dead. Look among the sarcophagi, west of the great corridor." },
          { key: "water", response: "The black pools drown the careless. The shallow ford by the gallery door is the only safe crossing — or so the dead believed." },
          { key: "reliquary", response: "South of the flooded gallery, behind the locked door. What the monks sealed there, they meant to keep sealed." },
          { key: "echo", hidden: true, response: "…so the whispers reach even this floor? Pray you never meet the thing that makes them." },
        ],
        wantsItemId: "healing-potion",
        rewardItemId: "long-sword+1",
        combatEnemyIds: ["samurai"],
      },
    ],
    events: [
      { x: 5, y: 7, kind: "message", message: "Above the arch, words are scrawled in something black: THE WATER REMEMBERS." },
      { x: 5, y: 4, kind: "damage", message: "A flagstone gives way and darts whistle through the corridor.", power: 4 },
      { x: 1, y: 4, kind: "reward", message: "A corpse clutches a rusted holy symbol. The dead have no use for it now.", itemId: "holy-symbol" },
      { x: 4, y: 1, kind: "heal", message: "You kneel at the defiled altar. Something hungry listens — but it gives a little back.", power: 5 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 2: The Cursed Library — mid floor.
// Theme: shelves of forbidden books, snuffed candles, floating pages, arcane
// runes on the floors. Armored dead and cursed scribes who heal their allies.
//
// Shape: a full loop — atrium (stairs up) → west stacks → north corridor →
// grand reading hall → back down to the atrium. Branches: NE scriptorium
// (open treasure), locked forbidden wing east of the hall (furnace-key for
// floor 3), and a SE stair room down to the forge.
// ---------------------------------------------------------------------------

function floor2(): FloorDef {
  const width = 14;
  const height = 14;
  const grid = buildSolidGrid(width, height);

  // SW entrance atrium (stairs up; arrivals from floors 1 and 3 land here).
  carveRoom(grid, 1, 10, 4, 12);
  // West gallery corridor up to the stacks.
  carveVertical(grid, 2, 4, 10);
  // West stacks.
  carveRoom(grid, 1, 1, 4, 4);
  // North corridor east along the top shelves to the scriptorium.
  carveHorizontal(grid, 4, 12, 2);
  // NE scriptorium.
  carveRoom(grid, 10, 1, 12, 4);
  // Grand reading hall (center).
  carveRoom(grid, 5, 5, 9, 9);
  carveVertical(grid, 6, 2, 5);
  // Forbidden wing (locked, east of the hall).
  carveRoom(grid, 11, 6, 12, 9);
  carveHorizontal(grid, 9, 11, 7);
  // South passage from the hall to the SE stair room.
  carveVertical(grid, 7, 9, 11);
  carveHorizontal(grid, 7, 10, 11);
  carveRoom(grid, 10, 10, 12, 12);
  // Atrium-to-hall link (closes the central loop).
  carveHorizontal(grid, 4, 7, 10);

  // Reading hall north entrance door.
  setEdge(grid, 6, 4, "s", "door");
  setEdge(grid, 6, 5, "n", "door");
  // SE stair room door.
  setEdge(grid, 9, 11, "e", "door");
  setEdge(grid, 10, 11, "w", "door");
  // Locked forbidden wing door (lexicon-key, from floor 1's reliquary).
  setEdge(grid, 10, 7, "e", "locked");
  setEdge(grid, 11, 7, "w", "locked");

  // Tile features.
  // Stairs up in the atrium (the arrival tile itself, Wizardry-style).
  setTile(grid, 2, 11, "stairs_up");
  // Stairs down in the SE stair room.
  setTile(grid, 11, 12, "stairs_down");
  // Snuffed-candle stretch of the north corridor.
  setTile(grid, 7, 2, "darkness");
  setTile(grid, 8, 2, "darkness");
  // Open chest in the scriptorium.
  setTile(grid, 12, 3, "treasure");
  // Locked chest in the forbidden wing (holds the furnace-key for floor 3).
  setTile(grid, 12, 8, "treasure");
  // Vestra, an unbound scribe, hides deep in the west stacks.
  setTile(grid, 1, 1, "npc");

  // Scripted events.
  setTile(grid, 8, 2, "event");
  setTile(grid, 7, 10, "event");
  setTile(grid, 3, 2, "event");
  setTile(grid, 11, 4, "event");
  setTile(grid, 2, 9, "event");

  return {
    id: 2,
    name: "The Cursed Library",
    width,
    height,
    grid,
    startX: 2,
    startY: 11,
    encounterRate: 0.07,
    lockedDoors: [
      { x: 10, y: 7, dir: "e", keyId: "lexicon-key" },
    ],
    treasures: [
      // A silenced library hates noise — the alarm summons the stacks' keepers.
      // The blade among the loot is cursed: it clamps onto whoever takes it.
      { x: 12, y: 3, itemIds: ["mace+1", "chain-mail", "cursed-blade", "antidote"], trap: "alarm" },
      { x: 12, y: 8, itemIds: ["staff+1", "robe+1", "ring-of-water-walking", "furnace-key"], trap: "stunner" },
    ],
    npcs: [
      {
        id: "vestra",
        name: "Vestra",
        title: "unbound scribe",
        x: 1,
        y: 1,
        greeting:
          "Shhh! Lower your voice — the stacks listen. I am Vestra. I copied for the Headmaster, before. I don't copy anymore.",
        returnGreeting: "You again. Quietly, quietly. The shelves have been restless.",
        topics: [
          { key: "library", response: "The library curses noise, not people. Walk softly, open nothing that hums, and never run in the dark corridor." },
          { key: "key", response: "The furnace key sits in the wing they forbade — east of the reading hall. Your lexicon opens that door, if you found it below." },
          { key: "echo", response: "The Headmaster did not die. He diffused. What waits in the forge below wears his face badly." },
          { key: "books", hidden: true, response: "You read the wall, then. It isn't a joke. DO NOT FEED THEM." },
        ],
        trades: [{ giveItemId: "antidote", receiveItemId: "robe+2", once: true }],
        combatEnemyIds: ["lab-assistant", "animated-armor"],
      },
    ],
    events: [
      { x: 8, y: 2, kind: "damage", message: "A bookcase groans and topples into the dark corridor.", power: 6 },
      { x: 7, y: 10, kind: "message", message: "A glyph flares on the threshold. For a moment your throat is too dry to speak — but it passes." },
      { x: 3, y: 2, kind: "message", message: "The shelves whisper. One voice is clear: 'Forbidden wing… key of lexicon… furnace below.'" },
      { x: 11, y: 4, kind: "message", message: "The librarian's journal names the forge below and the key that opens it. You leave the body where it fell." },
      { x: 2, y: 9, kind: "message", message: "Something is daubed on the wall: DO NOT FEED THE BOOKS." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 3: The Forge of Ashes — final floor.
// Theme: molten cracks, charred stone, iron grates, ember-lit corridors,
// anvil altars. Constructs, fire-casting orcs, and the Headmaster's Echo.
//
// Shape: two interlocking loops around the central foundry, plus a locked
// slag vault (furnace-key from floor 2), an ashpit holding the forge-key,
// and the locked Grand Forge boss chamber on the south wall. A waygate in
// the foundry teleports back to the entrance as a shortcut.
// ---------------------------------------------------------------------------

function floor3(): FloorDef {
  const width = 16;
  const height = 16;
  const grid = buildSolidGrid(width, height);

  // NW antechamber (stairs up; arrival from floor 2).
  carveRoom(grid, 1, 1, 3, 3);
  // North passage east to the ember gallery.
  carveHorizontal(grid, 3, 5, 2);
  carveRoom(grid, 5, 1, 10, 3);
  // Continue east to the locked slag vault.
  carveHorizontal(grid, 10, 12, 2);
  carveRoom(grid, 12, 1, 14, 3);
  // West descent from the antechamber to the cinder hall.
  carveVertical(grid, 2, 3, 7);
  carveRoom(grid, 1, 7, 3, 11);
  // Central foundry.
  carveRoom(grid, 6, 6, 9, 9);
  carveVertical(grid, 7, 3, 6);   // gallery → foundry (north loop)
  carveHorizontal(grid, 3, 6, 8); // cinder hall → foundry (west loop)
  // East to the chain hall.
  carveHorizontal(grid, 9, 12, 8);
  carveRoom(grid, 12, 6, 14, 9);
  // South ember corridor closing the outer loop.
  carveVertical(grid, 13, 9, 11);
  carveHorizontal(grid, 2, 13, 11);
  // Ashpit (SW, holds the forge-key).
  carveVertical(grid, 2, 11, 13);
  carveRoom(grid, 1, 13, 3, 14);
  // Grand Forge boss chamber (south, locked).
  carveRoom(grid, 5, 12, 10, 14);
  carveVertical(grid, 7, 11, 12);

  // Foundry north entrance door.
  setEdge(grid, 7, 5, "s", "door");
  setEdge(grid, 7, 6, "n", "door");
  // Locked slag vault door (furnace-key, from floor 2's forbidden wing).
  setEdge(grid, 11, 2, "e", "locked");
  setEdge(grid, 12, 2, "w", "locked");
  // Locked Grand Forge door (forge-key, from the ashpit on this floor).
  setEdge(grid, 7, 11, "s", "locked");
  setEdge(grid, 7, 12, "n", "locked");

  // Tile features.
  // Stairs up in the antechamber (the arrival tile itself).
  setTile(grid, 2, 2, "stairs_up");
  // Waygate in the foundry — one-way shortcut back to the antechamber.
  setTile(grid, 9, 6, "teleporter");
  // Smoke-choked corners of the chain hall.
  setTile(grid, 13, 7, "darkness");
  setTile(grid, 13, 8, "darkness");
  // The Grand Forge suppresses magic — the Echo's arena favors steel.
  setTile(grid, 6, 13, "antimagic");
  setTile(grid, 7, 13, "antimagic");
  setTile(grid, 8, 13, "antimagic");
  // Locked chest in the slag vault.
  setTile(grid, 13, 2, "treasure");
  // Chest in the chain hall (past the smoke).
  setTile(grid, 14, 8, "treasure");
  // Open chest in the ashpit (holds the forge-key).
  setTile(grid, 2, 14, "treasure");
  // Trophy chest in the Grand Forge.
  setTile(grid, 9, 13, "treasure");
  // Kazeharu, a masterless duelist, keeps vigil in the cinder hall.
  setTile(grid, 3, 9, "npc");

  // Scripted events.
  setTile(grid, 8, 2, "event");
  setTile(grid, 13, 10, "event");
  setTile(grid, 6, 11, "event");
  setTile(grid, 7, 7, "event");
  setTile(grid, 14, 9, "event");
  setTile(grid, 2, 6, "event");

  return {
    id: 3,
    name: "The Forge of Ashes",
    width,
    height,
    grid,
    startX: 2,
    startY: 2,
    encounterRate: 0.08,
    teleporters: [
      { x: 9, y: 6, toFloorId: 3, toX: 2, toY: 3 },
    ],
    lockedDoors: [
      { x: 11, y: 2, dir: "e", keyId: "furnace-key" },
      { x: 7, y: 11, dir: "s", keyId: "forge-key" },
    ],
    treasures: [
      { x: 13, y: 2, itemIds: ["great-sword+1", "plate-mail", "healing-potion", "healing-potion"], trap: "gas" },
      // The chain hall's chest flings openers across the forge — and the
      // helm inside whispers (cursed).
      { x: 14, y: 8, itemIds: ["halberd+1", "shield+1", "cursed-helm", "healing-potion"], trap: "teleporter" },
      { x: 2, y: 14, itemIds: ["forge-key", "healing-potion", "antidote"], trap: "poison" },
      { x: 9, y: 13, itemIds: ["great-sword+2", "plate-mail+2", "healing-potion", "healing-potion"], trap: "stunner" },
    ],
    npcs: [
      {
        id: "kazeharu",
        name: "Kazeharu",
        title: "masterless duelist",
        x: 3,
        y: 9,
        greeting:
          "Stay your hand or draw — I care little which. I am Kazeharu. My master fed this forge. I keep what vigil is left.",
        returnGreeting: "Back among the cinders. The Echo still waits, and so do I.",
        topics: [
          { key: "forge", response: "Beyond the locked door south, the Echo holds court in dead air — no spell will answer you there. Bring steel." },
          { key: "duel", response: "Draw when ready. I will not strike first, and I will not strike last." },
          { key: "master", hidden: true, response: "My master built the Grand Forge and burned in it. I stayed to guard his failure. Kill the Echo, and my vigil ends." },
        ],
        combatEnemyIds: ["ronin"],
      },
    ],
    events: [
      { x: 8, y: 2, kind: "damage", message: "A pressure plate clicks and a flame jet roars from the wall.", power: 8 },
      { x: 13, y: 10, kind: "damage", message: "An iron grate gives way over a magma channel. Heat blisters your skin.", power: 6 },
      { x: 6, y: 11, kind: "message", message: "The statue beside the Grand Forge door twitches as you pass. It will animate when the lock is tried." },
      { x: 7, y: 7, kind: "heal", message: "You rest your weapon on the anvil altar. The forge-forged steel hums, and a little warmth returns.", power: 6 },
      { x: 14, y: 9, kind: "message", message: "A smith is fused to the wall, hammer still raised as if warning you back." },
      { x: 2, y: 6, kind: "message", message: "Hammered into a bronze plate: THE ECHO WEARS HIS FACE." },
    ],
  };
}

export const FLOORS: readonly FloorDef[] = [floor1(), floor2(), floor3()];

/** Deep-clone a floor definition so each game session gets its own mutable copy.
 *  This keeps the module-global FLOORS array as a read-only source of truth. */
export function cloneFloor(floor: FloorDef): FloorDef {
  return {
    id: floor.id,
    name: floor.name,
    width: floor.width,
    height: floor.height,
    grid: floor.grid.map((row) =>
      row.map((cell) => ({
        n: cell.n,
        e: cell.e,
        s: cell.s,
        w: cell.w,
        tile: cell.tile,
      }))
    ),
    startX: floor.startX,
    startY: floor.startY,
    encounterRate: floor.encounterRate,
    encounterTable: floor.encounterTable ? [...floor.encounterTable] : undefined,
    teleporters: floor.teleporters ? floor.teleporters.map((t) => ({ ...t })) : undefined,
    chuteDrops: floor.chuteDrops ? floor.chuteDrops.map((c) => ({ ...c })) : undefined,
    lockedDoors: floor.lockedDoors ? floor.lockedDoors.map((d) => ({ ...d })) : undefined,
    treasures: floor.treasures
      ? floor.treasures.map((t) => ({ x: t.x, y: t.y, itemIds: [...t.itemIds], trap: t.trap }))
      : undefined,
    waters: floor.waters
      ? floor.waters.map((w) => ({ ...w, effect: w.effect ? { ...w.effect } : undefined }))
      : undefined,
    // NPC defs are static content (never mutated at runtime); killed NPCs
    // are tracked in GameState and their tiles cleared on floor load.
    npcs: floor.npcs ? [...floor.npcs] : undefined,
    // Event defs are static content; fired-once tracking lives in
    // GameState.eventsTriggered, not on the def itself.
    events: floor.events ? [...floor.events] : undefined,
  };
}
