import type { FloorDef } from "../../../data/floors";
import { themeAt } from "../../../game/floor-map";
import type { Cell, EdgeType } from "../../../types";
import {
  compileOpenBoundaryPatches,
  fullBoundaryPatch,
  type BoundaryPatch,
} from "../geometry/boundary-spans";
import {
  LEGACY_VERTICAL_UNIT,
  resolveCellVolume,
} from "../geometry/cell-volume";
import {
  floorSurfaceEdgeHeights,
  floorSurfaceZAt,
  OPPOSITE_SURFACE_DIRECTION,
  resolveFloorSurface,
  type FloorSurface,
} from "../geometry/floor-surface";

export type MazeSurfaceKind = "floor" | "ceiling" | "wall" | "door";

export type CompiledMazeFaceRole =
  | "cell-surface"
  | "stair-tread"
  | "stair-riser"
  | "boundary";

/** Provenance for one emitted quad, retained for debug/inspection tools. */
export interface CompiledMazeFace {
  cellX: number;
  cellY: number;
  kind: MazeSurfaceKind;
  role: CompiledMazeFaceRole;
  dir?: Direction;
  edge?: EdgeType;
  patch?: BoundaryPatch;
}

export interface CompiledMazeBatch {
  chunkX: number;
  chunkY: number;
  materialKey: string;
  kind: MazeSurfaceKind;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  /** One entry per quad, in the same order as the four emitted vertices. */
  faces: CompiledMazeFace[];
}

export interface CompiledMazeGeometry {
  chunkSize: number;
  batches: CompiledMazeBatch[];
  stats: {
    chunks: number;
    batches: number;
    vertices: number;
    triangles: number;
  };
}

interface BatchBuilder extends CompiledMazeBatch {}

export type Direction = "n" | "e" | "s" | "w";

const DIRECTIONS: readonly {
  dir: Direction;
  dx: number;
  dy: number;
  opposite: Direction;
}[] = [
  { dir: "n", dx: 0, dy: -1, opposite: "s" },
  { dir: "e", dx: 1, dy: 0, opposite: "w" },
  { dir: "s", dx: 0, dy: 1, opposite: "n" },
  { dir: "w", dx: -1, dy: 0, opposite: "e" },
];

function isInterior(cell: Cell | undefined): cell is Cell {
  return !!cell && !cell.void &&
    (cell.n !== "wall" || cell.e !== "wall" || cell.s !== "wall" || cell.w !== "wall");
}

function addQuad(
  batch: BatchBuilder,
  vertices: readonly (readonly [number, number, number])[],
  normal: readonly [number, number, number],
  uvs: readonly (readonly [number, number])[],
  face: CompiledMazeFace
): void {
  const base = batch.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    batch.positions.push(...vertices[i]);
    batch.normals.push(...normal);
    batch.uvs.push(...uvs[i]);
  }
  batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  batch.faces.push(face);
}

