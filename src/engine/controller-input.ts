/**
 * Normalizes keyboard and Gamepad API input into a single
 * `ControllerInputEvent` stream for the combat UI and other controllers.
 */

export type ControllerButton =
  | "a"
  | "b"
  | "x"
  | "y"
  | "lb"
  | "rb"
  | "lt"
  | "rt"
  | "start"
  | "select"
  | "up"
  | "down"
  | "left"
  | "right";

export interface ControllerInputEvent {
  kind: "press" | "hold" | "release" | "axis";
  button: ControllerButton;
  /** Seconds this button has been held (only for `hold` events). */
  holdSeconds?: number;
  /** For axis events: -1..1. */
  value?: number;
}

export type ControllerInputHandler = (event: ControllerInputEvent) => void;

const KEYBOARD_MAP: Readonly<Record<string, ControllerButton>> = {
  Enter: "a",
  " ": "a",
  a: "a",
  Escape: "b",
  Backspace: "b",
  b: "b",
  s: "x",
  d: "y",
  ArrowUp: "up",
  w: "up",
  ArrowDown: "down",
  z: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  q: "lb",
  e: "rb",
  r: "rt",
  t: "lt",
  f: "select",
  g: "start",
};

const GAMEPAD_BUTTON_MAP: Readonly<Record<number, ControllerButton>> = {
  0: "a",
  1: "b",
  2: "x",
  3: "y",
  4: "lb",
  5: "rb",
  6: "lt",
  7: "rt",
  8: "select",
  9: "start",
};

const DEFAULT_DEADZONE = 0.5;
const DEFAULT_HOLD_THRESHOLD_SECONDS = 0.5;

type InputSource = "keyboard" | `gamepad-${number}`;

interface ButtonTracking {
  button: ControllerButton;
  source: InputSource;
  pressTime: number;
  /** Every distinct physical control currently contributing to this logical button. */
  physicalIds: Set<string>;
  /** Whether the single `hold` event has already been emitted for this press. */
  holdEmitted: boolean;
}

function sourceKey(source: InputSource, button: ControllerButton): string {
  return `${source}:${button}`;
}

export interface CreateControllerInputOptions {
  deadzone?: number;
  holdThresholdSeconds?: number;
  /** When false, callers must invoke handleKeyboardDown/Up themselves (combat mode). */
  attachListeners?: boolean;
}

export interface ControllerInputHandle {
  destroy(): void;
  handleKeyboardDown(event: KeyboardEvent): void;
  handleKeyboardUp(event: KeyboardEvent): void;
}

/** Map a keyboard key to a logical controller button, or null if unmapped. */
export function mapKeyboardKey(key: string): ControllerButton | null {
  return KEYBOARD_MAP[key] ?? null;
}

/**
 * Wires keyboard and gamepad input into a normalized event stream.
 *
 * A logical button may be driven by several physical controls (e.g. `Enter`,
 * `Space`, and `a` all map to the "a" button). The controller emits a `press`
 * when the first mapped physical control activates, and a `release` only when
 * the last mapped physical control deactivates.
 *
 * `hold` is emitted exactly once per press, the first frame the button has been
 * held for at least `holdThresholdSeconds`.
 *
 * Returns a controller with a `destroy()` method that removes listeners and
 * cancels the animation-frame polling loop.
 */
