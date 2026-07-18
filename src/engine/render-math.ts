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
  moveAnimDuration: 150,
  turnAnimDuration: 100,
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
