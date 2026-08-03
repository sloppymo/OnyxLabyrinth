import { describe, expect, it } from "vitest";
import { findFloor } from "./floor-registry";
import { rollEncounter, resolveEncounter } from "../data/enemies";
import { createCombatFromEncounter, resolveCombatRound } from "./combat";
import { createDefaultParty } from "./party";
import { createGameState } from "./state";
import { handleTileFeature } from "./features";
import { createSeededRng } from "./rng";

interface ReplaySnapshot {
  stats: ReturnType<typeof createDefaultParty>[number]["stats"][];
  encounters: string[][];
  combat: {
    enemies: number[];
    partyHp: number[];
    gold: number;
    xp: number;
    log: string[];
  };
  loot: { inventory: string[]; keys: string[] };
}

function replay(seed: number): ReplaySnapshot {
  const rng = createSeededRng(seed);
  const party = createDefaultParty(rng);
  const encounters: string[][] = [];
  let resolved: ReturnType<typeof resolveEncounter> = [];
  for (let i = 0; i < 8; i++) {
    const entry = rollEncounter(1, rng);
    const encounter = entry ? resolveEncounter(entry) : [];
    encounters.push(encounter.map(({ enemy }) => enemy.id));
    if (i === 0) resolved = encounter;
  }

  const combat = createCombatFromEncounter(
    party,
    resolved,
    {},
    {},
    Object.fromEntries(party.map((c) => [c.id, { weapon: null, armor: [] }])),
    [],
    false
  );
  // Make the first target a one-hit test fixture while retaining the normal
  // hit, crit, initiative, and reward code paths.
  const target = combat.enemies.front[0] ?? combat.enemies.back[0];
  if (!target) throw new Error("floor 1 encounter table unexpectedly empty");
  target.currentHp = 1;

  let result = combat;
  const attacker = result.party[0]!;
  for (let round = 0; round < 4 && !result.ended; round++) {
    const liveTarget = result.enemies.front.find((e) => e.currentHp > 0)
      ?? result.enemies.back.find((e) => e.currentHp > 0)
      ?? target;
    result = resolveCombatRound(
      result,
      [{ kind: "attack", actorId: attacker.id, targetInstanceId: liveTarget.instanceId }],
      rng
    );
  }

  const lootRng = rng;
  const state = createGameState(findFloor(3)!, lootRng);
  const treasure = state.floor.treasures?.find((entry) => !entry.trap && entry.itemIds.length > 0);
  if (!treasure) throw new Error("floor 1 has no untrapped treasure fixture");
  state.player.x = treasure.x;
  state.player.y = treasure.y;
  handleTileFeature(state, lootRng);

  return {
    stats: party.map((c) => c.stats),
    encounters,
    combat: {
      enemies: [...result.enemies.front, ...result.enemies.back].map((e) => e.currentHp),
      partyHp: result.party.map((c) => c.hp),
      gold: result.goldEarned,
      xp: result.xpEarned,
      log: result.log,
    },
    loot: {
      inventory: state.inventory.map((entry) => `${entry.itemId}:${entry.identified}`),
      keys: [...state.keys],
    },
  };
}

describe("seeded gameplay replay", () => {
  it("same seed and same actions reproduce encounters, combat, rewards, loot, and state", () => {
    expect(replay(0x51ced)).toEqual(replay(0x51ced));
  });

  it("different seeds can produce different gameplay outcomes", () => {
    const a = replay(111);
    const b = replay(222);
    expect(a).not.toEqual(b);
    expect(a.encounters).not.toEqual(b.encounters);
  });

  it("stat rolls and encounter selection consume the same explicit stream", () => {
    const a = createSeededRng(12345);
    const b = createSeededRng(12345);
    expect(createDefaultParty(a).map((c) => c.stats)).toEqual(createDefaultParty(b).map((c) => c.stats));
    expect(rollEncounter(1, a)).toEqual(rollEncounter(1, b));
  });

  it("cosmetic Math.random calls do not advance gameplay RNG", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    expect(a()).toBe(b());
    Math.random();
    Math.random();
    expect(a()).toBe(b());
  });

  it("test order cannot leak state between independent streams", () => {
    const first = createSeededRng(7);
    const expected = createSeededRng(7);
    first();
    createSeededRng(8)();
    expected();
    expect(first()).toBe(expected());
  });
});
