import { describe, expect, it } from "vitest";
import {
  computeLightingProbe,
  evaluateLightingRun,
  lightingRunPassed,
  type LightingPoseResult,
} from "./lighting-probes";

function fillRgba(
  w: number,
  h: number,
  rgb: [number, number, number]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}

describe("computeLightingProbe", () => {
  it("reports a near-black fill as a collapsed dark frame", () => {
    const probe = computeLightingProbe(fillRgba(8, 8, [1, 1, 1]), 8, 8);
    expect(probe.meanLuma).toBeLessThan(3);
    expect(probe.uniqueColours).toBe(1);
  });

  it("reports a mid-grey dungeon-like fill inside the luma band", () => {
    const probe = computeLightingProbe(fillRgba(8, 8, [28, 24, 18]), 8, 8);
    expect(probe.meanLuma).toBeGreaterThan(5);
    expect(probe.meanLuma).toBeLessThan(85);
    expect(probe.meanChroma).toBeGreaterThan(1.2);
  });
});

function pose(
  backend: "canvas" | "webgl",
  name: string,
  meanLuma: number,
  extras: Partial<LightingPoseResult> = {}
): LightingPoseResult {
  const dark = name.includes("darkness");
  return {
    backend,
    name,
    inDarkness: dark,
    probe: {
      w: 10,
      h: 10,
      meanLuma,
      p05: Math.max(0, meanLuma - 8),
      p50: meanLuma,
      p95: meanLuma + 10,
      meanRGB: [meanLuma, meanLuma, meanLuma],
      meanChroma: dark ? 4 : 8,
      uniqueColours: 200,
    },
    ...extras,
  };
}

describe("evaluateLightingRun", () => {
  it("passes a sane canvas+webgl pair with darker darkness poses", () => {
    const checks = evaluateLightingRun([
      pose("canvas", "f1-straight", 22),
      pose("canvas", "f1-darkness", 12),
      pose("webgl", "f1-straight", 24),
      pose("webgl", "f1-darkness", 11),
    ]);
    expect(lightingRunPassed(checks)).toBe(true);
  });

  it("fails a globally bright frame and a darkness pose that is more saturated than its sibling", () => {
    const checks = evaluateLightingRun([
      pose("webgl", "f1-straight", 22, {
        probe: {
          w: 10, h: 10, meanLuma: 22, p05: 10, p50: 22, p95: 40,
          meanRGB: [22, 22, 22], meanChroma: 8, uniqueColours: 200,
        },
      }),
      pose("webgl", "f1-darkness", 20, {
        probe: {
          w: 10, h: 10, meanLuma: 20, p05: 10, p50: 20, p95: 40,
          meanRGB: [20, 20, 20], meanChroma: 12, uniqueColours: 200,
        },
      }),
      pose("webgl", "blown-out", 90),
    ]);
    expect(checks.some((c) => c.id.includes("blown-out") && !c.ok)).toBe(true);
    expect(checks.some((c) => c.id.includes("chroma<") && !c.ok)).toBe(true);
    expect(lightingRunPassed(checks)).toBe(false);
  });
});
