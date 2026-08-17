import type { FloorDef } from "../../data/floors";
import { themeAt } from "../../game/floor-map";
import { edgeInDirection } from "../../game/dungeon";
import type { Cell, EdgeType, TileFeature } from "../../types";
import {
  compileMazeGeometry,
  type CompiledMazeFace,
  type CompiledMazeGeometry,
  type Direction,
  type MazeSurfaceKind,
} from "../../engine/maze-renderer/webgl/maze-geometry-compiler";
import {
  LEGACY_VERTICAL_UNIT,
  resolveCellVolume,
  type CellVolume,
} from "../../engine/maze-renderer/geometry/cell-volume";
import {
  resolveFloorSurface,
  surfacesConnectAcrossEdge,
  type FloorSurface,
} from "../../engine/maze-renderer/geometry/floor-surface";

const DIRECTIONS: readonly Direction[] = ["n", "e", "s", "w"];
const OPPOSITE: Record<Direction, Direction> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};
const DELTA: Record<Direction, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

export interface Level3DCell {
  x: number;
  y: number;
  cell: Cell;
  theme: string;
  volume: CellVolume;
  surface: FloorSurface;
  feature?: TileFeature;
  waterDepth?: number;
}

export interface Level3DPhysicalEdge {
  x: number;
  y: number;
  dir: Direction;
  edge: EdgeType;
  neighborX: number;
  neighborY: number;
  oppositeEdge?: EdgeType;
  /** False when the two authored cell edges disagree. */
  symmetric: boolean;
  /** True when both sides are in-bounds and ordinary traversal can cross. */
  ordinaryOpening: boolean;
}

export interface Level3DFace {
  batchIndex: number;
  faceIndex: number;
  materialKey: string;
  source: CompiledMazeFace;
  theme: string;
  volume: CellVolume;
  surface: FloorSurface;
  /** Authored, unscaled Z range occupied by this quad. */
  zRange: readonly [number, number];
}

export interface Level3DStats {
  cellCount: number;
  interiorCellCount: number;
  voidCellCount: number;
  noCeilingCellCount: number;
  physicalEdgeCount: number;
  faceCount: number;
  surfaceCounts: Record<MazeSurfaceKind, number>;
  wallMaterialKeys: string[];
  floorMaterialKeys: string[];
  themes: string[];
  floorZRange: readonly [number, number];
  ceilingZRange: readonly [number, number];
  rampCount: number;
  stairCount: number;
  doorCount: number;
  lockedDoorCount: number;
  barredGateCount: number;
  propCount: number;
  markerCount: number;
}

export interface Level3DModel {
  floor: FloorDef;
  geometry: CompiledMazeGeometry;
  cells: Level3DCell[];
  physicalEdges: Level3DPhysicalEdge[];
  faces: Level3DFace[];
  stats: Level3DStats;
}

function inBounds(floor: FloorDef, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < floor.width && y < floor.height;
}

function representativeEdge(x: number, y: number, dir: Direction, floor: FloorDef): boolean {
  if (dir === "n" || dir === "w") return true;
  if (dir === "e") return x === floor.width - 1;
  return y === floor.height - 1;
}

function rangeForFace(
  source: CompiledMazeFace,
  volume: CellVolume,
  surface: FloorSurface
): readonly [number, number] {
  if (source.patch) {
    const values = [
      source.patch.bottom0,
      source.patch.bottom1,
      source.patch.top0,
      source.patch.top1,
    ];
    return [Math.min(...values), Math.max(...values)];
  }
  if (source.kind === "ceiling") return [volume.ceilingZ, volume.ceilingZ];
  if (source.kind === "floor") {
    if (surface.kind === "flat") return [surface.z, surface.z];
    return [Math.min(surface.lowZ, surface.highZ), Math.max(surface.lowZ, surface.highZ)];
  }
  if (source.role === "stair-riser" && surface.kind !== "flat") {
    return [Math.min(surface.lowZ, surface.highZ), Math.max(surface.lowZ, surface.highZ)];
  }
  return [volume.floorZ, volume.ceilingZ];
}

function faceTheme(floor: FloorDef, face: CompiledMazeFace): string {
  return themeAt(floor, face.cellX, face.cellY);
}

function materialKeysFor(
  faces: readonly Level3DFace[],
  kinds: readonly MazeSurfaceKind[]
): string[] {
  return [...new Set(
    faces
      .filter((face) => kinds.includes(face.source.kind))
      .map((face) => face.materialKey)
  )].sort();
}

