/**
 * Traversal resolver — the single game-level API for movement intent.
 *
 * Replaces the boolean `canMove()` in camera.ts with a result type that
 * distinguishes ordinary steps, blocked moves, raft-route triggers, and
 * barred-gate interactions. The movement controller (main.ts) executes
 * the result through one pathway; camera.ts no longer independently
 * decides whether to step and then separately discovers special cases.
 *
 * Design doc: Floor 1 redesign — raft/tavern/shortcut progression.
 */

import type { GameState, PlayerState, EdgeType } from "../types";
import type {
  BarredGateDef,
  FloorDef,
  RaftRouteDef,
  VerticalLandingDef,
  WaterDef,
} from "../data/floors";
import { DX, DY, emptyCell, inBounds } from "./dungeon";
import { resolveCellVolume } from "../engine/maze-renderer/geometry/cell-volume";
import {
  floorSurfaceZAt,
  resolveFloorSurface,
  surfacesConnectAcrossEdge,
} from "../engine/maze-renderer/geometry/floor-surface";

/** Direction as an integer (0=N, 1=E, 2=S, 3=W). */
export type Direction = 0 | 1 | 2 | 3;

/** Result of resolving a movement intent in a given direction. */
export type TraversalResult =
  | { kind: "step"; x: number; y: number; z: number }
  | { kind: "blocked"; message?: string }
  | { kind: "raft"; routeId: string; reverse: boolean }
  | { kind: "barred-gate"; gateId: string; canOpen: boolean; message?: string };

/** Discrete vertical quantum for authored landings and canonical positions. */
export const VERTICAL_QUANTUM = 0.25;

/** Snap an authored Z to the nearest quantum step. */
export function quantizeZ(z: number, quantum = VERTICAL_QUANTUM): number {
  const n = Math.round(z / quantum);
  return n * quantum;
}

/** Canonical player Z: validate an explicit `z` against the floor's supported
 *  surfaces (landings, flat/ramp surface centre), otherwise resolve from
 *  heightZones. Stale or unsupported Z values fall back to the cell's base
 *  floor, which is the safe recovery path for old saves and floor edits. */
export function resolvePlayerZ(
  player: Pick<PlayerState, "x" | "y" | "z">,
  floor: FloorDef
): number {
  const z = player.z;
  if (z === undefined || !Number.isFinite(z)) {
    return resolveCellVolume(floor, player.x, player.y).floorZ;
  }

  // If the player is standing on an authored landing, use the landing's Z.
  const landing = landingAt(floor, player.x, player.y, z);
  if (landing) return landing.z;

  // Otherwise the player must be on the physical surface at the cell centre.
  const surface = resolveFloorSurface(floor, player.x, player.y);
  const centreZ = floorSurfaceZAt(surface, 0.5, 0.5);
  if (sameZ(z, centreZ)) return z;

  // Unsupported position: recover to the base surface.
  return resolveCellVolume(floor, player.x, player.y).floorZ;
}

// --- Stacked Z helpers --------------------------------------------------

/** Tolerance for authored vertical-quantum equality. */
export const VERTICAL_EPSILON = 1e-6;

/** Exact-enough Z comparison for authored discrete landing heights. */
export function sameZ(a: number, b: number): boolean {
  return Math.abs(a - b) <= VERTICAL_EPSILON;
}

/** Find the explicit vertical landing at an exact (x, y, z) position. */
export function landingAt(
  floor: FloorDef,
  x: number,
  y: number,
  z: number
): VerticalLandingDef | undefined {
  return floor.verticalLandings?.find(
    (l) => l.x === x && l.y === y && sameZ(l.z, z)
  );
}

/**
 * Effective N/E/S/W edge semantics for a navigable (x, y, z).
 *
 * The base grid is the default when no explicit landing exists. An explicit
 * landing at that exact Z owns all four edges; any omitted edge defaults to
 * "wall" so upper storeys cannot accidentally inherit base-grid connectivity.
 * This is the single source of truth for all stacked-cell edge lookup —
 * traversal, validators, automap, and AI should call this helper.
 */
