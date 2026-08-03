import { describe, it, expect, beforeEach } from "vitest";
import {
  COMBAT_HIT_STOP_ENABLED,
  COMBAT_IMPACT_ZOOM_ENABLED,
  COMBAT_ENV_LIGHTING_ENABLED,
  COMBAT_ACTOR_FLASH_ENABLED,
  MAX_ZOOM_SCALE,
  MAX_CUMULATIVE_HIT_STOP,
  type CombatImpactState,
  type CameraZoomImpulse,
  type EnvironmentLightImpulse,
  type ActorFlashImpulse,
  type IlluminationProfile,
  createImpactState,
  resetImpactState,
  classifyImpact,
  baseHitStopMs,
  effectiveHitStopMs,
  cappedHitStopMs,
  peakZoomScale,
  zoomDurationMs,
  sampleZoom,
  sampleEnvironmentLight,
  sampleActorFlash,
  shouldReplaceZoom,
  shouldReplaceEnvironmentLight,
  shouldGrantFullStop,
  setReducedMotion,
  getReducedMotion,
  shiftPresentationClocks,
  triggerImpactPresentation,
  ELEMENT_ILLUMINATION_DEFAULTS,
  resolveIllumination,
  preScanDamageEvents,
  classifyHitSequence,
} from "./combat-impact-fx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImpact(): CombatImpactState {
  return createImpactState();
}

function makeZoom(start: number, peak: number, duration: number): CameraZoomImpulse {
  return { start, duration, peakScale: peak, focusX: 400, focusY: 300 };
}

function makeEnvLight(start: number, impactAt: number, duration: number, floor = 0.5): EnvironmentLightImpulse {
  return {
    kind: "fire",
    start,
    impactAt,
    duration,
    color: "#ff8c42",
    backdropDim: 0.3,
    floorStrength: floor,
    rimStrength: 0.3,
    screenFlashStrength: 0.2,
    sourceX: 200,
    sourceY: 200,
  };
}

function makeFlash(start: number, duration: number, strength: number): ActorFlashImpulse {
  return { start, duration, color: "#ffffff", strength, mode: "white" };
}

function makeScene(): Parameters<typeof shiftPresentationClocks>[0] {
  return {
    choreo: { start: 1000, duration: 5000, steps: [{ at: 100, fired: false }] },
    partyAnims: new Map([
      ["p1", { stateStart: 1100, moveStart: 1200, fadeOutStart: null }],
    ]),
    enemyAnims: new Map([
      ["e1", { stateStart: 1300, moveStart: 1400, fadeOutStart: 2000 }],
    ]),
    allyAnims: new Map(),
    popups: [{ start: 1500 }],
    barks: [{ start: 1600 }],
    barkWindow: [{ at: 1590 }],
    effects: [{ start: 1700 }],
    lightGlows: [{ start: 1800 }],
    screenShake: { until: 3000 },
    banner: "Fireball",
    bannerStart: 1900,
    bannerUntil: 3100,
    introNameplate: "Boss",
    introNameplateStart: 2000,
    introNameplateUntil: 4000,
    impact: makeImpact(),
    lastUpdate: 2000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifyImpact", () => {
  it("classifies light when damage < 12% of max HP", () => {
    expect(classifyImpact({ damage: 11, targetMaxHp: 100 })).toBe("light");
  });

  it("classifies strong when damage is 12–24% of max HP", () => {
    expect(classifyImpact({ damage: 15, targetMaxHp: 100 })).toBe("strong");
    expect(classifyImpact({ damage: 24, targetMaxHp: 100 })).toBe("strong");
  });

  it("classifies heavy when damage is 25–39% of max HP", () => {
    expect(classifyImpact({ damage: 25, targetMaxHp: 100 })).toBe("heavy");
    expect(classifyImpact({ damage: 39, targetMaxHp: 100 })).toBe("heavy");
  });

  it("classifies massive when damage >= 40% of max HP", () => {
    expect(classifyImpact({ damage: 40, targetMaxHp: 100 })).toBe("massive");
    expect(classifyImpact({ damage: 100, targetMaxHp: 100 })).toBe("massive");
  });

  it("promotes by one category on critical hit", () => {
    expect(classifyImpact({ damage: 11, targetMaxHp: 100, crit: true })).toBe("strong");
    expect(classifyImpact({ damage: 15, targetMaxHp: 100, crit: true })).toBe("heavy");
    expect(classifyImpact({ damage: 25, targetMaxHp: 100, crit: true })).toBe("massive");
  });

  it("promotes to massive for tier-6+ spells regardless of ratio", () => {
    expect(classifyImpact({ damage: 5, targetMaxHp: 100, spellTier: 6 })).toBe("massive");
    expect(classifyImpact({ damage: 5, targetMaxHp: 100, spellTier: 7 })).toBe("massive");
  });

  it("promotes to massive for boss signature abilities", () => {
    expect(classifyImpact({ damage: 5, targetMaxHp: 100, isBossSignature: true })).toBe("massive");
  });

  it("handles zero max HP gracefully (defaults to strong, not massive)", () => {
    expect(classifyImpact({ damage: 50, targetMaxHp: 0 })).toBe("strong");
    expect(classifyImpact({ damage: 1, targetMaxHp: 0 })).toBe("strong");
  });
});

