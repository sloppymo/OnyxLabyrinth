/**
 * Transient UI ownership. Overlay input is the top of this stack; GameState.mode
 * stays on the underlying screen (dungeon, town, …).
 */

import type { OverlayRouteKind } from "./controller-route";
import type { ControllerInputEvent } from "./controller-input";
import { controllerEventToMenuKey } from "./menu-controller-adapter";

export interface UiLayer {
  readonly id: OverlayRouteKind;
  handleInput(event: ControllerInputEvent): boolean;
  close(): void;
}

export class UiStack {
  private layers: UiLayer[] = [];

  get size(): number {
    return this.layers.length;
  }

  top(): UiLayer | null {
    return this.layers.at(-1) ?? null;
  }

  push(layer: UiLayer): void {
    this.layers.push(layer);
  }

  pop(): UiLayer | null {
    return this.layers.pop() ?? null;
  }

  /**
   * Remove the last layer with this id, even if it is not top.
   * Does not call `layer.close()` — the overlay owner disposes the controller.
   */
  close(id: OverlayRouteKind): UiLayer | null {
    const index = this.layers.findLastIndex((layer) => layer.id === id);
    if (index < 0) return null;
    const [removed] = this.layers.splice(index, 1);
    return removed ?? null;
  }
}

/** Wrap a handleKey(menu) controller as a stack layer. */
export function createMenuLayer(
  id: OverlayRouteKind,
  handleKey: (key: string) => void,
  close: () => void,
): UiLayer {
  return {
    id,
    handleInput(event) {
      const key = controllerEventToMenuKey(event);
      if (key) handleKey(key);
      return true;
    },
    close,
  };
}
