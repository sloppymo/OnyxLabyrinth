import { describe, it, expect } from "vitest";
import { createGameState } from "../game/state";
import { findFloor } from "../game/floor-registry";
import {
  resolveContextualPrompt,
  formatContextualPrompt,
} from "./contextual-prompt";

describe("resolveContextualPrompt", () => {
  it("offers Unlock when facing a locked edge (pad glyph A)", () => {
    const floor = findFloor(1)!;
    const state = createGameState(floor);
    const cell = state.floor.grid[state.player.y][state.player.x];
    cell.n = "locked";
    state.player.facing = 0;
    const p = resolveContextualPrompt(state, "gamepad");
    expect(p).toEqual({ glyph: "A", verb: "Unlock", action: "unlock" });
    expect(formatContextualPrompt(p!)).toBe("A Unlock");
  });

  it("uses U for Unlock on keyboard", () => {
    const floor = findFloor(1)!;
    const state = createGameState(floor);
    const cell = state.floor.grid[state.player.y][state.player.x];
    cell.n = "locked";
    state.player.facing = 0;
    const p = resolveContextualPrompt(state, "keyboard");
    expect(p?.glyph).toBe("U");
  });

  it("does not offer Unlock for a base-storey lock while on an upper landing (bug_002 regression)", () => {
    const floor = findFloor(1)!;
    const state = createGameState(floor);
    const cell = state.floor.grid[state.player.y][state.player.x];
    cell.n = "locked";
    state.player.facing = 0;
    state.floor.verticalLandings = [
      {
        id: "over-lock",
        x: state.player.x,
        y: state.player.y,
        z: 1,
        edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
      },
    ];
    state.player.z = 1;
    expect(resolveContextualPrompt(state, "gamepad")).toBeNull();
  });

  it("returns null while a trap prompt is pending", () => {
    const floor = findFloor(1)!;
    const state = createGameState(floor);
    state.pendingTrap = {
      x: state.player.x,
      y: state.player.y,
      trapType: "gas",
      inspected: false,
    };
    const cell = state.floor.grid[state.player.y][state.player.x];
    cell.n = "locked";
    state.player.facing = 0;
    expect(resolveContextualPrompt(state, "gamepad")).toBeNull();
  });
});
