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
  | { kind: "demon" }
  | { kind: "silenceRandom"; target: "party"; duration: "combat" }
  | { kind: "evasive" }
  | { kind: "highDefense" }
  | { kind: "poisonOnHit" }
  | { kind: "resistElement"; element: DamageElement }
  | { kind: "weakElement"; element: DamageElement };

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
  /** Enemy-only ability IDs from data/enemy-abilities.ts. */
  abilityIds?: string[];
  /** Existing spell IDs from data/spells.ts that this enemy can cast. */
  knownSpells?: string[];
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
  special: [
    { kind: "resistElement", element: "water" },
    { kind: "weakElement", element: "earth" },
  ],
  abilityIds: ["acid-spit", "split"],
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
  abilityIds: ["bone-shard", "rattle"],
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
  abilityIds: ["shield-bash", "iron-fist"],
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
  special: [
    { kind: "flying" },
    { kind: "weakElement", element: "earth" },
    { kind: "resistElement", element: "wind" },
  ],
  abilityIds: ["archer-volley"],
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
  special: [
    { kind: "poisonOnHit" },
    { kind: "weakElement", element: "wind" },
  ],
  abilityIds: ["war-cry", "savage-lunge"],
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
  abilityIds: ["berserk", "savage-lunge"],
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
  special: [
    { kind: "resistPhysical", percent: 50 },
    { kind: "poisonOnHit" },
    { kind: "resistElement", element: "water" },
  ],
  abilityIds: ["acid-spit", "rending-claw"],
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
  special: [{ kind: "healer", spellName: "Cure Wounds" }],
  abilityIds: ["mass-heal-ability", "ward"],
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
  special: [
    { kind: "caster", element: "fire" },
    { kind: "weakElement", element: "water" },
    { kind: "resistElement", element: "fire" },
  ],
  abilityIds: ["fire-breath", "war-cry"],
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
  special: [
    { kind: "weakElement", element: "wind" },
    { kind: "resistElement", element: "earth" },
  ],
  abilityIds: ["stone-slam", "repair"],
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
  abilityIds: ["hunting-pounce", "rending-claw"],
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
  special: [{ kind: "weakElement", element: "wind" }],
  abilityIds: ["stone-slam", "berserk"],
  isBoss: false,
};

export const STONE_GUARDIAN: EnemyDef = {
  id: "stone-guardian",
  name: "Stone Guardian",
  floors: [3, 4],
  rowPreference: "front",
  hp: 45,
  attack: 12,
  ac: 10,
  agi: 2,
  xp: 40,
  gold: 35,
  special: [
    { kind: "weakElement", element: "wind" },
    { kind: "resistElement", element: "earth" },
  ],
  abilityIds: ["stone-slam", "iron-fist", "phalanx-guard"],
  isBoss: false,
};

export const ANIMATED_ARMOR: EnemyDef = {
  id: "animated-armor",
  name: "Animated Armor",
  floors: [3, 4],
  rowPreference: "front",
  hp: 40,
  attack: 10,
  ac: 12,
  agi: 3,
  xp: 38,
  gold: 32,
  special: [
    { kind: "highDefense" },
    { kind: "weakElement", element: "wind" },
    { kind: "resistElement", element: "earth" },
  ],
  abilityIds: ["shield-bash", "charge", "phalanx-guard"],
  isBoss: false,
};

export const HEADMASTERS_ECHO: EnemyDef = {
  id: "headmasters-echo",
  name: "The Headmaster's Echo",
  floors: [3, 4],
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
  abilityIds: ["echo-of-silence", "memory-drain", "anti-magic-field", "dark-pulse"],
  isBoss: true,
};

