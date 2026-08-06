// Floor definitions. Each spell/enemy/item/floor must be defined as typed
// data here (or in the sibling data files) — never hardcoded in game logic.
//
// This file hand-carves campaign floors 2–3 — The Cursed Library and The Forge
// of Ashes — linked linearly by stairs. Floor 1 ("The Proving Depths") and
// floors 4–5 ship as editor-exported JSON in src/content/floors/ and merge
// at runtime via src/game/floor-registry.ts.
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

/** Soft combat-density / table override painted as a rectangle on the map. */
export interface EncounterZoneDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Multiplier on the floor's encounterRate (0 = safe, 1 = normal, 2 = hot). */
  rateMul: number;
  /**
   * Optional encounter table floor id (keys `ENCOUNTER_TABLES`).
   * When omitted, uses this floor's own id.
   */
  tableFloorId?: number;
}

/** Rectangular corridor-material override. Later overlapping zones win. */
export interface TilesetZoneDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Texture folder under public/assets/tilesets/<theme>/. */
  theme: string;
}

export interface FloorDef {
  id: number;
  name: string;
  width: number;
  height: number;
  grid: Grid;
  startX: number;
  startY: number;
  // Base encounter rate per step after the 8-step cooldown
  // (~8% / ~10% / ~12% on floors 1–3). Soft pity in game/encounters.ts
  // caps dry spells without changing combat math.
  encounterRate: number;
  /**
   * Texture theme folder under `public/assets/tilesets/<theme>/`
   * (wall.png, floorA.png, floorB.png, ceiling.png). Defaults to `f{id}`.
   */
  tilesetTheme?: string;
  /** Optional per-cell corridor themes. Later overlapping zones win. */
  tilesetZones?: TilesetZoneDef[];
  /**
   * @deprecated Ignored by the encounter roller — the weighted
   * ENCOUNTER_TABLES in data/enemies.ts (keyed by floor id) are the source
   * of truth. Kept only so old JSON exports still parse.
   */
  encounterTable?: string[];
  /** Optional regional encounter rate / table overrides. */
  encounterZones?: EncounterZoneDef[];
  /**
   * Static decor sprites (visual only — no collision / triggers).
   * Drawn in the corridor view using `public/assets/map-sprites/`.
   */
  mapSprites?: { x: number; y: number; spriteId: string }[];
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
  // `climax` locks the treasure in escrow: opening the chest begins combat,
  // and the items are only awarded after the linked combat is won.
  treasures?: { x: number; y: number; itemIds: string[]; trap?: TrapType; climax?: { id: string } }[];
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
  // Grand reading hall (center) — two shelf islands at (6,6) and (8,6) break
  // up the open rectangle into aisles; y=5/7/8/9 stay full-width cross-aisles.
  carveHorizontal(grid, 5, 9, 5);
  carveHorizontal(grid, 5, 9, 7);
  carveHorizontal(grid, 5, 9, 8);
  carveHorizontal(grid, 5, 9, 9);
  carveVertical(grid, 5, 5, 9);
  carveVertical(grid, 7, 5, 9);
  carveVertical(grid, 9, 5, 9);
  carveVertical(grid, 6, 7, 9);
  carveVertical(grid, 8, 7, 9);
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
  // Locked chest in the forbidden wing (holds the furnace-key for floor 3) —
  // sits in darkness, making the wing's best loot genuinely hard to see.
  setTile(grid, 11, 8, "darkness");
  setTile(grid, 12, 8, "treasure");
  // Vestra, an unbound scribe, hides deep in the west stacks.
  setTile(grid, 1, 1, "npc");
  // Faint ward just inside the forbidden wing, foreshadowing the forge's
  // antimagic without stealing floor 3's reveal.
  setTile(grid, 11, 6, "antimagic");

  // Scripted events.
  setTile(grid, 9, 2, "event");
  setTile(grid, 7, 10, "event");
  setTile(grid, 3, 2, "event");
  setTile(grid, 11, 4, "event");
  setTile(grid, 2, 9, "event");
  setTile(grid, 7, 8, "event");
  setTile(grid, 3, 11, "event");
  setTile(grid, 11, 10, "event");
  // A shelf between the two reading-hall islands, otherwise the floor's
  // emptiest room.
  setTile(grid, 7, 6, "event");

