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
import { isFrontRow } from "../game/party";
import type { GameMode } from "../types";
import type { PityPressure, ZoneHeat } from "../game/encounters";
import { cappedRenderSize, pixelScaleToFit } from "./render-math";
import {
  formatContextualPrompt,
  type ContextualPrompt,
} from "./contextual-prompt";
import { createReveal, completeReveal, stepReveal, type RevealState } from "./prologue-ui";
import { setAmbientSpeaker } from "./ambient-bark-state";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div id="game-wrap">
    <div id="viewport-wrap">
      <div id="message-band">
        <div id="message-box" class="ff6-window" hidden>
          <div id="message"></div>
        </div>
        <div id="hud-chrome" hidden>
          <span id="hud-location">F1 · N</span>
          <span id="hud-danger"></span>
          <span id="hud-controls"> · Tab:Actions · Esc:Save</span>
        </div>
      </div>
      <canvas id="view" width="768" height="672"></canvas>
      <canvas id="maze-webgl" width="768" height="672" hidden></canvas>
      <div id="ambient-bark" class="ff6-window" hidden aria-live="polite">
        <div id="ambient-bark-speaker"></div>
        <div id="ambient-bark-text"></div>
      </div>
      <div id="map-overlay" hidden aria-hidden="true">
        <canvas
          id="map-overlay-canvas"
          width="552"
          height="484"
          role="img"
          aria-label="Dungeon map overlay. North is up."
        ></canvas>
      </div>
      <canvas id="map-canvas" width="768" height="672" style="display:none"></canvas>
      <button
        id="map-overlay-toggle"
        type="button"
        aria-controls="map-overlay"
        aria-pressed="false"
        aria-label="Open quick dungeon map"
      >Y / V · MAP</button>
      <div id="context-prompt" hidden></div>
      <div id="party-strip"></div>
    </div>
    <div id="combat-panel"></div>
    <div id="combat-wrap" style="display:none">
      <canvas id="combat-canvas" class="combat-stage-canvas" width="768" height="672"></canvas>
      <canvas id="combat-phaser-canvas" class="combat-stage-canvas" width="768" height="672" style="display:none"></canvas>
      <div id="combat-popup-anchor"></div>
      <div id="combat-turn-order"></div>
      <div id="combat-windows"></div>
      <div id="card-trial-overlay"></div>
    </div>
  </div>
`;

const gameWrap = document.querySelector<HTMLDivElement>("#game-wrap")!;
const viewportWrap = document.querySelector<HTMLDivElement>("#viewport-wrap")!;
export const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
export const ctx = canvas.getContext("2d")!;
export const mazeWebglCanvas = document.querySelector<HTMLCanvasElement>("#maze-webgl")!;
const mapCanvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
export const mapCtx = mapCanvas.getContext("2d")!;
const mapOverlayEl = document.querySelector<HTMLDivElement>("#map-overlay")!;
export const mapOverlayCanvas = document.querySelector<HTMLCanvasElement>(
  "#map-overlay-canvas"
)!;
export const mapOverlayCtx = mapOverlayCanvas.getContext("2d")!;
const mapOverlayToggleEl = document.querySelector<HTMLButtonElement>("#map-overlay-toggle")!;
const messageBandEl = document.querySelector<HTMLDivElement>("#message-band")!;
const messageBoxEl = document.querySelector<HTMLDivElement>("#message-box")!;
const messageEl = document.querySelector<HTMLDivElement>("#message")!;
const hudChromeEl = document.querySelector<HTMLDivElement>("#hud-chrome")!;
const hudLocationEl = document.querySelector<HTMLSpanElement>("#hud-location")!;
const hudDangerEl = document.querySelector<HTMLSpanElement>("#hud-danger")!;
const contextPromptEl = document.querySelector<HTMLDivElement>("#context-prompt")!;
const partyStripEl = document.querySelector<HTMLDivElement>("#party-strip")!;
const ambientBarkEl = document.querySelector<HTMLDivElement>("#ambient-bark")!;
const ambientBarkSpeakerEl = document.querySelector<HTMLDivElement>("#ambient-bark-speaker")!;
const ambientBarkTextEl = document.querySelector<HTMLDivElement>("#ambient-bark-text")!;
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
/**
 * Full-canvas sibling of `#combat-windows` for Card Trial's sparse HUD and
 * physical hand. Containing block is the 768×672 combat wrap, not the footer
 * band. Empty when Card Trial is not live.
 */
