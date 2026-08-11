import { describe, expect, it } from "vitest";
import type { FloorDef, HeightZoneDef } from "../../../data/floors";
import { buildSolidGrid, setEdge } from "../../../game/dungeon";
import { LEGACY_VERTICAL_UNIT } from "../geometry/cell-volume";
import { compileMazeGeometry } from "./maze-geometry-compiler";

type HeightFloor = FloorDef & { heightZones?: HeightZoneDef[] };

function twoCellFloor(options?: {
  edge?: "open" | "wall";
  heightZones?: HeightZoneDef[];
  regional?: boolean;
}): HeightFloor {
  const grid = buildSolidGrid(4, 3);
  const edge = options?.edge ?? "open";
  setEdge(grid, 1, 1, "e", edge);
  setEdge(grid, 2, 1, "w", edge);
  if (edge === "wall") {
    // Keep both cells classified as authored interiors while retaining their
    // closed shared boundary.
    setEdge(grid, 1, 1, "n", "door");
    setEdge(grid, 1, 0, "s", "door");
    setEdge(grid, 2, 1, "s", "door");
    setEdge(grid, 2, 2, "n", "door");
  }
  return {
    id: 1,
    name: "Compiler fixture",
    width: 4,
    height: 3,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
    tilesetZones: options?.regional
      ? [{ id: "other", x1: 2, y1: 1, x2: 2, y2: 1, theme: "f2" }]
      : undefined,
    heightZones: options?.heightZones,
  };
}

function quadsForKind(
  compiled: ReturnType<typeof compileMazeGeometry>,
  kind: "wall" | "door"
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

describe("compileMazeGeometry", () => {
  it("omits the shared wall between equal open volumes", () => {
    const compiled = compileMazeGeometry(twoCellFloor());
    expect(quadsForKind(compiled, "wall")).toHaveLength(6);
    expect(compiled.stats.triangles).toBe(20);
  });

  it("adds the upper closure at an open 1×→3× transition", () => {
    const compiled = compileMazeGeometry(
      twoCellFloor({
        heightZones: [
          { id: "grand", x1: 2, y1: 1, x2: 2, y2: 1, ceilingZ: 3 },
        ],
      })
    );
    const boundary = quadsForKind(compiled, "wall").find((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const ys = quad.positions.filter((_, index) => index % 3 === 1);
      return xs.every((x) => x === 2) && Math.min(...ys) > LEGACY_VERTICAL_UNIT * 0.99;
    });
    expect(boundary).toBeDefined();
    expect(Math.min(...boundary!.uvs.filter((_, index) => index % 2 === 1))).toBe(1);
    expect(Math.max(...boundary!.uvs.filter((_, index) => index % 2 === 1))).toBe(3);
  });

  it("tiles tall-wall UVs once per authored vertical unit", () => {
    const compiled = compileMazeGeometry(
      twoCellFloor({
        heightZones: [
          { id: "grand", x1: 2, y1: 1, x2: 2, y2: 1, ceilingZ: 3 },
        ],
      })
    );
    const maxV = Math.max(
      ...compiled.batches
        .filter((batch) => batch.kind === "wall")
        .flatMap((batch) => batch.uvs.filter((_, index) => index % 2 === 1))
    );
    expect(maxV).toBe(3);
  });

  it("keeps both faces of a closed different-height boundary", () => {
    const compiled = compileMazeGeometry(
      twoCellFloor({
        edge: "wall",
        heightZones: [
          { id: "grand", x1: 2, y1: 1, x2: 2, y2: 1, ceilingZ: 3 },
        ],
      })
    );
    const shared = quadsForKind(compiled, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return xs.every((x) => x === 2) && Math.min(...zs) === 1 && Math.max(...zs) === 2;
    });
    expect(shared).toHaveLength(2);
    const heights = shared.map((quad) =>
      Math.max(...quad.positions.filter((_, index) => index % 3 === 1))
    );
    expect(heights).toContain(LEGACY_VERTICAL_UNIT);
    expect(heights).toContain(3 * LEGACY_VERTICAL_UNIT);
  });

  it("selects regional materials per cell", () => {
    const compiled = compileMazeGeometry(twoCellFloor({ regional: true }));
    const keys = new Set(compiled.batches.map((batch) => batch.materialKey));
    expect(keys).toContain("f1:floorA");
    expect(keys).toContain("f2:floorB");
    expect(keys).toContain("f1:wall");
    expect(keys).toContain("f2:wall");
  });
});
