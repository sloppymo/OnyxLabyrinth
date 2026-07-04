// Keyboard input handler. Maps keys to game actions and is the single place
// key bindings live — game logic never touches window.addEventListener.
//
// Dungeon bindings (design doc / build prompt §"Input Scheme"):
//   ArrowUp / W      step forward
//   ArrowDown / S    step backward
//   ArrowLeft / A    turn left
//   ArrowRight / D   turn right
//   C                camp            (Step 7 implements for real)
//   M                toggle auto-map (Step 12 implements for real)
//   Esc              system menu     (save/load system, Step 10)
//
// At Step 2 camp / map / system are wired to stub handlers that write a
// message to the bottom message area, so the keys visibly do something.

export interface InputHandlers {
  onForward: () => void;
  onBackward: () => void;
  onTurnLeft: () => void;
  onTurnRight: () => void;
  onCamp: () => void;
  onToggleMap: () => void;
  onSystemMenu: () => void;
  onTown: () => void;
  onUnlock: () => void;
}

const KEY_MAP: Record<string, keyof InputHandlers> = {
  ArrowUp: "onForward",
  w: "onForward",
  W: "onForward",
  ArrowDown: "onBackward",
  s: "onBackward",
  S: "onBackward",
  ArrowLeft: "onTurnLeft",
  a: "onTurnLeft",
  A: "onTurnLeft",
  ArrowRight: "onTurnRight",
  d: "onTurnRight",
  D: "onTurnRight",
  c: "onCamp",
  C: "onCamp",
  m: "onToggleMap",
  M: "onToggleMap",
  t: "onTown",
  T: "onTown",
  u: "onUnlock",
  U: "onUnlock",
  Escape: "onSystemMenu",
};

export function bindInput(target: Window, handlers: InputHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.key];
    if (!action) return;
    handlers[action]();
    e.preventDefault();
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
