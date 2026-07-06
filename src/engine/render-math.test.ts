/**
 * Unit tests for the pure renderer math functions.
 *
 * These tests verify the core geometry, fog, and interpolation math that
 * the corridor renderer depends on. By testing the extracted pure functions
 * we catch regressions (black walls, wrong fog, broken camera interpolation)
 * without needing a real canvas or browser environment.
 */
import { describe, it, expect } from "vitest";
import {
  computeLineHeight,
  wallDrawBounds,
  opacityForDepth,
  glowBlurForDepth,
  strokeColorForDepth,
  dirFromFacing,
  planeFromDir,
  easeOutCubic,
  interpolateFacing,
  shouldSnapTeleport,
  rowDistanceForY,
  floorRowStart,
  floorRowStep,
  isFloorA,
  texelCoords,
  fogBlend,
  MATH_CONFIG,
} from "./render-math";

describe("computeLineHeight", () => {
  it("returns a positive height for valid distances", () => {
    const h = computeLineHeight(672, 1.0);
    expect(h).toBeGreaterThan(0);
  });

  it("decreases as distance increases (perspective)", () => {
    const near = computeLineHeight(672, 1.0);
    const far = computeLineHeight(672, 3.0);
    expect(near).toBeGreaterThan(far);
  });

  it("scales linearly with screen height", () => {
    const h1 = computeLineHeight(336, 1.0);
    const h2 = computeLineHeight(672, 1.0);
    expect(h2).toBeCloseTo(h1 * 2, -1);
  });

  it("applies projectionScale and heightFlatten", () => {
    const h = 672;
    const dist = 2.0;
    const expected = Math.floor(
      (h / dist) * MATH_CONFIG.projectionScale * MATH_CONFIG.heightFlatten
    );
    expect(computeLineHeight(h, dist)).toBe(expected);
  });
});

describe("wallDrawBounds", () => {
  it("returns drawStart <= drawEnd", () => {
    const { drawStart, drawEnd } = wallDrawBounds(672, 2.0);
    expect(drawStart).toBeLessThanOrEqual(drawEnd);
  });

  it("clamps drawStart to >= 0", () => {
    // Very close wall → very tall → drawStart should clamp to 0.
    const { drawStart } = wallDrawBounds(672, 0.1);
    expect(drawStart).toBe(0);
  });

  it("clamps drawEnd to <= h-1", () => {
    const h = 672;
    const { drawEnd } = wallDrawBounds(h, 0.1);
    expect(drawEnd).toBeLessThanOrEqual(h - 1);
  });

  it("centered vertically for mid-distance walls", () => {
    const h = 672;
    const { drawStart, drawEnd } = wallDrawBounds(h, 2.0);
    const center = (drawStart + drawEnd) / 2;
    // Allow 1px tolerance due to Math.floor rounding.
    expect(center).toBeCloseTo(h / 2, -1);
  });
});

describe("opacityForDepth", () => {
  it("returns 1.0 at distance 0 (no fog on player's cell)", () => {
    expect(opacityForDepth(0)).toBeCloseTo(1.0, 5);
  });

  it("decreases as distance increases", () => {
    const near = opacityForDepth(1.0);
    const far = opacityForDepth(4.0);
    expect(near).toBeGreaterThan(far);
  });

  it("stays above 0 even at large distances (midtone lift)", () => {
    expect(opacityForDepth(10)).toBeGreaterThan(0);
  });

  it("never exceeds 1.0", () => {
    for (let d = 0; d <= 10; d += 0.5) {
      expect(opacityForDepth(d)).toBeLessThanOrEqual(1.0);
    }
  });
});

describe("glowBlurForDepth", () => {
  it("returns glowBlurNear at distance 0", () => {
    expect(glowBlurForDepth(0)).toBe(MATH_CONFIG.glowBlurNear);
  });

  it("decreases with distance but never below glowBlurFar", () => {
    const far = glowBlurForDepth(100);
    expect(far).toBe(MATH_CONFIG.glowBlurFar);
  });

  it("is monotonically decreasing", () => {
    const a = glowBlurForDepth(1);
    const b = glowBlurForDepth(2);
    expect(a).toBeGreaterThanOrEqual(b);
  });
});

describe("strokeColorForDepth", () => {
  it("produces a valid rgba string", () => {
    const s = strokeColorForDepth(1.0);
    expect(s).toMatch(/^rgba\(224,164,88,/);
    expect(s.endsWith(")")).toBe(true);
  });

  it("alpha decreases with distance", () => {
    const near = strokeColorForDepth(0.5);
    const far = strokeColorForDepth(5.0);
    // Extract alpha values and compare.
    const a1 = parseFloat(near.match(/[\d.]+\)$/)?.[0] ?? "0");
    const a2 = parseFloat(far.match(/[\d.]+\)$/)?.[0] ?? "0");
    expect(a1).toBeGreaterThan(a2);
  });
});

