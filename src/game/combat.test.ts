import { describe, it, expect } from "vitest";
import {
  createCombatState,
  resolveCombatRound,
  inventoryToCounts,
  inventoryFromCounts,
  type CombatState,
  type EnemyInstance,
  type EnemyFormation,
  type PlayerAction,
} from "./combat";
import { createDefaultParty, type Character } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
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
