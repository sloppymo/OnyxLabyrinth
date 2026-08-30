/**
 * Tests for the FF6 combat scene choreography engine (pure parts: playTurn
 * step scheduling, updateScene step firing, popups, death absorption).
 * Canvas drawing is exercised visually, not here.
 */
import { describe, it, expect } from "vitest";
import {
  COLORS,
  createScene,
  setCombatSceneState,
  playTurn,
  updateScene,
  isPlaybackDone,
  absorbDeaths,
  skipPlaybackToEnd,
  findActor,
  partyPos,
  partyActorPos,
  enemyPos,
  resolveEffectStyle,
  sampleProjectilePose,
  setBossIntroNameplate,
  pushBark,
  setBarksEnabled,
  getBarksEnabled,
  BARK_DURATION_BASE,
  resolveMeleeHitEffect,
  MISS_PRESENTATION,
  enemyIsUndead,
  animOffset,
  paintOrderFootY,
  comparePaintOrder,
  getAnim,
  PARTY_ROW_MOVE_MS,
} from "./combat-scene";
import { createCombatState, resolveEnemyTurn } from "../game/combat";
import { pickBark, resetBarkRngForCombat, setBarkRngForTests } from "../game/combat-barks";
import { BARK_PRIORITY } from "../data/combat-barks";
import type { CombatEvent, EnemyInstance } from "../game/combat-types";
import { createCharacterRecord } from "../game/party";
import { ENEMIES_BY_ID, type EnemyDef } from "../data/enemies";
import { contactTime, meleeMotionProfile } from "./combat-motion";

const W = 768;
const H = 672;

