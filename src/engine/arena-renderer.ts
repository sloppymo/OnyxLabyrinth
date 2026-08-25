/**
 * Dedicated 3/4 top-down arena backdrop renderer for combat scenes.
 *
 * This module draws a synthetic room (floor + side walls + back wall + void)
 * using true perspective projection: the room silhouette (where floor meets
 * side wall at each screen row) is derived by projecting the actual world-
 * space room corners (±roomWidth/2, worldDepth, 0) through the camera, so
 * near rows are wide and far rows converge toward the horizon at the same
 * rate real geometry would. Floor tile columns and wall edges share the same
 * left/right insets so they never disagree. It does not reuse the corridor
 * raycaster, so it cannot accidentally break the dungeon view.
 *
 * Deliberately imports only a type from renderer.ts (no runtime cycle).
 */

import type { LoadedTileset } from "./renderer";
import type { ArenaCamera } from "./render-math";
import {
  arenaFloorRowDistance,
  arenaOpacityForDepth,
  arenaProject,
  arenaSideWallWorldAt,
} from "./render-math";
import { ARENA_CAMERA, buildArenaCamera } from "./arena-camera";
import type {
  ArenaLandmarkStyle,
  ArenaLightingStyle,
  ArenaWaterStyle,
} from "../data/combat-backdrops";

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
  /** Near-field world depth at the bottom edge (front tile row). */
  floorNearDepth?: number;
  /** Draw a world-space-continuous stagnant-puddle overlay (Flooded Crypt theme only). */
  floorPuddles?: boolean;
  /** Quantize the existing depth-fog result into large, console-era value bands. */
  depthBands?: number;
  /** Authored water composition; supersedes the legacy random puddle carpet. */
  water?: ArenaWaterStyle;
  /** Remove the large puddles baked into the source tiles before composing water. */
  neutralizeBakedWater?: boolean;
  /** Screen-space architectural focal point painted over the projected room. */
  landmark?: ArenaLandmarkStyle;
  /** Theme-specific static light composition. */
  lighting?: ArenaLightingStyle;
  /** Optional fixed output palette applied after the complete room is painted. */
  palette?: readonly string[] | null;
}

const DEFAULTS = {
  // Camera tuple lives in arena-camera.ts (single source of truth, also
  // consumed by the sprite ground-plane contract and the tests).
  ...ARENA_CAMERA,
  voidColor: "#0e0d0a",
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
  floorNearDepth: number;
  floorPuddles: boolean;
  depthBands: number;
  water: ArenaWaterStyle;
  neutralizeBakedWater: boolean;
  landmark: ArenaLandmarkStyle;
  lighting: ArenaLightingStyle;
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
    floorNearDepth: options.floorNearDepth ?? DEFAULTS.floorNearDepth,
    floorPuddles: options.floorPuddles ?? false,
    depthBands: Math.max(0, Math.floor(options.depthBands ?? 0)),
    water: options.water ?? (options.floorPuddles ? "sluice" : "none"),
    neutralizeBakedWater: options.neutralizeBakedWater ?? false,
    landmark: options.landmark ?? "none",
    lighting: options.lighting ?? "none",
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
  drawArenaLandmark(ctx, w, h, params.landmark);
  drawArenaLighting(ctx, w, h, params.lighting);
  if (options.palette?.length) quantizeCanvasToPalette(ctx, w, h, options.palette);
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
  shade = 1,
  depthBands = 0
): void {
  writeFoggedColor(buf, dstIdx, tex.data[srcIdx], tex.data[srcIdx + 1], tex.data[srcIdx + 2], fog, bg, shade, depthBands);
}

