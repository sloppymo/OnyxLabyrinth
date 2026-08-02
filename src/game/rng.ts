/**
 * Seeded random number generator for reproducible playtests.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 */

export type Rng = () => number;

/**
 * Create a seeded RNG function. Returns values in [0, 1).
 * If no seed is provided, uses Math.random for nondeterministic behavior.
 */
export function createSeededRng(seed?: number): Rng {
  if (seed === undefined) {
    return Math.random;
  }
  
  // Simple LCG using constants from Numerical Recipes
  let state = seed;
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  
  return () => {
    state = (a * state + c) % m;
    return state / m;
  };
}

/**
 * Create a seeded RNG from a string seed (useful for human-readable seeds).
 */
export function createRngFromString(seedString: string): Rng {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    const char = seedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return createSeededRng(Math.abs(hash));
}

/**
 * Global gameplay RNG instance for the current run.
 * This is the single source of truth for all gameplay-affecting randomness.
 * Cosmetic randomness (audio, VFX) should use separate Math.random calls.
 */
let gameplayRng: Rng = Math.random;

/**
 * Set the global gameplay RNG for the current run.
 * Call this at the start of a session with either a seeded RNG or Math.random.
 */
export function setGameplayRng(rng: Rng): void {
  gameplayRng = rng;
}

/**
 * Get the current gameplay RNG function.
 * All gameplay systems should use this instead of direct Math.random calls.
 */
export function getGameplayRng(): Rng {
  return gameplayRng;
}

/**
 * Reset the gameplay RNG to Math.random (for normal play).
 */
export function resetGameplayRng(): void {
  gameplayRng = Math.random;
}