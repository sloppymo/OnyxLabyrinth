// Grid-based dungeon data model + helpers.
// Each cell has four edges (N/E/S/W); an edge is open, a wall, or a door.
// Tile features (stairs, teleporters, chutes, darkness, treasure) layer on
// top via the optional Cell.tile field — see types/index.ts.

import type { Cell, EdgeType, Grid } from "../types";

export const DIRS = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
} as const;

// Unit deltas indexed by facing (0=N, 1=E, 2=S, 3=W).
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export function emptyCell(): Cell {
  return { n: "wall", e: "wall", s: "wall", w: "wall" };
}

/**
 * Builds a WxH room: solid outer boundary, open interior. Caller can override
 * individual edges (e.g. punch a door) afterwards. Used by data/floors.ts to
 * assemble FloorDefs.
 */
export function buildOpenRoom(width: number, height: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push(emptyCell());
    }
    grid.push(row);
  }

  // Open up interior edges between adjacent cells.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width - 1) {
        grid[y][x].e = "open";
        grid[y][x + 1].w = "open";
      }
      if (y < height - 1) {
        grid[y][x].s = "open";
        grid[y + 1][x].n = "open";
      }
    }
  }

  return grid;
}

export function edgeInDirection(cell: Cell, dir: number): EdgeType {
  switch (dir) {
    case DIRS.N:
      return cell.n;
    case DIRS.E:
      return cell.e;
    case DIRS.S:
      return cell.s;
    case DIRS.W:
      return cell.w;
    default:
      // Defensive fallback: treat an invalid direction as a wall rather than
      // crashing the renderer or movement code.
      return "wall";
  }
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

/**
 * Build a grid of the given dimensions where every cell is solid wall
 * (all 4 edges are "wall"). The caller carves corridors and rooms by
 * setting edges to "open". This is the starting point for hand-designed
 * floors with corridors and rooms.
 */
export function buildSolidGrid(width: number, height: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push(emptyCell());
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Carve a horizontal corridor from (x1,y) to (x2,y) inclusive.
 * Opens the E edge of each cell (and the W edge of the next cell).
 */
export function carveHorizontal(grid: Grid, x1: number, x2: number, y: number): void {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (let x = lo; x < hi; x++) {
    grid[y][x].e = "open";
    grid[y][x + 1].w = "open";
  }
}

/**
 * Carve a vertical corridor from (x,y1) to (x,y2) inclusive.
 * Opens the S edge of each cell (and the N edge of the next cell).
 */
export function carveVertical(grid: Grid, x: number, y1: number, y2: number): void {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  for (let y = lo; y < hi; y++) {
    grid[y][x].s = "open";
    grid[y + 1][x].n = "open";
  }
}

/**
 * Carve a rectangular room from (x1,y1) to (x2,y2) inclusive.
 * Opens all interior edges within the rectangle.
 */
export function carveRoom(grid: Grid, x1: number, y1: number, x2: number, y2: number): void {
  const loX = Math.min(x1, x2);
  const hiX = Math.max(x1, x2);
  const loY = Math.min(y1, y2);
  const hiY = Math.max(y1, y2);
  for (let y = loY; y <= hiY; y++) {
    carveHorizontal(grid, loX, hiX, y);
  }
  for (let x = loX; x <= hiX; x++) {
    carveVertical(grid, x, loY, hiY);
  }
}

/**
 * Set a tile feature on a cell. Convenience method for floor data.
 */
export function setTile(grid: Grid, x: number, y: number, tile: import("../types").TileFeature): void {
  if (inBounds(grid, x, y)) {
    grid[y][x].tile = tile;
  }
}

/**
 * Set an edge to a specific type. Convenience for doors, locked doors, etc.
 */
export function setEdge(
  grid: Grid,
  x: number,
  y: number,
  dir: "n" | "e" | "s" | "w",
  edge: EdgeType
): void {
  if (!inBounds(grid, x, y)) return;
  grid[y][x][dir] = edge;
}
