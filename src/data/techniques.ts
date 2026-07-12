/**
 * Melee class technique definitions — design spec
 * `docs/superpowers/specs/2026-07-11-melee-techniques-design.md`.
 *
 * Each melee class (Fighter, Thief, Halberdier, Duelist, Crusader) gets 6
 * techniques learned automatically at levels 1/3/5/7/10/12. Techniques are
 * active abilities chosen via the "Technique" combat menu entry, powered by
 * the Rage resource (see `game/combat.ts`).
 *
 * Casters (Mage, Priest) do not get techniques — they have spells.
 */

import type { CharacterClass } from "../game/party";
import type { DamageElement } from "./spells";

export type TechniqueTarget =
  | "self"
  | "singleEnemy"
  | "singleAlly"
  | "rowEnemies" // all enemies in one row (player picks front or back)
  | "columnEnemies" // front + back enemy in one column (Impale)
  | "allFrontEnemies"
  | "allEnemies"
  | "allAllies"
  | "allFrontAllies"
  | "randomEnemies";

export type TechniqueEffect =
  | { kind: "damage"; multiplier: number; armorPen?: number; element?: DamageElement }
  | { kind: "multiHit"; hits: number; multiplier: number; randomTarget?: boolean; critChanceBonus?: number }
  | {
      kind: "damageWithStatus";
      multiplier: number;
      status: "paralysis" | "poison" | "slow";
      statusChance: number;
      statusDuration?: number;
    }
  | { kind: "damageWithExecute"; multiplier: number; executeThreshold: number; undeadOnly?: boolean }
  | {
      kind: "buff";
      stat: "armor";
      power: number;
      duration: number;
      target: "self" | "allAllies" | "allFrontAllies";
    }
  | {
      kind: "debuff";
      stat: "armor" | "agi";
      power: number;
      duration: number;
    }
  | { kind: "heal"; power: number }
  | { kind: "counterStance"; multiplier: number }
  | { kind: "taunt"; armorBonus: number; duration: number }
  | {
      kind: "buffNextAttack";
      critChanceBonus: number;
      hitChanceBonus?: number;
      duration: number;
    }
  | { kind: "rageGrant"; amount: number }
  | { kind: "damageBuff"; multiplier: number; duration: number; target: "self" | "allAllies" };

export interface TechniqueDef {
  id: string;
  name: string;
  class: CharacterClass;
  level: number; // level at which the technique is learned
  rageCost: number;
  target: TechniqueTarget;
  effect: TechniqueEffect;
  description: string;
}

// ---------------------------------------------------------------------------
// Fighter — "War Techniques"
// Identity: frontline tank-brute. Raw damage, aggro control, front-row AoE.
// ---------------------------------------------------------------------------

const FIGHTER_TECHNIQUES: TechniqueDef[] = [
  {
    id: "fighter-power-attack",
    name: "Power Attack",
    class: "Fighter",
    level: 1,
    rageCost: 5,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 2 },
    description: "A devastating overhead blow that sacrifices finesse for raw power.",
  },
  {
    id: "fighter-shield-bash",
    name: "Shield Bash",
    class: "Fighter",
    level: 3,
    rageCost: 8,
    target: "singleEnemy",
    effect: { kind: "damageWithStatus", multiplier: 1, status: "paralysis", statusChance: 0.25, statusDuration: 1 },
    description: "Slam the shield into a foe, potentially stunning them senseless.",
  },
  {
    id: "fighter-taunt",
    name: "Taunt",
    class: "Fighter",
    level: 5,
    rageCost: 3,
    target: "self",
    effect: { kind: "taunt", armorBonus: 3, duration: 2 },
    description: "Draw the enemy's attention with a battle challenge. Forces enemies to target you next round and bolsters your armor.",
  },
  {
    id: "fighter-whirlwind",
    name: "Whirlwind",
    class: "Fighter",
    level: 7,
    rageCost: 15,
    target: "allFrontEnemies",
    effect: { kind: "damage", multiplier: 1.5 },
    description: "A spinning strike that hits every adjacent foe in the front row.",
  },
  {
    id: "fighter-crushing-blow",
    name: "Crushing Blow",
    class: "Fighter",
    level: 10,
    rageCost: 20,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 3, armorPen: 0.5 },
    description: "A massive overhead strike that shatters armor and bone alike. Ignores 50% of enemy AC.",
  },
  {
    id: "fighter-battle-cry",
    name: "Battle Cry",
    class: "Fighter",
    level: 12,
    rageCost: 25,
    target: "allAllies",
    effect: { kind: "rageGrant", amount: 3 },
    description: "A rallying shout that fills allies with fury, granting them rage and inspiring them to fight harder.",
  },
];

// ---------------------------------------------------------------------------
// Thief — "Shadow Arts"
// Identity: opportunistic striker. Crits, status, execute, hide synergy.
// ---------------------------------------------------------------------------

