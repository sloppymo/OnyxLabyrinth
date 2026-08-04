import { describe, it, expect } from "vitest";
import { isWaterTile, waterGridFromFloor } from "./water-floor";
import type { FloorDef } from "../data/floors";
import { buildSolidGrid } from "../game/dungeon";

function gridWithWater(waterX: number, waterY: number): FloorDef["grid"] {
  const grid = buildSolidGrid(4, 4);
  grid[waterY][waterX].tile = "water";
  return grid;
}

describe("water-floor grid", () => {
  it("identifies water tiles", () => {
    expect(isWaterTile("water")).toBe(true);
    expect(isWaterTile("treasure")).toBe(false);
    expect(isWaterTile(undefined)).toBe(false);
  });

  it("builds a water mask that is true only for water cells", () => {
    const grid = gridWithWater(1, 2);
    const mask = waterGridFromFloor({ grid });
    expect(mask[2][1]).toBe(true);
    // spot-check a few non-water cells
    expect(mask[0][0]).toBe(false);
    expect(mask[2][0]).toBe(false);
    expect(mask[2][2]).toBe(false);
  });

  it("preserves grid dimensions", () => {
    const grid = gridWithWater(0, 0);
    const mask = waterGridFromFloor({ grid });
    expect(mask.length).toBe(grid.length);
    expect(mask[0].length).toBe(grid[0].length);
  });
});
