/**
 * Unit tests for the Floor 3 "Duelist's Vigil" content: Kazeharu's
 * recruitment gate, guest-ally injection for the Grand Forge climax, and
 * the post-fight outcome/dialogue split. See docs/superpowers/specs/
 * 2026-08-05-floor3-duelists-vigil-content-design.md for the design.
 */
import { describe, it, expect } from "vitest";
import {
  hasSmithsRing,
  kazeharuJoinEligible,
  onKazeharuTopicAsked,
  kazeharuReturnLine,
  kazeharuGuestAlly,
  resolveKazeharuAfterForge,
  KAZEHARU_GUEST_ID,
} from "./kazeharu";
import { adjustDisposition } from "./npc";
import { createDefaultParty } from "./party";
import { defaultLoadoutForCharacter } from "./combat-equipment";
import { buildSolidGrid, carveRoom, setTile } from "./dungeon";
import { cloneFloor, type FloorDef, type NPCDef } from "../data/floors";
import type { GameState } from "../types";

function makeKazeharu(): NPCDef {
  return {
    id: "kazeharu",
    name: "Kazeharu",
    title: "masterless duelist",
    x: 3,
    y: 9,
    greeting: "greeting",
    returnGreeting: "return greeting",
    topics: [
      { key: "master", hidden: true, response: "the master response" },
      { key: "join", hidden: true, response: "you don't know what you're asking yet" },
    ],
    combatEnemyIds: ["black-knight"],
  };
}

function makeFloor(npc: NPCDef): FloorDef {
  const size = 12;
  const grid = buildSolidGrid(size, size);
  carveRoom(grid, 0, 0, size - 1, size - 1);
  setTile(grid, npc.x, npc.y, "npc");
  return {
    id: 3,
    name: "The Forge of Ashes",
    width: size,
    height: size,
    grid,
    startX: 0,
    startY: 0,
    encounterRate: 0,
    npcs: [npc],
  };
}

function makeState(npc: NPCDef = makeKazeharu()): GameState {
  const party = createDefaultParty();
  return {
    mode: "dungeon",
    floor: cloneFloor(makeFloor(npc)),
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
    inDarkness: false,
    inAntimagic: false,
    eventsTriggered: {},
    deepestFloorReached: 1,
    hasCompletedEnding: false,
    lastDungeon: null,
  };
}

/** Recover the smith's signet ring — the fused-smith reward event at (14,9). */
function grantSmithsRing(state: GameState): void {
  state.eventsTriggered[3] = new Set(["14,9"]);
}

describe("hasSmithsRing", () => {
  it("is false until the fused-smith event has fired", () => {
    const state = makeState();
    expect(hasSmithsRing(state)).toBe(false);
    grantSmithsRing(state);
    expect(hasSmithsRing(state)).toBe(true);
  });
});

