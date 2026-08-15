/**
 * Bark content for every playable class (see `game/party.ts` CLASSES).
 *
 * PCs are player-named/custom-built, not fixed protagonists, so personality
 * attaches to the class/archetype — the one thing every character of a given
 * class shares — not to a name the content system can't know in advance.
 * Voice bible: docs/COMBAT-BARK-AUDIT.md.
 */

import type { CombatBarkProfile } from "./types";

export const FIGHTER_BARKS: CombatBarkProfile = {
  id: "Fighter",
  displayName: "Fighter",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "practical, low patience, pain-tolerant, picks the direct solution because it works",
  pools: {
    combatStart: [
      { text: "Alright." },
      { text: "Let's go." },
      { text: "Again." },
      { text: "Fine." },
      { text: "Ready." },
      { text: "Here we go." },
    ],
    basicAttack: [
      { text: "Hit it." },
      { text: "There." },
      { text: "Take that." },
      { text: "Down you go." },
    ],
    attackMiss: [
      { text: "Didn't." },
      { text: "Missed." },
      { text: "Tch." },
      { text: "Hold still." },
    ],
    criticalHit: [
      { text: "That worked." },
      { text: "Good." },
      { text: "There we go." },
      { text: "Ha." },
    ],
    takeHit: [
      { text: "Fine." },
      { text: "Barely." },
      { text: "That's nothing." },
      { text: "Still standing." },
      { text: "Hm." },
    ],
    takeHeavyHit: [
      { text: "That hurt." },
      { text: "Okay. That counted." },
      { text: "Right." },
      { text: "Noted." },
    ],
    lowHp: [
      { text: "Not done." },
      { text: "I've had worse." },
      { text: "Keep going." },
      { text: "This is fine." },
      { text: "Almost." },
    ],
    healed: [
      { text: "Thanks." },
      { text: "Better." },
      { text: "Needed that." },
    ],
    allyLowHp: [
      { text: "Get behind me." },
      { text: "Hang on." },
    ],
    allyDefeated: [
      { text: "No." },
      { text: "Get up." },
      { text: "Damn it." },
      { text: "Not again." },
    ],
    kill: [
      { text: "Down." },
      { text: "Next." },
      { text: "Done." },
    ],
    enemyDefeated: [
      { text: "Next." },
      { text: "Good." },
    ],
    ko: [
      { text: "Not... done." },
      { text: "Get me up." },
      { text: "Fine." },
    ],
    revived: [
      { text: "Back." },
      { text: "Okay." },
      { text: "Let's go." },
    ],
    flee: [
      { text: "Fall back." },
      { text: "Not this fight." },
    ],
    victory: [
      { text: "Done." },
      { text: "Good fight." },
      { text: "That's that." },
      { text: "Next." },
    ],
    abilityUse: [
      { text: "Hard swing.", abilityId: "fighter-power-attack" },
      { text: "Over here.", abilityId: "fighter-taunt" },
      { text: "All of you.", abilityId: "fighter-whirlwind" },
      { text: "Hold.", abilityId: "fighter-shield-bash" },
    ],
    chemistrySelected: [
      { text: "Oh.", chemistryId: "slime-cannon" },
      { text: "That's new.", chemistryId: "spawn-bomb" },
    ],
    chemistryWitness: [
      { text: "Kill it fast.", chemistryId: "bone-harvest" },
    ],
    bossPhase: [
      { text: "Naturally." },
      { text: "Of course there's more." },
    ],
    returningEncounter: [
      { text: "You again." },
      { text: "Yeah." },
    ],
    rare: [
      { text: "Enough." },
      { text: "Really." },
      { text: "Not today." },
      { text: "I said enough." },
    ],
  },
};

