/**
 * Corridor renderer for OnyxLabyrinth.
 *
 * This module draws the first-person dungeon view using a 2D canvas raycaster.
 * One ray is cast per screen column to find the nearest wall, and floor/ceiling
 * are filled with perspective-correct casting. Open grid edges are treated as
 * empty space, so side-passage back walls render automatically.
 *
 * Textures are drawn with tiled `CanvasPattern` fills created inside each draw
 * call. Do NOT cache `CanvasPattern` objects at module scope: resetting the
 * canvas bitmap (e.g., on resize) invalidates them and causes black surfaces.
 * The texture image set itself is cached in `textureCache` once loaded.
 */

import type { GameState } from "../types";
import type { EdgeType, TileFeature } from "../types";
import { edgeInDirection } from "../game/dungeon";
import wallTextureUrl from "../assets/wall_tile_amber_256.png";
import floorATextureUrl from "../assets/floor_tile_a_256.png";
import floorBTextureUrl from "../assets/floor_tile_b_256.png";
import ceilingTextureUrl from "../assets/ceiling_tile_256.png";

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
  feature: "#e0a458",
  featureDark: "#8a6a38",
};

// Centralized renderer tuning. Keep magic numbers here so art passes and
// debugging don't require hunting through the draw loop.
const RENDER_CONFIG = {
  maxDepth: 4,
  darknessDepth: 1,
  projectionScale: 0.62,
  heightFlatten: 0.85,
  fogFalloff: 0.42,
  baseOpacity: 1.0,
  fillOpacityMultiplier: 0.45,
  glowBlurNear: 7,
  glowBlurFar: 2,
  scanlineOpacity: 0.12,
  scanlineSpacing: 3,
  // Floor/ceiling are darker base textures than the wall; brighten them and use
  // a darkening overlay so the pixel-art detail remains visible while still
  // fading into the distance.
  floorDarkenMultiplier: 0.55,
  ceilingDarkenMultiplier: 0.3,
  // The two floor tiles are visually similar; give them different brightness
  // levels so the grid-coord checkerboard is readable without distorting hue.
  floorABrightnessFactor: 4.0,
  floorBBrightnessFactor: 2.8,
  ceilingBrightnessFactor: 10.0,
  // Raycast renderer tunables.
  raycastFov: Math.PI / 3,          // 60 degrees
  raycastStripWidth: 1,             // one ray per screen column
  wallRepeatsX: 1,                  // horizontal repeats per wall face
  wallRepeatsY: 3,                  // vertical repeats per wall face
  floorRepeats: 1,                  // texture repeats per floor grid tile
  ceilingRepeats: 1,                // texture repeats per ceiling grid tile
  darknessMaxDist: 1.5,
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

let textureCache: TextureSet | null = null;
let repeatedWallCanvas: HTMLCanvasElement | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load texture: ${src}`));
    img.src = src;
  });
}

function brightenImage(img: HTMLImageElement, factor: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * factor);
    data[i + 1] = Math.min(255, data[i + 1] * factor);
    data[i + 2] = Math.min(255, data[i + 2] * factor);
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

/**
 * Build a canvas containing `img` tiled `repeatsX` times horizontally and
 * `repeatsY` times vertically. The raycast wall strip pass samples this canvas
 * so the texture repeats across a wall face instead of being squashed.
 */
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

export function loadTextures(): Promise<TextureSet> {
  if (textureCache) return Promise.resolve(textureCache);
  // Load each texture independently; a single 404 or CORS failure shouldn't
  // prevent the others from rendering.
  return Promise.all([
    loadImage(wallTextureUrl).catch(() => null),
    loadImage(floorATextureUrl).catch(() => null),
    loadImage(floorBTextureUrl).catch(() => null),
    loadImage(ceilingTextureUrl).catch(() => null),
  ]).then(([wall, floorAImg, floorBImg, ceilingImg]) => {
    const floorABright = floorAImg
      ? brightenImage(floorAImg, RENDER_CONFIG.floorABrightnessFactor)
      : null;
    const floorBBright = floorBImg
      ? brightenImage(floorBImg, RENDER_CONFIG.floorBBrightnessFactor)
      : null;
    const ceilingBright = ceilingImg
      ? brightenImage(ceilingImg, RENDER_CONFIG.ceilingBrightnessFactor)
      : null;

    const floorARepeated = floorABright
      ? prepareRepeatedTexture(floorABright, 1, 1)
      : null;
    const floorBRepeated = floorBBright
      ? prepareRepeatedTexture(floorBBright, 1, 1)
      : null;
    const ceilingRepeated = ceilingBright
      ? prepareRepeatedTexture(ceilingBright, 1, 1)
      : null;

    textureCache = {
      wall,
      floorA: floorABright,
      floorB: floorBBright,
      ceiling: ceilingBright,
      floorARepeated,
      floorBRepeated,
      ceilingRepeated,
      floorAData: floorARepeated
        ? floorARepeated
            .getContext("2d")!
            .getImageData(0, 0, floorARepeated.width, floorARepeated.height)
        : null,
      floorBData: floorBRepeated
        ? floorBRepeated
            .getContext("2d")!
            .getImageData(0, 0, floorBRepeated.width, floorBRepeated.height)
        : null,
      ceilingData: ceilingRepeated
        ? ceilingRepeated
            .getContext("2d")!
            .getImageData(0, 0, ceilingRepeated.width, ceilingRepeated.height)
        : null,
    };
    repeatedWallCanvas = wall
      ? prepareRepeatedTexture(
          wall,
          RENDER_CONFIG.wallRepeatsX,
          RENDER_CONFIG.wallRepeatsY
        )
      : null;
    return textureCache;
  });
}

function opacityForDepth(d: number): number {
  return RENDER_CONFIG.baseOpacity * Math.pow(RENDER_CONFIG.fogFalloff, d);
}

function rgba(
  color: { r: number; g: number; b: number },
  alpha: number
): string {
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, alpha)})`;
}

