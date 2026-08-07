/**
 * Pure math functions extracted from the corridor renderer.
 *
 * These functions have no DOM or canvas dependencies, so they can be unit
 * tested directly without a browser environment. The main renderer module
 * imports them to keep its hot loop logic in sync with the tests.
 *
 * Centralizing the math here also prevents the recurring class of bugs
 * where different draw passes (wall strips, edge glow, feature glyphs)
 * compute wall heights or fog values inconsistently.
 */

// --- Render config values needed by the math functions ----------------------
// SINGLE SOURCE OF TRUTH for every tunable the pure geometry/fog/camera math
// reads. `renderer.ts` spreads this object into its own `RENDER_CONFIG`, so
// `RENDER_CONFIG.fogFalloff` and friends resolve here and there is exactly one
// definition of each value.
//
// These used to be hand-duplicated in `RENDER_CONFIG` with a "keep them in
// sync" comment. The copies agreed, but the renderer's were never read — so
// editing the obvious knob silently did nothing. Do not re-add a duplicate to
// `renderer.ts`: add new pure-math tunables here instead, where they are
// DOM-free and unit-testable in plain Node.
import type { EdgeType, TileFeature } from "../types";

/**
 * Stairs are still tile features for floor transitions, but in the corridor
 * view they read as exit doors: the approach face uses the theme door panel
 * (`f*_door_256.png`) instead of the old ↑/↓ floor glyphs.
 */
export function isStairExitFeature(tile: TileFeature | undefined): boolean {
  return tile === "stairs_up" || tile === "stairs_down";
}

/**
 * Raycaster stop rule for one crossed cell edge.
 * Returns `null` to keep walking through open space; otherwise the edge type
 * recorded on the hit. Open edges into stair tiles stop as `"door"` so the
 * exit paints with the door texture while remaining walkable in `camera.ts`.
 */
export function raycastEdgeStop(
  edge: EdgeType,
  tile: TileFeature | undefined
): EdgeType | null {
  if (edge === "open") {
    return isStairExitFeature(tile) ? "door" : null;
  }
  return edge;
}

export const MATH_CONFIG = {
  projectionScale: 0.62,
  heightFlatten: 0.85,
  // Fog falloff per grid unit. 0.42 was too aggressive — at distance 2 walls
  // dropped to 17% brightness, crushing all mid-range detail. 0.70 keeps
  // distant walls readable while still providing a clear depth gradient.
  fogFalloff: 0.70,
  // Mid-tone lift applied to the fog curve. After computing the exponential
  // falloff, blend toward 1.0 by this fraction so mid-distance surfaces stay
  // visible instead of dropping into the noise floor. 0 = pure exponential,
  // 1 = no falloff at all.
  fogMidtoneLift: 0.25,
  baseOpacity: 1.0,
  glowBlurNear: 7,
  glowBlurFar: 2,
  maxDepth: 4,
  darknessMaxDist: 1.5,
  // Fraction of the corridor draw distance (CORRIDOR_MAX_DIST) at which the
  // fog curve begins tapering to exactly 0 at the draw boundary. Below this
  // fraction the curve is bit-identical to the untapered exponential+lift
  // formula. 1.0 is the kill-switch: taper never starts, so the curve is the
  // untapered formula everywhere (see fogTaperForDepth).
  fogTaperFrac: 0.5,
  // If the player jumps more than this many tiles in one state change
  // (teleporter, stairs, chute), snap instantly instead of sliding.
  teleportSnapThreshold: 1.5,
  // Smooth movement interpolation. When the player moves or turns, the render
  // camera lerps from the old position to the new one over these durations.
  // Set to 0 to disable (instant snap).
  moveAnimDuration: 150,            // ms — forward/back step
  turnAnimDuration: 100,            // ms — 90-degree turn
  // Arena room is smaller and viewed from a steeper angle than the corridor,
  // so the fog curve is tuned separately. Keep walls and far floor readable.
  arenaFogFalloff: 0.88,
  arenaFogMidtoneLift: 0.22,
};

/**
 * Screen-space wall strip height for a given perpendicular distance.
 * Applies `projectionScale`/`heightFlatten` so walls occupy a narrower
 * vertical band, leaving more floor/ceiling visible (matches the reference
 * proportions). All draw passes that need a wall's screen height must use
 * this to stay in sync.
 */
