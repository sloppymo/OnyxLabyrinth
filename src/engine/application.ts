/**
 * Composition root for objects the session already owns as seams:
 * GameState, UiStack, OverlayRuntime, BaseScreenRuntime, and physical input.
 *
 * This module wires those objects. It does not own combat, dungeon traversal,
 * save rules, the render loop, or debug.
 */

import type { FloorDef, GameState } from "../types";
import { createGameState } from "../game/state";
import type { ControllerInputEvent } from "./controller-input";
import { createControllerInput, type ControllerInputHandle } from "./controller-input";
import { UiStack } from "./ui-stack";
import { OverlayRuntime, type OverlayRuntimeDeps } from "./overlay-runtime";
import { BaseScreenRuntime, type BaseScreenRuntimeDeps } from "./base-screen-runtime";

export interface Application {
  readonly state: GameState;
  readonly uiStack: UiStack;
  readonly overlays: OverlayRuntime;
  readonly screens: BaseScreenRuntime;
  readonly input: ControllerInputHandle;
  start(): void;
}

export interface CreateApplicationOptions {
  initialFloor: FloorDef;
  overlay: Omit<OverlayRuntimeDeps, "state" | "uiStack">;
  screens: Omit<BaseScreenRuntimeDeps, "state">;
  onInput: (event: ControllerInputEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
}

export function createApplication(options: CreateApplicationOptions): Application {
  const state = createGameState(options.initialFloor);
  const uiStack = new UiStack();
  const overlays = new OverlayRuntime({
    state,
    uiStack,
    ...options.overlay,
  });
  const screens = new BaseScreenRuntime({
    state,
    ...options.screens,
  });
  const input = createControllerInput(options.onInput, { attachListeners: false });

  let started = false;
  return {
    state,
    uiStack,
    overlays,
    screens,
    input,
    start() {
      if (started) return;
      started = true;
      window.addEventListener("keydown", options.onKeyDown);
      window.addEventListener("keyup", options.onKeyUp);
    },
  };
}
