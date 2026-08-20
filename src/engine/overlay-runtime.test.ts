/**
 * OverlayRuntime owns overlay controller instances and UiStack registration.
 * GameState.mode stays on the underlying screen.
 */
import { describe, expect, it, vi } from "vitest";
import { createGameState } from "../game/state";
import { findFloor } from "../game/floor-registry";
import { UiStack } from "./ui-stack";
import { OverlayRuntime } from "./overlay-runtime";
import type { OverlayRuntimeDeps } from "./overlay-runtime";

function makeDeps(state = createGameState(findFloor(1)!)): {
  state: ReturnType<typeof createGameState>;
  uiStack: UiStack;
  deps: OverlayRuntimeDeps;
  shell: OverlayRuntimeDeps["shell"];
  dungeon: OverlayRuntimeDeps["dungeon"];
} {
  state.mode = "dungeon";
  const uiStack = new UiStack();
  const panel = document.createElement("div");
  const shell = {
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
  };
  const dungeon = {
    camp: vi.fn(),
    returnToTown: vi.fn(),
    toggleMap: vi.fn(),
    unlock: vi.fn(),
    canOpenActionRing: () => true,
  };
  const deps: OverlayRuntimeDeps = {
    state,
    uiStack,
    shell,
    dungeon,
    session: {
      applyLoadedState: vi.fn(),
      persist: vi.fn(),
      reopenTown: vi.fn(),
    },
    combat: {
      startNpcFight: vi.fn(),
    },
    trap: {
      isPending: () => !!state.pendingTrap,
      inspected: () => !!state.pendingTrap?.inspected,
      inspect: vi.fn(),
      disarm: vi.fn(() => ({ stillPending: true })),
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
    setMode: (mode) => {
      state.mode = mode;
    },
    onDialogClosed: vi.fn(),
  };
  return { state, uiStack, deps, shell, dungeon };
}

describe("OverlayRuntime", () => {
  it("openSave pushes save without changing GameState.mode", () => {
    const { state, uiStack, deps } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    overlays.openSave();
    expect(state.mode).toBe("dungeon");
    expect(uiStack.top()?.id).toBe("save");
    expect(overlays.hasOpenOverlay()).toBe(true);
  });

  it("closing save removes the save layer, not an unrelated top layer", () => {
    const { uiStack, deps } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    overlays.openSave();
    uiStack.top()?.handleInput({ kind: "press", key: "Escape", repeat: false });
    expect(uiStack.top()).toBeNull();
  });

  it("openNpc(hot-boi) registers tavern, not npc", () => {
    const { state, uiStack, deps } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    overlays.openNpc("hot-boi");
    expect(state.mode).toBe("dungeon");
    expect(uiStack.top()?.id).toBe("tavern");
  });

  it("openActionRing is a no-op while another overlay owns the stack", () => {
    const { uiStack, deps, dungeon } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    overlays.openSave();
    overlays.openActionRing();
    expect(uiStack.top()?.id).toBe("save");
    expect(dungeon.camp).not.toHaveBeenCalled();
  });

  it("opens an authored dialogue event over the corridor and keeps dungeon mode", () => {
    const { state, uiStack, deps, shell } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    expect(overlays.openDialogueEvent("rat-king-old-man-thesis")).toBe(true);
    expect(state.mode).toBe("dungeon");
    expect(uiStack.top()?.id).toBe("dialog");
    expect(shell.showNpcDialogue).toHaveBeenCalledOnce();
    expect(shell.showDialog).not.toHaveBeenCalled();
  });

  it("rejects an unknown dialogue id without taking input ownership", () => {
    const { uiStack, deps, shell } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    expect(overlays.openDialogueEvent("missing-dialogue")).toBe(false);
    expect(uiStack.top()).toBeNull();
    expect(shell.showNpcDialogue).not.toHaveBeenCalled();
  });

  it("syncTrap opens and closes the trap layer by id", () => {
    const { state, uiStack, deps } = makeDeps();
    state.pendingTrap = {
      x: 1,
      y: 1,
      trapType: "alarm",
      inspected: false,
    };
    const overlays = new OverlayRuntime(deps);
    const message = overlays.syncTrap(true);
    expect(uiStack.top()?.id).toBe("trap");
    expect(message).toMatch(/Trapped/);
    overlays.syncTrap(false);
    expect(uiStack.top()).toBeNull();
  });

  it("closeAll removes overlay layers by id without changing GameState.mode", () => {
    const { state, uiStack, deps } = makeDeps();
    const overlays = new OverlayRuntime(deps);
    overlays.openSave();
    overlays.closeAll();
    expect(uiStack.top()).toBeNull();
    expect(overlays.hasOpenOverlay()).toBe(false);
    expect(state.mode).toBe("dungeon");
  });
});
