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
  resolveCombatRound,
  endRound,
  createCombatState,
  enqueueNewAllies,
} from "./combat";
import type { CombatState, EnemyInstance, Rng, TurnQueueEntry } from "./combat-types";
import { createCharacter, type CharacterClass } from "./party";
import { ENEMIES_BY_ID, type EnemyDef } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";
import { ITEMS_BY_ID, shopInventory } from "../data/items";
import { enemyAbilityById } from "../data/enemy-abilities";

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

function makeParty(count = 2, classes?: CharacterClass[]) {
  const party = [];
  for (let i = 0; i < count; i++) {
    const c = createCharacter(
      `char-${i}`,
      `Char${i}`,
      "Human",
      "Neutral",
      classes?.[i] ?? (i === 0 ? "Fighter" : "Mage"),
      i
    );
    party.push(c);
  }
  return party;
}

function makeState(
  enemies: EnemyInstance[] = [makeEnemy("rat-0")],
  classes?: CharacterClass[]
): CombatState {
  return createCombatState(
    makeParty(2, classes),
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
    expect(s.log.at(-1)).toMatch(/cannot act/);
    expect(s.events.some((e) => e?.type === "incapacitated")).toBe(true);
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

  it("single-target heal can mend a summoned ally", () => {
    const state = makeState();
    const healer = state.party[0];
    healer.knownSpellIds = ["priest-cure-wounds"];
    healer.sp = 99;
    healer.maxSp = 99;
    state.summonedAllies.push({
      id: "summon-1",
      name: "Summoned Beast",
      hp: 4,
      maxHp: 18,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const s = resolvePlayerTurn(
      state,
      {
        kind: "cast",
        actorId: healer.id,
        spellId: "priest-cure-wounds",
        targetAllyId: "summon-1",
      },
      seqRng([0.5])
    );
    const summon = s.summonedAllies.find((a) => a.id === "summon-1");
    expect(summon?.hp).toBe(16); // 4 + Cure Wounds 12
    // The heal went to the summon, not a party member.
    for (const c of s.party) expect(c.hp).toBe(c.maxHp);
    expect(
      s.events.some(
        (e) => e?.type === "spellEffect" && e.targetId === "summon-1" && e.heal === 12
      )
    ).toBe(true);
  });

  it("summon heals clamp to maxHp and skip dead summons", () => {
    const state = makeState();
    const healer = state.party[0];
    healer.knownSpellIds = ["priest-cure-wounds"];
    healer.sp = 99;
    healer.maxSp = 99;
    state.summonedAllies.push({
      id: "summon-1",
      name: "Summoned Beast",
      hp: 15,
      maxHp: 18,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const s = resolvePlayerTurn(
      state,
      {
        kind: "cast",
        actorId: healer.id,
        spellId: "priest-cure-wounds",
        targetAllyId: "summon-1",
      },
      seqRng([0.5])
    );
    expect(s.summonedAllies[0].hp).toBe(18);

    // A dead summon is not a valid heal target — the cast falls through to
    // the party lookup and finds nothing, and the turn's death check banishes
    // the 0-HP summon.
    const state2 = makeState();
    const healer2 = state2.party[0];
    healer2.knownSpellIds = ["priest-cure-wounds"];
    healer2.sp = 99;
    healer2.maxSp = 99;
    state2.summonedAllies.push({
      id: "summon-dead",
      name: "Summoned Beast",
      hp: 0,
      maxHp: 18,
      attack: 5,
      ac: 1,
      agi: 50,
      row: "front",
    });
    const s2 = resolvePlayerTurn(
      state2,
      {
        kind: "cast",
        actorId: healer2.id,
        spellId: "priest-cure-wounds",
        targetAllyId: "summon-dead",
      },
      seqRng([0.5])
    );
    expect(s2.summonedAllies).toHaveLength(0);
    expect(
      s2.events.some((e) => e?.type === "spellEffect" && e.targetId === "summon-dead")
    ).toBe(false);
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
    actor.stats.agi = 10; // keep base flee chance at 0.95 so 0.99 fails
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

// --- Audit fixes (2026-07-10) -------------------------------------------------
// Cover unexercised playtest paths and close the buff TODO.

describe("audit fixes: unexercised combat paths", () => {
  it("attack against an evasive enemy emits a miss event and deals no damage", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "evasive" }] })]);
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.1]) // below 0.2 evade threshold
    );
    const enemy = s.enemies.front.find((e) => e.instanceId === "rat-0");
    expect(enemy?.currentHp).toBe(enemy?.hp);
    const miss = s.events.find((e) => e?.type === "miss");
    expect(miss).toBeDefined();
    if (miss?.type === "miss") expect(miss.reason).toBe("evade");
  });

  it("enemy poisonOnHit inflicts poison on the struck party member", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "poisonOnHit" }] })]);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.9]));
    const target = s.party.find((c) => c.hp < c.maxHp);
    expect(target).toBeDefined();
    expect(target!.status.includes("poison")).toBe(true);
    expect(s.log.some((m) => m.includes("poisoned"))).toBe(true);
  });

  it("buff spell adds armorBuff and emits a buff spellEffect", () => {
    const state = makeState();
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    mage.knownSpellIds = ["mage-arcane-ward"];
    mage.sp = 99;
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "mage-arcane-ward" },
      seqRng([0.5])
    );
    expect(s.armorBuffs[mage.id]).toBe(3);
    const buff = s.events.find((e) => e?.type === "spellEffect" && e.isBuff);
    expect(buff).toBeDefined();
    if (buff?.type === "spellEffect") expect(buff.spellId).toBe("mage-arcane-ward");
  });

  it("buff spell uses the effect's power when provided", () => {
    const state = makeState();
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    state.spells["test-buff"] = {
      id: "test-buff",
      name: "Test Buff",
      class: "Mage",
      tier: 1,
      spCost: 1,
      target: "self",
      effect: { kind: "buff", stat: "armor", power: 7 },
      description: "test",
    };
    mage.knownSpellIds = ["test-buff"];
    mage.sp = 99;
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "test-buff" },
      seqRng([0.5])
    );
    expect(s.armorBuffs[mage.id]).toBe(7);
  });

  it("Thief hide gives hidden status and ambush emits an ambush event", () => {
    const state = makeState([makeEnemy("rat-0")], ["Thief", "Mage"]);
    const thief = state.party.find((c) => c.class === "Thief");
    if (!thief) throw new Error("No Thief in party");

    const s1 = resolvePlayerTurn(
      state,
      { kind: "hide", actorId: thief.id },
      seqRng([0.5])
    );
    expect(s1.party.find((c) => c.id === thief.id)?.status.includes("hidden")).toBe(true);

    const s2 = resolvePlayerTurn(
      s1,
      { kind: "ambush", actorId: thief.id, targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    const updatedThief = s2.party.find((c) => c.id === thief.id);
    expect(updatedThief?.status.includes("hidden")).toBe(false);
    expect(updatedThief?.status.includes("exposed")).toBe(true);
    const ambush = s2.events.find((e) => e?.type === "ambush");
    expect(ambush).toBeDefined();
    if (ambush?.type === "ambush") {
      expect(ambush.actorId).toBe(thief.id);
      expect(ambush.targetId).toBe("rat-0");
      expect(ambush.damage).toBeGreaterThan(0);
    }
  });
});

