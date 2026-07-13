/**
 * Unit tests for dungeon NPC logic — greeting/topic dialogue, barter, gifts
 * with the disposition reward threshold, stealing, and kill persistence.
 * Uses a tiny synthetic floor with one NPC so behavior is isolated from
 * campaign data.
 */
import { describe, it, expect } from "vitest";
import {
  npcAt,
  dispositionOf,
  adjustDisposition,
  moodOf,
  greet,
  visibleTopics,
  askTopic,
  availableTrades,
  doTrade,
  giveItem,
  stealFrom,
  canSteal,
  markKilled,
  applyKilledNPCs,
} from "./npc";
import { handleTileFeature } from "./features";
import { buildSolidGrid, carveRoom, setTile } from "./dungeon";
import { createDefaultParty } from "./party";
import { defaultLoadoutForCharacter } from "./combat";
import { cloneFloor, type FloorDef, type NPCDef } from "../data/floors";
import type { GameState } from "../types";

/** Deterministic RNG from a fixed sequence (cycles). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeNPC(overrides: Partial<NPCDef> = {}): NPCDef {
  return {
    id: "hermit",
    name: "Odo",
    title: "crypt hermit",
    x: 2,
    y: 2,
    greeting: "A visitor! It has been years.",
    returnGreeting: "Back again?",
    topics: [
      { key: "key", response: "The key lies with the dead." },
      { key: "echo", hidden: true, response: "You heard it too?" },
    ],
    trades: [{ giveItemId: "antidote", receiveItemId: "robe+2", once: true }],
    wantsItemId: "healing-potion",
    rewardItemId: "long-sword+1",
    combatEnemyIds: ["ronin"],
    ...overrides,
  };
}

function makeFloor(npc: NPCDef): FloorDef {
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setTile(grid, npc.x, npc.y, "npc");
  return {
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
}

function makeState(npc: NPCDef = makeNPC()): GameState {
  const party = createDefaultParty();
  return {
    mode: "dungeon",
    floor: makeFloor(npc),
    player: { x: npc.x, y: npc.y, facing: 0 },
    party,
    equipment: Object.fromEntries(party.map((c) => [c.id, defaultLoadoutForCharacter(c)])),
    explored: new Set<string>(),
    exploredByFloor: {},
    stepsSinceEncounter: 0,
    dayCount: 1,
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
    inDarkness: false,
    inAntimagic: false,
    lastDungeon: null,
  };
}

describe("npcAt", () => {
  it("finds a living NPC on its tile", () => {
    const state = makeState();
    expect(npcAt(state, 2, 2)?.id).toBe("hermit");
    expect(npcAt(state, 1, 1)).toBeNull();
  });

  it("returns null once the NPC is killed", () => {
    const state = makeState();
    state.killedNPCs.push("hermit");
    expect(npcAt(state, 2, 2)).toBeNull();
  });
});

describe("disposition and mood", () => {
  it("defaults to 50 (wary) and clamps to [0, 100]", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    expect(dispositionOf(state, npc)).toBe(50);
    expect(moodOf(state, npc)).toBe("wary");
    adjustDisposition(state, npc, 999);
    expect(dispositionOf(state, npc)).toBe(100);
    expect(moodOf(state, npc)).toBe("devoted");
    adjustDisposition(state, npc, -999);
    expect(dispositionOf(state, npc)).toBe(0);
    expect(moodOf(state, npc)).toBe("seething");
  });
});

describe("greet", () => {
  it("uses the first greeting once, then the return greeting", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    expect(greet(state, npc)).toBe(npc.greeting);
    expect(state.talkedToNPCs).toContain("hermit");
    expect(greet(state, npc)).toBe(npc.returnGreeting);
  });
});

describe("topics", () => {
  it("hides hidden topics from the menu but answers them when typed", () => {
    const npc = makeNPC();
    expect(visibleTopics(npc)).toEqual(["key"]);
    expect(askTopic(npc, "key")).toBe("The key lies with the dead.");
    expect(askTopic(npc, "  ECHO ")).toBe("You heard it too?");
    expect(askTopic(npc, "dragon")).toContain("nothing to say");
  });
});

describe("doTrade", () => {
  it("swaps the give-item for an identified receive-item, once", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    state.inventory.push({ itemId: "antidote", identified: true });
    const trades = availableTrades(state, npc);
    expect(trades).toHaveLength(1);
    const result = doTrade(state, npc, trades[0]);
    expect(result.message).toContain("hands over");
    expect(state.inventory.map((e) => e.itemId)).toEqual(["robe+2"]);
    expect(state.inventory[0].identified).toBe(true);
    expect(dispositionOf(state, npc)).toBe(55);
    // The one-time trade is consumed.
    expect(availableTrades(state, npc)).toHaveLength(0);
  });

  it("refuses when the give-item is not carried", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    const result = doTrade(state, npc, npc.trades![0]);
    expect(result.message).toContain("don't carry");
    expect(state.inventory).toHaveLength(0);
  });
});

describe("giveItem", () => {
  it("rejects items the NPC does not want", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    state.inventory.push({ itemId: "antidote", identified: true });
    const result = giveItem(state, npc, 0);
    expect(result.message).toContain("no use for");
    expect(state.inventory).toHaveLength(1);
  });

  it("accepts the wanted item and rewards at the disposition threshold", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    state.inventory.push({ itemId: "healing-potion", identified: true });
    const result = giveItem(state, npc, 0);
    // 50 + 30 = 80 crosses the threshold: reward granted.
    expect(dispositionOf(state, npc)).toBe(80);
    expect(result.message).toContain("Long Sword +1");
    expect(state.inventory.map((e) => e.itemId)).toEqual(["long-sword+1"]);
  });

  it("does not grant the reward twice", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    state.npcDisposition["hermit"] = 80;
    state.inventory.push({ itemId: "healing-potion", identified: true });
    const result = giveItem(state, npc, 0);
    expect(result.message).not.toContain("Long Sword");
    expect(state.inventory).toHaveLength(0);
  });
});

describe("stealFrom", () => {
  it("requires a living Thief", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    for (const c of state.party) {
      if (c.class === "Thief") c.hp = 0;
    }
    const result = stealFrom(state, npc, seqRng([0]));
    expect(result.message).toContain("Thief");
    expect(result.startFight).toBeUndefined();
  });

  it("skims gold on success without angering the NPC", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    const result = stealFrom(state, npc, seqRng([0, 0.5]));
    expect(result.startFight).toBeUndefined();
    expect(result.message).toContain("gold");
    expect(state.partyGold).toBeGreaterThanOrEqual(10);
    expect(dispositionOf(state, npc)).toBe(50);
  });

  it("starts a fight and tanks disposition when caught", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    const result = stealFrom(state, npc, seqRng([0.99]));
    expect(result.startFight).toBe(true);
    expect(dispositionOf(state, npc)).toBe(10);
    expect(state.partyGold).toBe(0);
  });

  it("uses effective AGI so gear/perks affect the chance", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    const thief = state.party.find((c) => c.class === "Thief")!;
    // Pin AGI so the test is deterministic regardless of random default party rolls.
    thief.stats.agi = 10;
    // A roll that fails for a bare Thief but succeeds with a big AGI boost.
    const roll = 0.3;
    // Bare Thief has a low chance; with a heavy AGI boost it should succeed.
    const noGearResult = stealFrom(state, npc, seqRng([roll, 0]));
    expect(noGearResult.startFight).toBe(true);

    // Restore state and give the Thief a weapon that spikes AGI.
    thief.hp = thief.maxHp;
    state.npcDisposition = {};
    state.partyGold = 0;
    state.equipment[thief.id] = {
      weapon: { id: "dagger-of-agi", name: "Dagger of Agi", statBonuses: { agi: 20 } } as any,
      armor: [],
    };
    const gearedResult = stealFrom(state, npc, seqRng([roll, 0]));
    expect(gearedResult.startFight).toBeUndefined();
    expect(gearedResult.message).toContain("gold");
  });
});

describe("canSteal", () => {
  it("is true when a living Thief is present", () => {
    const state = makeState();
    expect(canSteal(state)).toBe(true);
  });

  it("is false when the Thief is dead or knocked out", () => {
    const state = makeState();
    const thief = state.party.find((c) => c.class === "Thief")!;
    thief.hp = 0;
    expect(canSteal(state)).toBe(false);

    thief.hp = thief.maxHp;
    thief.status.push("knockedOut");
    expect(canSteal(state)).toBe(false);
  });

  it("is false with no Thief in the party", () => {
    const state = makeState();
    for (const c of state.party) {
      if (c.class === "Thief") c.class = "Fighter";
    }
    expect(canSteal(state)).toBe(false);
  });
});

describe("kill persistence", () => {
  it("markKilled records the death and clears the tile", () => {
    const state = makeState();
    const npc = state.floor.npcs![0];
    markKilled(state, npc);
    markKilled(state, npc);
    expect(state.killedNPCs).toEqual(["hermit"]);
    expect(state.floor.grid[2][2].tile).toBeUndefined();
  });

  it("applyKilledNPCs clears killed NPC tiles on a fresh floor clone", () => {
    const def = makeFloor(makeNPC());
    const copy = cloneFloor(def);
    applyKilledNPCs(copy, ["hermit"]);
    expect(copy.grid[2][2].tile).toBeUndefined();
    // The immutable definition is untouched.
    expect(def.grid[2][2].tile).toBe("npc");
  });
});

describe("handleTileFeature on an npc tile", () => {
  it("reports the NPC id without consuming the tile", () => {
    const state = makeState();
    const result = handleTileFeature(state);
    expect(result?.npcId).toBe("hermit");
    expect(result?.consumed).toBe(false);
    expect(state.floor.grid[2][2].tile).toBe("npc");
  });

  it("clears a stale tile when the NPC is dead", () => {
    const state = makeState();
    state.killedNPCs.push("hermit");
    const result = handleTileFeature(state);
    expect(result).toBeNull();
    expect(state.floor.grid[2][2].tile).toBeUndefined();
  });
});
