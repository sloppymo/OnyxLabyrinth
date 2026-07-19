/**
 * Tests for the pure grid model / carving helpers in dungeon.ts. Flagged in
 * the 2026-07-18 code audit as the riskiest untested pure-logic file (edge
 * symmetry bugs here silently produce one-way walls the renderer can't see).
 */
import { describe, it, expect } from "vitest";
import {
  DIRS,
  DX,
  DY,
  emptyCell,
  buildOpenRoom,
  buildSolidGrid,
  carveHorizontal,
  carveVertical,
  carveRoom,
  edgeInDirection,
  inBounds,
  setTile,
  setEdge,
} from "./dungeon";

describe("emptyCell", () => {
  it("returns a cell with all four edges walled", () => {
    const c = emptyCell();
    expect(c.n).toBe("wall");
    expect(c.e).toBe("wall");
    expect(c.s).toBe("wall");
    expect(c.w).toBe("wall");
  });

  it("returns a fresh object each call (no shared mutable state)", () => {
    const a = emptyCell();
    const b = emptyCell();
    a.n = "open";
    expect(b.n).toBe("wall");
  });
});

describe("buildSolidGrid", () => {
  it("builds the requested dimensions with every edge walled", () => {
    const grid = buildSolidGrid(4, 3);
    expect(grid.length).toBe(3);
    expect(grid[0].length).toBe(4);
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.n).toBe("wall");
        expect(cell.e).toBe("wall");
        expect(cell.s).toBe("wall");
        expect(cell.w).toBe("wall");
      }
    }
  });
});

describe("buildOpenRoom", () => {
  it("builds the requested dimensions", () => {
    const grid = buildOpenRoom(3, 2);
    expect(grid.length).toBe(2);
    expect(grid[0].length).toBe(3);
  });

  it("opens every interior edge symmetrically", () => {
    const grid = buildOpenRoom(3, 3);
    // Horizontal neighbors: (0,0)-(1,0) and (1,0)-(2,0).
    expect(grid[0][0].e).toBe("open");
    expect(grid[0][1].w).toBe("open");
    expect(grid[0][1].e).toBe("open");
    expect(grid[0][2].w).toBe("open");
    // Vertical neighbors: (0,0)-(0,1) and (0,1)-(0,2).
    expect(grid[0][0].s).toBe("open");
    expect(grid[1][0].n).toBe("open");
    expect(grid[1][0].s).toBe("open");
    expect(grid[2][0].n).toBe("open");
  });

  it("leaves the outer boundary walled", () => {
    const grid = buildOpenRoom(3, 3);
    expect(grid[0][0].n).toBe("wall");
    expect(grid[0][0].w).toBe("wall");
    expect(grid[2][2].s).toBe("wall");
    expect(grid[2][2].e).toBe("wall");
  });
});

describe("edgeInDirection", () => {
  it("reads the matching edge for each cardinal direction", () => {
    const cell = { n: "open", e: "door", s: "locked", w: "wall" } as const;
    expect(edgeInDirection(cell, DIRS.N)).toBe("open");
    expect(edgeInDirection(cell, DIRS.E)).toBe("door");
    expect(edgeInDirection(cell, DIRS.S)).toBe("locked");
    expect(edgeInDirection(cell, DIRS.W)).toBe("wall");
  });

  it("falls back to wall for an invalid direction instead of crashing", () => {
    const cell = emptyCell();
    expect(edgeInDirection(cell, 99)).toBe("wall");
    expect(edgeInDirection(cell, -1)).toBe("wall");
  });
});

describe("DX/DY", () => {
  it("matches N/E/S/W unit deltas indexed by DIRS", () => {
    expect([DX[DIRS.N], DY[DIRS.N]]).toEqual([0, -1]);
    expect([DX[DIRS.E], DY[DIRS.E]]).toEqual([1, 0]);
    expect([DX[DIRS.S], DY[DIRS.S]]).toEqual([0, 1]);
    expect([DX[DIRS.W], DY[DIRS.W]]).toEqual([-1, 0]);
  });
});

describe("inBounds", () => {
  const grid = buildSolidGrid(4, 3);

  it("accepts coordinates within the grid", () => {
    expect(inBounds(grid, 0, 0)).toBe(true);
    expect(inBounds(grid, 3, 2)).toBe(true);
  });

  it("rejects coordinates outside the grid on every side", () => {
    expect(inBounds(grid, -1, 0)).toBe(false);
    expect(inBounds(grid, 0, -1)).toBe(false);
    expect(inBounds(grid, 4, 0)).toBe(false);
    expect(inBounds(grid, 0, 3)).toBe(false);
  });
});