function makeEnemy(instanceId: string, overrides: Partial<EnemyDef> = {}): EnemyInstance {
  const def = {
    id: "test-rat",
    name: "Test Rat",
    hp: 10,
    attack: 4,
    ac: 0,
    agi: 5,
    xp: 3,
    gold: 2,
    rowPreference: "front",
    special: [],
    isBoss: false,
    ...overrides,
  } as EnemyDef;
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

function makeScene() {
  const party = [
    createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
    createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
  ];
  const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
  return createScene(state);
}

const spellName = (id: string) => `Spell:${id}`;

describe("playTurn choreography", () => {
  it("presents Old Man card damage as a magical projectile, not a melee swing", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      {
        type: "cast",
        actorId: "c1",
        spellId: "the-staff-speaks",
        targetId: null,
        cardPresentation: "card-spell",
      },
      {
        type: "spellEffect",
        spellId: "the-staff-speaks",
        actorId: "c1",
        targetId: "rat-0",
        damage: 6,
        cardPresentation: "card-spell",
      },
    ];
    const t0 = 1000;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    updateScene(scene, t0 + 200);
    expect(scene.partyAnims.get("c1")?.state).toBe("cast");
    updateScene(scene, t0 + 600);
    expect(scene.effects.some((effect) => effect.type === "projectile" && effect.effect === "px_arcane_bolt")).toBe(true);
    updateScene(scene, t0 + 800);
    expect(scene.effects.some((effect) => effect.type === "burst" && effect.effect === "retro2_arcane_sigil")).toBe(true);
    expect(duration).toBeGreaterThan(500);
  });

  it("melee attack schedules approach, impact popup, and return", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 7, range: "close" },
    ];
    const t0 = 1000;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    expect(duration).toBeGreaterThan(500);
    expect(scene.choreo).not.toBeNull();
    expect(isPlaybackDone(scene, t0)).toBe(false);

    // At start: attacker walks.
    updateScene(scene, t0 + 10);
    expect(scene.partyAnims.get("c0")?.state).toBe("walk");

    // At impact: popup with the damage number, target is still in its brief
    // hurt/recoil window. The new profile contacts at ~368ms.
    updateScene(scene, t0 + 420);
    expect(scene.popups.some((p) => p.text === "7")).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("hurt");

    // After full duration: playback done, attacker back to idle.
    updateScene(scene, t0 + duration + 50);
    expect(isPlaybackDone(scene, t0 + duration + 50)).toBe(true);
    expect(scene.partyAnims.get("c0")?.state).toBe("idle");
  });

  it("uses target-aware travel and returns to the exact stable slot", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 3, range: "close" },
    ];
    const t0 = 0;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    updateScene(scene, 0);
    updateScene(scene, 60);
    updateScene(scene, 200);
    const inFlight = animOffset(getAnim(scene, "party", "c0", 200), 200);
    expect(inFlight.x).toBeLessThan(0);
    expect(Math.abs(inFlight.x)).toBeLessThan(180);

    updateScene(scene, duration + 10);
    expect(animOffset(getAnim(scene, "party", "c0", duration + 10), duration + 10)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("fires the damage presentation at the motion contact beat", () => {
    const scene = makeScene();
    const profile = meleeMotionProfile("humanoid", { weight: "normal" });
    const t0 = 1000;
    playTurn(
      scene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 4, range: "close" }],
      spellName,
      t0,
      W,
      H
    );

    updateScene(scene, t0 + contactTime(profile) + 1);
    expect(scene.popups.some((p) => p.text === "4")).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("hurt");
  });

  it("advances once for a multi-hit sequence and returns once", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 2, range: "close" },
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 2, range: "close" },
    ];
    const duration = playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 0);
    updateScene(scene, 200);
    const firstStrike = animOffset(getAnim(scene, "party", "c0", 200), 200);
    updateScene(scene, 620);
    const secondStrike = animOffset(getAnim(scene, "party", "c0", 620), 620);
    expect(Math.abs(firstStrike.x)).toBeGreaterThan(0);
    expect(Math.abs(secondStrike.x)).toBeGreaterThan(0);
    updateScene(scene, duration + 10);
    expect(animOffset(getAnim(scene, "party", "c0", duration + 10), duration + 10)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("does not accumulate presentation drift over repeated attacks", () => {
    const scene = makeScene();
    let now = 0;
    for (let i = 0; i < 100; i++) {
      const duration = playTurn(
        scene,
        [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 1, range: "close" }],
        spellName,
        now,
        W,
        H
      );
      const end = now + duration + 10;
      updateScene(scene, now);
      updateScene(scene, end);
      expect(animOffset(getAnim(scene, "party", "c0", end), end)).toEqual({ x: 0, y: 0 });
      now = end + 10;
    }
  });

  it("close/short attacks use melee attack state; long range uses attack_ranged", () => {
    const party = [
      createCharacterRecord("c0", "Coda", "Hobbit", "Neutral", "Thief", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const scene = createScene(state);

    playTurn(
      scene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 4, range: "short" }],
      spellName,
      0,
      W,
      H
    );
    // Past the target-aware approach (165ms for a light Thief strike): melee strip.
    updateScene(scene, 200);
    expect(scene.partyAnims.get("c0")?.state).toBe("attack");

    const rangedScene = createScene(state);
    playTurn(
      rangedScene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 4, range: "long" }],
      spellName,
      0,
      W,
      H
    );
    // Ranged coil is ~70ms then attack_ranged.
    updateScene(rangedScene, 100);
    expect(rangedScene.partyAnims.get("c0")?.state).toBe("attack_ranged");
  });

  it("techniqueHit uses melee attack state even for a thief", () => {
    const party = [
      createCharacterRecord("c0", "Coda", "Hobbit", "Neutral", "Thief", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const scene = createScene(state);
    playTurn(
      scene,
      [
        {
          type: "techniqueHit",
          actorId: "c0",
          techniqueId: "thief-quick-slash",
          targetId: "rat-0",
          damage: 6,
        },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 540);
    expect(scene.partyAnims.get("c0")?.state).toBe("attack");
  });

  it("cast shows the spell banner and bursts on targets", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "cast", actorId: "c1", spellId: "mage-fire-bolt", targetId: "rat-0" },
      { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 5 },
    ];
    const t0 = 0;
    playTurn(scene, events, spellName, t0, W, H);
    updateScene(scene, t0 + 10);
    expect(scene.banner).toBe("Spell:mage-fire-bolt");
    expect(scene.partyAnims.get("c1")?.state).toBe("cast");

    // The caster physically braces/lifts during the charge instead of
    // remaining locked to its home slot.
    updateScene(scene, t0 + 300);
    expect(animOffset(getAnim(scene, "party", "c1", t0 + 300), t0 + 300).y).toBeLessThan(0);

    updateScene(scene, t0 + 1000); // past rise→dash impact (~920 for fire-bolt)
    expect(scene.effects.some((e) => e.type === "burst")).toBe(true);
    expect(scene.popups.some((p) => p.text === "5")).toBe(true);
  });

  it("telegraph shows the ability-name banner; break shows Interrupted!", () => {
    const scene = makeScene();
    playTurn(scene, [{ type: "telegraph", actorId: "rat-0", abilityId: "hellfire" }], spellName, 0, W, H);
    updateScene(scene, 10);
    expect(scene.banner).toBe("Spell:hellfire");

    const scene2 = makeScene();
    playTurn(scene2, [{ type: "telegraphBreak", actorId: "rat-0", abilityId: "hellfire" }], spellName, 0, W, H);
    updateScene(scene2, 10);
    expect(scene2.banner).toBe("Interrupted!");
  });

  it("chemistry events use the shared throw/consume/death path", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(
      party,
      { front: [makeEnemy("minotaur-0"), makeEnemy("slime-0")], back: [] },
      false
    );
    const scene = createScene(state);
    const events: CombatEvent[] = [
      {
        type: "chemistry",
        chemistryId: "chem-slime-cannon",
        abilityId: "crypt-slime-cannon",
        name: "Slime Cannon",
        phase: "resolve",
        actorId: "minotaur-0",
        targetId: "c0",
        resourceId: "slime-0",
        presentation: "throwAlly",
      },
      {
        type: "chemistry",
        chemistryId: "chem-slime-cannon",
        abilityId: "crypt-slime-cannon",
        name: "Slime Cannon",
        phase: "consume",
        actorId: "minotaur-0",
        targetId: "c0",
        resourceId: "slime-0",
        presentation: "throwAlly",
      },
      {
        type: "cast",
        actorId: "minotaur-0",
        spellId: "crypt-slime-cannon",
        targetId: "c0",
        damage: 8,
        presentation: "throwAlly",
      },
      { type: "defeated", targetId: "slime-0", wasEnemy: true },
    ];
    const duration = playTurn(scene, events, spellName, 0, W, H);

    updateScene(scene, 10);
    expect(scene.banner).toBe("SLIME CANNON");
    expect(scene.enemyAnims.get("slime-0")?.moveToX).not.toBe(0);

    updateScene(scene, 760);
    expect(scene.popups.some((p) => p.text === "8")).toBe(true);
    expect(scene.partyAnims.get("c0")?.state).toBe("hurt");
    expect(scene.effects.some((e) => e.type === "burst")).toBe(true);

    updateScene(scene, duration + 20);
    expect(scene.enemyAnims.get("slime-0")?.state).toBe("death");
  });

  it("Bone Harvest and Spawn Bomb keep their payoff-specific shared effects", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const makeChemScene = (resourceId: string) =>
      createScene(
        createCombatState(
          party.map((c) => structuredClone(c)),
          { front: [makeEnemy("caster-0"), makeEnemy(resourceId)], back: [] },
          false
        )
      );

    const bone = makeChemScene("skeleton-0");
    playTurn(
      bone,
      [
        {
          type: "chemistry",
          chemistryId: "chem-bone-harvest",
          abilityId: "crypt-bone-harvest",
          name: "Bone Harvest",
          phase: "resolve",
          actorId: "caster-0",
          resourceId: "skeleton-0",
          presentation: "consumeAlly",
        },
        {
          type: "chemistry",
          chemistryId: "chem-bone-harvest",
          abilityId: "crypt-bone-harvest",
          name: "Bone Harvest",
          phase: "consume",
          actorId: "caster-0",
          resourceId: "skeleton-0",
          presentation: "consumeAlly",
        },
        {
          type: "cast",
          actorId: "caster-0",
          spellId: "crypt-bone-harvest",
          targetId: "caster-0",
          heal: 8,
          presentation: "consumeAlly",
        },
        { type: "defeated", targetId: "skeleton-0", wasEnemy: true },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(bone, 500);
    expect(bone.banner).toBe("BONE HARVEST");
    expect(bone.popups.some((p) => p.text === "8" && p.color === COLORS.heal)).toBe(true);

    const bomb = makeChemScene("spawn-0");
    playTurn(
      bomb,
      [
        {
          type: "chemistry",
          chemistryId: "chem-spawn-bomb",
          abilityId: "crypt-spawn-bomb",
          name: "Spawn Bomb",
          phase: "resolve",
          actorId: "caster-0",
          resourceId: "spawn-0",
          presentation: "detonateAlly",
        },
        {
          type: "chemistry",
          chemistryId: "chem-spawn-bomb",
          abilityId: "crypt-spawn-bomb",
          name: "Spawn Bomb",
          phase: "consume",
          actorId: "caster-0",
          resourceId: "spawn-0",
          presentation: "detonateAlly",
        },
        { type: "cast", actorId: "caster-0", spellId: "crypt-spawn-bomb", targetId: "c0", damage: 6, presentation: "detonateAlly" },
        { type: "cast", actorId: "caster-0", spellId: "crypt-spawn-bomb", targetId: "c1", damage: 6, presentation: "detonateAlly" },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(bomb, 500);
    expect(bomb.banner).toBe("SPAWN BOMB");
    expect(bomb.effects.some((e) => e.effect === "fire_explosion")).toBe(true);
    expect(bomb.popups.filter((p) => p.text === "6")).toHaveLength(2);
  });

  it("Combo Break is a distinct chemistry event and never becomes ordinary cast text", () => {
    const scene = makeScene();
    playTurn(
      scene,
      [{
        type: "chemistry",
        chemistryId: "chem-slime-cannon",
        abilityId: "crypt-slime-cannon",
        name: "Slime Cannon",
        phase: "break",
        actorId: "rat-0",
        targetId: "c0",
        resourceId: "missing-resource",
        reason: "resourceDead",
        presentation: "throwAlly",
      }],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 10);
    expect(scene.banner).toBe("COMBO BREAK");
    expect(scene.popups.some((p) => p.text === "BREAK")).toBe(true);
    expect(scene.popups.some((p) => p.text === "SAFE")).toBe(true);
  });

  it("Living Shield and INTERCEPT use the shared chemistry timeline", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(
      party,
      { front: [makeEnemy("armor-0"), makeEnemy("warlock-0")] , back: [] },
      false
    );
    const scene = createScene(state);
    const duration = playTurn(
      scene,
      [
        {
          type: "chemistry",
          chemistryId: "chem-living-shield",
          abilityId: "crypt-living-shield",
          name: "Living Shield",
          phase: "resolve",
          actorId: "armor-0",
          targetId: "warlock-0",
          partnerId: "armor-0",
          presentation: "guardAlly",
        },
        {
          type: "chemistry",
          chemistryId: "chem-living-shield",
          abilityId: "crypt-living-shield",
          name: "Living Shield",
          phase: "intercept",
          actorId: "c0",
          targetId: "warlock-0",
          partnerId: "armor-0",
          presentation: "guardAlly",
        },
        { type: "attack", actorId: "c0", targetId: "armor-0", damage: 7, range: "close" },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 10);
    expect(scene.banner).toBe("LIVING SHIELD");
    updateScene(scene, 400);
    expect(scene.banner).toBe("INTERCEPT");
    expect(scene.popups.some((popup) => popup.text === "INTERCEPT")).toBe(true);
    expect(scene.effects.some((effect) => effect.effect === "px_shield")).toBe(true);
    expect(duration).toBeGreaterThan(500);
  });

  it("Hunting Pack converges both live actors and returns them after the shared hits", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const scene = createScene(
      createCombatState(
        party,
        {
          front: [makeEnemy("hellhound-0", { id: "crypt-hellhound" })],
          back: [makeEnemy("werewolf-0", { id: "crypt-werewolf", rowPreference: "back" })],
        },
        false
      )
    );
    const duration = playTurn(
      scene,
      [
        {
          type: "chemistry",
          chemistryId: "chem-hunting-pack",
          abilityId: "crypt-pack-hunt",
          name: "Hunting Pack",
          phase: "resolve",
          actorId: "hellhound-0",
          targetId: "c0",
          partnerId: "werewolf-0",
          presentation: "packStrike",
        },
        { type: "cast", actorId: "hellhound-0", spellId: "crypt-pack-hunt", targetId: "c0", damage: 5, presentation: "packStrike" },
        { type: "cast", actorId: "werewolf-0", spellId: "crypt-pack-hunt", targetId: "c0", damage: 5, presentation: "packStrike" },
      ],
      spellName,
      0,
      W,
      H
    );
    expect(scene.choreo?.steps.map((step) => step.at)).toContain(1050);
    updateScene(scene, 220);
    expect(scene.banner).toBe("HUNTING PACK");
    // The first frame fires the shared convergence step; inspect the tween
    // after a later frame so the offset has had time to advance.
    updateScene(scene, 420);
    expect(animOffset(scene.enemyAnims.get("hellhound-0")!, 420).x).toBeGreaterThan(0);
    expect(animOffset(scene.enemyAnims.get("werewolf-0")!, 420).x).toBeGreaterThan(0);
    updateScene(scene, 850);
    expect(scene.popups.filter((popup) => popup.text === "5")).toHaveLength(2);
    updateScene(scene, 1900);
    updateScene(scene, 2400);
    expect(animOffset(scene.enemyAnims.get("hellhound-0")!, 2400)).toEqual({ x: 0, y: 0 });
    expect(animOffset(scene.enemyAnims.get("werewolf-0")!, 2400)).toEqual({ x: 0, y: 0 });
    expect(duration).toBeGreaterThan(1200);
  });

  it("Rune Overload keeps a live battery tethered, then flashes the party on collapse", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const scene = createScene(
      createCombatState(
        party,
        {
          front: [makeEnemy("construct-0", { id: "crypt-lesser-construct" })],
          back: [makeEnemy("rune-knight-0", { id: "crypt-rune-knight", rowPreference: "back" })],
        },
        false
      )
    );
    playTurn(
      scene,
      [
        {
          type: "chemistry",
          chemistryId: "chem-rune-overload",
          abilityId: "crypt-rune-overload",
          name: "Rune Overload",
          phase: "resolve",
          actorId: "rune-knight-0",
          resourceId: "construct-0",
          presentation: "overload",
        },
        {
          type: "chemistry",
          chemistryId: "chem-rune-overload",
          abilityId: "crypt-rune-overload",
          name: "Rune Overload",
          phase: "consume",
          actorId: "rune-knight-0",
          resourceId: "construct-0",
          presentation: "overload",
        },
        { type: "cast", actorId: "rune-knight-0", spellId: "crypt-rune-overload", targetId: "c0", damage: 8, presentation: "overload" },
        { type: "cast", actorId: "rune-knight-0", spellId: "crypt-rune-overload", targetId: "c1", damage: 8, presentation: "overload" },
        { type: "defeated", targetId: "construct-0", wasEnemy: true },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 10);
    expect(scene.banner).toBe("RUNE OVERLOAD");
    expect(scene.effects.some((effect) => effect.effect === "rune-beam")).toBe(true);
    updateScene(scene, 500);
    expect(scene.popups.some((popup) => popup.text === "CHARGED")).toBe(true);
    updateScene(scene, 1000);
    expect(scene.effects.some((effect) => effect.type === "field" && effect.effect === "lightning_blast")).toBe(true);
    expect(scene.popups.filter((popup) => popup.text === "8")).toHaveLength(2);
    expect(scene.enemyAnims.get("construct-0")?.state).toBe("death");
  });

  it("affinityDiscovered pops WEAK! / RESIST over the target", () => {
    const scene = makeScene();
    playTurn(scene, [{ type: "affinityDiscovered", targetId: "rat-0", element: "fire", kind: "weak" }], spellName, 0, W, H);
    updateScene(scene, 50);
    expect(scene.popups.some((p) => p.text === "WEAK!")).toBe(true);

    const scene2 = makeScene();
    playTurn(scene2, [{ type: "affinityDiscovered", targetId: "rat-0", element: "water", kind: "resist" }], spellName, 0, W, H);
    updateScene(scene2, 50);
    expect(scene2.popups.some((p) => p.text === "RESIST")).toBe(true);
  });

  it("analyze event shows the Analyze banner", () => {
    const scene = makeScene();
    playTurn(scene, [{ type: "analyze", actorId: "c0", targetId: "rat-0" }], spellName, 0, W, H);
    updateScene(scene, 10);
    expect(scene.banner).toBe("Analyze");
  });

  it("phaseChange event shows the grows-stronger banner", () => {
    const scene = makeScene();
    playTurn(scene, [{ type: "phaseChange", actorId: "rat-0", phase: 2, name: "The Dead Boy" }], spellName, 0, W, H);
    updateScene(scene, 10);
    expect(scene.banner).toBe("The Dead Boy grows stronger!");
  });

  it("miss pops MISS with a soft whiff burst and no hurt animation", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "miss", actorId: "c0", targetId: "rat-0", reason: "evade" },
    ];
    playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 1100); // past IMPACT_AT (~987)
    expect(scene.popups.some((p) => p.text === "MISS")).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state ?? "idle").not.toBe("hurt");
    const missBurst = scene.effects.find(
      (e) => e.type === "burst" && e.effect === MISS_PRESENTATION.effect
    );
    expect(missBurst).toBeDefined();
    expect(missBurst!.scale).toBe(MISS_PRESENTATION.scale);
    expect(missBurst!.duration).toBe(MISS_PRESENTATION.durationMs);
    expect(missBurst!.color).toBe(MISS_PRESENTATION.color);
  });

  it("miss burst covers both party→enemy and enemy→party (shared path)", () => {
    const partyMiss = makeScene();
    playTurn(
      partyMiss,
      [{ type: "miss", actorId: "c0", targetId: "rat-0", reason: "evade" }],
      spellName,
      0,
      W,
      H
    );
    updateScene(partyMiss, 1100);
    expect(partyMiss.popups.some((p) => p.text === "MISS" && p.actorId === "rat-0")).toBe(true);
    expect(
      partyMiss.effects.some(
        (e) => e.type === "burst" && e.effect === MISS_PRESENTATION.effect
      )
    ).toBe(true);

    const enemyMiss = makeScene();
    playTurn(
      enemyMiss,
      [{ type: "miss", actorId: "rat-0", targetId: "c0", reason: "evade" }],
      spellName,
      0,
      W,
      H
    );
    updateScene(enemyMiss, 1100);
    expect(enemyMiss.popups.some((p) => p.text === "MISS" && p.actorId === "c0")).toBe(true);
    expect(
      enemyMiss.effects.some(
        (e) => e.type === "burst" && e.effect === MISS_PRESENTATION.effect
      )
    ).toBe(true);

    // techniqueMiss shares the same case / helper.
    const techMiss = makeScene();
    playTurn(
      techMiss,
      [
        {
          type: "techniqueMiss",
          actorId: "c0",
          targetId: "rat-0",
          techniqueId: "fighter-power-strike",
        },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(techMiss, 1100);
    expect(techMiss.popups.some((p) => p.text === "MISS")).toBe(true);
    expect(
      techMiss.effects.some(
        (e) => e.type === "burst" && e.effect === MISS_PRESENTATION.effect
      )
    ).toBe(true);
  });

  it("hit impacts do not use the miss whiff burst", () => {
    const scene = makeScene();
    playTurn(
      scene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 7, range: "close" }],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 1100);
    expect(scene.popups.some((p) => p.text === "7")).toBe(true);
    expect(scene.popups.some((p) => p.text === "MISS")).toBe(false);
    expect(
      scene.effects.some(
        (e) => e.type === "burst" && e.effect === MISS_PRESENTATION.effect
      )
    ).toBe(false);
  });

  it("defeated enemy plays death and schedules fade-out", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 99, range: "close" },
      { type: "defeated", targetId: "rat-0", wasEnemy: true },
    ];
    const duration = playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, duration);
    const anim = scene.enemyAnims.get("rat-0");
    expect(anim?.state).toBe("death");
    expect(anim?.fadeOutStart).not.toBeNull();
  });

  it("poison statusTick pops a purple number without hurt anim", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "statusTick", targetId: "c0", damage: 2, status: "poison" },
    ];
    playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 50);
    const popup = scene.popups.find((p) => p.text === "2");
    expect(popup).toBeDefined();
    expect(popup!.color).toBe("#c080ff");
  });

  it("null events (log-only lines) are skipped silently", () => {
    const scene = makeScene();
    const duration = playTurn(scene, [null, null], spellName, 0, W, H);
    updateScene(scene, 10);
    expect(scene.popups).toHaveLength(0);
    expect(duration).toBeLessThanOrEqual(400); // just the trailing beat
  });

  it("skipPlaybackToEnd fires remaining steps and completes", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 7, range: "close" },
    ];
    const t0 = 500;
    playTurn(scene, events, spellName, t0, W, H);
    expect(isPlaybackDone(scene, t0)).toBe(false);
    skipPlaybackToEnd(scene, t0 + 20);
    expect(isPlaybackDone(scene, t0 + 20)).toBe(true);
    expect(scene.popups.some((p) => p.text === "7")).toBe(true);
  });

  it("interrupting a mid-lunge playback snaps the actor back to its stable slot", () => {
    const scene = makeScene();
    const t0 = 0;
    playTurn(
      scene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 7, range: "close" }],
      spellName,
      t0,
      W,
      H
    );

    updateScene(scene, t0);
    updateScene(scene, 200);
    const moving = animOffset(getAnim(scene, "party", "c0", 200), 200);
    expect(Math.abs(moving.x)).toBeGreaterThan(0);

    // This is the same cosmetic skip used when a battle ends or the UI
    // abandons the current presentation. It must not leave a stale offset in
    // the renderer's next frame.
    skipPlaybackToEnd(scene, 200);
    expect(animOffset(getAnim(scene, "party", "c0", 200), 200)).toEqual({
      x: 0,
      y: 0,
    });
    expect(scene.partyAnims.get("c0")?.state).toBe("idle");
  });

  it("playbackRate 2 advances choreography twice as fast", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "attack", actorId: "c0", targetId: "rat-0", damage: 4, range: "close" },
    ];
    const t0 = 0;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    scene.playbackRate = 2;
    // Seed lastUpdate so warping has a prior frame.
    updateScene(scene, t0 + 1);
    // Half wall duration should finish under 2×.
    updateScene(scene, t0 + duration / 2 + 30);
    expect(isPlaybackDone(scene, t0 + duration / 2 + 30)).toBe(true);
  });

  it("meleeGangUp cast presentation (Orc's Pack Leap) mounts an ally, leaps to the target, and returns home", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(
      party,
      { front: [makeEnemy("rat-0"), makeEnemy("rat-1")], back: [] },
      false
    );
    const scene = createScene(state);
    const events: CombatEvent[] = [
      {
        type: "cast",
        actorId: "rat-0",
        spellId: "pack-leap",
        targetId: "c0",
        damage: 10,
        presentation: "meleeGangUp",
      },
    ];
    const t0 = 0;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    // A plain stationary ability cast is ~CAST_MS+400 (~1500ms); the leapfrog
    // sequence (mount, leap out/land, attack, leap back) runs well past that.
    expect(duration).toBeGreaterThan(1800);

    // Early: attacker hops toward its ally (walk state, mid-flight offset).
    updateScene(scene, t0 + 50);
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("walk");

    // Airborne toward the target: attack pose, well past a normal approach
    // distance (35px) — deep into party territory, short of the target.
    updateScene(scene, t0 + 900);
    const midAnim = scene.enemyAnims.get("rat-0");
    expect(midAnim?.state).toBe("attack");
    expect(midAnim!.moveToX).toBeGreaterThan(100);

    // Impact: damage popup lands on the target, which plays its hurt anim.
    updateScene(scene, t0 + 1200);
    expect(scene.popups.some((p) => p.text === "10")).toBe(true);
    expect(scene.partyAnims.get("c0")?.state).toBe("hurt");

    // Step through the return leap in a few beats — jumping straight to the
    // end would fire every remaining startMove at the same instant, which
    // collapses each ease-in-out onto its start value instead of settling.
    updateScene(scene, t0 + 1450);
    updateScene(scene, t0 + 1750);

    // After the full sequence: attacker is back at its home slot, idle.
    updateScene(scene, t0 + duration + 50);
    expect(isPlaybackDone(scene, t0 + duration + 50)).toBe(true);
    const finalAnim = scene.enemyAnims.get("rat-0")!;
    expect(finalAnim.state).toBe("idle");
    expect(animOffset(finalAnim, t0 + duration + 50)).toEqual({ x: 0, y: 0 });
  });

  it("meleeGangUp falls back to a solo hop (no crash) when no ally shares the attacker's kind", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
    const scene = createScene(state);
    const events: CombatEvent[] = [
      {
        type: "cast",
        actorId: "rat-0",
        spellId: "pack-leap",
        targetId: "c0",
        damage: 6,
        presentation: "meleeGangUp",
      },
    ];
    const duration = playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 1200);
    expect(scene.popups.some((p) => p.text === "6")).toBe(true);
    updateScene(scene, duration + 50);
    expect(isPlaybackDone(scene, duration + 50)).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("idle");
  });
});

