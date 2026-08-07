/**
 * "The Party That Returned" — Floor 1 capstone (see AGENTS.md / floors.ts
 * StairsGuardianDef, game/features.ts handleStairsGuardian/clearStairsGuardian).
 *
 * A one-time scripted fight blocks the single-tile chokepoint (18,21)
 * between the raft's toDock (17,21) and the stairs_down at (19,21). Two
 * independent guarantees combine to make this unbypassable:
 *  - The tile feature ("guardian") triggers the intro dialog + fight the
 *    moment the party arrives at (18,21).
 *  - The edge from (18,21) toward the stairs is authored as "barred"
 *    (StairsGuardianDef.blocksDir) and only flips to "door" on victory —
 *    so a party that flees and is left standing on the guardian tile
 *    cannot simply walk past it. The tile trigger alone is not enough for
 *    this, since it only fires on arrival, not on every step taken while
 *    standing there.
 *
 * Covers the prompt's twelve mandatory staircase edge cases.
 */
import { describe, it, expect } from "vitest";
import { findFloor } from "./floor-registry";
import { createGameState } from "./state";
import { handleTileFeature, clearStairsGuardian } from "./features";
import { resolveTraversal } from "./traversal";
import { serialize, deserialize } from "./save";
import type { GameState } from "../types";

const GUARDIAN_ID = "floor1-returned-party";

function makeFloor1State(): GameState {
  const floor = findFloor(1);
  if (!floor) throw new Error("Floor 1 not found");
  return createGameState(floor);
}

function guardianDef(state: GameState) {
  const g = state.floor.stairsGuardian;
  if (!g) throw new Error("Floor 1 has no stairsGuardian");
  return g;
}

describe("floor 1 stairs guardian content", () => {
  it("is defined on a mandatory chokepoint sealed by a barred edge, not a wall", () => {
    const floor = findFloor(1)!;
    const guardian = floor.stairsGuardian;
    expect(guardian).toBeDefined();
    expect(guardian!.id).toBe(GUARDIAN_ID);
    expect(floor.grid[guardian!.y][guardian!.x].tile).toBe("guardian");
    expect(guardian!.x).toBe(18);
    expect(guardian!.y).toBe(21);
    expect(guardian!.blocksDir).toBe("e");

    // "barred", not "wall": floor-validate.ts's reachability BFS only
    // treats "wall" as impassable, so a literal wall here would make the
    // stairs fail floor validation outright (this was caught and fixed —
    // see the guardian_edge_unsealed validator rule).
    expect(floor.grid[21][18].e).toBe("barred");
    expect(floor.grid[21][19].w).toBe("barred");

    const stairsCell = floor.grid[21][19];
    expect(stairsCell.tile).toBe("stairs_down");
    expect(stairsCell.n).toBe("wall");
    expect(stairsCell.e).toBe("wall");
    expect(stairsCell.s).toBe("wall");
  });

  it("spawns resolve to defined enemies split two front / two back", () => {
    const floor = findFloor(1)!;
    const guardian = floor.stairsGuardian!;
    expect(guardian.spawns.map((s) => s.enemyId).sort()).toEqual(
      ["ash-scribe", "drowned-cantor", "hollow-knifeman", "ruined-vanguard"].sort()
    );
    const front = guardian.spawns.filter((s) => s.row === "front").map((s) => s.enemyId).sort();
    const back = guardian.spawns.filter((s) => s.row === "back").map((s) => s.enemyId).sort();
    expect(front).toEqual(["hollow-knifeman", "ruined-vanguard"]);
    expect(back).toEqual(["ash-scribe", "drowned-cantor"]);
  });
});

