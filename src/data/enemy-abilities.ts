/**
 * Enemy-only active abilities — distinct from the player spell/technique systems.
 *
 * Each ability has:
 *  - an effect (damage, heal, status, buff, debuff, drain, summon, etc.)
 *  - a target pattern (single/group/all, party vs ally side)
 *  - an AI condition that gates when the enemy will consider using it
 *  - a weight for random selection among valid options
 *  - an optional cooldown (turns between uses)
 *  - an element for VFX styling (maps to combat-scene ELEMENT_STYLES)
 *
 * The combat resolver (game/combat.ts) reads these from EnemyDef.abilityIds
 * and integrates them into decideEnemyAction / resolveEnemyAction.
 */

import type { DamageElement } from "./spells";
import type { StatusEffect } from "../game/party";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AbilityTarget =
  | "singleParty"    // one party member
  | "groupParty"     // one row of party
  | "allParty"       // entire party
  | "singleAlly"     // one enemy ally
  | "groupAlly"      // one row of allies
  | "allAlly"        // all allies
  | "self";          // the acting enemy itself

export type AbilityEffect =
  | { kind: "damage"; power: number; element?: DamageElement }
  | { kind: "multiHit"; hits: number; powerPerHit: number; element?: DamageElement }
  | { kind: "heal"; power: number }
  | { kind: "drain"; power: number; element?: DamageElement }   // damage party, heal self
  | { kind: "status"; status: StatusEffect; chance: number; duration?: number }
  | { kind: "buff"; stat: "attack" | "ac"; amount: number; duration: number }
  | { kind: "debuff"; stat: "attack" | "ac"; amount: number; duration: number }
  | { kind: "summon"; enemyId: string; count: number }
  | { kind: "fizzleField"; power: number }   // suppress party spells
  | { kind: "magicScreen"; power: number };  // suppress party spell damage

/** Condition that gates when the AI considers using an ability. */
export type AbilityCondition =
  | { kind: "always" }
  | { kind: "hpBelow"; percent: number }        // self HP below threshold
  | { kind: "hpAbove"; percent: number }        // self HP above threshold
  | { kind: "allyHurt"; percent: number }       // any ally below HP threshold
  | { kind: "noAllyHurt" }                      // no ally is wounded (offensive mode)
  | { kind: "turnInterval"; every: number }     // every Nth turn (1 = every turn)
  | { kind: "minAllies"; count: number }        // at least N allies alive (including self)
  | { kind: "maxAllies"; count: number }        // at most N allies alive (for summoning)
  | { kind: "partyHasStatus"; status: StatusEffect }
  | { kind: "partyMissingStatus"; status: StatusEffect }
  | { kind: "firstTurn" }                       // only on the enemy's first action
  | { kind: "notFirstTurn" };                   // not on the first action

export interface EnemyAbilityDef {
  id: string;
  name: string;
  description: string;
  target: AbilityTarget;
  effect: AbilityEffect;
  condition: AbilityCondition;
  /** Relative weight when multiple abilities are valid (default 1). */
  weight: number;
  /** Turns that must pass before re-use (default 0 = no cooldown). */
  cooldown?: number;
  /** Element for VFX styling — maps to combat-scene ELEMENT_STYLES / SPELL_OVERRIDES. */
  element?: DamageElement;
  /** If true, this ability replaces the enemy's normal attack (no attack roll). */
  replacesAttack?: boolean;
}

// ---------------------------------------------------------------------------
// Ability definitions
// ---------------------------------------------------------------------------
// Organized by thematic group. Each ability is a standalone constant so it
// can be referenced by ID from EnemyDef.abilityIds.

// --- Slime / ooze abilities -------------------------------------------------

