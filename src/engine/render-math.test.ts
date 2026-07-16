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
  RenderCameraAnimator,
  cappedRenderSize,
  arenaFloorRowDistance,
  arenaFloorWorldAt,
  arenaProject,
  arenaOpacityForDepth,
  arenaFloorScreenYForDepth,
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

  it("round-trips under production arena DEFAULTS (35° pitch, horizon 0.24)", () => {
    // Mirrors arena-renderer.ts DEFAULTS + ARENA_HORIZON_FRAC without importing
    // the canvas module into this DOM-free test file.
    const prodPitch = (35 * Math.PI) / 180;
    const prodHorizonFrac = 0.24;
    const prodHorizonY = screenH * prodHorizonFrac;
    const prodFocal = ((0.5 - prodHorizonFrac) * screenH) / Math.tan(prodPitch);
    const prodCam = {
      camHeight: 3.8,
      pitch: prodPitch,
      focalLength: prodFocal,
      horizonY: prodHorizonY,
    };
    expect(arenaFloorRowDistance(prodHorizonY, prodCam, screenH)).toBe(Infinity);
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
});
