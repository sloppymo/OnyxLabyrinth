// Floor definitions. Each spell/enemy/item/floor must be defined as typed
// data here (or in the sibling data files) — never hardcoded in game logic.
//
// Five floors are defined, each with hand-carved corridors, rooms, and tile
// features (stairs, teleporters, chutes, darkness, treasure, anti-magic,
// locked doors) per design doc §6.2.
//
// Grid convention: grid[y][x]. Each cell has 4 edges (n/e/s/w). "open" =
// passable, "wall" = blocked, "door" = passable + visual marker, "locked" =
// blocked until unlocked with a key or lockpick.
//
// All floors use buildSolidGrid() as the starting point (every edge is wall),
// then corridors and rooms are carved out. This produces proper dungeon
// corridors with walls between rooms, unlike the open-room approach used
// earlier for the prototype.

import type { Grid } from "../types";
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
  // Base encounter rate per step (design doc §6.3: ~5% on Floor 1, scaling
  // to ~8% on Floor 5). Used by the encounter roller in Step 4.
  encounterRate: number;
  // Enemy IDs that can appear on this floor. Populated in Step 5.
  encounterTable?: string[];
  // Teleporter links: each entry maps a tile (x,y) on this floor to a
  // destination (floorId, x, y). When the player steps on a teleporter tile,
  // they are instantly relocated. Design doc §6.2.
  teleporters?: TeleporterLink[];
  // Chute destinations: tiles with the "chute" feature drop the player to
  // the given floor at the given position. Design doc §6.2.
  chuteDrops?: { x: number; y: number; toFloorId: number; toX: number; toY: number }[];
  // Locked door definitions: each entry specifies a tile and direction where
  // a locked door exists, and which key ID unlocks it.
  lockedDoors?: { x: number; y: number; dir: "n" | "e" | "s" | "w"; keyId: string }[];
  // Treasure room definitions: tiles with the "treasure" feature and what
  // item IDs they contain. Once looted, the tile feature is cleared.
  treasures?: { x: number; y: number; itemIds: string[] }[];
}

export interface TeleporterLink {
  x: number;
  y: number;
  toFloorId: number;
  toX: number;
  toY: number;
}

// ---------------------------------------------------------------------------
// Floor 1: Entry Halls — tutorial floor, simple layout, minimal features.
// Theme: Clean corridors, intact architecture. Training Dummies, Giant Rats.
// ---------------------------------------------------------------------------

