/**
 * Unit tests for the per-turn combat API (FF6-style hybrid flow):
 * beginRound / resolvePlayerTurn / resolveEnemyTurn / resolveAllyTurn /
 * endRound. The underlying math is shared with resolveCombatRound (covered
 * by combat.test.ts); these tests cover the per-turn sequencing contracts.
 */
import { describe, it, expect } from "vitest";
import {
  beginRound,
  resolvePlayerTurn,
  resolveEnemyTurn,
  resolveAllyTurn,
  endRound,
  createCombatState,
  type CombatState,
  type EnemyInstance,
  type Rng,
} from "./combat";
import { createCharacter } from "./party";
import type { EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";

// --- Fixtures ---------------------------------------------------------------

/** Deterministic RNG from a fixed sequence (cycles). */
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

function makeParty(count = 2) {
  const party = [];
  for (let i = 0; i < count; i++) {
    const c = createCharacter(
      `char-${i}`,
      `Char${i}`,
      "Human",
      "Neutral",
      i === 0 ? "Fighter" : "Mage",
      i
    );
    party.push(c);
  }
  return party;
}

function makeState(enemies: EnemyInstance[] = [makeEnemy("rat-0")]): CombatState {
  return createCombatState(
    makeParty(),
    { front: enemies, back: [] },
    false,
    SPELLS_BY_ID
  );
}

// --- beginRound ---------------------------------------------------------------

describe("beginRound", () => {
  it("increments round and returns all living combatants sorted by AGI desc", () => {
    const state = makeState([makeEnemy("rat-0", { agi: 99 })]);
    const { state: s, queue } = beginRound(state, seqRng([0.5]));
    expect(s.round).toBe(1);
    expect(queue).toHaveLength(3); // 2 party + 1 enemy
    expect(queue[0].id).toBe("rat-0"); // agi 99 goes first
    expect(queue[0].kind).toBe("enemy");
  });

  it("excludes dead combatants from the queue", () => {
    const state = makeState();
    state.party[1].hp = 0;
    const dead = makeEnemy("rat-1");
    dead.currentHp = 0;
    state.enemies.front.push(dead);
    const { queue } = beginRound(state, seqRng([0.5]));
    expect(queue.map((q) => q.id)).not.toContain(state.party[1].id);
    expect(queue.map((q) => q.id)).not.toContain("rat-1");
    expect(queue).toHaveLength(2);
  });

  it("includes living summoned allies in the queue", () => {
    const state = makeState();
    state.summonedAllies.push({
      id: "summon-1",
      name: "Summoned Beast",
      hp: 10,
      maxHp: 10,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const { queue } = beginRound(state, seqRng([0.5]));
    expect(queue.find((q) => q.id === "summon-1")?.kind).toBe("ally");
  });

  it("clears per-round state and is a no-op when combat has ended", () => {
    const state = makeState();
    state.defendBuff = { x: 0.5 };
    state.silencedThisRound = ["someone"];
    const { state: s } = beginRound(state, seqRng([0.5]));
    expect(s.defendBuff).toEqual({});
    expect(s.silencedThisRound).toEqual([]);

    const ended = makeState();
    ended.ended = true;
    const { queue } = beginRound(ended, seqRng([0.5]));
    expect(queue).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = makeState();
    beginRound(state, seqRng([0.5]));
    expect(state.round).toBe(0);
  });
});

// --- resolvePlayerTurn ----------------------------------------------------------

describe("resolvePlayerTurn", () => {
  it("resolves an attack immediately and appends log + events", () => {
    const state = makeState();
    const actor = state.party[0];
    // rng draws: evasive? (n/a) -> blind? (n/a) -> variance -> crit
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: actor.id, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.log.length).toBeGreaterThan(0);
    expect(s.events.length).toBe(s.log.length);
    const enemy = s.enemies.front.find((e) => e.instanceId === "rat-0");
    // Enemy took damage or died (then it's in justDied instead).
    if (enemy) {
      expect(enemy.currentHp).toBeLessThan(enemy.hp);
    } else {
      expect(s.justDied.some((e) => e.instanceId === "rat-0")).toBe(true);
    }
  });

  it("justDied contains only this turn's deaths", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 1 })]);
    state.justDied = [makeEnemy("stale-corpse")]; // stale entry from earlier
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: state.party[0].id, targetInstanceId: "rat-0" },
      seqRng([0.99]) // no crit needed; 1 hp dies to any hit
    );
    expect(s.justDied.map((e) => e.instanceId)).toEqual(["rat-0"]);
    expect(s.ended).toBe(true);
    expect(s.result).toBe("victory");
  });

  it("skips incapacitated actors with a log entry", () => {
    const state = makeState();
    state.party[0].status.push("sleep");
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: state.party[0].id, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.log.at(-1)).toMatch(/incapacitated/);
    expect(s.enemies.front[0].currentHp).toBe(s.enemies.front[0].hp);
  });

  it("converts a silenced cast to defend", () => {
    const state = makeState();
    const mage = state.party[1];
    state.silencedThisRound = [mage.id];
    const spellId = mage.knownSpellIds[0];
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.log.some((m) => m.includes("silenced"))).toBe(true);
    expect(s.defendBuff[mage.id]).toBe(0.5);
  });

  it("flee success ends combat immediately", () => {
    const state = makeState();
    const s = resolvePlayerTurn(
      state,
      { kind: "flee", actorId: state.party[0].id },
      seqRng([0.01]) // < 0.95 -> success
    );
    expect(s.ended).toBe(true);
    expect(s.result).toBe("fled");
  });

  it("flee failure converts to defend", () => {
    const state = makeState();
    const actor = state.party[0];
    const s = resolvePlayerTurn(
      state,
      { kind: "flee", actorId: actor.id },
      seqRng([0.99]) // >= 0.95 -> failure
    );
    expect(s.ended).toBe(false);
    expect(s.defendBuff[actor.id]).toBe(0.5);
  });

  it("is a no-op for dead or unknown actors and when combat has ended", () => {
    const state = makeState();
    state.party[0].hp = 0;
    const s1 = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: state.party[0].id, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s1.log).toEqual([]);

    const ended = makeState();
    ended.ended = true;
    const s2 = resolvePlayerTurn(
      ended,
      { kind: "attack", actorId: ended.party[0].id, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s2.log).toEqual([]);
  });
});

