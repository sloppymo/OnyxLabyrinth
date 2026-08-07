/**
 * Authored content for Hot Boi's tavern (Floor 1 safe room). Pure data +
 * small pure lookup helpers — no DOM, no state mutation. Consumed by
 * engine/tavern-ui.ts via game/tavern.ts.
 *
 * Progression gates read directly off GameState (raft = `keyItems`
 * includes "raft"; floor 2 reached = `deepestFloorReached >= 2`) rather
 * than any new tavern-specific flags, per the "don't invent a second
 * source of truth for progression" rule.
 */

import type { GameState } from "../types";

export function hasRaft(state: GameState): boolean {
  return state.keyItems.includes("raft");
}

function reachedFloor2(state: GameState): boolean {
  return state.deepestFloorReached >= 2;
}

// --- Greetings ---------------------------------------------------------

export function hotBoiGreeting(state: GameState, firstVisit: boolean): string {
  if (reachedFloor2(state)) {
    return "\"Back from downstairs, and still counting the same number of heads.\" Hot Boi sets out a cup without asking. \"Good. Sit.\"";
  }
  if (hasRaft(state)) {
    return "\"You found it, then.\" Hot Boi nods at the ladle in his hand like it explains something. \"The fork's yours whenever you're ready for it.\"";
  }
  if (firstVisit) {
    return "\"Welcome to Hot Boi's. Sorry about the smell.\"";
  }
  return "\"Back again.\" Hot Boi doesn't look up from the mug. \"The hall keeps its wounds open. So do I, apparently.\"";
}

// --- Talk topics ---------------------------------------------------------

export interface TalkTopicDef {
  key: string;
  label: string;
  available: (state: GameState) => boolean;
  text: (state: GameState) => string;
}

export const TALK_TOPICS: readonly TalkTopicDef[] = [
  {
    key: "tavern",
    label: "The Tavern",
    available: () => true,
    text: () =>
      "\"Built it out of what people don't come back for. Shields make good trays. Nobody's complained about the seating.\"",
  },
  {
    key: "flooded-passage",
    label: "The Flooded Passage",
    available: () => true,
    text: (state) =>
      hasRaft(state)
        ? "\"Water's the same as it was. You're just not swimming it anymore.\" He shrugs. \"Whoever docked that raft first isn't around to ask if you're welcome to it. Take that as permission.\""
        : "\"Black water cuts the right fork near the entrance. Deep, still, and it doesn't care how well you swim — no crossing it on foot.\"",
  },
  {
    key: "chute",
    label: "The Chute",
    available: () => true,
    text: (state) =>
      hasRaft(state)
        ? "\"Already took the drop once. Don't imagine you're eager for a second trip down.\""
        : "\"Sluice in the chapel wing, west side. Drops you to a sealed pocket below — that's where the raft's been sitting. One-way trip. Say goodbye to the road behind you before you step on it.\"",
  },
  {
    key: "other-adventurers",
    label: "Other Adventurers",
    available: () => true,
    text: (state) => {
      if (state.companion?.withParty) {
        return "\"Vess still owes me for four drinks. I told her the party covers debts now. She didn't argue.\"";
      }
      if (state.companion) {
        return "\"Vess is resting up top when you're ready for her again. She asked twice already.\"";
      }
      return "\"Girl at the end of the bar — Vess. Party didn't come back for her. Doesn't mean she stopped being useful in a fight.\"";
    },
  },
  {
    key: "floor-below",
    label: "The Floor Below",
    available: () => true,
    text: (state) =>
      reachedFloor2(state)
        ? "\"Shelves that shouldn't stand do. Books that shouldn't be readable, mostly aren't. You came back with the same face you left with, which is more than most manage.\""
        : "\"Never been. What I know comes secondhand and half-believed — shelves, dust, something that used to be a reading room. Ask me again once you've seen it yourself.\"",
  },
  {
    key: "why-hot-bois",
    label: "Why \"Hot Boi's\"?",
    available: () => true,
    text: () =>
      "He almost smiles. \"Named it myself. Once. I'm not doing the joke again — ask literally anyone who's already heard it.\"",
  },
];

// --- Rumors ---------------------------------------------------------------

export type RumorCategory = "hint" | "warning" | "adventurers" | "gossip" | "foreshadow";

export interface RumorDef {
  id: string;
  category: RumorCategory;
  text: string;
  available: (state: GameState) => boolean;
}

