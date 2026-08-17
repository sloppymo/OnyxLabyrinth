import { describe, expect, it, vi } from "vitest";
import type { OverlayRouteKind } from "./controller-route";
import type { ControllerInputEvent } from "./controller-input";
import { createMenuLayer, UiStack, type UiLayer } from "./ui-stack";

function layer(id: OverlayRouteKind, handle = vi.fn()): UiLayer {
  return {
    id,
    handleInput(event: ControllerInputEvent) {
      handle(event);
      return true;
    },
    close: vi.fn(),
  };
}

describe("UiStack", () => {
  it("starts empty", () => {
    const stack = new UiStack();
    expect(stack.top()).toBeNull();
    expect(stack.size).toBe(0);
  });

  it("push makes the new layer top; pop restores the previous", () => {
    const stack = new UiStack();
    const save = layer("save");
    const spell = layer("spell");
    stack.push(save);
    expect(stack.top()).toBe(save);
    stack.push(spell);
    expect(stack.top()).toBe(spell);
    expect(stack.pop()).toBe(spell);
    expect(stack.top()).toBe(save);
    expect(stack.pop()).toBe(save);
    expect(stack.top()).toBeNull();
  });

  it("pop on empty returns null", () => {
    expect(new UiStack().pop()).toBeNull();
  });

  it("close(id) removes that layer even when it is not top", () => {
    const stack = new UiStack();
    const save = layer("save");
    const spell = layer("spell");
    stack.push(save);
    stack.push(spell);
    expect(stack.close("save")).toBe(save);
    expect(stack.top()).toBe(spell);
    expect(stack.size).toBe(1);
    expect(save.close).not.toHaveBeenCalled();
  });

  it("close(id) does not pop a different top layer", () => {
    const stack = new UiStack();
    const spell = layer("spell");
    stack.push(spell);
    expect(stack.close("save")).toBeNull();
    expect(stack.top()).toBe(spell);
  });

  it("close(id) on empty returns null", () => {
    expect(new UiStack().close("trap")).toBeNull();
  });
});

describe("createMenuLayer", () => {
  it("forwards KeyboardEvent.key rather than rewriting it into a face button", () => {
    const handleKey = vi.fn();
    const layer = createMenuLayer("trap", handleKey, () => {});
    layer.handleInput({
      kind: "press",
      key: "d",
      button: "y",
      repeat: false,
    });
    expect(handleKey).toHaveBeenCalledWith("d");
  });
});