// --- Spell DoT / regen followups (Phase C) -----------------------------------

describe("spell DoT followups", () => {
  const SCORCH = {
    id: "scorch",
    name: "Scorch",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: {
      kind: "damage",
      element: "fire",
      power: 10,
      followup: { kind: "dot", element: "fire", power: 5, duration: 2 },
    },
    description: "Test burn.",
  } as const;

  function castScorch(enemyOverrides: Partial<EnemyDef> = {}): CombatState {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ...enemyOverrides })]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    state.spells["scorch"] = SCORCH;
    mage.knownSpellIds = ["scorch"];
    mage.sp = 99;
    return resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "scorch", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
  }

  it("cast records the DoT and emits a burn statusInflicted event", () => {
    const s = castScorch();
    expect(s.enemyDots["rat-0"]).toHaveLength(1);
    expect(s.enemyDots["rat-0"][0]).toMatchObject({ element: "fire", power: 5, duration: 2 });
    const burned = s.events.find(
      (e) => e?.type === "spellEffect" && e.statusInflicted === "burn"
    );
    expect(burned).toBeDefined();
  });

  it("ticks at end of round, emits statusTick, and expires after its duration", () => {
    let s = castScorch();
    const hpAfterCast = s.enemies.front[0].currentHp;

    s = endRound(s, seqRng([0.5]));
    expect(s.enemies.front[0].currentHp).toBe(hpAfterCast - 5);
    expect(s.enemyDots["rat-0"][0].duration).toBe(1);
    const tick = s.events.find((e) => e?.type === "statusTick" && e.status === "burn");
    expect(tick).toBeDefined();
    if (tick?.type === "statusTick") expect(tick.damage).toBe(5);

    s = endRound(s, seqRng([0.5]));
    expect(s.enemies.front[0].currentHp).toBe(hpAfterCast - 10);
    expect(s.enemyDots["rat-0"]).toBeUndefined();
    const ended = s.events.find((e) => e?.type === "statusEnd" && e.status === "burn");
    expect(ended).toBeDefined();

    const hpBefore = s.enemies.front[0].currentHp;
    s = endRound(s, seqRng([0.5]));
    expect(s.enemies.front[0].currentHp).toBe(hpBefore);
  });

  it("respects elemental affinity on ticks", () => {
    let s = castScorch({ special: [{ kind: "weakElement", element: "fire" }] });
    const hpAfterCast = s.enemies.front[0].currentHp;
    s = endRound(s, seqRng([0.5]));
    // 5 × 1.5 = 7.5 → 8.
    expect(s.enemies.front[0].currentHp).toBe(hpAfterCast - 8);
  });

  it("recasting refreshes the existing DoT instead of stacking it", () => {
    let s = castScorch();
    s = endRound(s, seqRng([0.5])); // duration now 1
    const mage = s.party.find((c) => c.class === "Mage")!;
    s = resolvePlayerTurn(
      s,
      { kind: "cast", actorId: mage.id, spellId: "scorch", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.enemyDots["rat-0"]).toHaveLength(1);
    expect(s.enemyDots["rat-0"][0].duration).toBe(2);
  });

  it("real data: mage-meteor-swarm carries a fire DoT followup", () => {
    const meteor = SPELLS_BY_ID["mage-meteor-swarm"];
    expect(meteor.effect.kind).toBe("damage");
    if (meteor.effect.kind === "damage") {
      expect(meteor.effect.followup).toMatchObject({ kind: "dot", element: "fire" });
    }
  });
});

