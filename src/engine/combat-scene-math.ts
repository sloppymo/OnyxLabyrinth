/**
 * Pure ground-plane contract math for the combat scene.
 * No DOM / canvas — unit-tested via combat-scene-math.test.ts.
 *
 * Each backdrop declares where its floor is; formation slots live in the
 * floor band as footYFrac ∈ [0,1]; scale and drawY derive from foot position.
 *
 * Dead-floor strip: seamY is the *usable* foot plane (below side-wall joins),
 * not the optical horizon (~ARENA_HORIZON_FRAC 0.30). The band between the
 * optical horizon and seamY is visible walkable-looking floor that no sprite
 * may occupy — intentional. It caps depth stagger on tight bands (e.g. f2
 * ~200px). Future backdrop art painted to a 25–35% seam target will
 * automatically give formations more room; that is the contract working.
 *
 * Floaters (flame-skull etc.): contact shadows currently plant at footY like
 * grounded sprites. Softer/detached floater shadows are deferred — known cut.
 */

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
 * Backdrop geometries — keyed by bake path / theme.
 * Code reality: backdrops are not a data table; arena rooms share one horizon
 * (ARENA_HORIZON_FRAC = 0.30); combat-bg.png / corridor crop use ~0.214.
 * scaleFar/scaleNear are per-backdrop (same defaults today; corridor/combat-bg
 * use a slightly deeper far endpoint so the taller band still reads as a
 * bigger room rather than identical-size sprites floating higher).
 */
export const BACKDROP_GEOMETRY: Record<string, BackdropGeometry> = {
  /**
   * Arena bake (renderBattleArena). Geometric horizon is ARENA_HORIZON_FRAC
   * (0.30), but side-wall floor joins sit lower on screen than the back-wall
   * horizon — seamY is the *usable* foot plane (below side joins), not the
   * optical horizon line.
   */
  arena: {
    seamY: Math.round(COMBAT_DESIGN_H * 0.48), // 323
    floorBottomY: 545,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  "theme:f1": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.48),
    floorBottomY: 545,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  /** Library — side shelves eat the most vertical; most conservative seam. */
  "theme:f2": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.52), // 349
    floorBottomY: 550,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  "theme:f3": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.48),
    floorBottomY: 545,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  "theme:f4": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.48),
    floorBottomY: 545,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  "theme:f5": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.48),
    floorBottomY: 545,
    scaleFar: 0.78,
    scaleNear: 1.0,
  },
  /** Static combat-bg.png — taller usable band; slightly deeper far scale. */
  "combat-bg": {
    seamY: Math.round(COMBAT_DESIGN_H * 0.36),
    floorBottomY: 545,
    scaleFar: 0.72,
    scaleNear: 1.0,
  },
  /** renderCorridorBackdrop crop — same family as combat-bg. */
  corridor: {
    seamY: Math.round(COMBAT_DESIGN_H * 0.36),
    floorBottomY: 545,
    scaleFar: 0.72,
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
 */
export const PARTY_FORMATION_SLOTS: FormationSlot[] = [
  { x: 520, footYFrac: 0.72 },
  { x: 605, footYFrac: 0.80 },
  { x: 690, footYFrac: 0.88 },
  { x: 470, footYFrac: 0.10 },
  { x: 545, footYFrac: 0.14 },
  { x: 620, footYFrac: 0.18 },
];

export const ENEMY_FRONT_SLOTS: FormationSlot[] = [
  { x: 250, footYFrac: 0.72 },
  { x: 165, footYFrac: 0.80 },
  { x: 80, footYFrac: 0.88 },
];

export const ENEMY_BACK_SLOTS: FormationSlot[] = [
  { x: 310, footYFrac: 0.10 },
  { x: 245, footYFrac: 0.14 },
  { x: 180, footYFrac: 0.18 },
];

/** Summons stand mid-field between rows. */
export const ALLY_FORMATION_SLOTS: FormationSlot[] = [
  { x: 384, footYFrac: 0.48 },
  { x: 340, footYFrac: 0.42 },
  { x: 428, footYFrac: 0.54 },
];

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
