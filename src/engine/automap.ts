/**
 * Auto-map renderer — design doc Section 6.2 / 12.
 *
 * Renders a top-down 2D view of the dungeon grid with fog of war: only
 * tiles the player has explored (tracked in GameState.explored) are visible.
 * Unexplored tiles are black.
 *
 * Rendering approach (informed by research into Legend of Grimrock's
 * automap, Dungeon Architect's fog-of-war minimap, and classic grid-based
 * crawler maps):
 *
 * - Each grid cell is drawn as a square of size TILE_PX.
 * - Walls are drawn as solid lines on the edges of explored cells (using our
 *   edge-based grid model: Cell.n/e/s/w = "wall" | "open" | "door").
 * - Doors are drawn as amber-colored segments (shorter than wall lines) so
 *   they're visually distinct.
 * - Open edges between two explored cells are not drawn (the floor color
 *   shows through, creating the "corridor" look).
 * - The player is drawn as a directional triangle at their position, rotated
 *   to match their facing (0=N, 1=E, 2=S, 3=W).
 * - The map is centered on the player and clamped to the grid bounds so it
 *   doesn't show empty space beyond the dungeon.
 * - Tile features (stairs, teleporters, treasure) get small icons when
 *   those systems are added in later steps.
 */

import type { GameState, Cell, TileFeature } from "../types";

// --- Palette (matches the warm wireframe aesthetic) -----------------------
const MAP_COLORS = {
  bg: "#0e0d0a",          // unexplored / void
  floor: "#2a2620",       // explored floor
  floorCurrent: "#3a3226", // current tile (slightly brighter)
  wall: "#b7b3a6",        // explored walls (soft gray, matches d1)
  wallUnexplored: "#1a1814", // walls bordering unexplored cells (dim)
  door: "#e0a458",        // doors (amber, matches doorMarker)
  player: "#f5f0e6",      // player arrow (warm white, matches d0)
  feature: "#e0a458",     // tile feature icons
  grid: "#1a1814",        // subtle grid lines on explored floor
};

const TILE_PX = 36;       // size of each grid cell in pixels
const WALL_THICKNESS = 2;
const DOOR_LENGTH = 16;   // shorter than full edge to look like a gap+door
const PLAYER_SIZE = 12;   // radius of player triangle

/**
 * Render the auto-map to a 2D canvas context. The map is centered on the
 * player and fills the canvas. Called every frame while the map is visible.
 */
export function renderAutoMap(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { floor, player, explored } = state;
  const canvas = ctx.canvas;
  const cw = canvas.width;
  const ch = canvas.height;

  // Clear with void color.
  ctx.fillStyle = MAP_COLORS.bg;
  ctx.fillRect(0, 0, cw, ch);

  // Calculate the map origin (top-left of grid in canvas space) so the
  // player is centered. Clamp so the map doesn't scroll past the grid edges.
  const gridPixelW = floor.width * TILE_PX;
  const gridPixelH = floor.height * TILE_PX;
  let originX = Math.floor((cw - gridPixelW) / 2);
  let originY = Math.floor((ch - gridPixelH) / 2);

  // If the grid is smaller than the canvas, center it. Otherwise center on
  // the player and clamp to grid bounds.
  if (gridPixelW <= cw) {
    originX = Math.floor((cw - gridPixelW) / 2);
  } else {
    const playerCenterX = player.x * TILE_PX + TILE_PX / 2;
    originX = Math.floor(cw / 2 - playerCenterX);
    originX = Math.max(Math.min(originX, 0), cw - gridPixelW);
  }
  if (gridPixelH <= ch) {
    originY = Math.floor((ch - gridPixelH) / 2);
  } else {
    const playerCenterY = player.y * TILE_PX + TILE_PX / 2;
    originY = Math.floor(ch / 2 - playerCenterY);
    originY = Math.max(Math.min(originY, 0), ch - gridPixelH);
  }

  // Helper: is a tile explored?
  const isExplored = (x: number, y: number): boolean =>
    explored.has(`${x},${y}`);

  // --- Pass 1: draw explored floor tiles ----------------------------------
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (!isExplored(x, y)) continue;
      const px = originX + x * TILE_PX;
      const py = originY + y * TILE_PX;
      const isCurrent = x === player.x && y === player.y;
      ctx.fillStyle = isCurrent ? MAP_COLORS.floorCurrent : MAP_COLORS.floor;
      ctx.fillRect(px, py, TILE_PX, TILE_PX);
    }
  }

  // --- Pass 2: draw walls and doors on explored tiles ---------------------
  // We draw each explored cell's edges. To avoid double-drawing shared edges,
  // we only draw N and W edges of each cell, plus S and E edges if the
  // neighboring cell is unexplored (so the boundary of explored area is
  // always visible).
  ctx.lineWidth = WALL_THICKNESS;
  ctx.lineCap = "square";

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (!isExplored(x, y)) continue;
      const cell = floor.grid[y][x];
      const px = originX + x * TILE_PX;
      const py = originY + y * TILE_PX;

      // N edge (always draw if explored)
      drawEdge(ctx, cell.n, px, py, px + TILE_PX, py, "n", x, y, floor.width, floor.height, isExplored);
      // W edge (always draw if explored)
      drawEdge(ctx, cell.w, px, py, px, py + TILE_PX, "w", x, y, floor.width, floor.height, isExplored);
      // S edge (draw if neighbor below is unexplored or out of bounds)
      const sExplored = y + 1 < floor.height && isExplored(x, y + 1);
      if (!sExplored) {
        drawEdge(ctx, cell.s, px, py + TILE_PX, px + TILE_PX, py + TILE_PX, "s", x, y, floor.width, floor.height, isExplored);
      }
      // E edge (draw if neighbor right is unexplored or out of bounds)
      const eExplored = x + 1 < floor.width && isExplored(x + 1, y);
      if (!eExplored) {
        drawEdge(ctx, cell.e, px + TILE_PX, py, px + TILE_PX, py + TILE_PX, "e", x, y, floor.width, floor.height, isExplored);
      }
    }
  }

  // --- Pass 3: draw tile feature icons ------------------------------------
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (!isExplored(x, y)) continue;
      const cell = floor.grid[y][x];
      if (cell.tile) {
        drawFeatureIcon(ctx, cell.tile, originX + x * TILE_PX, originY + y * TILE_PX);
      }
    }
  }

  // --- Pass 4: draw player marker -----------------------------------------
  const pcx = originX + player.x * TILE_PX + TILE_PX / 2;
  const pcy = originY + player.y * TILE_PX + TILE_PX / 2;
  drawPlayerMarker(ctx, pcx, pcy, player.facing);

  // --- Pass 5: draw legend / header ---------------------------------------
  ctx.fillStyle = MAP_COLORS.wall;
  ctx.font = '28px "FF36", "Courier New", monospace';
  ctx.textAlign = "left";
  ctx.fillText(`${floor.name} — Floor ${floor.id}`, 16, 36);
  ctx.textAlign = "right";
  ctx.fillText(`Pos: ${player.x},${player.y}  Facing: ${["N", "E", "S", "W"][player.facing]}`, cw - 16, 36);
  ctx.textAlign = "left";
  ctx.fillStyle = MAP_COLORS.wall;
  ctx.font = '22px "FF36", "Courier New", monospace';
  ctx.fillText("Press M to close", 16, ch - 24);
}

