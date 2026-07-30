import { describe, expect, it } from "vitest";
import {
  applyStatusTint,
  spotlightRecipe,
  statusTintFor,
  TINT_BURN,
  TINT_MODE_MULTIPLY,
  TINT_MODE_MULTIPLY_TWO,
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

  it("poison+burn layers with MULTIPLY_TWO", () => {
    expect(statusTintFor({ poison: true, burn: true })).toEqual({
      tint: TINT_POISON,
      tint2: TINT_BURN,
      mode: TINT_MODE_MULTIPLY_TWO,
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

  it("applies dual tint when tint2 present", () => {
    const calls: Array<[string, number?]> = [];
    applyStatusTint(
      {
        setTint: (c) => calls.push(["tint", c]),
        setTint2: (c) => calls.push(["tint2", c]),
        setTintMode: (m) => calls.push(["mode", m]),
      },
      { tint: TINT_POISON, tint2: TINT_BURN, mode: TINT_MODE_MULTIPLY_TWO }
    );
    expect(calls).toEqual([
      ["tint", TINT_POISON],
      ["tint2", TINT_BURN],
      ["mode", TINT_MODE_MULTIPLY_TWO],
    ]);
  });
});
