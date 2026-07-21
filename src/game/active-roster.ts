/**
 * Active battle roster — 6-character roster, 4 fight per encounter.
 * Bench members sit out combat and earn reduced XP on victory.
 */

import type { Character } from "./party";
import { sortPartyByFormation } from "./party";

export const ACTIVE_ROSTER_SIZE = 4;
export const BENCH_XP_FRACTION = 0.25;

/** First four characters by formation order (or all if roster is smaller). */
export function defaultActiveCharIds(party: readonly Character[]): string[] {
  const sorted = sortPartyByFormation([...party]);
  return sorted.slice(0, Math.min(ACTIVE_ROSTER_SIZE, sorted.length)).map((c) => c.id);
}

/** Ensure exactly four valid ids when possible; fill from formation order. */
export function normalizeActiveCharIds(
  party: readonly Character[],
  ids?: readonly string[] | null
): string[] {
  const partyIds = new Set(party.map((c) => c.id));
  const target = Math.min(ACTIVE_ROSTER_SIZE, party.length);
  const picked: string[] = [];
  for (const id of ids ?? []) {
    if (picked.length >= target) break;
    if (partyIds.has(id) && !picked.includes(id)) picked.push(id);
  }
  if (picked.length === target) return picked;

  const sorted = sortPartyByFormation([...party]);
  for (const c of sorted) {
    if (picked.length >= target) break;
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  return picked;
}

export function isActiveRosterMember(
  charId: string,
  activeCharIds: readonly string[]
): boolean {
  return activeCharIds.includes(charId);
}

/** Party members who enter this fight (formation order, active only). */
export function activePartyForCombat(
  party: readonly Character[],
  activeCharIds: readonly string[]
): Character[] {
  const active = new Set(activeCharIds);
  return sortPartyByFormation(party.filter((c) => active.has(c.id)));
}

/** Split victory XP: active + alive 100%, bench + alive 25%, KO 0%. */
export function awardCombatXp(
  party: Character[],
  activeCharIds: readonly string[],
  xpEarned: number
): void {
  const active = new Set(activeCharIds);
  const benchXp = Math.floor(xpEarned * BENCH_XP_FRACTION);
  for (const c of party) {
    if (c.hp <= 0) continue;
    c.xp += active.has(c.id) ? xpEarned : benchXp;
  }
}

/** Victory banner fragment for the post-combat message line. */
export function combatXpVictoryMessage(
  xpEarned: number,
  hasBench: boolean
): string {
  if (!hasBench || xpEarned <= 0) {
    return `+${xpEarned} XP each`;
  }
  const benchXp = Math.floor(xpEarned * BENCH_XP_FRACTION);
  return `+${xpEarned} XP active, +${benchXp} XP bench`;
}

/** Merge combat-only party rows back into the full roster. */
export function applyCombatPartyResult(
  roster: Character[],
  combatParty: Character[]
): Character[] {
  const byId = new Map(combatParty.map((c) => [c.id, c]));
  return roster.map((c) => {
    const updated = byId.get(c.id);
    if (!updated) return c;
    return {
      ...updated,
      stats: { ...updated.stats },
      status: [...updated.status],
      knownSpellIds: [...updated.knownSpellIds],
      perkIds: [...updated.perkIds],
    };
  });
}
