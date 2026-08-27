/**
 * Row targeting contract: proves that a close-range weapon can hit enemies
 * in either row, from any party formation slot. Row-based targeting
 * restrictions have been removed — all visible enemies are valid melee
 * targets. Enemy `row` values are kept only for sprite positioning.
 */
import { describe, it, expect } from "vitest";
import {
  beginRound,
  resolvePlayerTurn,
  createCombatState,
} from "./combat";
import type { CombatState, EnemyInstance, Rng } from "./combat-types";
import { createCharacterRecord } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ITEMS_BY_ID } from "../data/items";
import type { EnemyDef } from "../data/enemies";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));
const MACE = ITEMS_BY_ID["mace"]!; // close range

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeEnemy(instanceId: string, row: "front" | "back", hp: number): EnemyInstance {
  const def: EnemyDef = {
    id: "test-dummy",
    name: "Dummy",
    hp,
    attack: 4,
    ac: 0,
    agi: 5,
    xp: 3,
    gold: 2,
    floors: [1],
    rowPreference: row,
    special: [],
    isBoss: false,
  };
  return { ...def, instanceId, currentHp: hp, row, status: [] };
}

function makeFighter(formationSlot: number): CombatState["party"][number] {
  const fighter = createCharacterRecord("char-0", "Fighter", "Human", "Neutral", "Fighter", formationSlot);
  fighter.level = 5;
  fighter.stats.str = 14;
  fighter.maxHp = 40;
  fighter.hp = 40;
  return fighter;
}

function makeCombatWithLoadout(
  fighter: CombatState["party"][number],
  enemies: { front: EnemyInstance[]; back: EnemyInstance[] }
): CombatState {
  const priest = createCharacterRecord("char-1", "Priest", "Human", "Neutral", "Priest", 1);
  priest.level = 5; priest.stats.pie = 12; priest.maxHp = 30; priest.hp = 30; priest.maxSp = 24; priest.sp = 24;
  return createCombatState(
    [fighter, priest],
    enemies,
    false,
    SPELLS_BY_ID,
    {},
    { [fighter.id]: { weapon: MACE, armor: [] } }
  );
}

describe("row targeting contract (restrictions removed)", () => {
  it("front-row fighter with close weapon hits a front-row enemy", () => {
    const fighter = makeFighter(0); // front row
    const enemy = makeEnemy("e0", "front", 200);
    const state = makeCombatWithLoadout(fighter, { front: [enemy], back: [] });
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(sAfter.enemies.front[0].currentHp).toBeLessThan(200);
  });

  it("front-row fighter with close weapon hits a back-row enemy", () => {
    const fighter = makeFighter(0); // front row
    const frontEnemy = makeEnemy("e0", "front", 200);
    const backEnemy = makeEnemy("e1", "back", 200);
    const state = makeCombatWithLoadout(fighter, { front: [frontEnemy], back: [backEnemy] });
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e1",
    }, seqRng([0.5]));
    expect(sAfter.enemies.back[0].currentHp).toBeLessThan(200);
    // Front enemy untouched
    expect(sAfter.enemies.front[0].currentHp).toBe(200);
  });

  it("back-row fighter with close weapon hits a front-row enemy", () => {
    const fighter = makeFighter(2); // back row
    const enemy = makeEnemy("e0", "front", 200);
    const state = makeCombatWithLoadout(fighter, { front: [enemy], back: [] });
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(sAfter.enemies.front[0].currentHp).toBeLessThan(200);
  });

  it("back-row fighter with close weapon hits a back-row enemy", () => {
    const fighter = makeFighter(2); // back row
    const frontEnemy = makeEnemy("e0", "front", 200);
    const backEnemy = makeEnemy("e1", "back", 200);
    const state = makeCombatWithLoadout(fighter, { front: [frontEnemy], back: [backEnemy] });
    const { state: s } = beginRound(state, seqRng([0.5]));
    const sAfter = resolvePlayerTurn(s, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e1",
    }, seqRng([0.5]));
    expect(sAfter.enemies.back[0].currentHp).toBeLessThan(200);
    expect(sAfter.enemies.front[0].currentHp).toBe(200);
  });

  it("back-row fighter deals full damage (no 0.4x penalty)", () => {
    const frontFighter = makeFighter(0);
    const backFighter = makeFighter(2);
    const enemy1 = makeEnemy("e0", "front", 200);
    const enemy2 = makeEnemy("e0", "front", 200);

    const state1 = makeCombatWithLoadout(frontFighter, { front: [enemy1], back: [] });
    const { state: s1 } = beginRound(state1, seqRng([0.5]));
    const sAfter1 = resolvePlayerTurn(s1, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e0",
    }, seqRng([0.5]));
    const frontDamage = 200 - sAfter1.enemies.front[0].currentHp;

    const state2 = makeCombatWithLoadout(backFighter, { front: [enemy2], back: [] });
    const { state: s2 } = beginRound(state2, seqRng([0.5]));
    const sAfter2 = resolvePlayerTurn(s2, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e0",
    }, seqRng([0.5]));
    const backDamage = 200 - sAfter2.enemies.front[0].currentHp;

    console.log(`  Front-row damage: ${frontDamage}, back-row damage: ${backDamage}`);
    // No 0.4x penalty: back-row damage should equal front-row damage.
    expect(backDamage).toBe(frontDamage);
  });

  it("back-row enemies are not promoted when front row dies", () => {
    // Verify that deathCheck no longer calls promoteEnemyBackRow.
    const fighter = makeFighter(0);
    const frontEnemy = makeEnemy("e0", "front", 1);
    const backEnemy = makeEnemy("e1", "back", 200);
    const state = makeCombatWithLoadout(fighter, { front: [frontEnemy], back: [backEnemy] });
    const { state: s } = beginRound(state, seqRng([0.5]));
    // Kill the front enemy
    const sAfter = resolvePlayerTurn(s, {
      kind: "attack", actorId: "char-0", targetInstanceId: "e0",
    }, seqRng([0.5]));
    // Front enemy is dead and removed; back enemy stays in back row.
    expect(sAfter.enemies.front).toEqual([]);
    expect(sAfter.enemies.back[0].instanceId).toBe("e1");
    expect(sAfter.enemies.back[0].row).toBe("back");
    // No rowAdvance event
    expect(sAfter.events.some((e) => e?.type === "rowAdvance")).toBe(false);
  });
});