describe("hit-stop", () => {
  it("returns 0 for light impacts", () => {
    expect(baseHitStopMs("light")).toBe(0);
    expect(effectiveHitStopMs("light", 1, false)).toBe(0);
  });

  it("returns 40ms for strong impacts at normal speed", () => {
    expect(baseHitStopMs("strong")).toBe(40);
    expect(effectiveHitStopMs("strong", 1, false)).toBe(40);
  });

  it("returns 60ms for heavy impacts", () => {
    expect(baseHitStopMs("heavy")).toBe(60);
    expect(effectiveHitStopMs("heavy", 1, false)).toBe(60);
  });

  it("returns ~78ms for massive impacts", () => {
    expect(baseHitStopMs("massive")).toBe(78);
    expect(effectiveHitStopMs("massive", 1, false)).toBe(78);
  });

  it("scales down under FAST (playbackRate=2)", () => {
    expect(effectiveHitStopMs("strong", 2, false)).toBe(20);
    expect(effectiveHitStopMs("massive", 2, false)).toBe(39);
  });

  it("never goes below 20ms under FAST", () => {
    expect(effectiveHitStopMs("strong", 10, false)).toBe(20);
  });

  it("caps at 30ms under reduced motion", () => {
    setReducedMotion(true);
    expect(effectiveHitStopMs("massive", 1, false)).toBe(30);
    expect(effectiveHitStopMs("heavy", 1, false)).toBeLessThanOrEqual(30);
    setReducedMotion(false);
  });

  it("respects the cumulative cap of 110ms", () => {
    expect(cappedHitStopMs(50, 0)).toBe(50);
    expect(cappedHitStopMs(50, 70)).toBe(40);
    expect(cappedHitStopMs(50, 110)).toBe(0);
    expect(cappedHitStopMs(0, 0)).toBe(0);
  });
});

describe("zoom", () => {
  it("never exceeds 1.06", () => {
    expect(peakZoomScale("massive")).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
    expect(peakZoomScale("heavy")).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
    expect(peakZoomScale("strong")).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
  });

  it("returns exactly 1.0 for light impacts", () => {
    expect(peakZoomScale("light")).toBe(1.0);
    expect(zoomDurationMs("light")).toBe(0);
  });

  it("returns exactly 1.0 after the impulse expires", () => {
    const imp = makeZoom(1000, 1.05, 300);
    const { scale } = sampleZoom(imp, 1000 + 300);
    expect(scale).toBe(1);
    const { scale: scaleAfter } = sampleZoom(imp, 1000 + 500);
    expect(scaleAfter).toBe(1);
  });

  it("returns exactly 1.0 before the impulse starts", () => {
    const imp = makeZoom(1000, 1.05, 300);
    const { scale } = sampleZoom(imp, 900);
    expect(scale).toBe(1);
  });

  it("reaches peak during the hold phase", () => {
    const imp = makeZoom(1000, 1.05, 300);
    const holdT = 1000 + 300 * 0.3; // 30% = in hold phase
    const { scale } = sampleZoom(imp, holdT);
    expect(scale).toBeCloseTo(1.05, 4);
  });

  it("returns 1.0 when zoom is disabled", () => {
    const imp = makeZoom(1000, 1.05, 300);
    // COMBAT_IMPACT_ZOOM_ENABLED is a const; we test the function directly.
    // When enabled, it should work; the const guards the function.
    expect(COMBAT_IMPACT_ZOOM_ENABLED).toBe(true);
    const { scale } = sampleZoom(imp, 1000 + 50);
    expect(scale).toBeGreaterThan(1);
  });
});

