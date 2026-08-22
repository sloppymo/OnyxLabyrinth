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
  CARD_TRIAL_BACK_HERO_ANCHOR,
  CARD_TRIAL_FRONT_HERO_ANCHOR,
  cardTrialHeroSlot,
  ENEMY_FRONT_SLOTS,
  ENEMY_BACK_SLOTS,
  ENEMY_FORMATION_SLOTS,
  ALLY_FORMATION_SLOTS,
  SCALE_STEPS,
  SEAM_INSET_FRAC,
  CENTER_AISLE_MIN_GAP_PX,
  lerp,
  quantizeScale,
  resolveFootY,
  resolveSlot,
  depthScale,
  assertFormationOnFloor,
  assertFloorBottomClearOfWindows,
  assertSlotsInXBounds,
  assertCenterAisle,
  maxAllowedFloorBottomY,
  COMBAT_WINDOW_OVERLAP_PX,
  FLOOR_BOTTOM_SAFE_MARGIN_PX,
  CONTACT_SHADOW_BELOW_FOOT_PX,
  COMBAT_NEAR_SPRITE_SIZE,
  allBackdropIds,
  artFootFromTopFor,
  ART_FOOT_FROM_TOP,
  ART_FOOT_FROM_TOP_FALLBACK,
  artTopFromTopFor,
  ART_TOP_FROM_TOP,
  ART_TOP_FROM_TOP_FALLBACK,
  visualHeadY,
  MARKER_TIP_GAP_PX,
} from "./combat-scene-math";
import { arenaSeamFrac } from "./arena-camera";

const LOGICAL_H = 672;
const LOGICAL_W = 768;

describe("artFootFromTopFor", () => {
  it("uses pack default for strips, fallback for procedural, override when set", () => {
    expect(artFootFromTopFor({ hasStrip: true })).toBe(ART_FOOT_FROM_TOP);
    expect(artFootFromTopFor({ hasStrip: false })).toBe(ART_FOOT_FROM_TOP_FALLBACK);
    expect(artFootFromTopFor({ hasStrip: true, stripArtFootFromTop: 0.8 })).toBe(0.8);
  });
});

describe("artTopFromTopFor", () => {
  it("uses pack default for strips, fallback for procedural, override when set", () => {
    expect(artTopFromTopFor({ hasStrip: true })).toBe(ART_TOP_FROM_TOP);
    expect(artTopFromTopFor({ hasStrip: false })).toBe(ART_TOP_FROM_TOP_FALLBACK);
    expect(artTopFromTopFor({ hasStrip: true, stripArtTopFromTop: 0.27 })).toBe(0.27);
  });

  it("pack default matches measured strip art (idle tops: party 0.37–0.39, most enemies 0.38–0.42)", () => {
    expect(ART_TOP_FROM_TOP).toBeGreaterThanOrEqual(0.36);
    expect(ART_TOP_FROM_TOP).toBeLessThanOrEqual(0.4);
  });
});

