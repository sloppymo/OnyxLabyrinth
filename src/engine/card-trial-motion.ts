/**
 * Timestep-correct motion primitives for the Card Trial physical hand.
 *
 * `updateDampedSpring` is a port of Ryan Juckett's closed-form damped
 * harmonic oscillator solution (https://www.ryanjuckett.com/damped-springs/).
 * Unlike `velocity += error * k; velocity *= damping; position += velocity`,
 * this is exact for any `dt` — the same motion at 30/60/144 Hz, not just the
 * same speed. It also switches formulation (under/critically/over-damped)
 * through a small epsilon band around dampingRatio === 1 rather than
 * dividing by the vanishing `alpha`/`zb` term at that exact boundary.
 *
 * `expDecay` is the simpler timestep-independent exponential-convergence
 * primitive for properties where overshoot is undesirable (scale, neighbor
 * displacement) — see Freya Holmér's "lerp smoothing is broken."
 *
 * Reduced motion reuses `combat-impact-fx.ts`'s `getReducedMotion()`, not
 * `battle-transition.ts` — the latter's `prefersReducedMotion()` is private
 * (only its test-override setter is exported) and is about screen wipes,
 * a different domain. `combat-impact-fx.ts`'s flag is already kept fresh
 * for every combat scene via `syncReducedMotionFromMediaQuery()` in
 * `combat-choreography.ts`'s `createScene()` — which Card Trial goes
 * through too, via the shared `CombatStage`/`CombatScene` construction path
 * — and it ships a plain exported setter (`setReducedMotion`) tests can use
 * without mocking global `matchMedia`.
 */

import { getReducedMotion } from "./combat-impact-fx";

export interface SpringState1D {
  value: number;
  velocity: number;
}

const CRITICAL_EPSILON = 0.0001;

/**
 * Advance a damped spring toward `equilibrium` by `dt` seconds. Pure and
 * side-effect free — callers own the state object.
 */
export function updateDampedSpring(
  state: SpringState1D,
  equilibrium: number,
  angularFrequency: number,
  dampingRatio: number,
  dt: number
): SpringState1D {
  if (angularFrequency <= 0 || dt <= 0) {
    return { value: state.value, velocity: state.velocity };
  }

  const oldPos = state.value - equilibrium;
  const oldVel = state.velocity;
  let posPosCoef: number;
  let posVelCoef: number;
  let velPosCoef: number;
  let velVelCoef: number;

  if (dampingRatio > 1 + CRITICAL_EPSILON) {
    // Over-damped: two real exponential roots, no oscillation.
    const za = -angularFrequency * dampingRatio;
    const zb = angularFrequency * Math.sqrt(dampingRatio * dampingRatio - 1);
    const z1 = za - zb;
    const z2 = za + zb;
    const e1 = Math.exp(z1 * dt);
    const e2 = Math.exp(z2 * dt);
    const invTwoZb = 1 / (2 * zb);
    const e1OverTwoZb = e1 * invTwoZb;
    const e2OverTwoZb = e2 * invTwoZb;
    const z1e1OverTwoZb = z1 * e1OverTwoZb;
    const z2e2OverTwoZb = z2 * e2OverTwoZb;

    posPosCoef = e1OverTwoZb * z2 - z2e2OverTwoZb + e2;
    posVelCoef = -e1OverTwoZb + e2OverTwoZb;
    velPosCoef = (z1e1OverTwoZb - z2e2OverTwoZb + e2) * z2;
    velVelCoef = -z1e1OverTwoZb + z2e2OverTwoZb;
  } else if (dampingRatio < 1 - CRITICAL_EPSILON) {
    // Under-damped: complex roots, deliberate oscillatory overshoot.
    const omegaZeta = angularFrequency * dampingRatio;
    const alpha = angularFrequency * Math.sqrt(1 - dampingRatio * dampingRatio);
    const expTerm = Math.exp(-omegaZeta * dt);
    const cosTerm = Math.cos(alpha * dt);
    const sinTerm = Math.sin(alpha * dt);
    const invAlpha = 1 / alpha;

    posPosCoef = expTerm * (cosTerm + omegaZeta * invAlpha * sinTerm);
    posVelCoef = expTerm * (sinTerm * invAlpha);
    velPosCoef = -expTerm * (alpha * sinTerm + omegaZeta * omegaZeta * invAlpha * sinTerm);
    velVelCoef = expTerm * (cosTerm - omegaZeta * invAlpha * sinTerm);
  } else {
    // Critically damped: fastest convergence with no overshoot. Also the
    // branch used for dampingRatio essentially === 1, where the under/over
    // formulations above would divide by a vanishing alpha/zb.
    const expTerm = Math.exp(-angularFrequency * dt);
    const timeExp = dt * expTerm;
    const timeExpFreq = timeExp * angularFrequency;

    posPosCoef = timeExpFreq + expTerm;
    posVelCoef = timeExp;
    velPosCoef = -angularFrequency * timeExpFreq;
    velVelCoef = -timeExpFreq + expTerm;
  }

  return {
    value: oldPos * posPosCoef + oldVel * posVelCoef + equilibrium,
    velocity: oldPos * velPosCoef + oldVel * velVelCoef,
  };
}

