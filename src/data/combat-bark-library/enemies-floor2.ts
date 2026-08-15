/** Bark content — Floor 2 (The Cursed Library). */

import type { CombatBarkProfile } from "./types";

export const ARMORED_SKELETON_BARKS: CombatBarkProfile = {
  id: "armored-skeleton",
  displayName: "Armored Skeleton",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "skeleton's exhaustion plus front-line duty — holds the line out of habit",
  pools: {
    combatStart: [
      { text: "Hold." },
      { text: "Again." },
    ],
    abilityUse: [
      { text: "Hold.", abilityId: "phalanx-guard" },
    ],
    takeHit: [
      { text: "Fine." },
    ],
    takeHeavyHit: [
      { text: "Ow." },
    ],
    death: [
      { text: "Line's down." },
      { text: "Finally." },
    ],
    rare: [
      { text: "Still standing. Barely." },
    ],
  },
};

export const ORC_BARKS: CombatBarkProfile = {
  id: "orc",
  displayName: "Orc",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "eager, simple, pack-loyal — a few barked words, never a plan",
  pools: {
    combatStart: [
      { text: "Kill!" },
      { text: "*roar*" },
    ],
    abilityUse: [
      { text: "Pack!", abilityId: "war-cry" },
      { text: "*leaps*", abilityId: "pack-leap" },
    ],
    takeHit: [
      { text: "*grunt*" },
    ],
    takeHeavyHit: [
      { text: "Hnh!" },
    ],
    death: [
      { text: "*roar fades*" },
    ],
    chemistryWitness: [
      { text: "*grunt*", chemistryId: "pack-leap" },
    ],
    rare: [
      { text: "Mine!" },
    ],
  },
};

export const FAILED_EXPERIMENT_BARKS: CombatBarkProfile = {
  id: "failed-experiment",
  displayName: "Feral Scrivener",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "a scribe gone feral — broken academic fragments, not sentences",
  pools: {
    combatStart: [
      { text: "Pages." },
      { text: "*snarls*" },
    ],
    abilityUse: [
      { text: "No more ink." , abilityId: "berserk" },
    ],
    takeHit: [
      { text: "*hiss*" },
    ],
    death: [
      { text: "Unfinished." },
    ],
    rare: [
      { text: "Where's the rest." },
    ],
  },
};

export const ACID_PUDDLE_BARKS: CombatBarkProfile = {
  id: "acid-puddle",
  displayName: "Acid Puddle",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "inert, corrosive — bubble and hiss only, never a word, ever",
  pools: {
    combatStart: [
      { text: "*bubbles*" },
    ],
    basicAttack: [
      { text: "*hiss*" },
    ],
    takeHit: [
      { text: "*bubbles*" },
    ],
    death: [
      { text: "*fizzles out*" },
    ],
    chemistryWitness: [
      { text: "*bubbles louder*", chemistryId: "corrosive-cover" },
    ],
  },
};

export const LAB_ASSISTANT_BARKS: CombatBarkProfile = {
  id: "lab-assistant",
  displayName: "Cursed Scribe",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "clerical, bureaucratic about healing — files the party's survival like paperwork",
  pools: {
    combatStart: [
      { text: "Noted." },
      { text: "Beginning." },
      { text: "Filing this now." },
    ],
    basicAttack: [
      { text: "Documented." },
    ],
    attackMiss: [
      { text: "Clerical error." },
    ],
    healCast: [
      { text: "Filed.", abilityId: "mass-heal-ability" },
      { text: "Corrected.", abilityId: "mass-heal-ability" },
    ],
    abilityUse: [
      { text: "Ward raised.", abilityId: "ward" },
    ],
    takeHit: [
      { text: "Unfortunate." },
    ],
    takeHeavyHit: [
      { text: "That requires a report." },
    ],
    lowHp: [
      { text: "This is irregular." },
    ],
    allyDefeated: [
      { text: "Amend the roster." },
    ],
    kill: [
      { text: "Closed." },
    ],
    death: [
      { text: "Incomplete." },
    ],
    chemistryWitness: [
      { text: "Noted.", chemistryId: "living-shield" },
      { text: "Covered, for now.", chemistryId: "corrosive-cover" },
    ],
    rare: [
      { text: "Someone else file this." },
    ],
  },
};

export const DISPLACER_BEAST_BARKS: CombatBarkProfile = {
  id: "displacer-beast",
  displayName: "Shelf Stalker",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "feral library predator — chuff and static-blink sound only, no words",
  pools: {
    combatStart: [
      { text: "*low chuff*" },
    ],
    abilityUse: [
      { text: "*blink*", abilityId: "vanish" },
      { text: "*blink-strike*", abilityId: "blink-strike" },
    ],
    takeHit: [
      { text: "*snarl*" },
    ],
    death: [
      { text: "*fades*" },
    ],
  },
};

export const EYEBALL_MONSTER_BARKS: CombatBarkProfile = {
  id: "eyeball-monster",
  displayName: "Gaze Wraith",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "unsettling, observational — states what it sees, nothing more",
  pools: {
    combatStart: [
      { text: "Watching." },
    ],
    abilityUse: [
      { text: "Seen.", abilityId: "blinding-gaze" },
    ],
    takeHit: [
      { text: "Noticed." },
    ],
    death: [
      { text: "Closed." },
    ],
    rare: [
      { text: "I saw that coming." },
    ],
  },
};

export const GHOSTFIRE_BARKS: CombatBarkProfile = {
  id: "ghostfire",
  displayName: "Ghostfire",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "whispery, half-there — wants warmth it can't have",
  pools: {
    combatStart: [
      { text: "Cold." },
    ],
    abilityUse: [
      { text: "Warmth.", abilityId: "life-tap" },
    ],
    takeHit: [
      { text: "..." },
    ],
    death: [
      { text: "Out." },
    ],
  },
};

export const BLOOD_MONSTER_BARKS: CombatBarkProfile = {
  id: "blood-monster",
  displayName: "Blood Monster",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "feral, hungry — snarl and gurgle, wants the next wound",
  pools: {
    combatStart: [
      { text: "*snarl*" },
    ],
    takeHit: [
      { text: "*gurgle*" },
    ],
    death: [
      { text: "*collapses*" },
    ],
  },
};

export const BLOOD_WRAITH_BARKS: CombatBarkProfile = {
  id: "blood-wraith",
  displayName: "Blood Wraith",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "hungry whisper — wants one more drink, hates being seen coming",
  pools: {
    combatStart: [
      { text: "Thirsty." },
    ],
    abilityUse: [
      { text: "Mine.", abilityId: "life-tap" },
    ],
    takeHit: [
      { text: "..." },
    ],
    death: [
      { text: "Not yet—" },
    ],
  },
};

export const ENEMY_BARKS_FLOOR2: readonly CombatBarkProfile[] = [
  ARMORED_SKELETON_BARKS,
  ORC_BARKS,
  FAILED_EXPERIMENT_BARKS,
  ACID_PUDDLE_BARKS,
  LAB_ASSISTANT_BARKS,
  DISPLACER_BEAST_BARKS,
  EYEBALL_MONSTER_BARKS,
  GHOSTFIRE_BARKS,
  BLOOD_MONSTER_BARKS,
  BLOOD_WRAITH_BARKS,
];