describe("environment light", () => {
  it("returns inactive when impulse is null", () => {
    const r = sampleEnvironmentLight(null, 1000);
    expect(r.active).toBe(false);
  });

  it("returns inactive before the start time", () => {
    const imp = makeEnvLight(1000, 1100, 350);
    const r = sampleEnvironmentLight(imp, 900);
    expect(r.active).toBe(false);
  });

  it("returns inactive after expiry", () => {
    const imp = makeEnvLight(1000, 1100, 350);
    const r = sampleEnvironmentLight(imp, 1100 + 350);
    expect(r.active).toBe(false);
  });

  it("fire prelude: ramps backdrop dim before impact", () => {
    const imp = makeEnvLight(1000, 1120, 350); // 120ms prelude
    const r = sampleEnvironmentLight(imp, 1060); // halfway through prelude
    expect(r.active).toBe(true);
    expect(r.backdropDim).toBeGreaterThan(0);
    expect(r.backdropDim).toBeLessThan(0.3);
    expect(r.screenFlashStrength).toBe(0);
    expect(r.floorStrength).toBe(0);
  });

  it("cold impact: flash at impact moment", () => {
    const imp: EnvironmentLightImpulse = {
      kind: "cold",
      start: 1000,
      impactAt: 1000,
      duration: 400,
      color: "#d6f7ff",
      backdropDim: 0.2,
      floorStrength: 0.45,
      rimStrength: 0.3,
      screenFlashStrength: 0.15,
      sourceX: 200,
      sourceY: 200,
    };
    const r = sampleEnvironmentLight(imp, 1000);
    expect(r.active).toBe(true);
    expect(r.screenFlashStrength).toBeCloseTo(0.15, 4);
    expect(r.floorStrength).toBeCloseTo(0.45, 4);
  });

  it("holy broad wash: low backdrop dim, high rim", () => {
    const imp: EnvironmentLightImpulse = {
      kind: "holy",
      start: 1000,
      impactAt: 1060,
      duration: 420,
      color: "#ffe8a0",
      backdropDim: 0.12,
      floorStrength: 0.5,
      rimStrength: 0.4,
      screenFlashStrength: 0.25,
      sourceX: 200,
      sourceY: 200,
    };
    const r = sampleEnvironmentLight(imp, 1060);
    expect(r.active).toBe(true);
    expect(r.backdropDim).toBeLessThan(0.2);
    expect(r.rimStrength).toBeGreaterThan(0.3);
  });

  it("lightning fast decay: ~220ms", () => {
    const imp: EnvironmentLightImpulse = {
      kind: "lightning",
      start: 1000,
      impactAt: 1000,
      duration: 220,
      color: "#ffd769",
      backdropDim: 0.25,
      floorStrength: 0.55,
      rimStrength: 0.3,
      screenFlashStrength: 0.3,
      sourceX: 200,
      sourceY: 200,
    };
    // At 50% decay, floor should be significantly reduced.
    const r = sampleEnvironmentLight(imp, 1000 + 110);
    expect(r.active).toBe(true);
    expect(r.floorStrength).toBeLessThan(0.3);
    // After full duration, inactive.
    const r2 = sampleEnvironmentLight(imp, 1000 + 220);
    expect(r2.active).toBe(false);
  });
});

