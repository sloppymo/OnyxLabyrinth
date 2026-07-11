import { describe, it, expect } from "vitest";
import {
  createCombatState,
  resolveCombatRound,
  inventoryToCounts,
  inventoryFromCounts,
  canReach,
  defaultLoadoutForCharacter,
  equipItem,
  isBetterEquip,
  findBestEquipTarget,
  getDisplacedItem,
  type CombatState,
  type EnemyInstance,
  type EnemyFormation,
  type Loadout,
  type PlayerAction,
} from "./combat";
import { createDefaultParty, type Character, type CharacterClass } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ALL_ITEMS, ITEMS_BY_ID } from "../data/items";
import type { EnemyDef } from "../data/enemies";

// --- Test helpers -----------------------------------------------------------

/** A deterministic RNG that always returns a fixed value (0.5 by default). */
function makeRng(value = 0.5): () => number {
  return () => value;
}

/** Create a minimal enemy instance for testing. */
function makeEnemy(
  id: string,
  name: string,
  hp: number,
  opts: Partial<EnemyDef> = {}
): EnemyInstance {
  return {
    id,
    name,
    floors: [1],
    rowPreference: "front",
    hp,
    attack: 10,
    ac: 2,
    agi: 10,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: hp,
    row: "front",
    status: [],
    ...opts,
  };
}

/** Build a CombatState with the default party and specified enemies. */
function makeCombatState(
  enemies: EnemyInstance[] = [],
  opts: { isBoss?: boolean } = {}
): CombatState {
  const party = createDefaultParty();
  const spells: Record<string, typeof ALL_SPELLS[number]> = {};
  for (const s of ALL_SPELLS) spells[s.id] = s;
  const items: Record<string, typeof ALL_ITEMS[number]> = {};
  for (const it of ALL_ITEMS) items[it.id] = it;
  const formation: EnemyFormation = {
    front: enemies.filter((e) => e.row === "front"),
    back: enemies.filter((e) => e.row === "back"),
  };
  return createCombatState(
    party,
    formation,
    opts.isBoss ?? false,
    spells,
    items
  );
}

// --- Tests ------------------------------------------------------------------

describe("createCombatState", () => {
  it("clones party and enemies (no shared references)", () => {
    const party = createDefaultParty();
    const enemy = makeEnemy("e1", "Rat", 10);
    const state = createCombatState(
      party,
      { front: [enemy], back: [] },
      false
    );
    // Mutating the original should not affect combat state.
    party[0].hp = 999;
    enemy.currentHp = 999;
    expect(state.party[0].hp).not.toBe(999);
    expect(state.enemies.front[0].currentHp).toBe(10);
  });

  it("initializes with empty log, round 0, and empty justDied", () => {
    const state = makeCombatState([makeEnemy("e1", "Rat", 10)]);
    expect(state.round).toBe(0);
    expect(state.log).toEqual([]);
    expect(state.ended).toBe(false);
    expect(state.justDied).toEqual([]);
  });
});

describe("resolveCombatRound", () => {
  it("increments the round number", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.round).toBe(1);
  });

  it("does not mutate the input state", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const originalRound = state.round;
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));
    resolveCombatRound(state, actions, makeRng(0.99));
    expect(state.round).toBe(originalRound);
  });

  it("ends in victory when all enemies are defeated", () => {
    const enemy = makeEnemy("e1", "Rat", 1);
    const state = makeCombatState([enemy]);
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "attack" as const,
      actorId: c.id,
      targetInstanceId: "e1",
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.ended).toBe(true);
    expect(result.result).toBe("victory");
    expect(result.goldEarned).toBe(enemy.gold);
    expect(result.xpEarned).toBe(enemy.xp);
  });

  it("populates justDied when enemies are defeated", () => {
    const enemy = makeEnemy("e1", "Rat", 1);
    const state = makeCombatState([enemy]);
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "attack" as const,
      actorId: c.id,
      targetInstanceId: "e1",
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.justDied.length).toBeGreaterThanOrEqual(1);
    expect(result.justDied[0].name).toBe("Rat");
  });

  it("clears justDied at the start of each round", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    state.justDied = [enemy];
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.justDied).toEqual([]);
  });

  it("flee succeeds against non-boss with high RNG", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    // Fix the fleer's AGI so the deterministic RNG reliably crosses the
    // non-boss flee threshold independent of createDefaultParty() rolls.
    state.party[0].stats.agi = 15;
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "flee" as const,
      actorId: c.id,
    }));
    // RNG 0.90 < 0.95 flee threshold → flee succeeds.
    const result = resolveCombatRound(state, actions, makeRng(0.90));
    expect(result.ended).toBe(true);
    expect(result.result).toBe("fled");
  });

  it("flee always fails against boss", () => {
    const enemy = makeEnemy("e1", "Boss", 100, { isBoss: true });
    const state = makeCombatState([enemy], { isBoss: true });
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "flee" as const,
      actorId: c.id,
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.result).not.toBe("fled");
  });

  it("generates log entries for combat actions", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "attack" as const,
      actorId: c.id,
      targetInstanceId: "e1",
    }));
    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.log.length).toBeGreaterThan(0);
    expect(result.log.some((m) => m.includes("attacks"))).toBe(true);
  });
});

