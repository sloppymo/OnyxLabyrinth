/**
 * Display-only helpers for the combat UI.
 *
 * These are pure formatting functions: they do not affect combat math, only
 * how information is presented to the player.
 */

import type { Character } from "../game/party";
import type { DamageElement, SpellEffect, SpellTarget } from "../data/spells";

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

const ELEMENT_LABELS: Record<DamageElement, string> = {
  fire: "Fire",
  cold: "Cold",
  physical: "Physical",
  undead: "Holy",
  lightning: "Lightning",
  poison: "Poison",
};

/** Friendly label for a spell's target shape (single/group/all, ally/enemy). */
export function spellTargetLabel(target: SpellTarget): string {
  switch (target) {
    case "self":
      return "Self";
    case "singleAlly":
      return "One ally";
    case "singleEnemy":
      return "One enemy";
    case "groupAllies":
      return "Ally group";
    case "groupEnemies":
      return "Enemy group";
    case "allAllies":
      return "All allies";
    case "allEnemies":
      return "All enemies";
  }
}

/** One-line mechanical summary of a spell's effect (damage, heal, buff, …). */
export function spellEffectSummary(effect: SpellEffect): string {
  switch (effect.kind) {
    case "damage":
      return `${effect.power} ${ELEMENT_LABELS[effect.element]} damage`;
    case "heal":
      return `Heals ${effect.power} HP`;
    case "buff":
      return "Raises armor";
    case "cure":
      return `Cures ${capitalize(effect.status)}`;
    case "disable":
      return `Inflicts ${capitalize(effect.status)}`;
    case "resurrect":
      return "Revives a fallen ally";
    case "magicScreen":
      return `Magic screen (strength ${effect.power})`;
    case "fizzleField":
      return `Fizzle field (strength ${effect.power})`;
    case "dispelMagic":
      return "Dispels enemy wards";
    case "summon":
      return `Summons an ally (power ${effect.power})`;
    case "light":
      return "Lights the way";
    case "levitation":
      return "Levitates the party";
    case "detect":
      return "Reveals position";
  }
}

/** Number of recent log entries shown in the persistent combat message log. */
export const COMBAT_LOG_HISTORY = 8;

/** A single selectable choice rendered in a combat selection list. */
export interface SelectionChoice {
  index: number;
  label: string;
}

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
  
  // Priority order for status display
  if (c.status.includes("hidden")) return "Hidden";
  if (c.status.includes("exposed")) return "Exposed";
  
  const active = c.status.filter((s) => s !== "knockedOut" && s !== "hidden" && s !== "exposed");
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
