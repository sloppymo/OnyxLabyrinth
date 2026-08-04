import { describe, it, expect } from "vitest";
import {
  createCombatState,
  resolvePlayerTurn,
} from "./combat";
import { previewAttack, previewSpellDamage } from "./combat-preview";
import type { CombatState, EnemyInstance, EnemyFormation, ActionPreview } from "./combat-types";
import { createDefaultParty } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import { formatActionPreview } from "../engine/combat-display";

function makeRng(value = 0.5): () => number {
  return () => value;
}

function makeEnemy(
  id: string,
  name: string,
  hp: number,
  opts: Partial<EnemyInstance> = {}
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

function makeCombatState(enemies: EnemyInstance[]): CombatState {
  const party = createDefaultParty();
  // Zero LUK so critChance is 0 — parity tests can pin variance with a fixed rng.
  for (const c of party) c.stats.luk = 0;
  const spells: Record<string, (typeof ALL_SPELLS)[number]> = {};
  for (const s of ALL_SPELLS) spells[s.id] = s;
  const items: Record<string, (typeof ALL_ITEMS)[number]> = {};
  for (const it of ALL_ITEMS) items[it.id] = it;
  const formation: EnemyFormation = {
    front: enemies.filter((e) => e.row === "front"),
    back: enemies.filter((e) => e.row === "back"),
  };
  return createCombatState(party, formation, false, spells, items);
}

describe("previewAttack", () => {
  it("back-row targets are reachable (row restrictions removed)", () => {
    const front = makeEnemy("f1", "Rat", 20);
    const back = makeEnemy("b1", "Archer", 20, { row: "back", rowPreference: "back" });
    const state = makeCombatState([front, back]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0; // front
    // No weapon → close range
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };

    const preview = previewAttack(state, fighter, back);
    // Row restrictions removed: back-row target is reachable with close weapon.
    expect(preview.unreachable).toBeFalsy();
    expect(preview.hitChance).toBeGreaterThan(0);
  });

  it("stacks evasive / flying+close / blind miss sources into hitChance", () => {
    const enemy = makeEnemy("e1", "Bat", 30, {
      special: [{ kind: "evasive" }, { kind: "flying" }],
    });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0;
    fighter.status = ["blind"];
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };

    const preview = previewAttack(state, fighter, enemy);
    // 0.8 * 0.85 * 0.5 = 0.34
    expect(preview.hitChance).toBeCloseTo(0.34, 5);
    expect(preview.unreachable).toBeFalsy();
  });

  it("marks guaranteedKill only when hit is certain and minDamage covers HP", () => {
    const enemy = makeEnemy("e1", "Rat", 3, { ac: 0 });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0;
    fighter.stats.str = 20;
    fighter.level = 5;
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };

    const preview = previewAttack(state, fighter, enemy);
    expect(preview.hitChance).toBe(1);
    expect(preview.minDamage).toBeGreaterThanOrEqual(3);
    expect(preview.guaranteedKill).toBe(true);
  });

  it("parity: minDamage equals resolver damage at minimum variance (rng=0, no crit)", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 4 });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0;
    fighter.stats.str = 12;
    fighter.level = 3;
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };

    const preview = previewAttack(state, fighter, enemy);
    // 1st roll → variance 0.8; later rolls high so critChance never fires.
    let roll = 0;
    const rng = () => {
      roll += 1;
      return roll === 1 ? 0 : 0.99;
    };
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: fighter.id, targetInstanceId: "e1" },
      rng
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });

  it("applies highDefense and resistPhysical to the damage band", () => {
    const soft = makeEnemy("s1", "Rat", 100, { ac: 0 });
    const hard = makeEnemy("h1", "Armor", 100, {
      ac: 0,
      special: [{ kind: "highDefense" }, { kind: "resistPhysical", percent: 50 }],
    });
    const stateSoft = makeCombatState([soft]);
    const stateHard = makeCombatState([hard]);
    const fSoft = stateSoft.party.find((c) => c.class === "Fighter")!;
    const fHard = stateHard.party.find((c) => c.class === "Fighter")!;
    for (const f of [fSoft, fHard]) {
      f.formationSlot = 0;
      f.stats.str = 15;
      f.level = 4;
    }
    stateSoft.loadout[fSoft.id] = { weapon: undefined, armor: [] };
    stateHard.loadout[fHard.id] = { weapon: undefined, armor: [] };

    const pSoft = previewAttack(stateSoft, fSoft, soft);
    const pHard = previewAttack(stateHard, fHard, hard);
    expect(pHard.minDamage).toBeLessThan(pSoft.minDamage);
    expect(pHard.maxDamage).toBeLessThan(pSoft.maxDamage);
  });

  it("parity: Battle Cry damage buff is reflected in the preview", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 0 });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0;
    fighter.stats.str = 12;
    fighter.level = 3;
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };
    state.damageBuffs[fighter.id] = { multiplier: 1.5, duration: 1 };

    const preview = previewAttack(state, fighter, enemy);
    let roll = 0;
    const rng = () => {
      roll += 1;
      return roll === 1 ? 0 : 0.99;
    };
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: fighter.id, targetInstanceId: "e1" },
      rng
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });

  it("parity: Warlord aura damage buff is reflected in the preview", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 0 });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    const holder = state.party.find((c) => c.class === "Thief")!;
    holder.perkIds.push("halberdier-warlord");
    fighter.formationSlot = 0;
    holder.formationSlot = 1;
    fighter.stats.str = 12;
    fighter.level = 3;
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };

    const preview = previewAttack(state, fighter, enemy);
    let roll = 0;
    const rng = () => {
      roll += 1;
      return roll === 1 ? 0 : 0.99;
    };
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: fighter.id, targetInstanceId: "e1" },
      rng
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });

  it("parity: Shrink/Giant Strength scale the preview", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 0 });
    const state = makeCombatState([enemy]);
    const fighter = state.party.find((c) => c.class === "Fighter")!;
    fighter.formationSlot = 0;
    fighter.stats.str = 12;
    fighter.level = 3;
    state.loadout[fighter.id] = { weapon: undefined, armor: [] };
    fighter.status = ["shrunk"];

    const preview = previewAttack(state, fighter, enemy);
    let roll = 0;
    const rng = () => {
      roll += 1;
      return roll === 1 ? 0 : 0.99;
    };
    const after = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: fighter.id, targetInstanceId: "e1" },
      rng
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });
});

