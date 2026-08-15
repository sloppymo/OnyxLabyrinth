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

/** One vertical face of an architectural prop, in dungeon cell coordinates. */
export interface ArchitecturalPropFace {
  /** True when the face is constant-X (east/west). False = constant-Y (north/south). */
  verticalPlane: boolean;
  centerX: number;
  centerY: number;
  width: number;
  /** Vertical centre in cell-height units (same space as environmental sprites). */
  centerZ: number;
  height: number;
}

/**
 * Camera-facing vertical faces of a prop. Canvas has no depth buffer for
 * overlapping planes, so back faces are culled against the camera cell
 * rather than drawn and overpainted.
 */
export function architecturalPropVisibleFaces(
  prop: ArchitecturalPropDef,
  floorZ: number,
  ceilingZ: number,
  cameraX: number,
  cameraY: number
): ArchitecturalPropFace[] {
  const pose = resolveArchitecturalPropPose(prop, floorZ, ceilingZ);
  const centerZ = pose.y / LEGACY_VERTICAL_UNIT;
  const height = pose.height / LEGACY_VERTICAL_UNIT;
  const half = pose.depth / 2;
  const faces: ArchitecturalPropFace[] = [];
  const push = (
    verticalPlane: boolean,
    centerX: number,
    centerY: number,
    width: number,
    outward: "n" | "e" | "s" | "w"
  ) => {
    const visible =
      (outward === "s" && cameraY > centerY) ||
      (outward === "n" && cameraY < centerY) ||
      (outward === "e" && cameraX > centerX) ||
      (outward === "w" && cameraX < centerX);
    if (!visible) return;
    faces.push({ verticalPlane, centerX, centerY, width, centerZ, height });
  };

  if (pose.depth <= 0) {
    const verticalPlane = prop.facing === "e" || prop.facing === "w";
    // WebGL architectural planes are DoubleSide; Canvas matches that.
    faces.push({ verticalPlane, centerX: pose.x, centerY: pose.z, width: pose.width, centerZ, height });
    return faces;
  }

  push(false, pose.x, pose.z + half, pose.width, "s");
  push(false, pose.x, pose.z - half, pose.width, "n");
  push(true, pose.x + half, pose.z, pose.depth, "e");
  push(true, pose.x - half, pose.z, pose.depth, "w");
  return faces;
}