// Pack 02 demon / forge-themed enemies.
export const EYEBALL_MONSTER: EnemyDef = {
  id: "eyeball-monster",
  name: "Gaze Wraith",
  floors: [2],
  rowPreference: "back",
  hp: 14,
  attack: 5,
  ac: 2,
  agi: 12,
  xp: 14,
  gold: 12,
  special: [
    { kind: "flying" },
    { kind: "silenceRandom", target: "party", duration: "combat" },
  ],
  abilityIds: ["blinding-gaze", "curse"],
  isBoss: false,
};

export const GHOSTFIRE: EnemyDef = {
  id: "ghostfire",
  name: "Ghostfire",
  floors: [2],
  rowPreference: "back",
  hp: 10,
  attack: 4,
  ac: 0,
  agi: 14,
  xp: 12,
  gold: 10,
  special: [
    { kind: "flying" },
    { kind: "undead" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "cold" },
  ],
  abilityIds: ["life-tap", "ghostly-wail", "phase-shift"],
  isBoss: false,
};

export const FLAME_GOLEM: EnemyDef = {
  id: "flame-golem",
  name: "Flame Golem",
  floors: [3],
  rowPreference: "front",
  hp: 32,
  attack: 9,
  ac: 6,
  agi: 3,
  xp: 26,
  gold: 22,
  special: [
    { kind: "highDefense" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["magma-burst", "forge-bellows", "repair"],
  isBoss: false,
};

export const LAVA_SLIME: EnemyDef = {
  id: "lava-slime",
  name: "Lava Slime",
  floors: [3],
  rowPreference: "front",
  hp: 16,
  attack: 5,
  ac: 4,
  agi: 3,
  xp: 13,
  gold: 10,
  special: [
    { kind: "resistElement", element: "fire" },
    { kind: "poisonOnHit" },
  ],
  abilityIds: ["acid-spit", "fire-breath"],
  isBoss: false,
};

export const HELLHOUND: EnemyDef = {
  id: "hellhound",
  name: "Hellhound",
  floors: [3],
  rowPreference: "any",
  hp: 20,
  attack: 7,
  ac: 3,
  agi: 16,
  xp: 18,
  gold: 16,
  special: [{ kind: "evasive" }],
  abilityIds: ["hunting-pounce", "howl", "fire-breath"],
  isBoss: false,
};

export const HELLBAT: EnemyDef = {
  id: "hellbat",
  name: "Hellbat",
  floors: [3, 4],
  rowPreference: "back",
  hp: 12,
  attack: 5,
  ac: 1,
  agi: 14,
  xp: 14,
  gold: 12,
  special: [
    { kind: "flying" },
    { kind: "evasive" },
  ],
  abilityIds: ["howl", "rending-claw"],
  isBoss: false,
};

export const BLACK_KNIGHT: EnemyDef = {
  id: "black-knight",
  name: "Black Knight",
  floors: [3, 4],
  rowPreference: "front",
  hp: 38,
  attack: 10,
  ac: 10,
  agi: 2,
  xp: 32,
  gold: 28,
  special: [
    { kind: "highDefense" },
    { kind: "resistPhysical", percent: 25 },
  ],
  abilityIds: ["shield-bash", "charge", "phalanx-guard"],
  isBoss: false,
};

export const MINOTAUR: EnemyDef = {
  id: "minotaur",
  name: "Minotaur",
  floors: [3],
  rowPreference: "front",
  hp: 36,
  attack: 11,
  ac: 5,
  agi: 5,
  xp: 28,
  gold: 24,
  special: [{ kind: "weakElement", element: "wind" }],
  abilityIds: ["berserk", "stone-slam", "charge"],
  isBoss: false,
};

export const WARLOCK: EnemyDef = {
  id: "warlock",
  name: "Warlock",
  floors: [3, 4],
  rowPreference: "back",
  hp: 18,
  attack: 4,
  ac: 2,
  agi: 8,
  xp: 24,
  gold: 20,
  special: [
    { kind: "caster", element: "fire" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["hellfire", "chaos-bolt", "anti-magic-field"],
  isBoss: false,
};

export const DEMON: EnemyDef = {
  id: "demon",
  name: "Demon",
  floors: [3],
  rowPreference: "front",
  hp: 26,
  attack: 8,
  ac: 4,
  agi: 8,
  xp: 22,
  gold: 18,
  special: [
    { kind: "demon" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["hellfire", "savage-lunge"],
  isBoss: false,
};

export const DEMONESS: EnemyDef = {
  id: "demoness",
  name: "Demoness",
  floors: [3, 4],
  rowPreference: "back",
  hp: 20,
  attack: 5,
  ac: 3,
  agi: 10,
  xp: 24,
  gold: 20,
  special: [
    { kind: "demon" },
    { kind: "healer", spellName: "Mass Cure" },
    { kind: "resistElement", element: "fire" },
  ],
  abilityIds: ["mass-heal-ability", "seduction", "curse"],
  isBoss: false,
};

// Pack 02 remaining variants (knights, blood monsters, demon kin).
export const IRONCLAD_KNIGHT: EnemyDef = {
  id: "ironclad-knight",
  name: "Ironclad Knight",
  floors: [3, 4],
  rowPreference: "front",
  hp: 36,
  attack: 10,
  ac: 11,
  agi: 2,
  xp: 34,
  gold: 28,
  special: [
    { kind: "highDefense" },
    { kind: "resistPhysical", percent: 30 },
  ],
  abilityIds: ["shield-bash", "charge", "phalanx-guard"],
  isBoss: false,
};

export const RUNE_KNIGHT: EnemyDef = {
  id: "rune-knight",
  name: "Rune Knight",
  floors: [3, 4],
  rowPreference: "back",
  hp: 28,
  attack: 6,
  ac: 5,
  agi: 5,
  xp: 30,
  gold: 26,
  special: [
    { kind: "caster", element: "lightning" },
    { kind: "resistElement", element: "lightning" },
  ],
  abilityIds: ["lightning-strike", "ward"],
  isBoss: false,
};

export const BLOOD_MONSTER: EnemyDef = {
  id: "blood-monster",
  name: "Blood Monster",
  floors: [2],
  rowPreference: "front",
  hp: 22,
  attack: 6,
  ac: 3,
  agi: 6,
  xp: 16,
  gold: 14,
  special: [
    { kind: "poisonOnHit" },
    { kind: "weakElement", element: "fire" },
  ],
  abilityIds: ["rending-claw", "soul-drain"],
  isBoss: false,
};

export const BLOOD_WRAITH: EnemyDef = {
  id: "blood-wraith",
  name: "Blood Wraith",
  floors: [2],
  rowPreference: "back",
  hp: 14,
  attack: 5,
  ac: 1,
  agi: 13,
  xp: 15,
  gold: 13,
  special: [
    { kind: "flying" },
    { kind: "evasive" },
    { kind: "poisonOnHit" },
  ],
  abilityIds: ["life-tap", "phase-shift", "ghostly-wail"],
  isBoss: false,
};

export const DEMON_BRAWLER: EnemyDef = {
  id: "demon-brawler",
  name: "Demon Brawler",
  floors: [3, 4],
  rowPreference: "front",
  hp: 28,
  attack: 9,
  ac: 4,
  agi: 7,
  xp: 24,
  gold: 19,
  special: [
    { kind: "demon" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["savage-lunge", "hellfire"],
  isBoss: false,
};

export const DEMON_SPAWN: EnemyDef = {
  id: "demon-spawn",
  name: "Demon Spawn",
  floors: [3, 4],
  rowPreference: "any",
  hp: 18,
  attack: 6,
  ac: 2,
  agi: 10,
  xp: 16,
  gold: 14,
  special: [
    { kind: "demon" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["hunting-pounce", "rending-claw"],
  isBoss: false,
};

export const DEMON_CHAMPION: EnemyDef = {
  id: "demon-champion",
  name: "Demon Champion",
  floors: [3, 4],
  rowPreference: "front",
  hp: 42,
  attack: 12,
  ac: 6,
  agi: 4,
  xp: 36,
  gold: 30,
  special: [
    { kind: "demon" },
    { kind: "highDefense" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["berserk", "stone-slam", "forge-bellows"],
  isBoss: false,
};

export const DEMON_MAGE: EnemyDef = {
  id: "demon-mage",
  name: "Demon Mage",
  floors: [3, 4],
  rowPreference: "back",
  hp: 16,
  attack: 3,
  ac: 2,
  agi: 9,
  xp: 26,
  gold: 22,
  special: [
    { kind: "demon" },
    { kind: "caster", element: "fire" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["hellfire", "summon-imp", "anti-magic-field"],
  isBoss: false,
};

export const SUCCUBUS: EnemyDef = {
  id: "succubus",
  name: "Succubus",
  floors: [3, 4],
  rowPreference: "back",
  hp: 18,
  attack: 4,
  ac: 2,
  agi: 12,
  xp: 22,
  gold: 18,
  special: [
    { kind: "demon" },
    { kind: "caster", element: "undead" },
    { kind: "silenceRandom", target: "party", duration: "combat" },
  ],
  abilityIds: ["seduction", "soul-drain", "curse"],
  isBoss: false,
};

export const ALL_ENEMIES: EnemyDef[] = [
  TRAINING_DUMMY,
  SLIME,
  SKELETON,
  ARMORED_SKELETON,
  SKELETON_ARCHER,
  ORC,
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
  EYEBALL_MONSTER,
  GHOSTFIRE,
  FLAME_GOLEM,
  LAVA_SLIME,
  HELLHOUND,
  HELLBAT,
  BLACK_KNIGHT,
  MINOTAUR,
  WARLOCK,
  DEMON,
  DEMONESS,
  IRONCLAD_KNIGHT,
  RUNE_KNIGHT,
  BLOOD_MONSTER,
  BLOOD_WRAITH,
  DEMON_BRAWLER,
  DEMON_SPAWN,
  DEMON_CHAMPION,
  DEMON_MAGE,
  SUCCUBUS,
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
    {
      weight: 2,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "lab-assistant", row: "back" },
      ],
    },
    // Pack 02 fliers and cursed constructs drift through the upper shelves.
    {
      weight: 2,
      spawns: [
        { enemyId: "ghostfire", row: "back" },
        { enemyId: "eyeball-monster", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "eyeball-monster", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "blood-monster", row: "front" },
        { enemyId: "blood-wraith", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "blood-monster", row: "front" },
        { enemyId: "blood-monster", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "blood-wraith", row: "back" },
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
    // Pack 02 forge demons and molten constructs.
    {
      weight: 3,
      spawns: [
        { enemyId: "flame-golem", row: "front" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "hellhound", row: "front" },
        { enemyId: "hellhound", row: "back" },
        { enemyId: "hellbat", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demon", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "minotaur", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "lava-slime", row: "front" },
        { enemyId: "lava-slime", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon", row: "front" },
        { enemyId: "demoness", row: "back" },
      ],
    },
    // Pack 02 remaining forge variants.
    {
      weight: 2,
      spawns: [
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "rune-knight", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "black-knight", row: "front" },
        { enemyId: "ironclad-knight", row: "front" },
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
  // Floor 4: The Null Choir — the silenced chapel beneath the forge.
  // Denser packs than floor 3, with back-row casters in most formations.
  4: [
    {
      weight: 4,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "rune-knight", row: "back" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "succubus", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "rune-knight", row: "front" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demoness", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "stone-guardian", row: "front" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "demoness", row: "back" },
      ],
    },
    // The climax formation — the Echo sings through the choir it silenced.
    {
      weight: 1,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "headmasters-echo", row: "back" },
        { enemyId: "demon-champion", row: "front" },
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
