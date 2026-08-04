import { describe, it, expect, afterEach } from "vitest";
import {
  createCombatState,
  resolveCombatRound,
} from "./combat";
import { createSeededRng, setGameplayRng, resetGameplayRng } from "./rng";
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
    partyHp: state.party.map((c) => c.hp),
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
    expect(a.partyHp.every((hp) => typeof hp === "number" && Number.isFinite(hp))).toBe(true);
    expect(b.partyHp.every((hp) => typeof hp === "number" && Number.isFinite(hp))).toBe(true);
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

// --- Live-path tests --------------------------------------------------------
// These prove the seeded RNG works through the DEFAULT parameter path
// (rng: Rng = getGameplayRng()), which is the path the live game uses when
// it calls resolveCombatRound without passing an explicit rng. The tests above
// pass rng directly; these set the global gameplay RNG via setGameplayRng and
// rely on the default, closing the gap between the test harness and reality.

/**
 * Run combat via the live path: seed the global gameplay RNG once, then call
 * resolveCombatRound WITHOUT passing rng (so it falls back to the
 * getGameplayRng() default). The RNG state carries across rounds exactly as
 * it would in the real game — one continuous stream per run.
 */
function runReplayLivePath(party: Character[], seed: number, maxRounds = 12): ReplaySnapshot {
  let state = makeState(party);
  // createCombatState() calls resetBarkRngForCombat() (Date.now()-seeded), so
  // re-inject the deterministic bark RNG AFTER state creation.
  setBarkRngForTests(createSeededRng(seed + 7919));
  // Seed the global gameplay RNG once for the whole run. Each resolveCombatRound
  // call picks up the same seeded function via getGameplayRng() and advances
  // its internal LCG state across rounds — mirroring the live game's one-stream
  // model rather than the per-round re-seed that runReplay uses.
  setGameplayRng(createSeededRng(seed));
  try {
    for (let i = 0; i < maxRounds && !state.ended; i++) {
      state = resolveCombatRound(state, actionsFor(state));
    }
  } finally {
    resetGameplayRng();
  }
  return snapshot(state);
}

describe("deterministic replay (live path via getGameplayRng default)", () => {
  // Safety net: runReplayLivePath uses try/finally, but afterEach guarantees
  // no seeded RNG leaks into other test files if something throws before the
  // finally block.
  afterEach(() => resetGameplayRng());

  const party = createDefaultParty();

  it("same seed produces identical combat outcomes through the default-rng path", () => {
    const a = runReplayLivePath(party, 12345);
    const b = runReplayLivePath(party, 12345);
    expect(b).toEqual(a);
  });

  it("live-path determinism holds across multiple seeds", () => {
    for (const seed of [1, 42, 1000, 999999, 7]) {
      const a = runReplayLivePath(party, seed);
      const b = runReplayLivePath(party, seed);
      expect(b).toEqual(a);
    }
  });

  it("different seeds produce different outcomes via the live path", () => {
    const a = runReplayLivePath(party, 12345);
    const b = runReplayLivePath(party, 67890);
    expect(a).not.toEqual(b);
  });

  it("live path terminates (victory or wipe) within the round cap", () => {
    const result = runReplayLivePath(party, 12345);
    expect(result.ended).toBe(true);
    expect(["victory", "wipe", "fled"]).toContain(result.result);
  });
});
