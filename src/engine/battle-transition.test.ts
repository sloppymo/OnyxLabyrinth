/**
 * Pure math + reduced-motion / snapshot helpers for the FF6-style battle
 * transition. Canvas drawing is exercised visually in play.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  apertureBounds,
  snapshotSource,
  playEncounterTransition,
  playReturnTransition,
  revealAfterTransition,
  setReducedMotionForTests,
  getTransitionGenerationForTests,
} from "./battle-transition";

describe("apertureBounds", () => {
  const W = 768;
  const H = 672;

  it("spans nearly the full width at t=0", () => {
    const mid = apertureBounds(H / 2, H, W, 0, 0);
    expect(mid.right - mid.left).toBeGreaterThan(W * 0.4);
    expect(mid.left).toBeLessThan(mid.right);
  });

  it("is empty at t=1 (left >= right)", () => {
    for (let y = 0; y < H; y += 24) {
      const b = apertureBounds(y, H, W, 1, Math.PI);
      expect(b.left).toBeGreaterThanOrEqual(b.right);
    }
  });

  it("shrinks monotonically as t increases (mid scanline, fixed theta)", () => {
    const widths: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const b = apertureBounds(H / 2, H, W, t, 0.4);
      widths.push(Math.max(0, b.right - b.left));
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeLessThanOrEqual(widths[i - 1]! + 1e-6);
    }
    expect(widths[0]!).toBeGreaterThan(widths[widths.length - 1]!);
  });

  it("clamps edges to [0, w]", () => {
    for (const t of [0, 0.3, 0.7, 0.95]) {
      for (const theta of [0, 1.2, 4.5]) {
        const b = apertureBounds(100, H, W, t, theta);
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(W);
      }
    }
  });
});

describe("snapshotSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubCanvas2d(): void {
    const fakeCtx = {
      fillStyle: "",
      globalAlpha: 1,
      fillRect: () => {},
      clearRect: () => {},
      drawImage: vi.fn(),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      ellipse: () => {},
      clip: () => {},
      setTransform: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D
    );
  }

  it("always returns a design-sized buffer", () => {
    stubCanvas2d();
    const tiny = document.createElement("canvas");
    tiny.width = 1;
    tiny.height = 1;
    const out = snapshotSource(tiny);
    expect(out.width).toBe(768);
    expect(out.height).toBe(672);
  });

  it("accepts null (arena/title fallback)", () => {
    stubCanvas2d();
    const out = snapshotSource(null);
    expect(out.width).toBe(768);
    expect(out.height).toBe(672);
  });
});

describe("generation + reduced-motion", () => {
  afterEach(() => {
    setReducedMotionForTests(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.getElementById("battle-transition")?.remove();
    document.getElementById("game-wrap")?.remove();
  });

  function stubCanvas2d(): void {
    const fakeCtx = {
      fillStyle: "",
      globalAlpha: 1,
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      ellipse: () => {},
      clip: () => {},
      setTransform: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D
    );
  }

  function ensureHost(): HTMLCanvasElement {
    stubCanvas2d();
    let wrap = document.querySelector<HTMLDivElement>("#game-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "game-wrap";
      document.body.appendChild(wrap);
    }
    const source = document.createElement("canvas");
    source.width = 64;
    source.height = 56;
    return source;
  }

  function installFakeTime(): void {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      now += 32;
      return setTimeout(() => cb(now), 0) as unknown as number;
    });
  }

  it("playEncounterTransition resolves on the reduced-motion path", async () => {
    setReducedMotionForTests(true);
    installFakeTime();
    const source = ensureHost();
    const p = playEncounterTransition({ source, isBoss: false });
    await vi.runAllTimersAsync();
    await p;
    await revealAfterTransition();
    await vi.runAllTimersAsync();
  });

  it("playReturnTransition resolves with no source under reduced motion", async () => {
    setReducedMotionForTests(true);
    installFakeTime();
    ensureHost();
    const p = playReturnTransition({ source: null });
    await vi.runAllTimersAsync();
    await p;
    expect(document.getElementById("battle-transition")).toBeTruthy();
    const reveal = revealAfterTransition();
    await vi.runAllTimersAsync();
    await reveal;
  });

  it("a newer wipe bumps generation so an older reveal will not hideOverlay", async () => {
    setReducedMotionForTests(true);
    installFakeTime();
    const source = ensureHost();
    const g0 = getTransitionGenerationForTests();
    const leave = playReturnTransition({ source });
    await vi.runAllTimersAsync();
    await leave;
    const g1 = getTransitionGenerationForTests();
    expect(g1).toBeGreaterThan(g0);

    // Start a second wipe before revealing the first — bumps generation again.
    const enter = playEncounterTransition({ source, isBoss: false });
    await vi.runAllTimersAsync();
    await enter;
    const g2 = getTransitionGenerationForTests();
    expect(g2).toBeGreaterThan(g1);

    // Reveal for the *current* (second) wipe; overlay should stay mountable.
    const reveal = revealAfterTransition();
    await vi.runAllTimersAsync();
    await reveal;
    expect(getTransitionGenerationForTests()).toBe(g2);
  });
});
