/**
 * Dedicated 3/4 top-down arena backdrop renderer for combat scenes.
 *
 * This module draws a synthetic room (floor + side walls + back wall + void)
 * using a *screen-space silhouette* with mild rake — near-orthographic oblique,
 * not true wide-angle perspective. Floor tile columns and wall edges share the
 * same left/right insets so they never disagree. It does not reuse the corridor
 * raycaster, so it cannot accidentally break the dungeon view.
 *
 * Deliberately imports only a type from renderer.ts (no runtime cycle).
 */

import type { LoadedTileset } from "./renderer";
import type { ArenaCamera } from "./render-math";
import { arenaOpacityForDepth, arenaProject } from "./render-math";
import { ARENA_CAMERA, buildArenaCamera } from "./arena-camera";

export interface ArenaRenderOptions {
  tileset: LoadedTileset;
  /** Room width in grid/world units. */
  roomWidth?: number;
  /** Room depth in grid/world units. */
  roomDepth?: number;
  /** Wall height in grid/world units. */
  wallHeight?: number;
  /** Camera height above the floor. */
  camHeight?: number;
  /** Camera pitch down from horizontal, in radians. */
  pitch?: number;
  /** Horizon as a fraction of canvas height (< 0.5). Defaults to ARENA_CAMERA.horizonFrac. */
  horizonFrac?: number;
  /** Distance beyond which surfaces are fully fogged. */
  maxVisibleDist?: number;
  /** Void/fog blend color. Must match PALETTE.bg. */
  voidColor?: string;
  /**
   * Back wall width as a fraction of frame (centered). Side walls occupy the
   * remaining inset on each side. Target ~0.70–0.80.
   */
  backWallWidthFrac?: number;
  /**
   * Side-wall inset at the bottom edge (near / viewer). Slightly larger than
   * the far inset → gentle outward rake; difference is only a few % of width
   * so walls read as near-vertical strips, not perspective wedges.
   */
  sideWallNearInsetFrac?: number;
  /**
   * Floor row foreshortening power. worldY = lerp(far, near, t^rowCompressPower)
   * with t 0 at seam → 1 at bottom. Depth range is kept modest so compression
   * reads across the whole apron (not only the top strip near the seam).
   * Target front/back tile height ≈ 1.8–2.2× with a visible mid-floor gradient.
   */
  rowCompressPower?: number;
  /** Near-field world depth at the bottom edge (front tile row). */
  floorNearDepth?: number;
}

const DEFAULTS = {
  // Camera tuple lives in arena-camera.ts (single source of truth, also
  // consumed by the sprite ground-plane contract and the tests).
  ...ARENA_CAMERA,
  voidColor: "#0e0d0a",
  /** Back wall ~78% of frame → each side wall ~11% at the seam. */
  backWallWidthFrac: 0.78,
  /** Near inset ~14% → ~3pp outward rake (near-vertical drop, few degrees). */
  sideWallNearInsetFrac: 0.14,
  /** front/back tile-height ratio ≈ 2.0× (verified via arenaFloorScreenYForDepth
   * at roomDepth=14/floorNearDepth=3); 0.7 measured ~3.9×, overshooting target. */
  rowCompressPower: 0.82,
  floorNearDepth: 3.0,
} as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface ArenaParams {
  roomWidth: number;
  roomDepth: number;
  wallHeight: number;
  camHeight: number;
  pitch: number;
  horizonFrac: number;
  maxVisibleDist: number;
  voidColor: string;
  backWallWidthFrac: number;
  sideWallNearInsetFrac: number;
  rowCompressPower: number;
  floorNearDepth: number;
}

