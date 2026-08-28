/**
 * Campaign encounter adapter for Card Trial.
 *
 * The Card Trial rules stay session-local. This module only translates an
 * authored campaign encounter into the existing two-hero Card Trial shape so
 * the campaign can prove the real encounter lifecycle before the legacy
 * combat resolver is removed.
 */

import { rollEncounter, resolveEncounter, type EncounterEntry, type EnemyDef, type Row } from "../data/enemies";
import {
  DRAW_PER_TURN,
  ENERGY_PER_TURN,
  createFight,
  createShuffleStream,
  shuffleInPlace,
} from "./card-trial";
import type { CardId, CardTrialState, EnemyState, Intent } from "./card-trial/types";
import { activeCampaignDeck, type CampaignCardProgress } from "./campaign-cards";

export type CampaignResolvedEnemy = ReturnType<typeof resolveEncounter>[number];

export interface CampaignCardTrialMetadata {
  floorId: number;
  entry: EncounterEntry;
  resolved: readonly CampaignResolvedEnemy[];
  seed: number;
  /** Omit only for Arena/adapter fixtures that intentionally use PoC decks. */
  cardProgress?: CampaignCardProgress;
}

/** Card rewards are deliberately drawn from the current locked card pool. */
const REWARD_POOL_BY_FLOOR: Record<number, readonly CardId[]> = {
  1: ["open-the-rank", "crack", "from-the-dark", "split-bone"],
  2: ["swarm-the-wound", "full-stop", "send-the-rat", "cut-the-line"],
  3: ["burst-the-nest", "threshold", "king-of-the-heap", "stand-and-die"],
  4: ["litter", "extinguish", "tide", "from-afar"],
  5: ["lunge", "parting-blow", "brace", "ward"],
};

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable numeric identity for telemetry; never used as a gameplay roll. */
export function campaignCardTrialFightId(floorId: number, entryId: string): number {
  return floorId * 1_000_000 + (stableHash(entryId) % 1_000_000);
}

function oppositeRow(row: Row): Row {
  return row === "front" ? "back" : "front";
}

function intentLabel(enemy: EnemyState): string {
  const intent = enemy.cycle[enemy.intentIndex % enemy.cycle.length]!;
  if (intent.kind === "both-rows") return `${enemy.name.toUpperCase()} — both rows — ${intent.damage} each`;
  if (intent.kind === "named-hero") {
    return `${enemy.name.toUpperCase()} — ${intent.heroId === "rat-king" ? "Rat King" : "Old Man"} in ${intent.row === "front" ? "Front" : "Back"} — ${intent.damage}`;
  }
  return `${enemy.name.toUpperCase()} — our ${intent.row === "front" ? "Front" : "Back"} — ${intent.damage}`;
}

function campaignIntentCycle(enemy: EnemyDef, row: Row): Intent[] {
  // The first pass preserves the authored enemy's attack identity while
  // making the visible row a tactical object. Alternating rows gives the duo
  // a meaningful reason to use the existing Move action without introducing
  // a second campaign-only ruleset.
  const damage = Math.max(1, enemy.attack);
  return [
    { kind: "row", row, damage },
    { kind: "row", row: oppositeRow(row), damage: Math.max(1, damage - 1) },
    { kind: "row", row, damage: damage + 1 },
  ];
}

function enemyState(enemy: EnemyDef, row: Row, order: number): EnemyState {
  return {
    id: `${enemy.id}-${order}`,
    name: enemy.name,
    hp: enemy.hp,
    maxHp: enemy.hp,
    visualRow: row,
    spriteId: enemy.spriteId ?? enemy.id,
    cycle: campaignIntentCycle(enemy, row),
    intentIndex: 0,
    // Card Trial's queue has one fast band between the two heroes and one
    // slow band after Old Man. Enemy AGI is the existing authored initiative
    // signal, so the translation does not invent another stat.
    slot: enemy.agi >= 10 ? "fast" : "slow",
    order,
    isBoss: enemy.isBoss,
  };
}

function campaignFightName(entry: EncounterEntry, resolved: readonly CampaignResolvedEnemy[]): string {
  if (entry.displayName) return entry.displayName;
  const names = resolved.map(({ enemy }) => enemy.name);
  return names.length > 0 ? names.join(" + ") : "A Presence in the Dark";
}