export const MAGE_BARKS: CombatBarkProfile = {
  id: "Mage",
  displayName: "Mage",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "brilliant, physically miserable, irritated whenever forced into melee",
  pools: {
    combatStart: [
      { text: "Give me a second." },
      { text: "Fine. Working." },
      { text: "Not ideal." },
      { text: "Let's not do this." },
      { text: "Ready." },
      { text: "One moment." },
    ],
    basicAttack: [
      { text: "This is beneath me." },
      { text: "Fine, physically, then." },
      { text: "Ugh." },
    ],
    attackMiss: [
      { text: "That should have worked." },
      { text: "Odd." },
      { text: "Recalculating." },
    ],
    criticalHit: [
      { text: "That's all I have." },
      { text: "Correct." },
      { text: "Good." },
    ],
    takeHit: [
      { text: "Great." },
      { text: "Rude." },
      { text: "I felt that." },
      { text: "Not helpful." },
    ],
    takeHeavyHit: [
      { text: "Jesus." },
      { text: "That was too much." },
      { text: "Okay, ow." },
    ],
    lowHp: [
      { text: "This is bad." },
      { text: "Please kill that." },
      { text: "I'm fragile, remember?" },
      { text: "Someone. Anyone." },
    ],
    healed: [
      { text: "Thank you." },
      { text: "Better." },
    ],
    allyLowHp: [
      { text: "Move. Please." },
      { text: "That's a problem." },
    ],
    allyDefeated: [
      { text: "No." },
      { text: "That's not good." },
    ],
    kill: [
      { text: "Obviously." },
      { text: "As expected." },
      { text: "Done." },
    ],
    ko: [
      { text: "Bad." },
      { text: "Told you." },
    ],
    revived: [
      { text: "Thank you." },
      { text: "Right. Working." },
    ],
    flee: [
      { text: "Yes. Good idea." },
    ],
    victory: [
      { text: "Finally." },
      { text: "Good." },
      { text: "That was inefficient." },
    ],
    spellCast: [
      { text: "Watch this.", abilityId: "mage-fireball" },
      { text: "Small favor.", abilityId: "mage-frostbite" },
      { text: "Hold still.", abilityId: "mage-hold-person" },
      { text: "This will hurt.", abilityId: "mage-meteor-swarm" },
    ],
    chemistrySelected: [
      { text: "Kill the slime.", chemistryId: "slime-cannon" },
      { text: "Interesting.", chemistryId: "rune-overload" },
    ],
    bossPhase: [
      { text: "Of course." },
      { text: "There's more." },
    ],
    returningEncounter: [
      { text: "Again?" },
    ],
    rare: [
      { text: "I hate this dungeon." },
      { text: "Why am I here." },
      { text: "Fine. FINE." },
    ],
  },
};

export const PRIEST_BARKS: CombatBarkProfile = {
  id: "Priest",
  displayName: "Priest",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "competent, overworked, dry about how healing has become everyone's whole strategy",
  pools: {
    combatStart: [
      { text: "Try not to need this." },
      { text: "Ready." },
      { text: "Here we are again." },
      { text: "Fine." },
      { text: "Let's begin." },
    ],
    basicAttack: [
      { text: "If I must." },
      { text: "Not my preference." },
    ],
    attackMiss: [
      { text: "Hm." },
      { text: "Missed." },
    ],
    criticalHit: [
      { text: "There." },
      { text: "Good." },
    ],
    takeHit: [
      { text: "Fine." },
      { text: "I'll manage." },
      { text: "Noted." },
    ],
    takeHeavyHit: [
      { text: "That one hurt." },
      { text: "Ow." },
    ],
    lowHp: [
      { text: "I need a moment." },
      { text: "This is inconvenient." },
      { text: "Someone watch me." },
    ],
    healed: [
      { text: "Thank you." },
      { text: "Appreciated." },
    ],
    healCast: [
      { text: "Again.", abilityId: "priest-cure-wounds" },
      { text: "Hold still." },
      { text: "You're welcome.", abilityId: "priest-mass-heal" },
      { text: "Stop doing that." },
      { text: "Next." },
    ],
    allyLowHp: [
      { text: "Hold on." },
      { text: "Working on it." },
    ],
    allyDefeated: [
      { text: "No." },
      { text: "Not now." },
      { text: "Hold on—" },
    ],
    kill: [
      { text: "Forgiven." },
      { text: "Done." },
    ],
    ko: [
      { text: "Someone else heal." },
      { text: "...oh, that's ironic." },
    ],
    revived: [
      { text: "Back with us." },
      { text: "There you are." },
    ],
    flee: [
      { text: "Agreed." },
    ],
    victory: [
      { text: "That's enough for today." },
      { text: "Good." },
      { text: "No one died. Progress." },
    ],
    chemistrySelected: [
      { text: "Of course.", chemistryId: "slime-cannon" },
      { text: "Someone stop that.", chemistryId: "spawn-bomb" },
    ],
    bossPhase: [
      { text: "Wonderful." },
      { text: "There's more." },
    ],
    returningEncounter: [
      { text: "Again." },
    ],
    rare: [
      { text: "I am one person." },
      { text: "You're all children." },
      { text: "Fine. FINE." },
    ],
  },
};