export const combatCardTrialOverlay = document.querySelector<HTMLDivElement>(
  "#card-trial-overlay"
)!;

export function setCardTrialSparseChrome(on: boolean): void {
  combatWrap.classList.toggle("ct-sparse-active", on);
  if (!on) combatCardTrialOverlay.replaceChildren();
}

export const combatCanvas = document.querySelector<HTMLCanvasElement>("#combat-canvas")!;
export const combatCtx = combatCanvas.getContext("2d")!;
/** Sibling stage canvas for Phaser — never reuse #combat-canvas (sticky 2d context). */
export const combatPhaserCanvas = document.querySelector<HTMLCanvasElement>(
  "#combat-phaser-canvas"
)!;

const MAX_RENDER_WIDTH = 768;
const MAX_RENDER_HEIGHT = 672;
export type MazeRendererSurface = "canvas" | "webgl";
let activeMazeRendererSurface: MazeRendererSurface = "canvas";
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
  if (mazeWebglCanvas.width !== width || mazeWebglCanvas.height !== height) {
    mazeWebglCanvas.width = width;
    mazeWebglCanvas.height = height;
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
  if (
    combatPhaserCanvas.width !== combatW ||
    combatPhaserCanvas.height !== combatH
  ) {
    combatPhaserCanvas.width = combatW;
    combatPhaserCanvas.height = combatH;
  }
}

function syncMazeRendererSurfaces(isDungeon: boolean): void {
  canvas.style.display = isDungeon && activeMazeRendererSurface === "canvas" ? "" : "none";
  mazeWebglCanvas.hidden = !(isDungeon && activeMazeRendererSurface === "webgl");
  mazeWebglCanvas.style.display = isDungeon && activeMazeRendererSurface === "webgl" ? "" : "none";
}

export function setMazeRendererSurface(surface: MazeRendererSurface): void {
  activeMazeRendererSurface = surface;
  syncMazeRendererSurfaces(viewportWrap.style.display !== "none");
}

export function getMazeRendererSurface(): HTMLCanvasElement {
  return activeMazeRendererSurface === "webgl" ? mazeWebglCanvas : canvas;
}

export function setMazeSurfaceOpacity(opacity: string): void {
  canvas.style.opacity = opacity;
  mazeWebglCanvas.style.opacity = opacity;
}

/**
 * Pixel-scale the whole game up to fill desktop viewports while keeping
 * pixels crisp. Purely a display-layer transform on `#game-wrap` — the single
 * common ancestor of the dungeon viewport, the DOM menu panel, and the combat
 * canvas+windows — so canvases and every (percentage/absolute) overlay scale in
 * lockstep. Touches no renderer maths and no canvas internal resolution: the
 * corridor canvas stays clamped at 768×672 by `resizeCorridorCanvas`, and this
 * transform simply upscales that crisp bitmap (`image-rendering: pixelated`).
 *
 * Measures the live footprint via `offsetWidth/Height` (transform-independent,
 * so re-running never feeds back on itself) against the `#app` content box.
 * Scale snaps to half-integers `>= 1` (1 / 1.5 / 2 / …) so 1080p laptops get
 * 1.5× instead of sitting at 1× with empty margin, while small screens keep
 * their existing `max-width` responsive-down behaviour untouched.
 */