function strokeColorForDepth(d: number): string {
  const a = opacityForDepth(d);
  return `rgba(224,164,88,${a})`;
}

// Direction vectors for N/E/S/W grid facing values.
const DIR_VECTORS = [
  { x: 0, y: -1 }, // N
  { x: 1, y: 0 },  // E
  { x: 0, y: 1 },  // S
  { x: -1, y: 0 }, // W
] as const;

/** Returns the camera plane vector for a grid facing direction (0=N,1=E,2=S,3=W). */
function cameraPlaneForFacing(facing: number): { planeX: number; planeY: number } {
  // Plane is perpendicular to the facing direction, scaled by the FOV tangent.
  const dir = DIR_VECTORS[facing % 4];
  return {
    planeX: -dir.y * Math.tan(RENDER_CONFIG.raycastFov / 2),
    planeY: dir.x * Math.tan(RENDER_CONFIG.raycastFov / 2),
  };
}

/** Cast a ray through the grid using DDA and return the first non-open wall hit. */
function castRay(
  state: GameState,
  rayDirX: number,
  rayDirY: number,
  maxDist: number
): RayHit | null {
  if (rayDirX === 0 && rayDirY === 0) return null;

  const grid = state.floor.grid;
  const playerWX = state.player.x + 0.5;
  const playerWY = state.player.y + 0.5;

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

function glowBlurForDepth(d: number): number {
  return Math.max(
    RENDER_CONFIG.glowBlurFar,
    RENDER_CONFIG.glowBlurNear - d * 1.5
  );
}

/** Draw a tile feature icon on the floor at the player's current position. */
function drawFloorFeature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  feature: TileFeature,
  inDarkness: boolean
): void {
  const cx = w / 2;
  const cy = h / 2 + 30; // slightly below center, on the floor
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;
  drawFeatureGlyph(ctx, cx, cy, feature, color, 16);
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
  const glyph = featureGlyph(feature);
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px "FF36", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
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
    default:
      return "?";
  }
}