export function computeLineHeight(h: number, perpWallDist: number): number {
  return Math.floor(
    (h / perpWallDist) *
      MATH_CONFIG.projectionScale *
      MATH_CONFIG.heightFlatten
  );
}

/**
 * Compute the vertical draw bounds [drawStart, drawEnd] for a wall strip
 * at the given perpendicular distance on a screen of height `h`.
 * Returns clamped values suitable for `drawImage` / `fillRect` calls.
 */
export function wallDrawBounds(
  h: number,
  perpWallDist: number
): { drawStart: number; drawEnd: number; lineHeight: number } {
  const lineHeight = computeLineHeight(h, perpWallDist);
  const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
  const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));
  return { drawStart, drawEnd, lineHeight };
}

/**
 * Corridor draw distance. `opacityForDepth(CORRIDOR_MAX_DIST)` is where the
 * floor/ceiling `continue` clip and the raycaster's `perpWallDist > maxDist`
 * clip kick in — the taper below is tuned to reach exactly 0 there so the
 * clip is a pure performance optimisation with no visible seam.
 */
export const CORRIDOR_MAX_DIST = MATH_CONFIG.maxDepth * 2;

/**
 * 1 − smoothstep taper: holds at 1 until `maxDist * fogTaperFrac`, then eases
 * (C¹, zero derivative at both ends) down to exactly 0 at `maxDist`. Without
 * this, `opacityForDepth` asymptotes to `fogMidtoneLift` (0.25) instead of 0,
 * so surfaces at the draw boundary get clipped mid-fade — a hard-edged step
 * at the horizon that no amount of `maxDepth` tuning can hide.
 *
 * `fogTaperFrac >= 1` is the kill-switch: taper never starts, so this always
 * returns 1 and `opacityForDepth` is exactly the untapered formula.
 */
