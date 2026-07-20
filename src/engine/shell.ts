// DOM shell management for OnyxLabyrinth.
//
// This module is the single source of truth for:
// - canvas sizing,
// - message overlay visibility,
// - party status overlay rendering,
// - which top-level shell elements are visible for each game mode.
//
// Keeping all display toggling in one place prevents the scattered
// `style.display = ...` calls that previously made screen-state bugs easy.

import type { Character } from "../game/party";
import type { GameMode } from "../types";
import { cappedRenderSize } from "./render-math";
import {
  formatContextualPrompt,
  type ContextualPrompt,
} from "./contextual-prompt";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div id="game-wrap">
    <div id="viewport-wrap">
      <div id="flash-overlay"></div>
      <div id="message-band">
        <div id="message"></div>
        <div id="hud-chrome" hidden>F1 · N</div>
      </div>
      <canvas id="view" width="768" height="672"></canvas>
      <canvas id="map-canvas" width="768" height="672" style="display:none"></canvas>
      <div id="context-prompt" hidden></div>
      <div id="party-strip"></div>
    </div>
    <div id="combat-panel"></div>
    <div id="combat-wrap" style="display:none">
      <canvas id="combat-canvas" width="768" height="672"></canvas>
      <div id="combat-popup-anchor"></div>
      <div id="combat-turn-order"></div>
      <div id="combat-windows"></div>
    </div>
  </div>
`;

const viewportWrap = document.querySelector<HTMLDivElement>("#viewport-wrap")!;
export const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
export const ctx = canvas.getContext("2d")!;
const mapCanvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
export const mapCtx = mapCanvas.getContext("2d")!;
const messageBandEl = document.querySelector<HTMLDivElement>("#message-band")!;
const messageEl = document.querySelector<HTMLDivElement>("#message")!;
const hudChromeEl = document.querySelector<HTMLDivElement>("#hud-chrome")!;
const contextPromptEl = document.querySelector<HTMLDivElement>("#context-prompt")!;
const flashOverlayEl = document.querySelector<HTMLDivElement>("#flash-overlay")!;
const partyStripEl = document.querySelector<HTMLDivElement>("#party-strip")!;
export const combatPanel = document.querySelector<HTMLDivElement>("#combat-panel")!;
const combatWrap = document.querySelector<HTMLDivElement>("#combat-wrap")!;
export const combatWindows = document.querySelector<HTMLDivElement>("#combat-windows")!;
/**
 * Full-canvas-sized sibling of `#combat-windows` — the command popup renders
 * here instead of inside the footer band, so its `position: absolute`
 * containing block is the whole 768×672 design space (matching
 * combat-scene-math's sprite coordinates) rather than the ~144px footer.
 * That lets the popup anchor next to the acting character's actual sprite
 * position instead of always docking over the same fixed area.
 */
export const combatPopupAnchor = document.querySelector<HTMLDivElement>(
  "#combat-popup-anchor"
)!;
/** Upper-right turn-order strip — sibling of the command popup anchor. */
export const combatTurnOrder = document.querySelector<HTMLDivElement>(
  "#combat-turn-order"
)!;
export const combatCanvas = document.querySelector<HTMLCanvasElement>("#combat-canvas")!;
export const combatCtx = combatCanvas.getContext("2d")!;

const MAX_RENDER_WIDTH = 768;
const MAX_RENDER_HEIGHT = 672;
/** Inner fill track of the 48px party HP bar (1px border × 2). */
const HP_BAR_TRACK_PX = 46;

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
  const combatW = 768;
  const combatH = 672;
  if (combatCanvas.width !== combatW || combatCanvas.height !== combatH) {
    combatCanvas.width = combatW;
    combatCanvas.height = combatH;
  }
}

resizeCorridorCanvas();
new ResizeObserver(resizeCorridorCanvas).observe(viewportWrap);

/**
 * Trigger a brief combat-encounter flash over the viewport.
 */
export function flashEncounter(): void {
  if (!flashOverlayEl) return;
  flashOverlayEl.classList.remove("flash-active");
  void flashOverlayEl.offsetWidth;
  flashOverlayEl.classList.add("flash-active");
  window.setTimeout(() => {
    flashOverlayEl.classList.remove("flash-active");
  }, 900);
}

function syncMessageBandVisibility(): void {
  const hasMsg = messageEl.textContent.trim().length > 0;
  const hasChrome = !hudChromeEl.hidden && hudChromeEl.textContent.trim().length > 0;
  messageBandEl.classList.toggle("has-message", hasMsg);
  messageBandEl.classList.toggle("chrome-only", !hasMsg && hasChrome);
  messageBandEl.hidden = !hasMsg && !hasChrome;
}

/**
 * Show or update the message overlay. Empty text hides the text node.
 * Messages clear on the next player action via `clearMessageOnPlayerAction`
 * (not on a timer) — crawler contract: text waits, but never blocks.
 */
