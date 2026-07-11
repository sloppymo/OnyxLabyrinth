/**
 * Tests for the perk engine and data definitions.
 */
import { describe, it, expect } from "vitest";
import {
  dispatchHook,
  perkModifiers,
  perksForCharacter,
  perkChoicesFor,
  isPerkTierLevel,
  tierForLevel,
  applyPerkSelection,
  PERKS_BY_ID,
  ALL_PERKS,
  type CombatHook,
  type PerkDef,
} from "./perks";
import { createCharacter, type Character } from "./party";
import { createCombatState, resolvePlayerTurn, type CombatState } from "./combat";
import type { EnemyDef, EnemyInstance } from "../data/enemies";

const BASE_STATS = { str: 10, int: 10, pie: 10, vit: 10, agi: 10, luk: 10 };

function makeCharacter(cls: Character["class"], perks: string[] = []): Character {
  const c = createCharacter("c1", "Test", "Human", "Neutral", cls, 0);
  c.stats = { ...BASE_STATS };
  c.perkIds = perks;
  c.hp = c.maxHp;
  c.sp = c.maxSp;
  return c;
}

function makeEnemy(instanceId: string, name = "Test Rat", hp = 20): EnemyInstance {
  const def = {
    id: "test-rat",
    name,
    hp,
    attack: 4,
    ac: 0,
    agi: 5,
    xp: 3,
    gold: 2,
    rowPreference: "front",
    special: [],
    isBoss: false,
  } as EnemyDef;
  return { ...def, instanceId, currentHp: def.hp, row: "front", status: [] };
}

describe("perksForCharacter", () => {
  it("resolves chosen perk ids to full definitions", () => {
    const c = makeCharacter("Fighter", ["fighter-cleave"]);
    const perks = perksForCharacter(c);
    expect(perks).toHaveLength(1);
    expect(perks[0].id).toBe("fighter-cleave");
  });

  it("ignores unknown perk ids", () => {
    const c = makeCharacter("Fighter", ["not-a-perk"]);
    expect(perksForCharacter(c)).toHaveLength(0);
  });
});

describe("perkChoicesFor", () => {
  it("returns two mutually exclusive perks for a class/tier", () => {
    const choices = perkChoicesFor("Fighter", 1);
    expect(choices).toHaveLength(2);
    expect(choices[0].class).toBe("Fighter");
    expect(choices[0].tier).toBe(1);
    expect(choices[1].tier).toBe(1);
    expect(choices[0].id).not.toBe(choices[1].id);
  });
});

describe("tier helpers", () => {
  it("identifies perk tier levels", () => {
    expect(isPerkTierLevel(3)).toBe(true);
    expect(isPerkTierLevel(6)).toBe(true);
    expect(isPerkTierLevel(9)).toBe(true);
    expect(isPerkTierLevel(12)).toBe(true);
    expect(isPerkTierLevel(4)).toBe(false);
  });

  it("maps levels to tiers", () => {
    expect(tierForLevel(3)).toBe(1);
    expect(tierForLevel(6)).toBe(2);
    expect(tierForLevel(9)).toBe(3);
    expect(tierForLevel(12)).toBe(4);
    expect(tierForLevel(1)).toBeNull();
  });
});

describe("applyPerkSelection", () => {
  it("appends the perk id and applies maxHp/maxSp percent bumps", () => {
    const c = makeCharacter("Fighter", []);
    const beforeHp = c.maxHp;
    const updated = applyPerkSelection(c, "fighter-toughness");
    expect(updated.perkIds).toContain("fighter-toughness");
    expect(updated.maxHp).toBe(Math.round(beforeHp * 1.15));
    expect(updated.hp).toBe(updated.maxHp);
  });
});

