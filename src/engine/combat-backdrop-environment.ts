import { combatBackdropRecipeForId } from "../data/combat-backdrops";

export interface BackdropDroplet {
  x: number;
  y: number;
  length: number;
  alpha: number;
}

export interface BackdropRipple {
  x: number;
  y: number;
  width: number;
  alpha: number;
}

export interface BackdropMistBand {
  x: number;
  y: number;
  width: number;
  alpha: number;
}

export interface CombatBackdropEnvironmentSample {
  active: boolean;
  torchFrame: number;
  droplets: BackdropDroplet[];
  ripples: BackdropRipple[];
  mist: BackdropMistBand[];
}

const EMPTY: CombatBackdropEnvironmentSample = {
  active: false,
  torchFrame: 0,
  droplets: [],
  ripples: [],
  mist: [],
};

function phase(now: number, period: number, offset = 0): number {
  return (((now + offset) % period) + period) % period / period;
}

/**
 * Deterministic background life shared by Canvas and Phaser. Nothing here
 * mutates combat state, so pausing/replaying the presentation stays exact.
 */
export function sampleCombatBackdropEnvironment(
  backdropId: string | null | undefined,
  now: number,
  w: number,
  h: number
): CombatBackdropEnvironmentSample {
  if (combatBackdropRecipeForId(backdropId).ambient !== "f1-flooded") return EMPTY;

  const droplets = [
    { x: 0.43, offset: 0, period: 1680, top: 0.19 },
    { x: 0.59, offset: 690, period: 2130, top: 0.24 },
    { x: 0.27, offset: 1240, period: 2470, top: 0.29 },
  ].map((drop) => {
    const p = phase(now, drop.period, drop.offset);
    return {
      x: w * drop.x,
      y: h * (drop.top + p * 0.24),
      length: Math.max(2, Math.round(h * 0.009)),
      alpha: p < 0.82 ? 0.18 + p * 0.34 : (1 - p) * 2.8,
    };
  });

  const ripples = [
    { x: 0.47, y: 0.57, offset: 0, period: 1800 },
    { x: 0.32, y: 0.72, offset: 940, period: 2350 },
    { x: 0.64, y: 0.63, offset: 1560, period: 2800 },
  ].map((ripple) => {
    const p = phase(now, ripple.period, ripple.offset);
    return {
      x: w * ripple.x,
      y: h * ripple.y,
      width: w * (0.018 + p * 0.055),
      alpha: (1 - p) * 0.22,
    };
  });

  const drift = phase(now, 9200);
  const mist = [
    { x: -0.1 + drift * 0.28, y: 0.39, width: 0.34, alpha: 0.055 },
    { x: 0.58 - drift * 0.22, y: 0.48, width: 0.29, alpha: 0.045 },
  ].map((band) => ({
    x: w * band.x,
    y: h * band.y,
    width: w * band.width,
    alpha: band.alpha,
  }));

  return {
    active: true,
    torchFrame: Math.floor(phase(now, 480) * 4),
    droplets,
    ripples,
    mist,
  };
}
