/**
 * Corridor renderer for OnyxLabyrinth.
 *
 * This module draws the first-person dungeon view using a 2D canvas raycaster.
 * One ray is cast per screen column to find the nearest wall, and floor/ceiling
 * are filled with perspective-correct casting. Open grid edges are treated as
 * empty space, so side-passage back walls render automatically.
 *
 * Wall strips are sampled from a repeated source canvas and drawn with
 * `drawImage`. Floor and ceiling are assembled row-by-row via `ImageData` and
 * `putImageData`, then walls are rendered on top so they occlude the distant
 * floor/ceiling correctly. Each floor of the campaign has its own tileset
 * (wall/floorA/floorB/ceiling); all sets are prepared by loadTextures() and
 * cached in `tilesetCache`, and render() selects by `state.floor.id`.
 */

import type { GameState, Grid } from "../types";
import type { EdgeType, TileFeature } from "../types";
import { edgeInDirection } from "../game/dungeon";
import f1WallUrl from "../assets/f1_wall_256.png";
import f1FloorAUrl from "../assets/f1_floor_a_256.png";
import f1FloorBUrl from "../assets/f1_floor_b_256.png";
import f1CeilingUrl from "../assets/f1_ceiling_256.png";
import f2WallUrl from "../assets/f2_wall_256.png";
import f2FloorAUrl from "../assets/f2_floor_a_256.png";
import f2FloorBUrl from "../assets/f2_floor_b_256.png";
import f2CeilingUrl from "../assets/f2_ceiling_256.png";
import f3WallUrl from "../assets/f3_wall_256.png";
import f3FloorAUrl from "../assets/f3_floor_a_256.png";
import f3FloorBUrl from "../assets/f3_floor_b_256.png";
import f3CeilingUrl from "../assets/f3_ceiling_256.png";
import {
  computeLineHeight,
  opacityForDepth,
  glowBlurForDepth,
  strokeColorForDepth,
  RenderCameraAnimator,
} from "./render-math";
import type { RenderCamera } from "./render-math";

// --- Palette (Section 12.1 of the design doc: distance-based color shift) ---
const PALETTE = {
  bg: "#0e0d0a",
  amber: "#e0a458",
  warmWhite: "#f5f0e6",
  wallFill: { r: 61, g: 50, b: 40 },
  floorFill: { r: 42, g: 34, b: 26 },
  ceilingFill: { r: 31, g: 27, b: 22 },
  doorMarker: "#e0a458",
  lockedMarker: "#c44",
  doorFill: { r: 45, g: 35, b: 28 },
  feature: "#e0a458",
  featureDark: "#8a6a38",
};

// Precomputed PALETTE.bg RGB values for fog blending. Distant surfaces fade
// toward this warm dark amber instead of pure black, giving the depth fog an
// atmospheric tint that matches the background.
const BG_R = parseInt(PALETTE.bg.slice(1, 3), 16);
const BG_G = parseInt(PALETTE.bg.slice(3, 5), 16);
const BG_B = parseInt(PALETTE.bg.slice(5, 7), 16);

