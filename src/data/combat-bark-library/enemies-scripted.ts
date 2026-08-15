/**
 * Bark content — "The Party That Returned" (Floor 1 capstone scripted
 * fight, `game/features.ts` stairsGuardian). A ruined four-person party
 * mirroring the player's own Fighter/Thief/Mage/Priest roles.
 *
 * Written deliberately against the PC voice profiles in ./player-classes.ts
 * — the same short words the living party says ("Fine." "Again." "Mine."
 * "Cold."), hollowed out and wrong. `floors: []` in EnemyDef (out of the
 * random encounter table) but very much real production content, not
 * debug scaffolding — see BARK_SILENT_EXCLUSIONS in ./index.ts for the one
 * enemy that actually is.
 */

import type { CombatBarkProfile } from "./types";

export const RUINED_VANGUARD_BARKS: CombatBarkProfile = {
  id: "ruined-vanguard",
  displayName: "Ruined Vanguard",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "a Fighter's practicality, worn to instinct — still holding a line no one asked for",
  pools: {
    combatStart: [
      { text: "Again." },
      { text: "Fine." },
    ],
    abilityUse: [
      { text: "Hold.", abilityId: "phalanx-guard" },
    ],
    takeHit: [
      { text: "Fine." },
    ],
    death: [
      { text: "...still fine." },
    ],
    rare: [
      { text: "Get behind me." },
    ],
  },
};

export const HOLLOW_KNIFEMAN_BARKS: CombatBarkProfile = {
  id: "hollow-knifeman",
  displayName: "Hollow Knifeman",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "a Thief's opportunism, hollowed to hunger — takes the wounded one, no charm left",
  pools: {
    combatStart: [
      { text: "Mine." },
    ],
    abilityUse: [
      { text: "Weak one.", abilityId: "opportunist-strike" },
    ],
    takeHit: [
      { text: "Rude." },
    ],
    death: [
      { text: "Unlucky." },
    ],
  },
};

export const ASH_SCRIBE_BARKS: CombatBarkProfile = {
  id: "ash-scribe",
  displayName: "Ash Scribe",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "a Mage's irritation, burnt to embers — the old spellcraft, hollowed",
  pools: {
    combatStart: [
      { text: "Cold." },
    ],
    takeHit: [
      { text: "Great." },
    ],
    death: [
      { text: "...finally." },
    ],
  },
};

export const DROWNED_CANTOR_BARKS: CombatBarkProfile = {
  id: "drowned-cantor",
  displayName: "Drowned Cantor",
  kind: "enemy",
  voiceMode: "fragmentary",
  voiceSummary: "a Priest's healing reflex, still firing — tries to heal what can't be healed",
  pools: {
    combatStart: [
      { text: "Again." },
    ],
    healCast: [
      { text: "Rest." },
    ],
    takeHit: [
      { text: "Fine." },
    ],
    death: [
      { text: "...no one left to heal." },
    ],
  },
};

export const ENEMY_BARKS_SCRIPTED: readonly CombatBarkProfile[] = [
  RUINED_VANGUARD_BARKS,
  HOLLOW_KNIFEMAN_BARKS,
  ASH_SCRIBE_BARKS,
  DROWNED_CANTOR_BARKS,
];
