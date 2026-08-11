import { describe, expect, it } from "vitest";
import { createGameState } from "./state";
import { mapToFloorDef, newFloorMapJSON } from "./floor-map";
import { resolveTraversal } from "./traversal";
import { carveRoom } from "./dungeon";

function verticalFloor() {
  const floor = mapToFloorDef(newFloorMapJSON(7, 5));
  carveRoom(floor.grid, 1, 1, 5, 3);
  floor.startX = 1;
  floor.startY = 2;
  floor.encounterRate = 0;
  floor.heightZones = [
    { id: "high", x1: 3, y1: 1, x2: 5, y2: 3, floorZ: 1, ceilingZ: 3 },
  ];
  floor.ramps = [{ x: 2, y: 2, dir: "e" as const, surface: "ramp" as const }];
  return floor;
}

describe("vertical traversal", () => {
  it("preserves ordinary flat movement", () => {
    const floor = verticalFloor();
    const state = createGameState(floor);
    state.player = { x: 1, y: 2, facing: 0 };
    expect(resolveTraversal(state, 0)).toMatchObject({ kind: "step", x: 1, y: 1 });
  });

  it("allows both directions across low and high ramp endpoints", () => {
    const floor = verticalFloor();
    const state = createGameState(floor);
    state.player = { x: 1, y: 2, facing: 1 };
    expect(resolveTraversal(state, 1)).toMatchObject({ kind: "step", x: 2, y: 2 });
    state.player = { x: 2, y: 2, facing: 1 };
    expect(resolveTraversal(state, 1)).toMatchObject({ kind: "step", x: 3, y: 2 });
    state.player = { x: 3, y: 2, facing: 3 };
    expect(resolveTraversal(state, 3)).toMatchObject({ kind: "step", x: 2, y: 2 });
    state.player = { x: 2, y: 2, facing: 3 };
    expect(resolveTraversal(state, 3)).toMatchObject({ kind: "step", x: 1, y: 2 });
  });

  it("blocks connector side entry and raw flat-to-flat steps", () => {
    const floor = verticalFloor();
    const state = createGameState(floor);
    state.player = { x: 2, y: 1, facing: 2 };
    expect(resolveTraversal(state, 2).kind).toBe("blocked");
    state.player = { x: 4, y: 3, facing: 3 };
    expect(resolveTraversal(state, 3).kind).toBe("step");
    state.player = { x: 3, y: 3, facing: 3 };
    expect(resolveTraversal(state, 3).kind).toBe("blocked");
  });

  it("uses the same navigation semantics for local stairs", () => {
    const floor = verticalFloor();
    floor.ramps![0].surface = "stairs";
    const state = createGameState(floor);
    state.player = { x: 2, y: 2, facing: 1 };
    expect(resolveTraversal(state, 1).kind).toBe("step");
  });
});