export function fogTaperForDepth(d: number, maxDist: number): number {
  if (MATH_CONFIG.fogTaperFrac >= 1) return 1;
  const start = maxDist * MATH_CONFIG.fogTaperFrac;
  if (d <= start) return 1;
  if (d >= maxDist) return 0;
  const t = (d - start) / (maxDist - start);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Fog/depth opacity. Uses an exponential falloff blended toward 1.0 by
 * `fogMidtoneLift` so mid-distance surfaces stay visible instead of dropping
 * into the noise floor. At distance 0 the result is always 1.0 (no fog on the
 * player's own cell); the lift only affects distance > 0. A taper (see
 * `fogTaperForDepth`) brings the curve down to exactly 0 at
 * `CORRIDOR_MAX_DIST` so the floor/ceiling/raycast draw-distance clip never
 * cuts off a surface mid-fade.
 */
export function opacityForDepth(d: number): number {
  const exponential =
    MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
  const lift = MATH_CONFIG.fogMidtoneLift;
  const base = exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
  return base * fogTaperForDepth(d, CORRIDOR_MAX_DIST);
}

/** Edge-glow blur radius for a given distance (near = more blur, far = less). */
export function glowBlurForDepth(d: number): number {
  return Math.max(
    MATH_CONFIG.glowBlurFar,
    MATH_CONFIG.glowBlurNear - d * 1.5
  );
}

/** Amber stroke color (rgba string) for a wall at the given distance. */
export function strokeColorForDepth(d: number): string {
  const a = opacityForDepth(d);
  return `rgba(224,164,88,${Math.max(0, a)})`;
}

/** Compute a direction vector from a float facing (0=N, 1=E, 2=S, 3=W). */
export function dirFromFacing(facing: number): { x: number; y: number } {
  const angle = (facing * Math.PI) / 2;
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** Compute the camera plane (perpendicular to dir, scaled by FOV tangent). */
export function planeFromDir(
  dirX: number,
  dirY: number,
  fov: number
): { planeX: number; planeY: number } {
  const tan = Math.tan(fov / 2);
  return { planeX: -dirY * tan, planeY: dirX * tan };
}

/** Ease-out cubic: fast start, gentle landing. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Interpolate between two facing values via the shortest angular path.
 * Facings are in [0, 4) where 0=N, 1=E, 2=S, 3=W. The result wraps around
 * so that turning from 3 (W) to 0 (N) goes forward 1 step, not backward 3.
 */
export function interpolateFacing(
  start: number,
  end: number,
  t: number
): number {
  let diff = end - start;
  if (diff > 2) diff -= 4;
  if (diff < -2) diff += 4;
  const result = start + diff * t;
  return ((result % 4) + 4) % 4;
}

/**
 * Determine whether a state change should snap (teleporter/stairs/chute)
 * or animate (normal move/turn). Returns true if the distance exceeds the
 * teleport snap threshold.
 */
export function shouldSnapTeleport(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist > MATH_CONFIG.teleportSnapThreshold;
}

/**
 * Compute the floor/ceiling row distance for a given screen y-coordinate.
 * For floor rows (y > halfH): rowDistance = halfH / (y - halfH).
 * For ceiling rows (y < halfH): rowDistance = halfH / (halfH - y).
 * Returns Infinity for the horizon row (y === halfH).
 */
export function rowDistanceForY(y: number, halfH: number): number {
  const delta = y > halfH ? y - halfH : halfH - y;
  if (delta === 0) return Infinity;
  return halfH / delta;
}

/**
 * Compute the world-space starting position for a floor/ceiling row at
 * the given row distance, based on the camera position and direction/plane.
 * The renderer adds 0.5 to camX/camY to sample from the center of the
 * player's cell.
 */
export function floorRowStart(
  camX: number,
  camY: number,
  dirX: number,
  dirY: number,
  planeX: number,
  planeY: number,
  rowDist: number
): { worldX: number; worldY: number } {
  return {
    worldX: camX + 0.5 + rowDist * (dirX - planeX),
    worldY: camY + 0.5 + rowDist * (dirY - planeY),
  };
}

/** Compute the per-pixel world-space step for a floor/ceiling row. */
export function floorRowStep(
  planeX: number,
  planeY: number,
  rowDist: number,
  screenW: number
): { stepX: number; stepY: number } {
  return {
    stepX: (rowDist * (planeX * 2)) / screenW,
    stepY: (rowDist * (planeY * 2)) / screenW,
  };
}

/**
 * Determine which floor texture to use for a world cell, based on the
 * grid-coordinate checkerboard pattern. Returns true for floorA, false
 * for floorB.
 */
export function isFloorA(gx: number, gy: number): boolean {
  return (gx + gy) % 2 === 0;
}

/**
 * Compute the texel coordinates within a tile for a given world position
 * and texture size. The result is wrapped to [0, texSize).
 */
export function texelCoords(
  worldX: number,
  worldY: number,
  texSize: number
): { texX: number; texY: number } {
  const gx = worldX | 0;
  const gy = worldY | 0;
  const texX = ((worldX - gx) * texSize | 0) % texSize;
  const texY = ((worldY - gy) * texSize | 0) % texSize;
  return { texX, texY };
}

/**
 * Compute a render bitmap size that fits within a maximum width/height while
 * preserving the container's aspect ratio. Returns at least 1x1.
 */
export function cappedRenderSize(
  containerWidth: number,
  containerHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = Math.max(1, containerWidth);
  let height = Math.max(1, containerHeight);

  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const scaleX = maxWidth / width;
  const scaleY = maxHeight / height;
  const scale = Math.min(scaleX, scaleY);

  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  return { width, height };
}

/**
 * Largest half-integer factor (1, 1.5, 2, 2.5, …) by which a `baseW × baseH`
 * design box can be scaled up to fit inside `availW × availH`.
 *
 * Whole integers stay preferred when they fit; half-steps fill the gap on
 * typical 1080p laptops where 2× needs ~1344px of height and otherwise leaves
 * the game stuck at 1× with empty margin. Half-integers keep nearest-neighbor
 * (`image-rendering: pixelated`) reasonably crisp — every source pixel maps to
 * either N or N+1 screen pixels, never a blurry interpolate. Degenerate inputs
 * and undersized viewports clamp to 1 so we never fight the existing
 * `max-width` responsive-down behaviour.
 */
export function pixelScaleToFit(
  availW: number,
  availH: number,
  baseW: number,
  baseH: number
): number {
  if (baseW <= 0 || baseH <= 0) return 1;
  const fit = Math.min(availW / baseW, availH / baseH);
  if (!Number.isFinite(fit) || fit < 1) return 1;
  return Math.max(1, Math.floor(fit * 2) / 2);
}

/**
 * Fog-blend a source color toward the background color.
 * Returns the blended [r, g, b] values (0-255, clamped).
 */
export function fogBlend(
  srcR: number,
  srcG: number,
  srcB: number,
  bgR: number,
  bgG: number,
  bgB: number,
  fog: number
): [number, number, number] {
  const inv = 1 - fog;
  return [
    Math.min(255, srcR * fog + bgR * inv),
    Math.min(255, srcG * fog + bgG * inv),
    Math.min(255, srcB * fog + bgB * inv),
  ];
}

/** Float-positioned camera used for rendering. */
export interface RenderCamera {
  x: number;       // world X (float)
  y: number;       // world Y (float)
  dirX: number;    // direction vector X
  dirY: number;    // direction vector Y
  planeX: number;  // camera plane X
  planeY: number;  // camera plane Y
}

/** A world tile projected into camera space for billboard drawing. */
export interface BillboardProjection {
  /** Lateral offset in camera space; divide by `depth` for screen position. */
  lateral: number;
  /** Perpendicular distance from the camera plane. <= 0 is behind the camera. */
  depth: number;
}

/**
 * Minimum depth a billboard must have before it is worth drawing. Below this
 * the projection divides by ~0 and the sprite explodes across the screen; it
 * also covers the tile the party is standing on, which is drawn separately as
 * an underfoot indicator rather than as a billboard.
 */
export const BILLBOARD_MIN_DEPTH = 0.2;

/**
 * Project a tile centre into camera space (the standard Wolf3D sprite
 * transform). The camera's `x`/`y` are cell indices, so the caller works in
 * tile coordinates and this adds the half-cell centre offset.
 *
 * Returns `null` when the camera basis is degenerate, which keeps a NaN out of
 * the draw path — `renderer.ts` has no defensive clamping and one bad index
 * there kills the whole render loop.
 */
export function projectBillboard(
  cam: RenderCamera,
  tileX: number,
  tileY: number
): BillboardProjection | null {
  const det = cam.planeX * cam.dirY - cam.dirX * cam.planeY;
  if (!Number.isFinite(det) || det === 0) return null;
  const invDet = 1 / det;
  const dx = tileX + 0.5 - (cam.x + 0.5);
  const dy = tileY + 0.5 - (cam.y + 0.5);
  const lateral = invDet * (cam.dirY * dx - cam.dirX * dy);
  const depth = invDet * (-cam.planeY * dx + cam.planeX * dy);
  if (!Number.isFinite(lateral) || !Number.isFinite(depth)) return null;
  return { lateral, depth };
}

/**
 * Screen X (in pixels) for a projected billboard on a canvas `screenW` wide.
 */
export function billboardScreenX(proj: BillboardProjection, screenW: number): number {
  return (screenW / 2) * (1 + proj.lateral / proj.depth);
}

/**
 * Whether a tile feature gets a corridor marker the party can see from a
 * distance.
 *
 * Three exclusions, for different reasons:
 * - `stairs_up`/`stairs_down` already paint as door panels (`raycastEdgeStop`),
 *   so a glyph would double up on art that exists.
 * - `event` tiles are scripted one-shots, and floors 1-3 author them as things
 *   you are meant to walk into: concealed rewards ("a false-bottomed drawer"),
 *   ambush damage ("a bookcase groans and topples"). Marking them prospectively
 *   would let a player route around authored hazards and would defeat authored
 *   concealment — a balance change, not a rendering fix. The automap still
 *   shows them, which is different: that is a record of tiles already visited.
 * - `chute` is a concealed floor trap in the Wizardry tradition: dropping
 *   through it *is* the event, so telegraphing it would remove the mechanic
 *   rather than present it. `teleporter` is deliberately NOT excluded — it is
 *   a navigation landmark the player is meant to spot, recognise and use.
 *
 * The automap still records all of them once visited.
 */
export function isCorridorMarkerFeature(
  tile: TileFeature | undefined
): tile is TileFeature {
  if (!tile) return false;
  if (isStairExitFeature(tile)) return false;
  return tile !== "event" && tile !== "chute";
}

/**
 * Depth-bucket index for the batched edge-glow pass, clamped into range.
 *
 * The renderer indexes a fixed array of `Path2D` buckets with this. Before the
 * clamp, a negative or NaN `perpWallDist` produced an out-of-range index, and
 * the resulting `undefined.moveTo()` threw *inside the rAF callback* — which
 * does not just drop a frame, it ends the render loop for the rest of the
 * session (the corridor goes black until reload). Observed twice while driving
 * `__onyxDebug.jumpTo` with a bad `facing`/`x`/`y`.
 *
 * Clamping turns a fatal into one bad frame that recovers as soon as the camera
 * is valid again. It is deliberately permissive rather than throwing.
 */
export function glowBucketForDepth(depth: number, bucketCount: number): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(bucketCount - 1, Math.floor(depth)));
}