export const RUMORS: readonly RumorDef[] = [
  {
    id: "rest-before-fork",
    category: "hint",
    text: "\"Rest before the flooded fork, not after. Once you're wet there's no drying off before it matters.\"",
    available: () => true,
  },
  {
    id: "chute-one-way",
    category: "hint",
    text: "\"The chute only drops one way. Don't step on it until you're ready to lose the road behind you.\"",
    available: () => true,
  },
  {
    id: "thief-fingers",
    category: "hint",
    text: "\"A Thief's fingers are worth more down there than a Fighter's arm. Locks don't swing back.\"",
    available: () => true,
  },
  {
    id: "dark-repeats-names",
    category: "warning",
    text: "\"Someone swears the dark repeats names back at you. Wrong ones, sometimes. Don't answer either kind.\"",
    available: () => true,
  },
  {
    id: "shield-left-behind",
    category: "warning",
    text: "\"A party left a shield behind in the hot wing east. Nobody's sure if they left it, or if the wing kept the rest of them too.\"",
    available: () => true,
  },
  {
    id: "water-remembers",
    category: "warning",
    text: "\"The water past the fork doesn't just sit there. It remembers who's crossed it before.\"",
    available: () => true,
  },
  {
    id: "four-become-five",
    category: "adventurers",
    text: "\"A party of four went down the chute and came back a party of five. Nobody's asked the fifth one much.\"",
    available: () => true,
  },
  {
    id: "bell-keeper-rope",
    category: "adventurers",
    text: "\"The bellkeeper up north keeps a rope with the bell cut clean through. Doesn't explain it. Doesn't need to.\"",
    available: () => true,
  },
  {
    id: "gate-opens-within",
    category: "adventurers",
    text: "\"The barred pocket gate only lifts from inside. Whoever built it wasn't planning on visitors leaving the easy way.\"",
    available: () => true,
  },
  {
    id: "rest-price-joke",
    category: "gossip",
    text: "\"Rest costs a fair price. Screaming in your sleep is complimentary — least I can do.\"",
    available: () => true,
  },
  {
    id: "buried-cooks",
    category: "gossip",
    text: "\"I've buried better cooks than me. That's not bragging. That's just the bar around here.\"",
    available: () => true,
  },
  {
    id: "dead-mans-tab",
    category: "gossip",
    text: "\"Someone's still paying a tab under a name that isn't theirs anymore. I take the coin either way. Coin doesn't ask questions.\"",
    available: () => true,
  },
  {
    id: "past-the-fork",
    category: "foreshadow",
    text: "\"Whatever's past the fork doesn't announce itself. You'll know when the corridor stops sounding empty.\"",
    available: (state) => hasRaft(state),
  },
  {
    id: "library-keeps-readers",
    category: "foreshadow",
    text: "\"Word from below: the library keeps its books. It also keeps the people who read them wrong.\"",
    available: (state) => reachedFloor2(state),
  },
];

/** Rumors currently unlocked by progression, in authored (stable) order. */
export function unlockedRumors(state: GameState): readonly RumorDef[] {
  return RUMORS.filter((r) => r.available(state));
}

// --- Rest ------------------------------------------------------------------

/** Flat, full-party rest price. Cheaper than a single Healing Potion (25g,
 *  data/items.ts) despite restoring the whole party — deliberately a
 *  bargain, since Camp (main.ts startCamp) already offers a free full
 *  restore anywhere outside a few hazard tiles. Rest's actual edge over
 *  Camp is that it does NOT dispel active Light/Levitate buffs the way
 *  camping does (see game/tavern.ts restParty), so it's worth its modest
 *  price for a party mid-utility-buff instead of being strictly worse
 *  than the free option. */
export const REST_PRICE = 20;

export const REST_CONFIRM_TEXT = `Rest for ${REST_PRICE} gold?`;
export const REST_INSUFFICIENT_TEXT =
  "\"Twenty gold or don't lie down. The floor's free — the blanket isn't.\"";
export const REST_SUCCESS_TEXT =
  "\"Sleep it off.\" HP and SP restored. The room stays quiet about the rest.";

// --- Ambient tavern descriptions -------------------------------------------

export const AMBIENT_DESCRIPTIONS: readonly string[] = [
  "Salvaged shields double as serving trays. Half still have dents shaped like something's face.",
  "A brazier burns low behind the bar — the only warm light in the whole hall.",
  "A board by the door is scorched around the edges. Someone keeps pinning notices to it anyway.",
  "Bedrolls line the back wall, each one facing the door. Nobody sleeps with their back to it.",
];
