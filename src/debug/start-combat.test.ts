import { describe, it, expect } from "vitest";
import { buildDebugCombat } from "./start-combat";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { defaultLoadoutForCharacter } from "../game/combat-equipment";
import type { GameState } from "../types";

/**
 * Regression coverage for Issue #20: `window.__onyxDebug.startCombat()`
 * was exposed as a bare reference to the internal
 * `async function startCombat(combat: CombatState)`, so calling it with no
 * argument read `combat.isBoss` off `undefined` and threw
 * `TypeError: Cannot read properties of undefined (reading 'isBoss')`.
 *
 * `buildDebugCombat` is the synchronous core of the zero-argument debug
 * helper — it owns CombatState construction and the explicit error paths.
 * The async swirl/audio/mode transition stays in main.ts and is exercised
 * by the browser smoke test in PR #21.
 */
describe("buildDebugCombat (zero-argument debug startCombat core)", () => {
  function makeState(): GameState {
    const state = createGameState(FLOORS[0]!);
    // Place the party on a floor-1 cell that has an encounter table.
    state.player = { x: 1, y: 1, facing: 0 };
    return state;
  }

  function makeLoadout(state: GameState): Record<string, ReturnType<typeof defaultLoadoutForCharacter>> {
    const map: Record<string, ReturnType<typeof defaultLoadoutForCharacter>> = {};
    for (const c of state.party) map[c.id] = defaultLoadoutForCharacter(c);
    return map;
  }

  it("builds a CombatState with a defined isBoss flag from the live game state", () => {
    const state = makeState();
    const combat = buildDebugCombat(state, makeLoadout(state));
    expect(combat).toBeDefined();
    expect(typeof combat.isBoss).toBe("boolean");
    expect(state.combat).toBe(combat);
    expect(state.stepsSinceEncounter).toBe(0);
  });

  it("throws an explicit 'no party' error when the party is empty", () => {
    const state = makeState();
    state.party = [];
    expect(() => buildDebugCombat(state, {})).toThrowError(/no party/);
  });

  it("throws an explicit 'no floor' error when the floor is missing", () => {
    const state = makeState();
    // Simulate the pre-dungeon title-screen state where no floor is loaded.
    state.floor = null as unknown as GameState["floor"];
    expect(() => buildDebugCombat(state, makeLoadout(state))).toThrowError(/no floor/);
  });
});
