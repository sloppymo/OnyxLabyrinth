/**
 * Place-bound campaign card rewards. Routine table entries grant nothing.
 * Until the authored rooms exist as world tiles, these named encounter ids
 * are the bindings. Mutually exclusive bargains are data, not a random pool.
 */

import { CARD_DEFS } from "./card-trial/cards";
import type { CardId } from "./card-trial/types";
import {
  CAMPAIGN_CARD_DUPLICATE_LIMIT,
  ownedCampaignCopies,
  type CampaignCardProgress,
} from "./campaign-cards";

export interface AuthoredCardReward {
  cardId: CardId;
  /** Grant this instead when the player already owns two copies of `cardId`. */
  ifOwned?: CardId;
  /** Grant nothing if the player already owns this card. */
  exclusiveWith?: CardId;
}

export const AUTHORED_CARD_REWARDS: Record<string, AuthoredCardReward> = {
  "f1-ogre-toss": { cardId: "king-of-the-heap", ifOwned: "burst-the-nest" },
  "f1-wraith-pincer": { cardId: "from-the-dark" },
  "f1-acid-burrow": { cardId: "send-the-rat" },
  "f1-hunting-pack": { cardId: "burst-the-nest", exclusiveWith: "king-of-the-heap" },
  "f1-rune-overload": { cardId: "marrow-divide", exclusiveWith: "unlight" },
  "f1-warlock-bone-battery": { cardId: "sever-the-thread" },
  "f1-ghostfire-duet": { cardId: "unlight", exclusiveWith: "marrow-divide" },
  "f3-grand-forge-guardian": { cardId: "last-bastion" },
};

export function campaignCardReward(
  entryId: string,
  progress?: CampaignCardProgress
): CardId | null {
  const record = AUTHORED_CARD_REWARDS[entryId];
  if (!record) return null;
  if (progress && record.exclusiveWith && ownedCampaignCopies(progress, record.exclusiveWith) > 0) {
    return null;
  }
  if (progress && ownedCampaignCopies(progress, record.cardId) >= CAMPAIGN_CARD_DUPLICATE_LIMIT) {
    if (
      record.ifOwned &&
      CARD_DEFS[record.ifOwned].hero === CARD_DEFS[record.cardId].hero &&
      ownedCampaignCopies(progress, record.ifOwned) < CAMPAIGN_CARD_DUPLICATE_LIMIT
    ) {
      return record.ifOwned;
    }
    return null;
  }
  return record.cardId;
}
