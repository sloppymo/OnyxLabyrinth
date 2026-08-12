import { MATH_CONFIG } from "../../render-math";
import type { HeightZoneDef } from "../../../data/floors";

export interface CellVolume {
  floorZ: number;
  ceilingZ: number;
}

export interface CellVolumeSource {
  id?: number;
  heightZones?: readonly HeightZoneDef[];
}

export const LEGACY_CELL_VOLUME: Readonly<CellVolume> = {
  floorZ: 0,
  ceilingZ: 1,
};

/**
 * Calibrated world height for one authored dungeon-height unit.
 *
 * The Canvas wall is `screenH * projectionScale * heightFlatten / distance`.
 * Three preserves the 60° horizontal FOV at the fixed 8:7 maze aspect, so
 * this converts that established screen projection into a physical Y scale.
 */
export const LEGACY_VERTICAL_UNIT =
  (MATH_CONFIG.projectionScale * MATH_CONFIG.heightFlatten * 2 * Math.tan(Math.PI / 6)) /
  (8 / 7);

/**
 * Worst-case clearance (in cell-height units) between the highest traversable
 * floor surface and the ceiling. The camera eye sits 0.5 cells above the
 * floor plus a small head-bob margin, so anything smaller risks clipping
 * through the ceiling. Validator and renderer code use this one constant.
 */
export const MIN_CAMERA_CLEARANCE = 0.625;

/** Later overlapping height zones win, matching regional tileset zones. */
export function resolveCellVolume(
  floor: CellVolumeSource,
  x: number,
  y: number
): CellVolume {
  let floorZ = LEGACY_CELL_VOLUME.floorZ;
  let ceilingZ = LEGACY_CELL_VOLUME.ceilingZ;
  for (const zone of floor.heightZones ?? []) {
    if (x < zone.x1 || x > zone.x2 || y < zone.y1 || y > zone.y2) continue;
    if (zone.floorZ !== undefined) floorZ = zone.floorZ;
    if (zone.ceilingZ !== undefined) ceilingZ = zone.ceilingZ;
  }
  return { floorZ, ceilingZ };
}

export function volumeHeight(volume: CellVolume): number {
  return volume.ceilingZ - volume.floorZ;
}
