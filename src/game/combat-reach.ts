/**
 * Weapon-range / reach rules. Row-based targeting restrictions have been
 * removed: all visible enemies are valid melee targets regardless of the
 * attacker's formation slot or the target's row. Enemy `row` values are
 * kept only for sprite positioning; party formation slots are kept for
 * visual arrangement and adjacency perks.
 *
 * `canReach` is retained as a always-true compatibility shim so callers
 * (equip screen, combat preview, etc.) don't need simultaneous changes.
 * `effectiveWeaponRange` is retained because perks still reference it.
 */

import type { Character } from "./party";
import { perksForCharacter } from "./perks";
import type { WeaponRange } from "./combat-types";

/**
 * All visible enemies are valid melee targets. This always returns true.
 * The attacker's formation slot and the target's row no longer restrict
 * who can be attacked.
 */
export function canReach(
  _attackerPosition: number,
  _weaponRange: WeaponRange,
  _targetRow: "front" | "back"
): boolean {
  return true;
}

/**
 * Effective weapon range after perk overrides (the reach perks):
 * - halberdier-sweep: every melee weapon behaves at polearm reach (medium).
 * - duelist-lunge: short weapons behave as medium.
 */
export function effectiveWeaponRange(actor: Character, weaponRange: WeaponRange): WeaponRange {
  const perks = perksForCharacter(actor);
  if (perks.some((p) => p.id === "halberdier-sweep")) return "medium";
  if (weaponRange === "short" && perks.some((p) => p.id === "duelist-lunge")) return "medium";
  return weaponRange;
}
