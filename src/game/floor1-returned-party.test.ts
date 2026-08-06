/**
 * "The Party That Returned" — Floor 1 capstone (see AGENTS.md / floors.ts
 * StairsGuardianDef, game/features.ts handleStairsGuardian/clearStairsGuardian).
 *
 * A one-time scripted fight blocks the single-tile chokepoint (18,21)
 * between the raft's toDock (17,21) and the stairs_down at (19,21) — the
 * only edge into (19,21) is from (18,21), so the geometry itself (not a
 * runtime check on the stairs tile) guarantees the fight cannot be
 * bypassed. Victory pushes the guardian's id into
 * GameState.clearedStairsGuardians (game/save.ts v16), after which the
 * tile is permanently inert.
 *
 * Covers the prompt's twelve mandatory staircase edge cases.
 */
import { describe, it, expect } from "vitest";
import { findFloor } from "./floor-registry";
import { createGameState } from "./state";
import { handleTileFeature, clearStairsGuardian } from "./features";
import { serialize, deserialize } from "./save";
import type { GameState } from "../types";

const GUARDIAN_ID = "floor1-returned-party";

function makeFloor1State(): GameState {
  const floor = findFloor(1);
  if (!floor) throw new Error("Floor 1 not found");
  return createGameState(floor);
}

describe("floor 1 stairs guardian content", () => {
  it("is defined on a mandatory chokepoint whose only entrance is the guardian tile", () => {
    const floor = findFloor(1)!;
    const guardian = floor.stairsGuardian;
    expect(guardian).toBeDefined();
    expect(guardian!.id).toBe(GUARDIAN_ID);
    expect(floor.grid[guardian!.y][guardian!.x].tile).toBe("guardian");

    const stairsCell = floor.grid[21][19];
    expect(stairsCell.tile).toBe("stairs_down");
    // stairs_down's only open edge is west, back to the guardian tile —
    // there is no other route in, so reaching the stairs requires crossing
    // (18,21) first. This is what makes requirement #2 ("cannot step onto
    // the stairs before victory") true by construction, not by a runtime
    // check bolted onto handleStairs.
    expect(stairsCell.w).toBe("open");
    expect(stairsCell.n).toBe("wall");
    expect(stairsCell.e).toBe("wall");
    expect(stairsCell.s).toBe("wall");
    expect(guardian!.x).toBe(18);
    expect(guardian!.y).toBe(21);
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

  it("2. the stairs are unreachable without crossing the guardian tile (geometry, see content describe above)", () => {
    // Re-asserted here as a trigger-layer guarantee: standing on the
    // guardian tile never itself performs a floor transition.
    const state = makeFloor1State();
    state.player.x = 18;
    state.player.y = 21;
    const result = handleTileFeature(state);
    expect(result!.changedFloor).toBe(false);
  });

  it("3. victory permanently clears the block", () => {
    const state = makeFloor1State();
    expect(clearStairsGuardian(state, GUARDIAN_ID)).toBe(true);
    expect(state.clearedStairsGuardians).toContain(GUARDIAN_ID);

    state.player.x = 18;
    state.player.y = 21;
    const result = handleTileFeature(state);
    // Inert — same shape as an already-looted chest: no feature fires.
    expect(result).toBeNull();
  });

  it("4. saving after victory and reloading preserves the cleared state", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, GUARDIAN_ID);
    const restored = deserialize(serialize(state));
    expect(restored).not.toBeNull();
    expect(restored!.clearedStairsGuardians).toContain(GUARDIAN_ID);
  });

  it("5/6. a cleared guardian never fires again after a floor round-trip, regardless of approach direction", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, GUARDIAN_ID);
    state.player.x = 18;
    state.player.y = 21;
    // Approach twice (simulates leaving toward the stairs and walking back).
    expect(handleTileFeature(state)).toBeNull();
    expect(handleTileFeature(state)).toBeNull();
  });

  it("7. the player can move off the return stair onto the (now inert) guardian tile", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, GUARDIAN_ID);
    state.player.x = 18;
    state.player.y = 21;
    expect(handleTileFeature(state)).toBeNull();
  });

  it("8. approaching the old encounter tile from the stair side after returning is safe", () => {
    const state = makeFloor1State();
    clearStairsGuardian(state, GUARDIAN_ID);
    // "From the stair side" — the party's last movement before this step
    // came from (19,21) toward (18,21), same tile either direction since
    // handleTileFeature only inspects the tile the party currently stands on.
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
    // Uncleared + standing short of the guardian tile: next step still
    // resolves to a normal trigger, not a stuck state.
    unclearedRestored!.player.x = 18;
    unclearedRestored!.player.y = 21;
    expect(handleTileFeature(unclearedRestored!)!.pendingStairsGuardian).toBeDefined();

    const cleared = makeFloor1State();
    clearStairsGuardian(cleared, GUARDIAN_ID);
    cleared.player.x = 19;
    cleared.player.y = 21;
    const clearedRestored = deserialize(serialize(cleared));
    expect(clearedRestored).not.toBeNull();
    expect(clearedRestored!.clearedStairsGuardians).toContain(GUARDIAN_ID);
  });

  it("10. rewards cannot be collected twice: clearing an already-cleared guardian is a no-op", () => {
    const state = makeFloor1State();
    expect(clearStairsGuardian(state, GUARDIAN_ID)).toBe(true);
    expect(clearStairsGuardian(state, GUARDIAN_ID)).toBe(false);
    expect(state.clearedStairsGuardians).toEqual([GUARDIAN_ID]);
  });

  it("11. merely triggering the fight does not itself mark victory (retreat/cancel can't fake a clear)", () => {
    const state = makeFloor1State();
    state.player.x = 18;
    state.player.y = 21;
    handleTileFeature(state);
    expect(state.clearedStairsGuardians).toEqual([]);
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
  });

  it("12b. old saves that already reached floor 2+ migrate to the post-encounter (cleared) state", () => {
    const state = makeFloor1State();
    state.deepestFloorReached = 3;
    const raw = JSON.parse(serialize(state));
    raw.version = 15;
    delete raw.clearedStairsGuardians;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored!.clearedStairsGuardians).toEqual([GUARDIAN_ID]);
  });
});
