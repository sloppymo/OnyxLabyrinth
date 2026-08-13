import type { ArchitecturalPropDef } from "../../../data/floors";
import { LEGACY_VERTICAL_UNIT } from "./cell-volume";

export interface ArchitecturalPropPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  width: number;
  height: number;
  depth: number;
}

/** Fixed world yaw: these props never copy the camera quaternion. */
export function rotationYForArchitecturalFacing(
  facing: ArchitecturalPropDef["facing"]
): number {
  if (facing === "s") return 0;
  if (facing === "e") return Math.PI / 2;
  if (facing === "n") return Math.PI;
  return -Math.PI / 2;
}

export function resolveArchitecturalPropPose(
  prop: ArchitecturalPropDef,
  floorZ: number,
  ceilingZ: number
): ArchitecturalPropPose {
  const height = prop.height * LEGACY_VERTICAL_UNIT;
  const floorY = floorZ * LEGACY_VERTICAL_UNIT;
  const ceilingY = ceilingZ * LEGACY_VERTICAL_UNIT;
  const y = prop.anchor === "ceiling"
    ? ceilingY - height / 2
    : floorY + height / 2;
  return {
    x: prop.x + 0.5 + (prop.offsetX ?? 0),
    y,
    z: prop.y + 0.5 + (prop.offsetZ ?? 0),
    rotationY: rotationYForArchitecturalFacing(prop.facing),
    width: prop.width,
    height,
    depth: prop.kind === "box" ? prop.depth! : 0,
  };
}
