import type { FloorDef, VerticalLandingDef } from "../../../data/floors";
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
  type CellVolume,
} from "../geometry/cell-volume";
import {
  floorSurfaceEdgeHeights,
  floorSurfaceZAt,
  OPPOSITE_SURFACE_DIRECTION,
  resolveFloorSurface,
  type FloorSurface,
} from "../geometry/floor-surface";

export type MazeSurfaceKind = "floor" | "ceiling" | "wall" | "door";

export interface CompiledMazeBatch {
  chunkX: number;
  chunkY: number;
  materialKey: string;
  kind: MazeSurfaceKind;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
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

type Direction = "n" | "e" | "s" | "w";

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
  return !!cell &&
    (cell.n !== "wall" || cell.e !== "wall" || cell.s !== "wall" || cell.w !== "wall");
}

function addQuad(
  batch: BatchBuilder,
  vertices: readonly (readonly [number, number, number])[],
  normal: readonly [number, number, number],
  uvs: readonly (readonly [number, number])[]
): void {
  const base = batch.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    batch.positions.push(...vertices[i]);
    batch.normals.push(...normal);
    batch.uvs.push(...uvs[i]);
  }
  batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
      [[0, 0], [1, 0], [1, 1], [0, 1]]
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
      [[0, 0], [0, 1], [1, 1], [1, 0]]
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
  addQuad(batch, vertices, faceNormal(vertices), locals);
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
    addQuad(floorBatch, vertices, [0, 1, 0], uvs);

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
    ]);
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
  patch: BoundaryPatch
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
    addQuad(batch, [[x, b0, y], [x + 1, b1, y], [x + 1, t1, y], [x, t0, y]], [0, 0, 1], uvs);
  } else if (dir === "e") {
    addQuad(batch, [[x + 1, b0, y], [x + 1, b1, y + 1], [x + 1, t1, y + 1], [x + 1, t0, y]], [-1, 0, 0], uvs);
  } else if (dir === "s") {
    addQuad(batch, [[x + 1, b1, y + 1], [x, b0, y + 1], [x, t0, y + 1], [x + 1, t1, y + 1]], [0, 0, -1], [[0, patch.bottom1], [1, patch.bottom0], [1, patch.top0], [0, patch.top1]]);
  } else {
    addQuad(batch, [[x, b1, y + 1], [x, b0, y], [x, t0, y], [x, t1, y + 1]], [1, 0, 0], [[0, patch.bottom1], [1, patch.bottom0], [1, patch.top0], [0, patch.top1]]);
  }
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
      };
      builders.set(key, batch);
      chunks.add(`${chunkX},${chunkY}`);
    }
    return batch;
  };

  // Pre-compute per-cell volumes and the effective base ceiling. A cell that
  // hosts one or more upper landings has its base ceiling lowered to the
  // lowest upper landing Z so the underside of the upper slab is visible from
  // below and the upper landing can be rendered above it.
  const cellVolumes: CellVolume[][] = [];
  const effectiveCeilingZ: number[][] = [];
  const landingsByCell = new Map<string, VerticalLandingDef[]>();
  for (const landing of floor.verticalLandings ?? []) {
    const key = `${landing.x},${landing.y}`;
    const list = landingsByCell.get(key) ?? [];
    list.push(landing);
    landingsByCell.set(key, list);
  }
  for (let y = 0; y < floor.height; y++) {
    const volRow: CellVolume[] = [];
    const ceilRow: number[] = [];
    for (let x = 0; x < floor.width; x++) {
      const volume = resolveCellVolume(floor, x, y);
      const landings = landingsByCell.get(`${x},${y}`) ?? [];
      let minUpper = volume.ceilingZ;
      for (const l of landings) {
        if (l.z > volume.floorZ && l.z < minUpper) {
          minUpper = l.z;
        }
      }
      volRow.push(volume);
      ceilRow.push(minUpper);
    }
    cellVolumes.push(volRow);
    effectiveCeilingZ.push(ceilRow);
  }

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const cell = floor.grid[y]?.[x];
      if (!isInterior(cell)) continue;
      const volume = cellVolumes[y][x];
      const baseVolume: CellVolume = { ...volume, ceilingZ: effectiveCeilingZ[y][x] };
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
        baseVolume.ceilingZ,
        true
      );

      for (const { dir, dx, dy } of DIRECTIONS) {
        const edge = cell[dir] as EdgeType;
        const nx = x + dx;
        const ny = y + dy;
        const neighbor = floor.grid[ny]?.[nx];
        const neighborInterior = isInterior(neighbor);
        const isStairDoor =
          edge === "open" &&
          (neighbor?.tile === "stairs_up" || neighbor?.tile === "stairs_down");

        if (edge === "open" && neighborInterior && !isStairDoor) {
          const neighborVolume = cellVolumes[ny]?.[nx];
          const neighborBaseVolume: CellVolume = neighborVolume
            ? { ...neighborVolume, ceilingZ: effectiveCeilingZ[ny][nx] }
            : baseVolume;
          const neighborSurface = resolveFloorSurface(floor, nx, ny);
          const patches = compileOpenBoundaryPatches(
            baseVolume,
            neighborBaseVolume,
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
              patch
            );
          }
          continue;
        }

        if (edge === "door" || edge === "locked" || edge === "barred" || isStairDoor) {
          const floorEdge = boundaryFloorProfile(surface, dir);
          const panelTop0 = Math.min(baseVolume.ceilingZ, floorEdge.z0 + 1);
          const panelTop1 = Math.min(baseVolume.ceilingZ, floorEdge.z1 + 1);
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
            panel
          );
          if (panelTop0 < baseVolume.ceilingZ || panelTop1 < baseVolume.ceilingZ) {
            addBoundaryPatch(
              batchFor(x, y, `${theme}:wall`, "wall"),
              x,
              y,
              dir,
              {
                bottom0: panelTop0,
                bottom1: panelTop1,
                top0: baseVolume.ceilingZ,
                top1: baseVolume.ceilingZ,
                kind: "upperClosure",
              }
            );
          }
          continue;
        }

        addBoundaryPatch(
          batchFor(x, y, `${theme}:wall`, "wall"),
          x,
          y,
          dir,
          fullBoundaryPatch(baseVolume, boundaryFloorProfile(surface, dir))
        );
      }
    }
  }

  // Emit upper landing slabs, ceilings, and perimeter walls.
  for (const landing of floor.verticalLandings ?? []) {
    const cell = floor.grid[landing.y]?.[landing.x];
    if (!isInterior(cell)) continue;
    const volume = cellVolumes[landing.y][landing.x];
    if (landing.z === volume.floorZ) continue;
    const landingVolume: CellVolume = { floorZ: landing.z, ceilingZ: volume.ceilingZ };
    const theme = themeAt(floor, landing.x, landing.y);
    const floorVariant = (landing.x + landing.y) % 2 === 0 ? "floorA" : "floorB";
    addHorizontal(
      batchFor(landing.x, landing.y, `${theme}:${floorVariant}`, "floor"),
      landing.x,
      landing.y,
      landing.z,
      false
    );
    const ceilingFeature = floor.ceilingFeatures?.find(
      (feature) => feature.x === landing.x && feature.y === landing.y
    )?.spriteId;
    addHorizontal(
      batchFor(
        landing.x,
        landing.y,
        ceilingFeature
          ? `ceilingFeature:${ceilingFeature}@${theme}`
          : `${theme}:ceiling`,
        "ceiling"
      ),
      landing.x,
      landing.y,
      volume.ceilingZ,
      true
    );
    if (!landing.edgeOverrides) continue;
    for (const { dir } of DIRECTIONS) {
      const edge = landing.edgeOverrides[dir];
      if (edge === "wall") {
        addBoundaryPatch(
          batchFor(landing.x, landing.y, `${theme}:wall`, "wall"),
          landing.x,
          landing.y,
          dir,
          fullBoundaryPatch(landingVolume, { z0: landing.z, z1: landing.z })
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
