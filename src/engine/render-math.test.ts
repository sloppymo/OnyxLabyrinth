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
  fogTaperForDepth,
  CORRIDOR_MAX_DIST,
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
  RenderCameraAnimator,
  cappedRenderSize,
  pixelScaleToFit,
  arenaFloorRowDistance,
  arenaFloorWorldAt,
  arenaProject,
  arenaOpacityForDepth,
  arenaFloorScreenYForDepth,
  arenaSideWallWorldAt,
  isStairExitFeature,
  raycastEdgeStop,
  dirForWallHit,
  wallFeatureCellForHit,
  stableWallX,
  wallFeatureLocalU,
  wallFeatureVerticalRect,
  projectBillboard,
  billboardScreenX,
  BILLBOARD_MIN_DEPTH,
  featureMarkerSize,
  FEATURE_MARKER_MIN_PX,
  FEATURE_MARKER_MAX_SCREEN_FRAC,
  isCorridorMarkerFeature,
  glowBucketForDepth,
  propBillboardSize,
  PROP_MAX_WALL_FRAC,
  ceilingAnchorY,
  isBillboardOccluded,
} from "./render-math";
import {
  ARENA_CAMERA,
  arenaSeamFrac,
  buildArenaCamera,
} from "./arena-camera";

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

  it("reaches exactly 0 at the corridor draw boundary (taper, not midtone-lift asymptote)", () => {
    // Without the taper, opacityForDepth asymptotes to fogMidtoneLift (0.25)
    // and never reaches 0 — that's the hard-edged clip seam this fixes.
    expect(opacityForDepth(CORRIDOR_MAX_DIST)).toBeCloseTo(0, 5);
    expect(opacityForDepth(CORRIDOR_MAX_DIST + 4)).toBeCloseTo(0, 5);
  });

  it("matches the untapered exponential+lift formula at and below maxDepth (bit-identical to pre-taper)", () => {
    const untapered = (d: number) => {
      const exponential = MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
      const lift = MATH_CONFIG.fogMidtoneLift;
      return exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
    };
    for (let d = 0; d <= MATH_CONFIG.maxDepth; d += 0.5) {
      expect(opacityForDepth(d)).toBeCloseTo(untapered(d), 10);
    }
  });

  it("is untapered at the darkness clip distance", () => {
    const untapered = (d: number) => {
      const exponential = MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
      const lift = MATH_CONFIG.fogMidtoneLift;
      return exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
    };
    expect(opacityForDepth(MATH_CONFIG.darknessMaxDist)).toBeCloseTo(
      untapered(MATH_CONFIG.darknessMaxDist),
      10
    );
  });

  it("invariant: darkness zones never reach the taper (structural no-op guard)", () => {
    // opacityForDepth always tapers against CORRIDOR_MAX_DIST, not a per-call
    // maxDist — so darkness rendering (clipped at darknessMaxDist) stays
    // bit-identical only as long as darknessMaxDist sits below the taper
    // start (CORRIDOR_MAX_DIST * fogTaperFrac). Nothing else enforces this;
    // if a future maxDepth/fogTaperFrac edit breaks it, this should go red
    // instead of silently darkening darkness zones.
    const taperStart = CORRIDOR_MAX_DIST * MATH_CONFIG.fogTaperFrac;
    expect(MATH_CONFIG.darknessMaxDist).toBeLessThanOrEqual(taperStart);
  });

  it("kill-switch (fogTaperFrac = 1.0) restores the untapered formula everywhere", () => {
    const original = MATH_CONFIG.fogTaperFrac;
    MATH_CONFIG.fogTaperFrac = 1.0;
    try {
      for (let d = 0; d <= 12; d += 1) {
        expect(fogTaperForDepth(d, CORRIDOR_MAX_DIST)).toBe(1);
      }
      // The boundary-is-zero assertion must now fail: this is the falsification
      // that proves the kill-switch actually disables the taper.
      expect(opacityForDepth(CORRIDOR_MAX_DIST)).toBeGreaterThan(0);
    } finally {
      MATH_CONFIG.fogTaperFrac = original;
    }
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

describe("RenderCameraAnimator", () => {
  it("is not animating after init", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    expect(anim.isAnimating()).toBe(false);
  });

  it("is animating after a position change", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    expect(anim.isAnimating()).toBe(true);
  });

  it("is animating after a facing change", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(5, 5, 1, 0);
    expect(anim.isAnimating()).toBe(true);
  });

  it("stops animating after the move duration elapses", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    expect(anim.isAnimating()).toBe(true);
    anim.update(6, 5, 0, MATH_CONFIG.moveAnimDuration);
    expect(anim.isAnimating()).toBe(false);
  });

  it("stops animating after the turn duration elapses", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(5, 5, 1, 0);
    expect(anim.isAnimating()).toBe(true);
    anim.update(5, 5, 1, MATH_CONFIG.turnAnimDuration);
    expect(anim.isAnimating()).toBe(false);
  });

  it("snaps instantly on teleports", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(10, 5, 0, 0);
    expect(anim.isAnimating()).toBe(false);
    const cam = anim.getCamera(Math.PI / 3);
    expect(cam.x).toBe(10);
    expect(cam.y).toBe(5);
  });

  it("reset stops animation and snaps to the given state", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    expect(anim.isAnimating()).toBe(true);
    anim.reset(7, 7, 2);
    expect(anim.isAnimating()).toBe(false);
    const cam = anim.getCamera(Math.PI / 3);
    expect(cam.x).toBe(7);
    expect(cam.y).toBe(7);
    expect(cam.dirX).toBeCloseTo(dirFromFacing(2).x, 5);
  });

  describe("isSettledAt (pending-tween quiescence probe)", () => {
    it("reports settled before any frame has initialized the animator", () => {
      const anim = new RenderCameraAnimator();
      expect(anim.isSettledAt(5, 5, 0)).toBe(true);
    });

    it("reports settled at the initialized state", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      expect(anim.isSettledAt(5, 5, 0)).toBe(true);
    });

    it("is NOT settled when the game state moved but no frame ran yet", () => {
      // The false-idle window: keydown mutated the player position, the
      // render loop has not called update() yet, so isAnimating() is still
      // false — but a tween is pending and input will be gated once it
      // starts. isSettledAt must report false here.
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      expect(anim.isAnimating()).toBe(false);
      expect(anim.isSettledAt(6, 5, 0)).toBe(false);
    });

    it("is NOT settled for a pending turn either", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      expect(anim.isSettledAt(5, 5, 1)).toBe(false);
    });

    it("is NOT settled mid-tween", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      anim.update(6, 5, 0, 0);
      anim.update(6, 5, 0, MATH_CONFIG.moveAnimDuration / 2);
      expect(anim.isSettledAt(6, 5, 0)).toBe(false);
    });

    it("settles once the tween completes", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      anim.update(6, 5, 0, 0);
      anim.update(6, 5, 0, MATH_CONFIG.moveAnimDuration);
      expect(anim.isSettledAt(6, 5, 0)).toBe(true);
    });

    it("settles immediately on teleport snaps", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      anim.update(10, 5, 0, 0);
      expect(anim.isSettledAt(10, 5, 0)).toBe(true);
    });

    it("settles immediately after reset", () => {
      const anim = new RenderCameraAnimator();
      anim.init(5, 5, 0);
      anim.update(6, 5, 0, 0);
      anim.reset(7, 7, 2);
      expect(anim.isSettledAt(7, 7, 2)).toBe(true);
      expect(anim.isSettledAt(5, 5, 0)).toBe(false);
    });
  });
});

