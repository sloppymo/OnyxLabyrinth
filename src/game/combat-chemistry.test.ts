import { describe, expect, it } from "vitest";
import {
  beginRound,
  createCombatState,
  endRound,
  resolveCombatRound,
  resolveEnemyTurn,
  resolvePlayerTurn,
} from "./combat";
import { resolveEnemyAction } from "./combat-enemy";
import { deathCheck } from "./combat-eor";
import {
  chemistryResourceCandidates,
  reserveChemistryUse,
  selectChemistryResource,
} from "./combat-chemistry";
import { createDefaultParty } from "./party";
import type { EnemyInstance, EnemyFormation, Rng } from "./combat-types";
import type { EnemyDef } from "../data/enemies";
import { enemyAbilityById } from "../data/enemy-abilities";

const fixedRng: Rng = () => 0.1;

function makeEnemy(
  id: string,
  instanceId: string,
  hp: number,
  row: "front" | "back" = "front",
  overrides: Partial<EnemyDef> = {}
): EnemyInstance {
  const def: EnemyDef = {
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
    ...overrides,
  };
  return {
    ...def,
    instanceId,
    currentHp: hp,
    row,
    status: [],
  };
}

function makeChemistryState(resourceCount = 1, metadataChemistry = false) {
  const party = createDefaultParty();
  const caster = makeEnemy("crypt-minotaur", "caster-0", 60, "front", {
    abilityIds: ["crypt-slime-cannon"],
  });
  const slimes = Array.from({ length: resourceCount }, (_, index) =>
    makeEnemy("slime", `slime-${index}`, 13, "front", {
      chemistryGroups: ["throwable-slime"],
    })
  );
  slimes.forEach((slime, index) => {
    slime.spawnSerial = index;
  });
  const formation: EnemyFormation = { front: [caster, ...slimes], back: [] };
  const state = createCombatState(
    party,
    formation,
    false,
    {},
    {},
    {},
    false,
    {},
    metadataChemistry ? { chemistryEnabled: true } : {}
  );
  state.chemistryEnabled = true;
  return state;
}

function makeOgreTossState(resourceId = "skeleton-0", resourceEnemyId = "skeleton") {
  const party = createDefaultParty();
  const ogre = makeEnemy("crypt-hill-ogre", "ogre-0", 60, "front", {
    abilityIds: ["ogre-toss"],
  });
  const resource = makeEnemy(resourceEnemyId, resourceId, 10, "front", {
    chemistryGroups: resourceEnemyId === "skeleton" ? ["harvestable-bone"] : undefined,
  });
  const state = createCombatState(party, { front: [ogre, resource], back: [] }, false);
  state.chemistryEnabled = true;
  return state;
}

function defendActions(state: { party: Array<{ id: string }> }) {
  return state.party.map((character) => ({ kind: "defend" as const, actorId: character.id }));
}

