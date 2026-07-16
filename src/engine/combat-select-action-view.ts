/**
 * FF6-style combat menu windows (DOM overlay).
 *
 * Three blue-gradient windows along the bottom of the combat canvas,
 * mirroring FF6's battle screen:
 *   - LEFT:   the action menu for the acting character (Attack / Magic /
 *             Item / Defend / Run …), or the active selection list
 *             (spells, items, targets) when a submenu is open.
 *   - MIDDLE: living enemy names with counts (FF6's monster window).
 *   - RIGHT:  party-resource-row token — name (acting = inverted plate),
 *             fixed HP bar, HP cur/max, single SP|RG resource column.
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
import { spellEffectSummary, spellTargetLabel, techniqueEffectSummary, techniqueTargetLabel, partyStatusText } from "./combat-display";
import type { CombatPalette, PaletteSlot } from "./combat-action-palette";

/** What occupies the menu (left) window. */
export type MenuMode = "palette" | "menu" | "selection" | "none";

export interface MenuEntry {
  /** Player action, or "repeat" for sticky last Attack. */
  kind: PlayerAction["kind"] | "repeat";
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
  /** Controller-first four-slot palette (when menuMode === "palette"). */
  palette: CombatPalette | null;
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
  /** Playback-only hint (Shift/Tab/Esc). Hidden during result. */
  playbackHint?: string | null;
  /** Party Auto toggle is on (palette hint). */
  partyAuto?: boolean;
  /** Compact resource line under the action menu (e.g. "SP 12/40" or "RG 3/12"). */
  menuResourceLine?: string | null;
  /** Roster inspect highlight (LT/RT) — does not change initiative. */
  inspectCharacterId?: string | null;
}

