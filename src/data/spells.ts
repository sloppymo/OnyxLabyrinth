/**
 * Spell data for all Mage and Priest spells, tiers 1–7.
 *
 * Each spell is a typed constant. The combat system consumes these defs
 * to resolve damage, healing, buffs, disables, and resurrection.
 * T6–T7 are a small endgame set adapted from the spell-expansion design
 * using existing effect kinds only (no DoT / armor-pen / double-action yet).
 */

export type SpellcasterClass = "Mage" | "Priest";

export type SpellTarget =
  | "self"
  | "singleAlly"
  | "singleEnemy"
  | "groupAllies"
  | "groupEnemies"
  | "allAllies"
  | "allEnemies";

export type DamageElement =
  | "fire"
  | "cold"
  | "physical"
  | "undead"
  | "lightning"
  | "poison"
  | "divine"
  | "water"
  | "earth"
  | "wind";

/**
 * Optional over-time followup attached to a damage or heal effect.
 * DoTs tick on the afflicted enemy and regen ticks on the healed ally at the
 * end of each round for `duration` rounds (combat.ts `tickStatuses`).
 */
export type SpellFollowup =
  | { kind: "dot"; element: DamageElement; power: number; duration: number }
  | { kind: "regen"; power: number; duration: number };

export type SpellEffect =
  | { kind: "damage"; element: DamageElement; power: number; followup?: SpellFollowup }
  | { kind: "heal"; power: number; followup?: SpellFollowup }
  | { kind: "buff"; stat: "armor"; power?: number }
  | { kind: "cure"; status: "poison" | "sleep" | "paralysis" | "blind" }
  | { kind: "disable"; status: "sleep" | "paralysis" }
  | { kind: "resurrect" }
  | { kind: "magicScreen"; power: number }
  | { kind: "fizzleField"; power: number }
  | { kind: "dispelMagic" }
  | { kind: "summon"; power: number; spriteId?: string; allyName?: string }
  // Utility (dungeon-only) effects — cast from the dungeon G menu or camp,
  // resolved by game/persistent-spells.ts, hidden from the combat spell list.
  | { kind: "light"; duration: number }
  | { kind: "levitation"; duration: number }
  | { kind: "detect" };

/** Effect kinds castable only outside combat (dungeon / camp menus). */
export const UTILITY_EFFECT_KINDS = ["light", "levitation", "detect"] as const;

export function isUtilitySpell(spell: SpellDef): boolean {
  return (UTILITY_EFFECT_KINDS as readonly string[]).includes(spell.effect.kind);
}

export interface SpellDef {
  id: string;
  name: string;
  class: SpellcasterClass;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  spCost: number;
  target: SpellTarget;
  effect: SpellEffect;
  description: string;
}

