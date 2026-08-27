import { describe, expect, it } from "vitest";
import {
  beginRound,
  createCombatState,
  resolveCombatRound,
  resolveEnemyTurn,
  resolvePlayerTurn,
} from "./combat";
import { enemyAbilityById } from "../data/enemy-abilities";
import type { SpellDef } from "../data/spells";
import type { CombatState, EnemyFormation, EnemyInstance } from "./combat-types";
import { createCombatTestRoster } from "./test-roster";
import {
  guardForTarget,
  setEnemyGuard,
} from "./combat-chemistry";
import { formatActionPreview } from "../engine/combat-display";
import { previewAttack, previewSpellDamage } from "./combat-preview";

function makeEnemy(
  id: string,
  instanceId: string,
  hp = 120,
  row: "front" | "back" = "front",
  overrides: Partial<EnemyInstance> = {}
): EnemyInstance {
  return {
    id,
    name: id,
    floors: [1],
    rowPreference: row,
    hp,
    attack: 1,
    ac: 0,
    agi: 1,
    xp: 5,
    gold: 3,
    special: [],
    isBoss: false,
    instanceId,
    currentHp: hp,
    row,
    status: [],
    ...overrides,
  };
}

function makeGuardState(): CombatState {
  const armor = makeEnemy("crypt-animated-armor", "armor-0", 500, "front", {
    abilityIds: ["crypt-living-shield"],
    agi: 20,
  });
  const warlock = makeEnemy("crypt-warlock", "warlock-0", 500, "back");
  const formation: EnemyFormation = { front: [armor], back: [warlock] };
  const state = createCombatState(createCombatTestRoster(), formation, false);
  state.chemistryEnabled = true;
  return state;
}

function defendActions(state: CombatState) {
  return state.party.map((character) => ({
    kind: "defend" as const,
    actorId: character.id,
  }));
}

function armGuard(state: CombatState, duration = 2): void {
  const armor = [...state.enemies.front, ...state.enemies.back].find(
    (enemy) => enemy.instanceId === "armor-0"
  )!;
  const warlock = [...state.enemies.front, ...state.enemies.back].find(
    (enemy) => enemy.instanceId === "warlock-0"
  )!;
  const ability = enemyAbilityById("crypt-living-shield")!;
  expect(setEnemyGuard(state, armor, warlock, ability, duration)).toBe(true);
}

function eventCount(state: CombatState, type: string): number {
  return state.events.filter((event) => event?.type === type).length;
}

function addDamageSpell(state: CombatState, id = "guard-test-spell"): void {
  const spell: SpellDef = {
    id,
    name: "Guard Test Bolt",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 8 },
    description: "A deterministic guard test spell.",
  };
  state.spells[id] = spell;
  const mage = state.party.find((character) => character.class === "Mage")!;
  mage.knownSpellIds.push(id);
  mage.sp = mage.maxSp;
}