// Centralized renderer tuning. Keep magic numbers here so art passes and
// debugging don't require hunting through the draw loop.
const RENDER_CONFIG = {
  maxDepth: 4,
  darknessDepth: 1,
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
  fillOpacityMultiplier: 0.45,
  glowBlurNear: 7,
  glowBlurFar: 2,
  // The edge-glow pass draws an amber line on every 1px strip. At full
  // strength that repaints flat walls amber and hides the per-floor wall art,
  // so flat-wall strips are scaled down to a warm wash; strips at a depth
  // discontinuity (corners, doorways, passage edges) keep full strength so
  // the signature glow lines still trace the geometry.
  glowWashAlphaScale: 0.22,
  // Minimum perpWallDist jump between adjacent strips that counts as a
  // depth discontinuity for full-strength glow lines.
  glowEdgeDepthDelta: 0.12,
  scanlineOpacity: 0.10,
  scanlineSpacing: 3,
  // Floor/ceiling are darker base textures than the wall; brighten them and use
  // a darkening overlay so the pixel-art detail remains visible while still
  // fading into the distance.
  floorDarkenMultiplier: 0.55,
  ceilingDarkenMultiplier: 0.3,
  // The two floor tiles get different brightness levels so the grid-coord
  // checkerboard is readable without distorting hue. The per-floor campaign
  // tilesets are authored at mid luminance (means ~50-90, vs ~9-45 for the
  // legacy tiles), so these factors are close to 1.0 — large factors clip
  // mid-bright art to white before the darken multipliers pull it back.
  floorABrightnessFactor: 1.15,
  floorBBrightnessFactor: 0.85,
  ceilingBrightnessFactor: 1.4,
  // Wall texture brightness/contrast. Campaign wall tiles are authored at
  // their target luminance, so no brighten is needed; the contrast stretch
  // below still deepens the mortar/shadow detail.
  wallBrightnessFactor: 1.0,
  // Contrast stretch applied to all textures after brightness adjustment.
  // Values >1 push pixels away from the midpoint (128), expanding dynamic range.
  wallContrastFactor: 1.25,
  floorAContrastFactor: 1.15,
  floorBContrastFactor: 1.15,
  ceilingContrastFactor: 1.15,
  // Raycast renderer tunables.
  raycastFov: Math.PI / 3,          // 60 degrees
  raycastStripWidth: 1,             // one ray per screen column
  wallRepeatsX: 1,                  // horizontal repeats per wall face
  // Walls are one grid cell tall; the per-ray height scaling below already
  // handles perspective (nearer walls draw taller). Baking multiple vertical
  // copies here and stretching that whole strip into one wall's screen
  // height just squashes/stretches the tile count incorrectly with distance.
  // If stacked tiles are wanted on tall walls, sample texY per screen row
  // instead of pre-baking a repeated strip.
  wallRepeatsY: 1,
  floorRepeats: 1,                  // texture repeats per floor grid tile
  ceilingRepeats: 1,                // texture repeats per ceiling grid tile
  darknessMaxDist: 1.5,
  // Smooth movement interpolation. When the player moves or turns, the render
  // camera lerps from the old position to the new one over these durations.
  // This makes the grid-based movement feel like smooth first-person motion
  // instead of instant snapping. Set to 0 to disable (instant snap).
  moveAnimDuration: 150,            // ms — forward/back step
  turnAnimDuration: 100,            // ms — 90-degree turn
  // If the player jumps more than this many tiles in one state change
  // (teleporter, stairs, chute), snap instantly instead of sliding.
  teleportSnapThreshold: 1.5,
  // Torch flicker: a subtle warm overlay that oscillates in intensity,
  // giving the corridor a living, firelit feel. The period is ~2s; the
  // amplitude is kept small so it doesn't distract from gameplay.
  torchFlickerPeriod: 2000,       // ms for one full sine cycle
  torchFlickerAmplitude: 0.04,    // ±4% overlay alpha
  torchFlickerBase: 0.02,         // base overlay alpha (always present)
  // Head bob: vertical screen-space offset applied to the corridor view
  // during movement steps. A single sine hump synced to the step animation
  // adds weight to walking without touching perspective math.
  headBobAmplitude: 2.5,          // px — positive = head dips at mid-step
} as const;

/** Raycast hit data for a single ray. */
interface RayHit {
  side: "x" | "y";                  // "x" = x-step (crossed a vertical grid line / E-W-facing wall); "y" = y-step (crossed a horizontal grid line / N-S-facing wall)
  mapX: number;                     // grid cell hit
  mapY: number;
  perpWallDist: number;             // perpendicular distance, no fisheye
  wallX: number;                    // exact hit position along the wall face (0..1); for `y` hits this is fractional world x, for `x` hits fractional world y
  edge: EdgeType;                   // "wall" | "door" | "locked" | "open"
}

interface TextureSet {
  wall: HTMLImageElement | null;
  floorA: HTMLCanvasElement | null;
  floorB: HTMLCanvasElement | null;
  ceiling: HTMLCanvasElement | null;
  floorARepeated: HTMLCanvasElement | null;
  floorBRepeated: HTMLCanvasElement | null;
  ceilingRepeated: HTMLCanvasElement | null;
  floorAData: ImageData | null;
  floorBData: ImageData | null;
  ceilingData: ImageData | null;
}

/** One fully prepared tileset (adjusted textures + pre-repeated wall). */
interface LoadedTileset {
  set: TextureSet;
  repeatedWall: HTMLCanvasElement | null;
}

/** Per-floor texture URLs. Each floor of the campaign has its own tileset. */
const TILESET_URLS: Record<
  number,
  { wall: string; floorA: string; floorB: string; ceiling: string }
> = {
  1: { wall: f1WallUrl, floorA: f1FloorAUrl, floorB: f1FloorBUrl, ceiling: f1CeilingUrl },
  2: { wall: f2WallUrl, floorA: f2FloorAUrl, floorB: f2FloorBUrl, ceiling: f2CeilingUrl },
  3: { wall: f3WallUrl, floorA: f3FloorAUrl, floorB: f3FloorBUrl, ceiling: f3CeilingUrl },
};
const FALLBACK_TILESET_ID = 1;