/** Timestep-independent exponential convergence — no overshoot, ever. */
export function expDecay(current: number, target: number, sharpness: number, dt: number): number {
  if (sharpness <= 0 || dt <= 0) return current;
  const t = 1 - Math.exp(-sharpness * dt);
  return current + (target - current) * t;
}

/** Safety net for tab-suspend/huge-dt frames. Defensive, not foundational —
 * the spring formula above is already exact for any dt on its own. */
export const MAX_DT_SECONDS = 1 / 20;

export function clampDt(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) return 0;
  return Math.min(dtSeconds, MAX_DT_SECONDS);
}

export interface Pose {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface PoseSpringState {
  x: SpringState1D;
  y: SpringState1D;
  rotation: SpringState1D;
  scale: number;
}

export interface PoseSpringTuning {
  positionFrequency: number;
  positionDamping: number;
  rotationFrequency: number;
  rotationDamping: number;
  scaleSharpness: number;
}

export function poseFrom(state: PoseSpringState): Pose {
  return { x: state.x.value, y: state.y.value, rotation: state.rotation.value, scale: state.scale };
}

export function initPoseSpring(pose: Pose): PoseSpringState {
  return {
    x: { value: pose.x, velocity: 0 },
    y: { value: pose.y, velocity: 0 },
    rotation: { value: pose.rotation, velocity: 0 },
    scale: pose.scale,
  };
}

/**
 * Advance one card's pose toward `target` by `dtSeconds`. Position/rotation
 * use the damped spring (weight, momentum, deliberate overshoot); scale
 * uses exponential decay (no overshoot wanted on a resize). Reduced motion
 * skips integration entirely and snaps straight to target — same state
 * machine, no alternate code path.
 */
export function updatePoseSpring(
  state: PoseSpringState,
  target: Pose,
  tuning: PoseSpringTuning,
  dtSeconds: number
): PoseSpringState {
  if (getReducedMotion()) {
    return initPoseSpring(target);
  }
  const dt = clampDt(dtSeconds);
  if (dt <= 0) return state;
  return {
    x: updateDampedSpring(state.x, target.x, tuning.positionFrequency, tuning.positionDamping, dt),
    y: updateDampedSpring(state.y, target.y, tuning.positionFrequency, tuning.positionDamping, dt),
    rotation: updateDampedSpring(
      state.rotation,
      target.rotation,
      tuning.rotationFrequency,
      tuning.rotationDamping,
      dt
    ),
    scale: expDecay(state.scale, target.scale, tuning.scaleSharpness, dt),
  };
}
