import { describe, it, expect } from "vitest";
import { remainingTurnOrder } from "./combat-turn-order";
import { beginRound, createCombatState } from "./combat";
import type { CombatState, EnemyInstance, Rng, TurnQueueEntry } from "./combat-types";
import { createCharacter, type CharacterClass } from "./party";
import type { EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s]));

function makeEnemyDef(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
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
}

function makeEnemy(instanceId: string, overrides: Partial<EnemyDef> = {}): EnemyInstance {
  const def = makeEnemyDef(overrides);
  return {
    ...def,
    instanceId,
    currentHp: def.hp,
    row: "front",
    status: [],
  };
}

function makeParty(count = 2, classes?: CharacterClass[]) {
  const party = [];
  for (let i = 0; i < count; i++) {
    party.push(
      createCharacter(
        `char-${i}`,
        i === 0 ? "Aria" : "Dell",
        "Human",
        "Neutral",
        classes?.[i] ?? (i === 0 ? "Fighter" : "Priest"),
        i
      )
    );
  }
  return party;
}

function makeState(enemies: EnemyInstance[] = [makeEnemy("rat-0")]): CombatState {
  return createCombatState(makeParty(2), { front: enemies, back: [] }, false, SPELLS_BY_ID);
}

describe("remainingTurnOrder", () => {
  it("matches beginRound queue order and drops acted entries", () => {
    const state = makeState([makeEnemy("rat-0", { agi: 99, name: "Rat" })]);
    state.party[0]!.stats.agi = 20;
    state.party[1]!.stats.agi = 5;
    const { queue } = beginRound(state, seqRng([0.5]));
    expect(queue.map((q) => q.id)).toEqual(["rat-0", "char-0", "char-1"]);

    expect(remainingTurnOrder(queue, 0, state, null).map((e) => e.id)).toEqual([
      "rat-0",
      "char-0",
      "char-1",
    ]);

    const duringRat = remainingTurnOrder(queue, 1, state, "rat-0");
    expect(duringRat.map((e) => e.id)).toEqual(["rat-0", "char-0", "char-1"]);
    expect(duringRat[0]!.current).toBe(true);
    expect(duringRat[1]!.current).toBe(false);

    const afterRat = remainingTurnOrder(queue, 1, state, null);
    expect(afterRat.map((e) => e.id)).toEqual(["char-0", "char-1"]);

    const duringAria = remainingTurnOrder(queue, 2, state, "char-0");
    expect(duringAria.map((e) => e.id)).toEqual(["char-0", "char-1"]);
    expect(duringAria[0]!.current).toBe(true);
  });

  it("marks sleep/paralysis as willSkip with reason", () => {
    const state = makeState();
    state.party[1]!.status.push("sleep");
    const queue: TurnQueueEntry[] = [
      { kind: "player", id: "char-0", agi: 20, luk: 5, roll: 10 },
      { kind: "player", id: "char-1", agi: 5, luk: 5, roll: 10 },
      { kind: "enemy", id: "rat-0", agi: 1, luk: 10, roll: 10 },
    ];
    const view = remainingTurnOrder(queue, 0, state, null);
    const dell = view.find((e) => e.id === "char-1")!;
    expect(dell.willSkip).toBe(true);
    expect(dell.skipReason).toBe("sleep");
    expect(view.find((e) => e.id === "char-0")!.willSkip).toBe(false);
  });

  it("omits mid-round deaths from the remaining list", () => {
    const state = makeState([makeEnemy("rat-0", { name: "Rat" })]);
    const queue: TurnQueueEntry[] = [
      { kind: "player", id: "char-0", agi: 20, luk: 5, roll: 10 },
      { kind: "enemy", id: "rat-0", agi: 15, luk: 10, roll: 10 },
      { kind: "player", id: "char-1", agi: 5, luk: 5, roll: 10 },
    ];
    state.enemies.front[0]!.currentHp = 0;
    const view = remainingTurnOrder(queue, 1, state, "char-0");
    expect(view.map((e) => e.id)).toEqual(["char-0", "char-1"]);
  });

  it("resolves display names for party, enemy, and ally", () => {
    const state = makeState([makeEnemy("rat-0", { name: "Rat" })]);
    state.summonedAllies.push({
      id: "summon-1",
      name: "BAMORDI",
      hp: 10,
      maxHp: 10,
      attack: 5,
      ac: 1,
      agi: 12,
      row: "front",
    });
    const queue: TurnQueueEntry[] = [
      { kind: "ally", id: "summon-1", agi: 12, luk: 10, roll: 10 },
      { kind: "enemy", id: "rat-0", agi: 5, luk: 10, roll: 10 },
      { kind: "player", id: "char-0", agi: 4, luk: 5, roll: 10 },
    ];
    const view = remainingTurnOrder(queue, 0, state, null);
    expect(view.map((e) => e.name)).toEqual(["BAMORDI", "Rat", "Aria"]);
    expect(view.map((e) => e.kind)).toEqual(["ally", "enemy", "player"]);
  });
});