export function setMessage(text: string): void {
  // Trap prompts / multi-line HTML-free copy: plain text only. Truncate for
  // strip density; full transcript belongs in the grimoire when wired.
  const trimmed = text.trim();
  if (!trimmed) {
    messageEl.textContent = "";
  } else {
    const lines = trimmed.split(/\n/).slice(0, 4);
    let body = lines.join("\n");
    if (trimmed.split(/\n/).length > 4 || body.length > 220) {
      body = body.slice(0, 218).replace(/\s+\S*$/, "") + "…";
    }
    messageEl.textContent = body;
  }
  syncMessageBandVisibility();
}

/** Clear informational message text after a player dungeon action. */
export function clearMessageOnPlayerAction(): void {
  if (!messageEl.textContent) return;
  messageEl.textContent = "";
  syncMessageBandVisibility();
}

/** Clear the party status overlay (used when leaving dungeon mode). */
export function clearPartyStrip(): void {
  partyStripEl.innerHTML = "";
}

const STATUS_NOTCH: Partial<Record<Character["status"][number], string>> = {
  poison: "poison",
  sleep: "sleep",
  paralysis: "paralysis",
  blind: "blind",
  wet: "wet",
};

function hpBarFillPx(hp: number, maxHp: number): { px: number; tone: string } {
  const safeHp = Math.max(0, hp);
  const ratio = maxHp > 0 ? safeHp / maxHp : 0;
  const px = safeHp <= 0 ? 0 : Math.max(1, Math.round(ratio * HP_BAR_TRACK_PX));
  let tone = "";
  if (safeHp <= 0) tone = "empty";
  else if (ratio <= 0.25) tone = "critical";
  else if (ratio <= 0.5) tone = "wounded";
  return { px, tone };
}

/**
 * Render the bottom party overlay (token sibling of combat roster) and
 * refresh floor·facing chrome.
 */
export function renderPartyStrip(
  party: Character[],
  compass: string,
  floorLabel = "F?"
): void {
  // Keyboard players have no gamepad glyphs to fall back on, so keep the
  // dungeon key legend visible at all times rather than only on first entry
  // (playtest finding: Camp/Map/Grimoire/Actions were "secret keys").
  hudChromeEl.textContent = `${floorLabel} · ${compass} · Tab:Actions · Esc:Save`;
  hudChromeEl.hidden = false;
  syncMessageBandVisibility();

  const parts: string[] = [];
  for (const c of party) {
    const ko = c.status.includes("knockedOut") || c.hp <= 0;
    const { px, tone } = hpBarFillPx(c.hp, c.maxHp);
    const low = !ko && tone === "critical";
    const notches = c.status
      .map((s) => STATUS_NOTCH[s])
      .filter((s): s is string => !!s)
      .map((s) => `<span class="ps-notch st-${s}" title="${s}"></span>`)
      .join("");
    const hpClass = tone === "critical" || tone === "wounded" ? tone : "";
    parts.push(
      `<div class="ps-char ${ko ? "ko" : ""} ${low ? "low" : ""}" title="${
        c.formationSlot <= 2 ? "Front" : "Back"
      } row">` +
        `<div class="ps-name-row"><span class="ps-name">${c.name}</span>${notches}</div>` +
        `<div class="ps-stat-row">` +
        `<span class="ps-bar"><span class="ps-bar-fill hp ${tone}" style="width:${px}px"></span></span>` +
        `<span class="ps-num ${hpClass}">${Math.max(0, c.hp)}/${c.maxHp}</span>` +
        `</div>` +
        `</div>`
    );
  }
  partyStripEl.innerHTML = parts.join("");
}

/** Update the contextual glyph prompt (state — not cleared on input). */
export function setContextualPrompt(prompt: ContextualPrompt | null): void {
  if (!prompt) {
    contextPromptEl.hidden = true;
    contextPromptEl.textContent = "";
    return;
  }
  contextPromptEl.hidden = false;
  contextPromptEl.textContent = formatContextualPrompt(prompt);
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
  const usesDomPanel =
    mode === "town" ||
    mode === "camp" ||
    mode === "title" ||
    mode === "party_creation" ||
    mode === "game_over" ||
    mode === "arena";

  viewportWrap.style.display = isDungeon ? "" : "none";
  canvas.style.display = isDungeon ? "" : "none";
  partyStripEl.style.display = isDungeon ? "" : "none";
  contextPromptEl.style.display = isDungeon ? "" : "none";
  messageBandEl.style.display = isDungeon ? "" : "none";
  combatPanel.style.display = usesDomPanel ? "flex" : "none";
  combatPanel.classList.toggle("ff6-menu-host", usesDomPanel);
  combatPanel.classList.toggle("party-create-host", mode === "party_creation");
  combatWrap.style.display = isCombat ? "block" : "none";
  mapCanvas.style.display = isDungeon && mapVisible ? "block" : "none";

  resizeCorridorCanvas();
}
