/**
 * DOM-based renderer for the combat selection panel.
 *
 * Presents a Wizardry-style layout:
 *   - Status bar (enemy group / round)
 *   - Persistent message log
 *   - Monster arena (front/back rows) + compact action/selection menu
 *   - Compact party strip (name, HP, status)
 *
 * The panel is used during action selection and target/spell/item selection
 * phases. Round resolution still plays out on the canvas combat renderer.
 */

import type { CombatState, PlayerAction, EnemyInstance } from "../game/combat";
import type { Character } from "../game/party";
import { drawEnemySprite } from "./combat-renderer";
import type { SpriteAnim } from "./combat-renderer";
import {
  partyStatusText,
  hpRatio,
  hpBarColorClass,
  COMBAT_LOG_HISTORY,
  type SelectionChoice,
} from "./combat-display";

const RANGE_LABELS: Record<string, string> = {
  close: "Close",
  short: "Short",
  medium: "Med",
  long: "Long",
};

function getWeaponRangeLabel(state: CombatState, char: Character): string {
  const weapon = state.loadout[char.id]?.weapon;
  if (!weapon || !weapon.range) return "";
  return RANGE_LABELS[weapon.range] || "";
}

/** Phases rendered by the DOM-based combat selection panel. */
export type CombatPanelPhase =
  | "selectAction"
  | "selectEnemyTarget"
  | "selectAllyTarget"
  | "selectSpell"
  | "selectItem"
  | "ready";

export interface SelectActionView {
  state: CombatState;
  currentCharacter: Character;
  selectedIndex: number;
  phase: CombatPanelPhase;
  prompt: string;
  selectionList: SelectionChoice[] | null;
  flash: string | null;
}

export interface SelectActionHandlers {
  onSelectIndex(index: number): void;
  onConfirm(kind: PlayerAction["kind"]): void;
  onSelectChoice(index: number): void;
}

export function getActionKindsForCharacter(char: Character): PlayerAction["kind"][] {
  const baseKinds: PlayerAction["kind"][] = ["attack", "cast", "defend", "item", "flee"];
  
  // Thief and Ninja can hide
  if (char.class === "Thief" || char.class === "Ninja") {
    // If hidden, show ambush instead of hide
    if (char.status.includes("hidden")) {
      return [...baseKinds, "ambush"];
    } else {
      return [...baseKinds, "hide"];
    }
  }
  
  return baseKinds;
}

export const ACTION_KINDS: PlayerAction["kind"][] = [
  "attack",
  "cast",
  "defend",
  "item",
  "flee",
  "hide",
];

const ACTION_LABELS: Record<PlayerAction["kind"], string> = {
  attack: "Attack",
  cast: "Cast",
  defend: "Defend",
  item: "Item",
  flee: "Flee",
  hide: "Hide",
  ambush: "Ambush",
};

const ARENA_W = 520;
const ARENA_H = 340;

/** Build and render the combat selection panel into `container`. */
export function renderSelectActionPhase(
  container: HTMLElement,
  view: SelectActionView,
  handlers: SelectActionHandlers
): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "combat-select-action";

  root.appendChild(buildStatusBar(view.state));
  if (view.flash) {
    root.appendChild(buildFlashMessage(view.flash));
  }
  root.appendChild(buildMessageLog(view));
  root.appendChild(buildCombatBody(view, handlers));
  root.appendChild(buildPartyStrip(view.state, view.currentCharacter));
  root.appendChild(buildHint(view.phase));

  container.appendChild(root);
}

function buildFlashMessage(flash: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "combat-flash-message";
  el.textContent = flash;
  return el;
}

// --- Status bar ------------------------------------------------------------

function buildStatusBar(state: CombatState): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "combat-status-bar";

  const left = document.createElement("span");
  left.className = "combat-status-left";
  left.textContent = formatEnemyLabel(state).left;

  const right = document.createElement("span");
  right.className = "combat-status-right";
  right.textContent = formatEnemyLabel(state).right;

  bar.appendChild(left);
  bar.appendChild(right);
  return bar;
}

function formatEnemyLabel(state: CombatState): { left: string; right: string } {
  const all = [...state.enemies.front, ...state.enemies.back];
  const living = all.filter((e) => e.currentHp > 0);
  const count = living.length;

  if (count === 0) {
    return { left: "No enemies", right: "Round " + state.round };
  }

  const names = new Set(living.map((e) => e.name));
  const first = living[0];
  const label = names.size === 1 ? pluralize(first.name, count) : "enemies";
  return { left: `${count} ${label}`, right: "Round " + state.round };
}

