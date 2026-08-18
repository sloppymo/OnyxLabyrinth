/**
 * Read a mounted FF6 window the way a player would: title, rows, cursor, footer.
 * Used by the debug-gated gatherer so menu text comes from presentation, not
 * controller internals.
 */

import type { PlayerMenu, PlayerMenuEntry } from "./player-observation";

export function contentTextFromElement(root: ParentNode | null | undefined): string | undefined {
  if (!root || typeof (root as Element).querySelector !== "function") return undefined;
  const content = (root as Element).querySelector?.(".ff6-content");
  const text = content?.textContent?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function playerMenuFromElement(root: ParentNode | null | undefined): PlayerMenu | null {
  if (!root || typeof (root as Element).querySelector !== "function") return null;
  const win =
    (root as Element).matches?.(".ff6-window")
      ? (root as Element)
      : root.querySelector(".ff6-window");
  if (!win) return null;

  const title = win.querySelector(".ff6-menu-title")?.textContent?.trim() || undefined;
  const footer = win.querySelector(".ff6-footer:not(.ff6-footer2)")?.textContent?.trim() || undefined;
  const footer2 = win.querySelector(".ff6-footer2")?.textContent?.trim() || undefined;
  const flashRaw = win.querySelector(".ff6-flash")?.textContent?.trim();
  const flash = flashRaw ? flashRaw : undefined;

  const rows = [...win.querySelectorAll(".ff6-menu-item")];
  const entries: PlayerMenuEntry[] = rows.map((row) => {
    const label = row.querySelector(".ff6-sel-label")?.textContent?.trim() ?? row.textContent?.trim() ?? "";
    const detail = row.querySelector(".ff6-sel-detail")?.textContent?.trim() || undefined;
    const disabled = row.classList.contains("disabled");
    return {
      label,
      ...(detail ? { detail } : {}),
      ...(disabled ? { disabled: true } : {}),
    };
  });

  let selectedIndex = rows.findIndex((row) => row.classList.contains("selected"));
  if (selectedIndex < 0) selectedIndex = 0;

  if (!title && entries.length === 0 && !footer && !flash) return null;

  return {
    ...(title ? { title } : {}),
    entries,
    selectedIndex,
    ...(footer ? { footer } : {}),
    ...(footer2 ? { footer2 } : {}),
    ...(flash ? { flash } : {}),
  };
}