/** Render a 3/4 top-down arena room into the provided canvas context. */
export function renderArenaRoom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: ArenaRenderOptions
): void {
  const params: ArenaParams = {
    roomWidth: options.roomWidth ?? DEFAULTS.roomWidth,
    roomDepth: options.roomDepth ?? DEFAULTS.roomDepth,
    wallHeight: options.wallHeight ?? DEFAULTS.wallHeight,
    camHeight: options.camHeight ?? DEFAULTS.camHeight,
    pitch: options.pitch ?? DEFAULTS.pitch,
    horizonFrac: options.horizonFrac ?? DEFAULTS.horizonFrac,
    maxVisibleDist: options.maxVisibleDist ?? DEFAULTS.maxVisibleDist,
    voidColor: options.voidColor ?? DEFAULTS.voidColor,
    backWallWidthFrac: options.backWallWidthFrac ?? DEFAULTS.backWallWidthFrac,
    sideWallNearInsetFrac:
      options.sideWallNearInsetFrac ?? DEFAULTS.sideWallNearInsetFrac,
    rowCompressPower: options.rowCompressPower ?? DEFAULTS.rowCompressPower,
    floorNearDepth: options.floorNearDepth ?? DEFAULTS.floorNearDepth,
  };
  const camera = buildArenaCamera(h, params);
  const bg = parseBg(params.voidColor);

  // Bake everything into one opaque ImageData buffer, then blit once.
  const buf = ctx.createImageData(w, h);
  fillCeilingGradient(buf, w, h, camera.horizonY, bg);

  const wallData = getWallData(options.tileset);
  drawFloor(buf, w, h, camera, params, options.tileset, bg);
  if (wallData) {
    // Far surfaces first, then nearer side walls overwrite shared edges.
    drawBackWall(buf, w, h, camera, params, wallData, bg);
    extendBackWallIntoVoid(buf, w, h, camera, params, wallData, bg);
    drawSideWalls(buf, w, h, camera, params, wallData, bg);
  }
  ctx.putImageData(buf, 0, 0);
}

