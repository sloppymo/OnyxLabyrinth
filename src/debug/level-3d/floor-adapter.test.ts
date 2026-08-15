import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FloorDef } from "../../data/floors";
import { getFloors } from "../../game/floor-registry";
import { buildSolidGrid, setEdge } from "../../game/dungeon";
import { wallVariantFilename, wallVariantForEdge } from "../../engine/wall-variants";
import { resolveCellVolume } from "../../engine/maze-renderer/geometry/cell-volume";
import { resolveFloorSurface } from "../../engine/maze-renderer/geometry/floor-surface";
import {
  buildLevel3DModel,
  formatMaterialKey,
  physicalEdgeForFace,
} from "./floor-adapter";

function fixture(options: {
  edge?: "open" | "door" | "locked" | "barred";
  voidNeighbor?: boolean;
  regional?: boolean;
  raised?: boolean;
} = {}): FloorDef {
  const grid = buildSolidGrid(4, 3);
  const edge = options.edge ?? "open";
  setEdge(grid, 1, 1, "e", edge);
  setEdge(grid, 2, 1, "w", edge);
  if (options.raised) {
    setEdge(grid, 2, 1, "e", "open");
    setEdge(grid, 3, 1, "w", "open");
  }
  if (options.voidNeighbor) grid[1][2].void = true;
  return {
    id: 1,
    name: "3D adapter fixture",
    width: 4,
    height: 3,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
    tilesetZones: options.regional
      ? [{ id: "regional", x1: 2, y1: 1, x2: 2, y2: 1, theme: "f2" }]
      : undefined,
    heightZones: options.raised
      ? [
        { id: "connector-clearance", x1: 2, y1: 1, x2: 2, y2: 1, ceilingZ: 2 },
        { id: "raised", x1: 3, y1: 1, x2: 3, y2: 1, floorZ: 1, ceilingZ: 3 },
      ]
      : undefined,
    ramps: options.raised ? [{ x: 2, y: 1, dir: "e", surface: "ramp" }] : undefined,
    mapSprites: [{ x: 1, y: 1, spriteId: "crate" }],
    events: [{ x: 2, y: 1, kind: "message", message: "fixture" }],
  };
}

function isBoundaryFace(model: ReturnType<typeof buildLevel3DModel>, x: number, y: number, dir: "e" | "w"): boolean {
  return model.faces.some((face) =>
    face.source.kind === "wall" &&
    face.source.cellX === x &&
    face.source.cellY === y &&
    face.source.dir === dir
  );
}

function isProductionTheme(theme: string): theme is `f${1 | 2 | 3 | 4 | 5}` {
  return /^f[1-5]$/.test(theme);
}

