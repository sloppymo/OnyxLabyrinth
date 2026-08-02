import { describe, expect, it } from "vitest";
import type { FloorDef, NPCDef } from "../data/floors";
import { findFloor } from "../game/floor-registry";
import { transitionToFloor } from "../game/features";
import { serialize, deserialize } from "../game/save";
import { createGameState } from "../game/state";
import type { Cell, Facing, GameState, Grid } from "../types";
import {
  MAP_OVERLAY_CONFIG,
  buildMapOverlayModel,
  cellToOverlayRect,
  computeMapOverlayViewport,
  createMapOverlayState,
  hideMapOverlayState,
  playerMarkerRects,
  syncMapOverlayMode,
  toggleMapOverlayState,
} from "./map-overlay";

function cell(overrides: Partial<Cell> = {}): Cell {
  return { n: "wall", e: "wall", s: "wall", w: "wall", ...overrides };
}

function testFloor(id = 41, width = 4, height = 4): FloorDef {
  const grid: Grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => cell()),
  );
  // One internally consistent east-west door between (1,1) and (2,1).
  if (width > 2 && height > 1) {
    grid[1]![1]!.e = "door";
    grid[1]![2]!.w = "door";
  }
  return {
    id,
    name: `Test Vault ${id}`,
    width,
    height,
    grid,
    startX: Math.min(1, width - 1),
    startY: Math.min(1, height - 1),
    encounterRate: 0,
  };
}

function dungeonState(floor = testFloor()): GameState {
  const state = createGameState(floor);
  state.mode = "dungeon";
  state.player = { x: floor.startX, y: floor.startY, facing: 0 };
  return state;
}

describe("map overlay visibility state", () => {
  it("toggles during ordinary dungeon exploration", () => {
    const overlay = createMapOverlayState();
    const context = { mode: "dungeon", fullMapVisible: false, blocked: false } as const;

    expect(toggleMapOverlayState(overlay, context)).toBe(true);
    expect(overlay.visible).toBe(true);
    expect(toggleMapOverlayState(overlay, context)).toBe(true);
    expect(overlay.visible).toBe(false);
  });

  it("does not open in combat, a blocking menu, a trap, or the full automap", () => {
    const overlay = createMapOverlayState();

    expect(
      toggleMapOverlayState(overlay, {
        mode: "combat",
        fullMapVisible: false,
        blocked: false,
      }),
    ).toBe(false);
    expect(
      toggleMapOverlayState(overlay, {
        mode: "title",
        fullMapVisible: false,
        blocked: false,
      }),
    ).toBe(false);
    expect(
      toggleMapOverlayState(overlay, {
        mode: "dungeon",
        fullMapVisible: false,
        blocked: true,
      }),
    ).toBe(false);
    expect(
      toggleMapOverlayState(overlay, {
        mode: "dungeon",
        fullMapVisible: true,
        blocked: false,
      }),
    ).toBe(false);
    expect(overlay.visible).toBe(false);
  });

  it("closes on combat/menu entry and stays closed on return to exploration", () => {
    const overlay = { visible: true };
    expect(syncMapOverlayMode(overlay, "combat")).toBe(true);
    expect(overlay.visible).toBe(false);
    expect(syncMapOverlayMode(overlay, "dungeon")).toBe(false);
    expect(overlay.visible).toBe(false);

    overlay.visible = true;
    expect(syncMapOverlayMode(overlay, "title")).toBe(true);
    expect(overlay.visible).toBe(false);
  });

  it("can be explicitly reset for new-game/load teardown", () => {
    const overlay = { visible: true };
    expect(hideMapOverlayState(overlay)).toBe(true);
    expect(hideMapOverlayState(overlay)).toBe(false);
    expect(overlay.visible).toBe(false);
  });
});

