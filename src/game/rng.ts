/**
 * Seeded random number generator for reproducible playtests.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 */

export type Rng = () => number;

// LCG constants from Numerical Recipes. The modulus 2^32 is implicit in the
// `>>> 0` unsigned conversion below — no explicit `%` needed.
const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_MODULUS = 4294967296; // 2^32

/**
 * Create a seeded RNG function. Returns values in [0, 1).
 * If no seed is provided, uses Math.random for nondeterministic behavior.
 *
 * The seed is normalized to an unsigned 32-bit integer: non-finite values
 * become 0, fractions are truncated, and negative values wrap via `>>> 0`.
 * This guarantees the internal LCG state stays in `[0, 2^32)` and every
 * output falls in `[0, 1)` regardless of what the caller passes.
 */
export function createSeededRng(seed?: number): Rng {
  if (seed === undefined) {
    return Math.random;
  }

  // Normalize to uint32. Number.isFinite rejects NaN/Infinity; Math.trunc
  // drops fractions; >>> 0 wraps negatives into unsigned range.
  let state = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;

  return () => {
    // Math.imul gives the low 32 bits of the product without float precision
    // loss (a * state can exceed MAX_SAFE_INTEGER for large state). >>> 0
    // converts the result to unsigned 32-bit, which also fixes JS modulo's
    // sign issue — a plain `% 2**32` would preserve a negative dividend's
    // sign and break the [0, 1) contract.
    state = (Math.imul(LCG_A, state) + LCG_C) >>> 0;
    return state / LCG_MODULUS;
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