/**
 * Ceiling on a feature prop's height, as a fraction of the corridor's wall
 * height at that same depth.
 *
 * `MapSpriteDef.baseSize` was authored for the floor editor's icon palette, not
 * for corridor perspective: the chest ships at 40, and the raw billboard
 * formula turns that into ~1.35x the wall height, so a chest two tiles away
 * drew taller than the corridor it stands in. Capping against the wall keeps a
 * prop inside the room it occupies while still letting a deliberately small
 * `baseSize` render small — the cap only ever shrinks, never grows.
 */
export const PROP_MAX_WALL_FRAC = 0.55;

/**
 * On-screen height in pixels for a feature prop billboard: raw perspective
 * scale, capped so the prop cannot be taller than the corridor around it.
 */
export function propBillboardSize(
  screenH: number,
  depth: number,
  baseSize: number
): number {
  if (!Number.isFinite(depth) || depth <= 0) return FEATURE_MARKER_MIN_PX;
  const raw = (screenH / depth) * (baseSize / 56);
  const cap = computeLineHeight(screenH, depth) * PROP_MAX_WALL_FRAC;
  return Math.max(FEATURE_MARKER_MIN_PX, Math.round(Math.min(raw, cap)));
}

/** Smallest a feature marker may shrink to before it stops being readable. */
export const FEATURE_MARKER_MIN_PX = 10;