function pluralize(name: string, count: number): string {
  if (count === 1) return name;
  if (name.endsWith("y") && !/[aeiou]y$/i.test(name)) {
    return `${name.slice(0, -1)}ies`;
  }
  return `${name}s`;
}

// --- Message log -----------------------------------------------------------

function buildMessageLog(view: SelectActionView): HTMLElement {
  const log = document.createElement("div");
  log.className = "combat-message-log";

  const state = view.state;
  const lines = state.log.slice(-COMBAT_LOG_HISTORY);
  for (const line of lines) {
    const el = document.createElement("div");
    el.className = "log-line";
    el.textContent = line;
    log.appendChild(el);
  }

  const isPromptPhase =
    view.phase === "selectEnemyTarget" ||
    view.phase === "selectAllyTarget" ||
    view.phase === "selectSpell" ||
    view.phase === "selectItem";

  if (view.prompt) {
    const promptEl = document.createElement("div");
    promptEl.className = "log-line prompt";
    promptEl.textContent = view.prompt;
    log.appendChild(promptEl);
  }

  if (view.selectionList && view.selectionList.length > 0) {
    const listEl = document.createElement("div");
    listEl.className = "log-line selection-list";
    for (const choice of view.selectionList) {
      const item = document.createElement("div");
      item.className = "selection-item";
      item.textContent = choice.label;
      listEl.appendChild(item);
    }
    log.appendChild(listEl);
  } else if (isPromptPhase && !view.prompt) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "log-line prompt";
    emptyEl.textContent = "No choices available.";
    log.appendChild(emptyEl);
  }

  return log;
}

// --- Arena + menu body -----------------------------------------------------

function buildCombatBody(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const row = document.createElement("div");
  row.className = "combat-body";

  row.appendChild(buildArena(view.state));
  row.appendChild(buildActionPane(view, handlers));

  return row;
}

function buildArena(state: CombatState): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "combat-arena";

  const canvas = document.createElement("canvas");
  canvas.width = ARENA_W;
  canvas.height = ARENA_H;
  wrap.appendChild(canvas);

  const label = document.createElement("div");
  label.className = "combat-arena-label";
  label.textContent = "MONSTER GROUP";
  wrap.appendChild(label);

  const ctx = canvas.getContext("2d");
  if (!ctx) return wrap;

  // Background.
  ctx.fillStyle = "#0e0d0a";
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Ground gradient.
  const grad = ctx.createLinearGradient(0, ARENA_H * 0.45, 0, ARENA_H);
  grad.addColorStop(0, "#0e0d0a");
  grad.addColorStop(1, "#1a1612");
  ctx.fillStyle = grad;
  ctx.fillRect(0, ARENA_H * 0.45, ARENA_W, ARENA_H * 0.55);

  // Back-row horizon line.
  ctx.strokeStyle = "#3a3025";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ARENA_H * 0.42);
  ctx.lineTo(ARENA_W, ARENA_H * 0.42);
  ctx.stroke();

  const now = performance.now();
  const anim: SpriteAnim = {
    state: "idle",
    stateStart: now,
    progress: 0,
    opacity: 1,
  };

  const livingFront = state.enemies.front.filter((e) => e.currentHp > 0);
  const livingBack = state.enemies.back.filter((e) => e.currentHp > 0);

  // Draw back row first so the front row overlaps it.
  drawEnemyRow(ctx, livingBack, "back", now, anim, 0.82);
  drawEnemyRow(ctx, livingFront, "front", now, anim, 1.15);

  return wrap;
}

function drawEnemyRow(
  ctx: CanvasRenderingContext2D,
  enemies: EnemyInstance[],
  row: "front" | "back",
  now: number,
  anim: SpriteAnim,
  scale: number
): void {
  if (enemies.length === 0) return;
  const y = row === "front" ? ARENA_H * 0.7 : ARENA_H * 0.4;
  const step = (ARENA_W * 0.76) / (enemies.length + 1);
  const startX = ARENA_W * 0.12 + step;
  for (let i = 0; i < enemies.length; i++) {
    const x = startX + i * step;
    drawEnemySprite(ctx, x, y, enemies[i], anim, now, false, 0, scale);
  }
}

// --- Action / selection pane ----------------------------------------------

function buildActionPane(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "combat-action-menu";

  if (view.phase !== "ready") {
    const actorName = document.createElement("div");
    actorName.className = "actor-name";
    actorName.textContent = `${view.currentCharacter.name}'s turn`;
    pane.appendChild(actorName);
  }

  if (view.phase === "selectAction") {
    pane.appendChild(buildActionMenu(view, handlers));
  } else if (view.selectionList && view.selectionList.length > 0) {
    pane.appendChild(buildSelectionMenu(view, handlers));
  } else if (view.phase === "ready") {
    const readyEl = document.createElement("div");
    readyEl.className = "ready-message";
    readyEl.textContent = "Ready";
    pane.appendChild(readyEl);
  }

  return pane;
}

