export type Rng = () => number;

/** Explicit fallback for legacy pure-helper callers without a run stream. */
export const nondeterministicRng: Rng = () => Math.random();

/**
 * Create an independent seeded RNG stream. The stream is deliberately an
 * explicit dependency: callers own its lifetime and pass it to gameplay
 * systems, so cosmetic randomness cannot advance gameplay state.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
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
  return createSeededRng(hash >>> 0);
}
