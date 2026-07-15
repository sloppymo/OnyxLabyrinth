import type { ControllerInputEvent } from "./controller-input";

const PRESS_TO_KEY: Readonly<Partial<Record<ControllerInputEvent["button"], string>>> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Enter",
  b: "Escape",
  select: "Escape",
};

/** Map a controller event to a synthetic keyboard key for list UIs, or null. */
export function controllerEventToMenuKey(event: ControllerInputEvent): string | null {
  if (event.kind !== "press") return null;
  return PRESS_TO_KEY[event.button] ?? null;
}
