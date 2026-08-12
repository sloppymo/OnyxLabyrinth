import { describe, it, expect } from "vitest";
import {
  resolveTraversal,
  resolveLadderAction,
  executeLadderAction,
  ladderAt,
} from "./traversal";
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

/** Floor with two stacked landings and two ladders for vertical movement. */
function makeLadderFloor(): FloorDef {
  return {
    id: 101,
    name: "ladder fixture",
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
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
      {
        id: "l1-5-5",
        x: 5,
        y: 5,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
      {
        id: "l0-6-6",
        x: 6,
        y: 6,
        z: 0,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
      {
        id: "l1-6-6",
        x: 6,
        y: 6,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
    ],
    ladders: [
      {
        id: "ladder-free",
        x: 5,
        y: 5,
        fromZ: 0,
        toZ: 1,
        facing: "n",
      },
      {
        id: "ladder-locked",
        x: 6,
        y: 6,
        fromZ: 0,
        toZ: 1,
        facing: "n",
        unlockFrom: "s",
      },
    ],
  };
}

function ladderState(x: number, y: number, z: number, facing: 0 | 1 | 2 | 3 = 0): GameState {
  const state = createGameState(makeLadderFloor());
  state.mode = "dungeon";
  state.player = { x, y, z, facing };
  return state;
}

describe("ladder traversal", () => {
  it("ladderAt finds the right ladder at the player's Z", () => {
    const state = ladderState(5, 5, 0);
    const l = ladderAt(state.floor, 5, 5, 0);
    expect(l?.id).toBe("ladder-free");
    expect(ladderAt(state.floor, 6, 6, 0)?.id).toBe("ladder-locked");
    expect(ladderAt(state.floor, 5, 5, 9)).toBeUndefined();
  });

  it("bidirectional ladder offers climb from the lower landing", () => {
    const state = ladderState(5, 5, 0);
    expect(resolveLadderAction(state)).toBe("ladder-up");
  });

  it("bidirectional ladder offers descend from the upper landing", () => {
    const state = ladderState(5, 5, 1);
    expect(resolveLadderAction(state)).toBe("ladder-down");
  });

  it("climb and descend update player Z", () => {
    const state = ladderState(5, 5, 0);
    expect(executeLadderAction(state, "ladder-up")).toBe(true);
    expect(state.player.z).toBe(1);

    expect(executeLadderAction(state, "ladder-down")).toBe(true);
    expect(state.player.z).toBe(0);
  });

  it("lowerable ladder is not usable until it is lowered from the right side", () => {
    const state = ladderState(6, 6, 1, 0); // facing north, not south
    expect(resolveLadderAction(state)).toBeNull();
    state.player.facing = 2; // south
    expect(resolveLadderAction(state)).toBe("ladder-lower");
  });

  it("lowering a ladder persists the unlocked id and enables descent", () => {
    const state = ladderState(6, 6, 1, 2);
    expect(executeLadderAction(state, "ladder-lower")).toBe(true);
    expect(state.unlockedLadderIds).toContain("ladder-locked");
    expect(resolveLadderAction(state)).toBe("ladder-down");
    expect(executeLadderAction(state, "ladder-down")).toBe(true);
    expect(state.player.z).toBe(0);
  });

  it("rejects a ladder action that does not match the current prompt", () => {
    const state = ladderState(5, 5, 0);
    expect(executeLadderAction(state, "ladder-down")).toBe(false);
  });
});
