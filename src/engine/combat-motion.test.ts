import { describe, expect, it } from "vitest";
import {
  approachOffset,
  contactTime,
  deterministicNoise,
  meleeMotionProfile,
  motionStyleForActor,
  screenShakeOffset,
  totalMeleeTime,
  type ApproachGeometry,
} from "./combat-motion";

const geometry: ApproachGeometry = {
  actorX: 580,
  actorY: 360,
  targetX: 190,
  targetY: 330,
  actorScale: 1,
  canvasWidth: 768,
  canvasHeight: 672,
};

describe("combat motion profiles", () => {
  it("keeps light, normal, and heavy melee inside the presentation budget", () => {
    const light = meleeMotionProfile("humanoid-light", { weight: "light" });
    const normal = meleeMotionProfile("humanoid", { weight: "normal" });
    const heavy = meleeMotionProfile("construct", { weight: "heavy" });

    expect(totalMeleeTime(light)).toBe(570);
    expect(totalMeleeTime(normal)).toBe(670);
    expect(totalMeleeTime(heavy)).toBe(765);
    expect(contactTime(normal)).toBeGreaterThan(normal.approachMs);
    expect(contactTime(normal)).toBeLessThan(totalMeleeTime(normal));
  });

  it("makes criticals heavier without changing the gameplay action", () => {
    const normal = meleeMotionProfile("humanoid", { weight: "normal" });
    const critical = meleeMotionProfile("humanoid", { weight: "normal", critical: true });
    expect(critical.strikeMs).toBeGreaterThan(normal.strikeMs);
    expect(critical.returnMs).toBeGreaterThan(normal.returnMs);
    expect(critical.impactHoldMs).toBeGreaterThan(normal.impactHoldMs);
    expect(critical.contactFraction).toBe(normal.contactFraction);
  });

  it("keeps ranged profiles out of melee travel", () => {
    const ranged = meleeMotionProfile("humanoid-light", { ranged: true });
    expect(ranged.ranged).toBe(true);
    expect(ranged.approachMs).toBe(0);
    expect(ranged.travelFraction).toBe(0);
    expect(approachOffset(geometry, ranged)).toEqual({ x: 0, y: 0 });
  });

  it("approaches the target without crossing its visual center", () => {
    const profile = meleeMotionProfile("humanoid", { weight: "normal" });
    const offset = approachOffset(geometry, profile);
    const gap = Math.abs(geometry.targetX - geometry.actorX);
    expect(offset.x).toBeLessThan(0);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(gap * 0.58);
    expect(Number.isFinite(offset.x)).toBe(true);
    expect(Number.isFinite(offset.y)).toBe(true);
  });

  it("handles coincident actors without NaN or an arbitrary long lunge", () => {
    const profile = meleeMotionProfile("beast");
    const offset = approachOffset(
      { ...geometry, targetX: geometry.actorX, targetY: geometry.actorY },
      profile
    );
    expect(offset).toEqual({ x: 0, y: profile.liftPx });
  });

  it("uses explicit presentation styles, not gameplay taxonomy", () => {
    expect(motionStyleForActor({ kind: "enemy", enemyId: "slime" })).toBe("ooze");
    expect(motionStyleForActor({ kind: "enemy", enemyId: "hellbat" })).toBe("flying");
    expect(motionStyleForActor({ kind: "enemy", enemyId: "stone-guardian" })).toBe("construct");
    expect(motionStyleForActor({ kind: "party", className: "Thief" })).toBe("humanoid-light");
    expect(motionStyleForActor({ kind: "party", className: "Mage" })).toBe("caster");
    expect(motionStyleForActor({ kind: "enemy", enemyId: "future-undead" })).toBe("humanoid");
  });

  it("keeps backend screen shake and cosmetic noise deterministic", () => {
    expect(screenShakeOffset(6, 1234)).toEqual(screenShakeOffset(6, 1234));
    expect(screenShakeOffset(0, 1234)).toEqual({ x: 0, y: 0 });
    expect(deterministicNoise(42)).toBe(deterministicNoise(42));
    expect(deterministicNoise(42)).toBeGreaterThanOrEqual(0);
    expect(deterministicNoise(42)).toBeLessThan(1);
  });
});