describe("spell regen followups", () => {
  const KNIT = {
    id: "knit",
    name: "Knit",
    class: "Priest",
    tier: 1,
    spCost: 1,
    target: "singleAlly",
    effect: {
      kind: "heal",
      power: 5,
      followup: { kind: "regen", power: 4, duration: 2 },
    },
    description: "Test regen.",
  } as const;

  function castKnit(): CombatState {
    const state = makeState([makeEnemy("rat-0")], ["Priest", "Mage"]);
    const priest = state.party.find((c) => c.class === "Priest")!;
    priest.maxHp = 100;
    priest.hp = 10;
    state.spells["knit"] = KNIT;
    priest.knownSpellIds = ["knit"];
    priest.sp = 99;
    return resolvePlayerTurn(
      state,
      { kind: "cast", actorId: priest.id, spellId: "knit", targetAllyId: priest.id },
      seqRng([0.5])
    );
  }

  it("cast records the regen buff and emits a buff event", () => {
    const s = castKnit();
    const priest = s.party.find((c) => c.class === "Priest")!;
    expect(s.regenBuffs[priest.id]).toMatchObject({ power: 4, duration: 2 });
    const buff = s.events.find(
      (e) => e?.type === "spellEffect" && e.spellId === "knit" && e.isBuff
    );
    expect(buff).toBeDefined();
  });

  it("heals each end of round and expires after its duration", () => {
    let s = castKnit();
    const priest = () => s.party.find((c) => c.class === "Priest")!;
    const hpAfterCast = priest().hp;

    s = endRound(s, seqRng([0.5]));
    expect(priest().hp).toBe(hpAfterCast + 4);
    expect(s.regenBuffs[priest().id].duration).toBe(1);

    s = endRound(s, seqRng([0.5]));
    expect(priest().hp).toBe(hpAfterCast + 8);
    expect(s.regenBuffs[priest().id]).toBeUndefined();

    const hpBefore = priest().hp;
    s = endRound(s, seqRng([0.5]));
    expect(priest().hp).toBe(hpBefore);
  });

  it("a KO'd character loses the regen buff without healing", () => {
    let s = castKnit();
    const priest = s.party.find((c) => c.class === "Priest")!;
    priest.hp = 0;
    priest.status.push("knockedOut");
    s = endRound(s, seqRng([0.5]));
    expect(s.regenBuffs[priest.id]).toBeUndefined();
    expect(s.party.find((c) => c.class === "Priest")!.hp).toBe(0);
  });

  it("real data: priest-mass-regenerate and priest-regenerate carry regen followups", () => {
    for (const id of ["priest-mass-regenerate", "priest-regenerate"]) {
      const spell = SPELLS_BY_ID[id];
      expect(spell, id).toBeDefined();
      expect(spell.effect.kind).toBe("heal");
      if (spell.effect.kind === "heal") {
        expect(spell.effect.followup?.kind).toBe("regen");
      }
    }
  });
});

// --- Poison duration and scaling (P1-7) --------------------------------------

