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
import type { SpellDef } from "../data/spells";
import { classHasTechniques, maxRageForLevel, type TechniqueDef } from "../data/techniques";
import { spellEffectSummary, spellTargetLabel, techniqueEffectSummary, techniqueTargetLabel } from "./combat-display";

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
  /** The spell currently highlighted in the Magic list. When set, this
   *  replaces the enemy (middle) window with a description panel showing
   *  its cost, target shape, mechanical effect, and flavor text. */
  spellDetail?: SpellDef | null;
  /** The technique currently highlighted in the Technique list. When set,
   *  replaces the enemy window with a description panel (same as spellDetail). */
  techniqueDetail?: TechniqueDef | null;
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
  technique: "Tech",
  defend: "Defend",
  item: "Item",
  flee: "Run",
  hide: "Hide",
  ambush: "Ambush",
};

/** Keyboard shortcut letter per action, for the hint row (ambush reuses
 *  Enter on the highlighted row and has no letter). */
const ACTION_SHORTCUTS: Partial<Record<PlayerAction["kind"], string>> = {
  attack: "A",
  technique: "T",
  cast: "M",
  defend: "D",
  item: "I",
  flee: "R",
  hide: "H",
};

/** Hint-row text for the action menu, derived from the entries actually
 *  shown so the footer never advertises a dead key. */
export function menuHintText(entries: MenuEntry[]): string {
  const letters = entries
    .map((e) => ACTION_SHORTCUTS[e.kind])
    .filter((l): l is string => l !== undefined);
  return `↑↓ Enter · ${letters.join("/")}`;
}

