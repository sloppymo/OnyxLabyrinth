import { describe, it, expect } from "vitest";
import { applyJumpPartyOptions, type JumpToOptions } from "./jump-to";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";

describe("applyJumpPartyOptions", () => {
  it("levels the party via levelUpChar loops (not XP banking)", () => {
    const state = createGameState(FLOORS[0]!);
    expect(state.party[0]!.level).toBe(1);
    applyJumpPartyOptions(state, { partyLevel: 3 });
    for (const c of state.party) {
      expect(c.level).toBe(3);
    }
  });

  it("sets gold, keys, and inventory when provided", () => {
    const state = createGameState(FLOORS[0]!);
    const opts: JumpToOptions = {
      gold: 500,
      keys: ["crypt-key"],
      items: [{ itemId: "healing-potion", identified: true }],
    };
    applyJumpPartyOptions(state, opts);
    expect(state.partyGold).toBe(500);
    expect(state.keys).toEqual(["crypt-key"]);
    expect(state.inventory).toEqual([{ itemId: "healing-potion", identified: true }]);
  });

  it("leaves unspecified fields alone", () => {
    const state = createGameState(FLOORS[0]!);
    const goldBefore = state.partyGold;
    const keysBefore = [...state.keys];
    applyJumpPartyOptions(state, {});
    expect(state.partyGold).toBe(goldBefore);
    expect(state.keys).toEqual(keysBefore);
  });
});
