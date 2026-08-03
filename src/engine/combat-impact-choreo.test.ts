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
import { setReducedMotion, getReducedMotion } from "./combat-impact-fx";
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

    it("sets a zoom impulse for a massive melee hit", () => {
      const scene = makeScene();
      // damage 10 on a 10 HP enemy = 100% ratio = massive
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      expect(scene.impact.zoom).not.toBeNull();
      expect(scene.impact.zoom!.peakScale).toBeGreaterThan(1);
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

    it("clears freeze when choreography completes naturally", () => {
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);

      // Advance well past the entire choreography duration.
      const endTime = t0 + scene.choreo!.duration + 500;
      updateScene(scene, endTime);

      // After choreography is done, freeze should be cleared.
      expect(scene.impact.freezeUntilWallTime).toBe(0);
      expect(isPlaybackDone(scene, endTime)).toBe(true);
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

  describe("reduced motion disables impact effects", () => {
    it("playTurn does not set impact state under reduced motion", () => {
      setReducedMotion(true);
      const scene = makeScene();
      const events: CombatEvent[] = [
        { type: "attack", actorId: "c0", targetId: "rat-0", damage: 10, range: "close" },
      ];
      const t0 = 1000;
      playTurn(scene, events, spellName, t0, W, H);
      updateScene(scene, t0 + 2000);

      expect(scene.impact.actorFlashes.size).toBe(0);
      expect(scene.impact.zoom).toBeNull();
      expect(scene.impact.environment).toBeNull();
      expect(scene.impact.freezeUntilWallTime).toBe(0);
      expect(getReducedMotion()).toBe(true);
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
