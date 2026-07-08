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

export type DamageElement = "fire" | "cold" | "physical" | "undead";

export type SpellEffect =
  | { kind: "damage"; element: DamageElement; power: number }
  | { kind: "heal"; power: number }
  | { kind: "buff"; stat: "armor" }
  | { kind: "cure"; status: "poison" | "sleep" | "paralysis" | "blind" }
  | { kind: "disable"; status: "sleep" }
  | { kind: "resurrect" }
  | { kind: "magicScreen"; power: number }
  | { kind: "fizzleField"; power: number }
  | { kind: "dispelMagic" }
  | { kind: "summon"; power: number };

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
    id: "mage-halito",
    name: "Halito",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "A gout of flame that burns a single foe.",
  },
  {
    id: "mage-mogref",
    name: "Mogref",
    class: "Mage",
    tier: 1,
    spCost: 3,
    target: "self",
    effect: { kind: "buff", stat: "armor" },
    description: "Hardens the caster's skin against physical blows.",
  },
  {
    id: "mage-melito",
    name: "Melito",
    class: "Mage",
    tier: 2,
    spCost: 6,
    target: "groupEnemies",
    effect: { kind: "damage", element: "fire", power: 8 },
    description: "Showers a group of enemies with embers.",
  },
  {
    id: "mage-katino",
    name: "Katino",
    class: "Mage",
    tier: 2,
    spCost: 5,
    target: "singleEnemy",
    effect: { kind: "disable", status: "sleep" },
    description: "Lulls a single enemy into magical slumber.",
  },
  {
    id: "mage-mahalito",
    name: "Mahalito",
    class: "Mage",
    tier: 3,
    spCost: 10,
    target: "allEnemies",
    effect: { kind: "damage", element: "fire", power: 10 },
    description: "An expanding ball of flame that engulfs every enemy.",
  },
  {
    id: "mage-molito",
    name: "Molito",
    class: "Mage",
    tier: 3,
    spCost: 9,
    target: "groupEnemies",
    effect: { kind: "damage", element: "cold", power: 12 },
    description: "A freezing gust that chills a group of foes.",
  },
  {
    id: "mage-lahalito",
    name: "Lahalito",
    class: "Mage",
    tier: 4,
    spCost: 15,
    target: "singleEnemy",
    effect: { kind: "damage", element: "fire", power: 25 },
    description: "A concentrated inferno that incinerates one target.",
  },
  {
    id: "mage-madalto",
    name: "Madalto",
    class: "Mage",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "cold", power: 16 },
    description: "A blizzard that blankets the entire enemy formation.",
  },
  {
    id: "mage-cortu",
    name: "Cortu",
    class: "Mage",
    tier: 3,
    spCost: 12,
    target: "allAllies",
    effect: { kind: "magicScreen", power: 5 },
    description: "Erects a magic screen that shields the party from spells and breath.",
  },
  {
    id: "mage-bacortu",
    name: "Bacortu",
    class: "Mage",
    tier: 5,
    spCost: 20,
    target: "groupEnemies",
    effect: { kind: "fizzleField", power: 5 },
    description: "Creates a fizzle field around one enemy group, causing their spells to fail.",
  },
  {
    id: "mage-palios",
    name: "Palios",
    class: "Mage",
    tier: 5,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "dispelMagic" },
    description: "Dispels enemy magic screens and fizzle fields while cleansing the party's own fizzle field.",
  },
  {
    id: "mage-socordi",
    name: "Socordi",
    class: "Mage",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5 },
    description: "Conjures a group of elemental monsters to fight for the party.",
  },
];

export const PRIEST_SPELLS: SpellDef[] = [
  {
    id: "priest-dios",
    name: "Dios",
    class: "Priest",
    tier: 1,
    spCost: 3,
    target: "singleAlly",
    effect: { kind: "heal", power: 12 },
    description: "Mends light wounds on one ally.",
  },
  {
    id: "priest-badialma",
    name: "Badialma",
    class: "Priest",
    tier: 1,
    spCost: 4,
    target: "singleEnemy",
    effect: { kind: "damage", element: "undead", power: 8 },
    description: "Sears a single undead foe with holy light.",
  },
  {
    id: "priest-dial",
    name: "Dial",
    class: "Priest",
    tier: 2,
    spCost: 6,
    target: "singleAlly",
    effect: { kind: "heal", power: 30 },
    description: "Heals moderate wounds on one ally.",
  },
  {
    id: "priest-latumofis",
    name: "Latumofis",
    class: "Priest",
    tier: 2,
    spCost: 5,
    target: "singleAlly",
    effect: { kind: "cure", status: "poison" },
    description: "Purges poison from a single ally.",
  },
  {
    id: "priest-dialma",
    name: "Dialma",
    class: "Priest",
    tier: 3,
    spCost: 10,
    target: "singleAlly",
    effect: { kind: "heal", power: 60 },
    description: "Closes grievous wounds on one ally.",
  },
  {
    id: "priest-bamatu",
    name: "Bamatu",
    class: "Priest",
    tier: 3,
    spCost: 9,
    target: "allAllies",
    effect: { kind: "buff", stat: "armor" },
    description: "Bests a protective blessing upon the whole party.",
  },
  {
    id: "priest-di",
    name: "Di",
    class: "Priest",
    tier: 4,
    spCost: 15,
    target: "singleAlly",
    effect: { kind: "resurrect" },
    description: "Returns a fallen ally to life with a sliver of health.",
  },
  {
    id: "priest-lorto",
    name: "Lorto",
    class: "Priest",
    tier: 4,
    spCost: 18,
    target: "allEnemies",
    effect: { kind: "damage", element: "undead", power: 18 },
    description: "A wave of sacred force that smites all undead foes.",
  },
  {
    id: "priest-bamordi",
    name: "Bamordi",
    class: "Priest",
    tier: 5,
    spCost: 25,
    target: "allAllies",
    effect: { kind: "summon", power: 5 },
    description: "Summons a group of monsters from the elemental planes to aid the party.",
  },
];

export const ALL_SPELLS: SpellDef[] = [...MAGE_SPELLS, ...PRIEST_SPELLS];

/** Look up a spell by its exact name. */
export function spellByName(name: string): SpellDef | undefined {
  return ALL_SPELLS.find((s) => s.name === name);
}

/** Return every spell a character class can learn at their current tier range. */
export function spellsForClass(
  cls: "Fighter" | "Mage" | "Priest" | "Thief" | "Ninja",
  maxTier: 1 | 2 | 3 | 4 | 5 | 6 | 7
): SpellDef[] {
  if (cls === "Mage") return MAGE_SPELLS.filter((s) => s.tier <= maxTier);
  if (cls === "Priest") return PRIEST_SPELLS.filter((s) => s.tier <= maxTier);
  return [];
}