const THIEF_TECHNIQUES: TechniqueDef[] = [
  {
    id: "thief-quick-slash",
    name: "Quick Slash",
    class: "Thief",
    level: 1,
    rageCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 1.5 },
    description: "A fast cut that finds the gap in a foe's guard. Enhanced critical hit chance.",
  },
  {
    id: "thief-feint",
    name: "Feint",
    class: "Thief",
    level: 3,
    rageCost: 5,
    target: "self",
    effect: { kind: "buffNextAttack", critChanceBonus: 0.25, hitChanceBonus: 1.0, duration: 1 },
    description: "Fake out the enemy, leaving them open to a devastating follow-up. Your next attack cannot miss and has boosted crit chance.",
  },
  {
    id: "thief-poison-blade",
    name: "Poison Blade",
    class: "Thief",
    level: 5,
    rageCost: 8,
    target: "singleEnemy",
    effect: { kind: "damageWithStatus", multiplier: 1, status: "poison", statusChance: 1.0, statusDuration: 3 },
    description: "Coat the blade with venom before striking. Always poisons the target.",
  },
  {
    id: "thief-caltrops",
    name: "Caltrops",
    class: "Thief",
    level: 7,
    rageCost: 12,
    target: "allEnemies",
    effect: { kind: "damageWithStatus", multiplier: 1, status: "slow", statusChance: 0.15, statusDuration: 2 },
    description: "Scatter spikes beneath the enemy formation, slowing those who tread on them.",
  },
  {
    id: "thief-throat-slash",
    name: "Throat Slash",
    class: "Thief",
    level: 10,
    rageCost: 20,
    target: "singleEnemy",
    effect: { kind: "damageWithExecute", multiplier: 3, executeThreshold: 0.3 },
    description: "Finish a wounded foe before they can recover. Deals massive damage, and instantly slays enemies below 30% HP.",
  },
  {
    id: "thief-shadow-strike",
    name: "Shadow Strike",
    class: "Thief",
    level: 12,
    rageCost: 25,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 2, armorPen: 1.0 },
    description: "The ultimate backstab — only usable from Hide. Auto-crits with double crit multiplier and ignores all AC.",
  },
];

// ---------------------------------------------------------------------------
// Halberdier — "Polearm Techniques"
// Identity: reach specialist + formation controller. Row/column AoE, counters.
// ---------------------------------------------------------------------------

const HALBERDIER_TECHNIQUES: TechniqueDef[] = [
  {
    id: "halberdier-sweep",
    name: "Sweep",
    class: "Halberdier",
    level: 1,
    rageCost: 5,
    target: "rowEnemies",
    effect: { kind: "damage", multiplier: 1 },
    description: "A wide arc with the polearm that strikes every enemy in a row.",
  },
  {
    id: "halberdier-brace",
    name: "Brace",
    class: "Halberdier",
    level: 3,
    rageCost: 3,
    target: "self",
    effect: { kind: "counterStance", multiplier: 0.5 },
    description: "Plant the haft and prepare to receive a charge. The next melee attack against you is reflected at half damage.",
  },
  {
    id: "halberdier-impale",
    name: "Impale",
    class: "Halberdier",
    level: 5,
    rageCost: 10,
    target: "columnEnemies",
    effect: { kind: "damage", multiplier: 2 },
    description: "Drive the spear through two enemies at once, hitting both front and back row in one column.",
  },
  {
    id: "halberdier-pike-wall",
    name: "Pike Wall",
    class: "Halberdier",
    level: 7,
    rageCost: 15,
    target: "allFrontAllies",
    effect: { kind: "buff", stat: "armor", power: 2, duration: 2, target: "allFrontAllies" },
    description: "Form a defensive spear line that turns aside attacks. All front-row allies gain armor.",
  },
  {
    id: "halberdier-pole-vault",
    name: "Pole Vault",
    class: "Halberdier",
    level: 10,
    rageCost: 20,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 2.5 },
    description: "Leap over the front line to strike a distant foe. Ignores all range penalties regardless of weapon or position.",
  },
  {
    id: "halberdier-phalanx-break",
    name: "Phalanx Break",
    class: "Halberdier",
    level: 12,
    rageCost: 25,
    target: "rowEnemies",
    effect: { kind: "damageWithStatus", multiplier: 3, status: "paralysis", statusChance: 0.25, statusDuration: 1 },
    description: "Shatter the enemy formation with overwhelming force. Hits every enemy in a row and may stun them.",
  },
];

// ---------------------------------------------------------------------------
// Duelist — "Blade Forms"
// Identity: precision fighter. Multi-hit, crits, counter-attacks, AC debuff.
// ---------------------------------------------------------------------------