/**
 * Largest a feature marker may grow, as a fraction of screen height.
 *
 * Decor sprites are physical objects and are allowed to fill the view when you
 * stand next to them. A feature marker is a *symbol*, and a symbol scaled like
 * an object reads as a UI failure rather than as something in the room — at
 * one tile away an unclamped glyph covered nearly half the viewport. Clamping
 * costs the "grows then stops" tell on approach, which is the cheaper artifact.
 */
export const FEATURE_MARKER_MAX_SCREEN_FRAC = 0.2;

/**
 * On-screen height in pixels for a tile-feature marker at a given depth.
 * Perspective-scaled like a billboard, then clamped at both ends so it stays
 * both legible far away and unobtrusive up close.
 */
export function featureMarkerSize(
  screenH: number,
  depth: number,
  baseSize: number
): number {
  if (!Number.isFinite(depth) || depth <= 0) return FEATURE_MARKER_MIN_PX;
  const scaled = (screenH / depth) * (baseSize / 56);
  const max = Math.max(FEATURE_MARKER_MIN_PX, screenH * FEATURE_MARKER_MAX_SCREEN_FRAC);
  return Math.round(Math.min(max, Math.max(FEATURE_MARKER_MIN_PX, scaled)));
}

// --- Wall features -----------------------------------------------------------
// A wall feature is a small decal (switch, plaque, relief, lock, vent, ...)
// composited onto a *specific wall face* — as opposed to `mapSprites`, which
// billboard-float in front of the corridor. The face is identified by the
// cell the ray's wall/door hit belongs to (`hit.mapX/mapY` is the far cell;
// the wall lives on the near cell, same math as `themeForWallHit`) plus which
// of that cell's four edges was struck.

export type WallDir = "n" | "e" | "s" | "w";

/**
 * Which face of the *near* cell a wall raycast hit belongs to. Mirrors the
 * texture-flip condition used for wall/door texX sampling: a ray stepping in
 * +x crosses the near cell's east edge; -x crosses its west edge; same for
 * y/north-south.
 */
export function dirForWallHit(
  side: "x" | "y",
  rayDirX: number,
  rayDirY: number
): WallDir {
  return side === "x" ? (rayDirX > 0 ? "e" : "w") : rayDirY > 0 ? "s" : "n";
}

/** The near cell + face a wall/door ray hit belongs to, for wallFeatures lookup. */
export function wallFeatureCellForHit(
  hitX: number,
  hitY: number,
  side: "x" | "y",
  rayDirX: number,
  rayDirY: number
): { x: number; y: number; dir: WallDir } {
  const x = side === "x" ? hitX - Math.sign(rayDirX) : hitX;
  const y = side === "y" ? hitY - Math.sign(rayDirY) : hitY;
  return { x, y, dir: dirForWallHit(side, rayDirX, rayDirY) };
}

