/**
 * Bestiary and encounter tables for the three-floor campaign
 * (1: The Flooded Crypt, 2: The Cursed Library, 3: The Forge of Ashes).
 *
 * Each enemy is a typed constant with floor assignments, row preference,
 * combat stats, and special-behavior flags. Encounter tables describe
 * possible formations per floor so the combat resolver can spawn fights
 * without hardcoding logic. Enemies with an empty `floors` array stay in
 * the bestiary (sprites/tests/tools) but are out of the encounter rotation.
 */

import type { DamageElement } from "./spells";

export type Row = "front" | "back";

export type EnemySpecial =
  | { kind: "flying" }
  | { kind: "resistPhysical"; percent: number }
  | { kind: "healer"; spellName: string }
  | { kind: "caster"; element: DamageElement }
  | { kind: "undead" }
  | { kind: "silenceRandom"; target: "party"; duration: "combat" }
  | { kind: "slowGroup" }
  | { kind: "evasive" }
  | { kind: "highDefense" }
  | { kind: "poisonOnHit" };

export interface EnemyDef {
  id: string;
  name: string;
  floors: number[];
  rowPreference: Row | "any";
  hp: number;
  attack: number; // base physical damage; combat.ts adds variance
  ac: number; // armor class / damage reduction
  agi: number; // initiative
  xp: number;
  gold: number; // gold dropped on defeat
  special: EnemySpecial[];
  isBoss: boolean;
}

export interface EnemySpawn {
  enemyId: string;
  row: Row;
}

export interface EncounterEntry {
  weight: number;
  spawns: EnemySpawn[];
}

// Floor 1: The Flooded Crypt — slimes, shambling dead, and things in the water.
export const TRAINING_DUMMY: EnemyDef = {
  id: "training-dummy",
  name: "Training Dummy",
  floors: [],
  rowPreference: "front",
  hp: 5,
  attack: 1,
  ac: 0,
  agi: 1,
  xp: 2,
  gold: 1,
  special: [],
  isBoss: false,
};

export const SLIME: EnemyDef = {
  id: "slime",
  name: "Slime",
  floors: [1],
  rowPreference: "front",
  hp: 8,
  attack: 3,
  ac: 2,
  agi: 5,
  xp: 6,
  gold: 3,
  special: [],
  isBoss: false,
};

export const SKELETON: EnemyDef = {
  id: "skeleton",
  name: "Skeleton",
  floors: [1],
  rowPreference: "any",
  hp: 6,
  attack: 2,
  ac: 1,
  agi: 8,
  xp: 5,
  gold: 2,
  special: [],
  isBoss: false,
};

// Floor 2: The Cursed Library — armored dead, orc scavengers, cursed scribes.
export const ARMORED_SKELETON: EnemyDef = {
  id: "armored-skeleton",
  name: "Armored Skeleton",
  floors: [2],
  rowPreference: "front",
  hp: 12,
  attack: 5,
  ac: 3,
  agi: 4,
  xp: 10,
  gold: 8,
  special: [],
  isBoss: false,
};

export const SKELETON_ARCHER: EnemyDef = {
  id: "skeleton-archer",
  name: "Skeleton Archer",
  floors: [1, 2],
  rowPreference: "back",
  hp: 8,
  attack: 4,
  ac: 2,
  agi: 12,
  xp: 9,
  gold: 7,
  special: [{ kind: "flying" }],
  isBoss: false,
};

export const ORC: EnemyDef = {
  id: "orc",
  name: "Orc",
  floors: [2],
  rowPreference: "any",
  hp: 10,
  attack: 3,
  ac: 1,
  agi: 2,
  xp: 8,
  gold: 6,
  special: [{ kind: "slowGroup" }, { kind: "poisonOnHit" }],
  isBoss: false,
};

export const LIZARD_WARRIOR: EnemyDef = {
  id: "lizard-warrior",
  name: "Lizard Warrior",
  floors: [2],
  rowPreference: "front",
  hp: 14,
  attack: 4,
  ac: 3,
  agi: 6,
  xp: 10,
  gold: 7,
  special: [{ kind: "poisonOnHit" }],
  isBoss: false,
};

