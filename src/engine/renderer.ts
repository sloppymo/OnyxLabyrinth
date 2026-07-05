/**
 * Corridor renderer for OnyxLabyrinth.
 *
 * This module draws the first-person dungeon view using a 2D canvas. It walks
 * forward from the player's position, builds a list of per-depth draw commands,
 * then executes them far-to-near for correct occlusion.
 *
 * Textures are drawn with tiled `CanvasPattern` fills created inside each draw
 * call. Do NOT cache `CanvasPattern` objects at module scope: resetting the
 * canvas bitmap (e.g., on resize) invalidates them and causes black surfaces.
 * The texture image set itself is cached in `textureCache` once loaded.
 */

import type { GameState } from "../types";
import type { EdgeType, TileFeature } from "../types";
import { DX, DY, edgeInDirection } from "../game/dungeon";
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
  // Texture repeat counts per surface. Each floor/ceiling strip is one grid
  // tile, so it should not be repeated across its own width (that created a
  // center seam). Walls are one tile wide and benefit from a small tile grid.
  wallRepeatsX: 3,
  wallRepeatsY: 3,
  floorRepeatsX: 1,
  floorRepeatsY: 1,
  ceilingRepeatsX: 1,
  ceilingRepeatsY: 1,
} as const;

interface TextureSet {
  wall: HTMLImageElement | null;
  floorA: HTMLCanvasElement | null;
  floorB: HTMLCanvasElement | null;
  ceiling: HTMLCanvasElement | null;
}

let textureCache: TextureSet | null = null;

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
    textureCache = {
      wall,
      floorA: floorAImg
        ? brightenImage(floorAImg, RENDER_CONFIG.floorABrightnessFactor)
        : null,
      floorB: floorBImg
        ? brightenImage(floorBImg, RENDER_CONFIG.floorBBrightnessFactor)
        : null,
      ceiling: ceilingImg
        ? brightenImage(ceilingImg, RENDER_CONFIG.ceilingBrightnessFactor)
        : null,
    };
    return textureCache;
  });
}

function opacityForDepth(d: number): number {
  return RENDER_CONFIG.baseOpacity * Math.pow(RENDER_CONFIG.fogFalloff, d);
}

/** Darkening overlay alpha for dark base textures (floor/ceiling). Near =
 *  brighter (lower alpha), far = darker (higher alpha). */