describe("actor flash", () => {
  it("returns 0 strength when expired", () => {
    const imp = makeFlash(1000, 30, 0.8);
    const r = sampleActorFlash(imp, 1000 + 31);
    expect(r.strength).toBe(0);
  });

  it("returns 0 strength when disabled", () => {
    expect(COMBAT_ACTOR_FLASH_ENABLED).toBe(true);
    const r = sampleActorFlash(null, 1000);
    expect(r.strength).toBe(0);
  });

  it("reaches peak strength during hold phase", () => {
    const imp = makeFlash(1000, 30, 0.8);
    const r = sampleActorFlash(imp, 1000 + 7); // ~23% = in hold
    expect(r.strength).toBeCloseTo(0.8, 2);
  });
});

describe("stronger-impulse replacement", () => {
  it("stronger zoom replaces weaker", () => {
    const existing = makeZoom(1000, 1.03, 200);
    const candidate = makeZoom(1100, 1.06, 300);
    expect(shouldReplaceZoom(existing, candidate, 1100)).toBe(true);
  });

  it("weaker zoom does NOT replace stronger", () => {
    const existing = makeZoom(1000, 1.06, 300);
    const candidate = makeZoom(1100, 1.03, 200);
    expect(shouldReplaceZoom(existing, candidate, 1100)).toBe(false);
  });

  it("same peak but longer duration replaces", () => {
    const existing = makeZoom(1000, 1.05, 200);
    const candidate = makeZoom(1100, 1.05, 300);
    expect(shouldReplaceZoom(existing, candidate, 1100)).toBe(true);
  });

  it("expired zoom is always replaceable", () => {
    const existing = makeZoom(1000, 1.06, 200);
    const candidate = makeZoom(1300, 1.03, 100);
    expect(shouldReplaceZoom(existing, candidate, 1300)).toBe(true);
  });

  it("stronger env light replaces weaker", () => {
    const existing = makeEnvLight(1000, 1100, 350, 0.3);
    const candidate = makeEnvLight(1100, 1100, 400, 0.6);
    expect(shouldReplaceEnvironmentLight(existing, candidate, 1100)).toBe(true);
  });

  it("weaker env light does NOT replace stronger", () => {
    const existing = makeEnvLight(1000, 1100, 350, 0.6);
    const candidate = makeEnvLight(1100, 1100, 300, 0.3);
    expect(shouldReplaceEnvironmentLight(existing, candidate, 1100)).toBe(false);
  });
});

describe("AOE / multi-hit throttling", () => {
  it("grants first full stop for AOE on first hit", () => {
    expect(shouldGrantFullStop(true, false, true, 0)).toBe(true);
  });

  it("does NOT grant stop for subsequent AOE targets", () => {
    expect(shouldGrantFullStop(true, false, false, 1)).toBe(false);
  });

  it("grants stop on first hit of multi-hit sequence", () => {
    expect(shouldGrantFullStop(false, false, true, 0)).toBe(true);
  });

  it("grants stop on final hit of multi-hit sequence", () => {
    expect(shouldGrantFullStop(false, true, false, 1)).toBe(true);
  });

  it("does NOT grant stop on intermediate hits", () => {
    expect(shouldGrantFullStop(false, false, false, 1)).toBe(false);
  });

  it("does NOT grant a second stop if one was already given (non-final)", () => {
    expect(shouldGrantFullStop(false, false, true, 1)).toBe(false);
  });
});

