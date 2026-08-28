import { CARD_DEFS, deckListFor } from "./card-trial/cards";
import type { CardId, HeroId } from "./card-trial/types";

export const CAMPAIGN_DECK_SIZE = 12;
export const CAMPAIGN_CARD_DUPLICATE_LIMIT = 2;

export type CampaignCardBranch = "a" | "b" | null;

/** One permanent physical card. Its identity survives deck edits and saves. */
export interface CampaignCardInstance {
  instanceId: string;
  cardId: CardId;
  mastery: number;
  branch: CampaignCardBranch;
}

export interface CampaignHeroCards {
  collection: CampaignCardInstance[];
  /** Ordered physical instance ids. Campaign combat always uses exactly 12. */
  activeDeck: string[];
}

export type CampaignCardProgress = Record<HeroId, CampaignHeroCards>;

export interface PendingCampaignEncounter {
  encounterKey: string;
  floorId: number;
  tableId: number;
  entryId: string;
  seed: number;
  checkpoint: {
    floorId: number;
    x: number;
    y: number;
    facing: 0 | 1 | 2 | 3;
  };
  reward: CampaignCardInstance;
}

const HERO_IDS: readonly HeroId[] = ["rat-king", "old-man"];

function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CARD_DEFS, value);
}

function starterInstance(heroId: HeroId, cardId: CardId, index: number): CampaignCardInstance {
  return {
    instanceId: `starter:${heroId}:${index}:${cardId}`,
    cardId,
    mastery: 0,
    branch: null,
  };
}

function starterHeroCards(heroId: HeroId): CampaignHeroCards {
  const collection = deckListFor(heroId).map((cardId, index) =>
    starterInstance(heroId, cardId, index)
  );
  return { collection, activeDeck: collection.map((card) => card.instanceId) };
}

function validBranch(value: unknown): CampaignCardBranch {
  return value === "a" || value === "b" ? value : null;
}

function normalizedMastery(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function normalizeInstance(value: unknown, heroId: HeroId): CampaignCardInstance | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CampaignCardInstance>;
  if (typeof raw.instanceId !== "string" || raw.instanceId.length === 0) return null;
  if (!isCardId(raw.cardId) || CARD_DEFS[raw.cardId].hero !== heroId) return null;
  return {
    instanceId: raw.instanceId,
    cardId: raw.cardId,
    mastery: normalizedMastery(raw.mastery),
    branch: validBranch(raw.branch),
  };
}

function deckIsValid(hero: CampaignHeroCards): boolean {
  if (hero.activeDeck.length !== CAMPAIGN_DECK_SIZE) return false;
  if (new Set(hero.activeDeck).size !== hero.activeDeck.length) return false;
  const byId = new Map(hero.collection.map((card) => [card.instanceId, card]));
  const counts = new Map<CardId, number>();
  for (const instanceId of hero.activeDeck) {
    const card = byId.get(instanceId);
    if (!card) return false;
    const next = (counts.get(card.cardId) ?? 0) + 1;
    if (next > CAMPAIGN_CARD_DUPLICATE_LIMIT) return false;
    counts.set(card.cardId, next);
  }
  return true;
}

/** New campaigns start with both locked twelve-card prototype decks as instances. */
export function createCampaignCardProgress(
  legacyRewards: readonly unknown[] = []
): CampaignCardProgress {
  const progress: CampaignCardProgress = {
    "rat-king": starterHeroCards("rat-king"),
    "old-man": starterHeroCards("old-man"),
  };
  legacyRewards.forEach((value, index) => {
    if (!isCardId(value)) return;
    const heroId = CARD_DEFS[value].hero;
    progress[heroId].collection.push({
      instanceId: `legacy-reward:${index}:${value}`,
      cardId: value,
      mastery: 0,
      branch: null,
    });
  });
  return progress;
}

/**
 * Repair hostile/old save data without allowing invalid decks into combat.
 * Starter instances can never be lost; an invalid active deck falls back to
 * that hero's starter twelve while valid discovered instances are retained.
 */
export function normalizeCampaignCardProgress(
  value: unknown,
  legacyRewards: readonly unknown[] = []
): CampaignCardProgress {
  const fallback = createCampaignCardProgress(legacyRewards);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<Record<HeroId, Partial<CampaignHeroCards>>>;
  const seen = new Set<string>();

  for (const heroId of HERO_IDS) {
    const source = raw[heroId];
    if (!source || !Array.isArray(source.collection)) continue;
    const starter = starterHeroCards(heroId);
    const collection: CampaignCardInstance[] = [];
    // Saved instances win on matching ids so earned Mastery/branches survive;
    // pristine starters are appended only when a save omitted them.
    for (const card of [...source.collection, ...starter.collection]) {
      const normalized = normalizeInstance(card, heroId);
      if (!normalized || seen.has(normalized.instanceId)) continue;
      seen.add(normalized.instanceId);
      collection.push(normalized);
    }
    const activeDeck = Array.isArray(source.activeDeck)
      ? source.activeDeck.filter((id): id is string => typeof id === "string")
      : [];
    const candidate = { collection, activeDeck };
    fallback[heroId] = deckIsValid(candidate) ? candidate : { collection, activeDeck: starter.activeDeck };
  }
  return fallback;
}

export function cloneCampaignCardProgress(progress: CampaignCardProgress): CampaignCardProgress {
  return normalizeCampaignCardProgress(progress);
}

