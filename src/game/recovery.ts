/**
 * Local recovery helpers for campaign wipe re-entry.
 *
 * Recovery is deliberately smaller than a checkpoint system: it validates a
 * saved floor/coordinate, then searches the nearby traversable geometry when
 * the exact cell is no longer a safe place to stand (for example, a chest,
 * one-way feature, void cell, or stale authored coordinate).
 */

import type { FloorDef } from "../data/floors";
import type { EdgeType, Facing } from "../types";
import { DX, DY, edgeInDirection } from "./dungeon";
import {
  resolveFloorSurface,
  surfacesConnectAcrossEdge,
} from "../engine/maze-renderer/geometry/floor-surface";
import {
  MIN_CAMERA_CLEARANCE,
  resolveCellVolume,
} from "../engine/maze-renderer/geometry/cell-volume";

const DIRECTIONS: readonly Facing[] = [0, 1, 2, 3];
const OPPOSITE: readonly Facing[] = [2, 3, 0, 1];
const PASSABLE_EDGES: ReadonlySet<EdgeType> = new Set(["open", "door"]);

export interface RecoveryPosition {
  floorId: number;
  x: number;
  y: number;
  facing: Facing;
}

export interface RecoveryLanding {
  x: number;
  y: number;
  exact: boolean;
  /** Manhattan distance from the requested checkpoint when a fallback lands. */
  distance: number;
  reason: "exact" | "unsafe-feature" | "unsafe-event" | "invalid-cell" | "no-safe-local-cell";
}

export interface RecoveryPathAnalysis {
  available: boolean;
  length: number | null;
  crossedDoors: number;
  crossedGates: number;
  crossedStairs: string[];
  crossedEvents: string[];
  cells: Array<{ x: number; y: number; tile?: string }>;
}

function edgePassable(edge: EdgeType | undefined): boolean {
  return edge !== undefined && PASSABLE_EDGES.has(edge);
}

function tileIsForcedOrInteractive(tile: string | undefined): boolean {
  // Recovery should return the party to ordinary floor, not immediately into
  // a trap prompt, one-way transition, stair, NPC panel, chest, or guardian.
  return tile !== undefined;
}

function hasLegalExit(floor: FloorDef, x: number, y: number): boolean {
  const cell = floor.grid[y]?.[x];
  if (!cell) return false;
  for (const direction of DIRECTIONS) {
    const nx = x + DX[direction];
    const ny = y + DY[direction];
    const neighbor = floor.grid[ny]?.[nx];
    if (!neighbor || neighbor.void) continue;
    if (!edgePassable(edgeInDirection(cell, direction))) continue;
    if (!edgePassable(edgeInDirection(neighbor, OPPOSITE[direction]))) continue;
    if (!surfacesConnectAcrossEdge(floor, x, y, ["n", "e", "s", "w"][direction] as "n" | "e" | "s" | "w")) continue;
    return true;
  }
  return false;
}

/** True when a floor cell is a safe ordinary place to re-enter. */
export function isSafeRecoveryLanding(floor: FloorDef, x: number, y: number): boolean {
  const cell = floor.grid[y]?.[x];
  if (!cell || cell.void || tileIsForcedOrInteractive(cell.tile)) return false;
  if (floor.events?.some((event) => event.x === x && event.y === y)) return false;
  const volume = resolveCellVolume(floor, x, y);
  if (!Number.isFinite(volume.floorZ) || !Number.isFinite(volume.ceilingZ)) return false;
  if (volume.ceilingZ - volume.floorZ < MIN_CAMERA_CLEARANCE) return false;
  const surface = resolveFloorSurface(floor, x, y);
  if (surface.kind !== "flat" &&
      (!Number.isFinite(surface.lowZ) || !Number.isFinite(surface.highZ))) {
    return false;
  }
  return hasLegalExit(floor, x, y);
}

