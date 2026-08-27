/**
 * Shield Bash contract tests: proves the technique's stun is reliable
 * regardless of initiative order, and that its damage is visibly distinct
 * from a basic attack.
 *
 * The defect: with statusDuration=1 and multiplier=1.0, the stun is
 * initiative-dependent (wasted if the enemy acts first) and the damage
 * is identical to a basic attack — making the technique appear nonfunctional.
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
import { createCharacterRecord } from "./party";
import type { EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";
import { techniqueById, maxRageForLevel } from "../data/techniques";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeEnemy(instanceId: string, overrides: Partial<EnemyDef> = {}): EnemyInstance {
  const def: EnemyDef = {
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
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

function makeState(enemies: EnemyInstance[]): CombatState {
  const fighter = createCharacterRecord("char-0", "Fighter", "Human", "Neutral", "Fighter", 0);
  fighter.level = 3;
  fighter.maxHp = 30;
  fighter.hp = 30;
  const mage = createCharacterRecord("char-1", "Mage", "Human", "Neutral", "Mage", 1);
  return createCombatState([fighter, mage], { front: enemies, back: [] }, false, SPELLS_BY_ID);
}

describe("Shield Bash contract", () => {
  it("deals more damage than a basic attack (multiplier > 1)", () => {
    const state = makeState([makeEnemy("e0", { hp: 100, ac: 0 })]);
    const { state: s } = beginRound(state, seqRng([0.5]));

    // Basic attack: 1 roll (variance), 1 roll (crit)
    const sAttack = resolvePlayerTurn(s, {
      kind: "attack",
      actorId: "char-0",
      targetInstanceId: "e0",
    }, seqRng([0.5, 0.99]));
    const dmgAttack = 100 - sAttack.enemies.front[0].currentHp;

    // Shield Bash: same RNG sequence + status roll
    const sBash = resolvePlayerTurn(s, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-shield-bash",
      targetInstanceId: "e0",
    }, seqRng([0.5, 0.99, 0.99]));
    const dmgBash = 100 - sBash.enemies.front[0].currentHp;

    // Shield Bash should deal MORE damage than a basic attack (multiplier > 1).
    expect(dmgBash).toBeGreaterThan(dmgAttack);
  });

  it("stun persists into the next round when enemy acts before the Fighter", () => {
    // Enemy with AGI 99 (acts first), Fighter with default AGI (acts second).
    // Fighter uses Shield Bash; stun procs. Enemy already acted this round.
    // The stun MUST carry into the next round so the enemy loses a turn.
    const state = makeState([makeEnemy("e0", { hp: 100, ac: 0, attack: 20, agi: 99 })]);
    const { state: s, queue } = beginRound(state, seqRng([0.5]));

    // Find turn order: enemy should act before Fighter due to high AGI.
    const enemyIdx = queue.findIndex((q) => q.kind === "enemy");
    const fighterIdx = queue.findIndex((q) => q.kind === "player" && q.id === "char-0");
    expect(enemyIdx).toBeLessThan(fighterIdx); // enemy acts first

    // Enemy acts first (attacks the party)
    const sAfterEnemy = resolveEnemyTurn(s, queue[enemyIdx].id, seqRng([0.99, 0.5]));
    const partyHpAfterEnemy = sAfterEnemy.party.map((c) => c.hp);

    // Fighter uses Shield Bash with stun proc
    // RNG: [0] variance, [1] crit, [2] status (< chance → proc)
    const sAfterBash = resolvePlayerTurn(sAfterEnemy, {
      kind: "technique",
      actorId: "char-0",
      techniqueId: "fighter-shield-bash",
      targetInstanceId: "e0",
    }, seqRng([0.5, 0.99, 0.01]));

    const enemy = sAfterBash.enemies.front.find((e) => e.instanceId === "e0")!;
    expect(enemy.status).toContain("paralysis");

    // End of round — paralysis should NOT clear (duration > 1)
    const sAfterEor = endRound(sAfterBash);
    const enemyAfterEor = sAfterEor.enemies.front.find((e) => e.instanceId === "e0")!;
    expect(enemyAfterEor.status).toContain("paralysis");
    expect(sAfterEor.paralysisTimers["e0"]).toBeGreaterThanOrEqual(1);

    // Next round: enemy should still be paralyzed and skip its turn
    const { state: s2 } = beginRound(sAfterEor, seqRng([0.5]));
    const s2AfterEnemy = resolveEnemyTurn(s2, "e0", seqRng([0.99, 0.5]));

    // Party HP should be unchanged — enemy did nothing
    const partyHpAfterRound2 = s2AfterEnemy.party.map((c) => c.hp);
    expect(partyHpAfterRound2).toEqual(partyHpAfterEnemy);
  });
});
