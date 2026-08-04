import type { FloorDef } from "../data/floors";

/** Whether a cell's tile feature is the water floor material. */
export function isWaterTile(tile: string | undefined): boolean {
  return tile === "water";
}

/** Build a grid mask of water cells for the renderer floor-cast loop. */
export function waterGridFromFloor(floor: Pick<FloorDef, "grid">): boolean[][] {
  return floor.grid.map((row) => row.map((cell) => isWaterTile(cell.tile)));
}