export function resolveLandingEdges(
  floor: FloorDef,
  x: number,
  y: number,
  z: number
): Record<"n" | "e" | "s" | "w", EdgeType> {
  const base = floor.grid[y]?.[x] ?? emptyCell();
  const landing = landingAt(floor, x, y, z);
  if (!landing) return base;
  return {
    n: landing.edgeOverrides?.n ?? "wall",
    e: landing.edgeOverrides?.e ?? "wall",
    s: landing.edgeOverrides?.s ?? "wall",
    w: landing.edgeOverrides?.w ?? "wall",
  };
}

function entryPointForDir(
  dir: "n" | "e" | "s" | "w"
): { localX: number; localY: number } {
  switch (dir) {
    case "n":
      return { localX: 0.5, localY: 0 };
    case "e":
      return { localX: 1, localY: 0.5 };
    case "s":
      return { localX: 0.5, localY: 1 };
    case "w":
      return { localX: 0, localY: 0.5 };
  }
}

/**
 * Resolve the destination Z for a step whose source exit edge is at
 * `sourceExitZ` and is moving `dir` to (nx, ny). Returns undefined when the
 * destination has no landing or physically compatible surface for that edge.
 *
 * For a flat or landing, the destination settled Z equals the entry Z. For a
 * ramp/stair connector, the destination is the cell's *center* Z (e.g. 0.5 for
 * a 0->1 ramp), not the entry edge, so the player rests mid-ramp.
 */
export function resolveStepZ(
  floor: FloorDef,
  nx: number,
  ny: number,
  sourceExitZ: number,
  dir: Direction
): number | undefined {
  // Landing-to-landing: keep the same authored Z if the destination supports it.
  const landing = landingAt(floor, nx, ny, sourceExitZ);
  if (landing) return landing.z;

  // Otherwise, land on the physical surface at the entry edge.
  const surface = resolveFloorSurface(floor, nx, ny);
  const oppDir = DIR_NAMES[OPP_DIRS[dir]];
  const pt = entryPointForDir(oppDir);
  const destEntryZ = floorSurfaceZAt(surface, pt.localX, pt.localY);
  if (!sameZ(sourceExitZ, destEntryZ)) {
    return undefined;
  }
  return floorSurfaceZAt(surface, 0.5, 0.5);
}

/** Z of the source edge the player is leaving from. */
export function resolveSourceExitZ(
  floor: FloorDef,
  x: number,
  y: number,
  z: number,
  dir: Direction
): number {
  if (landingAt(floor, x, y, z)) return z;
  const surface = resolveFloorSurface(floor, x, y);
  const pt = entryPointForDir(DIR_NAMES[dir]);
  return floorSurfaceZAt(surface, pt.localX, pt.localY);
}

// --- Direction helpers --------------------------------------------------

const DIR_NAMES = ["n", "e", "s", "w"] as const;
const OPP_DIRS: Direction[] = [2, 3, 0, 1];

function dirToName(dir: Direction): (typeof DIR_NAMES)[number] {
  return DIR_NAMES[dir];
}

function nameToDir(name: "n" | "e" | "s" | "w"): Direction {
  return DIR_NAMES.indexOf(name) as Direction;
}

// --- Water lookup -------------------------------------------------------

/** Find the water definition at (x,y), if any. */
export function waterAt(floor: FloorDef, x: number, y: number): WaterDef | undefined {
  return floor.waters?.find((w) => w.x === x && w.y === y);
}

/** True if (x,y) is a raft-channel water tile. */
export function isRaftChannel(floor: FloorDef, x: number, y: number): boolean {
  return waterAt(floor, x, y)?.raftChannel === true;
}

// --- Raft route lookup --------------------------------------------------

