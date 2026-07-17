/**
 * Pure ground-plane contract math for the combat scene.
 * No DOM / canvas — unit-tested via combat-scene-math.test.ts.
 *
 * Each backdrop declares where its floor is; formation slots live in the
 * floor band as footYFrac ∈ [0,1]; scale and drawY derive from foot position.
 *
 * seamY for baked backdrops is DERIVED from the arena camera (arenaSeamFrac
 * in arena-camera.ts — the projected base of the back wall) plus a small
 * inset so heels never touch the wall base. It used to be a hand-tuned
 * constant that silently drifted 53px above the real baked seam; the slot
 * tables compensated by never using footYFrac < 0.22. Both halves of that
 * bug are gone: the seam is honest and slots use the full [0,1] band.
 *
 * Floaters (flame-skull etc.): contact shadows currently plant at footY like
 * grounded sprites. Softer/detached floater shadows are deferred — known cut.
 */

import { arenaSeamFrac } from "./arena-camera";

export interface BackdropGeometry {
  /** Screen y (logical px @ 672h) — usable foot plane (not optical horizon). */
  seamY: number;
  /** Lowest usable foot baseline (margin above DOM window overlap). */
  floorBottomY: number;
  /** Sprite scale at footY === seamY (per-backdrop; may differ by room depth). */
  scaleFar: number;
  /** Sprite scale at footY === floorBottomY. */
  scaleNear: number;
}

export interface FormationSlot {
  /** Logical x at design width 768. */
  x: number;
  /** 0 = seamY, 1 = floorBottomY. */
  footYFrac: number;
}

export interface ResolvedSlot {
  x: number;
  footY: number;
  /** Top of the square sprite frame (foot-anchored). */
  drawY: number;
  /** Visual center y (for popups / projectiles). */
  centerY: number;
  /** Quantized depth scale. */
  scale: number;
  /** Fraction of sprite frame height from top to visual feet. */
  artFootFromTop: number;
}

/** Pixel-art-safe scale steps — never smooth-scale sprites. */
export const SCALE_STEPS = [0.75, 0.875, 1.0] as const;

/**
 * Pack 100×100 strips: visual feet ~7% below frame center → 0.57 from top.
 * Override per strip via SpriteStrip.artFootFromTop when art differs.
 */
export const ART_FOOT_FROM_TOP = 0.57;
/** Procedural fallback shapes sit near the bottom of the draw square. */
export const ART_FOOT_FROM_TOP_FALLBACK = 0.92;

/** Resolve which foot inset to use (pack default, strip override, or fallback). */
export function artFootFromTopFor(opts: {
  hasStrip: boolean;
  stripArtFootFromTop?: number;
}): number {
  if (!opts.hasStrip) return ART_FOOT_FROM_TOP_FALLBACK;
  return opts.stripArtFootFromTop ?? ART_FOOT_FROM_TOP;
}

export const COMBAT_DESIGN_W = 768;
export const COMBAT_DESIGN_H = 672;

/**
 * Logical px from canvas bottom occupied by `#combat-windows`. This is now
 * GUARANTEED by CSS, not measured: styles.css fixes the window band at
 * calc(200/672 * 100%) of #combat-wrap in every combat state (lists scroll
 * internally), so tall menus can never rise above this line and occlude
 * feet. Do NOT also subtract the full below-foot draw-square extent
 * (transparent padding) — that left a 160px dead apron. Occlusion clears
 * foot plant + contact-shadow half-height below footY (see
 * CONTACT_SHADOW_BELOW_FOOT_PX). If you change this value, change the CSS
 * height together with it.
 */
export const COMBAT_WINDOW_OVERLAP_PX = 200;
/** Extra gap between last foot baseline and the window top. */
export const FLOOR_BOTTOM_SAFE_MARGIN_PX = 8;
/**
 * Near-row party draw size (must match `PARTY_SIZE` in combat-scene.ts).
 * Used by x-bounds checks and contact-shadow extent.
 */
export const COMBAT_NEAR_SPRITE_SIZE = 300;
/**
 * Contact-shadow ellipse half-height below footY (matches `drawContactShadow`:
 * rx = (size * 0.45) * 0.28, ry = rx * 0.28, size = near party draw size).
 * Shadows are part of the ground footprint — occlusion must clear them.
 */
export const CONTACT_SHADOW_BELOW_FOOT_PX = Math.ceil(
  COMBAT_NEAR_SPRITE_SIZE * 0.45 * 0.28 * 0.28
);

/** Highest legal floorBottomY for a canvas height (default design 672). */
export function maxAllowedFloorBottomY(canvasH = COMBAT_DESIGN_H): number {
  return (
    canvasH -
    COMBAT_WINDOW_OVERLAP_PX -
    FLOOR_BOTTOM_SAFE_MARGIN_PX -
    CONTACT_SHADOW_BELOW_FOOT_PX
  );
}

