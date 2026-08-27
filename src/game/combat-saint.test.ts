/**
 * Tests for priest-saint's healing-as-revival authorization.
 * The Saint perk allows healing spells to target KO'd allies (reviving them).
 * Non-Saint casters must NOT be able to heal-revive KO'd allies, whether
 * through the spell resolver directly or through the per-turn API.
 */
import { describe, it, expect } from "vitest";
import { createCharacterRecord, type Character } from "./party";
import { createCombatState, resolvePlayerTurn } from "./combat";
import { applySpell } from "./combat-spells";
import { ALL_SPELLS, type SpellDef } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import type { CombatState, EnemyInstance, CombatEvent } from "./combat-types";

const SPELLS = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s])) as Record<
  string,
  SpellDef
>;
const ITEMS = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

const HEAL_SPELL = SPELLS["priest-cure-wounds"];
const MASS_HEAL_SPELL = ALL_SPELLS.find(
  (s) => s.effect.kind === "heal" && s.target === "allAllies"
);

function makeEnemy(instanceId: string): EnemyInstance {
  return {
    id: "test-rat",
    name: "Test Rat",
    floors: [1],
    rowPreference: "front",
    hp: 100,
    attack: 5,
    ac: 0,
    agi: 5,
    xp: 1,
    gold: 1,
    special: [],
    isBoss: false,
    instanceId,
    currentHp: 100,
    row: "front",
    status: [],
  };
}

function makeCaster(classId: string, withSaint: boolean): Character {
  const c = createCharacterRecord(
    "caster",
    "Caster",
    "Human",
    "Neutral",
    classId as Character["class"],
    10
  );
  c.level = 10;
  c.maxHp = 100;
  c.hp = 100;
  c.maxSp = 999;
  c.sp = 999;
  c.knownSpellIds = [HEAL_SPELL.id];
  if (withSaint) {
    c.perkIds = ["priest-saint"];
  }
  return c;
}

function makeKoAlly(): Character {
  const a = createCharacterRecord(
    "ko-ally",
    "KO'd Ally",
    "Human",
    "Neutral",
    "Fighter",
    5
  );
  a.maxHp = 80;
  a.hp = 0;
  a.status = ["knockedOut"];
  return a;
}

function makeState(caster: Character, koAlly: Character): CombatState {
  const living = createCharacterRecord(
    "living",
    "Living",
    "Human",
    "Neutral",
    "Fighter",
    5
  );
  living.maxHp = 100;
  living.hp = 100;
  return createCombatState(
    [caster, living, koAlly],
    { front: [makeEnemy("e0")], back: [] },
    false,
    SPELLS,
    ITEMS
  );
}

describe("priest-saint heal-revival authorization", () => {
  it("a Saint can heal-revive a KO'd ally", () => {
    const caster = makeCaster("Priest", true);
    const ko = makeKoAlly();
    const state = makeState(caster, ko);

    const result = resolvePlayerTurn(state, {
      kind: "cast",
      actorId: "caster",
      spellId: HEAL_SPELL.id,
      targetAllyId: "ko-ally",
    }, () => 0.5);

    const after = result.party.find((c) => c.id === "ko-ally")!;
    expect(after.status).not.toContain("knockedOut");
    expect(after.hp).toBeGreaterThan(0);
  });

  it("a non-Saint cannot heal-revive a KO'd ally via resolvePlayerTurn", () => {
    const caster = makeCaster("Priest", false);
    const ko = makeKoAlly();
    const state = makeState(caster, ko);

    const result = resolvePlayerTurn(state, {
      kind: "cast",
      actorId: "caster",
      spellId: HEAL_SPELL.id,
      targetAllyId: "ko-ally",
    }, () => 0.5);

    const after = result.party.find((c) => c.id === "ko-ally")!;
    expect(after.status).toContain("knockedOut");
    expect(after.hp).toBe(0);
  });

  it("a non-Saint cannot heal-revive a KO'd ally via direct applySpell", () => {
    const caster = makeCaster("Priest", false);
    const ko = makeKoAlly();
    const state = makeState(caster, ko);
    const log: string[] = [];
    const events: CombatEvent[] = [];
    const logFn = (m: string) => { log.push(m); };
    const emitFn = (m: string, e: CombatEvent) => { log.push(m); events.push(e); };

    applySpell(
      state,
      caster,
      HEAL_SPELL,
      { kind: "cast", actorId: "caster", spellId: HEAL_SPELL.id, targetAllyId: "ko-ally" },
      () => 0.5,
      logFn,
      emitFn
    );

    const after = state.party.find((c) => c.id === "ko-ally")!;
    expect(after.status).toContain("knockedOut");
    expect(after.hp).toBe(0);
  });

  it("a non-Saint's group heal does not revive KO'd allies", () => {
    if (!MASS_HEAL_SPELL) return; // no group heal spell exists
    const caster = makeCaster("Priest", false);
    caster.knownSpellIds = [MASS_HEAL_SPELL.id];
    const ko = makeKoAlly();
    const state = makeState(caster, ko);

    const result = resolvePlayerTurn(state, {
      kind: "cast",
      actorId: "caster",
      spellId: MASS_HEAL_SPELL.id,
    }, () => 0.5);

    const after = result.party.find((c) => c.id === "ko-ally")!;
    expect(after.status).toContain("knockedOut");
    expect(after.hp).toBe(0);
  });

  it("a Saint's group heal revives KO'd allies", () => {
    if (!MASS_HEAL_SPELL) return;
    const caster = makeCaster("Priest", true);
    caster.knownSpellIds = [MASS_HEAL_SPELL.id];
    const ko = makeKoAlly();
    const state = makeState(caster, ko);

    const result = resolvePlayerTurn(state, {
      kind: "cast",
      actorId: "caster",
      spellId: MASS_HEAL_SPELL.id,
    }, () => 0.5);

    const after = result.party.find((c) => c.id === "ko-ally")!;
    expect(after.status).not.toContain("knockedOut");
    expect(after.hp).toBeGreaterThan(0);
  });
});