/**
 * Perspective-correct floor casting. For each screen row below the horizon,
 * compute the world-floor coordinates across the row and draw the matching
 * checkerboard tile pixel by pixel. Uses the repeated floor canvases cached
 * in `loadTextures` so each grid tile keeps a consistent 1×1 texture.
 */
function drawFloorCast(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  textures: TextureSet
): void {
  ctx.save();

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const dir = DIR_VECTORS[state.player.facing % 4];
  const { planeX, planeY } = cameraPlaneForFacing(state.player.facing);
  const maxDist = state.inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const startY = Math.floor(h / 2) + 1;
  for (let y = startY; y < h; y++) {
    const rowDistance = (h / 2) / (y - h / 2);
    if (rowDistance > maxDist) continue;

    const floorStepX = rowDistance * ((planeX * 2) / w);
    const floorStepY = rowDistance * ((planeY * 2) / w);
    let floorX = state.player.x + 0.5 + rowDistance * (dir.x - planeX);
    let floorY = state.player.y + 0.5 + rowDistance * (dir.y - planeY);

    const rowImageData = new ImageData(w, 1);
    const rowData = rowImageData.data;
    const fog = opacityForDepth(rowDistance);

    for (let x = 0; x < w; x++) {
      const gx = Math.floor(floorX);
      const gy = Math.floor(floorY);
      const tex =
        (gx + gy) % 2 === 0 ? textures.floorAData : textures.floorBData;
      if (tex) {
        const texSize = tex.width;
        const texX = Math.floor((floorX - gx) * texSize) % texSize;
        const texY = Math.floor((floorY - gy) * texSize) % texSize;
        const srcIdx = (texY * texSize + texX) * 4;
        const dstIdx = x * 4;
        rowData[dstIdx] = Math.min(255, tex.data[srcIdx] * fog);
        rowData[dstIdx + 1] = Math.min(255, tex.data[srcIdx + 1] * fog);
        rowData[dstIdx + 2] = Math.min(255, tex.data[srcIdx + 2] * fog);
        rowData[dstIdx + 3] = 255;
      }
      floorX += floorStepX;
      floorY += floorStepY;
    }

    ctx.putImageData(rowImageData, 0, y);
  }

  ctx.restore();
}

/**
 * Perspective-correct ceiling casting. Mirrors drawFloorCast for rows above
 * the horizon, sampling the ceiling texture and applying distance fog.
 */