describe("visualHeadY / MARKER_TIP_GAP_PX", () => {
  it("anchors the marker at the art top of the draw square, not a drawSize fraction of centerY", () => {
    expect(visualHeadY(100, 200, 0.38)).toBeCloseTo(176);
    expect(visualHeadY(100, 200, ART_TOP_FROM_TOP_FALLBACK)).toBeCloseTo(160);
  });

  it("tip gap hugs the head — tighter than the old 14px float", () => {
    expect(MARKER_TIP_GAP_PX).toBeGreaterThan(0);
    expect(MARKER_TIP_GAP_PX).toBeLessThan(14);
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

  it("status-scaled spriteHeight keeps the art foot on footY", () => {
    // Painters must pass spriteHeight * statusDrawScale into resolveSlot so
    // centreY moves with the draw size; multiplying size after resolve with a
    // fixed centreY floats Shrink / sinks Giant Strength off the shadow.
    const slot = ENEMY_FRONT_SLOTS[0]!;
    const baseH = 300;
    for (const statusScale of [0.5, 1.0, 1.3]) {
      const r = resolveSlot(slot, geo, {
        spriteHeight: baseH * statusScale,
        artFootFromTop: ART_FOOT_FROM_TOP,
      });
      const drawH = baseH * statusScale * r.scale;
      const visualFoot = r.centerY - drawH / 2 + drawH * ART_FOOT_FROM_TOP;
      expect(visualFoot).toBeCloseTo(r.footY, 5);
    }
  });

  it("centre-scaling after an unscaled resolveSlot drifts the art foot", () => {
    const slot = ENEMY_FRONT_SLOTS[0]!;
    const baseH = 300;
    const r = resolveSlot(slot, geo, {
      spriteHeight: baseH,
      artFootFromTop: ART_FOOT_FROM_TOP,
    });
    const statusScale = 0.5;
    const drawH = baseH * r.scale * statusScale;
    const visualFoot = r.centerY - drawH / 2 + drawH * ART_FOOT_FROM_TOP;
    // ~9px float at front-row scale — the bug status-scaled resolveSlot fixes.
    expect(Math.abs(visualFoot - r.footY)).toBeGreaterThan(5);
  });
});

describe("formation floor invariant (all backdrops × full formation)", () => {
  const maxEnemyFront = ENEMY_FRONT_SLOTS.length;
  const maxEnemyBack = ENEMY_BACK_SLOTS.length;

  it("every backdrop declares seam in the high-camera band and floor owns the majority", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id]!;
      // High-camera target: usable seam ~25–38% (optical ~24–34%).
      expect(geo.seamY / LOGICAL_H).toBeGreaterThanOrEqual(0.25);
      expect(geo.seamY / LOGICAL_H).toBeLessThanOrEqual(0.38);
      expect(geo.floorBottomY - geo.seamY).toBeGreaterThan(LOGICAL_H * 0.28);
      expect(geo.floorBottomY).toBeLessThanOrEqual(LOGICAL_H);
    }
  });

  it("all resolved footY stay in [seamY, floorBottomY] for full party + max enemies + allies", () => {
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

  it("party formation is one continuous cascade, not two disconnected pockets", () => {
    // Only 4 characters ever fight at once (ACTIVE_ROSTER_SIZE); each rank
    // should sit strictly nearer/farther-right than the last so the queue
    // reads as a single FF6-style diagonal line with no dead gap.
    for (let i = 1; i < PARTY_FORMATION_SLOTS.length; i++) {
      expect(PARTY_FORMATION_SLOTS[i]!.footYFrac).toBeGreaterThan(
        PARTY_FORMATION_SLOTS[i - 1]!.footYFrac
      );
      expect(PARTY_FORMATION_SLOTS[i]!.x).toBeGreaterThan(
        PARTY_FORMATION_SLOTS[i - 1]!.x
      );
    }
  });

  it("enemy rows zipper into one left-side cascade (not two parallel ranks)", () => {
    // Within each mechanical row: farther → nearer also means right → left.
    for (const row of [ENEMY_BACK_SLOTS, ENEMY_FRONT_SLOTS]) {
      for (let i = 1; i < row.length; i++) {
        expect(row[i]!.footYFrac).toBeGreaterThan(row[i - 1]!.footYFrac);
        expect(row[i]!.x).toBeLessThan(row[i - 1]!.x);
      }
    }
    // Combined depth order is one continuous down-left column — x falls as
    // footYFrac rises. Gaps may approach party-like spacing (~0.18–0.22).
    expect(ENEMY_FORMATION_SLOTS).toHaveLength(6);
    for (let i = 1; i < ENEMY_FORMATION_SLOTS.length; i++) {
      const prev = ENEMY_FORMATION_SLOTS[i - 1]!;
      const cur = ENEMY_FORMATION_SLOTS[i]!;
      expect(cur.footYFrac).toBeGreaterThan(prev.footYFrac);
      expect(cur.x).toBeLessThan(prev.x);
      expect(cur.footYFrac - prev.footYFrac).toBeLessThanOrEqual(0.22);
    }
    // Keep the whole enemy mass in a tight left column — the old back-row
    // slot at x=336 read as mid-field next to the aisle.
    const maxX = Math.max(...ENEMY_FORMATION_SLOTS.map((s) => s.x));
    expect(maxX).toBeLessThanOrEqual(310);
  });

  it("party is on the right half, enemies on the left (logical width)", () => {
    for (const s of PARTY_FORMATION_SLOTS) {
      expect(s.x).toBeGreaterThan(LOGICAL_W / 2);
    }
    for (const s of ENEMY_FORMATION_SLOTS) {
      expect(s.x).toBeLessThan(LOGICAL_W / 2);
    }
  });
});

describe("Card Trial hero-row anchors", () => {
  const anchors = [
    CARD_TRIAL_BACK_HERO_ANCHOR,
    CARD_TRIAL_FRONT_HERO_ANCHOR,
  ];
  const liveHeroSlots = [
    cardTrialHeroSlot("back", "rat-king"),
    cardTrialHeroSlot("back", "old-man"),
    cardTrialHeroSlot("front", "rat-king"),
    cardTrialHeroSlot("front", "old-man"),
  ];

  it("keeps both anchors legal on every backdrop and on one scale tier", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id]!;
      expect(() => assertFormationOnFloor(anchors, geo)).not.toThrow();
      expect(() => assertFormationOnFloor(liveHeroSlots, geo)).not.toThrow();
      expect(() =>
        assertSlotsInXBounds(liveHeroSlots, geo, {
          spriteWidth: COMBAT_NEAR_SPRITE_SIZE,
        })
      ).not.toThrow();
      const scales = anchors.map((slot) =>
        resolveSlot(slot, geo, { spriteHeight: COMBAT_NEAR_SPRITE_SIZE }).scale
      );
      expect(scales).toEqual([0.875, 0.875]);
    }
  });

  it("makes Front strictly nearer and preserves the center aisle", () => {
    expect(CARD_TRIAL_FRONT_HERO_ANCHOR.footYFrac).toBeGreaterThan(
      CARD_TRIAL_BACK_HERO_ANCHOR.footYFrac
    );
    expect(() =>
      assertCenterAisle(ENEMY_FORMATION_SLOTS, anchors)
    ).not.toThrow();
    expect(() =>
      assertCenterAisle(ENEMY_FORMATION_SLOTS, liveHeroSlots)
    ).not.toThrow();
  });

  it("keeps same-row heroes distinct without changing their depth", () => {
    for (const row of ["front", "back"] as const) {
      const ratKing = cardTrialHeroSlot(row, "rat-king");
      const oldMan = cardTrialHeroSlot(row, "old-man");
      expect(ratKing.x).not.toBe(oldMan.x);
      expect(ratKing.footYFrac).toBe(oldMan.footYFrac);
    }
  });
});