export function resizeGameScale(): void {
  const scale = pixelScaleToFit(
    app.clientWidth,
    app.clientHeight,
    gameWrap.offsetWidth,
    gameWrap.offsetHeight
  );
  gameWrap.style.transform = scale > 1 ? `scale(${scale})` : "";
}

resizeCorridorCanvas();
new ResizeObserver(resizeCorridorCanvas).observe(viewportWrap);
// The ResizeObserver above only fires when #viewport-wrap's *layout* box
// changes; on wide screens #game-wrap stays capped at its max-width, so window
// resizes that only change surrounding margin never reach it. Handle the app
// viewport directly for the pixel scale (and refresh canvas sizing too).
window.addEventListener("resize", () => {
  resizeGameScale();
  resizeCorridorCanvas();
});

function syncMessageBandVisibility(): void {
  const hasMsg = messageReveal !== null;
  const hasChrome = !hudChromeEl.hidden && hudChromeEl.textContent.trim().length > 0;
  messageBoxEl.hidden = !hasMsg;
  messageBandEl.classList.toggle("has-message", hasMsg);
  messageBandEl.classList.toggle("chrome-only", !hasMsg && hasChrome);
  messageBandEl.hidden = !hasMsg && !hasChrome;
}

/**
 * Dungeon-notification typewriter: quick relative to the title-screen
 * prologue (this is gameplay feedback, not myth text) but deliberately not
 * instant — a message that reveals over a beat can't be blown past by the
 * keypress that triggered it, the way an instant-paint banner could.
 * `clearMessageOnPlayerAction` intercepts input mid-reveal and completes the
 * text instead of dismissing it, so the earliest a message disappears is the
 * *second* player action after it appeared.
 */
const MESSAGE_REVEAL_STYLE = {
  charsPerSec: 42,
  pauseFullMs: 110,
  pauseHalfMs: 50,
} as const;

let messageReveal: RevealState | null = null;
let messageRevealRaf = 0;

function tickMessageReveal(now: number): void {
  messageRevealRaf = 0;
  if (!messageReveal || messageReveal.done) return;
  messageReveal = stepReveal(messageReveal, now, MESSAGE_REVEAL_STYLE);
  messageEl.textContent = messageReveal.full.slice(0, messageReveal.visible);
  if (!messageReveal.done) {
    messageRevealRaf = requestAnimationFrame(tickMessageReveal);
  }
}

/**
 * Debug-only observer for message writes (?debug=1 event buffer). Null in
 * normal play; this is the single seam so the debug layer doesn't have to
 * patch or poll `#message`.
 */
let debugMessageHook: ((text: string) => void) | null = null;

interface QueuedAmbientBark {
  speakerId: string;
  speaker: string;
  text: string;
  durationMs: number;
  onShow?: () => void;
}

const ambientBarkQueue: QueuedAmbientBark[] = [];
let ambientBarkTimer = 0;

function presentNextAmbientBark(): void {
  if (ambientBarkTimer || ambientBarkQueue.length === 0) return;
  const bark = ambientBarkQueue.shift()!;
  ambientBarkSpeakerEl.textContent = bark.speaker;
  ambientBarkTextEl.textContent = bark.text;
  ambientBarkEl.hidden = false;
  const until = performance.now() + bark.durationMs;
  setAmbientSpeaker(bark.speakerId, until);
  bark.onShow?.();
  ambientBarkTimer = window.setTimeout(() => {
    ambientBarkTimer = 0;
    ambientBarkEl.hidden = true;
    ambientBarkTextEl.textContent = "";
    setAmbientSpeaker(null);
    presentNextAmbientBark();
  }, bark.durationMs);
}

/** Queue a compact, nonmodal world bark; dungeon movement remains enabled. */
export function showAmbientBark(bark: {
  speakerId: string;
  speaker: string;
  text: string;
  durationMs?: number;
  onShow?: () => void;
}): void {
  ambientBarkQueue.push({ ...bark, durationMs: bark.durationMs ?? 2400 });
  presentNextAmbientBark();
}