function minMax(values: readonly number[], fallback: number): readonly [number, number] {
  return values.length ? [Math.min(...values), Math.max(...values)] : [fallback, fallback];
}

function makeCells(floor: FloorDef): Level3DCell[] {
  const waterByCell = new Map(
    (floor.waters ?? []).map((water) => [`${water.x},${water.y}`, water.depth] as const)
  );
  const cells: Level3DCell[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const cell = floor.grid[y]?.[x];
      if (!cell) continue;
      cells.push({
        x,
        y,
        cell,
        theme: themeAt(floor, x, y),
        volume: resolveCellVolume(floor, x, y),
        surface: resolveFloorSurface(floor, x, y),
        feature: cell.tile,
        waterDepth: waterByCell.get(`${x},${y}`),
      });
    }
  }
  return cells;
}

function makePhysicalEdges(floor: FloorDef): Level3DPhysicalEdge[] {
  const edges: Level3DPhysicalEdge[] = [];
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const cell = floor.grid[y]?.[x];
      if (!cell) continue;
      for (const dir of DIRECTIONS) {
        if (!representativeEdge(x, y, dir, floor)) continue;
        const [dx, dy] = DELTA[dir];
        const neighborX = x + dx;
        const neighborY = y + dy;
        const neighbor = inBounds(floor, neighborX, neighborY)
          ? floor.grid[neighborY]?.[neighborX]
          : undefined;
        const edge = edgeInDirection(cell, DIRECTIONS.indexOf(dir));
        const oppositeEdge = neighbor
          ? edgeInDirection(neighbor, DIRECTIONS.indexOf(OPPOSITE[dir]))
          : undefined;
        const ordinaryOpening = !cell.void && !!neighbor && !neighbor.void &&
          (edge === "open" || edge === "door") &&
          (oppositeEdge === "open" || oppositeEdge === "door") &&
          surfacesConnectAcrossEdge(floor, x, y, dir);
        edges.push({
          x,
          y,
          dir,
          edge,
          neighborX,
          neighborY,
          oppositeEdge,
          symmetric: oppositeEdge === undefined || edge === oppositeEdge,
          ordinaryOpening,
        });
      }
    }
  }
  return edges;
}

export function buildLevel3DModel(floor: FloorDef): Level3DModel {
  const geometry = compileMazeGeometry(floor);
  const cells = makeCells(floor);
  const physicalEdges = makePhysicalEdges(floor);
  const faces = geometry.batches.flatMap((batch, batchIndex) =>
    batch.faces.map((source, faceIndex): Level3DFace => {
      const volume = resolveCellVolume(floor, source.cellX, source.cellY);
      const surface = resolveFloorSurface(floor, source.cellX, source.cellY);
      return {
        batchIndex,
        faceIndex,
        materialKey: batch.materialKey,
        source,
        theme: faceTheme(floor, source),
        volume,
        surface,
        zRange: rangeForFace(source, volume, surface),
      };
    })
  );

  const interiorCells = cells.filter((cell) => !cell.cell.void &&
    DIRECTIONS.some((dir) => cell.cell[dir] !== "wall"));
  const surfaceRanges = interiorCells.flatMap((cell) => {
    if (cell.surface.kind === "flat") return [cell.surface.z];
    return [cell.surface.lowZ, cell.surface.highZ];
  });
  const ceilingValues = interiorCells.map((cell) => cell.volume.ceilingZ);
  const surfaceCounts: Record<MazeSurfaceKind, number> = {
    floor: faces.filter((face) => face.source.kind === "floor").length,
    ceiling: faces.filter((face) => face.source.kind === "ceiling").length,
    wall: faces.filter((face) => face.source.kind === "wall").length,
    door: faces.filter((face) => face.source.kind === "door").length,
  };
  const hasTile = (x: number, y: number, tile: TileFeature): boolean =>
    floor.grid[y]?.[x]?.tile === tile;
  const markerCount =
    1 +
    cells.filter((cell) => !!cell.feature).length +
    (floor.ramps?.length ?? 0) +
    (floor.events?.filter((event) => !hasTile(event.x, event.y, "event")).length ?? 0) +
    (floor.teleporters?.filter((link) => !hasTile(link.x, link.y, "teleporter")).length ?? 0) +
    (floor.chuteDrops?.filter((chute) => !hasTile(chute.x, chute.y, "chute")).length ?? 0) +
    physicalEdges.filter((edge) => edge.edge === "locked" || edge.edge === "barred").length +
    (floor.stairsGuardian && !hasTile(floor.stairsGuardian.x, floor.stairsGuardian.y, "guardian") ? 1 : 0);
  const props = (floor.architecturalProps?.length ?? 0) +
    (floor.mapSprites?.length ?? 0) +
    (floor.wallFeatures?.length ?? 0) +
    (floor.ceilingSprites?.length ?? 0) +
    (floor.environmentalSprites?.length ?? 0);

  return {
    floor,
    geometry,
    cells,
    physicalEdges,
    faces,
    stats: {
      cellCount: floor.width * floor.height,
      interiorCellCount: interiorCells.length,
      voidCellCount: cells.filter((cell) => cell.cell.void).length,
      noCeilingCellCount: cells.filter((cell) => cell.cell.noCeiling).length,
      physicalEdgeCount: physicalEdges.length,
      faceCount: faces.length,
      surfaceCounts,
      wallMaterialKeys: materialKeysFor(faces, ["wall", "door"]),
      floorMaterialKeys: materialKeysFor(faces, ["floor"]),
      themes: [...new Set(cells.map((cell) => cell.theme))].sort(),
      floorZRange: minMax(surfaceRanges, 0),
      ceilingZRange: minMax(ceilingValues, 1),
      rampCount: (floor.ramps ?? []).filter((ramp) => ramp.surface === "ramp").length,
      stairCount: (floor.ramps ?? []).filter((ramp) => ramp.surface === "stairs").length +
        cells.filter((cell) => cell.feature === "stairs_up" || cell.feature === "stairs_down").length,
      doorCount: physicalEdges.filter((edge) => edge.edge === "door").length,
      lockedDoorCount: physicalEdges.filter((edge) => edge.edge === "locked").length,
      barredGateCount: physicalEdges.filter((edge) => edge.edge === "barred").length,
      propCount: props,
      markerCount,
    },
  };
}

