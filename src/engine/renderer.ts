import type { GameState } from "../types";
import type { EdgeType, TileFeature } from "../types";
import { DX, DY, edgeInDirection } from "../game/dungeon";

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

const MAX_DEPTH = 4;
const DARKNESS_DEPTH = 1;

const FOG_FALLOFF = 0.55;
const BASE_OPACITY = 1.0;
const FILL_OPACITY_MULTIPLIER = 0.45;

export const GLOW_BLUR_NEAR = 7;
export const GLOW_BLUR_FAR = 2;

export const SCANLINE_OPACITY = 0.12;
export const SCANLINE_SPACING = 3;

function opacityForDepth(d: number): number {
  return BASE_OPACITY * Math.pow(FOG_FALLOFF, d);
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

export function wallGradient(
  ctx: CanvasRenderingContext2D,
  xNear: number,
  xFar: number,
  base: { r: number; g: number; b: number },
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(xNear, 0, xFar, 0);
  g.addColorStop(0, rgba({ r: base.r + 14, g: base.g + 8, b: base.r + 4 }, alpha));
  g.addColorStop(1, rgba({ r: base.r - 6, g: base.g - 6, b: base.b - 8 }, alpha * 0.5));
  return g;
}

export function floorGradient(
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

export function ceilingGradient(
  ctx: CanvasRenderingContext2D,
  yNear: number,
  _yFar: number,
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, yNear);
  g.addColorStop(0, rgba({ r: 14, g: 13, b: 10 }, 0));
  g.addColorStop(1, rgba({ r: PALETTE.ceilingFill.r + 6, g: PALETTE.ceilingFill.g + 2, b: PALETTE.ceilingFill.b }, alpha));
  return g;
}

// Backward-compatibility shims for the existing render loop. These will be
// removed once the render loop is migrated to the new palette/helpers.
const COLORS = {
  ...PALETTE,
  floorNear: rgba(PALETTE.floorFill, FILL_OPACITY_MULTIPLIER),
  ceilingNear: rgba(PALETTE.ceilingFill, FILL_OPACITY_MULTIPLIER),
};

function colorForDepth(d: number): string {
  return strokeColorForDepth(d);
}

function lineWidthForDepth(_d: number): number {
  return 1.5;
}

function fillAlphaForDepth(_d: number): string {
  return "00";
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
 *
 * Projection: each tile of depth multiplies the half-extents by a constant
 * scale factor (0.62). This is visually equivalent to a 1/d falloff but
 * keeps far planes from collapsing to a single pixel. Tune the factor here
 * if a different falloff curve is wanted.
 */
function getDepthRect(w: number, h: number, d: number): DepthRect {
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.pow(0.62, d); // shrink factor per tile of depth
  const halfW = (w / 2) * scale;
  const halfH = (h / 2) * scale * 0.85; // slightly flattened, feels less like a tunnel
  return {
    left: cx - halfW,
    right: cx + halfW,
    top: cy - halfH,
    bottom: cy + halfH,
  };
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  strokeStyle: string,
  fillStyle?: string,
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

function drawDoorMarker(
  ctx: CanvasRenderingContext2D,
  near: DepthRect,
  far: DepthRect,
  side: "left" | "right" | "front",
  depth: number = 0
) {
  // Scale marker size and line width with depth so far doors don't look
  // disproportionately large relative to the shrinking corridor.
  const scale = Math.pow(0.75, depth);
  ctx.strokeStyle = COLORS.doorMarker;
  ctx.lineWidth = Math.max(0.5, 2 * scale);
  ctx.beginPath();
  if (side === "front") {
    const midX = (far.left + far.right) / 2;
    ctx.moveTo(midX, far.top);
    ctx.lineTo(midX, far.bottom);
  } else {
    const x = side === "left" ? (near.left + far.left) / 2 : (near.right + far.right) / 2;
    const offset = 6 * scale;
    const yTop = (near.top + far.top) / 2 - offset;
    const yBot = (near.bottom + far.bottom) / 2 + offset;
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
  side: "left" | "right" | "front",
  depth: number = 0
) {
  const scale = Math.pow(0.75, depth);
  ctx.strokeStyle = COLORS.lockedMarker;
  ctx.lineWidth = Math.max(0.5, 2 * scale);
  const sz = 5 * scale;
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
    const x = side === "left" ? (near.left + far.left) / 2 : (near.right + far.right) / 2;
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
  const color = inDarkness ? COLORS.featureDark : COLORS.feature;
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
  const scale = Math.max(0.4, (far.right - far.left) / (near.right - near.left || 1));
  const color = inDarkness ? COLORS.featureDark : COLORS.feature;
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
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Map a tile feature to a display glyph. */
function featureGlyph(feature: TileFeature): string {
  switch (feature) {
    case "stairs_up": return "↑";
    case "stairs_down": return "↓";
    case "teleporter": return "✦";
    case "chute": return "»";
    case "darkness": return "◐";
    case "treasure": return "$";
    case "antimagic": return "∅";
    default: return "?";
  }
}

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  const grid = state.floor.grid;
  const { player } = state;
  let x = player.x;
  let y = player.y;
  const facing = player.facing;
  const leftDir = (facing + 3) % 4;
  const rightDir = (facing + 1) % 4;

  // Darkness zones reduce visibility to 1 tile (design doc §6.2).
  const maxDepth = state.inDarkness ? DARKNESS_DEPTH : MAX_DEPTH;

  // Floor / ceiling near-plane gradient (soft fill close to viewer, per Section 12.2)
  const nearRect = getDepthRect(w, h, 0);
  const floorGrad = ctx.createLinearGradient(0, nearRect.bottom, 0, h);
  floorGrad.addColorStop(0, COLORS.floorNear);
  floorGrad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.lineTo(nearRect.right, nearRect.bottom);
  ctx.lineTo(nearRect.left, nearRect.bottom);
  ctx.closePath();
  ctx.fill();

  const ceilGrad = ctx.createLinearGradient(0, 0, 0, nearRect.top);
  ceilGrad.addColorStop(0, COLORS.bg);
  ceilGrad.addColorStop(1, COLORS.ceilingNear);
  ctx.fillStyle = ceilGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(nearRect.right, nearRect.top);
  ctx.lineTo(nearRect.left, nearRect.top);
  ctx.closePath();
  ctx.fill();

  // Draw tile feature at the player's feet (depth 0).
  const currentCell = grid[player.y]?.[player.x];
  if (currentCell?.tile) {
    drawFloorFeature(ctx, w, h, currentCell.tile, state.inDarkness);
  }

  for (let d = 0; d < maxDepth; d++) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) break;

    const cell = grid[y][x];
    const leftEdge = edgeInDirection(cell, leftDir);
    const rightEdge = edgeInDirection(cell, rightDir);
    const frontEdge = edgeInDirection(cell, facing);

    const near = getDepthRect(w, h, d);
    const far = getDepthRect(w, h, d + 1);
    const color = colorForDepth(d);
    const lw = lineWidthForDepth(d);

    // Left wall (wall or locked — both block, locked gets a red marker)
    if (leftEdge !== "open") {
      drawQuad(
        ctx,
        [
          [near.left, near.top],
          [far.left, far.top],
          [far.left, far.bottom],
          [near.left, near.bottom],
        ],
        color,
        undefined,
        lw
      );
      if (leftEdge === "door") drawDoorMarker(ctx, near, far, "left", d);
      else if (leftEdge === "locked") drawLockedMarker(ctx, near, far, "left", d);
    }

    // Right wall
    if (rightEdge !== "open") {
      drawQuad(
        ctx,
        [
          [near.right, near.top],
          [far.right, far.top],
          [far.right, far.bottom],
          [near.right, near.bottom],
        ],
        color,
        undefined,
        lw
      );
      if (rightEdge === "door") drawDoorMarker(ctx, near, far, "right", d);
      else if (rightEdge === "locked") drawLockedMarker(ctx, near, far, "right", d);
    }

    // Ceiling and floor strip for this segment (connects near/far top and bottom edges)
    drawQuad(
      ctx,
      [
        [near.left, near.top],
        [near.right, near.top],
        [far.right, far.top],
        [far.left, far.top],
      ],
      color,
      undefined,
      lw
    );
    drawQuad(
      ctx,
      [
        [near.left, near.bottom],
        [near.right, near.bottom],
        [far.right, far.bottom],
        [far.left, far.bottom],
      ],
      color,
      undefined,
      lw
    );

    // Draw tile feature at this depth (on the floor between near and far).
    if (cell.tile && d > 0) {
      drawDepthFeature(ctx, near, far, cell.tile, state.inDarkness);
    }

    // Front wall: closes the corridor at this depth, stop looking further.
    const blocked: EdgeType = frontEdge;
    if (blocked !== "open" || d === maxDepth - 1) {
      drawQuad(
        ctx,
        [
          [far.left, far.top],
          [far.right, far.top],
          [far.right, far.bottom],
          [far.left, far.bottom],
        ],
        color,
        d === 0 ? undefined : `${color}${fillAlphaForDepth(d)}`,
        lw
      );
      if (blocked === "door") drawDoorMarker(ctx, near, far, "front", d);
      else if (blocked === "locked") drawLockedMarker(ctx, near, far, "front", d);
      break;
    }

    x += DX[facing];
    y += DY[facing];
  }

  drawMinimap(ctx, state);

  // Darkness vignette: when in a darkness zone, overlay a radial gradient
  // to reinforce the reduced visibility (design doc §6.2).
  if (state.inDarkness) {
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) / 2);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.4, "rgba(0,0,0,0.4)");
    grad.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState): void {
  const grid = state.floor.grid;
  const { player } = state;
  const cellSize = 14;
  const pad = 16;
  const rows = grid.length;
  const cols = grid[0].length;
  const originX = pad;
  const originY = pad;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(14,13,10,0.6)";
  ctx.fillRect(originX - 6, originY - 6, cols * cellSize + 12, rows * cellSize + 12);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = grid[y][x];
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;

      ctx.strokeStyle = "rgba(245,240,230,0.5)";
      ctx.lineWidth = 1;

      if (cell.n === "wall") strokeEdge(ctx, px, py, px + cellSize, py);
      if (cell.s === "wall") strokeEdge(ctx, px, py + cellSize, px + cellSize, py + cellSize);
      if (cell.w === "wall") strokeEdge(ctx, px, py, px, py + cellSize);
      if (cell.e === "wall") strokeEdge(ctx, px + cellSize, py, px + cellSize, py + cellSize);

      if (cell.n === "door") strokeEdge(ctx, px, py, px + cellSize, py, COLORS.doorMarker);
      if (cell.s === "door")
        strokeEdge(ctx, px, py + cellSize, px + cellSize, py + cellSize, COLORS.doorMarker);
      if (cell.w === "door") strokeEdge(ctx, px, py, px, py + cellSize, COLORS.doorMarker);
      if (cell.e === "door")
        strokeEdge(ctx, px + cellSize, py, px + cellSize, py + cellSize, COLORS.doorMarker);

      if (cell.n === "locked") strokeEdge(ctx, px, py, px + cellSize, py, COLORS.lockedMarker);
      if (cell.s === "locked")
        strokeEdge(ctx, px, py + cellSize, px + cellSize, py + cellSize, COLORS.lockedMarker);
      if (cell.w === "locked") strokeEdge(ctx, px, py, px, py + cellSize, COLORS.lockedMarker);
      if (cell.e === "locked")
        strokeEdge(ctx, px + cellSize, py, px + cellSize, py + cellSize, COLORS.lockedMarker);
    }
  }

  // Player marker: pulsing dot + facing tick, per Section 12.2 auto-map spec.
  const pxCenter = originX + player.x * cellSize + cellSize / 2;
  const pyCenter = originY + player.y * cellSize + cellSize / 2;
  const pulse = 2.5 + Math.sin(performance.now() / 250) * 1;
  ctx.fillStyle = "#e0a458";
  ctx.beginPath();
  ctx.arc(pxCenter, pyCenter, pulse + 2, 0, Math.PI * 2);
  ctx.fill();

  const tickLen = 9;
  ctx.strokeStyle = "#e0a458";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pxCenter, pyCenter);
  ctx.lineTo(
    pxCenter + DX[player.facing] * tickLen,
    pyCenter + DY[player.facing] * tickLen
  );
  ctx.stroke();

  ctx.restore();
}

function strokeEdge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "rgba(245,240,230,0.5)"
) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
