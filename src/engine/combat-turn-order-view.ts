/**
 * FF6-style turn-order strip (upper-right of the combat viewport).
 *
 * Passive readability display — remaining actors for this round in act order.
 * Acted entries are omitted (drop-off). Current actor highlighted; sleep/
 * paralysis greyed with a status tag. No input bindings.
 */

import type { TurnOrderViewEntry } from "../game/combat-turn-order";
import { STATUS_TAG_LABELS } from "./combat-select-action-view";

function el(className: string, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

/**
 * Render the turn-order strip into `container` (replaces children).
 * Empty / result → clears the container so nothing lingers after combat.
 */
export function renderTurnOrderStrip(
  container: HTMLElement,
  entries: readonly TurnOrderViewEntry[]
): void {
  container.innerHTML = "";
  if (entries.length === 0) return;

  const win = el("ff6-window ff6-turn-order");
  win.setAttribute("aria-label", "Turn order");
  for (const entry of entries) {
    const row = el(
      `ff6-turn-order-row side-${entry.kind}` +
        (entry.current ? " current" : "") +
        (entry.willSkip ? " will-skip" : "")
    );
    const marker = el("ff6-to-marker", entry.current ? "▶" : "");
    const name = el("ff6-to-name", entry.name);
    row.appendChild(marker);
    row.appendChild(name);
    if (entry.willSkip && entry.skipReason) {
      const tag = el(
        "ff6-status-tag",
        STATUS_TAG_LABELS[entry.skipReason] ?? entry.skipReason.slice(0, 3).toUpperCase()
      );
      row.appendChild(tag);
    }
    win.appendChild(row);
  }
  container.appendChild(win);
}
