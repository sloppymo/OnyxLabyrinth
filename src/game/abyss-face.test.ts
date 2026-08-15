import { describe, expect, it } from "vitest";
import { findFloor } from "./floor-registry";
import { createGameState } from "./state";
import { resolveAbyssFaceStep, resolveAbyssFaceTurn, selectAbyssFaceContext } from "./abyss-face";

function bridgeState() {
  const state = createGameState(findFloor(2)!);
  state.mode = "dungeon";
  return state;
}

describe("Floor 2 abyss face", () => {
  it("authors the first northbound crossing once, then uses repeat behavior", () => {
    const state = bridgeState();
    const hush = resolveAbyssFaceStep(state, { x: 2, y: 20 }, { x: 2, y: 19 }, () => 0.9);
    expect(hush).toBeNull();
    expect(resolveAbyssFaceStep(state, { x: 2, y: 19 }, { x: 2, y: 18 }, () => 0.9)).toBeNull();
    expect(resolveAbyssFaceStep(state, { x: 2, y: 18 }, { x: 2, y: 17 }, () => 0.9)).toBeNull();
    state.player = { x: 2, y: 17, facing: 1 };
    const first = resolveAbyssFaceTurn(state);
    expect(first?.text).toContain("Here they come");
    for (const y of [16, 15, 14, 13]) {
      resolveAbyssFaceStep(state, { x: 2, y: y + 1 }, { x: 2, y }, () => 0.9);
    }
    expect(state.environmentalEncounters?.["abyss-face"].crossings).toBe(1);
    const repeat = resolveAbyssFaceStep(state, { x: 2, y: 18 }, { x: 2, y: 17 }, () => 0.9);
    expect(repeat?.text).toBe("Jump.");
  });

  it("preserves deliberate silence and one-shot fart behavior", () => {
    const state = bridgeState();
    const fart = resolveAbyssFaceStep(state, { x: 2, y: 15 }, { x: 2, y: 14 });
    expect(fart?.sfx).toBe("abyss-fart");
    expect(resolveAbyssFaceStep(state, { x: 2, y: 15 }, { x: 2, y: 14 })).toBeNull();
    state.environmentalEncounters!["abyss-face"].crossings = 1;
    expect(resolveAbyssFaceStep(state, { x: 2, y: 18 }, { x: 2, y: 17 }, () => 0.1)).toBeNull();
  });

  it("selects representative party-state taunts", () => {
    const state = bridgeState();
    state.party[0].hp = 0;
    expect(selectAbyssFaceContext(state)).toContain("corpse");
    state.party[0].hp = state.party[0].maxHp;
    state.party.forEach((member) => { member.status = []; });
    state.party[1].status = ["poison"];
    expect(selectAbyssFaceContext(state)).toContain("green");
    state.party[1].status = [];
    state.party.forEach((member) => { member.class = "Fighter"; });
    expect(selectAbyssFaceContext(state)).toContain("No wizard");
  });

  it("acknowledges repeated direct looks without firing on every turn", () => {
    const state = bridgeState();
    state.player = { x: 2, y: 17, facing: 1 };
    expect(resolveAbyssFaceTurn(state)).toBeNull();
    expect(resolveAbyssFaceTurn(state)).toBeNull();
    expect(resolveAbyssFaceTurn(state)?.text).toBe("Yes?");
  });
});