export function cellAtWorldPosition(
  model: Level3DModel,
  worldX: number,
  worldZ: number
): Level3DCell | undefined {
  const x = Math.floor(worldX);
  const y = Math.floor(worldZ);
  return model.cells.find((cell) => cell.x === x && cell.y === y);
}

/** Resolve a compiler face direction to the single physical edge record.
 *
 * The compiler emits the face from whichever cell it is currently visiting,
 * while the adapter stores each shared physical edge once (north/west side
 * plus the outer south/east boundary). Inspectors therefore need to accept
 * either side of a shared boundary.
 */
export function physicalEdgeForFace(
  model: Level3DModel,
  face: Level3DFace
): Level3DPhysicalEdge | undefined {
  const dir = face.source.dir;
  if (!dir) return undefined;
  const direct = model.physicalEdges.find((edge) =>
    edge.x === face.source.cellX && edge.y === face.source.cellY && edge.dir === dir
  );
  if (direct) return direct;
  const [dx, dy] = DELTA[dir];
  const neighborX = face.source.cellX + dx;
  const neighborY = face.source.cellY + dy;
  return model.physicalEdges.find((edge) =>
    edge.x === neighborX && edge.y === neighborY && edge.dir === OPPOSITE[dir]
  );
}

export function formatMaterialKey(materialKey: string): {
  theme: string;
  surface: string;
  variant?: string;
  featureId?: string;
} {
  if (materialKey.startsWith("doorFeature:")) {
    return {
      theme: materialKey.split("@").at(-1) ?? "",
      surface: "door-feature",
      featureId: materialKey.slice("doorFeature:".length).split("@")[0],
    };
  }
  if (materialKey.startsWith("ceilingFeature:")) {
    return {
      theme: materialKey.split("@").at(-1) ?? "",
      surface: "ceiling-feature",
      featureId: materialKey.slice("ceilingFeature:".length).split("@")[0],
    };
  }
  const separator = materialKey.lastIndexOf(":");
  if (separator < 0) return { theme: "", surface: materialKey };
  const theme = materialKey.slice(0, separator);
  const token = materialKey.slice(separator + 1);
  const variantSeparator = token.indexOf("@");
  return variantSeparator < 0
    ? { theme, surface: token }
    : { theme, surface: token.slice(0, variantSeparator), variant: token.slice(variantSeparator + 1) };
}

export function authoredYToWorldY(authoredZ: number): number {
  return authoredZ * LEGACY_VERTICAL_UNIT;
}
