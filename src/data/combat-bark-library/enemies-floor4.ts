/**
 * Bark content — Floor 4 (The Null Choir).
 * All five share a liturgical register: clipped, ritual cadence,
 * call-and-response undertones, differentiated by role.
 */

import type { CombatBarkProfile } from "./types";

export const CHOIR_WARDEN_BARKS: CombatBarkProfile = {
  id: "choir-warden",
  displayName: "Choir Warden",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "disciplined front-line zealot — the line held, quietly",
  pools: {
    combatStart: [
      { text: "Hold the verse." },
      { text: "Ranks, now." },
      { text: "Begin." },
    ],
    basicAttack: [
      { text: "Struck." },
      { text: "Answered." },
    ],
    attackMiss: [
      { text: "Turned aside." },
    ],
    abilityUse: [
      { text: "Hold.", abilityId: "phalanx-guard" },
    ],
    takeHit: [
      { text: "Endured." },
      { text: "Noted." },
    ],
    takeHeavyHit: [
      { text: "The line bends." },
    ],
    lowHp: [
      { text: "The line thins." },
    ],
    allyDefeated: [
      { text: "One voice lost." },
    ],
    kill: [
      { text: "Passed on." },
    ],
    death: [
      { text: "The verse ends." },
    ],
    rare: [
      { text: "Doubt has no verse." },
    ],
  },
};

export const DISCORDANT_CANTOR_BARKS: CombatBarkProfile = {
  id: "discordant-cantor",
  displayName: "Discordant Cantor",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "unsettling melodic caster — the wrong note, on purpose",
  pools: {
    combatStart: [
      { text: "Listen." },
      { text: "A new key." },
    ],
    basicAttack: [
      { text: "Off-tempo." },
    ],
    attackMiss: [
      { text: "Missed the beat." },
    ],
    abilityUse: [
      { text: "Wrong note.", abilityId: "lightning-strike" },
      { text: "Screen up.", abilityId: "anti-magic-field" },
      { text: "Chaos, tuned.", abilityId: "chaos-bolt" },
    ],
    takeHit: [
      { text: "Off-key." },
      { text: "Discordant." },
    ],
    takeHeavyHit: [
      { text: "A sour note." },
    ],
    lowHp: [
      { text: "Losing the tune." },
    ],
    allyDefeated: [
      { text: "A voice cut short." },
    ],
    kill: [
      { text: "Cadence." },
    ],
    death: [
      { text: "Still discordant." },
    ],
    rare: [
      { text: "Harmony was never the point." },
    ],
  },
};

export const NULL_ACOLYTE_BARKS: CombatBarkProfile = {
  id: "null-acolyte",
  displayName: "Null Acolyte",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "fanatic, hushed — silence enforced, doctrine never explained",
  pools: {
    combatStart: [
      { text: "Quiet, now." },
      { text: "Hush." },
    ],
    basicAttack: [
      { text: "Silenced." },
    ],
    attackMiss: [
      { text: "Too loud, still." },
    ],
    abilityUse: [
      { text: "Seen.", abilityId: "blinding-gaze" },
      { text: "Hexed.", abilityId: "curse" },
      { text: "Ward, kept.", abilityId: "ward" },
    ],
    takeHit: [
      { text: "Unmoved." },
      { text: "Noted, quietly." },
    ],
    takeHeavyHit: [
      { text: "Almost a sound." },
    ],
    lowHp: [
      { text: "Almost quiet enough." },
    ],
    allyDefeated: [
      { text: "One less murmur." },
    ],
    kill: [
      { text: "At peace, now." },
    ],
    death: [
      { text: "Silenced." },
    ],
    rare: [
      { text: "Doctrine is not mine to explain." },
    ],
  },
};

export const IRON_CHORISTER_BARKS: CombatBarkProfile = {
  id: "iron-chorister",
  displayName: "Iron Chorister",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "heavy undead zealot, aggressive — never sounds gentle",
  pools: {
    combatStart: [
      { text: "Blessed charge." },
      { text: "Forward, now." },
    ],
    basicAttack: [
      { text: "Struck true." },
    ],
    attackMiss: [
      { text: "Wide." },
    ],
    abilityUse: [
      { text: "Forward.", abilityId: "charge" },
      { text: "No mercy in it.", abilityId: "savage-lunge" },
      { text: "Bashed.", abilityId: "shield-bash" },
    ],
    takeHit: [
      { text: "Iron holds." },
      { text: "Nothing." },
    ],
    takeHeavyHit: [
      { text: "That dented something." },
    ],
    lowHp: [
      { text: "Iron bends, then." },
    ],
    allyDefeated: [
      { text: "One rank down." },
    ],
    kill: [
      { text: "Blessed, that." },
    ],
    death: [
      { text: "Unblessed." },
    ],
    rare: [
      { text: "Gentle was never the order." },
    ],
  },
};

export const CHOIR_MAGUS_BARKS: CombatBarkProfile = {
  id: "choir-magus",
  displayName: "Choir Magus",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "ritual fire caster — never rushes the rite",
  pools: {
    combatStart: [
      { text: "Begin the rite." },
      { text: "Attend." },
    ],
    basicAttack: [
      { text: "As written." },
    ],
    attackMiss: [
      { text: "A misstep in the rite." },
    ],
    abilityUse: [
      { text: "Kindled.", abilityId: "hellfire" },
      { text: "Rise.", abilityId: "magma-burst" },
      { text: "Screen raised.", abilityId: "anti-magic-field" },
    ],
    takeHit: [
      { text: "Patience." },
      { text: "The rite continues." },
    ],
    takeHeavyHit: [
      { text: "That was not scripted." },
    ],
    lowHp: [
      { text: "Nearly the final verse." },
    ],
    allyDefeated: [
      { text: "The rite falters." },
    ],
    kill: [
      { text: "As ordained." },
    ],
    death: [
      { text: "Unfinished rite." },
    ],
    rare: [
      { text: "The rite outlasts me." },
    ],
  },
};

export const ENEMY_BARKS_FLOOR4: readonly CombatBarkProfile[] = [
  CHOIR_WARDEN_BARKS,
  DISCORDANT_CANTOR_BARKS,
  NULL_ACOLYTE_BARKS,
  IRON_CHORISTER_BARKS,
  CHOIR_MAGUS_BARKS,
];
