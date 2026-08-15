/**
 * Bark content — Floor 1 (The Flooded Crypt).
 *
 * training-dummy is intentionally excluded (see BARK_SILENT_EXCLUSIONS in
 * ./index.ts) — no profile here for it.
 */

import type { CombatBarkProfile } from "./types";

export const SLIME_BARKS: CombatBarkProfile = {
  id: "slime",
  displayName: "Slime",
  kind: "enemy",
  voiceMode: "vocalization",
  voiceSummary: "harmlessly anxious ooze; rare single-word exceptions only, never a sentence",
  pools: {
    combatStart: [
      { text: "*squelch*" },
      { text: "*bloop*" },
    ],
    basicAttack: [
      { text: "*splat*" },
    ],
    takeHit: [
      { text: "*squelch*" },
      { text: "Ow." },
    ],
    lowHp: [
      { text: "*wobbles*" },
    ],
    death: [
      { text: "*splat*" },
      { text: "Oh." },
    ],
    chemistrySelected: [
      { text: "No.", chemistryId: "slime-cannon" },
    ],
    chemistryTelegraph: [
      { text: "Wait.", chemistryId: "slime-cannon" },
    ],
    chemistryResolve: [
      { text: "nooooooo", chemistryId: "slime-cannon", weight: 1, oncePerCombat: true },
    ],
    chemistryWitness: [
      { text: "...", chemistryId: "slime-cannon" },
    ],
    rare: [
      { text: "Why." },
    ],
  },
};

export const SKELETON_BARKS: CombatBarkProfile = {
  id: "skeleton",
  displayName: "Skeleton",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "exhausted, resigned — this has apparently happened many times before",
  pools: {
    combatStart: [
      { text: "Here we go." },
      { text: "Again." },
      { text: "Fine." },
    ],
    basicAttack: [
      { text: "There." },
    ],
    attackMiss: [
      { text: "Missed." },
    ],
    takeHit: [
      { text: "Rude." },
      { text: "Again?" },
    ],
    takeHeavyHit: [
      { text: "Ow." },
    ],
    lowHp: [
      { text: "Almost done." },
    ],
    death: [
      { text: "Finally." },
      { text: "..." },
    ],
    chemistrySelected: [
      { text: "No.", chemistryId: "bone-harvest" },
      { text: "Again?", chemistryId: "bone-harvest" },
      { text: "No.", chemistryId: "ogre-toss" },
    ],
    chemistryVictim: [
      { text: "Come on.", chemistryId: "bone-harvest", oncePerCombat: true },
    ],
    chemistryWitness: [
      { text: "Of course.", chemistryId: "ogre-toss" },
    ],
    returningEncounter: [
      { text: "Back?" },
    ],
    rare: [
      { text: "Still here." },
      { text: "Working." },
    ],
  },
};

export const RED_SKELETON_BARKS: CombatBarkProfile = {
  id: "red-skeleton",
  displayName: "Red Skeleton",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "skeleton's exhaustion plus a faint, unbothered awareness it's the shiny one",
  pools: {
    combatStart: [
      { text: "Here we go." },
      { text: "Again." },
    ],
    takeHit: [
      { text: "Rude." },
    ],
    death: [
      { text: "Finally." },
      { text: "Worth it, I hear." },
    ],
    rare: [
      { text: "Don't ask." },
    ],
  },
};

export const SKELETON_ARCHER_BARKS: CombatBarkProfile = {
  id: "skeleton-archer",
  displayName: "Skeleton Archer",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "quieter than skeleton — patient, focused on the shot, back row",
  pools: {
    combatStart: [
      { text: "Ready." },
    ],
    abilityUse: [
      { text: "Hold still.", abilityId: "archer-volley" },
    ],
    takeHit: [
      { text: "Hm." },
    ],
    death: [
      { text: "..." },
    ],
    rare: [
      { text: "Quiet." },
    ],
  },
};

export const ENEMY_BARKS_FLOOR1: readonly CombatBarkProfile[] = [
  SLIME_BARKS,
  SKELETON_BARKS,
  RED_SKELETON_BARKS,
  SKELETON_ARCHER_BARKS,
];