describe("bounded Living Shield interception", () => {
  it("selects the exact authored caster ID in the round-based AI and protects it", () => {
    const initial = makeGuardState();
    const first = resolveCombatRound(initial, defendActions(initial), () => 0.1);
    const guard = first.enemyGuards?.["warlock-0"];
    expect(guard?.guarderId).toBe("armor-0");
    expect(guard?.targetId).toBe("warlock-0");
    expect(first.chemistryTelemetry?.resolved["chem-living-shield"]).toBe(1);
    expect(first.chemistryTelemetry?.attempted["chem-living-shield"]).toBe(1);
  });

  it("redirects one ordinary attack and consumes the token without retargeting the cursor target", () => {
    let state = resolveCombatRound(makeGuardState(), defendActions(makeGuardState()), () => 0.1);
    const warlock = state.enemies.back[0]!;
    const beforeTarget = warlock.currentHp;
    const beforeGuarder = state.enemies.front[0]!.currentHp;
    state = resolveCombatRound(
      state,
      [
        { kind: "attack", actorId: state.party[0]!.id, targetInstanceId: warlock.instanceId },
        ...state.party.slice(1).map((character) => ({ kind: "defend" as const, actorId: character.id })),
      ],
      () => 0.99
    );
    expect(state.enemyGuards?.[warlock.instanceId]).toBeUndefined();
    expect(warlock.currentHp).toBe(beforeTarget);
    expect(state.enemies.back[0]!.currentHp).toBe(beforeGuarder);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "intercept",
      targetId: "warlock-0",
      partnerId: "armor-0",
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "attack",
      targetId: "armor-0",
    }));
  });

  it("uses the same exact token in the per-turn API", () => {
    let state = makeGuardState();
    const first = beginRound(state, () => 0.1);
    state = first.state;
    for (const entry of first.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, () => 0.1);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, () => 0.1);
      }
    }
    expect(state.enemyGuards?.["warlock-0"]).toBeDefined();
    const target = state.enemies.back[0]!;
    const result = resolvePlayerTurn(
      state,
      { kind: "attack", actorId: state.party[0]!.id, targetInstanceId: target.instanceId },
      () => 0.99
    );
    expect(result.events).toContainEqual(expect.objectContaining({ type: "chemistry", phase: "intercept" }));
    expect(result.enemyGuards?.[target.instanceId]).toBeUndefined();
  });

  it("redirects direct attack, damage spell, ambush, and technique actions", () => {
    const cases: Array<{
      name: string;
      action: (state: CombatState) => Parameters<typeof resolvePlayerTurn>[1];
      setup?: (state: CombatState) => void;
    }> = [
      {
        name: "attack",
        action: (state) => ({ kind: "attack", actorId: state.party[0]!.id, targetInstanceId: "warlock-0" }),
      },
      {
        name: "spell",
        setup: addDamageSpell,
        action: (state) => ({ kind: "cast", actorId: state.party[2]!.id, spellId: "guard-test-spell", targetInstanceId: "warlock-0" }),
      },
      {
        name: "ambush",
        setup: (state) => { state.party[1]!.status = ["hidden"]; },
        action: (state) => ({ kind: "ambush", actorId: state.party[1]!.id, targetInstanceId: "warlock-0" }),
      },
      {
        name: "technique",
        setup: (state) => { state.rage[state.party[0]!.id] = 100; },
        action: (state) => ({ kind: "technique", actorId: state.party[0]!.id, techniqueId: "fighter-power-attack", targetInstanceId: "warlock-0" }),
      },
    ];

    for (const testCase of cases) {
      const state = makeGuardState();
      testCase.setup?.(state);
      armGuard(state);
      const result = resolvePlayerTurn(state, testCase.action(state), () => 0.99);
      const intercepts = result.events.filter((event) => event?.type === "chemistry" && event.phase === "intercept");
      expect(intercepts, testCase.name).toHaveLength(1);
      expect(result.enemyGuards?.["warlock-0"], testCase.name).toBeUndefined();
      const damageEvents = result.events.filter(
        (event) => event?.type === "attack" || event?.type === "ambush" || event?.type === "spellEffect" || event?.type === "techniqueHit"
      );
      expect(damageEvents.some((event) => event?.targetId === "armor-0"), testCase.name).toBe(true);
      expect(damageEvents.some((event) => event?.targetId === "warlock-0"), testCase.name).toBe(false);
    }
  });

  it("redirects every hit of a multi-hit single-target technique with one token", () => {
    const state = makeGuardState();
    state.rage[state.party[0]!.id] = 100;
    armGuard(state);
    const result = resolvePlayerTurn(
      state,
      {
        kind: "technique",
        actorId: state.party[0]!.id,
        techniqueId: "duelist-flurry",
        targetInstanceId: "warlock-0",
      },
      () => 0.99
    );
    expect(result.events.filter((event) => event?.type === "chemistry" && event.phase === "intercept")).toHaveLength(1);
    const hits = result.events.filter((event) => event?.type === "techniqueHit");
    expect(hits).toHaveLength(3);
    expect(hits.every((event) => event?.targetId === "armor-0")).toBe(true);
    expect(result.enemyGuards?.["warlock-0"]).toBeUndefined();
  });

  it("bypasses guards for status-only spells and area damage", () => {
    const state = makeGuardState();
    const mage = state.party[2]!;
    const statusSpell: SpellDef = {
      id: "guard-test-status",
      name: "Guard Test Sleep",
      class: "Mage",
      tier: 1,
      spCost: 1,
      target: "singleEnemy",
      effect: { kind: "disable", status: "paralysis" },
      description: "A status-only guard bypass test.",
    };
    const areaSpell: SpellDef = {
      id: "guard-test-area",
      name: "Guard Test Area",
      class: "Mage",
      tier: 1,
      spCost: 1,
      target: "allEnemies",
      effect: { kind: "damage", element: "fire", power: 3 },
      description: "An area guard bypass test.",
    };
    state.spells[statusSpell.id] = statusSpell;
    state.spells[areaSpell.id] = areaSpell;
    mage.knownSpellIds.push(statusSpell.id, areaSpell.id);
    mage.sp = mage.maxSp;

    armGuard(state);
    let after = resolvePlayerTurn(
      state,
      { kind: "cast", actorId: mage.id, spellId: statusSpell.id, targetInstanceId: "warlock-0" },
      () => 0.1
    );
    expect(after.enemyGuards?.["warlock-0"]).toBeDefined();
    expect(after.enemies.back[0]!.status).toContain("paralysis");
    expect(eventCount(after, "chemistry")).toBe(0);

    const beforeArmor = after.enemies.front[0]!.currentHp;
    const beforeTarget = after.enemies.back[0]!.currentHp;
    after = resolvePlayerTurn(
      after,
      { kind: "cast", actorId: mage.id, spellId: areaSpell.id },
      () => 0.1
    );
    expect(after.enemyGuards?.["warlock-0"]).toBeDefined();
    expect(after.enemies.front[0]!.currentHp).toBeLessThan(beforeArmor);
    expect(after.enemies.back[0]!.currentHp).toBeLessThan(beforeTarget);
    expect(after.guardBypasses).toBe(1);
    expect(eventCount(after, "chemistry")).toBe(0);
  });

  it("exposes the guarded marker in previews without changing the selected target", () => {
    const state = makeGuardState();
    armGuard(state);
    const fighter = state.party[0]!;
    const mage = state.party[2]!;
    addDamageSpell(state);
    const target = state.enemies.back[0]!;
    const attackPreview = previewAttack(state, fighter, target);
    const spellPreview = previewSpellDamage(state, mage, state.spells["guard-test-spell"]!, target);
    expect(attackPreview.guardedById).toBe("armor-0");
    expect(attackPreview.redirectedTargetId).toBe("armor-0");
    expect(spellPreview.guardedById).toBe("armor-0");
    expect(formatActionPreview(attackPreview)).toContain("INTERCEPT");
  });

  it("breaks on guarder/target death or disable, expires, and cannot stack or self-guard", () => {
    const ability = enemyAbilityById("crypt-living-shield")!;
    const state = makeGuardState();
    armGuard(state);
    const armor = state.enemies.front[0]!;
    const warlock = state.enemies.back[0]!;
    expect(setEnemyGuard(state, armor, warlock, ability, 2)).toBe(false);
    expect(setEnemyGuard(state, armor, armor, ability, 2)).toBe(false);

    armor.status.push("sleep");
    expect(guardForTarget(state, warlock.instanceId)).toBeUndefined();
    const afterDisable = resolvePlayerTurn(state, { kind: "defend", actorId: state.party[0]!.id }, () => 0.1);
    expect(afterDisable.enemyGuards?.[warlock.instanceId]).toBeUndefined();

    const expired = makeGuardState();
    expired.round = 1;
    armGuard(expired, 2);
    const round2 = beginRound(expired, () => 0.1).state;
    expect(round2.enemyGuards?.["warlock-0"]).toBeDefined();
    const round3 = beginRound(round2, () => 0.1).state;
    expect(round3.enemyGuards?.["warlock-0"]).toBeUndefined();

    const targetDead = makeGuardState();
    armGuard(targetDead);
    targetDead.enemies.back[0]!.currentHp = 0;
    const afterTargetDeath = resolvePlayerTurn(targetDead, { kind: "defend", actorId: targetDead.party[0]!.id }, () => 0.1);
    expect(afterTargetDeath.enemyGuards?.["warlock-0"]).toBeUndefined();
  });
});
