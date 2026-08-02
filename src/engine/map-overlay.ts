/**
 * Nonmodal dungeon map overlay.
 *
 * The full-screen automap in automap.ts remains a separate, modal view. This
 * module derives a deliberately small render model from GameState.explored and
 * paints a north-up, player-centred heads-up map over the live corridor.
 */

import type { FloorDef } from "../data/floors";
import type { EdgeType, GameMode, GameState, PlayerState, TileFeature } from "../types";

export const MAP_OVERLAY_CONFIG = {
  canvasWidth: 552,
  canvasHeight: 484,
  backgroundAlpha: 0.58,
  discoveredFloorAlpha: 0.62,
  headerHeight: 54,
  footerHeight: 42,
  mapPadding: 14,
  targetVisibleColumns: 13,
  targetVisibleRows: 11,
  minimumCellSize: 12,
  maximumCellSize: 32,
  wallThickness: 2,
  doorThickness: 3,
} as const;

export interface MapOverlayState {
  visible: boolean;
}

export interface MapOverlayToggleContext {
  mode: GameMode;
  fullMapVisible: boolean;
  blocked: boolean;
}

export function createMapOverlayState(): MapOverlayState {
  return { visible: false };
}

/** Toggle only during unblocked exploration; returns whether input was owned. */
export function toggleMapOverlayState(
  overlay: MapOverlayState,
  context: MapOverlayToggleContext,
): boolean {
  if (context.mode !== "dungeon" || context.fullMapVisible || context.blocked) {
    return false;
  }
  overlay.visible = !overlay.visible;
  return true;
}

export function hideMapOverlayState(overlay: MapOverlayState): boolean {
  if (!overlay.visible) return false;
  overlay.visible = false;
  return true;
}

/** Blocking modes always discard the session-only open state. */
export function syncMapOverlayMode(overlay: MapOverlayState, mode: GameMode): boolean {
  return mode === "dungeon" ? false : hideMapOverlayState(overlay);
}

export type MapOverlayLandmarkKind =
  | "stairs-up"
  | "stairs-down"
  | "teleporter"
  | "chute"
  | "darkness"
  | "antimagic"
  | "water"
  | "treasure"
  | "treasure-open"
  | "npc";

export interface MapOverlayCell {
  x: number;
  y: number;
}

export interface MapOverlayEdge {
  /** Horizontal edges span (gridX, gridY) -> (gridX + 1, gridY). */
  axis: "horizontal" | "vertical";
  gridX: number;
  gridY: number;
  type: Exclude<EdgeType, "open">;
}

export interface MapOverlayLandmark {
  x: number;
  y: number;
  kind: MapOverlayLandmarkKind;
}

export interface MapOverlayModel {
  floorId: number;
  floorName: string;
  width: number;
  height: number;
  player: PlayerState;
  cells: readonly MapOverlayCell[];
  edges: readonly MapOverlayEdge[];
  landmarks: readonly MapOverlayLandmark[];
}

type MapOverlaySource = Pick<
  GameState,
  "floor" | "player" | "explored" | "lootTaken" | "talkedToNPCs" | "killedNPCs"
>;