/** Find a raft route whose fromDock or toDock is at (x,y), considering
 *  approach direction. Returns the route and whether it's the reverse
 *  (toDock) end. */
export function raftRouteAt(
  floor: FloorDef,
  x: number,
  y: number,
  approachDir: Direction
): { route: RaftRouteDef; reverse: boolean } | undefined {
  const routes = floor.raftRoutes;
  if (!routes) return undefined;
  for (const route of routes) {
    // Forward: player steps onto fromDock moving in fromApproach direction.
    if (
      route.fromDock.x === x &&
      route.fromDock.y === y &&
      nameToDir(route.fromApproach) === approachDir
    ) {
      return { route, reverse: false };
    }
    // Reverse: bidirectional route, player steps onto toDock moving in
    // the opposite of toApproach direction (i.e. approaching toDock from
    // the far side).
    if (
      route.bidirectional &&
      route.toDock.x === x &&
      route.toDock.y === y &&
      nameToDir(route.toApproach) === approachDir
    ) {
      return { route, reverse: true };
    }
  }
  return undefined;
}

// --- Barred gate lookup -------------------------------------------------

/** Find a barred gate at (x,y) with its barred edge in the given direction. */
export function barredGateAt(
  floor: FloorDef,
  x: number,
  y: number,
  dir: Direction
): BarredGateDef | undefined {
  const gates = floor.barredGates;
  if (!gates) return undefined;
  const dName = dirToName(dir);
  return gates.find((g) => g.x === x && g.y === y && g.dir === dName);
}

/** True if the player at (x,y) facing `dir` can open the barred gate ahead.
 *  The gate can only be opened from the opensFrom side — i.e. the player's
 *  facing direction must match the gate's opensFrom field. */
export function canOpenBarredGate(
  floor: FloorDef,
  x: number,
  y: number,
  dir: Direction
): boolean {
  const gate = barredGateAt(floor, x, y, dir);
  if (!gate) return false;
  return gate.opensFrom === dirToName(dir);
}

/** Open a barred gate from the correct side. Sets both edges to "door"
 *  permanently and records the unlock. Returns true on success.
 *  Cannot be picked by Thief or bypassed by Knock/Unseal — this is the
 *  ONLY way to open a barred gate. */
export function openBarredGate(state: GameState, dir: Direction): boolean {
  const { floor, player } = state;
  const gate = barredGateAt(floor, player.x, player.y, dir);
  if (!gate) return false;
  if (gate.opensFrom !== dirToName(dir)) return false;

  const cell = floor.grid[player.y][player.x];
  const dName = dirToName(dir);
  const nx = player.x + DX[dir];
  const ny = player.y + DY[dir];
  if (!inBounds(floor.grid, nx, ny)) return false;

  const oppName = dirToName(OPP_DIRS[dir]);
  const targetCell = floor.grid[ny][nx];

  // Set both edges to "door" (permanent two-way passage).
  cell[dName] = "door";
  targetCell[oppName] = "door";

  // Record in unlockedDoors so the state persists within the session.
  const key = `${floor.id}:${player.x}:${player.y}:${dName}`;
  state.unlockedDoors.add(key);

  return true;
}

// --- Traversal resolver -------------------------------------------------

/**
 * Resolve a movement intent: the player at their current position wants
 * to step in `dir`. Returns a TraversalResult describing what should
 * happen. The caller (main.ts movement controller) executes the result.
 *
 * Checks (in order):
 * 1. Edge passability (wall/locked/barred block; open/door pass)
 * 2. Target tile in bounds
 * 3. Target tile's reverse edge passable
 * 4. Raft-channel water on target → blocked (with message)
 * 5. Raft route trigger at current position → "raft" result
 * 6. Barred gate ahead → "barred-gate" result (may be openable)
 * 7. Otherwise → "step" result
 */
