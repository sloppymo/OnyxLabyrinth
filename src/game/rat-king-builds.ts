/**
 * Rat King character-build selection.
 *
 * The three offered builds are complete twelve-card campaign starters. The
 * `legacy` entry is the exact pre-build-selection starter and is intentionally
 * not offered in the New Game menu; it keeps existing saves and non-campaign
 * callers stable when no build id is supplied.
 */

import type { CardId } from "./card-trial/types";

export type RatKingBuildId = "nest" | "open-rank" | "king-of-heap" | "legacy";

export const RAT_KING_BUILD_IDS: readonly RatKingBuildId[] = [
  "nest",
  "open-rank",
  "king-of-heap",
];

export const DEFAULT_RAT_KING_BUILD_ID: RatKingBuildId = "legacy";

export interface RatKingBuildDef {
  id: RatKingBuildId;
  name: string;
  tagline: string;
  mechanics: string;
  cards: readonly CardId[];
}

export const RAT_KING_BUILD_STARTERS: Record<RatKingBuildId, readonly CardId[]> = {
  nest: [
    "nip", "nip", "brace", "brace", "fight-dirty",
    "litter", "litter", "send-the-rat", "send-the-rat",
    "last-litter", "feed-the-king", "one-more-rat",
  ],
  // Revised Open the Rank: one Rat producer plus a second splash payoff. The
  // two From the Dark copies provide the reliable opener pair.
  "open-rank": [
    "nip", "nip", "brace", "brace", "fight-dirty",
    "litter", "from-the-dark", "from-the-dark",
    "swarm-the-wound", "swarm-the-wound",
    "burst-the-nest", "burst-the-nest",
  ],
  "king-of-heap": [
    "nip", "nip", "brace", "brace", "fight-dirty",
    "tide", "tide", "lunge", "lunge",
    "king-of-the-heap", "king-of-the-heap", "king's-due",
  ],
  // Verbatim pre-build-selection Rat King starter. Never edit this list;
  // old saves without ratKingBuildId must retain this exact deck.
  legacy: [
    "nip",
    "nip",
    "brace",
    "brace",
    "open-the-rank",
    "open-the-rank",
    "litter",
    "litter",
    "fight-dirty",
    "swarm-the-wound",
    "tide",
    "lunge",
  ],
};

export const RAT_KING_BUILDS: readonly RatKingBuildDef[] = [
  {
    id: "nest",
    name: "The Nest",
    tagline: "Feed it, then eat it whole.",
    mechanics:
      "Litter creates one Rat, Send the Rat repositions it for a bite, and " +
      "Last Litter, Feed the King, or One More Rat can consume it for a larger " +
      "payoff. You decide when the singleton Rat is worth spending.",
    cards: RAT_KING_BUILD_STARTERS.nest,
  },
  {
    id: "open-rank",
    name: "Open the Rank",
    tagline: "Open one, burn the rest.",
    mechanics:
      "From the Dark opens a target, Swarm the Wound consumes it for focused " +
      "damage, and Burst the Nest consumes it to hit every other living enemy. " +
      "Litter supplies a Rat when the Dirty Tricks draft does not.",
    cards: RAT_KING_BUILD_STARTERS["open-rank"],
  },
  {
    id: "king-of-heap",
    name: "King of the Heap",
    tagline: "Stand in Front. Crown a target. Make it pay.",
    mechanics:
      "Lunge and the revised Tide turn Front into a damage-and-Barrier choice. " +
      "King of the Heap crowns a target, then King's Due rewards hitting that " +
      "crowned enemy for 8 instead of 4 while the Crown may grant automatic " +
      "tribute when its non-row intent resolves.",
    cards: RAT_KING_BUILD_STARTERS["king-of-heap"],
  },
];

export function isRatKingBuildId(value: unknown): value is RatKingBuildId {
  return value === "nest" || value === "open-rank" || value === "king-of-heap" || value === "legacy";
}

export function ratKingBuildDef(id: RatKingBuildId): RatKingBuildDef | null {
  return RAT_KING_BUILDS.find((build) => build.id === id) ?? null;
}
