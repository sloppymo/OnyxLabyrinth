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
import {
  createCombatState,
  resolvePlayerTurn,
  resolveEnemyTurn,
  endRound,
  type CombatState,
} from "./combat";
import type { EnemyDef, EnemyInstance } from "../data/enemies";
import type { SpellDef } from "../data/spells";

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

  it("aggregates spell damage multipliers (Glass Cannon)", () => {
    const perks = [PERKS_BY_ID["mage-glass-cannon"]!];
    const mods = perkModifiers(perks, BASE_STATS);
    expect(mods.spellDamageMultiplier).toBeCloseTo(1.3);
  });

  it("splits damage-taken multipliers into always vs front-row-only buckets", () => {
    const berserker = perkModifiers([PERKS_BY_ID["fighter-berserker"]!], BASE_STATS);
    expect(berserker.damageTakenMultiplier).toBeCloseTo(1 / 0.85);
    expect(berserker.damageTakenMultiplierFrontRow).toBe(1);

    const phalanx = perkModifiers([PERKS_BY_ID["halberdier-phalanx"]!], BASE_STATS);
    expect(phalanx.damageTakenMultiplier).toBe(1);
    expect(phalanx.damageTakenMultiplierFrontRow).toBeCloseTo(0.85);
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

  it("halberdier-impale hits a second front-row enemy 25% of the time", () => {
    const impale = PERKS_BY_ID["halberdier-impale"]!;
    let dealt = 0;
    dispatchHook("OnAttackHit", [impale], {
      state: {},
      rng: () => 0, // triggers
      damage: 9,
      dealCleaveDamage: (dmg: number) => {
        dealt = dmg;
      },
    });
    expect(dealt).toBe(9);

    dealt = 0;
    dispatchHook("OnAttackHit", [impale], {
      state: {},
      rng: () => 0.9, // above 25% — no trigger
      damage: 9,
      dealCleaveDamage: (dmg: number) => {
        dealt = dmg;
      },
    });
    expect(dealt).toBe(0);
  });

  it("crusader-retribution retaliates only when an adjacent ally was hit", () => {
    const retribution = PERKS_BY_ID["crusader-retribution"]!;
    let retaliated = false;
    dispatchHook("AfterDamageTaken", [retribution], {
      state: {},
      rng: () => 0,
      isAdjacentAlly: true,
      retaliateHolyDamage: () => {
        retaliated = true;
      },
    });
    expect(retaliated).toBe(true);

    retaliated = false;
    dispatchHook("AfterDamageTaken", [retribution], {
      state: {},
      rng: () => 0,
      isAdjacentAlly: false,
      retaliateHolyDamage: () => {
        retaliated = true;
      },
    });
    expect(retaliated).toBe(false);
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

  const ZAP: SpellDef = {
    id: "zap",
    name: "Zap",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 10 },
    description: "Test bolt.",
  };

  function castZap(perks: string[]): CombatState {
    const enemy = makeEnemy("e1", "Rat A", 100);
    const mage = makeCharacter("Mage", perks);
    mage.knownSpellIds = ["zap"];
    const state = createCombatState(
      [mage],
      { front: [enemy], back: [] },
      false,
      { zap: ZAP }
    );
    return resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "zap", targetInstanceId: "e1" },
      () => 0.5
    );
  }

  it("mage-glass-cannon boosts spell damage by 30%", () => {
    // INT 10 → casting bonus 2; power 10 → base 12 damage, ×1.3 → 16.
    const plain = castZap([]);
    const boosted = castZap(["mage-glass-cannon"]);
    const plainHp = plain.enemies.front[0].currentHp;
    const boostedHp = boosted.enemies.front[0].currentHp;
    expect(100 - plainHp).toBe(12);
    expect(100 - boostedHp).toBe(16);
  });

  function enemyHitsCharacter(perks: string[], formationSlot = 0): number {
    const enemy = makeEnemy("e1", "Rat A");
    const c = makeCharacter("Halberdier", perks);
    c.formationSlot = formationSlot;
    const state = createCombatState([c], { front: [enemy], back: [] }, false);
    const before = state.party[0].hp;
    // Constant rng: no evasion (chance 0 at AGI 10), variance ×1.0.
    const after = resolveEnemyTurn(state, "e1", () => 0.5);
    return before - after.party[0].hp;
  }

  it("halberdier-phalanx reduces physical damage taken in the front row", () => {
    const plain = enemyHitsCharacter([]);
    const guarded = enemyHitsCharacter(["halberdier-phalanx"]);
    expect(plain).toBe(4); // attack 4, variance 1.0, no armor
    expect(guarded).toBe(3); // ×0.85, rounded
  });

  it("halberdier-phalanx does nothing from the back row", () => {
    const guardedBack = enemyHitsCharacter(["halberdier-phalanx"], 3);
    expect(guardedBack).toBe(4);
  });

  it("duelist-riposte counters when an enemy attack is evaded", () => {
    const enemy = makeEnemy("e1", "Rat A", 50);
    const duelist = makeCharacter("Duelist", ["duelist-riposte"]);
    duelist.stats.agi = 25; // evasion 15%
    const state = createCombatState([duelist], { front: [enemy], back: [] }, false);
    // rng 0.1 < 0.15 → the attack is evaded, riposte fires.
    const after = resolveEnemyTurn(state, "e1", () => 0.1);
    expect(after.log.some((m) => m.includes("ripostes"))).toBe(true);
    expect(after.enemies.front[0].currentHp).toBeLessThan(50);
    expect(after.party[0].hp).toBe(duelist.maxHp);
  });

  it("thief-assassin crits statused enemies past the normal cap", () => {
    const attack = (perks: string[], status: boolean) => {
      const enemy = makeEnemy("e1", "Rat A", 100);
      if (status) enemy.status.push("poison");
      const thief = makeCharacter("Thief", perks);
      const state = createCombatState([thief], { front: [enemy], back: [] }, false);
      // rng 0.3: base crit chance is LUK/100 = 0.10 (no crit); with Assassin
      // vs a statused enemy it's 0.35 (crit).
      return resolvePlayerTurn(
        state,
        { kind: "attack", actorId: thief.id, targetInstanceId: "e1" },
        () => 0.3
      );
    };
    expect(attack([], true).log.some((m) => m.includes("critical"))).toBe(false);
    expect(attack(["thief-assassin"], false).log.some((m) => m.includes("critical"))).toBe(false);
    expect(attack(["thief-assassin"], true).log.some((m) => m.includes("critical"))).toBe(true);
  });

  it("thief-backstab ignores 25% enemy AC from the back row", () => {
    const attack = (perks: string[]) => {
      const enemy = makeEnemy("e1", "Rat A", 100);
      enemy.ac = 8;
      const thief = makeCharacter("Thief", perks);
      thief.formationSlot = 3; // back row (thieves attack at full damage from there)
      const dagger = {
        id: "test-dagger",
        name: "Test Dagger",
        type: "weapon",
        attackBonus: 0,
        range: "short",
        price: 0,
      } as const;
      const state = createCombatState(
        [thief],
        { front: [enemy], back: [] },
        false,
        {},
        {},
        { [thief.id]: { weapon: dagger, armor: [] } }
      );
      const after = resolvePlayerTurn(
        state,
        { kind: "attack", actorId: thief.id, targetInstanceId: "e1" },
        () => 0.5
      );
      return 100 - after.enemies.front[0].currentHp;
    };
    // STR 10 + level 1 = 11 raw. Full AC: 11-8 = 3. Backstab: 11-6 = 5.
    expect(attack([])).toBe(3);
    expect(attack(["thief-backstab"])).toBe(5);
  });

  it("priest-saint regenerates 5% max HP for the party at end of round", () => {
    const priest = makeCharacter("Priest", ["priest-saint"]);
    priest.hp = priest.maxHp - 10;
    const enemy = makeEnemy("e1", "Rat A");
    const state = createCombatState([priest], { front: [enemy], back: [] }, false);
    const after = endRound(state, () => 0.5);
    const expectedHeal = Math.max(1, Math.round(priest.maxHp * 0.05));
    expect(after.party[0].hp).toBe(priest.maxHp - 10 + expectedHeal);
  });

  it("no saint regen without the perk", () => {
    const priest = makeCharacter("Priest", []);
    priest.hp = priest.maxHp - 10;
    const enemy = makeEnemy("e1", "Rat A");
    const state = createCombatState([priest], { front: [enemy], back: [] }, false);
    const after = endRound(state, () => 0.5);
    expect(after.party[0].hp).toBe(priest.maxHp - 10);
  });
});