describe("inventory helpers", () => {
  it("converts flat inventory to counts", () => {
    const inv = ["potion", "potion", "antidote", "potion"];
    const counts = inventoryToCounts(inv);
    expect(counts["potion"]).toBe(3);
    expect(counts["antidote"]).toBe(1);
  });

  it("converts counts back to flat inventory", () => {
    const counts = { potion: 2, antidote: 1 };
    const inv = inventoryFromCounts(counts);
    expect(inv.sort()).toEqual(["antidote", "potion", "potion"]);
  });

  it("round-trips inventory through counts", () => {
    const original = ["potion", "potion", "antidote"];
    const roundTrip = inventoryFromCounts(inventoryToCounts(original));
    expect(roundTrip.sort()).toEqual([...original].sort());
  });
});

describe("equipment helpers", () => {
  const dagger = ITEMS_BY_ID["dagger"];
  const shortSword = ITEMS_BY_ID["short-sword"];
  const shortSwordPlus1 = ITEMS_BY_ID["short-sword+1"];
  const leather = ITEMS_BY_ID["leather"];
  const chainMail = ITEMS_BY_ID["chain-mail"];
  const shield = ITEMS_BY_ID["shield"];

  describe("isBetterEquip", () => {
    it("is true for any equipment when the slot is empty", () => {
      expect(isBetterEquip(undefined, dagger)).toBe(true);
    });

    it("compares weapons by attackBonus", () => {
      expect(isBetterEquip(dagger, shortSword)).toBe(true);
      expect(isBetterEquip(shortSword, dagger)).toBe(false);
    });

    it("compares armor by defenseBonus", () => {
      expect(isBetterEquip(leather, chainMail)).toBe(true);
      expect(isBetterEquip(chainMail, leather)).toBe(false);
    });

    it("is false for consumables", () => {
      const potion = ITEMS_BY_ID["healing-potion"];
      expect(isBetterEquip(undefined, potion)).toBe(false);
    });
  });

  describe("equipItem", () => {
    it("equips into an empty weapon slot", () => {
      const loadout: Loadout = { armor: [] };
      const next = equipItem(loadout, dagger);
      expect(next.weapon?.id).toBe("dagger");
    });

    it("replaces a weaker weapon and leaves a strictly-better one alone", () => {
      const loadout: Loadout = { weapon: dagger, armor: [] };
      const upgraded = equipItem(loadout, shortSword);
      expect(upgraded.weapon?.id).toBe("short-sword");

      const alreadyBetter: Loadout = { weapon: shortSwordPlus1, armor: [] };
      const unchanged = equipItem(alreadyBetter, shortSword);
      expect(unchanged.weapon?.id).toBe("short-sword+1");
      expect(unchanged).toBe(alreadyBetter); // no new object when nothing changes
    });

    it("adds armor to a new slot without disturbing other slots", () => {
      const loadout: Loadout = { armor: [shield] };
      const next = equipItem(loadout, leather);
      expect(next.armor.map((a) => a.id).sort()).toEqual(["leather", "shield"]);
    });

    it("replaces armor in an occupied slot only when it's an upgrade", () => {
      const loadout: Loadout = { armor: [leather] };
      const upgraded = equipItem(loadout, chainMail);
      expect(upgraded.armor.map((a) => a.id)).toEqual(["chain-mail"]);

      const unchanged = equipItem(upgraded, leather);
      expect(unchanged.armor.map((a) => a.id)).toEqual(["chain-mail"]);
    });
  });

  describe("findBestEquipTarget", () => {
    it("picks the party member with the weakest gear in that slot", () => {
      const party = createDefaultParty();
      const equipment: Record<string, Loadout> = {};
      for (const c of party) equipment[c.id] = defaultLoadoutForCharacter(c);

      // Give everyone but the first fighter a strong weapon so they're skipped.
      const [first, ...rest] = party;
      for (const c of rest) {
        equipment[c.id] = equipItem(equipment[c.id], shortSwordPlus1);
      }
      equipment[first.id] = { armor: [] }; // no weapon at all — weakest possible

      const targetId = findBestEquipTarget(party, equipment, dagger);
      expect(targetId).toBe(first.id);
    });

    it("returns undefined for consumables", () => {
      const party = createDefaultParty();
      const equipment: Record<string, Loadout> = {};
      for (const c of party) equipment[c.id] = defaultLoadoutForCharacter(c);
      const potion = ITEMS_BY_ID["healing-potion"];
      expect(findBestEquipTarget(party, equipment, potion)).toBeUndefined();
    });
  });

  describe("getDisplacedItem", () => {
    it("returns the old weapon when a better one replaces it", () => {
      const old: Loadout = { weapon: dagger, armor: [] };
      const next = equipItem(old, shortSword);
      expect(getDisplacedItem(old, next, shortSword)?.id).toBe("dagger");
    });

    it("returns undefined when the slot was empty (nothing to displace)", () => {
      const old: Loadout = { armor: [] };
      const next = equipItem(old, dagger);
      expect(getDisplacedItem(old, next, dagger)).toBeUndefined();
    });

    it("returns undefined when equipItem left the loadout unchanged", () => {
      const old: Loadout = { weapon: shortSwordPlus1, armor: [] };
      const next = equipItem(old, shortSword); // not an upgrade
      expect(getDisplacedItem(old, next, shortSword)).toBeUndefined();
    });

    it("returns the old armor piece when a better one replaces it in the same slot", () => {
      const old: Loadout = { armor: [leather] };
      const next = equipItem(old, chainMail);
      expect(getDisplacedItem(old, next, chainMail)?.id).toBe("leather");
    });
  });
});

