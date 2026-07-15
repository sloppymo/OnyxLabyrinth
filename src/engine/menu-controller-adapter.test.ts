import { describe, expect, it } from "vitest";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import type { ControllerInputEvent } from "./controller-input";

function press(button: ControllerInputEvent["button"]): ControllerInputEvent {
  return { kind: "press", button };
}

describe("controllerEventToMenuKey", () => {
  it("maps d-pad and face buttons on press", () => {
    expect(controllerEventToMenuKey(press("up"))).toBe("ArrowUp");
    expect(controllerEventToMenuKey(press("down"))).toBe("ArrowDown");
    expect(controllerEventToMenuKey(press("left"))).toBe("ArrowLeft");
    expect(controllerEventToMenuKey(press("right"))).toBe("ArrowRight");
    expect(controllerEventToMenuKey(press("a"))).toBe("Enter");
    expect(controllerEventToMenuKey(press("b"))).toBe("Escape");
    expect(controllerEventToMenuKey(press("select"))).toBe("Escape");
  });

  it("ignores hold/release and unmapped buttons", () => {
    expect(controllerEventToMenuKey({ kind: "hold", button: "a", holdSeconds: 0.6 })).toBeNull();
    expect(controllerEventToMenuKey({ kind: "release", button: "a" })).toBeNull();
    expect(controllerEventToMenuKey(press("start"))).toBeNull();
    expect(controllerEventToMenuKey(press("x"))).toBeNull();
  });
});