function installCampaignDecks(trial: CardTrialState, progress: CampaignCardProgress): void {
  const formulas = {
    "rat-king": trial.seed * 17 + trial.fightId * 31 + 3,
    "old-man": trial.seed * 19 + trial.fightId * 37 + 7,
  } as const;

  for (const heroId of ["rat-king", "old-man"] as const) {
    const cards = activeCampaignDeck(progress, heroId);
    if (cards.length !== 12) {
      throw new Error(`Campaign ${heroId} deck must contain exactly 12 cards`);
    }
    const stream = createShuffleStream(formulas[heroId]);
    const deck = cards.map((card) => ({ uid: card.instanceId, defId: card.cardId }));
    shuffleInPlace(deck, stream);
    trial.streams[heroId] = stream;
    trial.heroes[heroId].draw = deck;
    trial.heroes[heroId].discard = [];
    trial.heroes[heroId].hand = [];
    trial.heroes[heroId].energy = 0;
    trial.heroes[heroId].paidMoveUsed = false;
  }

  // createFight has already opened Rat King's turn. Replace that prototype
  // opening hand with the persistent physical instances before presentation.
  const ratKing = trial.heroes["rat-king"];
  ratKing.hand = ratKing.draw.splice(0, DRAW_PER_TURN);
  ratKing.energy = ENERGY_PER_TURN;
  for (const stats of Object.values(trial.telemetry.cardStats)) {
    stats.drawn = 0;
    stats.played = 0;
    stats.discarded = 0;
  }
  for (const card of ratKing.hand) trial.telemetry.cardStats[card.defId].drawn += 1;
  if (trial.openTurn) trial.openTurn.startingHand = ratKing.hand.map((card) => card.defId);
}

/**
 * Translate one real campaign encounter into the existing Card Trial state.
 * `createFight(1)` supplies the locked protagonist decks and opening hand;
 * only the enemy formation and presentation identity are replaced here.
 */
export function createCampaignCardTrialFight(metadata: CampaignCardTrialMetadata): CardTrialState {
  if (metadata.resolved.length === 0) {
    throw new Error(`Campaign encounter "${metadata.entry.id}" has no resolvable enemies`);
  }

  const trial = createFight(1, { seed: metadata.seed });
  if (metadata.cardProgress) installCampaignDecks(trial, metadata.cardProgress);
  const enemies = metadata.resolved.map(({ enemy, row }, index) => enemyState(enemy, row, index));
  const fast = enemies
    .filter((enemy) => enemy.slot === "fast")
    .sort((a, b) => a.order - b.order)
    .map((enemy) => ({ kind: "enemy" as const, id: enemy.id }));
  const slow = enemies
    .filter((enemy) => enemy.slot === "slow")
    .sort((a, b) => a.order - b.order)
    .map((enemy) => ({ kind: "enemy" as const, id: enemy.id }));

  trial.fightId = campaignCardTrialFightId(metadata.floorId, metadata.entry.id);
  trial.fightName = campaignFightName(metadata.entry, metadata.resolved);
  trial.enemies = enemies;
  trial.queue = [
    { kind: "hero", id: "rat-king" },
    ...fast,
    { kind: "hero", id: "old-man" },
    ...slow,
  ];
  // createFight has already dealt the locked opening hands and started Rat
  // King's turn. Keep that state, but remove the prototype enemies' intent
  // records and refresh the current turn's labels/HP snapshot.
  trial.queueIndex = 0;
  trial.round = 1;
  trial.phase = "hero-turn";
  trial.result = null;
  trial.opened = null;
  trial.rat = null;
  trial.events = [];
  trial.telemetry.intents = [];
  trial.telemetry.turns = [];
  trial.telemetry.fights = [];
  trial.lastHeroToAct = null;
  trial.hpAtHeroTurnEnd = { "rat-king": trial.heroes["rat-king"].hp, "old-man": trial.heroes["old-man"].hp };
  if (trial.openTurn) {
    trial.openTurn.fightId = trial.fightId;
    trial.openTurn.pendingIntents = enemies.map(intentLabel);
    trial.openTurn.enemyHp = Object.fromEntries(enemies.map((enemy) => [enemy.id, enemy.hp]));
  }
  return trial;
}

/** Pick a deterministic persistent card reward from the current card pool. */
export function campaignCardReward(floorId: number, entryId: string): CardId {
  const pool = REWARD_POOL_BY_FLOOR[floorId] ?? REWARD_POOL_BY_FLOOR[5]!;
  return pool[stableHash(`${floorId}:${entryId}:reward`) % pool.length]!;
}

/** Resolve a real authored encounter for debug evidence without bypassing its table. */
export function rollCampaignEncounter(
  floorId: number,
  recentFamilies: readonly string[] = []
): { entry: EncounterEntry; resolved: CampaignResolvedEnemy[] } | null {
  const entry = rollEncounter(floorId, { recentFamilies });
  if (!entry) return null;
  const resolved = resolveEncounter(entry);
  return resolved.length > 0 ? { entry, resolved } : null;
}
