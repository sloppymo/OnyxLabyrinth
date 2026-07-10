/**
 * Unit tests for utility spells and persistent buffs (Milwa light, Litofit
 * levitation, Dumapic detect) and their interplay with tile features.
 */
import { describe, it, expect } from "vitest";
import {
  utilityCastOptions,
  castUtilitySpell,
  hasBuff,
  tickBuffs,
  clearBuffs,
} from "./persistent-spells";
import { handleTileFeature } from "./features";
import { createGameState } from "./state";
import { buildSolidGrid, carveRoom, setTile } from "./dungeon";
import { FLOORS } from "../data/floors";
import type { GameState } from "../types";

/** A state on a tiny synthetic floor with darkness at (3,2), chute at (1,2). */
function makeState(): GameState {
  const state = createGameState(FLOORS[0]);
  const grid = buildSolidGrid(6, 6);
  carveRoom(grid, 1, 1, 4, 4);
  setTile(grid, 3, 2, "darkness");
  setTile(grid, 1, 2, "chute");
  state.floor = {
    ...state.floor,
    id: 1,
    grid,
    startX: 1,
    startY: 1,
    treasures: [],
    teleporters: [],
    chuteDrops: [],
    encounterRate: 0,
  };
  state.mode = "dungeon";
  state.player = { x: 1, y: 1, facing: 0 };
  return state;
}

function priestOf(state: GameState) {
  const c = state.party.find((p) => p.knownSpellIds.includes("priest-milwa"));
  if (!c) throw new Error("no default priest knows Milwa");
  return c;
}

function mageOf(state: GameState) {
  const c = state.party.find((p) => p.knownSpellIds.includes("mage-dumapic"));
  if (!c) throw new Error("no default mage knows Dumapic");
  return c;
}

describe("utilityCastOptions", () => {
  it("lists Milwa and Dumapic for the default level-1 party", () => {
    const state = makeState();
    const ids = utilityCastOptions(state).map((o) => o.spell.id);
    expect(ids).toContain("priest-milwa");
    expect(ids).toContain("mage-dumapic");
    // Litofit is tier 4 — no level-1 caster knows it.
    expect(ids).not.toContain("mage-litofit");
  });

  it("omits dead casters and marks unaffordable casts", () => {
    const state = makeState();
    const priest = priestOf(state);
    priest.sp = 0;
    const opt = utilityCastOptions(state).find((o) => o.spell.id === "priest-milwa");
    expect(opt?.affordable).toBe(false);
    priest.hp = 0;
    const ids = utilityCastOptions(state).map((o) => o.casterId);
    expect(ids).not.toContain(priest.id);
  });
});

describe("castUtilitySpell", () => {
  it("Milwa adds a light buff and deducts SP", () => {
    const state = makeState();
    const priest = priestOf(state);
    const spBefore = priest.sp;
    const msg = castUtilitySpell(state, priest.id, "priest-milwa");
    expect(msg).toMatch(/radiance/);
    expect(priest.sp).toBe(spBefore - 3);
    expect(hasBuff(state, "light")).toBe(true);
    expect(state.persistentBuffs[0].remainingSteps).toBe(40);
  });

  it("Dumapic reports position and facing without adding a buff", () => {
    const state = makeState();
    const mage = mageOf(state);
    state.player = { x: 3, y: 4, facing: 1 };
    const msg = castUtilitySpell(state, mage.id, "mage-dumapic");
    expect(msg).toMatch(/\(3, 4\)/);
    expect(msg).toMatch(/east/);
    expect(state.persistentBuffs).toHaveLength(0);
  });

  it("re-casting refreshes the countdown instead of stacking", () => {
    const state = makeState();
    const priest = priestOf(state);
    castUtilitySpell(state, priest.id, "priest-milwa");
    state.persistentBuffs[0].remainingSteps = 5;
    castUtilitySpell(state, priest.id, "priest-milwa");
    expect(state.persistentBuffs).toHaveLength(1);
    expect(state.persistentBuffs[0].remainingSteps).toBe(40);
  });

  it("fails in anti-magic zones and on insufficient SP", () => {
    const state = makeState();
    const priest = priestOf(state);
    state.inAntimagic = true;
    expect(castUtilitySpell(state, priest.id, "priest-milwa")).toMatch(/anti-magic/);
    expect(hasBuff(state, "light")).toBe(false);
    state.inAntimagic = false;
    priest.sp = 0;
    expect(castUtilitySpell(state, priest.id, "priest-milwa")).toMatch(/lacks the SP/);
  });
});

describe("tickBuffs", () => {
  it("counts down and reports expiry", () => {
    const state = makeState();
    state.persistentBuffs.push({ kind: "light", remainingSteps: 2 });
    expect(tickBuffs(state)).toHaveLength(0);
    expect(state.persistentBuffs[0].remainingSteps).toBe(1);
    const msgs = tickBuffs(state);
    expect(msgs[0]).toMatch(/gutters out/);
    expect(state.persistentBuffs).toHaveLength(0);
  });

  it("clearBuffs (camping) removes everything", () => {
    const state = makeState();
    state.persistentBuffs.push(
      { kind: "light", remainingSteps: 10 },
      { kind: "levitation", remainingSteps: 10 }
    );
    clearBuffs(state);
    expect(state.persistentBuffs).toHaveLength(0);
  });
});

describe("buff interplay with tile features", () => {
  it("light counters darkness zones", () => {
    const state = makeState();
    state.player = { x: 3, y: 2, facing: 0 };
    state.persistentBuffs.push({ kind: "light", remainingSteps: 10 });
    const result = handleTileFeature(state);
    expect(state.inDarkness).toBe(false);
    expect(result?.message).toMatch(/holds back the darkness/);
  });

  it("darkness applies normally once the light is gone", () => {
    const state = makeState();
    state.player = { x: 3, y: 2, facing: 0 };
    const result = handleTileFeature(state);
    expect(state.inDarkness).toBe(true);
    expect(result?.message).toMatch(/darkness zone/);
  });

  it("casting Milwa while standing in darkness clears it immediately", () => {
    const state = makeState();
    state.player = { x: 3, y: 2, facing: 0 };
    handleTileFeature(state);
    expect(state.inDarkness).toBe(true);
    castUtilitySpell(state, priestOf(state).id, "priest-milwa");
    expect(state.inDarkness).toBe(false);
  });

  it("levitation floats the party over chutes", () => {
    const state = makeState();
    state.player = { x: 1, y: 2, facing: 0 };
    state.persistentBuffs.push({ kind: "levitation", remainingSteps: 10 });
    const result = handleTileFeature(state);
    expect(result?.changedFloor).toBe(false);
    expect(result?.message).toMatch(/float over the chute/);
  });
});