export const FAILED_EXPERIMENT: EnemyDef = {
  id: "failed-experiment",
  name: "Failed Experiment",
  floors: [2],
  rowPreference: "front",
  hp: 25,
  attack: 8,
  ac: 5,
  agi: 3,
  xp: 18,
  gold: 15,
  special: [],
  isBoss: false,
};

export const ACID_PUDDLE: EnemyDef = {
  id: "acid-puddle",
  name: "Acid Puddle",
  floors: [1],
  rowPreference: "front",
  hp: 18,
  attack: 5,
  ac: 6,
  agi: 2,
  xp: 15,
  gold: 12,
  special: [{ kind: "resistPhysical", percent: 50 }, { kind: "poisonOnHit" }],
  isBoss: false,
};

export const LAB_ASSISTANT: EnemyDef = {
  id: "lab-assistant",
  name: "Lab Assistant",
  floors: [2],
  rowPreference: "back",
  hp: 15,
  attack: 4,
  ac: 3,
  agi: 6,
  xp: 16,
  gold: 14,
  special: [{ kind: "healer", spellName: "Aethel" }],
  isBoss: false,
};

// Floor 3: The Forge of Ashes — constructs, fire-casting orcs, and the Echo.
export const ELITE_ORC: EnemyDef = {
  id: "elite-orc",
  name: "Elite Orc",
  floors: [3],
  rowPreference: "back",
  hp: 22,
  attack: 6,
  ac: 4,
  agi: 10,
  xp: 22,
  gold: 20,
  special: [{ kind: "caster", element: "fire" }],
  isBoss: false,
};

export const LESSER_CONSTRUCT: EnemyDef = {
  id: "lesser-construct",
  name: "Lesser Construct",
  floors: [3],
  rowPreference: "front",
  hp: 35,
  attack: 9,
  ac: 8,
  agi: 1,
  xp: 24,
  gold: 22,
  special: [],
  isBoss: false,
};

export const WEREWOLF: EnemyDef = {
  id: "werewolf",
  name: "Werewolf",
  floors: [3],
  rowPreference: "any",
  hp: 16,
  attack: 5,
  ac: 2,
  agi: 14,
  xp: 20,
  gold: 18,
  special: [{ kind: "evasive" }],
  isBoss: false,
};

export const BIG_TITTY_OGRE: EnemyDef = {
  id: "big-titty-ogre",
  name: "Big Titty Ogre",
  floors: [3],
  rowPreference: "front",
  hp: 40,
  attack: 11,
  ac: 6,
  agi: 2,
  xp: 30,
  gold: 28,
  special: [],
  isBoss: false,
};

export const STONE_GUARDIAN: EnemyDef = {
  id: "stone-guardian",
  name: "Stone Guardian",
  floors: [3],
  rowPreference: "front",
  hp: 45,
  attack: 12,
  ac: 10,
  agi: 2,
  xp: 40,
  gold: 35,
  special: [],
  isBoss: false,
};

export const ANIMATED_ARMOR: EnemyDef = {
  id: "animated-armor",
  name: "Animated Armor",
  floors: [3],
  rowPreference: "front",
  hp: 40,
  attack: 10,
  ac: 12,
  agi: 3,
  xp: 38,
  gold: 32,
  special: [{ kind: "highDefense" }],
  isBoss: false,
};

export const HEADMASTERS_ECHO: EnemyDef = {
  id: "headmasters-echo",
  name: "The Headmaster's Echo",
  floors: [3],
  rowPreference: "back",
  hp: 120,
  attack: 15,
  ac: 8,
  agi: 7,
  xp: 200,
  gold: 500,
  special: [
    { kind: "undead" },
    { kind: "silenceRandom", target: "party", duration: "combat" },
  ],
  isBoss: true,
};

// NPC combatants — never in random encounter tables (floors: []); they are
// fought only when the party attacks (or is caught robbing) a dungeon NPC.
// Both have full sprite strips under assets/enemies/{samurai,ronin}/.
export const SAMURAI: EnemyDef = {
  id: "samurai",
  name: "Maro the Stranded",
  floors: [],
  rowPreference: "front",
  hp: 24,
  attack: 6,
  ac: 4,
  agi: 14,
  xp: 20,
  gold: 30,
  special: [],
  isBoss: false,
};

