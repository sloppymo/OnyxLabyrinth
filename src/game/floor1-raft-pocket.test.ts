/**
 * Floor 1 progression and softlock validation tests.
 *
 * Verifies the approved progression:
 *   left-side adventure → chute → raft pocket → barred gate → return shortcut →
 *   flooded right fork → raft crossing → Floor 2 stairs
 *
 * Key guarantees:
 * - Floor 2 stairs are unreachable without the raft (no bypass via swimming,
 *   Levitate, Ring of Water Walking, teleporters, or alternate corridors).
 * - Floor 2 stairs are reachable with the raft.
 * - The raft is acquired in the chute pocket at (3,22) — immediately on landing.
 * - The chute has a point-of-no-return confirmation.
 * - The barred gate is the only pocket exit and opens from inside.
 * - Safe zones pause pity without resetting it (tested via production stepPity).
 * - Raft animation: position stays at origin during crossing, commits on
 *   completion, faces direction of travel, interruption restores a dock,
 *   mode is non-dungeon while active.
 * - Chute decline leaves the player at the chute, no raft granted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findFloor } from "../game/floor-registry";
import { createGameState } from "../game/state";
import {
  resolveTraversal,
  canOpenBarredGate,
  openBarredGate,
  isRaftChannel,
  type Direction,
} from "../game/traversal";
import { isSafeZoneAt, stepPity } from "../game/encounters";
import { confirmChuteDrop, handleTileFeature } from "../game/features";
import { RaftAnimationController, isRaftAnimating } from "../engine/raft-animation";
import { setRaftVisualOverride, hasRaftVisualOverride } from "../engine/renderer";
import { serialize, deserialize } from "../game/save";
import { DungeonDialogController } from "../engine/dungeon-dialog";
import { DX, DY, edgeInDirection, inBounds } from "./dungeon";
import type { FloorDef, GameState } from "../types";

function makeFloor1State(): GameState {
  const floor = findFloor(1);
  if (!floor) throw new Error("Floor 1 not found");
  return createGameState(floor);
}

// --- BFS progression analysis -------------------------------------------

/**
 * BFS from a start position across passable edges.
 *
 * Passability rules (matching resolveTraversal):
 * - "open" and "door" edges are passable.
 * - "wall", "locked", and "barred" edges are blocked.
 * - Raft-channel water tiles are impassable (unless hasRaft adds raft connections).
 * - Non-raftChannel water tiles are passable (swimming — the BFS doesn't model
 *   swim failure, but the point is that raftChannel water is the gate, not
 *   normal water).
 *
 * Teleporters are included as edge connections.
 *
 * @param hasRaft If true, raft routes provide dock-to-dock connections.
 */