// Loaded tilesets keyed by floor id. Populated once by loadTextures();
// render() picks the active set from state.floor.id each frame. (Cached
// entries hold images/canvases — never CanvasPattern objects, which die
// when the target canvas is resized.)
const tilesetCache = new Map<number, LoadedTileset>();

// Reusable per-frame buffers (avoid allocation in the hot render loop).
let hitsBuffer: (RayHit | null)[] = [];
let seenFeatureCellsBuffer = new Set<string>();
let lastVignetteW = 0;
let lastVignetteH = 0;
let cachedVignetteGradient: CanvasGradient | null = null;
let cachedDarknessVignetteGradient: CanvasGradient | null = null;

// Reusable floor/ceiling ImageData buffer. Allocated once at the first
// render and resized only when the canvas dimensions change. This avoids
// creating ~2MB of pixel data every frame (768×672×4 bytes).
let floorCeilBuf: ImageData | null = null;
let floorCeilBufW = 0;
let floorCeilBufH = 0;
// Pre-computed little-endian RGBA packed value for the bg color, used for
// fast Uint32Array.fill() pre-fill of the buffer.
const BG_RGBA_PACKED =
  (255 << 24) | (BG_B << 16) | (BG_G << 8) | BG_R;

// --- Smooth movement interpolation -----------------------------------------
// The render camera lerps from the previous grid position to the new one
// over a short duration, producing smooth first-person motion instead of
// instant grid snapping. This state is module-level (not in GameState) because
// it is purely a render concern — game logic always sees integer grid coords.
const cameraAnim = new RenderCameraAnimator();

/**
 * Update the display camera toward the actual player position and return the
 * RenderCamera to use for this frame's rendering.
 */
function updateRenderCamera(state: GameState): RenderCamera {
  cameraAnim.update(
    state.player.x,
    state.player.y,
    state.player.facing,
    performance.now()
  );
  return cameraAnim.getCamera(RENDER_CONFIG.raycastFov);
}

/** True if the render camera is currently tweening toward a target. */
export function isRenderCameraAnimating(): boolean {
  return cameraAnim.isAnimating();
}

/** Reset the render camera instantly to the given grid state. */
export function resetRenderCamera(
  x: number,
  y: number,
  facing: number
): void {
  cameraAnim.reset(x, y, facing);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load texture: ${src}`));
    img.src = src;
  });
}

function adjustTextureImage(
  img: HTMLImageElement,
  brightnessFactor: number,
  contrastFactor: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      let v = Math.min(255, data[i + j] * brightnessFactor);
      v = (v - 128) * contrastFactor + 128;
      data[i + j] = Math.max(0, Math.min(255, v));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function prepareRepeatedTexture(
  img: HTMLImageElement | HTMLCanvasElement,
  repeatsX: number,
  repeatsY: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width * repeatsX;
  c.height = img.height * repeatsY;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < repeatsY; y++) {
    for (let x = 0; x < repeatsX; x++) {
      ctx.drawImage(img, x * img.width, y * img.height);
    }
  }
  return c;
}

/** Load and prepare every floor's tileset. Safe to call more than once. */
export function loadTextures(): Promise<void> {
  const pending = Object.entries(TILESET_URLS)
    .filter(([id]) => !tilesetCache.has(Number(id)))
    .map(([id, urls]) =>
      loadTileset(urls).then((tileset) => {
        tilesetCache.set(Number(id), tileset);
      })
    );
  return Promise.all(pending).then(() => {});
}

function loadTileset(urls: {
  wall: string;
  floorA: string;
  floorB: string;
  ceiling: string;
}): Promise<LoadedTileset> {
  return Promise.all([
    loadImage(urls.wall).catch(() => null),
    loadImage(urls.floorA).catch(() => null),
    loadImage(urls.floorB).catch(() => null),
    loadImage(urls.ceiling).catch(() => null),
  ]).then(([wall, floorAImg, floorBImg, ceilingImg]) => {
    const wallAdjusted = wall
      ? adjustTextureImage(wall, RENDER_CONFIG.wallBrightnessFactor, RENDER_CONFIG.wallContrastFactor)
      : null;
    const floorABright = floorAImg
      ? adjustTextureImage(floorAImg, RENDER_CONFIG.floorABrightnessFactor, RENDER_CONFIG.floorAContrastFactor)
      : null;
    const floorBBright = floorBImg
      ? adjustTextureImage(floorBImg, RENDER_CONFIG.floorBBrightnessFactor, RENDER_CONFIG.floorBContrastFactor)
      : null;
    const ceilingBright = ceilingImg
      ? adjustTextureImage(ceilingImg, RENDER_CONFIG.ceilingBrightnessFactor, RENDER_CONFIG.ceilingContrastFactor)
      : null;

    const floorARepeated = floorABright ? prepareRepeatedTexture(floorABright, 1, 1) : null;
    const floorBRepeated = floorBBright ? prepareRepeatedTexture(floorBBright, 1, 1) : null;
    const ceilingRepeated = ceilingBright ? prepareRepeatedTexture(ceilingBright, 1, 1) : null;

    const set: TextureSet = {
      wall,
      floorA: floorABright,
      floorB: floorBBright,
      ceiling: ceilingBright,
      floorARepeated,
      floorBRepeated,
      ceilingRepeated,
      floorAData: floorARepeated
        ? floorARepeated.getContext("2d")!.getImageData(0, 0, floorARepeated.width, floorARepeated.height)
        : null,
      floorBData: floorBRepeated
        ? floorBRepeated.getContext("2d")!.getImageData(0, 0, floorBRepeated.width, floorBRepeated.height)
        : null,
      ceilingData: ceilingRepeated
        ? ceilingRepeated.getContext("2d")!.getImageData(0, 0, ceilingRepeated.width, ceilingRepeated.height)
        : null,
    };
    const repeatedWall = wallAdjusted
      ? prepareRepeatedTexture(wallAdjusted, RENDER_CONFIG.wallRepeatsX, RENDER_CONFIG.wallRepeatsY)
      : null;
    return { set, repeatedWall };
  });
}

function rgba(
  color: { r: number; g: number; b: number },
  alpha: number
): string {
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, alpha)})`;
}

