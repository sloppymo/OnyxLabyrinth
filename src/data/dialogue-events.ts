/**
 * Authored labyrinth conversations.
 *
 * Floor EventDef entries reference these by `dialogueId`. Portrait ids remain
 * stable across the thesis and Great Gate scenes; the approved Rat King and
 * Old Man portraits are resolved by npc-portraits.ts.
 */

import type { DialogueEventDef } from "../game/dialogue-event";

export const RAT_KING_OLD_MAN_THESIS: DialogueEventDef = {
  id: "rat-king-old-man-thesis",
  startNodeId: "more-humans",
  speakers: [
    {
      id: "rat-king",
      name: "The Rat King",
      title: "SOVEREIGN OF VERMIN",
      mood: "bright-eyed",
      portraitId: "rat-king",
      placeholderGlyph: "RK",
      portraitSide: "left",
      accent: "warm",
    },
    {
      id: "old-man",
      name: "The Old Man",
      title: "DEATH'S PILGRIM",
      mood: "weary",
      portraitId: "old-man",
      placeholderGlyph: "OM",
      portraitSide: "right",
      accent: "cold",
    },
  ],
  nodes: [
    {
      id: "more-humans",
      speakerId: "rat-king",
      text: "I want there to be more humans.",
      nextNodeId: "granaries",
    },
    {
      id: "granaries",
      speakerId: "old-man",
      text: "You want granaries. Mills. Walls warm enough for nests.",
      nextNodeId: "yes",
    },
    {
      id: "yes",
      speakerId: "rat-king",
      text: "Yes. Cities make excellent kingdoms for rats.",
      nextNodeId: "hunger",
    },
    {
      id: "hunger",
      speakerId: "old-man",
      text: "You mistake hunger for hope.",
      nextNodeId: "happy",
    },
    {
      id: "happy",
      speakerId: "rat-king",
      text: "Perhaps. But I like humans. I would rather they were happy while they fed us.",
      nextNodeId: "death",
    },
    {
      id: "death",
      speakerId: "old-man",
      text: "I would give them the right to stop. Birth without death is another prison.",
      nextNodeId: "one-wish",
    },
    {
      id: "one-wish",
      speakerId: "rat-king",
      text: "Then ask the lamp for both.",
      nextNodeId: "only-one",
    },
    {
      id: "only-one",
      speakerId: "old-man",
      text: "It has only one wish.",
      nextNodeId: "child",
    },
    {
      id: "child",
      speakerId: "rat-king",
      text: "Then before it goes dark, I would like to see a human child.",
      nextNodeId: "born-into-this",
    },
    {
      id: "born-into-this",
      speakerId: "old-man",
      text: "A child born into this?",
      nextNodeId: "something",
    },
    {
      id: "something",
      speakerId: "rat-king",
      text: "A child born into something. That is more than any of us have now.",
    },
  ],
};

/**
 * The first Great Gate conversation: a surviving human monument prompts the
 * Rat King and Old Man to remember the world before the war.
 */