describe("RenderCameraAnimator head bob", () => {
  it("returns zero when not animating", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    expect(anim.getMoveBob(0, 4)).toBe(0);
  });

  it("returns zero for a turn (no position change)", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(5, 5, 1, 0);
    expect(anim.isAnimating()).toBe(true);
    expect(anim.getMoveBob(0, 4)).toBe(0);
  });

  it("returns zero at the start and end of a step", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    expect(anim.getMoveBob(0, 4)).toBe(0);
    // sin(PI) is not exactly 0 in floating point; allow tiny epsilon.
    expect(anim.getMoveBob(MATH_CONFIG.moveAnimDuration, 4)).toBeCloseTo(0, 10);
  });

  it("returns positive amplitude near the midpoint of a step", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    const half = MATH_CONFIG.moveAnimDuration / 2;
    const bob = anim.getMoveBob(half, 4);
    expect(bob).toBeCloseTo(4, 0);
  });

  it("returns negative amplitude with a negative sign", () => {
    const anim = new RenderCameraAnimator();
    anim.init(5, 5, 0);
    anim.update(6, 5, 0, 0);
    const half = MATH_CONFIG.moveAnimDuration / 2;
    const bob = anim.getMoveBob(half, -3);
    expect(bob).toBeCloseTo(-3, 0);
  });
});

describe("cappedRenderSize", () => {
  it("returns the container size when it is smaller than the cap", () => {
    const size = cappedRenderSize(640, 480, 768, 672);
    expect(size.width).toBe(640);
    expect(size.height).toBe(480);
  });

  it("caps width and preserves aspect ratio when width exceeds cap", () => {
    const size = cappedRenderSize(1536, 1344, 768, 672);
    expect(size.width).toBe(768);
    expect(size.height).toBe(672);
  });

  it("caps height and preserves aspect ratio when height exceeds cap", () => {
    const size = cappedRenderSize(768, 1344, 768, 672);
    expect(size.width).toBeLessThan(768);
    expect(size.height).toBe(672);
  });

  it("returns at least 1x1", () => {
    const size = cappedRenderSize(0, 0, 768, 672);
    expect(size.width).toBe(1);
    expect(size.height).toBe(1);
  });
});

