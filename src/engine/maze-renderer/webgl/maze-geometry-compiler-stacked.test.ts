import { describe, expect, it } from "vitest";
import type { FloorDef } from "../../../data/floors";
import { buildSolidGrid, setEdge } from "../../../game/dungeon";
import { LEGACY_VERTICAL_UNIT } from "../geometry/cell-volume";
import { compileMazeGeometry } from "./maze-geometry-compiler";

function quadsForKind(
  compiled: ReturnType<typeof compileMazeGeometry>,
  kind: "floor" | "wall" | "door" | "ceiling"
): { positions: number[]; uvs: number[] }[] {
  return compiled.batches
    .filter((batch) => batch.kind === kind)
    .flatMap((batch) => {
      const quads = [];
      for (let offset = 0; offset < batch.positions.length; offset += 12) {
        quads.push({
          positions: batch.positions.slice(offset, offset + 12),
          uvs: batch.uvs.slice((offset / 3) * 2, (offset / 3) * 2 + 8),
        });
      }
      return quads;
    });
}

function stackedRoomFloor(): FloorDef {
  const grid = buildSolidGrid(4, 3);
  // (1,1) is lower room, (2,1) is the same room but has an upper landing.
  setEdge(grid, 1, 1, "e", "open");
  setEdge(grid, 2, 1, "w", "open");
  setEdge(grid, 1, 1, "n", "door");
  setEdge(grid, 1, 0, "s", "door");
  setEdge(grid, 2, 1, "n", "door");
  setEdge(grid, 2, 0, "s", "door");
  setEdge(grid, 1, 1, "s", "door");
  setEdge(grid, 1, 2, "n", "door");
  setEdge(grid, 2, 1, "s", "door");
  setEdge(grid, 2, 2, "n", "door");
  return {
    id: 1,
    name: "Stacked room fixture",
    width: 4,
    height: 3,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "high", x1: 2, y1: 1, x2: 2, y2: 1, floorZ: 0, ceilingZ: 3 },
    ],
    verticalLandings: [
      {
        id: "upper",
        x: 2,
        y: 1,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
    ],
  };
}

describe("compileMazeGeometry stacked rooms", () => {
  it("emits an upper landing floor, ceiling, and underside", () => {
    const compiled = compileMazeGeometry(stackedRoomFloor());
    const floors = quadsForKind(compiled, "floor");
    const ceilings = quadsForKind(compiled, "ceiling");

    const upperFloor = floors.find((quad) =>
      quad.positions.every((_, i) =>
        i % 3 === 1 ? quad.positions[i] === LEGACY_VERTICAL_UNIT : true
      )
    );
    expect(upperFloor).toBeDefined();

    const baseCeiling = ceilings.find((quad) =>
      quad.positions.every((_, i) =>
        i % 3 === 1 ? quad.positions[i] === LEGACY_VERTICAL_UNIT : true
      )
    );
    expect(baseCeiling).toBeDefined();

    const upperCeiling = ceilings.find((quad) =>
      quad.positions.every((_, i) =>
        i % 3 === 1 ? quad.positions[i] === 3 * LEGACY_VERTICAL_UNIT : true
      )
    );
    expect(upperCeiling).toBeDefined();
  });

  it("emits wall quads for the upper landing perimeter", () => {
    const compiled = compileMazeGeometry(stackedRoomFloor());
    const walls = quadsForKind(compiled, "wall");
    const upperWalls = walls.filter((quad) => {
      const heights = quad.positions.filter((_, i) => i % 3 === 1);
      return (
        Math.min(...heights) === LEGACY_VERTICAL_UNIT &&
        Math.max(...heights) === 3 * LEGACY_VERTICAL_UNIT
      );
    });
    expect(upperWalls.length).toBeGreaterThanOrEqual(4);
  });

  it("emits a vertical ladder rung for a defined ladder", () => {
    const floor = stackedRoomFloor();
    floor.ladders = [
      { id: "l1", x: 2, y: 1, fromZ: 0, toZ: 1, facing: "n" },
    ];
    const compiled = compileMazeGeometry(floor);
    const ladderBatch = compiled.batches.find(
      (batch) => batch.materialKey === "ladder:ladder" && batch.kind === "wall"
    );
    expect(ladderBatch).toBeDefined();
    if (!ladderBatch) return;
    const heights = ladderBatch.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...heights)).toBe(0);
    expect(Math.max(...heights)).toBe(LEGACY_VERTICAL_UNIT);
  });
});
