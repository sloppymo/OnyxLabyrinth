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
    combatStart: [{ text: "Hold the verse." }],
    abilityUse: [{ text: "Hold.", abilityId: "phalanx-guard" }],
    takeHit: [{ text: "Endured." }],
    death: [{ text: "The verse ends." }],
  },
};

export const DISCORDANT_CANTOR_BARKS: CombatBarkProfile = {
  id: "discordant-cantor",
  displayName: "Discordant Cantor",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "unsettling melodic caster — the wrong note, on purpose",
  pools: {
    combatStart: [{ text: "Listen." }],
    abilityUse: [
      { text: "Wrong note.", abilityId: "lightning-strike" },
      { text: "Screen up.", abilityId: "anti-magic-field" },
    ],
    takeHit: [{ text: "Off-key." }],
    death: [{ text: "Still discordant." }],
  },
};

export const NULL_ACOLYTE_BARKS: CombatBarkProfile = {
  id: "null-acolyte",
  displayName: "Null Acolyte",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "fanatic, hushed — silence enforced, doctrine never explained",
  pools: {
    combatStart: [{ text: "Quiet, now." }],
    abilityUse: [{ text: "Seen.", abilityId: "blinding-gaze" }],
    takeHit: [{ text: "Unmoved." }],
    death: [{ text: "Silenced." }],
  },
};

export const IRON_CHORISTER_BARKS: CombatBarkProfile = {
  id: "iron-chorister",
  displayName: "Iron Chorister",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "heavy undead zealot, aggressive — never sounds gentle",
  pools: {
    combatStart: [{ text: "Blessed charge." }],
    abilityUse: [{ text: "Forward.", abilityId: "charge" }],
    takeHit: [{ text: "Iron holds." }],
    death: [{ text: "Unblessed." }],
  },
};

export const CHOIR_MAGUS_BARKS: CombatBarkProfile = {
  id: "choir-magus",
  displayName: "Choir Magus",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "ritual fire caster — never rushes the rite",
  pools: {
    combatStart: [{ text: "Begin the rite." }],
    abilityUse: [
      { text: "Kindled.", abilityId: "hellfire" },
      { text: "Rise.", abilityId: "magma-burst" },
    ],
    takeHit: [{ text: "Patience." }],
    death: [{ text: "Unfinished rite." }],
  },
};

export const ENEMY_BARKS_FLOOR4: readonly CombatBarkProfile[] = [
  CHOIR_WARDEN_BARKS,
  DISCORDANT_CANTOR_BARKS,
  NULL_ACOLYTE_BARKS,
  IRON_CHORISTER_BARKS,
  CHOIR_MAGUS_BARKS,
];