describe("dirFromFacing", () => {
  it("facing 0 (N) points in -Y direction", () => {
    const d = dirFromFacing(0);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(-1, 5);
  });

  it("facing 1 (E) points in +X direction", () => {
    const d = dirFromFacing(1);
    expect(d.x).toBeCloseTo(1, 5);
    expect(d.y).toBeCloseTo(0, 5);
  });

  it("facing 2 (S) points in +Y direction", () => {
    const d = dirFromFacing(2);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(1, 5);
  });

  it("facing 3 (W) points in -X direction", () => {
    const d = dirFromFacing(3);
    expect(d.x).toBeCloseTo(-1, 5);
    expect(d.y).toBeCloseTo(0, 5);
  });

  it("produces unit vectors", () => {
    for (let f = 0; f < 4; f++) {
      const d = dirFromFacing(f);
      const len = Math.sqrt(d.x * d.x + d.y * d.y);
      expect(len).toBeCloseTo(1, 5);
    }
  });
});

describe("planeFromDir", () => {
  it("plane is perpendicular to direction", () => {
    const dir = dirFromFacing(0);
    const plane = planeFromDir(dir.x, dir.y, Math.PI / 3);
    // Dot product of perpendicular vectors is 0.
    const dot = dir.x * plane.planeX + dir.y * plane.planeY;
    expect(dot).toBeCloseTo(0, 5);
  });

  it("plane magnitude scales with FOV", () => {
    const dir = dirFromFacing(0);
    const narrow = planeFromDir(dir.x, dir.y, Math.PI / 6);
    const wide = planeFromDir(dir.x, dir.y, Math.PI / 2);
    const narrowMag = Math.sqrt(narrow.planeX ** 2 + narrow.planeY ** 2);
    const wideMag = Math.sqrt(wide.planeX ** 2 + wide.planeY ** 2);
    expect(wideMag).toBeGreaterThan(narrowMag);
  });
});

describe("easeOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it("is monotonically increasing", () => {
    for (let i = 0; i < 10; i++) {
      const t1 = i / 10;
      const t2 = (i + 1) / 10;
      expect(easeOutCubic(t1)).toBeLessThanOrEqual(easeOutCubic(t2));
    }
  });

  it("starts fast (ease-out: value > 0.5 at t=0.5)", () => {
    // easeOutCubic(0.5) = 1 - 0.5^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 3);
  });
});