const DUELIST_TECHNIQUES: TechniqueDef[] = [
  {
    id: "duelist-lunge",
    name: "Lunge",
    class: "Duelist",
    level: 1,
    rageCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 1.5 },
    description: "A quick forward thrust that closes distance instantly. Reaches any row and has enhanced hit chance.",
  },
  {
    id: "duelist-riposte",
    name: "Riposte",
    class: "Duelist",
    level: 3,
    rageCost: 5,
    target: "self",
    effect: { kind: "counterStance", multiplier: 1.5 },
    description: "Ready the blade to punish any who dare attack. The next enemy attack against you triggers a free counter at 1.5x damage.",
  },
  {
    id: "duelist-flurry",
    name: "Flurry",
    class: "Duelist",
    level: 5,
    rageCost: 10,
    target: "singleEnemy",
    effect: { kind: "multiHit", hits: 3, multiplier: 0.75 },
    description: "A barrage of rapid strikes that overwhelms defenses. Three hits at reduced damage each.",
  },
  {
    id: "duelist-disarm",
    name: "Disarm",
    class: "Duelist",
    level: 7,
    rageCost: 12,
    target: "singleEnemy",
    effect: { kind: "debuff", stat: "armor", power: 2, duration: 3 },
    description: "Strike the enemy's weapon arm, leaving them vulnerable. Reduces enemy AC for several rounds.",
  },
  {
    id: "duelist-perfect-strike",
    name: "Perfect Strike",
    class: "Duelist",
    level: 10,
    rageCost: 20,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 2.5, armorPen: 1.0 },
    description: "The duelist's masterstroke — a single flawless blow that auto-crits and ignores all armor.",
  },
  {
    id: "duelist-blade-storm",
    name: "Blade Storm",
    class: "Duelist",
    level: 12,
    rageCost: 25,
    target: "randomEnemies",
    effect: { kind: "multiHit", hits: 5, multiplier: 1, randomTarget: true, critChanceBonus: 0.05 },
    description: "A whirlwind of steel that strikes everything nearby. Five hits on random enemies, each with growing crit chance.",
  },
];

// ---------------------------------------------------------------------------
// Crusader — "Holy Techniques"
// Identity: hybrid warrior-priest. Divine damage, healing, anti-undead, buffs.
// Uses BOTH rage (techniques) and SP (Priest spells) — dual resource.
// ---------------------------------------------------------------------------

const CRUSADER_TECHNIQUES: TechniqueDef[] = [
  {
    id: "crusader-smite",
    name: "Smite",
    class: "Crusader",
    level: 1,
    rageCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 1.5, element: "divine" },
    description: "Channel divine power into the blade, dealing holy damage to a single foe.",
  },
  {
    id: "crusader-lay-on-hands",
    name: "Lay on Hands",
    class: "Crusader",
    level: 3,
    rageCost: 5,
    target: "singleAlly",
    effect: { kind: "heal", power: 0 },
    description: "Touch an ally to mend their wounds with holy power. Heals for (STR + PIE) × 2 HP.",
  },
  {
    id: "crusader-judgment",
    name: "Judgment",
    class: "Crusader",
    level: 5,
    rageCost: 10,
    target: "singleEnemy",
    effect: { kind: "damage", multiplier: 2, element: "divine" },
    description: "Divine wrath made manifest in steel. Deals divine damage with +50% bonus against undead.",
  },
  {
    id: "crusader-aura-of-protection",
    name: "Aura of Protection",
    class: "Crusader",
    level: 7,
    rageCost: 15,
    target: "allAllies",
    effect: { kind: "buff", stat: "armor", power: 2, duration: 2, target: "allAllies" },
    description: "Project a shield of faith over the entire party. All allies gain armor for 2 rounds.",
  },
  {
    id: "crusader-banishing-strike",
    name: "Banishing Strike",
    class: "Crusader",
    level: 10,
    rageCost: 20,
    target: "singleEnemy",
    effect: { kind: "damageWithExecute", multiplier: 2, executeThreshold: 0.25, undeadOnly: true },
    description: "Send the undead to their final rest. Deals heavy damage, and instantly slays undead enemies below 25% HP.",
  },
  {
    id: "crusader-divine-wrath",
    name: "Divine Wrath",
    class: "Crusader",
    level: 12,
    rageCost: 25,
    target: "allEnemies",
    effect: { kind: "damageWithStatus", multiplier: 2, status: "paralysis", statusChance: 0.25, statusDuration: 1, },
    description: "Heaven's fury unleashed upon the wicked. Divine damage to all enemies with a chance to stun.",
  },
];

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export const ALL_TECHNIQUES: TechniqueDef[] = [
  ...FIGHTER_TECHNIQUES,
  ...THIEF_TECHNIQUES,
  ...HALBERDIER_TECHNIQUES,
  ...DUELIST_TECHNIQUES,
  ...CRUSADER_TECHNIQUES,
];

/** Classes that use the rage/technique system. */
export const TECHNIQUE_CLASSES: CharacterClass[] = [
  "Fighter",
  "Thief",
  "Halberdier",
  "Duelist",
  "Crusader",
];

/** Returns true if the class has access to techniques (i.e. uses rage). */
export function classHasTechniques(cls: CharacterClass): boolean {
  return (TECHNIQUE_CLASSES as readonly string[]).includes(cls);
}

/** All techniques available to a character of the given class and level. */
export function techniquesForClass(cls: CharacterClass, level: number): TechniqueDef[] {
  return ALL_TECHNIQUES.filter((t) => t.class === cls && t.level <= level);
}

/** Look up a technique by id. */
export function techniqueById(id: string): TechniqueDef | undefined {
  return ALL_TECHNIQUES.find((t) => t.id === id);
}

/** Maximum rage for a character of the given level. */
export function maxRageForLevel(level: number): number {
  return 10 + level;
}