export const GREAT_GATE_OLD_MAN_RAT_KING: DialogueEventDef = {
  id: "great-gate-old-man-rat-king",
  startNodeId: "great-gate-opening",
  speakers: [
    {
      id: "rat-king",
      name: "The Rat King",
      title: "SOVEREIGN OF VERMIN",
      mood: "bright-eyed",
      portraitId: "rat-king",
      placeholderGlyph: "RK",
      portraitSide: "left",
      accent: "warm",
    },
    {
      id: "old-man",
      name: "The Old Man",
      title: "DEATH'S PILGRIM",
      mood: "weary",
      portraitId: "old-man",
      placeholderGlyph: "OM",
      portraitSide: "right",
      accent: "cold",
    },
  ],
  nodes: [
    {
      id: "great-gate-opening",
      speakerId: "rat-king",
      text: "This is it, then? The great gate to the labyrinth?",
      nextNodeId: "great-gate-yes",
    },
    {
      id: "great-gate-yes",
      speakerId: "old-man",
      text: "Yes.",
      nextNodeId: "great-gate-human-builders",
    },
    {
      id: "great-gate-human-builders",
      speakerId: "rat-king",
      text: "Humans used to build such nice things. Now you don't. Now you mostly just commit suicide or lay around starving to death over and over again.",
      nextNodeId: "great-gate-cannot-build",
    },
    {
      id: "great-gate-cannot-build",
      speakerId: "old-man",
      text: "People can't build things like this anymore. Not for thousands of years.",
      nextNodeId: "great-gate-why-not",
    },
    {
      id: "great-gate-why-not",
      speakerId: "rat-king",
      text: "Why not?",
      nextNodeId: "great-gate-after-war",
    },
    {
      id: "great-gate-after-war",
      speakerId: "old-man",
      text: "There weren't enough of us left after the war.",
      nextNodeId: "great-gate-millions",
    },
    {
      id: "great-gate-millions",
      speakerId: "rat-king",
      text: "Humans? There are millions of you left. You could build something like this again, why not?",
      nextNodeId: "great-gate-nine-hundred-years",
    },
    {
      id: "great-gate-nine-hundred-years",
      speakerId: "old-man",
      text: "We tried. It worked for about 900 years. We kept building things, we took care of the things we had built. Then we stopped.",
      nextNodeId: "great-gate-why",
    },
    {
      id: "great-gate-why",
      speakerId: "rat-king",
      text: "Why?",
      nextNodeId: "great-gate-dont-remember",
    },
    {
      id: "great-gate-dont-remember",
      speakerId: "old-man",
      text: "I don't remember -- it was so long ago.",
      nextNodeId: "great-gate-you-were-there",
    },
    {
      id: "great-gate-you-were-there",
      speakerId: "rat-king",
      text: "But you were there?",
      nextNodeId: "great-gate-mmm-hmm",
    },
    {
      id: "great-gate-mmm-hmm",
      speakerId: "old-man",
      text: "Mmm-hmm.",
      nextNodeId: "great-gate-birth-year",
    },
    {
      id: "great-gate-birth-year",
      speakerId: "rat-king",
      text: "What year were you born?",
      nextNodeId: "great-gate-what-year",
    },
    {
      id: "great-gate-what-year",
      speakerId: "old-man",
      text: "What year is it?",
      nextNodeId: "great-gate-year-4213",
    },
    {
      id: "great-gate-year-4213",
      speakerId: "rat-king",
      text: "Humans say it's 4213.",
      nextNodeId: "great-gate-time-flies",
    },
    {
      id: "great-gate-time-flies",
      speakerId: "old-man",
      text: "Ha! Time flies.",
      nextNodeId: "great-gate-before-war",
    },
    {
      id: "great-gate-before-war",
      speakerId: "rat-king",
      text: "So you remember before the war.",
      nextNodeId: "great-gate-loved-it",
    },
    {
      id: "great-gate-loved-it",
      speakerId: "old-man",
      text: "Yes. You would have loved it.",
      nextNodeId: "great-gate-stories",
    },
    {
      id: "great-gate-stories",
      speakerId: "rat-king",
      text: "I know! I know! I grew up on stories of human cities. You sowed the world with tasty grains and delicious fruits and all the stuff we both love to eat. You'd bring water to places. We love water. We share your houses. We miss all the houses.",
      nextNodeId: "great-gate-still-houses",
    },
    {
      id: "great-gate-still-houses",
      speakerId: "old-man",
      text: "There are still houses.",
      nextNodeId: "great-gate-empty-houses",
    },
    {
      id: "great-gate-empty-houses",
      speakerId: "rat-king",
      text: "Empty houses, crumbling houses. No seeds, no meat, no fruit, no bread, no water. It's boring.",
      nextNodeId: "great-gate-farm",
    },
    {
      id: "great-gate-farm",
      speakerId: "old-man",
      text: "Why don't rats learn to farm?",
      nextNodeId: "great-gate-moles",
    },
    {
      id: "great-gate-moles",
      speakerId: "rat-king",
      text: "We've tried. The moles eat all the seeds, all the seedlings.",
      nextNodeId: "great-gate-mole-wars",
    },
    {
      id: "great-gate-mole-wars",
      speakerId: "old-man",
      text: "Oh yeah. I remember the mole wars. Terrible.",
      nextNodeId: "great-gate-ancestor",
    },
    {
      id: "great-gate-ancestor",
      speakerId: "rat-king",
      text: "My great great great great grandfather was never the same after the mole wars...",
      nextNodeId: "great-gate-win",
    },
    {
      id: "great-gate-win",
      speakerId: "old-man",
      text: "Did you win the mole wars? I can't remember.",
      nextNodeId: "great-gate-shut-up",
    },
    {
      id: "great-gate-shut-up",
      speakerId: "rat-king",
      text: "Shut up.",
    },
  ],
};

export const DIALOGUE_EVENTS: readonly DialogueEventDef[] = [
  RAT_KING_OLD_MAN_THESIS,
  GREAT_GATE_OLD_MAN_RAT_KING,
];

export const DIALOGUE_EVENTS_BY_ID: Readonly<Record<string, DialogueEventDef>> = Object.fromEntries(
  DIALOGUE_EVENTS.map((event) => [event.id, event]),
);

export function dialogueEventById(id: string): DialogueEventDef | undefined {
  return DIALOGUE_EVENTS_BY_ID[id];
}
