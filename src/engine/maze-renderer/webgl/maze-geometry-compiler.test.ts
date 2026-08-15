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
  barredGate?: boolean;
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
    barredGates: options?.barredGate
      ? [{ x: 1, y: 1, dir: "w", opensFrom: "w" }]
      : undefined,
  };
}

function quadsForKind(
  compiled: ReturnType<typeof compileMazeGeometry>,
  kind: "floor" | "wall" | "door"
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

function eastConnector(surface: "ramp" | "stairs" = "ramp"): HeightFloor {
  const grid = buildSolidGrid(5, 3);
  setEdge(grid, 1, 1, "e", "open");
  setEdge(grid, 2, 1, "w", "open");
  setEdge(grid, 2, 1, "e", "open");
  setEdge(grid, 3, 1, "w", "open");
  return {
    id: 1,
    name: "East connector",
    width: 5,
    height: 3,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "connector", x1: 2, y1: 1, x2: 2, y2: 1, ceilingZ: 2 },
      { id: "high", x1: 3, y1: 1, x2: 3, y2: 1, floorZ: 1, ceilingZ: 3 },
    ],
    ramps: [{ x: 2, y: 1, dir: "e", surface }],
  };
}

function northConnector(): HeightFloor {
  const grid = buildSolidGrid(3, 5);
  setEdge(grid, 1, 3, "n", "open");
  setEdge(grid, 1, 2, "s", "open");
  setEdge(grid, 1, 2, "n", "open");
  setEdge(grid, 1, 1, "s", "open");
  return {
    id: 1,
    name: "North connector",
    width: 3,
    height: 5,
    grid,
    startX: 1,
    startY: 3,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "connector", x1: 1, y1: 2, x2: 1, y2: 2, ceilingZ: 2 },
      { id: "high", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 1, ceilingZ: 3 },
    ],
    ramps: [{ x: 1, y: 2, dir: "n", surface: "ramp" }],
  };
}

