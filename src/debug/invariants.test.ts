import { describe, it, expect } from "vitest";
import { checkInvariants } from "./invariants";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import type { CombatDebugView } from "./snapshot";

function baseState() {
  return createGameState(FLOORS[0]!);
}

function combatView(over: Partial<CombatDebugView> = {}): CombatDebugView {
  return {
    phase: "select",
    actingCharId: null,
    roundEnding: false,
    playbackDone: true,
    selection: null,
    round: 1,
    enemies: [],
    recentLog: [],
    result: null,
    ...over,
  };
}

describe("checkInvariants", () => {
  it("reports nothing for a freshly created state", () => {
    expect(checkInvariants({ state: baseState(), route: "town" })).toEqual([]);
  });

  it("flags hp above maxHp and negative hp", () => {
    const state = baseState();
    state.party[0]!.hp = state.party[0]!.maxHp + 5;
    state.party[1]!.hp = -1;
    const warnings = checkInvariants({ state, route: "dungeon" });
    expect(warnings.some((w) => w.includes(state.party[0]!.name) && w.includes("hp"))).toBe(true);
    expect(warnings.some((w) => w.includes(state.party[1]!.name))).toBe(true);
  });

  it("flags sp above maxSp", () => {
    const state = baseState();
    state.party[0]!.sp = state.party[0]!.maxSp + 1;
    expect(checkInvariants({ state, route: "dungeon" }).some((w) => w.includes("sp"))).toBe(true);
  });

  it("flags a party that isn't exactly 2 members", () => {
    const state = baseState();
    state.party = state.party.slice(0, 1);
    expect(
      checkInvariants({ state, route: "dungeon" }).some((w) => /expected 2/i.test(w))
    ).toBe(true);
  });

  it("flags a pendingTrap while not in dungeon mode", () => {
    const state = baseState();
    state.mode = "town";
    state.pendingTrap = { x: 1, y: 1, trapType: "gas", inspected: false };
    expect(
      checkInvariants({ state, route: "town" }).some((w) => /pendingTrap/i.test(w))
    ).toBe(true);
  });

  it("does not flag a pendingTrap in dungeon mode", () => {
    const state = baseState();
    state.mode = "dungeon";
    state.pendingTrap = { x: 1, y: 1, trapType: "gas", inspected: false };
    expect(checkInvariants({ state, route: "trap" })).toEqual([]);
  });

  it("flags a combat view present while the route is not combat", () => {
    const state = baseState();
    expect(
      checkInvariants({ state, route: "dungeon", combat: combatView() }).some((w) =>
        /combat/i.test(w)
      )
    ).toBe(true);
  });

  it("flags enemy hp out of bounds in the combat view", () => {
    const state = baseState();
    state.mode = "combat";
    const combat = combatView({
      enemies: [{ id: "e1", name: "Skeleton", hp: 40, maxHp: 12, row: "front", status: [] }],
    });
    expect(
      checkInvariants({ state, route: "combat", combat }).some((w) => w.includes("Skeleton"))
    ).toBe(true);
  });

  it("accepts a valid combat view on the combat route", () => {
    const state = baseState();
    state.mode = "combat";
    const combat = combatView({
      enemies: [{ id: "e1", name: "Skeleton", hp: 5, maxHp: 12, row: "front", status: [] }],
    });
    expect(checkInvariants({ state, route: "combat", combat })).toEqual([]);
  });

  it("accepts a combat-shaped view on the Card Trial route", () => {
    const state = baseState();
    state.mode = "combat";
    const combat = combatView({ phase: "hand" });
    expect(checkInvariants({ state, route: "card_trial", combat })).toEqual([]);
  });
});
