import { describe, expect, it } from "vitest";
import { wallFeatureFrameIndex } from "./wall-feature-animation";

describe("wallFeatureFrameIndex", () => {
  it("loops a fixed-rate sequence without fractional-frame drift", () => {
    expect(wallFeatureFrameIndex(0, 9, 5)).toBe(0);
    expect(wallFeatureFrameIndex(0.11, 9, 5)).toBe(0);
    expect(wallFeatureFrameIndex(0.12, 9, 5)).toBe(1);
    expect(wallFeatureFrameIndex(5 / 9, 9, 5)).toBe(0);
  });

  it("uses a deterministic per-instance phase", () => {
    expect(wallFeatureFrameIndex(0, 9, 5, 0.37)).toBe(3);
    expect(wallFeatureFrameIndex(0, 9, 5, 0.37)).toBe(3);
  });

  it("falls back safely for unusable animation metadata", () => {
    expect(wallFeatureFrameIndex(Number.NaN, 9, 5)).toBe(0);
    expect(wallFeatureFrameIndex(1, 0, 5)).toBe(0);
    expect(wallFeatureFrameIndex(1, 9, 0)).toBe(0);
  });
});
