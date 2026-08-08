import { describe, it, expect } from "vitest";
import { createGameState } from "./state";
import { FLOORS } from "../data/floors";
import {
  FIFTH_CHAIR,
  recruitCompanion,
  dismissCompanion,
  inviteCompanion,
  reviveCompanionAtTavern,
  companionAsSummonedAlly,
  syncCompanionAfterCombat,
} from "./companion";

function freshState() {
  return createGameState(FLOORS[0]);
}

describe("companion recruitment (max one)", () => {
  it("recruits once and enforces the one-companion cap structurally", () => {
    const state = freshState();
    expect(state.companion).toBeNull();
    expect(recruitCompanion(state, FIFTH_CHAIR.id)).toBe(true);
    expect(state.companion).toEqual({
      defId: FIFTH_CHAIR.id,
      hp: FIFTH_CHAIR.maxHp,
      withParty: true,
    });
    // Recruiting again (e.g. a re-triggered reward) cannot duplicate or reset them.
    expect(recruitCompanion(state, FIFTH_CHAIR.id)).toBe(false);
  });

  it("rejects an unknown companion id", () => {
    const state = freshState();
    expect(recruitCompanion(state, "nonexistent")).toBe(false);
    expect(state.companion).toBeNull();
  });
});

describe("dismiss / invite", () => {
  it("dismiss sends the companion to rest; invite brings a living one back", () => {
    const state = freshState();
    recruitCompanion(state, FIFTH_CHAIR.id);
    dismissCompanion(state);
    expect(state.companion?.withParty).toBe(false);
    expect(inviteCompanion(state)).toBe(true);
    expect(state.companion?.withParty).toBe(true);
  });

  it("invite is a no-op with no companion, already with the party, or fallen", () => {
    const state = freshState();
    expect(inviteCompanion(state)).toBe(false); // none recruited
    recruitCompanion(state, FIFTH_CHAIR.id);
    expect(inviteCompanion(state)).toBe(false); // already with the party
    state.companion!.hp = 0;
    dismissCompanion(state);
    expect(inviteCompanion(state)).toBe(false); // fallen
  });
});

describe("reviveCompanionAtTavern", () => {
  it("fully heals a fallen companion and leaves them resting, never lost", () => {
    const state = freshState();
    recruitCompanion(state, FIFTH_CHAIR.id);
    state.companion!.hp = 0;
    state.companion!.withParty = true;
    reviveCompanionAtTavern(state);
    expect(state.companion!.hp).toBe(FIFTH_CHAIR.maxHp);
    expect(state.companion!.withParty).toBe(false);
  });

  it("does nothing to a healthy or unrecruited companion", () => {
    const state = freshState();
    reviveCompanionAtTavern(state); // no companion — no-op, no throw
    recruitCompanion(state, FIFTH_CHAIR.id);
    reviveCompanionAtTavern(state);
    expect(state.companion!.hp).toBe(FIFTH_CHAIR.maxHp);
    expect(state.companion!.withParty).toBe(true);
  });
});

describe("companionAsSummonedAlly", () => {
  it("builds a combat-ready ally only when recruited, with the party, and alive", () => {
    const state = freshState();
    expect(companionAsSummonedAlly(state)).toBeNull();
    recruitCompanion(state, FIFTH_CHAIR.id);
    const ally = companionAsSummonedAlly(state);
    expect(ally).not.toBeNull();
    expect(ally!.id).toBe("companion");
    expect(ally!.hp).toBe(FIFTH_CHAIR.maxHp);
    expect(ally!.spriteId).toBeUndefined();

    dismissCompanion(state);
    expect(companionAsSummonedAlly(state)).toBeNull();

    inviteCompanion(state);
    state.companion!.hp = 0;
    expect(companionAsSummonedAlly(state)).toBeNull();
  });
});

describe("syncCompanionAfterCombat", () => {
  it("copies surviving HP back from the final ally list", () => {
    const state = freshState();
    recruitCompanion(state, FIFTH_CHAIR.id);
    syncCompanionAfterCombat(state, [
      { id: "companion", name: FIFTH_CHAIR.name, hp: 12, maxHp: FIFTH_CHAIR.maxHp, attack: 9, ac: 12, agi: 10, row: "front" },
    ]);
    expect(state.companion!.hp).toBe(12);
    expect(state.companion!.withParty).toBe(true);
  });

  it("marks the companion fallen when absent from the final ally list", () => {
    const state = freshState();
    recruitCompanion(state, FIFTH_CHAIR.id);
    syncCompanionAfterCombat(state, []); // removed by allyDeathCheck mid-fight
    expect(state.companion!.hp).toBe(0);
    expect(state.companion!.withParty).toBe(false);
  });

  it("is a no-op when the companion was not traveling (e.g. Arena)", () => {
    const state = freshState();
    recruitCompanion(state, FIFTH_CHAIR.id);
    dismissCompanion(state);
    syncCompanionAfterCombat(state, []);
    expect(state.companion!.hp).toBe(FIFTH_CHAIR.maxHp);
  });
});
