import { describe, it, expect } from "vitest";
import { resolveTraversal } from "./traversal";
import { createGameState } from "./state";
import { buildOpenRoom } from "./dungeon";
import type { FloorDef } from "../data/floors";
import type { GameState } from "../types";

/** A minimal floor where (5,5) hosts two stacked landings with different edges. */
function makeFloor(): FloorDef {
  return {
    id: 99,
    name: "z-stack fixture",
    width: 8,
    height: 8,
    grid: buildOpenRoom(8, 8),
    startX: 0,
    startY: 0,
    encounterRate: 0,
    verticalLandings: [
      {
        id: "l0-5-5",
        x: 5,
        y: 5,
        z: 0,
        edgeOverrides: {
          n: "wall",
          e: "open",
          s: "open",
          w: "open",
        },
      },
      {
        id: "l1-5-5",
        x: 5,
        y: 5,
        z: 1,
        edgeOverrides: {
          n: "open",
          e: "wall",
          s: "open",
          w: "open",
        },
      },
      { id: "l0-6-5", x: 6, y: 5, z: 0, edgeOverrides: { w: "open" } },
      { id: "l1-5-4", x: 5, y: 4, z: 1, edgeOverrides: { s: "open" } },
    ],
  };
}

function stateAt(
  x: number,
  y: number,
  z: number,
  facing: 0 | 1 | 2 | 3 = 0
): GameState {
  const state = createGameState(makeFloor());
  state.mode = "dungeon";
  state.player = { x, y, z, facing };
  return state;
}

describe("z-aware horizontal traversal", () => {
  it("(5,5,0) + east  => step to (6,5,0)", () => {
    const result = resolveTraversal(stateAt(5, 5, 0, 1), 1);
    expect(result).toEqual({ kind: "step", x: 6, y: 5, z: 0 });
  });

  it("(5,5,0) + north => blocked", () => {
    const result = resolveTraversal(stateAt(5, 5, 0, 0), 0);
    expect(result).toEqual({ kind: "blocked" });
  });

  it("(5,5,1) + east  => blocked", () => {
    const result = resolveTraversal(stateAt(5, 5, 1, 1), 1);
    expect(result).toEqual({ kind: "blocked" });
  });

  it("(5,5,1) + north => step to (5,4,1)", () => {
    const result = resolveTraversal(stateAt(5, 5, 1, 0), 0);
    expect(result).toEqual({ kind: "step", x: 5, y: 4, z: 1 });
  });

  it("(5,5,1) + east cannot step off onto base z=0", () => {
    const result = resolveTraversal(stateAt(5, 5, 1, 1), 1);
    expect(result).toEqual({ kind: "blocked" });
  });

  it("(5,5,0) + east cannot accidentally inherit water at (6,5)", () => {
    const state = stateAt(5, 5, 0, 1);
    state.floor.waters = [{ x: 6, y: 5, depth: 4, raftChannel: true }];
    const result = resolveTraversal(state, 1);
    // The open edge lets the step happen, but the destination is water.
    expect(result.kind).toBe("blocked");
  });
});

/** A floor with a 0 -> 1 ramp leading up to a high plateau. */
function makeRampFloor(): FloorDef {
  const grid = buildOpenRoom(8, 8);
  return {
    id: 100,
    name: "ramp fixture",
    width: 8,
    height: 8,
    grid,
    startX: 1,
    startY: 2,
    encounterRate: 0,
    heightZones: [
      { id: "high", x1: 3, y1: 1, x2: 5, y2: 3, floorZ: 1, ceilingZ: 3 },
    ],
    ramps: [{ x: 2, y: 2, dir: "e" as const, surface: "ramp" as const }],
  };
}

describe("ramp/stair settled destination Z", () => {
  it("low flat -> ramp lands at z=0.5 (cell centre)", () => {
    const state = createGameState(makeRampFloor());
    state.mode = "dungeon";
    state.player = { x: 1, y: 2, facing: 1 };
    expect(resolveTraversal(state, 1)).toEqual({
      kind: "step",
      x: 2,
      y: 2,
      z: 0.5,
    });
  });

  it("ramp -> high flat lands at z=1", () => {
    const state = createGameState(makeRampFloor());
    state.mode = "dungeon";
    state.player = { x: 2, y: 2, facing: 1 };
    expect(resolveTraversal(state, 1)).toEqual({
      kind: "step",
      x: 3,
      y: 2,
      z: 1,
    });
  });

  it("high flat -> ramp downhill lands at z=0.5", () => {
    const state = createGameState(makeRampFloor());
    state.mode = "dungeon";
    state.player = { x: 3, y: 2, facing: 3 };
    expect(resolveTraversal(state, 3)).toEqual({
      kind: "step",
      x: 2,
      y: 2,
      z: 0.5,
    });
  });
});