// --- resolveEnemyTurn -----------------------------------------------------------

describe("resolveEnemyTurn", () => {
  it("enemy decides and attacks at its turn", () => {
    const state = makeState();
    const hpBefore = state.party.map((c) => c.hp);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    const damaged = s.party.some((c, i) => c.hp < hpBefore[i]);
    expect(damaged).toBe(true);
    expect(s.events.some((e) => e?.type === "attack")).toBe(true);
  });

  it("is a no-op for dead or unknown enemies", () => {
    const state = makeState();
    state.enemies.front[0].currentHp = 0;
    const s1 = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s1.log).toEqual([]);
    const s2 = resolveEnemyTurn(makeState(), "no-such-enemy", seqRng([0.5]));
    expect(s2.log).toEqual([]);
  });

  it("sleeping enemies do nothing", () => {
    const state = makeState();
    state.enemies.front[0].status.push("sleep");
    const hpBefore = state.party.map((c) => c.hp);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.party.map((c) => c.hp)).toEqual(hpBefore);
  });

  it("silenceRandom lands at the enemy's turn", () => {
    const state = makeState([
      makeEnemy("boss-0", { special: [{ kind: "silenceRandom" }], isBoss: true }),
    ]);
    const s = resolveEnemyTurn(state, "boss-0", seqRng([0.01]));
    expect(s.silencedThisRound).toHaveLength(1);
    expect(s.log.some((m) => m.includes("Silence"))).toBe(true);
  });
});

// --- resolveAllyTurn ------------------------------------------------------------

describe("resolveAllyTurn", () => {
  it("summoned ally attacks an enemy", () => {
    const state = makeState();
    state.summonedAllies.push({
      id: "summon-1",
      name: "Summoned Beast",
      hp: 10,
      maxHp: 10,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const s = resolveAllyTurn(state, "summon-1", seqRng([0.5]));
    const enemy = s.enemies.front[0];
    if (enemy) {
      expect(enemy.currentHp).toBeLessThan(enemy.hp);
    } else {
      expect(s.result).toBe("victory");
    }
  });

  it("is a no-op for dead or unknown allies", () => {
    const s = resolveAllyTurn(makeState(), "no-such-ally", seqRng([0.5]));
    expect(s.log).toEqual([]);
  });
});

// --- endRound -------------------------------------------------------------------

describe("endRound", () => {
  it("ticks poison on party and enemies", () => {
    const state = makeState();
    state.party[0].status.push("poison");
    state.enemies.front[0].status.push("poison");
    const s = endRound(state, seqRng([0.99]));
    expect(s.party[0].hp).toBe(state.party[0].hp - 2);
    expect(s.enemies.front[0].currentHp).toBe(state.enemies.front[0].currentHp - 2);
  });

  it("decays magic screens and fizzle fields and clears per-round silence", () => {
    const state = makeState();
    state.magicScreen = 3;
    state.partyFizzleField = 2;
    state.enemyFizzleFields = { front: 1, back: 0 };
    state.silencedThisRound = ["someone"];
    const s = endRound(state, seqRng([0.99]));
    expect(s.magicScreen).toBe(2);
    expect(s.partyFizzleField).toBe(1);
    expect(s.enemyFizzleFields.front).toBe(0);
    expect(s.silencedThisRound).toEqual([]);
  });

  it("poison death at end of round terminates combat", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 2 })]);
    state.enemies.front[0].currentHp = 2;
    state.enemies.front[0].status.push("poison");
    const s = endRound(state, seqRng([0.99]));
    expect(s.ended).toBe(true);
    expect(s.result).toBe("victory");
    expect(s.justDied.map((e) => e.instanceId)).toEqual(["rat-0"]);
  });
});