// --- Edge drawing ----------------------------------------------------------

/**
 * Draw a single cell edge. Walls are full-length solid lines; doors are
 * shorter amber segments centered on the edge; open edges are not drawn
 * (unless they border unexplored space, in which case we draw a dim line
 * to suggest the boundary of known territory).
 */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: Cell["n"],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  _dir: string,
  _cx: number,
  _cy: number,
  _gw: number,
  _gh: number,
  _isExplored: (x: number, y: number) => boolean
): void {
  if (edge === "open") return; // open edges are invisible

  if (edge === "wall") {
    ctx.strokeStyle = MAP_COLORS.wall;
    ctx.lineWidth = WALL_THICKNESS;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }

  if (edge === "door") {
    // Draw the door as a shorter amber segment centered on the edge.
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const halfDoor = DOOR_LENGTH / 2;
    const ux = dx / len;
    const uy = dy / len;
    ctx.strokeStyle = MAP_COLORS.door;
    ctx.lineWidth = WALL_THICKNESS + 1;
    ctx.beginPath();
    ctx.moveTo(mx - ux * halfDoor, my - uy * halfDoor);
    ctx.lineTo(mx + ux * halfDoor, my + uy * halfDoor);
    ctx.stroke();
    return;
  }

  if (edge === "locked") {
    // Draw locked doors as a red segment (same style as doors but red).
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const halfDoor = DOOR_LENGTH / 2;
    const ux = dx / len;
    const uy = dy / len;
    ctx.strokeStyle = "#c44";
    ctx.lineWidth = WALL_THICKNESS + 1;
    ctx.beginPath();
    ctx.moveTo(mx - ux * halfDoor, my - uy * halfDoor);
    ctx.lineTo(mx + ux * halfDoor, my + uy * halfDoor);
    ctx.stroke();
    return;
  }
}

// --- Player marker ---------------------------------------------------------

/**
 * Draw the player as a directional triangle pointing in the facing direction.
 * 0=N (up), 1=E (right), 2=S (down), 3=W (left).
 */
function drawPlayerMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  facing: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((facing * Math.PI) / 2); // 0=up, 90°=right, 180°=down, 270°=left
  ctx.fillStyle = MAP_COLORS.player;
  ctx.beginPath();
  // Triangle pointing up (toward -Y), which is N before rotation.
  ctx.moveTo(0, -PLAYER_SIZE);
  ctx.lineTo(PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.6);
  ctx.lineTo(-PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.6);
  ctx.closePath();
  ctx.fill();
  // Outline for visibility against floor color.
  ctx.strokeStyle = MAP_COLORS.bg;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// --- Tile feature icons ----------------------------------------------------

function drawFeatureIcon(
  ctx: CanvasRenderingContext2D,
  feature: TileFeature,
  px: number,
  py: number
): void {
  const cx = px + TILE_PX / 2;
  const cy = py + TILE_PX / 2;
  ctx.fillStyle = MAP_COLORS.feature;
  ctx.font = 'bold 22px "FF36", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const icon = featureIcon(feature);
  ctx.fillText(icon, cx, cy);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function featureIcon(feature: TileFeature): string {
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
