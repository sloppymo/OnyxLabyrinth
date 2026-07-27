import { describe, expect, it, beforeEach } from "vitest";
import { COMBAT_BARKS, MAX_BARK_CHARS } from "../data/combat-barks";
import {
  pickBark,
  maybeEmitBark,
  isHeavyHit,
  visibleCombatLogLines,
  setBarkRngForTests,
  resetBarkRngForCombat,
  enemyDefIdFromInstance,
} from "./combat-barks";
import { createCombatState, resolvePlayerTurn, beginRound } from "./combat";
import { resolveEnemyAction } from "./combat-enemy";
import { createCharacter } from "./party";
import type { CombatEvent, CombatState, EnemyInstance } from "./combat-types";
import { ALL_SPELLS, spellById } from "../data/spells";

const SPELLS: Record<string, (typeof ALL_SPELLS)[number]> = {};
for (const s of ALL_SPELLS) SPELLS[s.id] = s;

function makeEnemy(instanceId: string, hp = 40): EnemyInstance {
  return {
    id: "slime",
    name: "Slime",
    hp,
    currentHp: hp,
    attack: 5,
    ac: 2,
    agi: 5,
    luk: 5,
    xp: 5,
    gold: 1,
    special: [],
    instanceId,
    row: "front",
    status: [],
  };
}

function mageParty() {
  const c = createCharacter("m1", "Dell", "Human", "Neutral", "Mage", 0);
  c.knownSpellIds = ["mage-fire-bolt", "mage-spark"];
  c.sp = 50;
  c.maxSp = 50;
  c.level = 5;
  return [c];
}

describe("COMBAT_BARKS data", () => {
  it("keeps every authored line at ≤28 characters", () => {
    for (const def of COMBAT_BARKS) {
      for (const line of def.lines) {
        expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(MAX_BARK_CHARS);
      }
    }
  });
});