/** Cast a ray through the grid using DDA and return the first non-open wall hit.
 *  Takes float world coordinates so it works with the interpolated render camera. */
function castRay(
  grid: Grid,
  playerWX: number,
  playerWY: number,
  rayDirX: number,
  rayDirY: number,
  maxDist: number
): RayHit | null {
  if (rayDirX === 0 && rayDirY === 0) return null;

  let mapX = Math.floor(playerWX);
  let mapY = Math.floor(playerWY);

  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);

  let stepX: number, sideDistX: number;
  let stepY: number, sideDistY: number;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (playerWX - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - playerWX) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (playerWY - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - playerWY) * deltaDistY;
  }

  let side: "x" | "y" = "y";

  while (true) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = "x";
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = "y";
    }

    if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) {
      return null;
    }

    const cell = grid[mapY][mapX];
    // Determine which edge of this cell the ray crossed.
    const dir = side === "y"
      ? (stepY > 0 ? 0 : 2)   // N or S edge
      : (stepX > 0 ? 3 : 1);  // W or E edge
    const edge = edgeInDirection(cell, dir);

    if (edge !== "open") {
      const perpWallDist = side === "y"
        ? (mapY - playerWY + (1 - stepY) / 2) / rayDirY
        : (mapX - playerWX + (1 - stepX) / 2) / rayDirX;

      if (perpWallDist > maxDist) return null;

      let wallX: number;
      if (side === "y") {
        wallX = playerWX + perpWallDist * rayDirX;
      } else {
        wallX = playerWY + perpWallDist * rayDirY;
      }
      wallX -= Math.floor(wallX);

      return { side, mapX, mapY, perpWallDist, wallX, edge };
    }
  }
}

/** Draw a tile feature icon on the floor at the player's current position. */
function drawFloorFeature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  feature: TileFeature,
  inDarkness: boolean
): void {
  ctx.save();
  const cx = w / 2;
  const cy = h / 2 + 30; // slightly below center, on the floor
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;
  drawFeatureGlyph(ctx, cx, cy, feature, color, 16);
  ctx.restore();
}

/** Draw a tile feature glyph at the bottom-center of a raycast wall strip. */
function drawDepthFeature(
  ctx: CanvasRenderingContext2D,
  hit: RayHit,
  screenX: number,
  stripWidth: number,
  feature: TileFeature,
  inDarkness: boolean
): void {
  ctx.save();
  const h = ctx.canvas.height;
  const lineHeight = computeLineHeight(h, hit.perpWallDist);
  const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));
  const cy = drawEnd + Math.max(4, lineHeight / 8);
  const size = Math.max(6, Math.min(24, lineHeight / 4));
  ctx.globalAlpha = opacityForDepth(hit.perpWallDist);
  drawFeatureGlyph(ctx, screenX + stripWidth / 2, cy, feature, inDarkness ? PALETTE.featureDark : PALETTE.feature, size);
  ctx.restore();
}

/** Draw a feature glyph (text icon) at the given position. */
function drawFeatureGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  feature: TileFeature,
  color: string,
  size: number
): void {
  ctx.save();
  const glyph = featureGlyph(feature);
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px "FF36", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
}