/** Menu entries available to a character (Thief gets Hide/Ambush, melee gets Technique). */
export function menuEntriesForCharacter(char: Character): MenuEntry[] {
  const base: PlayerAction["kind"][] = ["attack", "cast", "defend", "item"];
  // Melee classes (Fighter/Thief/Halberdier/Duelist/Crusader) get Technique.
  if (classHasTechniques(char.class)) {
    // Insert Technique after attack, before cast (cast only exists for Crusader).
    base.splice(1, 0, "technique");
  }
  if (char.class === "Thief") {
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
    win.appendChild(el("ff6-hint-row", menuHintText(view.menuEntries)));
  } else {
    if (view.selectionTitle) {
      // Long lists (high-level spell books) scroll inside the window; a
      // position counter tells the player where the cursor is in the list.
      const total = view.selectionEntries.length;
      const title =
        total > 6
          ? `${view.selectionTitle} ${view.selectionIndex + 1}/${total}`
          : view.selectionTitle;
      win.appendChild(el("ff6-menu-title", title));
    }
    const list = el("ff6-selection-list");
    let selectedRow: HTMLElement | null = null;
    for (let i = 0; i < view.selectionEntries.length; i++) {
      const entry = view.selectionEntries[i];
      const row = el("ff6-menu-item");
      const label = document.createElement("span");
      label.className = "ff6-sel-label";
      label.textContent = entry.label;
      label.title = entry.label;
      row.appendChild(label);
      if (entry.detail) {
        const detail = document.createElement("span");
        detail.className = "ff6-sel-detail";
        detail.textContent = entry.detail;
        row.appendChild(detail);
      }
      if (i === view.selectionIndex) {
        row.classList.add("selected");
        selectedRow = row;
      }
      if (entry.disabled) row.classList.add("disabled");
      row.addEventListener("mouseenter", () => handlers.onSelectionHover(i));
      row.addEventListener("click", () => handlers.onSelectionConfirm(i));
      list.appendChild(row);
    }
    win.appendChild(list);
    // Keep the keyboard cursor visible in long lists (L9+ spell books).
    // The windows are re-rendered on every change, which resets scrollTop,
    // so re-center the selected row after layout. rAF because the window
    // isn't attached to the document (and has no heights) until
    // renderCombatWindows appends it.
    if (selectedRow) {
      const target = selectedRow;
      const followCursor = () => {
        if (!list.isConnected) return;
        const above = target.offsetTop;
        const below = target.offsetTop + target.offsetHeight;
        if (above < list.scrollTop) {
          list.scrollTop = above;
        } else if (below > list.scrollTop + list.clientHeight) {
          list.scrollTop = below - list.clientHeight;
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(followCursor);
      } else {
        // jsdom test environment: no rAF, layout is synchronous anyway.
        followCursor();
      }
    }
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
  const summons = state.summonedAllies.filter((a) => a.hp > 0);
  // Group by display name with counts, FF6-style.
  const counts = new Map<string, number>();
  for (const e of living) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  if (counts.size === 0 && summons.length === 0) {
    win.appendChild(el("ff6-enemy-row", "—"));
    return win;
  }
  for (const [name, count] of counts) {
    const row = el("ff6-enemy-row");
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    nameEl.title = name;
    row.appendChild(nameEl);
    if (count > 1) {
      const countEl = document.createElement("span");
      countEl.className = "ff6-enemy-count";
      countEl.textContent = `×${count}`;
      row.appendChild(countEl);
    }
    win.appendChild(row);
  }
  // Summoned allies fight on the party's side but stand mid-field, so they
  // list here (with HP — the party window carries their bar).
  for (const a of summons) {
    const row = el("ff6-enemy-row summon");
    const nameEl = document.createElement("span");
    nameEl.textContent = a.name;
    nameEl.title = a.name;
    row.appendChild(nameEl);
    const hpEl = document.createElement("span");
    hpEl.className = "ff6-enemy-count";
    hpEl.textContent = `${a.hp}/${a.maxHp}`;
    row.appendChild(hpEl);
    win.appendChild(row);
  }
  return win;
}

/** Replaces the enemy window with a full readout of the highlighted spell
 *  while the Magic list is open: name, tier/class, SP cost, target shape,
 *  mechanical effect, and flavor text. */
function buildSpellDetailWindow(spell: SpellDef): HTMLElement {
  const win = el("ff6-window ff6-spell-detail");
  win.appendChild(el("ff6-spell-detail-name", spell.name));

  const meta = el("ff6-spell-detail-meta");
  const metaBits = [
    `${spell.class} · Tier ${spell.tier}`,
    `${spell.spCost} SP`,
    spellTargetLabel(spell.target),
  ];
  meta.textContent = metaBits.join(" · ");
  win.appendChild(meta);

  win.appendChild(el("ff6-spell-detail-effect", spellEffectSummary(spell.effect)));
  win.appendChild(el("ff6-spell-detail-desc", spell.description));
  return win;
}

/** Replaces the enemy window with a readout of the highlighted technique. */
function buildTechniqueDetailWindow(tech: TechniqueDef): HTMLElement {
  const win = el("ff6-window ff6-spell-detail");
  win.appendChild(el("ff6-spell-detail-name", tech.name));

  const meta = el("ff6-spell-detail-meta");
  const metaBits = [
    `${tech.class} · Lv ${tech.level}`,
    `${tech.rageCost} RG`,
    techniqueTargetLabel(tech.target),
  ];
  meta.textContent = metaBits.join(" · ");
  win.appendChild(meta);

  win.appendChild(el("ff6-spell-detail-effect", techniqueEffectSummary(tech.effect)));
  win.appendChild(el("ff6-spell-detail-desc", tech.description));
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
    name.title = c.name;
    row.appendChild(name);

    const hp = document.createElement("span");
    hp.className = "ff6-p-hp";
    hp.textContent = `${Math.max(0, c.hp)}/${c.maxHp}`;
    row.appendChild(hp);

    // SP shows for every row (dim dash for non-casters) so the column reads
    // as a column instead of one row having a mystery number.
    const sp = document.createElement("span");
    sp.className = "ff6-p-sp";
    if (c.maxSp > 0) {
      sp.textContent = `${c.sp}`;
    } else {
      sp.textContent = "—";
      sp.classList.add("none");
    }
    row.appendChild(sp);

    // Rage shows for melee classes (technique users) only.
    if (classHasTechniques(c.class)) {
      const rg = document.createElement("span");
      rg.className = "ff6-p-rg";
      const rage = view.state.rage[c.id] ?? 0;
      const maxRage = maxRageForLevel(c.level);
      rg.textContent = `${rage}/${maxRage}`;
      row.appendChild(rg);
    } else {
      const rg = document.createElement("span");
      rg.className = "ff6-p-rg none";
      rg.textContent = "—";
      row.appendChild(rg);
    }

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

  // Summoned allies get compact rows below the party: name, HP, HP bar
  // (no SP — they can't cast).
  for (const a of view.state.summonedAllies) {
    if (a.hp <= 0) continue;
    const row = el("ff6-party-row summon");

    const name = document.createElement("span");
    name.className = "ff6-p-name";
    name.textContent = a.name;
    name.title = a.name;
    row.appendChild(name);

    const hp = document.createElement("span");
    hp.className = "ff6-p-hp";
    hp.textContent = `${a.hp}/${a.maxHp}`;
    row.appendChild(hp);

    const sp = document.createElement("span");
    sp.className = "ff6-p-sp none";
    sp.textContent = "—";
    row.appendChild(sp);

    // Empty rage cell keeps the HP bar aligned in the 5th grid column
    // (summons have no rage).
    const rg = document.createElement("span");
    rg.className = "ff6-p-rg none";
    rg.textContent = "—";
    row.appendChild(rg);

    const barWrap = document.createElement("span");
    barWrap.className = "ff6-p-bar";
    const fill = document.createElement("span");
    fill.className = "ff6-p-bar-fill";
    const ratio = a.maxHp > 0 ? a.hp / a.maxHp : 0;
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
  row.appendChild(
    view.techniqueDetail
      ? buildTechniqueDetailWindow(view.techniqueDetail)
      : view.spellDetail
        ? buildSpellDetailWindow(view.spellDetail)
        : buildEnemyWindow(view.state)
  );
  row.appendChild(buildPartyWindow(view));
  container.appendChild(row);

  if (view.result) {
    container.appendChild(buildResultWindow(view.result));
  }
}
