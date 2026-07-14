/**
 * Dedicated 3/4 top-down arena backdrop renderer for combat scenes.
 *
 * This module draws a synthetic room (floor + side walls + back wall + void)
 * using perspective-correct per-pixel rasterizers. It does not reuse the
 * corridor raycaster, so it cannot accidentally break the dungeon view.
 */

import type { LoadedTileset } from "./renderer";
import { ARENA_HORIZON_FRAC, PALETTE } from "./renderer";
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
  /** Horizon as a fraction of canvas height (< 0.5). */
  horizonFrac?: number;
  /** Distance beyond which surfaces are fully fogged. */
  maxVisibleDist?: number;
}

const DEFAULTS = {
  roomWidth: 10,
  roomDepth: 18,
  wallHeight: 5,
  camHeight: 2.5,
  pitch: (30 * Math.PI) / 180,
  maxVisibleDist: 28,
} as const;

/** Render a 3/4 top-down arena room into the provided canvas context. */
export function renderArenaRoom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: ArenaRenderOptions
): void {
  const params = { ...DEFAULTS, horizonFrac: ARENA_HORIZON_FRAC, ...options };
  const camera = buildArenaCamera(w, h, params);

  // 1. Fill the entire canvas with the void color. Floor/wall passes will
  // overwrite their regions; everything else stays as the void.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  // 2. Back wall, drawn before the floor so the floor overwrites its bottom.
  drawBackWall(ctx, w, h, camera, params, options.tileset);

  // 3. Floor and side walls share one transparent ImageData buffer.
  const buf = ctx.createImageData(w, h);
  drawFloor(buf, w, h, camera, params, options.tileset);
  drawSideWalls(buf, w, h, camera, params, options.tileset);
  ctx.putImageData(buf, 0, 0);
}

function buildArenaCamera(
  _w: number,
  h: number,
  params: Required<ArenaRenderOptions>
): ArenaCamera {
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

function parseBg(): { r: number; g: number; b: number; packed: number } {
  const hex = PALETTE.bg;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const packed = (255 << 24) | (b << 16) | (g << 8) | r;
  return { r, g, b, packed };
}

function drawBackWall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: Required<ArenaRenderOptions>,
  tileset: LoadedTileset
): void {
  const wallImg = tileset.repeatedWall;
  if (!wallImg) return;

  // The back wall is perpendicular to the view direction, so its geometric
  // projection collapses to a thin horizontal band. We render it as a tiled
  // strip sitting just above the floor at the far end of the room — this
  // matches the mockup's visible back wall band without fighting the camera.
  const halfW = params.roomWidth / 2;
  const floorY = arenaFloorRowDistanceForWorldY(params.roomDepth, camera, h);
  if (!Number.isFinite(floorY) || floorY < camera.horizonY) return;

  const left = arenaProject({ x: -halfW, y: params.roomDepth, z: 0 }, camera, w, h);
  const right = arenaProject({ x: halfW, y: params.roomDepth, z: 0 }, camera, w, h);
  // The back wall sits above the floor top (smaller screen y) and below the
  // horizon. Because floorY < horizonY on screen, y=floorY and height positive.
  const bandTop = Math.max(0, Math.floor(floorY));
  const bandBottom = Math.min(h, Math.ceil(camera.horizonY));
  const bandHeight = Math.max(4, bandBottom - bandTop);
  const bandLeft = Math.max(0, Math.floor(left.x));
  const bandRight = Math.min(w, Math.ceil(right.x));
  if (bandRight <= bandLeft) return;

  // Tile the wall texture horizontally so bricks keep their proportions.
  const tileScreenSize = bandHeight;
  const tiles = Math.ceil((bandRight - bandLeft) / tileScreenSize);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < tiles; i++) {
    const tx = bandLeft + i * tileScreenSize;
    const tw = Math.min(tileScreenSize, bandRight - tx);
    ctx.drawImage(wallImg, tx, bandTop, tw, bandHeight);
  }
}

/** Inverse of arenaFloorRowDistance: given a world Y, find the screen y that
 *  projects to it. Derived from rowDistance formula. */
function arenaFloorRowDistanceForWorldY(
  worldY: number,
  camera: ArenaCamera,
  screenH: number
): number {
  const halfH = screenH / 2;
  const tanPitch = Math.tan(camera.pitch);
  const f = camera.focalLength;
  const H = camera.camHeight;
  const Y = worldY;
  // Y = H * (1 + (dy/f) * tan θ) / (tan θ - dy/f)
  // Solve for dy:
  // dy/f = (Y * tan θ - H) / (Y + H * tan θ)
  const num = Y * tanPitch - H;
  const denom = Y + H * tanPitch;
  if (Math.abs(denom) < 1e-9) return halfH;
  const dyOverF = num / denom;
  const dy = dyOverF * f;
  return halfH - dy;
}

