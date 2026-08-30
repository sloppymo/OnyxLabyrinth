/**
 * Optional illustration fields for Card Trial cards.
 * Unmapped ids keep the reserved aperture and fall back to the card fill.
 */

import type { CardId } from "./types";

export const CARD_ART_NATIVE_WIDTH = 128;
export const CARD_ART_NATIVE_HEIGHT = 96;

/**
 * Production illustration for each CardId that has one. Old Man
 * build-exclusive signature cards (see ../old-man-builds.ts and
 * ../rat-king-builds.ts), including reckoning-ward, last-litter,
 * feed-the-king, one-more-rat, and king's-due, have no art yet and fall back
 * to the reserved-aperture card fill below.
 */
const CARD_ART_FILES: Partial<Record<CardId, string>> = {
  nip: "nip.png",
  "fight-dirty": "fight-dirty.png",
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
  "the-staff-speaks": "the-staff-speaks.png",
  "pale-ward": "pale-ward.png",
  faultline: "faultline.png",
  "marrow-divide": "marrow-divide.png",
  "full-stop": "full-stop.png",
  "sever-the-thread": "sever-the-thread.png",
  "the-threshold": "the-threshold.png",
  "distant-hand": "distant-hand.png",
  "parting-word": "parting-word.png",
  unlight: "unlight.png",
  "last-bastion": "last-bastion.png",
  "improvised-theorem": "improvised-theorem.png",
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
