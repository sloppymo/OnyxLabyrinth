import type { FloorDef } from "../../../data/floors";
import { themeAt } from "../../../game/floor-map";
import type { Cell, EdgeType } from "../../../types";
import {
  compileOpenBoundarySpans,
  fullBoundarySpan,
  type VerticalSpan,
} from "../geometry/boundary-spans";
import {
  LEGACY_VERTICAL_UNIT,
  resolveCellVolume,
} from "../geometry/cell-volume";

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
  vertices: readonly [number, number, number][],
  normal: readonly [number, number, number],
  uvs: readonly [number, number][]
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

function addVertical(
  batch: BatchBuilder,
  x: number,
  y: number,
  dir: Direction,
  span: VerticalSpan
): void {
  const low = span.minY * LEGACY_VERTICAL_UNIT;
  const high = span.maxY * LEGACY_VERTICAL_UNIT;
  const v0 = span.minY;
  const v1 = span.maxY;
  if (dir === "n") {
    addQuad(batch, [[x, low, y], [x + 1, low, y], [x + 1, high, y], [x, high, y]], [0, 0, 1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
  } else if (dir === "e") {
    addQuad(batch, [[x + 1, low, y], [x + 1, low, y + 1], [x + 1, high, y + 1], [x + 1, high, y]], [-1, 0, 0], [[0, v0], [1, v0], [1, v1], [0, v1]]);
  } else if (dir === "s") {
    addQuad(batch, [[x + 1, low, y + 1], [x, low, y + 1], [x, high, y + 1], [x + 1, high, y + 1]], [0, 0, -1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
  } else {
    addQuad(batch, [[x, low, y + 1], [x, low, y], [x, high, y], [x, high, y + 1]], [1, 0, 0], [[0, v0], [1, v0], [1, v1], [0, v1]]);
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
  chunkSize = 16
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

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const cell = floor.grid[y]?.[x];
      if (!isInterior(cell)) continue;
      const volume = resolveCellVolume(floor, x, y);
      const theme = themeAt(floor, x, y);
      const floorVariant = (x + y) % 2 === 0 ? "floorA" : "floorB";
      addHorizontal(batchFor(x, y, `${theme}:${floorVariant}`, "floor"), x, y, volume.floorZ, false);

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
          const spans = compileOpenBoundarySpans(
            volume,
            resolveCellVolume(floor, nx, ny)
          ).aClosed;
          for (const span of spans) {
            addVertical(batchFor(x, y, `${theme}:wall`, "wall"), x, y, dir, span);
          }
          continue;
        }

        if (edge === "door" || edge === "locked" || edge === "barred" || isStairDoor) {
          const panelTop = Math.min(volume.ceilingZ, volume.floorZ + 1);
          const panel: VerticalSpan = {
            minY: volume.floorZ,
            maxY: panelTop,
            kind: "fullClosure",
          };
          addVertical(
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
          if (panelTop < volume.ceilingZ) {
            addVertical(
              batchFor(x, y, `${theme}:wall`, "wall"),
              x,
              y,
              dir,
              { minY: panelTop, maxY: volume.ceilingZ, kind: "upperClosure" }
            );
          }
          continue;
        }

        addVertical(
          batchFor(x, y, `${theme}:wall`, "wall"),
          x,
          y,
          dir,
          fullBoundarySpan(volume)
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