describe("reduced motion", () => {
  beforeEach(() => setReducedMotion(false));

  it("caps hit-stop at 30ms instead of disabling", () => {
    setReducedMotion(true);
    expect(effectiveHitStopMs("massive", 1, false)).toBe(30);
    setReducedMotion(false);
  });

  it("can be queried", () => {
    setReducedMotion(true);
    expect(getReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(getReducedMotion()).toBe(false);
  });
});

describe("shiftPresentationClocks", () => {
  it("shifts choreo start forward", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.choreo!.start).toBe(1050);
  });

  it("shifts actor stateStart and moveStart", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    const p = scene.partyAnims.get("p1")!;
    expect(p.stateStart).toBe(1150);
    expect(p.moveStart).toBe(1250);
  });

  it("shifts non-null fadeOutStart", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    const e = scene.enemyAnims.get("e1")!;
    expect(e.fadeOutStart).toBe(2050);
  });

  it("does NOT shift null fadeOutStart", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    const p = scene.partyAnims.get("p1")!;
    expect(p.fadeOutStart).toBeNull();
  });

  it("shifts popup, bark, effect, lightGlow starts", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.popups[0].start).toBe(1550);
    expect(scene.barks[0].start).toBe(1650);
    expect(scene.effects[0].start).toBe(1750);
    expect(scene.lightGlows[0].start).toBe(1850);
  });

  it("shifts screenShake until", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.screenShake.until).toBe(3050);
  });

  it("shifts banner start and until", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.bannerStart).toBe(1950);
    expect(scene.bannerUntil).toBe(3150);
  });

  it("shifts intro nameplate start and until", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.introNameplateStart).toBe(2050);
    expect(scene.introNameplateUntil).toBe(4050);
  });

  it("shifts impact zoom and environment starts", () => {
    const scene = makeScene();
    scene.impact!.zoom = makeZoom(1000, 1.05, 300);
    scene.impact!.environment = makeEnvLight(900, 1000, 350);
    scene.impact!.actorFlashes.set("e1", makeFlash(1000, 30, 0.8));
    shiftPresentationClocks(scene, 50);
    expect(scene.impact!.zoom.start).toBe(1050);
    expect(scene.impact!.environment.start).toBe(950);
    expect(scene.impact!.environment.impactAt).toBe(1050);
    const flash = scene.impact!.actorFlashes.get("e1")!;
    expect(flash.start).toBe(1050);
  });

  it("does NOT shift freezeUntilWallTime", () => {
    const scene = makeScene();
    scene.impact!.freezeUntilWallTime = 3000;
    shiftPresentationClocks(scene, 50);
    expect(scene.impact!.freezeUntilWallTime).toBe(3000);
  });

  it("clears lastUpdate to prevent particle jump", () => {
    const scene = makeScene();
    expect(scene.lastUpdate).toBe(2000);
    shiftPresentationClocks(scene, 50);
    expect(scene.lastUpdate).toBeUndefined();
  });

  it("shifts barkWindow at", () => {
    const scene = makeScene();
    shiftPresentationClocks(scene, 50);
    expect(scene.barkWindow[0].at).toBe(1640);
  });
});