export const MAGE_SPELLS: SpellDef[] = [
  // --- Tier 1 ---
  {
    id: "mage-wayfinder",
    name: "Wayfinder",
    class: "Mage",
    tier: 1,
    spCost: 2,
    target: "self",
    effect: { kind: "detect" },
    description: "Reveals the party's exact position and facing in the maze.",
  },
  {
    id: "mage-fire-bolt",
    name: "Fire Bolt",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "A gout of flame that burns a single foe.",
  },
  {
    id: "mage-arcane-ward",
    name: "Arcane Ward",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "self",
    effect: { kind: "buff", stat: "armor" },
    description: "Hardens the caster's skin against physical blows.",
  },
  {
    id: "mage-spark",
    name: "Spark",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 5 },
    description: "A crackling bolt of lightning that strikes one foe.",
  },
  {
    id: "mage-ember",
    name: "Ember",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 5 },
    description: "A bright flare that burns one target.",
  },
  {
    id: "mage-frostbite",
    name: "Frostbite",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "cold", power: 5 },
    description: "A glistening shard of ice that pierces one foe.",
  },
  {
    id: "mage-poison-spray",
    name: "Poison Spray",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "poison", power: 5 },
    description: "A venomous bolt that withers one foe.",
  },

  // --- Tier 2 ---
  {
    id: "mage-burning-hands",
    name: "Burning Hands",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "fire", power: 8 },
    description: "Showers a group of enemies with embers.",
  },
  {
    id: "mage-sleep",
    name: "Sleep",
    class: "Mage",
    tier: 2,
    spCost: 5,
    target: "singleEnemy",
    effect: { kind: "disable", status: "sleep" },
    description: "Lulls a single enemy into magical slumber.",
  },
  {
    id: "mage-hold-person",
    name: "Hold Person",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "singleEnemy",
    effect: { kind: "disable", status: "paralysis" },
    description: "Freezes a single enemy in place, preventing all action.",
  },
  {
    id: "mage-web",
    name: "Web",
    class: "Mage",
    tier: 2,
    spCost: 7,
    target: "groupEnemies",
    effect: { kind: "disable", status: "paralysis" },
    description: "Envelops an enemy group in sticky strands, paralyzing them.",
  },
  {
    id: "mage-lesser-summon",
    name: "Lesser Summon",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "self",
    effect: { kind: "summon", power: 2, spriteId: "summon-slime", allyName: "Summoned Slime" },
    description: "Calls a small slime to fight at the party's side.",
  },

  // --- Tier 3 ---
  {
    id: "mage-fireball",
    name: "Fireball",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "fire", power: 14 },
    description: "An expanding ball of flame that engulfs every enemy.",
  },
  {
    id: "mage-cone-of-cold",
    name: "Cone of Cold",
    class: "Mage",
    tier: 3,
    spCost: 9,
    target: "groupEnemies",
    effect: { kind: "damage", element: "cold", power: 12 },
    description: "A freezing gust that chills a group of foes.",
  },
  {
    id: "mage-summon-fire-elemental",
    name: "Summon Fire Elemental",
    class: "Mage",
    tier: 3,
    spCost: 14,
    target: "self",
    effect: { kind: "summon", power: 4, spriteId: "summon-fire-elemental", allyName: "Fire Elemental" },
    description: "Calls forth a blazing elemental to fight for the party.",
  },

  // --- Tier 4 ---
  {
    id: "mage-immolate",
    name: "Immolate",
    class: "Mage",
    tier: 4,
    spCost: 15,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 25 },
    description: "A concentrated inferno that incinerates one target.",
  },
  {
    id: "mage-ice-storm",
    name: "Ice Storm",
    class: "Mage",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "cold", power: 16 },
    description: "A blizzard that blankets the entire enemy formation.",
  },
  {
    id: "mage-levitate",
    name: "Levitate",
    class: "Mage",
    tier: 4,
    spCost: 8,
    target: "self",
    effect: { kind: "levitation", duration: 30 },
    description: "The party floats above the stone, drifting over chutes and hazards.",
  },
  {
    id: "mage-power-word-stun",
    name: "Power Word: Stun",
    class: "Mage",
    tier: 4,
    spCost: 18,
    target: "singleEnemy",
    effect: { kind: "disable", status: "paralysis" },
    description: "A word of power that stuns a single foe into immobility.",
  },

  // --- Tier 5 ---
  {
    id: "mage-spell-shield",
    name: "Spell Shield",
    class: "Mage",
    tier: 5,
    spCost: 12,
    target: "allAllies",
    effect: { kind: "magicScreen", power: 5 },
    description: "Erects a magic screen that shields the party from spells and breath.",
  },
  {
    id: "mage-silence",
    name: "Silence",
    class: "Mage",
    tier: 5,
    spCost: 20,
    target: "groupEnemies",
    effect: { kind: "fizzleField", power: 5 },
    description: "Creates a fizzle field around one enemy group, causing their spells to fail.",
  },
  {
    id: "mage-dispel-magic",
    name: "Dispel Magic",
    class: "Mage",
    tier: 5,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "dispelMagic" },
    description: "Dispels enemy magic screens and fizzle fields while cleansing the party's own fizzle field.",
  },
  {
    id: "mage-conjure-elemental",
    name: "Conjure Elemental",
    class: "Mage",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5, spriteId: "summon-elemental", allyName: "Summoned Elemental" },
    description: "Conjures a group of elemental monsters to fight for the party.",
  },
  {
    id: "mage-gate",
    name: "Gate",
    class: "Mage",
    tier: 5,
    spCost: 30,
    target: "self",
    effect: { kind: "summon", power: 8, spriteId: "summon-eldritch-guardian", allyName: "Eldritch Guardian" },
    description: "Tears open a portal to another plane, calling forth a powerful guardian.",
  },

  // --- Tier 6–7 (endgame; design verbs, existing effect kinds) ---
  {
    id: "mage-meteor-swarm",
    name: "Meteor Swarm",
    class: "Mage",
    tier: 6,
    spCost: 30,
    target: "allEnemies",
    effect: {
      kind: "damage",
      element: "fire",
      power: 35,
      followup: { kind: "dot", element: "fire", power: 10, duration: 3 },
    },
    description: "Calls a rain of meteors that scorches every enemy and leaves them burning.",
  },
  {
    id: "mage-disintegrate",
    name: "Disintegrate",
    class: "Mage",
    tier: 6,
    spCost: 22,
    target: "singleEnemy",
    effect: { kind: "damage", element: "physical", power: 50 },
    description: "Unravels a single foe with raw destructive force. Extreme single-target damage.",
  },
  {
    id: "mage-freezing-sphere",
    name: "Freezing Sphere",
    class: "Mage",
    tier: 7,
    spCost: 24,
    target: "allEnemies",
    effect: { kind: "damage", element: "cold", power: 24 },
    description: "Hurls a sphere of absolute cold that freezes the entire enemy line.",
  },

  // --- Water ---
  {
    id: "mage-water-bolt",
    name: "Water Bolt",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "water", power: 5 },
    description: "A pressurized jet of water that slams one foe.",
  },
  {
    id: "mage-tidal-wave",
    name: "Tidal Wave",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "water", power: 8 },
    description: "A crashing wave that washes over a group of enemies.",
  },
  {
    id: "mage-deluge",
    name: "Deluge",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "water", power: 14 },
    description: "A torrential downpour that drenches every enemy.",
  },

  // --- Earth ---
  {
    id: "mage-stone-shard",
    name: "Stone Shard",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "earth", power: 5 },
    description: "A jagged stone spike that impales one target.",
  },
  {
    id: "mage-rock-slide",
    name: "Rock Slide",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "earth", power: 8 },
    description: "Loose boulders tumble down upon an enemy group.",
  },
  {
    id: "mage-quake",
    name: "Quake",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "earth", power: 14 },
    description: "The ground splits and shakes beneath the enemy formation.",
  },

  // --- Wind ---
  {
    id: "mage-gust",
    name: "Gust",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "wind", power: 5 },
    description: "A razor-edged gale that cuts one foe.",
  },
  {
    id: "mage-cyclone",
    name: "Cyclone",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "wind", power: 8 },
    description: "A spinning column of wind tears through an enemy group.",
  },
  {
    id: "mage-tempest",
    name: "Tempest",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "wind", power: 14 },
    description: "Howling storm winds scour the entire enemy line.",
  },
];

