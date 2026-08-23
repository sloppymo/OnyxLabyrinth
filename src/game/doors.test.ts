import { describe, it, expect } from "vitest";
import { createGameState } from "./state";
import { createLegacyParty } from "./party";
import { buildSolidGrid, carveRoom, setEdge } from "./dungeon";
import { FLOORS } from "../data/floors";
import { tryUnlock, facingLock } from "./doors";
import { castUtilitySpell, utilityCastOptions } from "./persistent-spells";
import type { GameState } from "../types";

/** Tiny floor with a locked door facing east from (1,1). */
function makeLockedState(opts?: { withThief?: boolean; withMageOnly?: boolean }): GameState {
  const state = createGameState(FLOORS[0], createLegacyParty());
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setEdge(grid, 1, 1, "e", "locked");
  setEdge(grid, 2, 1, "w", "locked");
  state.floor = {
    ...state.floor,
    id: 1,
    grid,
    startX: 1,
    startY: 1,
    lockedDoors: [{ x: 1, y: 1, dir: "e", keyId: "test-key" }],
    treasures: [],
    teleporters: [],
    chuteDrops: [],
    encounterRate: 0,
  };
  state.mode = "dungeon";
  state.player = { x: 1, y: 1, facing: 1 }; // east
  state.keys = [];

  if (opts?.withMageOnly) {
    // Strip Thief; keep Mage (Knock) and remove Priest if present.
    state.party = state.party.filter((c) => c.class === "Mage" || c.class === "Fighter");
    const mage = state.party.find((c) => c.class === "Mage");
    if (mage && !mage.knownSpellIds.includes("mage-knock")) {
      mage.knownSpellIds = [...mage.knownSpellIds, "mage-knock"];
    }
  } else if (opts?.withThief === false) {
    state.party = state.party.filter((c) => c.class !== "Thief");
  }

  return state;
}

describe("tryUnlock", () => {
  it("opens with a matching key", () => {
    const state = makeLockedState({ withThief: false });
    state.keys = ["test-key"];
    // Strip casters so key path is unambiguous.
    state.party = state.party.filter((c) => c.class === "Fighter");
    const msg = tryUnlock(state);
    expect(msg).toMatch(/unlock the door with the test-key/);
    expect(facingLock(state)).toBeNull();
    expect(state.keys).toEqual([]);
  });

  it("lets a living Thief pick without a key", () => {
    const state = makeLockedState();
    // Ensure a Thief is present; strip Knock casters so pick path is used.
    for (const c of state.party) {
      if (c.class === "Mage" || c.class === "Priest") c.knownSpellIds = [];
    }
    expect(state.party.some((c) => c.class === "Thief")).toBe(true);
    const msg = tryUnlock(state);
    expect(msg).toMatch(/Thief picks the lock/);
  });

  it("casts Knock when there is no Thief or key", () => {
    const state = makeLockedState({ withMageOnly: true });
    const mage = state.party.find((c) => c.class === "Mage")!;
    const spBefore = mage.sp;
    const msg = tryUnlock(state);
    expect(msg).toMatch(/casts Knock/);
    expect(msg).toMatch(/lock yields/);
    expect(mage.sp).toBe(spBefore - 2);
    expect(state.unlockedDoors.size).toBeGreaterThan(0);
  });

  it("fails without key, Thief, or knock spell", () => {
    const state = makeLockedState({ withThief: false });
    state.party = state.party.filter((c) => c.class === "Fighter");
    const msg = tryUnlock(state);
    expect(msg).toMatch(/key, a Thief, or a Knock/);
  });
});

describe("Knock / Unseal via grimoire", () => {
  it("opens a facing locked door and spends SP", () => {
    const state = makeLockedState({ withMageOnly: true });
    const mage = state.party.find((c) => c.class === "Mage")!;
    const spBefore = mage.sp;
    const msg = castUtilitySpell(state, mage.id, "mage-knock");
    expect(msg).toMatch(/Knock/);
    expect(msg).toMatch(/lock yields/);
    expect(mage.sp).toBe(spBefore - 2);
    expect(facingLock(state)).toBeNull();
  });

  it("refuses when not facing a locked door (no SP spent)", () => {
    const state = makeLockedState({ withMageOnly: true });
    state.player.facing = 0; // north — open room edge
    const mage = state.party.find((c) => c.class === "Mage")!;
    const spBefore = mage.sp;
    const msg = castUtilitySpell(state, mage.id, "mage-knock");
    expect(msg).toMatch(/Face a locked door/);
    expect(mage.sp).toBe(spBefore);
  });

  it("lists Knock / Unseal in utilityCastOptions for starter casters", () => {
    const state = makeLockedState();
    const ids = utilityCastOptions(state).map((o) => o.spell.id);
    expect(ids).toContain("mage-knock");
    expect(ids).toContain("priest-unseal");
  });
});
