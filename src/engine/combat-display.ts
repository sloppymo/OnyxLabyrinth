/**
 * Display-only helpers for the combat UI.
 *
 * These are pure formatting functions: they do not affect combat math, only
 * how information is presented to the player.
 */

import type { Character } from "../game/party";

/** Qualitative health descriptor for an enemy or character. */
export function enemyHealthDescriptor(currentHp: number, maxHp: number): string {
  if (maxHp <= 0) return "Unknown";
  const ratio = Math.max(0, currentHp) / maxHp;
  if (ratio <= 0) return "Defeated";
  if (ratio > 0.85) return "Unwounded";
  if (ratio > 0.6) return "Lightly wounded";
  if (ratio > 0.35) return "Wounded";
  if (ratio > 0.15) return "Badly wounded";
  return "Near death";
}

/** A single, combat-glanceable status word for a party member. */
export function partyStatusText(c: Character): string {
  if (c.hp <= 0 || c.status.includes("knockedOut")) return "Fallen";
  const active = c.status.filter((s) => s !== "knockedOut");
  if (active.length === 0) return "OK";
  return active[0];
}

/** Ratio clamped to [0, 1]. */
export function hpRatio(c: Character): number {
  return c.maxHp > 0 ? Math.max(0, c.hp) / c.maxHp : 0;
}

/** CSS modifier class for the HP bar fill. */
export function hpBarColorClass(ratio: number): string {
  if (ratio <= 0.25) return "low";
  if (ratio <= 0.6) return "mid";
  return "";
}
