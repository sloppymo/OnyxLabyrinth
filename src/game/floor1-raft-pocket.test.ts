/**
 * Softlock validation tests for the Floor 1 raft pocket and traversal system.
 *
 * These tests verify that:
 * 1. The raft pocket (chute drop destination) is escapable via the barred gate.
 * 2. The raft route only triggers when the player has the raft key item.
 * 3. The barred gate can only be opened from the correct side.
 * 4. The chute drop has a confirm flag.
 * 5. The safe zone suppresses encounter pity.
 * 6. resolveTraversal correctly distinguishes step/blocked/raft/barred-gate.
 */
import { describe, it, expect } from "vitest";
import { findFloor } from "../game/floor-registry";
import { createGameState } from "../game/state";
import {
  resolveTraversal,
  canOpenBarredGate,
  openBarredGate,
  isRaftChannel,
  raftRouteAt,
  type Direction,
} from "../game/traversal";
import { isSafeZoneAt } from "../game/encounters";
import { confirmChuteDrop } from "../game/features";
import type { GameState } from "../types";

function makeFloor1State(): GameState {
  const floor = findFloor(1);
  if (!floor) throw new Error("Floor 1 not found");
  return createGameState(floor);
}

describe("Floor 1 raft pocket softlock validation", () => {
  it("the chute drop at (3,8) targets the raft pocket at (3,22) with confirm=true", () => {
    const floor = findFloor(1)!;
    const chute = floor.chuteDrops?.find((c) => c.x === 3 && c.y === 8);
    expect(chute).toBeDefined();
    expect(chute!.toFloorId).toBe(1);
    expect(chute!.toX).toBe(3);
    expect(chute!.toY).toBe(22);
    expect(chute!.confirm).toBe(true);
  });

  it("the raft pocket at (3,22) is carved and accessible", () => {
    const floor = findFloor(1)!;
    const cell = floor.grid[22][3];
    // The pocket cell should have at least one open edge (north to 3,21)
    expect(cell.n === "open" || cell.s === "open").toBe(true);
  });

  it("the barred gate at (3,21) can be opened from the pocket side (facing east)", () => {
    const state = makeFloor1State();
    // Place the player in the pocket at (3,21) facing east
    state.player.x = 3;
    state.player.y = 21;
    state.player.facing = 1; // East

    // The gate should be openable from this side
    expect(canOpenBarredGate(state.floor, 3, 21, 1 as Direction)).toBe(true);

    // Open the gate
    const opened = openBarredGate(state, 1 as Direction);
    expect(opened).toBe(true);

    // The edge should now be "door"
    expect(state.floor.grid[21][3].e).toBe("door");
    expect(state.floor.grid[21][4].w).toBe("door");
  });

  it("the barred gate CANNOT be opened from the passage side (facing west)", () => {
    const state = makeFloor1State();
    // Place the player at (4,21) facing west — the passage side
    state.player.x = 4;
    state.player.y = 21;
    state.player.facing = 3; // West

    // The gate at (3,21) facing east — but the player is at (4,21).
    // canOpenBarredGate checks the gate AT the player's position.
    // There is no gate at (4,21) facing west — the gate is at (3,21) facing east.
    // So this should return false (no gate at player's position in that direction).
    expect(canOpenBarredGate(state.floor, 4, 21, 3 as Direction)).toBe(false);
  });

  it("the raft pocket is escapable: player can step from (3,22) to (3,21) then open gate", () => {
    const state = makeFloor1State();
    // Player drops into pocket at (3,22)
    state.player.x = 3;
    state.player.y = 22;
    state.player.facing = 0; // North

    // Step north to (3,21)
    const result = resolveTraversal(state, 0 as Direction);
    expect(result.kind).toBe("step");
    if (result.kind === "step") {
      state.player.x = result.x;
      state.player.y = result.y;
    }
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(21);

    // Now facing east, try to step east — should get barred-gate result
    const gateResult = resolveTraversal(state, 1 as Direction);
    expect(gateResult.kind).toBe("barred-gate");
    if (gateResult.kind === "barred-gate") {
      expect(gateResult.canOpen).toBe(true);
    }

    // Open the gate
    openBarredGate(state, 1 as Direction);

    // Now stepping east should succeed
    const stepResult = resolveTraversal(state, 1 as Direction);
    expect(stepResult.kind).toBe("step");
  });

  it("the raft route does NOT trigger without the raft key item", () => {
    const state = makeFloor1State();
    // Place player at the fromDock (13,20) facing east
    state.player.x = 13;
    state.player.y = 20;
    state.player.facing = 1; // East
    state.keyItems = []; // No raft

    const result = resolveTraversal(state, 1 as Direction);
    // Without the raft, stepping east into raft-channel water should block
    expect(result.kind).toBe("blocked");
  });

  it("the raft route triggers WITH the raft key item", () => {
    const state = makeFloor1State();
    // Place player at the fromDock (13,20) facing east
    state.player.x = 13;
    state.player.y = 20;
    state.player.facing = 1; // East
    state.keyItems = ["raft"];

    const result = resolveTraversal(state, 1 as Direction);
    expect(result.kind).toBe("raft");
    if (result.kind === "raft") {
      expect(result.routeId).toBe("f1-raft-east");
      expect(result.reverse).toBe(false);
    }
  });

  it("the raft route is bidirectional (triggers from toDock with raft)", () => {
    const state = makeFloor1State();
    // Place player at the toDock (20,20) facing west
    state.player.x = 20;
    state.player.y = 20;
    state.player.facing = 3; // West
    state.keyItems = ["raft"];

    const result = resolveTraversal(state, 3 as Direction);
    expect(result.kind).toBe("raft");
    if (result.kind === "raft") {
      expect(result.routeId).toBe("f1-raft-east");
      expect(result.reverse).toBe(true);
    }
  });

  it("raft-channel water tiles are marked correctly", () => {
    const floor = findFloor(1)!;
    // (15,20) and (16,20) should be raft channels
    expect(isRaftChannel(floor, 15, 20)).toBe(true);
    expect(isRaftChannel(floor, 16, 20)).toBe(true);
    // (19,15) is a separate water tile, NOT a raft channel
    expect(isRaftChannel(floor, 19, 15)).toBe(false);
  });

  it("the safe zone at the entrance suppresses encounters", () => {
    const floor = findFloor(1)!;
    // The entrance area (11,25) should be in a safe zone
    expect(isSafeZoneAt(floor, 11, 25)).toBe(true);
    expect(isSafeZoneAt(floor, 10, 24)).toBe(true);
    // Outside the safe zone
    expect(isSafeZoneAt(floor, 11, 12)).toBe(false);
  });

  it("confirmChuteDrop executes the chute descent", () => {
    const state = makeFloor1State();
    const drop = { toFloorId: 1, toX: 3, toY: 22 };
    const result = confirmChuteDrop(state, drop);
    expect(result.changedFloor).toBe(true);
    expect(state.player.x).toBe(3);
    expect(state.player.y).toBe(22);
  });

  it("the raft reward event gives the raft key item", () => {
    const floor = findFloor(1)!;
    const raftEvent = floor.events?.find(
      (e) => e.kind === "keyReward" && e.itemId === "raft"
    );
    expect(raftEvent).toBeDefined();
    expect(raftEvent!.x).toBe(19);
    expect(raftEvent!.y).toBe(2);
    expect(raftEvent!.once).toBe(true);
  });

  it("Hot Boi NPC has Attack and Steal disabled", () => {
    const floor = findFloor(1)!;
    const hotBoi = floor.npcs?.find((n) => n.id === "hot-boi");
    expect(hotBoi).toBeDefined();
    expect(hotBoi!.capabilities?.attack).toBe(false);
    expect(hotBoi!.capabilities?.steal).toBe(false);
    expect(hotBoi!.capabilities?.talk).toBe(true);
  });

  it("floor 1 has floorRevision set", () => {
    const floor = findFloor(1)!;
    expect(floor.floorRevision).toBe(2);
  });
});
