import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createControllerInput,
  type ControllerInputEvent,
} from "./controller-input";

const HOLD_THRESHOLD_MS = 500;
const POLL_INTERVAL_MS = 16;
const GAMEPAD_INDEX_0 = 0;
const GAMEPAD_INDEX_1 = 1;

function useRafTimers(): void {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "setInterval",
      "Date",
      "performance",
      "requestAnimationFrame",
    ],
  });
}

function dispatchKeydown(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

function dispatchKeyup(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keyup", {
    key,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

function makeGamepad(
  buttons: { pressed: boolean; value: number }[],
  axes: number[] = [0, 0],
  index = 0,
): Gamepad {
  return {
    index,
    connected: true,
    id: "test-gamepad",
    mapping: "standard",
    timestamp: performance.now(),
    buttons,
    axes,
    vibrationActuator: null,
    hapticActuators: [],
  } as unknown as Gamepad;
}

function stubGamepads(gamepads: (Gamepad | null)[]): void {
  if (!navigator.getGamepads) {
    // getGamepads is missing in jsdom; install a no-op stub so spyOn works.
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    });
  }
  vi.spyOn(navigator, "getGamepads").mockReturnValue(gamepads as Gamepad[]);
}

describe("createControllerInput", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // jsdom has no Gamepad API; reset any stub so it cannot leak between tests.
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    });
  });

  it("keyboard keydown emits correct press event", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("s");
    expect(events).toEqual([{ kind: "press", button: "x" }]);
    input.destroy();
  });

  it("Enter maps to a", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("Enter");
    expect(events).toEqual([{ kind: "press", button: "a" }]);
    input.destroy();
  });

  it("Space maps to a", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown(" ");
    expect(events).toEqual([{ kind: "press", button: "a" }]);
    input.destroy();
  });

  it("lowercase a maps to a", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("a");
    expect(events).toEqual([{ kind: "press", button: "a" }]);
    input.destroy();
  });

  it("Escape maps to b", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("Escape");
    expect(events).toEqual([{ kind: "press", button: "b" }]);
    input.destroy();
  });

  it("Backspace maps to b", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("Backspace");
    expect(events).toEqual([{ kind: "press", button: "b" }]);
    input.destroy();
  });

  it("Arrow keys emit dpad events", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("ArrowUp");
    dispatchKeydown("ArrowDown");
    dispatchKeydown("ArrowLeft");
    dispatchKeydown("ArrowRight");
    expect(events).toEqual([
      { kind: "press", button: "up" },
      { kind: "press", button: "down" },
      { kind: "press", button: "left" },
      { kind: "press", button: "right" },
    ]);
    input.destroy();
  });

  it("mapped keys call preventDefault", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    const event = dispatchKeydown("Enter");
    expect(event.defaultPrevented).toBe(true);
    input.destroy();
  });

  it("unmapped keys do not emit events or preventDefault", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    const event = dispatchKeydown("h");
    expect(events).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
    input.destroy();
  });

  it("gamepad button press emits correct event", () => {
    useRafTimers();
    const buttons = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    buttons[0] = { pressed: true, value: 1 };
    stubGamepads([makeGamepad(buttons)]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    vi.advanceTimersByTime(POLL_INTERVAL_MS);

    expect(events).toContainEqual({ kind: "press", button: "a" });
    input.destroy();
  });

  it("gamepad dpad axes emit press and release events", () => {
    useRafTimers();
    const buttons = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    const gp = makeGamepad(buttons, [0, 0]);
    stubGamepads([gp]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toHaveLength(0);

    gp.axes = [0.8, 0];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "right" });

    gp.axes = [0, 0];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "release", button: "right" });

    gp.axes = [0, -0.8];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "up" });

    gp.axes = [0, 0.8];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "release", button: "up" });
    expect(events).toContainEqual({ kind: "press", button: "down" });

    input.destroy();
  });

  it("gamepad dpad buttons (12-15) emit press and release events", () => {
    useRafTimers();
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      value: 0,
    }));
    const gp = makeGamepad(buttons, [0, 0]);
    stubGamepads([gp]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toHaveLength(0);

    buttons[12] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "up" });

    buttons[12] = { pressed: false, value: 0 };
    buttons[13] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "release", button: "up" });
    expect(events).toContainEqual({ kind: "press", button: "down" });

    buttons[13] = { pressed: false, value: 0 };
    buttons[14] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "left" });

    buttons[14] = { pressed: false, value: 0 };
    buttons[15] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "right" });

    input.destroy();
  });

  it("gamepad dpad button and stick for the same direction share one logical hold", () => {
    useRafTimers();
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      value: 0,
    }));
    const gp = makeGamepad(buttons, Array(8).fill(0));
    stubGamepads([gp]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    vi.advanceTimersByTime(POLL_INTERVAL_MS);

    // Stick up
    gp.axes[1] = -0.8;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events.filter((e) => e.kind === "press" && e.button === "up")).toHaveLength(1);

    // D-pad up (button 12) while stick still held — no second press
    buttons[12] = { pressed: true, value: 1 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events.filter((e) => e.kind === "press" && e.button === "up")).toHaveLength(1);

    gp.axes[1] = 0;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events.filter((e) => e.kind === "release" && e.button === "up")).toHaveLength(0);

    buttons[12] = { pressed: false, value: 0 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "release", button: "up" });

    input.destroy();
  });

  it("hold event fires once after threshold", () => {
    useRafTimers();
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    dispatchKeydown("Enter");
    expect(events).toEqual([{ kind: "press", button: "a" }]);

    vi.advanceTimersByTime(HOLD_THRESHOLD_MS + 20);

    const holds = events.filter(
      (e) => e.kind === "hold" && e.button === "a" && e.holdSeconds !== undefined,
    );
    expect(holds).toHaveLength(1);
    expect(holds[0].holdSeconds).toBeGreaterThanOrEqual(0.5);
    input.destroy();
  });

  it("release event fires on keyup", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    dispatchKeydown("Enter");
    dispatchKeyup("Enter");
    expect(events).toEqual([
      { kind: "press", button: "a" },
      { kind: "release", button: "a" },
    ]);
    input.destroy();
  });

  it("two keyboard keys mapped to the same button only release when both are released", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    dispatchKeydown("Enter");
    dispatchKeydown(" ");
    expect(events).toEqual([{ kind: "press", button: "a" }]);

    dispatchKeyup("Enter");
    expect(events).toEqual([{ kind: "press", button: "a" }]);

    dispatchKeyup(" ");
    expect(events).toEqual([
      { kind: "press", button: "a" },
      { kind: "release", button: "a" },
    ]);

    input.destroy();
  });

  it("releasing a key before the hold threshold does not emit a hold event", () => {
    useRafTimers();
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    dispatchKeydown("Enter");
    vi.advanceTimersByTime(HOLD_THRESHOLD_MS - 50);
    dispatchKeyup("Enter");
    vi.advanceTimersByTime(HOLD_THRESHOLD_MS);

    const holds = events.filter((e) => e.kind === "hold");
    expect(holds).toHaveLength(0);

    input.destroy();
  });

  it("blur releases all held keyboard keys", () => {
    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));

    dispatchKeydown("Enter");
    dispatchKeydown(" ");
    window.dispatchEvent(new Event("blur"));

    expect(events).toEqual([
      { kind: "press", button: "a" },
      { kind: "release", button: "a" },
    ]);

    input.destroy();
  });

  it("multiple gamepad indices are polled independently", () => {
    useRafTimers();
    const buttons0 = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    const buttons1 = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    buttons0[0] = { pressed: true, value: 1 };
    buttons1[0] = { pressed: true, value: 1 };
    const gp0 = makeGamepad(buttons0, [0, 0], GAMEPAD_INDEX_0);
    const gp1 = makeGamepad(buttons1, [0, 0], GAMEPAD_INDEX_1);
    stubGamepads([gp0, gp1]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    vi.advanceTimersByTime(POLL_INTERVAL_MS);

    expect(events.filter((e) => e.kind === "press" && e.button === "a")).toHaveLength(2);

    buttons0[0] = { pressed: false, value: 0 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);

    expect(events.filter((e) => e.kind === "release" && e.button === "a")).toHaveLength(1);

    buttons1[0] = { pressed: false, value: 0 };
    vi.advanceTimersByTime(POLL_INTERVAL_MS);

    expect(events.filter((e) => e.kind === "release" && e.button === "a")).toHaveLength(2);

    input.destroy();
  });

  it("gamepad dpad and stick for the same direction do not release until both release", () => {
    useRafTimers();
    const buttons = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    // Left stick vertical axis (index 1) and dpad vertical axis (index 7).
    const gp = makeGamepad(buttons, Array(8).fill(0));
    stubGamepads([gp]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e));
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toHaveLength(0);

    gp.axes[1] = -0.8;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "up" });

    gp.axes[7] = -0.8;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    // No duplicate press or release; button is still held.
    expect(events.filter((e) => e.button === "up")).toHaveLength(1);

    gp.axes[1] = 0;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    // Dpad is still holding up, so no release.
    expect(events.filter((e) => e.kind === "release" && e.button === "up")).toHaveLength(0);

    gp.axes[7] = 0;
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "release", button: "up" });

    input.destroy();
  });

  it("options can configure deadzone and hold threshold", () => {
    useRafTimers();
    const buttons = Array.from({ length: 10 }, () => ({
      pressed: false,
      value: 0,
    }));
    const gp = makeGamepad(buttons, [0, 0]);
    stubGamepads([gp]);

    const events: ControllerInputEvent[] = [];
    const input = createControllerInput((e) => events.push(e), {
      deadzone: 0.9,
      holdThresholdSeconds: 0.2,
    });

    // Axis value below custom deadzone should not register.
    gp.axes = [0.8, 0];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toHaveLength(0);

    gp.axes = [0.95, 0];
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(events).toContainEqual({ kind: "press", button: "right" });

    dispatchKeydown("Enter");
    vi.advanceTimersByTime(250);
    const holds = events.filter(
      (e) => e.kind === "hold" && e.button === "a" && e.holdSeconds !== undefined,
    );
    expect(holds).toHaveLength(1);
    expect(holds[0].holdSeconds).toBeGreaterThanOrEqual(0.2);

    input.destroy();
  });
});
