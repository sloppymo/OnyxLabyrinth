/**
 * createApplication is the composition root: GameState, UiStack, OverlayRuntime,
 * and physical input. It must not become the owner of gameplay.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findFloor } from "../game/floor-registry";
import { createApplication } from "./application";
import type { OverlayRuntimeDeps } from "./overlay-runtime";
import type { BaseScreenRuntimeDeps } from "./base-screen-runtime";

function overlayWire(): Omit<OverlayRuntimeDeps, "state" | "uiStack"> {
  const panel = document.createElement("div");
  return {
    shell: {
      panel: () => panel,
      presentBlocking: vi.fn(),
      restore: vi.fn(),
      showDialog: vi.fn(),
      showDungeon: vi.fn(),
      showNpcDialogue: vi.fn(),
      hideNpcDialogue: vi.fn(),
      syncMapOverlayTitle: vi.fn(),
      setMessage: vi.fn(),
      closeMapIfOpen: vi.fn(),
    },
    dungeon: {
      camp: vi.fn(),
      returnToTown: vi.fn(),
      toggleMap: vi.fn(),
      unlock: vi.fn(),
      canOpenActionRing: () => true,
    },
    session: {
      applyLoadedState: vi.fn(),
      persist: vi.fn(),
      reopenTown: vi.fn(),
    },
    combat: {
      startNpcFight: vi.fn(),
    },
    trap: {
      isPending: () => false,
      inspected: () => false,
      inspect: vi.fn(),
      disarm: vi.fn(() => ({ stillPending: false })),
      open: vi.fn(),
      leave: vi.fn(),
    },
    audio: {
      stopDungeon: vi.fn(),
      startTavernMusic: vi.fn(),
      stopTavernMusic: vi.fn(),
      startDungeon: vi.fn(),
    },
    inArena: () => false,
    setMode: vi.fn(),
    onDialogClosed: vi.fn(),
  };
}

function screensWire(): Omit<BaseScreenRuntimeDeps, "state"> {
  const panel = document.createElement("div");
  return {
    shell: {
      panel: () => panel,
      setMode: vi.fn(),
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
    title: {
      newGame: vi.fn(),
      continue: vi.fn(),
      openArenaSetup: vi.fn(),
    },
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
}

describe("createApplication", () => {
  it("constructs GameState, UiStack, OverlayRuntime, and controller input", () => {
    const floor = findFloor(1)!;
    const onInput = vi.fn();
    const app = createApplication({
      initialFloor: floor,
      overlay: overlayWire(),
      screens: screensWire(),
      onInput,
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
    });
    expect(app.state.floor.id).toBe(1);
    expect(app.uiStack.top()).toBeNull();
    expect(app.overlays.hasOpenOverlay()).toBe(false);
    expect(app.screens.hasTitle).toBe(false);
    expect(typeof app.input.handleKeyboardDown).toBe("function");
    expect(typeof app.start).toBe("function");
  });

  it("start attaches the provided key listeners once", () => {
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    const app = createApplication({
      initialFloor: findFloor(1)!,
      overlay: overlayWire(),
      screens: screensWire(),
      onInput: vi.fn(),
      onKeyDown,
      onKeyUp,
    });
    app.start();
    app.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyUp).toHaveBeenCalledTimes(1);
    app.input.destroy();
  });

  it("does not import screen, combat, or dungeon gameplay owners", () => {
    const source = readFileSync(resolve("src/engine/application.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\/(combat-ui|town-ui|camp-ui|game-over-ui|arena-ui|title-ui|prologue-ui|ending-ui)"/);
    expect(source).not.toMatch(/from "\.\.\/game\/(features|combat|save)"/);
  });
});
