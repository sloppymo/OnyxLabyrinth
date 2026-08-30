/**
 * Old Man character-build selection.
 *
 * A deliberate, contract-level reversal of "no character creation" / "no
 * player-facing school selection" for the fixed duo. New Game presents these
 * three Old Man builds followed by Rat King's equivalent choices so the player
 * picks a complete, understandable playstyle instead of learning a
 * generalist twelve-card teaching deck.
 *
 * "legacy" is not offered on the selection screen. It is the exact starter
 * deck Old Man always had before this feature existed, preserved verbatim
 * so a save created before build selection existed never has its deck
 * silently rewritten on load — see `normalizeCampaignCardProgress`.
 */

import type { CardId } from "./card-trial/types";

export type OldManBuildId = "silent-ward" | "last-hour" | "reckoning" | "legacy";

export const OLD_MAN_BUILD_IDS: readonly OldManBuildId[] = [
  "silent-ward",
  "last-hour",
  "reckoning",
];

export const DEFAULT_OLD_MAN_BUILD_ID: OldManBuildId = "legacy";

export interface OldManBuildDef {
  id: OldManBuildId;
  name: string;
  tagline: string;
  mechanics: string;
  cards: readonly CardId[];
}

export const OLD_MAN_BUILD_STARTERS: Record<OldManBuildId, readonly CardId[]> = {
  "silent-ward": [
    "distant-hand",
    "distant-hand",
    "pale-ward",
    "pale-ward",
    "the-staff-speaks",
    "the-staff-speaks",
    "veil-of-quiet",
    "veil-of-quiet",
    "the-quiet-after",
    "the-quiet-after",
    "silence-the-hall",
    "improvised-theorem",
  ],
  "last-hour": [
    "distant-hand",
    "distant-hand",
    "pale-ward",
    "pale-ward",
    "the-threshold",
    "faultline",
    "faultline",
    "hasten-the-hour",
    "hasten-the-hour",
    "the-final-word",
    "the-final-word",
    "improvised-theorem",
  ],
  reckoning: [
    "distant-hand",
    "distant-hand",
    "pale-ward",
    "pale-ward",
    "full-stop",
    "full-stop",
    "marrow-divide",
    "marrow-divide",
    "reckoning-strike",
    "reckoning-strike",
    "reckoning-ward",
    "improvised-theorem",
  ],
  // Verbatim copy of the pre-build-selection default. Never edit this list;
  // it exists only so old saves keep the exact deck they already had.
  legacy: [
    "the-staff-speaks",
    "the-staff-speaks",
    "pale-ward",
    "pale-ward",
    "faultline",
    "faultline",
    "distant-hand",
    "distant-hand",
    "improvised-theorem",
    "full-stop",
    "the-threshold",
    "parting-word",
  ],
};

export const OLD_MAN_BUILDS: readonly OldManBuildDef[] = [
  {
    id: "silent-ward",
    name: "The Silent Ward",
    tagline: "Hush every threat, then finish what you've already turned off.",
    mechanics:
      "Two ways to apply Hush, two ways to profit from a target that's already " +
      "Hushed, and one turn that Hushes the whole enemy formation. Low damage " +
      "output, high control.",
    cards: OLD_MAN_BUILD_STARTERS["silent-ward"],
  },
  {
    id: "last-hour",
    name: "The Last Hour",
    tagline: "Open a target, arm the Omen, and let the countdown do the rest.",
    mechanics:
      "Every card here creates Opened or interacts with the one Omen slot. " +
      "Trigger the Omen early for immediate tempo, or hold it to cancel an " +
      "enemy's intent outright before it happens.",
    cards: OLD_MAN_BUILD_STARTERS["last-hour"],
  },
  {
    id: "reckoning",
    name: "The Reckoning",
    tagline: "Open the door, then walk through it at full force.",
    mechanics:
      "Big single-target payoffs built around consuming Opened: burn it for " +
      "damage and commit to Front, or bank it for Barrier and fall back to " +
      "Back. Every card in the deck touches the same door.",
    cards: OLD_MAN_BUILD_STARTERS["reckoning"],
  },
];

export function isOldManBuildId(value: unknown): value is OldManBuildId {
  return (
    value === "silent-ward" ||
    value === "last-hour" ||
    value === "reckoning" ||
    value === "legacy"
  );
}

export function oldManBuildDef(id: OldManBuildId): OldManBuildDef | null {
  return OLD_MAN_BUILDS.find((build) => build.id === id) ?? null;
}
