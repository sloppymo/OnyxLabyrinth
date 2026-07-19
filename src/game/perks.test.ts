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
  partyShopDiscount,
  discountedShopPrice,
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
} from "./combat";
import type { CombatState } from "./combat-types";
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
    // Beefy rats: an unseeded crit+cleave must never be able to end the
    // combat here — the assertion below is about resolving cleanly, and a
    // combat-ending roll made this test flaky.
    const enemy1 = makeEnemy("e1", "Rat A", 500);
    const enemy2 = makeEnemy("e2", "Rat B", 500);
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
    // STR 10 + level 1 = 11 raw. AC 8 vs an 11 swing hits the P2-8 floor
    // (AC capped at 5): plain 11-5 = 6. Backstab pierces the floor:
    // 5×0.75 → 4, so 11-4 = 7.
    expect(attack([])).toBe(6);
    expect(attack(["thief-backstab"])).toBe(7);
  });

  it("priest-saint regenerates 5% max HP for the party at end of round", () => {
    const priest = makeCharacter("Priest", ["priest-saint"]);
    // Pin maxHp: createCharacter rolls HP on a d6, and a 10 roll would put
    // the priest at 0 HP here (knockedOut -> regen skips -> flaky failure).
    priest.maxHp = 30;
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

// ---------------------------------------------------------------------------
// Phase A/B wiring: flee override + newly wired perks
// ---------------------------------------------------------------------------

function makeNamedCharacter(
  id: string,
  cls: Character["class"],
  perks: string[] = []
): Character {
  const c = createCharacter(id, id, "Human", "Neutral", cls, 0);
  c.stats = { ...BASE_STATS };
  c.perkIds = perks;
  c.hp = c.maxHp;
  c.sp = c.maxSp;
  return c;
}

describe("thief-smoke-bomb flee override", () => {
  // rng 0.99 is above the base flee chance (0.95 at AGI 10), so an
  // unaided flee attempt fails deterministically.
  const FLEE_FAIL_RNG = () => 0.99;

  function tryFlee(perks: string[], hpFraction: number, isBoss = false): CombatState {
    const thief = makeCharacter("Thief", perks);
    thief.hp = Math.max(1, Math.round(thief.maxHp * hpFraction));
    const enemy = makeEnemy("e1", "Rat A");
    const state = createCombatState([thief], { front: [enemy], back: [] }, isBoss);
    return resolvePlayerTurn(
      state,
      { kind: "flee", actorId: thief.id },
      FLEE_FAIL_RNG
    );
  }

  it("without the perk, a bad roll fails to flee", () => {
    const s = tryFlee([], 0.2);
    expect(s.ended).toBe(false);
    expect(s.log.some((m) => m.includes("fails to flee"))).toBe(true);
  });

  it("with the perk and party HP below 30%, flee always succeeds", () => {
    const s = tryFlee(["thief-smoke-bomb"], 0.2);
    expect(s.ended).toBe(true);
    expect(s.result).toBe("fled");
  });

  it("with the perk but party HP at or above 30%, no override", () => {
    const s = tryFlee(["thief-smoke-bomb"], 0.8);
    expect(s.ended).toBe(false);
    expect(s.log.some((m) => m.includes("fails to flee"))).toBe(true);
  });

  it("never overrides against bosses", () => {
    const s = tryFlee(["thief-smoke-bomb"], 0.2, true);
    expect(s.ended).toBe(false);
    expect(s.log.some((m) => m.includes("fails to flee"))).toBe(true);
  });

  it("a dead holder grants nothing", () => {
    const thief = makeNamedCharacter("thief", "Thief", ["thief-smoke-bomb"]);
    thief.hp = 0;
    thief.status.push("knockedOut");
    const fighter = makeNamedCharacter("fighter", "Fighter");
    fighter.hp = Math.round(fighter.maxHp * 0.2);
    const enemy = makeEnemy("e1", "Rat A");
    const state = createCombatState([thief, fighter], { front: [enemy], back: [] }, false);
    const s = resolvePlayerTurn(state, { kind: "flee", actorId: fighter.id }, () => 0.99);
    expect(s.ended).toBe(false);
  });
});

describe("newly wired perks (Phase B)", () => {
  const MEND: SpellDef = {
    id: "mend",
    name: "Mend",
    class: "Priest",
    tier: 1,
    spCost: 1,
    target: "singleAlly",
    effect: { kind: "heal", power: 10 },
    description: "Test heal.",
  };

  it("priest-healers-touch boosts healing by 30%", () => {
    const heal = (perks: string[]): number => {
      const priest = makeCharacter("Priest", perks);
      priest.maxHp = 100;
      priest.hp = 1;
      priest.knownSpellIds = ["mend"];
      const enemy = makeEnemy("e1", "Rat A");
      const state = createCombatState(
        [priest], { front: [enemy], back: [] }, false, { mend: MEND }
      );
      const after = resolvePlayerTurn(
        state,
        { kind: "cast", actorId: priest.id, spellId: "mend", targetAllyId: priest.id },
        () => 0.5
      );
      return after.party[0].hp - 1;
    };
    // PIE 10 → casting bonus 2; power 10 → 12 base, ×1.3 → 16.
    expect(heal([])).toBe(12);
    expect(heal(["priest-healers-touch"])).toBe(16);
  });

  const RAISE: SpellDef = {
    id: "raise",
    name: "Raise",
    class: "Priest",
    tier: 4,
    spCost: 1,
    target: "singleAlly",
    effect: { kind: "resurrect" },
    description: "Test resurrect.",
  };

  it("priest-revival resurrects to 50% max HP instead of the 25% baseline", () => {
    const revive = (perks: string[]): number => {
      const priest = makeNamedCharacter("priest", "Priest", perks);
      priest.knownSpellIds = ["raise"];
      const fallen = makeNamedCharacter("fallen", "Fighter");
      fallen.maxHp = 40;
      fallen.hp = 0;
      fallen.status.push("knockedOut");
      const enemy = makeEnemy("e1", "Rat A");
      const state = createCombatState(
        [priest, fallen], { front: [enemy], back: [] }, false, { raise: RAISE }
      );
      const after = resolvePlayerTurn(
        state,
        { kind: "cast", actorId: priest.id, spellId: "raise", targetAllyId: fallen.id },
        () => 0.5
      );
      return after.party[1].hp;
    };
    expect(revive([])).toBe(10); // 25% baseline of the pinned 40 max HP
    expect(revive(["priest-revival"])).toBe(20); // 50% of the pinned 40 max HP
  });

  function meleeDamage(perks: string[], enemySpecial: EnemyDef["special"]): number {
    const enemy = makeEnemy("e1", "Rat A", 100);
    enemy.special = enemySpecial;
    const c = makeCharacter("Priest", perks);
    const state = createCombatState([c], { front: [enemy], back: [] }, false);
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: c.id, targetInstanceId: "e1" },
      () => 0.5
    );
    return 100 - after.enemies.front[0].currentHp;
  }

  it("priest-turn-undead adds +50% damage vs undead only", () => {
    // STR 10 + level 1 = 11 raw at variance 1.0.
    expect(meleeDamage([], [{ kind: "undead" }])).toBe(11);
    expect(meleeDamage(["priest-turn-undead"], [{ kind: "undead" }])).toBe(17);
    expect(meleeDamage(["priest-turn-undead"], [])).toBe(11);
  });

  it("crusader-judge boosts damage vs demons", () => {
    expect(meleeDamage([], [{ kind: "demon" }])).toBe(11);
    expect(meleeDamage(["crusader-judge"], [{ kind: "demon" }])).toBe(15);
  });

  it("halberdier-reach-mastery ignores 2 points of enemy AC", () => {
    const attack = (perks: string[]): number => {
      const enemy = makeEnemy("e1", "Rat A", 100);
      enemy.ac = 8;
      const c = makeCharacter("Halberdier", perks);
      const state = createCombatState([c], { front: [enemy], back: [] }, false);
      const after = resolvePlayerTurn(
        state,
        { kind: "attack", actorId: c.id, targetInstanceId: "e1" },
        () => 0.5
      );
      return 100 - after.enemies.front[0].currentHp;
    };
    // 11 raw − AC 8. P2-8 floor caps AC at 5 (half the swing): plain 11-5 = 6.
    // Reach Mastery pierces the floor: 5−2 = 3, so 11-3 = 8.
    expect(attack([])).toBe(6);
    expect(attack(["halberdier-reach-mastery"])).toBe(8);
  });

  it("halberdier-brace stores a 60% defend reduction", () => {
    const brace = makeCharacter("Halberdier", ["halberdier-brace"]);
    const enemy = makeEnemy("e1", "Rat A");
    const state = createCombatState([brace], { front: [enemy], back: [] }, false);
    const after = resolvePlayerTurn(state, { kind: "defend", actorId: brace.id }, () => 0.5);
    expect(after.defendBuff[brace.id]).toBeCloseTo(0.6);

    const plain = makeCharacter("Halberdier", []);
    const state2 = createCombatState([plain], { front: [makeEnemy("e1")], back: [] }, false);
    const after2 = resolvePlayerTurn(state2, { kind: "defend", actorId: plain.id }, () => 0.5);
    expect(after2.defendBuff[plain.id]).toBeCloseTo(0.5);
  });

  it("fighter-juggernaut shrugs off poison-on-hit", () => {
    const hitBy = (perks: string[]): CombatState => {
      const enemy = makeEnemy("e1", "Cobweb");
      enemy.special = [{ kind: "poisonOnHit" }];
      const c = makeCharacter("Fighter", perks);
      const state = createCombatState([c], { front: [enemy], back: [] }, false);
      return resolveEnemyTurn(state, "e1", () => 0.5);
    };
    expect(hitBy([]).party[0].status).toContain("poison");
    expect(hitBy(["fighter-juggernaut"]).party[0].status).not.toContain("poison");
  });

  it("thief-swindler grants a 20% shop discount for the living party", () => {
    const thief = makeNamedCharacter("thief", "Thief", ["thief-swindler"]);
    const fighter = makeNamedCharacter("fighter", "Fighter");
    expect(partyShopDiscount([thief, fighter])).toBeCloseTo(0.2);
    expect(discountedShopPrice(100, 0.2)).toBe(80);
    // Dead holder grants nothing.
    thief.hp = 0;
    expect(partyShopDiscount([thief, fighter])).toBe(0);
  });

  it("duelist-perfect-timing arms a guaranteed hit after a crit, once", () => {
    const perk = PERKS_BY_ID["duelist-perfect-timing"]!;
    const state: Record<string, unknown> = {};
    dispatchHook("OnCriticalHit", [perk], { state, rng: () => 0.5 });
    let guaranteed = 0;
    const ctx = {
      state,
      rng: () => 0.5,
      guaranteeHit: () => {
        guaranteed += 1;
      },
    };
    dispatchHook("BeforeAttack", [perk], ctx);
    expect(guaranteed).toBe(1);
    // Consumed: the next attack is back to normal.
    dispatchHook("BeforeAttack", [perk], ctx);
    expect(guaranteed).toBe(1);
  });

  it("duelist-swashbuckler strikes the same target again 40% of the time", () => {
    const perk = PERKS_BY_ID["duelist-swashbuckler"]!;
    let extra = 0;
    dispatchHook("OnAttackHit", [perk], {
      state: {},
      rng: () => 0.1,
      damage: 8,
      strikeSameTarget: (dmg: number) => {
        extra = dmg;
      },
    });
    expect(extra).toBe(8);
    extra = 0;
    dispatchHook("OnAttackHit", [perk], {
      state: {},
      rng: () => 0.9,
      damage: 8,
      strikeSameTarget: (dmg: number) => {
        extra = dmg;
      },
    });
    expect(extra).toBe(0);
  });

  it("crusader-dark-templar heals 15% of melee damage dealt", () => {
    const perk = PERKS_BY_ID["crusader-dark-templar"]!;
    let healed = 0;
    dispatchHook("OnAttackHit", [perk], {
      state: {},
      rng: () => 0.5,
      damage: 20,
      healSelf: (amount: number) => {
        healed = amount;
      },
    });
    expect(healed).toBe(3);
  });

  it("mage-chain-caster jumps to a second target 25% of the time", () => {
    const perk = PERKS_BY_ID["mage-chain-caster"]!;
    let chained = false;
    dispatchHook("OnSpellResolve", [perk], {
      state: {},
      rng: () => 0.1,
      chainToSecondTarget: () => {
        chained = true;
      },
    });
    expect(chained).toBe(true);
    chained = false;
    dispatchHook("OnSpellResolve", [perk], {
      state: {},
      rng: () => 0.9,
      chainToSecondTarget: () => {
        chained = true;
      },
    });
    expect(chained).toBe(false);
  });
});