function drawCeilingCast(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  textures: TextureSet
): void {
  ctx.save();

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const dir = DIR_VECTORS[state.player.facing % 4];
  const { planeX, planeY } = cameraPlaneForFacing(state.player.facing);
  const maxDist = state.inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const ceilImg = textures.ceilingData;
  if (!ceilImg) {
    ctx.restore();
    return;
  }

  const texSize = ceilImg.width;
  const endY = Math.floor(h / 2) - 1;

  for (let y = 0; y <= endY; y++) {
    const rowDistance = (h / 2) / (h / 2 - y);
    if (rowDistance > maxDist) continue;

    const ceilStepX = rowDistance * ((planeX * 2) / w);
    const ceilStepY = rowDistance * ((planeY * 2) / w);
    let ceilX = state.player.x + 0.5 + rowDistance * (dir.x - planeX);
    let ceilY = state.player.y + 0.5 + rowDistance * (dir.y - planeY);

    const rowImageData = new ImageData(w, 1);
    const rowData = rowImageData.data;
    const fog = opacityForDepth(rowDistance);

    for (let x = 0; x < w; x++) {
      const gx = Math.floor(ceilX);
      const gy = Math.floor(ceilY);
      const texX = Math.floor((ceilX - gx) * texSize) % texSize;
      const texY = Math.floor((ceilY - gy) * texSize) % texSize;
      const srcIdx = (texY * texSize + texX) * 4;
      const dstIdx = x * 4;
      rowData[dstIdx] = Math.min(255, ceilImg.data[srcIdx] * fog);
      rowData[dstIdx + 1] = Math.min(255, ceilImg.data[srcIdx + 1] * fog);
      rowData[dstIdx + 2] = Math.min(255, ceilImg.data[srcIdx + 2] * fog);
      rowData[dstIdx + 3] = 255;

      ceilX += ceilStepX;
      ceilY += ceilStepY;
    }

    ctx.putImageData(rowImageData, 0, y);
  }

  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  // --- Raycast wall strip pass (Task 3) ---
  const dir = DIR_VECTORS[state.player.facing % 4];
  const { planeX, planeY } = cameraPlaneForFacing(state.player.facing);
  const maxDist = state.inDarkness
    ? RENDER_CONFIG.darknessMaxDist
    : RENDER_CONFIG.maxDepth * 2;

  const repeatedWall = repeatedWallCanvas;
  const texWidth = textureCache?.wall ? textureCache.wall.width : 1;

  const stripWidth = RENDER_CONFIG.raycastStripWidth;
  const hits: (RayHit | null)[] = new Array(Math.ceil(w / stripWidth)).fill(null);

  ctx.save();
  for (let i = 0; i < hits.length; i++) {
    const x = i * stripWidth;
    const cameraX = (2 * x) / w - 1;
    const rayDirX = dir.x + planeX * cameraX;
    const rayDirY = dir.y + planeY * cameraX;

    const hit = castRay(state, rayDirX, rayDirY, maxDist);
    hits[i] = hit;
    if (!hit) continue;

    const lineHeight = Math.floor(h / hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    let texX = Math.floor(hit.wallX * texWidth);
    if (
      (hit.side === "x" && rayDirX > 0) ||
      (hit.side === "y" && rayDirY < 0)
    ) {
      texX = texWidth - texX - 1;
    }

    const fog = opacityForDepth(hit.perpWallDist);

    if (repeatedWall) {
      ctx.globalAlpha = fog;
      ctx.drawImage(
        repeatedWall,
        texX * RENDER_CONFIG.wallRepeatsX,
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

    if (hit.edge === "door") {
      ctx.fillStyle = PALETTE.doorMarker;
      ctx.globalAlpha = fog;
      ctx.fillRect(
        x + stripWidth / 2 - 1,
        drawStart,
        2,
        drawEnd - drawStart + 1
      );
      ctx.globalAlpha = 1.0;
    } else if (hit.edge === "locked") {
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
  ctx.restore();

  // --- Amber edge-glow pass (Task 4) ---
  ctx.save();
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (!hit) continue;

    const x = i * stripWidth;
    const lineHeight = Math.floor(h / hit.perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
    const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

    // Draw the glow on the edge of the strip that faces the camera:
    // x-step hits (E/W-facing walls) use the left edge; y-step hits
    // (N/S-facing walls) use the right edge.
    const gx = hit.side === "x" ? x : x + stripWidth;

    ctx.strokeStyle = strokeColorForDepth(hit.perpWallDist);
    ctx.lineWidth = 1;
    ctx.shadowColor = PALETTE.amber;
    ctx.shadowBlur = glowBlurForDepth(hit.perpWallDist);
    ctx.beginPath();
    ctx.moveTo(gx, drawStart);
    ctx.lineTo(gx, drawEnd);
    ctx.stroke();
  }
  ctx.restore();

  const textures = textureCache;

  // --- Ceiling and floor casting (Tasks 5-6) ---
  if (textures) {
    drawCeilingCast(ctx, state, textures);
    drawFloorCast(ctx, state, textures);
  }

  // Draw tile feature at the player's feet (depth 0).
  const currentCell = state.floor.grid[state.player.y]?.[state.player.x];
  if (currentCell?.tile) {
    drawFloorFeature(ctx, w, h, currentCell.tile, state.inDarkness);
  }

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
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const grad = ctx.createRadialGradient(
    cx,
    cy,
    radius * 0.25,
    cx,
    cy,
    radius
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.55, `rgba(0,0,0,${0.35 * strength})`);
  grad.addColorStop(1, `rgba(0,0,0,${0.75 * strength})`);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Subtle horizontal scanline texture across the whole viewport. */
function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${RENDER_CONFIG.scanlineOpacity})`;
  for (let y = 0; y < h; y += RENDER_CONFIG.scanlineSpacing) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}