export const THIEF_BARKS: CombatBarkProfile = {
  id: "Thief",
  displayName: "Thief",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "professional opportunist, risk tolerance bordering on irresponsible, always pricing the room",
  pools: {
    combatStart: [
      { text: "Fine, quickly then." },
      { text: "Let's get this over with." },
      { text: "Ready." },
      { text: "Again." },
    ],
    basicAttack: [
      { text: "There." },
      { text: "Easy." },
      { text: "Didn't even see it." },
    ],
    attackMiss: [
      { text: "Huh." },
      { text: "Off-balance." },
    ],
    criticalHit: [
      { text: "Nice." },
      { text: "Right where I wanted it." },
    ],
    takeHit: [
      { text: "Rude." },
      { text: "Fine." },
      { text: "Didn't dodge that one." },
    ],
    takeHeavyHit: [
      { text: "Okay, that's a lot." },
      { text: "Not worth it." },
    ],
    lowHp: [
      { text: "Getting expensive." },
      { text: "Time to leave, maybe." },
      { text: "Not great." },
    ],
    healed: [
      { text: "Owe you one." },
      { text: "Thanks." },
    ],
    allyDefeated: [
      { text: "Damn." },
      { text: "Not good." },
    ],
    kill: [
      { text: "Mine." },
      { text: "Cleared." },
      { text: "Next." },
    ],
    ko: [
      { text: "Keep my stuff." },
      { text: "Unlucky." },
    ],
    revived: [
      { text: "Back in it." },
      { text: "Thanks." },
    ],
    flee: [
      { text: "Now we're talking." },
      { text: "Finally." },
    ],
    victory: [
      { text: "So, loot." },
      { text: "Good. What's here." },
      { text: "Done. Search it." },
    ],
    abilityUse: [
      { text: "Didn't see that coming.", abilityId: "thief-feint" },
      { text: "Nothing personal.", abilityId: "thief-throat-slash" },
      { text: "This'll sting.", abilityId: "thief-poison-blade" },
    ],
    chemistrySelected: [
      { text: "Probably trapped.", chemistryId: "bone-harvest" },
      { text: "Worth watching.", chemistryId: "slime-cannon" },
    ],
    bossPhase: [
      { text: "Great. More of this." },
    ],
    returningEncounter: [
      { text: "You're still here?" },
    ],
    rare: [
      { text: "This job." },
      { text: "I'm underpaid." },
      { text: "Worth it. Probably." },
    ],
  },
};

export const HALBERDIER_BARKS: CombatBarkProfile = {
  id: "Halberdier",
  displayName: "Halberdier",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "methodical, reach-obsessed, formal about distance, mildly pedantic about who's standing where",
  pools: {
    combatStart: [
      { text: "Positions." },
      { text: "Hold your line." },
      { text: "Distance, please." },
      { text: "Ready." },
    ],
    basicAttack: [
      { text: "Reach." },
      { text: "From here." },
      { text: "There." },
    ],
    attackMiss: [
      { text: "Too close." },
      { text: "Adjusting." },
    ],
    criticalHit: [
      { text: "Textbook." },
      { text: "Correct range." },
    ],
    takeHit: [
      { text: "That's what the line is for." },
      { text: "Noted." },
      { text: "Hold." },
    ],
    takeHeavyHit: [
      { text: "Closer than I like." },
      { text: "That was avoidable." },
    ],
    lowHp: [
      { text: "Losing ground." },
      { text: "Reset the line." },
    ],
    healed: [
      { text: "Appreciated." },
      { text: "Good." },
    ],
    allyDefeated: [
      { text: "The line's broken." },
      { text: "No." },
    ],
    kill: [
      { text: "Cleared." },
      { text: "Next rank." },
    ],
    ko: [
      { text: "Hold the line without me." },
      { text: "Damn." },
    ],
    revived: [
      { text: "Back in formation." },
    ],
    victory: [
      { text: "Line held." },
      { text: "Good work." },
    ],
    abilityUse: [
      { text: "Full extension.", abilityId: "halberdier-impale" },
      { text: "Get back.", abilityId: "halberdier-pike-wall" },
      { text: "Clearing the row.", abilityId: "halberdier-sweep" },
    ],
    chemistrySelected: [
      { text: "That's a range problem now.", chemistryId: "slime-cannon" },
    ],
    bossPhase: [
      { text: "Recalculate the range." },
    ],
    returningEncounter: [
      { text: "You. Again." },
    ],
    rare: [
      { text: "Nobody respects reach." },
      { text: "This is why range matters." },
    ],
  },
};