describe("poison state (P1-7)", () => {
  it("Poison Blade applies poison at 3 damage for 3 rounds", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 0 })], ["Thief", "Mage"]);
    const thief = state.party[0];
    state.rage[thief.id] = 20;
    const s1 = resolvePlayerTurn(
      state,
      { kind: "technique", actorId: thief.id, techniqueId: "thief-poison-blade", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s1.enemies.front[0].status.includes("poison")).toBe(true);
    expect(s1.poisonState["rat-0"]).toEqual({ damage: 3, duration: 3 });

    const hpAfterHit = s1.enemies.front[0].currentHp;
    const s2 = endRound(s1, seqRng([0.5]));
    expect(s2.enemies.front[0].currentHp).toBe(hpAfterHit - 3);
    expect(s2.poisonState["rat-0"]).toEqual({ damage: 3, duration: 2 });
  });

  it("poison expires after its duration and stops ticking", () => {
    const state = makeState();
    state.enemies.front[0].status.push("poison");
    state.poisonState["rat-0"] = { damage: 2, duration: 1 };
    const hpBefore = state.enemies.front[0].currentHp;
    const s1 = endRound(state, seqRng([0.5]));
    expect(s1.enemies.front[0].currentHp).toBe(hpBefore - 2);
    expect(s1.enemies.front[0].status.includes("poison")).toBe(false);
    expect(s1.poisonState["rat-0"]).toBeUndefined();
    expect(s1.log.some((m) => m.includes("no longer poisoned"))).toBe(true);

    const s2 = endRound(s1, seqRng([0.5]));
    expect(s2.enemies.front[0].currentHp).toBe(hpBefore - 2); // no further ticks
  });

  it("enemy poisonOnHit records poison state (2 damage, 3 rounds)", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "poisonOnHit" }] })]);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.9]));
    const target = s.party.find((c) => c.status.includes("poison"))!;
    expect(target).toBeDefined();
    expect(s.poisonState[target.id]).toEqual({ damage: 2, duration: 3 });
  });

  it("party poison ticks its recorded damage and counts down", () => {
    const state = makeState();
    state.party[0].status.push("poison");
    state.poisonState["char-0"] = { damage: 2, duration: 3 };
    const hpBefore = state.party[0].hp;
    const s = endRound(state, seqRng([0.5]));
    expect(s.party[0].hp).toBe(hpBefore - 2);
    expect(s.poisonState["char-0"]).toEqual({ damage: 2, duration: 2 });
  });

  it("Neutralize Poison clears the poison state as well as the status", () => {
    const state = makeState([makeEnemy("rat-0")], ["Priest", "Mage"]);
    const priest = state.party[0];
    priest.knownSpellIds = ["priest-neutralize-poison"];
    priest.sp = 99;
    state.party[1].status.push("poison");
    state.poisonState["char-1"] = { damage: 2, duration: 3 };
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: "char-0", spellId: "priest-neutralize-poison", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party[1].status.includes("poison")).toBe(false);
    expect(s.poisonState["char-1"]).toBeUndefined();
  });
});

// --- Blind duration and cure (P1-7) ------------------------------------------

describe("blind state (P1-7)", () => {
  it("enemy blind ability applies blind with a duration timer", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["blinding-gaze"] })]);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.1]));
    const blinded = s.party.find((c) => c.status.includes("blind"));
    expect(blinded).toBeDefined();
    expect(s.blindTimers[blinded!.id]).toBe(3); // blinding-gaze duration
  });

  it("blind counts down and expires at end of round", () => {
    const state = makeState();
    state.party[0].status.push("blind");
    state.blindTimers["char-0"] = 2;
    const s1 = endRound(state, seqRng([0.5]));
    expect(s1.party[0].status.includes("blind")).toBe(true);
    expect(s1.blindTimers["char-0"]).toBe(1);

    const s2 = endRound(s1, seqRng([0.5]));
    expect(s2.party[0].status.includes("blind")).toBe(false);
    expect(s2.blindTimers["char-0"]).toBeUndefined();
    expect(s2.log.some((m) => m.includes("can see again"))).toBe(true);
  });

  it("Cure Blindness removes blind and its timer", () => {
    const state = makeState([makeEnemy("rat-0")], ["Priest", "Mage"]);
    const priest = state.party[0];
    priest.knownSpellIds = ["priest-cure-blind"];
    priest.sp = 99;
    state.party[1].status.push("blind");
    state.blindTimers["char-1"] = 3;
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: "char-0", spellId: "priest-cure-blind", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party[1].status.includes("blind")).toBe(false);
    expect(s.blindTimers["char-1"]).toBeUndefined();
  });

  it("real data: priest-cure-blind is a tier-2 single-ally blind cure", () => {
    const spell = SPELLS_BY_ID["priest-cure-blind"];
    expect(spell).toBeDefined();
    expect(spell.class).toBe("Priest");
    expect(spell.tier).toBe(2);
    expect(spell.target).toBe("singleAlly");
    expect(spell.effect).toEqual({ kind: "cure", status: "blind" });
  });
});

// --- Telegraph wind-ups (Direction B) -----------------------------------------

