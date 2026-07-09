/**
 * FF6-style combat menu windows (DOM overlay).
 *
 * Three blue-gradient windows along the bottom of the combat canvas,
 * mirroring FF6's battle screen:
 *   - LEFT:   the action menu for the acting character (Attack / Magic /
 *             Item / Defend / Run …), or the active selection list
 *             (spells, items, targets) when a submenu is open.
 *   - MIDDLE: living enemy names with counts (FF6's monster window).
 *   - RIGHT:  party status — name, HP / MaxHP, SP — with the acting
 *             character highlighted.
 *
 * A centered result window appears on victory / defeat / fled.
 *
 * The windows stay visible for the whole fight; during turn playback the
 * menu window simply goes empty (the scene canvas carries the action).
 * Rendering is stateless: the controller calls renderCombatWindows with a
 * view model each time something changes.
 */

import type { CombatState, PlayerAction } from "../game/combat";
import type { Character } from "../game/party";

/** What occupies the menu (left) window. */
export type MenuMode = "menu" | "selection" | "none";

export interface MenuEntry {
  kind: PlayerAction["kind"];
  label: string;
  disabled?: boolean;
}

export interface SelectionEntry {
  /** Main label (spell name, item name, target name). */
  label: string;
  /** Right-aligned detail (SP cost, stack count, health descriptor). */
  detail?: string;
  disabled?: boolean;
}

export interface ResultView {
  title: string;
  lines: string[];
}

export interface CombatWindowsView {
  state: CombatState;
  /** The character whose turn it is (menu highlight target). Null during
   *  enemy turns / playback. */
  currentCharacterId: string | null;
  menuMode: MenuMode;
  menuEntries: MenuEntry[];
  menuIndex: number;
  /** Title above a selection list (e.g. "Magic", "Item", "Target"). */
  selectionTitle: string;
  selectionEntries: SelectionEntry[];
  selectionIndex: number;
  /** Info line under the selection list (e.g. target health descriptor). */
  selectionFooter?: string | null;
  /** Transient error line (e.g. "No items!"), shown under the menu. */
  flash: string | null;
  /** End-of-combat window; when set it replaces menu interaction. */
  result: ResultView | null;
}

export interface CombatWindowsHandlers {
  onMenuHover(index: number): void;
  onMenuConfirm(index: number): void;
  onSelectionHover(index: number): void;
  onSelectionConfirm(index: number): void;
}

/** FF6 labels for player actions. */
export const ACTION_LABELS: Record<PlayerAction["kind"], string> = {
  attack: "Attack",
  cast: "Magic",
  defend: "Defend",
  item: "Item",
  flee: "Run",
  hide: "Hide",
  ambush: "Ambush",
};

/** Menu entries available to a character (Thief/Ninja get Hide/Ambush). */
export function menuEntriesForCharacter(char: Character): MenuEntry[] {
  const base: PlayerAction["kind"][] = ["attack", "cast", "defend", "item"];
  if (char.class === "Thief" || char.class === "Ninja") {
    base.push(char.status.includes("hidden") ? "ambush" : "hide");
  }
  base.push("flee");
  return base.map((kind) => ({ kind, label: ACTION_LABELS[kind] }));
}

// --- Window builders ---------------------------------------------------------

