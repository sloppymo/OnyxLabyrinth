import { describe, expect, it } from "vitest";
import {
  beginRound,
  createCombatState,
  endRound,
  resolveCombatRound,
  resolveEnemyTurn,
  resolvePlayerTurn,
} from "./combat";
import { enemyAbilityById } from "../data/enemy-abilities";
import type { CombatState, EnemyInstance } from "./combat-types";
import { createCombatTestRoster } from "./test-roster";

function makeEnemy(
  id: string,
  instanceId: string,
  hp = 100,
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

function defendActions(state: CombatState) {
  return state.party.map((character) => ({
    kind: "defend" as const,
    actorId: character.id,
  }));
}

function makePackState(leaderAgi = 20, partnerAgi = 1): CombatState {
  const leader = makeEnemy("crypt-hellhound", "hellhound-0", 120, "front", {
    abilityIds: ["crypt-pack-hunt"],
    agi: leaderAgi,
  });
  const partner = makeEnemy("crypt-werewolf", "werewolf-0", 120, "back", {
    agi: partnerAgi,
  });
  const state = createCombatState(
    createCombatTestRoster(),
    { front: [leader], back: [partner] },
    false
  );
  state.chemistryEnabled = true;
  return state;
}

function makeRuneState(): CombatState {
  const construct = makeEnemy("crypt-lesser-construct", "construct-0", 100, "front", {
    chemistryGroups: ["conductive-construct"],
  });
  const knight = makeEnemy("crypt-rune-knight", "rune-knight-0", 100, "back", {
    abilityIds: ["crypt-rune-overload"],
    agi: 20,
  });
  const state = createCombatState(
    createCombatTestRoster(),
    { front: [construct], back: [knight] },
    false
  );
  state.chemistryEnabled = true;
  return state;
}

describe("packStrike and Rune Overload chemistry", () => {
  it("commits an exact Hunting Pack partner, suppresses its ordinary action, and resolves two hits", () => {
    let state = makePackState();
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.windUps["hellhound-0"]).toMatchObject({
      chemistryId: "chem-hunting-pack",
      partnerId: "werewolf-0",
      targetId: "c1",
    });

    const before = state.party.find((character) => character.id === "c1")!.hp;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.resolved["chem-hunting-pack"]).toBe(1);
    expect(state.chemistryReservations?.["hellhound-0"]).toBeUndefined();
    expect(state.party.find((character) => character.id === "c1")!.hp).toBeLessThan(before);
    expect(
      state.events.filter((event) => event?.type === "cast" && event.presentation === "packStrike")
    ).toHaveLength(2);
    expect(
      state.events.some((event) => event?.type === "attack" && event.actorId === "werewolf-0")
    ).toBe(false);
  });

  it("breaks Hunting Pack when the committed partner is disabled, without retargeting", () => {
    let state = makePackState();
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    state.enemies.back[0]!.status.push("paralysis");
    const before = state.party[0]!.hp;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.broken["chem-hunting-pack"]).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "break",
      reason: "partnerDead",
      partnerId: "werewolf-0",
    }));
    expect(state.party[0]!.hp).toBe(before);
    expect(state.events.some((event) => event?.type === "cast" && event.presentation === "packStrike")).toBe(false);
  });

  it("rejects a pack whose partner has already taken the per-turn initiative action", () => {
    let state = makePackState(1, 20);
    const round = beginRound(state, () => 0.1);
    state = round.state;
    for (const entry of round.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, () => 0.1);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, () => 0.1);
      }
    }
    expect(state.enemyActedThisRound).toContain("werewolf-0");
    expect(state.chemistryUses?.["hellhound-0:crypt-pack-hunt"] ?? 0).toBe(0);
    expect(state.events.some((event) => event?.type === "chemistry")).toBe(false);
  });

  it("commits and consumes one exact Rune Overload battery for a delayed all-party discharge", () => {
    let state = makeRuneState();
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.windUps["rune-knight-0"]).toMatchObject({
      chemistryId: "chem-rune-overload",
      resourceId: "construct-0",
      targetId: null,
    });
    expect(state.enemies.front.some((enemy) => enemy.instanceId === "construct-0")).toBe(true);

    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.resolved["chem-rune-overload"]).toBe(1);
    expect(state.justDied.some((enemy) => enemy.instanceId === "construct-0")).toBe(true);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "consume",
      resourceId: "construct-0",
      presentation: "overload",
    }));
    expect(
      state.events.filter((event) => event?.type === "cast" && event.presentation === "overload")
    ).toHaveLength(state.party.length);
  });

  it("breaks Rune Overload when its committed battery dies, with no replacement resource", () => {
    let state = makeRuneState();
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    state.enemies.front[0]!.currentHp = 0;
    state = resolveCombatRound(state, defendActions(state), () => 0.1);
    expect(state.chemistryTelemetry?.broken["chem-rune-overload"]).toBe(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "chemistry",
      phase: "break",
      reason: "resourceDead",
      resourceId: "construct-0",
    }));
    expect(state.events.some((event) => event?.type === "cast" && event.presentation === "overload")).toBe(false);
  });

  it("keeps the charged construct killable and does not invent a party target for Rune Overload", () => {
    const state = makeRuneState();
    const round = resolveCombatRound(state, defendActions(state), () => 0.1);
    const reservation = round.chemistryReservations?.["rune-knight-0"];
    expect(reservation?.targetId).toBeNull();
    expect(round.enemies.front[0]!.currentHp).toBeGreaterThan(0);
    expect(enemyAbilityById("crypt-rune-overload")?.effect).toMatchObject({
      kind: "consumeAlly",
      payoff: { target: "allParty" },
    });
  });

  it("cleans the per-turn delayed charge after the enemy turn", () => {
    let state = makeRuneState();
    const round = beginRound(state, () => 0.1);
    state = round.state;
    for (const entry of round.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, () => 0.1);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, () => 0.1);
      }
    }
    expect(state.windUps["rune-knight-0"]).toBeDefined();
    state = endRound(state, () => 0.1);
    const second = beginRound(state, () => 0.1);
    state = second.state;
    for (const entry of second.queue) {
      if (entry.kind === "player") {
        state = resolvePlayerTurn(state, { kind: "defend", actorId: entry.id }, () => 0.1);
      } else if (entry.kind === "enemy") {
        state = resolveEnemyTurn(state, entry.id, () => 0.1);
      }
    }
    expect(state.chemistryTelemetry?.resolved["chem-rune-overload"]).toBe(1);
    expect(state.enemies.front.some((enemy) => enemy.instanceId === "construct-0")).toBe(false);
  });
});