describe("telegraph wind-ups", () => {
  it("a wind-up flagged ability telegraphs instead of resolving", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    const hpBefore = state.party.map((c) => c.hp);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.1]));
    expect(s.windUps["rat-0"]).toMatchObject({ abilityId: "hellfire", name: "Hellfire" });
    expect(s.party.map((c) => c.hp)).toEqual(hpBefore); // no damage yet
    const evt = s.events.find((e) => e?.type === "telegraph");
    expect(evt).toBeDefined();
    if (evt?.type === "telegraph") expect(evt.abilityId).toBe("hellfire");
    expect(s.log.some((m) => m.includes("begins charging Hellfire"))).toBe(true);
  });

  it("a winding-up enemy fires the ability on its next turn", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp < c.maxHp)).toBe(true); // hellfire hit everyone
  });

  it("paralysis breaks a wind-up (disable = interrupt)", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].status.push("paralysis");
    state.paralysisTimers["rat-0"] = 2;
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true); // never fired
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
    expect(s.log.some((m) => m.includes("is broken"))).toBe(true);
  });

  it("sleep breaks a wind-up too", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].status.push("sleep");
    state.sleepTimers["rat-0"] = 2;
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true);
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
  });

  it("killing a winding-up enemy cancels the fire", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"], hp: 5 })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].currentHp = 0; // killed before its next turn
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true);
  });

  it("round path: a mid-round disable breaks the wind-up before it fires", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.knownSpellIds = ["mage-web"];
    mage.sp = 99;
    const s = resolveCombatRound(
      state,
      [
        { kind: "cast", actorId: mage.id, spellId: "mage-web" },
        { kind: "defend", actorId: state.party[0].id },
      ],
      seqRng([0.1])
    );
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true); // hellfire never fired
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
  });

  it("real data: the big party-wide abilities are wind-up flagged", () => {
    for (const id of ["hellfire", "magma-burst", "dark-pulse", "memory-drain", "echo-of-silence", "ghostly-wail", "anti-magic-field"]) {
      expect(enemyAbilityById(id)?.windUp, id).toBe(true);
    }
  });

  it("anti-magic-field telegraphs on its first turn and lands on the second", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["anti-magic-field"] })]);
    const s1 = resolveEnemyTurn(state, "rat-0", seqRng([0.1]));
    expect(s1.windUps["rat-0"]?.abilityId).toBe("anti-magic-field");
    expect(s1.partyFizzleField).toBe(0); // not yet
    const s2 = resolveEnemyTurn(s1, "rat-0", seqRng([0.5]));
    expect(s2.partyFizzleField).toBe(3);
    expect(s2.windUps["rat-0"]).toBeUndefined();
  });
});

// --- AC damage floor (P2-8) ---------------------------------------------------

describe("AC damage floor (P2-8)", () => {
  it("caps flat AC reduction at 50% of the incoming swing", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 19 })], ["Fighter", "Mage"]);
    const fighter = state.party[0];
    fighter.stats.str = 20;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" }, seqRng([0.5]));
    // 21 base, AC 19 -> capped to 10 reduction -> 11 damage (was 2).
    expect(s.enemies.front[0].currentHp).toBe(89);
  });

  it("does not change damage when AC is below half the swing", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 5 })], ["Fighter", "Mage"]);
    const fighter = state.party[0];
    fighter.stats.str = 20;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" }, seqRng([0.5]));
    // 21 base, AC 5 (below the 10 cap) -> 16 damage, unchanged.
    expect(s.enemies.front[0].currentHp).toBe(84);
  });

  it("highDefense still halves after the capped AC reduction", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 19, special: [{ kind: "highDefense" }] })], ["Fighter", "Mage"]);
    const fighter = state.party[0];
    fighter.stats.str = 20;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" }, seqRng([0.5]));
    // 21 -> 11 after capped AC -> 6 after the halve.
    expect(s.enemies.front[0].currentHp).toBe(94);
  });

  it("caps AC reduction for techniques too (Poison Blade)", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 19 })], ["Thief", "Mage"]);
    const thief = state.party[0];
    thief.stats.str = 20;
    thief.stats.luk = 0;
    state.rage["char-0"] = 20;
    const s = resolvePlayerTurn(state, { kind: "technique", actorId: "char-0", techniqueId: "thief-poison-blade", targetInstanceId: "rat-0" }, seqRng([0.5]));
    // 21 base (x1 multiplier), AC 19 -> capped to 10 -> 11 damage.
    expect(s.enemies.front[0].currentHp).toBe(89);
  });

  it("caps AC reduction for ambush", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, ac: 19 })], ["Thief", "Mage"]);
    const thief = state.party[0];
    thief.stats.str = 10;
    thief.stats.luk = 0;
    thief.status.push("hidden");
    const s = resolvePlayerTurn(state, { kind: "ambush", actorId: "char-0", targetInstanceId: "rat-0" }, seqRng([0.5]));
    // 11 base x2 = 22, AC 19 -> capped to 11 -> 11 damage (was 3).
    expect(s.enemies.front[0].currentHp).toBe(89);
  });
});

// --- Affinity discovery (P2-9) ------------------------------------------------

