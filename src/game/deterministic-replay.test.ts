import { describe, it, expect } from "vitest";
import {
  createCombatState,
  resolveCombatRound,
} from "./combat";
import { createSeededRng } from "./rng";
import type {
  CombatState,
  EnemyInstance,
  EnemyFormation,
  PlayerAction,
} from "./combat-types";
import { setBarkRngForTests } from "./combat-barks";
import { createDefaultParty, type Character } from "./party";
import { ALL_SPELLS } from "../data/spells";
import { ALL_ITEMS } from "../data/items";
import type { EnemyDef } from "../data/enemies";

// --- Test helpers -----------------------------------------------------------

/**
 * A snapshot of the observable, RNG-influenced portions of a CombatState.
 * We deliberately exclude lookup tables (spells/items) and identity-only
 * fields that are independent of RNG rolls, so the comparison focuses on
 * outcomes that should be deterministic under a fixed seed.
 */
interface ReplaySnapshot {
  round: number;
  ended: boolean;
  result?: "victory" | "wipe" | "fled";
  goldEarned: number;
  xpEarned: number;
  partyHp: number[];
  enemyHp: { id: string; hp: number }[];
  log: string[];
}

function snapshot(state: CombatState): ReplaySnapshot {
  return {
    round: state.round,
    ended: state.ended,
    result: state.result,
    goldEarned: state.goldEarned,
    xpEarned: state.xpEarned,
    partyHp: state.party.map((c) => c.currentHp),
    enemyHp: [...state.enemies.front, ...state.enemies.back]
      .filter((e) => e.currentHp > 0)
      .map((e) => ({ id: e.instanceId, hp: e.currentHp })),
    log: [...state.log],
  };
}

/** Build a tough enemy so combat lasts several rounds and exercises many RNG rolls. */
function makeToughEnemy(id: string, name: string): EnemyInstance {
  const def: Partial<EnemyDef> = {
    floors: [1],
    rowPreference: "front",
    isBoss: false,
  };
  return {
    id,
    name,
    floors: def.floors ?? [1],
    rowPreference: def.rowPreference ?? "front",
    hp: 60,
    attack: 14,
    ac: 3,
    agi: 12,
    xp: 20,
    gold: 10,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: 60,
    row: "front",
    status: [],
  };
}

/**
 * Build a combat state from a fixed party. The party is created ONCE per
 * test (outside runReplay) and reused across runs, because createDefaultParty
 * rolls stats with unseeded Math.random() — building it inside each run would
 * inject non-determinism from outside the seeded RNG and defeat the test.
 * createCombatState deep-clones the party, so reusing the same source array
 * is safe.
 */
function makeState(party: Character[]): CombatState {
  const spells: Record<string, (typeof ALL_SPELLS)[number]> = {};
  for (const s of ALL_SPELLS) spells[s.id] = s;
  const items: Record<string, (typeof ALL_ITEMS)[number]> = {};
  for (const it of ALL_ITEMS) items[it.id] = it;
  const formation: EnemyFormation = {
    front: [makeToughEnemy("e1", "Brute"), makeToughEnemy("e2", "Brute")],
    back: [],
  };
  return createCombatState(party, formation, false, spells, items);
}

/** Fixed action set: all party members attack the first living enemy (deterministic input). */
function actionsFor(state: CombatState): PlayerAction[] {
  const target = [...state.enemies.front, ...state.enemies.back].find(
    (e) => e.currentHp > 0
  );
  return state.party.map((c) => ({
    kind: "attack" as const,
    actorId: c.id,
    targetInstanceId: target ? target.instanceId : "e1",
  }));
}

/**
 * Run combat to completion (or a round cap) under a given numeric seed,
 * returning the snapshot of the final state. A fresh seeded RNG is created
 * per run so both runs start from the same internal LCG state.
 *
 * Barks (combat dialog lines) use a separate module-level RNG that is
 * intentionally kept off the combat RNG (presentation-only by design), but
 * they are written into state.log. We reset the bark RNG to a fresh seeded
 * instance per run so bark line selection is also deterministic across runs.
 */
function runReplay(party: Character[], seed: number, maxRounds = 12): ReplaySnapshot {
  let state = makeState(party);
  // createCombatState() calls resetBarkRngForCombat() (Date.now()-seeded), so
  // we must re-inject the deterministic bark RNG AFTER state creation, right
  // before the round loop. This keeps bark line selection reproducible.
  setBarkRngForTests(createSeededRng(seed + 7919));
  for (let i = 0; i < maxRounds && !state.ended; i++) {
    const rng = createSeededRng(seed);
    state = resolveCombatRound(state, actionsFor(state), rng);
  }
  return snapshot(state);
}

// --- Tests ------------------------------------------------------------------

describe("deterministic replay", () => {
  // One fixed party for the whole suite. createDefaultParty() rolls stats
  // with unseeded Math.random(), so we build it once and reuse the snapshot;
  // createCombatState deep-clones it into each run.
  const party = createDefaultParty();

  it("same seed produces identical combat outcomes", () => {
    const a = runReplay(party, 12345);
    const b = runReplay(party, 12345);
    expect(b).toEqual(a);
  });

  it("same seed produces identical outcomes across many seeds", () => {
    for (const seed of [1, 42, 1000, 999999, 7]) {
      const a = runReplay(party, seed);
      const b = runReplay(party, seed);
      expect(b).toEqual(a);
    }
  });

  it("different seeds produce different outcomes (at least one observable diff)", () => {
    const a = runReplay(party, 12345);
    const b = runReplay(party, 67890);
    // At least one RNG-influenced observable must differ. We don't require
    // every field to differ — just that the seed actually influences results,
    // proving the RNG is wired into combat resolution.
    expect(a).not.toEqual(b);
  });

  it("the seeded RNG is deterministic at the unit level", () => {
    const r1 = createSeededRng(2026);
    const r2 = createSeededRng(2026);
    const seq1 = Array.from({ length: 10 }, () => r1());
    const seq2 = Array.from({ length: 10 }, () => r2());
    expect(seq1).toEqual(seq2);

    const r3 = createSeededRng(2027);
    const seq3 = Array.from({ length: 10 }, () => r3());
    // Different seeds should produce different sequences (extremely likely).
    expect(seq3).not.toEqual(seq1);
  });

  it("combat actually terminates (victory or wipe) within the round cap", () => {
    const result = runReplay(party, 12345);
    expect(result.ended).toBe(true);
    expect(["victory", "wipe", "fled"]).toContain(result.result);
  });
});