describe("scene bookkeeping", () => {
  it("popups expire after their duration", () => {
    const scene = makeScene();
    playTurn(
      scene,
      [{ type: "statusTick", targetId: "c0", damage: 2, status: "poison" }],
      spellName,
      0,
      W,
      H
    );
    updateScene(scene, 50);
    expect(scene.popups.length).toBeGreaterThan(0);
    updateScene(scene, 2000);
    expect(scene.popups).toHaveLength(0);
  });

  it("absorbDeaths moves justDied enemies into the corpse list once", () => {
    const scene = makeScene();
    const dead = makeEnemy("rat-9");
    const next = structuredClone(scene.state);
    next.justDied = [dead];
    absorbDeaths(scene, next);
    absorbDeaths(scene, next);
    expect(scene.enemyCorpses.map((e) => e.instanceId)).toEqual(["rat-9"]);
    expect(scene.state).toBe(next);
  });

  it("faded corpses are purged by updateScene", () => {
    const scene = makeScene();
    const dead = makeEnemy("rat-9");
    const next = structuredClone(scene.state);
    next.justDied = [dead];
    absorbDeaths(scene, next);
    playTurn(scene, [{ type: "defeated", targetId: "rat-9", wasEnemy: true }], spellName, 0, W, H);
    updateScene(scene, 100); // death anim starts, fadeOutStart ~550
    expect(scene.enemyCorpses).toHaveLength(1);
    updateScene(scene, 5000); // long past fade
    expect(scene.enemyCorpses).toHaveLength(0);
  });
});

