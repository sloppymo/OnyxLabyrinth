/**
 * BaseScreenRuntime owns Title/Town/Camp/Game Over/Party Creation/Arena
 * controller instances. Gameplay consequences stay in injected callbacks.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGameState } from "../game/state";
import { findFloor } from "../game/floor-registry";
import { BaseScreenRuntime } from "./base-screen-runtime";
import type { BaseScreenRuntimeDeps } from "./base-screen-runtime";

function makeDeps(state = createGameState(findFloor(1)!)): {
  state: ReturnType<typeof createGameState>;
  deps: BaseScreenRuntimeDeps;
  title: BaseScreenRuntimeDeps["title"];
} {
  const panel = document.createElement("div");
  const title = {
    newGame: vi.fn(),
    continue: vi.fn(),
    openArenaSetup: vi.fn(),
  };
  const deps: BaseScreenRuntimeDeps = {
    state,
    shell: {
      panel: () => panel,
      setMode: (mode) => {
        state.mode = mode;
      },
      show: vi.fn(),
      fadeTo: vi.fn(),
      closeMapIfOpen: vi.fn(),
      setMessage: vi.fn(),
      focusWindow: vi.fn(),
    },
    audio: {
      startTitleMusic: vi.fn(),
      stopTitleMusic: vi.fn(),
      startTownMusic: vi.fn(),
    },
    title,
    town: {
      enterDungeon: vi.fn(),
      openSave: vi.fn(),
    },
    gameOver: {
      continue: vi.fn(),
    },
    camp: {
      end: vi.fn(),
    },
    arena: {
      nextFight: vi.fn(),
      exitToTitle: vi.fn(),
      startAtLevel: vi.fn(),
      openCardTrial: vi.fn(),
    },
    inArena: () => false,
  };
  return { state, deps, title };
}

describe("BaseScreenRuntime", () => {
  it("openTitle owns the title controller without starting combat or dungeon rules", () => {
    const { state, deps, title } = makeDeps();
    const screens = new BaseScreenRuntime(deps);
    screens.openTitle();
    expect(state.mode).toBe("title");
    expect(screens.hasTitle).toBe(true);
    expect(title.newGame).not.toHaveBeenCalled();
  });

  it("dismissTitle clears the title instance used for routing flags", () => {
    const { deps } = makeDeps();
    const screens = new BaseScreenRuntime(deps);
    screens.openTitle();
    screens.dismissTitle();
    expect(screens.hasTitle).toBe(false);
  });

  it("does not import combat or dungeon traversal", () => {
    const source = readFileSync(resolve("src/engine/base-screen-runtime.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\.\/game\/(features|combat|save)"/);
    expect(source).not.toMatch(/from "\.\/(combat-ui|overlay-runtime)"/);
  });
});