function drawFloor(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: Required<ArenaRenderOptions>,
  tileset: LoadedTileset
): void {
  const floorA = tileset.set.floorAData;
  const floorB = tileset.set.floorBData;
  if (!floorA || !floorB) return;

  const halfW = params.roomWidth / 2;
  const bg = parseBg();
  const texSize = floorA.width;
  const startY = Math.max(0, Math.floor(camera.horizonY) + 1);

  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);

  for (let y = startY; y < h; y++) {
    const d = arenaFloorRowDistance(y, camera, h);
    if (d <= 0 || d > params.maxVisibleDist) continue;

    const fog = arenaOpacityForDepth(d);
    const inv = 1 - fog;

    // Perspective-correct across-screen step for this row.
    const depthScale = d * cosPitch + camera.camHeight * sinPitch;
    const worldXStart = (-w / 2) * (depthScale / camera.focalLength);
    const worldXStep = depthScale / camera.focalLength;

    const rowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const worldX = worldXStart + x * worldXStep;
      const worldY = d;

      // Cull pixels outside the room floor.
      if (
        worldX < -halfW ||
        worldX > halfW ||
        worldY < 0 ||
        worldY > params.roomDepth
      ) {
        continue;
      }

      const gx = worldX | 0;
      const gy = worldY | 0;
      const tex = (gx + gy) % 2 === 0 ? floorA : floorB;
      const texX = ((worldX - gx) * texSize | 0) % texSize;
      const texY = ((worldY - gy) * texSize | 0) % texSize;
      const srcIdx = (texY * texSize + texX) * 4;
      const dstIdx = rowOffset + x * 4;

      buf.data[dstIdx] = Math.min(
        255,
        tex.data[srcIdx] * fog + bg.r * inv
      );
      buf.data[dstIdx + 1] = Math.min(
        255,
        tex.data[srcIdx + 1] * fog + bg.g * inv
      );
      buf.data[dstIdx + 2] = Math.min(
        255,
        tex.data[srcIdx + 2] * fog + bg.b * inv
      );
      buf.data[dstIdx + 3] = 255;
    }
  }
}

function getWallData(tileset: LoadedTileset): ImageData | null {
  const c = tileset.repeatedWall;
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  return ctx.getImageData(0, 0, c.width, c.height);
}

function drawSideWalls(
  buf: ImageData,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: Required<ArenaRenderOptions>,
  tileset: LoadedTileset
): void {
  const wallData = getWallData(tileset);
  if (!wallData) return;

  const halfW = params.roomWidth / 2;
  const bg = parseBg();
  const texSize = wallData.width;
  const halfH = h / 2;
  const halfWScreen = w / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const f = camera.focalLength;

  const walls = [
    { wallX: -halfW, xSign: -1 },
    { wallX: halfW, xSign: 1 },
  ] as const;

  for (const { wallX } of walls) {
    // Project the four wall corners to a screen-space bounding box.
    const corners = [
      arenaProject({ x: wallX, y: 0, z: 0 }, camera, w, h),
      arenaProject({ x: wallX, y: params.roomDepth, z: 0 }, camera, w, h),
      arenaProject({ x: wallX, y: 0, z: params.wallHeight }, camera, w, h),
      arenaProject({ x: wallX, y: params.roomDepth, z: params.wallHeight }, camera, w, h),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(w - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(h - 1, Math.ceil(maxY));
    if (minX > maxX || minY > maxY) continue;

    for (let y = minY; y <= maxY; y++) {
      const dy = halfH - y;
      // Ray direction coefficients for this screen row (constant across x).
      const rayY = cosPitch - (dy / f) * sinPitch;
      const rayZ = -sinPitch - (dy / f) * cosPitch;
      const rowOffset = y * w * 4;

      for (let x = minX; x <= maxX; x++) {
        const dx = x - halfWScreen;
        // t such that P.x = t * (dx/f) = wallX
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
        const inv = 1 - fog;

        // Wall texture: x-axis runs along wall depth, y-axis runs up height.
        const texX = Math.floor((worldY * texSize) / params.wallHeight) % texSize;
        const texY = Math.max(
          0,
          Math.min(
            texSize - 1,
            Math.floor((1 - worldZ / params.wallHeight) * texSize)
          )
        );
        const srcIdx = (texY * texSize + texX) * 4;
        const dstIdx = rowOffset + x * 4;

        buf.data[dstIdx] = Math.min(
          255,
          wallData.data[srcIdx] * fog + bg.r * inv
        );
        buf.data[dstIdx + 1] = Math.min(
          255,
          wallData.data[srcIdx + 1] * fog + bg.g * inv
        );
        buf.data[dstIdx + 2] = Math.min(
          255,
          wallData.data[srcIdx + 2] * fog + bg.b * inv
        );
        buf.data[dstIdx + 3] = 255;
      }
    }
  }
}
