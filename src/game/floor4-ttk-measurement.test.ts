/**
 * Floor 4 time-to-kill contract: verifies the Choir Warden (the tankiest
 * Floor 4 exclusive) is killable in a reasonable number of rounds after
 * the fix (HP 105→75, removed resistPhysical 25%).
 *
 * The fix targets only the Choir Warden — a Floor 4 exclusive — so no
 * other floor's balance is affected. The enemy retains highDefense + AC 20
 * as its defensive identity, just without the triple-stack that made it
 * nearly unkillable by physical damage.
 */
import { describe, it, expect } from "vitest";
import {
  beginRound,
  resolvePlayerTurn,
  resolveEnemyTurn,
  endRound,
  createCombatState,
} from "./combat";
import type { CombatState, EnemyInstance, Rng } from "./combat-types";
import { createCharacter } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ENEMIES_BY_ID } from "../data/enemies";
import { effectiveStats } from "./effective-stats";
import { effectiveEnemyAc } from "./combat-shared";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeEnemyFromDef(enemyId: string, instanceId: string, row: "front" | "back"): EnemyInstance {
  const def = ENEMIES_BY_ID[enemyId];
  if (!def) throw new Error(`Unknown enemy: ${enemyId}`);
  return { ...def, instanceId, currentHp: def.hp, row, status: [] };
}

function makeLevel7Party(): CombatState["party"] {
  const fighter = createCharacter("char-0", "Aria", "Human", "Neutral", "Fighter", 0);
  fighter.level = 7; fighter.stats.str = 16; fighter.stats.vit = 14; fighter.stats.agi = 10;
  fighter.maxHp = 60; fighter.hp = 60;

  const mage = createCharacter("char-1", "Coda", "Human", "Neutral", "Mage", 2);
  mage.level = 7; mage.stats.int = 16; mage.maxSp = 32; mage.sp = 32; mage.maxHp = 28; mage.hp = 28;
  mage.knownSpellIds = ["mage-fireball", "mage-burning-hands", "mage-ice-storm"];

  const priest = createCharacter("char-2", "Dell", "Human", "Neutral", "Priest", 1);
  priest.level = 7; priest.stats.pie = 15; priest.maxSp = 30; priest.sp = 30; priest.maxHp = 32; priest.hp = 32;
  priest.knownSpellIds = ["priest-smite", "priest-cure-moderate"];

  const thief = createCharacter("char-3", "Eve", "Human", "Neutral", "Thief", 3);
  thief.level = 7; thief.stats.str = 13; thief.stats.agi = 14; thief.maxHp = 40; thief.hp = 40;

  return [fighter, mage, priest, thief];
}

describe("Floor 4 time-to-kill contract (after fix)", () => {
  it("Choir Warden HP reduced from 105 to 75", () => {
    const enemy = ENEMIES_BY_ID["choir-warden"];
    expect(enemy.hp).toBe(75);
  });

  it("Choir Warden no longer has resistPhysical", () => {
    const enemy = ENEMIES_BY_ID["choir-warden"];
    expect(enemy.special.some((s) => s.kind === "resistPhysical")).toBe(false);
    expect(enemy.special.some((s) => s.kind === "highDefense")).toBe(true);
  });

  it("Choir Warden effective HP vs physical is reduced to a killable range", () => {
    const enemy = makeEnemyFromDef("choir-warden", "e0", "front");
    const state = createCombatState(makeLevel7Party(), { front: [enemy], back: [] }, false, SPELLS_BY_ID);

    const fighter = state.party[0];
    const eff = effectiveStats(fighter);
    const base = eff.str + fighter.level;
    let damage = Math.max(1, Math.round(base * 1.0));
    const ac = effectiveEnemyAc(state, enemy);
    damage = Math.max(1, damage - Math.min(ac, Math.floor(damage / 2)));
    damage = Math.max(1, Math.round(damage * 0.5)); // highDefense

    const hits = Math.ceil(enemy.hp / damage);
    const rounds = Math.ceil(hits / 2);

    console.log(`  Damage per hit: ${damage}, hits to kill: ${hits}, rounds: ${rounds}`);
    // 75 HP / 6 damage = 13 hits / 2 attackers = 7 rounds (was 11 at 105 HP)
    expect(rounds).toBeLessThan(11);
    expect(rounds).toBeLessThanOrEqual(8);
    expect(damage).toBeLessThanOrEqual(10);
  });

  it("weight-4 encounter front-row HP is reduced", () => {
    const warden = ENEMIES_BY_ID["choir-warden"];
    const armor = ENEMIES_BY_ID["animated-armor"];
    const total = warden.hp + armor.hp;
    console.log(`  Choir Warden: ${warden.hp} HP, Animated Armor: ${armor.hp} HP, total: ${total}`);
    // Was 169 (105 + 64), now 139 (75 + 64).
    expect(total).toBeLessThan(169);
    expect(total).toBeLessThanOrEqual(140);
  });
});
