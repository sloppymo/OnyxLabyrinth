import { CARD_DEFS } from "./card-trial/cards";
import type { CardId, HeroId } from "./card-trial/types";
import {
  DEFAULT_OLD_MAN_BUILD_ID,
  OLD_MAN_BUILD_STARTERS,
  isOldManBuildId,
  type OldManBuildId,
} from "./old-man-builds";

export const CAMPAIGN_DECK_SIZE = 12;
export const CAMPAIGN_CARD_DUPLICATE_LIMIT = 2;
export const CAMPAIGN_CARD_SCHEMA_VERSION = 1;

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

export interface CampaignCardProgress {
  schemaVersion: number;
  "rat-king": CampaignHeroCards;
  "old-man": CampaignHeroCards;
  /** Which starter deck Old Man began this campaign with. See old-man-builds.ts. */
  oldManBuildId: OldManBuildId;
}

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
  reward: CampaignCardInstance | null;
}

const HERO_IDS: readonly HeroId[] = ["rat-king", "old-man"];

/**
 * Rat King's twelve physical cards, eight unique definitions. Rat King has
 * no build selection yet — this is his only starter. Old Man's starter
 * depends on the chosen build; see OLD_MAN_BUILD_STARTERS in
 * old-man-builds.ts (its "legacy" entry is the exact list this file used
 * to hold before build selection existed).
 */
export const CAMPAIGN_STARTER_DECKS: Record<"rat-king", readonly CardId[]> = {
  "rat-king": [
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

function starterDeckFor(heroId: HeroId, oldManBuildId: OldManBuildId): readonly CardId[] {
  return heroId === "old-man"
    ? OLD_MAN_BUILD_STARTERS[oldManBuildId]
    : CAMPAIGN_STARTER_DECKS["rat-king"];
}

const POSITIONAL_STARTER = /^starter:(rat-king|old-man):(\d+):([a-z0-9-]+)$/;

function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CARD_DEFS, value);
}

function starterInstance(heroId: HeroId, cardId: CardId, ordinal: number): CampaignCardInstance {
  return {
    instanceId: `starter:${heroId}:${cardId}:${ordinal}`,
    cardId,
    mastery: 0,
    branch: null,
  };
}

