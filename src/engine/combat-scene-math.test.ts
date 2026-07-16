/**
 * Ground-plane contract math for the combat scene.
 * Pure — no DOM/canvas. See design addendum 2026-07-15.
 */
import { describe, it, expect } from "vitest";
import {
  type BackdropGeometry,
  type FormationSlot,
  BACKDROP_GEOMETRY,
  PARTY_FORMATION_SLOTS,
  ENEMY_FRONT_SLOTS,
  ENEMY_BACK_SLOTS,
  ALLY_FORMATION_SLOTS,
  SCALE_STEPS,
  lerp,
  quantizeScale,
  resolveFootY,
  resolveSlot,
  depthScale,
  assertFormationOnFloor,
  allBackdropIds,
  artFootFromTopFor,
  ART_FOOT_FROM_TOP,
  ART_FOOT_FROM_TOP_FALLBACK,
} from "./combat-scene-math";

const LOGICAL_H = 672;
const LOGICAL_W = 768;

describe("artFootFromTopFor", () => {
  it("uses pack default for strips, fallback for procedural, override when set", () => {
    expect(artFootFromTopFor({ hasStrip: true })).toBe(ART_FOOT_FROM_TOP);
    expect(artFootFromTopFor({ hasStrip: false })).toBe(ART_FOOT_FROM_TOP_FALLBACK);
    expect(artFootFromTopFor({ hasStrip: true, stripArtFootFromTop: 0.8 })).toBe(0.8);
  });
});

describe("lerp / quantizeScale", () => {
  it("lerps endpoints", () => {
    expect(lerp(0.78, 1.0, 0)).toBeCloseTo(0.78);
    expect(lerp(0.78, 1.0, 1)).toBeCloseTo(1.0);
    expect(lerp(0.78, 1.0, 0.5)).toBeCloseTo(0.89);
  });

  it("quantizes to pixel-art-safe steps", () => {
    expect(quantizeScale(0.78)).toBe(0.75);
    expect(quantizeScale(0.89)).toBe(0.875);
    expect(quantizeScale(0.99)).toBe(1.0);
    for (const s of SCALE_STEPS) {
      expect(quantizeScale(s)).toBe(s);
    }
  });
});

describe("resolveFootY / depthScale", () => {
  const geo: BackdropGeometry = {
    seamY: 202,
    floorBottomY: 500,
    scaleFar: 0.78,
    scaleNear: 1.0,
  };

  it("maps footYFrac 0 to seamY and 1 to floorBottomY", () => {
    expect(resolveFootY(0, geo)).toBe(202);
    expect(resolveFootY(1, geo)).toBe(500);
    expect(resolveFootY(0.5, geo)).toBe(351);
  });

  it("scale is monotonic: nearer (higher frac) ≥ farther", () => {
    const far = depthScale(0.2, geo);
    const mid = depthScale(0.5, geo);
    const near = depthScale(0.9, geo);
    expect(mid).toBeGreaterThanOrEqual(far);
    expect(near).toBeGreaterThanOrEqual(mid);
  });
});

describe("resolveSlot", () => {
  const geo = BACKDROP_GEOMETRY.arena;
  const spriteH = 210;

  it("foot-anchors: drawY = footY - spriteH * scale * artFootFromTop", () => {
    const slot: FormationSlot = { x: 600, footYFrac: 0.6 };
    const r = resolveSlot(slot, geo, { spriteHeight: spriteH });
    expect(r.footY).toBeGreaterThanOrEqual(geo.seamY);
    expect(r.footY).toBeLessThanOrEqual(geo.floorBottomY);
    expect(r.drawY).toBeCloseTo(r.footY - spriteH * r.scale * r.artFootFromTop);
    expect(r.x).toBe(600);
    expect(SCALE_STEPS).toContain(r.scale);
  });

  it("scales x with canvas width from logical 768", () => {
    const slot: FormationSlot = { x: 384, footYFrac: 0.5 };
    const r = resolveSlot(slot, geo, {
      spriteHeight: 100,
      canvasWidth: 384,
      designWidth: 768,
    });
    expect(r.x).toBeCloseTo(192);
  });
});

describe("formation floor invariant (all backdrops × full formation)", () => {
  const maxEnemyFront = ENEMY_FRONT_SLOTS.length;
  const maxEnemyBack = ENEMY_BACK_SLOTS.length;

  it("every backdrop declares seam in a usable band and floor owns the majority", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id];
      // Usable foot plane is below optical horizon; may sit ~45–55% for
      // perspective rooms whose side joins eat the upper floor band.
      expect(geo.seamY / LOGICAL_H).toBeGreaterThanOrEqual(0.25);
      expect(geo.seamY / LOGICAL_H).toBeLessThanOrEqual(0.55);
      expect(geo.floorBottomY - geo.seamY).toBeGreaterThan(LOGICAL_H * 0.22);
      expect(geo.floorBottomY).toBeLessThanOrEqual(LOGICAL_H);
    }
  });

  it("all resolved footY stay in [seamY, floorBottomY] for 6 party + max enemies + allies", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id];
      const slots: FormationSlot[] = [
        ...PARTY_FORMATION_SLOTS,
        ...ENEMY_FRONT_SLOTS.slice(0, maxEnemyFront),
        ...ENEMY_BACK_SLOTS.slice(0, maxEnemyBack),
        ...ALLY_FORMATION_SLOTS,
      ];
      expect(() => assertFormationOnFloor(slots, geo)).not.toThrow();
      for (const slot of slots) {
        const r = resolveSlot(slot, geo, { spriteHeight: 210 });
        expect(r.footY).toBeGreaterThanOrEqual(geo.seamY);
        expect(r.footY).toBeLessThanOrEqual(geo.floorBottomY);
      }
    }
  });

  it("party front row is nearer (higher footYFrac) than back row", () => {
    const frontAvg =
      PARTY_FORMATION_SLOTS.slice(0, 3).reduce((s, p) => s + p.footYFrac, 0) / 3;
    const backAvg =
      PARTY_FORMATION_SLOTS.slice(3, 6).reduce((s, p) => s + p.footYFrac, 0) / 3;
    expect(frontAvg).toBeGreaterThan(backAvg);
  });

  it("party is on the right half, enemies on the left (logical width)", () => {
    for (const s of PARTY_FORMATION_SLOTS) {
      expect(s.x).toBeGreaterThan(LOGICAL_W / 2);
    }
    for (const s of [...ENEMY_FRONT_SLOTS, ...ENEMY_BACK_SLOTS]) {
      expect(s.x).toBeLessThan(LOGICAL_W / 2);
    }
  });
});