export const PRIEST_SPELLS: SpellDef[] = [
  // --- Tier 1 ---
  {
    id: "priest-light",
    name: "Light",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "self",
    effect: { kind: "light", duration: 40 },
    description: "A soft magical radiance that holds back darkness zones.",
  },
  {
    id: "priest-cure-wounds",
    name: "Cure Wounds",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "singleAlly",
    effect: { kind: "heal", power: 12 },
    description: "Mends light wounds on one ally.",
  },
  {
    id: "priest-sacred-flame",
    name: "Sacred Flame",
    class: "Priest",
    tier: 1,
    spCost: 4,
    target: "singleEnemy",
    effect: { kind: "damage", element: "undead", power: 8 },
    description: "Sears a single undead foe with holy light.",
  },
  {
    id: "priest-guiding-bolt",
    name: "Guiding Bolt",
    class: "Priest",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 5 },
    description: "A holy bolt that smites one foe with light.",
  },
  {
    id: "priest-shield-of-faith",
    name: "Shield of Faith",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "singleAlly",
    effect: { kind: "buff", stat: "armor" },
    description: "Shrouds a single ally in a protective aura that turns aside blows.",
  },

  // --- Tier 2 ---
  {
    id: "priest-cure-serious",
    name: "Cure Serious Wounds",
    class: "Priest",
    tier: 2,
    spCost: 6,
    target: "singleAlly",
    effect: { kind: "heal", power: 30 },
    description: "Heals moderate wounds on one ally.",
  },
  {
    id: "priest-neutralize-poison",
    name: "Neutralize Poison",
    class: "Priest",
    tier: 2,
    spCost: 5,
    target: "singleAlly",
    effect: { kind: "cure", status: "poison" },
    description: "Purges poison from a single ally.",
  },
  {
    id: "priest-mass-cure",
    name: "Mass Cure",
    class: "Priest",
    tier: 2,
    spCost: 8,
    target: "allAllies",
    effect: { kind: "heal", power: 15 },
    description: "Washes the entire party in healing light, mending minor wounds.",
  },
  {
    id: "priest-divine-smite",
    name: "Divine Smite",
    class: "Priest",
    tier: 2,
    spCost: 5,
    target: "singleEnemy",
    effect: { kind: "damage", element: "divine", power: 12 },
    description: "Channels divine wrath into a single target, harming living and undead alike.",
  },
  {
    id: "priest-summon-guardian",
    name: "Summon Guardian",
    class: "Priest",
    tier: 2,
    spCost: 7,
    target: "self",
    effect: { kind: "summon", power: 3, spriteId: "summon-holy-guardian", allyName: "Holy Guardian" },
    description: "Calls a suit of holy armor to shield the party in combat.",
  },

  // --- Tier 3 ---
  {
    id: "priest-cure-critical",
    name: "Cure Critical Wounds",
    class: "Priest",
    tier: 3,
    spCost: 10,
    target: "singleAlly",
    effect: { kind: "heal", power: 60 },
    description: "Closes grievous wounds on one ally.",
  },
  {
    id: "priest-bless",
    name: "Bless",
    class: "Priest",
    tier: 3,
    spCost: 9,
    target: "allAllies",
    effect: { kind: "buff", stat: "armor" },
    description: "Bestows a protective blessing upon the whole party.",
  },
  {
    id: "priest-regenerate",
    name: "Regenerate",
    class: "Priest",
    tier: 3,
    spCost: 12,
    target: "singleAlly",
    effect: {
      kind: "heal",
      power: 20,
      followup: { kind: "regen", power: 5, duration: 3 },
    },
    description: "Mends one ally's wounds and leaves them slowly knitting closed.",
  },
  {
    id: "priest-mass-heal",
    name: "Mass Heal",
    class: "Priest",
    tier: 3,
    spCost: 15,
    target: "allAllies",
    effect: { kind: "heal", power: 30 },
    description: "A surge of divine energy that heals moderate wounds across the entire party.",
  },

  // --- Tier 4 ---
  {
    id: "priest-raise-dead",
    name: "Raise Dead",
    class: "Priest",
    tier: 4,
    spCost: 15,
    target: "singleAlly",
    effect: { kind: "resurrect" },
    description: "Returns a fallen ally to life with a sliver of health.",
  },
  {
    id: "priest-sunburst",
    name: "Sunburst",
    class: "Priest",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "undead", power: 18 },
    description: "A wave of sacred force that smites all undead foes.",
  },
  {
    id: "priest-summon-celestial-guardian",
    name: "Summon Celestial Guardian",
    class: "Priest",
    tier: 4,
    spCost: 20,
    target: "self",
    effect: { kind: "summon", power: 6, spriteId: "summon-celestial-guardian", allyName: "Celestial Guardian" },
    description: "Calls a mighty celestial warrior to fight at the party's side.",
  },

  // --- Tier 5 ---
  {
    id: "priest-summon-celestial",
    name: "Summon Celestial",
    class: "Priest",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5, spriteId: "summon-celestial", allyName: "Summoned Celestial" },
    description: "Summons a group of monsters from the elemental planes to aid the party.",
  },
  {
    id: "priest-heal",
    name: "Heal",
    class: "Priest",
    tier: 5,
    spCost: 25,
    target: "singleAlly",
    effect: { kind: "heal", power: 9999 },
    description: "A miracle of healing that fully restores one ally to peak health.",
  },

  // --- Tier 6–7 (endgame; design verbs, existing effect kinds) ---
  {
    id: "priest-mass-regenerate",
    name: "Mass Regenerate",
    class: "Priest",
    tier: 6,
    spCost: 28,
    target: "allAllies",
    effect: {
      kind: "heal",
      power: 45,
      followup: { kind: "regen", power: 8, duration: 3 },
    },
    description: "A sustained miracle that mends the party's wounds and keeps knitting them closed.",
  },
  {
    id: "priest-holy-aura",
    name: "Holy Aura",
    class: "Priest",
    tier: 7,
    spCost: 18,
    target: "allAllies",
    effect: { kind: "buff", stat: "armor", power: 5 },
    description: "Wreaths the party in sacred light, greatly hardening their defenses.",
  },
];

