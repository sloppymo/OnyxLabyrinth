// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { bindInput, type InputHandlers } from "./input";

function handlers(overrides: Partial<InputHandlers> = {}): InputHandlers {
  const noop = vi.fn();
  return {
    onForward: noop,
    onBackward: noop,
    onTurnLeft: noop,
    onTurnRight: noop,
    onCamp: noop,
    onToggleMap: noop,
    onToggleMapOverlay: noop,
    onSystemMenu: noop,
    onTown: noop,
    onUnlock: noop,
    onCastSpell: noop,
    onActionRing: noop,
    ...overrides,
  };
}

function keydown(
  key: string,
  options: KeyboardEventInit = {},
  target: Window | HTMLElement = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

describe("dungeon input binding", () => {
  it("maps V to the named map-overlay action and owns the event", () => {
    const onToggleMapOverlay = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMapOverlay }));

    const event = keydown("v");
    expect(onToggleMapOverlay).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    unbind();
  });

  it("ignores repeated overlay-toggle keydowns so a held key cannot flicker", () => {
    const onToggleMapOverlay = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMapOverlay }));

    keydown("V", { repeat: true });
    expect(onToggleMapOverlay).not.toHaveBeenCalled();
    unbind();
  });

  it("does not claim keys when the active game route cannot handle them", () => {
    const onToggleMapOverlay = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMapOverlay }), {
      shouldHandle: () => false,
    });

    const event = keydown("v");
    expect(onToggleMapOverlay).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    unbind();
  });

  it("does not trigger or prevent map input while typing in an editable element", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const onToggleMapOverlay = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMapOverlay }));

    const event = keydown("v", {}, input);
    expect(onToggleMapOverlay).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    unbind();
    input.remove();
  });

  it("preserves M for the existing full automap and Tab for the action ring", () => {
    const onToggleMap = vi.fn();
    const onActionRing = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMap, onActionRing }));

    keydown("m");
    keydown("Tab");
    expect(onToggleMap).toHaveBeenCalledTimes(1);
    expect(onActionRing).toHaveBeenCalledTimes(1);
    unbind();
  });

  it("removes its listener on teardown", () => {
    const onToggleMapOverlay = vi.fn();
    const unbind = bindInput(window, handlers({ onToggleMapOverlay }));
    unbind();

    keydown("v");
    expect(onToggleMapOverlay).not.toHaveBeenCalled();
  });
});
