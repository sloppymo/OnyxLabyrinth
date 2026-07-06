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
// These mirror the RENDER_CONFIG entries in renderer.ts. They are duplicated
// here (rather than imported) to keep this module DOM-free and testable in
// pure Node. If you change a value in renderer.ts, update it here too.
export const MATH_CONFIG = {
  projectionScale: 0.62,
  heightFlatten: 0.85,
  fogFalloff: 0.70,
  fogMidtoneLift: 0.25,
  baseOpacity: 1.0,
  glowBlurNear: 7,
  glowBlurFar: 2,
  maxDepth: 4,
  darknessMaxDist: 1.5,
  teleportSnapThreshold: 1.5,
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
 * Fog/depth opacity. Uses an exponential falloff blended toward 1.0 by
 * `fogMidtoneLift` so mid-distance surfaces stay visible instead of dropping
 * into the noise floor. At distance 0 the result is always 1.0 (no fog on the
 * player's own cell); the lift only affects distance > 0.
 */
export function opacityForDepth(d: number): number {
  const exponential =
    MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
  const lift = MATH_CONFIG.fogMidtoneLift;
  return exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
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
