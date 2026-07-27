/**
 * FF6-inspired map ↔ combat screen transition.
 *
 * SNES FF6 closes the field with PPU window masks updated per scanline via
 * HDMA (not a 3D mesh). We approximate that with a canvas-2D scanline aperture
 * that spins shut over a snapshot of the live viewport, then reveals the next
 * mode under black. Exit uses a shorter dissolve — same funnel for every
 * post-combat destination.
 *
 * Overlapping callers (e.g. Arena "Next Fight" during leave-reveal) are
 * coordinated two ways: main.ts serializes startCombat/leaveCombat on a
 * promise chain, and this module bumps a generation so a superseded reveal
 * cannot hideOverlay() / rewrite opacity out from under a newer wipe.
 */

const DESIGN_W = 768;
const DESIGN_H = 672;
/** Below this, a source canvas is treated as empty (hidden 1×1 corridor, etc.). */
const MIN_SOURCE_PX = 16;
/** Scanline band height — coarser than 1px, still reads as HDMA striping. */
const BAND_H = 3;
/** Full turns of swirl over the encounter wipe. */
const SWIRL_TURNS = 2.5;

/**
 * Photosensitivity: slow single glow, not a hard spike. Matches the old
 * `#flash-overlay` CSS intent (900ms ease, ~0.35 peak, soft falloff).
 */
const FLASH_MS = 450;
const FLASH_PEAK = 0.35;
const FLASH_PEAK_BOSS = 0.4;
const SWIRL_MS = 700;
const SWIRL_BOSS_MS = 950;
const RETURN_MS = 350;
const REDUCED_FADE_MS = 120;
const REVEAL_MS = 160;

let overlay: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;

/**
 * Monotonic session id. Bumped at the start of every wipe/dissolve so an
 * older revealAfterTransition cannot clear the canvas after a newer one began.
 */
let activeGeneration = 0;

/** Test override: `null` = read matchMedia; boolean forces reduced-motion on/off. */
let reducedMotionOverride: boolean | null = null;

/** @internal vitest only — force reduced-motion without touching matchMedia. */
export function setReducedMotionForTests(value: boolean | null): void {
  reducedMotionOverride = value;
}

/** @internal vitest only */
export function getTransitionGenerationForTests(): number {
  return activeGeneration;
}

function prefersReducedMotion(): boolean {
  if (reducedMotionOverride !== null) return reducedMotionOverride;
  const mm = globalThis.matchMedia;
  if (typeof mm !== "function") return false;
  return mm.call(globalThis, "(prefers-reduced-motion: reduce)").matches;
}

function bumpGeneration(): number {
  activeGeneration += 1;
  return activeGeneration;
}

function isCurrent(gen: number): boolean {
  return gen === activeGeneration;
}

function ensureOverlay(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const host = document.querySelector<HTMLElement>("#game-wrap");
  if (!host) {
    throw new Error("battle-transition: #game-wrap missing");
  }
  host.style.position = host.style.position || "relative";

  // Re-bind if a prior test (or hot reload) tore the node out of the document.
  if (overlay && overlay.isConnected && overlayCtx) {
    return { canvas: overlay, ctx: overlayCtx };
  }

  const existing = host.querySelector<HTMLCanvasElement>("#battle-transition");
  const c = existing ?? document.createElement("canvas");
  c.id = "battle-transition";
  c.width = DESIGN_W;
  c.height = DESIGN_H;
  c.setAttribute("aria-hidden", "true");
  if (!existing) host.appendChild(c);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("battle-transition: 2d context unavailable");
  overlay = c;
  overlayCtx = ctx;
  return { canvas: c, ctx };
}

/**
 * Copy a live game canvas into a DESIGN_W×DESIGN_H buffer.
 * Tiny / empty sources (hidden corridor at 1×1 in title/arena) become a
 * solid dark field so the swirl still reads as a wipe instead of painting
 * nothing across the aperture bands.
 */
export function snapshotSource(source: HTMLCanvasElement | null | undefined): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = DESIGN_W;
  out.height = DESIGN_H;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  // Combat/dungeon backdrop family — readable under the flash glow.
  ctx.fillStyle = "#0d0b08";
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  if (
    source &&
    source.width >= MIN_SOURCE_PX &&
    source.height >= MIN_SOURCE_PX
  ) {
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, DESIGN_W, DESIGN_H);
  }
  return out;
}

/**
 * Left/right edges (in pixels) of the visible aperture for scanline `y`.
 * At `t = 0` the aperture spans nearly the full width; at `t = 1` it is empty
 * (`left >= right`). `theta` is the swirl angle in radians.
 */
export function apertureBounds(
  y: number,
  h: number,
  w: number,
  t: number,
  theta: number
): { left: number; right: number } {
  const open = 1 - Math.min(1, Math.max(0, t));
  if (open <= 0.001) return { left: w, right: 0 };

  const yN = h > 0 ? (y + 0.5) / h - 0.5 : 0;
  // Spiral phase: scanline index winds with rotation so edges corkscrew shut.
  const spiral = Math.sin(theta + yN * Math.PI * 4);
  const center = 0.5 + 0.22 * open * Math.cos(theta + yN * Math.PI * 2);
  const half = open * (0.52 + 0.38 * spiral) * 0.5;
  const left = (center - half) * w;
  const right = (center + half) * w;
  return {
    left: Math.max(0, Math.min(w, left)),
    right: Math.max(0, Math.min(w, right)),
  };
}

function drawSwirlFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  t: number,
  flashAlpha: number
): void {
  const w = DESIGN_W;
  const h = DESIGN_H;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const theta = t * SWIRL_TURNS * Math.PI * 2;
  for (let y = 0; y < h; y += BAND_H) {
    const { left, right } = apertureBounds(y, h, w, t, theta);
    if (right <= left) continue;
    const band = Math.min(BAND_H, h - y);
    const sy = (y / h) * source.height;
    const sh = (band / h) * source.height;
    const sx = (left / w) * source.width;
    const sw = ((right - left) / w) * source.width;
    ctx.drawImage(source, sx, sy, sw, sh, left, y, right - left, band);
  }

  if (flashAlpha > 0) {
    // Soft radial glow — falls off toward the edges (old CSS flash intent).
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72
    );
    grad.addColorStop(0, `rgba(255, 240, 220, ${flashAlpha})`);
    grad.addColorStop(0.55, `rgba(224, 80, 60, ${flashAlpha * 0.45})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawFadeFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | null,
  t: number
): void {
  const w = DESIGN_W;
  const h = DESIGN_H;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!source) return;
  ctx.globalAlpha = 1 - t;
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

/** Radial dissolve: snapshot shrinks toward center while fading. */
function drawReturnFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | null,
  t: number
): void {
  const w = DESIGN_W;
  const h = DESIGN_H;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!source) return;
  const scale = 1 - t * 0.35;
  const alpha = 1 - t;
  const dw = w * scale;
  const dh = h * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  const rx = (w / 2) * (1 - t);
  const ry = (h / 2) * (1 - t);
  ctx.ellipse(w / 2, h / 2, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, dw, dh);
  ctx.restore();
}

function showOverlay(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const { canvas, ctx } = ensureOverlay();
  canvas.classList.add("active");
  canvas.style.opacity = "1";
  return { canvas, ctx };
}

function hideOverlay(): void {
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.style.opacity = "";
  overlayCtx?.clearRect(0, 0, overlay.width, overlay.height);
}

function animate(
  durationMs: number,
  draw: (t: number) => void,
  gen: number
): Promise<void> {
  if (!isCurrent(gen)) return Promise.resolve();
  if (durationMs <= 0) {
    draw(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      if (!isCurrent(gen)) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      draw(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Encounter wipe: soft flash, then spiral aperture to black.
 * Resolves when the overlay is fully black (caller swaps mode next).
 */
export async function playEncounterTransition(opts: {
  source: HTMLCanvasElement | null;
  isBoss?: boolean;
}): Promise<void> {
  const gen = bumpGeneration();
  const snap = snapshotSource(opts.source);
  const { ctx } = showOverlay();

  if (prefersReducedMotion()) {
    await animate(REDUCED_FADE_MS, (t) => drawFadeFrame(ctx, snap, t), gen);
    if (!isCurrent(gen)) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    return;
  }

  const flashPeak = opts.isBoss ? FLASH_PEAK_BOSS : FLASH_PEAK;
  await animate(
    FLASH_MS,
    (u) => {
      // Ease in/out glow (smoothstep) — no hard spike at the midpoint.
      const bell = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      drawSwirlFrame(ctx, snap, 0, bell * flashPeak);
    },
    gen
  );
  if (!isCurrent(gen)) return;

  const swirlMs = opts.isBoss ? SWIRL_BOSS_MS : SWIRL_MS;
  await animate(swirlMs, (t) => drawSwirlFrame(ctx, snap, t, 0), gen);
  if (!isCurrent(gen)) return;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

/**
 * Leave-combat dissolve to black. Same path for dungeon / arena / perk /
 * ending / game-over destinations — `next()` runs while we stay black.
 */
export async function playReturnTransition(opts: {
  source?: HTMLCanvasElement | null;
}): Promise<void> {
  const gen = bumpGeneration();
  const hasPixels =
    !!opts.source &&
    opts.source.width >= MIN_SOURCE_PX &&
    opts.source.height >= MIN_SOURCE_PX;
  const snap = snapshotSource(hasPixels ? opts.source! : null);
  const { ctx } = showOverlay();

  if (prefersReducedMotion() || !hasPixels) {
    await animate(REDUCED_FADE_MS, (t) => drawFadeFrame(ctx, snap, t), gen);
    if (!isCurrent(gen)) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    return;
  }

  await animate(RETURN_MS, (t) => drawReturnFrame(ctx, snap, t), gen);
  if (!isCurrent(gen)) return;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

/**
 * Fade the black overlay out so the newly shown mode is visible.
 * Uses the *current* generation (must follow the wipe/dissolve that just ran).
 * A newer wipe bumps generation and this reveal will no-op its hide.
 */
export async function revealAfterTransition(): Promise<void> {
  if (!overlay) return;
  const gen = activeGeneration;
  const el = overlay;
  if (prefersReducedMotion()) {
    if (isCurrent(gen)) hideOverlay();
    return;
  }
  await animate(
    REVEAL_MS,
    (t) => {
      if (!isCurrent(gen)) return;
      el.style.opacity = String(1 - t);
    },
    gen
  );
  if (isCurrent(gen)) hideOverlay();
}
