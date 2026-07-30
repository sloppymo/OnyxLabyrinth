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
