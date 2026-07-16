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
  hp: 13,
  attack: 5,
  ac: 3,
  agi: 6,
  xp: 10,
  gold: 5,
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
  hp: 10,
  attack: 3,
  ac: 2,
  agi: 10,
  xp: 8,
  gold: 3,
  special: [{ kind: "undead" }],
  abilityIds: ["bone-shard", "rattle"],
  isBoss: false,
};

// Floor 2: The Cursed Library — armored dead, orc scavengers, cursed scribes.
export const ARMORED_SKELETON: EnemyDef = {
  id: "armored-skeleton",
  name: "Armored Skeleton",
  floors: [2],
  rowPreference: "front",
  hp: 19,
  attack: 8,
  ac: 5,
  agi: 5,
  xp: 16,
  gold: 13,
  special: [{ kind: "undead" }],
  abilityIds: ["shield-bash", "iron-fist"],
  isBoss: false,
};

export const SKELETON_ARCHER: EnemyDef = {
  id: "skeleton-archer",
  name: "Skeleton Archer",
  floors: [1, 2],
  rowPreference: "back",
  hp: 13,
  attack: 6,
  ac: 3,
  agi: 15,
  xp: 14,
  gold: 11,
  special: [
    { kind: "undead" },
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
  hp: 16,
  attack: 5,
  ac: 2,
  agi: 3,
  xp: 13,
  gold: 10,
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
  hp: 40,
  attack: 13,
  ac: 8,
  agi: 4,
  xp: 29,
  gold: 24,
  special: [{ kind: "poisonOnHit" }],
  abilityIds: ["berserk", "savage-lunge"],
  isBoss: false,
};

export const ACID_PUDDLE: EnemyDef = {
  id: "acid-puddle",
  name: "Acid Puddle",
  floors: [1],
  rowPreference: "front",
  hp: 29,
  attack: 8,
  ac: 10,
  agi: 3,
  xp: 24,
  gold: 19,
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
  hp: 24,
  attack: 6,
  ac: 5,
  agi: 8,
  xp: 26,
  gold: 22,
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
  hp: 35,
  attack: 10,
  ac: 6,
  agi: 13,
  xp: 35,
  gold: 32,
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
  hp: 56,
  attack: 14,
  ac: 13,
  agi: 1,
  xp: 38,
  gold: 35,
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
  hp: 26,
  attack: 8,
  ac: 3,
  agi: 18,
  xp: 32,
  gold: 29,
  special: [{ kind: "evasive" }],
  abilityIds: ["hunting-pounce", "rending-claw"],
  isBoss: false,
};

export const BIG_TITTY_OGRE: EnemyDef = {
  id: "big-titty-ogre",
  name: "Big Titty Ogre",
  floors: [3],
  rowPreference: "front",
  hp: 64,
  attack: 18,
  ac: 10,
  agi: 3,
  xp: 48,
  gold: 45,
  special: [{ kind: "weakElement", element: "wind" }],
  abilityIds: ["stone-slam", "berserk"],
  isBoss: false,
};

export const STONE_GUARDIAN: EnemyDef = {
  id: "stone-guardian",
  name: "Stone Guardian",
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 72,
  attack: 19,
  ac: 16,
  agi: 3,
  xp: 64,
  gold: 56,
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
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 64,
  attack: 16,
  ac: 19,
  agi: 4,
  xp: 61,
  gold: 51,
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
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 192,
  attack: 24,
  ac: 13,
  agi: 9,
  xp: 320,
  gold: 800,
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
  hp: 22,
  attack: 8,
  ac: 3,
  agi: 15,
  xp: 22,
  gold: 19,
  special: [
    { kind: "undead" },
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
  hp: 16,
  attack: 6,
  ac: 0,
  agi: 18,
  xp: 19,
  gold: 16,
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
  hp: 51,
  attack: 14,
  ac: 10,
  agi: 4,
  xp: 42,
  gold: 35,
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
  hp: 26,
  attack: 8,
  ac: 6,
  agi: 4,
  xp: 21,
  gold: 16,
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
  floors: [3, 5],
  rowPreference: "any",
  hp: 32,
  attack: 11,
  ac: 5,
  agi: 20,
  xp: 29,
  gold: 26,
  special: [
    { kind: "demon" },
    { kind: "evasive" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["hunting-pounce", "howl", "fire-breath"],
  isBoss: false,
};

export const HELLBAT: EnemyDef = {
  id: "hellbat",
  name: "Hellbat",
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 24,
  attack: 9,
  ac: 2,
  agi: 18,
  xp: 22,
  gold: 19,
  special: [
    { kind: "demon" },
    { kind: "flying" },
    { kind: "evasive" },
    { kind: "resistElement", element: "fire" },
    { kind: "weakElement", element: "water" },
  ],
  abilityIds: ["howl", "rending-claw"],
  isBoss: false,
};

export const BLACK_KNIGHT: EnemyDef = {
  id: "black-knight",
  name: "Black Knight",
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 61,
  attack: 16,
  ac: 16,
  agi: 3,
  xp: 51,
  gold: 45,
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
  floors: [3, 5],
  rowPreference: "front",
  hp: 58,
  attack: 18,
  ac: 8,
  agi: 6,
  xp: 45,
  gold: 38,
  special: [{ kind: "weakElement", element: "wind" }],
  abilityIds: ["berserk", "stone-slam", "charge"],
  isBoss: false,
};

export const WARLOCK: EnemyDef = {
  id: "warlock",
  name: "Warlock",
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 29,
  attack: 6,
  ac: 3,
  agi: 10,
  xp: 38,
  gold: 32,
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
  hp: 42,
  attack: 13,
  ac: 6,
  agi: 10,
  xp: 35,
  gold: 29,
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
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 32,
  attack: 8,
  ac: 5,
  agi: 13,
  xp: 38,
  gold: 32,
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
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 58,
  attack: 16,
  ac: 18,
  agi: 3,
  xp: 54,
  gold: 45,
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
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 45,
  attack: 10,
  ac: 8,
  agi: 6,
  xp: 48,
  gold: 42,
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
  hp: 35,
  attack: 10,
  ac: 5,
  agi: 8,
  xp: 26,
  gold: 22,
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
  hp: 22,
  attack: 8,
  ac: 2,
  agi: 16,
  xp: 24,
  gold: 21,
  special: [
    { kind: "undead" },
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
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 45,
  attack: 14,
  ac: 6,
  agi: 9,
  xp: 38,
  gold: 30,
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
  floors: [3, 4, 5],
  rowPreference: "any",
  hp: 29,
  attack: 10,
  ac: 3,
  agi: 13,
  xp: 26,
  gold: 22,
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
  floors: [3, 4, 5],
  rowPreference: "front",
  hp: 67,
  attack: 19,
  ac: 10,
  agi: 5,
  xp: 58,
  gold: 48,
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
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 26,
  attack: 5,
  ac: 3,
  agi: 11,
  xp: 42,
  gold: 35,
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
  floors: [3, 4, 5],
  rowPreference: "back",
  hp: 29,
  attack: 6,
  ac: 3,
  agi: 15,
  xp: 35,
  gold: 29,
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
  // Floor 1: The Flooded Crypt — typical 3–4, cap 4 (party of 6 needs pressure).
  1: [
    {
      weight: 4,
      spawns: [
        { enemyId: "slime", row: "front" },
        { enemyId: "slime", row: "front" },
        { enemyId: "slime", row: "front" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "slime", row: "front" },
        { enemyId: "slime", row: "front" },
        { enemyId: "skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    // Acid puddle with trash escorts — no soft solo.
    {
      weight: 2,
      spawns: [
        { enemyId: "acid-puddle", row: "front" },
        { enemyId: "slime", row: "front" },
        { enemyId: "slime", row: "front" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "slime", row: "front" },
        { enemyId: "skeleton", row: "front" },
      ],
    },
  ],
  // Floor 2: The Cursed Library — typical 4–5, cap 5.
  2: [
    {
      weight: 4,
      spawns: [
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "orc", row: "front" },
        { enemyId: "orc", row: "front" },
        { enemyId: "orc", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "lab-assistant", row: "back" },
        { enemyId: "eyeball-monster", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "blood-monster", row: "front" },
        { enemyId: "blood-monster", row: "front" },
        { enemyId: "blood-wraith", row: "back" },
        { enemyId: "ghostfire", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "orc", row: "front" },
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
        { enemyId: "lab-assistant", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "blood-monster", row: "front" },
        { enemyId: "ghostfire", row: "back" },
        { enemyId: "eyeball-monster", row: "back" },
        { enemyId: "blood-wraith", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "armored-skeleton", row: "front" },
        { enemyId: "orc", row: "front" },
        { enemyId: "skeleton-archer", row: "back" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "failed-experiment", row: "front" },
        { enemyId: "lab-assistant", row: "back" },
      ],
    },
  ],
  // Floor 3: The Forge of Ashes — typical 4–6, cap 6.
  3: [
    {
      weight: 4,
      spawns: [
        { enemyId: "lesser-construct", row: "front" },
        { enemyId: "lesser-construct", row: "front" },
        { enemyId: "elite-orc", row: "back" },
        { enemyId: "elite-orc", row: "back" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "werewolf", row: "front" },
        { enemyId: "werewolf", row: "front" },
        { enemyId: "werewolf", row: "back" },
        { enemyId: "werewolf", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "flame-golem", row: "front" },
        { enemyId: "lava-slime", row: "front" },
        { enemyId: "lava-slime", row: "front" },
        { enemyId: "warlock", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "hellhound", row: "front" },
        { enemyId: "hellhound", row: "front" },
        { enemyId: "hellbat", row: "back" },
        { enemyId: "hellbat", row: "back" },
        { enemyId: "hellbat", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "big-titty-ogre", row: "front" },
        { enemyId: "demon", row: "front" },
        { enemyId: "elite-orc", row: "back" },
        { enemyId: "demoness", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "rune-knight", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demon", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "minotaur", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "rune-knight", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "rune-knight", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "demon", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "lesser-construct", row: "front" },
        { enemyId: "elite-orc", row: "back" },
      ],
    },
    // The climax formation — the Echo flanked by its forged honor guard.
    {
      weight: 1,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "headmasters-echo", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
  ],
  // Floor 4: The Null Choir — typical 4–6, denser casters.
  4: [
    {
      weight: 4,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "rune-knight", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "back" },
        { enemyId: "warlock", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    // The climax formation — the Echo sings through the choir it silenced.
    {
      weight: 1,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "headmasters-echo", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
  ],
  // Floor 5: The Weeping Cistern — typical 4–6, heavy pressure.
  5: [
    {
      weight: 4,
      spawns: [
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 4,
      spawns: [
        { enemyId: "rune-knight", row: "front" },
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "warlock", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellbat", row: "front" },
        { enemyId: "hellhound", row: "front" },
        { enemyId: "hellhound", row: "back" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "stone-guardian", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "demoness", row: "back" },
      ],
    },
    {
      weight: 3,
      spawns: [
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "minotaur", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "demoness", row: "back" },
        { enemyId: "succubus", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "animated-armor", row: "front" },
        { enemyId: "rune-knight", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 2,
      spawns: [
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "demon-spawn", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "succubus", row: "back" },
        { enemyId: "succubus", row: "back" },
        { enemyId: "demon-mage", row: "back" },
      ],
    },
    {
      weight: 1,
      spawns: [
        { enemyId: "minotaur", row: "front" },
        { enemyId: "demon-brawler", row: "front" },
        { enemyId: "warlock", row: "back" },
      ],
    },
    // The climax formation — the Echo, still singing through drowned voices.
    {
      weight: 1,
      spawns: [
        { enemyId: "ironclad-knight", row: "front" },
        { enemyId: "black-knight", row: "front" },
        { enemyId: "demon-champion", row: "front" },
        { enemyId: "headmasters-echo", row: "back" },
        { enemyId: "demon-mage", row: "back" },
        { enemyId: "succubus", row: "back" },
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
