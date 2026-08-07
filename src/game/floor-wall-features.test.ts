import { describe, expect, it } from "vitest";
import {
  floorDefToMap,
  mapToFloorDef,
  newFloorMapJSON,
  parseFloorMapJSON,
} from "./floor-map";
import { validateFloorMap } from "./floor-validate";
import { FLOORS } from "../data/floors";
import { buildSolidGrid, setEdge } from "./dungeon";

function gridWithOpenWallAt4_4(): ReturnType<typeof buildSolidGrid> {
  // A single passable cell at (4,4) whose north edge stays "wall" — the
  // face a wallFeatures entry can legally target.
  const grid = buildSolidGrid(8, 8);
  setEdge(grid, 4, 4, "e", "open");
  setEdge(grid, 4, 4, "s", "open");
  return grid;
}

describe("wallFeatures round-trip", () => {
  it("preserves wallFeatures through FloorDef <-> JSON, floor without any is untouched", () => {
    const map = newFloorMapJSON(8, 8, {
      id: 99,
      name: "Wall Feature Test",
      tilesetTheme: "f1",
      wallFeatures: [
        { x: 4, y: 4, dir: "n", spriteId: "test-switch" },
        { x: 2, y: 2, dir: "e", spriteId: "test-plaque" },
      ],
    });
    const floor = mapToFloorDef(map);
    expect(floor.wallFeatures).toEqual(map.wallFeatures);
    const again = floorDefToMap(floor);
    expect(again.wallFeatures).toEqual(map.wallFeatures);
    const parsed = parseFloorMapJSON(JSON.parse(JSON.stringify(again)));
    expect(parsed.wallFeatures).toEqual(map.wallFeatures);
  });

  it("a floor without wallFeatures round-trips to undefined (no behavior change)", () => {
    const map = newFloorMapJSON(8, 8, { id: 1, name: "Plain" });
    expect(map.wallFeatures).toBeUndefined();
    const floor = mapToFloorDef(map);
    expect(floor.wallFeatures).toBeUndefined();
  });

  it("rejects a malformed wallFeatures entry (missing dir)", () => {
    expect(() =>
      parseFloorMapJSON({
        ...newFloorMapJSON(4, 4),
        wallFeatures: [{ x: 1, y: 1, spriteId: "torch" }],
      })
    ).toThrow(/dir/);
  });

  it("flags an edge mismatch, an unknown spriteId, and an out-of-bounds entry", () => {
    const grid = gridWithOpenWallAt4_4();
    const map = floorDefToMap({
      id: 1,
      name: "Validate Test",
      width: 8,
      height: 8,
      grid,
      startX: 4,
      startY: 4,
      encounterRate: 0.08,
      wallFeatures: [
        // (4,4).n is "wall" (untouched by gridWithOpenWallAt4_4) — valid edge,
        // but "nope" is not a registered sprite id.
        { x: 4, y: 4, dir: "n", spriteId: "nope" },
        // (4,4).e was opened above, so a wall feature there is a mismatch.
        { x: 4, y: 4, dir: "e", spriteId: "nope" },
        { x: 99, y: 99, dir: "n", spriteId: "nope" },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("wall_feature_unknown");
    expect(codes).toContain("wall_feature_edge_mismatch");
    expect(codes).toContain("wall_feature_oob");
  });

  it("campaign floors still validate without wallFeatures", () => {
    for (const floor of FLOORS) {
      const issues = validateFloorMap(floorDefToMap(floor)).filter(
        (i) => i.severity === "error"
      );
      expect(issues, `floor ${floor.id}`).toEqual([]);
    }
  });
});
