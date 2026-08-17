import type { ControllerButton, ControllerInputEvent } from "./controller-input";

const PRESS_TO_KEY: Readonly<Partial<Record<ControllerButton, string>>> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Enter",
  b: "Escape",
  y: "y",
  select: "Escape",
};

/** Map a controller event to a synthetic keyboard key for list UIs, or null. */
export function controllerEventToMenuKey(event: ControllerInputEvent): string | null {
  if (event.kind !== "press") return null;
  // Keyboard events keep their real key so trap I/D/O/L, palette letters, and
  // dungeon WASD are not rewritten into SNES face buttons.
  if (event.key !== undefined) return event.key;
  if (!event.button) return null;
  return PRESS_TO_KEY[event.button] ?? null;
}