/**
 * `wallX` (0-1 across the face) sampled facing the same direction regardless
 * of which side the ray approached from, so a decal doesn't mirror left/right
 * when the player turns around and walks back past it. Uses the identical
 * flip condition as the wall/door texX sampling in renderer.ts.
 */
export function stableWallX(
  wallX: number,
  side: "x" | "y",
  rayDirX: number,
  rayDirY: number
): number {
  const flip = (side === "x" && rayDirX > 0) || (side === "y" && rayDirY < 0);
  return flip ? 1 - wallX : wallX;
}

/**
 * A wall feature occupies a centered horizontal window of the wall face,
 * `widthFrac` of the face's width. Returns the local 0-1 U coordinate within
 * that window for a (stable) wallX, or null outside the window — the plain
 * wall texture shows through there instead.
 */
export function wallFeatureLocalU(
  stableX: number,
  widthFrac: number
): number | null {
  if (widthFrac <= 0) return null;
  const half = Math.min(0.5, widthFrac / 2);
  const lo = 0.5 - half;
  const hi = 0.5 + half;
  if (stableX < lo || stableX > hi) return null;
  return (stableX - lo) / (hi - lo);
}

export type WallFeatureAnchor = "center" | "bottom" | "top";

/**
 * Vertical [top, bottom] screen-pixel range for a wall feature decal — a
 * sub-rectangle of the full wall strip's [drawStart, drawEnd] draw range, so
 * e.g. a switch can sit at eye height instead of stretching floor-to-ceiling.
 */
export function wallFeatureVerticalRect(
  drawStart: number,
  drawEnd: number,
  heightFrac: number,
  anchor: WallFeatureAnchor
): [number, number] {
  const full = drawEnd - drawStart;
  const featH = full * Math.max(0, Math.min(1, heightFrac));
  let top: number;
  if (anchor === "top") top = drawStart;
  else if (anchor === "bottom") top = drawEnd - featH;
  else top = drawStart + (full - featH) / 2;
  return [top, top + featH];
}

/**
 * Stateful render-camera animator. Tracks the display camera position
 * separately from the integer game-state position and tweens between them
 * on moves/turns. Teleports/stairs/chutes snap instantly.
 *
 * This class is DOM-free and testable with fake timestamps.
 */
export class RenderCameraAnimator {
  private displayX = -1;
  private displayY = -1;
  private displayFacing = -1;
  private lastTargetX = -1;
  private lastTargetY = -1;
  private lastTargetFacing = -1;
  private animStartX = 0;
  private animStartY = 0;
  private animStartFacing = 0;
  private animStartTime = 0;
  private animDuration = 0;
  private animActive = false;
  private animMoved = false;

  /** Initialize (or re-initialize) the animator to the given grid state. */
  init(x: number, y: number, facing: number): void {
    this.displayX = x;
    this.displayY = y;
    this.displayFacing = facing;
    this.lastTargetX = x;
    this.lastTargetY = y;
    this.lastTargetFacing = facing;
    this.animActive = false;
    this.animMoved = false;
  }

  /** Reset the camera instantly to the given state and stop any animation. */
  reset(x: number, y: number, facing: number): void {
    this.init(x, y, facing);
  }

  /** True if the camera is currently tweening toward a target. */
  isAnimating(): boolean {
    return this.animActive;
  }

  /**
   * True when the display camera has fully settled on the given grid state:
   * no tween in flight AND that state is the last target this animator has
   * observed. `isAnimating()` alone cannot see the window between a movement
   * keydown (which mutates the game-state position) and the next render
   * frame (whose `update()` actually starts the tween) — during that window
   * it still returns false while a tween is pending, which made the debug
   * `isIdle()` probe report idle one press too early and let the dungeon
   * input gate silently swallow the next scripted keypress. An uninitialized
   * animator (no frame rendered yet) reports settled, since there is nothing
   * pending to wait out.
   */
  isSettledAt(x: number, y: number, facing: number): boolean {
    if (this.displayX < 0) return true;
    if (this.animActive) return false;
    return (
      this.lastTargetX === x &&
      this.lastTargetY === y &&
      this.lastTargetFacing === facing
    );
  }

