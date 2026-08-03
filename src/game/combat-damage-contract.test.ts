/**
 * Tests for the universal party-damage contract.
 * Enemy spell damage and status ticks (poison) must route through
 * applyPartyDamage so lethal-save hooks (Guardian Angel, Paladin),
 * damage redirection (Martyr), and SP absorption (Mana Shield) apply
 * universally — not just to enemy melee.
 */
import { describe, it, expect } from "vitest";
import { createCharacter, type Character } from "./party";
import { createCombatState, resolveCombatRound } from "./combat";
import { ALL_SPELLS, type SpellDef } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import type { CombatState, EnemyInstance, PlayerAction } from "./combat-types";

const SPELLS = Object.fromEntries(ALL_SPELLS.map((s) => [s.id, s])) as Record<
  string, SpellDef
>;
const ITEMS = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

function makeEnemy(instanceId: string, opts: Partial<EnemyInstance> = {}): EnemyInstance {
  return {
    id: "test-mage",
    name: "Test Mage",
    floors: [1],
    rowPreference: "back",
    hp: 100,
    attack: 50,
    ac: 0,
    agi: 5,
    xp: 1,
    gold: 1,
    special: [{ kind: "caster", element: "fire" }],
    isBoss: false,
    instanceId,
    currentHp: 100,
    row: "back",
    status: [],
    ...opts,
  };
}

function makeChar(id: string, classId: string, perks: string[] = []): Character {
  const c = createCharacter(
    id, id, "Human", "Neutral",
    classId as Character["class"], 10
  );
  c.level = 10;
  c.maxHp = 30;
  c.hp = 30;
  c.maxSp = 100;
  c.sp = 100;
  c.perkIds = perks;
  return c;
}

function makeState(party: Character[], enemies: EnemyInstance[]): CombatState {
  return createCombatState(
    party,
    { front: enemies.filter((e) => e.row === "front"), back: enemies.filter((e) => e.row === "back") },
    false, SPELLS, ITEMS
  );
}

const fixedRng = () => 0.5;

describe("universal party-damage contract", () => {
  it("Guardian Angel saves an ally from lethal enemy spell damage", () => {
    // Guardian Angel: first ALLY (not self) who would die survives at 1 HP.
    // The GA holder must be a DIFFERENT character from the spell target.
    const gaHolder = makeChar("ga", "Priest", ["priest-guardian-angel"]);
    gaHolder.hp = 100; // GA holder stays alive
    const target = makeChar("target", "Fighter");
    target.hp = 5; // low HP — enemy spell will be lethal
    const enemy = makeEnemy("e0", { attack: 50, special: [{ kind: "caster", element: "fire" }] });
    const state = makeState([gaHolder, target], [enemy]);

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const, actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, fixedRng);
    const targetAfter = result.party.find((c) => c.id === "target")!;
    // Guardian Angel should have prevented death — HP should be 1, not 0.
    expect(targetAfter.hp).toBe(1);
    expect(targetAfter.status).not.toContain("knockedOut");
  });

  it("Guardian Angel saves an ally from lethal poison damage", () => {
    const gaHolder = makeChar("ga", "Priest", ["priest-guardian-angel"]);
    gaHolder.hp = 100;
    const target = makeChar("target", "Fighter");
    target.hp = 2; // will die to poison (damage 2)
    target.status = ["poison"];
    const enemy = makeEnemy("e0", { attack: 1, row: "front", special: [] });
    const state = makeState([gaHolder, target], [enemy]);
    state.poisonState[target.id] = { damage: 2, duration: 3 };

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const, actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, fixedRng);
    const targetAfter = result.party.find((c) => c.id === "target")!;
    // Guardian Angel should have prevented death from poison.
    expect(targetAfter.hp).toBe(1);
    expect(targetAfter.status).not.toContain("knockedOut");
  });

  it("Martyr redirects enemy spell damage (proves applyPartyDamage is called)", () => {
    // priest-martyr: redirect half damage from adjacent front-row allies.
    // If enemy spells bypass applyPartyDamage, Martyr won't redirect.
    const martyr = makeChar("martyr", "Priest", ["priest-martyr"]);
    martyr.hp = 100;
    const target = makeChar("target", "Fighter");
    target.hp = 30;
    const enemy = makeEnemy("e0", { attack: 50, special: [{ kind: "caster", element: "fire" }] });
    const state = makeState([martyr, target], [enemy]);

    const actions: PlayerAction[] = state.party.map((c) => ({
      kind: "defend" as const, actorId: c.id,
    }));

    const result = resolveCombatRound(state, actions, fixedRng);
    const targetAfter = result.party.find((c) => c.id === "target")!;
    // If Martyr redirected, the target took only half damage and survived.
    // Without redirect, a 50-attack spell would kill a 30-HP character.
    expect(targetAfter.hp).toBeGreaterThan(0);
    expect(targetAfter.status).not.toContain("knockedOut");
  });
});