/** Throws if floorBottomY sits inside the DOM window overlap. */
export function assertFloorBottomClearOfWindows(
  geo: BackdropGeometry,
  canvasH = COMBAT_DESIGN_H
): void {
  const maxY = maxAllowedFloorBottomY(canvasH);
  if (geo.floorBottomY > maxY + 1e-6) {
    throw new Error(
      `floorBottomY ${geo.floorBottomY} exceeds window-safe max ${maxY} (overlap ${COMBAT_WINDOW_OVERLAP_PX}px)`
    );
  }
}

/** Throws if any resolved slot places the sprite half off the canvas. */
export function assertSlotsInXBounds(
  slots: readonly FormationSlot[],
  geo: BackdropGeometry,
  opts: {
    spriteWidth: number;
    margin?: number;
    canvasWidth?: number;
    designWidth?: number;
  }
): void {
  const margin = opts.margin ?? 4;
  const canvasW = opts.canvasWidth ?? COMBAT_DESIGN_W;
  for (const slot of slots) {
    const r = resolveSlot(slot, geo, {
      spriteHeight: opts.spriteWidth,
      canvasWidth: canvasW,
      designWidth: opts.designWidth,
    });
    const half = (opts.spriteWidth * r.scale) / 2;
    const minX = half + margin;
    const maxX = canvasW - half - margin;
    if (r.x < minX - 1e-6 || r.x > maxX + 1e-6) {
      throw new Error(
        `x-bounds: slot x=${slot.x} → ${r.x.toFixed(1)} outside [${minX.toFixed(1)}, ${maxX.toFixed(1)}] at scale ${r.scale}`
      );
    }
  }
}

/**
 * Optical wall/floor seam of the baked arena camera, as a fraction of canvas
 * height — derived, not hand-tuned (see arena-camera.ts). ≈ 0.320 at the
 * 2026-07-16 stage-rebalance tuple.
 */
const BAKED_SEAM_FRAC = arenaSeamFrac();
/** Feet sit a hair below the seam line so heels never touch the wall base. */
export const SEAM_INSET_FRAC = 0.01;

function bakedSeamY(extraInsetFrac = 0): number {
  return Math.round(
    COMBAT_DESIGN_H * (BAKED_SEAM_FRAC + SEAM_INSET_FRAC + extraInsetFrac)
  );
}

/**
 * Backdrop geometries — keyed by bake path / theme.
 * Baked themes share the arena camera, so their seams derive from
 * BAKED_SEAM_FRAC (+ per-theme content inset). floorBottomY ≈ 453 (window
 * top − margin − shadow). scaleFar 0.75 → scaleNear 1.0 spans all three
 * pixel-art scale steps: back row 0.75, mid-field 0.875, front row 1.0.
 */
