/**
 * Bark content — the three campaign bosses (headmasters-echo /
 * -remnant / -ascendant, "The Dead Boy" / "The Lonely Girl" / "The Crying
 * Man"). One escalating entity across floors 3/4/5, not three separate
 * personalities — written as a single throughline that grows more
 * fractured and dreadful, not funnier.
 *
 * The existing shipped MVP (`src/data/combat-barks.ts`) already has a
 * `beforeSpell`/`death` starter line for each of these three ids — carried
 * forward verbatim here (mapped onto this library's `spellCast`/`death`
 * triggers) so a future integration doesn't lose voice continuity:
 *   headmasters-echo:            "The forge remembers." / "Stay." / "The ash settles."
 *   headmasters-echo-remnant:    "Don't leave." / "Read me." / "The page turns."
 *   headmasters-echo-ascendant:  "We were kept." / "Listen." / "The crying stops."
 * See docs/COMBAT-BARK-INTEGRATION-CONTRACT.md for the full mapping.
 */

import type { CombatBarkProfile } from "./types";

export const HEADMASTERS_ECHO_BARKS: CombatBarkProfile = {
  id: "headmasters-echo",
  displayName: "The Dead Boy",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "a child's grief, echoing — wants to be remembered, dread through restraint",
  pools: {
    combatStart: [
      { text: "You again." },
      { text: "Stay." },
    ],
    spellCast: [
      { text: "The forge remembers." },
      { text: "Stay." },
    ],
    takeHit: [
      { text: "..." },
    ],
    takeHeavyHit: [
      { text: "That's not fair." },
    ],
    lowHp: [
      { text: "Don't." },
    ],
    bossPhase: [
      // A second identical phase line reads as a UI loop; let the silence
      // carry the escalation after the first authored beat.
      { text: "More.", oncePerCombat: true },
    ],
    death: [
      { text: "The ash settles." },
    ],
    rare: [
      { text: "I was only playing." },
    ],
  },
};

export const HEADMASTERS_ECHO_REMNANT_BARKS: CombatBarkProfile = {
  id: "headmasters-echo-remnant",
  displayName: "The Lonely Girl",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "the same grief, more fragmented, more pleading — the echo is fraying",
  pools: {
    combatStart: [
      { text: "You came back." },
      { text: "Don't leave." },
    ],
    spellCast: [
      { text: "Don't leave." },
      { text: "Read me." },
    ],
    takeHit: [
      { text: "..." },
    ],
    takeHeavyHit: [
      { text: "That hurt him too." },
    ],
    lowHp: [
      { text: "Not the end." },
    ],
    bossPhase: [
      { text: "More pages.", oncePerCombat: true },
    ],
    death: [
      { text: "The page turns." },
    ],
    rare: [
      { text: "I kept every letter." },
    ],
  },
};

export const HEADMASTERS_ECHO_ASCENDANT_BARKS: CombatBarkProfile = {
  id: "headmasters-echo-ascendant",
  displayName: "The Crying Man",
  kind: "enemy",
  voiceMode: "articulate",
  voiceSummary: "the throughline at its most fractured — least composed, still not comedic",
  pools: {
    combatStart: [
      { text: "You came anyway." },
      { text: "We were kept." },
    ],
    spellCast: [
      { text: "We were kept." },
      { text: "Listen." },
    ],
    takeHit: [
      { text: "..." },
    ],
    takeHeavyHit: [
      { text: "Not again." },
    ],
    lowHp: [
      { text: "Please. Not yet." },
    ],
    bossPhase: [
      { text: "More.", oncePerCombat: true },
      { text: "Still more.", oncePerCombat: true },
      { text: "There's always more.", oncePerCombat: true },
    ],
    death: [
      { text: "The crying stops." },
    ],
    rare: [
      { text: "I remember all of you." },
    ],
  },
};

export const ENEMY_BARKS_BOSSES: readonly CombatBarkProfile[] = [
  HEADMASTERS_ECHO_BARKS,
  HEADMASTERS_ECHO_REMNANT_BARKS,
  HEADMASTERS_ECHO_ASCENDANT_BARKS,
];
