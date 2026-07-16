// Keyboard input handler. Maps keys to game actions and is the single place
// key bindings live — game logic never touches window.addEventListener.
//
// Dungeon bindings (reconciled per RECONCILIATION_CHECKLIST §9.1):
//   ArrowUp / W      step forward
//   ArrowDown / S    step backward
//   ArrowLeft / A    turn left
//   ArrowRight / D   turn right
//   C                camp
//   M                toggle auto-map
//   T                return to town
//   U                unlock (locked door / chest)
//   G                grimoire (cast utility spells: light, levitation, …)
//   Esc              system menu (save/load)
//   Tab              action ring (Camp / Map / Town / Unlock / Grimoire) — keyboard
//                    door matching pad Start after legend removal
//
// While a trapped chest prompt is up (GameState.pendingTrap), main.ts gates
// all of these off and a dedicated listener owns I/D/O/L (+Esc = leave).
//
// Combat/town/camp/save/creation modes have their own key handlers in their
// respective UI controllers. The spec's proposed Cast/Drop/Search/Turn-party
// /Use-item dungeon keys were cut from MVP per design doc §7.2 (5 combat
// actions only) and §2 (4 MVP classes).

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
  onCastSpell: () => void;
  /** Open the dungeon action ring (keyboard counterpart to pad Start). */
  onActionRing: () => void;
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
  g: "onCastSpell",
  G: "onCastSpell",
  Escape: "onSystemMenu",
  Tab: "onActionRing",
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
