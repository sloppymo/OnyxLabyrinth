/**
 * Optional illustration fields for Card Trial cards.
 * Unmapped ids keep the reserved aperture and fall back to the card fill.
 */

import { CARD_DEFS } from "./cards";
import type { CardId } from "./types";

export const CARD_ART_NATIVE_WIDTH = 128;
export const CARD_ART_NATIVE_HEIGHT = 96;

export const CARD_ART_IDS = Object.keys(CARD_DEFS) as CardId[];

export type CardArtId = (typeof CARD_ART_IDS)[number];

function isCardArtId(id: CardId): id is CardArtId {
  return Object.prototype.hasOwnProperty.call(CARD_DEFS, id);
}

export function cardArtRelPath(id: CardId): string | null {
  if (!isCardArtId(id)) return null;
  return `assets/card-trial/cards/${id}.png`;
}

export function cardArtUrl(id: CardId, base = import.meta.env.BASE_URL ?? "/"): string | null {
  const rel = cardArtRelPath(id);
  if (!rel) return null;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${rel}`;
}
