/**
 * Adversarial smoke: cast every spell once through the real resolvers.
 * Catches throws, silent no-ops that still spend SP incorrectly, and
 * effect-kind gaps in applySpell / castUtilitySpell.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_SPELLS,
  isUtilitySpell,
  type SpellDef,
  type SpellTarget,
} from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import { createCharacterRecord, applyCombatPartyResult, type Character } from "./party";
import {
  createCombatState,
  resolvePlayerTurn,
} from "./combat";
import { resolveEnemyAction } from "./combat-enemy";
import type { EnemyInstance, CombatState } from "./combat-types";
import { createGameState } from "./state";
import { FLOORS } from "../data/floors";
import { castUtilitySpell } from "./persistent-spells";
import { buildSolidGrid, carveRoom, setEdge } from "./dungeon";

const SPELLS = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s])) as Record<
  string,
  SpellDef
>;
const ITEMS = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

const COMBAT_SPELLS = ALL_SPELLS.filter((s) => !isUtilitySpell(s));
const UTILITY_SPELLS = ALL_SPELLS.filter((s) => isUtilitySpell(s));

function makeEnemy(
  instanceId: string,
  overrides: Partial<EnemyInstance> = {}
): EnemyInstance {
  return {
    id: "smoke-rat",
    name: "Smoke Rat",
    floors: [1],
    rowPreference: "front",
    hp: 200,
    attack: 8,
    ac: 0,
    agi: 5,
    xp: 1,
    gold: 1,
    special: [],
    isBoss: false,
    instanceId,
    currentHp: 200,
    row: "front",
    status: [],
    ...overrides,
  };
}

function prepCaster(spell: SpellDef): Character {
  const c = createCharacterRecord(
    "caster",
    spell.class,
    "Human",
    "Neutral",
    spell.class,
    0
  );
  c.level = 20;
  c.maxHp = 200;
  c.hp = 200;
  c.maxSp = 999;
  c.sp = 999;
  c.knownSpellIds = [spell.id];
  return c;
}

function prepAlly(): Character {
  const a = createCharacterRecord("ally", "Ally", "Human", "Neutral", "Fighter", 1);
  a.maxHp = 200;
  a.hp = 100; // wounded so heals have room
  a.sp = 50;
  a.maxSp = 50;
  return a;
}

function actionFor(
  spell: SpellDef,
  casterId: string,
  opts: {
    enemyId?: string;
    allyId?: string;
    koAllyId?: string;
  }
): Parameters<typeof resolvePlayerTurn>[1] {
  const base = { kind: "cast" as const, actorId: casterId, spellId: spell.id };
  const t: SpellTarget = spell.target;
  if (t === "singleEnemy" || t === "groupEnemies") {
    return { ...base, targetInstanceId: opts.enemyId };
  }
  if (t === "singleAlly" || t === "groupAllies") {
    // Resurrect needs a KO target.
    if (spell.effect.kind === "resurrect") {
      return { ...base, targetAllyId: opts.koAllyId ?? opts.allyId };
    }
    return { ...base, targetAllyId: opts.allyId };
  }
  return base;
}

function softAssertEffect(spell: SpellDef, before: CombatState, after: CombatState): void {
  const eff = spell.effect;
  const logs = after.log.slice(before.log.length).join("\n");
  const events = after.events.slice(before.events.length);

  // Always: either SP dropped, or the cast was blocked with a message.
  const casterBefore = before.party.find((c) => c.id === "caster")!;
  const casterAfter = after.party.find((c) => c.id === "caster")!;
  const spent = casterAfter.sp < casterBefore.sp;
  const blocked =
    /lacks the SP|cannot cast|antimagic|fizzle|no target|already|in no state/i.test(
      logs
    );
  expect(
    spent || blocked || events.length > 0 || after.log.length > before.log.length,
    `${spell.id}: cast produced no SP spend, log, or events`
  ).toBe(true);

  switch (eff.kind) {
    case "damage": {
      const beforeHp = [...before.enemies.front, ...before.enemies.back].reduce(
        (s, e) => s + e.currentHp,
        0
      );
      const afterHp = [...after.enemies.front, ...after.enemies.back].reduce(
        (s, e) => s + e.currentHp,
        0
      );
      if (spent) {
        expect(afterHp, `${spell.id}: damage spell dealt 0`).toBeLessThan(beforeHp);
      }
      break;
    }
    case "heal": {
      if (spent) {
        const ally = after.party.find((c) => c.id === "ally");
        const beforeAlly = before.party.find((c) => c.id === "ally");
        const self = after.party.find((c) => c.id === "caster");
        const beforeSelf = before.party.find((c) => c.id === "caster");
        if (spell.target === "self" && self && beforeSelf) {
          // Self-heals rarely exist; allow equal if already full.
          expect(self.hp).toBeGreaterThanOrEqual(beforeSelf.hp);
        } else if (ally && beforeAlly) {
          expect(ally.hp, `${spell.id}: heal did not raise ally HP`).toBeGreaterThan(
            beforeAlly.hp
          );
        }
      }
      break;
    }
    case "buff": {
      if (spent) {
        const id = spell.target === "self" ? "caster" : "ally";
        expect(
          (after.armorBuffs[id] ?? 0) > (before.armorBuffs[id] ?? 0),
          `${spell.id}: armor buff missing`
        ).toBe(true);
      }
      break;
    }
    case "cure": {
      if (spent && "status" in eff) {
        const ally = after.party.find((c) => c.id === "ally");
        expect(ally?.status.includes(eff.status)).toBe(false);
      }
      break;
    }
    case "disable": {
      if (spent && "status" in eff) {
        const hit = [...after.enemies.front, ...after.enemies.back].some((e) =>
          e.status.includes(eff.status)
        );
        const resisted = /resists|fails|miss/i.test(logs);
        expect(hit || resisted, `${spell.id}: disable neither landed nor logged resist`).toBe(
          true
        );
      }
      break;
    }
    case "fizzleField": {
      if (spent) {
        expect(
          after.enemyFizzleFields.front + after.enemyFizzleFields.back
        ).toBeGreaterThan(
          before.enemyFizzleFields.front + before.enemyFizzleFields.back
        );
      }
      break;
    }
    case "combatStatus": {
      if (!spent) break;
      if (eff.status === "shrunk") {
        const e = after.enemies.front[0];
        expect(e?.status.includes("shrunk"), `${spell.id}: shrunk not applied`).toBe(
          true
        );
      } else {
        const ally = after.party.find((c) => c.id === "ally");
        expect(
          ally?.status.includes("giantStrength"),
          `${spell.id}: giantStrength not applied`
        ).toBe(true);
      }
      break;
    }
    case "summon": {
      if (spent) {
        expect(
          after.summonedAllies.length,
          `${spell.id}: expected a summon`
        ).toBeGreaterThan(before.summonedAllies.length);
      }
      break;
    }
    case "magicScreen": {
      if (spent) expect(after.magicScreen).toBeGreaterThan(0);
      break;
    }
    case "dispelMagic": {
      // Always succeeds as a cast; may find nothing.
      expect(spent || blocked).toBe(true);
      break;
    }
    case "resurrect": {
      if (spent) {
        const ko = after.party.find((c) => c.id === "ko");
        expect(ko && !ko.status.includes("knockedOut") && ko.hp > 0).toBe(true);
      }
      break;
    }
    default:
      break;
  }
}

describe("combat spell smoke (every non-utility spell)", () => {
  it.each(COMBAT_SPELLS.map((s) => [s.id, s] as const))(
    "casts %s without throwing",
    (_id, spell) => {
      const caster = prepCaster(spell);
      const ally = prepAlly();
      const ko = createCharacterRecord("ko", "Dead", "Human", "Neutral", "Fighter", 2);
      ko.hp = 0;
      ko.maxHp = 80;
      ko.status = ["knockedOut"];

      const needKo = spell.effect.kind === "resurrect";
      const party = needKo ? [caster, ally, ko] : [caster, ally];

      // Pre-seed statuses some cures/dispels want to touch.
      if (spell.effect.kind === "cure") {
        ally.status = [spell.effect.status];
        if (spell.effect.status === "poison") {
          /* poisonState filled after combat start */
        }
      }

      // Undead-element spells (Sacred Flame / Sunburst) no-op on living foes
      // by design — seed undead specials so the damage assert is meaningful.
      const undead =
        spell.effect.kind === "damage" && spell.effect.element === "undead";
      const undeadSpecial = undead
        ? ([{ kind: "undead" as const }] as EnemyInstance["special"])
        : [];

      let state = createCombatState(
        party,
        {
          front: [
            makeEnemy("e0", { special: undeadSpecial }),
            makeEnemy("e1", {
              row: "front",
              instanceId: "e1",
              special: undeadSpecial,
            }),
          ],
          back: [
            makeEnemy("e2", {
              row: "back",
              instanceId: "e2",
              special: undeadSpecial,
            }),
          ],
        },
        false,
        SPELLS,
        ITEMS
      );

      if (spell.effect.kind === "cure" && spell.effect.status === "poison") {
        state.poisonState[ally.id] = { damage: 3, duration: 2 };
      }
      if (spell.effect.kind === "dispelMagic") {
        state.enemyMagicScreens = { front: 2, back: 1 };
        state.enemyFizzleFields = { front: 1, back: 0 };
        state.partyFizzleField = 1;
        state.enemies.front[0]!.status = ["shrunk"];
        state.party.find((c) => c.id === "ally")!.status = ["giantStrength"];
        state.giantStrengthTimers[ally.id] = 2;
      }

      const before = structuredClone(state);
      const action = actionFor(spell, caster.id, {
        enemyId: "e0",
        allyId: ally.id,
        koAllyId: ko.id,
      });

      expect(() => {
        state = resolvePlayerTurn(state, action, () => 0.5);
      }).not.toThrow();

      softAssertEffect(spell, before, state);
    }
  );
});

