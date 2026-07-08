/**
 * Party creation and character data model.
 *
 * Defines races, alignments, classes, stats, and the Character type,
 * plus pure helper functions for rolling attributes and assembling a
 * 6-character party. Status-effect functions are left as comments for
 * the combat system to wire up later.
 */

export type Race = "Human" | "Elf" | "Dwarf" | "Gnome" | "Hobbit";
export type Alignment = "Good" | "Neutral" | "Evil";
export type CharacterClass = "Fighter" | "Mage" | "Priest" | "Thief" | "Ninja";
export type StatusEffect =
  | "poison"
  | "sleep"
  | "paralysis"
  | "blind"
  | "knockedOut"
  | "hidden"
  | "exposed";

/**
 * Core attributes.
 *
 * STR: melee damage bonus, heavy equipment prereq
 * INT: Mage spell access, spell resistance
 * PIE: Priest spell access, turn undead chance
 * VIT: HP per level, health regeneration rate
 * AGI: initiative, flee chance, hit rate
 * LUK: critical hit, trap avoidance
 */
export interface Stats {
  str: number;
  int: number;
  pie: number;
  vit: number;
  agi: number;
  luk: number;
}

export interface Character {
  id: string; // unique identifier for combat targeting
  name: string;
  race: Race;
  alignment: Alignment;
  class: CharacterClass;
  level: number;
  xp: number; // experience points accumulated
  stats: Stats;
  hp: number;
  sp: number;
  maxHp: number;
  maxSp: number;
  formationSlot: number; // 0-5, where 0-2 are front row and 3-5 are back row
  status: StatusEffect[];
  knownSpellIds: string[]; // spell IDs this character can cast
}

export interface RaceDef {
  id: Race;
  name: string;
  modifiers: Partial<Stats>;
  description: string;
}

export interface ClassDef {
  id: CharacterClass;
  name: string;
  allowedAlignments: Alignment[];
  spellClass: "Mage" | "Priest" | null;
  hpBonus: number;
  description: string;
}

export const RACES: Record<Race, RaceDef> = {
  Human: {
    id: "Human",
    name: "Human",
    modifiers: {},
    description: "Balanced in all things.",
  },
  Elf: {
    id: "Elf",
    name: "Elf",
    modifiers: { int: 2, pie: 2, vit: -2 },
    description: "Keen of mind and spirit, but fragile.",
  },
  Dwarf: {
    id: "Dwarf",
    name: "Dwarf",
    modifiers: { str: 2, vit: 2, agi: -2 },
    description: "Sturdy and strong, if a little slow.",
  },
  Gnome: {
    id: "Gnome",
    name: "Gnome",
    modifiers: { pie: 2, int: 2 },
    description: "Naturally attuned to divine and arcane magic.",
  },
  Hobbit: {
    id: "Hobbit",
    name: "Hobbit",
    modifiers: { luk: 2, agi: 2 },
    description: "Quick and uncannily lucky.",
  },
};

export const ALIGNMENTS: Alignment[] = ["Good", "Neutral", "Evil"];

export const CLASSES: Record<CharacterClass, ClassDef> = {
  Fighter: {
    id: "Fighter",
    name: "Fighter",
    allowedAlignments: ["Good", "Neutral", "Evil"],
    spellClass: null,
    hpBonus: 8,
    description: "Frontline warrior with bonus HP and full armor access.",
  },
  Mage: {
    id: "Mage",
    name: "Mage",
    allowedAlignments: ["Good", "Neutral", "Evil"],
    spellClass: "Mage",
    hpBonus: 0,
    description: "Offensive arcane caster; fragile but destructive.",
  },
  Priest: {
    id: "Priest",
    name: "Priest",
    allowedAlignments: ["Good", "Neutral", "Evil"],
    spellClass: "Priest",
    hpBonus: 2,
    description: "Healer, resurrector, and bane of undead.",
  },
  Thief: {
    id: "Thief",
    name: "Thief",
    allowedAlignments: ["Good", "Neutral", "Evil"],
    spellClass: null,
    hpBonus: 4,
    description: "Trap expert and backstabber; effective from the back row.",
  },
  Ninja: {
    id: "Ninja",
    name: "Ninja",
    allowedAlignments: ["Neutral", "Evil"],
    spellClass: null,
    hpBonus: 5,
    description: "Stealthy assassin who can hide and ambush from the shadows.",
  },
};

/** Minimum value an attribute can have after racial modifiers. */
export const MIN_STAT = 3;
/** Maximum value an attribute can have after racial modifiers. */
export const MAX_STAT = 18;

/** Roll one fair six-sided die. */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Roll 3d6, the standard attribute roll. */
export function roll3d6(): number {
  return rollD6() + rollD6() + rollD6();
}

/** Roll a fresh 3d6 stat block with no modifiers applied. */
export function rollBaseStats(): Stats {
  return {
    str: roll3d6(),
    int: roll3d6(),
    pie: roll3d6(),
    vit: roll3d6(),
    agi: roll3d6(),
    luk: roll3d6(),
  };
}

/** Clamp a stat to the legal [MIN_STAT, MAX_STAT] range. */
export function clampStat(value: number): number {
  return Math.max(MIN_STAT, Math.min(MAX_STAT, value));
}