describe("carveHorizontal", () => {
  it("opens the shared edge between each pair of cells in the run", () => {
    const grid = buildSolidGrid(5, 1);
    carveHorizontal(grid, 1, 3, 0);
    expect(grid[0][1].e).toBe("open");
    expect(grid[0][2].w).toBe("open");
    expect(grid[0][2].e).toBe("open");
    expect(grid[0][3].w).toBe("open");
  });

  it("does not touch edges outside the carved range", () => {
    const grid = buildSolidGrid(5, 1);
    carveHorizontal(grid, 1, 3, 0);
    expect(grid[0][0].e).toBe("wall");
    expect(grid[0][3].e).toBe("wall");
    expect(grid[0][4].w).toBe("wall");
  });

  it("is order-independent (x1 > x2 carves the same range)", () => {
    const a = buildSolidGrid(5, 1);
    const b = buildSolidGrid(5, 1);
    carveHorizontal(a, 1, 3, 0);
    carveHorizontal(b, 3, 1, 0);
    expect(a).toEqual(b);
  });
});

describe("carveVertical", () => {
  it("opens the shared edge between each pair of cells in the run", () => {
    const grid = buildSolidGrid(1, 5);
    carveVertical(grid, 0, 1, 3);
    expect(grid[1][0].s).toBe("open");
    expect(grid[2][0].n).toBe("open");
    expect(grid[2][0].s).toBe("open");
    expect(grid[3][0].n).toBe("open");
  });

  it("does not touch edges outside the carved range", () => {
    const grid = buildSolidGrid(1, 5);
    carveVertical(grid, 0, 1, 3);
    expect(grid[0][0].s).toBe("wall");
    expect(grid[3][0].s).toBe("wall");
    expect(grid[4][0].n).toBe("wall");
  });

  it("is order-independent (y1 > y2 carves the same range)", () => {
    const a = buildSolidGrid(1, 5);
    const b = buildSolidGrid(1, 5);
    carveVertical(a, 0, 1, 3);
    carveVertical(b, 0, 3, 1);
    expect(a).toEqual(b);
  });
});

describe("carveRoom", () => {
  it("opens every interior edge within the rectangle, symmetrically", () => {
    const grid = buildSolidGrid(4, 4);
    carveRoom(grid, 1, 1, 2, 2);
    // The 2x2 interior should be fully interconnected.
    expect(grid[1][1].e).toBe("open");
    expect(grid[1][2].w).toBe("open");
    expect(grid[1][1].s).toBe("open");
    expect(grid[2][1].n).toBe("open");
    expect(grid[1][2].s).toBe("open");
    expect(grid[2][2].n).toBe("open");
    expect(grid[2][1].e).toBe("open");
    expect(grid[2][2].w).toBe("open");
  });

  it("leaves cells outside the rectangle untouched", () => {
    const grid = buildSolidGrid(4, 4);
    carveRoom(grid, 1, 1, 2, 2);
    expect(grid[0][0].e).toBe("wall");
    expect(grid[0][0].s).toBe("wall");
    expect(grid[3][3].n).toBe("wall");
    expect(grid[3][3].w).toBe("wall");
    // The room's own outer boundary stays walled (carveRoom opens interior
    // edges only; the caller punches doors explicitly).
    expect(grid[1][1].n).toBe("wall");
    expect(grid[1][1].w).toBe("wall");
    expect(grid[2][2].s).toBe("wall");
    expect(grid[2][2].e).toBe("wall");
  });

  it("handles a single-cell room without opening any edges", () => {
    const grid = buildSolidGrid(3, 3);
    carveRoom(grid, 1, 1, 1, 1);
    expect(grid[1][1]).toEqual(emptyCell());
  });

  it("is order-independent for reversed corner arguments", () => {
    const a = buildSolidGrid(4, 4);
    const b = buildSolidGrid(4, 4);
    carveRoom(a, 1, 1, 2, 2);
    carveRoom(b, 2, 2, 1, 1);
    expect(a).toEqual(b);
  });
});

describe("setTile", () => {
  it("sets the tile feature when in bounds", () => {
    const grid = buildSolidGrid(3, 3);
    setTile(grid, 1, 1, "treasure");
    expect(grid[1][1].tile).toBe("treasure");
  });

  it("is a no-op out of bounds instead of throwing", () => {
    const grid = buildSolidGrid(3, 3);
    expect(() => setTile(grid, 99, 99, "treasure")).not.toThrow();
    expect(() => setTile(grid, -1, 0, "treasure")).not.toThrow();
  });
});

describe("setEdge", () => {
  it("sets a single edge when in bounds", () => {
    const grid = buildSolidGrid(3, 3);
    setEdge(grid, 1, 1, "n", "door");
    expect(grid[1][1].n).toBe("door");
    // setEdge is one-sided; the caller is responsible for opening the
    // neighbor's matching edge too (unlike carveHorizontal/carveVertical).
    expect(grid[0][1].s).toBe("wall");
  });

  it("is a no-op out of bounds instead of throwing", () => {
    const grid = buildSolidGrid(3, 3);
    expect(() => setEdge(grid, 99, 99, "n", "door")).not.toThrow();
  });
});
