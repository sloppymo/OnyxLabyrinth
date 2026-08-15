/**
 * Bark content for recruitable companions (see `game/companion.ts`).
 * Only one companion exists in this release — Vess, "Fifth Chair".
 */

import type { CombatBarkProfile } from "./types";

export const FIFTH_CHAIR_BARKS: CombatBarkProfile = {
  id: "fifth-chair",
  displayName: "Vess",
  kind: "companion",
  voiceMode: "articulate",
  voiceSummary: "guarded survivor of her own dead party, dry gallows humor, watches more than she talks",
  pools: {
    combatStart: [
      { text: "I know how this goes." },
      { text: "Fine. Again." },
      { text: "Ready when you are." },
      { text: "Let's not lose anyone." },
    ],
    basicAttack: [
      { text: "There." },
      { text: "Move on." },
    ],
    attackMiss: [
      { text: "Missed." },
      { text: "Hm." },
    ],
    criticalHit: [
      { text: "Good." },
      { text: "That'll do." },
    ],
    takeHit: [
      { text: "Fine." },
      { text: "Felt that." },
    ],
    takeHeavyHit: [
      { text: "That was close." },
      { text: "Okay. Noted." },
    ],
    lowHp: [
      { text: "Not again." },
      { text: "I've done this before." },
    ],
    healed: [
      { text: "Thanks." },
      { text: "Owed." },
    ],
    allyLowHp: [
      { text: "Stay up." },
    ],
    allyDefeated: [
      { text: "No. Not this party too." },
      { text: "Get up. Please." },
    ],
    kill: [
      { text: "One less." },
      { text: "Done." },
    ],
    ko: [
      { text: "Not like this." },
      { text: "...outlived worse." },
    ],
    revived: [
      { text: "Still here." },
      { text: "Good." },
    ],
    victory: [
      { text: "Everyone's still standing." },
      { text: "Good. Keep it that way." },
    ],
    chemistrySelected: [
      { text: "I've seen worse tricks.", chemistryId: "slime-cannon" },
    ],
    bossPhase: [
      { text: "Of course there's more." },
    ],
    returningEncounter: [
      { text: "Back again." },
    ],
    rare: [
      { text: "Further than my last party." },
      { text: "Not losing another chair." },
    ],
  },
};

export const COMPANION_BARKS: readonly CombatBarkProfile[] = [FIFTH_CHAIR_BARKS];