export function setDebugMessageHook(fn: ((text: string) => void) | null): void {
  debugMessageHook = fn;
}

export type SetMessageOptions = {
  /**
   * Skip the typewriter and paint the full string immediately. Use for
   * interactive overlays that refresh often (trap menu cursor moves) — those
   * are menus, not notifications, and restarting a reveal on every arrow key
   * makes them unreadable.
   */
  instant?: boolean;
};

/**
 * Show or update the message overlay as a typewriter reveal inside the blue
 * notification window. Empty text hides the box. Messages clear on the
 * *second* player action via `clearMessageOnPlayerAction` (not on a timer) —
 * the first action mid-reveal completes the text instead of dismissing it.
 */
export function setMessage(text: string, opts?: SetMessageOptions): void {
  debugMessageHook?.(text);
  // Trap prompts / multi-line HTML-free copy: plain text only. Truncate for
  // strip density; full transcript belongs in the grimoire when wired.
  const trimmed = text.trim();
  if (messageRevealRaf) {
    cancelAnimationFrame(messageRevealRaf);
    messageRevealRaf = 0;
  }
  if (!trimmed) {
    messageReveal = null;
    messageEl.textContent = "";
    syncMessageBandVisibility();
    return;
  }
  const lines = trimmed.split(/\n/).slice(0, 4);
  let body = lines.join("\n");
  if (trimmed.split(/\n/).length > 4 || body.length > 220) {
    body = body.slice(0, 218).replace(/\s+\S*$/, "") + "…";
  }
  if (opts?.instant) {
    messageReveal = completeReveal(createReveal(body, performance.now()));
    messageEl.textContent = messageReveal.full;
    syncMessageBandVisibility();
    return;
  }
  messageReveal = createReveal(body, performance.now());
  messageEl.textContent = "";
  syncMessageBandVisibility();
  messageRevealRaf = requestAnimationFrame(tickMessageReveal);
}

/**
 * Current message-overlay text plus whether the band is actually showing it.
 * Exposed for the ?debug=1 snapshot so the debug layer doesn't re-derive the
 * visibility rule that `syncMessageBandVisibility` already owns.
 */
export function getMessageText(): { text: string; visible: boolean } {
  // Report the glyphs the player can currently see, not the reveal's hidden
  // full string. The debug event log already records the complete setMessage
  // payload; snapshot() is a description of the rendered state right now.
  const text = messageEl.textContent ?? "";
  return { text: text.trim(), visible: messageBandEl.classList.contains("has-message") };
}

/**
 * Clear informational message text after a player dungeon action. If the
 * message is still mid-typewriter, the action completes the reveal instead
 * of dismissing it, so a quick keypress can't skip a notification unread.
 */
export function clearMessageOnPlayerAction(): void {
  if (!messageReveal) return;
  if (!messageReveal.done) {
    if (messageRevealRaf) {
      cancelAnimationFrame(messageRevealRaf);
      messageRevealRaf = 0;
    }
    messageReveal = completeReveal(messageReveal);
    messageEl.textContent = messageReveal.full;
    return;
  }
  messageReveal = null;
  messageEl.textContent = "";
  syncMessageBandVisibility();
}