function writeFoggedColor(
  buf: ImageData,
  dstIdx: number,
  r: number,
  g: number,
  b: number,
  fog: number,
  bg: Rgb,
  shade = 1,
  depthBands = 0
): void {
  const bandedFog = quantizeArenaUnit(fog, depthBands);
  const bandedShade = quantizeArenaUnit(Math.min(1, shade), depthBands);
  const inv = 1 - bandedFog;
  buf.data[dstIdx] = Math.min(255, r * bandedShade * bandedFog + bg.r * inv);
  buf.data[dstIdx + 1] = Math.min(255, g * bandedShade * bandedFog + bg.g * inv);
  buf.data[dstIdx + 2] = Math.min(255, b * bandedShade * bandedFog + bg.b * inv);
  buf.data[dstIdx + 3] = 255;
}

// --- World-space authored water ---------------------------------------------

export function quantizeArenaUnit(value: number, bands: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  if (bands < 2) return clamped;
  return Math.round(clamped * (bands - 1)) / (bands - 1);
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * A deliberate drainage channel flowing from the far-wall sluice toward the
 * player, plus two restrained side pools. This gives the floor one readable
 * gesture instead of repeating a large puddle stamp in every grid cell.
 */
export function sluiceWaterCoverage(
  worldX: number,
  worldY: number,
  roomDepth: number = DEFAULTS.roomDepth,
  nearDepth: number = DEFAULTS.floorNearDepth
): number {
  const progress = Math.min(1, Math.max(0, (roomDepth - worldY) / (roomDepth - nearDepth)));
  const center = -0.65 + progress * 1.25 + Math.sin(worldY * 0.62) * 0.18;
  const halfWidth = 0.72 + progress * 1.15;
  const channel = 1 - smoothstep((Math.abs(worldX - center) - halfWidth * 0.76) / (halfWidth * 0.24));

  const basin = (cx: number, cy: number, rx: number, ry: number) => {
    const dx = (worldX - cx) / rx;
    const dy = (worldY - cy) / ry;
    return 1 - smoothstep((Math.hypot(dx, dy) - 0.72) / 0.28);
  };
  const leftPool = basin(-5.25, 6.8, 2.15, 1.45) * 0.92;
  const rightPool = basin(4.75, 11.7, 1.55, 1.05) * 0.72;
  return Math.min(1, Math.max(channel, leftPool, rightPool));
}

const PUDDLE_SHALLOW: Rgb = { r: 0x3f, g: 0x60, b: 0x44 };
const PUDDLE_DEEP: Rgb = { r: 0x2c, g: 0x4a, b: 0x34 };

export function neutralizeBakedWaterColor(r: number, g: number, b: number): [number, number, number] {
  if (g - r < 10 || g - b < 5) return [r, g, b];
  const value = r * 0.25 + g * 0.58 + b * 0.17;
  return [value * 0.86, value * 0.92, value * 0.82];
}

/** Blend the authored channel into a dry base color at world (x, y). */
function applySluiceTint(worldX: number, worldY: number, coverage: number, r: number, g: number, b: number): [number, number, number] {
  if (coverage <= 0) return [r, g, b];
  const glint = Math.sin(worldX * 5.2 + worldY * 2.1) > 0.88 ? 0.12 : 0;
  const depthT = 0.42 + 0.34 * Math.min(1, worldY / DEFAULTS.roomDepth);
  const pr = PUDDLE_SHALLOW.r + (PUDDLE_DEEP.r - PUDDLE_SHALLOW.r) * depthT + glint * 35;
  const pg = PUDDLE_SHALLOW.g + (PUDDLE_DEEP.g - PUDDLE_SHALLOW.g) * depthT + glint * 42;
  const pb = PUDDLE_SHALLOW.b + (PUDDLE_DEEP.b - PUDDLE_SHALLOW.b) * depthT + glint * 24;
  const blend = 0.58 + coverage * 0.34;
  return [r + (pr - r) * blend, g + (pg - g) * blend, b + (pb - b) * blend];
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

/**
 * Screen-space room silhouette — shared by floor and walls so they never
 * disagree. Derived by projecting the true world-space room edges
 * (x = ±roomWidth/2, z = 0) at this row's floor depth through the camera, so
 * the walls converge toward the horizon at the same rate real geometry does
 * (a genuine vanishing point) instead of a hand-tuned near/far blend.
 */
function roomInsets(
  y: number,
  w: number,
  h: number,
  camera: ArenaCamera,
  params: ArenaParams
): { left: number; right: number } {
  const halfW = params.roomWidth / 2;
  const seamY = camera.horizonY;
  const worldY =
    y <= seamY
      ? params.roomDepth
      : Math.min(
          params.roomDepth,
          Math.max(params.floorNearDepth * 0.3, arenaFloorRowDistance(y, camera, h))
        );
  const left = arenaProject({ x: -halfW, y: worldY, z: 0 }, camera, w, h).x;
  const right = arenaProject({ x: halfW, y: worldY, z: 0 }, camera, w, h).x;
  return { left, right };
}

/** World-unit distance from a side wall within which the floor darkens. */
const FLOOR_AO_RANGE = 2.2;

/**
 * Floor between the silhouette edges.
 * - X: linear across the floor span at this row (exact for a fixed-depth
 *   perspective row — see roomInsets).
 * - Y: true camera-space floor depth via arenaFloorRowDistance, so rows
 *   converge toward the horizon exactly like the wall silhouette does.
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

  for (let y = startY; y < h; y++) {
    const worldY = arenaFloorRowDistance(y, camera, h);
    if (!isFinite(worldY) || worldY <= 0 || worldY > params.maxVisibleDist) continue;

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
      let r = tex.data[srcIdx];
      let g = tex.data[srcIdx + 1];
      let b = tex.data[srcIdx + 2];
      if (params.neutralizeBakedWater) [r, g, b] = neutralizeBakedWaterColor(r, g, b);
      if (params.water === "sluice") {
        const coverage = sluiceWaterCoverage(worldX, worldY, params.roomDepth, params.floorNearDepth);
        [r, g, b] = applySluiceTint(worldX, worldY, coverage, r, g, b);
      }
      writeFoggedColor(buf, rowOffset + x * 4, r, g, b, fog, bg, shade, params.depthBands);
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
      writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg, shade, params.depthBands);
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
      writeFoggedTexel(buf, rowOffset + x * 4, wallData, srcIdx, fog, bg, shade, params.depthBands);
    }
  }
}

/**
 * Side walls = the silhouette insets themselves. Every pixel is inverse-
 * projected onto its wall's vertical plane X = ±roomWidth/2 via
 * arenaSideWallWorldAt — the same rigor drawBackWall applies to the
 * Y = roomDepth plane — and the texture is sampled at the true
 * (depth-along-wall, height-on-wall) point. That is what makes brick
 * coursing compress toward the far corner and the top edge slant down
 * toward the vanishing point like real receding geometry, instead of the
 * old flat screen-space strip.
 *
 * Strip pixels whose ray passes the far corner (worldY > roomDepth) actually
 * see the back wall first, not the side wall: drawBackWall's rectangle stops
 * at the fixed far-floor span, but the wall's true screen footprint widens
 * above its base. Those pixels continue drawBackWall's own row math (with
 * its span mapping extrapolated) so back and side walls meet at the corner
 * without a void gap or a texture seam.
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
  const halfW = params.roomWidth / 2;
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
  const farSpan = Math.max(1, farRight - farLeft);
  const backFog = arenaOpacityForDepth(params.roomDepth);

  for (let y = 0; y < h; y++) {
    const { left, right } = roomInsets(y, w, h, camera, params);
    // Same pitched-ray row terms drawBackWall derives for its plane.
    const dyOverF = (h / 2 - y) / f;
    const rayY = cosPitch + dyOverF * sinPitch;
    const rayZ = -sinPitch + dyOverF * cosPitch;
    const rowOffset = y * w * 4;

    const paintStrip = (x0: number, x1: number, wallX: number) => {
      for (let x = x0; x < x1; x++) {
        const hit = arenaSideWallWorldAt(x, y, wallX, camera, w, h);
        if (!hit || hit.y <= 0) continue;

        if (hit.y <= params.roomDepth) {
          // On the side wall proper. Outside [0, wallHeight] the ray passes
          // under the base (floor territory) or over the top edge — skipping
          // those pixels is what draws the slanted top silhouette.
          const worldZ = hit.z;
          if (worldZ < 0 || worldZ > params.wallHeight) continue;
          const texY = Math.max(
            0,
            Math.min(
              texSize - 1,
              Math.floor((1 - worldZ / params.wallHeight) * texSize)
            )
          );
          // Coursing advances with true depth along the wall, on the same
          // world scale drawBackWall uses across its width.
          let texX =
            Math.floor((hit.y / params.wallHeight) * texSize) % texSize;
          if (texX < 0) texX += texSize;
          const srcIdx = (texY * texSize + texX) * 4;
          // Depth fog on the floor's own curve so the wall base darkens in
          // step with the floor row it stands on; the 0.55 floor keeps the
          // deliberate "never crush the side walls to black gutters" fix.
          const fog = Math.min(
            1,
            Math.max(0.55, arenaOpacityForDepth(hit.y) + 0.25)
          );
          const shade = 0.95 + 0.35 * (worldZ / params.wallHeight);
          writeFoggedTexel(
            buf,
            rowOffset + x * 4,
            wallData,
            srcIdx,
            fog,
            bg,
            shade,
            params.depthBands
          );
        } else {
          // Corner wedge: the ray reaches Y = roomDepth while still inside
          // the room's width, so it lands on the back wall.
          if (rayY < 1e-9) continue;
          const tBack = params.roomDepth / rayY;
          const worldZ = camera.camHeight + tBack * rayZ;
          if (worldZ < 0 || worldZ > params.wallHeight) continue;
          const worldX =
            -halfW + ((x - farLeft) / farSpan) * params.roomWidth;
          const texY = Math.max(
            0,
            Math.min(
              texSize - 1,
              Math.floor((1 - worldZ / params.wallHeight) * texSize)
            )
          );
          let texX =
            Math.floor(((worldX + halfW) / params.wallHeight) * texSize) %
            texSize;
          if (texX < 0) texX += texSize;
          const srcIdx = (texY * texSize + texX) * 4;
          const shade = 0.62 + 0.68 * (worldZ / params.wallHeight);
          writeFoggedTexel(
            buf,
            rowOffset + x * 4,
            wallData,
            srcIdx,
            backFog,
            bg,
            shade,
            params.depthBands
          );
        }
      }
    };

    // Left strip [0, left), right strip (right, w) — the exact bounds the
    // floor pass leaves unpainted, so wall and floor tile each row.
    paintStrip(0, Math.min(w, Math.ceil(left)), -halfW);
    paintStrip(Math.max(0, Math.floor(right) + 1), w, halfW);
  }
}

// --- Native-raster set dressing ---------------------------------------------

function drawArenaLandmark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  landmark: ArenaLandmarkStyle
): void {
  if (landmark !== "f1-sluice") return;
  ctx.save();
  ctx.scale(w / 256, h / 224);

  // Damp halo and shadow make the landmark read before its individual stones.
  ctx.fillStyle = "rgba(12,19,14,0.52)";
  ctx.fillRect(91, 20, 72, 67);
  ctx.fillStyle = "#080806";
  ctx.fillRect(107, 35, 42, 44);
  ctx.fillRect(102, 43, 52, 36);

  // Chunky cracked arch — deliberately asymmetric, with 2–4px native pixels.
  ctx.fillStyle = "#596954";
  ctx.fillRect(103, 30, 50, 6);
  ctx.fillRect(98, 36, 10, 38);
  ctx.fillRect(149, 36, 10, 38);
  ctx.fillStyle = "#354132";
  ctx.fillRect(108, 35, 7, 7);
  ctx.fillRect(122, 30, 5, 8);
  ctx.fillRect(141, 33, 8, 5);
  ctx.fillRect(98, 50, 9, 5);
  ctx.fillRect(151, 61, 8, 7);
  ctx.fillStyle = "#171a14";
  ctx.fillRect(116, 31, 3, 9);
  ctx.fillRect(135, 32, 3, 7);
  ctx.fillRect(101, 57, 7, 3);

  // Rusted bars and a sharp water lip.
  ctx.fillStyle = "#3f2e1d";
  for (let x = 112; x <= 144; x += 8) ctx.fillRect(x, 40, 3, 36);
  ctx.fillRect(108, 49, 42, 3);
  ctx.fillRect(108, 67, 42, 3);
  ctx.fillStyle = "#263e2d";
  ctx.fillRect(111, 73, 36, 6);
  ctx.fillStyle = "#4d8258";
  ctx.fillRect(116, 76, 27, 3);
  ctx.fillRect(121, 79, 18, 3);

  // One practical light bracket gives the composition a warm/cool dialogue.
  ctx.fillStyle = "#20170f";
  ctx.fillRect(78, 43, 14, 3);
  ctx.fillRect(80, 46, 3, 11);
  ctx.fillStyle = "#d59b3c";
  ctx.fillRect(75, 35, 8, 10);
  ctx.fillStyle = "#ffe48a";
  ctx.fillRect(78, 34, 4, 7);
  ctx.fillStyle = "#8c3030";
  ctx.fillRect(76, 43, 6, 3);
  ctx.restore();
}

function drawArenaLighting(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lighting: ArenaLightingStyle
): void {
  if (lighting !== "f1-flooded") return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const warm = ctx.createRadialGradient(w * 0.31, h * 0.19, 1, w * 0.31, h * 0.19, w * 0.32);
  warm.addColorStop(0, "rgba(213,155,60,0.32)");
  warm.addColorStop(0.45, "rgba(116,80,42,0.16)");
  warm.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h * 0.7);

  const cold = ctx.createRadialGradient(w * 0.51, h * 0.56, 2, w * 0.51, h * 0.56, w * 0.42);
  cold.addColorStop(0, "rgba(77,130,88,0.22)");
  cold.addColorStop(0.58, "rgba(41,75,52,0.10)");
  cold.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cold;
  ctx.fillRect(0, h * 0.25, w, h * 0.75);
  ctx.restore();

  // Heavy corner shapes preserve silhouette and keep the center playable.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(7,8,6,0.22)";
  ctx.fillRect(0, 0, Math.round(w * 0.09), h);
  ctx.fillRect(Math.round(w * 0.91), 0, Math.ceil(w * 0.09), h);
  ctx.fillStyle = "rgba(7,8,6,0.14)";
  ctx.fillRect(0, Math.round(h * 0.91), w, Math.ceil(h * 0.09));
  ctx.restore();
}

function quantizeCanvasToPalette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: readonly string[]
): void {
  const colors = palette.map(parseBg);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const cache = new Map<number, Rgb>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let closest = cache.get(key);
    if (!closest) {
      let best = colors[0];
      let bestDist = Number.POSITIVE_INFINITY;
      for (const color of colors) {
        const dr = data[i] - color.r;
        const dg = data[i + 1] - color.g;
        const db = data[i + 2] - color.b;
        const dist = dr * dr * 0.26 + dg * dg * 0.55 + db * db * 0.19;
        if (dist < bestDist) {
          bestDist = dist;
          best = color;
        }
      }
      closest = best;
      cache.set(key, closest);
    }
    data[i] = closest.r;
    data[i + 1] = closest.g;
    data[i + 2] = closest.b;
  }
  ctx.putImageData(image, 0, 0);
}
