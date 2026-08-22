/**
 * Card Trial shuffle stream. Isolated from gameplay / bark / combat RNG.
 * Uses the same LCG constants as `game/rng.ts` but a private state object
 * that nothing else reads.
 */

import type { ShuffleStream } from "./types";

const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_MODULUS = 4294967296;

export function createShuffleStream(seed: number): ShuffleStream {
  let state = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1;
  if (state === 0) state = 1;
  return {
    nextUnit() {
      state = (Math.imul(LCG_A, state) + LCG_C) >>> 0;
      return state / LCG_MODULUS;
    },
    getState() {
      return state;
    },
  };
}

export function shuffleInPlace<T>(items: T[], stream: ShuffleStream): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(stream.nextUnit() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
}