describe("formation chemistry resource substrate", () => {
  it("records formation presence separately from eligibility and commitment", () => {
    const state = makeChemistryState(1, true);
    expect(state.chemistryTelemetry?.present["chem-slime-cannon"]).toBe(1);
    expect(state.chemistryTelemetry?.eligible["chem-slime-cannon"] ?? 0).toBe(0);

    const result = resolveCombatRound(state, defendActions(state), fixedRng);
    expect(result.chemistryTelemetry?.eligible["chem-slime-cannon"]).toBeGreaterThan(0);
    expect(result.chemistryTelemetry?.attempted["chem-slime-cannon"]).toBe(1);
    expect(result.chemistryTelemetry?.telegraphed["chem-slime-cannon"]).toBe(1);
  });

  it("uses only exact authored groups or explicit IDs and ignores passive resource disability", () => {
    const state = makeChemistryState(2);
    const future = makeEnemy("future-undead", "future-0", 20, "front", {
      special: [{ kind: "undead" }],
    });
    state.enemies.front.push(future);
    state.enemies.front[1].status.push("sleep");
    state.enemies.front[2].status.push("paralysis");

    expect(
      chemistryResourceCandidates(state, { group: "throwable-slime" }).map((e) => e.instanceId)
    ).toEqual(["slime-0", "slime-1"]);
    expect(
      chemistryResourceCandidates(state, { enemyIds: ["future-undead"] }).map((e) => e.instanceId)
    ).toEqual(["future-0"]);
    expect(chemistryResourceCandidates(state, { group: "harvestable-bone" })).toEqual([]);
  });

  it("selects oldest spawn serial, then instance ID, and reserves without duplicate selection", () => {
    const state = makeChemistryState(2);
    state.enemies.front[1].spawnSerial = 20;
    state.enemies.front[2].spawnSerial = 10;
    const ability = enemyAbilityById("crypt-slime-cannon")!;
    const first = selectChemistryResource(state, { group: "throwable-slime" });
    expect(first?.instanceId).toBe("slime-1");
    reserveChemistryUse(state, state.enemies.front[0], ability, "p0", first?.instanceId);
    expect(selectChemistryResource(state, { group: "throwable-slime" })?.instanceId).toBe("slime-0");
    expect(selectChemistryResource(state, { group: "throwable-slime" }, ["slime-0"])).toBeUndefined();
    expect(reserveChemistryUse(state, state.enemies.front[0], ability, "p1", "slime-0")).toBeUndefined();

    const secondCaster = makeEnemy("crypt-minotaur", "caster-1", 60, "front", {
      abilityIds: ["crypt-slime-cannon"],
    });
    state.enemies.front.push(secondCaster);
    expect(
      reserveChemistryUse(state, secondCaster, ability, "p1", first?.instanceId)
    ).toBeUndefined();
  });

  it("commits the exact resource and successful round-based resolution consumes it once", () => {
    let state = makeChemistryState();
    state = resolveCombatRound(state, defendActions(state), fixedRng);
    const caster = state.enemies.front.find((enemy) => enemy.instanceId === "caster-0")!;
    const committedWindUp = state.windUps[caster.instanceId];
    expect((committedWindUp as { resourceId?: string } | undefined)?.resourceId).toBe("slime-0");
    expect(state.chemistryUses?.["caster-0:crypt-slime-cannon"]).toBe(1);
    expect(state.enemies.front.find((enemy) => enemy.instanceId === "caster-0")?.abilityCooldowns?.["crypt-slime-cannon"]).toBeGreaterThan(0);

    state = resolveCombatRound(state, defendActions(state), fixedRng);
    expect(state.events.some((event) => event?.type === "chemistry" && event.phase === "consume")).toBe(true);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "resolve",
      chemistryId: "chem-slime-cannon",
      resourceId: "slime-0",
      targetId: "c1",
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "cast",
      spellId: "crypt-slime-cannon",
      presentation: "throwAlly",
    }));
    expect(state.justDied.some((enemy) => enemy.instanceId === "slime-0")).toBe(true);
    expect(state.goldEarned).toBe(3);
    expect(state.xpEarned).toBe(5);
    expect(state.chemistryTelemetry?.resolved["chem-slime-cannon"]).toBe(1);
  });

  it("fizzles without retargeting when the committed resource dies", () => {
    let state = makeChemistryState();
    state = resolveCombatRound(state, defendActions(state), fixedRng);
    const resource = state.enemies.front.find((enemy) => enemy.instanceId === "slime-0")!;
    const killer = state.party[0];
    const actions = state.party.map((character) =>
      character.id === killer.id
        ? { kind: "attack" as const, actorId: character.id, targetInstanceId: resource.instanceId }
        : { kind: "defend" as const, actorId: character.id }
    );
    state = resolveCombatRound(state, actions, fixedRng);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "break",
      reason: "resourceDead",
      resourceId: "slime-0",
    }));
    expect(state.events.some((event) => event?.type === "chemistry" && event.phase === "consume")).toBe(false);
    expect(state.chemistryUses?.["caster-0:crypt-slime-cannon"]).toBe(1);
  });

  it("breaks when the committed actor or target becomes invalid", () => {
    let actorDead = makeChemistryState();
    actorDead = resolveCombatRound(actorDead, defendActions(actorDead), fixedRng);
    const actor = actorDead.enemies.front.find((enemy) => enemy.instanceId === "caster-0")!;
    actor.currentHp = 0;
    const actorAction = {
      kind: "ability" as const,
      actor,
      abilityId: "crypt-slime-cannon",
      targetId: "p0",
      resourceId: "slime-0",
      chemistryId: "chem-slime-cannon",
    };
    resolveEnemyAction(actorDead, actorAction, fixedRng, (message) => actorDead.log.push(message), (message, event) => {
      actorDead.log.push(message);
      actorDead.events.push(event);
    });
    expect(actorDead.events).toContainEqual(expect.objectContaining({ type: "chemistry", reason: "actorDead" }));
    expect(actorDead.chemistryUses?.["caster-0:crypt-slime-cannon"]).toBe(1);

    let targetDead = makeChemistryState();
    targetDead = resolveCombatRound(targetDead, defendActions(targetDead), fixedRng);
    const committedTarget = targetDead.party[0];
    committedTarget.hp = 0;
    resolveEnemyAction(
      targetDead,
      {
        kind: "ability",
        actor: targetDead.enemies.front[0],
        abilityId: "crypt-slime-cannon",
        targetId: committedTarget.id,
        resourceId: "slime-0",
        chemistryId: "chem-slime-cannon",
      },
      fixedRng,
      (message) => targetDead.log.push(message),
      (message, event) => {
        targetDead.log.push(message);
        targetDead.events.push(event);
      }
    );
    expect(targetDead.events).toContainEqual(expect.objectContaining({ type: "chemistry", reason: "targetDead" }));
    expect(targetDead.enemies.front.some((enemy) => enemy.instanceId === "slime-0")).toBe(true);
  });

  it("breaks a committed wind-up when the caster dies before its queued turn", () => {
    let state = makeChemistryState();
    state = resolveCombatRound(state, defendActions(state), fixedRng);
    const caster = state.enemies.front.find((enemy) => enemy.instanceId === "caster-0")!;
    expect(state.windUps[caster.instanceId]).toBeDefined();

    // Put every party member ahead of the enemy queue and leave the caster at
    // one HP. The first player hit removes it; the round then reaches the
    // stale enemy entry with no living actor to resolve. The shared death
    // sweep must close the wind-up before that stale entry is visited.
    state.party.forEach((character) => {
      character.stats.agi = 99;
    });
    caster.currentHp = 1;
    const actions = state.party.map((character) => ({
      kind: "attack" as const,
      actorId: character.id,
      targetInstanceId: caster.instanceId,
    }));
    state = resolveCombatRound(state, actions, fixedRng);

    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "break",
      reason: "actorDead",
      actorId: "caster-0",
      resourceId: "slime-0",
    }));
    expect(state.events.some((event) => event?.type === "chemistry" && event.phase === "resolve")).toBe(false);
    expect(state.enemies.front.some((enemy) => enemy.instanceId === "slime-0")).toBe(true);
    expect(state.chemistryReservations?.["slime-0"]).toBeUndefined();
    expect(state.windUps["caster-0"]).toBeUndefined();
    expect(state.chemistryUses?.["caster-0:crypt-slime-cannon"]).toBe(1);
    expect(state.chemistryTelemetry?.broken["chem-slime-cannon"]).toBe(1);
  });

  it("closes a pending commitment when a party wipe ends the queued enemy beat", () => {
    const state = makeChemistryState();
    const caster = state.enemies.front.find((enemy) => enemy.instanceId === "caster-0")!;
    const ability = enemyAbilityById("crypt-slime-cannon")!;
    reserveChemistryUse(state, caster, ability, null, "slime-0");
    state.party.forEach((character) => {
      character.hp = 0;
    });

    deathCheck(state, (message, event) => {
      state.log.push(message);
      state.events.push(event);
    });

    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "break",
      reason: "targetInvalid",
      actorId: "caster-0",
      resourceId: "slime-0",
    }));
    expect(state.chemistryReservations?.["caster-0"]).toBeUndefined();
    expect(state.chemistryTelemetry?.broken["chem-slime-cannon"]).toBe(1);
  });

  it("interrupts a wind-up on actor paralysis or sleep, but not on resource paralysis", () => {
    for (const status of ["paralysis", "sleep"] as const) {
      let state = makeChemistryState();
      state = resolveCombatRound(state, defendActions(state), fixedRng);
      state.enemies.front[0].status.push(status);
      state = resolveCombatRound(state, defendActions(state), fixedRng);
      expect(state.events).toContainEqual(expect.objectContaining({ type: "chemistry", reason: "actorDisabled" }));
      expect(state.enemies.front.some((enemy) => enemy.instanceId === "slime-0")).toBe(true);
    }

    let resourceDisabled = makeChemistryState();
    resourceDisabled = resolveCombatRound(resourceDisabled, defendActions(resourceDisabled), fixedRng);
    resourceDisabled.enemies.front[1].status.push("paralysis");
    resourceDisabled = resolveCombatRound(resourceDisabled, defendActions(resourceDisabled), fixedRng);
    expect(resourceDisabled.events.some((event) => event?.type === "chemistry" && event.phase === "consume")).toBe(true);
  });

  it("uses the same committed-resource semantics in the per-turn API", () => {
    let state = makeChemistryState();
    let round = beginRound(state, fixedRng);
    state = round.state;
    for (const entry of round.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, fixedRng);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, fixedRng);
      }
    }
    state = endRound(state, fixedRng);
    const committed = Object.values(state.windUps)[0];
    expect((committed as { resourceId?: string } | undefined)?.resourceId).toBe("slime-0");

    round = beginRound(state, fixedRng);
    state = round.state;
    for (const entry of round.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, fixedRng);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, fixedRng);
      }
    }
    expect(state.events.some((event) => event?.type === "chemistry" && event.phase === "consume")).toBe(true);
  });

  it("Ogre Toss accepts only the exact authored Skeleton ammunition", () => {
    let state = makeOgreTossState();
    state = resolveCombatRound(state, defendActions(state), fixedRng);
    expect(state.chemistryTelemetry?.resolved["chem-ogre-toss"]).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "consume",
      resourceId: "skeleton-0",
      chemistryId: "chem-ogre-toss",
    }));

    let invalid = makeOgreTossState("slime-0", "slime");
    invalid = resolveCombatRound(invalid, defendActions(invalid), fixedRng);
    expect(invalid.windUps["ogre-0"]).toBeUndefined();
    expect(invalid.chemistryTelemetry?.eligible["chem-ogre-toss"] ?? 0).toBe(0);
  });

  it("awards original encounter bodies but not summoned bodies", () => {
    const original = makeEnemy("slime", "original", 1);
    original.currentHp = 0;
    original.rewardEligible = true;
    const summoned = makeEnemy("slime", "summoned", 1);
    summoned.currentHp = 0;
    summoned.spawnSource = "summoned";
    summoned.rewardEligible = false;
    const state = createCombatState(createDefaultParty(), { front: [original, summoned], back: [] }, false);
    deathCheck(state, (message, event) => {
      state.log.push(message);
      state.events.push(event);
    });
    expect(state.goldEarned).toBe(original.gold);
    expect(state.xpEarned).toBe(original.xp);
    expect(state.justDied).toHaveLength(2);
  });

  it("enforces the fight-wide summon budget and delays summoned enemy turns", () => {
    const actor = makeEnemy("demon-mage", "mage-0", 40, "back", {
      abilityIds: ["summon-imp"],
    });
    const state = createCombatState(createDefaultParty(), { front: [], back: [actor] }, false);
    state.enemySummonsCreated = 3;
    const round = beginRound(state, fixedRng);
    const beforeIds = new Set(round.queue.filter((entry) => entry.kind === "enemy").map((entry) => entry.id));
    resolveEnemyAction(
      round.state,
      { kind: "ability", actor, abilityId: "summon-imp", targetId: "" },
      fixedRng,
      (message) => round.state.log.push(message),
      (message, event) => {
        round.state.log.push(message);
        round.state.events.push(event);
      }
    );
    expect(round.state.enemySummonsCreated).toBe(4);
    const summoned = [...round.state.enemies.front, ...round.state.enemies.back].find(
      (enemy) => enemy.spawnSource === "summoned"
    );
    expect(summoned).toBeDefined();
    expect(beforeIds.has(summoned!.instanceId)).toBe(false);
    const nextRound = beginRound(round.state, fixedRng);
    expect(nextRound.queue.some((entry) => entry.id === summoned!.instanceId)).toBe(true);

    const roundActor = makeEnemy("demon-mage", "round-mage", 40, "back", {
      abilityIds: ["summon-imp"],
    });
    const roundState = createCombatState(createDefaultParty(), { front: [], back: [roundActor] }, false);
    roundState.enemySummonsCreated = 3;
    const roundResult = resolveCombatRound(roundState, defendActions(roundState), () => 0);
    expect(roundResult.enemySummonsCreated).toBe(4);
  });
});