describe("affinity discovery (P2-9)", () => {
  it("discovers a weakness when a spell procs it, once per species/element", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, special: [{ kind: "weakElement", element: "fire" }] })]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.knownSpellIds = ["mage-fire-bolt"];
    mage.sp = 99;
    const s1 = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "mage-fire-bolt", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s1.observedAffinity["Test Rat"]?.weak).toEqual(["fire"]);
    expect(s1.events.filter((e) => e?.type === "affinityDiscovered")).toHaveLength(1);
    expect(s1.log.some((m) => m.includes("weak to fire"))).toBe(true);

    // Second cast of the same element: no new event, no duplicate entry.
    const s2 = resolvePlayerTurn(
      s1,
      { kind: "cast", actorId: mage.id, spellId: "mage-fire-bolt", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s2.events.filter((e) => e?.type === "affinityDiscovered")).toHaveLength(1); // still just the first
    expect(s2.observedAffinity["Test Rat"]?.weak).toEqual(["fire"]);
  });

  it("discovers a resistance when a spell procs it", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, special: [{ kind: "resistElement", element: "water" }] })]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.knownSpellIds = ["mage-water-bolt"];
    mage.sp = 99;
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "mage-water-bolt", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.observedAffinity["Test Rat"]?.resist).toEqual(["water"]);
    const evt = s.events.find((e) => e?.type === "affinityDiscovered");
    expect(evt).toBeDefined();
    if (evt?.type === "affinityDiscovered") expect(evt.kind).toBe("resist");
    expect(s.log.some((m) => m.includes("resists water"))).toBe(true);
  });

  it("records nothing when the target has no matching affinity", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, special: [{ kind: "weakElement", element: "cold" }] })]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.knownSpellIds = ["mage-fire-bolt"];
    mage.sp = 99;
    const s = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "mage-fire-bolt", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.observedAffinity["Test Rat"]).toBeUndefined();
    expect(s.events.some((e) => e?.type === "affinityDiscovered")).toBe(false);
  });

  it("DoT ticks discover affinity too", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, special: [{ kind: "weakElement", element: "fire" }] })]);
    state.enemyDots["rat-0"] = [{ element: "fire", power: 5, duration: 2 }];
    const s = endRound(state, seqRng([0.5]));
    expect(s.observedAffinity["Test Rat"]?.weak).toEqual(["fire"]);
    expect(s.events.some((e) => e?.type === "affinityDiscovered")).toBe(true);
  });
});

// --- Combat consumables: answers pack (Direction B) ---------------------------

describe("combat consumables (answers pack)", () => {
  it("Eye Drops cure blind and clear its timer", () => {
    const state = makeState();
    state.items = ITEMS_BY_ID;
    state.inventory = { "eye-drops": 1 };
    state.party[1].status.push("blind");
    state.blindTimers["char-1"] = 3;
    const s = resolvePlayerTurn(
      state,
      { kind: "item", actorId: "char-0", itemId: "eye-drops", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party[1].status.includes("blind")).toBe(false);
    expect(s.blindTimers["char-1"]).toBeUndefined();
    expect(s.inventory["eye-drops"] ?? 0).toBe(0); // consumed
  });

  it("Smelling Salts cure paralysis and clear its timer", () => {
    const state = makeState();
    state.items = ITEMS_BY_ID;
    state.inventory = { "smelling-salts": 1 };
    state.party[1].status.push("paralysis");
    state.paralysisTimers["char-1"] = 2;
    const s = resolvePlayerTurn(
      state,
      { kind: "item", actorId: "char-0", itemId: "smelling-salts", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party[1].status.includes("paralysis")).toBe(false);
    expect(s.paralysisTimers["char-1"]).toBeUndefined();
    expect(s.inventory["smelling-salts"] ?? 0).toBe(0);
  });

  it("Greater Healing Potion restores 75 HP", () => {
    const state = makeState();
    state.items = ITEMS_BY_ID;
    state.inventory = { "greater-healing-potion": 1 };
    state.party[1].maxHp = 100;
    state.party[1].hp = 10;
    const s = resolvePlayerTurn(
      state,
      { kind: "item", actorId: "char-0", itemId: "greater-healing-potion", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party[1].hp).toBe(85);
    expect(s.inventory["greater-healing-potion"] ?? 0).toBe(0);
  });

  it("Phoenix Feather revives a KO'd ally at 25% max HP", () => {
    const state = makeState();
    state.items = ITEMS_BY_ID;
    state.inventory = { "phoenix-feather": 1 };
    state.party[1].maxHp = 40;
    state.party[1].hp = 0;
    state.party[1].status.push("knockedOut");
    const s = resolvePlayerTurn(
      state,
      { kind: "item", actorId: "char-0", itemId: "phoenix-feather", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    const revived = s.party[1];
    expect(revived.status.includes("knockedOut")).toBe(false);
    expect(revived.hp).toBe(10); // 25% of 40
    expect(s.events.some((e) => e?.type === "revived")).toBe(true);
    expect(s.inventory["phoenix-feather"] ?? 0).toBe(0);
  });

  it("the shop stocks the answers pack", () => {
    const shop = shopInventory().map((i) => i.id);
    for (const id of ["eye-drops", "smelling-salts", "greater-healing-potion", "phoenix-feather"]) {
      expect(shop).toContain(id);
    }
  });
});

// --- Analyze verb (Direction C) ------------------------------------------------

describe("analyze verb", () => {
  it("marks the species analyzed and records its affinities", () => {
    const state = makeState([makeEnemy("rat-0", {
      special: [{ kind: "weakElement", element: "fire" }, { kind: "resistElement", element: "water" }],
    })]);
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.analyzedEnemies["Test Rat"]).toBe(true);
    expect(s.observedAffinity["Test Rat"]).toEqual({ weak: ["fire"], resist: ["water"] });
    expect(s.events.some((e) => e?.type === "analyze" && e.targetId === "rat-0")).toBe(true);
    expect(s.party.map((c) => c.hp)).toEqual(state.party.map((c) => c.hp)); // no self-harm
  });

  it("is idempotent and harmless to re-analyze", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "weakElement", element: "fire" }] })]);
    state.analyzedEnemies["Test Rat"] = true;
    state.observedAffinity["Test Rat"] = { weak: ["fire"], resist: [] };
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.observedAffinity["Test Rat"].weak).toEqual(["fire"]); // no duplicate
  });

  it("does nothing against a missing target", () => {
    const state = makeState([makeEnemy("rat-0")]);
    const s = resolvePlayerTurn(
      state,
      { kind: "analyze", actorId: "char-0", targetInstanceId: "nope" },
      seqRng([0.5])
    );
    expect(Object.keys(s.analyzedEnemies)).toHaveLength(0);
    expect(s.events.some((e) => e?.type === "analyze")).toBe(false);
  });

  it("works in the round-based resolver too", () => {
    const state = makeState([makeEnemy("rat-0", { special: [{ kind: "evasive" }] })]);
    const s = resolveCombatRound(
      state,
      [
        { kind: "analyze", actorId: "char-0", targetInstanceId: "rat-0" },
        { kind: "defend", actorId: "char-1" },
      ],
      seqRng([0.9])
    );
    expect(s.analyzedEnemies["Test Rat"]).toBe(true);
  });
});