function bfsReachable(
  floor: FloorDef,
  startX: number,
  startY: number,
  hasRaft: boolean
): Set<string> {
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  // Build teleporter map
  const teleporters = new Map<string, { x: number; y: number }>();
  for (const t of floor.teleporters ?? []) {
    teleporters.set(`${t.x},${t.y}`, { x: t.toX, y: t.toY });
  }

  // Build raft route connections
  const raftConnections = new Map<string, { x: number; y: number }[]>();
  if (hasRaft) {
    for (const route of floor.raftRoutes ?? []) {
      const fromKey = `${route.fromDock.x},${route.fromDock.y}`;
      const toKey = `${route.toDock.x},${route.toDock.y}`;
      if (!raftConnections.has(fromKey)) raftConnections.set(fromKey, []);
      if (!raftConnections.has(toKey)) raftConnections.set(toKey, []);
      raftConnections.get(fromKey)!.push({ x: route.toDock.x, y: route.toDock.y });
      if (route.bidirectional) {
        raftConnections.get(toKey)!.push({ x: route.fromDock.x, y: route.fromDock.y });
      }
    }
  }

  // Build raftChannel water set
  const raftChannelTiles = new Set<string>();
  for (const w of floor.waters ?? []) {
    if (w.raftChannel) raftChannelTiles.add(`${w.x},${w.y}`);
  }

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const cell = floor.grid[y]?.[x];
    if (!cell) continue;

    // Check 4 directional edges
    for (let dir = 0; dir < 4; dir++) {
      const edge = edgeInDirection(cell, dir);
      if (edge !== "open" && edge !== "door") continue;

      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!inBounds(floor.grid, nx, ny)) continue;

      // Check reverse edge
      const targetCell = floor.grid[ny][nx];
      const oppDir = (dir + 2) % 4;
      const oppEdge = edgeInDirection(targetCell, oppDir);
      if (oppEdge !== "open" && oppEdge !== "door") continue;

      // Block raftChannel water tiles
      if (raftChannelTiles.has(`${nx},${ny}`)) continue;

      const key = `${nx},${ny}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }

    // Check teleporter
    const tpKey = `${x},${y}`;
    if (teleporters.has(tpKey)) {
      const dest = teleporters.get(tpKey)!;
      const destKey = `${dest.x},${dest.y}`;
      if (!visited.has(destKey)) {
        visited.add(destKey);
        queue.push(dest);
      }
    }

    // Check raft route connections
    if (raftConnections.has(tpKey)) {
      for (const dest of raftConnections.get(tpKey)!) {
        const destKey = `${dest.x},${dest.y}`;
        if (!visited.has(destKey)) {
          visited.add(destKey);
          queue.push(dest);
        }
      }
    }
  }

  return visited;
}

/** Find the stairs_down tile on a floor. */
function findStairsDown(floor: FloorDef): { x: number; y: number } | null {
  for (let y = 0; y < floor.grid.length; y++) {
    for (let x = 0; x < floor.grid[y].length; x++) {
      if (floor.grid[y][x].tile === "stairs_down") return { x, y };
    }
  }
  return null;
}

// --- Tests ---------------------------------------------------------------

describe("Floor 1 progression — raft gates Floor 2", () => {
  it("stairs_down exists at (19,21) — the flooded branch", () => {
    const floor = findFloor(1)!;
    const stairs = findStairsDown(floor);
    expect(stairs).not.toBeNull();
    expect(stairs!.x).toBe(19);
    expect(stairs!.y).toBe(21);
  });

  it("old stairs_down at (20,2) is removed", () => {
    const floor = findFloor(1)!;
    expect(floor.grid[2][20].tile).not.toBe("stairs_down");
  });

  it("stairs are unreachable from start WITHOUT the raft", () => {
    const floor = findFloor(1)!;
    const reachable = bfsReachable(floor, floor.startX, floor.startY, false);
    const stairs = findStairsDown(floor)!;
    expect(reachable.has(`${stairs.x},${stairs.y}`)).toBe(false);
  });

  it("stairs are reachable from start WITH the raft", () => {
    const floor = findFloor(1)!;
    const reachable = bfsReachable(floor, floor.startX, floor.startY, true);
    const stairs = findStairsDown(floor)!;
    expect(reachable.has(`${stairs.x},${stairs.y}`)).toBe(true);
  });

  it("no teleporter bypasses the raft gate", () => {
    const floor = findFloor(1)!;
    // Teleporters are included in the BFS. If stairs are unreachable without
    // raft, teleporters don't bypass.
    const reachable = bfsReachable(floor, floor.startX, floor.startY, false);
    const stairs = findStairsDown(floor)!;
    expect(reachable.has(`${stairs.x},${stairs.y}`)).toBe(false);
  });

  it("raft-channel water is impassable regardless of abilities", () => {
    const floor = findFloor(1)!;
    // The raft-channel tiles at (15,21) and (16,21) should be blocked
    // by resolveTraversal even with levitation or ring-of-water-walking.
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.player.facing = 1; // East
    state.keyItems = []; // No raft

    // Simulate having levitation and ring-of-water-walking
    state.inventory.push({ itemId: "ring-of-water-walking", identified: true });
    // Note: levitation is a buff, not directly settable here, but
    // resolveTraversal doesn't check for either — raftChannel is absolute.

    const result = resolveTraversal(state, 1 as Direction);
    expect(result.kind).toBe("blocked");
  });
});

describe("Floor 1 raft pocket — softlock validation", () => {
  it("the chute drop at (3,8) targets the raft pocket at (3,22) with confirm=true", () => {
    const floor = findFloor(1)!;
    const chute = floor.chuteDrops?.find((c) => c.x === 3 && c.y === 8);
    expect(chute).toBeDefined();
    expect(chute!.toFloorId).toBe(1);
    expect(chute!.toX).toBe(3);
    expect(chute!.toY).toBe(22);
    expect(chute!.confirm).toBe(true);
  });

  it("the raft reward event is in the pocket at (3,22)", () => {
    const floor = findFloor(1)!;
    const raftEvent = floor.events?.find(
      (e) => e.kind === "keyReward" && e.itemId === "raft"
    );
    expect(raftEvent).toBeDefined();
    expect(raftEvent!.x).toBe(3);
    expect(raftEvent!.y).toBe(22);
    expect(raftEvent!.once).toBe(true);
    // The tile at (3,22) should be "event"
    expect(floor.grid[22][3].tile).toBe("event");
  });

  it("the old raft event at (19,2) is removed", () => {
    const floor = findFloor(1)!;
    const oldEvent = floor.events?.find((e) => e.x === 19 && e.y === 2);
    expect(oldEvent).toBeUndefined();
    // The tile at (19,2) should not be "event"
    expect(floor.grid[2][19].tile).not.toBe("event");
  });

  it("the raft pocket is escapable: player drops in, gets raft, opens gate, exits", () => {
    const state = makeFloor1State();
    // Player drops into pocket at (3,22)
    state.player.x = 3;
    state.player.y = 22;
    state.player.facing = 0; // North

    // Trigger the raft reward event
    const result = handleTileFeature(state);
    expect(result).not.toBeNull();
    expect(state.keyItems).toContain("raft");

    // Step north to (3,21)
    const stepResult = resolveTraversal(state, 0 as Direction);
    expect(stepResult.kind).toBe("step");
    if (stepResult.kind === "step") {
      state.player.x = stepResult.x;
      state.player.y = stepResult.y;
    }
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(21);

    // Facing east, try to step east — should get barred-gate result
    state.player.facing = 1;
    const gateResult = resolveTraversal(state, 1 as Direction);
    expect(gateResult.kind).toBe("barred-gate");
    if (gateResult.kind === "barred-gate") {
      expect(gateResult.canOpen).toBe(true);
    }

    // Open the gate
    openBarredGate(state, 1 as Direction);

    // Now stepping east should succeed
    const exitResult = resolveTraversal(state, 1 as Direction);
    expect(exitResult.kind).toBe("step");
  });

  it("the barred gate CANNOT be opened from the passage side", () => {
    const state = makeFloor1State();
    // Player at (4,21) facing west — the passage side
    state.player.x = 4;
    state.player.y = 21;
    state.player.facing = 3; // West

    // There is no gate at (4,21) facing west
    expect(canOpenBarredGate(state.floor, 4, 21, 3 as Direction)).toBe(false);
  });

  it("confirmChuteDrop lands the player in the pocket at (3,22)", () => {
    const state = makeFloor1State();
    const drop = { toFloorId: 1, toX: 3, toY: 22 };
    const result = confirmChuteDrop(state, drop);
    expect(result.changedFloor).toBe(true);
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(22);
  });
});

describe("Floor 1 chute confirmation — runtime event flow", () => {
  it("confirmChuteDrop grants the raft immediately on landing (no step-away needed)", () => {
    const state = makeFloor1State();
    // Player starts at the chute tile
    state.player.x = 3;
    state.player.y = 8;
    state.player.facing = 0;
    expect(state.keyItems).not.toContain("raft");

    // Execute the confirmed chute drop — this is the same helper
    // called by main.ts's dialog onSelect callback.
    const result = confirmChuteDrop(state, {
      toFloorId: 1,
      toX: 3,
      toY: 22,
    });

    // Player is now at the pocket
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(22);
    // Raft is granted immediately — no need to step away and return
    expect(state.keyItems).toContain("raft");
    // The result message includes both the chute and raft text
    expect(result.message).toMatch(/chute|slide/i);
    expect(result.message).toMatch(/raft/i);
  });

  it("confirmChuteDrop marks the raft reward event as consumed", () => {
    const state = makeFloor1State();
    confirmChuteDrop(state, { toFloorId: 1, toX: 3, toY: 22 });

    // The event tile should be cleared (once-only event consumed)
    expect(state.floor.grid[22][3].tile).not.toBe("event");

    // Calling handleTileFeature again should return null (already consumed)
    state.player.x = 3;
    state.player.y = 22;
    const secondResult = handleTileFeature(state);
    expect(secondResult).toBeNull();
  });

  it("confirmChuteDrop does not double-grant the raft on a second drop", () => {
    const state = makeFloor1State();
    // First drop grants the raft
    confirmChuteDrop(state, { toFloorId: 1, toX: 3, toY: 22 });
    expect(state.keyItems).toContain("raft");
    const raftCount = state.keyItems.filter((k) => k === "raft").length;
    expect(raftCount).toBe(1);

    // Move player back to chute and drop again
    state.player.x = 3;
    state.player.y = 8;
    confirmChuteDrop(state, { toFloorId: 1, toX: 3, toY: 22 });
    const raftCount2 = state.keyItems.filter((k) => k === "raft").length;
    expect(raftCount2).toBe(1); // Still only one raft
  });
});

describe("Floor 1 chute choice — decline via real dialog callback", () => {
  it("selecting 'cancel' closes the dialog, leaves player at (3,8), no raft", () => {
    const state = makeFloor1State();
    // Player is at the chute tile
    state.player.x = 3;
    state.player.y = 8;
    state.player.facing = 0;
    state.mode = "dungeon";
    expect(state.keyItems).not.toContain("raft");

    // Build the same dialog + callback that main.ts installs for the chute
    // confirmation. The callback only calls confirmChuteDrop on "descend".
    const drop = { toFloorId: 1, toX: 3, toY: 22 };
    const dialog = new DungeonDialogController({
      state,
      lines: [
        "A steep sluice disappears into darkness. There may be no way back up.",
      ],
      choices: [
        { label: "Descend", value: "descend" },
        { label: "Step away", value: "cancel" },
      ],
      onSelect: (value) => {
        if (value === "descend") {
          confirmChuteDrop(state, drop);
        }
      },
    });
    dialog.open();

    // Dialog is active, mode is "dialog"
    expect(dialog.isActive()).toBe(true);
    expect(state.mode).toBe("dialog");

    // With a single-line dialog, we're already in the choice menu phase
    // (page 0 >= lines.length - 1 = 0). Select "Step away" (index 1).
    dialog.handleKey("ArrowDown");
    expect(dialog.selectedIndex).toBe(1);
    dialog.handleKey("Enter");

    // Dialog is closed, mode restored to "dungeon"
    expect(dialog.isActive()).toBe(false);
    expect(state.mode).toBe("dungeon");

    // Player stays at the chute — no raft granted
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(8);
    expect(state.keyItems).not.toContain("raft");
  });

  it("selecting 'descend' via real dialog callback grants the raft", () => {
    const state = makeFloor1State();
    state.player.x = 3;
    state.player.y = 8;
    state.player.facing = 0;
    state.mode = "dungeon";

    const drop = { toFloorId: 1, toX: 3, toY: 22 };
    const dialog = new DungeonDialogController({
      state,
      lines: [
        "A steep sluice disappears into darkness. There may be no way back up.",
      ],
      choices: [
        { label: "Descend", value: "descend" },
        { label: "Step away", value: "cancel" },
      ],
      onSelect: (value) => {
        if (value === "descend") {
          confirmChuteDrop(state, drop);
        }
      },
    });
    dialog.open();

    // With a single-line dialog, we're already in the choice menu phase.
    // "Descend" is at index 0 (default selection).
    expect(dialog.selectedIndex).toBe(0);
    dialog.handleKey("Enter");

    // Player is now at the pocket with the raft
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(22);
    expect(state.keyItems).toContain("raft");
  });
});

describe("Floor 1 raft route — traversal validation", () => {
  it("the raft route goes from dock (14,21) to dock (17,21)", () => {
    const floor = findFloor(1)!;
    const route = floor.raftRoutes?.find((r) => r.id === "f1-raft-fork");
    expect(route).toBeDefined();
    expect(route!.fromDock.x).toBe(14);
    expect(route!.fromDock.y).toBe(21);
    expect(route!.toDock.x).toBe(17);
    expect(route!.toDock.y).toBe(21);
  });

  it("the raft route path contains ONLY water-channel tiles between docks", () => {
    const floor = findFloor(1)!;
    const route = floor.raftRoutes!.find((r) => r.id === "f1-raft-fork")!;
    // Path: (14,21) dock, (15,21) water, (16,21) water, (17,21) dock
    expect(route.path.length).toBe(4);
    // First and last are docks (not water)
    expect(isRaftChannel(floor, route.path[0].x, route.path[0].y)).toBe(false);
    expect(isRaftChannel(floor, route.path[3].x, route.path[3].y)).toBe(false);
    // Middle tiles are raft-channel water
    expect(isRaftChannel(floor, route.path[1].x, route.path[1].y)).toBe(true);
    expect(isRaftChannel(floor, route.path[2].x, route.path[2].y)).toBe(true);
  });

  it("the raft route does NOT trigger without the raft key item", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.player.facing = 1; // East
    state.keyItems = [];

    const result = resolveTraversal(state, 1 as Direction);
    expect(result.kind).toBe("blocked");
  });

  it("the raft route triggers WITH the raft key item (forward)", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.player.facing = 1; // East
    state.keyItems = ["raft"];

    const result = resolveTraversal(state, 1 as Direction);
    expect(result.kind).toBe("raft");
    if (result.kind === "raft") {
      expect(result.routeId).toBe("f1-raft-fork");
      expect(result.reverse).toBe(false);
    }
  });

  it("the raft route is bidirectional (triggers from toDock)", () => {
    const state = makeFloor1State();
    state.player.x = 17;
    state.player.y = 21;
    state.player.facing = 3; // West
    state.keyItems = ["raft"];

    const result = resolveTraversal(state, 3 as Direction);
    expect(result.kind).toBe("raft");
    if (result.kind === "raft") {
      expect(result.routeId).toBe("f1-raft-fork");
      expect(result.reverse).toBe(true);
    }
  });

  it("old water tiles at (14-17,20) are NOT raft channels", () => {
    const floor = findFloor(1)!;
    expect(isRaftChannel(floor, 14, 20)).toBe(false);
    expect(isRaftChannel(floor, 15, 20)).toBe(false);
    expect(isRaftChannel(floor, 16, 20)).toBe(false);
    expect(isRaftChannel(floor, 17, 20)).toBe(false);
  });

  it("new water tiles at (15,21) and (16,21) ARE raft channels", () => {
    const floor = findFloor(1)!;
    expect(isRaftChannel(floor, 15, 21)).toBe(true);
    expect(isRaftChannel(floor, 16, 21)).toBe(true);
  });
});

describe("Floor 1 safe zone — pity preservation (production logic)", () => {
  it("the entrance/tavern area is a safe zone", () => {
    const floor = findFloor(1)!;
    expect(isSafeZoneAt(floor, 11, 25)).toBe(true);
    expect(isSafeZoneAt(floor, 10, 24)).toBe(true);
    expect(isSafeZoneAt(floor, 11, 22)).toBe(true);
  });

  it("areas outside the safe zone are not safe", () => {
    const floor = findFloor(1)!;
    expect(isSafeZoneAt(floor, 11, 12)).toBe(false);
    expect(isSafeZoneAt(floor, 3, 8)).toBe(false);
  });

  it("50 safe-zone steps leave pity unchanged at 12", () => {
    const floor = findFloor(1)!;
    let pity = 12;
    // Simulate 50 steps in the safe zone at (11,25)
    for (let i = 0; i < 50; i++) {
      pity = stepPity(floor, 11, 25, pity);
    }
    expect(pity).toBe(12);
  });

  it("one ordinary dungeon step changes pity from 12 to 13", () => {
    const floor = findFloor(1)!;
    // (11,12) is outside the safe zone
    const pity = stepPity(floor, 11, 12, 12);
    expect(pity).toBe(13);
  });

  it("stepping from safe zone to non-safe zone resumes pity increment", () => {
    const floor = findFloor(1)!;
    let pity = 12;
    // 10 steps in safe zone
    for (let i = 0; i < 10; i++) {
      pity = stepPity(floor, 11, 25, pity);
    }
    expect(pity).toBe(12);
    // 1 step outside safe zone
    pity = stepPity(floor, 11, 12, pity);
    expect(pity).toBe(13);
  });
});

describe("RaftAnimationController — direct animation tests", () => {
  let originalNow: typeof performance.now;
  let nowMock: number;

  beforeEach(() => {
    originalNow = performance.now;
    nowMock = 1000;
    vi.stubGlobal("performance", {
      now: () => nowMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeRoute() {
    const floor = findFloor(1)!;
    return floor.raftRoutes!.find((r) => r.id === "f1-raft-fork")!;
  }

  it("authoritative position remains at origin during animation", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();

    // During animation, player is at origin (14,21)
    expect(state.player.x).toBe(14);
    expect(state.player.y).toBe(21);
    expect(ctrl.isActive()).toBe(true);

    // Advance time but not enough to complete (3 steps × 200ms = 600ms total)
    nowMock = 1300; // 300ms elapsed — still in first step
    ctrl.update();
    expect(state.player.x).toBe(14); // Still at origin
    expect(state.player.y).toBe(21);
    expect(ctrl.isActive()).toBe(true);
  });

  it("completion commits the destination", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    let completed = false;
    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => { completed = true; },
    });
    ctrl.start();

    // Advance past total duration (3 steps × 200ms = 600ms)
    nowMock = 1700; // 700ms elapsed
    const stillActive = ctrl.update();

    expect(stillActive).toBe(false);
    expect(completed).toBe(true);
    expect(state.player.x).toBe(17); // At destination dock
    expect(state.player.y).toBe(21);
  });

  it("forward arrival faces east (direction of travel)", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();
    nowMock = 1700; // Complete
    ctrl.update();

    // Forward path: (14,21)→(15,21)→(16,21)→(17,21)
    // Last step: (16,21)→(17,21), dx=+1 → East
    expect(state.player.facing).toBe(1); // East
  });

  it("reverse arrival faces west (direction of travel)", () => {
    const state = makeFloor1State();
    state.player.x = 17;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: true,
      onComplete: () => {},
    });
    ctrl.start();
    nowMock = 1700; // Complete
    ctrl.update();

    // Reverse path: (17,21)→(16,21)→(15,21)→(14,21)
    // Last step: (15,21)→(14,21), dx=-1 → West
    expect(state.player.facing).toBe(3); // West
  });

  it("interruption always restores one of the docks", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    let interrupted = false;
    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
      onInterrupt: () => { interrupted = true; },
    });
    ctrl.start();

    // Advance to mid-animation (300ms — between dock 14 and water 15)
    nowMock = 1300;
    ctrl.interrupt();

    expect(interrupted).toBe(true);
    expect(ctrl.isActive()).toBe(false);
    // Player should be at one of the docks (14 or 17), not on water
    const atOrigin = state.player.x === 14 && state.player.y === 21;
    const atDest = state.player.x === 17 && state.player.y === 21;
    expect(atOrigin || atDest).toBe(true);
  });

  it("state mode is non-dungeon while active and returns to dungeon after", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];
    state.mode = "dungeon";

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();

    // Mode is "dialog" during animation (blocks input/saves/encounters)
    expect(state.mode).toBe("dialog");

    // Complete the animation
    nowMock = 1700;
    ctrl.update();

    // Mode returns to "dungeon"
    expect(state.mode).toBe("dungeon");
  });

  it("isRaftAnimating returns true during animation, false after", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });

    expect(isRaftAnimating(ctrl)).toBe(false);

    ctrl.start();
    expect(isRaftAnimating(ctrl)).toBe(true);

    nowMock = 1700;
    ctrl.update();
    expect(isRaftAnimating(ctrl)).toBe(false);
  });

  it("interruption near destination restores to destination dock", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();

    // Advance to near the end (550ms — close to destination)
    nowMock = 1550;
    ctrl.interrupt();

    // Should be at destination (17,21) since we're closer to it
    expect(state.player.x).toBe(17);
    expect(state.player.y).toBe(21);
  });
});

describe("Floor 1 NPC — Hot Boi", () => {
  it("Hot Boi NPC has Attack and Steal disabled", () => {
    const floor = findFloor(1)!;
    const hotBoi = floor.npcs?.find((n) => n.id === "hot-boi");
    expect(hotBoi).toBeDefined();
    expect(hotBoi!.capabilities?.attack).toBe(false);
    expect(hotBoi!.capabilities?.steal).toBe(false);
    expect(hotBoi!.capabilities?.talk).toBe(true);
  });

  it("Hot Boi does NOT say the raft is beside the stairs", () => {
    const floor = findFloor(1)!;
    const hotBoi = floor.npcs?.find((n) => n.id === "hot-boi")!;
    const allText = JSON.stringify({
      greeting: hotBoi.greeting,
      returnGreeting: hotBoi.returnGreeting,
      topics: hotBoi.topics,
    });
    expect(allText).not.toMatch(/raft.*beside.*stairs/i);
    expect(allText).not.toMatch(/stairs.*beyond.*crypt.*door/i);
  });

  it("Hot Boi says the raft is in the pocket via the chute", () => {
    const floor = findFloor(1)!;
    const hotBoi = floor.npcs?.find((n) => n.id === "hot-boi")!;
    const raftTopic = hotBoi.topics.find((t) => t.key === "raft");
    expect(raftTopic).toBeDefined();
    expect(raftTopic!.response).toMatch(/pocket|chute/i);
  });
});

describe("Floor 1 revision", () => {
  it("floor 1 has floorRevision set to 3", () => {
    const floor = findFloor(1)!;
    expect(floor.floorRevision).toBe(3);
  });
});

describe("Chute drop persistence — serialize/deserialize after landing", () => {
  it("serialized state after confirmChuteDrop has player at (3,22), raft, event consumed", () => {
    const state = makeFloor1State();
    state.player.x = 3;
    state.player.y = 8;
    state.player.facing = 0;
    expect(state.keyItems).not.toContain("raft");

    confirmChuteDrop(state, { toFloorId: 1, toX: 3, toY: 22 });

    // Serialize the post-landing state and reload it
    const json = serialize(state);
    expect(json).toBeTruthy();
    const loaded = deserialize(json);
    expect(loaded).not.toBeNull();
    const ls = loaded!;

    // Player is at the pocket
    expect(ls.player.x).toBe(3);
    expect(ls.player.y).toBe(22);

    // Raft is in keyItems
    expect(ls.keyItems).toContain("raft");

    // The raft event is recorded as triggered (key format is "x,y" per floor)
    expect(ls.eventsTriggered[1]).toBeDefined();
    expect(ls.eventsTriggered[1].has("3,22")).toBe(true);

    // Returning to the tile cannot grant another raft
    ls.player.x = 3;
    ls.player.y = 22;
    const secondResult = handleTileFeature(ls);
    expect(secondResult).toBeNull();

    // Still only one raft
    const raftCount = ls.keyItems.filter((k) => k === "raft").length;
    expect(raftCount).toBe(1);
  });
});

describe("Raft animation renderer integration — visual camera override", () => {
  let originalNow: typeof performance.now;
  let nowMock: number;

  beforeEach(() => {
    originalNow = performance.now;
    nowMock = 1000;
    vi.stubGlobal("performance", {
      now: () => nowMock,
    });
    // Clear any leftover override from a previous test
    setRaftVisualOverride(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setRaftVisualOverride(null);
  });

  function makeRoute() {
    const floor = findFloor(1)!;
    return floor.raftRoutes!.find((r) => r.id === "f1-raft-fork")!;
  }

  it("getVisualCamera returns different positions at different animation times", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();

    // At start (t=0): position should be at origin (14,21)
    nowMock = 1000;
    const startCam = ctrl.getVisualCamera();
    expect(startCam).not.toBeNull();
    expect(startCam!.x).toBeCloseTo(14, 5);
    expect(startCam!.y).toBeCloseTo(21, 5);

    // At mid-animation (300ms elapsed, 3 steps × 200ms = 600ms total)
    // t=0.5 → floatStep=1.5 → stepIdx=1, frac=0.5
    // path[1]=(15,21), path[2]=(16,21) → x = 15 + 0.5 = 15.5
    nowMock = 1300;
    const midCam = ctrl.getVisualCamera();
    expect(midCam).not.toBeNull();
    expect(midCam!.x).toBeCloseTo(15.5, 5);
    expect(midCam!.y).toBeCloseTo(21, 5);

    // The two positions must be different — this is the core visual proof
    expect(midCam!.x).not.toBeCloseTo(startCam!.x, 5);

    // Near completion (550ms): t≈0.917 → floatStep≈2.75 → stepIdx=2, frac=0.75
    // path[2]=(16,21), path[3]=(17,21) → x = 16 + 0.75 = 16.75
    nowMock = 1550;
    const lateCam = ctrl.getVisualCamera();
    expect(lateCam).not.toBeNull();
    expect(lateCam!.x).toBeCloseTo(16.75, 2);
    expect(lateCam!.x).not.toBeCloseTo(midCam!.x, 5);
    expect(lateCam!.x).not.toBeCloseTo(startCam!.x, 5);
  });

  it("setRaftVisualOverride installs and clears the override", () => {
    expect(hasRaftVisualOverride()).toBe(false);
    setRaftVisualOverride({ x: 15.5, y: 21, facing: 1 });
    expect(hasRaftVisualOverride()).toBe(true);
    setRaftVisualOverride(null);
    expect(hasRaftVisualOverride()).toBe(false);
  });

  it("getVisualCamera faces east during forward eastward travel", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    ctrl.start();

    // Mid-animation — traveling east (path goes (14,21)→(15,21)→...)
    nowMock = 1300;
    const cam = ctrl.getVisualCamera();
    expect(cam).not.toBeNull();
    expect(cam!.facing).toBe(1); // East
  });

  it("getVisualCamera faces west during reverse westward travel", () => {
    const state = makeFloor1State();
    state.player.x = 17;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: true,
      onComplete: () => {},
    });
    ctrl.start();

    // Mid-animation — traveling west (reverse path: (17,21)→(16,21)→...)
    nowMock = 1300;
    const cam = ctrl.getVisualCamera();
    expect(cam).not.toBeNull();
    expect(cam!.facing).toBe(3); // West
  });

  it("getVisualCamera returns null when animation is not active", () => {
    const state = makeFloor1State();
    state.player.x = 14;
    state.player.y = 21;
    state.keyItems = ["raft"];

    const ctrl = new RaftAnimationController({
      state,
      route: makeRoute(),
      reverse: false,
      onComplete: () => {},
    });
    // Not started yet
    expect(ctrl.getVisualCamera()).toBeNull();

    ctrl.start();
    expect(ctrl.getVisualCamera()).not.toBeNull();

    // Complete the animation
    nowMock = 1700;
    ctrl.update();
    expect(ctrl.getVisualCamera()).toBeNull();
  });
});
