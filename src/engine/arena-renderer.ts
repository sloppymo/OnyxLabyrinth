/**
 * Dedicated 3/4 top-down arena backdrop renderer for combat scenes.
 *
 * This module draws a synthetic room (floor + side walls + back wall + void)
 * using perspective-correct per-pixel rasterizers. It does not reuse the
 * corridor raycaster, so it cannot accidentally break the dungeon view.
 *
 * Deliberately imports only a type from renderer.ts (no runtime cycle).
 */

import type { LoadedTileset } from "./renderer";
import type { ArenaCamera } from "./render-math";
import {
  arenaFloorRowDistance,
  arenaOpacityForDepth,
  arenaProject,
} from "./render-math";

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
  /** Horizon as a fraction of canvas height (< 0.5). Must match ARENA_HORIZON_FRAC. */
  horizonFrac?: number;
  /** Distance beyond which surfaces are fully fogged. */
  maxVisibleDist?: number;
  /** Void/fog blend color. Must match PALETTE.bg. */
  voidColor?: string;
}

const DEFAULTS = {
  roomWidth: 10,
  roomDepth: 18,
  wallHeight: 5,
  camHeight: 2.5,
  pitch: (30 * Math.PI) / 180,
  // Keep in sync with ARENA_HORIZON_FRAC / PALETTE.bg in renderer.ts.
  horizonFrac: 0.3,
  maxVisibleDist: 28,
  voidColor: "#0e0d0a",
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
  };
  const camera = buildArenaCamera(h, params);
  const bg = parseBg(params.voidColor);

  // Bake everything into one opaque ImageData buffer, then blit once.
  // putImageData replaces pixels (it does not composite), so the buffer must
  // include the void fill — drawing the back wall onto ctx before putImageData
  // would be wiped.
  const buf = ctx.createImageData(w, h);
  fillBuffer(buf, bg);

  const wallData = getWallData(options.tileset);
  drawFloor(buf, w, h, camera, params, options.tileset, bg);
  if (wallData) {
    // Far surfaces first, then nearer side walls overwrite shared edges.
    drawBackWall(buf, w, h, camera, params, wallData, bg);
    drawSideWalls(buf, w, h, camera, params, wallData, bg);
  }
  ctx.putImageData(buf, 0, 0);
}

function buildArenaCamera(h: number, params: ArenaParams): ArenaCamera {
  const horizonY = h * params.horizonFrac;
  // horizonY = h/2 - f * tan(θ)  =>  f = (h/2 - horizonY) / tan(θ)
  const focalLength = ((0.5 - params.horizonFrac) * h) / Math.tan(params.pitch);
  return {
    camHeight: params.camHeight,
    pitch: params.pitch,
    focalLength,
    horizonY,
  };
}

function parseBg(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function fillBuffer(buf: ImageData, bg: Rgb): void {
  const data = buf.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg.r;
    data[i + 1] = bg.g;
    data[i + 2] = bg.b;
    data[i + 3] = 255;
  }
}

function writeFoggedTexel(
  buf: ImageData,
  dstIdx: number,
  tex: ImageData,
  srcIdx: number,
  fog: number,
  bg: Rgb
): void {
  const inv = 1 - fog;
  buf.data[dstIdx] = Math.min(255, tex.data[srcIdx] * fog + bg.r * inv);
  buf.data[dstIdx + 1] = Math.min(255, tex.data[srcIdx + 1] * fog + bg.g * inv);
  buf.data[dstIdx + 2] = Math.min(255, tex.data[srcIdx + 2] * fog + bg.b * inv);
  buf.data[dstIdx + 3] = 255;
}

/** Floor texel indices. Uses Math.floor so negative worldX (left half of the
 *  room) wraps correctly — bitwise truncation toward zero breaks there. */
function floorTexel(
  worldX: number,
  worldY: number,
  texSize: number
): { gx: number; gy: number; texX: number; texY: number } {
  const gx = Math.floor(worldX);
  const gy = Math.floor(worldY);
  const texX = Math.floor((worldX - gx) * texSize) % texSize;
  const texY = Math.floor((worldY - gy) * texSize) % texSize;
  return {
    gx,
    gy,
    texX: texX < 0 ? texX + texSize : texX,
    texY: texY < 0 ? texY + texSize : texY,
  };
}

function checkerIsA(gx: number, gy: number): boolean {
  // JS `%` is signed; use bit parity so negative tiles still checkerboard.
  return ((gx + gy) & 1) === 0;
}

function getWallData(tileset: LoadedTileset): ImageData | null {
  const c = tileset.repeatedWall;
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  return ctx.getImageData(0, 0, c.width, c.height);
}