export const ALL_SPELLS: SpellDef[] = [...MAGE_SPELLS, ...PRIEST_SPELLS];

/** Look up a spell by its exact name. */
export function spellByName(name: string): SpellDef | undefined {
  return ALL_SPELLS.find((s) => s.name === name);
}

/** Look up a spell by its id. */
export function spellById(id: string): SpellDef | undefined {
  return ALL_SPELLS.find((s) => s.id === id);
}

/** Return every spell a character class can learn at their current tier range. */
export function spellsForClass(
  cls:
    | "Fighter"
    | "Mage"
    | "Priest"
    | "Thief"
    | "Halberdier"
    | "Duelist"
    | "Crusader",
  maxTier: 1 | 2 | 3 | 4 | 5 | 6 | 7
): SpellDef[] {
  if (cls === "Mage") return MAGE_SPELLS.filter((s) => s.tier <= maxTier);
  if (cls === "Priest" || cls === "Crusader") {
    return PRIEST_SPELLS.filter((s) => s.tier <= maxTier);
  }
  return [];
}

/** Highest tier that has real spell definitions for a casting class (or 0). */
export function maxContentSpellTier(
  cls: "Mage" | "Priest" | "Crusader" | "Fighter" | "Thief" | "Halberdier" | "Duelist"
): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const pool =
    cls === "Mage" ? MAGE_SPELLS : cls === "Priest" || cls === "Crusader" ? PRIEST_SPELLS : [];
  if (pool.length === 0) return 0;
  return Math.max(...pool.map((s) => s.tier)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
