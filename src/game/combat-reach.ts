/**
 * Weapon-range / reach rules for the Wizardry V targeting system adapted to
 * OnyxLabyrinth's two-row formation (front row ≈ groups 1-2, back row ≈
 * groups 3-4). Pure functions — no CombatState knowledge.
 */

import type { Character } from "./party";
import { perksForCharacter } from "./perks";
import type { WeaponRange } from "./combat-types";

/**
 * Check if an attacker can reach a target based on position and weapon range.
 * Implements the Wizardry V targeting grid adapted to OnyxLabyrinth's
 * front/back row system.
 *
 * @param attackerPosition - 0-5, where 0-2 are front row and 3-5 are back row
 * @param weaponRange - The weapon's range type
 * @param targetRow - The target enemy's row ("front" or "back")
 * @returns true if the attacker can reach the target
 */
export function canReach(
  attackerPosition: number,
  weaponRange: WeaponRange,
  targetRow: "front" | "back"
): boolean {
  const isFrontRow = attackerPosition >= 0 && attackerPosition <= 2;

  switch (weaponRange) {
    case "close":
      // Slots 1-3 (front row) can reach groups 1-2 (front row enemies).
      return isFrontRow && targetRow === "front";
    case "short":
      // Slots 1-3 reach groups 1-3; slots 4-6 reach groups 1-2.
      // In a two-row system: front-row reaches all; back-row reaches front only.
      return isFrontRow || targetRow === "front";
    case "medium":
      // Slots 1-3 reach all groups; slots 4-6 reach groups 1-3.
      // In a two-row system both rows reach everything.
      return true;
    case "long":
      // All positions reach all groups.
      return true;
    default:
      // Fallback: treat unknown as melee-only (close range).
      return isFrontRow && targetRow === "front";
  }
}

/**
 * Effective weapon range after perk overrides (the reach perks):
 * - halberdier-sweep: every melee weapon behaves at polearm reach (medium) —
 *   any row from any row, no back-row damage penalty.
 * - duelist-lunge: short weapons behave as medium.
 */
export function effectiveWeaponRange(actor: Character, weaponRange: WeaponRange): WeaponRange {
  const perks = perksForCharacter(actor);
  if (perks.some((p) => p.id === "halberdier-sweep")) return "medium";
  if (weaponRange === "short" && perks.some((p) => p.id === "duelist-lunge")) return "medium";
  return weaponRange;
}