/** Map a tile feature to a display glyph. */
function featureGlyph(feature: TileFeature): string {
  switch (feature) {
    case "stairs_up":
      return "↑";
    case "stairs_down":
      return "↓";
    case "teleporter":
      return "✦";
    case "chute":
      return "»";
    case "darkness":
      return "◐";
    case "treasure":
      return "$";
    case "antimagic":
      return "∅";
    case "water":
      return "≈";
    case "npc":
      return "&";
    default:
      return "?";
  }
}

/**
 * Perspective-correct floor + ceiling casting, merged into a single
 * ImageData buffer and uploaded with one putImageData call.
 *
 * Previously this was two separate functions each calling putImageData once
 * per screen row (~650 calls/frame). Building one full-screen buffer and
 * uploading once eliminates the per-row allocation and GPU upload overhead.
 *
 * Floor rows are below the horizon (y > h/2), ceiling rows are above (y < h/2).
 * The horizon row itself is filled with the background color. Rows beyond
 * maxDist are also filled with background, since the raycaster leaves them
 * empty and the walls (drawn after) will occlude most of them anyway.
 */
function drawFloorCeilingCast(
  ctx: CanvasRenderingContext2D,
  cam: RenderCamera,
  inDarkness: boolean,
  textures: TextureSet,
  bobY: number
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const { x: camX, y: camY, dirX, dirY, planeX, planeY } = cam;
  const maxDist = inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const ceilImg = textures.ceilingData;
  const floorA = textures.floorAData;
  const floorB = textures.floorBData;

  // Reuse a single ImageData buffer across frames; only reallocate if the
  // canvas dimensions changed. This avoids ~2MB of per-frame GC pressure.
  if (!floorCeilBuf || floorCeilBufW !== w || floorCeilBufH !== h) {
    floorCeilBuf = ctx.createImageData(w, h);
    floorCeilBufW = w;
    floorCeilBufH = h;
  }
  const buf = floorCeilBuf;
  const data = buf.data;
  const halfH = h / 2;
  const horizonY = Math.floor(halfH);

  // Pre-fill the entire buffer with bg color using a fast Uint32 fill.
  // The packed value is little-endian RGBA; this is correct on all common
  // platforms (x86, ARM). The fallback byte loop is kept for big-endian,
  // though such platforms are virtually nonexistent in browsers.
  const u32 = new Uint32Array(data.buffer);
  u32.fill(BG_RGBA_PACKED);

  // --- Ceiling rows (0 .. horizonY - 1) ---
  if (ceilImg) {
    const texSize = ceilImg.width;
    for (let y = 0; y < horizonY; y++) {
      const rowDistance = halfH / (halfH - y);
      if (rowDistance > maxDist) continue;

      const stepX = rowDistance * ((planeX * 2) / w);
      const stepY = rowDistance * ((planeY * 2) / w);
      let worldX = camX + 0.5 + rowDistance * (dirX - planeX);
      let worldY = camY + 0.5 + rowDistance * (dirY - planeY);
      const fog = opacityForDepth(rowDistance);
      const rowOffset = y * w * 4;

      for (let x = 0; x < w; x++) {
        const gx = worldX | 0;
        const gy = worldY | 0;
        const texX = ((worldX - gx) * texSize | 0) % texSize;
        const texY = ((worldY - gy) * texSize | 0) % texSize;
        const srcIdx = (texY * texSize + texX) * 4;
        const dstIdx = rowOffset + x * 4;
        // Fog: lerp toward bg color instead of fading to black.
        const inv = 1 - fog;
        data[dstIdx] = Math.min(255, ceilImg.data[srcIdx] * fog + BG_R * inv);
        data[dstIdx + 1] = Math.min(255, ceilImg.data[srcIdx + 1] * fog + BG_G * inv);
        data[dstIdx + 2] = Math.min(255, ceilImg.data[srcIdx + 2] * fog + BG_B * inv);
        // alpha already 255 from pre-fill

        worldX += stepX;
        worldY += stepY;
      }
    }
  }

  // --- Floor rows (horizonY + 1 .. h - 1) ---
  for (let y = horizonY + 1; y < h; y++) {
    const rowDistance = halfH / (y - halfH);
    if (rowDistance > maxDist) continue;

    const stepX = rowDistance * ((planeX * 2) / w);
    const stepY = rowDistance * ((planeY * 2) / w);
    let worldX = camX + 0.5 + rowDistance * (dirX - planeX);
    let worldY = camY + 0.5 + rowDistance * (dirY - planeY);
    const fog = opacityForDepth(rowDistance);
    const rowOffset = y * w * 4;

    for (let x = 0; x < w; x++) {
      const gx = worldX | 0;
      const gy = worldY | 0;
      const tex = (gx + gy) % 2 === 0 ? floorA : floorB;
      if (tex) {
        const texSize = tex.width;
        const texX = ((worldX - gx) * texSize | 0) % texSize;
        const texY = ((worldY - gy) * texSize | 0) % texSize;
        const srcIdx = (texY * texSize + texX) * 4;
        const dstIdx = rowOffset + x * 4;
        // Fog: lerp toward bg color instead of fading to black.
        const inv = 1 - fog;
        data[dstIdx] = Math.min(255, tex.data[srcIdx] * fog + BG_R * inv);
        data[dstIdx + 1] = Math.min(255, tex.data[srcIdx + 1] * fog + BG_G * inv);
        data[dstIdx + 2] = Math.min(255, tex.data[srcIdx + 2] * fog + BG_B * inv);
        // alpha already 255 from pre-fill
      }
      worldX += stepX;
      worldY += stepY;
    }
  }

  ctx.putImageData(buf, 0, bobY);
}

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Disable bilinear smoothing on the main context so wall strips drawn via
  // drawImage stay crisp pixel-art instead of blurring/softening. Smoothing
  // is a persistent context property, so setting it once here (rather than
  // per drawImage call) is sufficient.
  ctx.imageSmoothingEnabled = false;

  // Compute the interpolated render camera (smooth movement).
  const cam = updateRenderCamera(state);

  // Head bob: a subtle screen-space vertical offset synced to the movement
  // animation. Rounded to integer pixels because putImageData requires integer
  // coordinates, and the world-space draw passes use the same rounded offset
  // so walls/features stay aligned with the floor/ceiling image.
  const bobY = Math.round(
    cameraAnim.getMoveBob(performance.now(), RENDER_CONFIG.headBobAmplitude)
  );

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  // Pick the active tileset for the current floor (fallback covers debug
  // floors or ids without art so the corridor never renders untextured).
  const tileset =
    tilesetCache.get(state.floor.id) ?? tilesetCache.get(FALLBACK_TILESET_ID) ?? null;
  const textures = tileset ? tileset.set : null;

  // --- Ceiling and floor casting (single batched upload) ---
  if (textures) {
    drawFloorCeilingCast(ctx, cam, state.inDarkness, textures, bobY);
  }

  // --- Torch flicker overlay ---
  // A subtle warm overlay that breathes with a slow sine wave, adding life
  // to the corridor. Suppressed in darkness zones (where vision is limited).
  if (!state.inDarkness) {
    drawTorchFlicker(ctx, w, h);
  }

  // --- World-space drawing pass (walls, edge glow, floor feature) ---
  // All world elements share the same head-bob offset so they remain aligned
  // with the shifted floor/ceiling image. Post-processing overlays (vignette,
  // scanlines) are drawn after the restore and stay fixed to the screen.
  ctx.save();
  ctx.translate(0, bobY);

  // --- Raycast wall strip pass ---
  const { dirX, dirY, planeX, planeY } = cam;
  const maxDist = state.inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const repeatedWall = tileset ? tileset.repeatedWall : null;

  const stripWidth = RENDER_CONFIG.raycastStripWidth;
  const hitCount = Math.ceil(w / stripWidth);
  // Reuse the hits buffer across frames; only reallocate if the canvas grew.
  if (hitsBuffer.length < hitCount) {
    hitsBuffer = new Array(hitCount).fill(null);
  } else {
    hitsBuffer.fill(null, 0, hitCount);
  }
  const hits = hitsBuffer;
  seenFeatureCellsBuffer.clear();
  const seenFeatureCells = seenFeatureCellsBuffer;

  ctx.save();
  for (let i = 0; i < hits.length; i++) {
    const x = i * stripWidth;
    const cameraX = (2 * x) / w - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    const hit = castRay(state.floor.grid, cam.x + 0.5, cam.y + 0.5, rayDirX, rayDirY, maxDist);
    hits[i] = hit;
    if (!hit) continue;

    const lineHeight = computeLineHeight(h, hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    // Tile feature on this cell (drawn once per visible cell, excluding the
    // player's current tile, which is rendered at depth 0 below).
    if (hit.mapX !== state.player.x || hit.mapY !== state.player.y) {
      const cell = state.floor.grid[hit.mapY]?.[hit.mapX];
      if (cell?.tile) {
        const key = `${hit.mapX},${hit.mapY}`;
        if (!seenFeatureCells.has(key)) {
          seenFeatureCells.add(key);
          drawDepthFeature(ctx, hit, x, stripWidth, cell.tile, state.inDarkness);
        }
      }
    }

    const fog = opacityForDepth(hit.perpWallDist);

    if (repeatedWall) {
      let texX = Math.floor(hit.wallX * repeatedWall.width);
      if (
        (hit.side === "x" && rayDirX > 0) ||
        (hit.side === "y" && rayDirY < 0)
      ) {
        texX = repeatedWall.width - texX - 1;
      }

      ctx.globalAlpha = fog;
      ctx.drawImage(
        repeatedWall,
        texX,
        0,
        1,
        repeatedWall.height,
        x,
        drawStart,
        stripWidth,
        drawEnd - drawStart + 1
      );
      ctx.globalAlpha = 1.0;
    } else {
      ctx.fillStyle = rgba(
        PALETTE.wallFill,
        fog * RENDER_CONFIG.fillOpacityMultiplier
      );
      ctx.fillRect(
        x,
        drawStart,
        stripWidth,
        drawEnd - drawStart + 1
      );
    }

    if (hit.edge === "door" || hit.edge === "locked") {
      const isLocked = hit.edge === "locked";
      const markerColor = isLocked ? PALETTE.lockedMarker : PALETTE.doorMarker;

      // Darken the door surface so it reads as a distinct wooden/metal panel
      // rather than a continuation of the surrounding wall.
      ctx.fillStyle = rgba(PALETTE.doorFill, fog * 0.35);
      ctx.fillRect(x, drawStart, stripWidth, drawEnd - drawStart + 1);

      // Center seam and horizontal panel crossbars make the door recognizable
      // even when it fills the entire viewport at point-blank range.
      ctx.fillStyle = markerColor;
      ctx.globalAlpha = fog;
      const markerX = Math.floor(x + stripWidth / 2);
      ctx.fillRect(markerX, drawStart, 1, drawEnd - drawStart + 1);
      const panelY1 = Math.floor(drawStart + (drawEnd - drawStart) * 0.33);
      const panelY2 = Math.floor(drawStart + (drawEnd - drawStart) * 0.67);
      ctx.fillRect(x, panelY1, stripWidth, 1);
      ctx.fillRect(x, panelY2, stripWidth, 1);
      ctx.globalAlpha = 1.0;

      if (isLocked) {
        ctx.strokeStyle = PALETTE.lockedMarker;
        ctx.lineWidth = 1;
        const cx = x + stripWidth / 2;
        const cy = (drawStart + drawEnd) / 2;
        const markerSize = Math.max(2, lineHeight / 8);
        ctx.globalAlpha = fog;
        ctx.beginPath();
        ctx.moveTo(cx - markerSize / 2, cy - markerSize / 2);
        ctx.lineTo(cx + markerSize / 2, cy + markerSize / 2);
        ctx.moveTo(cx + markerSize / 2, cy - markerSize / 2);
        ctx.lineTo(cx - markerSize / 2, cy + markerSize / 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
  }
  ctx.restore();

  // --- Amber edge-glow pass (batched) ---
  // Group hits by depth bucket so we can batch all lines at the same depth
  // into one Path2D + stroke call, avoiding per-strip shadowBlur state changes.
  // The glow is drawn as a 1px translucent amber line on the edge of each strip
  // that faces the camera. We use 4 depth buckets; within each bucket all lines
  // share the same stroke color and shadowBlur.
  const GLOW_BUCKETS = 4;
  const glowEdgePaths: Path2D[] = [];
  const glowWashPaths: Path2D[] = [];
  for (let b = 0; b < GLOW_BUCKETS; b++) {
    glowEdgePaths.push(new Path2D());
    glowWashPaths.push(new Path2D());
  }
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (!hit) continue;

    const x = i * stripWidth;
    const lineHeight = computeLineHeight(h, hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    // Draw the glow on the edge of the strip that faces the camera:
    // x-step hits (E/W-facing walls) use the left edge; y-step hits
    // (N/S-facing walls) use the right edge.
    const gx = hit.side === "x" ? x : x + stripWidth;

    // A strip is an "edge" when the wall geometry breaks against a neighbor
    // strip: a depth jump, a face-orientation change, or open sky beside it.
    // Edges keep the full glow line; flat-wall strips get the scaled wash so
    // the wall texture stays readable underneath.
    const prev = i > 0 ? hits[i - 1] : null;
    const next = i < hits.length - 1 ? hits[i + 1] : null;
    const isEdge =
      !prev ||
      !next ||
      prev.side !== hit.side ||
      next.side !== hit.side ||
      Math.abs(prev.perpWallDist - hit.perpWallDist) > RENDER_CONFIG.glowEdgeDepthDelta ||
      Math.abs(next.perpWallDist - hit.perpWallDist) > RENDER_CONFIG.glowEdgeDepthDelta;

    const bucket = Math.min(GLOW_BUCKETS - 1, Math.floor(hit.perpWallDist));
    const path = isEdge ? glowEdgePaths[bucket] : glowWashPaths[bucket];
    path.moveTo(gx, drawStart);
    path.lineTo(gx, drawEnd);
  }
  ctx.save();
  ctx.lineWidth = 1;
  ctx.shadowColor = PALETTE.amber;
  for (let b = 0; b < GLOW_BUCKETS; b++) {
    const depth = b + 0.5; // bucket center
    ctx.strokeStyle = strokeColorForDepth(depth);
    ctx.shadowBlur = glowBlurForDepth(depth);
    ctx.stroke(glowEdgePaths[b]);
    ctx.globalAlpha = RENDER_CONFIG.glowWashAlphaScale;
    ctx.stroke(glowWashPaths[b]);
    ctx.globalAlpha = 1.0;
  }
  ctx.restore();

  // Draw tile feature at the player's feet (depth 0).
  const currentCell = state.floor.grid[state.player.y]?.[state.player.x];
  if (currentCell?.tile) {
    drawFloorFeature(ctx, w, h, currentCell.tile, state.inDarkness);
  }

  // Restore from the head-bob translate before drawing screen-space overlays.
  ctx.restore();

  // Global vignette: focuses attention on the corridor and softens edges.
  drawVignette(ctx, w, h, 1.0);

  // Subtle CRT scanline texture.
  drawScanlines(ctx, w, h);

  // Extra darkness vignette when in a darkness zone (design doc §6.2).
  if (state.inDarkness) {
    drawVignette(ctx, w, h, 1.35);
  }
}

/** Darken the corners/edges with a radial gradient overlay. */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number = 1.0
): void {
  const isNormal = strength === 1.0;
  const isDarkness = strength === 1.35;
  if (w !== lastVignetteW || h !== lastVignetteH) {
    cachedVignetteGradient = null;
    cachedDarknessVignetteGradient = null;
    lastVignetteW = w;
    lastVignetteH = h;
  }
  let grad: CanvasGradient | null = null;
  if (isNormal) grad = cachedVignetteGradient;
  else if (isDarkness) grad = cachedDarknessVignetteGradient;

  if (!grad) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) / 2;
    grad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.55, `rgba(0,0,0,${0.28 * strength})`);
    grad.addColorStop(1, `rgba(0,0,0,${0.65 * strength})`);
    if (isNormal) cachedVignetteGradient = grad;
    else if (isDarkness) cachedDarknessVignetteGradient = grad;
  }
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Subtle torch flicker: a warm amber overlay whose intensity oscillates with
 * a slow sine wave (~2s period). The overlay is centered on the screen and
 * fades toward the edges so it reads as ambient firelight rather than a flat
 * tint. The amplitude is small (±4%) so it adds life without distracting.
 */
function drawTorchFlicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const now = performance.now();
  const phase = (now / RENDER_CONFIG.torchFlickerPeriod) * Math.PI * 2;
  const sine = Math.sin(phase);
  const noise = Math.sin(phase * 2.7) * 0.3;
  const alpha = RENDER_CONFIG.torchFlickerBase +
    RENDER_CONFIG.torchFlickerAmplitude * (sine * 0.7 + noise * 0.3);
  if (alpha <= 0) return;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, `rgba(224,164,88,${alpha})`);
  grad.addColorStop(0.6, `rgba(224,164,88,${alpha * 0.3})`);
  grad.addColorStop(1, "rgba(224,164,88,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Cached scanline pattern canvas. Created once and reused via createPattern. */
let scanlinePatternCanvas: HTMLCanvasElement | null = null;
let scanlinePattern: CanvasPattern | null = null;

/** Subtle horizontal scanline texture across the whole viewport.
 *  Uses a cached repeating pattern instead of per-line fillRect calls. */
function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  if (!scanlinePatternCanvas) {
    scanlinePatternCanvas = document.createElement("canvas");
    scanlinePatternCanvas.width = 1;
    scanlinePatternCanvas.height = RENDER_CONFIG.scanlineSpacing;
    const sctx = scanlinePatternCanvas.getContext("2d")!;
    sctx.fillStyle = `rgba(0,0,0,${RENDER_CONFIG.scanlineOpacity})`;
    sctx.fillRect(0, 0, 1, 1);
  }
  if (!scanlinePattern) {
    scanlinePattern = ctx.createPattern(scanlinePatternCanvas, "repeat");
  }
  if (scanlinePattern) {
    ctx.save();
    ctx.fillStyle = scanlinePattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
