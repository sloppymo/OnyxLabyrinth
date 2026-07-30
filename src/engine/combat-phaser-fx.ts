/**
 * Phaser combat presentation helpers (tint / spotlight recipes).
 *
 * Pure enough for Vitest — no Phaser.Game construction. Stage applies results
 * via GO refs / camera filter APIs. Tint mode numbers match Phaser.TintModes
 * (MULTIPLY = 0, MULTIPLY_TWO = 7) so tests stay Phaser-free.
 */

export const TINT_POISON = 0x3cbe50;
export const TINT_BURN = 0xff8228;

/** Phaser.TintModes.MULTIPLY — single-layer / corner tint. */
export const TINT_MODE_MULTIPLY = 0;
/**
 * Phaser.TintModes.MULTIPLY_TWO (= 7 in TintModes.js). Luminance split between
 * tint and tint2 — NOT layered statuses. Kept for reference; dual DoTs use
 * corner colors under MULTIPLY instead.
 */
export const TINT_MODE_MULTIPLY_TWO = 7;

export type StatusTint = {
  /** Uniform body tint (single status). */
  tint?: number;
  /**
   * Per-corner colors [tl, tr, bl, br] for dual status (poison left / burn
   * right). Prefer this over MULTIPLY_TWO, which remaps by luminance.
   */
  corners?: readonly [number, number, number, number];
  mode?: number;
};

export function statusTintFor(flags: {
  poison?: boolean;
  burn?: boolean;
}): StatusTint {
  const poison = !!flags.poison;
  const burn = !!flags.burn;
  if (poison && burn) {
    // Left = poison, right = burn — readable dual DoT without MULTIPLY_TWO.
    return {
      corners: [TINT_POISON, TINT_BURN, TINT_POISON, TINT_BURN],
      mode: TINT_MODE_MULTIPLY,
    };
  }
  if (poison) return { tint: TINT_POISON, mode: TINT_MODE_MULTIPLY };
  if (burn) return { tint: TINT_BURN, mode: TINT_MODE_MULTIPLY };
  return {};
}

export type SpotlightRecipe = {
  glowColor: number;
  glowOuter: number;
  dimBrightness: number;
};

const DEFAULT_GLOW = 0xffe8a0;
const CAST_GLOW = 0xa8c8ff;
const DEFAULT_OUTER = 2.2;
const CAST_OUTER = 3.2;
const DEFAULT_DIM = 0.82;
const CAST_DIM = 0.72;

export function spotlightRecipe(opts: {
  bossAccentHex?: string | null;
  casting?: boolean;
}): SpotlightRecipe {
  let glowColor = opts.casting ? CAST_GLOW : DEFAULT_GLOW;
  if (opts.bossAccentHex) {
    const parsed = parseHexColor(opts.bossAccentHex);
    if (parsed !== null) glowColor = parsed;
  }
  return {
    glowColor,
    glowOuter: opts.casting ? CAST_OUTER : DEFAULT_OUTER,
    dimBrightness: opts.casting ? CAST_DIM : DEFAULT_DIM,
  };
}

function parseHexColor(hex: string): number | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  return parseInt(m[1]!, 16);
}

/** Narrow host so stage can apply filters without exporting Phaser types here. */
export interface PhaserFxHost {
  ensureSpotlightFilters(recipe: SpotlightRecipe): void;
  clearSpotlightFilters(): void;
}

export function spotlightKeyFor(recipe: SpotlightRecipe): string {
  return `${recipe.glowColor}:${recipe.glowOuter}:${recipe.dimBrightness}`;
}

/**
 * Structural stand-ins for `camera.filters.external|internal` so the lifecycle
 * below stays Phaser-free and unit-testable (plan §4 module table).
 */
export interface SpotlightFilterLists {
  external: {
    addGlow(
      color: number,
      outerStrength: number,
      innerStrength: number,
      scale: number,
      knockout: boolean,
      quality: number,
      distance: number
    ): unknown;
    remove(filter: unknown): unknown;
  };
  internal: {
    addColorMatrix(): { colorMatrix: { brightness(v: number): unknown } };
    remove(filter: unknown): unknown;
  };
}

