import { describe, expect, it } from "vitest";
import {
  beginRound,
  createCombatState,
  resolveCombatRound,
  resolveEnemyTurn,
  resolvePlayerTurn,
} from "./combat";
import { enemyAbilityById } from "../data/enemy-abilities";
import type {
  CombatState,
  EnemyFormation,
  EnemyInstance,
} from "./combat-types";
import { createDefaultParty } from "./party";
import { guardForTarget } from "./combat-chemistry";

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
    floors: [2],
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

function defendActions(state: CombatState) {
  return state.party.map((character) => ({
    kind: "defend" as const,
    actorId: character.id,
  }));
}

// ---------------------------------------------------------------------------
// Archer Guard: Armored Skeleton guards Skeleton Archers (reuses guard pipeline)
// ---------------------------------------------------------------------------

function makeArcherGuardState(): CombatState {
  const armor = makeEnemy("armored-skeleton", "armor-0", 500, "front", {
    abilityIds: ["shield-bash", "iron-fist", "archer-guard"],
    agi: 20,
  });
  const archer = makeEnemy("skeleton-archer", "archer-0", 100, "back", {
    abilityIds: ["archer-volley"],
  });
  const formation: EnemyFormation = { front: [armor], back: [archer] };
  const state = createCombatState(createDefaultParty(), formation, false);
  state.chemistryEnabled = true;
  return state;
}