function darkeningOverlayAlpha(d: number, multiplier: number): number {
  return 1 - opacityForDepth(d) * multiplier;
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

function wallGradient(
  ctx: CanvasRenderingContext2D,
  xNear: number,
  xFar: number,
  base: { r: number; g: number; b: number },
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(xNear, 0, xFar, 0);
  g.addColorStop(0, rgba({ r: base.r + 14, g: base.g + 8, b: base.b + 4 }, alpha));
  g.addColorStop(1, rgba({ r: base.r - 6, g: base.g - 6, b: base.b - 8 }, alpha * 0.5));
  return g;
}

function floorGradient(
  ctx: CanvasRenderingContext2D,
  yNear: number,
  yFar: number,
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(0, yNear, 0, Math.max(yFar, yNear + 1));
  g.addColorStop(0, rgba(PALETTE.floorFill, alpha));
  g.addColorStop(1, rgba({ r: 14, g: 13, b: 10 }, 0));
  return g;
}

function ceilingGradient(
  ctx: CanvasRenderingContext2D,
  yNear: number,
  yFar: number,
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(0, yFar, 0, yNear);
  g.addColorStop(0, rgba({ r: 14, g: 13, b: 10 }, 0));
  g.addColorStop(
    1,
    rgba(
      {
        r: PALETTE.ceilingFill.r + 6,
        g: PALETTE.ceilingFill.g + 2,
        b: PALETTE.ceilingFill.b,
      },
      alpha
    )
  );
  return g;
}

interface DepthRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Returns the screen-space rectangle representing "the opening at depth d"
 * for a 1-point perspective corridor, vanishing point dead-center.
 * Depth 0 = the near plane (right in front of the viewer).
 */
function getDepthRect(w: number, h: number, d: number): DepthRect {
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.pow(RENDER_CONFIG.projectionScale, d);
  const halfW = (w / 2) * scale;
  const halfH = (h / 2) * scale * RENDER_CONFIG.heightFlatten;
  return {
    left: cx - halfW,
    right: cx + halfW,
    top: cy - halfH,
    bottom: cy + halfH,
  };
}

function lineWidthForDepth(d: number): number {
  return d <= 0 ? 2.0 : d === 1 ? 1.5 : d === 2 ? 1.0 : 0.75;
}

function glowBlurForDepth(d: number): number {
  return Math.max(
    RENDER_CONFIG.glowBlurFar,
    RENDER_CONFIG.glowBlurNear - d * 1.5
  );
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  strokeStyle: string,
  fillStyle?: string | CanvasGradient,
  lineWidth: number = 1.5,
  glowBlur: number = 0
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (glowBlur > 0) {
    ctx.shadowColor = PALETTE.amber;
    ctx.shadowBlur = glowBlur;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a perspective quad filled with a tiled texture, plus an optional fog
 * overlay, then stroked with the amber edge glow.
 */
function drawTexturedQuad(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  img: HTMLImageElement | HTMLCanvasElement,
  repeatsX: number,
  repeatsY: number,
  strokeStyle: string,
  lineWidth: number,
  glowBlur: number,
  fogStyle?: string | CanvasGradient
) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  ctx.save();

  // Clip to the quad shape.
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  // Create a fresh pattern each frame. Caching patterns across canvas resizes
  // is unsafe because resetting the canvas bitmap invalidates CanvasPattern
  // objects, which then draw as black/transparent. The corridor has only a
  // handful of quads per frame, so the cost is negligible.
  ctx.imageSmoothingEnabled = false;
  const pattern = ctx.createPattern(img, "repeat");
  if (pattern) {
    const imgW = img.width;
    const imgH = img.height;
    // Use a single uniform scale so tiles stay square regardless of the quad's
    // aspect ratio — only the number of visible repeats should vary per quad,
    // never the tile's own proportions.
    const targetScale = Math.min(
      width / (repeatsX * imgW),
      height / (repeatsY * imgH)
    );
    pattern.setTransform(
      new DOMMatrix([targetScale, 0, 0, targetScale, minX, minY])
    );
    ctx.fillStyle = pattern;
    ctx.fillRect(minX, minY, width, height);
  }

  // Depth fog / tint overlay on top of the texture.
  if (fogStyle) {
    ctx.fillStyle = fogStyle;
    ctx.fillRect(minX, minY, width, height);
  }

  // Amber edge-glow outline on top of everything.
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  if (glowBlur > 0) {
    ctx.shadowColor = PALETTE.amber;
    ctx.shadowBlur = glowBlur;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  ctx.restore();
}

/**
 * Fill the lateral void visible when a side wall is open, so the opening
 * doesn't read as a flat black cut-out. It draws the floor, ceiling, and a
 * shadowed back wall of the side passage so the void has volume.
 */
function drawSideOpening(
  ctx: CanvasRenderingContext2D,
  w: number,
  near: DepthRect,
  far: DepthRect,
  side: "left" | "right",
  floorImg: HTMLCanvasElement | null,
  ceilImg: HTMLCanvasElement | null,
  wallImg: HTMLImageElement | HTMLCanvasElement | null,
  floorDarkenAlpha: number,
  ceilDarkenAlpha: number,
  depth: number
) {
  const isLeft = side === "left";
  const xNear = isLeft ? near.left : near.right;
  const xFar = isLeft ? far.left : far.right;
  const xEdge = isLeft ? 0 : w;
  const stroke = strokeColorForDepth(depth);
  // Side openings are at the viewport edge and heavily darkened by vignette;
  // use a lighter overlay than the main corridor so they remain readable.
  const sideFloorAlpha = floorDarkenAlpha * 0.5;
  const sideCeilAlpha = ceilDarkenAlpha * 0.5;

  if (ceilImg) {
    drawTexturedQuad(
      ctx,
      [
        [xEdge, near.top],
        [xNear, near.top],
        [xFar, far.top],
        [xEdge, far.top],
      ],
      ceilImg,
      RENDER_CONFIG.ceilingRepeatsX,
      RENDER_CONFIG.ceilingRepeatsY,
      "rgba(0,0,0,0)",
      0,
      0,
      rgba(PALETTE.ceilingFill, sideCeilAlpha)
    );
  }

  if (floorImg) {
    drawTexturedQuad(
      ctx,
      [
        [xEdge, near.bottom],
        [xNear, near.bottom],
        [xFar, far.bottom],
        [xEdge, far.bottom],
      ],
      floorImg,
      RENDER_CONFIG.floorRepeatsX,
      RENDER_CONFIG.floorRepeatsY,
      "rgba(0,0,0,0)",
      0,
      0,
      rgba(PALETTE.floorFill, sideFloorAlpha)
    );
  }

  // Back wall of the side passage (fills the central black void).
  const wallFillAlpha = opacityForDepth(depth) * RENDER_CONFIG.fillOpacityMultiplier;
  if (wallImg) {
    drawTexturedQuad(
      ctx,
      [
        [xFar, far.top],
        [xEdge, far.top],
        [xEdge, far.bottom],
        [xFar, far.bottom],
      ],
      wallImg,
      RENDER_CONFIG.wallRepeatsX,
      RENDER_CONFIG.wallRepeatsY,
      "rgba(0,0,0,0)",
      0,
      0,
      rgba(PALETTE.wallFill, wallFillAlpha)
    );
  } else {
    ctx.fillStyle = wallGradient(ctx, xFar, xEdge, PALETTE.wallFill, wallFillAlpha);
    ctx.beginPath();
    ctx.moveTo(xFar, far.top);
    ctx.lineTo(xEdge, far.top);
    ctx.lineTo(xEdge, far.bottom);
    ctx.lineTo(xFar, far.bottom);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle amber edges along the opening so the boundary reads.
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xNear, near.top);
  ctx.lineTo(xFar, far.top);
  ctx.moveTo(xNear, near.bottom);
  ctx.lineTo(xFar, far.bottom);
  ctx.stroke();
  ctx.restore();
}

function drawDoorMarker(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  side: "left" | "right" | "front"
) {
  ctx.strokeStyle = PALETTE.doorMarker;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (side === "front") {
    const midX = (far.left + far.right) / 2;
    ctx.moveTo(midX, far.top);
    ctx.lineTo(midX, far.bottom);
  } else {
    const x =
      side === "left"
        ? (near.left + far.left) / 2
        : (near.right + far.right) / 2;
    const yTop = (near.top + far.top) / 2 - 6;
    const yBot = (near.bottom + far.bottom) / 2 + 6;
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
  }
  ctx.stroke();
}

/** Draw a locked door marker — a red X on the door position. */
function drawLockedMarker(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  side: "left" | "right" | "front"
) {
  ctx.strokeStyle = PALETTE.lockedMarker;
  ctx.lineWidth = 2;
  const sz = 5;
  if (side === "front") {
    const cx = (far.left + far.right) / 2;
    const cy = (far.top + far.bottom) / 2;
    ctx.beginPath();
    ctx.moveTo(cx - sz, cy - sz);
    ctx.lineTo(cx + sz, cy + sz);
    ctx.moveTo(cx + sz, cy - sz);
    ctx.lineTo(cx - sz, cy + sz);
    ctx.stroke();
  } else {
    const x =
      side === "left"
        ? (near.left + far.left) / 2
        : (near.right + far.right) / 2;
    const y = (near.top + far.top) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - sz);
    ctx.lineTo(x, y + sz);
    ctx.moveTo(x - sz, y);
    ctx.lineTo(x + sz, y);
    ctx.stroke();
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
  const cx = w / 2;
  const cy = h / 2 + 30; // slightly below center, on the floor
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;
  drawFeatureGlyph(ctx, cx, cy, feature, color, 16);
}

/** Draw a tile feature icon at a depth (further away, smaller). */
function drawDepthFeature(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  feature: TileFeature,
  inDarkness: boolean
): void {
  const cx = (near.left + near.right + far.left + far.right) / 4;
  const cy = (near.bottom + far.bottom) / 2;
  const scale = Math.max(
    0.4,
    (far.right - far.left) / (near.right - near.left || 1)
  );
  const color = inDarkness ? PALETTE.featureDark : PALETTE.feature;
  drawFeatureGlyph(ctx, cx, cy, feature, color, 12 * scale);
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

function floorTextureForGrid(
  textures: TextureSet,
  gx: number,
  gy: number
): HTMLCanvasElement | null {
  return (gx + gy) % 2 === 0 ? textures.floorA : textures.floorB;
}

function drawFrontWall(
  ctx: CanvasRenderingContext2D,
  far: DepthRect,
  wallImg: HTMLImageElement | HTMLCanvasElement | null,
  stroke: string,
  lw: number,
  glowBlur: number,
  fillAlpha: number,
  edge: EdgeType
): void {
  const points: [number, number][] = [
    [far.left, far.top],
    [far.right, far.top],
    [far.right, far.bottom],
    [far.left, far.bottom],
  ];
  if (wallImg) {
    drawTexturedQuad(
      ctx,
      points,
      wallImg,
      RENDER_CONFIG.wallRepeatsX,
      RENDER_CONFIG.wallRepeatsY,
      stroke,
      lw,
      glowBlur,
      rgba(PALETTE.wallFill, fillAlpha)
    );
  } else {
    drawQuad(
      ctx,
      points,
      stroke,
      rgba(PALETTE.wallFill, fillAlpha),
      lw,
      glowBlur
    );
  }
  if (edge === "door") drawDoorMarker(ctx, far, far, "front");
  else if (edge === "locked") drawLockedMarker(ctx, far, far, "front");
}

function drawSideWall(
  ctx: CanvasRenderingContext2D,
  side: "left" | "right",
  near: DepthRect,
  far: DepthRect,
  wallImg: HTMLImageElement | HTMLCanvasElement | null,
  stroke: string,
  lw: number,
  glowBlur: number,
  fillAlpha: number,
  edge: EdgeType
): void {
  const isLeft = side === "left";
  const points: [number, number][] = isLeft
    ? [
        [near.left, near.top],
        [far.left, far.top],
        [far.left, far.bottom],
        [near.left, near.bottom],
      ]
    : [
        [near.right, near.top],
        [far.right, far.top],
        [far.right, far.bottom],
        [near.right, near.bottom],
      ];

  if (wallImg) {
    drawTexturedQuad(
      ctx,
      points,
      wallImg,
      RENDER_CONFIG.wallRepeatsX,
      RENDER_CONFIG.wallRepeatsY,
      stroke,
      lw,
      glowBlur,
      wallGradient(
        ctx,
        isLeft ? near.left : near.right,
        isLeft ? far.left : far.right,
        PALETTE.wallFill,
        fillAlpha
      )
    );
  } else {
    drawQuad(
      ctx,
      points,
      stroke,
      wallGradient(
        ctx,
        isLeft ? near.left : near.right,
        isLeft ? far.left : far.right,
        PALETTE.wallFill,
        fillAlpha
      ),
      lw,
      glowBlur
    );
  }

  if (edge === "door") drawDoorMarker(ctx, near, far, side);
  else if (edge === "locked") drawLockedMarker(ctx, near, far, side);
}

function drawCeilingStrip(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  ceilImg: HTMLCanvasElement | null,
  stroke: string,
  lw: number,
  glowBlur: number,
  fillAlpha: number,
  darkenAlpha: number
): void {
  const points: [number, number][] = [
    [near.left, near.top],
    [near.right, near.top],
    [far.right, far.top],
    [far.left, far.top],
  ];
  if (ceilImg) {
    drawTexturedQuad(
      ctx,
      points,
      ceilImg,
      RENDER_CONFIG.ceilingRepeatsX,
      RENDER_CONFIG.ceilingRepeatsY,
      stroke,
      lw,
      glowBlur,
      rgba(PALETTE.ceilingFill, darkenAlpha)
    );
  } else {
    ctx.fillStyle = ceilingGradient(ctx, near.top, far.top, fillAlpha);
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawFloorStrip(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  floorImg: HTMLCanvasElement | null,
  stroke: string,
  lw: number,
  glowBlur: number,
  fillAlpha: number,
  darkenAlpha: number
): void {
  const points: [number, number][] = [
    [near.left, near.bottom],
    [near.right, near.bottom],
    [far.right, far.bottom],
    [far.left, far.bottom],
  ];
  if (floorImg) {
    drawTexturedQuad(
      ctx,
      points,
      floorImg,
      RENDER_CONFIG.floorRepeatsX,
      RENDER_CONFIG.floorRepeatsY,
      stroke,
      lw,
      glowBlur,
      rgba(PALETTE.floorFill, darkenAlpha)
    );
  } else {
    ctx.fillStyle = floorGradient(ctx, near.bottom, far.bottom, fillAlpha);
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function drawCeilingFloorStrokes(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  stroke: string,
  lw: number,
  glowBlur: number
): void {
  drawQuad(
    ctx,
    [
      [near.left, near.top],
      [near.right, near.top],
      [far.right, far.top],
      [far.left, far.top],
    ],
    stroke,
    undefined,
    lw,
    glowBlur
  );
  drawQuad(
    ctx,
    [
      [near.left, near.bottom],
      [near.right, near.bottom],
      [far.right, far.bottom],
      [far.left, far.bottom],
    ],
    stroke,
    undefined,
    lw,
    glowBlur
  );
}

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Background
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);

  const grid = state.floor.grid;
  const { player } = state;
  let x = player.x;
  let y = player.y;
  const facing = player.facing;
  const leftDir = (facing + 3) % 4;
  const rightDir = (facing + 1) % 4;

  // Darkness zones reduce visibility to 1 tile (design doc §6.2).
  const maxDepth = state.inDarkness
    ? RENDER_CONFIG.darknessDepth
    : RENDER_CONFIG.maxDepth;

  const textures = textureCache;
  const wallImg = textures ? textures.wall : null;
  const ceilImg = textures ? textures.ceiling : null;

  // Walk forward and collect per-depth draw commands. We execute them
  // far-to-near afterwards so occlusion is correct without relying on the
  // geometry being perfectly nested.
  type RenderCmd = () => void;
  const depthLayers: RenderCmd[][] = [];

  for (let d = 0; d < maxDepth; d++) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) break;

    const cell = grid[y][x];
    const leftEdge = edgeInDirection(cell, leftDir);
    const rightEdge = edgeInDirection(cell, rightDir);
    const frontEdge = edgeInDirection(cell, facing);

    const near = getDepthRect(w, h, d);
    const far = getDepthRect(w, h, d + 1);
    const stroke = strokeColorForDepth(d);
    const fillAlpha = opacityForDepth(d) * RENDER_CONFIG.fillOpacityMultiplier;
    const lw = lineWidthForDepth(d);
    const glowBlur = glowBlurForDepth(d);

    const floorImg = textures ? floorTextureForGrid(textures, x, y) : null;
    const floorDepthDarkenAlpha = darkeningOverlayAlpha(
      d,
      RENDER_CONFIG.floorDarkenMultiplier
    );
    const ceilDepthDarkenAlpha = darkeningOverlayAlpha(
      d,
      RENDER_CONFIG.ceilingDarkenMultiplier
    );

    const layer: RenderCmd[] = [];

    // Front wall (drawn first within the layer so it sits behind the feature
    // and side walls if anything overlaps).
    const blocked: EdgeType = frontEdge;
    const isFrontBlocked = blocked !== "open" || d === maxDepth - 1;
    if (isFrontBlocked) {
      layer.push(() =>
        drawFrontWall(
          ctx,
          far,
          wallImg,
          stroke,
          lw,
          glowBlur,
          fillAlpha,
          blocked
        )
      );
    }

    // Depth feature on the floor.
    if (cell.tile && d > 0) {
      layer.push(() =>
        drawDepthFeature(ctx, near, far, cell.tile!, state.inDarkness)
      );
    }

    // Side openings.
    if (leftEdge === "open") {
      layer.push(() =>
        drawSideOpening(
          ctx,
          w,
          near,
          far,
          "left",
          floorImg,
          ceilImg,
          wallImg,
          floorDepthDarkenAlpha,
          ceilDepthDarkenAlpha,
          d
        )
      );
    }
    if (rightEdge === "open") {
      layer.push(() =>
        drawSideOpening(
          ctx,
          w,
          near,
          far,
          "right",
          floorImg,
          ceilImg,
          wallImg,
          floorDepthDarkenAlpha,
          ceilDepthDarkenAlpha,
          d
        )
      );
    }

    // Side walls.
    if (leftEdge !== "open") {
      layer.push(() =>
        drawSideWall(
          ctx,
          "left",
          near,
          far,
          wallImg,
          stroke,
          lw,
          glowBlur,
          fillAlpha,
          leftEdge
        )
      );
    }
    if (rightEdge !== "open") {
      layer.push(() =>
        drawSideWall(
          ctx,
          "right",
          near,
          far,
          wallImg,
          stroke,
          lw,
          glowBlur,
          fillAlpha,
          rightEdge
        )
      );
    }

    // Ceiling and floor strips.
    layer.push(() =>
      drawCeilingStrip(
        ctx,
        near,
        far,
        ceilImg,
        stroke,
        lw,
        glowBlur,
        fillAlpha,
        ceilDepthDarkenAlpha
      )
    );
    layer.push(() =>
      drawFloorStrip(
        ctx,
        near,
        far,
        floorImg,
        stroke,
        lw,
        glowBlur,
        fillAlpha,
        floorDepthDarkenAlpha
      )
    );

    // Amber edge strokes on top of the strips.
    layer.push(() =>
      drawCeilingFloorStrokes(ctx, near, far, stroke, lw, glowBlur)
    );

    depthLayers.push(layer);

    if (isFrontBlocked) break;

    x += DX[facing];
    y += DY[facing];
  }

  // Execute far-to-near.
  for (let i = depthLayers.length - 1; i >= 0; i--) {
    for (const cmd of depthLayers[i]) cmd();
  }

  // Near-plane floor/ceiling texture fills (depth 0, closest to the camera).
  const nearRect = getDepthRect(w, h, 0);
  const floorNearDarkenAlpha = darkeningOverlayAlpha(
    0,
    RENDER_CONFIG.floorDarkenMultiplier
  );
  const ceilNearDarkenAlpha = darkeningOverlayAlpha(
    0,
    RENDER_CONFIG.ceilingDarkenMultiplier
  );
  const floorImgNear = textures
    ? floorTextureForGrid(textures, player.x, player.y)
    : null;

  if (floorImgNear) {
    drawTexturedQuad(
      ctx,
      [
        [0, h],
        [w, h],
        [nearRect.right, nearRect.bottom],
        [nearRect.left, nearRect.bottom],
      ],
      floorImgNear,
      RENDER_CONFIG.floorRepeatsX,
      RENDER_CONFIG.floorRepeatsY,
      strokeColorForDepth(0),
      2.0,
      RENDER_CONFIG.glowBlurNear,
      rgba(PALETTE.floorFill, floorNearDarkenAlpha)
    );
  } else {
    ctx.fillStyle = floorGradient(
      ctx,
      nearRect.bottom,
      h,
      opacityForDepth(0)
    );
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(nearRect.right, nearRect.bottom);
    ctx.lineTo(nearRect.left, nearRect.bottom);
    ctx.closePath();
    ctx.fill();
  }

  if (ceilImg) {
    drawTexturedQuad(
      ctx,
      [
        [0, 0],
        [w, 0],
        [nearRect.right, nearRect.top],
        [nearRect.left, nearRect.top],
      ],
      ceilImg,
      RENDER_CONFIG.ceilingRepeatsX,
      RENDER_CONFIG.ceilingRepeatsY,
      strokeColorForDepth(0),
      2.0,
      RENDER_CONFIG.glowBlurNear,
      rgba(PALETTE.ceilingFill, ceilNearDarkenAlpha)
    );
  } else {
    ctx.fillStyle = ceilingGradient(ctx, nearRect.top, 0, opacityForDepth(0));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(nearRect.right, nearRect.top);
    ctx.lineTo(nearRect.left, nearRect.top);
    ctx.closePath();
    ctx.fill();
  }

  // Draw tile feature at the player's feet (depth 0).
  const currentCell = grid[player.y]?.[player.x];
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
