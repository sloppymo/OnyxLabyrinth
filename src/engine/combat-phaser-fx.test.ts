import { describe, expect, it } from "vitest";
import {
  applySpotlight,
  deathDissolveRecipe,
  DEATH_ANIM_MS,
  castBloomPulse,
  CAST_BLOOM_MS,
  applyStatusTint,
  clearSpotlight,
  createSpotlightState,
  hitSquashFootOffset,
  hitSquashScale,
  spotlightKeyFor,
  spotlightRecipe,
  statusTintFor,
  TINT_BURN,
  TINT_MODE_MULTIPLY,
  TINT_POISON,
  type SpotlightFilterLists,
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

// --- Spotlight filter lifecycle ------------------------------------------------
// Guards the 9987f9b contract: recipe churn must splice controllers out via
// FilterList.remove, never leave zombies behind (Phase 1 exit criterion).

type FakeController = {
  kind: string;
  destroyed: boolean;
  colorMatrix?: { brightness(v: number): unknown };
};

/** Models Phaser's FilterList: `list` is what actually renders. */
function fakeFilters(opts: { glowThrows?: boolean; matrixThrows?: boolean } = {}) {
  const external: FakeController[] = [];
  const internal: FakeController[] = [];
  const removed: FakeController[] = [];
  const brightness: number[] = [];
  const lists: SpotlightFilterLists = {
    external: {
      addGlow: () => {
        if (opts.glowThrows) throw new Error("Filters unsupported");
        const c: FakeController = { kind: "glow", destroyed: false };
        external.push(c);
        return c;
      },
      remove: (f: unknown) => {
        const i = external.indexOf(f as FakeController);
        if (i >= 0) removed.push(...external.splice(i, 1));
        return f;
      },
    },
    internal: {
      addColorMatrix: () => {
        if (opts.matrixThrows) throw new Error("Filters unsupported");
        // Phaser returns the controller itself, so identity must survive the
        // round-trip into `state.matrix` and back out through remove().
        const c: FakeController = {
          kind: "matrix",
          destroyed: false,
          colorMatrix: { brightness: (v: number) => brightness.push(v) },
        };
        internal.push(c);
        return c as FakeController & {
          colorMatrix: { brightness(v: number): unknown };
        };
      },
      remove: (f: unknown) => {
        const i = internal.indexOf(f as FakeController);
        if (i >= 0) removed.push(...internal.splice(i, 1));
        return f;
      },
    },
  };
  return { lists, external, internal, removed, brightness };
}

const IDLE = spotlightRecipe({ casting: false });
const CAST = spotlightRecipe({ casting: true });
const BOSS = spotlightRecipe({ casting: false, bossAccentHex: "#ff0044" });

describe("spotlight filter lifecycle", () => {
  it("adds exactly one Glow + one ColorMatrix", () => {
    const f = fakeFilters();
    const state = createSpotlightState();
    applySpotlight(state, f.lists, IDLE);
    expect(f.external).toHaveLength(1);
    expect(f.internal).toHaveLength(1);
    expect(state.key).toBe(spotlightKeyFor(IDLE));
    expect(f.brightness).toEqual([IDLE.dimBrightness]);
  });

  it("re-applying the same recipe does not add a second filter", () => {
    const f = fakeFilters();
    const state = createSpotlightState();
    applySpotlight(state, f.lists, IDLE);
    applySpotlight(state, f.lists, IDLE);
    applySpotlight(state, f.lists, IDLE);
    expect(f.external).toHaveLength(1);
    expect(f.internal).toHaveLength(1);
    expect(f.removed).toHaveLength(0);
  });

  it("recipe churn never accumulates — list stays 1+1 and old controllers are removed", () => {
    const f = fakeFilters();
    const state = createSpotlightState();
    for (const recipe of [IDLE, CAST, BOSS, IDLE, CAST, BOSS, IDLE]) {
      applySpotlight(state, f.lists, recipe);
      expect(f.external.length).toBeLessThanOrEqual(1);
      expect(f.internal.length).toBeLessThanOrEqual(1);
    }
    expect(f.external).toHaveLength(1);
    expect(f.internal).toHaveLength(1);
    // Six transitions each retired a Glow and a ColorMatrix.
    expect(f.removed).toHaveLength(12);
    expect(f.removed.every((c) => !c.destroyed)).toBe(true);
  });

  it("clearSpotlight empties both lists and resets the key", () => {
    const f = fakeFilters();
    const state = createSpotlightState();
    applySpotlight(state, f.lists, CAST);
    clearSpotlight(state, f.lists);
    expect(f.external).toHaveLength(0);
    expect(f.internal).toHaveLength(0);
    expect(state).toEqual({ glow: null, matrix: null, key: "" });
  });

  it("clearSpotlight is idempotent", () => {
    const f = fakeFilters();
    const state = createSpotlightState();
    applySpotlight(state, f.lists, IDLE);
    clearSpotlight(state, f.lists);
    clearSpotlight(state, f.lists);
    expect(f.removed).toHaveLength(2);
    expect(state.key).toBe("");
  });

  it("addGlow throwing (CANVAS / no Filters) leaves no orphan and no key", () => {
    const f = fakeFilters({ glowThrows: true });
    const state = createSpotlightState();
    expect(() => applySpotlight(state, f.lists, IDLE)).not.toThrow();
    expect(f.external).toHaveLength(0);
    expect(f.internal).toHaveLength(0);
    expect(state).toEqual({ glow: null, matrix: null, key: "" });
  });

  it("addColorMatrix throwing removes the Glow already added", () => {
    const f = fakeFilters({ matrixThrows: true });
    const state = createSpotlightState();
    expect(() => applySpotlight(state, f.lists, IDLE)).not.toThrow();
    // The half-built stack must not render a lone Glow.
    expect(f.external).toHaveLength(0);
    expect(state.key).toBe("");
  });

  it("a null camera (torn-down scene) is a safe no-op", () => {
    const state = createSpotlightState();
    expect(() => applySpotlight(state, null, IDLE)).not.toThrow();
    expect(() => clearSpotlight(state, null)).not.toThrow();
    expect(state.key).toBe("");
  });

  it("distinct recipes produce distinct keys", () => {
    const keys = new Set([IDLE, CAST, BOSS].map(spotlightKeyFor));
    expect(keys.size).toBe(3);
  });
});

describe("deathDissolveRecipe", () => {
  it("starts at identity so a fresh kill does not pop", () => {
    expect(deathDissolveRecipe(0)).toEqual({ pixelate: 1, grayscale: 0 });
  });

  it("ends fully mosaicked and fully drained", () => {
    const end = deathDissolveRecipe(1);
    expect(end.pixelate).toBeCloseTo(8, 5);
    expect(end.grayscale).toBeCloseTo(1, 5);
  });

  it("increases monotonically across the death anim", () => {
    let prevPix = -Infinity;
    let prevGrey = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const r = deathDissolveRecipe(i / 20);
      expect(r.pixelate).toBeGreaterThanOrEqual(prevPix);
      expect(r.grayscale).toBeGreaterThanOrEqual(prevGrey);
      prevPix = r.pixelate;
      prevGrey = r.grayscale;
    }
  });

  it("drains color ahead of the mosaic", () => {
    // Body reads as "drained" before it reads as "disintegrating".
    const mid = deathDissolveRecipe(0.5);
    const pixFrac = (mid.pixelate - 1) / 7;
    expect(mid.grayscale).toBeGreaterThan(pixFrac);
  });

  it("clamps outside [0,1] instead of running away", () => {
    expect(deathDissolveRecipe(-5)).toEqual(deathDissolveRecipe(0));
    expect(deathDissolveRecipe(99)).toEqual(deathDissolveRecipe(1));
  });

  it("rides the same clock as the death animation", () => {
    expect(DEATH_ANIM_MS).toBe(675);
  });
});