describe("weapon range system", () => {
  describe("canReach", () => {
    it("close range: front row can hit front only, back row cannot attack", () => {
      expect(canReach(0, "close", "front")).toBe(true); // Front row, front target
      expect(canReach(0, "close", "back")).toBe(false);  // Front row, back target
      expect(canReach(3, "close", "front")).toBe(false); // Back row, front target
      expect(canReach(3, "close", "back")).toBe(false);  // Back row, back target
    });

    it("short range: front row can hit front/back, back row can hit front only", () => {
      expect(canReach(0, "short", "front")).toBe(true); // Front row, front target
      expect(canReach(0, "short", "back")).toBe(true);  // Front row, back target
      expect(canReach(3, "short", "front")).toBe(true);  // Back row, front target
      expect(canReach(3, "short", "back")).toBe(false); // Back row, back target
    });

    it("medium range: all positions can hit front/back", () => {
      expect(canReach(0, "medium", "front")).toBe(true); // Front row, front target
      expect(canReach(0, "medium", "back")).toBe(true);  // Front row, back target
      expect(canReach(3, "medium", "front")).toBe(true); // Back row, front target
      expect(canReach(3, "medium", "back")).toBe(true);  // Back row, back target
    });

    it("long range: all positions can hit front/back", () => {
      expect(canReach(0, "long", "front")).toBe(true); // Front row, front target
      expect(canReach(0, "long", "back")).toBe(true);  // Front row, back target
      expect(canReach(3, "long", "front")).toBe(true); // Back row, front target
      expect(canReach(3, "long", "back")).toBe(true);  // Back row, back target
    });

    it("all front row positions (0-2) behave the same", () => {
      expect(canReach(0, "short", "back")).toBe(true);
      expect(canReach(1, "short", "back")).toBe(true);
      expect(canReach(2, "short", "back")).toBe(true);
    });

    it("all back row positions (3-5) behave the same", () => {
      expect(canReach(3, "short", "back")).toBe(false);
      expect(canReach(4, "short", "back")).toBe(false);
      expect(canReach(5, "short", "back")).toBe(false);
    });
  });
});

