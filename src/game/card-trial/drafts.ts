/**
 * Bounded tactical drafts for the two live hero card pools.
 *
 * A draft is a curated gamble: one Safe, one Greedy, and one Context option,
 * shown in a shuffled display order. Choices never enter a deck, discard
 * pile, collection, or another draft.
 */

import { shuffleInPlace } from "./rng";
import type {
  DraftChoiceDef,
  DraftChoiceId,
  DraftPoolId,
  DraftSlot,
  ShuffleStream,
} from "./types";

export type { DraftSlot };

export interface DraftPoolSlots {
  safe: readonly [DraftChoiceId, DraftChoiceId];
  greedy: readonly [DraftChoiceId, DraftChoiceId];
  context: DraftChoiceId;
}

export const DRAFT_POOL_SLOTS: Record<DraftPoolId, DraftPoolSlots> = {
  "dirty-tricks": {
    safe: ["pocket-sand", "rat-in-the-sleeve"],
    greedy: ["low-blow", "feast-on-the-fallen"],
    context: "royal-ambush",
  },
  "arcane-responses": {
    safe: ["silence-the-room", "distant-judgment"],
    greedy: ["late-verdict", "unmake-the-threat"],
    context: "fracture-script",
  },
};

export const DRAFT_CHOICES: Record<DraftChoiceId, DraftChoiceDef> = {
  "low-blow": {
    id: "low-blow",
    pool: "dirty-tricks",
    name: "Low Blow",
    cost: 1,
    slot: "greedy",
    text: "Deal 5. If the target is Opened, consume it and deal 4 more.",
  },
  "pocket-sand": {
    id: "pocket-sand",
    pool: "dirty-tricks",
    name: "Pocket Sand",
    cost: 0,
    slot: "safe",
    text: "Hush the target's next intent. Move Rat King to Back.",
  },
  "rat-in-the-sleeve": {
    id: "rat-in-the-sleeve",
    pool: "dirty-tricks",
    name: "Rat in the Sleeve",
    cost: 0,
    slot: "safe",
    text: "If a Rat exists, it bites for 4. Otherwise, summon one on your row.",
  },
  "royal-ambush": {
    id: "royal-ambush",
    pool: "dirty-tricks",
    name: "Royal Ambush",
    cost: 0,
    slot: "context",
    text: "Crown the target. If a Rat exists, it bites for 3.",
  },
  "feast-on-the-fallen": {
    id: "feast-on-the-fallen",
    pool: "dirty-tricks",
    name: "Feast on the Fallen",
    cost: 1,
    slot: "greedy",
    text: "If the target is Opened, consume it and gain 5 Barrier. Otherwise, gain 2 Barrier.",
  },
  "silence-the-room": {
    id: "silence-the-room",
    pool: "arcane-responses",
    name: "Silence the Room",
    cost: 0,
    slot: "safe",
    text: "Hush the target's next intent.",
  },
  "distant-judgment": {
    id: "distant-judgment",
    pool: "arcane-responses",
    name: "Distant Judgment",
    cost: 0,
    slot: "safe",
    text: "Deal 4. Gain 4 Barrier.",
  },
  "fracture-script": {
    id: "fracture-script",
    pool: "arcane-responses",
    name: "Fracture Script",
    cost: 0,
    slot: "context",
    text: "Open the target.",
  },
  "late-verdict": {
    id: "late-verdict",
    pool: "arcane-responses",
    name: "Late Verdict",
    cost: 1,
    slot: "greedy",
    text: "Arm an Omen for the target's next intent. If the slot is full, Hush it instead.",
  },
  "unmake-the-threat": {
    id: "unmake-the-threat",
    pool: "arcane-responses",
    name: "Unmake the Threat",
    cost: 1,
    slot: "greedy",
    text: "Deal 6. If the target is Opened, consume it.",
  },
};

function pickOne<T>(pair: readonly [T, T], stream: ShuffleStream): T {
  return pair[Math.floor(stream.nextUnit() * pair.length)]!;
}

/** Return a Safe + Greedy + Context offer with shuffled display order. */
export function drawDraftChoices(
  pool: DraftPoolId,
  stream: ShuffleStream,
): DraftChoiceDef[] {
  const slots = DRAFT_POOL_SLOTS[pool];
  const ids: DraftChoiceId[] = [
    pickOne(slots.safe, stream),
    pickOne(slots.greedy, stream),
    slots.context,
  ];
  shuffleInPlace(ids, stream);
  return ids.map((id) => ({ ...DRAFT_CHOICES[id] }));
}

export function draftChoice(id: DraftChoiceId): DraftChoiceDef {
  return DRAFT_CHOICES[id];
}