function buildActionMenu(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "action-items";

  const actionKinds = getActionKindsForCharacter(view.currentCharacter);

  actionKinds.forEach((kind, index) => {
    const item = document.createElement("div");
    item.className = "combat-action-item";
    if (index === view.selectedIndex) item.classList.add("selected");
    item.dataset.kind = kind;

    const arrow = document.createElement("span");
    arrow.className = "combat-action-arrow";
    arrow.textContent = index === view.selectedIndex ? "▶" : "";

    const label = document.createElement("span");
    label.className = "combat-action-label";
    label.textContent = ACTION_LABELS[kind];

    item.appendChild(arrow);
    item.appendChild(label);

    item.addEventListener("click", () => {
      handlers.onSelectIndex(index);
      handlers.onConfirm(kind);
    });

    menu.appendChild(item);
  });

  return menu;
}

function buildSelectionMenu(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "action-items";

  for (const choice of view.selectionList ?? []) {
    const item = document.createElement("div");
    item.className = "combat-action-item";
    item.textContent = choice.label;
    item.addEventListener("click", () => {
      handlers.onSelectChoice(choice.index);
    });
    menu.appendChild(item);
  }

  return menu;
}

// --- Party strip -----------------------------------------------------------

function buildPartyStrip(
  state: CombatState,
  currentCharacter: Character
): HTMLElement {
  const strip = document.createElement("div");
  strip.className = "combat-party-strip";

  for (const c of state.party) {
    const card = document.createElement("div");
    card.className = "combat-party-member";
    if (c.id === currentCharacter.id) card.classList.add("current");
    if (c.hp <= 0 || c.status.includes("knockedOut")) card.classList.add("fallen");

    const name = document.createElement("div");
    name.className = "combat-party-name";
    name.textContent = c.name;
    card.appendChild(name);

    const ratio = hpRatio(c);
    const hpRow = document.createElement("div");
    hpRow.className = "combat-party-hp-row";

    const barWrap = document.createElement("div");
    barWrap.className = "combat-party-hp-bar";
    const barFill = document.createElement("div");
    barFill.className = `combat-party-hp-fill ${hpBarColorClass(ratio)}`;
    barFill.style.width = `${Math.round(ratio * 100)}%`;
    barWrap.appendChild(barFill);

    const hpText = document.createElement("div");
    hpText.className = "combat-party-hp-text";
    hpText.textContent = `${Math.max(0, c.hp)}/${c.maxHp}`;

    hpRow.appendChild(barWrap);
    hpRow.appendChild(hpText);
    card.appendChild(hpRow);

    const status = document.createElement("div");
    status.className = "combat-party-status";
    status.textContent = partyStatusText(c);
    card.appendChild(status);

    // Add weapon range indicator if character has a weapon with range
    const rangeLabel = getWeaponRangeLabel(state, c);
    if (rangeLabel) {
      const range = document.createElement("div");
      range.className = "combat-party-range";
      range.textContent = `Range: ${rangeLabel}`;
      card.appendChild(range);
    }

    strip.appendChild(card);
  }

  return strip;
}

function buildHint(phase: CombatPanelPhase): HTMLElement {
  const el = document.createElement("div");
  el.className = "combat-hint";
  if (phase === "selectAction") {
    el.textContent = "▲▼ choose — Enter/Space confirm — click to select";
  } else if (phase === "ready") {
    el.textContent = "Space/Enter to resolve round";
  } else {
    el.textContent = "[1-9] choose — click to select";
  }
  return el;
}

/**
 * Effective AC: base 10 minus the flat damage reduction the character
 * currently benefits from — equipped armor `defenseBonus` (data-driven, from
 * `state.loadout`) plus persistent spell armor buffs. Mirrors the flat
 * portion of `damageReductionFor` in game/combat.ts (per-round Defend % is
 * excluded since it isn't a standing stat). Keep these two in sync if the
 * damage formula changes.
 */
export function effectiveAc(state: CombatState, c: Character): number {
  const armorBonus = (state.loadout[c.id]?.armor ?? []).reduce(
    (sum, a) => sum + (a.defenseBonus ?? 0),
    0
  );
  const spellBuff = state.armorBuffs[c.id] ?? 0;
  return 10 - (armorBonus + spellBuff);
}