  /**
   * Update the animator toward the new target state. `now` is a timestamp
   * in milliseconds (e.g. performance.now() or Date.now()).
   */
  update(x: number, y: number, facing: number, now: number): void {
    // First-call initialization: snap to current state.
    if (this.displayX < 0) {
      this.init(x, y, facing);
      return;
    }

    // Detect state change → start new animation.
    if (
      x !== this.lastTargetX ||
      y !== this.lastTargetY ||
      facing !== this.lastTargetFacing
    ) {
      if (shouldSnapTeleport(this.lastTargetX, this.lastTargetY, x, y)) {
        this.displayX = x;
        this.displayY = y;
        this.displayFacing = facing;
        this.animActive = false;
      } else {
        this.animStartX = this.displayX;
        this.animStartY = this.displayY;
        this.animStartFacing = this.displayFacing;
        this.animStartTime = now;
        const moved = x !== this.lastTargetX || y !== this.lastTargetY;
        const turned = facing !== this.lastTargetFacing;
        this.animMoved = moved;
        this.animDuration =
          moved && turned
            ? Math.max(MATH_CONFIG.moveAnimDuration, MATH_CONFIG.turnAnimDuration)
            : moved
            ? MATH_CONFIG.moveAnimDuration
            : MATH_CONFIG.turnAnimDuration;
        this.animActive = true;
      }

      this.lastTargetX = x;
      this.lastTargetY = y;
      this.lastTargetFacing = facing;
    }

    // Advance animation.
    if (this.animActive) {
      const elapsed = now - this.animStartTime;
      const t = Math.min(1, elapsed / this.animDuration);
      const eased = easeOutCubic(t);

      this.displayX = this.animStartX + (this.lastTargetX - this.animStartX) * eased;
      this.displayY = this.animStartY + (this.lastTargetY - this.animStartY) * eased;
      this.displayFacing = interpolateFacing(
        this.animStartFacing,
        this.lastTargetFacing,
        eased
      );

      if (t >= 1) {
        this.animActive = false;
        this.displayX = this.lastTargetX;
        this.displayY = this.lastTargetY;
        this.displayFacing = this.lastTargetFacing;
      }
    }
  }

  /**
   * Compute a screen-space head-bob offset for the current animation.
   * Returns 0 when not moving (including turns and teleports). During a move,
   * the offset follows a single sine hump keyed to animation progress so it
   * starts at 0, reaches `amplitude` near the midpoint, and returns to 0 at
   * the end of the step.
   */
  getMoveBob(now: number, amplitude: number): number {
    if (!this.animActive || !this.animMoved) return 0;
    const elapsed = now - this.animStartTime;
    const t = Math.min(1, elapsed / this.animDuration);
    return Math.sin(t * Math.PI) * amplitude;
  }

  /** Return the current interpolated camera for the given FOV. */
  getCamera(fov: number): RenderCamera {
    const dir = dirFromFacing(this.displayFacing);
    const plane = planeFromDir(dir.x, dir.y, fov);
    return {
      x: this.displayX,
      y: this.displayY,
      dirX: dir.x,
      dirY: dir.y,
      planeX: plane.planeX,
      planeY: plane.planeY,
    };
  }
}

// --- Arena renderer math -----------------------------------------------------
// Pure projection functions for the 3/4 top-down battle arena backdrop. These
// have no canvas dependencies and are unit-tested in render-math.test.ts.

/** Parameters for the arena camera. All angles are radians. */
export interface ArenaCamera {
  /** Camera height above the floor, in world/grid units. */
  camHeight: number;
  /** Pitch down from horizontal (θ > 0 means looking down). */
  pitch: number;
  /** Focal length in pixels. */
  focalLength: number;
  /** Screen y-coordinate of the horizon line. */
  horizonY: number;
}

/**
 * Compute the world depth Y for a given screen row y on the arena floor plane
 * Z = 0. Returns Infinity at the horizon row.
 *
 * Derivation: camera at (0,0,H), optical axis pitched down by θ. For a screen
 * row y, the ray intersects the floor at depth:
 *   Y = H * (1 + (dy/f) * tan θ) / (tan θ - dy/f)
 * where dy = (screenH/2) - y.
 */