// --- Full-round integration -------------------------------------------------

describe("per-turn round integration", () => {
  it("a full round walked turn-by-turn reaches a consistent end state", () => {
    const rng = seqRng([0.4, 0.6, 0.3, 0.7, 0.5]);
    let { state: s, queue } = beginRound(makeState(), rng);
    for (const entry of queue) {
      if (s.ended) break;
      if (entry.kind === "player") {
        const c = s.party.find((p) => p.id === entry.id);
        if (!c || c.hp <= 0) continue;
        s = resolvePlayerTurn(
          s,
          { kind: "attack", actorId: entry.id, targetInstanceId: "rat-0" },
          rng
        );
      } else if (entry.kind === "enemy") {
        s = resolveEnemyTurn(s, entry.id, rng);
      } else {
        s = resolveAllyTurn(s, entry.id, rng);
      }
    }
    if (!s.ended) s = endRound(s, rng);
    expect(s.round).toBe(1);
    expect(s.events.length).toBe(s.log.length);
  });
});

// --- Audit fixes (2026-07-09) -------------------------------------------------

import { enqueueNewAllies, type TurnQueueEntry } from "./combat";
import { ITEMS_BY_ID } from "../data/items";

describe("audit fixes: event emission", () => {
  it("item use emits cast + heal events (not silent)", () => {
    const state = makeState();
    state.items = ITEMS_BY_ID;
    state.inventory = { "healing-potion": 1 };
    const actor = state.party[0];
    actor.hp = 1;
    const s = resolvePlayerTurn(
      state,
      { kind: "item", actorId: actor.id, itemId: "healing-potion", targetAllyId: actor.id },
      seqRng([0.5])
    );
    const cast = s.events.find((e) => e?.type === "cast");
    expect(cast).toBeDefined();
    if (cast?.type === "cast") {
      expect(cast.spellId).toBe("healing-potion");
      expect(cast.heal).toBeGreaterThan(0);
    }
  });

  it("silenceRandom emits a structured silence event", () => {
    const state = makeState([
      makeEnemy("boss-0", { special: [{ kind: "silenceRandom" }], isBoss: true }),
    ]);
    const s = resolveEnemyTurn(state, "boss-0", seqRng([0.01]));
    const evt = s.events.find((e) => e?.type === "silence");
    expect(evt).toBeDefined();
    if (evt?.type === "silence") {
      expect(evt.actorId).toBe("boss-0");
      expect(s.silencedThisRound).toContain(evt.targetId);
    }
  });

  it("critical hits carry crit: true on the attack event", () => {
    const state = makeState();
    const actor = state.party[0];
    actor.stats.luk = 100; // guarantee the crit roll
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: actor.id, targetInstanceId: "rat-0" },
      seqRng([0.5, 0.0]) // variance, crit roll
    );
    const attack = s.events.find((e) => e?.type === "attack");
    expect(attack).toBeDefined();
    if (attack?.type === "attack") expect(attack.crit).toBe(true);
  });
});

describe("audit fixes: termination and queueing", () => {
  it("simultaneous death at end of round is a wipe, not a victory", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 2 })]);
    state.enemies.front[0].currentHp = 2;
    state.enemies.front[0].status.push("poison");
    for (const c of state.party) {
      c.hp = 2;
      c.status.push("poison");
    }
    const s = endRound(state, seqRng([0.99]));
    expect(s.ended).toBe(true);
    expect(s.result).toBe("wipe");
  });

  it("enqueueNewAllies inserts a fresh summon before the next enemy turn", () => {
    const state = makeState();
    state.summonedAllies.push({
      id: "summon-new",
      name: "Summoned Beast",
      hp: 10,
      maxHp: 10,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const queue: TurnQueueEntry[] = [
      { kind: "player", id: "char-0", agi: 10, luk: 10, roll: 5 },
      { kind: "player", id: "char-1", agi: 9, luk: 10, roll: 5 },
      { kind: "enemy", id: "rat-0", agi: 5, luk: 10, roll: 5 },
    ];
    const next = enqueueNewAllies(queue, 1, state);
    expect(next.map((e) => e.id)).toEqual(["char-0", "char-1", "summon-new", "rat-0"]);
    // Idempotent: already-queued allies are not duplicated.
    expect(enqueueNewAllies(next, 1, state)).toEqual(next);
    // Input not mutated.
    expect(queue).toHaveLength(3);
  });
});
