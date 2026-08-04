import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSeededRng,
  createRngFromString,
  setGameplayRng,
  getGameplayRng,
  resetGameplayRng,
  type Rng,
} from "./rng";

describe("createSeededRng", () => {
  it("returns Math.random when no seed is provided", () => {
    const rng = createSeededRng();
    expect(rng).toBe(Math.random);
  });

  it("produces deterministic sequences for the same seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always returns values in [0, 1)", () => {
    // Test many seeds including edge cases; every output must be in [0, 1).
    const edgeSeeds = [0, 1, -1, 0.5, -0.5, 1e10, -1e10, 4294967295, 4294967296, -4294967296];
    for (const seed of edgeSeeds) {
      const rng = createSeededRng(seed);
      for (let i = 0; i < 100; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("normalizes NaN to a valid (non-throwing) RNG", () => {
    const rng = createSeededRng(NaN);
    for (let i = 0; i < 10; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("normalizes Infinity to a valid (non-throwing) RNG", () => {
    const rng = createSeededRng(Infinity);
    for (let i = 0; i < 10; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("normalizes negative seeds to unsigned 32-bit (same as the equivalent positive wrap)", () => {
    // -1 >>> 0 === 4294967295, so createSeededRng(-1) should match
    // createSeededRng(4294967295).
    const fromNeg = createSeededRng(-1);
    const fromPos = createSeededRng(4294967295);
    const seqNeg = Array.from({ length: 20 }, () => fromNeg());
    const seqPos = Array.from({ length: 20 }, () => fromPos());
    expect(seqNeg).toEqual(seqPos);
  });

  it("truncates fractional seeds", () => {
    // Math.trunc(42.9) === 42, so createSeededRng(42.9) should match
    // createSeededRng(42).
    const fromFrac = createSeededRng(42.9);
    const fromInt = createSeededRng(42);
    const seqFrac = Array.from({ length: 20 }, () => fromFrac());
    const seqInt = Array.from({ length: 20 }, () => fromInt());
    expect(seqFrac).toEqual(seqInt);
  });

  it("wraps seeds larger than 2^32 via unsigned 32-bit truncation", () => {
    // 4294967296 (2^32) >>> 0 === 0, so it should match seed 0.
    const fromBig = createSeededRng(4294967296);
    const fromZero = createSeededRng(0);
    const seqBig = Array.from({ length: 20 }, () => fromBig());
    const seqZero = Array.from({ length: 20 }, () => fromZero());
    expect(seqBig).toEqual(seqZero);
  });

  it("does not produce NaN or Infinity outputs for any valid seed", () => {
    for (const seed of [0, 1, -1, 0.5, NaN, Infinity, -Infinity, 1e15]) {
      const rng = createSeededRng(seed);
      for (let i = 0; i < 50; i++) {
        const v = rng();
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("createRngFromString", () => {
  it("produces deterministic sequences for the same string", () => {
    const a = createRngFromString("onyx");
    const b = createRngFromString("onyx");
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different strings", () => {
    const a = createRngFromString("onyx");
    const b = createRngFromString("labyrinth");
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always returns values in [0, 1)", () => {
    const rng = createRngFromString("test-seed");
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("global gameplay RNG", () => {
  // afterEach safety: always restore Math.random so a failing test can't
  // leak a seeded RNG into the rest of the suite.
  afterEach(() => resetGameplayRng());

  it("defaults to Math.random", () => {
    resetGameplayRng();
    expect(getGameplayRng()).toBe(Math.random);
  });

  it("setGameplayRng replaces the global RNG", () => {
    const stub: Rng = () => 0.5;
    setGameplayRng(stub);
    expect(getGameplayRng()).toBe(stub);
    expect(getGameplayRng()()).toBe(0.5);
  });

  it("resetGameplayRng restores Math.random", () => {
    setGameplayRng(createSeededRng(42));
    expect(getGameplayRng()).not.toBe(Math.random);
    resetGameplayRng();
    expect(getGameplayRng()).toBe(Math.random);
  });
});

describe("Vitest gameplay RNG reseed", () => {
  it("is reseeded before each test", () => {
    expect(getGameplayRng()).not.toBe(Math.random);
  });

  it("produces an identical sequence when reseeded with the same seed", () => {
    resetGameplayRng();
    setGameplayRng(createSeededRng(0x20260804));
    const a = Array.from({ length: 10 }, () => getGameplayRng()());
    resetGameplayRng();
    setGameplayRng(createSeededRng(0x20260804));
    const b = Array.from({ length: 10 }, () => getGameplayRng()());
    expect(b).toEqual(a);
    resetGameplayRng();
  });

  it("explicit per-test replacement still takes precedence", () => {
    const stub: Rng = () => 0.7;
    setGameplayRng(stub);
    expect(getGameplayRng()).toBe(stub);
    expect(getGameplayRng()()).toBe(0.7);
  });
});