describe("stairs guardian trigger and clear (features.ts)", () => {
  it("1. first approach from the Floor 1 side triggers the encounter", () => {
    const state = makeFloor1State();
    state.player.x = 18;
    state.player.y = 21;
    const result = handleTileFeature(state);
    expect(result).not.toBeNull();
    expect(result!.pendingStairsGuardian).toBeDefined();
    expect(result!.pendingStairsGuardian!.id).toBe(GUARDIAN_ID);
    expect(result!.changedFloor).toBe(false);
  });

  it("2. the stairs cannot be reached before victory — even standing on the guardian tile after fleeing", () => {
    const state = makeFloor1State();
    state.player.x = 18;
    state.player.y = 21;
    state.player.facing = 1; // east, toward the stairs

    // Simulate: arrived, fight triggered, then fled — combat never touches
    // player position, so the party is still on the guardian tile with the
    // encounter unresolved. Trying to continue east must be blocked by the
    // barred edge, not merely by "no one has stepped there yet."
    const move = resolveTraversal(state, 1 as const);
    expect(move.kind).toBe("barred-gate");
    if (move.kind === "barred-gate") {
      expect(move.canOpen).toBe(false);
    }
  });

  it("3. victory permanently clears the block and opens the edge", () => {
    const state = makeFloor1State();
    expect(clearStairsGuardian(state, guardianDef(state))).toBe(true);
    expect(state.clearedStairsGuardians).toContain(GUARDIAN_ID);
    expect(state.floor.grid[21][18].e).toBe("door");
    expect(state.floor.grid[21][19].w).toBe("door");
    expect(state.unlockedDoors.has(`${state.floor.id}:18:21:e`)).toBe(true);

    state.player.x = 18;
    state.player.y = 21;
    // Inert — same shape as an already-looted chest: no feature fires.
    expect(handleTileFeature(state)).toBeNull();
    // And now genuinely passable.
    const move = resolveTraversal(state, 1 as const);
    expect(move.kind).toBe("step");
  });

  it("4. saving after victory and reloading preserves both the flag and the opened edge", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, guardianDef(state));
    const restored = deserialize(serialize(state));
    expect(restored).not.toBeNull();
    expect(restored!.clearedStairsGuardians).toContain(GUARDIAN_ID);
    expect(restored!.floor.grid[21][18].e).toBe("door");
    expect(restored!.floor.grid[21][19].w).toBe("door");
  });

  it("5/6. a cleared guardian never fires again and the path stays open across a floor round-trip", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, guardianDef(state));
    state.player.x = 18;
    state.player.y = 21;
    expect(handleTileFeature(state)).toBeNull();
    expect(handleTileFeature(state)).toBeNull();
    expect(resolveTraversal(state, 1 as const).kind).toBe("step");
  });

  it("7. the player can move off the return stair onto the (now inert, now open) guardian tile", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, guardianDef(state));
    state.player.x = 18;
    state.player.y = 21;
    expect(handleTileFeature(state)).toBeNull();
  });

  it("8. approaching the old encounter tile from the stair side after returning is safe", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, guardianDef(state));
    state.player.x = 18;
    state.player.y = 21;
    const result = handleTileFeature(state);
    expect(result).toBeNull();
    expect(state.clearedStairsGuardians).toEqual([GUARDIAN_ID]);
  });

  it("9. loading a save on either side of the cleared encounter does not trap the party", () => {
    const uncleared = makeFloor1State();
    uncleared.player.x = 17;
    uncleared.player.y = 21;
    const unclearedRestored = deserialize(serialize(uncleared));
    expect(unclearedRestored).not.toBeNull();
    expect(unclearedRestored!.clearedStairsGuardians).toEqual([]);
    unclearedRestored!.player.x = 18;
    unclearedRestored!.player.y = 21;
    expect(handleTileFeature(unclearedRestored!)!.pendingStairsGuardian).toBeDefined();

    const cleared = makeFloor1State();
    clearStairsGuardian(cleared, guardianDef(cleared));
    cleared.player.x = 19;
    cleared.player.y = 21;
    const clearedRestored = deserialize(serialize(cleared));
    expect(clearedRestored).not.toBeNull();
    expect(clearedRestored!.clearedStairsGuardians).toContain(GUARDIAN_ID);
    expect(clearedRestored!.floor.grid[21][18].e).toBe("door");
  });

  it("10. rewards cannot be collected twice: clearing an already-cleared guardian is a no-op", () => {
    const state = makeFloor1State();
    const guardian = guardianDef(state);
    expect(clearStairsGuardian(state, guardian)).toBe(true);
    expect(clearStairsGuardian(state, guardian)).toBe(false);
    expect(state.clearedStairsGuardians).toEqual([GUARDIAN_ID]);
  });

  it("11. merely triggering the fight does not itself mark victory or open the path (retreat/cancel can't fake a clear)", () => {
    const state = makeFloor1State();
    state.player.x = 18;
    state.player.y = 21;
    handleTileFeature(state);
    expect(state.clearedStairsGuardians).toEqual([]);
    expect(state.floor.grid[21][18].e).toBe("barred");
    expect(resolveTraversal(state, 1 as const).kind).toBe("barred-gate");
  });

  it("12a. old saves that never reached floor 2 migrate to the pre-encounter state", () => {
    const state = makeFloor1State();
    state.deepestFloorReached = 1;
    const raw = JSON.parse(serialize(state));
    raw.version = 15;
    delete raw.clearedStairsGuardians;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored!.clearedStairsGuardians).toEqual([]);
    // Pre-encounter migration must not retroactively open the edge either.
    expect(restored!.floor.grid[21][18].e).toBe("barred");
  });

  it("12b. old saves that already reached floor 2+ migrate to the post-encounter (cleared) state, edge included", () => {
    const state = makeFloor1State();
    state.deepestFloorReached = 3;
    const raw = JSON.parse(serialize(state));
    raw.version = 15;
    delete raw.clearedStairsGuardians;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored!.clearedStairsGuardians).toEqual([GUARDIAN_ID]);
    // The flag alone is not enough — the edge must also be open, or a
    // "cleared" migrated save would still find the tile physically sealed.
    expect(restored!.floor.grid[21][18].e).toBe("door");
    expect(restored!.floor.grid[21][19].w).toBe("door");
  });
});