const ACID_SPIT: EnemyAbilityDef = {
  id: "acid-spit",
  name: "Acid Spit",
  description: "Hurls corrosive bile at a party member, ignoring armor.",
  target: "singleParty",
  effect: { kind: "damage", power: 4, element: "poison" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "poison",
};

const SPLIT: EnemyAbilityDef = {
  id: "split",
  name: "Split",
  description: "When injured, divides into a smaller copy.",
  target: "self",
  effect: { kind: "summon", enemyId: "slime", count: 1 },
  condition: { kind: "hpBelow", percent: 50 },
  weight: 10,
  cooldown: 3,
  element: "poison",
};

// --- Skeleton / undead abilities --------------------------------------------

const BONE_SHARD: EnemyAbilityDef = {
  id: "bone-shard",
  name: "Bone Shard",
  description: "Launches a jagged shard of bone at a party member.",
  target: "singleParty",
  effect: { kind: "damage", power: 3, element: "physical" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 2,
  element: "physical",
};

const RATTLE: EnemyAbilityDef = {
  id: "rattle",
  name: "Death Rattle",
  description: "A chilling rattle that slows a party member.",
  target: "singleParty",
  effect: { kind: "debuff", stat: "attack", amount: 2, duration: 3 },
  condition: { kind: "notFirstTurn" },
  weight: 1,
  cooldown: 2,
  element: "undead",
};

const ARCHER_VOLLEY: EnemyAbilityDef = {
  id: "archer-volley",
  name: "Arrow Volley",
  description: "Looses arrows at the entire front row.",
  target: "groupParty",
  effect: { kind: "damage", power: 3, element: "physical" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 3,
  cooldown: 2,
  element: "physical",
};

// --- Orc abilities ----------------------------------------------------------

const WAR_CRY: EnemyAbilityDef = {
  id: "war-cry",
  name: "War Cry",
  description: "A bloodthirsty howl that bolsters all allies' attack.",
  target: "allAlly",
  effect: { kind: "buff", stat: "attack", amount: 2, duration: 3 },
  condition: { kind: "firstTurn" },
  weight: 10,
  cooldown: 4,
  element: "physical",
};

const SAVAGE_LUNGE: EnemyAbilityDef = {
  id: "savage-lunge",
  name: "Savage Lunge",
  description: "A reckless double strike against one party member.",
  target: "singleParty",
  effect: { kind: "multiHit", hits: 2, powerPerHit: 3, element: "physical" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  element: "physical",
};

const BERSERK: EnemyAbilityDef = {
  id: "berserk",
  name: "Berserk",
  description: "Enrages when wounded, boosting attack drastically.",
  target: "self",
  effect: { kind: "buff", stat: "attack", amount: 4, duration: 4 },
  condition: { kind: "hpBelow", percent: 40 },
  weight: 10,
  cooldown: 3,
  element: "physical",
};

// --- Construct / golem abilities --------------------------------------------

const STONE_SLAM: EnemyAbilityDef = {
  id: "stone-slam",
  name: "Stone Slam",
  description: "A devastating ground pound hitting the entire party.",
  target: "allParty",
  effect: { kind: "damage", power: 5, element: "earth" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 4,
  cooldown: 2,
  element: "earth",
};

const IRON_FIST: EnemyAbilityDef = {
  id: "iron-fist",
  name: "Iron Fist",
  description: "A crushing blow that ignores armor.",
  target: "singleParty",
  effect: { kind: "damage", power: 7, element: "physical" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  element: "physical",
};

const REPAIR: EnemyAbilityDef = {
  id: "repair",
  name: "Self-Repair",
  description: "Mends its own wounds, restoring HP.",
  target: "self",
  effect: { kind: "heal", power: 10 },
  condition: { kind: "hpBelow", percent: 50 },
  weight: 8,
  cooldown: 3,
  element: "earth",
};

// --- Caster abilities -------------------------------------------------------

const FIRE_BREATH: EnemyAbilityDef = {
  id: "fire-breath",
  name: "Fire Breath",
  description: "Cone of fire scorching the entire party.",
  target: "allParty",
  effect: { kind: "damage", power: 5, element: "fire" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 4,
  cooldown: 2,
  element: "fire",
};

const ICE_SHARDS: EnemyAbilityDef = {
  id: "ice-shards",
  name: "Ice Shards",
  description: "A volley of jagged ice hitting the party.",
  target: "groupParty",
  effect: { kind: "damage", power: 4, element: "cold" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "cold",
};

const LIGHTNING_STRIKE: EnemyAbilityDef = {
  id: "lightning-strike",
  name: "Lightning Strike",
  description: "Call down a bolt of lightning on a party member.",
  target: "singleParty",
  effect: { kind: "damage", power: 8, element: "lightning" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 4,
  cooldown: 1,
  element: "lightning",
};

const DARK_PULSE: EnemyAbilityDef = {
  id: "dark-pulse",
  name: "Dark Pulse",
  description: "A wave of necrotic energy draining the party.",
  target: "allParty",
  effect: { kind: "drain", power: 4, element: "undead" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 3,
  cooldown: 2,
  element: "undead",
};

const MASS_HEAL: EnemyAbilityDef = {
  id: "mass-heal-ability",
  name: "Mass Mend",
  description: "Heals all allies for a modest amount.",
  target: "allAlly",
  effect: { kind: "heal", power: 6 },
  condition: { kind: "allyHurt", percent: 60 },
  weight: 8,
  cooldown: 2,
  element: "divine",
};

const CURSE: EnemyAbilityDef = {
  id: "curse",
  name: "Curse",
  description: "Hexes a party member, lowering their attack.",
  target: "singleParty",
  effect: { kind: "debuff", stat: "attack", amount: 3, duration: 3 },
  condition: { kind: "notFirstTurn" },
  weight: 2,
  cooldown: 2,
  element: "undead",
};

const BLINDING_GAZE: EnemyAbilityDef = {
  id: "blinding-gaze",
  name: "Blinding Gaze",
  description: "Stares down a party member, blinding them.",
  target: "singleParty",
  effect: { kind: "status", status: "blind", chance: 0.7, duration: 3 },
  condition: { kind: "partyMissingStatus", status: "blind" },
  weight: 5,
  cooldown: 2,
  element: "undead",
};

const ANTI_MAGIC_FIELD: EnemyAbilityDef = {
  id: "anti-magic-field",
  name: "Anti-Magic Field",
  description: "Raises a field that suppresses party spellcasting.",
  target: "self",
  effect: { kind: "fizzleField", power: 3 },
  condition: { kind: "firstTurn" },
  weight: 10,
  cooldown: 4,
  element: "divine",
};

const WARD: EnemyAbilityDef = {
  id: "ward",
  name: "Ward",
  description: "Raises a magic screen to halve incoming spell damage.",
  target: "self",
  effect: { kind: "magicScreen", power: 3 },
  condition: { kind: "firstTurn" },
  weight: 8,
  cooldown: 4,
  element: "divine",
};

// --- Beast / predator abilities ---------------------------------------------

const HUNTING_POUNCE: EnemyAbilityDef = {
  id: "hunting-pounce",
  name: "Hunting Pounce",
  description: "Leaps at a party member with a feral double strike.",
  target: "singleParty",
  effect: { kind: "multiHit", hits: 2, powerPerHit: 4, element: "physical" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 4,
  element: "physical",
};

const HOWL: EnemyAbilityDef = {
  id: "howl",
  name: "Howl",
  description: "A terrifying howl that may paralyze a party member.",
  target: "singleParty",
  effect: { kind: "status", status: "paralysis", chance: 0.4, duration: 2 },
  condition: { kind: "turnInterval", every: 3 },
  weight: 3,
  cooldown: 2,
  element: "physical",
};

const RENDING_CLAW: EnemyAbilityDef = {
  id: "rending-claw",
  name: "Rending Claw",
  description: "Tears at a party member, inflicting bleed (poison).",
  target: "singleParty",
  effect: { kind: "status", status: "poison", chance: 0.8, duration: 3 },
  condition: { kind: "partyMissingStatus", status: "poison" },
  weight: 3,
  cooldown: 1,
  element: "physical",
};

// --- Demon abilities --------------------------------------------------------

const HELLFIRE: EnemyAbilityDef = {
  id: "hellfire",
  name: "Hellfire",
  description: "Engulfs the entire party in demonic flames.",
  target: "allParty",
  effect: { kind: "damage", power: 6, element: "fire" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 4,
  cooldown: 2,
  element: "fire",
};

const SOUL_DRAIN: EnemyAbilityDef = {
  id: "soul-drain",
  name: "Soul Drain",
  description: "Drains life from a party member, healing itself.",
  target: "singleParty",
  effect: { kind: "drain", power: 6, element: "undead" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "undead",
};

const SUMMON_IMP: EnemyAbilityDef = {
  id: "summon-imp",
  name: "Summon Imp",
  description: "Calls forth a lesser demon ally.",
  target: "self",
  effect: { kind: "summon", enemyId: "demon-spawn", count: 1 },
  condition: { kind: "maxAllies", count: 3 },
  weight: 6,
  cooldown: 3,
  element: "fire",
};

const CHAOS_BOLT: EnemyAbilityDef = {
  id: "chaos-bolt",
  name: "Chaos Bolt",
  description: "A bolt of raw chaos striking a party member.",
  target: "singleParty",
  effect: { kind: "damage", power: 7, element: "undead" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "undead",
};

const SEDUCTION: EnemyAbilityDef = {
  id: "seduction",
  name: "Seduction",
  description: "Charms a party member into inaction (sleep).",
  target: "singleParty",
  effect: { kind: "status", status: "sleep", chance: 0.5, duration: 2 },
  condition: { kind: "partyMissingStatus", status: "sleep" },
  weight: 4,
  cooldown: 2,
  element: "undead",
};

// --- Boss abilities ---------------------------------------------------------

const ECHO_OF_SILENCE: EnemyAbilityDef = {
  id: "echo-of-silence",
  name: "Echo of Silence",
  description: "The Headmaster's Echo silences the entire party.",
  target: "allParty",
  effect: { kind: "status", status: "blind", chance: 0.5, duration: 2 },
  condition: { kind: "turnInterval", every: 3 },
  weight: 6,
  cooldown: 2,
  element: "undead",
};

const MEMORY_DRAIN: EnemyAbilityDef = {
  id: "memory-drain",
  name: "Memory Drain",
  description: "Drains the memories of the entire party, healing the Echo.",
  target: "allParty",
  effect: { kind: "drain", power: 6, element: "undead" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 5,
  cooldown: 2,
  element: "undead",
};

const FORGE_BELLOWS: EnemyAbilityDef = {
  id: "forge-bellows",
  name: "Forge Bellows",
  description: "Stokes the forge, boosting all allies' attack.",
  target: "allAlly",
  effect: { kind: "buff", stat: "attack", amount: 3, duration: 3 },
  condition: { kind: "firstTurn" },
  weight: 10,
  cooldown: 4,
  element: "fire",
};

const MAGMA_BURST: EnemyAbilityDef = {
  id: "magma-burst",
  name: "Magma Burst",
  description: "Erupts with molten rock, damaging the entire party.",
  target: "allParty",
  effect: { kind: "damage", power: 8, element: "fire" },
  condition: { kind: "hpBelow", percent: 50 },
  weight: 8,
  cooldown: 2,
  element: "fire",
};

// --- Knight / armored abilities ---------------------------------------------

const SHIELD_BASH: EnemyAbilityDef = {
  id: "shield-bash",
  name: "Shield Bash",
  description: "Bashes a party member with its shield, possibly stunning.",
  target: "singleParty",
  effect: { kind: "status", status: "paralysis", chance: 0.3, duration: 1 },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "physical",
};

const PHALANX_GUARD: EnemyAbilityDef = {
  id: "phalanx-guard",
  name: "Phalanx Guard",
  description: "Raises defenses, boosting AC for all allies.",
  target: "allAlly",
  effect: { kind: "buff", stat: "ac", amount: 3, duration: 3 },
  condition: { kind: "firstTurn" },
  weight: 8,
  cooldown: 4,
  element: "physical",
};

const CHARGE: EnemyAbilityDef = {
  id: "charge",
  name: "Charge",
  description: "A devastating charge hitting the front row.",
  target: "groupParty",
  effect: { kind: "damage", power: 6, element: "physical" },
  condition: { kind: "turnInterval", every: 3 },
  weight: 4,
  cooldown: 2,
  element: "physical",
};

// --- Wraith / spirit abilities ----------------------------------------------

const PHASE_SHIFT: EnemyAbilityDef = {
  id: "phase-shift",
  name: "Phase Shift",
  description: "Becomes incorporeal, boosting evasion temporarily.",
  target: "self",
  effect: { kind: "buff", stat: "ac", amount: 4, duration: 2 },
  condition: { kind: "hpBelow", percent: 60 },
  weight: 6,
  cooldown: 2,
  element: "undead",
};

const LIFE_TAP: EnemyAbilityDef = {
  id: "life-tap",
  name: "Life Tap",
  description: "Siphons life from a party member.",
  target: "singleParty",
  effect: { kind: "drain", power: 5, element: "undead" },
  condition: { kind: "turnInterval", every: 2 },
  weight: 3,
  cooldown: 1,
  element: "undead",
};

const GHOSTLY_WAIL: EnemyAbilityDef = {
  id: "ghostly-wail",
  name: "Ghostly Wail",
  description: "A spectral wail that may sleep the entire party.",
  target: "allParty",
  effect: { kind: "status", status: "sleep", chance: 0.3, duration: 2 },
  condition: { kind: "turnInterval", every: 4 },
  weight: 5,
  cooldown: 3,
  element: "undead",
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ALL_ENEMY_ABILITIES: EnemyAbilityDef[] = [
  ACID_SPIT,
  SPLIT,
  BONE_SHARD,
  RATTLE,
  ARCHER_VOLLEY,
  WAR_CRY,
  SAVAGE_LUNGE,
  BERSERK,
  STONE_SLAM,
  IRON_FIST,
  REPAIR,
  FIRE_BREATH,
  ICE_SHARDS,
  LIGHTNING_STRIKE,
  DARK_PULSE,
  MASS_HEAL,
  CURSE,
  BLINDING_GAZE,
  ANTI_MAGIC_FIELD,
  WARD,
  HUNTING_POUNCE,
  HOWL,
  RENDING_CLAW,
  HELLFIRE,
  SOUL_DRAIN,
  SUMMON_IMP,
  CHAOS_BOLT,
  SEDUCTION,
  ECHO_OF_SILENCE,
  MEMORY_DRAIN,
  FORGE_BELLOWS,
  MAGMA_BURST,
  SHIELD_BASH,
  PHALANX_GUARD,
  CHARGE,
  PHASE_SHIFT,
  LIFE_TAP,
  GHOSTLY_WAIL,
];

export const ENEMY_ABILITIES_BY_ID: Record<string, EnemyAbilityDef> =
  Object.fromEntries(ALL_ENEMY_ABILITIES.map((a) => [a.id, a]));

export function enemyAbilityById(id: string): EnemyAbilityDef | undefined {
  return ENEMY_ABILITIES_BY_ID[id];
}
