import { describe, it, expect } from "vitest";
import {
  triggerAnimationsForMessage,
  setAnim,
  type CombatScene,
} from "./combat-renderer";
import {
  createCombatState,
  type EnemyInstance,
  type EnemyFormation,
} from "../game/combat";
import { createDefaultParty } from "../game/party";
import { ALL_SPELLS } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import type { EnemyDef } from "../data/enemies";

// --- Test helpers -----------------------------------------------------------

function makeEnemy(
  id: string,
  name: string,
  hp: number,
  opts: Partial<EnemyDef> = {}
): EnemyInstance {
  return {
    id,
    name,
    floors: [1],
    rowPreference: "front",
    hp,
    attack: 10,
    ac: 2,
    agi: 10,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: hp,
    row: "front",
    status: [],
    ...opts,
  };
}

function makeScene(
  enemies: EnemyInstance[] = []
): { scene: CombatScene; party: ReturnType<typeof createDefaultParty> } {
  const party = createDefaultParty();
  const spells: Record<string, typeof ALL_SPELLS[number]> = {};
  for (const s of ALL_SPELLS) spells[s.id] = s;
  const items: Record<string, typeof ALL_ITEMS[number]> = {};
  for (const it of ALL_ITEMS) items[it.id] = it;
  const formation: EnemyFormation = {
    front: enemies.filter((e) => e.row === "front"),
    back: enemies.filter((e) => e.row === "back"),
  };
  const state = createCombatState(party, formation, false, spells, items);
  const scene: CombatScene = {
    state,
    phase: "messageReveal",
    currentActorIndex: 0,
    flash: null,
    prompt: "",
    selectionList: null,
    partyAnims: new Map(),
    enemyAnims: new Map(),
    enemyGraveyard: [],
    effects: [],
    messageQueue: [],
    currentMessage: null,
    messageStart: 0,
    messageAdvanceDelay: 1600,
  };
  return { scene, party };
}

const NOW = 1000;
const W = 768;
const H = 672;

// --- Tests ------------------------------------------------------------------

describe("triggerAnimationsForMessage", () => {
  it("triggers attack animation on melee attack message", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const msg = `${party[0].name} attacks Rat for 5 damage.`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.partyAnims.get(party[0].id);
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("attacking");
  });

  it("triggers hit animation on enemy target", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const msg = `${party[0].name} attacks Rat for 5 damage.`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.enemyAnims.get("e1");
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("hit");
  });

  it("triggers slash effect on attack", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const msg = `${party[0].name} attacks Rat for 5 damage.`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    expect(scene.effects.length).toBeGreaterThan(0);
    expect(scene.effects[0].type).toBe("slash");
  });

  it("triggers spellBurst for spell damage", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const msg = `${party[0].name} casts Fireball at Rat for 8 damage.`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.enemyAnims.get("e1");
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("hit");
    expect(scene.effects.some((e) => e.type === "spellBurst")).toBe(true);
  });

  it("triggers healBurst for healing spell", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const targetName = party[1].name;
    const msg = `${party[0].name} casts Heal, healing ${targetName} for 10 HP.`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    expect(scene.effects.some((e) => e.type === "healBurst")).toBe(true);
  });

  it("triggers defeated animation on enemy death", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene } = makeScene([enemy]);
    // Put the enemy in the graveyard (as resolveRound would do).
    scene.enemyGraveyard.push(enemy);
    setAnim(scene.enemyAnims, "e1", "defeated", NOW);
    const msg = "Rat is destroyed.";
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.enemyAnims.get("e1");
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("defeated");
  });

  it("triggers defeated animation on party knockout", () => {
    const { scene, party } = makeScene([]);
    const msg = `${party[0].name} is knocked out!`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.partyAnims.get(party[0].id);
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("defeated");
  });

  it("resets to idle on revive", () => {
    const { scene, party } = makeScene([]);
    // Set defeated first.
    setAnim(scene.partyAnims, party[0].id, "defeated", NOW);
    const msg = `${party[0].name} is revived!`;
    triggerAnimationsForMessage(scene, msg, NOW + 500, W, H);
    const anim = scene.partyAnims.get(party[0].id);
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("idle");
  });

  it("triggers spellBurst for group spell effect (spell name as actor)", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene } = makeScene([enemy]);
    // "Fireball hits Rat for 8 damage." — spell name is first, not a combatant.
    const msg = "Fireball hits Rat for 8 damage.";
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    const anim = scene.enemyAnims.get("e1");
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("hit");
    expect(scene.effects.some((e) => e.type === "spellBurst")).toBe(true);
  });

  it("triggers flash for poison infliction", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene } = makeScene([enemy]);
    const msg = "Rat is poisoned!";
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    expect(scene.effects.length).toBeGreaterThan(0);
  });

  it("triggers flash for evade", () => {
    const enemy = makeEnemy("e1", "Rat", 10);
    const { scene, party } = makeScene([enemy]);
    const msg = `Rat evades ${party[0].name}'s attack!`;
    triggerAnimationsForMessage(scene, msg, NOW, W, H);
    expect(scene.effects.length).toBeGreaterThan(0);
  });

  it("handles unknown messages without crashing", () => {
    const { scene } = makeScene([]);
    const msg = "Some completely unknown message format.";
    expect(() => triggerAnimationsForMessage(scene, msg, NOW, W, H)).not.toThrow();
  });

  it("handles duplicate enemy names (C2 fix)", () => {
    const rat1 = makeEnemy("e1", "Rat", 10);
    const rat2 = makeEnemy("e2", "Rat", 10);
    const { scene, party } = makeScene([rat1, rat2]);
    // First attack should animate rat1 (first idle match).
    const msg1 = `${party[0].name} attacks Rat for 5 damage.`;
    triggerAnimationsForMessage(scene, msg1, NOW, W, H);
    const anim1 = scene.enemyAnims.get("e1");
    expect(anim1).toBeDefined();
    expect(anim1!.state).toBe("hit");
    // rat2 should not be animated yet.
    const anim2 = scene.enemyAnims.get("e2");
    expect(anim2).toBeUndefined();
  });
});

describe("setAnim", () => {
  it("creates a new animation entry if none exists", () => {
    const anims = new Map<string, { state: string; stateStart: number; progress: number; opacity: number }>();
    setAnim(anims, "test", "attacking", 1000);
    const anim = anims.get("test");
    expect(anim).toBeDefined();
    expect(anim!.state).toBe("attacking");
    expect(anim!.stateStart).toBe(1000);
    expect(anim!.progress).toBe(0);
    expect(anim!.opacity).toBe(1);
  });

  it("updates an existing animation entry", () => {
    const anims = new Map<string, { state: string; stateStart: number; progress: number; opacity: number }>();
    setAnim(anims, "test", "attacking", 1000);
    setAnim(anims, "test", "hit", 2000);
    const anim = anims.get("test");
    expect(anim!.state).toBe("hit");
    expect(anim!.stateStart).toBe(2000);
  });
});