export function activeCampaignDeck(
  progress: CampaignCardProgress,
  heroId: HeroId
): CampaignCardInstance[] {
  const hero = progress[heroId];
  const byId = new Map(hero.collection.map((card) => [card.instanceId, card]));
  return hero.activeDeck.map((id) => byId.get(id)).filter((card): card is CampaignCardInstance => !!card);
}

export function unusedCampaignCards(
  progress: CampaignCardProgress,
  heroId: HeroId
): CampaignCardInstance[] {
  const active = new Set(progress[heroId].activeDeck);
  return progress[heroId].collection.filter((card) => !active.has(card.instanceId));
}

/** Idempotent: replaying the same committed encounter reward cannot duplicate it. */
export function grantCampaignCard(
  progress: CampaignCardProgress,
  reward: CampaignCardInstance
): boolean {
  if (!isCardId(reward.cardId)) return false;
  if (HERO_IDS.some((heroId) => progress[heroId].collection.some((c) => c.instanceId === reward.instanceId))) {
    return false;
  }
  const heroId = CARD_DEFS[reward.cardId].hero;
  progress[heroId].collection.push({
    instanceId: reward.instanceId,
    cardId: reward.cardId,
    mastery: normalizedMastery(reward.mastery),
    branch: validBranch(reward.branch),
  });
  return true;
}

export function encounterRewardInstance(
  floorId: number,
  entryId: string,
  cardId: CardId
): CampaignCardInstance {
  return {
    instanceId: `encounter:${floorId}:${entryId}:${cardId}`,
    cardId,
    mastery: 0,
    branch: null,
  };
}

/** Replace one physical card while preserving exact size and duplicate limits. */
export function swapCampaignDeckCard(
  progress: CampaignCardProgress,
  heroId: HeroId,
  outgoingInstanceId: string,
  incomingInstanceId: string
): boolean {
  if (!canSwapCampaignDeckCard(progress, heroId, outgoingInstanceId, incomingInstanceId)) {
    return false;
  }
  const hero = progress[heroId];
  const outgoingIndex = hero.activeDeck.indexOf(outgoingInstanceId);
  const next = [...hero.activeDeck];
  next[outgoingIndex] = incomingInstanceId;
  hero.activeDeck = next;
  return true;
}

export function canSwapCampaignDeckCard(
  progress: CampaignCardProgress,
  heroId: HeroId,
  outgoingInstanceId: string,
  incomingInstanceId: string
): boolean {
  const hero = progress[heroId];
  const outgoingIndex = hero.activeDeck.indexOf(outgoingInstanceId);
  if (outgoingIndex < 0 || hero.activeDeck.includes(incomingInstanceId)) return false;
  const incoming = hero.collection.find((card) => card.instanceId === incomingInstanceId);
  if (!incoming || CARD_DEFS[incoming.cardId].hero !== heroId) return false;
  const next = [...hero.activeDeck];
  next[outgoingIndex] = incomingInstanceId;
  return deckIsValid({ collection: hero.collection, activeDeck: next });
}

export function clonePendingCampaignEncounter(
  pending: PendingCampaignEncounter | null | undefined
): PendingCampaignEncounter | null {
  if (!pending) return null;
  return {
    ...pending,
    checkpoint: { ...pending.checkpoint },
    reward: { ...pending.reward },
  };
}

export function normalizePendingCampaignEncounter(value: unknown): PendingCampaignEncounter | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PendingCampaignEncounter>;
  const checkpoint = raw.checkpoint as Partial<PendingCampaignEncounter["checkpoint"]> | undefined;
  const reward = raw.reward as Partial<CampaignCardInstance> | undefined;
  if (
    typeof raw.encounterKey !== "string" ||
    raw.encounterKey.length === 0 ||
    typeof raw.entryId !== "string" ||
    raw.entryId.length === 0 ||
    typeof raw.floorId !== "number" ||
    !Number.isSafeInteger(raw.floorId) ||
    raw.floorId < 1 ||
    typeof raw.tableId !== "number" ||
    !Number.isSafeInteger(raw.tableId) ||
    raw.tableId < 1 ||
    typeof raw.seed !== "number" ||
    !Number.isSafeInteger(raw.seed) ||
    !checkpoint ||
    typeof checkpoint.floorId !== "number" ||
    !Number.isSafeInteger(checkpoint.floorId) ||
    typeof checkpoint.x !== "number" ||
    !Number.isSafeInteger(checkpoint.x) ||
    checkpoint.x < 0 ||
    typeof checkpoint.y !== "number" ||
    !Number.isSafeInteger(checkpoint.y) ||
    checkpoint.y < 0 ||
    ![0, 1, 2, 3].includes(checkpoint.facing as number) ||
    checkpoint.floorId !== raw.floorId ||
    !reward ||
    typeof reward.instanceId !== "string" ||
    reward.instanceId.length === 0 ||
    !isCardId(reward.cardId)
  ) {
    return null;
  }
  return {
    encounterKey: raw.encounterKey,
    floorId: raw.floorId,
    tableId: raw.tableId,
    entryId: raw.entryId,
    seed: raw.seed >>> 0,
    checkpoint: {
      floorId: checkpoint.floorId,
      x: checkpoint.x,
      y: checkpoint.y,
      facing: checkpoint.facing as 0 | 1 | 2 | 3,
    },
    reward: {
      instanceId: reward.instanceId,
      cardId: reward.cardId,
      mastery: normalizedMastery(reward.mastery),
      branch: validBranch(reward.branch),
    },
  };
}

export function campaignCardCollectionIds(progress: CampaignCardProgress): CardId[] {
  return HERO_IDS.flatMap((heroId) => progress[heroId].collection.map((card) => card.cardId));
}
