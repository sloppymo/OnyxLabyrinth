/**
 * Choreography integration tests for impact presentation.
 *
 * Verifies that playTurn + updateScene properly trigger hit-stop freezes,
 * zoom impulses, environment light, and actor flashes from combat events.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createScene,
  playTurn,
  updateScene,
  isPlaybackDone,
  skipPlaybackToEnd,
} from "./combat-choreography";
import { setReducedMotion, getReducedMotion, sampleEnvironmentLight } from "./combat-impact-fx";
import { createCombatState } from "../game/combat";
import type { CombatEvent, EnemyInstance } from "../game/combat-types";
import { createCharacter } from "../game/party";
import { ENEMIES_BY_ID, type EnemyDef } from "../data/enemies";

const W = 768;
const H = 672;

function makeEnemy(instanceId: string, hp = 10): EnemyInstance {
  const def: EnemyDef = {
    ...ENEMIES_BY_ID["slime"],
    hp,
  };
  return { ...def, instanceId, currentHp: hp, row: "front", status: [] };
}

function makeScene() {
  const party = [
    createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
  ];
  const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
  return createScene(state);
}

const spellName = (id: string) => `Spell:${id}`;

describe("impact presentation choreography integration", () => {
  beforeEach(() => setReducedMotion(false));
  afterEach(() => setReducedMotion(false));

  describe("melee attack triggers impact state", () => {
    it("sets an actor flash on the target for a strong melee hit", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 8, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);

      // Advance past the impact time (IMPACT_AT ≈ 987ms for melee).
      updateScene(scene, t0 + 2000);

      // The actor flash should have been set on the target.
      expect(scene.impact.actorFlashes.size).toBeGreaterThan(0);
      expect(scene.impact.actorFlashes.has("rat-0")).toBe(true);
    });

    it("does not set a zoom impulse when zoom is disabled", () => {
      const scene = makeScene();
      // damage 10 on a 10 HP enemy = 100% ratio = massive
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      // Runtime zoom creation is disabled by default; the impulse is not populated.
      expect(scene.impact.zoom).toBeNull();
    });

    it("does not set zoom for a light hit", () => {
      const scene = makeScene();
      // damage 1 on a 100 HP enemy = 1% ratio = light
      const state = createCombatState(
        [createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0)],
        { front: [makeEnemy("rat-0", 100)], back: [] },
        false,
      );
      const scene2 = createScene(state);
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 1, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene2, events, spellName, t0, W, H);
      updateScene(scene2, t0 + 2000);

      // Light hits should not trigger zoom.
      expect(scene2.impact.zoom).toBeNull();
    });
  });

  describe("hit-stop freeze", () => {
    it("sets freezeUntilWallTime for a strong melee hit", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 8, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      // freezeUntilWallTime should be set in the future relative to the impact time.
      expect(scene.impact.freezeUntilWallTime).toBeGreaterThan(0);
      expect(scene.impact.accumulatedFreezeThisTurn).toBeGreaterThan(0);
    });

    it("isPlaybackDone returns false during a freeze", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);

      // Advance to just after impact — the freeze should be active.
      // IMPACT_AT = APPROACH_MS + ATTACK_MS * 0.55 ≈ 987ms.
      const impactTime = t0 + 1000;
      updateScene(scene, impactTime);

      // If a freeze was set, isPlaybackDone should be false.
      if (scene.impact.freezeUntilWallTime > impactTime) {
        expect(isPlaybackDone(scene, impactTime)).toBe(false);
      }
    });

    it("preserves final-hit hit-stop after choreography ends", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);

      // Advance to just past choreography end but before freeze expires.
      // The impact fires at ~987ms; choreo duration is ~1700ms.
      // A massive hit (10/10) grants ~78ms hit-stop, so freeze ends at ~1065ms.
      // Advance to choreo end but check that if freeze is still active,
      // isPlaybackDone returns false.
      const choreoEnd = t0 + scene.choreo!.duration;
      updateScene(scene, choreoEnd);

      // If freeze is still active at choreoEnd, playback should NOT be done.
      if (scene.impact.freezeUntilWallTime > choreoEnd) {
        expect(isPlaybackDone(scene, choreoEnd)).toBe(false);
      }

      // After freeze expires, playback should be done.
      const afterFreeze = Math.max(choreoEnd, scene.impact.freezeUntilWallTime) + 10;
      updateScene(scene, afterFreeze);
      expect(isPlaybackDone(scene, afterFreeze)).toBe(true);
    });
  });

  describe("skip clears impact state", () => {
    it("skipPlaybackToEnd clears all impact state", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 1000);

      // Verify some impact state was set.
      expect(scene.impact.actorFlashes.size).toBeGreaterThan(0);

      skipPlaybackToEnd(scene, t0 + 1000);

      // After skip, all impact state should be cleared.
      expect(scene.impact.freezeUntilWallTime).toBe(0);
      expect(scene.impact.zoom).toBeNull();
      expect(scene.impact.environment).toBeNull();
      expect(scene.impact.actorFlashes.size).toBe(0);
      expect(scene.impact.accumulatedFreezeThisTurn).toBe(0);
      expect(scene.impact.fullStopsThisTurn).toBe(0);
    });
  });

  describe("turn reset clears impact state", () => {
    it("playing a second turn resets impact state from the first", () => {
      const scene = makeScene();
      const events1: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events1, spellName, t0, W, H);
      updateScene(scene, t0 + 1000);

      // Verify state was set.
      expect(scene.impact.actorFlashes.size).toBeGreaterThan(0);
      expect(scene.impact.accumulatedFreezeThisTurn).toBeGreaterThan(0);

      // Play a second turn — should reset impact state at the start.
      const events2: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 5, range: "close" },
      ];
      playTurn(scene, events2, spellName, t0 + 5000, W, H);

      // The accumulated freeze should have been reset.
      expect(scene.impact.accumulatedFreezeThisTurn).toBe(0);
      expect(scene.impact.fullStopsThisTurn).toBe(0);
    });
  });

  describe("reduced motion degrades impact effects", () => {
    it("preserves actor flash and environment light under reduced motion", () => {
      setReducedMotion(true);
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "cast", actorId: "c0", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
        { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      // Actor flash should still be set (degraded, not disabled).
      expect(scene.impact.actorFlashes.size).toBeGreaterThan(0);
      // Environment light should still be set for fire spells.
      expect(scene.impact.environment).not.toBeNull();
      // Hit-stop should be capped but not zero.
      expect(scene.impact.accumulatedFreezeThisTurn).toBeGreaterThan(0);
      expect(scene.impact.accumulatedFreezeThisTurn).toBeLessThanOrEqual(30);
      setReducedMotion(false);
    });

    it("does not set zoom under reduced motion when zoom is disabled", () => {
      setReducedMotion(true);
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      // Runtime zoom creation is disabled; reduced motion does not re-enable it.
      expect(scene.impact.zoom).toBeNull();
      setReducedMotion(false);
    });
  });

  describe("spell cast triggers impact state", () => {
    it("sets environment light for a fire spell", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "cast", actorId: "c0", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
        { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      // CAST_IMPACT = CAST_MS * 0.65 = 715ms; impact fires at t0 + 715.
      updateScene(scene, t0 + 2000);

      // Fire spells should set environment light.
      expect(scene.impact.environment).not.toBeNull();
    });

    it("sets actor flash on the spell target", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "cast", actorId: "c0", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
        { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 3000);

      expect(scene.impact.actorFlashes.has("rat-0")).toBe(true);
    });

    it("environment light prelude is active before the damage step fires", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "cast", actorId: "c0", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
        { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 8 },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);

      // Fire-bolt uses riseDash, so pendingImpactBase = max(CAST_IMPACT, 920) = 920ms.
      // Fire has preludeMs=120, so the prelude step fires at 920-120=800ms.
      // Advance in small steps so the step fires near its scheduled time.
      for (let ms = 100; ms <= 850; ms += 50) {
        updateScene(scene, t0 + ms);
      }
      const preludeTime = t0 + 850;
      updateScene(scene, preludeTime);

      // Environment light should be armed and active (backdrop dim visible).
      expect(scene.impact.environment).not.toBeNull();
      const envSample = sampleEnvironmentLight(scene.impact.environment, preludeTime);
      expect(envSample.active).toBe(true);
      // During prelude, backdrop dim should be > 0 (darkening phase).
      expect(envSample.backdropDim).toBeGreaterThan(0);
      // Floor/rim/flash should be 0 during prelude (they activate at impact).
      expect(envSample.floorStrength).toBe(0);
      expect(envSample.screenFlashStrength).toBe(0);
    });
  });

  describe("AOE throttling", () => {
    it("grants at most one full hit-stop for multi-target spell effects", () => {
      const party = [createCharacter("c0", "Alice", "Human", "Neutral", "Mage", 0)];
      const enemies = {
        front: [makeEnemy("rat-0"), makeEnemy("rat-1"), makeEnemy("rat-2")],
        back: [] as EnemyInstance[],
      };
      const state = createCombatState(party, enemies, false);
      const scene = createScene(state);

      const events: CombatEvent[] = [
        { type: "cast", actorId: "c0", spellId: "mage-fireball", targetId: null, damage: 8 },
        { type: "spellEffect", spellId: "mage-fireball", targetId: "rat-0", damage: 8 },
        { type: "spellEffect", spellId: "mage-fireball", targetId: "rat-1", damage: 8 },
        { type: "spellEffect", spellId: "mage-fireball", targetId: "rat-2", damage: 8 },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 5000);

      // Only one full stop should have been granted.
      expect(scene.impact.fullStopsThisTurn).toBeLessThanOrEqual(1);
    });
  });
});
