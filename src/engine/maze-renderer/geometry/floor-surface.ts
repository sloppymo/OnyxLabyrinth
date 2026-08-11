import type { RampDef } from "../../../data/floors";
import {
  resolveCellVolume,
  type CellVolumeSource,
} from "./cell-volume";

export type SurfaceDirection = RampDef["dir"];

export type FloorSurface =
  | { kind: "flat"; z: number }
  | {
      kind: "ramp" | "stairs";
      lowZ: number;
      highZ: number;
      dir: SurfaceDirection;
    };

export interface FloorSurfaceSource extends CellVolumeSource {
  width: number;
  height: number;
  ramps?: readonly RampDef[];
}

export interface SurfaceEdgeHeights {
  /** First endpoint in global order: west for N/S, north for E/W. */
  z0: number;
  /** Second endpoint in global order: east for N/S, south for E/W. */
  z1: number;
}

const DELTA: Record<SurfaceDirection, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

export const OPPOSITE_SURFACE_DIRECTION: Record<
  SurfaceDirection,
  SurfaceDirection
> = { n: "s", e: "w", s: "n", w: "e" };

export function rampAt(
  floor: Pick<FloorSurfaceSource, "ramps">,
  x: number,
  y: number
): RampDef | undefined {
  return floor.ramps?.find((ramp) => ramp.x === x && ramp.y === y);
}

/**
 * Resolve the authored traversable surface for one cell.
 *
 * A connector's low endpoint is its CellVolume.floorZ. Its high endpoint is
 * the uphill neighbor's resolved floorZ. This makes gradual chains concise:
 * cells based at 0, .25, .5 and .75 naturally resolve to four .25 rises.
 */
export function resolveFloorSurface(
  floor: FloorSurfaceSource,
  x: number,
  y: number
): FloorSurface {
  const volume = resolveCellVolume(floor, x, y);
  const ramp = rampAt(floor, x, y);
  if (!ramp) return { kind: "flat", z: volume.floorZ };
  const [dx, dy] = DELTA[ramp.dir];
  const highZ = resolveCellVolume(floor, x + dx, y + dy).floorZ;
  return {
    kind: ramp.surface,
    lowZ: volume.floorZ,
    highZ,
    dir: ramp.dir,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Local coordinates use x west→east and y north→south. */
export function floorSurfaceZAt(
  surface: FloorSurface,
  localX: number,
  localY: number
): number {
  if (surface.kind === "flat") return surface.z;
  const x = clamp01(localX);
  const y = clamp01(localY);
  const progress =
    surface.dir === "n"
      ? 1 - y
      : surface.dir === "s"
        ? y
        : surface.dir === "e"
          ? x
          : 1 - x;
  return surface.lowZ + (surface.highZ - surface.lowZ) * progress;
}

export function floorSurfaceEdgeHeights(
  surface: FloorSurface,
  dir: SurfaceDirection
): SurfaceEdgeHeights {
  if (dir === "n") {
    return {
      z0: floorSurfaceZAt(surface, 0, 0),
      z1: floorSurfaceZAt(surface, 1, 0),
    };
  }
  if (dir === "s") {
    return {
      z0: floorSurfaceZAt(surface, 0, 1),
      z1: floorSurfaceZAt(surface, 1, 1),
    };
  }
  if (dir === "w") {
    return {
      z0: floorSurfaceZAt(surface, 0, 0),
      z1: floorSurfaceZAt(surface, 0, 1),
    };
  }
  return {
    z0: floorSurfaceZAt(surface, 1, 0),
    z1: floorSurfaceZAt(surface, 1, 1),
  };
}

export function isConnectorSide(
  surface: FloorSurface,
  dir: SurfaceDirection
): boolean {
  return (
    surface.kind !== "flat" &&
    dir !== surface.dir &&
    dir !== OPPOSITE_SURFACE_DIRECTION[surface.dir]
  );
}

export function surfacesConnectAcrossEdge(
  floor: FloorSurfaceSource,
  x: number,
  y: number,
  dir: SurfaceDirection,
  epsilon = 1e-6
): boolean {
  const [dx, dy] = DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) return false;
  const a = resolveFloorSurface(floor, x, y);
  const b = resolveFloorSurface(floor, nx, ny);
  if (isConnectorSide(a, dir)) return false;
  if (isConnectorSide(b, OPPOSITE_SURFACE_DIRECTION[dir])) return false;
  const edgeA = floorSurfaceEdgeHeights(a, dir);
  const edgeB = floorSurfaceEdgeHeights(b, OPPOSITE_SURFACE_DIRECTION[dir]);
  return (
    Math.abs(edgeA.z0 - edgeB.z0) <= epsilon &&
    Math.abs(edgeA.z1 - edgeB.z1) <= epsilon
  );
}

/** Sample the real surface beneath an interpolated camera world position. */
export function floorSurfaceZAtWorldPosition(
  floor: FloorSurfaceSource,
  worldX: number,
  worldY: number
): number {
  const x = Math.max(0, Math.min(floor.width - 1, Math.floor(worldX)));
  const y = Math.max(0, Math.min(floor.height - 1, Math.floor(worldY)));
  return floorSurfaceZAt(
    resolveFloorSurface(floor, x, y),
    worldX - x,
    worldY - y
  );
}

export function maxFloorSurfaceZ(surface: FloorSurface): number {
  return surface.kind === "flat"
    ? surface.z
    : Math.max(surface.lowZ, surface.highZ);
}
