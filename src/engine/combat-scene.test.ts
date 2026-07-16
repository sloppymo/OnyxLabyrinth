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
  skipPlaybackToEnd,
  findActor,
  partyPos,
  enemyPos,
  resolveEffectStyle,
  sampleProjectilePose,
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
    updateScene(scene, t0 + 1100); // past IMPACT_AT (~987)
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

    updateScene(scene, t0 + 1000); // past rise→dash impact (~920 for fire-bolt)
    expect(scene.effects.some((e) => e.type === "burst")).toBe(true);
    expect(scene.popups.some((p) => p.text === "5")).toBe(true);
  });

  it("miss pops MISS without a hurt animation", () => {
    const scene = makeScene();
    const events: CombatEvent[] = [
      { type: "miss", actorId: "c0", targetId: "rat-0", reason: "evade" },
    ];
    playTurn(scene, events, spellName, 0, W, H);
    updateScene(scene, 1100); // past IMPACT_AT (~987)
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

describe("actor positioning", () => {
  it("party is on the right, enemies on the left, and back row is deeper", () => {
    expect(partyPos(0, W, H).x).toBeGreaterThan(W / 2);
    expect(enemyPos(0, "front", W, H).x).toBeLessThan(W / 2);
    expect(enemyPos(0, "back", W, H).y).toBeLessThan(enemyPos(0, "front", W, H).y);
    expect(enemyPos(0, "back", W, H).scale).toBeLessThan(enemyPos(0, "front", W, H).scale);
    const seam = 323; // theme:f1 / arena seamY
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
        { type: "cast", actorId: "c1", spellId: "mage-fire-bolt" },
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
});