describe("utility spell smoke (every utility spell)", () => {
  it.each(UTILITY_SPELLS.map((s) => [s.id, s] as const))(
    "casts %s without throwing",
    (_id, spell) => {
      const state = createGameState(FLOORS[0]);
      const grid = buildSolidGrid(6, 6);
      carveRoom(grid, 1, 1, 4, 4);
      // Knock/Unseal require a locked door ahead — place one east of (1,1).
      setEdge(grid, 1, 1, "e", "locked");
      setEdge(grid, 2, 1, "w", "locked");
      state.floor = {
        ...state.floor,
        id: 1,
        grid,
        startX: 1,
        startY: 1,
        lockedDoors: [{ x: 1, y: 1, dir: "e", keyId: "test-key" }],
        treasures: [],
        teleporters: [],
        chuteDrops: [],
        encounterRate: 0,
      };
      state.mode = "dungeon";
      state.player = {
        x: 1,
        y: 1,
        facing: spell.effect.kind === "knock" ? 1 : 0,
      };

      const cls = spell.class;
      let caster = state.party.find((c) => c.class === cls);
      if (!caster) {
        caster = createCharacterRecord("u0", cls, "Human", "Neutral", cls, 0);
        state.party.push(caster);
      }
      caster.hp = Math.max(1, caster.hp);
      caster.sp = 999;
      caster.maxSp = 999;
      if (!caster.knownSpellIds.includes(spell.id)) {
        caster.knownSpellIds = [...caster.knownSpellIds, spell.id];
      }

      const spBefore = caster.sp;
      let msg = "";
      expect(() => {
        msg = castUtilitySpell(state, caster!.id, spell.id);
      }).not.toThrow();
      expect(msg.length, `${spell.id}: empty utility cast message`).toBeGreaterThan(0);
      expect(caster.sp, `${spell.id}: SP not spent (${msg})`).toBeLessThan(spBefore);
    }
  );
});