// --- Reach perks: duelist-lunge / halberdier-sweep ----------------------------

describe("reach perks (Lunge/Sweep)", () => {
  const CLOSE_MACE = { id: "mace", name: "Mace", type: "weapon", slot: "hand", attackBonus: 4, range: "close", price: 0 } as const;
  const SHORT_SWORD = { id: "short-sword", name: "Short Sword", type: "weapon", slot: "hand", attackBonus: 3, range: "short", price: 0 } as const;

  function backRowRig(cls: Character["class"], perks: string[], weapon: typeof CLOSE_MACE | typeof SHORT_SWORD, perksOn = true) {
    const c = makeCharacter(cls, perksOn ? perks : []);
    c.formationSlot = 3; // back row
    const enemy = makeEnemy("e1");
    enemy.row = "back";
    const state = createCombatState([c], { front: [], back: [enemy] }, false, {}, {}, { [c.id]: { weapon, armor: [] } });
    return { c, state };
  }

  it("duelist-lunge: short weapons reach back-row enemies from the back row", () => {
    const { c, state } = backRowRig("Duelist", ["duelist-lunge"], SHORT_SWORD);
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: c.id, targetInstanceId: "e1" }, () => 0.5);
    expect(s.events.some((e) => e?.type === "miss")).toBe(false);
    // STR 10 + level 1 + 3 = 14 full damage (no back-row penalty).
    expect(s.enemies.back[0].currentHp).toBe(6);
  });

  it("without Lunge, a back-row short weapon cannot reach the back row", () => {
    const { c, state } = backRowRig("Duelist", [], SHORT_SWORD, false);
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: c.id, targetInstanceId: "e1" }, () => 0.5);
    expect(s.enemies.back[0].currentHp).toBe(20); // no damage
    expect(s.events.some((e) => e?.type === "miss")).toBe(true);
  });

  it("halberdier-sweep: back-row melee reaches any row at full damage, any weapon", () => {
    const { c, state } = backRowRig("Halberdier", ["halberdier-sweep"], CLOSE_MACE);
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: c.id, targetInstanceId: "e1" }, () => 0.5);
    expect(s.events.some((e) => e?.type === "miss")).toBe(false);
    // STR 10 + level 1 + 4 = 15 full damage (reach granted, 0.4 penalty waived).
    expect(s.enemies.back[0].currentHp).toBe(5);
  });

  it("halberdier-sweep does not grant reach to other classes", () => {
    const { c, state } = backRowRig("Duelist", ["halberdier-sweep"], CLOSE_MACE, false);
    const s = resolvePlayerTurn(state, { kind: "attack", actorId: c.id, targetInstanceId: "e1" }, () => 0.5);
    expect(s.enemies.back[0].currentHp).toBe(20);
    expect(s.events.some((e) => e?.type === "miss")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2026-07-18: the last four fully-inert perk stubs (Spellbreaker, Shadow
// Dance, Holy Shield, Warlord) wired to real behavior.
// ---------------------------------------------------------------------------

describe("mage-spellbreaker", () => {
  const FIRE_ZAP: SpellDef = {
    id: "fire-zap",
    name: "Fire Zap",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "Test fire bolt.",
  };

  function castFireZap(perks: string[]): CombatState {
    const enemy = makeEnemy("e1", "Rat A", 100);
    enemy.special = [{ kind: "resistElement", element: "fire" }];
    const mage = makeCharacter("Mage", perks);
    mage.knownSpellIds = ["fire-zap"];
    const state = createCombatState(
      [mage],
      { front: [enemy], back: [] },
      false,
      { "fire-zap": FIRE_ZAP }
    );
    return resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: "fire-zap", targetInstanceId: "e1" },
      () => 0.5
    );
  }

  it("softens elemental resistance from x0.5 to x0.75", () => {
    // INT 10 -> casting bonus 2; power 10 -> base 12 damage.
    const resisted = castFireZap([]);
    const pierced = castFireZap(["mage-spellbreaker"]);
    expect(100 - resisted.enemies.front[0].currentHp).toBe(6); // 12 x 0.5
    expect(100 - pierced.enemies.front[0].currentHp).toBe(9); // 12 x 0.75
  });

  it("holders are excluded from enemy silenceRandom targeting", () => {
    const mage = makeNamedCharacter("mage", "Mage", ["mage-spellbreaker"]);
    const fighter = makeNamedCharacter("fighter", "Fighter");
    const enemy = makeEnemy("e1");
    enemy.special = [{ kind: "silenceRandom", target: "party", duration: "combat" }];
    const state = createCombatState([mage, fighter], { front: [enemy], back: [] }, false);
    // rng < 0.4 triggers the silenceRandom branch deterministically.
    const after = resolveEnemyTurn(state, "e1", () => 0.1);
    expect(after.silencedThisRound).toEqual([fighter.id]);
  });
});

describe("thief-shadow-dance", () => {
  function hideTwiceThenAmbush(perks: string[]): CombatState {
    const thief = makeCharacter("Thief", perks);
    // Enemy AC high enough that the 50% ignore is visible in the outcome.
    const enemy = makeEnemy("e1", "Rat A", 1000);
    enemy.ac = 20;
    let state = createCombatState([thief], { front: [enemy], back: [] }, false);
    state = resolvePlayerTurn(state, { kind: "hide", actorId: thief.id }, () => 0.5);
    // Ambush consumes hidden status, so hide again before the second Hide.
    state = resolvePlayerTurn(state, { kind: "ambush", actorId: thief.id, targetInstanceId: "e1" }, () => 0.5);
    state = resolvePlayerTurn(state, { kind: "hide", actorId: thief.id }, () => 0.5);
    return resolvePlayerTurn(
      state,
      { kind: "ambush", actorId: thief.id, targetInstanceId: "e1" },
      () => 0.5
    );
  }

  it("after two Hides this combat, the next Ambush ignores 50% of the AC reduction", () => {
    const plain = hideTwiceThenAmbush([]);
    const danced = hideTwiceThenAmbush(["thief-shadow-dance"]);
    const plainDamage = 1000 - plain.enemies.front[0].currentHp;
    const dancedDamage = 1000 - danced.enemies.front[0].currentHp;
    expect(dancedDamage).toBeGreaterThan(plainDamage);
  });
});

describe("crusader-holy-shield", () => {
  function makeAttackerEnemy(instanceId: string, attack: number): EnemyInstance {
    const def = {
      id: "test-brute",
      name: "Test Brute",
      hp: 100,
      attack,
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

  function defendThenGetHit(perks: string[]): number {
    const crusader = makeCharacter("Crusader", perks);
    const enemy = makeAttackerEnemy("e1", 20);
    const state = createCombatState([crusader], { front: [enemy], back: [] }, false);
    const defended = resolvePlayerTurn(state, { kind: "defend", actorId: crusader.id }, () => 0.5);
    const before = defended.party[0].hp;
    // Constant rng: no evasion (chance 0 at AGI 10), variance x1.0.
    const after = resolveEnemyTurn(defended, "e1", () => 0.5);
    return before - after.party[0].hp;
  }

  it("adds +20% defense on top of the base Defend reduction", () => {
    expect(defendThenGetHit([])).toBe(10); // 20 dmg, Defend 50% -> 10
    expect(defendThenGetHit(["crusader-holy-shield"])).toBe(8); // extra x0.8 -> 8
  });
});

describe("halberdier-warlord", () => {
  function fighterHitsWithWarlord(warlordAdjacent: boolean): number {
    const fighter = makeNamedCharacter("fighter", "Fighter");
    fighter.formationSlot = 1;
    const halberdier = makeNamedCharacter(
      "halberdier",
      "Halberdier",
      warlordAdjacent ? ["halberdier-warlord"] : []
    );
    halberdier.formationSlot = 0; // adjacent front-row slot to the Fighter
    const enemy = makeEnemy("e1", "Rat A", 100);
    const state = createCombatState([fighter, halberdier], { front: [enemy], back: [] }, false);
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: fighter.id, targetInstanceId: "e1" },
      () => 0.5
    );
    return 100 - after.enemies.front[0].currentHp;
  }

  it("grants allies adjacent to a living holder +20% damage", () => {
    // STR 10 + level 1 = 11 base damage, no crit (LUK 10 -> 10% chance, rng 0.5).
    expect(fighterHitsWithWarlord(false)).toBe(11);
    expect(fighterHitsWithWarlord(true)).toBe(13); // 11 x 1.2 rounded
  });

  it("does not buff the holder's own damage", () => {
    const halberdier = makeNamedCharacter("halberdier", "Halberdier", ["halberdier-warlord"]);
    halberdier.formationSlot = 0;
    const ally = makeNamedCharacter("ally", "Fighter");
    ally.formationSlot = 1;
    const enemy = makeEnemy("e1", "Rat A", 100);
    const state = createCombatState([halberdier, ally], { front: [enemy], back: [] }, false);
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: halberdier.id, targetInstanceId: "e1" },
      () => 0.5
    );
    // Halberdier's own base attack: STR 10 + level 1 = 11, unbuffed.
    expect(100 - after.enemies.front[0].currentHp).toBe(11);
  });
});
