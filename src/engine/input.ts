// Dungeon keyboard map. Production input ownership is a single `keydown` in
// `main.ts` feeding `createControllerInput`; this module maps dungeon keys
// (WASD = movement, not SNES face buttons) via `dungeonActionForKey`.
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
// While a trapped chest prompt is up (GameState.pendingTrap), controller
// routing selects `"trap"` (I/D/O/L + Esc = leave) instead of `"dungeon"`.
//
// Combat/town/camp/save/creation modes receive the same stream through
// `routeControllerEvent`. The spec's proposed Cast/Drop/Search/Turn-party
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

export interface DungeonActionForKeyOptions {
  /** KeyboardEvent.repeat — held V must not flicker the overlay. */
  repeat?: boolean;
}

/** Dungeon keyboard map. WASD here is movement, not SNES face buttons. */
export function dungeonActionForKey(
  key: string,
  options: DungeonActionForKeyOptions = {},
): InputAction | null {
  const action = KEY_MAP[key];
  if (!action) return null;
  if (action === "onToggleMapOverlay" && options.repeat) return null;
  return action;
}

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
    const action = dungeonActionForKey(e.key, { repeat: e.repeat });
    if (!action) return;
    if (isEditableInputTarget(e.target)) return;
    if (options.shouldHandle && !options.shouldHandle(action, e)) return;
    handlers[action]();
    e.preventDefault();
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