describe("compileMazeGeometry", () => {
  it("omits the shared wall between equal open volumes", () => {
    const compiled = compileMazeGeometry(twoCellFloor());
    expect(quadsForKind(compiled, "wall")).toHaveLength(6);
    expect(compiled.stats.triangles).toBe(20);
  });

  it("omits void cell surfaces and leaves an open abyss edge unsealed", () => {
    const floor = twoCellFloor();
    floor.grid[1][2].void = true;
    floor.grid[1][1].noCeiling = true;
    const compiled = compileMazeGeometry(floor);
    expect(quadsForKind(compiled, "floor")).toHaveLength(1);
    expect(compiled.batches.filter((batch) => batch.kind === "ceiling")).toHaveLength(0);
    const sharedWalls = quadsForKind(compiled, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      return xs.every((x) => x === 2);
    });
    expect(sharedWalls).toHaveLength(0);
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

  it("renders a sealed upper overlook above a barred gate", () => {
    const compiled = compileMazeGeometry(
      twoCellFloor({
        edge: "wall",
        barredGate: true,
        heightZones: [
          { id: "grand", x1: 2, y1: 1, x2: 2, y2: 1, floorZ: 1, ceilingZ: 3 },
        ],
      })
    );
    const shared = quadsForKind(compiled, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return xs.every((x) => x === 2) && Math.min(...zs) === 1 && Math.max(...zs) === 2;
    });
    expect(shared).toHaveLength(1);
    const heights = shared[0].positions.filter((_, index) => index % 3 === 1);
    expect(Math.min(...heights)).toBe(0);
    expect(Math.max(...heights)).toBe(1.25 * LEGACY_VERTICAL_UNIT);
  });

  it("selects regional materials per cell", () => {
    const compiled = compileMazeGeometry(twoCellFloor({ regional: true }));
    const keys = new Set(compiled.batches.map((batch) => batch.materialKey));
    expect(keys).toContain("f1:floorA");
    expect(keys).toContain("f2:floorB");
    expect([...keys].some((key) => /^f1:wall(?:@_[b-j])?$/.test(key))).toBe(true);
    expect([...keys].some((key) => /^f2:wall(?:@_[b-j])?$/.test(key))).toBe(true);
  });

  it("emits a true east-rising floor quad with exact endpoint heights", () => {
    const compiled = compileMazeGeometry(eastConnector());
    const ramp = quadsForKind(compiled, "floor").find((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return Math.min(...xs) === 2 && Math.max(...xs) === 3 &&
        Math.min(...zs) === 1 && Math.max(...zs) === 2;
    });
    expect(ramp).toBeDefined();
    const west = ramp!.positions.filter((_, index) => index % 3 === 1 && ramp!.positions[index - 1] === 2);
    const east = ramp!.positions.filter((_, index) => index % 3 === 1 && ramp!.positions[index - 1] === 3);
    expect(west.every((height) => height === 0)).toBe(true);
    expect(east.every((height) => height === LEGACY_VERTICAL_UNIT)).toBe(true);
    expect(Math.min(...ramp!.uvs)).toBe(0);
    expect(Math.max(...ramp!.uvs)).toBe(1);
  });

  it("emits a north-rising quad with high north and low south endpoints", () => {
    const compiled = compileMazeGeometry(northConnector());
    const ramp = quadsForKind(compiled, "floor").find((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return Math.min(...xs) === 1 && Math.max(...xs) === 2 &&
        Math.min(...zs) === 2 && Math.max(...zs) === 3;
    });
    expect(ramp).toBeDefined();
    const north = ramp!.positions.filter(
      (_, index) => index % 3 === 1 && ramp!.positions[index + 1] === 2
    );
    const south = ramp!.positions.filter(
      (_, index) => index % 3 === 1 && ramp!.positions[index + 1] === 3
    );
    expect(north.every((height) => height === LEGACY_VERTICAL_UNIT)).toBe(true);
    expect(south.every((height) => height === 0)).toBe(true);
  });

  it("starts both ramp side walls at the sloped floor edge", () => {
    const compiled = compileMazeGeometry(eastConnector());
    const sides = quadsForKind(compiled, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return Math.min(...xs) === 2 && Math.max(...xs) === 3 &&
        (zs.every((z) => z === 1) || zs.every((z) => z === 2));
    });
    expect(sides).toHaveLength(2);
    for (const side of sides) {
      const heights = side.positions.filter((_, index) => index % 3 === 1);
      expect(heights).toContain(0);
      expect(heights).toContain(LEGACY_VERTICAL_UNIT);
      expect(heights).toContain(2 * LEGACY_VERTICAL_UNIT);
    }
  });

  it("renders four bounded stair treads and risers with matching endpoints", () => {
    const ramp = compileMazeGeometry(eastConnector("ramp"));
    const stairs = compileMazeGeometry(eastConnector("stairs"));
    expect(stairs.stats.triangles - ramp.stats.triangles).toBe(14);
    const connectorFloors = quadsForKind(stairs, "floor").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      return Math.min(...xs) >= 2 && Math.max(...xs) <= 3;
    });
    expect(connectorFloors).toHaveLength(4);
    const floorHeights = connectorFloors.flatMap((quad) =>
      quad.positions.filter((_, index) => index % 3 === 1)
    );
    expect(Math.min(...floorHeights)).toBe(0);
    expect(Math.max(...floorHeights)).toBe(0.75 * LEGACY_VERTICAL_UNIT);
    const connectorRisers = quadsForKind(stairs, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const heights = quad.positions.filter((_, index) => index % 3 === 1);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return xs.every((x) => x > 2 && x <= 3) &&
        Math.min(...zs) === 1 && Math.max(...zs) === 2 &&
        Math.max(...heights) <= LEGACY_VERTICAL_UNIT;
    });
    expect(connectorRisers).toHaveLength(4);
    expect(
      Math.max(...connectorRisers.flatMap((quad) =>
        quad.positions.filter((_, index) => index % 3 === 1)
      ))
    ).toBe(LEGACY_VERTICAL_UNIT);
    const stairSides = quadsForKind(stairs, "wall").filter((quad) => {
      const xs = quad.positions.filter((_, index) => index % 3 === 0);
      const zs = quad.positions.filter((_, index) => index % 3 === 2);
      return Math.min(...xs) === 2 && Math.max(...xs) === 3 &&
        (zs.every((z) => z === 1) || zs.every((z) => z === 2));
    });
    expect(stairSides).toHaveLength(2);
    for (const side of stairSides) {
      const heights = side.positions.filter((_, index) => index % 3 === 1);
      expect(heights.filter((height) => height === 0)).toHaveLength(2);
    }
  });
});