export function createControllerInput(
  handler: ControllerInputHandler,
  options?: CreateControllerInputOptions,
): ControllerInputHandle {
  const deadzone = options?.deadzone ?? DEFAULT_DEADZONE;
  const holdThresholdSeconds =
    options?.holdThresholdSeconds ?? DEFAULT_HOLD_THRESHOLD_SECONDS;

  const held = new Map<string, ButtonTracking>();
  let rafId: number | null = null;
  let destroyed = false;

  function emit(event: ControllerInputEvent): void {
    if (!destroyed) {
      handler(event);
    }
  }

  function press(
    button: ControllerButton,
    source: InputSource,
    now: number,
    physicalId: string,
  ): void {
    const key = sourceKey(source, button);
    const existing = held.get(key);
    if (existing) {
      existing.physicalIds.add(physicalId);
      return;
    }
    held.set(key, {
      button,
      source,
      pressTime: now,
      physicalIds: new Set([physicalId]),
      holdEmitted: false,
    });
    emit({ kind: "press", button });
  }

  function release(
    button: ControllerButton,
    source: InputSource,
    physicalId: string,
  ): void {
    const key = sourceKey(source, button);
    const existing = held.get(key);
    if (!existing) return;
    existing.physicalIds.delete(physicalId);
    if (existing.physicalIds.size === 0) {
      held.delete(key);
      emit({ kind: "release", button });
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    const button = KEYBOARD_MAP[event.key];
    if (!button) return;
    event.preventDefault();
    press(button, "keyboard", performance.now(), event.key);
  }

  function onKeyUp(event: KeyboardEvent): void {
    const button = KEYBOARD_MAP[event.key];
    if (!button) return;
    event.preventDefault();
    release(button, "keyboard", event.key);
  }

  function releaseAllKeyboard(): void {
    const toRelease: { button: ControllerButton; physicalId: string }[] = [];
    for (const tracking of held.values()) {
      if (tracking.source === "keyboard") {
        for (const physicalId of tracking.physicalIds) {
          toRelease.push({ button: tracking.button, physicalId });
        }
      }
    }
    for (const { button, physicalId } of toRelease) {
      release(button, "keyboard", physicalId);
    }
  }

  function updateAxisPair(
    negativeButton: ControllerButton,
    positiveButton: ControllerButton,
    value: number,
    source: InputSource,
    now: number,
    axisIndex: number,
  ): void {
    const negPhysicalId = `axis${axisIndex}:neg`;
    const posPhysicalId = `axis${axisIndex}:pos`;
    const negKey = sourceKey(source, negativeButton);
    const posKey = sourceKey(source, positiveButton);
    const negHeld = held.has(negKey);
    const posHeld = held.has(posKey);

    if (value < -deadzone) {
      if (posHeld) release(positiveButton, source, posPhysicalId);
      press(negativeButton, source, now, negPhysicalId);
    } else if (value > deadzone) {
      if (negHeld) release(negativeButton, source, negPhysicalId);
      press(positiveButton, source, now, posPhysicalId);
    } else if (Math.abs(value) <= deadzone) {
      if (negHeld) release(negativeButton, source, negPhysicalId);
      if (posHeld) release(positiveButton, source, posPhysicalId);
    }
  }

  function pollGamepads(now: number): void {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;
      const source: InputSource = `gamepad-${i}`;

      for (let b = 0; b < gp.buttons.length; b++) {
        const button = GAMEPAD_BUTTON_MAP[b];
        if (!button) continue;
        const physicalId = `btn:${b}`;
        const key = sourceKey(source, button);
        const isPressed = gp.buttons[b].pressed;
        if (isPressed && !held.has(key)) {
          press(button, source, now, physicalId);
        } else if (!isPressed && held.has(key)) {
          release(button, source, physicalId);
        }
      }

      const lx = gp.axes[0] ?? 0;
      const ly = gp.axes[1] ?? 0;
      updateAxisPair("left", "right", lx, source, now, 0);
      updateAxisPair("up", "down", ly, source, now, 1);

      // D-pad axes on some controllers (e.g. Firefox reports them as axes 6/7).
      const dx = gp.axes[6] ?? 0;
      const dy = gp.axes[7] ?? 0;
      updateAxisPair("left", "right", dx, source, now, 6);
      updateAxisPair("up", "down", dy, source, now, 7);
    }
  }

  function emitHolds(now: number): void {
    for (const tracking of held.values()) {
      if (tracking.holdEmitted) continue;
      const holdSeconds = (now - tracking.pressTime) / 1000;
      if (holdSeconds >= holdThresholdSeconds) {
        tracking.holdEmitted = true;
        emit({ kind: "hold", button: tracking.button, holdSeconds });
      }
    }
  }

  function tick(now: number): void {
    if (destroyed) return;
    pollGamepads(now);
    emitHolds(now);
    rafId = requestAnimationFrame(tick);
  }

  const attachListeners = options?.attachListeners !== false;
  if (attachListeners) {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAllKeyboard);
  }
  rafId = requestAnimationFrame(tick);

  return {
    handleKeyboardDown: onKeyDown,
    handleKeyboardUp: onKeyUp,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (attachListeners) {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", releaseAllKeyboard);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      held.clear();
    },
  };
}