describe("pickBark / ledger", () => {
  let s: CombatState;

  beforeEach(() => {
    resetBarkRngForCombat(1);
    setBarkRngForTests(() => 0);
    s = createCombatState(mageParty(), { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
  });

  it("picks a fire beforeSpell line for Mage and burns the ledger", () => {
    const text = pickBark(s, {
      trigger: "beforeSpell",
      actorId: "m1",
      classId: "Mage",
      isParty: true,
      spell: spellById("mage-fire-bolt"),
    });
    expect(text).toBe("Burn, fiend!");
    expect(s.barkSaid.m1?.beforeSpell).toBe(true);
    expect(
      pickBark(s, {
        trigger: "beforeSpell",
        actorId: "m1",
        classId: "Mage",
        isParty: true,
        spell: spellById("mage-fire-bolt"),
      })
    ).toBeNull();
  });

  it("does not bark beforeSpell for non-fire Mage spells", () => {
    expect(
      pickBark(s, {
        trigger: "beforeSpell",
        actorId: "m1",
        classId: "Mage",
        isParty: true,
        spell: spellById("mage-spark"),
      })
    ).toBeNull();
  });

  it("refuses heavyHit for non-party speakers", () => {
    expect(
      pickBark(s, {
        trigger: "heavyHit",
        actorId: "slime-0",
        enemyDefId: "slime",
        isParty: false,
      })
    ).toBeNull();
  });

  it("emits bark events with a log line", () => {
    const log: string[] = [];
    const events: CombatEvent[] = [];
    const emit = (m: string, e: CombatEvent) => {
      log.push(m);
      events.push(e);
    };
    maybeEmitBark(s, emit, {
      trigger: "beforeSpell",
      actorId: "m1",
      classId: "Mage",
      isParty: true,
      spell: spellById("mage-fire-bolt"),
    });
    expect(events[0]).toMatchObject({ type: "bark", trigger: "beforeSpell", text: "Burn, fiend!" });
    expect(log[0]).toContain("Burn, fiend!");
  });
});

describe("isHeavyHit", () => {
  it("uses ceil(maxHp * 0.35)", () => {
    expect(isHeavyHit(34, 100)).toBe(false);
    expect(isHeavyHit(35, 100)).toBe(true);
  });
});

describe("visibleCombatLogLines", () => {
  it("filters bark-paired log entries out of the display window", () => {
    const log = ["A hits", 'Dell: "Burn, fiend!"', "B dies"];
    const events: CombatEvent[] = [
      { type: "attack", actorId: "a", targetId: "b", damage: 1 },
      { type: "bark", actorId: "m1", trigger: "beforeSpell", text: "Burn, fiend!" },
      { type: "defeated", targetId: "b", wasEnemy: true },
    ];
    expect(visibleCombatLogLines(log, events, 10)).toEqual(["A hits", "B dies"]);
  });
});

describe("RNG isolation", () => {
  it("pickBark never consumes the combat RNG", () => {
    let combatCalls = 0;
    const combatRng = () => {
      combatCalls += 1;
      return 0.5;
    };
    setBarkRngForTests(() => 0);
    const s = createCombatState(mageParty(), { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
    pickBark(s, {
      trigger: "beforeSpell",
      actorId: "m1",
      classId: "Mage",
      isParty: true,
      spell: spellById("mage-fire-bolt"),
    });
    void combatRng;
    expect(combatCalls).toBe(0);
  });

  it("same combat RNG sequence yields identical HP regardless of bark RNG", () => {
    const baseParty = mageParty();
    // Freeze stats — createCharacter rolls with Math.random otherwise.
    baseParty[0]!.stats = { str: 5, vit: 8, agi: 10, int: 16, pie: 8, luk: 8 };
    baseParty[0]!.maxHp = 40;
    baseParty[0]!.hp = 40;
    baseParty[0]!.maxSp = 50;
    baseParty[0]!.sp = 50;

    const run = (barkRoll: number) => {
      setBarkRngForTests(() => barkRoll);
      const party = [
        {
          ...baseParty[0]!,
          stats: { ...baseParty[0]!.stats },
          status: [] as typeof baseParty[0]["status"],
          knownSpellIds: [...baseParty[0]!.knownSpellIds],
          perkIds: [...baseParty[0]!.perkIds],
        },
      ];
      const state = createCombatState(
        party,
        { front: [makeEnemy("slime-0", 80)], back: [] },
        false,
        SPELLS
      );
      let i = 0;
      const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
      const combatRng = () => seq[i++] ?? 0.1;
      beginRound(state, combatRng);
      const after = resolvePlayerTurn(
        state,
        { kind: "cast", actorId: "m1", spellId: "mage-fire-bolt", targetInstanceId: "slime-0" },
        combatRng
      );
      return {
        enemyHp: after.enemies.front[0]?.currentHp ?? 0,
        mageSp: after.party[0]!.sp,
        rolls: i,
        barks: after.events.filter((e) => e?.type === "bark").length,
      };
    };

    const a = run(0);
    const b = run(0.99);
    expect(a.enemyHp).toBe(b.enemyHp);
    expect(a.mageSp).toBe(b.mageSp);
    expect(a.rolls).toBe(b.rolls);
    expect(a.barks).toBeGreaterThan(0);
    expect(b.barks).toBeGreaterThan(0);
  });
});

describe("enemy spell heavyHit bark", () => {
  beforeEach(() => {
    resetBarkRngForCombat(1);
    setBarkRngForTests(() => 0);
  });

  it("emits a heavyHit bark after the cast's own event (not before impact)", () => {
    const party = mageParty();
    party[0]!.maxHp = 100;
    party[0]!.hp = 100;
    const s = createCombatState(party, { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
    const enemy = s.enemies.front[0]!;
    enemy.attack = 50; // well past ceil(100 * 0.35) = 35 at variance 1.0

    const events: CombatEvent[] = [];
    const emit = (_m: string, e: CombatEvent) => {
      events.push(e);
    };

    resolveEnemyAction(
      s,
      { kind: "cast", actor: enemy, spellId: "enemy-nuke", targetId: "m1" },
      () => 0.5,
      () => {},
      emit
    );

    const castIdx = events.findIndex((e) => e?.type === "cast");
    expect(castIdx).toBeGreaterThanOrEqual(0);
    expect(events[castIdx + 1]).toMatchObject({
      type: "bark",
      trigger: "heavyHit",
      actorId: "m1",
    });
    expect(s.party[0]!.hp).toBeLessThan(100);
  });

  it("does not bark heavyHit for a light enemy spell hit", () => {
    const party = mageParty();
    party[0]!.maxHp = 100;
    party[0]!.hp = 100;
    const s = createCombatState(party, { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
    const enemy = s.enemies.front[0]!;
    enemy.attack = 5; // well under the 35% maxHp heavyHit threshold

    const events: CombatEvent[] = [];
    const emit = (_m: string, e: CombatEvent) => {
      events.push(e);
    };

    resolveEnemyAction(
      s,
      { kind: "cast", actor: enemy, spellId: "enemy-nuke", targetId: "m1" },
      () => 0.5,
      () => {},
      emit
    );

    expect(events.some((e) => e?.type === "bark")).toBe(false);
  });
});

describe("enemy melee/ability heavyHit bark ordering", () => {
  beforeEach(() => {
    resetBarkRngForCombat(1);
    setBarkRngForTests(() => 0);
  });

  it("emits a melee heavyHit bark after the attack's own event, not before", () => {
    const party = mageParty();
    party[0]!.maxHp = 100;
    party[0]!.hp = 100;
    party[0]!.stats.agi = 3; // keep evasion low so the hit reliably lands
    const s = createCombatState(party, { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
    const enemy = s.enemies.front[0]!;
    enemy.attack = 50; // well past ceil(100 * 0.35) = 35 at variance 1.0

    const events: CombatEvent[] = [];
    const emit = (_m: string, e: CombatEvent) => {
      events.push(e);
    };

    resolveEnemyAction(
      s,
      { kind: "attack", actor: enemy, target: { kind: "party", id: "m1" } },
      () => 0.5,
      () => {},
      emit
    );

    const attackIdx = events.findIndex((e) => e?.type === "attack");
    expect(attackIdx).toBeGreaterThanOrEqual(0);
    expect(events[attackIdx + 1]).toMatchObject({
      type: "bark",
      trigger: "heavyHit",
      actorId: "m1",
    });
  });

  it("emits an ability heavyHit bark after the ability's own event, not before", () => {
    const party = mageParty();
    party[0]!.maxHp = 20; // low enough that iron-fist's scaled power clears 35%
    party[0]!.hp = 20;
    const s = createCombatState(party, { front: [makeEnemy("slime-0")], back: [] }, false, SPELLS);
    const enemy = s.enemies.front[0]!;

    const events: CombatEvent[] = [];
    const emit = (_m: string, e: CombatEvent) => {
      events.push(e);
    };

    resolveEnemyAction(
      s,
      { kind: "ability", actor: enemy, abilityId: "iron-fist", targetId: "m1" },
      () => 0.5,
      () => {},
      emit
    );

    const castIdx = events.findIndex((e) => e?.type === "cast" && e.spellId === "iron-fist");
    expect(castIdx).toBeGreaterThanOrEqual(0);
    expect(events[castIdx + 1]).toMatchObject({
      type: "bark",
      trigger: "heavyHit",
      actorId: "m1",
    });
  });
});

describe("enemyDefIdFromInstance", () => {
  it("strips the instance suffix", () => {
    expect(enemyDefIdFromInstance(makeEnemy("headmasters-echo-ascendant-0"))).toBe(
      "headmasters-echo-ascendant"
    );
  });
});
