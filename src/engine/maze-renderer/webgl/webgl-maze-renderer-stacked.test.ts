import { describe, expect, it } from "vitest";
import { buildOpenRoom } from "../../../game/dungeon";
import { createGameState } from "../../../game/state";
import { resolvePlayerZ } from "../../../game/traversal";
import { LEGACY_VERTICAL_UNIT } from "../geometry/cell-volume";
import { webglMazeEyeY } from "./webgl-maze-renderer";
import type { FloorDef } from "../../../data/floors";

function stackedFloor(): FloorDef {
  return {
    id: 1,
    name: "Stacked eye fixture",
    width: 4,
    height: 3,
    grid: buildOpenRoom(4, 3),
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

describe("webglMazeEyeY stacked rooms", () => {
  it("places the eye on the upper landing when the player stands there", () => {
    const state = createGameState(stackedFloor());
    state.player.x = 2;
    state.player.y = 1;
    state.player.z = 1;
    const settledZ = resolvePlayerZ(state.player, state.floor);
    expect(webglMazeEyeY(state, 651, 0, settledZ, state.player.x, state.player.y)).toBe(
      1.5 * LEGACY_VERTICAL_UNIT
    );
  });

  it("places the eye on the base floor when the player is underneath", () => {
    const state = createGameState(stackedFloor());
    state.player.x = 1;
    state.player.y = 1;
    state.player.z = 0;
    const settledZ = resolvePlayerZ(state.player, state.floor);
    expect(webglMazeEyeY(state, 651, 0, settledZ, state.player.x, state.player.y)).toBe(
      0.5 * LEGACY_VERTICAL_UNIT
    );
  });

  it("stays pinned to the landing Z even mid-tween across the display position", () => {
    const state = createGameState(stackedFloor());
    state.player.x = 2;
    state.player.y = 1;
    state.player.z = 1;
    const settledZ = resolvePlayerZ(state.player, state.floor);
    // Display position tweening in from an adjacent cell should not pull
    // the eye off the landing's authored Z.
    expect(webglMazeEyeY(state, 651, 0, settledZ, 1.5, 1)).toBe(
      1.5 * LEGACY_VERTICAL_UNIT
    );
  });
});

function rampFloor(): FloorDef {
  return {
    id: 2,
    name: "Ramp eye fixture",
    width: 5,
    height: 3,
    grid: buildOpenRoom(5, 3),
    startX: 1,
    startY: 1,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "high", x1: 3, y1: 1, x2: 4, y2: 1, floorZ: 1, ceilingZ: 2 },
    ],
    ramps: [{ x: 2, y: 1, dir: "e", surface: "ramp" }],
  };
}

describe("webglMazeEyeY ramp smoothness", () => {
  it("climbs continuously across the ramp cell as the display position tweens, not just on step commit", () => {
    const state = createGameState(rampFloor());
    state.player.x = 1;
    state.player.y = 1;
    state.player.z = 0;
    const settledZ = resolvePlayerZ(state.player, state.floor);
    // Display positions are cell-center indices: low cell 1, ramp cell 2,
    // high cell 3 — mirrors the smoothness fixture in floor-surface.test.ts.
    const eyeYs = [1, 1.5, 2, 2.5, 3].map((x) =>
      webglMazeEyeY(state, 651, 0, settledZ, x, 1)
    );
    expect(eyeYs).toEqual(
      [0, 0, 0.5, 1, 1].map(
        (z) => z * LEGACY_VERTICAL_UNIT + 0.5 * LEGACY_VERTICAL_UNIT
      )
    );
  });
});