describe("hide/ambush mechanics", () => {
  it("Thief can hide and gains hidden status", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const thief = state.party.find((c) => c.class === "Thief");
    if (!thief) throw new Error("No Thief in party");
    
    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === thief.id) return { kind: "hide" as const, actorId: c.id };
      return { kind: "defend" as const, actorId: c.id };
    });
    
    const result = resolveCombatRound(state, actions, makeRng(0.5));
    const updatedThief = result.party.find((c) => c.id === thief.id);
    expect(updatedThief?.status.includes("hidden")).toBe(true);
  });

  it("Non-Thief cannot hide", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter");
    if (!fighter) throw new Error("No Fighter in party");
    
    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === fighter.id) return { kind: "hide" as const, actorId: c.id };
      return { kind: "defend" as const, actorId: c.id };
    });
    
    const result = resolveCombatRound(state, actions, makeRng(0.5));
    const updatedFighter = result.party.find((c) => c.id === fighter.id);
    expect(updatedFighter?.status.includes("hidden")).toBe(false);
  });

  it("Hidden character can ambush for double damage", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const thief = state.party.find((c) => c.class === "Thief");
    if (!thief) throw new Error("No Thief in party");
    
    // First, hide
    thief.status.push("hidden");
    
    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === thief.id) return { kind: "ambush" as const, actorId: c.id, targetInstanceId: "e1" };
      return { kind: "defend" as const, actorId: c.id };
    });
    
    const result = resolveCombatRound(state, actions, makeRng(0.5));
    const updatedThief = result.party.find((c) => c.id === thief.id);
    expect(updatedThief?.status.includes("hidden")).toBe(false);
    expect(updatedThief?.status.includes("exposed")).toBe(true);
    expect(result.enemies.front[0].currentHp).toBeLessThan(100); // Should take damage
  });

  it("Ambush removes hidden status and adds exposed status", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const thief = state.party.find((c) => c.class === "Thief");
    if (!thief) throw new Error("No Thief in party");
    
    thief.status.push("hidden");
    
    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === thief.id) return { kind: "ambush" as const, actorId: c.id, targetInstanceId: "e1" };
      return { kind: "defend" as const, actorId: c.id };
    });
    
    const result = resolveCombatRound(state, actions, makeRng(0.5));
    const updatedThief = result.party.find((c) => c.id === thief.id);
    expect(updatedThief?.status.includes("hidden")).toBe(false);
    expect(updatedThief?.status.includes("exposed")).toBe(true);
  });

  it("Hidden character cannot ambush if not hidden", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const thief = state.party.find((c) => c.class === "Thief");
    if (!thief) throw new Error("No Thief in party");
    
    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === thief.id) return { kind: "ambush" as const, actorId: c.id, targetInstanceId: "e1" };
      return { kind: "defend" as const, actorId: c.id };
    });
    
    const result = resolveCombatRound(state, actions, makeRng(0.5));
    // Ambush should fail (fizzle) since not hidden
    expect(result.log.some((m) => m.includes("not hidden"))).toBe(true);
  });
});

describe("spell defense mechanics", () => {
  it("CORTU raises the party magic screen", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    mage.knownSpellIds = ["mage-cortu"];
    mage.sp = 50;
    mage.stats.agi = 100; // ensure mage acts first

    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === mage.id) return { kind: "cast" as const, actorId: c.id, spellId: "mage-cortu" };
      return { kind: "defend" as const, actorId: c.id };
    });

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    // CORTU adds 5, then end-of-round deterioration removes 1.
    expect(result.magicScreen).toBe(4);
    expect(result.log.some((m) => m.includes("Cortu") && m.includes("magic screen"))).toBe(true);
  });

  it("magic screen halves enemy spell damage and deteriorates at end of round", () => {
    const caster = makeEnemy("e1", "Fire Caster", 100, {
      attack: 20,
      agi: 1, // act after party
      special: [{ kind: "caster", element: "fire" }],
    });
    const state = makeCombatState([caster]);
    state.magicScreen = 5;
    const partyHpBefore = state.party.reduce((sum, c) => sum + c.hp, 0);

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, makeRng(0.99));
    // Caster base damage ~20; with variance 0.99 -> ~27; defend halves -> ~13; screen halves -> ~6-7.
    const partyHpAfter = result.party.reduce((sum, c) => sum + c.hp, 0);
    const damageDealt = partyHpBefore - partyHpAfter;
    expect(damageDealt).toBeGreaterThan(0);
    expect(damageDealt).toBeLessThan(15);
    // Screen loses 1 at end of round (no decay on hit).
    expect(result.magicScreen).toBe(4);
  });

  it("BACORTU fizzle field causes enemy spells to fizzle", () => {
    const caster = makeEnemy("e1", "Fire Caster", 100, {
      attack: 6, // level estimate = 2, so field strength 4 >= 2 after deterioration
      agi: 1,
      special: [{ kind: "caster", element: "fire" }],
    });
    const state = makeCombatState([caster]);
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    mage.knownSpellIds = ["mage-bacortu"];
    mage.sp = 50;
    mage.stats.agi = 100; // ensure mage acts before enemy caster

    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === mage.id) return { kind: "cast" as const, actorId: c.id, spellId: "mage-bacortu", targetRow: "front" };
      return { kind: "defend" as const, actorId: c.id };
    });

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    // BACORTU adds 5, then deterioration removes 1 -> 4, still >= enemy level estimate 2.
    expect(result.enemyFizzleFields.front).toBe(4);
    expect(result.log.some((m) => m.includes("Bacortu"))).toBe(true);
    expect(result.log.some((m) => m.includes("fizzles"))).toBe(true);
  });

  it("PALIOS dispels enemy screens and party fizzle field", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    mage.knownSpellIds = ["mage-palios"];
    mage.sp = 50;
    mage.level = 10; // high enough that partyFizzleField 5 does not fizzle PALIOS
    mage.stats.agi = 100; // ensure mage acts first
    state.enemyMagicScreens = { front: 3, back: 2 };
    state.enemyFizzleFields = { front: 4, back: 1 };
    state.partyFizzleField = 5;

    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === mage.id) return { kind: "cast" as const, actorId: c.id, spellId: "mage-palios" };
      return { kind: "defend" as const, actorId: c.id };
    });

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    expect(result.enemyMagicScreens.front).toBe(0);
    expect(result.enemyMagicScreens.back).toBe(0);
    expect(result.enemyFizzleFields.front).toBe(0);
    expect(result.enemyFizzleFields.back).toBe(0);
    expect(result.partyFizzleField).toBe(0);
  });

  it("party fizzle field causes party spells to fizzle when strong enough", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage");
    if (!mage) throw new Error("No Mage in party");
    mage.knownSpellIds = ["mage-halito"];
    mage.sp = 50;
    state.partyFizzleField = 5; // >= mage.level (1)

    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === mage.id) return { kind: "cast" as const, actorId: c.id, spellId: "mage-halito", targetInstanceId: "e1" };
      return { kind: "defend" as const, actorId: c.id };
    });

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    expect(result.log.some((m) => m.includes("fizzles") && m.includes("anti-magic"))).toBe(true);
    expect(result.enemies.front[0].currentHp).toBe(100); // no damage dealt
  });
});