function addHorizontal(
  batch: BatchBuilder,
  x: number,
  y: number,
  authoredZ: number,
  ceiling: boolean
): void {
  const worldY = authoredZ * LEGACY_VERTICAL_UNIT;
  if (ceiling) {
    addQuad(
      batch,
      [
        [x, worldY, y],
        [x + 1, worldY, y],
        [x + 1, worldY, y + 1],
        [x, worldY, y + 1],
      ],
      [0, -1, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
      {
        cellX: x,
        cellY: y,
        kind: "ceiling",
        role: "cell-surface",
      }
    );
  } else {
    addQuad(
      batch,
      [
        [x, worldY, y],
        [x, worldY, y + 1],
        [x + 1, worldY, y + 1],
        [x + 1, worldY, y],
      ],
      [0, 1, 0],
      [[0, 0], [0, 1], [1, 1], [1, 0]],
      {
        cellX: x,
        cellY: y,
        kind: "floor",
        role: "cell-surface",
      }
    );
  }
}

function faceNormal(
  vertices: readonly (readonly [number, number, number])[]
): [number, number, number] {
  const a = vertices[0];
  const b = vertices[1];
  const c = vertices[2];
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function addFloorQuad(
  batch: BatchBuilder,
  x: number,
  y: number,
  surface: FloorSurface
): void {
  const locals = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ] as const;
  const vertices = locals.map(([lx, ly]) => [
    x + lx,
    floorSurfaceZAt(surface, lx, ly) * LEGACY_VERTICAL_UNIT,
    y + ly,
  ]) as [number, number, number][];
  addQuad(batch, vertices, faceNormal(vertices), locals, {
    cellX: x,
    cellY: y,
    kind: "floor",
    role: "cell-surface",
  });
}

function localForProgress(
  dir: Direction,
  progress: number,
  lateral: number
): readonly [number, number] {
  if (dir === "e") return [progress, lateral];
  if (dir === "w") return [1 - progress, lateral];
  if (dir === "s") return [lateral, progress];
  return [lateral, 1 - progress];
}

function addStairFloor(
  floorBatch: BatchBuilder,
  riserBatch: BatchBuilder,
  x: number,
  y: number,
  surface: Exclude<FloorSurface, { kind: "flat" | "ramp" }>,
  steps = 4
): void {
  const rise = surface.highZ - surface.lowZ;
  const downhillNormal: readonly [number, number, number] =
    surface.dir === "e"
      ? [-1, 0, 0]
      : surface.dir === "w"
        ? [1, 0, 0]
        : surface.dir === "s"
          ? [0, 0, -1]
          : [0, 0, 1];

  for (let index = 0; index < steps; index++) {
    const p0 = index / steps;
    const p1 = (index + 1) / steps;
    const treadZ = surface.lowZ + rise * p0;
    const local = [
      localForProgress(surface.dir, p0, 0),
      localForProgress(surface.dir, p0, 1),
      localForProgress(surface.dir, p1, 1),
      localForProgress(surface.dir, p1, 0),
    ];
    let vertices = local.map(([lx, ly]) => [
      x + lx,
      treadZ * LEGACY_VERTICAL_UNIT,
      y + ly,
    ]) as [number, number, number][];
    let uvs = local.map(([lx, ly]) => [lx, ly]) as [number, number][];
    if (faceNormal(vertices)[1] < 0) {
      vertices = [vertices[0], vertices[3], vertices[2], vertices[1]];
      uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
    }
    addQuad(floorBatch, vertices, [0, 1, 0], uvs, {
      cellX: x,
      cellY: y,
      kind: "floor",
      role: "stair-tread",
      dir: surface.dir,
      edge: "open",
    });

    const nextZ = surface.lowZ + rise * p1;
    const a = localForProgress(surface.dir, p1, 0);
    const b = localForProgress(surface.dir, p1, 1);
    let riserVertices: [number, number, number][] = [
      [x + a[0], treadZ * LEGACY_VERTICAL_UNIT, y + a[1]],
      [x + b[0], treadZ * LEGACY_VERTICAL_UNIT, y + b[1]],
      [x + b[0], nextZ * LEGACY_VERTICAL_UNIT, y + b[1]],
      [x + a[0], nextZ * LEGACY_VERTICAL_UNIT, y + a[1]],
    ];
    let normal = faceNormal(riserVertices);
    const dot =
      normal[0] * downhillNormal[0] + normal[2] * downhillNormal[2];
    if (dot < 0) {
      riserVertices = [
        riserVertices[1],
        riserVertices[0],
        riserVertices[3],
        riserVertices[2],
      ];
      normal = faceNormal(riserVertices);
    }
    addQuad(riserBatch, riserVertices, normal, [
      [0, treadZ],
      [1, treadZ],
      [1, nextZ],
      [0, nextZ],
    ], {
      cellX: x,
      cellY: y,
      kind: "wall",
      role: "stair-riser",
      dir: surface.dir,
      edge: "open",
    });
  }
}

function boundaryFloorProfile(
  surface: FloorSurface,
  dir: Direction
): { z0: number; z1: number } {
  // Stepped treads sit on a solid stair/stringer volume. A continuous sloped
  // side-wall bottom leaves triangular holes beneath the discrete treads.
  if (
    surface.kind === "stairs" &&
    dir !== surface.dir &&
    dir !== OPPOSITE_SURFACE_DIRECTION[surface.dir]
  ) {
    return { z0: surface.lowZ, z1: surface.lowZ };
  }
  return floorSurfaceEdgeHeights(surface, dir);
}

function addBoundaryPatch(
  batch: BatchBuilder,
  x: number,
  y: number,
  dir: Direction,
  patch: BoundaryPatch,
  face: CompiledMazeFace
): void {
  const b0 = patch.bottom0 * LEGACY_VERTICAL_UNIT;
  const b1 = patch.bottom1 * LEGACY_VERTICAL_UNIT;
  const t0 = patch.top0 * LEGACY_VERTICAL_UNIT;
  const t1 = patch.top1 * LEGACY_VERTICAL_UNIT;
  const uvs: readonly [number, number][] = [
    [0, patch.bottom0],
    [1, patch.bottom1],
    [1, patch.top1],
    [0, patch.top0],
  ];
  if (dir === "n") {
    addQuad(batch, [[x, b0, y], [x + 1, b1, y], [x + 1, t1, y], [x, t0, y]], [0, 0, 1], uvs, face);
  } else if (dir === "e") {
    addQuad(batch, [[x + 1, b0, y], [x + 1, b1, y + 1], [x + 1, t1, y + 1], [x + 1, t0, y]], [-1, 0, 0], uvs, face);
  } else if (dir === "s") {
    addQuad(batch, [[x + 1, b1, y + 1], [x, b0, y + 1], [x, t0, y + 1], [x + 1, t1, y + 1]], [0, 0, -1], [[0, patch.bottom1], [1, patch.bottom0], [1, patch.top0], [0, patch.top1]], face);
  } else {
    addQuad(batch, [[x, b1, y + 1], [x, b0, y], [x, t0, y], [x, t1, y + 1]], [1, 0, 0], [[0, patch.bottom1], [1, patch.bottom0], [1, patch.top0], [0, patch.top1]], face);
  }
}

function boundaryFace(
  x: number,
  y: number,
  dir: Direction,
  kind: MazeSurfaceKind,
  edge: EdgeType,
  patch: BoundaryPatch
): CompiledMazeFace {
  return {
    cellX: x,
    cellY: y,
    kind,
    role: "boundary",
    dir,
    edge,
    patch,
  };
}

function doorFeatureAt(
  floor: FloorDef,
  x: number,
  y: number,
  dir: Direction
): string | null {
  return floor.doorFeatures?.find(
    (feature) => feature.x === x && feature.y === y && feature.dir === dir
  )?.spriteId ?? null;
}

function materialForDoor(
  floor: FloorDef,
  theme: string,
  x: number,
  y: number,
  dir: Direction,
  neighbor: Cell | undefined
): string {
  const feature = doorFeatureAt(floor, x, y, dir);
  if (feature) return `doorFeature:${feature}@${theme}`;
  if (neighbor?.tile === "stairs_up" || neighbor?.tile === "stairs_down") {
    return `${theme}:stairs`;
  }
  return `${theme}:door`;
}

const OVERLOOK_PARAPET_HEIGHT = 0.25;

function hasBarredGate(
  floor: FloorDef,
  x: number,
  y: number,
  dir: Direction
): boolean {
  return floor.barredGates?.some(
    (gate) => gate.x === x && gate.y === y && gate.dir === dir
  ) ?? false;
}

/**
 * A high catwalk directly above the approach side of a barred gate needs a
 * low parapet rather than a full-height wall. The edge remains a wall in the
 * grid, so this is presentation-only: the party still cannot cross it, but
 * the gate below can be read as a lower level from the catwalk.
 */
function overlookBoundaryForBarredGate(
  floor: FloorDef,
  x: number,
  y: number,
  dir: Direction,
  volume: ReturnType<typeof resolveCellVolume>,
  neighborVolume: ReturnType<typeof resolveCellVolume> | null
): "high" | "low" | null {
  if (!neighborVolume || volume.floorZ === neighborVolume.floorZ) return null;
  const direction = DIRECTIONS.find((entry) => entry.dir === dir);
  if (!direction) return null;
  const neighborX = x + direction.dx;
  const neighborY = y + direction.dy;
  if (volume.floorZ > neighborVolume.floorZ && hasBarredGate(floor, neighborX, neighborY, dir)) {
    return "high";
  }
  if (volume.floorZ < neighborVolume.floorZ && hasBarredGate(floor, x, y, direction.opposite)) {
    return "low";
  }
  return null;
}

export function compileMazeGeometry(
  floor: FloorDef,
  // Current campaign floors are roughly 30 cells across and only a few
  // thousand triangles. A 32-cell chunk keeps regional-theme batches low;
  // larger/future maps still split spatially without an atlas rewrite.
  chunkSize = 32
): CompiledMazeGeometry {
  const builders = new Map<string, BatchBuilder>();
  const chunks = new Set<string>();

  const batchFor = (
    x: number,
    y: number,
    materialKey: string,
    kind: MazeSurfaceKind
  ): BatchBuilder => {
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const key = `${chunkX},${chunkY}:${kind}:${materialKey}`;
    let batch = builders.get(key);
    if (!batch) {
      batch = {
        chunkX,
        chunkY,
        materialKey,
        kind,
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
        faces: [],
      };
      builders.set(key, batch);
      chunks.add(`${chunkX},${chunkY}`);
    }
    return batch;
  };

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const cell = floor.grid[y]?.[x];
      if (!isInterior(cell)) continue;
      const volume = resolveCellVolume(floor, x, y);
      const surface = resolveFloorSurface(floor, x, y);
      const theme = themeAt(floor, x, y);
      const floorVariant = (x + y) % 2 === 0 ? "floorA" : "floorB";
      const floorBatch = batchFor(x, y, `${theme}:${floorVariant}`, "floor");
      if (surface.kind === "flat") {
        addHorizontal(floorBatch, x, y, surface.z, false);
      } else if (surface.kind === "ramp") {
        addFloorQuad(floorBatch, x, y, surface);
      } else {
        addStairFloor(
          floorBatch,
          batchFor(x, y, `${theme}:wall`, "wall"),
          x,
          y,
          surface
        );
      }

      if (!cell.noCeiling) {
        const ceilingFeature = floor.ceilingFeatures?.find(
          (feature) => feature.x === x && feature.y === y
        )?.spriteId;
        addHorizontal(
          batchFor(
            x,
            y,
            ceilingFeature
              ? `ceilingFeature:${ceilingFeature}@${theme}`
              : `${theme}:ceiling`,
            "ceiling"
          ),
          x,
          y,
          volume.ceilingZ,
          true
        );
      }

      for (const { dir, dx, dy } of DIRECTIONS) {
        const edge = cell[dir] as EdgeType;
        const nx = x + dx;
        const ny = y + dy;
        const neighbor = floor.grid[ny]?.[nx];
        if (edge === "open" && neighbor?.void) continue;
        const neighborInterior = isInterior(neighbor);
        const neighborVolume = neighborInterior
          ? resolveCellVolume(floor, nx, ny)
          : null;
        const isStairDoor =
          edge === "open" &&
          (neighbor?.tile === "stairs_up" || neighbor?.tile === "stairs_down");

        if (edge === "open" && neighborInterior && !isStairDoor) {
          const neighborSurface = resolveFloorSurface(floor, nx, ny);
          const patches = compileOpenBoundaryPatches(
            volume,
            neighborVolume!,
            boundaryFloorProfile(surface, dir),
            boundaryFloorProfile(
              neighborSurface,
              OPPOSITE_SURFACE_DIRECTION[dir]
            )
          ).aClosed;
          for (const patch of patches) {
            addBoundaryPatch(
              batchFor(x, y, `${theme}:wall`, "wall"),
              x,
              y,
              dir,
              patch,
              boundaryFace(x, y, dir, "wall", edge, patch)
            );
          }
          continue;
        }

        if (edge === "wall" && neighborInterior && neighborVolume) {
          const overlook = overlookBoundaryForBarredGate(
            floor,
            x,
            y,
            dir,
            volume,
            neighborVolume
          );
          if (overlook === "low") continue;
          if (overlook === "high") {
            const neighborSurface = resolveFloorSurface(floor, nx, ny);
            const highFloor = boundaryFloorProfile(surface, dir);
            const lowFloor = boundaryFloorProfile(
              neighborSurface,
              OPPOSITE_SURFACE_DIRECTION[dir]
            );
            addBoundaryPatch(
              batchFor(x, y, `${theme}:wall`, "wall"),
              x,
              y,
              dir,
              {
                bottom0: lowFloor.z0,
                bottom1: lowFloor.z1,
                top0: Math.min(volume.ceilingZ, highFloor.z0 + OVERLOOK_PARAPET_HEIGHT),
                top1: Math.min(volume.ceilingZ, highFloor.z1 + OVERLOOK_PARAPET_HEIGHT),
                kind: "lowerClosure",
              },
              boundaryFace(x, y, dir, "wall", edge, {
                bottom0: lowFloor.z0,
                bottom1: lowFloor.z1,
                top0: Math.min(volume.ceilingZ, highFloor.z0 + OVERLOOK_PARAPET_HEIGHT),
                top1: Math.min(volume.ceilingZ, highFloor.z1 + OVERLOOK_PARAPET_HEIGHT),
                kind: "lowerClosure",
              })
            );
            continue;
          }
        }

        if (edge === "door" || edge === "locked" || edge === "barred" || isStairDoor) {
          const floorEdge = boundaryFloorProfile(surface, dir);
          const panelTop0 = Math.min(volume.ceilingZ, floorEdge.z0 + 1);
          const panelTop1 = Math.min(volume.ceilingZ, floorEdge.z1 + 1);
          const panel: BoundaryPatch = {
            bottom0: floorEdge.z0,
            bottom1: floorEdge.z1,
            top0: panelTop0,
            top1: panelTop1,
            kind: "fullClosure",
          };
          addBoundaryPatch(
            batchFor(
              x,
              y,
              materialForDoor(floor, theme, x, y, dir, neighbor),
              "door"
            ),
            x,
            y,
            dir,
            panel,
            boundaryFace(x, y, dir, "door", isStairDoor ? "open" : edge, panel)
          );
          if (panelTop0 < volume.ceilingZ || panelTop1 < volume.ceilingZ) {
            addBoundaryPatch(
              batchFor(x, y, `${theme}:wall`, "wall"),
              x,
              y,
              dir,
              {
                bottom0: panelTop0,
                bottom1: panelTop1,
                top0: volume.ceilingZ,
                top1: volume.ceilingZ,
                kind: "upperClosure",
              },
              boundaryFace(x, y, dir, "wall", isStairDoor ? "open" : edge, {
                bottom0: panelTop0,
                bottom1: panelTop1,
                top0: volume.ceilingZ,
                top1: volume.ceilingZ,
                kind: "upperClosure",
              })
            );
          }
          continue;
        }

        addBoundaryPatch(
          batchFor(x, y, `${theme}:wall`, "wall"),
          x,
          y,
          dir,
          fullBoundaryPatch(volume, boundaryFloorProfile(surface, dir)),
          boundaryFace(
            x,
            y,
            dir,
            "wall",
            edge,
            fullBoundaryPatch(volume, boundaryFloorProfile(surface, dir))
          )
        );
      }
    }
  }

  const batches = [...builders.values()];
  return {
    chunkSize,
    batches,
    stats: {
      chunks: chunks.size,
      batches: batches.length,
      vertices: batches.reduce((sum, batch) => sum + batch.positions.length / 3, 0),
      triangles: batches.reduce((sum, batch) => sum + batch.indices.length / 3, 0),
    },
  };
}