function parseBg(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// Flat dark ceiling — no amber void band.
const CEILING_NEAR: Rgb = { r: 18, g: 16, b: 14 };
const CEILING_FAR: Rgb = { r: 8, g: 7, b: 6 };

function fillCeilingGradient(
  buf: ImageData,
  w: number,
  h: number,
  horizonY: number,
  bg: Rgb
): void {
  const data = buf.data;
  const band = Math.max(1, horizonY);
  for (let y = 0; y < h; y++) {
    let r: number, g: number, b: number;
    if (y >= horizonY) {
      r = bg.r;
      g = bg.g;
      b = bg.b;
    } else {
      const t = Math.min(1, y / band);
      r = CEILING_FAR.r + (CEILING_NEAR.r - CEILING_FAR.r) * t;
      g = CEILING_FAR.g + (CEILING_NEAR.g - CEILING_FAR.g) * t;
      b = CEILING_FAR.b + (CEILING_NEAR.b - CEILING_FAR.b) * t;
    }
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
}

function writeFoggedTexel(
  buf: ImageData,
  dstIdx: number,
  tex: ImageData,
  srcIdx: number,
  fog: number,
  bg: Rgb,
  shade = 1
): void {
  const inv = 1 - fog;
  buf.data[dstIdx] = Math.min(255, tex.data[srcIdx] * shade * fog + bg.r * inv);
  buf.data[dstIdx + 1] = Math.min(
    255,
    tex.data[srcIdx + 1] * shade * fog + bg.g * inv
  );
  buf.data[dstIdx + 2] = Math.min(
    255,
    tex.data[srcIdx + 2] * shade * fog + bg.b * inv
  );
  buf.data[dstIdx + 3] = 255;
}

function getWallData(tileset: LoadedTileset): ImageData | null {
  const c = tileset.repeatedWall;
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  return ctx.getImageData(0, 0, c.width, c.height);
}

function floorTexel(
  worldX: number,
  worldY: number,
  texSize: number
): { gx: number; gy: number; texX: number; texY: number } {
  const gx = Math.floor(worldX);
  const gy = Math.floor(worldY);
  let texX = Math.floor((worldX - gx) * texSize);
  let texY = Math.floor((worldY - gy) * texSize);
  if (texX < 0) texX += texSize;
  if (texY < 0) texY += texSize;
  texX = Math.min(texSize - 1, texX);
  texY = Math.min(texSize - 1, texY);
  return { gx, gy, texX, texY };
}

function checkerIsA(gx: number, gy: number): boolean {
  return ((gx + gy) & 1) === 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Screen-space room silhouette — shared by floor and walls so they never
 * disagree. Far inset from backWallWidthFrac; near inset slightly wider for a
 * gentle outward rake (side walls ≈ near-vertical strips).
 */
function roomInsets(
  y: number,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams
): { left: number; right: number } {
  const seamY = camera.horizonY;
  const farInset = ((1 - params.backWallWidthFrac) / 2) * w;
  const nearInset = params.sideWallNearInsetFrac * w;
  const t =
    y <= seamY ? 0 : Math.min(1, (y - seamY) / Math.max(1, h - 1 - seamY));
  const inset = lerp(farInset, nearInset, t);
  return { left: inset, right: w - 1 - inset };
}

/** World-unit distance from a side wall within which the floor darkens. */
const FLOOR_AO_RANGE = 2.2;

/**
 * Floor between the silhouette edges.
 * - X: screen-linear across the floor span → parallel columns.
 * - Y: power-compressed depth (t^rowCompressPower) → short back rows, tall
 *   front rows (oblique floor read). Fog still uses world depth.
 */
function drawFloor(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams,
  tileset: LoadedTileset,
  bg: Rgb
): void {
  const floorA = tileset.set.floorAData;
  const floorB = tileset.set.floorBData;
  if (!floorA || !floorB) return;

  const halfW = params.roomWidth / 2;
  const texSize = floorA.width;
  const startY = Math.max(0, Math.floor(camera.horizonY) + 1);
  const seamY = camera.horizonY;
  const yNear = params.floorNearDepth;
  const yFar = params.roomDepth;
  const power = params.rowCompressPower;

  for (let y = startY; y < h; y++) {
    const t = Math.min(1, Math.max(0, (y - seamY) / Math.max(1, h - 1 - seamY)));
    const worldY = lerp(yFar, yNear, Math.pow(t, power));
    if (worldY <= 0 || worldY > params.maxVisibleDist) continue;

    // Mild fog from depth — keep the floor readable (not crushed).
    const fog = Math.min(1, Math.max(0.55, arenaOpacityForDepth(worldY) + 0.25));
    const { left, right } = roomInsets(y, w, h, camera, params);
    const span = Math.max(1, right - left);
    const rowOffset = y * w * 4;

    for (let x = Math.ceil(left); x <= Math.floor(right); x++) {
      const u = (x - left) / span;
      const worldX = -halfW + u * params.roomWidth;

      const { gx, gy, texX, texY } = floorTexel(worldX, worldY, texSize);
      const tex = checkerIsA(gx, gy) ? floorA : floorB;
      const srcIdx = (texY * texSize + texX) * 4;
      const distToWall = halfW - Math.abs(worldX);
      const shade =
        distToWall < FLOOR_AO_RANGE
          ? 0.55 + 0.45 * Math.max(0, distToWall / FLOOR_AO_RANGE)
          : 1;
      writeFoggedTexel(buf, rowOffset + x * 4, tex, srcIdx, fog, bg, shade);
    }
  }
}

/**
 * Back wall spans the far silhouette width (~70–80% of frame). Height still
 * from pitched projection so the wall band stays short under the void.
 */
function drawBackWall(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams,
  wallData: ImageData,
  bg: Rgb
): void {
  const halfW = params.roomWidth / 2;
  const roomDepth = params.roomDepth;
  const texSize = wallData.width;
  const halfH = h / 2;
  const f = camera.focalLength;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);

  const { left: farLeft, right: farRight } = roomInsets(
    camera.horizonY,
    w,
    h,
    camera,
    params
  );

  const footY = arenaProject({ x: 0, y: roomDepth, z: 0 }, camera, w, h).y;
  const topY = arenaProject(
    { x: 0, y: roomDepth, z: params.wallHeight },
    camera,
    w,
    h
  ).y;
  const minY = Math.max(0, Math.floor(Math.min(footY, topY)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(footY, topY)));
  const fog = arenaOpacityForDepth(roomDepth);

  for (let y = minY; y <= maxY; y++) {
    const dy = halfH - y;
    const rayY = cosPitch + (dy / f) * sinPitch;
    const rayZ = -sinPitch + (dy / f) * cosPitch;
    if (Math.abs(rayY) < 1e-9) continue;
    const t = roomDepth / rayY;
    if (t <= 0) continue;
    const worldZ = camera.camHeight + t * rayZ;
    if (worldZ < 0 || worldZ > params.wallHeight) continue;

    const texY = Math.max(
      0,
      Math.min(
        texSize - 1,
        Math.floor((1 - worldZ / params.wallHeight) * texSize)
      )
    );
    const rowOffset = y * w * 4;
    const shade = 0.62 + 0.68 * (worldZ / params.wallHeight);
    const span = Math.max(1, farRight - farLeft);

    for (let x = Math.ceil(farLeft); x <= Math.floor(farRight); x++) {
      const u = (x - farLeft) / span;
      const worldX = -halfW + u * params.roomWidth;
      let texX =
        Math.floor(((worldX + halfW) / params.wallHeight) * texSize) % texSize;
      if (texX < 0) texX += texSize;
      const srcIdx = (texY * texSize + texX) * 4;
      writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg, shade);
    }
  }
}

/**
 * Fill above the projected wall top with fogged brick columns (no amber void).
 * Only within the far silhouette so side strips stay clear for side walls.
 */
function extendBackWallIntoVoid(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams,
  wallData: ImageData,
  bg: Rgb
): void {
  const halfW = params.roomWidth / 2;
  const texSize = wallData.width;
  const wallTop = arenaProject(
    { x: 0, y: params.roomDepth, z: params.wallHeight },
    camera,
    w,
    h
  ).y;
  const maxY = Math.max(0, Math.min(h - 1, Math.floor(wallTop)));
  if (maxY <= 0) return;

  const { left: farLeft, right: farRight } = roomInsets(
    camera.horizonY,
    w,
    h,
    camera,
    params
  );
  const fogBase = arenaOpacityForDepth(params.roomDepth) * 0.55;
  const span = Math.max(1, farRight - farLeft);

  for (let y = 0; y < maxY; y++) {
    const t = 1 - y / maxY;
    const fog = fogBase * (0.15 + 0.85 * (1 - t));
    const shade = 0.35 + 0.25 * (1 - t);
    const texY = Math.min(texSize - 1, Math.floor(t * texSize * 0.35));
    const rowOffset = y * w * 4;
    for (let x = Math.ceil(farLeft); x <= Math.floor(farRight); x++) {
      const u = (x - farLeft) / span;
      const worldX = -halfW + u * params.roomWidth;
      let texX =
        Math.floor(((worldX + halfW) / params.wallHeight) * texSize) % texSize;
      if (texX < 0) texX += texSize;
      const srcIdx = (texY * texSize + texX) * 4;
      writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg, shade);
    }
  }
}

