/**
 * DOM-based renderer for the `selectAction` combat phase.
 *
 * Builds a Wizardry/Bard's Tale-style box layout into the provided container:
 *   - Status bar with enemy count/name and living count
 *   - Viewport + action menu row
 *   - Party status table
 *
 * The viewport draws the current representative enemy using the existing
 * procedural sprite renderer from combat-renderer.ts.
 */

import type { CombatState, PlayerAction } from "../game/combat";
import type { Character } from "../game/party";
import { drawEnemySprite, SPRITE_W, SPRITE_H } from "./combat-renderer";
import type { SpriteAnim } from "./combat-renderer";

export interface SelectActionView {
  state: CombatState;
  currentCharacter: Character;
  selectedIndex: number;
  flash: string | null;
}

export interface SelectActionHandlers {
  onSelectIndex(index: number): void;
  onConfirm(kind: PlayerAction["kind"]): void;
}

export const ACTION_KINDS: PlayerAction["kind"][] = ["attack", "cast", "defend", "item", "flee"];
const ACTION_LABELS: Record<PlayerAction["kind"], string> = {
  attack: "Attack",
  cast: "Cast",
  defend: "Defend",
  item: "Item",
  flee: "Flee",
};

const VIEWPORT_SIZE = 200;

/** Build and render the select-action DOM into `container`. */
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
  root.appendChild(buildRow(view, handlers));
  root.appendChild(buildPartyTable(view.state));

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
    return { left: "No enemies", right: "(0)" };
  }

  const names = new Set(living.map((e) => e.name));
  const first = living[0];
  const label = names.size === 1 ? pluralize(first.name, count) : "enemies";
  return { left: `${count} ${label}`, right: `(${count})` };
}

function pluralize(name: string, count: number): string {
  if (count === 1) return name;
  // Naive pluralization; sufficient for current enemy names.
  if (name.endsWith("y") && !/[aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

// --- Viewport + menu row ---------------------------------------------------

function buildRow(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const row = document.createElement("div");
  row.className = "combat-row";

  row.appendChild(buildViewport(view.state));
  row.appendChild(buildMenu(view, handlers));

  return row;
}

function buildViewport(state: CombatState): HTMLElement {
  const viewport = document.createElement("div");
  viewport.className = "combat-viewport";

  const all = [...state.enemies.front, ...state.enemies.back];
  const representative = all.find((e) => e.currentHp > 0) ?? all[0];

  if (!representative) {
    const fallback = document.createElement("div");
    fallback.className = "combat-viewport-fallback";
    fallback.textContent = "No enemy";
    viewport.appendChild(fallback);
    return viewport;
  }

  const canvas = document.createElement("canvas");
  canvas.width = VIEWPORT_SIZE;
  canvas.height = VIEWPORT_SIZE;
  viewport.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return viewport;

  ctx.fillStyle = "#0e0d0a";
  ctx.fillRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

  const now = performance.now();
  const anim: SpriteAnim = {
    state: "idle",
    stateStart: now,
    progress: 0,
    opacity: 1,
  };
  // Scale the representative sprite to fill ~70% of the viewport while
  // preserving its aspect ratio relative to the standard sprite box.
  const viewportScale = Math.min(
    (VIEWPORT_SIZE * 0.7) / SPRITE_W,
    (VIEWPORT_SIZE * 0.7) / SPRITE_H
  );
  drawEnemySprite(ctx, VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2, representative, anim, now, false, 0, viewportScale);

  return viewport;
}

function buildMenu(
  view: SelectActionView,
  handlers: SelectActionHandlers
): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "combat-menu";

  ACTION_KINDS.forEach((kind, index) => {
    const item = document.createElement("div");
    item.className = "combat-menu-item";
    if (index === view.selectedIndex) {
      item.classList.add("selected");
    }
    item.dataset.kind = kind;

    const arrow = document.createElement("span");
    arrow.className = "combat-menu-arrow";
    arrow.textContent = index === view.selectedIndex ? "▶" : "";

    const label = document.createElement("span");
    label.className = "combat-menu-label";
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

// --- Party table -----------------------------------------------------------

function buildPartyTable(state: CombatState): HTMLElement {
  const table = document.createElement("table");
  table.className = "combat-party-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of ["Name", "Class", "AC", "Hits", "Status"]) {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const c of state.party) {
    const tr = document.createElement("tr");
    const ko = c.hp <= 0;
    if (ko) tr.classList.add("fallen");

    const nameTd = document.createElement("td");
    nameTd.textContent = c.name;

    const classTd = document.createElement("td");
    classTd.textContent = c.class;

    const acTd = document.createElement("td");
    acTd.textContent = String(effectiveAc(state, c));

    const hitsTd = document.createElement("td");
    hitsTd.textContent = `${Math.max(0, c.hp)}/${c.maxHp}`;

    const statusTd = document.createElement("td");
    statusTd.textContent = formatStatus(c);

    tr.append(nameTd, classTd, acTd, hitsTd, statusTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return table;
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

function formatStatus(c: Character): string {
  if (c.status.length === 0) return "";
  return c.status
    .map((s) => (s === "knockedOut" ? "KO" : s))
    .join(", ");
}
