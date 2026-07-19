/**
 * Cross-cluster combat helpers shared by the resolution modules
 * (actions, spells, techniques, ai, enemy, eor). Everything here operates on
 * an already-cloned CombatState — public entry points clone, internal helpers
 * mutate the clone; this module keeps that convention, it does not own state.
 */

import type { Character, Stats } from "./party";
import { effectiveStats } from "./effective-stats";
import { perksForCharacter, type PerkModifiers } from "./perks";
import type { CombatState, EnemyInstance } from "./combat-types";

/** Effective stats for a combatant, reading their loadout and chosen perks. */
export function effStatsFor(s: CombatState, c: Character): Stats {
  return effectiveStats(c, s.loadout[c.id], perksForCharacter(c));
}

/**
 * Perk damage multiplier against tagged enemies (Turn Undead, Judge,
 * Inquisitor). Reads the target's `special` tags; 1 when no tag matches.
 */
export function tagDamageMultiplier(mods: PerkModifiers, target: EnemyInstance): number {
  let mult = 1;
  if (mods.undeadDamageMultiplier !== 1 && target.special.some((sp) => sp.kind === "undead")) {
    mult *= mods.undeadDamageMultiplier;
  }
  if (mods.demonDamageMultiplier !== 1 && target.special.some((sp) => sp.kind === "demon")) {
    mult *= mods.demonDamageMultiplier;
  }
  return mult;
}
