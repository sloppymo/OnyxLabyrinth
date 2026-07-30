import { describe, expect, it } from "vitest";
import {
  applyStatusTint,
  hitSquashFootOffset,
  hitSquashScale,
  spotlightRecipe,
  statusTintFor,
  TINT_BURN,
  TINT_MODE_MULTIPLY,
  TINT_POISON,
} from "./combat-phaser-fx";

describe("statusTintFor", () => {
  it("returns empty when neither status", () => {
    expect(statusTintFor({})).toEqual({});
  });

  it("poison alone uses green multiply", () => {
    expect(statusTintFor({ poison: true })).toEqual({
      tint: TINT_POISON,
      mode: TINT_MODE_MULTIPLY,
    });
  });

  it("burn alone uses orange multiply", () => {
    expect(statusTintFor({ burn: true })).toEqual({
      tint: TINT_BURN,
      mode: TINT_MODE_MULTIPLY,
    });
  });

  it("poison+burn uses corner split under MULTIPLY (not MULTIPLY_TWO)", () => {
    expect(statusTintFor({ poison: true, burn: true })).toEqual({
      corners: [TINT_POISON, TINT_BURN, TINT_POISON, TINT_BURN],
      mode: TINT_MODE_MULTIPLY,
    });
  });
});

describe("spotlightRecipe", () => {
  it("defaults to warm glow and mild dim", () => {
    const r = spotlightRecipe({});
    expect(r.glowColor).toBe(0xffe8a0);
    expect(r.glowOuter).toBeGreaterThan(0);
    expect(r.dimBrightness).toBeLessThan(1);
  });

  it("casting cools the glow and dims more", () => {
    const r = spotlightRecipe({ casting: true });
    expect(r.glowColor).toBe(0xa8c8ff);
    expect(r.dimBrightness).toBeLessThan(spotlightRecipe({}).dimBrightness);
  });

  it("boss accent overrides glow color", () => {
    const r = spotlightRecipe({ bossAccentHex: "#c05050" });
    expect(r.glowColor).toBe(0xc05050);
  });
});

describe("applyStatusTint", () => {
  it("clears when no tint", () => {
    const calls: string[] = [];
    applyStatusTint(
      {
        clearTint: () => calls.push("clear"),
        setTint: () => calls.push("tint"),
      },
      {}
    );
    expect(calls).toEqual(["clear"]);
  });

  it("applies corner tint for dual status", () => {
    const calls: Array<[string, number?, number?, number?, number?]> = [];
    applyStatusTint(
      {
        setTint: (tl, tr, bl, br) => calls.push(["tint", tl, tr, bl, br]),
        setTintMode: (m) => calls.push(["mode", m]),
      },
      {
        corners: [TINT_POISON, TINT_BURN, TINT_POISON, TINT_BURN],
        mode: TINT_MODE_MULTIPLY,
      }
    );
    expect(calls).toEqual([
      ["tint", TINT_POISON, TINT_BURN, TINT_POISON, TINT_BURN],
      ["mode", TINT_MODE_MULTIPLY],
    ]);
  });
});

describe("hitSquashScale", () => {
  it("starts and ends near identity", () => {
    expect(hitSquashScale(0)).toEqual({ sx: 1, sy: 1 });
    const end = hitSquashScale(1);
    expect(end.sx).toBeCloseTo(1, 5);
    expect(end.sy).toBeCloseTo(1, 5);
  });

  it("widens and shortens near the peak", () => {
    const mid = hitSquashScale(0.18);
    expect(mid.sx).toBeGreaterThan(1);
    expect(mid.sy).toBeLessThan(1);
  });

  it("foot offset pushes Y down when sy < 1", () => {
    expect(hitSquashFootOffset(100, 1)).toBe(0);
    expect(hitSquashFootOffset(100, 0.8)).toBeCloseTo(10, 5);
  });
});