export const BACKDROP_GEOMETRY: Record<string, BackdropGeometry> = {
  arena: {
    seamY: bakedSeamY(),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  "theme:f1": {
    seamY: bakedSeamY(),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  /** Library — shelves eat a little upper floor; seam slightly lower. */
  "theme:f2": {
    seamY: bakedSeamY(0.02),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  "theme:f3": {
    seamY: bakedSeamY(),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  "theme:f4": {
    seamY: bakedSeamY(),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  "theme:f5": {
    seamY: bakedSeamY(),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  /** Static combat-bg.png — legacy non-baked art; seam hand-measured. */
  "combat-bg": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.30),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
  /** renderCorridorBackdrop crop — same family as combat-bg. */
  corridor: {
    seamY: Math.round(COMBAT_DESIGN_H * 0.30),
    floorBottomY: maxAllowedFloorBottomY(),
    scaleFar: 0.75,
    scaleNear: 1.0,
  },
};

export function allBackdropIds(): string[] {
  return Object.keys(BACKDROP_GEOMETRY);
}

export function geometryForBackdrop(id: string | null | undefined): BackdropGeometry {
  if (id && BACKDROP_GEOMETRY[id]) return BACKDROP_GEOMETRY[id];
  return BACKDROP_GEOMETRY.arena;
}

/**
 * Party: FF6 diagonal stagger — indices 0–2 front (near), 3–5 back (far).
 * Enemies mirrored on the left. Fixed slots only (no free scatter).
 *
 * footYFrac values are QUANTIZE-AWARE: with scaleFar 0.75 → scaleNear 1.0,
 * quantizeScale's step boundaries fall at t = 0.25 (0.75↔0.875) and t = 0.75
 * (0.875↔1.0). Each row's fracs keep ≥0.03 margin from a boundary so a whole
 * row lands on one clean pixel-art step:
 *   back rows  0.06/0.13/0.20 → 0.75   (small, high on the floor)
 *   summons    0.42/0.48/0.54 → 0.875  (mid-field)
 *   front rows 0.78/0.87/0.96 → 1.0    (large, near the windows)
 *
 * X values respect the center aisle (see CENTER_AISLE_MIN_GAP_PX): all enemy
 * slots ≤ 336, all party slots ≥ 432 around design center 384. Back-row
 * casters clear the front knights vertically (fracs 30px higher at 0.75
 * scale), so the old fan-left-toward-center trick is no longer needed.
 * Near x clamped for 300px half-width bounds (max ≈ 614).
 */
export const PARTY_FORMATION_SLOTS: FormationSlot[] = [
  { x: 495, footYFrac: 0.78 },
  { x: 555, footYFrac: 0.87 },
  { x: 610, footYFrac: 0.96 },
  { x: 432, footYFrac: 0.06 },
  { x: 490, footYFrac: 0.13 },
  { x: 548, footYFrac: 0.2 },
];

export const ENEMY_FRONT_SLOTS: FormationSlot[] = [
  { x: 275, footYFrac: 0.78 },
  { x: 210, footYFrac: 0.87 },
  { x: 175, footYFrac: 0.96 },
];

export const ENEMY_BACK_SLOTS: FormationSlot[] = [
  { x: 336, footYFrac: 0.06 },
  { x: 270, footYFrac: 0.13 },
  { x: 210, footYFrac: 0.2 },
];

/**
 * Summons stand mid-field between rows — inside the center aisle by design
 * (transient combatants between the battle lines); exempt from
 * assertCenterAisle.
 */
export const ALLY_FORMATION_SLOTS: FormationSlot[] = [
  { x: 384, footYFrac: 0.48 },
  { x: 330, footYFrac: 0.42 },
  { x: 438, footYFrac: 0.54 },
];

/**
 * Minimum clear gap (logical px @ design width 768) between the innermost
 * enemy slot center and the innermost party slot center — the readable
 * no-man's-land between the two battle lines. Without it the opposing back
 * rows visually interleave into one scrum (they sat 68px apart pre-2026-07-16
 * with ~260px-wide draw frames).
 */
export const CENTER_AISLE_MIN_GAP_PX = 96;

/** Throws if the battle lines encroach on the center aisle (summons exempt). */
export function assertCenterAisle(
  enemySlots: readonly FormationSlot[],
  partySlots: readonly FormationSlot[],
  minGap = CENTER_AISLE_MIN_GAP_PX
): void {
  const enemyMax = Math.max(...enemySlots.map((s) => s.x));
  const partyMin = Math.min(...partySlots.map((s) => s.x));
  const gap = partyMin - enemyMax;
  if (gap < minGap) {
    throw new Error(
      `center-aisle: gap ${gap}px between innermost enemy x=${enemyMax} and party x=${partyMin} < ${minGap}px`
    );
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function quantizeScale(raw: number): number {
  let best: number = SCALE_STEPS[0];
  let bestDist = Math.abs(raw - best);
  for (const step of SCALE_STEPS) {
    const d = Math.abs(raw - step);
    if (d < bestDist) {
      best = step;
      bestDist = d;
    }
  }
  return best;
}

export function resolveFootY(footYFrac: number, geo: BackdropGeometry): number {
  const t = Math.min(1, Math.max(0, footYFrac));
  return geo.seamY + t * (geo.floorBottomY - geo.seamY);
}

/** Unquantized depth scale from floor-band fraction. */
export function depthScale(footYFrac: number, geo: BackdropGeometry): number {
  const t = Math.min(1, Math.max(0, footYFrac));
  return lerp(geo.scaleFar, geo.scaleNear, t);
}

export function resolveSlot(
  slot: FormationSlot,
  geo: BackdropGeometry,
  opts: {
    spriteHeight: number;
    canvasWidth?: number;
    designWidth?: number;
    artFootFromTop?: number;
  }
): ResolvedSlot {
  const designW = opts.designWidth ?? COMBAT_DESIGN_W;
  const canvasW = opts.canvasWidth ?? designW;
  const artFootFromTop = opts.artFootFromTop ?? ART_FOOT_FROM_TOP;
  const footY = resolveFootY(slot.footYFrac, geo);
  const scale = quantizeScale(depthScale(slot.footYFrac, geo));
  const drawH = opts.spriteHeight * scale;
  const drawY = footY - drawH * artFootFromTop;
  const centerY = drawY + drawH * 0.5;
  const x = slot.x * (canvasW / designW);
  return { x, footY, drawY, centerY, scale, artFootFromTop };
}

/** Throws if any slot resolves outside the floor band (invariant). */
export function assertFormationOnFloor(
  slots: readonly FormationSlot[],
  geo: BackdropGeometry
): void {
  for (const slot of slots) {
    const footY = resolveFootY(slot.footYFrac, geo);
    if (footY < geo.seamY - 1e-6 || footY > geo.floorBottomY + 1e-6) {
      throw new Error(
        `footY ${footY} outside [${geo.seamY}, ${geo.floorBottomY}] for frac ${slot.footYFrac}`
      );
    }
  }
}

export function partySlot(index: number): FormationSlot {
  return PARTY_FORMATION_SLOTS[Math.min(index, PARTY_FORMATION_SLOTS.length - 1)]!;
}

export function enemySlot(idxInRow: number, row: "front" | "back"): FormationSlot {
  const list = row === "front" ? ENEMY_FRONT_SLOTS : ENEMY_BACK_SLOTS;
  const i = Math.min(Math.max(0, idxInRow), list.length - 1);
  return list[i]!;
}

export function allySlot(index: number): FormationSlot {
  return ALLY_FORMATION_SLOTS[Math.min(index, ALLY_FORMATION_SLOTS.length - 1)]!;
}