export const RONIN: EnemyDef = {
  id: "ronin",
  name: "Kazeharu the Ronin",
  floors: [],
  rowPreference: "front",
  hp: 44,
  attack: 9,
  ac: 7,
  agi: 20,
  xp: 60,
  gold: 90,
  special: [{ kind: "evasive" }],
  isBoss: false,
};

export const ALL_ENEMIES: EnemyDef[] = [
  TRAINING_DUMMY,
  SLIME,
  SKELETON,
  ARMORED_SKELETON,
  SKELETON_ARCHER,
  ORC,
  LIZARD_WARRIOR,
  FAILED_EXPERIMENT,
  ACID_PUDDLE,
  LAB_ASSISTANT,
  ELITE_ORC,
  LESSER_CONSTRUCT,
  WEREWOLF,
  BIG_TITTY_OGRE,
  STONE_GUARDIAN,
  ANIMATED_ARMOR,
  HEADMASTERS_ECHO,
  SAMURAI,
  RONIN,
];

export const ENEMIES_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ALL_ENEMIES.map((e) => [e.id, e])
);

/** Enemies that may appear on a given floor. */
export function enemiesForFloor(floor: number): EnemyDef[] {
  return ALL_ENEMIES.filter((e) => e.floors.includes(floor));
}

/** Weighted encounter table for each floor. Weights do not need to sum to 1. */
export const ENCOUNTER_TABLES: Record<number, EncounterEntry[]> = {
  // Floor 1: The Flooded Crypt.
  1: [
    {
      weight: 4,
      spawns: [
        { enemyId: "slime", row: "front" },
        { enemyId: "slime", row: "front" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    // Something rises out of the floodwater — rare, tough for level 1.
    { weight: 1, spawns: [{ enemyId: "acid-puddle", row: "front" }] },
  ],
  // Floor 2: The Cursed Library.
  2: [
    {
      weight: 4,
      spawns: [
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "armored-skeleton", row: "front" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "orc", row: "front" },
        { enemyId: "orc", row: "front" },
      ],
    },
    // Cursed scribe keeps its bound horror standing — teaches focus-firing healers.
    // Scalebound scavengers from the flooded lower halls.
    {
      weight: 3,
      spawns: [
        { enemyId: "lizard-warrior", row: "front" },
        { enemyId: "lizard-warrior", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "lab-assistant", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "orc", row: "front" },
        { enemyId: "lizard-warrior", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "orc", row: "front" },
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
  ],
  // Floor 3: The Forge of Ashes.
  3: [
    {
      weight: 4,
      spawns: [
        { enemyId: "lesser-construct", row: "front" },
        { enemyId: "elite-orc", row: "back" },
        { enemyId: "elite-orc", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "lesser-construct", row: "front" },
        { enemyId: "lesser-construct", row: "front" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "werewolf", row: "front" },
        { enemyId: "werewolf", row: "back" },
        { enemyId: "werewolf", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "big-titty-ogre", row: "front" },
        { enemyId: "elite-orc", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "animated-armor", row: "front" },
      ],
    },
    // The climax formation — the Echo flanked by its forged honor guard.
    {
      weight: 1,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "headmasters-echo", row: "back" },
        { enemyId: "animated-armor", row: "front" },
      ],
    },
  ],
};

/** Pick a random encounter for a floor using the weighted table. */
export function rollEncounter(floor: number): EncounterEntry | null {
  const table = ENCOUNTER_TABLES[floor];
  if (!table || table.length === 0) return null;

  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }

  return table[table.length - 1];
}

/** Resolve an encounter entry into concrete EnemyDef instances in formation order. */
export function resolveEncounter(
  entry: EncounterEntry
): { enemy: EnemyDef; row: Row }[] {
  return entry.spawns
    .map((spawn) => {
      const enemy = ENEMIES_BY_ID[spawn.enemyId];
      return enemy ? { enemy, row: spawn.row } : null;
    })
    .filter((e): e is { enemy: EnemyDef; row: Row } => e !== null);
}
