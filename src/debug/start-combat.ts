// Pure helper for the __onyxDebug.startCombat() zero-argument debug surface.
// Extracted from main.ts so the regression test for Issue #20 can exercise
// the exact "build a combat from the live game state" path without booting
// the DOM bootstrap. The async transition (swirl/audio/showMode) stays in
// main.ts; this module only owns the synchronous CombatState construction
// and the explicit error paths that previously crashed with
// `Cannot read properties of undefined (reading 'isBoss')`.

import type { GameState, Loadout } from "../types";
import type { CombatState } from "../game/combat-types";
import { createCombatFromEncounter } from "../game/combat";
import { encounterTableFloorId } from "../game/encounters";
import { rollEncounter, resolveEncounter } from "../data/enemies";
import { ALL_SPELLS } from "../data/spells";
import { ITEMS_BY_ID } from "../data/items";

const SPELLS_BY_ID: Record<string, (typeof ALL_SPELLS)[number]> = Object.fromEntries(
  ALL_SPELLS.map((s) => [s.id, s])
);

/**
 * Build a CombatState for the current floor/party as the in-engine
 * `__onyxDebug.startCombat()` helper does. Throws explicit errors when the
 * preconditions for a debug combat are not met — these messages are part of
 * the helper's contract and are asserted in `start-combat.test.ts`.
 *
 * Returns the constructed CombatState and mutates `state.combat` /
 * `state.stepsSinceEncounter` to match the in-engine helper's side effects.
 * Does NOT mutate `state.mode`; the caller (main.ts) owns mode transitions.
 */
export function buildDebugCombat(
  state: GameState,
  loadout: Record<string, Loadout>
): CombatState {
  if (state.party.length === 0) {
    throw new Error("startCombat: no party");
  }
  if (!state.floor) {
    throw new Error("startCombat: no floor");
  }
  const tableId = encounterTableFloorId(
    state.floor,
    state.player.x,
    state.player.y
  );
  const entry = rollEncounter(tableId);
  if (!entry) {
    throw new Error(`startCombat: rollEncounter returned null for table ${tableId}`);
  }
  const resolved = resolveEncounter(entry);
  if (resolved.length === 0) {
    throw new Error("startCombat: resolveEncounter returned no spawns");
  }
  const combat = createCombatFromEncounter(
    state.party,
    resolved,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    loadout,
    state.inventory,
    state.inAntimagic
  );
  state.combat = combat;
  state.stepsSinceEncounter = 0;
  return combat;
}