export interface CombatWindowsHandlers {
  onMenuHover(index: number): void;
  onMenuConfirm(index: number): void;
  onPaletteConfirm(slotIndex: number): void;
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
const ACTION_SHORTCUTS: Partial<Record<MenuEntry["kind"], string>> = {
  attack: "A",
  technique: "T",
  cast: "M",
  defend: "D",
  item: "I",
  flee: "R",
  hide: "H",
  repeat: "Z",
};

/** Join hint segments with · ; drop whole trailing entries until it fits. */
export function joinHintParts(parts: string[], maxLen = 42): string {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  while (clean.length > 1 && clean.join(" · ").length > maxLen) {
    clean.pop();
  }
  const joined = clean.join(" · ");
  return joined.length <= maxLen ? joined : clean[0] ?? "";
}

/** Hint-row text for the action menu, derived from the entries actually
 *  shown so the footer never advertises a dead key. */
export function menuHintText(entries: MenuEntry[]): string {
  const letters = entries
    .map((e) => ACTION_SHORTCUTS[e.kind])
    .filter((l): l is string => l !== undefined);
  // Priority: confirm + letter shortcuts survive; nav glyph drops first.
  return joinHintParts([`Enter · ${letters.join("/")}`, "↑↓"]);
}

const PALETTE_GLYPHS = ["A", "B", "X", "Y"] as const;

const PALETTE_LABELS: Record<PaletteSlot["kind"], string> = {
  attack: "Atk",
  defend: "Def",
  cast: "Magic",
  skill: "Skl",
  item: "Item",
  flee: "Run",
};

/**
 * Palette footer — no A/B/X/Y dupes (already on the face buttons).
 * Order = priority: drop from the tail first (least important last).
 */
export function paletteHintText(palette: CombatPalette, partyAuto: boolean): string {
  void palette;
  // Menu column is ~26% of the playfield (~170px usable). At 16px FF36 that
  // is ~22–24 glyphs — NOT the default joinHintParts budget of 42. Without a
  // tight maxLen, CSS overflow:hidden clips mid-token ("Start:A").
  return joinHintParts(
    ["Sel:Item", "hold B:Run", "Start:Auto", partyAuto ? "AUTO on" : ""],
    24
  );
}

/** Playback meta hints — input-adaptive; never clip mid-token.
 *  Priority: tempo → skip → auto (auto drops first when tight).
 *  maxLen mirrors the menu column (~28% / ~24 glyphs), NOT the default 42 —
 *  otherwise CSS overflow cuts "Esc:skip" to "Esc:". */
export function playbackHintText(inputKind: "keyboard" | "gamepad"): string {
  if (inputKind === "gamepad") {
    return joinHintParts(["LT:2×", "Y:FAST", "B:skip", "Start:AUTO"], 24);
  }
  return joinHintParts(["Shift:2×", "Tab:FAST", "Q:AUTO", "Esc:skip"], 24);
}

/** Every combat-window footer string must come from here (or joinHintParts
 *  directly). Used by tests / verify scripts as the producer registry. */
export const FOOTER_HINT_PRODUCERS = {
  palette: paletteHintText,
  playback: playbackHintText,
  menu: menuHintText,
} as const;

function paletteSlotLabel(slot: PaletteSlot, char?: Character): string {
  if (slot.kind === "skill" && char?.class === "Thief") {
    return char.status.includes("hidden") ? "Ambush" : "Hide";
  }
  return PALETTE_LABELS[slot.kind];
}

/** Menu entries available to a character (Thief gets Hide/Ambush, melee gets Technique).
 *  When `includeRepeat` is true, inserts Repeat after Attack. */
export function menuEntriesForCharacter(
  char: Character,
  includeRepeat = false
): MenuEntry[] {
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
  const entries: MenuEntry[] = base.map((kind) => ({
    kind,
    label: ACTION_LABELS[kind],
  }));
  if (includeRepeat) {
    const attackIdx = entries.findIndex((e) => e.kind === "attack");
    const at = attackIdx >= 0 ? attackIdx + 1 : 1;
    entries.splice(at, 0, { kind: "repeat", label: "Repeat" });
  }
  return entries;
}

// --- Window builders ---------------------------------------------------------

function el(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

/** Compact labels for statuses surfaced as tags in the combat windows. */
export const STATUS_TAG_LABELS: Record<string, string> = {
  poison: "PSN",
  paralysis: "PAR",
  sleep: "SLP",
  blind: "BLD",
  burn: "BRN",
  regen: "RGN",
};

/** Statuses read straight off a combatant's `status` array for tag display. */
const VISIBLE_STATUSES = ["poison", "paralysis", "sleep", "blind"] as const;

/** Small colored status tags (PSN / PAR / SLP / …) appended inside a name
 *  span, so they never disturb the row's flex/grid column layout. */
function appendStatusTags(nameEl: HTMLElement, statuses: readonly string[]): void {
  for (const st of statuses) {
    const label = STATUS_TAG_LABELS[st];
    if (!label) continue;
    const tag = document.createElement("span");
    tag.className = `ff6-status-tag st-${st}`;
    tag.textContent = label;
    nameEl.appendChild(tag);
  }
}

function buildMenuWindow(
  view: CombatWindowsView,
  handlers: CombatWindowsHandlers
): HTMLElement {
  const win = el("ff6-window ff6-menu");

  if (view.menuMode === "none") {
    win.classList.add("empty");
    if (view.playbackHint) {
      win.classList.add("playback-compact");
      win.appendChild(el("ff6-hint-row", view.playbackHint));
    } else {
      // Nothing to say — avoid a big blue void.
      win.classList.add("playback-idle");
    }
    return win;
  }

  if (view.menuMode === "palette" && view.palette) {
    const row = el("ff6-palette");
    const acting = view.currentCharacterId
      ? view.state.party.find((p) => p.id === view.currentCharacterId)
      : undefined;
    for (let i = 0; i < view.palette.slots.length; i++) {
      const slot = view.palette.slots[i];
      const slotEl = el("ff6-palette-slot");
      if ("disabled" in slot && slot.disabled) slotEl.classList.add("disabled");
      slotEl.appendChild(el("ff6-palette-glyph", PALETTE_GLYPHS[i] ?? "?"));
      slotEl.appendChild(el("ff6-palette-label", paletteSlotLabel(slot, acting)));
      slotEl.addEventListener("click", () => handlers.onPaletteConfirm(i));
      row.appendChild(slotEl);
    }
    win.appendChild(row);
    if (view.menuResourceLine) {
      win.appendChild(el("ff6-hint-row ff6-resource-row", view.menuResourceLine));
    }
    win.appendChild(
      el("ff6-hint-row", paletteHintText(view.palette, view.partyAuto ?? false))
    );
  } else if (view.menuMode === "menu") {
    for (let i = 0; i < view.menuEntries.length; i++) {
      const entry = view.menuEntries[i];
      const row = el("ff6-menu-item", entry.label);
      if (i === view.menuIndex) row.classList.add("selected");
      if (entry.disabled) row.classList.add("disabled");
      row.addEventListener("mouseenter", () => handlers.onMenuHover(i));
      row.addEventListener("click", () => handlers.onMenuConfirm(i));
      win.appendChild(row);
    }
    if (view.menuResourceLine) {
      win.appendChild(el("ff6-hint-row ff6-resource-row", view.menuResourceLine));
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
    win.appendChild(el("ff6-hint-row", joinHintParts(["A confirm", "B back", "↑↓"])));
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
  // Group by display name with counts, FF6-style. Each group also unions the
  // statuses of its members so afflictions stay readable at a glance.
  const groups = new Map<string, { count: number; statuses: Set<string> }>();
  for (const e of living) {
    const group = groups.get(e.name) ?? { count: 0, statuses: new Set<string>() };
    group.count += 1;
    for (const st of VISIBLE_STATUSES) {
      if (e.status.includes(st)) group.statuses.add(st);
    }
    if ((state.enemyDots[e.instanceId] ?? []).length > 0) group.statuses.add("burn");
    groups.set(e.name, group);
  }
  if (groups.size === 0 && summons.length === 0) {
    win.appendChild(el("ff6-enemy-row", "—"));
    return win;
  }
  for (const [name, group] of groups) {
    const row = el("ff6-enemy-row");
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    nameEl.title = name;
    appendStatusTags(nameEl, [...group.statuses]);
    row.appendChild(nameEl);
    if (group.count > 1) {
      const countEl = document.createElement("span");
      countEl.className = "ff6-enemy-count";
      countEl.textContent = `×${group.count}`;
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

/** Inner fill track of `.ff6-p-bar` (48px outer − 1px border × 2). */
const HP_BAR_TRACK_PX = 46;

/**
 * Fixed-width HP bar for the party-resource-row token.
 * Fill ≥ 1px whenever hp > 0; 0px only at KO — color stops carry triage.
 */
function buildHpBar(hp: number, maxHp: number): HTMLElement {
  const barWrap = document.createElement("span");
  barWrap.className = "ff6-p-bar";
  const fill = document.createElement("span");
  fill.className = "ff6-p-bar-fill";
  const safeHp = Math.max(0, hp);
  const ratio = maxHp > 0 ? safeHp / maxHp : 0;
  const fillPx =
    safeHp <= 0 ? 0 : Math.max(1, Math.round(ratio * HP_BAR_TRACK_PX));
  fill.style.width = `${fillPx}px`;
  if (safeHp <= 0) fill.classList.add("empty");
  else if (ratio <= 0.25) fill.classList.add("critical");
  else if (ratio <= 0.5) fill.classList.add("wounded");
  barWrap.appendChild(fill);
  return barWrap;
}

function hpNumeralClass(hp: number, maxHp: number): string {
  if (hp <= 0) return "ff6-p-hp";
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  if (ratio <= 0.25) return "ff6-p-hp critical";
  if (ratio <= 0.5) return "ff6-p-hp wounded";
  return "ff6-p-hp";
}

/**
 * Single resource column: `SP cur/max`, `RG cur/max`, or a dim positional dash.
 * Never both SP and Rage on one row (engine invariant).
 */
function buildResCell(opts: {
  maxSp: number;
  sp: number;
  hasTechniques: boolean;
  rage: number;
  maxRage: number;
}): HTMLElement {
  const res = document.createElement("span");
  res.className = "ff6-p-res";
  if (opts.maxSp > 0) {
    res.classList.add("sp");
    res.textContent = `SP ${opts.sp}/${opts.maxSp}`;
  } else if (opts.hasTechniques) {
    res.classList.add("rg");
    res.textContent = `RG ${opts.rage}/${opts.maxRage}`;
  } else {
    res.classList.add("none");
    res.textContent = "—";
  }
  return res;
}

function buildNameCell(
  name: string,
  statuses: readonly string[]
): { name: HTMLElement; status: HTMLElement } {
  const cell = document.createElement("span");
  cell.className = "ff6-p-name";
  cell.title = name;
  const text = document.createElement("span");
  text.className = "ff6-p-name-text";
  text.textContent = name;
  cell.appendChild(text);
  // Status is a SIBLING grid column (not nested in name) so the empty slot
  // cannot tax name width — see roster truncation bug (B…/C…/F…).
  const slot = document.createElement("span");
  slot.className = "ff6-p-status";
  if (statuses.length > 0) {
    appendStatusTags(slot, statuses);
  }
  return { name: cell, status: slot };
}

function buildPartyWindow(view: CombatWindowsView): HTMLElement {
  const win = el("ff6-window ff6-party");
  for (const c of view.state.party) {
    const row = el("ff6-party-row");
    if (c.id === view.currentCharacterId) row.classList.add("current");
    if (
      view.inspectCharacterId &&
      c.id === view.inspectCharacterId &&
      c.id !== view.currentCharacterId
    ) {
      row.classList.add("inspect");
    }
    const ko = c.hp <= 0 || c.status.includes("knockedOut");
    if (ko) row.classList.add("ko");

    // Tags survive ellipsis; name text truncates first (see tokens addendum).
    const statuses = ko
      ? ([] as string[])
      : (() => {
          const tags = VISIBLE_STATUSES.filter((st) => c.status.includes(st));
          return view.state.regenBuffs[c.id] ? [...tags, "regen"] : [...tags];
        })();
    const { name, status } = buildNameCell(c.name, statuses);
    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(buildHpBar(c.hp, c.maxHp));

    const hp = document.createElement("span");
    hp.className = hpNumeralClass(Math.max(0, c.hp), c.maxHp);
    hp.textContent = `${Math.max(0, c.hp)}/${c.maxHp}`;
    row.appendChild(hp);

    row.appendChild(
      buildResCell({
        maxSp: c.maxSp,
        sp: c.sp,
        hasTechniques: classHasTechniques(c.class),
        rage: view.state.rage[c.id] ?? 0,
        maxRage: maxRageForLevel(c.level),
      })
    );

    win.appendChild(row);
  }

  // Summons: same token columns; resource is always a dim dash.
  for (const a of view.state.summonedAllies) {
    if (a.hp <= 0) continue;
    const row = el("ff6-party-row summon");
    const { name, status } = buildNameCell(a.name, []);
    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(buildHpBar(a.hp, a.maxHp));

    const hp = document.createElement("span");
    hp.className = hpNumeralClass(a.hp, a.maxHp);
    hp.textContent = `${a.hp}/${a.maxHp}`;
    row.appendChild(hp);

    row.appendChild(
      buildResCell({
        maxSp: 0,
        sp: 0,
        hasTechniques: false,
        rage: 0,
        maxRage: 0,
      })
    );

    win.appendChild(row);
  }

  const inspectId = view.inspectCharacterId;
  if (inspectId && inspectId !== view.currentCharacterId) {
    const inspected = view.state.party.find((p) => p.id === inspectId);
    if (inspected) {
      win.appendChild(
        el(
          "ff6-party-inspect",
          `Inspect: ${inspected.name} — ${partyStatusText(inspected)}`
        )
      );
    }
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