/**
 * Side walls = the silhouette insets themselves. Near segments *are* the
 * shoulder stubs — continuous with the wall, not bolt-on patches. Each strip
 * is ~12–16% of frame width with only a few degrees of outward rake.
 */
function drawSideWalls(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams,
  wallData: ImageData,
  bg: Rgb
): void {
  const texSize = wallData.width;
  const seamY = camera.horizonY;
  const wallTopY = arenaProject(
    { x: 0, y: params.roomDepth, z: params.wallHeight },
    camera,
    w,
    h
  ).y;
  const minY = Math.max(0, Math.floor(wallTopY));

  for (let y = minY; y < h; y++) {
    const { left, right } = roomInsets(y, w, h, camera, params);
    const tFloor =
      y <= seamY ? 0 : Math.min(1, (y - seamY) / Math.max(1, h - 1 - seamY));
    // Depth along the wall only for texture scroll — NOT for fog (depth fog
    // crushed side walls to black gutters; framing walls must stay readable).
    const worldY = lerp(params.roomDepth, 0.8, tFloor);
    // No depth fog on side walls — full texture, lit framing.
    const fog = 1;

    // Wall height: keep a solid strip to the bottom so the near end reads as
    // the continuous shoulder of the wall (not a tapered floating patch).
    const heightFrac = y <= seamY ? 1 : lerp(1, 0.78, tFloor);
    const wallH = params.wallHeight * heightFrac;
    const topAtY = lerp(wallTopY, h * 0.48, Math.min(1, tFloor * 0.85));

    // Depth-driven coursing offset (varies per row) layered under a
    // per-pixel horizontal component below — a texX derived from worldY
    // alone is constant across the whole strip width, which paints each
    // scanline as one flat texel (the "wallpaper band" defect).
    const depthTexX = Math.floor((worldY / params.wallHeight) * texSize);
    const rowOffset = y * w * 4;

    // refX anchors the horizontal texture coordinate to the strip's inner
    // (room-facing) edge so brick coursing stays put as the strip's screen
    // position drifts row to row, instead of sliding with absolute x.
    const paintStrip = (x0: number, x1: number, refX: number) => {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (x < 0 || x >= w) continue;
        const v =
          y >= topAtY
            ? Math.max(0, 1 - (y - topAtY) / Math.max(1, h - 1 - topAtY))
            : 1;
        const worldZ = wallH * Math.min(1, v);
        const texY = Math.max(
          0,
          Math.min(
            texSize - 1,
            Math.floor((1 - worldZ / params.wallHeight) * texSize)
          )
        );
        const texX =
          ((Math.floor(Math.abs(x - refX) * 2) + depthTexX) % texSize +
            texSize) %
          texSize;
        const srcIdx = (texY * texSize + texX) * 4;
        // Mild brighten so bricks read at the frame edge without washing
        // out the texture's own contrast (kept close to the back wall's
        // 0.62–1.30 range rather than the previous 1.4–1.65 overbrighten).
        const shade = 0.95 + 0.35 * (worldZ / params.wallHeight);
        writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg, shade);
      }
    };

    // Left strip [0, left), right strip (right, w).
    paintStrip(0, left, left);
    paintStrip(right + 1, w, right + 1);
  }
}
