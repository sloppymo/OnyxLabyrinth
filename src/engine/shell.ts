// DOM shell management for OnyxLabyrinth.
//
// This module is the single source of truth for:
// - canvas sizing,
// - message overlay visibility,
// - party status strip rendering,
// - which top-level shell elements are visible for each game mode.
//
// Keeping all display toggling in one place prevents the scattered
// `style.display = ...` calls that previously made screen-state bugs easy.

import type { Character } from "../game/party";
import type { GameMode } from "../types";
import { cappedRenderSize } from "./render-math";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div id="game-wrap">
    <div id="viewport-wrap">
      <div id="flash-overlay"></div>
      <div id="message"></div>
      <canvas id="view" width="768" height="672"></canvas>
      <canvas id="map-canvas" width="768" height="672" style="display:none"></canvas>
    </div>
    <div id="party-strip"></div>
    <div id="hint"><span id="compass">N</span> &uarr;/W forward &middot; &darr;/S back &middot; &larr;/A turn left &middot; &rarr;/D turn right &middot; C camp &middot; M map &middot; T town &middot; U unlock &middot; Esc menu</div>
    <div id="combat-panel"></div>
    <div id="combat-wrap" style="display:none">
      <canvas id="combat-canvas" width="768" height="672"></canvas>
      <div id="combat-windows"></div>
    </div>
  </div>
`;

const viewportWrap = document.querySelector<HTMLDivElement>("#viewport-wrap")!;
export const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
export const ctx = canvas.getContext("2d")!;
const mapCanvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
export const mapCtx = mapCanvas.getContext("2d")!;
const messageEl = document.querySelector<HTMLDivElement>("#message")!;
const flashOverlayEl = document.querySelector<HTMLDivElement>("#flash-overlay")!;
const partyStripEl = document.querySelector<HTMLDivElement>("#party-strip")!;
export const combatPanel = document.querySelector<HTMLDivElement>("#combat-panel")!;
const combatWrap = document.querySelector<HTMLDivElement>("#combat-wrap")!;
export const combatWindows = document.querySelector<HTMLDivElement>("#combat-windows")!;
export const combatCanvas = document.querySelector<HTMLCanvasElement>("#combat-canvas")!;
export const combatCtx = combatCanvas.getContext("2d")!;
const compassEl = document.querySelector<HTMLSpanElement>("#compass")!;

// Maximum intrinsic render resolution for the corridor and map canvases.
// CSS scales the canvas to fill the container, so on large/high-DPI displays
// we render at a fixed art size instead of allocating a multi-megapixel
// buffer every frame. Pixelated upscaling preserves the retro look.
const MAX_RENDER_WIDTH = 768;
const MAX_RENDER_HEIGHT = 672;

export function resizeCorridorCanvas() {
  const rect = viewportWrap.getBoundingClientRect();
  const { width, height } = cappedRenderSize(
    rect.width,
    rect.height,
    MAX_RENDER_WIDTH,
    MAX_RENDER_HEIGHT
  );
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (mapCanvas.width !== width || mapCanvas.height !== height) {
    mapCanvas.width = width;
    mapCanvas.height = height;
  }
  // Combat canvas: fixed 768x672 bitmap resolution (matches the corridor
  // canvas's design size). CSS scales it to fit the container.
  const combatW = 768;
  const combatH = 672;
  if (combatCanvas.width !== combatW || combatCanvas.height !== combatH) {
    combatCanvas.width = combatW;
    combatCanvas.height = combatH;
  }
}

resizeCorridorCanvas();
new ResizeObserver(resizeCorridorCanvas).observe(viewportWrap);

let messageTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Trigger a brief combat-encounter flash over the viewport. The flash is a
 * pseudo-element animation (defined in styles.css) so it does not block the
 * mode transition or require JS-driven frame loops.
 */
export function flashEncounter(): void {
  if (!flashOverlayEl) return;
  flashOverlayEl.classList.remove("flash-active");
  // Force a reflow so removing + re-adding retriggers the animation even if
  // called again while a previous flash is still running.
  void flashOverlayEl.offsetWidth;
  flashOverlayEl.classList.add("flash-active");
  window.setTimeout(() => {
    flashOverlayEl.classList.remove("flash-active");
  }, 350);
}

/** Show or update the message overlay. Empty text hides the overlay via CSS.
 *  Non-empty messages auto-dismiss after a few seconds so the viewport isn't
 *  permanently covered by stale messages like "You enter the dungeon...". */
export function setMessage(text: string): void {
  if (messageTimeout) {
    clearTimeout(messageTimeout);
    messageTimeout = null;
  }
  messageEl.textContent = text;
  if (text) {
    messageTimeout = setTimeout(() => {
      messageEl.textContent = "";
      messageTimeout = null;
    }, 3500);
  }
}

/** Set the compass direction displayed in the hint bar. */
function setCompass(direction: string): void {
  compassEl.textContent = direction;
}

/** Clear the party status strip (used when leaving dungeon mode). */
export function clearPartyStrip(): void {
  partyStripEl.innerHTML = "";
}

/** Render the 3x2 party status grid and update the compass. */
export function renderPartyStrip(party: Character[], compass: string): void {
  setCompass(compass);

  const parts: string[] = [];
  for (const c of party) {
    const ko = c.status.includes("knockedOut") || c.hp <= 0;
    const hpPct = c.maxHp > 0 ? (Math.max(0, c.hp) / c.maxHp) * 100 : 0;
    const spPct = c.maxSp > 0 ? (c.sp / c.maxSp) * 100 : 0;
    const row = c.formationSlot <= 2 ? "F" : "B";
    parts.push(
      `<div class="ps-char ${ko ? "ko" : ""}">` +
        `<span class="ps-name">${c.name}</span>` +
        `<span class="ps-bar"><span class="ps-bar-fill hp" style="width:${hpPct}%"></span></span>` +
        `<span class="ps-num">${Math.max(0, c.hp)}/${c.maxHp}</span>` +
        (c.maxSp > 0
          ? `<span class="ps-bar"><span class="ps-bar-fill sp" style="width:${spPct}%"></span></span>` +
            `<span class="ps-num">${c.sp}/${c.maxSp}</span>`
          : `<span class="ps-num">${row}</span>`) +
        `</div>`
    );
  }
  partyStripEl.innerHTML = parts.join("");
}

const COMPASS_DIRS = ["N", "E", "S", "W"];

/** Convert a numeric facing to a compass string. */
export function compassForFacing(facing: number): string {
  return COMPASS_DIRS[facing] ?? "N";
}

/** Show/hide the top-level shell elements for the current game mode. */
export function showMode(mode: GameMode, mapVisible: boolean): void {
  const isDungeon = mode === "dungeon";
  const isCombat = mode === "combat";
  // The combat-panel (DOM) is used by town, camp, party creation, and title.
  // Combat mode uses the combat-canvas instead.
  const usesDomPanel =
    mode === "town" ||
    mode === "camp" ||
    mode === "title" ||
    mode === "party_creation" ||
    mode === "game_over";

  viewportWrap.style.display = isDungeon ? "" : "none";
  canvas.style.display = isDungeon ? "" : "none";
  combatPanel.style.display = usesDomPanel ? "block" : "none";
  // FF6 combat: the scene canvas and the DOM menu windows are both visible
  // for the entire fight (windows overlay the canvas bottom).
  combatWrap.style.display = isCombat ? "block" : "none";
  mapCanvas.style.display = isDungeon && mapVisible ? "block" : "none";

  // Resize canvases — the combat canvas may not have been sized yet if it
  // was hidden when the initial resize ran.
  resizeCorridorCanvas();
}