/** Live spotlight controllers, owned by the stage and mutated in place. */
export type SpotlightState = {
  glow: unknown | null;
  matrix: unknown | null;
  key: string;
};

export function createSpotlightState(): SpotlightState {
  return { glow: null, matrix: null, key: "" };
}

/**
 * Splice both controllers out of their lists and reset the state.
 *
 * `FilterList.remove` (not `Controller.destroy`) is required: destroy only
 * deactivates, leaving a zombie in `list` that re-renders and accumulates on
 * every recipe change.
 */
export function clearSpotlight(
  state: SpotlightState,
  filters: SpotlightFilterLists | null
): void {
  try {
    if (filters) {
      if (state.glow) filters.external.remove(state.glow);
      if (state.matrix) filters.internal.remove(state.matrix);
    }
  } catch {
    /* camera already torn down */
  }
  state.glow = null;
  state.matrix = null;
  state.key = "";
}

/**
 * Idempotent per recipe: same key is a no-op, a changed key clears first so at
 * most one Glow + one ColorMatrix is ever live. Any throw (CANVAS renderer /
 * Filters unsupported) degrades to no spotlight — tint still applies.
 */
export function applySpotlight(
  state: SpotlightState,
  filters: SpotlightFilterLists | null,
  recipe: SpotlightRecipe
): void {
  const key = spotlightKeyFor(recipe);
  if (state.key === key && state.glow && state.matrix) return;
  if (!filters) {
    clearSpotlight(state, filters);
    return;
  }
  try {
    clearSpotlight(state, filters);
    state.glow = filters.external.addGlow(
      recipe.glowColor,
      recipe.glowOuter,
      0,
      1,
      false,
      8,
      8
    );
    const matrix = filters.internal.addColorMatrix();
    matrix.colorMatrix.brightness(recipe.dimBrightness);
    state.matrix = matrix;
    state.key = key;
  } catch {
    clearSpotlight(state, filters);
  }
}

/**
 * Apply StatusTint to a sprite-like object. Safe no-op when tint APIs missing
 * (Ellipse fallback / CANVAS oddities).
 */
export function applyStatusTint(
  sprite: {
    setTint?: (
      topLeft?: number,
      topRight?: number,
      bottomLeft?: number,
      bottomRight?: number
    ) => unknown;
    setTintMode?: (m: number) => unknown;
    clearTint?: () => unknown;
  },
  tint: StatusTint
): void {
  if (!tint.tint && !tint.corners) {
    sprite.clearTint?.();
    return;
  }
  if (tint.corners) {
    sprite.setTint?.(
      tint.corners[0],
      tint.corners[1],
      tint.corners[2],
      tint.corners[3]
    );
  } else if (tint.tint != null) {
    sprite.setTint?.(tint.tint);
  }
  if (tint.mode != null) sprite.setTintMode?.(tint.mode);
}

/**
 * How long the cast bloom is allowed to live, in ms.
 *
 * Hard cap, not a suggestion: the bloom is a `ParallelFilters` on the same
 * camera external list the spotlight Glow uses, so leaving it up would idle-stack
 * two multi-pass filters for the whole cast. It pulses and tears down.
 */
export const CAST_BLOOM_MS = 180;

export type CastBloomPulse = {
  /** False once the pulse has expired — the stage must then remove it. */
  active: boolean;
  /** `AddEffectBloomConfig.blendAmount` for this frame. */
  blendAmount: number;
};

const CAST_BLOOM_PEAK = 0.85;

/**
 * Bloom envelope over the age of a cast banner.
 *
 * Rises fast (~30% in) and falls off over the remainder, so the flash lands on
 * the cast rather than trailing it. Returns `active: false` past
 * `CAST_BLOOM_MS`, which is the stage's cue to splice the filter out.
 */