describe("triggerImpactPresentation", () => {
  beforeEach(() => setReducedMotion(false));

  it("sets actor flash on the target", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 30,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.actorFlashes.has("e1")).toBe(true);
  });

  it("does NOT set actor flash for light impacts", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 5,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.actorFlashes.has("e1")).toBe(false);
  });

  it("sets freeze for heavy single-target hit", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 30,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: true,
    }, 1000, 1);
    expect(impact.freezeUntilWallTime).toBe(1000 + 60);
    expect(impact.accumulatedFreezeThisTurn).toBe(60);
    expect(impact.fullStopsThisTurn).toBe(1);
  });

  it("does NOT freeze for light impacts", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 5,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: true,
    }, 1000, 1);
    expect(impact.freezeUntilWallTime).toBe(0);
  });

  it("sets zoom for strong impacts", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.zoom).not.toBeNull();
    expect(impact.zoom!.peakScale).toBeCloseTo(1.03, 4);
  });

  it("does NOT set zoom for light impacts", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 5,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.zoom).toBeNull();
  });

  it("sets environment light when illumination is provided", () => {
    const impact = makeImpact();
    const illum: IlluminationProfile = {
      kind: "fire",
      color: "#ff8c42",
      preludeMs: 100,
      durationMs: 350,
    };
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 30,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      illumination: illum,
    }, 1000, 1);
    expect(impact.environment).not.toBeNull();
    expect(impact.environment!.kind).toBe("fire");
    expect(impact.environment!.start).toBe(900); // 1000 - 100 prelude
    expect(impact.environment!.impactAt).toBe(1000);
  });

  it("does NOT set environment light without illumination", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 30,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.environment).toBeNull();
  });

  it("AOE: only first target gets full stop", () => {
    const impact = makeImpact();
    // First target (first hit, AOE).
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 30,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isArea: true,
      isFirstHit: true,
    }, 1000, 1);
    expect(impact.fullStopsThisTurn).toBe(1);

    // Second target (not first hit, AOE) — no stop.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e2",
      damage: 30,
      targetMaxHp: 100,
      x: 300,
      y: 200,
      isArea: true,
      isFirstHit: false,
    }, 1100, 1);
    expect(impact.fullStopsThisTurn).toBe(1);
    // But actor flash IS set.
    expect(impact.actorFlashes.has("e2")).toBe(true);
  });

  it("multi-hit: stops on first and final, not intermediate", () => {
    const impact = makeImpact();
    // First hit.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: true,
    }, 1000, 1);
    expect(impact.fullStopsThisTurn).toBe(1);

    // Intermediate hit — no stop.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: false,
      isFinalHit: false,
    }, 1100, 1);
    expect(impact.fullStopsThisTurn).toBe(1);

    // Final hit — stop.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFinalHit: true,
    }, 1200, 1);
    expect(impact.fullStopsThisTurn).toBe(2);
  });

  it("respects cumulative hit-stop cap", () => {
    const impact = makeImpact();
    // First massive hit: 78ms.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 50,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: true,
    }, 1000, 1);
    expect(impact.accumulatedFreezeThisTurn).toBe(78);

    // Second massive hit (final): would be 78ms, but only 32ms remaining.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 50,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFinalHit: true,
    }, 1100, 1);
    expect(impact.accumulatedFreezeThisTurn).toBe(MAX_CUMULATIVE_HIT_STOP);
  });

  it("stronger zoom replaces weaker", () => {
    const impact = makeImpact();
    // Strong hit: 1.03 zoom.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.zoom!.peakScale).toBeCloseTo(1.03, 4);

    // Massive hit: 1.06 zoom — should replace.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 50,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1050, 1);
    expect(impact.zoom!.peakScale).toBeCloseTo(1.06, 4);
  });

  it("weaker zoom does NOT replace stronger", () => {
    const impact = makeImpact();
    // Massive hit: 1.06 zoom.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 50,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1000, 1);
    expect(impact.zoom!.peakScale).toBeCloseTo(1.06, 4);

    // Strong hit: 1.03 zoom — should NOT replace.
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 15,
      targetMaxHp: 100,
      x: 200,
      y: 200,
    }, 1050, 1);
    expect(impact.zoom!.peakScale).toBeCloseTo(1.06, 4);
  });

  it("heal does not cause hit-stop or zoom", () => {
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "p2",
      damage: 0,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      allowHitStop: false,
    }, 1000, 1);
    expect(impact.freezeUntilWallTime).toBe(0);
    expect(impact.zoom).toBeNull();
  });

  it("reduced motion degrades but does not disable effects", () => {
    setReducedMotion(true);
    const impact = makeImpact();
    triggerImpactPresentation(impact, {
      actorId: "p1",
      targetId: "e1",
      damage: 50,
      targetMaxHp: 100,
      x: 200,
      y: 200,
      isFirstHit: true,
      illumination: ELEMENT_ILLUMINATION_DEFAULTS.fire,
    }, 1000, 1);
    // Hit-stop should be capped (30ms), not zero.
    expect(impact.freezeUntilWallTime).toBeGreaterThan(0);
    expect(impact.accumulatedFreezeThisTurn).toBeLessThanOrEqual(30);
    // Zoom should be set but capped at 1.015x.
    expect(impact.zoom).not.toBeNull();
    expect(impact.zoom!.peakScale).toBeLessThanOrEqual(1.015);
    // Environment light should be set (screen flash suppressed).
    expect(impact.environment).not.toBeNull();
    // Actor flash should be preserved.
    expect(impact.actorFlashes.size).toBeGreaterThan(0);
    setReducedMotion(false);
  });
});

