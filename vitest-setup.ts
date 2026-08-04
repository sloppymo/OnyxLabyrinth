import { beforeEach, afterEach } from "vitest";
import { createSeededRng, setGameplayRng, resetGameplayRng } from "./src/game/rng";

/**
 * Default deterministic seed for the Vitest gameplay RNG.
 * Tests that need a different fixed seed can set ONYX_TEST_RNG_SEED before the
 * run begins, or call setGameplayRng()/createSeededRng() inside the test.
 */
const DEFAULT_TEST_SEED = 0x20260804;

beforeEach(() => {
  const raw = process.env.ONYX_TEST_RNG_SEED;
  const seed = raw ? Number(raw) : DEFAULT_TEST_SEED;
  setGameplayRng(createSeededRng(seed));
});

afterEach(() => {
  resetGameplayRng();
});