describe("canonical level 3D adapter", () => {
  it("preserves every registered floor's canonical grid dimensions and resolved volumes", () => {
    for (const floor of getFloors()) {
      const model = buildLevel3DModel(floor);
      expect(model.stats.cellCount).toBe(floor.width * floor.height);
      expect(model.cells).toHaveLength(floor.width * floor.height);

      for (const cell of model.cells) {
        expect(cell.volume).toEqual(resolveCellVolume(floor, cell.x, cell.y));
        expect(cell.surface).toEqual(resolveFloorSurface(floor, cell.x, cell.y));
        expect(cell.theme).toBeDefined();
      }
      expect(model.stats.voidCellCount).toBe(
        floor.grid.flat().filter((cell) => cell.void).length
      );
      expect(model.stats.noCeilingCellCount).toBe(
        floor.grid.flat().filter((cell) => cell.noCeiling).length
      );
      for (const batch of model.geometry.batches) {
        expect(batch.faces).toHaveLength(batch.positions.length / 12);
      }
    }
  });

  it("converts an equal-height opening without creating an internal phantom wall", () => {
    const model = buildLevel3DModel(fixture());
    const sharedEdge = model.physicalEdges.find((edge) =>
      edge.x === 2 && edge.y === 1 && edge.dir === "w"
    );
    expect(sharedEdge).toMatchObject({
      edge: "open",
      oppositeEdge: "open",
      symmetric: true,
      ordinaryOpening: true,
    });
    expect(isBoundaryFace(model, 1, 1, "e")).toBe(false);
    expect(isBoundaryFace(model, 2, 1, "w")).toBe(false);
    expect(model.stats.surfaceCounts.floor).toBe(2);
    expect(model.stats.surfaceCounts.ceiling).toBe(2);
  });

  it("keeps an opening into a canonical void cell open and non-traversable", () => {
    const model = buildLevel3DModel(fixture({ voidNeighbor: true }));
    const edge = model.physicalEdges.find((candidate) =>
      candidate.x === 2 && candidate.y === 1 && candidate.dir === "w"
    );
    expect(edge?.ordinaryOpening).toBe(false);
    expect(isBoundaryFace(model, 1, 1, "e")).toBe(false);
    expect(model.stats.interiorCellCount).toBe(1);
  });

  it("retains regional material precedence and exact floor/ceiling assignment", () => {
    const model = buildLevel3DModel(fixture({ regional: true }));
    const regionalFloor = model.faces.find((face) =>
      face.source.kind === "floor" && face.source.cellX === 2 && face.source.cellY === 1
    );
    const regionalWall = model.faces.find((face) =>
      face.source.kind === "wall" && face.source.cellX === 2 && face.source.cellY === 1
    );
    expect(regionalFloor?.materialKey).toBe("f2:floorB");
    expect(regionalWall).toBeDefined();
    const regionalVariant = wallVariantForEdge(
      1,
      "f2",
      regionalWall!.source.cellX,
      regionalWall!.source.cellY,
      regionalWall!.source.dir!
    );
    expect(regionalWall?.materialKey).toBe(`f2:wall${regionalVariant ? `@${regionalVariant}` : ""}`);
    expect(model.stats.themes).toContain("f2");
  });

  it("retains canonical wall-family variants and shipped variant assets", () => {
    for (const floor of getFloors()) {
      const model = buildLevel3DModel(floor);
      const seenVariants = new Set<string>();
      for (const face of model.faces) {
        if (face.source.kind !== "wall" || face.source.role !== "boundary" || !face.source.dir) continue;
        const parsed = formatMaterialKey(face.materialKey);
        if (!isProductionTheme(face.theme)) {
          expect(parsed.variant).toBeUndefined();
          continue;
        }
        const expected = wallVariantForEdge(
          floor.id,
          face.theme,
          face.source.cellX,
          face.source.cellY,
          face.source.dir
        );
        expect(parsed.surface).toBe("wall");
        expect(parsed.variant ?? "").toBe(expected);
        if (!expected) continue;
        seenVariants.add(expected);
        expect(existsSync(`src/assets/${wallVariantFilename(face.theme, expected)}.png`)).toBe(true);
      }
      expect([...seenVariants].some((suffix) => ["_g", "_h", "_i", "_j"].includes(suffix))).toBe(true);
    }
  });

  it("preserves door classification and resolves a face to its shared physical edge", () => {
    const model = buildLevel3DModel(fixture({ edge: "door" }));
    const doorFace = model.faces.find((face) =>
      face.source.kind === "door" && face.source.cellX === 1 && face.source.cellY === 1
    );
    expect(doorFace).toBeDefined();
    expect(model.stats.doorCount).toBe(1);
    expect(physicalEdgeForFace(model, doorFace!)).toMatchObject({
      x: 2,
      y: 1,
      dir: "w",
      edge: "door",
      oppositeEdge: "door",
      ordinaryOpening: true,
    });
  });

  it("uses the canonical ramp direction and endpoint elevations", () => {
    const model = buildLevel3DModel(fixture({ raised: true }));
    const rampCell = model.cells.find((cell) => cell.x === 2 && cell.y === 1);
    expect(rampCell?.surface).toEqual({ kind: "ramp", lowZ: 0, highZ: 1, dir: "e" });
    const rampFace = model.faces.find((face) =>
      face.source.kind === "floor" && face.source.cellX === 2 && face.source.cellY === 1
    );
    expect(rampFace?.zRange).toEqual([0, 1]);
    expect(model.stats.floorZRange).toEqual([0, 1]);
    expect(model.stats.ceilingZRange).toEqual([1, 3]);
  });

  it("does not label a raw unequal-height opening as ordinary traversal", () => {
    const floor = fixture({ raised: true });
    floor.ramps = undefined;
    const model = buildLevel3DModel(floor);
    const edge = model.physicalEdges.find((candidate) =>
      candidate.x === 3 && candidate.y === 1 && candidate.dir === "w"
    );
    expect(edge).toMatchObject({ edge: "open", oppositeEdge: "open", ordinaryOpening: false });
  });

  it("counts source props and debug markers without creating gameplay geometry", () => {
    const model = buildLevel3DModel(fixture());
    expect(model.stats.propCount).toBe(1);
    expect(model.stats.markerCount).toBe(2);
    expect(model.geometry.batches.length).toBeGreaterThan(0);
  });
});