describe("interpolateFacing", () => {
  it("interpolates forward from 0 to 1", () => {
    expect(interpolateFacing(0, 1, 0.5)).toBeCloseTo(0.5, 5);
  });

  it("takes shortest path from W (3) to N (0)", () => {
    // 3 → 0 should go forward 1 step (3 → 0), not backward 3 steps.
    const mid = interpolateFacing(3, 0, 0.5);
    // Shortest path: 3 → 3.5 → 0 (wrapping). Result should be 3.5.
    expect(mid).toBeCloseTo(3.5, 5);
  });

  it("takes shortest path from N (0) to W (3)", () => {
    // 0 → 3 should go backward 1 step (0 → 3.5 → 3), not forward 3 steps.
    const mid = interpolateFacing(0, 3, 0.5);
    expect(mid).toBeCloseTo(3.5, 5);
  });

  it("returns start at t=0", () => {
    expect(interpolateFacing(1, 2, 0)).toBeCloseTo(1, 5);
  });

  it("returns end at t=1", () => {
    expect(interpolateFacing(1, 2, 1)).toBeCloseTo(2, 5);
  });

  it("wraps result to [0, 4)", () => {
    const result = interpolateFacing(3, 0, 1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(4);
  });
});

describe("shouldSnapTeleport", () => {
  it("returns false for a normal 1-tile move", () => {
    expect(shouldSnapTeleport(5, 5, 5, 4)).toBe(false);
  });

  it("returns true for a teleport (large jump)", () => {
    expect(shouldSnapTeleport(5, 5, 10, 10)).toBe(true);
  });

  it("returns false for a diagonal 1-tile move", () => {
    expect(shouldSnapTeleport(5, 5, 6, 6)).toBe(false);
  });

  it("returns true at exactly the threshold boundary", () => {
    // threshold = 1.5; distance = sqrt(1.5^2) = 1.5 > 1.5 is false (not >).
    // But sqrt(1.5^2 + 0.001) > 1.5 → true.
    expect(shouldSnapTeleport(0, 0, 1.5, 0.01)).toBe(true);
  });
});

describe("rowDistanceForY", () => {
  it("returns Infinity at the horizon", () => {
    expect(rowDistanceForY(336, 336)).toBe(Infinity);
  });

  it("returns small distance for rows near the horizon", () => {
    // rowDistance = halfH / (y - halfH). For y = halfH + 1, dist = halfH.
    expect(rowDistanceForY(337, 336)).toBeCloseTo(336, 0);
  });

  it("returns smaller distance for rows far from the horizon", () => {
    // Closer to the bottom of the screen = closer to the player = smaller dist.
    const near = rowDistanceForY(600, 336);
    const far = rowDistanceForY(340, 336);
    expect(near).toBeLessThan(far);
  });

  it("works for ceiling rows (y < halfH)", () => {
    const dist = rowDistanceForY(300, 336);
    expect(dist).toBeGreaterThan(0);
  });
});

describe("floorRowStart", () => {
  it("includes the +0.5 cell-center offset", () => {
    const { worldX, worldY } = floorRowStart(5, 5, 0, -1, 0, 0, 1);
    expect(worldX).toBeCloseTo(5.5, 5);
    expect(worldY).toBeCloseTo(4.5, 5);
  });

  it("scales with row distance", () => {
    const near = floorRowStart(0, 0, 0, -1, 0, 0, 1);
    const far = floorRowStart(0, 0, 0, -1, 0, 0, 5);
    expect(Math.abs(far.worldY)).toBeGreaterThan(Math.abs(near.worldY));
  });
});

describe("floorRowStep", () => {
  it("scales with row distance", () => {
    const near = floorRowStep(0.5, 0.5, 1, 768);
    const far = floorRowStep(0.5, 0.5, 5, 768);
    expect(Math.abs(far.stepX)).toBeGreaterThan(Math.abs(near.stepX));
  });

  it("scales inversely with screen width", () => {
    const narrow = floorRowStep(0.5, 0.5, 1, 384);
    const wide = floorRowStep(0.5, 0.5, 1, 768);
    expect(Math.abs(wide.stepX)).toBeLessThan(Math.abs(narrow.stepX));
  });
});

describe("isFloorA", () => {
  it("returns true for (0,0)", () => {
    expect(isFloorA(0, 0)).toBe(true);
  });

  it("returns false for (1,0)", () => {
    expect(isFloorA(1, 0)).toBe(false);
  });

  it("returns false for (0,1)", () => {
    expect(isFloorA(0, 1)).toBe(false);
  });

  it("returns true for (1,1)", () => {
    expect(isFloorA(1, 1)).toBe(true);
  });

  it("produces a checkerboard pattern", () => {
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        expect(isFloorA(gx, gy)).toBe((gx + gy) % 2 === 0);
      }
    }
  });
});

describe("texelCoords", () => {
  it("returns coordinates in [0, texSize)", () => {
    const { texX, texY } = texelCoords(3.7, 2.3, 256);
    expect(texX).toBeGreaterThanOrEqual(0);
    expect(texX).toBeLessThan(256);
    expect(texY).toBeGreaterThanOrEqual(0);
    expect(texY).toBeLessThan(256);
  });

  it("returns 0 at integer world positions", () => {
    const { texX, texY } = texelCoords(5, 5, 256);
    expect(texX).toBe(0);
    expect(texY).toBe(0);
  });

  it("wraps around tile boundaries", () => {
    // worldX = 1.0 → gx = 1, frac = 0 → texX = 0
    const { texX } = texelCoords(1.0, 0, 256);
    expect(texX).toBe(0);
  });
});

describe("fogBlend", () => {
  it("returns source color at fog=1.0 (no fog)", () => {
    const [r, g, b] = fogBlend(100, 150, 200, 14, 13, 10, 1.0);
    expect(r).toBeCloseTo(100, 0);
    expect(g).toBeCloseTo(150, 0);
    expect(b).toBeCloseTo(200, 0);
  });

  it("returns bg color at fog=0.0 (full fog)", () => {
    const [r, g, b] = fogBlend(100, 150, 200, 14, 13, 10, 0.0);
    expect(r).toBeCloseTo(14, 0);
    expect(g).toBeCloseTo(13, 0);
    expect(b).toBeCloseTo(10, 0);
  });

  it("blends at fog=0.5", () => {
    const [r] = fogBlend(100, 0, 0, 20, 0, 0, 0.5);
    expect(r).toBeCloseTo(60, 0); // 100*0.5 + 20*0.5 = 60
  });

  it("clamps to 255", () => {
    const [r] = fogBlend(300, 0, 0, 0, 0, 0, 1.0);
    expect(r).toBe(255);
  });
});