describe("buildMapOverlayModel", () => {
  it("copies current floor metadata and player coordinates", () => {
    const state = dungeonState();
    state.player = { x: 2, y: 3, facing: 1 };
    state.explored.add("2,3");

    const model = buildMapOverlayModel(state);
    expect(model.floorId).toBe(41);
    expect(model.floorName).toBe("Test Vault 41");
    expect(model.player).toEqual({ x: 2, y: 3, facing: 1 });
    expect(model.player).not.toBe(state.player);
  });

  it("includes only valid discovered cells and never copies undiscovered features", () => {
    const state = dungeonState();
    state.floor.grid[0]![0]!.tile = "stairs_up";
    state.floor.grid[3]![3]!.tile = "stairs_down";
    state.explored = new Set(["0,0", "bogus", "50,50"]);

    const model = buildMapOverlayModel(state);
    expect(model.cells).toEqual([{ x: 0, y: 0 }]);
    expect(model.landmarks).toEqual([{ x: 0, y: 0, kind: "stairs-up" }]);
  });

  it("normalizes shared edges and places a door on the correct grid edge", () => {
    const state = dungeonState();
    state.explored = new Set(["1,1", "2,1"]);

    const model = buildMapOverlayModel(state);
    const sharedDoor = model.edges.filter(
      (edge) => edge.axis === "vertical" && edge.gridX === 2 && edge.gridY === 1,
    );
    expect(sharedDoor).toEqual([
      { axis: "vertical", gridX: 2, gridY: 1, type: "door" },
    ]);
  });

  it("distinguishes locked doors by type without relying on color", () => {
    const state = dungeonState();
    state.floor.grid[1]![1]!.e = "locked";
    state.floor.grid[1]![2]!.w = "locked";
    state.explored = new Set(["1,1", "2,1"]);

    const model = buildMapOverlayModel(state);
    expect(model.edges).toContainEqual({
      axis: "vertical",
      gridX: 2,
      gridY: 1,
      type: "locked",
    });
  });

  it("hides untriggered events and NPCs until met", () => {
    const state = dungeonState();
    const npc: NPCDef = {
      id: "keeper",
      name: "Keeper",
      title: "of the Door",
      x: 1,
      y: 2,
      greeting: "Halt.",
      returnGreeting: "Still here?",
      topics: [],
      trades: [],
      combatEnemyIds: [],
    };
    state.floor.npcs = [npc];
    state.floor.grid[2]![1]!.tile = "npc";
    state.floor.grid[2]![2]!.tile = "event";
    state.explored = new Set(["1,2", "2,2"]);

    expect(buildMapOverlayModel(state).landmarks).toEqual([]);
    state.talkedToNPCs.push("keeper");
    expect(buildMapOverlayModel(state).landmarks).toEqual([
      { x: 1, y: 2, kind: "npc" },
    ]);
    state.killedNPCs.push("keeper");
    expect(buildMapOverlayModel(state).landmarks).toEqual([]);
  });

  it("shows discovered treasure as closed or opened from progression state", () => {
    const state = dungeonState();
    state.floor.grid[2]![2]!.tile = "treasure";
    state.floor.treasures = [{ x: 2, y: 2, itemIds: ["healing-potion"] }];
    state.explored.add("2,2");

    expect(buildMapOverlayModel(state).landmarks).toContainEqual({
      x: 2,
      y: 2,
      kind: "treasure",
    });
    state.lootTaken[state.floor.id] = new Set(["2,2"]);
    state.floor.treasures[0]!.itemIds = [];
    expect(buildMapOverlayModel(state).landmarks).toContainEqual({
      x: 2,
      y: 2,
      kind: "treasure-open",
    });
  });

  it("replaces the model on a floor transition and restores floor-specific discovery", () => {
    const first = testFloor(41);
    const second = testFloor(42);
    const state = dungeonState(first);
    state.explored = new Set(["1,1", "2,1"]);
    state.exploredByFloor[42] = ["0,0"];

    transitionToFloor(state, second, 0, 0, 2, { autosave: false });
    const model = buildMapOverlayModel(state);
    expect(model.floorId).toBe(42);
    expect(model.player).toEqual({ x: 0, y: 0, facing: 2 });
    expect(model.cells).toEqual([{ x: 0, y: 0 }]);
    expect(state.exploredByFloor[41]).toEqual(["1,1", "2,1"]);
  });

  it("uses the existing save data and adds no persisted overlay-open flag", () => {
    const floor = findFloor(1)!;
    const state = dungeonState(floor);
    state.explored = new Set([`${floor.startX},${floor.startY}`]);
    const json = serialize(state);
    const restored = deserialize(json)!;

    expect(json).not.toContain("mapOverlay");
    expect(buildMapOverlayModel(restored).cells).toEqual([
      { x: floor.startX, y: floor.startY },
    ]);
  });
});