export function arenaFloorRowDistance(
  y: number,
  camera: ArenaCamera,
  screenH: number
): number {
  const halfH = screenH / 2;
  const dy = halfH - y;
  const tanPitch = Math.tan(camera.pitch);
  const dyOverF = dy / camera.focalLength;
  const denom = tanPitch - dyOverF;
  if (Math.abs(denom) < 1e-9) return Infinity;
  return camera.camHeight * (1 + dyOverF * tanPitch) / denom;
}

/**
 * Compute the world-space point on the floor plane Z=0 that projects to screen
 * pixel (x, y).
 */
export function arenaFloorWorldAt(
  x: number,
  y: number,
  camera: ArenaCamera,
  screenW: number,
  screenH: number
): { x: number; y: number } {
  const d = arenaFloorRowDistance(y, camera, screenH);
  if (!isFinite(d)) return { x: 0, y: Infinity };
  const dx = x - screenW / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const worldX =
    (dx * (d * cosPitch + camera.camHeight * sinPitch)) /
    camera.focalLength;
  return { x: worldX, y: d };
}

/**
 * Compute the world-space point on the vertical side-wall plane X = wallX
 * that projects to screen pixel (x, y) — the side-wall analogue of
 * arenaFloorWorldAt, and an exact inverse of arenaProject restricted to that
 * plane.
 *
 * Derivation: the pixel's camera ray from (0, 0, camHeight) has direction
 *   (rayX, rayY, rayZ) = ((x - W/2)/f, cosθ + (dy/f)·sinθ, -sinθ + (dy/f)·cosθ)
 * with dy = H/2 - y (the same row construction the back-wall rasterizer
 * uses). Intersecting X = wallX gives t = wallX / rayX, then
 *   worldY = t·rayY,  worldZ = camHeight + t·rayZ.
 * Returns null when the pixel column contains the vanishing line (rayX ≈ 0)
 * or the plane is only hit behind the camera (t ≤ 0).
 */
export function arenaSideWallWorldAt(
  x: number,
  y: number,
  wallX: number,
  camera: ArenaCamera,
  screenW: number,
  screenH: number
): { y: number; z: number } | null {
  const dx = x - screenW / 2;
  if (Math.abs(dx) < 1e-9) return null;
  const t = (camera.focalLength * wallX) / dx;
  if (t <= 0) return null;
  const dyOverF = (screenH / 2 - y) / camera.focalLength;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const rayY = cosPitch + dyOverF * sinPitch;
  const rayZ = -sinPitch + dyOverF * cosPitch;
  return { y: t * rayY, z: camera.camHeight + t * rayZ };
}

/**
 * Project a world point (X, Y, Z) to screen coordinates using the arena camera.
 */
export function arenaProject(
  world: { x: number; y: number; z: number },
  camera: ArenaCamera,
  screenW: number,
  screenH: number
): { x: number; y: number } {
  const halfH = screenH / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const a = world.x;
  const b = world.y * sinPitch + (world.z - camera.camHeight) * cosPitch;
  const c = world.y * cosPitch - (world.z - camera.camHeight) * sinPitch;
  if (Math.abs(c) < 1e-9) return { x: screenW / 2, y: halfH };
  return {
    x: screenW / 2 + (camera.focalLength * a) / c,
    y: halfH - (camera.focalLength * b) / c,
  };
}

/** Fog/depth opacity tuned for the smaller, steeper arena view. */
export function arenaOpacityForDepth(d: number): number {
  const exponential = Math.pow(MATH_CONFIG.arenaFogFalloff, d);
  const lift = MATH_CONFIG.arenaFogMidtoneLift;
  return exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
}

/**
 * Inverse of arenaFloorRowDistance: given a world depth Y on the floor plane
 * Z=0, return the screen row that projects to it.
 *
 * From Y = H * (1 + (dy/f)*tanθ) / (tanθ - dy/f):
 *   dy/f = (Y·tanθ - H) / (Y + H·tanθ)
 */
export function arenaFloorScreenYForDepth(
  worldY: number,
  camera: ArenaCamera,
  screenH: number
): number {
  const halfH = screenH / 2;
  const tanPitch = Math.tan(camera.pitch);
  const denom = worldY + camera.camHeight * tanPitch;
  if (Math.abs(denom) < 1e-9) return halfH;
  const dyOverF = (worldY * tanPitch - camera.camHeight) / denom;
  return halfH - dyOverF * camera.focalLength;
}