describe("previewSpellDamage", () => {
  it("returns noEffect for undead-element spells on living targets", () => {
    const enemy = makeEnemy("e1", "Rat", 40);
    const state = makeCombatState([enemy]);
    const priest = state.party.find((c) => c.class === "Priest")!;
    const undeadSpell =
      Object.values(state.spells).find(
        (s) => s.effect.kind === "damage" && s.effect.element === "undead"
      )!;
    expect(undeadSpell).toBeTruthy();
    const preview = previewSpellDamage(state, priest, undeadSpell, enemy);
    expect(preview.noEffect).toBe(true);
    expect(preview.minDamage).toBe(0);
    expect(preview.maxDamage).toBe(0);
    expect(preview.guaranteedKill).toBe(false);
  });

  it("antimagic zeros hitChance; fizzle field reduces it", () => {
    const enemy = makeEnemy("e1", "Rat", 40);
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.level = 5;
    const spell = state.spells["mage-fire-bolt"];

    state.inAntimagic = true;
    expect(previewSpellDamage(state, mage, spell, enemy).hitChance).toBe(0);

    state.inAntimagic = false;
    state.partyFizzleField = 5;
    // 1 - 5/(5+5) = 0.5
    expect(previewSpellDamage(state, mage, spell, enemy).hitChance).toBeCloseTo(0.5, 5);
  });

  it("parity: spell minDamage equals resolver damage (no variance)", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 4 });
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.sp = 50;
    mage.knownSpellIds = ["mage-fire-bolt"];
    mage.stats.int = 16;
    const spell = state.spells["mage-fire-bolt"];

    const preview = previewSpellDamage(state, mage, spell, enemy);
    expect(preview.minDamage).toBe(preview.maxDamage);

    const after = resolvePlayerTurn(
      state,
      {
        kind: "cast",
        actorId: mage.id,
        spellId: "mage-fire-bolt",
        targetInstanceId: "e1",
      },
      makeRng(0.99) // high rng so fizzle (if any) won't trigger; no field here
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });

  it("halves damage under enemy magic screen", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 0 });
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.stats.int = 12;
    const spell = state.spells["mage-fire-bolt"];

    const open = previewSpellDamage(state, mage, spell, enemy);
    state.enemyMagicScreens.front = 3;
    const screened = previewSpellDamage(state, mage, spell, enemy);
    expect(screened.minDamage).toBe(Math.max(1, Math.round(open.minDamage * 0.5)));
  });

  it("parity: Warlord aura and Giant Strength apply to spell damage", () => {
    const enemy = makeEnemy("e1", "Rat", 200, { ac: 0 });
    const state = makeCombatState([enemy]);
    const mage = state.party.find((c) => c.class === "Mage")!;
    const holder = state.party.find((c) => c.class === "Thief")!;
    holder.perkIds.push("halberdier-warlord");
    mage.formationSlot = 0;
    holder.formationSlot = 1;
    mage.sp = 50;
    mage.knownSpellIds = ["mage-fire-bolt"];
    mage.stats.int = 16;
    mage.status = ["giantStrength"];
    const spell = state.spells["mage-fire-bolt"];

    const preview = previewSpellDamage(state, mage, spell, enemy);
    const after = resolvePlayerTurn(
      state,
      {
        kind: "cast",
        actorId: mage.id,
        spellId: "mage-fire-bolt",
        targetInstanceId: "e1",
      },
      makeRng(0.99)
    );
    const dealt = 200 - after.enemies.front[0].currentHp;
    expect(preview.minDamage).toBe(dealt);
  });
});