describe("pixelScaleToFit", () => {
  const W = 768;
  const H = 672;

  it("returns 1 when the design box only just fits (no room to grow)", () => {
    expect(pixelScaleToFit(W, H, W, H)).toBe(1);
    expect(pixelScaleToFit(1000, 900, W, H)).toBe(1);
  });

  it("never shrinks below 1 on undersized viewports", () => {
    expect(pixelScaleToFit(400, 300, W, H)).toBe(1);
  });

  it("uses a half-step when 2× doesn't fit but 1.5× does (1080p case)", () => {
    // 1.5x needs 1152x1008; a typical 1080p content area fits that on height.
    expect(pixelScaleToFit(1920, 1008, W, H)).toBe(1.5);
    expect(pixelScaleToFit(1920, 1080, W, H)).toBe(1.5);
  });

  it("floors to the largest half-integer factor that fits both axes", () => {
    // 2x needs 1536x1344; plenty of width but height is the binding axis.
    expect(pixelScaleToFit(3000, 1400, W, H)).toBe(2);
    expect(pixelScaleToFit(2560, 1440, W, H)).toBe(2);
    expect(pixelScaleToFit(4000, 2100, W, H)).toBe(3);
    // Between 2 and 3: 2.5x needs 1920x1680.
    expect(pixelScaleToFit(4000, 1700, W, H)).toBe(2.5);
  });

  it("is bound by the tighter axis, not the looser one", () => {
    // Loads of width, but height only allows 1x.
    expect(pixelScaleToFit(10000, 1000, W, H)).toBe(1);
  });

  it("clamps degenerate inputs to 1", () => {
    expect(pixelScaleToFit(1920, 1080, 0, H)).toBe(1);
    expect(pixelScaleToFit(1920, 1080, W, 0)).toBe(1);
    expect(pixelScaleToFit(Number.NaN, 1080, W, H)).toBe(1);
  });
});

