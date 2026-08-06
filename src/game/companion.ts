/**
 * Temporary fifth-party-member companions, recruited at Hot Boi's tavern.
 *
 * Architecture note: the combat/party systems are hard-built around
 * PARTY_SIZE = 4 (formation slots, save schema, the FF6 windows). Rather
 * than widen `state.party` to 5 (which save v13->v14 deliberately moved
 * *away* from — see save.ts), a companion rides the existing
 * `CombatState.summonedAllies` channel that the Priest's BAMORDI/SOCORDI
 * summon spells already use: a simple, AI-controlled, attack-only
 * combatant that acts before enemies and renders as its own row in the
 * FF6 windows. `companionAsSummonedAlly` builds one from the persisted
 * `CompanionState` at the top of every non-Arena combat (see main.ts
 * `startCombat`); `syncCompanionAfterCombat` copies its ending HP back.
 *
 * Only one companion exists in this release (Fifth Chair, see quests
 * data). Max count is enforced structurally, not by a check — there is
 * exactly one CompanionDef and `state.companion` is a single slot, not a
 * list.
 */

import type { GameState } from "../types";
import type { SummonedAlly } from "./combat-types";

export interface CompanionDef {
  id: string;
  name: string;
  title: string;
  maxHp: number;
  attack: number;
  ac: number;
  agi: number;
  row: "front" | "back";
}

export interface CompanionState {
  /** Stable id into COMPANIONS_BY_ID. */
  defId: string;
  hp: number;
  /** True while traveling with the party (fights in combat, shown in the
   *  Companions screen as "with you"). False while resting at the tavern —
   *  recruited but not currently along, e.g. after a combat death sends
   *  them back, or the player dismisses them. */
  withParty: boolean;
}

export const FIFTH_CHAIR: CompanionDef = {
  id: "fifth-chair",
  name: "Vess",
  title: "the last of her party",
  maxHp: 46,
  attack: 9,
  ac: 12,
  agi: 10,
  row: "front",
};

export const COMPANIONS_BY_ID: Record<string, CompanionDef> = {
  [FIFTH_CHAIR.id]: FIFTH_CHAIR,
};

/** Recruit a companion for the first time. No-op if one is already recruited
 *  (enforces the one-companion cap; also prevents re-granting on a repeat
 *  Scorchboard turn-in). */
export function recruitCompanion(state: GameState, defId: string): boolean {
  if (state.companion) return false;
  const def = COMPANIONS_BY_ID[defId];
  if (!def) return false;
  state.companion = { defId, hp: def.maxHp, withParty: true };
  return true;
}

/** Send the companion back to rest at the tavern (no equipment to lose —
 *  they carry none — so this can never duplicate or drop gear). */
export function dismissCompanion(state: GameState): void {
  if (!state.companion) return;
  state.companion.withParty = false;
}

/** Bring a resting, living companion back along. No-op if none recruited,
 *  already with the party, or fallen (fallen companions recover fully at
 *  the tavern instead — see reviveCompanionAtTavern). */
export function inviteCompanion(state: GameState): boolean {
  const c = state.companion;
  if (!c || c.withParty || c.hp <= 0) return false;
  c.withParty = true;
  return true;
}

/** Hot Boi patches up a fallen companion whenever the party is back at the
 *  tavern — mirrors the free full-restore Camp already gives the party
 *  outside combat; a companion who dropped to 0 HP is never permanently
 *  lost. Called on every TavernController open. */
export function reviveCompanionAtTavern(state: GameState): void {
  const c = state.companion;
  if (!c) return;
  const def = COMPANIONS_BY_ID[c.defId];
  if (!def) return;
  if (c.hp <= 0) {
    c.hp = def.maxHp;
    c.withParty = false; // they recover, but wait to be re-invited
  }
}

/** Builds the combat-ready ally for a companion currently traveling with
 *  the party. Returns null when there is no companion, they are resting
 *  at the tavern, or they have fallen. No spriteId is set on purpose —
 *  every enemy strip in the manifest is a monster or a reused boss, and
 *  none reads as "a fellow adventurer"; the engine's existing procedural
 *  fallback (the same one un-mapped summons use) is the honest choice
 *  here rather than borrowing a monster's art for a friendly. */
export function companionAsSummonedAlly(state: GameState): SummonedAlly | null {
  const c = state.companion;
  if (!c || !c.withParty || c.hp <= 0) return null;
  const def = COMPANIONS_BY_ID[c.defId];
  if (!def) return null;
  return {
    id: "companion",
    name: def.name,
    hp: c.hp,
    maxHp: def.maxHp,
    attack: def.attack,
    ac: def.ac,
    agi: def.agi,
    row: def.row,
  };
}

/** After combat ends, copy the companion's surviving HP back onto persisted
 *  state. `allyDeathCheck` (combat-eor.ts) permanently filters a 0-HP ally
 *  out of `summonedAllies` the instant it happens, so "not present in the
 *  final array" reliably means "died this fight" regardless of which round
 *  it happened in — `justDiedAllies` is reset every turn and can't be used
 *  for an end-of-combat check. */
export function syncCompanionAfterCombat(
  state: GameState,
  finalAllies: readonly SummonedAlly[]
): void {
  const c = state.companion;
  if (!c || !c.withParty) return;
  const alive = finalAllies.find((a) => a.id === "companion");
  if (alive) {
    c.hp = alive.hp;
    return;
  }
  c.hp = 0;
  c.withParty = false;
}