// --- Boss phases (Direction C: Echo) ------------------------------------------

describe("boss phases", () => {
  function bossState(overrides: Partial<EnemyDef> = {}) {
    return makeState([makeEnemy("boss-0", {
      hp: 100, attack: 10, isBoss: true,
      phaseThresholds: [66, 33],
      ...overrides,
    } as Partial<EnemyDef>)]);
  }

  it("crossing a threshold fires phaseChange and bumps attack", () => {
    const state = bossState();
    state.enemies.front[0].currentHp = 65; // below 66%
    const fighter = state.party[0];
    fighter.stats.str = 20;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "boss-0" },
      seqRng([0.5])
    );
    expect(s.bossPhases["boss-0"]).toBe(2);
    expect(s.enemies.front[0].attack).toBe(14); // 10 + 4
    const evt = s.events.find((e) => e?.type === "phaseChange");
    expect(evt).toBeDefined();
    if (evt?.type === "phaseChange") {
      expect(evt.phase).toBe(2);
      expect(evt.name).toBe("Test Rat");
    }
  });

  it("does not refire within the same phase", () => {
    const state = bossState();
    state.enemies.front[0].currentHp = 60;
    state.bossPhases["boss-0"] = 2;
    const fighter = state.party[0];
    fighter.stats.str = 1;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "boss-0" },
      seqRng([0.5])
    );
    expect(s.events.filter((e) => e?.type === "phaseChange")).toHaveLength(0);
    expect(s.enemies.front[0].attack).toBe(10); // unchanged
  });

  it("crossing the second threshold fires phase 3", () => {
    const state = bossState();
    state.enemies.front[0].currentHp = 32;
    state.bossPhases["boss-0"] = 2;
    state.enemies.front[0].attack = 14;
    const fighter = state.party[0];
    fighter.stats.str = 1;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "boss-0" },
      seqRng([0.5])
    );
    expect(s.bossPhases["boss-0"]).toBe(3);
    expect(s.enemies.front[0].attack).toBe(18); // 14 + 4
  });

  it("a hit that skips a threshold fires once with the cumulative bump", () => {
    const state = bossState();
    state.enemies.front[0].currentHp = 30; // below both thresholds, still phase 1
    const fighter = state.party[0];
    fighter.stats.str = 1;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "boss-0" },
      seqRng([0.5])
    );
    expect(s.bossPhases["boss-0"]).toBe(3);
    expect(s.enemies.front[0].attack).toBe(18); // 10 + 8 (two crossings)
    expect(s.events.filter((e) => e?.type === "phaseChange")).toHaveLength(1);
  });

  it("non-bosses with thresholds and bosses without thresholds stay silent", () => {
    const state = makeState([makeEnemy("rat-0", { hp: 100, phaseThresholds: [66] } as Partial<EnemyDef>)]);
    state.enemies.front[0].currentHp = 50;
    const fighter = state.party[0];
    fighter.stats.str = 1;
    fighter.stats.luk = 0;
    const s = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    expect(s.events.some((e) => e?.type === "phaseChange")).toBe(false);
    expect(Object.keys(s.bossPhases)).toHaveLength(0);
  });

  it("works in the round-based resolver too", () => {
    const state = bossState();
    state.enemies.front[0].currentHp = 65;
    const fighter = state.party[0];
    fighter.stats.str = 20;
    fighter.stats.luk = 0;
    const s = resolveCombatRound(
      state,
      [
        { kind: "attack", actorId: "char-0", targetInstanceId: "boss-0" },
        { kind: "defend", actorId: "char-1" },
      ],
      seqRng([0.5])
    );
    expect(s.bossPhases["boss-0"]).toBe(2);
    expect(s.events.some((e) => e?.type === "phaseChange")).toBe(true);
  });
});

