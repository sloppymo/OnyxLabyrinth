/**
 * Optional illustration fields for Card Trial cards.
 * Unmapped ids keep the reserved aperture and fall back to the card fill.
 */

import type { CardId } from "./types";

export const CARD_ART_NATIVE_WIDTH = 128;
export const CARD_ART_NATIVE_HEIGHT = 96;

/** Every live CardId has a deterministic production illustration field. */
const CARD_ART_FILES: Record<CardId, string> = {
  nip: "nip.png",
  brace: "brace.png",
  "open-the-rank": "open-the-rank.png",
  "from-the-dark": "from-the-dark.png",
  "swarm-the-wound": "swarm-the-wound.png",
  "burst-the-nest": "burst-the-nest.png",
  litter: "litter.png",
  "send-the-rat": "send-the-rat.png",
  tide: "tide.png",
  lunge: "lunge.png",
  "king-of-the-heap": "king-of-the-heap.png",
  staff: "staff.png",
  ward: "ward.png",
  crack: "crack.png",
  "split-bone": "split-bone.png",
  "full-stop": "full-stop.png",
  "cut-the-line": "cut-the-line.png",
  threshold: "threshold.png",
  "from-afar": "from-afar.png",
  "parting-blow": "parting-blow.png",
  extinguish: "extinguish.png",
  "stand-and-die": "stand-and-die.png",
};

export const CARD_ART_IDS = Object.keys(CARD_ART_FILES) as CardId[];

export type CardArtId = (typeof CARD_ART_IDS)[number];

function isCardArtId(id: CardId): id is CardArtId {
  return Object.prototype.hasOwnProperty.call(CARD_ART_FILES, id);
}

export function cardArtRelPath(id: CardId): string | null {
  if (!isCardArtId(id)) return null;
  return `assets/card-trial/cards/${CARD_ART_FILES[id]}`;
}

export function cardArtUrl(id: CardId, base = import.meta.env.BASE_URL ?? "/"): string | null {
  const rel = cardArtRelPath(id);
  if (!rel) return null;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${rel}`;
}
