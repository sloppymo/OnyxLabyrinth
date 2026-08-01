/**
 * Shrink + Giant Strength body-magic spells.
 */
import { describe, expect, it } from "vitest";
import { createCharacter, applyCombatPartyResult } from "./party";
import { createCombatState, resolvePlayerTurn, endRound } from "./combat";
import { resolveEnemyAction } from "./combat-enemy";
import { spellById, ALL_SPELLS } from "../data/spells";
import {
  scaleOutgoingDamage,
  physicalEvadeChance,
  statusDrawScale,
  damageReductionFor,
  plainHitDamage,
} from "./combat-shared";
import type { EnemyInstance } from "./combat-types";
import type { SpellDef } from "../data/spells";
import type { EnemyDef } from "../data/enemies";

function makeEnemy(instanceId: string, overrides: Partial<EnemyDef> = {}): EnemyInstance {
  const def: EnemyDef = {
    id: "test-rat",
    name: "Test Rat",
    hp: 40,
    attack: 20,
    ac: 2,
    agi: 5,
    xp: 3,
    gold: 2,
    rowPreference: "front",
    special: [],
    isBoss: false,
    ...overrides,
  };
  return {
    ...def,
    instanceId,
    currentHp: def.hp,
    row: "front",
    status: [],
  };
}

const SPELLS = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s])) as Record<string, SpellDef>;

describe("body-magic helpers", () => {
  it("scales outgoing damage for shrunk / giantStrength", () => {
    expect(scaleOutgoingDamage(100, { status: ["shrunk"] })).toBe(50);
    expect(scaleOutgoingDamage(100, { status: ["giantStrength"] })).toBe(150);
    expect(scaleOutgoingDamage(100, { status: [] })).toBe(100);
  });

  it("applies flat −20% evade under Giant Strength", () => {
    expect(physicalEvadeChance(0.15, { status: ["giantStrength"] })).toBe(0);
    expect(physicalEvadeChance(0.25, { status: ["giantStrength"] })).toBeCloseTo(0.05);
    expect(physicalEvadeChance(0.15, { status: [] })).toBe(0.15);
  });

  it("returns draw scales", () => {
    expect(statusDrawScale(["shrunk"])).toBe(0.5);
    expect(statusDrawScale(["giantStrength"])).toBe(1.3);
    expect(statusDrawScale([])).toBe(1);
  });
});

