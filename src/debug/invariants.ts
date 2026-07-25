// Debug-only state invariant checks. Pure: no DOM, no engine imports.
//
// These catch "the game is in a state it should never be in" bugs that a
// playtest script would otherwise have to encode by hand in every assertion —
// stat bounds, roster consistency, and route/mode agreement. Results surface
// as snapshot().warnings, so an agent sees them without asking.

import type { ControllerRouteKind } from "../engine/controller-route";
import type { GameState } from "../types";
import type { CombatDebugView } from "./snapshot";

export interface InvariantInput {
  state: GameState;
  route: ControllerRouteKind;
  combat?: CombatDebugView | null;
}

/** Party size at which the active battle roster must be exactly four. */
const ACTIVE_ROSTER_SIZE = 4;

export function checkInvariants(input: InvariantInput): string[] {
  const { state, route, combat } = input;
  const warnings: string[] = [];

  for (const c of state.party) {
    if (c.hp > c.maxHp) warnings.push(`${c.name}: hp ${c.hp} exceeds maxHp ${c.maxHp}`);
    if (c.hp < 0) warnings.push(`${c.name}: hp ${c.hp} is negative`);
    if (c.sp > c.maxSp) warnings.push(`${c.name}: sp ${c.sp} exceeds maxSp ${c.maxSp}`);
    if (c.sp < 0) warnings.push(`${c.name}: sp ${c.sp} is negative`);
  }

  const partyIds = new Set(state.party.map((c) => c.id));
  const seen = new Set<string>();
  for (const id of state.activeCharIds) {
    if (!partyIds.has(id)) warnings.push(`activeCharIds references unknown character ${id}`);
    if (seen.has(id)) warnings.push(`activeCharIds has duplicate entry ${id}`);
    seen.add(id);
  }
  if (state.party.length >= ACTIVE_ROSTER_SIZE && state.activeCharIds.length !== ACTIVE_ROSTER_SIZE) {
    warnings.push(
      `activeCharIds has ${state.activeCharIds.length} entries; expected ${ACTIVE_ROSTER_SIZE} for a party of ${state.party.length}`
    );
  }

  // pendingTrap gates every dungeon input handler; it is meaningless (and a
  // soft-lock risk) outside dungeon mode.
  if (state.pendingTrap && state.mode !== "dungeon") {
    warnings.push(`pendingTrap set while mode is "${state.mode}", not "dungeon"`);
  }

  if (combat && route !== "combat") {
    warnings.push(`combat view present while route is "${route}"`);
  }
  if (!combat && route === "combat") {
    warnings.push(`route is "combat" but no combat view was supplied`);
  }

  for (const e of combat?.enemies ?? []) {
    if (e.hp > e.maxHp) warnings.push(`${e.name}: enemy hp ${e.hp} exceeds maxHp ${e.maxHp}`);
    if (e.hp < 0) warnings.push(`${e.name}: enemy hp ${e.hp} is negative`);
  }

  return warnings;
}