describe("onKazeharuTopicAsked", () => {
  it("does nothing for other NPCs (returns undefined)", () => {
    const state = makeState();
    const other: NPCDef = { ...makeKazeharu(), id: "vestra" };
    expect(onKazeharuTopicAsked(state, other, "master")).toBeUndefined();
    expect(onKazeharuTopicAsked(state, other, "join")).toBeUndefined();
  });

  it("asking 'master' sets kazeharuToldTruth and falls back to the static response", () => {
    const state = makeState();
    const npc = makeKazeharu();
    expect(state.kazeharuToldTruth).toBeFalsy();
    const result = onKazeharuTopicAsked(state, npc, "master");
    expect(result).toBeUndefined();
    expect(state.kazeharuToldTruth).toBe(true);
  });

  it("asking to join before learning the truth refuses and does not recruit", () => {
    const state = makeState();
    const npc = makeKazeharu();
    const msg = onKazeharuTopicAsked(state, npc, "join");
    expect(msg).toMatch(/don't know what you're asking/i);
    expect(state.kazeharuRecruited).toBeFalsy();
  });

  it("asking to join after the truth but without the ring still refuses", () => {
    const state = makeState();
    const npc = makeKazeharu();
    state.kazeharuToldTruth = true;
    const msg = onKazeharuTopicAsked(state, npc, "join");
    expect(msg).toMatch(/bring me something/i);
    expect(state.kazeharuRecruited).toBeFalsy();
  });

  it("asking to join with both legs complete recruits him exactly once", () => {
    const state = makeState();
    const npc = makeKazeharu();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    expect(kazeharuJoinEligible(state, npc)).toBe(true);

    const msg = onKazeharuTopicAsked(state, npc, "join");
    expect(msg).toMatch(/i'm coming/i);
    expect(state.kazeharuRecruited).toBe(true);

    // Asking again is idempotent, not a second recruitment event.
    const again = onKazeharuTopicAsked(state, npc, "join");
    expect(again).toMatch(/already coming/i);
    expect(state.kazeharuRecruited).toBe(true);
  });

  it("a hostile or dead Kazeharu can never be recruited, even with both legs complete", () => {
    const state = makeState();
    const npc = makeKazeharu();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    adjustDisposition(state, npc, -40); // 50 -> 10, matches the caught-stealing penalty
    expect(kazeharuJoinEligible(state, npc)).toBe(false);
    const msg = onKazeharuTopicAsked(state, npc, "join");
    expect(msg).toMatch(/no reason to stand beside you/i);
    expect(state.kazeharuRecruited).toBeFalsy();

    // Killing him is disqualifying even if disposition were reset.
    const state2 = makeState();
    const npc2 = makeKazeharu();
    state2.kazeharuToldTruth = true;
    grantSmithsRing(state2);
    state2.killedNPCs.push("kazeharu");
    expect(kazeharuJoinEligible(state2, npc2)).toBe(false);
  });
});

describe("kazeharuGuestAlly", () => {
  it("is null when he was never recruited", () => {
    const state = makeState();
    expect(kazeharuGuestAlly(state)).toBeNull();
  });

  it("is a combat-only SummonedAlly once recruited", () => {
    const state = makeState();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    onKazeharuTopicAsked(state, makeKazeharu(), "join");
    const guest = kazeharuGuestAlly(state);
    expect(guest).not.toBeNull();
    expect(guest!.id).toBe(KAZEHARU_GUEST_ID);
    expect(guest!.name).toBe("Kazeharu");
    expect(guest!.hp).toBeGreaterThan(0);
    expect(guest!.finishingStrikeBonus).toBeGreaterThan(0);
    expect(guest!.finishingStrikeUsed).toBeUndefined();
  });

  it("is null once his part in the climax already has an outcome", () => {
    const state = makeState();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    onKazeharuTopicAsked(state, makeKazeharu(), "join");
    resolveKazeharuAfterForge(state, true);
    expect(kazeharuGuestAlly(state)).toBeNull();
  });

  it("is null if he became hostile after being recruited", () => {
    const state = makeState();
    const npc = makeKazeharu();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    onKazeharuTopicAsked(state, npc, "join");
    expect(state.kazeharuRecruited).toBe(true);
    state.killedNPCs.push("kazeharu");
    expect(kazeharuGuestAlly(state)).toBeNull();
  });
});

describe("resolveKazeharuAfterForge", () => {
  it("is a no-op if he was never recruited", () => {
    const state = makeState();
    resolveKazeharuAfterForge(state, true);
    expect(state.kazeharuOutcome).toBeUndefined();
  });

  it("sets joinedSurvived on a win, exactly once, and awards the keepsake blade exactly once", () => {
    const state = makeState();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    onKazeharuTopicAsked(state, makeKazeharu(), "join");
    resolveKazeharuAfterForge(state, true);
    expect(state.kazeharuOutcome).toBe("joinedSurvived");
    expect(state.inventory.filter((e) => e.itemId === "kazeharus-blade").length).toBe(1);
    // A second call (e.g. a stray re-entry) must not overwrite the outcome
    // or award a second blade.
    resolveKazeharuAfterForge(state, false);
    expect(state.kazeharuOutcome).toBe("joinedSurvived");
    expect(state.inventory.filter((e) => e.itemId === "kazeharus-blade").length).toBe(1);
  });

  it("sets joinedFell when he died in the fight, never awards the blade, and marks him dead on the overworld", () => {
    const state = makeState();
    const npc = makeKazeharu();
    state.kazeharuToldTruth = true;
    grantSmithsRing(state);
    onKazeharuTopicAsked(state, npc, "join");
    resolveKazeharuAfterForge(state, false);
    expect(state.kazeharuOutcome).toBe("joinedFell");
    expect(state.inventory.some((e) => e.itemId === "kazeharus-blade")).toBe(false);
    // Falling in the Grand Forge must read as his death everywhere, not
    // just in the outcome flag — otherwise the party could walk back to a
    // "living" Kazeharu with nothing left to say.
    expect(state.killedNPCs).toContain("kazeharu");
    expect(state.floor.grid[npc.y][npc.x].tile).not.toBe("npc");
  });
});

describe("kazeharuReturnLine", () => {
  it("is undefined (falls back to npc.returnGreeting) with no outcome yet", () => {
    const state = makeState();
    expect(kazeharuReturnLine(state)).toBeUndefined();
  });

  it("is a distinct line once he joined and survived", () => {
    const state = makeState();
    state.kazeharuOutcome = "joinedSurvived";
    expect(kazeharuReturnLine(state)).toMatch(/vigil/i);
  });

  it("is undefined (no one left to greet the party) if he fell", () => {
    const state = makeState();
    state.kazeharuOutcome = "joinedFell";
    expect(kazeharuReturnLine(state)).toBeUndefined();
  });
});
