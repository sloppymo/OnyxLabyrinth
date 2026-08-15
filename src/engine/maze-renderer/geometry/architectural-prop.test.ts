import { describe, expect, it } from "vitest";
import type { ArchitecturalPropDef } from "../../../data/floors";
import { LEGACY_VERTICAL_UNIT } from "./cell-volume";
import {
  architecturalPropVisibleFaces,
  resolveArchitecturalPropPose,
  rotationYForArchitecturalFacing,
} from "./architectural-prop";

const prop = (overrides: Partial<ArchitecturalPropDef> = {}): ArchitecturalPropDef => ({
  id: "test",
  x: 3,
  y: 4,
  kind: "box",
  facing: "s",
  width: 0.8,
  height: 2,
  depth: 0.3,
  texture: "cyan.png",
  ...overrides,
});

describe("architectural prop geometry", () => {
  it("maps facing to fixed world yaw, independent of camera", () => {
    expect(rotationYForArchitecturalFacing("s")).toBe(0);
    expect(rotationYForArchitecturalFacing("e")).toBe(Math.PI / 2);
    expect(rotationYForArchitecturalFacing("n")).toBe(Math.PI);
    expect(rotationYForArchitecturalFacing("w")).toBe(-Math.PI / 2);
  });

  it("anchors a floor box at its cell center and floor surface", () => {
    const pose = resolveArchitecturalPropPose(prop({ offsetX: 0.1, offsetZ: -0.2 }), 0.5, 3);
    expect(pose.x).toBe(3.6);
    expect(pose.z).toBe(4.3);
    expect(pose.y).toBe(0.5 * LEGACY_VERTICAL_UNIT + LEGACY_VERTICAL_UNIT);
    expect(pose.height).toBe(2 * LEGACY_VERTICAL_UNIT);
    expect(pose.depth).toBe(0.3);
  });

  it("anchors a plane down from the ceiling without adding box depth", () => {
    const pose = resolveArchitecturalPropPose(
      prop({ kind: "plane", anchor: "ceiling", facing: "w", depth: undefined }),
      0,
      3
    );
    expect(pose.y).toBe(3 * LEGACY_VERTICAL_UNIT - LEGACY_VERTICAL_UNIT);
    expect(pose.depth).toBe(0);
    expect(pose.rotationY).toBe(-Math.PI / 2);
  });

  it("culls box faces the camera is behind", () => {
    const box = prop({ facing: "n", offsetX: 0, offsetZ: 0 });
    const fromSouth = architecturalPropVisibleFaces(box, 0, 1, 3.5, 6);
    expect(fromSouth.some((f) => !f.verticalPlane && f.centerY > 4.5)).toBe(true);
    expect(fromSouth.every((f) => f.verticalPlane || f.centerY > 4.5)).toBe(true);

    const fromWest = architecturalPropVisibleFaces(box, 0, 1, 2, 4.5);
    expect(fromWest.some((f) => f.verticalPlane && f.centerX < 3.5)).toBe(true);
  });

  it("treats a plane as a single camera-facing sheet", () => {
    const plane = prop({ kind: "plane", facing: "n", depth: undefined });
    const faces = architecturalPropVisibleFaces(plane, 0, 1, 3.5, 6);
    expect(faces).toHaveLength(1);
    expect(faces[0]?.verticalPlane).toBe(false);
    expect(faces[0]?.centerY).toBe(4.5);
  });
});
