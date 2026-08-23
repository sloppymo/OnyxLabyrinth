import { afterEach, describe, expect, it } from "vitest";
import { setReducedMotion } from "./combat-impact-fx";
import {
  clampDt,
  expDecay,
  initPoseSpring,
  poseFrom,
  type Pose,
  type PoseSpringTuning,
  updateDampedSpring,
  updatePoseSpring,
} from "./card-trial-motion";

afterEach(() => {
  setReducedMotion(false);
});

const TUNING: PoseSpringTuning = {
  positionFrequency: 14,
  positionDamping: 0.62,
  rotationFrequency: 16,
  rotationDamping: 0.7,
  scaleSharpness: 18,
};

function simulate(
  target: number,
  angularFrequency: number,
  dampingRatio: number,
  totalSeconds: number,
  stepSeconds: number
): number {
  let state = { value: 0, velocity: 0 };
  let t = 0;
  while (t < totalSeconds - 1e-9) {
    state = updateDampedSpring(state, target, angularFrequency, dampingRatio, stepSeconds);
    t += stepSeconds;
  }
  return state.value;
}

describe("updateDampedSpring", () => {
  it("is the identity transform at dt=0 for all three damping regimes", () => {
    for (const zeta of [0.4, 1.0, 1.8]) {
      const state = { value: 12.5, velocity: 3.2 };
      const next = updateDampedSpring(state, 100, 10, zeta, 0);
      expect(next.value).toBeCloseTo(state.value, 6);
      expect(next.velocity).toBeCloseTo(state.velocity, 6);
    }
  });

  it("converges to the equilibrium position with zero velocity over a long run", () => {
    for (const zeta of [0.3, 1.0, 2.5]) {
      let state = { value: 0, velocity: 0 };
      for (let i = 0; i < 600; i++) {
        state = updateDampedSpring(state, 50, 12, zeta, 1 / 60);
      }
      expect(state.value).toBeCloseTo(50, 3);
      expect(state.velocity).toBeCloseTo(0, 3);
    }
  });

  it("never produces NaN or Infinity across a wide parameter sweep", () => {
    const dts = [1 / 144, 1 / 60, 1 / 30, 0.05, 0.5];
    const zetas = [0, 0.1, 0.5, 0.9999, 1.0, 1.0001, 1.5, 5];
    for (const dt of dts) {
      for (const zeta of zetas) {
        let state = { value: -37, velocity: 250 };
        for (let i = 0; i < 50; i++) {
          state = updateDampedSpring(state, 10, 20, zeta, dt);
          expect(Number.isFinite(state.value)).toBe(true);
          expect(Number.isFinite(state.velocity)).toBe(true);
        }
      }
    }
  });

  it("is continuous across the critical-damping boundary (no branch discontinuity)", () => {
    const below = simulate(100, 10, 0.9999, 0.3, 1 / 240);
    const at = simulate(100, 10, 1.0, 0.3, 1 / 240);
    const above = simulate(100, 10, 1.0001, 0.3, 1 / 240);
    expect(Math.abs(below - at)).toBeLessThan(0.01);
    expect(Math.abs(above - at)).toBeLessThan(0.01);
  });

  it("underdamped overshoots the target; critically/over-damped never do", () => {
    let under = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 300; i++) {
      under = updateDampedSpring(under, 100, 15, 0.25, 1 / 120);
      max = Math.max(max, under.value);
    }
    expect(max).toBeGreaterThan(100);

    let crit = { value: 0, velocity: 0 };
    let critMax = 0;
    for (let i = 0; i < 300; i++) {
      crit = updateDampedSpring(crit, 100, 15, 1.0, 1 / 120);
      critMax = Math.max(critMax, crit.value);
    }
    expect(critMax).toBeLessThanOrEqual(100.0001);

    let over = { value: 0, velocity: 0 };
    let overMax = 0;
    for (let i = 0; i < 300; i++) {
      over = updateDampedSpring(over, 100, 15, 2.5, 1 / 120);
      overMax = Math.max(overMax, over.value);
    }
    expect(overMax).toBeLessThanOrEqual(100.0001);
  });

  it("gives materially equivalent poses at equal accumulated time regardless of step rate (30/60/144 Hz)", () => {
    const totalSeconds = 0.5;
    const at30 = simulate(80, 14, 0.62, totalSeconds, 1 / 30);
    const at60 = simulate(80, 14, 0.62, totalSeconds, 1 / 60);
    const at144 = simulate(80, 14, 0.62, totalSeconds, 1 / 144);
    expect(Math.abs(at30 - at144)).toBeLessThan(0.05);
    expect(Math.abs(at60 - at144)).toBeLessThan(0.01);
  });
});

describe("expDecay", () => {
  it("never overshoots the target", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) {
      const prev = v;
      v = expDecay(v, 10, 18, 1 / 60);
      expect(v).toBeLessThanOrEqual(10 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
    }
  });

  it("is timestep-independent at equal accumulated time", () => {
    const run = (step: number) => {
      let v = 0;
      let t = 0;
      while (t < 0.5 - 1e-9) {
        v = expDecay(v, 10, 12, step);
        t += step;
      }
      return v;
    };
    expect(Math.abs(run(1 / 30) - run(1 / 144))).toBeLessThan(0.02);
  });
});

describe("clampDt", () => {
  it("clamps pathological elapsed time after tab suspension", () => {
    expect(clampDt(30)).toBeLessThanOrEqual(1 / 20);
    expect(clampDt(-5)).toBe(0);
    expect(clampDt(Number.NaN)).toBe(0);
    expect(clampDt(1 / 120)).toBeCloseTo(1 / 120, 6);
  });
});

describe("updatePoseSpring reduced motion", () => {
  const target: Pose = { x: 200, y: 300, rotation: 12, scale: 1.1 };

  it("snaps directly to target and zeroes velocity when reduced motion is on", () => {
    setReducedMotion(true);
    const state = initPoseSpring({ x: 0, y: 0, rotation: 0, scale: 1 });
    const next = updatePoseSpring(state, target, TUNING, 1 / 60);
    expect(poseFrom(next)).toEqual(target);
    expect(next.x.velocity).toBe(0);
    expect(next.rotation.velocity).toBe(0);
  });

  it("animates gradually when reduced motion is off", () => {
    setReducedMotion(false);
    const state = initPoseSpring({ x: 0, y: 0, rotation: 0, scale: 1 });
    const next = updatePoseSpring(state, target, TUNING, 1 / 60);
    expect(poseFrom(next)).not.toEqual(target);
    expect(poseFrom(next).x).toBeGreaterThan(0);
    expect(poseFrom(next).x).toBeLessThan(target.x);
  });
});