describe("castBloomPulse", () => {
  it("is silent at the banner's first instant and at the cap", () => {
    expect(castBloomPulse(0)).toEqual({ active: true, blendAmount: 0 });
    expect(castBloomPulse(CAST_BLOOM_MS).blendAmount).toBeCloseTo(0, 5);
  });

  it("goes inactive past the cap so the stage tears the filter down", () => {
    expect(castBloomPulse(CAST_BLOOM_MS + 1).active).toBe(false);
    expect(castBloomPulse(10_000)).toEqual({ active: false, blendAmount: 0 });
  });

  it("peaks early, well inside the pulse window", () => {
    const peak = castBloomPulse(CAST_BLOOM_MS * 0.3);
    expect(peak.blendAmount).toBeGreaterThan(castBloomPulse(CAST_BLOOM_MS * 0.1).blendAmount);
    expect(peak.blendAmount).toBeGreaterThan(castBloomPulse(CAST_BLOOM_MS * 0.7).blendAmount);
  });

  it("never exceeds the documented peak blend", () => {
    for (let ms = 0; ms <= CAST_BLOOM_MS; ms += 5) {
      const p = castBloomPulse(ms);
      expect(p.blendAmount).toBeGreaterThanOrEqual(0);
      expect(p.blendAmount).toBeLessThanOrEqual(0.85);
    }
  });

  it("treats a negative age (clock skew) as inactive rather than negative blend", () => {
    expect(castBloomPulse(-1).active).toBe(false);
    expect(castBloomPulse(NaN).active).toBe(false);
  });

  it("stays short enough to never idle-stack with the spotlight Glow", () => {
    // Both live on the camera external list; the cap is what keeps them from
    // overlapping for the whole cast rather than a flash.
    expect(CAST_BLOOM_MS).toBeLessThanOrEqual(180);
  });
});
