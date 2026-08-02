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
//   V                toggle nonmodal map overlay
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
  onToggleMapOverlay: () => void;
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
  v: "onToggleMapOverlay",
  V: "onToggleMapOverlay",
  t: "onTown",
  T: "onTown",
  u: "onUnlock",
  U: "onUnlock",
  g: "onCastSpell",
  G: "onCastSpell",
  Escape: "onSystemMenu",
  Tab: "onActionRing",
};

export type InputAction = keyof InputHandlers;

export interface BindInputOptions {
  /** The shell uses this to claim keys only while dungeon input owns focus. */
  shouldHandle?: (action: InputAction, event: KeyboardEvent) => boolean;
}

export function isEditableInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

export function bindInput(
  target: Window,
  handlers: InputHandlers,
  options: BindInputOptions = {},
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.key];
    if (!action) return;
    if (isEditableInputTarget(e.target)) return;
    // The quick overlay is a state toggle, never a held action. Keep movement
    // key-repeat intact while preventing a held V from rapidly flickering it.
    if (action === "onToggleMapOverlay" && e.repeat) return;
    if (options.shouldHandle && !options.shouldHandle(action, e)) return;
    handlers[action]();
    e.preventDefault();
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