  return {
    id: 2,
    name: "The Cursed Library",
    width,
    height,
    grid,
    startX: 2,
    startY: 11,
    encounterRate: 0.10,
    tilesetTheme: "f2",
    // f2b: cold-recolored variant of the shipping f2 tileset (same wood/book
    // material, shifted palette) — see scripts/generate-f2b-tileset.mjs.
    // Marks the forbidden wing as visually distinct, not just narratively
    // locked, before the player ever reaches the alarm/climax chest.
    tilesetZones: [
      { id: "forbidden-wing", x1: 11, y1: 6, x2: 12, y2: 9, theme: "f2b" },
    ],
    lockedDoors: [
      { x: 10, y: 7, dir: "e", keyId: "lexicon-key" },
    ],
    treasures: [
      // A silenced library hates noise — this stunner ward punishes whoever
      // disturbs the cursed blade.
      { x: 12, y: 3, itemIds: ["mace+1", "chain-mail", "cursed-blade", "antidote"], trap: "stunner" },
      // The forbidden wing's real payoff (furnace-key for floor 3). Its
      // alarm draws the stacks' keepers themselves (see the
      // forbidden-wing-hot zone's tableFloorId, ENCOUNTER_TABLES[6]) — the
      // floor's actual climax, not a scarier-named hallway fight. The key is
      // only awarded after the guardian combat is won.
      { x: 12, y: 8, itemIds: ["staff+1", "robe+1", "ring-of-water-walking", "furnace-key"], trap: "alarm", climax: { id: "floor2-guardian" } },
    ],
    npcs: [
      {
        id: "vestra",
        name: "Vestra",
        title: "unbound scribe",
        x: 1,
        y: 1,
        greeting:
          "Shhh! Lower your voice — the stacks listen. I am Vestra. I used to copy what came up from below. I don't copy anymore.",
        returnGreeting: "You again. Quietly, quietly. The shelves have been restless.",
        topics: [
          { key: "library", response: "The library curses noise, not people. Walk softly, open nothing that hums, and never run in the dark corridor." },
          { key: "key", response: "The furnace key sits in the wing they forbade — east of the reading hall. Your lexicon opens that door, if you found it below." },
          { key: "echo", response: "Something warm waits in the forge. People call it a boy. People who go looking don't come back the same." },
          { key: "books", hidden: true, response: "You read the wall, then. It isn't a joke. DO NOT FEED THEM." },
        ],
        trades: [{ giveItemId: "antidote", receiveItemId: "robe+2", once: true }],
        combatEnemyIds: ["lab-assistant", "animated-armor"],
      },
    ],
    events: [
      { x: 9, y: 2, kind: "damage", message: "A bookcase groans and topples into the dark corridor.", power: 6 },
      { x: 7, y: 10, kind: "message", message: "A glyph flares on the threshold. For a moment your throat is too dry to speak — but it passes." },
      { x: 3, y: 2, kind: "message", message: "The shelves whisper. One voice is clear: 'Forbidden wing… key of lexicon… furnace below.'" },
      { x: 11, y: 4, kind: "message", message: "The librarian's journal names the forge below and the key that opens it. You leave the body where it fell." },
      { x: 2, y: 9, kind: "message", message: "Something is daubed on the wall: DO NOT FEED THE BOOKS." },
      { x: 7, y: 8, kind: "reward", message: "A cracked lens catches the candlelight — tucked into a false-bottomed drawer between the stacks.", itemId: "eye-drops" },
      { x: 3, y: 11, kind: "heal", message: "A brazier long left burning warms this corner of the atrium.", power: 5 },
      { x: 11, y: 10, kind: "message", message: "A brass plate, half-melted: MIND THE STEP — TO THE FORGE BELOW." },
      {
        x: 7,
        y: 6,
        kind: "reward",
        message:
          "A shelfcatalogue falls open. Under 'Forbidden Wing — Guardians' it reads: 'Two Gaze Wraiths and three Blood Wraiths hold the furnace key. They strike from the back row and silence the unwary. Take this antidote — the cursed volumes have already touched it.'",
        itemId: "antidote",
      },
    ],
    mapSprites: [
      { x: 2, y: 2, spriteId: "torch" },
      { x: 11, y: 2, spriteId: "crate" },
      { x: 11, y: 11, spriteId: "torch" },
      { x: 7, y: 9, spriteId: "crate" },
    ],
    encounterZones: [
      { id: "library-loop-safe", x1: 1, y1: 4, x2: 4, y2: 12, rateMul: 0.6 },
      { id: "forbidden-wing-hot", x1: 11, y1: 6, x2: 12, y2: 9, rateMul: 1.6, tableFloorId: 6 },
      { id: "scriptorium-hot", x1: 10, y1: 1, x2: 12, y2: 4, rateMul: 1.4 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 3: The Forge of Ashes — final floor.
// Theme: molten cracks, charred stone, iron grates, ember-lit corridors,
// anvil altars. Constructs, fire-casting orcs, and The Dead Boy.
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
  // Central foundry — a furnace-stack block at (8,7)-(8,8) nestles the
  // anvil-altar event at (7,7) into an alcove instead of an empty box.
  carveHorizontal(grid, 6, 9, 6);
  carveHorizontal(grid, 6, 7, 7);
  carveHorizontal(grid, 6, 7, 8);
  carveHorizontal(grid, 6, 9, 9);
  carveVertical(grid, 6, 6, 9);
  carveVertical(grid, 7, 6, 9);
  carveVertical(grid, 9, 6, 9);
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
  // The Grand Forge suppresses magic — The Dead Boy's arena favors steel.
  setTile(grid, 6, 13, "antimagic");
  setTile(grid, 7, 13, "antimagic");
  setTile(grid, 8, 13, "antimagic");
  // Descent to the Null Choir (floor 4), unsealed in the boss chamber's west corner.
  setTile(grid, 5, 14, "stairs_down");
  // Locked chest in the slag vault.
  setTile(grid, 13, 2, "treasure");
  // A second, unguarded chest tucked in the vault's far corner — a small
  // bonus for coming back with the furnace-key.
  setTile(grid, 14, 1, "treasure");
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
  setTile(grid, 1, 9, "event");

  return {
    id: 3,
    name: "The Forge of Ashes",
    width,
    height,
    grid,
    startX: 2,
    startY: 2,
    encounterRate: 0.12,
    tilesetTheme: "f3",
    teleporters: [
      { x: 9, y: 6, toFloorId: 3, toX: 2, toY: 3 },
    ],
    lockedDoors: [
      { x: 11, y: 2, dir: "e", keyId: "furnace-key" },
      { x: 7, y: 11, dir: "s", keyId: "forge-key" },
    ],
    treasures: [
      { x: 13, y: 2, itemIds: ["great-sword+1", "plate-mail", "healing-potion", "healing-potion"], trap: "gas" },
      // Unguarded bonus chest in the same vault — no trap, rewards backtracking.
      { x: 14, y: 1, itemIds: ["greater-healing-potion"] },
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
          "Stay your hand or draw — I care little which. I am Kazeharu. Someone went down into the heat and did not come back. I keep what vigil is left.",
        returnGreeting: "Back among the cinders. The boy still waits, and so do I.",
        topics: [
          { key: "forge", response: "Beyond the locked door south, the dead boy holds court in dead air — no spell will answer you there. Bring steel." },
          { key: "duel", response: "Draw when ready. I will not strike first, and I will not strike last." },
          { key: "master", hidden: true, response: "They were no smith. They came down chasing the deep, same as anyone, and burned trying to reach it. I stayed to guard what they couldn't finish. Put the boy down, and my vigil ends." },
        ],
        combatEnemyIds: ["black-knight"],
      },
    ],
    events: [
      { x: 8, y: 2, kind: "damage", message: "A pressure plate clicks and a flame jet roars from the wall.", power: 8 },
      { x: 13, y: 10, kind: "damage", message: "An iron grate gives way over a magma channel. Heat blisters your skin.", power: 6 },
      { x: 6, y: 11, kind: "message", message: "The statue beside the Grand Forge door twitches as you pass. It will animate when the lock is tried." },
      { x: 7, y: 7, kind: "heal", message: "You rest your weapon on the anvil altar. The forge-forged steel hums, and a little warmth returns.", power: 6 },
      { x: 14, y: 9, kind: "message", message: "A smith is fused to the wall, hammer still raised as if warning you back." },
      { x: 2, y: 6, kind: "message", message: "Hammered into a bronze plate: HE IS STILL WARM." },
      { x: 1, y: 9, kind: "reward", message: "A guard's satchel, forgotten against the wall. Something rattles inside.", itemId: "smelling-salts" },
    ],
    mapSprites: [
      { x: 2, y: 2, spriteId: "torch" },
      { x: 1, y: 14, spriteId: "bones" },
      { x: 3, y: 13, spriteId: "crate" },
      { x: 5, y: 13, spriteId: "bones" },
      { x: 10, y: 13, spriteId: "bones" },
      { x: 12, y: 7, spriteId: "barrel" },
    ],
    encounterZones: [
      { id: "foundry-crossroads-safe", x1: 6, y1: 6, x2: 9, y2: 9, rateMul: 0.7 },
      { id: "chain-hall-hot", x1: 12, y1: 6, x2: 14, y2: 9, rateMul: 1.5 },
      { id: "slag-vault-hot", x1: 12, y1: 1, x2: 14, y2: 3, rateMul: 1.3 },
    ],
  };
}

export const FLOORS: readonly FloorDef[] = [floor2(), floor3()];

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
    tilesetTheme: floor.tilesetTheme,
    tilesetZones: floor.tilesetZones
      ? floor.tilesetZones.map((z) => ({ ...z }))
      : undefined,
    encounterTable: floor.encounterTable ? [...floor.encounterTable] : undefined,
    encounterZones: floor.encounterZones
      ? floor.encounterZones.map((z) => ({ ...z }))
      : undefined,
    mapSprites: floor.mapSprites ? floor.mapSprites.map((s) => ({ ...s })) : undefined,
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