describe("arena projection math", () => {
  const screenW = 768;
  const screenH = 672;
  const horizonFrac = 0.3;
  const horizonY = screenH * horizonFrac;
  const pitch = (35 * Math.PI) / 180;
  const focalLength = (0.2 * screenH) / Math.tan(pitch);
  const camHeight = 2.5;
  const camera = { camHeight, pitch, focalLength, horizonY };

  it("arenaFloorRowDistance returns Infinity at the horizon", () => {
    const d = arenaFloorRowDistance(horizonY, camera, screenH);
    expect(d).toBe(Infinity);
  });

  it("arenaFloorRowDistance is only valid below the horizon", () => {
    // Rows above the horizon correspond to rays pointing upward, so the
    // intersection with the floor plane is behind the camera (negative).
    expect(arenaFloorRowDistance(horizonY - 10, camera, screenH)).toBeLessThan(0);
  });

  it("arenaFloorRowDistance decreases as y moves below the horizon", () => {
    const atHorizonPlus10 = arenaFloorRowDistance(horizonY + 10, camera, screenH);
    const atHorizonPlus40 = arenaFloorRowDistance(horizonY + 40, camera, screenH);
    expect(atHorizonPlus40).toBeGreaterThan(0);
    expect(atHorizonPlus10).toBeGreaterThan(atHorizonPlus40);
  });

  it("arenaFloorWorldAt returns worldX = 0 at screen center", () => {
    const p = arenaFloorWorldAt(screenW / 2, horizonY + 50, camera, screenW, screenH);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeGreaterThan(0);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("arenaFloorWorldAt maps left/right of center to negative/positive worldX", () => {
    const left = arenaFloorWorldAt(screenW / 2 - 100, horizonY + 50, camera, screenW, screenH);
    const right = arenaFloorWorldAt(screenW / 2 + 100, horizonY + 50, camera, screenW, screenH);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it("arenaProject maps a far point on the optical axis to screen center", () => {
    // Optical axis direction: D = (0, cos θ, -sin θ). A point far along it
    // from the camera should project close to the screen center.
    const t = 1000;
    const p = arenaProject(
      {
        x: 0,
        y: t * Math.cos(pitch),
        z: camHeight - t * Math.sin(pitch),
      },
      camera,
      screenW,
      screenH
    );
    expect(p.x).toBeCloseTo(screenW / 2, 0);
    expect(p.y).toBeCloseTo(screenH / 2, 0);
  });

  it("arenaProject of a far floor point approaches the horizon", () => {
    const p = arenaProject({ x: 0, y: 1000, z: 0 }, camera, screenW, screenH);
    expect(p.x).toBeCloseTo(screenW / 2, 0);
    expect(p.y).toBeLessThanOrEqual(horizonY + 1);
  });

  it("arenaOpacityForDepth returns 1.0 at distance 0", () => {
    expect(arenaOpacityForDepth(0)).toBeCloseTo(1.0, 5);
  });

  it("arenaOpacityForDepth decreases monotonically", () => {
    const a = arenaOpacityForDepth(1);
    const b = arenaOpacityForDepth(5);
    const c = arenaOpacityForDepth(10);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("arenaOpacityForDepth never exceeds 1.0 or drops below 0", () => {
    for (let d = 0; d <= 20; d += 0.5) {
      const o = arenaOpacityForDepth(d);
      expect(o).toBeLessThanOrEqual(1.0);
      expect(o).toBeGreaterThanOrEqual(0);
    }
  });

  it("arenaFloorScreenYForDepth is the inverse of arenaFloorRowDistance", () => {
    for (const depth of [1, 3, 5, 9, 18]) {
      const y = arenaFloorScreenYForDepth(depth, camera, screenH);
      expect(arenaFloorRowDistance(y, camera, screenH)).toBeCloseTo(depth, 5);
    }
  });

  it("arenaFloorScreenYForDepth matches arenaProject on the floor plane", () => {
    for (const depth of [2, 8, 15]) {
      const fromInv = arenaFloorScreenYForDepth(depth, camera, screenH);
      const fromProj = arenaProject(
        { x: 0, y: depth, z: 0 },
        camera,
        screenW,
        screenH
      );
      expect(fromInv).toBeCloseTo(fromProj.y, 5);
    }
  });

  it("arenaFloorWorldAt matches arenaProject inverse on the floor", () => {
    const screenX = screenW / 2 + 80;
    const screenY = horizonY + 60;
    const floor = arenaFloorWorldAt(screenX, screenY, camera, screenW, screenH);
    const projected = arenaProject(
      { x: floor.x, y: floor.y, z: 0 },
      camera,
      screenW,
      screenH
    );
    expect(projected.x).toBeCloseTo(screenX, 4);
    expect(projected.y).toBeCloseTo(screenY, 4);
  });

  it("round-trips under the production ARENA_CAMERA tuple", () => {
    // Imports the real tuple instead of mirroring literals — the old mirrored
    // copy drifted (camHeight 3.8 vs production 4.5). arena-camera.ts is pure,
    // so this file stays DOM-free.
    const prodCam = buildArenaCamera(screenH);
    expect(arenaFloorRowDistance(prodCam.horizonY, prodCam, screenH)).toBe(
      Infinity
    );
    for (const depth of [1, 5, 10, 18]) {
      const y = arenaFloorScreenYForDepth(depth, prodCam, screenH);
      expect(arenaFloorRowDistance(y, prodCam, screenH)).toBeCloseTo(depth, 5);
      const projected = arenaProject(
        { x: 0, y: depth, z: 0 },
        prodCam,
        screenW,
        screenH
      );
      expect(projected.y).toBeCloseTo(y, 5);
    }
  });

  it("arenaSideWallWorldAt round-trips arenaProject on both wall planes", () => {
    // Project known points on the plane X = wallX, then recover (y, z) from
    // the resulting screen pixel. This is the exact inverse the side-wall
    // rasterizer relies on, so it must hold to floating-point precision.
    // worldY starts at 3: shallower points at z = 5.5 sit behind this pitched
    // camera's image plane (c < 0), where a null is the correct answer.
    for (const wallX of [-6, 6]) {
      for (const worldY of [3, 6.5, 11, 18]) {
        for (const worldZ of [0, 1.3, 4.2, 5.5]) {
          const p = arenaProject(
            { x: wallX, y: worldY, z: worldZ },
            camera,
            screenW,
            screenH
          );
          const hit = arenaSideWallWorldAt(p.x, p.y, wallX, camera, screenW, screenH);
          expect(hit).not.toBeNull();
          expect(hit!.y).toBeCloseTo(worldY, 6);
          expect(hit!.z).toBeCloseTo(worldZ, 6);
        }
      }
    }
  });

  it("arenaSideWallWorldAt round-trips under the production ARENA_CAMERA tuple", () => {
    const prodCam = buildArenaCamera(screenH);
    const halfW = ARENA_CAMERA.roomWidth / 2;
    for (const worldY of [3, 9, ARENA_CAMERA.roomDepth]) {
      for (const worldZ of [0, 2.5, ARENA_CAMERA.wallHeight]) {
        const p = arenaProject(
          { x: -halfW, y: worldY, z: worldZ },
          prodCam,
          screenW,
          screenH
        );
        const hit = arenaSideWallWorldAt(p.x, p.y, -halfW, prodCam, screenW, screenH);
        expect(hit).not.toBeNull();
        expect(hit!.y).toBeCloseTo(worldY, 6);
        expect(hit!.z).toBeCloseTo(worldZ, 6);
      }
    }
  });

  it("arenaSideWallWorldAt recovers z = 0 along the wall-base silhouette", () => {
    // The floor/wall silhouette edge at a row is the projected wall base, so
    // inverting that pixel must land back on the base (z = 0) at the same
    // depth arenaFloorRowDistance reports for the row.
    const prodCam = buildArenaCamera(screenH);
    const halfW = ARENA_CAMERA.roomWidth / 2;
    for (const worldY of [4, 10, 16]) {
      const p = arenaProject({ x: halfW, y: worldY, z: 0 }, prodCam, screenW, screenH);
      const hit = arenaSideWallWorldAt(p.x, p.y, halfW, prodCam, screenW, screenH);
      expect(hit).not.toBeNull();
      expect(hit!.z).toBeCloseTo(0, 6);
      expect(hit!.y).toBeCloseTo(arenaFloorRowDistance(p.y, prodCam, screenH), 5);
    }
  });

  it("arenaSideWallWorldAt rejects the center column and the wrong screen half", () => {
    // Center column: the plane is parallel to the ray (vanishing line).
    expect(
      arenaSideWallWorldAt(screenW / 2, 400, -6, camera, screenW, screenH)
    ).toBeNull();
    // A pixel right of center can only see the +X plane in front of the
    // camera; the -X plane intersection lies behind it (t < 0).
    expect(
      arenaSideWallWorldAt(screenW / 2 + 120, 400, -6, camera, screenW, screenH)
    ).toBeNull();
    expect(
      arenaSideWallWorldAt(screenW / 2 - 120, 400, 6, camera, screenW, screenH)
    ).toBeNull();
  });

  it("arenaSideWallWorldAt depth increases toward the silhouette edge", () => {
    // Moving inward (toward screen center) along a row, side-wall pixels sit
    // deeper into the room — this is the coursing compression that makes the
    // wall visibly recede.
    const prodCam = buildArenaCamera(screenH);
    const row = Math.round(prodCam.horizonY) + 30;
    const outer = arenaSideWallWorldAt(40, row, -6, prodCam, screenW, screenH);
    const inner = arenaSideWallWorldAt(200, row, -6, prodCam, screenW, screenH);
    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(inner!.y).toBeGreaterThan(outer!.y);
  });

  it("arenaSeamFrac matches a direct projection of the wall base", () => {
    const cam = buildArenaCamera(screenH);
    const seamY = arenaProject(
      { x: 0, y: ARENA_CAMERA.roomDepth, z: 0 },
      cam,
      screenW,
      screenH
    ).y;
    expect(arenaSeamFrac()).toBeCloseTo(seamY / screenH, 10);
    // Floor-dominant composition target: seam in the upper third of the frame.
    expect(arenaSeamFrac()).toBeGreaterThan(0.24);
    expect(arenaSeamFrac()).toBeLessThanOrEqual(0.34);
  });
});

describe("stair exit door rendering helpers", () => {
  it("recognizes stairs_up and stairs_down as exit features", () => {
    expect(isStairExitFeature("stairs_up")).toBe(true);
    expect(isStairExitFeature("stairs_down")).toBe(true);
    expect(isStairExitFeature("teleporter")).toBe(false);
    expect(isStairExitFeature(undefined)).toBe(false);
  });

  it("stops open edges into stair tiles as doors", () => {
    expect(raycastEdgeStop("open", "stairs_down")).toBe("door");
    expect(raycastEdgeStop("open", "stairs_up")).toBe("door");
    expect(raycastEdgeStop("open", "treasure")).toBeNull();
    expect(raycastEdgeStop("open", undefined)).toBeNull();
  });

  it("leaves real doors and walls unchanged", () => {
    expect(raycastEdgeStop("door", "stairs_down")).toBe("door");
    expect(raycastEdgeStop("locked", undefined)).toBe("locked");
    expect(raycastEdgeStop("wall", "stairs_up")).toBe("wall");
  });
});

describe("projectBillboard", () => {
  // Facing north: dir = (0,-1), plane = (0.66, 0).
  const camNorth = { x: 5, y: 5, dirX: 0, dirY: -1, planeX: 0.66, planeY: 0 };

  it("puts a tile straight ahead on the view axis at its grid distance", () => {
    const p = projectBillboard(camNorth, 5, 2)!;
    expect(p.depth).toBeCloseTo(3, 6);
    expect(p.lateral).toBeCloseTo(0, 6);
  });

  it("reports a tile behind the camera as negative depth", () => {
    const p = projectBillboard(camNorth, 5, 8)!;
    expect(p.depth).toBeLessThan(0);
  });

  it("gives the party's own tile a depth below the draw threshold", () => {
    // The underfoot tile must never be billboarded — it is drawn separately.
    const p = projectBillboard(camNorth, 5, 5)!;
    expect(p.depth).toBeLessThanOrEqual(BILLBOARD_MIN_DEPTH);
  });

  it("mirrors lateral offset for tiles either side of the view axis", () => {
    const left = projectBillboard(camNorth, 4, 2)!;
    const right = projectBillboard(camNorth, 6, 2)!;
    expect(left.depth).toBeCloseTo(right.depth, 6);
    expect(left.lateral).toBeCloseTo(-right.lateral, 6);
  });

  it("keeps depth equal to grid distance when facing east", () => {
    const camEast = { x: 5, y: 5, dirX: 1, dirY: 0, planeX: 0, planeY: 0.66 };
    const p = projectBillboard(camEast, 9, 5)!;
    expect(p.depth).toBeCloseTo(4, 6);
    expect(p.lateral).toBeCloseTo(0, 6);
  });

  it("returns null for a degenerate camera basis rather than emitting NaN", () => {
    // renderer.ts has no defensive clamping: a NaN here kills the render loop.
    const degenerate = { x: 5, y: 5, dirX: 1, dirY: 0, planeX: 1, planeY: 0 };
    expect(projectBillboard(degenerate, 6, 5)).toBeNull();
  });

  it("returns null when the camera carries a NaN", () => {
    const broken = { x: NaN, y: 5, dirX: 0, dirY: -1, planeX: 0.66, planeY: 0 };
    expect(projectBillboard(broken, 5, 2)).toBeNull();
  });
});

describe("billboardScreenX", () => {
  it("centres a billboard with no lateral offset", () => {
    expect(billboardScreenX({ lateral: 0, depth: 3 }, 640)).toBeCloseTo(320, 6);
  });

  it("moves right for positive lateral offset and left for negative", () => {
    const right = billboardScreenX({ lateral: 1, depth: 4 }, 640);
    const left = billboardScreenX({ lateral: -1, depth: 4 }, 640);
    expect(right).toBeGreaterThan(320);
    expect(left).toBeLessThan(320);
    expect(right - 320).toBeCloseTo(320 - left, 6);
  });

  it("converges toward centre as depth grows", () => {
    const near = billboardScreenX({ lateral: 1, depth: 2 }, 640);
    const far = billboardScreenX({ lateral: 1, depth: 8 }, 640);
    expect(Math.abs(far - 320)).toBeLessThan(Math.abs(near - 320));
  });
});

describe("ceilingAnchorY", () => {
  const H = 672;

  it("sits exactly at the horizon-mirrored floor line — the wall's top edge", () => {
    // The floor anchor (wallDrawBounds().drawStart, before its Math.max(0,...)
    // clamp) is h/2 - lineHeight/2 too — same wall band, opposite edge. The
    // eye reads "ceiling" as the wall's top, so the two must agree exactly.
    const depth = 3;
    const lineHeight = computeLineHeight(H, depth);
    expect(ceilingAnchorY(H, depth)).toBeCloseTo(H / 2 - lineHeight / 2, 6);
  });

  it("is UNCLAMPED: goes negative (off the top of the screen) at close range", () => {
    // This is the whole point of the primitive — see the doc comment. A
    // clamped anchor would freeze at 0 and the object would appear to slide
    // down and detach from the ceiling as the party approaches.
    const closeDepth = 0.3;
    expect(computeLineHeight(H, closeDepth)).toBeGreaterThan(H); // sanity: band overflows screen
    expect(ceilingAnchorY(H, closeDepth)).toBeLessThan(0);
  });

  it("differs from the floor anchor's clamped drawStart once the wall band overflows the screen", () => {
    const closeDepth = 0.3;
    const floorAnchor = wallDrawBounds(H, closeDepth).drawStart; // clamped to >= 0
    expect(floorAnchor).toBe(0);
    expect(ceilingAnchorY(H, closeDepth)).toBeLessThan(floorAnchor);
  });

  it("rises toward the horizon (h/2) monotonically as depth grows", () => {
    const y1 = ceilingAnchorY(H, 1);
    const y2 = ceilingAnchorY(H, 3);
    const y3 = ceilingAnchorY(H, 8);
    expect(y1).toBeLessThan(y2);
    expect(y2).toBeLessThan(y3);
    expect(y3).toBeLessThan(H / 2);
  });
});

describe("isBillboardOccluded", () => {
  it("is not occluded when the wall hit is farther than the billboard", () => {
    expect(isBillboardOccluded(5, 3)).toBe(false);
  });

  it("is occluded when the wall hit is nearer than the billboard", () => {
    expect(isBillboardOccluded(2, 5)).toBe(true);
  });

  it("uses a small epsilon so a billboard flush against a wall still draws", () => {
    expect(isBillboardOccluded(3, 3)).toBe(false);
  });
});

describe("featureMarkerSize", () => {
  const H = 672;

  it("shrinks with depth", () => {
    const near = featureMarkerSize(H, 2, 18);
    const far = featureMarkerSize(H, 5, 18);
    expect(near).toBeGreaterThan(far);
  });

  it("never exceeds the screen-fraction cap", () => {
    const cap = H * FEATURE_MARKER_MAX_SCREEN_FRAC;
    for (const depth of [0.25, 0.5, 1, 1.5, 2]) {
      expect(featureMarkerSize(H, depth, 18)).toBeLessThanOrEqual(Math.round(cap));
    }
  });

  it("clamps the one-tile case that used to cover half the viewport", () => {
    // Unclamped this was (672/1)*(26/56) = 312px on a 672px canvas.
    expect(featureMarkerSize(H, 1, 18)).toBe(Math.round(H * FEATURE_MARKER_MAX_SCREEN_FRAC));
  });

  it("never shrinks below the legibility floor", () => {
    expect(featureMarkerSize(H, 40, 18)).toBe(FEATURE_MARKER_MIN_PX);
  });

  it("returns the floor for a degenerate depth instead of Infinity", () => {
    expect(featureMarkerSize(H, 0, 18)).toBe(FEATURE_MARKER_MIN_PX);
    expect(featureMarkerSize(H, -1, 18)).toBe(FEATURE_MARKER_MIN_PX);
    expect(featureMarkerSize(H, NaN, 18)).toBe(FEATURE_MARKER_MIN_PX);
  });

  it("reads at roughly a sixth of the screen two tiles out", () => {
    const size = featureMarkerSize(H, 2, 18);
    expect(size / H).toBeGreaterThan(0.13);
    expect(size / H).toBeLessThan(0.19);
  });
});

describe("isCorridorMarkerFeature", () => {
  it("marks the landmark features a player should see ahead", () => {
    for (const t of ["treasure", "teleporter", "darkness", "antimagic", "water", "npc"] as const) {
      expect(isCorridorMarkerFeature(t)).toBe(true);
    }
  });

  it("keeps teleporters visible as navigation landmarks", () => {
    // Deliberately NOT hidden alongside chutes: a teleporter is something the
    // player is meant to spot, recognise and route toward.
    expect(isCorridorMarkerFeature("teleporter")).toBe(true);
  });

  it("hides chutes, which are concealed floor traps", () => {
    // Falling through a chute IS the event; marking it would remove the
    // mechanic rather than present it.
    expect(isCorridorMarkerFeature("chute")).toBe(false);
  });

  it("excludes stairs, which already paint as door panels", () => {
    expect(isCorridorMarkerFeature("stairs_up")).toBe(false);
    expect(isCorridorMarkerFeature("stairs_down")).toBe(false);
  });

  it("excludes event tiles so authored concealment and ambushes survive", () => {
    // Floors 1-3 author events as walk-into one-shots (hidden rewards, falling
    // bookcases). Telegraphing them would be a balance change, not a fix.
    expect(isCorridorMarkerFeature("event")).toBe(false);
  });

  it("treats an absent feature as nothing to draw", () => {
    expect(isCorridorMarkerFeature(undefined)).toBe(false);
  });
});

describe("glowBucketForDepth", () => {
  it("buckets ordinary depths by floor", () => {
    expect(glowBucketForDepth(0, 4)).toBe(0);
    expect(glowBucketForDepth(1.9, 4)).toBe(1);
    expect(glowBucketForDepth(2.0, 4)).toBe(2);
  });

  it("clamps past the last bucket", () => {
    expect(glowBucketForDepth(99, 4)).toBe(3);
  });

  it("clamps negative depth to 0 instead of returning -1", () => {
    // -1 indexed an array of Path2D and the undefined.moveTo() threw inside
    // the rAF callback, ending the render loop for the whole session.
    expect(glowBucketForDepth(-1, 4)).toBe(0);
    expect(glowBucketForDepth(-0.5, 4)).toBe(0);
  });

  it("maps a NaN depth to 0 rather than a NaN index", () => {
    expect(glowBucketForDepth(NaN, 4)).toBe(0);
    expect(glowBucketForDepth(Infinity, 4)).toBe(0);
  });

  it("always returns an in-range index for any input", () => {
    for (const d of [-1e9, -1, 0, 0.5, 3, 4, 1e9, NaN, Infinity, -Infinity]) {
      const b = glowBucketForDepth(d, 4);
      expect(Number.isInteger(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(3);
    }
  });
});

describe("propBillboardSize", () => {
  const H = 672;

  it("never lets a prop stand taller than the corridor around it", () => {
    // The shipped chest uses baseSize 40, which raw-scales to ~1.35x the wall
    // height — it drew taller than the corridor before the cap.
    for (const depth of [0.5, 1, 2, 3, 5]) {
      const wall = computeLineHeight(H, depth);
      expect(propBillboardSize(H, depth, 40)).toBeLessThanOrEqual(
        Math.round(wall * PROP_MAX_WALL_FRAC)
      );
    }
  });

  it("caps an oversized baseSize to the wall fraction", () => {
    const wall = computeLineHeight(H, 2);
    expect(propBillboardSize(H, 2, 40)).toBe(Math.round(wall * PROP_MAX_WALL_FRAC));
  });

  it("leaves a deliberately small prop at its raw scale", () => {
    // The cap only ever shrinks: a small baseSize must still render small.
    const raw = (H / 3) * (8 / 56);
    expect(propBillboardSize(H, 3, 8)).toBe(Math.round(raw));
  });

  it("shrinks with depth", () => {
    expect(propBillboardSize(H, 2, 40)).toBeGreaterThan(propBillboardSize(H, 5, 40));
  });

  it("returns the floor for a degenerate depth instead of Infinity", () => {
    expect(propBillboardSize(H, 0, 40)).toBe(FEATURE_MARKER_MIN_PX);
    expect(propBillboardSize(H, NaN, 40)).toBe(FEATURE_MARKER_MIN_PX);
    expect(propBillboardSize(H, -2, 40)).toBe(FEATURE_MARKER_MIN_PX);
  });
});

describe("dirForWallHit", () => {
  it("resolves the near cell's face from ray direction sign", () => {
    expect(dirForWallHit("x", 1, 0)).toBe("e");
    expect(dirForWallHit("x", -1, 0)).toBe("w");
    expect(dirForWallHit("y", 0, 1)).toBe("s");
    expect(dirForWallHit("y", 0, -1)).toBe("n");
  });
});

describe("wallFeatureCellForHit", () => {
  it("steps back one cell on the hit axis, matching themeForWallHit's near-cell math", () => {
    // A ray traveling +x that stops at mapX=5 crossed the east edge of the
    // cell at x=4 — the near (visible) cell is one step behind the hit.
    expect(wallFeatureCellForHit(5, 3, "x", 1, 0)).toEqual({ x: 4, y: 3, dir: "e" });
    expect(wallFeatureCellForHit(5, 3, "x", -1, 0)).toEqual({ x: 6, y: 3, dir: "w" });
    expect(wallFeatureCellForHit(2, 7, "y", 0, 1)).toEqual({ x: 2, y: 6, dir: "s" });
    expect(wallFeatureCellForHit(2, 7, "y", 0, -1)).toEqual({ x: 2, y: 8, dir: "n" });
  });
});

describe("stableWallX", () => {
  it("mirrors wallX only for the approach directions that flip texX", () => {
    // Same flip condition as the wall/door texX sampling in renderer.ts:
    // (side === "x" && rayDirX > 0) || (side === "y" && rayDirY < 0).
    expect(stableWallX(0.3, "x", 1, 0)).toBeCloseTo(0.7);
    expect(stableWallX(0.3, "x", -1, 0)).toBeCloseTo(0.3);
    expect(stableWallX(0.3, "y", 0, -1)).toBeCloseTo(0.7);
    expect(stableWallX(0.3, "y", 0, 1)).toBeCloseTo(0.3);
  });

  it("is stable across a round trip: approaching from either side reads the same physical spot", () => {
    // A decal centered on the face should sit at the same wallX regardless of
    // which direction the ray is walking, once flip-corrected.
    const fromOneSide = stableWallX(0.8, "x", 1, 0);
    const fromOtherSide = stableWallX(0.2, "x", -1, 0);
    expect(fromOneSide).toBeCloseTo(fromOtherSide);
  });
});

describe("wallFeatureLocalU", () => {
  it("returns null outside the centered window", () => {
    expect(wallFeatureLocalU(0.1, 0.5)).toBeNull();
    expect(wallFeatureLocalU(0.9, 0.5)).toBeNull();
  });

  it("maps the window to a 0-1 local U inside it", () => {
    // widthFrac 0.5 centered on the face -> window is [0.25, 0.75].
    expect(wallFeatureLocalU(0.25, 0.5)).toBeCloseTo(0);
    expect(wallFeatureLocalU(0.5, 0.5)).toBeCloseTo(0.5);
    expect(wallFeatureLocalU(0.75, 0.5)).toBeCloseTo(1);
  });

  it("a full-width decal (widthFrac 1) accepts the whole face", () => {
    expect(wallFeatureLocalU(0, 1)).toBeCloseTo(0);
    expect(wallFeatureLocalU(1, 1)).toBeCloseTo(1);
  });

  it("treats a non-positive widthFrac as never matching", () => {
    expect(wallFeatureLocalU(0.5, 0)).toBeNull();
    expect(wallFeatureLocalU(0.5, -1)).toBeNull();
  });
});

describe("wallFeatureVerticalRect", () => {
  it("centers the decal by default", () => {
    const [top, bottom] = wallFeatureVerticalRect(100, 300, 0.5, "center");
    expect(bottom - top).toBeCloseTo(100);
    expect(top).toBeCloseTo(150);
    expect(bottom).toBeCloseTo(250);
  });

  it("anchors to the bottom (floor-grounded props like a grate or vent)", () => {
    const [top, bottom] = wallFeatureVerticalRect(100, 300, 0.5, "bottom");
    expect(bottom).toBeCloseTo(300);
    expect(top).toBeCloseTo(200);
  });

  it("anchors to the top (e.g. a ceiling-adjacent feature)", () => {
    const [top, bottom] = wallFeatureVerticalRect(100, 300, 0.5, "top");
    expect(top).toBeCloseTo(100);
    expect(bottom).toBeCloseTo(200);
  });

  it("clamps heightFrac into 0-1", () => {
    const [top, bottom] = wallFeatureVerticalRect(100, 300, 2, "center");
    expect(top).toBeCloseTo(100);
    expect(bottom).toBeCloseTo(300);
  });
});
