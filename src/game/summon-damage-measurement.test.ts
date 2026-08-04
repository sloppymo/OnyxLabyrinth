/**
 * Summon damage contract: verifies summons produce useful (but not dominant)
 * damage after the rebalance. Summons should deal enough per-turn damage to
 * break even with a direct damage spell after ~2 turns, justifying their
 * higher SP cost and the caster's turn investment.
 *
 * Fix: summon attack raised from power*3 to power*4, and summon damage
 * now uses half-AC reduction (floor(ac/2)) like spells, instead of full AC.
 */
import { describe, it, expect } from "vitest";
import {
  beginRound,
  resolvePlayerTurn,
  resolveAllyTurn,
  createCombatState,
} from "./combat";
import type { CombatState, EnemyInstance, Rng } from "./combat-types";
import { createCharacter } from "./party";
import type { EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeEnemy(instanceId: string, ac: number, hp: number): EnemyInstance {
  const def: EnemyDef = {
    id: "test-dummy",
    name: "Dummy",
    hp,
    attack: 4,
    ac,
    agi: 5,
    xp: 3,
    gold: 2,
    floors: [1],
    rowPreference: "front",
    special: [],
    isBoss: false,
  };
  return { ...def, instanceId, currentHp: hp, row: "front", status: [] };
}

function makeMageState(level: number, int: number, enemies: EnemyInstance[]): CombatState {
  const mage = createCharacter("char-0", "Mage", "Human", "Neutral", "Mage", 0);
  mage.level = level;
  mage.stats.int = int;
  mage.maxSp = int * 2;
  mage.sp = int * 2;
  mage.maxHp = 30;
  mage.hp = 30;
  mage.knownSpellIds = ["mage-burning-hands", "mage-lesser-summon", "mage-summon-fire-elemental", "mage-fireball"];
  const fighter = createCharacter("char-1", "Fighter", "Human", "Neutral", "Fighter", 1);
  return createCombatState([mage, fighter], { front: enemies, back: [] }, false, SPELLS_BY_ID);
}

function summonDamageOverTurns(state: CombatState, allyId: string, turns: number): number {
  let total = 0;
  let cur = state;
  for (let i = 0; i < turns; i++) {
    const before = cur.enemies.front[0].currentHp;
    cur = resolveAllyTurn(cur, allyId, seqRng([0.5])); // variance = 1.0
    total += before - cur.enemies.front[0].currentHp;
  }
  return total;
}

describe("summon damage contract (rebalanced)", () => {
  it("Fire Elemental (tier 3, SP 14) breaks even with Fireball (SP 10) within 2 turns", () => {
    const ac = 5;
    const enemy = makeEnemy("e0", ac, 500);

    // Fireball one-shot
    const spellState = makeMageState(5, 15, [enemy]);
    const { state: sSpell } = beginRound(spellState, seqRng([0.5]));
    const sAfterSpell = resolvePlayerTurn(sSpell, {
      kind: "cast", actorId: "char-0", spellId: "mage-fireball", targetInstanceId: "e0",
    }, seqRng([0.5]));
    const spellDamage = 500 - sAfterSpell.enemies.front[0].currentHp;

    // Fire Elemental summon
    const summonState = makeMageState(5, 15, [enemy]);
    const { state: sSummon } = beginRound(summonState, seqRng([0.5]));
    const sAfterSummon = resolvePlayerTurn(sSummon, {
      kind: "cast", actorId: "char-0", spellId: "mage-summon-fire-elemental",
    }, seqRng([0.5]));
    const ally = sAfterSummon.summonedAllies[0];
    const perTurn = summonDamageOverTurns(sAfterSummon, ally.id, 1);
    const twoTurnTotal = summonDamageOverTurns(sAfterSummon, ally.id, 2);

    console.log(`  Fireball: ${spellDamage} one-shot`);
    console.log(`  Fire Elemental: ${perTurn}/turn, ${twoTurnTotal} over 2 turns`);

    // Per-turn damage should be at least 60% of spell damage (useful per turn)
    expect(perTurn).toBeGreaterThanOrEqual(Math.floor(spellDamage * 0.6));
    // Over 2 turns, summon should exceed single spell cast (pays off the investment)
    expect(twoTurnTotal).toBeGreaterThan(spellDamage);
  });

  it("Lesser Summon (tier 2, SP 6) breaks even with Burning Hands (SP 6) within 2 turns", () => {
    const ac = 3;
    const enemy = makeEnemy("e0", ac, 500);

    const spellState = makeMageState(3, 13, [enemy]);
    const { state: sSpell } = beginRound(spellState, seqRng([0.5]));
    const sAfterSpell = resolvePlayerTurn(sSpell, {
      kind: "cast", actorId: "char-0", spellId: "mage-burning-hands", targetInstanceId: "e0",
    }, seqRng([0.5]));
    const spellDamage = 500 - sAfterSpell.enemies.front[0].currentHp;

    const summonState = makeMageState(3, 13, [enemy]);
    const { state: sSummon } = beginRound(summonState, seqRng([0.5]));
    const sAfterSummon = resolvePlayerTurn(sSummon, {
      kind: "cast", actorId: "char-0", spellId: "mage-lesser-summon",
    }, seqRng([0.5]));
    const ally = sAfterSummon.summonedAllies[0];
    const perTurn = summonDamageOverTurns(sAfterSummon, ally.id, 1);
    const twoTurnTotal = summonDamageOverTurns(sAfterSummon, ally.id, 2);

    console.log(`  Burning Hands: ${spellDamage} one-shot`);
    console.log(`  Lesser Summon: ${perTurn}/turn, ${twoTurnTotal} over 2 turns`);

    expect(perTurn).toBeGreaterThanOrEqual(Math.floor(spellDamage * 0.5));
    expect(twoTurnTotal).toBeGreaterThanOrEqual(spellDamage);
  });

  it("summon attack scales as power * 4", () => {
    const enemy = makeEnemy("e0", 0, 500);
    const state = makeMageState(5, 15, [enemy]);
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "cast", actorId: "char-0", spellId: "mage-summon-fire-elemental",
    }, seqRng([0.5]));
    const ally = sAfter.summonedAllies[0];
    expect(ally.attack).toBe(16); // power 4 * 4 = 16
  });

  it("summon damage uses half-AC reduction (like spells, not full AC)", () => {
    const ac = 10;
    const enemy = makeEnemy("e0", ac, 500);
    const state = makeMageState(5, 15, [enemy]);
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "cast", actorId: "char-0", spellId: "mage-summon-fire-elemental",
    }, seqRng([0.5]));
    const ally = sAfter.summonedAllies[0];
    // attack 16, variance 1.0 → raw 16, half-AC = floor(10/2) = 5 → damage 11
    // With full AC it would be 16 - 10 = 6.
    const sAfterAlly = resolveAllyTurn(sAfter, ally.id, seqRng([0.5]));
    const damage = 500 - sAfterAlly.enemies.front[0].currentHp;
    expect(damage).toBe(11); // 16 - floor(10/2) = 16 - 5 = 11
  });
});