describe("formatActionPreview", () => {
  it("formats bands, hit%, single value, and KO", () => {
    const band: ActionPreview = {
      hitChance: 1,
      minDamage: 24,
      maxDamage: 31,
      guaranteedKill: false,
    };
    expect(formatActionPreview(band)).toBe("24-31");

    const missy: ActionPreview = {
      hitChance: 0.8,
      minDamage: 24,
      maxDamage: 31,
      guaranteedKill: false,
    };
    expect(formatActionPreview(missy)).toBe("80% 24-31");

    const flat: ActionPreview = {
      hitChance: 1,
      minDamage: 38,
      maxDamage: 38,
      guaranteedKill: false,
    };
    expect(formatActionPreview(flat)).toBe("38");

    const ko: ActionPreview = {
      hitChance: 1,
      minDamage: 24,
      maxDamage: 31,
      guaranteedKill: true,
    };
    expect(formatActionPreview(ko)).toBe("24-31 KO");

    const unreachable: ActionPreview = {
      hitChance: 0,
      minDamage: 0,
      maxDamage: 0,
      guaranteedKill: false,
      unreachable: true,
    };
    expect(formatActionPreview(unreachable)).toBe("Out of reach");
  });

  it("keeps 'unreachable' and 'no data yet' visually distinct", () => {
    // Regression: these two used to render identically as "—", so a player
    // couldn't tell "I can't hit this" from "I haven't scouted this yet".
    const unreachable: ActionPreview = {
      hitChance: 0,
      minDamage: 0,
      maxDamage: 0,
      guaranteedKill: false,
      unreachable: true,
    };
    const noEffect: ActionPreview = {
      hitChance: 0,
      minDamage: 0,
      maxDamage: 0,
      guaranteedKill: false,
      noEffect: true,
    };
    expect(formatActionPreview(unreachable)).toBe("Out of reach");
    expect(formatActionPreview(noEffect)).toBe("—");
    expect(formatActionPreview(unreachable)).not.toBe(formatActionPreview(noEffect));
  });
});