export function castBloomPulse(ageMs: number): CastBloomPulse {
  if (!(ageMs >= 0) || ageMs > CAST_BLOOM_MS) {
    return { active: false, blendAmount: 0 };
  }
  const t = ageMs / CAST_BLOOM_MS;
  const peakAt = 0.3;
  const amp =
    t <= peakAt ? t / peakAt : 1 - (t - peakAt) / (1 - peakAt);
  return { active: true, blendAmount: CAST_BLOOM_PEAK * Math.max(0, amp) };
}

/** How long a heal Shine sweeps for, in ms (shorter than POPUP_DURATION). */
export const SHINE_MS = 620;

/**
 * Actors that were just healed, from the damage-popup channel.
 *
 * Heals are not an `ActorAnim` state — there is no "being healed" sprite strip —
 * so the readable signal is the green popup choreography already pushes. Taking
 * the colour as a parameter keeps this module free of a `combat-choreography`
 * import; the stage passes `COLORS.heal`.
 *
 * Returns ids, not popups: a multi-target heal pushes one popup per actor and
 * each body should shine exactly once.
 */
export function shineTargetsFrom(
  popups: ReadonlyArray<{ color: string; start: number; actorId?: string }>,
  now: number,
  healColor: string,
  windowMs = SHINE_MS
): string[] {
  const out = new Set<string>();
  for (const p of popups) {
    if (!p.actorId || p.color !== healColor) continue;
    const age = now - p.start;
    if (age >= 0 && age <= windowMs) out.add(p.actorId);
  }
  return [...out];
}

/** Death anim length in `combat-phaser-stage`; the dissolve rides the same clock. */
export const DEATH_ANIM_MS = 675;

export type DeathDissolve = {
  /** `Filters.Pixelate` amount — 1 is untouched, higher is blockier. */
  pixelate: number;
  /** `ColorMatrix.grayscale` amount — 0 keeps color, 1 is fully grey. */
  grayscale: number;
};

const DEATH_PIXELATE_PEAK = 8;

/**
 * Mosaic-and-drain dissolve over death progress t∈[0,1].
 *
 * Starts at identity so a freshly-killed actor does not pop, then accelerates
 * (t²) into the mosaic while the grayscale eases in slightly ahead of it — the
 * body reads as "drained" a beat before it reads as "disintegrating", which is
 * the classic SNES-RPG ordering.
 *
 * Presentation only: the existing `anim.opacity` / `fadeOutStart` fade still
 * owns the actual disappearance, so the canvas path (and any non-WebGL Phaser
 * fallback, where per-sprite filters are unavailable) loses nothing but polish.
 */
export function deathDissolveRecipe(t01: number): DeathDissolve {
  const t = Math.min(1, Math.max(0, t01));
  return {
    pixelate: 1 + t * t * (DEATH_PIXELATE_PEAK - 1),
    grayscale: smoothstep(Math.min(1, t * 1.35)),
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Vertical shift so a center-origin sprite's feet stay planted when sy≠1.
 * `y += drawSize * (1 - sy) / 2`.
 */
export function hitSquashFootOffset(drawSize: number, sy: number): number {
  return (drawSize * (1 - sy)) / 2;
}

/**
 * Non-uniform hit squash over hurt progress t∈[0,1].
 * Peaks early (~0.18), then eases back to identity — presentation only.
 *
 * Applied via Sprite.setScale (WebGL + CANVAS). Full Mesh2D vertex warp on
 * strip frames is deferred — rebinding atlas pages per frame is fragile;
 * scale delivers the same player-visible weight for Phase 4.
 */
export function hitSquashScale(t01: number): { sx: number; sy: number } {
  const t = Math.min(1, Math.max(0, t01));
  const peakAt = 0.18;
  let amp: number;
  if (t <= peakAt) {
    amp = t / peakAt;
  } else {
    const u = (t - peakAt) / (1 - peakAt);
    amp = 1 - u * u * (3 - 2 * u);
  }
  const squash = 0.14 * amp;
  return { sx: 1 + squash, sy: 1 - squash * 1.35 };
}