describe("Echo phase content (real data)", () => {
  it("the Echo has phase thresholds and both phase abilities", () => {
    const echo = ENEMIES_BY_ID["headmasters-echo"];
    expect(echo.phaseThresholds).toEqual([66, 33]);
    expect(echo.abilityIds).toContain("memory-shatter");
    expect(echo.abilityIds).toContain("total-eclipse");
  });

  it("memory-shatter is a phase-2 single-target drain", () => {
    const ab = enemyAbilityById("memory-shatter");
    expect(ab).toBeDefined();
    expect(ab!.target).toBe("singleParty");
    expect(ab!.condition).toEqual({ kind: "hpBelow", percent: 66 });
    expect(ab!.effect).toMatchObject({ kind: "drain", power: 8 });
    expect(ab!.windUp).toBeFalsy();
  });

  it("total-eclipse is a telegraphed phase-3 party nuke", () => {
    const ab = enemyAbilityById("total-eclipse");
    expect(ab).toBeDefined();
    expect(ab!.target).toBe("allParty");
    expect(ab!.condition).toEqual({ kind: "hpBelow", percent: 33 });
    expect(ab!.effect).toMatchObject({ kind: "damage", power: 10, element: "undead" });
    expect(ab!.windUp).toBe(true);
  });
});

// --- Row swap (Direction C) ---------------------------------------------------

describe("row swap", () => {
  function fourPartyState() {
    const party = makeParty(4, ["Fighter", "Mage", "Thief", "Priest"]);
    return createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false, SPELLS_BY_ID);
  }

  it("swap trades rows with a living ally and normalizes slots", () => {
    const state = fourPartyState();
    const s = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0", targetAllyId: "char-3" },
      seqRng([0.5])
    );
    const fighter = s.party.find((c) => c.id === "char-0")!;
    const priest = s.party.find((c) => c.id === "char-3")!;
    expect(fighter.formationSlot).toBe(3);
    expect(priest.formationSlot).toBe(0);
    // Array order swapped too — the scene reads positions from the array.
    expect(s.party[0].id).toBe("char-3");
    expect(s.party[3].id).toBe("char-0");
    expect(s.log.some((m) => m.includes("swap rows"))).toBe(true);
  });

  it("a fighter moved to the back row can no longer reach with a close weapon", () => {
    const state = fourPartyState();
    const s1 = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0", targetAllyId: "char-3" },
      seqRng([0.5])
    );
    const s2 = resolvePlayerTurn(
      s1,
      { kind: "attack", actorId: "char-0", targetInstanceId: "rat-0" },
      seqRng([0.5])
    );
    // Close-range weapon from the back row cannot reach the front-row enemy.
    expect(s2.enemies.front[0].currentHp).toBe(s2.enemies.front[0].hp);
  });

  it("rejects a KO'd swap partner", () => {
    const state = fourPartyState();
    state.party[3].hp = 0;
    state.party[3].status.push("knockedOut");
    const s = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0", targetAllyId: "char-3" },
      seqRng([0.5])
    );
    expect(s.party.find((c) => c.id === "char-0")!.formationSlot).toBe(0);
    expect(s.party.find((c) => c.id === "char-3")!.formationSlot).toBe(3);
  });

  it("rejects a same-row partner", () => {
    const state = fourPartyState();
    const s = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0", targetAllyId: "char-1" },
      seqRng([0.5])
    );
    expect(s.party.find((c) => c.id === "char-0")!.formationSlot).toBe(0);
    expect(s.party.find((c) => c.id === "char-1")!.formationSlot).toBe(1);
  });

  it("slides into an empty back-row slot", () => {
    const state = fourPartyState(); // back row has only char-3
    const s = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0" },
      seqRng([0.5])
    );
    expect(s.party.find((c) => c.id === "char-0")!.formationSlot).toBe(3); // first vacated back slot (dense packing)
    expect(s.log.some((m) => m.includes("falls back"))).toBe(true);
  });

  it("rejects a slide when the target row is full", () => {
    const party = makeParty(6);
    const state = createCombatState(party, { front: [makeEnemy("rat-0")], back: [] }, false, SPELLS_BY_ID);
    const s = resolvePlayerTurn(
      state,
      { kind: "move", actorId: "char-0" },
      seqRng([0.5])
    );
    expect(s.party.find((c) => c.id === "char-0")!.formationSlot).toBe(0);
  });

  it("works in the round-based resolver too", () => {
    const state = fourPartyState();
    const s = resolveCombatRound(
      state,
      [
        { kind: "move", actorId: "char-0", targetAllyId: "char-3" },
        { kind: "defend", actorId: "char-1" },
        { kind: "defend", actorId: "char-2" },
        { kind: "defend", actorId: "char-3" },
      ],
      seqRng([0.9])
    );
    expect(s.party.find((c) => c.id === "char-0")!.formationSlot).toBe(3);
  });
});