describe("undead-element spells", () => {
  it("Sacred Flame no-ops on living foes and damages undead", () => {
    const priest = prepCaster(SPELLS["priest-sacred-flame"]!);
    const living = makeEnemy("living");
    const undead = makeEnemy("undead", {
      special: [{ kind: "undead" }],
      instanceId: "undead",
    });
    let s = createCombatState(
      [priest],
      { front: [living, undead], back: [] },
      false,
      SPELLS,
      ITEMS
    );
    s = resolvePlayerTurn(
      s,
      {
        kind: "cast",
        actorId: priest.id,
        spellId: "priest-sacred-flame",
        targetInstanceId: "living",
      },
      () => 0.5
    );
    expect(s.enemies.front.find((e) => e.instanceId === "living")!.currentHp).toBe(
      200
    );
    expect(s.log.some((l) => /not undead/i.test(l))).toBe(true);

    s = resolvePlayerTurn(
      s,
      {
        kind: "cast",
        actorId: priest.id,
        spellId: "priest-sacred-flame",
        targetInstanceId: "undead",
      },
      () => 0.5
    );
    expect(
      s.enemies.front.find((e) => e.instanceId === "undead")!.currentHp
    ).toBeLessThan(200);
  });
});

describe("Shrink hits summoned allies", () => {
  it("halves enemy physical damage vs summons", () => {
    const mage = prepCaster(SPELLS["mage-shrink"]!);
    let s = createCombatState(
      [mage],
      { front: [makeEnemy("e0")], back: [] },
      false,
      SPELLS,
      ITEMS
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
    const logs: string[] = [];
    resolveEnemyAction(
      s,
      {
        kind: "attack",
        actor: s.enemies.front[0]!,
        target: { kind: "ally", id: "sum-0" },
      },
      () => 0.5,
      (m) => logs.push(m),
      (m) => logs.push(m)
    );
    // rng 0.5 → variance 1.0 → dmg 8, then ×0.5 Shrink → 4
    expect(s.summonedAllies[0]!.hp).toBe(36);
  });
});

describe("Giant Strength does not leak between fights", () => {
  it("applyCombatPartyResult strips giantStrength", () => {
    const fighter = createCharacterRecord("f0", "Fighter", "Human", "Neutral", "Fighter", 0);
    fighter.status = ["giantStrength", "poison", "knockedOut"];
    fighter.hp = 0;
    const out = applyCombatPartyResult([fighter]);
    expect(out[0]!.status).toEqual(["poison", "knockedOut"]);
  });
});

describe("combat spell corpus integrity", () => {
  it("has unique ids", () => {
    const ids = ALL_SPELLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
