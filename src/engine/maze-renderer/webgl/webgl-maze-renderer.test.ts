import { describe, expect, it } from "vitest";
import { verticalFovForHorizontal } from "./webgl-maze-renderer";

describe("verticalFovForHorizontal", () => {
  it("preserves a 60 degree horizontal field of view", () => {
    expect(verticalFovForHorizontal(60, 1)).toBeCloseTo(60, 8);
    expect(verticalFovForHorizontal(60, 8 / 7)).toBeCloseTo(53.604, 3);
    expect(verticalFovForHorizontal(60, 16 / 9)).toBeCloseTo(35.983, 3);
  });
});
