/**
 * Optional illustration fields for Card Trial cards.
 * Unmapped ids keep the reserved aperture and fall back to the card fill.
 */

import type { CardId } from "./types";

export const CARD_ART_NATIVE_WIDTH = 128;
export const CARD_ART_NATIVE_HEIGHT = 96;

export const CARD_ART_IDS = [
  "nip",
  "king-of-the-heap",
  "tide",
  "swarm-the-wound",
  "staff",
] as const satisfies readonly CardId[];

export type CardArtId = (typeof CARD_ART_IDS)[number];

const CARD_ART_FILES: Record<CardArtId, string> = {
  nip: "nip.png",
  "king-of-the-heap": "king-of-the-heap.png",
  tide: "tide.png",
  "swarm-the-wound": "swarm-the-wound.png",
  staff: "staff.png",
};

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
