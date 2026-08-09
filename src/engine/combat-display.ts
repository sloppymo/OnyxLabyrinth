/**
 * Display-only helpers for the combat UI.
 *
 * These are pure formatting functions: they do not affect combat math, only
 * how information is presented to the player.
 */

import type { Character } from "../game/party";
import type { ActionPreview } from "../game/combat-types";
import type { DamageElement, SpellEffect, SpellTarget } from "../data/spells";
import type { TechniqueEffect, TechniqueTarget } from "../data/techniques";

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
  divine: "Divine",
  water: "Water",
  earth: "Earth",
  wind: "Wind",
};

/** Combat Magic sheet category tabs (excludes dungeon utility spells). */
export type SpellMagicCategory = "offense" | "defense" | "buffs" | "status";

export type SpellMagicTab = "all" | SpellMagicCategory;

export const SPELL_MAGIC_TABS: readonly { id: SpellMagicTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "buffs", label: "Buffs" },
  { id: "status", label: "Status" },
] as const;

export const SPELL_MAGIC_CATEGORY_LABEL: Record<SpellMagicCategory, string> = {
  offense: "Offense",
  defense: "Defense",
  buffs: "Buffs",
  status: "Status",
};

/**
 * Map SpellEffect.kind → Magic sheet category.
 * Utilities return null (filtered out of combat lists already).
 */
export function spellMagicCategory(effect: SpellEffect): SpellMagicCategory | null {
  switch (effect.kind) {
    case "damage":
    case "summon":
      return "offense";
    case "heal":
    case "resurrect":
    case "massResurrect":
    case "magicScreen":
      return "defense";
    case "buff":
      return "buffs";
    case "disable":
    case "cure":
    case "fizzleField":
    case "dispelMagic":
    case "combatStatus":
      return "status";
    case "light":
    case "levitation":
    case "detect":
    case "knock":
      return null;
  }
}

/** Element label for damage spells; em dash for non-elemental effects. */
export function spellElementLabel(effect: SpellEffect): string {
  return effect.kind === "damage" ? ELEMENT_LABELS[effect.element] : "—";
}

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

/** Suffix describing a damage/heal effect's over-time followup, if any. */
function followupSummary(effect: Extract<SpellEffect, { kind: "damage" | "heal" }>): string {
  const f = effect.followup;
  if (!f) return "";
  if (f.kind === "dot") {
    return ` + ${f.power}/round ${ELEMENT_LABELS[f.element].toLowerCase()} burn (${f.duration} rounds)`;
  }
  return ` + regen ${f.power}/round (${f.duration} rounds)`;
}

/** One-line mechanical summary of a spell's effect (damage, heal, buff, …). */
export function spellEffectSummary(effect: SpellEffect): string {
  switch (effect.kind) {
    case "damage":
      return `${effect.power} ${ELEMENT_LABELS[effect.element]} damage${followupSummary(effect)}`;
    case "heal":
      return effect.power >= 9999
        ? "Fully restores HP"
        : `Heals ${effect.power} HP${followupSummary(effect)}`;
    case "buff":
      return "Raises armor";
    case "cure":
      return `Cures ${capitalize(effect.status)}`;
    case "disable":
      return `Inflicts ${capitalize(effect.status)}`;
    case "resurrect":
      return "Revives a fallen ally";
    case "massResurrect":
      return "Revives every fallen ally";
    case "magicScreen":
      return `Magic screen (strength ${effect.power})`;
    case "fizzleField":
      return `Fizzle field (strength ${effect.power})`;
    case "dispelMagic":
      return effect.preserveEnemyDebuffs
        ? `Erases enemy wards + fizzle (${effect.fizzlePower ?? 0})`
        : "Dispels enemy wards";
    case "combatStatus":
      return effect.status === "shrunk"
        ? "Shrinks one foe (half size & damage)"
        : `Giant Strength (${effect.duration ?? 3} rounds)`;
    case "summon":
      return `Summons an ally (power ${effect.power})`;
    case "light":
      return "Lights the way";
    case "levitation":
      return "Levitates the party";
    case "detect":
      return "Reveals position";
    case "knock":
      return "Opens a locked door";
  }
}

// ---------------------------------------------------------------------------
// Technique display helpers
// ---------------------------------------------------------------------------

/** Friendly label for a technique's target shape. */
export function techniqueTargetLabel(target: TechniqueTarget): string {
  switch (target) {
    case "self":
      return "Self";
    case "singleEnemy":
      return "One enemy";
    case "singleAlly":
      return "One ally";
    case "rowEnemies":
      return "Enemy row";
    case "columnEnemies":
      return "Enemy column";
    case "allFrontEnemies":
      return "Front-row enemies";
    case "allEnemies":
      return "All enemies";
    case "allAllies":
      return "All allies";
    case "allFrontAllies":
      return "Front-row allies";
    case "randomEnemies":
      return "Random enemies";
  }
}

/** One-line mechanical summary of a technique's effect. */
export function techniqueEffectSummary(effect: TechniqueEffect): string {
  switch (effect.kind) {
    case "damage":
      return `${effect.multiplier}x weapon damage${effect.element ? ` (${ELEMENT_LABELS[effect.element]})` : ""}${effect.armorPen ? `, ignores ${Math.round(effect.armorPen * 100)}% AC` : ""}`;
    case "multiHit":
      return `${effect.hits} hits at ${effect.multiplier}x damage${effect.randomTarget ? " (random targets)" : ""}`;
    case "damageWithStatus":
      return `${effect.multiplier}x damage + ${Math.round(effect.statusChance * 100)}% ${effect.status}`;
    case "damageWithExecute":
      return `${effect.multiplier}x damage, executes below ${Math.round(effect.executeThreshold * 100)}% HP${effect.undeadOnly ? " (undead)" : ""}`;
    case "buff":
      return `+${effect.power} armor (${effect.target})`;
    case "debuff":
      return `-${effect.power} ${effect.stat} for ${effect.duration} rounds`;
    case "heal":
      return "Heals (STR + PIE) × 2 HP";
    case "counterStance":
      return `Counter stance: reflects ${effect.multiplier}x damage`;
    case "taunt":
      return `Taunt + +${effect.armorBonus} armor for ${effect.duration} rounds`;
    case "buffNextAttack":
      return `Next attack: +${Math.round(effect.critChanceBonus * 100)}% crit${effect.hitChanceBonus ? ", guaranteed hit" : ""}`;
    case "rageGrant":
      return `+${effect.amount} rage to all allies`;
    case "damageBuff":
      return `+${Math.round((effect.multiplier - 1) * 100)}% damage for ${effect.duration} rounds`;
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

/** Compact target-menu forecast: `24-31`, `80% 24-31`, `38`, `24-31 KO`,
 *  `Out of reach` (weapon range can't hit that row from here), or `—` (no
 *  effect / no forecastable damage — a genuinely different reason than
 *  reach, kept visually distinct so a player never mistakes "I can't
 *  target this" for "I don't have data on this yet"). */
export function formatActionPreview(preview: ActionPreview): string {
  if (preview.unreachable) return "Out of reach";
  if (preview.noEffect) return "—";
  if (preview.minDamage <= 0 && preview.maxDamage <= 0) return "—";
  const band =
    preview.minDamage === preview.maxDamage
      ? `${preview.minDamage}`
      : `${preview.minDamage}-${preview.maxDamage}`;
  const withKo = preview.guaranteedKill ? `${band} KO` : band;
  if (preview.hitChance < 1) {
    return `${Math.round(preview.hitChance * 100)}% ${withKo}`;
  }
  return withKo;
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