/** Apply racial modifiers to a base stat block and clamp each result. */
export function applyRacialModifiers(base: Stats, race: Race): Stats {
  const mods = RACES[race].modifiers;
  return {
    str: clampStat(base.str + (mods.str ?? 0)),
    int: clampStat(base.int + (mods.int ?? 0)),
    pie: clampStat(base.pie + (mods.pie ?? 0)),
    vit: clampStat(base.vit + (mods.vit ?? 0)),
    agi: clampStat(base.agi + (mods.agi ?? 0)),
    luk: clampStat(base.luk + (mods.luk ?? 0)),
  };
}

/** Roll a complete stat block for a race. */
export function rollStatsForRace(race: Race): Stats {
  return applyRacialModifiers(rollBaseStats(), race);
}

/** Compute maximum HP for a level 1 character. VIT drives the base; Fighter adds a bonus. */
export function computeMaxHp(stats: Stats, cls: CharacterClass): number {
  return stats.vit * 2 + CLASSES[cls].hpBonus;
}

/** Compute maximum SP for a level 1 character based on their spellcasting stat. */
export function computeMaxSp(stats: Stats, cls: CharacterClass): number {
  const spellClass = CLASSES[cls].spellClass;
  if (spellClass === "Mage") return stats.int * 2;
  if (spellClass === "Priest") return stats.pie * 2;
  return 0;
}

/** Build a level 1 character from the chosen race, alignment, class, and name. */
export function createCharacter(
  id: string,
  name: string,
  race: Race,
  alignment: Alignment,
  cls: CharacterClass,
  slot: number
): Character {
  const stats = rollStatsForRace(race);
  const maxHp = computeMaxHp(stats, cls);
  const maxSp = computeMaxSp(stats, cls);

  return {
    id,
    name,
    race,
    alignment,
    class: cls,
    level: 1,
    xp: 0,
    stats,
    hp: maxHp,
    sp: maxSp,
    maxHp,
    maxSp,
    formationSlot: slot,
    status: [],
    knownSpellIds: [],
  };
}

/** Evil characters cannot share a party with Good characters. */
export function isPartyAlignmentValid(party: Character[]): boolean {
  if (party.length === 0) return true;
  const hasGood = party.some((c) => c.alignment === "Good");
  const hasEvil = party.some((c) => c.alignment === "Evil");
  return !(hasGood && hasEvil);
}

/** Return the first empty formation slot, preferring front row then back row. */
export function suggestFormationSlot(party: Character[]): number {
  const used = new Set(party.map((c) => c.formationSlot));
  for (let slot = 0; slot < 6; slot++) {
    if (!used.has(slot)) return slot;
  }
  return -1;
}

/** Assign a new character to the next available slot and add them to the party. */
export function addCharacterToParty(
  party: Character[],
  id: string,
  name: string,
  race: Race,
  alignment: Alignment,
  cls: CharacterClass
): { party: Character[]; error: string | null } {
  if (party.length >= 6) {
    return { party, error: "Party is already full." };
  }

  const nextSlot = suggestFormationSlot(party);
  const candidate = createCharacter(id, name, race, alignment, cls, nextSlot);
  const updated = [...party, candidate];

  if (!isPartyAlignmentValid(updated)) {
    return { party, error: "Evil characters cannot join a Good party." };
  }

  return { party: updated, error: null };
}

/** Return a shallow copy of the party with characters sorted by formation slot. */
export function sortPartyByFormation(party: Character[]): Character[] {
  return [...party].sort((a, b) => a.formationSlot - b.formationSlot);
}

/** True if the character is in the front row (slots 0-2). */
export function isFrontRow(character: Character): boolean {
  return character.formationSlot >= 0 && character.formationSlot <= 2;
}

/** Heal the party to full HP/SP and remove all status effects (including knockedOut). */
export function restoreParty(party: Character[]): Character[] {
  return party.map((c) => ({
    ...c,
    hp: c.maxHp,
    sp: c.maxSp,
    status: [],
  }));
}

/** Revive all knocked-out characters to 1 HP. */
export function reviveKnockedOut(party: Character[]): Character[] {
  return party.map((c) => {
    if (c.status.includes("knockedOut")) {
      return {
        ...c,
        hp: 1,
        status: c.status.filter((s) => s !== "knockedOut"),
      };
    }
    return c;
  });
}

/** Derive a character's combat row from their formation slot (0-2 front, 3-5 back). */
export function charRow(c: Character): "front" | "back" {
  return c.formationSlot <= 2 ? "front" : "back";
}

/**
 * Create a balanced default level-1 party of 6 for the merged game.
 * Used when starting a new game without going through party creation.
 * Spell IDs match the names in data/spells.ts.
 */
export function createDefaultParty(): Character[] {
  const fighter1 = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);
  const fighter2 = createCharacter("c2", "Bram", "Dwarf", "Good", "Fighter", 1);
  const thief = createCharacter("c3", "Coda", "Hobbit", "Neutral", "Thief", 2);
  const mage1 = createCharacter("c4", "Dell", "Elf", "Neutral", "Mage", 3);
  const priest = createCharacter("c5", "Eve", "Gnome", "Good", "Priest", 4);
  const mage2 = createCharacter("c6", "Fenn", "Elf", "Neutral", "Mage", 5);

  // Level-1 casters know all tier-1 spells of their class.
  mage1.knownSpellIds = ["mage-halito", "mage-mogref"];
  mage2.knownSpellIds = ["mage-halito", "mage-mogref"];
  priest.knownSpellIds = ["priest-dios", "priest-badialma"];

  return [fighter1, fighter2, thief, mage1, priest, mage2];
}