function exploredCoordinates(source: MapOverlaySource): MapOverlayCell[] {
  const cells: MapOverlayCell[] = [];
  for (const key of source.explored) {
    const match = /^(\d+),(\d+)$/.exec(key);
    if (!match) continue;
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (x < 0 || y < 0 || x >= source.floor.width || y >= source.floor.height) continue;
    cells.push({ x, y });
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  return cells;
}

function featureLandmark(feature: TileFeature): MapOverlayLandmarkKind | null {
  switch (feature) {
    case "stairs_up":
      return "stairs-up";
    case "stairs_down":
      return "stairs-down";
    case "teleporter":
      return "teleporter";
    case "chute":
      return "chute";
    case "darkness":
      return "darkness";
    case "antimagic":
      return "antimagic";
    case "water":
      return "water";
    // Treasure and NPC visibility need progression-aware handling below.
    // Scripted events are intentionally never map landmarks: discovering the
    // surrounding terrain must not preview an untriggered event.
    case "treasure":
    case "npc":
    case "event":
      return null;
  }
}

function edgeCandidates(
  floor: FloorDef,
  x: number,
  y: number,
): { axis: MapOverlayEdge["axis"]; gridX: number; gridY: number; type: EdgeType }[] {
  const cell = floor.grid[y]![x]!;
  return [
    { axis: "horizontal", gridX: x, gridY: y, type: cell.n },
    { axis: "vertical", gridX: x + 1, gridY: y, type: cell.e },
    { axis: "horizontal", gridX: x, gridY: y + 1, type: cell.s },
    { axis: "vertical", gridX: x, gridY: y, type: cell.w },
  ];
}

/** Build a fog-safe model. No undiscovered cell or future landmark is copied. */
export function buildMapOverlayModel(source: MapOverlaySource): MapOverlayModel {
  const cells = exploredCoordinates(source);
  const explored = new Set(cells.map(({ x, y }) => `${x},${y}`));
  const edgesByKey = new Map<string, MapOverlayEdge>();
  const landmarks: MapOverlayLandmark[] = [];

  for (const { x, y } of cells) {
    for (const edge of edgeCandidates(source.floor, x, y)) {
      if (edge.type === "open") continue;
      const key = `${edge.axis}:${edge.gridX},${edge.gridY}`;
      if (!edgesByKey.has(key)) {
        edgesByKey.set(key, { ...edge, type: edge.type });
      }
    }

    const feature = source.floor.grid[y]![x]!.tile;
    if (feature) {
      const kind = featureLandmark(feature);
      if (kind) landmarks.push({ x, y, kind });
    }
  }

  const looted = source.lootTaken[source.floor.id] ?? new Set<string>();
  for (const treasure of source.floor.treasures ?? []) {
    const key = `${treasure.x},${treasure.y}`;
    if (!explored.has(key)) continue;
    landmarks.push({
      x: treasure.x,
      y: treasure.y,
      kind: looted.has(key) || treasure.itemIds.length === 0 ? "treasure-open" : "treasure",
    });
  }

  const metNPCs = new Set(source.talkedToNPCs);
  const killedNPCs = new Set(source.killedNPCs);
  for (const npc of source.floor.npcs ?? []) {
    if (
      explored.has(`${npc.x},${npc.y}`) &&
      metNPCs.has(npc.id) &&
      !killedNPCs.has(npc.id)
    ) {
      landmarks.push({ x: npc.x, y: npc.y, kind: "npc" });
    }
  }

  landmarks.sort((a, b) => a.y - b.y || a.x - b.x || a.kind.localeCompare(b.kind));

  return {
    floorId: source.floor.id,
    floorName: source.floor.name,
    width: source.floor.width,
    height: source.floor.height,
    player: { ...source.player },
    cells,
    edges: [...edgesByKey.values()],
    landmarks,
  };
}

export interface MapOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapOverlayViewport {
  mapRect: MapOverlayRect;
  cellSize: number;
  visibleColumns: number;
  visibleRows: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Grid-space (0,0) projected into canvas pixels. */
  originX: number;
  originY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeMapOverlayViewport(
  model: Pick<MapOverlayModel, "width" | "height" | "player">,
  canvasWidth: number,
  canvasHeight: number,
): MapOverlayViewport {
  const mapRect = {
    x: MAP_OVERLAY_CONFIG.mapPadding,
    y: MAP_OVERLAY_CONFIG.headerHeight,
    width: Math.max(1, Math.floor(canvasWidth - MAP_OVERLAY_CONFIG.mapPadding * 2)),
    height: Math.max(
      1,
      Math.floor(
        canvasHeight - MAP_OVERLAY_CONFIG.headerHeight - MAP_OVERLAY_CONFIG.footerHeight,
      ),
    ),
  };
  const fitColumns = Math.max(1, Math.min(model.width, MAP_OVERLAY_CONFIG.targetVisibleColumns));
  const fitRows = Math.max(1, Math.min(model.height, MAP_OVERLAY_CONFIG.targetVisibleRows));
  const rawCellSize = Math.min(
    Math.floor(mapRect.width / fitColumns),
    Math.floor(mapRect.height / fitRows),
  );
  const cellSize = clamp(
    rawCellSize,
    MAP_OVERLAY_CONFIG.minimumCellSize,
    MAP_OVERLAY_CONFIG.maximumCellSize,
  );
  const visibleColumns = Math.min(model.width, Math.max(1, Math.floor(mapRect.width / cellSize)));
  const visibleRows = Math.min(model.height, Math.max(1, Math.floor(mapRect.height / cellSize)));
  const minX = clamp(
    model.player.x - Math.floor(visibleColumns / 2),
    0,
    Math.max(0, model.width - visibleColumns),
  );
  const minY = clamp(
    model.player.y - Math.floor(visibleRows / 2),
    0,
    Math.max(0, model.height - visibleRows),
  );
  const pixelWidth = visibleColumns * cellSize;
  const pixelHeight = visibleRows * cellSize;
  const originX = mapRect.x + Math.floor((mapRect.width - pixelWidth) / 2) - minX * cellSize;
  const originY = mapRect.y + Math.floor((mapRect.height - pixelHeight) / 2) - minY * cellSize;

  return {
    mapRect,
    cellSize,
    visibleColumns,
    visibleRows,
    minX,
    minY,
    maxX: minX + visibleColumns - 1,
    maxY: minY + visibleRows - 1,
    originX,
    originY,
  };
}

export function cellToOverlayRect(
  viewport: MapOverlayViewport,
  x: number,
  y: number,
): MapOverlayRect {
  return {
    x: viewport.originX + x * viewport.cellSize,
    y: viewport.originY + y * viewport.cellSize,
    width: viewport.cellSize,
    height: viewport.cellSize,
  };
}

const NORTH_ARROW = [
  "0001000",
  "0011100",
  "0111110",
  "0001000",
  "0001000",
  "0001000",
  "0001000",
] as const;

function rotatePattern(pattern: readonly string[]): string[] {
  const size = pattern.length;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => pattern[size - 1 - x]![y]!).join(""),
  );
}