function nearestCandidateCells(floor: FloorDef, x: number, y: number, radius: number) {
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let cy = Math.max(0, y - radius); cy <= Math.min(floor.height - 1, y + radius); cy++) {
    for (let cx = Math.max(0, x - radius); cx <= Math.min(floor.width - 1, x + radius); cx++) {
      candidates.push({ x: cx, y: cy, distance: Math.abs(cx - x) + Math.abs(cy - y) });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
}

/** Resolve a checkpoint to exact floor or a nearby safe ordinary cell. */
export function resolveRecoveryLanding(
  floor: FloorDef,
  x: number,
  y: number,
  radius = 4
): RecoveryLanding {
  if (isSafeRecoveryLanding(floor, x, y)) {
    return { x, y, exact: true, distance: 0, reason: "exact" };
  }

  const requestedCell = floor.grid[y]?.[x];
  const reason = !requestedCell || requestedCell.void
    ? "invalid-cell"
    : requestedCell.tile
      ? "unsafe-feature"
      : floor.events?.some((event) => event.x === x && event.y === y)
        ? "unsafe-event"
      : "no-safe-local-cell";
  const candidate = nearestCandidateCells(floor, x, y, radius).find((entry) =>
    isSafeRecoveryLanding(floor, entry.x, entry.y)
  );
  if (candidate) {
    return { ...candidate, exact: false, reason };
  }

  const start = nearestCandidateCells(floor, floor.startX, floor.startY, Math.max(floor.width, floor.height))
    .find((entry) => isSafeRecoveryLanding(floor, entry.x, entry.y));
  if (start) return { ...start, exact: false, reason: "no-safe-local-cell" };
  return {
    x: floor.startX,
    y: floor.startY,
    exact: false,
    distance: Math.abs(floor.startX - x) + Math.abs(floor.startY - y),
    reason: "no-safe-local-cell",
  };
}

/** Analyze whether the actual re-entry can still reach the failed cell. */
export function analyzeRecoveryPath(
  floor: FloorDef,
  from: { x: number; y: number },
  to: { x: number; y: number }
): RecoveryPathAnalysis {
  const startCell = floor.grid[from.y]?.[from.x];
  const targetCell = floor.grid[to.y]?.[to.x];
  if (!startCell || startCell.void || !targetCell || targetCell.void) {
    return { available: false, length: null, crossedDoors: 0, crossedGates: 0, crossedStairs: [], crossedEvents: [], cells: [] };
  }

  const startKey = `${from.x},${from.y}`;
  const targetKey = `${to.x},${to.y}`;
  const queue: Array<{ x: number; y: number }> = [{ ...from }];
  const previous = new Map<string, { key: string; direction: Facing }>();
  const seen = new Set([startKey]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    if (`${current.x},${current.y}` === targetKey) break;
    const cell = floor.grid[current.y]?.[current.x];
    if (!cell) continue;
    for (const direction of DIRECTIONS) {
      const nx = current.x + DX[direction];
      const ny = current.y + DY[direction];
      const neighbor = floor.grid[ny]?.[nx];
      if (!neighbor || neighbor.void) continue;
      if (!edgePassable(edgeInDirection(cell, direction))) continue;
      if (!edgePassable(edgeInDirection(neighbor, OPPOSITE[direction]))) continue;
      if (!surfacesConnectAcrossEdge(floor, current.x, current.y, ["n", "e", "s", "w"][direction] as "n" | "e" | "s" | "w")) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      previous.set(key, { key: `${current.x},${current.y}`, direction });
      queue.push({ x: nx, y: ny });
    }
  }

  if (!seen.has(targetKey)) {
    return { available: false, length: null, crossedDoors: 0, crossedGates: 0, crossedStairs: [], crossedEvents: [], cells: [] };
  }

  const cells: Array<{ x: number; y: number; tile?: string }> = [];
  const directions: Array<{ from: { x: number; y: number }; direction: Facing }> = [];
  let cursor = targetKey;
  while (cursor !== startKey) {
    const entry = previous.get(cursor);
    if (!entry) break;
    const [x, y] = cursor.split(",").map(Number);
    cells.push({ x, y, tile: floor.grid[y]?.[x]?.tile });
    const [fromX, fromY] = entry.key.split(",").map(Number);
    directions.push({ from: { x: fromX, y: fromY }, direction: entry.direction });
    cursor = entry.key;
  }
  const [startX, startY] = startKey.split(",").map(Number);
  cells.push({ x: startX, y: startY, tile: floor.grid[startY]?.[startX]?.tile });
  cells.reverse();
  directions.reverse();

  let crossedDoors = 0;
  let crossedGates = 0;
  for (const step of directions) {
    const cell = floor.grid[step.from.y]?.[step.from.x];
    const edge = cell ? edgeInDirection(cell, step.direction) : undefined;
    if (edge === "door") crossedDoors++;
    if (floor.barredGates?.some((gate) =>
      gate.x === step.from.x && gate.y === step.from.y && gate.dir === ["n", "e", "s", "w"][step.direction]
    )) crossedGates++;
  }
  return {
    available: true,
    length: Math.max(0, cells.length - 1),
    crossedDoors,
    crossedGates,
    crossedStairs: cells.filter((cell) => cell.tile === "stairs_up" || cell.tile === "stairs_down").map((cell) => `${cell.x},${cell.y}:${cell.tile}`),
    crossedEvents: cells.filter((cell) => cell.tile === "event").map((cell) => `${cell.x},${cell.y}`),
    cells,
  };
}