describe("f2 Archer Guard (guard pipeline reuse)", () => {
  it("the archer-guard ability is registered and reuses the guard effect", () => {
    const ability = enemyAbilityById("archer-guard");
    expect(ability).toBeDefined();
    expect(ability!.effect.kind).toBe("guard");
    expect(ability!.presentation).toBe("guardAlly");
    expect(ability!.guardTargetIds).toEqual(["skeleton-archer"]);
    expect(ability!.chemistryId).toBe("chem-archer-guard");
  });

  it("armored skeleton guards the skeleton archer via the round-based AI", () => {
    const initial = makeArcherGuardState();
    const first = resolveCombatRound(initial, defendActions(initial), () => 0.1);
    const guard = first.enemyGuards?.["archer-0"];
    expect(guard?.guarderId).toBe("armor-0");
    expect(guard?.targetId).toBe("archer-0");
    expect(first.chemistryTelemetry?.resolved["chem-archer-guard"]).toBe(1);
  });

  it("redirects one ordinary attack from the archer to the armor", () => {
    let state = resolveCombatRound(
      makeArcherGuardState(),
      defendActions(makeArcherGuardState()),
      () => 0.1
    );
    const archer = state.enemies.back[0]!;
    const beforeArcher = archer.currentHp;
    const beforeArmor = state.enemies.front[0]!.currentHp;
    state = resolveCombatRound(
      state,
      [
        {
          kind: "attack",
          actorId: state.party[0]!.id,
          targetInstanceId: archer.instanceId,
        },
        ...state.party
          .slice(1)
          .map((character) => ({ kind: "defend" as const, actorId: character.id })),
      ],
      () => 0.99
    );
    // Archer unharmed (guard intercepted), armor took the hit
    expect(archer.currentHp).toBe(beforeArcher);
    expect(state.enemies.front[0]!.currentHp).toBeLessThan(beforeArmor);
    // Guard token consumed
    expect(state.enemyGuards?.[archer.instanceId]).toBeUndefined();
  });

  it("is inert in a formation without skeleton-archers (no valid guard target)", () => {
    // f2-lab-keepers has armored-skeleton but no skeleton-archer.
    // The guard ability should never fire because pickAbilityTargetId
    // returns null when no guardTargetIds ally is present.
    const armor = makeEnemy("armored-skeleton", "armor-1", 500, "front", {
      abilityIds: ["shield-bash", "iron-fist", "archer-guard"],
      agi: 20,
    });
    const experiment = makeEnemy("failed-experiment", "exp-0", 100, "front");
    const formation: EnemyFormation = { front: [armor, experiment], back: [] };
    const state = createCombatState(createDefaultParty(), formation, false);
    state.chemistryEnabled = true;
    const result = resolveCombatRound(state, defendActions(state), () => 0.01);
    // No guard was set on the experiment
    expect(result.enemyGuards?.["exp-0"]).toBeUndefined();
    // No archer-guard chemistry was resolved
    expect(result.chemistryTelemetry?.resolved["chem-archer-guard"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Lab Keepers: Cursed Scribe preferentially heals the Feral Scrivener
// ---------------------------------------------------------------------------

function makeLabKeepersState(): CombatState {
  const experiment = makeEnemy("failed-experiment", "exp-0", 40, "front", {
    abilityIds: ["berserk", "savage-lunge"],
    agi: 4,
  });
  const armor = makeEnemy("armored-skeleton", "armor-0", 19, "front", {
    abilityIds: ["shield-bash", "iron-fist", "archer-guard"],
  });
  const assistant = makeEnemy("lab-assistant", "scribe-0", 24, "back", {
    special: [
      {
        kind: "healer",
        spellName: "Cure Wounds",
        preferTargetIds: ["failed-experiment"],
      },
    ],
    abilityIds: ["mass-heal-ability", "ward"],
    agi: 8,
  });
  const eyeball = makeEnemy("eyeball-monster", "eye-0", 30, "back", {
    abilityIds: ["blinding-gaze", "curse"],
  });
  const formation: EnemyFormation = {
    front: [experiment, armor],
    back: [assistant, eyeball],
  };
  const state = createCombatState(createDefaultParty(), formation, false);
  state.chemistryEnabled = true;
  return state;
}

describe("f2 Lab Keepers (preferential healer targeting)", () => {
  it("lab-assistant's healer special has preferTargetIds for failed-experiment", () => {
    const state = makeLabKeepersState();
    const scribe = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.id === "lab-assistant"
    )!;
    const healerSpecial = scribe.special.find((s) => s.kind === "healer") as
      | { kind: "healer"; spellName: string; preferTargetIds?: string[] }
      | undefined;
    expect(healerSpecial).toBeDefined();
    expect(healerSpecial!.preferTargetIds).toEqual(["failed-experiment"]);
  });

  it("heals the failed-experiment when it is wounded, even if the assistant is also wounded", () => {
    const state = makeLabKeepersState();
    // Wound both the experiment and the assistant
    const experiment = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.id === "failed-experiment"
    )!;
    const scribe = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.id === "lab-assistant"
    )!;
    experiment.currentHp = 20; // 50% HP
    scribe.currentHp = 12; // 50% HP — same ratio, lower absolute HP

    // The old AI would pick the scribe (lowest currentHp). With
    // preferTargetIds, the experiment should be preferred.
    const first = beginRound(state, () => 0.5);
    let resolved = first.state;
    for (const entry of first.queue) {
      if (entry.kind === "enemy") {
        const before = resolved.enemies.front.find((e) => e.id === "failed-experiment")!.currentHp;
        resolved = resolveEnemyTurn(resolved, entry.id, () => 0.5);
        const after = resolved.enemies.front.find((e) => e.id === "failed-experiment")!.currentHp;
        // If this was the scribe's turn and it healed, the experiment's HP
        // should have increased (or at least the heal targeted it).
        if (after > before) break;
      } else if (entry.kind === "player") {
        resolved = resolvePlayerTurn(resolved, { kind: "defend", actorId: entry.id }, () => 0.5);
      }
    }
    // The experiment should have been healed at some point
    const experimentHp = resolved.enemies.front.find((e) => e.id === "failed-experiment")!.currentHp;
    expect(experimentHp).toBeGreaterThan(20);
  });

  it("falls back to most-wounded ally when no preferred target is wounded", () => {
    const state = makeLabKeepersState();
    // Wound only the armor (not a preferred target)
    const armor = [...state.enemies.front, ...state.enemies.back].find(
      (e) => e.instanceId === "armor-0"
    )!;
    armor.currentHp = 5;
    const first = beginRound(state, () => 0.5);
    let resolved = first.state;
    let healedArmor = false;
    for (const entry of first.queue) {
      if (entry.kind === "enemy") {
        const before = resolved.enemies.front.find((e) => e.instanceId === "armor-0")!.currentHp;
        resolved = resolveEnemyTurn(resolved, entry.id, () => 0.5);
        const after = resolved.enemies.front.find((e) => e.instanceId === "armor-0")!.currentHp;
        if (after > before) healedArmor = true;
      } else if (entry.kind === "player") {
        resolved = resolvePlayerTurn(resolved, { kind: "defend", actorId: entry.id }, () => 0.5);
      }
    }
    // The armor should have been healed (fallback to most-wounded)
    expect(healedArmor).toBe(true);
  });
});
