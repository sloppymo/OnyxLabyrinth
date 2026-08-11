import { describe, expect, it } from "vitest";
import { verticalFovForHorizontal, webglHeadBobWorld } from "./webgl-maze-renderer";
import { LEGACY_VERTICAL_UNIT } from "../geometry/cell-volume";

describe("verticalFovForHorizontal", () => {
  it("preserves a 60 degree horizontal field of view", () => {
    expect(verticalFovForHorizontal(60, 1)).toBeCloseTo(60, 8);
    expect(verticalFovForHorizontal(60, 8 / 7)).toBeCloseTo(53.604, 3);
    expect(verticalFovForHorizontal(60, 16 / 9)).toBeCloseTo(35.983, 3);
  });
});

describe("webgl camera elevation", () => {
  it("converts legacy pixel bob into a small independent world offset", () => {
    expect(webglHeadBobWorld(0, 651)).toBe(0);
    const bob = webglHeadBobWorld(2.5, 651);
    expect(bob).toBeGreaterThan(0);
    expect(bob).toBeLessThan(LEGACY_VERTICAL_UNIT * 0.01);
  });
});