describe("occlusion invariant (floorBottomY vs DOM windows)", () => {
  it("maxAllowedFloorBottomY clears windows + contact-shadow footprint", () => {
    expect(maxAllowedFloorBottomY(LOGICAL_H)).toBe(
      LOGICAL_H -
        COMBAT_WINDOW_OVERLAP_PX -
        FLOOR_BOTTOM_SAFE_MARGIN_PX -
        CONTACT_SHADOW_BELOW_FOOT_PX
    );
    expect(CONTACT_SHADOW_BELOW_FOOT_PX).toBeGreaterThanOrEqual(8);
    // Raised alongside the unified-footer shrink (COMBAT_WINDOW_OVERLAP_PX
    // 200 → 150): the battlefield floor moves down as the footer shrinks.
    expect(maxAllowedFloorBottomY()).toBeGreaterThanOrEqual(498);
    expect(maxAllowedFloorBottomY()).toBeLessThanOrEqual(510);
  });

  it("every backdrop floorBottomY clears the window overlap band", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id]!;
      expect(() => assertFloorBottomClearOfWindows(geo)).not.toThrow();
      expect(geo.floorBottomY).toBeLessThanOrEqual(maxAllowedFloorBottomY());
    }
  });
});

describe("x-bounds invariant (sprites stay on canvas)", () => {
  const margin = 4;

  it("assertSlotsInXBounds throws when a near-scale slot hangs off the edge", () => {
    const geo: BackdropGeometry = {
      seamY: 200,
      floorBottomY: 400,
      scaleFar: 0.875,
      scaleNear: 1.0,
    };
    const bad: FormationSlot[] = [{ x: 760, footYFrac: 1.0 }];
    expect(() =>
      assertSlotsInXBounds(bad, geo, { spriteWidth: 300, margin })
    ).toThrow(/x-bounds/);
  });

  it("BOSS_SIZE (400, see combat-scene.ts) fits the back row; nearest front slot does not", () => {
    // Bosses always draw at BOSS_SIZE regardless of which slot table
    // resolves their position (enemySlot() is size-unaware). Encounter
    // data guards bosses into the back row only (see enemies.test.ts
    // "never places a boss-flagged enemy in the front row") — this test
    // proves that guard is load-bearing for the nearest cascade slot.
    // Mid-cascade front slots may still clear BOSS_SIZE after the zipper
    // redesign (they share the same left column); the near end does not.
    const BOSS_SIZE = 400;
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id]!;
      expect(() =>
        assertSlotsInXBounds(ENEMY_BACK_SLOTS, geo, {
          spriteWidth: BOSS_SIZE,
          margin,
        })
      ).not.toThrow();
      expect(() =>
        assertSlotsInXBounds([ENEMY_FRONT_SLOTS[ENEMY_FRONT_SLOTS.length - 1]!], geo, {
          spriteWidth: BOSS_SIZE,
          margin,
        })
      ).toThrow(/x-bounds/);
    }
  });

  it("full formation stays in x-bounds on every backdrop", () => {
    for (const id of allBackdropIds()) {
      const geo = BACKDROP_GEOMETRY[id]!;
      expect(() =>
        assertSlotsInXBounds(PARTY_FORMATION_SLOTS, geo, {
          spriteWidth: 300,
          margin,
        })
      ).not.toThrow();
      expect(() =>
        assertSlotsInXBounds(
          [...ENEMY_FORMATION_SLOTS, ...ALLY_FORMATION_SLOTS],
          geo,
          { spriteWidth: 300, margin }
        )
      ).not.toThrow();
    }
  });
});

