import { describe, expect, it } from "vitest";
import { buildOpenRoom } from "../../../game/dungeon";
import { createGameState } from "../../../game/state";
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
    expect(webglMazeEyeY(state, 651, 0)).toBe(1.5 * LEGACY_VERTICAL_UNIT);
  });

  it("places the eye on the base floor when the player is underneath", () => {
    const state = createGameState(stackedFloor());
    state.player.x = 1;
    state.player.y = 1;
    state.player.z = 0;
    expect(webglMazeEyeY(state, 651, 0)).toBe(0.5 * LEGACY_VERTICAL_UNIT);
  });
});
