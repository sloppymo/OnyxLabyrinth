/**
 * Spell data for all Mage and Priest spells, tiers 1-4.
 *
 * Each spell is a typed constant. The combat system consumes these defs
 * to resolve damage, healing, buffs, disables, and resurrection.
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

export type DamageElement = "fire" | "cold" | "physical" | "undead" | "lightning" | "poison";

export type SpellEffect =
  | { kind: "damage"; element: DamageElement; power: number }
  | { kind: "heal"; power: number }
  | { kind: "buff"; stat: "armor"; power?: number }
  | { kind: "cure"; status: "poison" | "sleep" | "paralysis" | "blind" }
  | { kind: "disable"; status: "sleep" }
  | { kind: "resurrect" }
  | { kind: "magicScreen"; power: number }
  | { kind: "fizzleField"; power: number }
  | { kind: "dispelMagic" }
  | { kind: "summon"; power: number }
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
  {
    id: "mage-pathrend",
    name: "Pathrend",
    class: "Mage",
    tier: 1,
    spCost: 2,
    target: "self",
    effect: { kind: "detect" },
    description: "Reveals the party's exact position and facing in the maze.",
  },
  {
    id: "mage-aerivex",
    name: "Aerivex",
    class: "Mage",
    tier: 4,
    spCost: 8,
    target: "self",
    effect: { kind: "levitation", duration: 30 },
    description: "The party floats above the stone, drifting over chutes and hazards.",
  },
  {
    id: "mage-zornyx",
    name: "Zornyx",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "A gout of flame that burns a single foe.",
  },
  {
    id: "mage-wyrshel",
    name: "Wyrshel",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "self",
    effect: { kind: "buff", stat: "armor" },
    description: "Hardens the caster's skin against physical blows.",
  },
  {
    id: "mage-zornath",
    name: "Zornath",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "fire", power: 8 },
    description: "Showers a group of enemies with embers.",
  },
  {
    id: "mage-somnyx",
    name: "Somnyx",
    class: "Mage",
    tier: 2,
    spCost: 5,
    target: "singleEnemy",
    effect: { kind: "disable", status: "sleep" },
    description: "Lulls a single enemy into magical slumber.",
  },
  {
    id: "mage-zornorum",
    name: "Zornorum",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "An expanding ball of flame that engulfs every enemy.",
  },
  {
    id: "mage-kraelith",
    name: "Kraelith",
    class: "Mage",
    tier: 3,
    spCost: 9,
    target: "groupEnemies",
    effect: { kind: "damage", element: "cold", power: 12 },
    description: "A freezing gust that chills a group of foes.",
  },
  {
    id: "mage-zornyrix",
    name: "Zornyrix",
    class: "Mage",
    tier: 4,
    spCost: 15,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 25 },
    description: "A concentrated inferno that incinerates one target.",
  },
  {
    id: "mage-kraelorum",
    name: "Kraelorum",
    class: "Mage",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "cold", power: 16 },
    description: "A blizzard that blankets the entire enemy formation.",
  },
  {
    id: "mage-velumbra",
    name: "Velumbra",
    class: "Mage",
    tier: 5,
    spCost: 12,
    target: "allAllies",
    effect: { kind: "magicScreen", power: 5 },
    description: "Erects a magic screen that shields the party from spells and breath.",
  },
  {
    id: "mage-fracturis",
    name: "Fracturis",
    class: "Mage",
    tier: 5,
    spCost: 20,
    target: "groupEnemies",
    effect: { kind: "fizzleField", power: 5 },
    description: "Creates a fizzle field around one enemy group, causing their spells to fail.",
  },
  {
    id: "mage-sundrathis",
    name: "Sundrathis",
    class: "Mage",
    tier: 5,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "dispelMagic" },
    description: "Dispels enemy magic screens and fizzle fields while cleansing the party's own fizzle field.",
  },
  {
    id: "mage-mawcallix",
    name: "Mawcallix",
    class: "Mage",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5 },
    description: "Conjures a group of elemental monsters to fight for the party.",
  },
  // Visual-effect test spells
  {
    id: "mage-sparkyx",
    name: "Sparkyx",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 5 },
    description: "A crackling bolt of lightning that strikes one foe.",
  },
  {
    id: "mage-voltis",
    name: "Voltis",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 5 },
    description: "A radiant arc of lightning that sears one foe.",
  },
  {
    id: "mage-vashorum",
    name: "Vashorum",
    class: "Mage",
    tier: 2,
    spCost: 2,
    target: "allEnemies",
    effect: { kind: "damage", element: "lightning", power: 3 },
    description: "A storm of lightning that strikes every enemy.",
  },
  {
    id: "mage-emberik",
    name: "Emberik",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 5 },
    description: "A bright flare that burns one target.",
  },
  {
    id: "mage-flammorum",
    name: "Flammorum",
    class: "Mage",
    tier: 2,
    spCost: 2,
    target: "allEnemies",
    effect: { kind: "damage", element: "fire", power: 3 },
    description: "A field of roaring flame that engulfs every enemy.",
  },
  {
    id: "mage-cinderis",
    name: "Cinderis",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 5 },
    description: "A large flaming projectile that scorches one foe.",
  },
  {
    id: "mage-frostik",
    name: "Frostik",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "cold", power: 5 },
    description: "A glistening shard of ice that pierces one foe.",
  },
  {
    id: "mage-rimeis",
    name: "Rimeis",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "cold", power: 5 },
    description: "A transparent spike of frost that chills one foe.",
  },
  {
    id: "mage-hoarix",
    name: "Hoarix",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "cold", power: 5 },
    description: "A dark, bitter frost that freezes one foe.",
  },
  {
    id: "mage-venomik",
    name: "Venomik",
    class: "Mage",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "poison", power: 5 },
    description: "A venomous bolt that withers one foe.",
  },
  {
    id: "mage-miasmorum",
    name: "Miasmorum",
    class: "Mage",
    tier: 2,
    spCost: 2,
    target: "groupEnemies",
    effect: { kind: "damage", element: "poison", power: 3 },
    description: "A creeping miasma that poisons one enemy group.",
  },
];

export const PRIEST_SPELLS: SpellDef[] = [
  {
    id: "priest-lucenis",
    name: "Lucenis",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "self",
    effect: { kind: "light", duration: 40 },
    description: "A soft magical radiance that holds back darkness zones.",
  },
  {
    id: "priest-aethel",
    name: "Aethel",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "singleAlly",
    effect: { kind: "heal", power: 12 },
    description: "Mends light wounds on one ally.",
  },
  {
    id: "priest-sacrumix",
    name: "Sacrumix",
    class: "Priest",
    tier: 1,
    spCost: 4,
    target: "singleEnemy",
    effect: { kind: "damage", element: "undead", power: 8 },
    description: "Sears a single undead foe with holy light.",
  },
  {
    id: "priest-aethelin",
    name: "Aethelin",
    class: "Priest",
    tier: 2,
    spCost: 6,
    target: "singleAlly",
    effect: { kind: "heal", power: 30 },
    description: "Heals moderate wounds on one ally.",
  },
  {
    id: "priest-purgyx",
    name: "Purgyx",
    class: "Priest",
    tier: 2,
    spCost: 5,
    target: "singleAlly",
    effect: { kind: "cure", status: "poison" },
    description: "Purges poison from a single ally.",
  },
  {
    id: "priest-aethralm",
    name: "Aethralm",
    class: "Priest",
    tier: 3,
    spCost: 10,
    target: "singleAlly",
    effect: { kind: "heal", power: 60 },
    description: "Closes grievous wounds on one ally.",
  },
  {
    id: "priest-wyrathis",
    name: "Wyrathis",
    class: "Priest",
    tier: 3,
    spCost: 9,
    target: "allAllies",
    effect: { kind: "buff", stat: "armor" },
    description: "Bests a protective blessing upon the whole party.",
  },
  {
    id: "priest-reviscant",
    name: "Reviscant",
    class: "Priest",
    tier: 4,
    spCost: 15,
    target: "singleAlly",
    effect: { kind: "resurrect" },
    description: "Returns a fallen ally to life with a sliver of health.",
  },
  {
    id: "priest-solumorum",
    name: "Solumorum",
    class: "Priest",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "undead", power: 18 },
    description: "A wave of sacred force that smites all undead foes.",
  },
  {
    id: "priest-convocix",
    name: "Convocix",
    class: "Priest",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5 },
    description: "Summons a group of monsters from the elemental planes to aid the party.",
  },
  {
    id: "priest-lumenik",
    name: "Lumenik",
    class: "Priest",
    tier: 1,
    spCost: 1,
    target: "singleEnemy",
    effect: { kind: "damage", element: "lightning", power: 5 },
    description: "A holy bolt that smites one foe with light.",
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
