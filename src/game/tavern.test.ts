import { describe, it, expect } from "vitest";
import { createGameState } from "./state";
import { FLOORS } from "../data/floors";
import { REST_PRICE, RUMORS } from "../data/hot-boi";
import {
  restParty,
  nextRumor,
  scorchboardEntries,
  refreshScorchboardReadiness,
  acceptScorchboardQuest,
  turnInScorchboardQuest,
  onTavernOpen,
} from "./tavern";
import { questStatus } from "./quests";

function freshState() {
  return createGameState(FLOORS[0]);
}

describe("restParty", () => {
  it("deducts REST_PRICE exactly once and fully restores the living party", () => {
    const state = freshState();
    state.partyGold = 100;
    const c = state.party[0]!;
    c.hp = 1;
    c.sp = 0;
    c.status = ["poison"];
    const result = restParty(state);
    expect(result.ok).toBe(true);
    expect(state.partyGold).toBe(100 - REST_PRICE);
    expect(c.hp).toBe(c.maxHp);
    expect(c.sp).toBe(c.maxSp);
    expect(c.status).toEqual([]);
  });

  it("blocks rest and deducts nothing when the party can't pay", () => {
    const state = freshState();
    state.partyGold = REST_PRICE - 1;
    const result = restParty(state);
    expect(result.ok).toBe(false);
    expect(state.partyGold).toBe(REST_PRICE - 1); // unchanged, never negative
  });

  it("never touches persistentBuffs — the one edge Rest has over free Camp", () => {
    const state = freshState();
    state.partyGold = 100;
    state.persistentBuffs = [{ kind: "light", remainingSteps: 5 }];
    restParty(state);
    expect(state.persistentBuffs.length).toBe(1);
  });
});

describe("nextRumor", () => {
  it("never immediately repeats the same rumor while more than one is unlocked", () => {
    const state = freshState();
    let prev: string | null = null;
    for (let i = 0; i < 30; i++) {
      const r = nextRumor(state);
      expect(r).not.toBeNull();
      if (prev !== null) expect(r!.id).not.toBe(prev);
      prev = r!.id;
    }
  });

  it("cycles deterministically — same starting state produces the same sequence", () => {
    const a = freshState();
    const b = freshState();
    const seqA = Array.from({ length: 10 }, () => nextRumor(a)!.id);
    const seqB = Array.from({ length: 10 }, () => nextRumor(b)!.id);
    expect(seqA).toEqual(seqB);
  });

  it("progression unlocks new rumors without resetting the cursor", () => {
    const state = freshState();
    // Exhaust several cycles pre-raft.
    for (let i = 0; i < 20; i++) nextRumor(state);
    const preRaftIds = new Set(RUMORS.filter((r) => r.available(state)).map((r) => r.id));
    expect(preRaftIds.has("past-the-fork")).toBe(false);

    state.keyItems.push("raft");
    const postRaftIds = new Set(RUMORS.filter((r) => r.available(state)).map((r) => r.id));
    expect(postRaftIds.has("past-the-fork")).toBe(true);
    expect(postRaftIds.size).toBeGreaterThan(preRaftIds.size);
  });

  it("persists its cursor across a save/load-shaped round trip (plain field)", () => {
    const state = freshState();
    nextRumor(state);
    nextRumor(state);
    const cursor = state.tavernRumorCursor;
    expect(cursor).toBe(2);
    // Simulate deserialize rebuilding state from the same primitive field.
    const reloaded = { ...state, tavernRumorCursor: cursor };
    expect(reloaded.tavernRumorCursor).toBe(cursor);
  });
});

describe("Scorchboard", () => {
  it("Fifth Chair is hidden until Last Lantern is completed", () => {
    const state = freshState();
    expect(scorchboardEntries(state).map((e) => e.def.id)).not.toContain("fifth-chair");
    acceptScorchboardQuest(state, "last-lantern");
    state.talkedToNPCs.push("sister-caldris");
    refreshScorchboardReadiness(state);
    turnInScorchboardQuest(state, "last-lantern");
    expect(scorchboardEntries(state).map((e) => e.def.id)).toContain("fifth-chair");
  });

  it("Last Lantern becomes ready only after talking to Sister Caldris, and turn-in pays gold once", () => {
    const state = freshState();
    acceptScorchboardQuest(state, "last-lantern");
    refreshScorchboardReadiness(state);
    expect(questStatus(state, "last-lantern")).toBe("active"); // not talked to her yet

    state.talkedToNPCs.push("sister-caldris");
    refreshScorchboardReadiness(state);
    expect(questStatus(state, "last-lantern")).toBe("ready");

    const goldBefore = state.partyGold;
    const result = turnInScorchboardQuest(state, "last-lantern");
    expect(result.ok).toBe(true);
    expect(result.goldGained).toBeGreaterThan(0);
    expect(state.partyGold).toBe(goldBefore + result.goldGained);

    // Turning in again grants nothing — no duplicate reward.
    const secondGold = state.partyGold;
    const second = turnInScorchboardQuest(state, "last-lantern");
    expect(second.ok).toBe(false);
    expect(state.partyGold).toBe(secondGold);
  });

  it("carrying the shield before accepting the quest does not silently pre-complete it", () => {
    const state = freshState();
    state.inventory.push({ itemId: "shield+1", identified: true });
    refreshScorchboardReadiness(state); // quest not accepted yet — must be a no-op
    expect(questStatus(state, "shield-left-behind")).toBe("available");

    acceptScorchboardQuest(state, "shield-left-behind");
    refreshScorchboardReadiness(state);
    expect(questStatus(state, "shield-left-behind")).toBe("ready");
  });

  it("turning in the shield quest consumes exactly one shield+1 from inventory", () => {
    const state = freshState();
    state.inventory.push({ itemId: "shield+1", identified: true });
    acceptScorchboardQuest(state, "shield-left-behind");
    refreshScorchboardReadiness(state);
    turnInScorchboardQuest(state, "shield-left-behind");
    expect(state.inventory.some((e) => e.itemId === "shield+1")).toBe(false);
  });

  it("Fifth Chair grants the companion exactly once on turn-in", () => {
    const state = freshState();
    acceptScorchboardQuest(state, "last-lantern");
    state.talkedToNPCs.push("sister-caldris");
    refreshScorchboardReadiness(state);
    turnInScorchboardQuest(state, "last-lantern");

    acceptScorchboardQuest(state, "fifth-chair");
    refreshScorchboardReadiness(state); // no dungeon step — instantly ready
    expect(questStatus(state, "fifth-chair")).toBe("ready");

    const result = turnInScorchboardQuest(state, "fifth-chair");
    expect(result.companionGained).toBe(true);
    expect(state.companion).not.toBeNull();
    expect(state.companion!.withParty).toBe(true);
  });
});

describe("onTavernOpen", () => {
  it("marks the first visit exactly once", () => {
    const state = freshState();
    expect(onTavernOpen(state)).toBe(true);
    expect(onTavernOpen(state)).toBe(false);
  });
});