describe("sampleProjectilePose rise→dash", () => {
  it("lingers near the apex during the rise phase, then snaps to the target", () => {
    const fromX = 600;
    const fromY = 400;
    const toX = 200;
    const toY = 300;
    const apexX = 600;
    const apexY = 320;
    const riseFrac = 0.6;

    const midRise = sampleProjectilePose(0.3, fromX, fromY, toX, toY, {
      apexX,
      apexY,
      riseFrac,
    });
    expect(midRise.phase).toBe("rise");
    expect(midRise.y).toBeLessThan(fromY);
    expect(midRise.y).toBeGreaterThan(apexY);

    const atApex = sampleProjectilePose(0.6, fromX, fromY, toX, toY, {
      apexX,
      apexY,
      riseFrac,
    });
    expect(atApex.x).toBeCloseTo(apexX, 0);
    expect(atApex.y).toBeCloseTo(apexY, 0);

    const earlyDash = sampleProjectilePose(0.68, fromX, fromY, toX, toY, {
      apexX,
      apexY,
      riseFrac,
    });
    expect(earlyDash.phase).toBe("dash");
    // Still hanging near the apex early in the dash hold.
    expect(Math.abs(earlyDash.x - apexX)).toBeLessThan(Math.abs(toX - apexX) * 0.1);

    const lateDash = sampleProjectilePose(0.97, fromX, fromY, toX, toY, {
      apexX,
      apexY,
      riseFrac,
    });
    expect(Math.abs(lateDash.x - toX)).toBeLessThan(Math.abs(toX - apexX) * 0.2);
  });

  it("marks showcase projectile spells as riseDash", () => {
    expect(resolveEffectStyle("mage-fireball").projectilePath).toBe("riseDash");
    expect(resolveEffectStyle("mage-immolate").projectilePath).toBe("riseDash");
    expect(resolveEffectStyle("priest-sacred-flame").projectilePath).toBe("riseDash");
    expect(resolveEffectStyle("priest-divine-smite").projectilePath).toBe("riseDash");
    expect(resolveEffectStyle("mage-fire-bolt").projectilePath).toBe("riseDash");
  });
});

