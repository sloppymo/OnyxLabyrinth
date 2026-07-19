/**
 * Single source of truth for the arena battle-backdrop camera.
 *
 * Every consumer derives from this module instead of holding its own copy:
 * - `arena-renderer.ts` spreads `ARENA_CAMERA` into its rasterizer DEFAULTS;
 * - `renderer.ts`'s `renderBattleArena` bake wrapper relies on those DEFAULTS;
 * - `combat-scene-math.ts` derives `BACKDROP_GEOMETRY` seam positions via
 *   `arenaSeamFrac()` so sprite foot planes track the baked wall/floor seam;
 * - tests import the tuple rather than mirroring literals (mirrored copies
 *   drifted twice before this module existed: camHeight 3.8 vs 4.5 in
 *   render-math.test.ts, pitch 30° vs 28° in docs/ARENA-REVIEW.md).
 *
 * Pure module — no DOM/canvas. Projection math lives in render-math.ts.
 */

import type { ArenaCamera } from "./render-math";
import { arenaProject } from "./render-math";

/**
 * Stage-rebalance tuple (2026-07-16): floor-dominant composition.
 * Wall band ≈ 20% of frame (top ~12% → seam ~32%), visible floor ≈ 38%,
 * floor:wall ≈ 1.9:1. Previous tuple (pitch 28°, wall 7, depth 14,
 * horizon 0.20) put the seam at ~40% — wall and floor split the stage evenly.
 */
export const ARENA_CAMERA = {
  /** Room width in grid/world units. */
  roomWidth: 12,
  /**
   * Far depth at the seam. A deeper room pulls the wall base toward the
   * horizon, freeing floor rows for the formation.
   */
  roomDepth: 18,
  /** Short backdrop wall — a frieze behind the fight, not a slab. */
  wallHeight: 5.5,
  /** High camera — depth mostly from Y foreshortening, not lateral splay. */
  camHeight: 4.5,
  /** Steeper look-down raises the seam (more floor, less wall). */
  pitch: (33 * Math.PI) / 180,
  /** Optical horizon ≈ 16% → projected seam lands ≈ 32% (arenaSeamFrac). */
  horizonFrac: 0.16,
  /** Distance beyond which surfaces are fully fogged. */
  maxVisibleDist: 28,
} as const;

/**
 * Fraction of canvas height where the arena horizon (floor/ceiling boundary)
 * sits. Kept as a named export because the corridor-side bake code and docs
 * referred to it by this name long before this module existed.
 */
export const ARENA_HORIZON_FRAC = ARENA_CAMERA.horizonFrac;

/**
 * Projection camera for a canvas of height `h` — the same construction the
 * rasterizers use: horizonY pins the horizon, focal length follows from the
 * pitch so the horizon projects exactly to `h * horizonFrac`.
 */
export function buildArenaCamera(
  h: number,
  p: { pitch: number; camHeight: number; horizonFrac: number } = ARENA_CAMERA
): ArenaCamera {
  const horizonY = h * p.horizonFrac;
  const focalLength = ((0.5 - p.horizonFrac) * h) / Math.tan(p.pitch);
  return { camHeight: p.camHeight, pitch: p.pitch, focalLength, horizonY };
}

/**
 * Screen-y of the baked wall/floor seam (the back wall's base at roomDepth)
 * as a fraction of canvas height. This is the same projection drawBackWall
 * uses for the wall's foot row, so the sprite contract and the bake cannot
 * disagree. Scale-invariant: focalLength and horizonY both scale with h, so
 * the fraction is identical for any canvas size.
 */
export function arenaSeamFrac(
  cam: {
    pitch: number;
    camHeight: number;
    horizonFrac: number;
    roomDepth: number;
  } = ARENA_CAMERA
): number {
  const h = 672; // any height works; the fraction is h-invariant
  const camera = buildArenaCamera(h, cam);
  return arenaProject({ x: 0, y: cam.roomDepth, z: 0 }, camera, h, h).y / h;
}