const EAST_ARROW = rotatePattern(NORTH_ARROW);
const SOUTH_ARROW = rotatePattern(EAST_ARROW);
const WEST_ARROW = rotatePattern(SOUTH_ARROW);
const ARROW_PATTERNS: readonly (readonly string[])[] = [
  NORTH_ARROW,
  EAST_ARROW,
  SOUTH_ARROW,
  WEST_ARROW,
];

/** Pixel rectangles for a four-direction marker; no canvas rotation/diagonals. */
export function playerMarkerRects(
  viewport: MapOverlayViewport,
  player: PlayerState,
): MapOverlayRect[] {
  const cell = cellToOverlayRect(viewport, player.x, player.y);
  const unit = Math.max(1, Math.floor(viewport.cellSize / 9));
  const size = unit * 7;
  const startX = cell.x + Math.floor((cell.width - size) / 2);
  const startY = cell.y + Math.floor((cell.height - size) / 2);
  const pattern = ARROW_PATTERNS[player.facing] ?? NORTH_ARROW;
  const rects: MapOverlayRect[] = [];
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y]!.length; x++) {
      if (pattern[y]![x] !== "1") continue;
      rects.push({ x: startX + x * unit, y: startY + y * unit, width: unit, height: unit });
    }
  }
  return rects;
}

const PALETTE = {
  floor: `rgba(154, 148, 130, ${MAP_OVERLAY_CONFIG.discoveredFloorAlpha})`,
  current: "rgba(224, 164, 88, 0.34)",
  wall: "rgba(224, 218, 198, 0.9)",
  door: "#e0a458",
  locked: "#d06050",
  player: "#ffd769",
  playerOutline: "#17100a",
  feature: "#d7c99d",
  dim: "#9c927d",
  separator: "rgba(224, 164, 88, 0.72)",
  mapField: "rgba(6, 7, 8, 0.18)",
} as const;

const LANDMARK_GLYPH: Record<MapOverlayLandmarkKind, string> = {
  "stairs-up": "U",
  "stairs-down": "D",
  teleporter: "*",
  chute: "V",
  darkness: "K",
  antimagic: "0",
  water: "~",
  treasure: "$",
  "treasure-open": "o",
  npc: "&",
};