function projectBBox(
  points: Array<{ x: number; y: number }>,
  w: number,
  h: number
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  minX = Math.max(0, Math.floor(minX));
  maxX = Math.min(w - 1, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(h - 1, Math.ceil(maxY));
  if (minX > maxX || minY > maxY) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Perspective-correct back wall at Y = roomDepth (plane parallel to XZ).
 * Projects to a trapezoid because camera pitch makes c vary with Z.
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
  const halfWScreen = w / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;

  const bbox = projectBBox(
    [
      arenaProject({ x: -halfW, y: roomDepth, z: 0 }, camera, w, h),
      arenaProject({ x: halfW, y: roomDepth, z: 0 }, camera, w, h),
      arenaProject({ x: -halfW, y: roomDepth, z: params.wallHeight }, camera, w, h),
      arenaProject({ x: halfW, y: roomDepth, z: params.wallHeight }, camera, w, h),
    ],
    w,
    h
  );
  if (!bbox) return;

  const fog = arenaOpacityForDepth(roomDepth);
  const { minX, maxX, minY, maxY } = bbox;

  for (let y = minY; y <= maxY; y++) {
    const dy = halfH - y;
    // Unnormalized ray dirs matching arenaProject / arenaFloorRowDistance.
    const rayY = cosPitch + (dy / f) * sinPitch;
    const rayZ = -sinPitch + (dy / f) * cosPitch;
    if (Math.abs(rayY) < 1e-9) continue;
    const t = roomDepth / rayY;
    if (t <= 0) continue;

    const worldZ = camera.camHeight + t * rayZ;
    if (worldZ < 0 || worldZ > params.wallHeight) continue;

    const rowOffset = y * w * 4;
    const texY = Math.max(
      0,
      Math.min(
        texSize - 1,
        Math.floor((1 - worldZ / params.wallHeight) * texSize)
      )
    );

    for (let x = minX; x <= maxX; x++) {
      const dx = x - halfWScreen;
      const worldX = (t * dx) / f;
      if (worldX < -halfW || worldX > halfW) continue;

      // Horizontal U wraps once per wallHeight units of X (matches side walls).
      let texX =
        Math.floor(((worldX + halfW) / params.wallHeight) * texSize) % texSize;
      if (texX < 0) texX += texSize;
      const srcIdx = (texY * texSize + texX) * 4;
      writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg);
    }
  }
}

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

  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);

  for (let y = startY; y < h; y++) {
    const d = arenaFloorRowDistance(y, camera, h);
    if (d <= 0 || d > params.maxVisibleDist || d > params.roomDepth) continue;

    const fog = arenaOpacityForDepth(d);

    // Perspective-correct across-screen step for this row (matches arenaFloorWorldAt).
    const depthScale = d * cosPitch + camera.camHeight * sinPitch;
    const worldXStart = (-w / 2) * (depthScale / camera.focalLength);
    const worldXStep = depthScale / camera.focalLength;

    const rowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const worldX = worldXStart + x * worldXStep;
      const worldY = d;

      if (worldX < -halfW || worldX > halfW) continue;

      const { gx, gy, texX, texY } = floorTexel(worldX, worldY, texSize);
      const tex = checkerIsA(gx, gy) ? floorA : floorB;
      const srcIdx = (texY * texSize + texX) * 4;
      writeFoggedTexel(buf, rowOffset + x * 4, tex, srcIdx, fog, bg);
    }
  }
}

function drawSideWalls(
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
  const halfH = h / 2;
  const halfWScreen = w / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;

  const wallXs = [-halfW, halfW] as const;

  for (const wallX of wallXs) {
    const bbox = projectBBox(
      [
        arenaProject({ x: wallX, y: 0, z: 0 }, camera, w, h),
        arenaProject({ x: wallX, y: params.roomDepth, z: 0 }, camera, w, h),
        arenaProject({ x: wallX, y: 0, z: params.wallHeight }, camera, w, h),
        arenaProject(
          { x: wallX, y: params.roomDepth, z: params.wallHeight },
          camera,
          w,
          h
        ),
      ],
      w,
      h
    );
    if (!bbox) continue;

    const { minX, maxX, minY, maxY } = bbox;

    for (let y = minY; y <= maxY; y++) {
      const dy = halfH - y;
      // Correct unnormalized ray for pitched camera (see arenaFloorRowDistance
      // derivation): V = t * (dx/f, cos+(dy/f)*sin, -sin+(dy/f)*cos).
      const rayY = cosPitch + (dy / f) * sinPitch;
      const rayZ = -sinPitch + (dy / f) * cosPitch;
      const rowOffset = y * w * 4;

      for (let x = minX; x <= maxX; x++) {
        const dx = x - halfWScreen;
        // t such that V.x = t * (dx/f) = wallX
        if (Math.abs(dx) < 1e-6) continue;
        const t = (wallX * f) / dx;
        if (t <= 0) continue;

        const worldY = t * rayY;
        const worldZ = camera.camHeight + t * rayZ;

        if (
          worldY < 0 ||
          worldY > params.roomDepth ||
          worldZ < 0 ||
          worldZ > params.wallHeight
        ) {
          continue;
        }

        const fog = arenaOpacityForDepth(worldY);

        const texX =
          ((Math.floor((worldY / params.wallHeight) * texSize) % texSize) +
            texSize) %
          texSize;
        const texY = Math.max(
          0,
          Math.min(
            texSize - 1,
            Math.floor((1 - worldZ / params.wallHeight) * texSize)
          )
        );
        const srcIdx = (texY * texSize + texX) * 4;
        writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg);
      }
    }
  }
}
