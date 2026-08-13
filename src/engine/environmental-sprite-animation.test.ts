import { describe, expect, it } from "vitest";
import { environmentalGaze, resolveEnvironmentalFrame } from "./environmental-sprite-animation";

describe("environmental sprite animation", () => {
  it("uses discrete south, center, and north gaze states", () => {
    expect(environmentalGaze({ playerY: 20, spriteCenterY: 17 })).toBe("south");
    expect(environmentalGaze({ playerY: 17, spriteCenterY: 17 })).toBe("center");
    expect(environmentalGaze({ playerY: 14, spriteCenterY: 17 })).toBe("north");
  });

  it("resolves idle, blink, and speaking frames within the 13-frame sheet", () => {
    expect(resolveEnvironmentalFrame({ playerY: 17, spriteCenterY: 17, nowMs: 0, speaking: false })).toBe(1);
    expect(resolveEnvironmentalFrame({ playerY: 17, spriteCenterY: 17, nowMs: 6550, speaking: false })).toBe(3);
    for (let nowMs = 0; nowMs < 1000; nowMs += 45) {
      const frame = resolveEnvironmentalFrame({ playerY: 14, spriteCenterY: 17, nowMs, speaking: true });
      expect(frame).toBeGreaterThanOrEqual(2);
      expect(frame).toBeLessThan(13);
    }
  });
});