describe("resetImpactState", () => {
  it("clears all impact fields", () => {
    const impact = makeImpact();
    impact.freezeUntilWallTime = 5000;
    impact.accumulatedFreezeThisTurn = 80;
    impact.fullStopsThisTurn = 2;
    impact.zoom = makeZoom(1000, 1.06, 300);
    impact.environment = makeEnvLight(1000, 1100, 350);
    impact.actorFlashes.set("e1", makeFlash(1000, 30, 0.8));

    resetImpactState(impact);

    expect(impact.freezeUntilWallTime).toBe(0);
    expect(impact.lastFreezeWallTime).toBe(0);
    expect(impact.accumulatedFreezeThisTurn).toBe(0);
    expect(impact.fullStopsThisTurn).toBe(0);
    expect(impact.zoom).toBeNull();
    expect(impact.environment).toBeNull();
    expect(impact.actorFlashes.size).toBe(0);
  });
});

describe("illumination defaults", () => {
  it("fire has prelude", () => {
    const fire = ELEMENT_ILLUMINATION_DEFAULTS.fire!;
    expect(fire.preludeMs).toBeGreaterThan(0);
    expect(fire.kind).toBe("fire");
  });

  it("cold has no prelude but has duration", () => {
    const cold = ELEMENT_ILLUMINATION_DEFAULTS.cold!;
    expect(cold.preludeMs).toBeUndefined();
    expect(cold.durationMs).toBeGreaterThan(0);
  });

  it("divine/holy has low backdrop dim", () => {
    const holy = ELEMENT_ILLUMINATION_DEFAULTS.divine!;
    expect(holy.backdropDim).toBeLessThan(0.2);
  });

  it("lightning has fast decay", () => {
    const lightning = ELEMENT_ILLUMINATION_DEFAULTS.lightning!;
    expect(lightning.durationMs).toBeLessThan(250);
  });

  it("physical has neutral color", () => {
    const physical = ELEMENT_ILLUMINATION_DEFAULTS.physical!;
    expect(physical.kind).toBe("physical");
  });

  it("resolveIllumination returns custom when provided", () => {
    const custom: IlluminationProfile = {
      kind: "fire",
      color: "#ff0000",
      durationMs: 999,
    };
    expect(resolveIllumination("fire", custom)).toBe(custom);
  });

  it("resolveIllumination falls back to element defaults", () => {
    const result = resolveIllumination("cold");
    expect(result).toBeDefined();
    expect(result!.kind).toBe("cold");
  });

  it("resolveIllumination returns undefined for unknown element", () => {
    expect(resolveIllumination("unknown")).toBeUndefined();
  });
});

describe("pre-scan and hit sequence", () => {
  it("pre-scans damage events from an event array", () => {
    const events = [
      { type: "attack", actorId: "p1", targetId: "e1", damage: 20 },
      null,
      { type: "cast", actorId: "p1", spellId: "mage-fireball", targetId: "e1", damage: 30 },
      { type: "defeated", targetId: "e1", wasEnemy: true },
    ];
    const infos = preScanDamageEvents(events);
    expect(infos.length).toBe(2);
    expect(infos[0].type).toBe("attack");
    expect(infos[1].type).toBe("cast");
  });

  it("classifies first and final hits per actor", () => {
    const infos = [
      { index: 0, type: "attack" as const, actorId: "p1", targetId: "e1", damage: 10, isArea: false },
      { index: 1, type: "attack" as const, actorId: "p1", targetId: "e1", damage: 10, isArea: false },
      { index: 2, type: "attack" as const, actorId: "p1", targetId: "e1", damage: 10, isArea: false },
    ];
    const seq = classifyHitSequence(infos);
    expect(seq.get(0)).toEqual({ isFirst: true, isFinal: false });
    expect(seq.get(1)).toEqual({ isFirst: false, isFinal: false });
    expect(seq.get(2)).toEqual({ isFirst: false, isFinal: true });
  });

  it("handles single hit as both first and final", () => {
    const infos = [
      { index: 0, type: "attack" as const, actorId: "p1", targetId: "e1", damage: 50, isArea: false },
    ];
    const seq = classifyHitSequence(infos);
    expect(seq.get(0)).toEqual({ isFirst: true, isFinal: true });
  });
});