describe("resolveEffectStyle impact-pack wiring", () => {
  it("gives Old Man campaign cards magical projectile language", () => {
    const staff = resolveEffectStyle("the-staff-speaks", { cardPresentation: "card-spell", damage: 6 });
    const unlight = resolveEffectStyle("unlight", { cardPresentation: "card-spell", damage: 4 });
    expect(staff.projectile).toBe("px_arcane_bolt");
    expect(staff.burst).toBe("retro2_arcane_sigil");
    expect(unlight.projectile).toBe("px_darkness_bolt");
    expect(unlight.field).toBe("free_moon");
  });

  it("differentiates the tier-2 priest healing cluster", () => {
    const serious = resolveEffectStyle("priest-cure-serious");
    expect(serious.projectile).toBe("heal_sparks");
    expect(serious.burst).toBe("priest_heal");

    const blind = resolveEffectStyle("priest-cure-blind");
    expect(blind.projectile).toBeUndefined();
    expect(blind.burst).toBe("px_black_white_sparks");

    const massCure = resolveEffectStyle("priest-mass-cure");
    expect(massCure.projectile).toBe("heal_sparks");
    expect(massCure.projectileCount).toBe(3);
    expect(massCure.burst).toBe("heal_sparks");
    expect(massCure.burstCount).toBe(2);
    expect(massCure.field).toBe("priest_heal");
  });

  it("differentiates higher-tier single-target priest heals", () => {
    const serious = resolveEffectStyle("priest-cure-serious");
    const critical = resolveEffectStyle("priest-cure-critical");
    expect(critical.projectile).toBe("priest_heal");
    expect(critical.burst).toBe("priest_heal");
    expect(critical.burstCount).toBe(2);
    expect(critical.burstScale!).toBeGreaterThan(serious.burstScale ?? serious.scale ?? 1);
    expect(critical.field).toBeUndefined();
    expect(critical.burstUnderlay).toBeUndefined();

    const regen = resolveEffectStyle("priest-regenerate");
    expect(regen.projectile).toBe("heal_sparks");
    expect(regen.burst).toBe("heal_sparks");
    expect(regen.burstCount).toBe(3);
    expect(regen.burstDurationMs).toBe(1400);
    expect(regen.burstUnderlay).toBe("px_magic_sparks");
    expect(regen.field).toBeUndefined();
    // Sustained spark knit — not Critical's double cross punch, not Heal's sun miracle.
    expect(regen.burst).not.toBe(critical.burst);
    expect(regen.charge).toBeUndefined();

    const heal = resolveEffectStyle("priest-heal");
    expect(heal.charge).toBe("retro_sun_ring");
    expect(heal.projectile).toBe("priest_heal");
    expect(heal.burst).toBe("priest_heal");
    expect(heal.burstCount).toBe(2);
    expect(heal.burstUnderlay).toBe("retro_sun_ring");
    expect(heal.field).toBeUndefined();
    // Not party-wide bloom / Raise Dead vocabulary.
    expect(heal.field).not.toBe("retro3_arcane_bloom");
    expect(heal.burst).not.toBe("retro_dot_flower");
    expect(heal.burstUnderlay).not.toBe("retro_dot_flower");

    const massHeal = resolveEffectStyle("priest-mass-heal");
    expect(massHeal.field).toBe("retro3_arcane_bloom");
    expect(heal.burstUnderlay).not.toBe(massHeal.field);
  });

  it("differentiates the priest ward cluster (single ally vs party)", () => {
    // The shared buff/magicScreen kind fallback both spells used to land on.
    const FALLBACK = { burst: "px_shield", burstScale: 1.6, field: "px_shield", fieldScale: 0.8 };

    const faith = resolveEffectStyle("priest-shield-of-faith");
    const bless = resolveEffectStyle("priest-bless");

    // Single-target grammar: only a non-area cast draws a caster→target
    // projectile, and playTurn never pushes a field for a singleAlly spell.
    expect(faith.projectile).toBe("px_shield");
    expect(faith.burst).toBe("px_shield");
    expect(faith.burstUnderlay).toBe("free_wardring");
    expect(faith.field).toBeUndefined();
    expect(faith.burstCount).toBeUndefined();
    // Still the shield bubble, but no longer the bald fallback — and never
    // larger than it, so the opaque disc can't swallow the body it wards.
    expect(faith.burstScale!).toBeLessThan(FALLBACK.burstScale);
    // The ring underlay carries the size instead, and needs a longer linger
    // than the default 620ms burst to reach its expanded-ring frames.
    expect(faith.burstUnderlayScale!).toBeGreaterThan(faith.burstScale!);
    expect(faith.burstDurationMs).toBe(900);

    // Party grammar: a sigil field over the party column plus one small sigil
    // per ally; no projectile at all, and no rain (projectileCount) either.
    expect(bless.burst).toBe("retro3_sigil_charge");
    expect(bless.field).toBe("retro3_sigil_charge");
    expect(bless.fieldDurationMs).toBe(1000);
    expect(bless.projectile).toBeUndefined();
    expect(bless.projectileCount).toBeUndefined();
    expect(bless.burst).not.toBe(FALLBACK.burst);
    expect(bless.field).not.toBe(FALLBACK.field);

    // The two differ from each other at strip level, not only by scale.
    expect(faith.burst).not.toBe(bless.burst);
    expect(faith.burstUnderlay).not.toBe(bless.burst);

    // Neither borrows heal / resurrection vocabulary.
    const HEAL_VOCAB = [
      "priest_heal",
      "heal_sparks",
      "retro3_arcane_bloom",
      "retro_dot_flower",
      "retro_sun_ring",
      "free_sunburst",
    ];
    for (const style of [faith, bless]) {
      for (const id of [style.projectile, style.burst, style.field, style.charge, style.burstUnderlay, style.fieldUnderlay]) {
        if (id) expect(HEAL_VOCAB).not.toContain(id);
      }
    }

    // Bless does not collapse onto Holy Aura's solar vortex or Spell Shield's square.
    const holyAura = resolveEffectStyle("priest-holy-aura");
    const spellShield = resolveEffectStyle("mage-spell-shield");
    expect(bless.burst).not.toBe(holyAura.burst);
    expect(bless.field).not.toBe(holyAura.field);
    expect(bless.burst).not.toBe(spellShield.burst);
    expect(bless.field).not.toBe(spellShield.field);

    // Neighbouring wards are untouched.
    expect(holyAura.burst).toBe("retro2_solar_ring");
    expect(spellShield.burst).toBe("retro2_ward_square");
    const arcaneWard = resolveEffectStyle("mage-arcane-ward");
    expect(arcaneWard.projectile).toBe("px_arcane_bolt");
    expect(arcaneWard.burst).toBe("px_magic_orb");
    expect(faith.burst).not.toBe(arcaneWard.burst);
  });

  it("differentiates mage disable twins (Hold Person vs Power Word Stun)", () => {
    // Shared fallthrough both spells used to land on before this override.
    const PARALYSIS_FALLBACK = { color: "#c8c4b8", burst: "free_stunburst", burstScale: 1.2 };

    const hold = resolveEffectStyle("mage-hold-person");
    const stun = resolveEffectStyle("mage-power-word-stun");
    const web = resolveEffectStyle("mage-web");

    // Hold Person: soft bind — arcane bolt + locking ring on one body.
    expect(hold.projectile).toBe("px_arcane_bolt");
    expect(hold.burst).toBe("free_wardring");
    expect(hold.burstDurationMs).toBe(900);
    expect(hold.field).toBeUndefined();
    expect(hold.burstUnderlay).toBeUndefined();
    expect(hold.burst).not.toBe(PARALYSIS_FALLBACK.burst);

    // Power Word: Stun: abrupt command — heavier stun stars, no projectile.
    expect(stun.projectile).toBeUndefined();
    expect(stun.burst).toBe("free_stunburst");
    expect(stun.burstUnderlay).toBe("retro_shockwave");
    expect(stun.burstCount).toBe(2);
    expect(stun.field).toBeUndefined();
    expect(stun.burstScale!).toBeGreaterThan(PARALYSIS_FALLBACK.burstScale!);

    // Style split at strip level, not only by scale.
    expect(hold.burst).not.toBe(stun.burst);
    expect(hold.projectile).not.toBe(stun.projectile);
    expect(hold.burst).not.toBe(web.burst);
    expect(stun.burst).not.toBe(web.burst);
    expect(hold.burstUnderlay).not.toBe(web.burst);

    // Web's tangled-vine override is untouched.
    expect(web.burst).toBe("free_tangle");
    expect(web.field).toBe("free_tangle");
    expect(web.fieldScale).toBe(1.3);
    expect(web.burstScale).toBe(1.3);

    // Global paralysis STATUS_STYLES unchanged for non-override paths
    // (enemy-inflicted paralysis / statusInflicted fallthrough).
    const enemyParalysis = resolveEffectStyle(undefined, { statusInflicted: "paralysis" });
    expect(enemyParalysis.burst).toBe(PARALYSIS_FALLBACK.burst);
    expect(enemyParalysis.burstScale).toBe(PARALYSIS_FALLBACK.burstScale);
    expect(enemyParalysis.color).toBe(PARALYSIS_FALLBACK.color);
    expect(enemyParalysis.projectile).toBeUndefined();
    expect(enemyParalysis.burstUnderlay).toBeUndefined();
    expect(enemyParalysis.burstCount).toBeUndefined();

    // Neither borrows Web's vines or Tech slash language.
    for (const style of [hold, stun]) {
      expect(style.burst).not.toBe("free_tangle");
      expect(style.field).not.toBe("free_tangle");
      expect(style.burst).not.toBe("free_slash");
      expect(style.projectile).not.toBe("free_slash");
    }
  });

  it("plays Hold Person bind and Power Word Stun impact on one body", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const enemies = { front: [makeEnemy("rat-0")], back: [] };

    const holdScene = createScene(createCombatState(party, enemies, false));
    playTurn(
      holdScene,
      [
        { type: "cast", actorId: "c1", spellId: "mage-hold-person", targetId: "rat-0" },
        {
          type: "spellEffect",
          spellId: "mage-hold-person",
          targetId: "rat-0",
          statusInflicted: "paralysis",
        },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(holdScene, 1200);
    const holdFx = holdScene.effects;
    // Single-target: projectile volley + body burst; no area field.
    expect(holdFx.some((e) => e.type === "field")).toBe(false);
    expect(holdFx.some((e) => e.type === "projectile" && e.effect === "px_arcane_bolt")).toBe(true);
    const holdBursts = holdFx.filter((e) => e.type === "burst" && e.effect === "free_wardring");
    expect(holdBursts.length).toBe(1);
    expect(holdFx.some((e) => e.type === "burst" && e.effect === "free_tangle")).toBe(false);
    expect(holdFx.some((e) => e.type === "burst" && e.effect === "free_stunburst")).toBe(false);

    const stunScene = createScene(createCombatState(party, enemies, false));
    playTurn(
      stunScene,
      [
        { type: "cast", actorId: "c1", spellId: "mage-power-word-stun", targetId: "rat-0" },
        {
          type: "spellEffect",
          spellId: "mage-power-word-stun",
          targetId: "rat-0",
          statusInflicted: "paralysis",
        },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(stunScene, 1200);
    const stunFx = stunScene.effects;
    expect(stunFx.some((e) => e.type === "field")).toBe(false);
    expect(stunFx.some((e) => e.type === "projectile")).toBe(false);
    const stunBursts = stunFx.filter((e) => e.type === "burst" && e.effect === "free_stunburst");
    expect(stunBursts.length).toBe(2);
    expect(stunFx.some((e) => e.type === "burst" && e.effect === "retro_shockwave")).toBe(true);
    expect(stunFx.some((e) => e.type === "burst" && e.effect === "free_wardring")).toBe(false);
    expect(stunFx.some((e) => e.type === "burst" && e.effect === "free_tangle")).toBe(false);

    // Web area cast still fields tangle (regression guard for the intact override).
    const webScene = createScene(createCombatState(party, enemies, false));
    playTurn(
      webScene,
      [
        { type: "cast", actorId: "c1", spellId: "mage-web", targetId: null },
        {
          type: "spellEffect",
          spellId: "mage-web",
          targetId: "rat-0",
          statusInflicted: "paralysis",
        },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(webScene, 1600);
    const webFx = webScene.effects;
    expect(webFx.some((e) => e.type === "field" && e.effect === "free_tangle")).toBe(true);
    expect(webFx.some((e) => e.type === "burst" && e.effect === "free_tangle")).toBe(true);
  });

  it("plays Shield of Faith on one body and Bless over the whole party", () => {
    const party = [
      createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bob", "Human", "Neutral", "Mage", 1),
      createCharacterRecord("c2", "Cleo", "Human", "Neutral", "Priest", 2),
    ];
    const enemies = { front: [makeEnemy("rat-0")], back: [] };

    const faithScene = createScene(createCombatState(party, enemies, false));
    playTurn(
      faithScene,
      [
        { type: "cast", actorId: "c2", spellId: "priest-shield-of-faith", targetId: "c0" },
        { type: "spellEffect", spellId: "priest-shield-of-faith", targetId: "c0", isBuff: true },
      ],
      spellName,
      0,
      W,
      H
    );
    // Past the cast → impact window.
    updateScene(faithScene, 1200);
    const faithFx = faithScene.effects;
    // No party-wide field layer — the ward lands on a single body.
    expect(faithFx.some((e) => e.type === "field")).toBe(false);
    const faithBursts = faithFx.filter((e) => e.type === "burst" && e.effect === "px_shield");
    expect(faithBursts.length).toBe(1);
    expect(faithFx.some((e) => e.type === "burst" && e.effect === "free_wardring")).toBe(true);

    const blessScene = createScene(createCombatState(party, enemies, false));
    playTurn(
      blessScene,
      [
        { type: "cast", actorId: "c2", spellId: "priest-bless", targetId: null },
        { type: "spellEffect", spellId: "priest-bless", targetId: "c0", isBuff: true },
        { type: "spellEffect", spellId: "priest-bless", targetId: "c1", isBuff: true },
        { type: "spellEffect", spellId: "priest-bless", targetId: "c2", isBuff: true },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(blessScene, 1600);
    const blessFx = blessScene.effects;
    const blessFields = blessFx.filter((e) => e.type === "field" && e.effect === "retro3_sigil_charge");
    expect(blessFields.length).toBeGreaterThan(0);
    // Field sits over the party column (right side), not the enemy line.
    for (const f of blessFields) expect(f.x).toBeGreaterThan(W * 0.5);
    // One sigil per ally, and never a thrown projectile.
    const blessBursts = blessFx.filter((e) => e.type === "burst" && e.effect === "retro3_sigil_charge");
    expect(blessBursts.length).toBe(3);
    expect(blessFx.some((e) => e.type === "projectile")).toBe(false);
  });

  it("wires the three leftover impact strips into spell/element styles", () => {
    expect(resolveEffectStyle("priest-holy-aura").burst).toBe("retro2_solar_ring");
    expect(resolveEffectStyle("priest-holy-aura").field).toBe("retro2_solar_ring");
    expect(resolveEffectStyle("priest-sunburst").field).toBe("retro2_solar_ring");

    expect(resolveEffectStyle("mage-rock-slide").field).toBe("retro2_earth_swirl");
    expect(resolveEffectStyle("mage-stone-shard").field).toBe("retro2_earth_swirl");
    expect(resolveEffectStyle("mage-stone-shard").charge).toBe("retro2_earth_swirl");

    expect(resolveEffectStyle("mage-meteor-swarm").burst).toBe("fz_explosion");
    expect(resolveEffectStyle("mage-meteor-swarm").field).toBe("retro_fire_mushroom");
    expect(resolveEffectStyle("mage-immolate").burst).toBe("retro_fire_mushroom");
  });

  it("gives higher-tier spells multishot and burst variety knobs", () => {
    expect(resolveEffectStyle("mage-fireball").projectileCount).toBe(2);
    expect(resolveEffectStyle("mage-immolate").projectileCount).toBe(3);
    expect(resolveEffectStyle("mage-meteor-swarm").projectileCount).toBe(5);
    expect(resolveEffectStyle("mage-meteor-swarm").burstCount).toBe(3);
    expect(resolveEffectStyle("mage-freezing-sphere").projectileCount).toBe(4);
    expect(resolveEffectStyle("priest-divine-smite").projectileCount).toBe(2);
    expect(resolveEffectStyle("mage-ice-storm").projectileCount).toBe(4);
  });
});

describe("resolveMeleeHitEffect", () => {
  it("Mage normal uses wizard_attack1; crit uses wizard_attack2", () => {
    expect(resolveMeleeHitEffect("Mage", { crit: false }).effect).toBe("wizard_attack1");
    expect(resolveMeleeHitEffect("Mage", { crit: true }).effect).toBe("wizard_attack2");
  });

  it("Mage/Priest melee include staff_attack underlay", () => {
    expect(resolveMeleeHitEffect("Mage", { crit: false }).underlay).toBe("staff_attack");
    expect(resolveMeleeHitEffect("Priest", { crit: false }).underlay).toBe("staff_attack");
  });

  it("technique Fighter uses slash + stunburst, not elemental puff", () => {
    const t = resolveMeleeHitEffect("Fighter", { technique: true });
    expect(t.effect).toBe("free_slash");
    expect(t.underlay).toBe("free_stunburst");
    expect(t.scale).toBeGreaterThan(resolveMeleeHitEffect("Fighter").scale);
  });
});

describe("enemyIsUndead", () => {
  it("reads undead special from enemy defs", () => {
    expect(enemyIsUndead("skeleton")).toBe(true);
    expect(enemyIsUndead("slime")).toBe(false);
  });
});

describe("actor positioning", () => {
  it("party is on the right, enemies on the left, and back row is deeper", () => {
    expect(partyPos(0, W, H).x).toBeGreaterThan(W / 2);
    expect(enemyPos(0, "front", W, H).x).toBeLessThan(W / 2);
    expect(enemyPos(0, "back", W, H).y).toBeLessThan(enemyPos(0, "front", W, H).y);
    expect(enemyPos(0, "back", W, H).scale).toBeLessThan(enemyPos(0, "front", W, H).scale);
    const seam = 215; // theme:f1 / arena seamY (high-camera)
    expect(enemyPos(0, "back", W, H).footY).toBeGreaterThanOrEqual(seam);
    expect(partyPos(5, W, H).footY).toBeGreaterThanOrEqual(seam);
  });

  it("findActor resolves party, enemies, and corpses", () => {
    const scene = makeScene();
    expect(findActor(scene, "c0", W, H)?.kind).toBe("party");
    expect(findActor(scene, "rat-0", W, H)?.kind).toBe("enemy");
    expect(findActor(scene, "nobody", W, H)).toBeNull();

    const dead = makeEnemy("rat-9");
    const next = structuredClone(scene.state);
    next.justDied = [dead];
    absorbDeaths(scene, next);
    expect(findActor(scene, "rat-9", W, H)?.kind).toBe("enemy");
  });

  it("keeps ordinary 1–4 member campaign positions on the exact legacy path", () => {
    for (let count = 1; count <= 4; count++) {
      const party = Array.from({ length: count }, (_, i) =>
        createCharacterRecord(`campaign-${i}`, `Hero ${i}`, "Human", "Neutral", "Fighter", i)
      );
      const state = createCombatState(
        party,
        { front: [makeEnemy(`rat-${count}`)], back: [] },
        false
      );
      expect(state.partyFormation).toBeUndefined();
      for (const backdropId of ["arena", "theme:f2", "theme:f5", "corridor"]) {
        for (let i = 0; i < party.length; i++) {
          expect(
            partyActorPos(state, i, party[i]!.id, W, H, backdropId)
          ).toEqual(partyPos(i, W, H, backdropId));
        }
      }
    }
  });

  it("resolves Card Trial heroes by authoritative row, independent of array order", () => {
    const party = [
      createCharacterRecord("old-man", "Old Man", "Human", "Neutral", "Priest", 2),
      createCharacterRecord("rat-king", "Rat King", "Human", "Neutral", "Thief", 0),
    ];
    const state = createCombatState(party, { front: [], back: [] }, false);
    state.partyFormation = {
      kind: "card-trial-rows",
      rowsByActorId: {
        "rat-king": { row: "front", rowEnteredAt: 1 },
        "old-man": { row: "back", rowEnteredAt: 2 },
      },
    };
    const scene = createScene(state);
    const front = findActor(scene, "rat-king", W, H)!;
    const back = findActor(scene, "old-man", W, H)!;
    expect(front.footY).toBeGreaterThan(back.footY);
    expect(front.scale).toBe(back.scale);
  });

  it("uses the production footY sort to paint Card Trial Front after Back", () => {
    const party = [
      createCharacterRecord("rat-king", "Rat King", "Human", "Neutral", "Thief", 0),
      createCharacterRecord("old-man", "Old Man", "Human", "Neutral", "Priest", 2),
    ];
    const state = createCombatState(party, { front: [], back: [] }, false);
    state.partyFormation = {
      kind: "card-trial-rows",
      rowsByActorId: {
        "rat-king": { row: "front", rowEnteredAt: 1 },
        "old-man": { row: "back", rowEnteredAt: 2 },
      },
    };
    const scene = createScene(state);
    const drawOrder = ["rat-king", "old-man"]
      .map((id) => ({ id, footY: findActor(scene, id, W, H)!.footY }))
      .sort(comparePaintOrder)
      .map(({ id }) => id);
    expect(drawOrder).toEqual(["old-man", "rat-king"]);
  });

  it("keeps two heroes in one Card Trial row separately visible", () => {
    const party = [
      createCharacterRecord("rat-king", "Rat King", "Human", "Neutral", "Thief", 2),
      createCharacterRecord("old-man", "Old Man", "Human", "Neutral", "Priest", 3),
    ];
    const state = createCombatState(party, { front: [], back: [] }, false);
    state.partyFormation = {
      kind: "card-trial-rows",
      rowsByActorId: {
        "rat-king": { row: "back", rowEnteredAt: 3 },
        "old-man": { row: "back", rowEnteredAt: 2 },
      },
    };
    const scene = createScene(state);
    const ratKing = findActor(scene, "rat-king", W, H)!;
    const oldMan = findActor(scene, "old-man", W, H)!;
    expect(ratKing.x).not.toBe(oldMan.x);
    expect(ratKing.footY).toBe(oldMan.footY);
  });

  it("a mid-row death does not teleport its surviving row-mate or misplace the corpse", () => {
    const party = [createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const a = makeEnemy("a");
    const b = makeEnemy("b");
    const c = makeEnemy("c");
    const state = createCombatState(party, { front: [a, b, c], back: [] }, false);
    const scene = createScene(state);

    // Seed slots in spawn order, same as the first render frame would.
    const bPosBefore = findActor(scene, "b", W, H)!;
    const cPosBefore = findActor(scene, "c", W, H)!;
    findActor(scene, "a", W, H);

    // Kill B the way the engine does (combat-eor.ts's row filter): removed
    // from the live array, recorded in justDied for absorbDeaths to pick up.
    const next = structuredClone(scene.state);
    next.enemies.front = next.enemies.front.filter((e) => e.instanceId !== "b");
    next.justDied = [{ ...b }];
    absorbDeaths(scene, next);

    // C never died and never moved — it must stay exactly where it was,
    // not slide into B's now-empty slot.
    const cPosAfter = findActor(scene, "c", W, H)!;
    expect(cPosAfter.x).toBe(cPosBefore.x);
    expect(cPosAfter.footY).toBe(cPosBefore.footY);

    // B's corpse plays its death animation in B's own original spot, not a
    // synthetic trailing slot borrowed from C's old position.
    const corpsePos = findActor(scene, "b", W, H)!;
    expect(corpsePos.x).toBe(bPosBefore.x);
    expect(corpsePos.footY).toBe(bPosBefore.footY);
  });

  it("createScene preseeds slots in encounter-array order (not first-touched order)", () => {
    const party = [createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const state = createCombatState(
      party,
      { front: [makeEnemy("first"), makeEnemy("second"), makeEnemy("third")], back: [] },
      false
    );
    const scene = createScene(state);
    // Touch in reverse initiative order — slots must still match array order
    // (ENEMY_FRONT_SLOTS[i], not "whichever findActor touched first").
    const third = findActor(scene, "third", W, H)!;
    const first = findActor(scene, "first", W, H)!;
    const second = findActor(scene, "second", W, H)!;
    expect(first.x).toBe(enemyPos(0, "front", W, H).x);
    expect(second.x).toBe(enemyPos(1, "front", W, H).x);
    expect(third.x).toBe(enemyPos(2, "front", W, H).x);
  });

  it("a same-row summon does not claim a fading corpse's slot", () => {
    const party = [createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const a = makeEnemy("a");
    const b = makeEnemy("b");
    const state = createCombatState(party, { front: [a, b], back: [] }, false);
    const scene = createScene(state);
    const aPos = findActor(scene, "a", W, H)!;
    const bPosBefore = findActor(scene, "b", W, H)!;

    // Kill B; corpse still occupies its slot while fading.
    const next = structuredClone(scene.state);
    next.enemies.front = next.enemies.front.filter((e) => e.instanceId !== "b");
    next.justDied = [{ ...b }];
    absorbDeaths(scene, next);

    // A new same-row summon arrives while B's corpse is still listed.
    // With live-only occupancy it would steal B's slot; with corpse
    // reservation it must take the next free slot (2), not B's (1).
    const summon = makeEnemy("summon-new");
    scene.state.enemies.front.push(summon);
    const summonPos = findActor(scene, "summon-new", W, H)!;
    const corpsePos = findActor(scene, "b", W, H)!;
    expect(corpsePos.x).toBe(bPosBefore.x);
    expect(summonPos.x).not.toBe(corpsePos.x);
    expect(summonPos.x).not.toBe(aPos.x);
  });

  it("a never-rendered turn-1 death still claims a distinct slot from survivors", () => {
    const party = [createCharacterRecord("c0", "Alice", "Human", "Neutral", "Fighter", 0)];
    const a = makeEnemy("a");
    const b = makeEnemy("b");
    const state = createCombatState(party, { front: [a, b], back: [] }, false);
    const scene = createScene(state);
    // createScene preseeds both; clear maps to simulate the pre-preseed
    // turn-1 path where findActor never ran before absorbDeaths.
    scene.enemySlots.clear();

    const next = structuredClone(scene.state);
    next.enemies.front = next.enemies.front.filter((e) => e.instanceId !== "b");
    next.justDied = [{ ...b }];
    absorbDeaths(scene, next);

    // Survivor A is first touched after death absorption — must not collide
    // with the corpse that claimed a slot from an empty map.
    const aPos = findActor(scene, "a", W, H)!;
    const corpsePos = findActor(scene, "b", W, H)!;
    expect(aPos.x).not.toBe(corpsePos.x);
  });
});

describe("Card Trial party-row transition", () => {
  function rowState(
    ratRow: "front" | "back",
    ratEnteredAt: number
  ) {
    const party = [
      createCharacterRecord("rat-king", "Rat King", "Human", "Neutral", "Thief", 0),
      createCharacterRecord("old-man", "Old Man", "Human", "Neutral", "Priest", 2),
    ];
    const state = createCombatState(
      party,
      { front: [makeEnemy("row-target")], back: [] },
      false
    );
    state.partyFormation = {
      kind: "card-trial-rows",
      rowsByActorId: {
        "rat-king": { row: ratRow, rowEnteredAt: ratEnteredAt },
        "old-man": { row: "back", rowEnteredAt: 2 },
      },
    };
    return state;
  }

  it("derives the destination from row/entry clock and slides old anchor to new in 200ms", () => {
    const oldState = rowState("front", 1);
    const scene = createScene(oldState);
    const oldPos = findActor(scene, "rat-king", W, H)!;

    const nextState = rowState("back", 3);
    setCombatSceneState(scene, nextState);
    expect(scene.partyFormationTransitions.get("rat-king")).toEqual({
      fromRow: "front",
      toRow: "back",
      rowEnteredAt: 3,
    });
    const newPos = findActor(scene, "rat-king", W, H)!;

    const start = 1_000;
    playTurn(
      scene,
      [
        {
          type: "partyRowMove",
          actorId: "rat-king",
          row: "back",
          rowEnteredAt: 3,
        },
      ],
      (id) => id,
      start,
      W,
      H
    );
    const anim = getAnim(scene, "party", "rat-king", start);
    const initial = animOffset(anim, start);
    expect(newPos.x + initial.x).toBeCloseTo(oldPos.x);
    expect(newPos.footY + initial.y).toBeCloseTo(oldPos.footY);

    updateScene(scene, start);
    expect(anim.moveDuration).toBe(PARTY_ROW_MOVE_MS);
    expect(PARTY_ROW_MOVE_MS).toBeGreaterThanOrEqual(150);
    expect(PARTY_ROW_MOVE_MS).toBeLessThanOrEqual(250);
    expect(anim.state).toBe("walk");

    updateScene(scene, start + PARTY_ROW_MOVE_MS / 2);
    const halfway = animOffset(anim, start + PARTY_ROW_MOVE_MS / 2);
    expect(newPos.x + halfway.x).toBeCloseTo((oldPos.x + newPos.x) / 2);
    expect(newPos.footY + halfway.y).toBeCloseTo(
      (oldPos.footY + newPos.footY) / 2
    );

    updateScene(scene, start + PARTY_ROW_MOVE_MS);
    expect(animOffset(anim, start + PARTY_ROW_MOVE_MS)).toEqual({ x: 0, y: 0 });
    expect(anim.state).toBe("idle");
    expect(scene.partyFormationTransitions.has("rat-king")).toBe(false);
  });

  it("does not animate a card move event when rowEnteredAt says no row change occurred", () => {
    const state = rowState("front", 1);
    const scene = createScene(state);
    setCombatSceneState(scene, rowState("front", 1));
    playTurn(
      scene,
      [
        {
          type: "partyRowMove",
          actorId: "rat-king",
          row: "front",
          rowEnteredAt: 1,
        },
      ],
      (id) => id,
      0,
      W,
      H
    );
    updateScene(scene, 0);
    expect(scene.partyFormationTransitions.size).toBe(0);
    expect(animOffset(getAnim(scene, "party", "rat-king", 0), 100)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("keeps a card banner and attack based at the old anchor until their move beat", () => {
    const scene = createScene(rowState("front", 1));
    const oldPos = findActor(scene, "rat-king", W, H)!;
    setCombatSceneState(scene, rowState("back", 3));
    const newPos = findActor(scene, "rat-king", W, H)!;
    const start = 2_000;
    const duration = playTurn(
      scene,
      [
        {
          type: "cast",
          actorId: "rat-king",
          spellId: "Parting Blow",
          targetId: null,
        },
        {
          type: "attack",
          actorId: "rat-king",
          targetId: "row-target",
          damage: 4,
        },
        {
          type: "partyRowMove",
          actorId: "rat-king",
          row: "back",
          rowEnteredAt: 3,
        },
      ],
      (id) => id,
      start,
      W,
      H
    );
    const anim = getAnim(scene, "party", "rat-king", start);
    const seeded = animOffset(anim, start);
    expect(newPos.x + seeded.x).toBeCloseTo(oldPos.x);
    expect(newPos.footY + seeded.y).toBeCloseTo(oldPos.footY);

    updateScene(scene, start);
    updateScene(scene, start + 130);
    const duringBanner = animOffset(anim, start + 130);
    expect(newPos.x + duringBanner.x).toBeCloseTo(oldPos.x);
    expect(
      Math.abs(newPos.footY + duringBanner.y - oldPos.footY)
    ).toBeLessThan(10);

    let rowMoveStartedAt: number | null = null;
    for (let elapsed = 140; elapsed <= duration; elapsed += 10) {
      updateScene(scene, start + elapsed);
      if (
        anim.moveDuration === PARTY_ROW_MOVE_MS &&
        anim.moveToX === 0 &&
        anim.moveToY === 0
      ) {
        rowMoveStartedAt = elapsed;
        break;
      }
    }
    expect(rowMoveStartedAt).not.toBeNull();
    expect(rowMoveStartedAt!).toBeGreaterThan(PARTY_ROW_MOVE_MS);
    const atMoveStart = animOffset(anim, start + rowMoveStartedAt!);
    expect(newPos.x + atMoveStart.x).toBeCloseTo(oldPos.x, 0);
    expect(newPos.footY + atMoveStart.y).toBeCloseTo(oldPos.footY, 0);
  });
});

describe("impact feedback (shake / floor glow / banner)", () => {
  it("screen shake scales with spell tier", () => {
    const t0 = 1000;

    const low = makeScene();
    playTurn(
      low,
      [{ type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 5 }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(low, t0 + 10);
    const lowShake = low.screenShake.amount;

    const high = makeScene();
    playTurn(
      high,
      [{ type: "spellEffect", spellId: "mage-disintegrate", targetId: "rat-0", damage: 50 }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(high, t0 + 10);
    const highShake = high.screenShake.amount;

    expect(lowShake).toBeGreaterThan(0);
    expect(highShake).toBeGreaterThan(lowShake);
    expect(highShake).toBeLessThanOrEqual(8); // hard cap
  });

  it("high-tier bursts linger longer than low-tier bursts", () => {
    const t0 = 1000;

    const low = makeScene();
    playTurn(
      low,
      [{ type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 5 }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(low, t0 + 10);
    const lowBurst = low.effects.find((e) => e.type === "burst");

    const high = makeScene();
    playTurn(
      high,
      [{ type: "spellEffect", spellId: "mage-disintegrate", targetId: "rat-0", damage: 50 }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(high, t0 + 10);
    const highBurst = high.effects.find((e) => e.type === "burst");

    expect(lowBurst).toBeDefined();
    expect(highBurst).toBeDefined();
    expect(highBurst!.duration).toBeGreaterThan(lowBurst!.duration);
  });

  it("impacts spawn floor light glows that expire", () => {
    const scene = makeScene();
    const t0 = 1000;
    playTurn(
      scene,
      [{ type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 5 }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(scene, t0 + 10);
    expect(scene.lightGlows.length).toBeGreaterThan(0);

    updateScene(scene, t0 + 10000);
    expect(scene.lightGlows.length).toBe(0);
  });

  it("melee hits also light the floor", () => {
    const scene = makeScene();
    const t0 = 1000;
    playTurn(
      scene,
      [{ type: "attack", actorId: "c0", targetId: "rat-0", damage: 7, range: "close" }],
      spellName,
      t0,
      W,
      H
    );
    updateScene(scene, t0 + 1100); // past melee IMPACT_AT
    expect(scene.lightGlows.length).toBeGreaterThan(0);
  });

  it("banner records its start time for fade math", () => {
    const scene = makeScene();
    const t0 = 1000;
    playTurn(
      scene,
      [
        { type: "cast", actorId: "c1", spellId: "mage-fire-bolt", targetId: "rat-0" },
        { type: "spellEffect", spellId: "mage-fire-bolt", targetId: "rat-0", damage: 5 },
      ],
      spellName,
      t0,
      W,
      H
    );
    updateScene(scene, t0 + 10);
    expect(scene.banner).toBe("Spell:mage-fire-bolt");
    expect(scene.bannerStart).toBeGreaterThanOrEqual(t0);
    expect(scene.bannerUntil).toBeGreaterThan(scene.bannerStart);
  });

  it("setBossIntroNameplate arms a plate that expires via updateScene", () => {
    const scene = makeScene();
    const t0 = 500;
    setBossIntroNameplate(scene, "The Dead Boy", t0, 1000);
    expect(scene.introNameplate).toBe("The Dead Boy");
    expect(scene.introNameplateStart).toBe(t0);
    expect(scene.introNameplateUntil).toBe(1500);
    updateScene(scene, t0 + 500);
    expect(scene.introNameplate).toBe("The Dead Boy");
    updateScene(scene, t0 + 1000);
    expect(scene.introNameplate).toBeNull();
  });
});

describe("dialog barks (spec 2026-07-26)", () => {
  it("replaces a live bark on the same actor only when priority is strictly higher", () => {
    const scene = makeScene();
    expect(pushBark(scene, { actorId: "c0", trigger: "beforeSpell", text: "Burn, fiend!" }, 0)).toBe(true);
    expect(scene.barks).toHaveLength(1);
    expect(scene.barks[0]!.text).toBe("Burn, fiend!");

    // Equal/lower priority on the same actor: drop, keep the live one.
    expect(pushBark(scene, { actorId: "c0", trigger: "beforeSpell", text: "Take this!" }, 10)).toBe(false);
    expect(scene.barks).toHaveLength(1);
    expect(scene.barks[0]!.text).toBe("Burn, fiend!");

    // Strictly higher priority: replace.
    expect(pushBark(scene, { actorId: "c0", trigger: "heavyHit", text: "Gyaaah!" }, 20)).toBe(true);
    expect(scene.barks).toHaveLength(1);
    expect(scene.barks[0]!.text).toBe("Gyaaah!");
    expect(scene.barks[0]!.priority).toBe(BARK_PRIORITY.heavyHit);
  });

  it("keeps the two highest-priority non-death requests in the ~100ms window and drops the rest", () => {
    const scene = makeScene();
    expect(pushBark(scene, { actorId: "e1", trigger: "beforeSpell", text: "A" }, 0)).toBe(true);
    expect(pushBark(scene, { actorId: "e2", trigger: "heavyHit", text: "B" }, 10)).toBe(true);
    // Window already holds priorities [1,2]; a third priority-1 request is dropped.
    expect(pushBark(scene, { actorId: "e3", trigger: "beforeSpell", text: "C" }, 20)).toBe(false);
    // A higher-priority request evicts the lowest window slot and lands
    // (different actor, so the per-actor replace rule doesn't block it).
    expect(pushBark(scene, { actorId: "e4", trigger: "heavyHit", text: "D" }, 30)).toBe(true);
    expect(scene.barkWindow.map((e) => e.priority).sort((a, b) => a - b)).toEqual([2, 2]);
  });

  it("exempts death barks from the global window cap", () => {
    const scene = makeScene();
    pushBark(scene, { actorId: "e1", trigger: "heavyHit", text: "A" }, 0);
    pushBark(scene, { actorId: "e2", trigger: "heavyHit", text: "B" }, 10);
    // Window already holds 2 non-death entries; three more death barks
    // (different actors) must all land regardless — a wipe can show
    // several death lines at once (intentional payoff, spec §6.3).
    expect(pushBark(scene, { actorId: "e3", trigger: "death", text: "C" }, 20)).toBe(true);
    expect(pushBark(scene, { actorId: "e4", trigger: "death", text: "D" }, 25)).toBe(true);
    expect(pushBark(scene, { actorId: "e5", trigger: "death", text: "E" }, 30)).toBe(true);
    expect(scene.barks.map((b) => b.actorId).sort()).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  it("respects the module mute flag", () => {
    const scene = makeScene();
    setBarksEnabled(false);
    try {
      expect(pushBark(scene, { actorId: "c0", trigger: "death", text: "Nope" }, 0)).toBe(false);
      expect(scene.barks).toHaveLength(0);
    } finally {
      setBarksEnabled(true);
    }
    expect(getBarksEnabled()).toBe(true);
  });

  it("schedules a bark for an actor with no dedicated preceding event (e.g. an ability's Martyr-redirect target) after the cast's impact, not before", () => {
    // Shape produced by an enemy ability heavy-hitting c0 with the damage
    // redirected to c1 (Martyr): one "cast" event carrying the damage, then
    // two heavyHit barks riding off it with no event of their own.
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "cast", actorId: "rat-0", spellId: "iron-fist", targetId: "c0", damage: 10 },
      { type: "bark", actorId: "c0", trigger: "heavyHit", text: "Gyaaah!" },
      { type: "bark", actorId: "c1", trigger: "heavyHit", text: "Nnngh!" },
    ];
    const t0 = 0;
    playTurn(scene, events, spellName, t0, W, H);

    // Well before the cast's impact (~715ms): neither bark has landed yet.
    updateScene(scene, t0 + 100);
    expect(scene.barks).toHaveLength(0);

    // Past the cast's full hold (~1100ms) plus the 180ms heavyHit delay:
    // both barks — including the one with no dedicated event — have landed.
    updateScene(scene, t0 + 1400);
    expect(scene.barks.map((b) => b.actorId).sort()).toEqual(["c0", "c1"]);
  });

  it("rejects pathologically long text via the char-based width guard", () => {
    const scene = makeScene();
    const longText = "x".repeat(40); // well past the §3.2 340px safety clamp
    expect(pushBark(scene, { actorId: "c0", trigger: "death", text: longText }, 0)).toBe(false);
    expect(scene.barks).toHaveLength(0);
  });

  it("skipPlaybackToEnd clears scene.barks and the priority window immediately", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "defeated", targetId: "rat-0", wasEnemy: true },
      { type: "bark", actorId: "rat-0", trigger: "death", text: "The crying stops." },
    ];
    const t0 = 0;
    playTurn(scene, events, spellName, t0, W, H);
    skipPlaybackToEnd(scene, t0 + 20);
    expect(scene.barks).toHaveLength(0);
    expect(scene.barkWindow).toHaveLength(0);
  });

  it("extends choreography duration to cover a trailing death bark", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "defeated", targetId: "rat-0", wasEnemy: true },
      { type: "bark", actorId: "rat-0", trigger: "death", text: "The crying stops." },
    ];
    const t0 = 0;
    const duration = playTurn(scene, events, spellName, t0, W, H);
    // Pre-fix this was ~t+260 (~1310ms here); a trailing death bark must
    // now hold the choreography open for most of its own ~1900ms lifetime.
    expect(duration).toBeGreaterThan(2000);
  });

  it("holds an enemy corpse's fade window when a death bark is attached, vs. a bare death", () => {
    const withBark = makeScene();
    playTurn(
      withBark,
      [
        { type: "defeated", targetId: "rat-0", wasEnemy: true },
        { type: "bark", actorId: "rat-0", trigger: "death", text: "The crying stops." },
      ],
      spellName,
      0,
      W,
      H
    );
    updateScene(withBark, 10);
    const withBarkFade = withBark.enemyAnims.get("rat-0")?.fadeOutStart ?? 0;

    const withoutBark = makeScene();
    playTurn(
      withoutBark,
      [{ type: "defeated", targetId: "rat-0", wasEnemy: true }],
      spellName,
      0,
      W,
      H
    );
    updateScene(withoutBark, 10);
    const withoutBarkFade = withoutBark.enemyAnims.get("rat-0")?.fadeOutStart ?? 0;

    expect(withBarkFade - withoutBarkFade).toBe(BARK_DURATION_BASE);
  });

  it("keeps two AoE-killed enemies' death animations synchronized when the first has a death bark", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "defeated", targetId: "rat-0", wasEnemy: true },
      { type: "bark", actorId: "rat-0", trigger: "death", text: "The crying stops." },
      { type: "defeated", targetId: "rat-1", wasEnemy: true },
    ];
    playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 10);
    // Without skipping the interposed bark event when scanning for the next
    // "defeated", rat-1's death would stagger ~1s behind rat-0's instead of
    // firing together (the AoE-kill grouping this comment already covers).
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("death");
    expect(scene.enemyAnims.get("rat-1")?.state).toBe("death");
  });
});

describe("bark ledger survives a scene-level drop (spec §5.1)", () => {
  it("keeps barkSaid true even when the engine-level window drops the push", () => {
    resetBarkRngForCombat(1);
    setBarkRngForTests(() => 0);
    const party = [createCharacterRecord("m1", "Dell", "Human", "Neutral", "Mage", 0)];
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);

    const text = pickBark(state, {
      trigger: "heavyHit",
      actorId: "m1",
      classId: "Mage",
      isParty: true,
    });
    expect(text).toMatch(/Gyaaah|Nnngh/);
    expect(state.barkSaid.m1?.heavyHit).toBe(true);

    // Fill the scene's ~100ms global window so this push gets dropped.
    const scene = makeScene();
    pushBark(scene, { actorId: "e1", trigger: "heavyHit", text: "A" }, 0);
    pushBark(scene, { actorId: "e2", trigger: "heavyHit", text: "B" }, 10);
    const pushed = pushBark(scene, { actorId: "m1", trigger: "heavyHit", text: text! }, 20);
    expect(pushed).toBe(false);

    // Locked behavior: the ledger entry stays burned even though the scene
    // dropped the line — "accept the loss" (spec §5.1).
    expect(state.barkSaid.m1?.heavyHit).toBe(true);
  });
});

describe("paintOrderFootY (canvas z-order tracks live move offset)", () => {
  it("returns the static footY unchanged when there is no offset", () => {
    expect(paintOrderFootY(300, undefined, 0)).toBe(300);
  });

  it("adds the actor's current move offset, not just its home slot", () => {
    const scene = makeScene();
    const anim = getAnim(scene, "enemy", "rat-0", 0);
    // Simulate a leap: parked 40px "nearer" than home for the next 200ms.
    anim.moveFromX = 0;
    anim.moveFromY = 0;
    anim.moveToX = 0;
    anim.moveToY = 40;
    anim.moveStart = 0;
    anim.moveDuration = 200;
    expect(paintOrderFootY(300, anim, 0)).toBe(300);
    expect(paintOrderFootY(300, anim, 200)).toBe(340);
  });

  it("regression: Orc Pack Leap's mid-flight footY used to sort behind the target it just flew past (canvas backend only — Phaser's setDepth already included the offset)", () => {
    const seqRng = (values: number[]) => {
      let i = 0;
      return () => values[i++ % values.length];
    };
    const party = [
      createCharacterRecord("c0", "Aria", "Human", "Neutral", "Fighter", 0),
      createCharacterRecord("c1", "Bram", "Human", "Neutral", "Mage", 1),
    ];
    const orcDef = ENEMIES_BY_ID["orc"];
    const enemies: EnemyInstance[] = [
      { ...orcDef, abilityIds: ["pack-leap"], instanceId: "orc-0", currentHp: orcDef.hp, row: "front", status: [] },
      { ...orcDef, instanceId: "orc-1", currentHp: orcDef.hp, row: "front", status: [] },
    ];
    let state = createCombatState(party, { front: enemies, back: [] }, false);
    const before = state.events.length;
    state = resolveEnemyTurn(state, "orc-0", seqRng([0.1]));
    const events = (state.events.slice(before) as CombatEvent[]).filter((e) => e !== null);

    const scene = createScene(state);
    playTurn(scene, events, (id) => id, 0, W, H);

    const orcHome = enemyPos(0, "front", W, H, scene.backdropId).footY;
    const targetHome = partyPos(0, W, H, scene.backdropId).footY;

    // Peak of the leap-out arc (~660ms): the attacker's home slot sorts
    // ahead of the target's (static footY says "paint the target first,
    // attacker on top"), but its true on-screen position at this instant —
    // airborne, well off its home row — sorts the other way. The OLD
    // static-only sort key ignored that and drew the attacker on top for
    // the ENTIRE ~320ms leap-out arc regardless of where it actually was.
    // The live offset must flip the order here to match what the Phaser
    // backend already draws via sprite.setDepth on the offset position.
    // (Ticks in 20ms increments rather than jumping straight to 660: a cold
    // jump would fire every ChoreoStep due by 660 in one batch, each using
    // now=660 as its OWN tween start — collapsing the read to that step's
    // FROM value instead of its true mid-tween position at 660.)
    for (let t = 0; t <= 660; t += 20) updateScene(scene, t);
    const orcAnim = scene.enemyAnims.get("orc-0")!;
    const staticOrder = Math.sign(orcHome - targetHome);
    const liveOrder = Math.sign(paintOrderFootY(orcHome, orcAnim, 660) - targetHome);
    expect(staticOrder).toBeGreaterThan(0); // static: attacker's home slot paints last (on top)
    expect(liveOrder).toBeLessThan(0); // live: attacker's true position paints first (underneath) instead
  });
});