describe("Shrink + Giant Strength spells", () => {
  it("registers as T6 spells", () => {
    expect(spellById("mage-shrink")?.tier).toBe(6);
    expect(spellById("priest-giant-strength")?.tier).toBe(6);
  });

  it("Shrink applies shrunk for the rest of combat", () => {
    const mage = createCharacter("m0", "Mage", "Human", "Neutral", "Mage", 0);
    mage.sp = 99;
    mage.maxSp = 99;
    mage.knownSpellIds = ["mage-shrink"];
    const s = createCombatState(
      [mage],
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS
    );
    const after = resolvePlayerTurn(
      s,
      { kind: "cast", actorId: mage.id, spellId: "mage-shrink", targetInstanceId: "rat-0" },
      () => 0.5
    );
    const enemy = after.enemies.front[0]!;
    expect(enemy.status).toContain("shrunk");
    expect(scaleOutgoingDamage(20, enemy)).toBe(10);
  });

  it("Giant Strength lasts 3 rounds", () => {
    const priest = createCharacter("p0", "Priest", "Human", "Neutral", "Priest", 0);
    const fighter = createCharacter("f0", "Fighter", "Human", "Neutral", "Fighter", 1);
    priest.sp = 99;
    priest.maxSp = 99;
    priest.knownSpellIds = ["priest-giant-strength"];
    let state = createCombatState(
      [priest, fighter],
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS
    );
    state = resolvePlayerTurn(
      state,
      {
        kind: "cast",
        actorId: priest.id,
        spellId: "priest-giant-strength",
        targetAllyId: fighter.id,
      },
      () => 0.5
    );
    expect(state.party.find((c) => c.id === fighter.id)!.status).toContain("giantStrength");
    expect(state.giantStrengthTimers[fighter.id]).toBe(3);

    state = endRound(state, () => 0.5);
    expect(state.giantStrengthTimers[fighter.id]).toBe(2);
    state = endRound(state, () => 0.5);
    expect(state.giantStrengthTimers[fighter.id]).toBe(1);
    state = endRound(state, () => 0.5);
    expect(state.party.find((c) => c.id === fighter.id)!.status).not.toContain("giantStrength");
    expect(state.giantStrengthTimers[fighter.id]).toBeUndefined();
  });

  it("Giant Strength boosts outgoing and incoming damage", () => {
    const fighter = createCharacter("f0", "Fighter", "Human", "Neutral", "Fighter", 0);
    fighter.status = ["giantStrength"];
    const s = createCombatState(
      [fighter],
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS,
      {},
      { [fighter.id]: { weapon: undefined, armor: [] } }
    );
    expect(scaleOutgoingDamage(100, fighter)).toBe(150);
    expect(damageReductionFor(s, fighter, 100)).toBe(120);
  });

  it("Dispel Magic clears Shrink and Giant Strength", () => {
    const mage = createCharacter("m0", "Mage", "Human", "Neutral", "Mage", 0);
    const fighter = createCharacter("f0", "Fighter", "Human", "Neutral", "Fighter", 1);
    mage.sp = 99;
    mage.maxSp = 99;
    mage.knownSpellIds = ["mage-dispel-magic"];
    fighter.status = ["giantStrength"];
    const enemy = makeEnemy("rat-0");
    enemy.status = ["shrunk"];
    let state = createCombatState(
      [mage, fighter],
      { front: [enemy], back: [] },
      false,
      SPELLS
    );
    state.giantStrengthTimers[fighter.id] = 2;
    state = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "mage-dispel-magic" },
      () => 0.5
    );
    expect(state.enemies.front[0]!.status).not.toContain("shrunk");
    expect(state.party.find((c) => c.id === fighter.id)!.status).not.toContain("giantStrength");
    expect(state.giantStrengthTimers[fighter.id]).toBeUndefined();
  });

  it("does not carry Giant Strength into the next fight", () => {
    const priest = createCharacter("p0", "Priest", "Human", "Neutral", "Priest", 0);
    const fighter = createCharacter("f0", "Fighter", "Human", "Neutral", "Fighter", 1);
    priest.sp = 99;
    priest.maxSp = 99;
    priest.knownSpellIds = ["priest-giant-strength"];
    let fight1 = createCombatState(
      [priest, fighter],
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS
    );
    fight1 = resolvePlayerTurn(
      fight1,
      {
        kind: "cast",
        actorId: priest.id,
        spellId: "priest-giant-strength",
        targetAllyId: fighter.id,
      },
      () => 0.5
    );
    expect(fight1.party.find((c) => c.id === fighter.id)!.status).toContain(
      "giantStrength"
    );

    // endCombat boundary — timers die with CombatState; status must not walk.
    const persisted = applyCombatPartyResult(fight1.party);
    expect(persisted.find((c) => c.id === fighter.id)!.status).not.toContain(
      "giantStrength"
    );

    let fight2 = createCombatState(
      persisted,
      { front: [makeEnemy("rat-1")], back: [] },
      false,
      SPELLS
    );
    expect(fight2.giantStrengthTimers).toEqual({});
    const stillGiant = fight2.party.find((c) => c.id === fighter.id)!;
    expect(stillGiant.status).not.toContain("giantStrength");
    expect(scaleOutgoingDamage(100, stillGiant)).toBe(100);

    fight2 = endRound(fight2, () => 0.5);
    // Without the boundary clear, EOR's `?? 3` would re-arm timer=2 here.
    expect(fight2.party.find((c) => c.id === fighter.id)!.status).not.toContain(
      "giantStrength"
    );
    expect(fight2.giantStrengthTimers[fighter.id]).toBeUndefined();
  });

  it("scales Shrink when a shrunk enemy hits a summoned ally", () => {
    const mage = createCharacter("m0", "Mage", "Human", "Neutral", "Mage", 0);
    const s = createCombatState(
      [mage],
      { front: [makeEnemy("rat-0", { attack: 8, ac: 0 })], back: [] },
      false,
      SPELLS
    );
    s.summonedAllies = [
      {
        id: "sum-0",
        name: "Guardian",
        hp: 40,
        maxHp: 40,
        attack: 5,
        ac: 0,
        agi: 5,
        row: "front",
        spriteId: "summon-holy-guardian",
      },
    ];
    s.enemies.front[0]!.status = ["shrunk"];
    resolveEnemyAction(
      s,
      {
        kind: "attack",
        actor: s.enemies.front[0]!,
        target: { kind: "ally", id: "sum-0" },
      },
      () => 0.5,
      () => {},
      () => {}
    );
    // rng 0.5 → variance 1.0 → 8, then ×0.5 Shrink → 4
    expect(s.summonedAllies[0]!.hp).toBe(36);
  });

  it("scales Giant Strength through plainHitDamage (counters / riposte)", () => {
    const fighter = createCharacter("f0", "Fighter", "Human", "Neutral", "Fighter", 0);
    fighter.status = ["giantStrength"];
    const s = createCombatState(
      [fighter],
      { front: [makeEnemy("rat-0")], back: [] },
      false,
      SPELLS,
      {},
      { [fighter.id]: { weapon: undefined, armor: [] } }
    );
    const base = plainHitDamage(s, { ...fighter, status: [] }, () => 0.5);
    const giant = plainHitDamage(s, fighter, () => 0.5);
    expect(giant).toBe(scaleOutgoingDamage(base, fighter));
  });
});