/** Clear the party status overlay (used when leaving dungeon mode). */
export function clearPartyStrip(): void {
  partyStripEl.innerHTML = "";
  // Clear every element renderPartyStrip writes, not just the strip — leaving
  // a stale "● Hot ▮▮▮" behind is currently invisible only because showMode()
  // hides the whole message band outside dungeon mode. Don't rely on that.
  hudDangerEl.textContent = "";
  hudDangerEl.className = "";
  // The next dungeon frame must recreate the DOM even when the party state
  // itself has not changed since this overlay was cleared.
  lastPartyStripSig = "";
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

// This is called every rAF tick in dungeon mode, but HP/status/facing only
// actually change on discrete game events — rebuilding the DOM subtree on
// every frame regardless is pure churn. Skip the innerHTML write (and the
// chrome textContent write) when the signature that determines them hasn't
// moved since last frame.
let lastPartyStripSig = "";

/**
 * Render the bottom party overlay (token sibling of combat roster) and
 * refresh floor·facing chrome.
 */
/**
 * Two-channel dungeon danger readout.
 *
 * `heat` (where you are) and `pressure` (how overdue a fight is) are
 * independent — the pity ramp ignores encounter zones, so a dead pocket can
 * still be about to produce a fight. Each channel is encoded in shape AND
 * text, never colour alone: colour is a redundant hint, so the readout stays
 * legible to a colour-blind player and in a screenshot.
 */
export interface DangerReadout {
  heat: ZoneHeat;
  pressure: PityPressure;
}

/** Glyph + word for the zone-heat channel. */
// Glyphs read as increasing density (◌ ○ ◐ ●). "dead" deliberately avoids a
// middot — the HUD already uses "·" as its field separator, so "· · Still"
// rendered as an ambiguous double dot.
const HEAT_LABELS: Record<ZoneHeat, string> = {
  // "Unhunted", not "Still"/"Safe": a rateMul-0 zone stops ordinary rolls but
  // NOT the pity force, which still guarantees a fight at ENCOUNTER_PITY_FORCE
  // (verified for F4 vestry-quiet and F5 drip-vestry-safe). The label must not
  // promise a safety the encounter clock does not honour.
  dead: "◌ Unhunted",
  quiet: "○ Quiet",
  normal: "◐ Active",
  hot: "● Hot",
};

/** Filling pip bar for the pity-pressure channel. */
const PRESSURE_PIPS: Record<PityPressure, string> = {
  cooldown: "▮▯▯",
  live: "▮▮▯",
  ramping: "▮▮▮",
};

export function renderPartyStrip(
  party: Character[],
  compass: string,
  floorLabel = "F?",
  danger?: DangerReadout
): void {
  const dangerSig = danger ? `${danger.heat}:${danger.pressure}` : "-";
  const sig =
    `${floorLabel}|${compass}|${dangerSig}|` +
    party
      .map(
        (c) =>
          `${c.id}:${c.hp}:${c.maxHp}:${c.formationSlot}:${c.status.join(",")}`
      )
      .join(";");
  if (sig === lastPartyStripSig) return;
  lastPartyStripSig = sig;

  // Keyboard players have no gamepad glyphs to fall back on, so keep the
  // dungeon key legend persistent whenever a notification is not using the
  // band (playtest finding: Camp/Map/Grimoire/Actions were "secret keys").
  hudLocationEl.textContent = `${floorLabel} · ${compass}`;
  if (danger) {
    hudDangerEl.textContent =
      ` · ${HEAT_LABELS[danger.heat]} ${PRESSURE_PIPS[danger.pressure]}`;
    hudDangerEl.className = `heat-${danger.heat} pressure-${danger.pressure}`;
  } else {
    hudDangerEl.textContent = "";
    hudDangerEl.className = "";
  }
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
        isFrontRow(c) ? "Front" : "Back"
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

/** Bind the single pointer-accessible quick-map control. */
export function bindMapOverlayButton(onToggle: () => void): () => void {
  const handleClick = () => onToggle();
  mapOverlayToggleEl.addEventListener("click", handleClick);
  return () => mapOverlayToggleEl.removeEventListener("click", handleClick);
}

/** Update open/closed chrome without changing which top-level game pane shows. */
export function setMapOverlayPresentation(visible: boolean): void {
  mapOverlayEl.hidden = !visible;
  mapOverlayEl.setAttribute("aria-hidden", visible ? "false" : "true");
  mapOverlayToggleEl.textContent = visible ? "Y / V · CLOSE MAP" : "Y / V · MAP";
  mapOverlayToggleEl.setAttribute("aria-pressed", visible ? "true" : "false");
  mapOverlayToggleEl.setAttribute(
    "aria-label",
    visible ? "Close quick dungeon map" : "Open quick dungeon map",
  );
}

/** Show/hide the top-level shell elements for the current game mode. */
export function showMode(
  mode: GameMode,
  mapVisible: boolean,
  mapOverlayVisible = false,
): void {
  const isDungeon = mode === "dungeon";
  const isCombat = mode === "combat";
  const usesDomPanel =
    mode === "town" ||
    mode === "camp" ||
    mode === "title" ||
    mode === "game_over" ||
    mode === "arena" ||
    mode === "dialog";

  viewportWrap.style.display = isDungeon ? "" : "none";
  syncMazeRendererSurfaces(isDungeon);
  partyStripEl.style.display = isDungeon ? "" : "none";
  contextPromptEl.style.display = isDungeon ? "" : "none";
  messageBandEl.style.display = isDungeon && !mapVisible ? "" : "none";
  combatPanel.style.display = usesDomPanel ? "flex" : "none";
  combatPanel.classList.toggle("ff6-menu-host", usesDomPanel);
  combatPanel.classList.toggle("bg-town", mode === "town");
  combatPanel.classList.toggle("bg-camp", mode === "camp");
  combatPanel.classList.toggle("bg-arena", mode === "arena");
  combatWrap.style.display = isCombat ? "block" : "none";
  mapCanvas.style.display = isDungeon && mapVisible ? "block" : "none";
  const showMapOverlay = isDungeon && !mapVisible && mapOverlayVisible;
  setMapOverlayPresentation(showMapOverlay);
  mapOverlayToggleEl.hidden = !isDungeon || mapVisible;

  // Measure the footprint *after* the per-mode display toggles above so the
  // active pane (viewport / DOM panel / combat) is the one being sized. All
  // three panes share the 8/7 design box, so the scale stays stable across
  // modes; this call keeps it correct on the first transition and if the
  // viewport changed while in a mode that doesn't fire a resize.
  resizeGameScale();
  resizeCorridorCanvas();
}

/**
 * NPC dialogue is the overlay that must NOT hide the dungeon behind it
 * (blocking overlays — save, grimoire, perk select, tavern, Namanda —
 * replace the whole screen via showMode()'s generic `usesDomPanel` path).
 * Keeps #viewport-wrap/#view exactly as dungeon mode left them and positions
 * #combat-panel as a bottom-anchored bar over them (`.npc-dialogue-host` in
 * styles.css). main.ts's openNPCPanel calls this instead of
 * presentBlockingOverlay().
 */
export function showNpcDialogueOverlay(): void {
  viewportWrap.style.display = "";
  canvas.style.display = "";
  partyStripEl.style.display = "";
  contextPromptEl.style.display = "";
  combatWrap.style.display = "none";
  mapCanvas.style.display = "none";
  // The dungeon HUD message band shows its own independent "you meet
  // <name>, <title>" line (and runs its own separate typewriter reveal) for
  // the step that opened this NPC — leaving it up duplicates/collides with
  // the dialogue panel's own header. showMode("dungeon", ...) restores its
  // normal visibility once the panel closes.
  messageBandEl.style.display = "none";
  combatPanel.style.display = "flex";
  combatPanel.classList.add("npc-dialogue-host");
}

/** Reverse of showNpcDialogueOverlay(); main.ts follows this with the
 *  normal showMode("dungeon", ...) (or showMode("combat", ...) on an
 *  Attack/botched-Steal hand-off) to fully restore standard mode display. */
export function hideNpcDialogueOverlay(): void {
  combatPanel.classList.remove("npc-dialogue-host");
  combatPanel.style.display = "none";
}
