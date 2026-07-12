/**
 * Unit tests for the melee technique system: rage generation, technique
 * resolution, and the technique data definitions.
 */
import { describe, it, expect } from "vitest";
import {
  beginRound,
  resolvePlayerTurn,
  resolveEnemyTurn,
  endRound,
  createCombatState,
  type CombatState,
  type EnemyInstance,
  type Rng,
  type TurnQueueEntry,
} from "./combat";
import { createCharacter, type CharacterClass } from "./party";
import type { EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";
import {
  ALL_TECHNIQUES,
  techniquesForClass,
  techniqueById,
  classHasTechniques,
  maxRageForLevel,
} from "../data/techniques";

// --- Fixtures ---------------------------------------------------------------

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

function makeEnemyDef(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: "test-dummy",
    name: "Dummy",
    hp: 100,
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
}

function makeEnemy(
  instanceId: string,
  overrides: Partial<EnemyDef> = {}
): EnemyInstance {
  const def = makeEnemyDef(overrides);
  return {
    ...def,
    instanceId,
    currentHp: def.hp,
    row: "front",
    status: [],
  };
}

function makeParty(classes: CharacterClass[]) {
  return classes.map((cls, i) =>
    createCharacter(`char-${i}`, `Char${i}`, "Human", "Neutral", cls, i)
  );
}

function makeState(
  enemies: EnemyInstance[] = [makeEnemy("e0")],
  classes: CharacterClass[] = ["Fighter", "Mage"]
): CombatState {
  return createCombatState(
    makeParty(classes),
    { front: enemies, back: [] },
    false,
    SPELLS_BY_ID
  );
}

// --- Technique data tests ---------------------------------------------------

describe("technique data", () => {
  it("defines exactly 30 techniques (6 per class × 5 classes)", () => {
    expect(ALL_TECHNIQUES).toHaveLength(30);
  });

  it("each class gets 6 techniques at levels 1/3/5/7/10/12", () => {
    const classes: CharacterClass[] = ["Fighter", "Thief", "Halberdier", "Duelist", "Crusader"];
    for (const cls of classes) {
      const techs = techniquesForClass(cls, 12);
      expect(techs).toHaveLength(6);
      expect(techs.map((t) => t.level)).toEqual([1, 3, 5, 7, 10, 12]);
    }
  });

  it("techniquesForClass filters by level", () => {
    const techs = techniquesForClass("Fighter", 5);
    expect(techs).toHaveLength(3);
    expect(techs.every((t) => t.level <= 5)).toBe(true);
  });

  it("classHasTechniques returns true for melee classes only", () => {
    expect(classHasTechniques("Fighter")).toBe(true);
    expect(classHasTechniques("Thief")).toBe(true);
    expect(classHasTechniques("Halberdier")).toBe(true);
    expect(classHasTechniques("Duelist")).toBe(true);
    expect(classHasTechniques("Crusader")).toBe(true);
    expect(classHasTechniques("Mage")).toBe(false);
    expect(classHasTechniques("Priest")).toBe(false);
  });

  it("maxRageForLevel scales with level", () => {
    expect(maxRageForLevel(1)).toBeGreaterThan(0);
    expect(maxRageForLevel(10)).toBeGreaterThan(maxRageForLevel(1));
  });

  it("techniqueById finds techniques by id", () => {
    const tech = techniqueById("fighter-power-attack");
    expect(tech).toBeDefined();
    expect(tech?.name).toBe("Power Attack");
  });

  it("every technique has a unique id", () => {
    const ids = ALL_TECHNIQUES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// --- Rage system tests ------------------------------------------------------

describe("rage system", () => {
  it("initializes rage to 0 for all party members", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    expect(state.rage["char-0"]).toBe(0);
    expect(state.rage["char-1"]).toBe(0);
  });

  it("gains rage on attack (+2)", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "attack",
      actorId: "char-0",
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(s2.rage["char-0"]).toBe(2); // +2 for attacking
  });

  it("does not gain rage for Mage (non-technique class)", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "attack",
      actorId: "char-1", // Mage
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(s2.rage["char-1"]).toBe(0); // Mage doesn't gain rage
  });

  it("defend resets rage to 0", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    state.rage["char-0"] = 5;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "defend",
      actorId: "char-0",
    }, seqRng([0.5]));
    expect(s2.rage["char-0"]).toBe(0);
  });
});