describe("seam derivation (baked themes track the arena camera)", () => {
  it("baked-theme seams derive from arenaSeamFrac + inset", () => {
    const base = Math.round(LOGICAL_H * (arenaSeamFrac() + SEAM_INSET_FRAC));
    for (const id of ["arena", "theme:f1", "theme:f3", "theme:f4", "theme:f5"]) {
      expect(BACKDROP_GEOMETRY[id]!.seamY).toBe(base);
    }
    // Library keeps its +0.02 content inset (shelves eat upper floor).
    expect(BACKDROP_GEOMETRY["theme:f2"]!.seamY).toBe(
      Math.round(LOGICAL_H * (arenaSeamFrac() + SEAM_INSET_FRAC + 0.02))
    );
  });

  it("camera seam sits in the floor-dominant band (upper third of frame)", () => {
    expect(arenaSeamFrac()).toBeGreaterThan(0.24);
    expect(arenaSeamFrac()).toBeLessThanOrEqual(0.34);
  });
});

describe("scale tiers (rows land on clean pixel-art steps)", () => {
  it("enemy cascade + summons land on clean pixel-art steps", () => {
    const geo = BACKDROP_GEOMETRY.arena;
    const scaleOf = (s: FormationSlot) =>
      quantizeScale(depthScale(s.footYFrac, geo));
    // Zippered cascade: far (0.75) → mid-field → near (1.0). Same graduated
    // line the party uses — not a binary far/near front-vs-back split.
    expect(ENEMY_FORMATION_SLOTS.map(scaleOf)).toEqual([
      0.75, 0.875, 0.875, 0.875, 0.875, 1.0,
    ]);
    expect(ENEMY_BACK_SLOTS.map(scaleOf)).toEqual([0.75, 0.875, 0.875]);
    expect(ENEMY_FRONT_SLOTS.map(scaleOf)).toEqual([0.875, 0.875, 1.0]);
    for (const s of ALLY_FORMATION_SLOTS) {
      expect(scaleOf(s)).toBe(0.875);
    }
  });

  it("party cascade steps through all three pixel-art scale tiers", () => {
    // Rank 0 farthest/smallest → rank 3 nearest/largest, with the two middle
    // ranks sharing the mid-field tier — a graduated line, not a binary split.
    const geo = BACKDROP_GEOMETRY.arena;
    const scaleOf = (s: FormationSlot) =>
      quantizeScale(depthScale(s.footYFrac, geo));
    expect(PARTY_FORMATION_SLOTS.map(scaleOf)).toEqual([0.75, 0.875, 0.875, 1.0]);
  });

  it("every frac keeps ≥0.03 margin from a quantize boundary (t=0.25 / 0.75)", () => {
    const all = [
      ...PARTY_FORMATION_SLOTS,
      ...ENEMY_FORMATION_SLOTS,
      ...ALLY_FORMATION_SLOTS,
    ];
    for (const s of all) {
      expect(Math.abs(s.footYFrac - 0.25)).toBeGreaterThanOrEqual(0.03);
      expect(Math.abs(s.footYFrac - 0.75)).toBeGreaterThanOrEqual(0.03);
    }
  });
});

describe("center aisle invariant (no-man's-land between battle lines)", () => {
  it("battle lines keep the minimum aisle (summons exempt by design)", () => {
    expect(() =>
      assertCenterAisle(ENEMY_FORMATION_SLOTS, PARTY_FORMATION_SLOTS)
    ).not.toThrow();
    expect(CENTER_AISLE_MIN_GAP_PX).toBeGreaterThanOrEqual(96);
  });

  it("throws when the lines interleave (pre-rebalance slot values)", () => {
    expect(() =>
      assertCenterAisle(
        [{ x: 340, footYFrac: 0.22 }],
        [{ x: 408, footYFrac: 0.22 }]
      )
    ).toThrow(/center-aisle/);
  });
});