const FACING_NAMES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;

function isInViewport(viewport: MapOverlayViewport, x: number, y: number): boolean {
  return x >= viewport.minX && x <= viewport.maxX && y >= viewport.minY && y <= viewport.maxY;
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  viewport: MapOverlayViewport,
  edge: MapOverlayEdge,
): void {
  const { cellSize, originX, originY } = viewport;
  const x = originX + edge.gridX * cellSize;
  const y = originY + edge.gridY * cellSize;
  const horizontal = edge.axis === "horizontal";
  const wallThickness = MAP_OVERLAY_CONFIG.wallThickness;

  if (edge.type === "wall") {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(
      horizontal ? x : x - Math.floor(wallThickness / 2),
      horizontal ? y - Math.floor(wallThickness / 2) : y,
      horizontal ? cellSize + 1 : wallThickness,
      horizontal ? wallThickness : cellSize + 1,
    );
    return;
  }

  const length = Math.max(6, Math.floor(cellSize / 2));
  const thickness = MAP_OVERLAY_CONFIG.doorThickness;
  const offset = Math.floor((cellSize - length) / 2);
  ctx.fillStyle = edge.type === "locked" ? PALETTE.locked : PALETTE.door;
  if (horizontal) {
    ctx.fillRect(x + offset, y - Math.floor(thickness / 2), length, thickness);
    ctx.fillRect(x + offset, y - 3, 2, 6);
    ctx.fillRect(x + offset + length - 2, y - 3, 2, 6);
    if (edge.type === "locked") ctx.fillRect(x + Math.floor(cellSize / 2) - 1, y - 5, 3, 10);
  } else {
    ctx.fillRect(x - Math.floor(thickness / 2), y + offset, thickness, length);
    ctx.fillRect(x - 3, y + offset, 6, 2);
    ctx.fillRect(x - 3, y + offset + length - 2, 6, 2);
    if (edge.type === "locked") ctx.fillRect(x - 5, y + Math.floor(cellSize / 2) - 1, 10, 3);
  }
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  model: MapOverlayModel,
  viewport: MapOverlayViewport,
): void {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE.mapField;
  ctx.fillRect(
    viewport.mapRect.x,
    viewport.mapRect.y,
    viewport.mapRect.width,
    viewport.mapRect.height,
  );

  ctx.fillStyle = PALETTE.separator;
  ctx.fillRect(10, MAP_OVERLAY_CONFIG.headerHeight - 7, canvas.width - 20, 2);
  ctx.fillRect(
    10,
    canvas.height - MAP_OVERLAY_CONFIG.footerHeight + 5,
    canvas.width - 20,
    2,
  );

  ctx.font = '20px "FF36", "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.feature;
  const heading = `FLOOR ${model.floorId} · ${model.floorName.toUpperCase()}`;
  ctx.fillText(fitCanvasText(ctx, heading, canvas.width - 34), Math.floor(canvas.width / 2), 25);

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    viewport.mapRect.x,
    viewport.mapRect.y,
    viewport.mapRect.width,
    viewport.mapRect.height,
  );
  ctx.clip();

  for (const cell of model.cells) {
    if (!isInViewport(viewport, cell.x, cell.y)) continue;
    const rect = cellToOverlayRect(viewport, cell.x, cell.y);
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 1, rect.height - 1);
  }

  for (const edge of model.edges) drawEdge(ctx, viewport, edge);

  ctx.font = `bold ${Math.max(12, Math.floor(viewport.cellSize * 0.58))}px "FF36", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.feature;
  for (const landmark of model.landmarks) {
    if (!isInViewport(viewport, landmark.x, landmark.y)) continue;
    const rect = cellToOverlayRect(viewport, landmark.x, landmark.y);
    ctx.fillText(
      LANDMARK_GLYPH[landmark.kind],
      rect.x + Math.floor(rect.width / 2),
      rect.y + Math.floor(rect.height / 2) + 1,
    );
  }
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  model: MapOverlayModel,
  viewport: MapOverlayViewport,
): void {
  const cell = cellToOverlayRect(viewport, model.player.x, model.player.y);
  ctx.fillStyle = PALETTE.current;
  ctx.fillRect(cell.x + 2, cell.y + 2, cell.width - 3, cell.height - 3);
  const rects = playerMarkerRects(viewport, model.player);
  ctx.fillStyle = PALETTE.playerOutline;
  for (const rect of rects) {
    ctx.fillRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2);
  }
  ctx.fillStyle = PALETTE.player;
  for (const rect of rects) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawDynamicLayer(
  ctx: CanvasRenderingContext2D,
  model: MapOverlayModel,
  viewport: MapOverlayViewport,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    viewport.mapRect.x,
    viewport.mapRect.y,
    viewport.mapRect.width,
    viewport.mapRect.height,
  );
  ctx.clip();
  drawPlayer(ctx, model, viewport);
  ctx.restore();

  ctx.font = '16px "FF36", "Courier New", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.dim;
  const footerY = ctx.canvas.height - 16;
  ctx.fillText(
    `X ${model.player.x} · Y ${model.player.y} · FACING ${FACING_NAMES[model.player.facing]}`,
    16,
    footerY,
  );
  ctx.textAlign = "right";
  ctx.fillText("NORTH ^", ctx.canvas.width - 16, footerY);
}

function currentFloorSetSize(record: Record<number, Set<string>>, floorId: number): number {
  return record[floorId]?.size ?? 0;
}

/**
 * Retained renderer: a cheap signature check runs each frame, while map-model
 * construction and canvas painting happen only after a discrete state change.
 * The static terrain layer is reused when only the player's facing changes.
 */
export class MapOverlayRenderer {
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private lastRenderSignature = "";
  private lastStaticSignature = "";

  constructor(documentRef: Document = document) {
    this.staticCanvas = documentRef.createElement("canvas");
    this.staticCanvas.width = MAP_OVERLAY_CONFIG.canvasWidth;
    this.staticCanvas.height = MAP_OVERLAY_CONFIG.canvasHeight;
    const context = this.staticCanvas.getContext("2d");
    if (!context) throw new Error("Map overlay requires a 2D canvas context");
    this.staticCtx = context;
  }

  invalidate(): void {
    this.lastRenderSignature = "";
    this.lastStaticSignature = "";
  }

  renderIfNeeded(ctx: CanvasRenderingContext2D, state: GameState): boolean {
    const contentSignature = [
      state.floor.id,
      state.floor.width,
      state.floor.height,
      state.explored.size,
      state.unlockedDoors.size,
      currentFloorSetSize(state.lootTaken, state.floor.id),
      state.talkedToNPCs.length,
      state.killedNPCs.length,
    ].join(":");
    const renderSignature = [
      contentSignature,
      state.player.x,
      state.player.y,
      state.player.facing,
      ctx.canvas.width,
      ctx.canvas.height,
    ].join(":");
    if (renderSignature === this.lastRenderSignature) return false;

    const model = buildMapOverlayModel(state);
    const viewport = computeMapOverlayViewport(model, ctx.canvas.width, ctx.canvas.height);
    const staticSignature = [
      contentSignature,
      viewport.minX,
      viewport.minY,
      viewport.maxX,
      viewport.maxY,
      viewport.cellSize,
      ctx.canvas.width,
      ctx.canvas.height,
    ].join(":");

    if (
      this.staticCanvas.width !== ctx.canvas.width ||
      this.staticCanvas.height !== ctx.canvas.height
    ) {
      this.staticCanvas.width = ctx.canvas.width;
      this.staticCanvas.height = ctx.canvas.height;
      this.lastStaticSignature = "";
    }
    if (staticSignature !== this.lastStaticSignature) {
      drawStaticLayer(this.staticCtx, model, viewport);
      this.lastStaticSignature = staticSignature;
    }

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.staticCanvas, 0, 0);
    drawDynamicLayer(ctx, model, viewport);
    ctx.canvas.setAttribute(
      "aria-label",
      `Floor ${model.floorId}, ${model.floorName}. Player at ${model.player.x}, ${model.player.y}, facing ${FACING_NAMES[model.player.facing].toLowerCase()}. North is up.`,
    );
    this.lastRenderSignature = renderSignature;
    return true;
  }
}