describe("map overlay viewport geometry", () => {
  function geometryModel(width: number, height: number, x: number, y: number) {
    return { width, height, player: { x, y, facing: 0 as Facing } };
  }

  it("uses integer cell and origin coordinates", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(30, 30, 15, 15),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    expect(Number.isInteger(viewport.cellSize)).toBe(true);
    expect(Number.isInteger(viewport.originX)).toBe(true);
    expect(Number.isInteger(viewport.originY)).toBe(true);
    expect(viewport.cellSize).toBeGreaterThanOrEqual(MAP_OVERLAY_CONFIG.minimumCellSize);
    expect(viewport.visibleColumns).toBeGreaterThanOrEqual(9);
    expect(viewport.visibleRows).toBeGreaterThanOrEqual(9);
  });

  it("centers the camera around the player on a large floor", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(40, 40, 20, 20),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    expect(20 - viewport.minX).toBeCloseTo(viewport.visibleColumns / 2, 0);
    expect(20 - viewport.minY).toBeCloseTo(viewport.visibleRows / 2, 0);
    expect(viewport.maxX).toBeLessThan(40);
    expect(viewport.maxY).toBeLessThan(40);
  });

  it("clamps at the northwestern and southeastern floor edges", () => {
    const nw = computeMapOverlayViewport(
      geometryModel(40, 40, 0, 0),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    expect(nw.minX).toBe(0);
    expect(nw.minY).toBe(0);

    const se = computeMapOverlayViewport(
      geometryModel(40, 40, 39, 39),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    expect(se.maxX).toBe(39);
    expect(se.maxY).toBe(39);
  });

  it("fits and centers an entire small floor at the maximum readable cell size", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(5, 4, 2, 2),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    expect(viewport.visibleColumns).toBe(5);
    expect(viewport.visibleRows).toBe(4);
    expect(viewport.cellSize).toBe(MAP_OVERLAY_CONFIG.maximumCellSize);
    expect(viewport.minX).toBe(0);
    expect(viewport.minY).toBe(0);
  });

  it("is north-up: increasing map y always moves down on screen", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(20, 20, 10, 10),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    const northCell = cellToOverlayRect(viewport, 10, 9);
    const southCell = cellToOverlayRect(viewport, 10, 11);
    expect(northCell.y).toBeLessThan(southCell.y);
    expect(northCell.x).toBe(southCell.x);
  });

  it("keeps every directional player-marker pixel inside the current cell", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(20, 20, 10, 10),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    const cellRect = cellToOverlayRect(viewport, 10, 10);

    for (const facing of [0, 1, 2, 3] as Facing[]) {
      const rects = playerMarkerRects(viewport, { x: 10, y: 10, facing });
      expect(rects.length).toBeGreaterThan(0);
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(cellRect.x);
        expect(rect.y).toBeGreaterThanOrEqual(cellRect.y);
        expect(rect.x + rect.width).toBeLessThanOrEqual(cellRect.x + cellRect.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(cellRect.y + cellRect.height);
      }
    }
  });

  it("maps the four facings to distinct pixel-arrow orientations", () => {
    const viewport = computeMapOverlayViewport(
      geometryModel(20, 20, 10, 10),
      MAP_OVERLAY_CONFIG.canvasWidth,
      MAP_OVERLAY_CONFIG.canvasHeight,
    );
    const extents = ([0, 1, 2, 3] as Facing[]).map((facing) => {
      const rects = playerMarkerRects(viewport, { x: 10, y: 10, facing });
      return rects.map(({ x, y }) => `${x},${y}`).join("|");
    });
    expect(new Set(extents).size).toBe(4);
  });
});