export function resolveTraversal(
  state: GameState,
  dir: Direction
): TraversalResult {
  const { floor, player } = state;
  if (!inBounds(floor.grid, player.x, player.y)) {
    return { kind: "blocked" };
  }

  const z = resolvePlayerZ(player, floor);
  const baseZ = resolveCellVolume(floor, player.x, player.y).floorZ;
  const sourceEdges = resolveLandingEdges(floor, player.x, player.y, z);
  const edge = sourceEdges[dirToName(dir)];

  // Check for raft route trigger FIRST. Raft docks and their routes are
  // base-surface features; an explicit landing above the dock must not
  // accidentally launch the raft from an upper storey.
  const raftHit = raftRouteAt(floor, player.x, player.y, dir);
  if (raftHit && state.keyItems.includes("raft") && sameZ(z, baseZ)) {
    return {
      kind: "raft",
      routeId: raftHit.route.id,
      reverse: raftHit.reverse,
    };
  }

  // Edge check: wall, locked, and barred all block normal movement.
  if (edge === "wall") {
    return { kind: "blocked" };
  }
  if (edge === "locked") {
    return { kind: "blocked", message: "A locked door blocks the way." };
  }
  if (edge === "barred") {
    // Barred gates are physical, base-surface mechanisms; they can only be
    // opened while the player is actually standing on that surface.
    const canOpen =
      canOpenBarredGate(floor, player.x, player.y, dir) && sameZ(z, baseZ);
    const gate = barredGateAt(floor, player.x, player.y, dir);
    const gateId = gate ? `${gate.x}:${gate.y}:${gate.dir}` : "";
    return {
      kind: "barred-gate",
      gateId,
      canOpen,
      message: canOpen
        ? undefined
        : "A barred gate blocks the way. It cannot be opened from this side.",
    };
  }

  const nx = player.x + DX[dir];
  const ny = player.y + DY[dir];
  if (!inBounds(floor.grid, nx, ny)) {
    return { kind: "blocked" };
  }

  const sourceExitZ = resolveSourceExitZ(floor, player.x, player.y, z, dir);
  const destZ = resolveStepZ(floor, nx, ny, sourceExitZ, dir);
  if (destZ === undefined) {
    return {
      kind: "blocked",
      message: "The way is too steep here.",
    };
  }

  // Check target landing's reverse edge at the destination Z.
  const targetEdges = resolveLandingEdges(floor, nx, ny, destZ);
  const oppEdge = targetEdges[dirToName(OPP_DIRS[dir])];
  if (oppEdge === "wall" || oppEdge === "locked" || oppEdge === "barred") {
    return { kind: "blocked" };
  }

  // Grid edges remain authoritative, but a geometrically open edge is only
  // walkable when both authored floor surfaces meet at that boundary. This
  // admits ramp/stair endpoints and rejects raw vertical steps or ambiguous
  // connector-side entry without consulting the Three scene.
  if (!surfacesConnectAcrossEdge(floor, player.x, player.y, dirToName(dir))) {
    return {
      kind: "blocked",
      message: "The change in elevation is too steep to cross here.",
    };
  }

  // Raft-channel water on the target tile: impassable via normal movement.
  if (isRaftChannel(floor, nx, ny)) {
    // If the player has the raft, check if there's a route from the
    // current dock. If not (e.g. approaching from wrong side), still block.
    if (raftHit && state.keyItems.includes("raft")) {
      // This shouldn't be reached (raft route check is above), but guard
      // against logic errors.
      return {
        kind: "raft",
        routeId: raftHit.route.id,
        reverse: raftHit.reverse,
      };
    }
    return {
      kind: "blocked",
      message: state.keyItems.includes("raft")
        ? "The raft cannot launch from here. You need a dock."
        : "The water ahead is deep and still. You need a raft to cross.",
    };
  }

  return { kind: "step", x: nx, y: ny, z: destZ };
}

/** Convenience: true if the traversal result allows movement (step or raft). */
export function isPassable(result: TraversalResult): boolean {
  return result.kind === "step" || result.kind === "raft";
}