// --- Technique resolution tests ---------------------------------------------

describe("resolveTechnique", () => {
  it("Power Attack deals damage and costs rage", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, ac: 0 })], ["Fighter", "Mage"]);
    state.rage["char-0"] = 10;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-power-attack",
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    // Enemy should have taken damage
    const enemy = s2.enemies.front.find((e) => e.instanceId === "e0");
    expect(enemy!.currentHp).toBeLessThan(100);
    // Rage should have been spent (cost is 5) + 1 gained for acting
    expect(s2.rage["char-0"]).toBe(6); // 10 - 5 + 1
  });

  it("rejects technique if not enough rage", () => {
    const state = makeState([makeEnemy("e0", { hp: 100 })], ["Fighter", "Mage"]);
    state.rage["char-0"] = 0;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-power-attack",
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    // Enemy should not have taken damage (technique failed)
    const enemy = s2.enemies.front.find((e) => e.instanceId === "e0");
    expect(enemy!.currentHp).toBe(100);
  });

  it("Taunt sets tauntingIds and tauntBuffs", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, attack: 10, agi: 99 })], ["Fighter", "Mage"]);
    state.rage["char-0"] = 10;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-taunt",
    }, seqRng([0.5]));
    expect(s2.tauntingIds).toContain("char-0");
    expect(s2.tauntBuffs["char-0"]).toBeDefined();
  });

  it("Brace (Halberdier) sets counterStances", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, agi: 5 })], ["Halberdier", "Mage"]);
    state.rage["char-0"] = 10;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "halberdier-brace",
    }, seqRng([0.5]));
    expect(s2.counterStances["char-0"]).toBeDefined();
  });

  it("Lay on Hands heals an ally", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, agi: 5 })], ["Crusader", "Fighter"]);
    state.rage["char-0"] = 10;
    // Hurt the Fighter
    state.party[1].hp = 5;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "crusader-lay-on-hands",
      targetAllyId: "char-1",
    }, seqRng([0.5]));
    // Fighter should have been healed
    expect(s2.party[1].hp).toBeGreaterThan(5);
  });

  it("Battle Cry grants rage to all technique-class allies", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, agi: 5 })], ["Fighter", "Thief"]);
    state.rage["char-0"] = 25; // Battle Cry costs 25 rage
    state.rage["char-1"] = 0;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-battle-cry",
    }, seqRng([0.5]));
    // Thief (char-1) should have gained rage from Battle Cry (+3)
    expect(s2.rage["char-1"]).toBeGreaterThanOrEqual(3);
  });

  it("counter stance triggers and is consumed on enemy attack", () => {
    // Set up: Halberdier with Brace, enemy attacks and triggers counter.
    // Kill the Mage so the enemy must target the Halberdier.
    const state = makeState([makeEnemy("e0", { hp: 100, attack: 10, agi: 99 })], ["Halberdier", "Mage"]);
    state.rage["char-0"] = 10;
    state.party[1].hp = 0; // Mage is dead, enemy must target Halberdier
    const { state: s, queue } = beginRound(state, seqRng([0.5]));
    // Halberdier uses Brace
    const s2 = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "halberdier-brace",
    }, seqRng([0.5]));
    expect(s2.counterStances["char-0"]).toBeDefined();
    // Now enemy attacks — counter should trigger
    const enemyEntry = queue.find((q) => q.kind === "enemy");
    if (enemyEntry) {
      // Use rng that ensures enemy hits (0.99 = no evade, high damage variance)
      const s3 = resolveEnemyTurn(s2, enemyEntry.id, seqRng([0.99, 0.5, 0.5, 0.5, 0.5, 0.5]));
      // Counter stance should be consumed
      expect(s3.counterStances["char-0"]).toBeUndefined();
      // Enemy should have taken counter damage
      const enemy = s3.enemies.front.find((e) => e.instanceId === "e0");
      expect(enemy!.currentHp).toBeLessThan(100);
    }
  });
});
