/**
 * Focused tests proving the global gameplay RNG (getGameplayRng) is wired
 * into every gameplay system's DEFAULT parameter path — the path the live
 * game uses when it calls these functions without passing an explicit rng.
 *
 * The existing per-system tests (features.test.ts, npc.test.ts, etc.) pass
 * rng directly, which bypasses the default. These tests set the global RNG
 * via setGameplayRng and call the functions WITHOUT rng, proving the default
 * actually consults the global RNG rather than falling back to Math.random.
 *
 * Strategy for each system: seed the global RNG to a fixed value, call the
 * function via the default path, capture the result. Reset, re-seed with the
 * same value, call again. The two results must match. Then seed with a
 * different value and confirm the result changes (proving the global RNG
 * actually influences the outcome, not just that the function is deterministic
 * for some other reason).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createSeededRng, setGameplayRng, resetGameplayRng } from "./rng";
import { rollD6, roll3d6, rollBaseStats, createDefaultParty } from "./party";
import { rollEncounter } from "../data/enemies";
import { rollArenaEncounter } from "./encounters";
import { disarmChest, openChest } from "./features";
import { stealFrom } from "./npc";
import { buildSolidGrid, carveRoom, setTile } from "./dungeon";
import { defaultLoadoutForCharacter } from "./combat-equipment";
import type { FloorDef, NPCDef } from "../data/floors";
import type { GameState, TrapType } from "../types";

// Safety net: no seeded RNG should leak between tests or into other files.
afterEach(() => resetGameplayRng());

// --- Helpers ----------------------------------------------------------------

function makeTrapFloor(trap: TrapType): FloorDef {
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setTile(grid, 2, 2, "treasure");
  return {
    id: 1,
    name: "Test Vault",
    width: 6,
    height: 6,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    encounterTable: [],
    treasures: [{ x: 2, y: 2, itemIds: ["healing-potion"], trap }],
  };
}

function makeTrapState(trap: TrapType): GameState {
  const party = createDefaultParty();
  // Remove Thief's Trap Sense perk so disarm rolls use the base chance
  party[1].perkIds = party[1].perkIds.filter((id) => id !== "thief-trap-sense");
  return {
    mode: "dungeon",
    floor: makeTrapFloor(trap),
    player: { x: 2, y: 2, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 0,
    dayCount: 1,
    worldYear: 3847,
    partyGold: 0,
    inventory: [],
    keys: [],
    unlockedDoors: new Set<string>(),
    lootTaken: {},
    pendingTrap: null,
    persistentBuffs: [],
    swimSkill: {},
    talkedToNPCs: [],
    npcDisposition: {},
    killedNPCs: [],
    npcTradesDone: [],
    eventsTriggered: {},
    inDarkness: false,
    inAntimagic: false,
    lastDungeon: null,
  };
}

function makeNpcState(): GameState {
  const npc: NPCDef = {
    id: "hermit",
    name: "Odo",
    title: "crypt hermit",
    x: 2,
    y: 2,
    greeting: "A visitor!",
    returnGreeting: "Back again?",
    topics: [],
    trades: [],
    combatEnemyIds: ["ironclad-knight"],
  };
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setTile(grid, npc.x, npc.y, "npc");
  const floor: FloorDef = {
    id: 1,
    name: "Test Crypt",
    width: 6,
    height: 6,
    grid,
    startX: 1,
    startY: 1,
    encounterRate: 0,
    encounterTable: [],
    npcs: [npc],
  };
  const party = createDefaultParty();
  return {
    mode: "dungeon",
    floor,
    player: { x: npc.x, y: npc.y, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 0,
    dayCount: 1,
    worldYear: 3847,
    partyGold: 0,
    inventory: [],
    keys: [],
    unlockedDoors: new Set<string>(),
    lootTaken: {},
    pendingTrap: null,
    persistentBuffs: [],
    swimSkill: {},
    talkedToNPCs: [],
    npcDisposition: {},
    killedNPCs: [],
    npcTradesDone: [],
    eventsTriggered: {},
    inDarkness: false,
    inAntimagic: false,
    lastDungeon: null,
  };
}

// --- Tests ------------------------------------------------------------------

describe("seeded gameplay RNG: party stat rolls (default path)", () => {
  it("rollD6 uses the global gameplay RNG", () => {
    setGameplayRng(createSeededRng(100));
    const a = Array.from({ length: 20 }, () => rollD6());
    resetGameplayRng();
    setGameplayRng(createSeededRng(100));
    const b = Array.from({ length: 20 }, () => rollD6());
    expect(b).toEqual(a);
  });

  it("rollD6 outcome changes with a different seed", () => {
    setGameplayRng(createSeededRng(100));
    const a = Array.from({ length: 20 }, () => rollD6());
    resetGameplayRng();
    setGameplayRng(createSeededRng(999));
    const b = Array.from({ length: 20 }, () => rollD6());
    expect(b).not.toEqual(a);
  });

  it("roll3d6 uses the global gameplay RNG", () => {
    setGameplayRng(createSeededRng(200));
    const a = Array.from({ length: 10 }, () => roll3d6());
    resetGameplayRng();
    setGameplayRng(createSeededRng(200));
    const b = Array.from({ length: 10 }, () => roll3d6());
    expect(b).toEqual(a);
  });

  it("rollBaseStats uses the global gameplay RNG", () => {
    setGameplayRng(createSeededRng(300));
    const a = rollBaseStats();
    resetGameplayRng();
    setGameplayRng(createSeededRng(300));
    const b = rollBaseStats();
    expect(b).toEqual(a);
  });

  it("rollBaseStats changes with a different seed", () => {
    setGameplayRng(createSeededRng(300));
    const a = rollBaseStats();
    resetGameplayRng();
    setGameplayRng(createSeededRng(301));
    const b = rollBaseStats();
    expect(b).not.toEqual(a);
  });
});

describe("seeded gameplay RNG: encounter selection (default path)", () => {
  it("rollEncounter uses the global gameplay RNG", () => {
    // Floor 1 has a populated encounter table.
    setGameplayRng(createSeededRng(42));
    const a = rollEncounter(1);
    resetGameplayRng();
    setGameplayRng(createSeededRng(42));
    const b = rollEncounter(1);
    expect(b).toEqual(a);
  });

  it("rollEncounter changes with a different seed", () => {
    // Try several seed pairs; at least one must produce a different encounter.
    // (A single pair can collide by chance on a small weighted table.)
    setGameplayRng(createSeededRng(42));
    const a = rollEncounter(1);
    resetGameplayRng();
    const differingSeeds = [99, 200, 333, 500, 1000, 2026, 99999];
    const foundDiff = differingSeeds.some((sd) => {
      setGameplayRng(createSeededRng(sd));
      const b = rollEncounter(1);
      resetGameplayRng();
      return JSON.stringify(b) !== JSON.stringify(a);
    });
    expect(foundDiff).toBe(true);
  });
});

describe("seeded gameplay RNG: Arena encounter selection (default path)", () => {
  it("rollArenaEncounter uses the global gameplay RNG", () => {
    setGameplayRng(createSeededRng(77));
    const a = rollArenaEncounter(1, 1);
    resetGameplayRng();
    setGameplayRng(createSeededRng(77));
    const b = rollArenaEncounter(1, 1);
    expect(b).toEqual(a);
  });

  it("rollArenaEncounter changes with a different seed", () => {
    setGameplayRng(createSeededRng(77));
    const a = rollArenaEncounter(1, 1);
    resetGameplayRng();
    setGameplayRng(createSeededRng(88));
    const b = rollArenaEncounter(1, 1);
    expect(b).not.toEqual(a);
  });
});

describe("seeded gameplay RNG: chest disarm (default path)", () => {
  it("disarmChest uses the global gameplay RNG", () => {
    // Use a poison trap (has a disarm failure chance). Two runs with the same
    // seed must produce the same result (success/fail + damage if any).
    const runA = () => {
      const state = makeTrapState("poison");
      setGameplayRng(createSeededRng(500));
      return disarmChest(state);
    };
    const runB = () => {
      const state = makeTrapState("poison");
      setGameplayRng(createSeededRng(500));
      return disarmChest(state);
    };
    const a = runA();
    resetGameplayRng();
    const b = runB();
    resetGameplayRng();
    // Compare the result shape (message + whether it triggered).
    expect(b.message).toEqual(a.message);
  });
});

describe("seeded gameplay RNG: chest open (default path)", () => {
  it("openChest uses the global gameplay RNG", () => {
    const runA = () => {
      const state = makeTrapState("poison");
      setGameplayRng(createSeededRng(600));
      return openChest(state);
    };
    const runB = () => {
      const state = makeTrapState("poison");
      setGameplayRng(createSeededRng(600));
      return openChest(state);
    };
    const a = runA();
    resetGameplayRng();
    const b = runB();
    resetGameplayRng();
    expect(b.message).toEqual(a.message);
  });
});

describe("seeded gameplay RNG: NPC steal (default path)", () => {
  // Build the party ONCE with unseeded RNG, then clone the state per run so
  // only the stealFrom rolls consume the seeded RNG — not createDefaultParty's
  // stat rolls. Boost the thief's level so the steal chance is high enough
  // that some seeds succeed (producing a gold amount) and some fail (producing
  // a fight) — at level 1 with AGI 7 the chance is only 0.19, so nearly all
  // seeds fail and the fail path doesn't consume a second RNG call, making
  // outcomes identical across seeds.
  const baseState = makeNpcState();
  const thief = baseState.party.find((c) => c.class === "Thief")!;
  thief.level = 50;
  thief.stats = { str: 10, vit: 10, agi: 100, int: 10, pie: 10, luk: 10 };

  function cloneState(): GameState {
    return structuredClone(baseState);
  }

  it("stealFrom uses the global gameplay RNG", () => {
    setGameplayRng(createSeededRng(700));
    const a = stealFrom(cloneState(), baseState.floor.npcs![0]);
    resetGameplayRng();
    setGameplayRng(createSeededRng(700));
    const b = stealFrom(cloneState(), baseState.floor.npcs![0]);
    resetGameplayRng();
    expect(b.message).toEqual(a.message);
    expect(b.startFight).toEqual(a.startFight);
  });

  it("stealFrom changes with a different seed", () => {
    setGameplayRng(createSeededRng(700));
    const a = stealFrom(cloneState(), baseState.floor.npcs![0]);
    resetGameplayRng();
    // With a high-level thief (chance ~0.9), most seeds succeed and produce
    // a gold amount (10-40). Different seeds should produce different gold.
    const differingSeeds = [701, 800, 900, 1234, 5678, 99999];
    const foundDiff = differingSeeds.some((sd) => {
      setGameplayRng(createSeededRng(sd));
      const b = stealFrom(cloneState(), baseState.floor.npcs![0]);
      resetGameplayRng();
      return b.message !== a.message || b.startFight !== a.startFight;
    });
    expect(foundDiff).toBe(true);
  });
});