export const DUELIST_BARKS: CombatBarkProfile = {
  id: "Duelist",
  displayName: "Duelist",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "precise, quietly competitive about form, treats a sloppy hit as worse than a missed one",
  pools: {
    combatStart: [
      { text: "En garde, I suppose." },
      { text: "Let's see form." },
      { text: "Ready." },
    ],
    basicAttack: [
      { text: "Clean." },
      { text: "There." },
      { text: "Touch." },
    ],
    attackMiss: [
      { text: "Sloppy." },
      { text: "Missed my mark." },
    ],
    criticalHit: [
      { text: "Perfect line." },
      { text: "Exactly there." },
    ],
    takeHit: [
      { text: "Ungraceful of me." },
      { text: "Fine." },
    ],
    takeHeavyHit: [
      { text: "That was not clean." },
      { text: "Noted. Painfully." },
    ],
    lowHp: [
      { text: "This has gotten untidy." },
      { text: "Need an opening." },
    ],
    healed: [
      { text: "Much better." },
    ],
    allyDefeated: [
      { text: "No." },
      { text: "That shouldn't happen." },
    ],
    kill: [
      { text: "Touché." },
      { text: "Clean finish." },
    ],
    ko: [
      { text: "Poor form on my part." },
    ],
    revived: [
      { text: "Round two." },
    ],
    victory: [
      { text: "A clean bout." },
      { text: "Adequate." },
    ],
    abilityUse: [
      { text: "Riposte.", abilityId: "duelist-riposte" },
      { text: "Perfect line.", abilityId: "duelist-perfect-strike" },
      { text: "Disarmed.", abilityId: "duelist-disarm" },
    ],
    chemistrySelected: [
      { text: "Inelegant, but effective.", chemistryId: "ogre-toss" },
    ],
    bossPhase: [
      { text: "A worthy escalation." },
    ],
    returningEncounter: [
      { text: "We meet again." },
    ],
    rare: [
      { text: "This is a brawl, not a duel." },
      { text: "Undignified." },
    ],
  },
};

export const CRUSADER_BARKS: CombatBarkProfile = {
  id: "Crusader",
  displayName: "Crusader",
  kind: "class",
  voiceMode: "articulate",
  voiceSummary: "duty-bound, unshowy faith, treats holy war as a job like anyone else's",
  pools: {
    combatStart: [
      { text: "As ordained." },
      { text: "Let's finish this." },
      { text: "Ready." },
      { text: "Again." },
    ],
    basicAttack: [
      { text: "For what it's worth." },
      { text: "There." },
    ],
    attackMiss: [
      { text: "Not this time." },
    ],
    criticalHit: [
      { text: "Judged." },
      { text: "So it goes." },
    ],
    takeHit: [
      { text: "Fine." },
      { text: "Endured." },
    ],
    takeHeavyHit: [
      { text: "That was a test." },
      { text: "Noted." },
    ],
    lowHp: [
      { text: "Faith, mostly." },
      { text: "Still standing. Barely." },
    ],
    healed: [
      { text: "Thank you." },
    ],
    healCast: [
      { text: "Rest easy.", abilityId: "crusader-lay-on-hands" },
    ],
    allyDefeated: [
      { text: "No." },
      { text: "Not this one." },
    ],
    kill: [
      { text: "Judgment rendered.", abilityId: "crusader-judgment" },
      { text: "Done." },
    ],
    ko: [
      { text: "Faith holds." },
    ],
    revived: [
      { text: "Rise." },
    ],
    victory: [
      { text: "As it should be." },
      { text: "Good." },
    ],
    abilityUse: [
      { text: "Be smitten.", abilityId: "crusader-smite" },
    ],
    chemistrySelected: [
      { text: "A mercy, technically.", chemistryId: "bone-harvest" },
    ],
    bossPhase: [
      { text: "Naturally." },
    ],
    returningEncounter: [
      { text: "Back?" },
      { text: "Yeah." },
    ],
    rare: [
      { text: "God's will, apparently." },
      { text: "This job." },
    ],
  },
};

export const PLAYER_CLASS_BARKS: readonly CombatBarkProfile[] = [
  FIGHTER_BARKS,
  MAGE_BARKS,
  PRIEST_BARKS,
  THIEF_BARKS,
  HALBERDIER_BARKS,
  DUELIST_BARKS,
  CRUSADER_BARKS,
];