function floor1(): FloorDef {
  const width = 12;
  const height = 12;
  const grid = buildSolidGrid(width, height);

  // Start room (center area)
  carveRoom(grid, 5, 5, 7, 7);
  // Corridor north from start room
  carveVertical(grid, 6, 1, 5);
  // Corridor south from start room
  carveVertical(grid, 6, 7, 11);
  // Corridor east from start room
  carveHorizontal(grid, 7, 11, 6);
  // Corridor west from start room
  carveHorizontal(grid, 0, 5, 6);

  // North room
  carveRoom(grid, 4, 1, 8, 3);
  // South room (has stairs down)
  carveRoom(grid, 4, 9, 8, 11);
  // East room (treasure room)
  carveRoom(grid, 9, 4, 11, 8);
  // West room (darkness zone)
  carveRoom(grid, 0, 4, 3, 8);

  // Connect corridors to rooms
  // North corridor connects to north room
  grid[3][6].n = "open"; grid[4][6].s = "open";
  // South corridor connects to south room
  grid[8][6].s = "open"; grid[9][6].n = "open";
  // East corridor connects to east room
  grid[6][8].e = "open"; grid[6][9].w = "open";
  // West corridor connects to west room
  grid[6][4].w = "open"; grid[6][3].e = "open";

  // Door on the east room entrance (visual variety)
  grid[6][8].e = "door";
  grid[6][9].w = "door";

  // Tile features
  // Stairs down in the south room
  setTile(grid, 6, 10, "stairs_down");
  // Treasure in the east room
  setTile(grid, 10, 6, "treasure");
  // Darkness in the west room
  setTile(grid, 1, 6, "darkness");
  setTile(grid, 2, 6, "darkness");

  return {
    id: 1,
    name: "Entry Halls",
    width,
    height,
    grid,
    startX: 6,
    startY: 6,
    encounterRate: 0.05,
    treasures: [
      { x: 10, y: 6, itemIds: ["healing-potion", "healing-potion", "short-sword+1", "archive-key"] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 2: The Archives — shelves, scroll racks, reading rooms.
// Theme: First real fights. Introduction to back-row enemies.
// Features: locked door, teleporter, treasure, stairs up + down.
// ---------------------------------------------------------------------------

function floor2(): FloorDef {
  const width = 14;
  const height = 14;
  const grid = buildSolidGrid(width, height);

  // Entrance area (stairs up from floor 1 land here)
  carveRoom(grid, 1, 1, 4, 4);
  // Main corridor going east
  carveHorizontal(grid, 1, 12, 2);
  // Branch north at x=6
  carveVertical(grid, 6, 1, 2);
  carveRoom(grid, 4, 1, 8, 1); // small north alcove
  // Branch south at x=8
  carveVertical(grid, 8, 2, 10);
  // South room (large reading room)
  carveRoom(grid, 5, 8, 11, 12);
  // Far east room (locked treasure room)
  carveRoom(grid, 11, 4, 13, 7);
  // Connect east corridor to far east room
  carveVertical(grid, 12, 2, 4);

  // Connect branches
  grid[1][6].s = "open"; grid[2][6].n = "open"; // north branch to alcove
  grid[2][8].s = "open"; grid[3][8].n = "open"; // south branch start
  grid[4][12].s = "open"; grid[5][12].n = "open"; // east room connection

  // Locked door on the treasure room entrance (between (12,4) and (12,5))
  setEdge(grid, 12, 4, "s", "locked");
  setEdge(grid, 12, 5, "n", "locked");

  // Door markers on the south reading room entrance (between (8,7) and (8,8))
  setEdge(grid, 8, 7, "s", "door");
  setEdge(grid, 8, 8, "n", "door");

  // Tile features
  // Stairs up in entrance room
  setTile(grid, 2, 2, "stairs_up");
  // Stairs down in the south reading room
  setTile(grid, 8, 11, "stairs_down");
  // Teleporter in the north alcove → links to floor 3
  setTile(grid, 6, 1, "teleporter");
  // Treasure in the locked east room
  setTile(grid, 12, 5, "treasure");
  // Darkness in the far west of the main corridor
  setTile(grid, 1, 2, "darkness");

  return {
    id: 2,
    name: "The Archives",
    width,
    height,
    grid,
    startX: 2,
    startY: 2,
    encounterRate: 0.06,
    teleporters: [
      { x: 6, y: 1, toFloorId: 3, toX: 7, toY: 7 },
    ],
    lockedDoors: [
      { x: 12, y: 4, dir: "s", keyId: "archive-key" },
    ],
    treasures: [
      { x: 12, y: 5, itemIds: ["mace+1", "leather+1", "healing-potion", "healing-potion", "lab-key"] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 3: The Laboratories — alchemical horrors, enemy healers.
// Theme: First floor where enemy Priests appear. Tactical targeting.
// Features: anti-magic zone, chute, teleporter back, locked door, treasure.
// ---------------------------------------------------------------------------

function floor3(): FloorDef {
  const width = 14;
  const height = 14;
  const grid = buildSolidGrid(width, height);

  // Entrance room (teleporter from floor 2 lands here, stairs up too)
  carveRoom(grid, 5, 5, 8, 8);
  // Corridor north
  carveVertical(grid, 6, 1, 5);
  // Corridor east
  carveHorizontal(grid, 8, 12, 6);
  // Corridor south
  carveVertical(grid, 7, 8, 12);
  // Corridor west
  carveHorizontal(grid, 1, 5, 7);

  // North room (anti-magic zone)
  carveRoom(grid, 3, 1, 9, 3);
  // East room (treasure)
  carveRoom(grid, 11, 4, 13, 8);
  // South room (chute down to floor 4)
  carveRoom(grid, 4, 10, 10, 12);
  // West room (locked, has stairs down)
  carveRoom(grid, 0, 9, 3, 12);
  // Vertical connector from west corridor (y=7) to west room (y=9)
  carveVertical(grid, 3, 7, 9);

  // Connect corridors to rooms
  grid[3][6].n = "open"; grid[4][6].s = "open"; // north (redundant with carveVertical, harmless)
  // Connect east corridor (ends at x=10) to east room (starts at x=11)
  grid[6][10].e = "open"; grid[6][11].w = "open";
  grid[8][7].s = "open"; grid[9][7].n = "open"; // south

  // Locked door on west room entrance (between (3,8) and (3,9))
  setEdge(grid, 3, 8, "s", "locked");
  setEdge(grid, 3, 9, "n", "locked");

  // Door on east room entrance (between (10,6) and (11,6))
  setEdge(grid, 10, 6, "e", "door");
  setEdge(grid, 11, 6, "w", "door");

  // Tile features
  // Stairs up in entrance room
  setTile(grid, 7, 7, "stairs_up");
  // Anti-magic in the north room
  setTile(grid, 5, 2, "antimagic");
  setTile(grid, 6, 2, "antimagic");
  setTile(grid, 7, 2, "antimagic");
  // Treasure in east room
  setTile(grid, 12, 6, "treasure");
  // Chute in south room → drops to floor 4
  setTile(grid, 7, 11, "chute");
  // Stairs down in the locked west room
  setTile(grid, 1, 11, "stairs_down");
  // Teleporter back to floor 2 (in the north room)
  setTile(grid, 8, 2, "teleporter");

  return {
    id: 3,
    name: "The Laboratories",
    width,
    height,
    grid,
    startX: 7,
    startY: 7,
    encounterRate: 0.07,
    teleporters: [
      { x: 8, y: 2, toFloorId: 2, toX: 6, toY: 1 },
    ],
    chuteDrops: [
      { x: 7, y: 11, toFloorId: 4, toX: 7, toY: 2 },
    ],
    lockedDoors: [
      { x: 3, y: 8, dir: "s", keyId: "lab-key" },
    ],
    treasures: [
      { x: 12, y: 6, itemIds: ["long-sword+1", "chain-mail+1", "healing-potion", "antidote", "summon-key"] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 4: The Summoning Chambers — constructs and casters.
// Theme: Mages matter here — fire-resistant enemies demand spell variety.
// Features: darkness zone, teleporter, locked door, treasure, stairs up+down.
// ---------------------------------------------------------------------------

function floor4(): FloorDef {
  const width = 14;
  const height = 14;
  const grid = buildSolidGrid(width, height);

  // Entrance room (chute from floor 3 lands here)
  carveRoom(grid, 5, 1, 9, 3);
  // Main corridor going south
  carveVertical(grid, 7, 3, 12);
  // Branch east at y=6
  carveHorizontal(grid, 7, 12, 6);
  // Branch west at y=8
  carveHorizontal(grid, 1, 7, 8);

  // East room (darkness zone with treasure)
  carveRoom(grid, 10, 4, 13, 8);
  // West room (has locked door, stairs down behind it)
  carveRoom(grid, 0, 6, 3, 10);
  // South room (large summoning chamber)
  carveRoom(grid, 4, 10, 10, 13);

  // Connect branches
  grid[6][9].e = "open"; grid[6][10].w = "open"; // east branch to east room
  grid[8][4].w = "open"; grid[8][3].e = "open"; // west branch to west room
  grid[9][7].s = "open"; grid[10][7].n = "open"; // south corridor to south room

  // Locked door on west room entrance (between (4,8) and (3,8))
  setEdge(grid, 4, 8, "w", "locked");
  setEdge(grid, 3, 8, "e", "locked");

  // Door on east room entrance (between (9,6) and (10,6))
  setEdge(grid, 9, 6, "e", "door");
  setEdge(grid, 10, 6, "w", "door");

  // Tile features
  // Stairs up in entrance room
  setTile(grid, 7, 2, "stairs_up");
  // Darkness in the east room
  setTile(grid, 11, 5, "darkness");
  setTile(grid, 12, 5, "darkness");
  setTile(grid, 11, 6, "darkness");
  setTile(grid, 12, 6, "darkness");
  setTile(grid, 11, 7, "darkness");
  setTile(grid, 12, 7, "darkness");
  // Treasure in the dark east room
  setTile(grid, 12, 6, "treasure");
  // Stairs down in the locked west room
  setTile(grid, 1, 8, "stairs_down");
  // Teleporter in the south room → links to floor 5 (one-way shortcut)
  setTile(grid, 7, 12, "teleporter");
  // Anti-magic in the south room
  setTile(grid, 5, 11, "antimagic");
  setTile(grid, 6, 11, "antimagic");

  return {
    id: 4,
    name: "The Summoning Chambers",
    width,
    height,
    grid,
    startX: 7,
    startY: 2,
    encounterRate: 0.08,
    teleporters: [
      { x: 7, y: 12, toFloorId: 5, toX: 7, toY: 10 },
    ],
    lockedDoors: [
      { x: 4, y: 8, dir: "w", keyId: "summon-key" },
    ],
    treasures: [
      { x: 12, y: 6, itemIds: ["great-sword", "plate-mail", "healing-potion", "healing-potion", "healing-potion", "sanctum-key"] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Floor 5: The Headmaster's Sanctum — boss floor.
// Theme: Ornate, eerie. Stone Guardians, Animated Armor, The Headmaster's Echo.
// Features: stairs up, treasure rooms, anti-magic, locked door to boss.
// ---------------------------------------------------------------------------

function floor5(): FloorDef {
  const width = 14;
  const height = 14;
  const grid = buildSolidGrid(width, height);

  // Entrance room (stairs up + teleporter from floor 4 land here)
  carveRoom(grid, 5, 9, 8, 12);
  // Main corridor going north
  carveVertical(grid, 6, 1, 9);
  // Branch east at y=5
  carveHorizontal(grid, 6, 12, 5);
  // Branch west at y=5
  carveHorizontal(grid, 1, 6, 5);

  // East treasure room
  carveRoom(grid, 10, 3, 13, 7);
  // West treasure room
  carveRoom(grid, 0, 3, 3, 7);
  // North boss chamber (locked)
  carveRoom(grid, 4, 1, 8, 3);

  // Connect branches
  grid[5][9].e = "open"; grid[5][10].w = "open"; // east branch to east room
  grid[5][4].w = "open"; grid[5][3].e = "open"; // west branch to west room
  grid[3][6].n = "open"; grid[4][6].s = "open"; // north corridor to boss chamber

  // Locked door on the boss chamber entrance (between (6,4) and (6,3))
  setEdge(grid, 6, 4, "n", "locked");
  setEdge(grid, 6, 3, "s", "locked");

  // Doors on treasure rooms
  setEdge(grid, 9, 5, "e", "door");
  setEdge(grid, 10, 5, "w", "door");
  setEdge(grid, 4, 5, "w", "door");
  setEdge(grid, 3, 5, "e", "door");

  // Tile features
  // Stairs up in entrance room
  setTile(grid, 6, 11, "stairs_up");
  // Treasure in east room
  setTile(grid, 12, 5, "treasure");
  // Treasure in west room
  setTile(grid, 1, 5, "treasure");
  // Anti-magic in the boss chamber
  setTile(grid, 5, 2, "antimagic");
  setTile(grid, 6, 2, "antimagic");
  setTile(grid, 7, 2, "antimagic");

  return {
    id: 5,
    name: "The Headmaster's Sanctum",
    width,
    height,
    grid,
    startX: 6,
    startY: 11,
    encounterRate: 0.08,
    lockedDoors: [
      { x: 6, y: 4, dir: "n", keyId: "sanctum-key" },
    ],
    treasures: [
      { x: 12, y: 5, itemIds: ["great-sword+2", "plate-mail+2", "healing-potion", "healing-potion", "healing-potion"] },
      { x: 1, y: 5, itemIds: ["great-sword+1", "plate-mail+1", "healing-potion", "antidote", "antidote", "sanctum-key"] },
    ],
  };
}

export const FLOORS: readonly FloorDef[] = [floor1(), floor2(), floor3(), floor4(), floor5()];

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
      ? floor.treasures.map((t) => ({ x: t.x, y: t.y, itemIds: [...t.itemIds] }))
      : undefined,
  };
}
