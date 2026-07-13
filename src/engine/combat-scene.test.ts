/**
 * Tests for the FF6 combat scene choreography engine (pure parts: playTurn
 * step scheduling, updateScene step firing, popups, death absorption).
 * Canvas drawing is exercised visually, not here.
 */
import { describe, it, expect } from "vitest";
import {
  createScene,
  playTurn,
  updateScene,
  isPlaybackDone,
  absorbDeaths,
  findActor,
  partyPos,
  enemyPos,
} from "./combat-scene";
import { createCombatState, type CombatEvent, type EnemyInstance } from "../game/combat";
import { createCharacter } from "../game/party";
import type { EnemyDef } from "../data/enemies";

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
    createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
    createCharacter("c1", "Bob", "Human", "Neutral", "Mage", 1),
  ];
  const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false);
  return createScene(state);
}

const spellName = (id: string) => `Spell:${id}`;

describe("playTurn choreography", () => {
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

    // At impact: popup with the damage number, target hurt.
    updateScene(scene, t0 + 1000); // past IMPACT_AT (~958)
    expect(scene.popups.some((p) => p.text === "7")).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state).toBe("hurt");

    // After full duration: playback done, attacker back to idle.
    updateScene(scene, t0 + duration + 50);
    expect(isPlaybackDone(scene, t0 + duration + 50)).toBe(true);
    expect(scene.partyAnims.get("c0")?.state).toBe("idle");
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

    updateScene(scene, t0 + 500); // past cast impact (~390)
    expect(scene.effects.some((e) => e.type === "burst")).toBe(true);
    expect(scene.popups.some((p) => p.text === "5")).toBe(true);
  });

  it("miss pops MISS without a hurt animation", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "miss", actorId: "c0", targetId: "rat-0", reason: "evade" },
    ];
    playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 1000); // past IMPACT_AT (~958)
    expect(scene.popups.some((p) => p.text === "MISS")).toBe(true);
    expect(scene.enemyAnims.get("rat-0")?.state ?? "idle").not.toBe("hurt");
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

describe("actor positioning", () => {
  it("party is on the right, enemies on the left", () => {
    expect(partyPos(0, W, H).x).toBeGreaterThan(W / 2);
    expect(enemyPos(0, "front", W, H).x).toBeLessThan(W / 2);
    expect(enemyPos(0, "back", W, H).x).toBeLessThan(enemyPos(0, "front", W, H).x);
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
});