function el(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

function buildMenuWindow(
  view: CombatWindowsView,
  handlers: CombatWindowsHandlers
): HTMLElement {
  const win = el("ff6-window ff6-menu");

  if (view.menuMode === "none") {
    win.classList.add("empty");
    return win;
  }

  if (view.menuMode === "menu") {
    for (let i = 0; i < view.menuEntries.length; i++) {
      const entry = view.menuEntries[i];
      const row = el("ff6-menu-item", entry.label);
      if (i === view.menuIndex) row.classList.add("selected");
      if (entry.disabled) row.classList.add("disabled");
      row.addEventListener("mouseenter", () => handlers.onMenuHover(i));
      row.addEventListener("click", () => handlers.onMenuConfirm(i));
      win.appendChild(row);
    }
    win.appendChild(el("ff6-hint-row", "↑↓ Enter · A/M/D/I/R"));
  } else {
    if (view.selectionTitle) {
      win.appendChild(el("ff6-menu-title", view.selectionTitle));
    }
    const list = el("ff6-selection-list");
    for (let i = 0; i < view.selectionEntries.length; i++) {
      const entry = view.selectionEntries[i];
      const row = el("ff6-menu-item");
      const label = document.createElement("span");
      label.className = "ff6-sel-label";
      label.textContent = entry.label;
      row.appendChild(label);
      if (entry.detail) {
        const detail = document.createElement("span");
        detail.className = "ff6-sel-detail";
        detail.textContent = entry.detail;
        row.appendChild(detail);
      }
      if (i === view.selectionIndex) row.classList.add("selected");
      if (entry.disabled) row.classList.add("disabled");
      row.addEventListener("mouseenter", () => handlers.onSelectionHover(i));
      row.addEventListener("click", () => handlers.onSelectionConfirm(i));
      list.appendChild(row);
    }
    win.appendChild(list);
    if (view.selectionFooter) {
      win.appendChild(el("ff6-sel-footer", view.selectionFooter));
    }
    win.appendChild(el("ff6-hint-row", "↑↓ Enter · Esc back"));
  }

  if (view.flash) {
    win.appendChild(el("ff6-flash", view.flash));
  }
  return win;
}

function buildEnemyWindow(state: CombatState): HTMLElement {
  const win = el("ff6-window ff6-enemies");
  const living = [...state.enemies.front, ...state.enemies.back].filter(
    (e) => e.currentHp > 0
  );
  // Group by display name with counts, FF6-style.
  const counts = new Map<string, number>();
  for (const e of living) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  if (counts.size === 0) {
    win.appendChild(el("ff6-enemy-row", "—"));
    return win;
  }
  for (const [name, count] of counts) {
    const row = el("ff6-enemy-row");
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    row.appendChild(nameEl);
    if (count > 1) {
      const countEl = document.createElement("span");
      countEl.className = "ff6-enemy-count";
      countEl.textContent = `×${count}`;
      row.appendChild(countEl);
    }
    win.appendChild(row);
  }
  return win;
}

function buildPartyWindow(view: CombatWindowsView): HTMLElement {
  const win = el("ff6-window ff6-party");
  for (const c of view.state.party) {
    const row = el("ff6-party-row");
    if (c.id === view.currentCharacterId) row.classList.add("current");
    const ko = c.hp <= 0 || c.status.includes("knockedOut");
    if (ko) row.classList.add("ko");

    const name = document.createElement("span");
    name.className = "ff6-p-name";
    name.textContent = c.name;
    row.appendChild(name);

    const hp = document.createElement("span");
    hp.className = "ff6-p-hp";
    hp.textContent = `${Math.max(0, c.hp)}/${c.maxHp}`;
    row.appendChild(hp);

    const sp = document.createElement("span");
    sp.className = "ff6-p-sp";
    sp.textContent = c.maxSp > 0 ? `${c.sp}` : "";
    row.appendChild(sp);

    const barWrap = document.createElement("span");
    barWrap.className = "ff6-p-bar";
    const fill = document.createElement("span");
    fill.className = "ff6-p-bar-fill";
    const ratio = c.maxHp > 0 ? Math.max(0, c.hp) / c.maxHp : 0;
    fill.style.width = `${Math.round(ratio * 100)}%`;
    if (ratio <= 0.25) fill.classList.add("critical");
    else if (ratio <= 0.5) fill.classList.add("wounded");
    barWrap.appendChild(fill);
    row.appendChild(barWrap);

    win.appendChild(row);
  }
  return win;
}

function buildResultWindow(result: ResultView): HTMLElement {
  const win = el("ff6-window ff6-result");
  win.appendChild(el("ff6-result-title", result.title));
  for (const line of result.lines) {
    win.appendChild(el("ff6-result-line", line));
  }
  win.appendChild(el("ff6-result-hint", "Press Enter"));
  return win;
}

/** Render the FF6 window row (and result overlay) into `container`. */
export function renderCombatWindows(
  container: HTMLElement,
  view: CombatWindowsView,
  handlers: CombatWindowsHandlers
): void {
  container.innerHTML = "";

  const row = el("ff6-windows");
  row.appendChild(buildMenuWindow(view, handlers));
  row.appendChild(buildEnemyWindow(view.state));
  row.appendChild(buildPartyWindow(view));
  container.appendChild(row);

  if (view.result) {
    container.appendChild(buildResultWindow(view.result));
  }
}