describe("summoning mechanics", () => {
  it("BAMORDI creates a summoned ally", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    const priest = state.party.find((c) => c.class === "Priest");
    if (!priest) throw new Error("No Priest in party");
    priest.knownSpellIds = ["priest-bamordi"];
    priest.sp = 50;
    priest.stats.agi = 100;

    const actions: PlayerAction[] = state.party.map((c) => {
      if (c.id === priest.id) return { kind: "cast" as const, actorId: c.id, spellId: "priest-bamordi" };
      return { kind: "defend" as const, actorId: c.id };
    });

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    expect(result.summonedAllies.length).toBe(1);
    expect(result.log.some((m) => m.includes("Bamordi") && m.includes("summon"))).toBe(true);
  });

  it("existing summoned ally attacks an enemy", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    state.summonedAllies = [
      { id: "ally-1", name: "Elemental", hp: 30, maxHp: 30, attack: 15, ac: 2, agi: 50, row: "front" },
    ];

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    expect(result.enemies.front[0].currentHp).toBeLessThan(100);
  });

  it("enemies target and destroy summoned allies", () => {
    const enemy = makeEnemy("e1", "Rat", 100, { attack: 30 });
    const state = makeCombatState([enemy]);
    state.summonedAllies = [
      { id: "ally-1", name: "Elemental", hp: 1, maxHp: 1, attack: 15, ac: 0, agi: 50, row: "front" },
    ];

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const,
      actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.summonedAllies.length).toBe(0);
  });

  it("summoned allies are cleared on victory", () => {
    const enemy = makeEnemy("e1", "Rat", 1);
    const state = makeCombatState([enemy]);
    state.summonedAllies = [
      { id: "ally-1", name: "Elemental", hp: 30, maxHp: 30, attack: 15, ac: 2, agi: 50, row: "front" },
    ];

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "attack" as const,
      actorId: c.id,
      targetInstanceId: "e1",
    }));

    const result = resolveCombatRound(state, actions, makeRng(0.99));
    expect(result.result).toBe("victory");
    expect(result.summonedAllies.length).toBe(0);
  });

  it("summoned allies are cleared when the party flees", () => {
    const enemy = makeEnemy("e1", "Rat", 100);
    const state = makeCombatState([enemy]);
    state.summonedAllies = [
      { id: "ally-1", name: "Elemental", hp: 30, maxHp: 30, attack: 15, ac: 2, agi: 50, row: "front" },
    ];

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "flee" as const,
      actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, makeRng(0.5));
    expect(result.result).toBe("fled");
    expect(result.summonedAllies.length).toBe(0);
  });
});
