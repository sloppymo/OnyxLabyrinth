/** Bark content — Floor 5 (The Weeping Cistern). */

import type { CombatBarkProfile } from "./types";

export const DROWNED_SENTINEL_BARKS: CombatBarkProfile = {
  id: "drowned-sentinel",
  displayName: "Drowned Sentinel",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "heavy, sparse, waterlogged — inert, holding a post nobody relieved",
  pools: {
    combatStart: [{ text: "*waterlogged groan*" }],
    abilityUse: [{ text: "Hold.", abilityId: "phalanx-guard" }],
    takeHit: [{ text: "*groan*" }],
    death: [{ text: "Post... held." }],
  },
};

export const CISTERN_WRAITH_BARKS: CombatBarkProfile = {
  id: "cistern-wraith",
  displayName: "Cistern Wraith",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "cold, drowned whisper — wants warmth taken from someone else",
  pools: {
    combatStart: [{ text: "Cold." }],
    abilityUse: [{ text: "Sink.", abilityId: "ice-shards" }],
    takeHit: [{ text: "..." }],
    death: [{ text: "Under, again." }],
  },
};

export const WEEPING_REVENANT_BARKS: CombatBarkProfile = {
  id: "weeping-revenant",
  displayName: "Weeping Revenant",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "grief-fragment — wants to stop weeping, never manages it",
  pools: {
    combatStart: [{ text: "Why." }],
    takeHit: [{ text: "Still." }],
    death: [{ text: "...finally." }],
  },
};

export const FLOOD_BRUTE_BARKS: CombatBarkProfile = {
  id: "flood-brute",
  displayName: "Flood Brute",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "brutish, waterlogged strongman — wants something to break",
  pools: {
    combatStart: [{ text: "*roar*" }],
    takeHit: [{ text: "*grunt*" }],
    death: [{ text: "*sinks*" }],
  },
};

export const UNDERTOW_CALLER_BARKS: CombatBarkProfile = {
  id: "undertow-caller",
  displayName: "Undertow Caller",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "water-cult priest, intelligent — wants the tide to answer, sounds certain",
  pools: {
    combatStart: [
      { text: "The tide hears." },
      { text: "Come, current." },
    ],
    basicAttack: [
      { text: "As the tide wills." },
    ],
    attackMiss: [
      { text: "The current missed." },
    ],
    abilityUse: [
      { text: "Answer.", abilityId: "ice-shards" },
      { text: "Blind, as the deep is.", abilityId: "blinding-gaze" },
      { text: "Hexed.", abilityId: "curse" },
    ],
    takeHit: [
      { text: "Undeterred." },
    ],
    takeHeavyHit: [
      { text: "The tide answers back." },
    ],
    lowHp: [
      { text: "The current thins." },
    ],
    allyDefeated: [
      { text: "One voice pulled under." },
    ],
    kill: [
      { text: "Taken by the tide." },
    ],
    death: [
      { text: "The tide takes me." },
    ],
    rare: [
      { text: "The deep does not forgive." },
    ],
  },
};

export const ICE_GOLEM_BARKS: CombatBarkProfile = {
  id: "ice-golem",
  displayName: "Ice Golem",
  kind: "enemy",
  voiceMode: "silent",
  voiceSummary: "frozen, patient — ice-groan and crack only",
  pools: {
    combatStart: [{ text: "*ice groans*" }],
    abilityUse: [{ text: "*frost cracks*", abilityId: "flash-freeze" }],
    death: [{ text: "*shatters*" }],
  },
};

export const ENEMY_BARKS_FLOOR5: readonly CombatBarkProfile[] = [
  DROWNED_SENTINEL_BARKS,
  CISTERN_WRAITH_BARKS,
  WEEPING_REVENANT_BARKS,
  FLOOD_BRUTE_BARKS,
  UNDERTOW_CALLER_BARKS,
  ICE_GOLEM_BARKS,
];