function starterHeroCards(
  heroId: HeroId,
  oldManBuildId: OldManBuildId = DEFAULT_OLD_MAN_BUILD_ID
): CampaignHeroCards {
  const ordinals = new Map<CardId, number>();
  const collection = starterDeckFor(heroId, oldManBuildId).map((cardId) => {
    const next = ordinals.get(cardId) ?? 0;
    ordinals.set(cardId, next + 1);
    return starterInstance(heroId, cardId, next);
  });
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

function migratePositionalStarterId(
  instance: CampaignCardInstance,
  heroId: HeroId,
  ordinals: Map<string, number>
): CampaignCardInstance {
  const match = instance.instanceId.match(POSITIONAL_STARTER);
  if (!match || match[1] !== heroId) return instance;
  const parsedId = match[3];
  if (!isCardId(parsedId) || parsedId !== instance.cardId) return instance;
  const key = `${heroId}:${instance.cardId}`;
  const ordinal = ordinals.get(key) ?? 0;
  ordinals.set(key, ordinal + 1);
  return { ...instance, instanceId: `starter:${heroId}:${instance.cardId}:${ordinal}` };
}

function ownedCopies(hero: CampaignHeroCards, cardId: CardId): number {
  return hero.collection.filter((card) => card.cardId === cardId).length;
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

function emptyProgress(oldManBuildId: OldManBuildId): CampaignCardProgress {
  return {
    schemaVersion: CAMPAIGN_CARD_SCHEMA_VERSION,
    "rat-king": starterHeroCards("rat-king"),
    "old-man": starterHeroCards("old-man", oldManBuildId),
    oldManBuildId,
  };
}

/**
 * New campaigns start with eight unique definitions as twelve physical
 * cards. `oldManBuildId` defaults to the pre-build-selection deck so every
 * existing call site (tests, Arena reset, legacy migration) is unaffected;
 * only the New Game build-select screen passes a real build id.
 */
export function createCampaignCardProgress(
  legacyRewards: readonly unknown[] = [],
  oldManBuildId: OldManBuildId = DEFAULT_OLD_MAN_BUILD_ID
): CampaignCardProgress {
  const progress = emptyProgress(oldManBuildId);
  legacyRewards.forEach((value, index) => {
    if (!isCardId(value)) return;
    const heroId = CARD_DEFS[value].hero;
    if (ownedCopies(progress[heroId], value) >= CAMPAIGN_CARD_DUPLICATE_LIMIT) return;
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
  const raw =
    value && typeof value === "object"
      ? (value as Partial<CampaignCardProgress> & Partial<Record<HeroId, Partial<CampaignHeroCards>>>)
      : null;
  // A save's Old Man build id is fixed at creation. Reading it before
  // building the fallback means an invalid-deck repair falls back to the
  // exact build that save was created with, never a different one.
  const oldManBuildId = isOldManBuildId(raw?.oldManBuildId)
    ? raw.oldManBuildId
    : DEFAULT_OLD_MAN_BUILD_ID;
  const fallback = createCampaignCardProgress(legacyRewards, oldManBuildId);
  if (!raw) return fallback;

  for (const heroId of HERO_IDS) {
    const source = raw[heroId];
    if (!source || !Array.isArray(source.collection)) continue;
    const starter = starterHeroCards(heroId, oldManBuildId);
    const ordinals = new Map<string, number>();
    const migrated: CampaignCardInstance[] = [];
    const idMap = new Map<string, string>();
    for (const card of source.collection) {
      const normalized = normalizeInstance(card, heroId);
      if (!normalized) continue;
      const next = migratePositionalStarterId(normalized, heroId, ordinals);
      idMap.set(normalized.instanceId, next.instanceId);
      migrated.push(next);
    }
    const seen = new Set<string>();
    const collection: CampaignCardInstance[] = [];
    for (const card of [...migrated, ...starter.collection]) {
      if (seen.has(card.instanceId)) continue;
      seen.add(card.instanceId);
      collection.push(card);
    }
    const activeDeck = Array.isArray(source.activeDeck)
      ? source.activeDeck
          .filter((id): id is string => typeof id === "string")
          .map((id) => idMap.get(id) ?? id)
      : [];
    const candidate = { collection, activeDeck };
    fallback[heroId] = deckIsValid(candidate) ? candidate : { collection, activeDeck: starter.activeDeck };
  }
  fallback.schemaVersion = CAMPAIGN_CARD_SCHEMA_VERSION;
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

export function ownedCampaignCopies(
  progress: CampaignCardProgress,
  cardId: CardId
): number {
  if (!isCardId(cardId)) return 0;
  const heroId = CARD_DEFS[cardId].hero;
  return ownedCopies(progress[heroId], cardId);
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
  if (ownedCopies(progress[heroId], reward.cardId) >= CAMPAIGN_CARD_DUPLICATE_LIMIT) {
    return false;
  }
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
    reward: pending.reward ? { ...pending.reward } : null,
  };
}

export function normalizePendingCampaignEncounter(value: unknown): PendingCampaignEncounter | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PendingCampaignEncounter>;
  const checkpoint = raw.checkpoint as Partial<PendingCampaignEncounter["checkpoint"]> | undefined;
  const reward = raw.reward as Partial<CampaignCardInstance> | null | undefined;
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
    checkpoint.floorId !== raw.floorId
  ) {
    return null;
  }
  if (reward != null) {
    if (
      typeof reward.instanceId !== "string" ||
      reward.instanceId.length === 0 ||
      !isCardId(reward.cardId)
    ) {
      return null;
    }
  }
  const normalizedReward = reward
    ? {
        instanceId: reward.instanceId as string,
        cardId: reward.cardId as CardId,
        mastery: normalizedMastery(reward.mastery),
        branch: validBranch(reward.branch),
      }
    : null;
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
    reward: normalizedReward,
  };
}

export function campaignCardCollectionIds(progress: CampaignCardProgress): CardId[] {
  return HERO_IDS.flatMap((heroId) => progress[heroId].collection.map((card) => card.cardId));
}