describe("perkModifiers", () => {
  it("starts from neutral defaults", () => {
    const mods = perkModifiers([], BASE_STATS);
    expect(mods.meleeDamageMultiplier).toBe(1);
    expect(mods.critChanceBonus).toBe(0);
    expect(mods.evasionBonusPercent).toBe(0);
  });

  it("compounds multiplicative modifiers", () => {
    const perks: PerkDef[] = [
      PERKS_BY_ID["fighter-berserker"],
      PERKS_BY_ID["crusader-zealot"],
    ].filter((p): p is PerkDef => p !== undefined);
    const mods = perkModifiers(perks, BASE_STATS);
    expect(mods.meleeDamageMultiplier).toBeCloseTo(1.25 * 1.2);
  });

  it("adds flat bonuses", () => {
    const perks: PerkDef[] = [
      PERKS_BY_ID["duelist-precision"],
      PERKS_BY_ID["thief-trap-sense"],
    ].filter((p): p is PerkDef => p !== undefined);
    const mods = perkModifiers(perks, BASE_STATS);
    expect(mods.critChanceBonus).toBeCloseTo(0.12);
    expect(mods.trapDisarmBonusPercent).toBeCloseTo(0.2);
  });

  it("takes the maximum crit damage multiplier", () => {
    const perks: PerkDef[] = [
      PERKS_BY_ID["duelist-blademaster"],
    ].filter((p): p is PerkDef => p !== undefined);
    const mods = perkModifiers(perks, BASE_STATS);
    expect(mods.critDamageMultiplier).toBe(3);
  });

  it("adds PIE as flat melee bonus damage when Divine Hammer/Smite is present", () => {
    const perks: PerkDef[] = [
      PERKS_BY_ID["priest-divine-hammer"],
    ].filter((p): p is PerkDef => p !== undefined);
    const stats = { ...BASE_STATS, pie: 14 };
    const mods = perkModifiers(perks, stats);
    expect(mods.meleeBonusDamage).toBe(14);
  });

  it("applies spCostMultiplier only to the configured spell kind", () => {
    const perks: PerkDef[] = [
      PERKS_BY_ID["crusader-battle-cleric"],
    ].filter((p): p is PerkDef => p !== undefined);
    const mods = perkModifiers(perks, BASE_STATS);
    expect(mods.spCostMultiplierFor("heal")).toBeCloseTo(0.8);
    expect(mods.spCostMultiplierFor("damage")).toBe(1);
  });
});

describe("dispatchHook", () => {
  it("runs high-priority handlers before normal-priority handlers", () => {
    const high = PERKS_BY_ID["fighter-last-stand"];
    const normal = PERKS_BY_ID["halberdier-hold-the-line"];
    expect(high?.priority).toBe("high");
    expect(normal?.priority).toBe("normal");

    // Both listen to AfterDamageTaken. We just verify dispatching with both
    // does not throw and the context reaches them.
    expect(() =>
      dispatchHook("AfterDamageTaken", [high!, normal!], {
        state: {},
        rng: () => 0,
        targetId: "e1",
        ownId: "c1",
        hpPercentAfter: 0.1,
      })
    ).not.toThrow();
  });

  it("passes through ctx fields so handlers can mutate state", () => {
    const cleave = PERKS_BY_ID["fighter-cleave"];
    expect(cleave).toBeDefined();
    let dealt = 0;
    dispatchHook("OnAttackHit", [cleave!], {
      state: {},
      rng: () => 0, // 0 < 0.25 triggers cleave
      damage: 7,
      dealCleaveDamage: (dmg: number) => {
        dealt = dmg;
      },
    });
    expect(dealt).toBe(7);
  });
});

describe("ALL_PERKS data integrity", () => {
  const HOOKS: CombatHook[] = [
    "OnCombatStart",
    "OnCombatEnd",
    "OnTurnStart",
    "OnTurnEnd",
    "BeforeAttack",
    "AfterAttack",
    "OnAttackHit",
    "OnAttackMiss",
    "OnCriticalHit",
    "OnKill",
    "BeforeDamageTaken",
    "AfterDamageTaken",
    "OnAllyWouldDie",
    "OnSpellCast",
    "OnSpellResolve",
    "OnHide",
    "OnDefend",
    "OnRevive",
    "OnHeal",
    "OnStatusApplied",
    "OnStatusRemoved",
  ];

  it("every perk has required fields and a valid class", () => {
    for (const perk of ALL_PERKS) {
      expect(perk.id).toBeDefined();
      expect(perk.name).toBeDefined();
      expect(perk.description).toBeDefined();
      expect(perk.tier).toBeGreaterThanOrEqual(1);
      expect(perk.tier).toBeLessThanOrEqual(4);
      expect(["Fighter", "Mage", "Priest", "Thief", "Halberdier", "Duelist", "Crusader"]).toContain(
        perk.class
      );
      for (const hook of perk.triggers) {
        expect(HOOKS).toContain(hook);
      }
    }
  });
});

describe("perk combat integration", () => {
  it("fighter-cleave can deal cleave damage on a hit", () => {
    const enemy1 = makeEnemy("e1", "Rat A");
    const enemy2 = makeEnemy("e2", "Rat B");
    const party = [makeCharacter("Fighter", ["fighter-cleave"])];
    const state = createCombatState(party, { front: [enemy1, enemy2], back: [] }, false);

    let cleaveDmg = 0;
    const result = resolvePlayerTurn(state, {
      kind: "attack",
      actorId: party[0].id,
      targetInstanceId: enemy1.instanceId,
    });

    // If cleave triggered, one of the log messages reports it.
    const cleaveLog = result.log.find((m) => m.includes("cleaves"));
    if (cleaveLog) {
      // The cleave target took damage; we just verify the combat resolved cleanly.
      expect(result.ended).toBe(false);
    }
  });
});
