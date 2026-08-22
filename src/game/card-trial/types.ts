/**
 * Card Trial PoC — session-local combat types.
 * Isolated from campaign CombatState. Nothing here is serialized.
 */

export const HERO_MAX_HP = 40;
export const ENERGY_PER_TURN = 3;
export const DRAW_PER_TURN = 5;
export const MOVE_COST = 1;

export type HeroId = "rat-king" | "old-man";
export type PlayerRow = "front" | "back";
export type EnemyVisualRow = "front" | "back";

export type CardId =
  | "nip"
  | "brace"
  | "open-the-rank"
  | "from-the-dark"
  | "swarm-the-wound"
  | "burst-the-nest"
  | "litter"
  | "send-the-rat"
  | "tide"
  | "lunge"
  | "king-of-the-heap"
  | "staff"
  | "ward"
  | "crack"
  | "split-bone"
  | "full-stop"
  | "cut-the-line"
  | "threshold"
  | "from-afar"
  | "parting-blow"
  | "extinguish"
  | "stand-and-die";

export type ConsumeKind = "none" | "same-target" | "splash-others" | "second-enemy";

export interface CardDef {
  id: CardId;
  name: string;
  cost: 1 | 2;
  hero: HeroId;
  /** Primary targeting. */
  target: "none" | "single-enemy" | "all-enemies";
  consume: ConsumeKind;
  opens: boolean;
  text: string;
}

export interface CardInstance {
  uid: string;
  defId: CardId;
}

export interface HeroState {
  id: HeroId;
  name: string;
  hp: number;
  maxHp: number;
  guard: number;
  row: PlayerRow;
  /** Monotonic clock when this hero last entered `row`. */
  rowEnteredAt: number;
  draw: CardInstance[];
  discard: CardInstance[];
  hand: CardInstance[];
  energy: number;
  paidMoveUsed: boolean;
}

export type Intent =
  | { kind: "row"; row: PlayerRow; damage: number }
  | { kind: "both-rows"; damage: number }
  | { kind: "named-hero"; heroId: HeroId; row: PlayerRow; damage: number };

export interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  visualRow: EnemyVisualRow;
  /** Existing sprite-manifest key; presentation only. */
  spriteId: string;
  cycle: Intent[];
  intentIndex: number;
  /** Queue placement relative to the two heroes. */
  slot: "fast" | "slow";
  /** Stable order among enemies sharing a slot. */
  order: number;
  isBoss?: boolean;
}

export type ActorKind = "hero" | "enemy";

export interface QueueActor {
  kind: ActorKind;
  id: string;
}

export type CardTrialResult = "victory" | "wipe";

export interface OpenedMeta {
  enemyId: string;
  createdBy: HeroId;
  createdAtSlot: number;
  movedBeforeConsume: boolean;
}

export interface CardPlayTargets {
  targetId?: string;
  secondTargetId?: string;
}

export type CardTrialEvent =
  | { type: "attack"; actorId: string; targetId: string; damage: number }
  | { type: "guard"; actorId: string; amount: number }
  | { type: "hero-move"; actorId: HeroId; row: PlayerRow; via: "paid" | "card" }
  | { type: "open"; targetId: string }
  | { type: "consume"; targetId: string }
  | { type: "spawn-rat"; row: PlayerRow }
  | { type: "rat-move"; row: PlayerRow }
  | { type: "rat-bite"; targetId: string; damage: number }
  | { type: "defeated"; targetId: string; wasEnemy: boolean }
  | { type: "intent-miss"; enemyId: string }
  | { type: "intent-hit"; enemyId: string; targetId: string; damage: number; absorbed: number }
  | { type: "banner"; text: string; actorId?: string };

export interface PlayCardResult {
  ok: boolean;
  reason?: string;
  events: CardTrialEvent[];
  needsSecondTarget?: boolean;
}

export interface IntentPreview {
  enemyId: string;
  enemyName: string;
  label: string;
  rawDamage: number;
  /** Per targeted hero, after Guard. Empty if the intent would miss. */
  consequences: Array<{
    heroId: HeroId;
    heroName: string;
    postGuard: number;
    lethal: boolean;
    miss: boolean;
  }>;
  missIfEmpty: boolean;
  wouldMiss: boolean;
}

export interface HandCardView {
  uid: string;
  defId: CardId;
  name: string;
  cost: 1 | 2;
  text: string;
  opens: boolean;
  consume: ConsumeKind;
  disabled: boolean;
  disabledReason: string | null;
  consumeArmed: boolean;
  consumeDimmed: boolean;
}

export interface CardTrialPlayerView {
  fightId: number;
  fightName: string;
  round: number;
  actingHero: HeroId | null;
  phase: "hero-turn" | "enemy-turn" | "result";
  result: CardTrialResult | null;
  energy: number;
  hand: HandCardView[];
  moveAvailable: boolean;
  moveDisabledReason: string | null;
  drawCount: number;
  discardCount: number;
  heroes: Array<{
    id: HeroId;
    name: string;
    hp: number;
    maxHp: number;
    guard: number;
    row: PlayerRow;
    dead: boolean;
  }>;
  enemies: Array<{
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    opened: boolean;
    dead: boolean;
  }>;
  openedEnemyId: string | null;
  ratRow: PlayerRow | null;
  intents: IntentPreview[];
  pileCountsOnly: true;
}

export interface ShuffleStream {
  nextUnit(): number;
  getState(): number;
}

export interface HeroTurnRecord {
  fightId: number;
  round: number;
  hero: HeroId;
  hp: number;
  partnerHp: number;
  row: PlayerRow;
  guard: number;
  startingEnergy: number;
  startingHand: CardId[];
  enemyHp: Record<string, number>;
  openedTarget: string | null;
  ratRow: PlayerRow | null;
  pendingIntents: string[];
  actions: string[];
  cardsPlayed: CardId[];
  paidMove: boolean;
  cardPrintedMovement: boolean;
  cardsDiscarded: CardId[];
  energyRemaining: number;
  endingRow: PlayerRow;
  damageDealt: number;
  guardGained: number;
  hpLostAfter: number;
}

export interface OpenedRecord {
  openedCreatedBy: HeroId;
  openedConsumedBy: HeroId | null;
  lifetimeSlots: number;
  movedBeforeConsume: boolean;
  diedUnconsumed: boolean;
}

export interface IntentEnemyRecord {
  enemyId: string;
  fightId: number;
  shown: number;
  resolved: number;
  missedEmpty: number;
  canceledDead: number;
  highestIndex: number;
  wrapped: boolean;
}

export interface CardTrialTelemetry {
  turns: HeroTurnRecord[];
  opened: OpenedRecord[];
  intents: IntentEnemyRecord[];
  cardStats: Record<CardId, { drawn: number; played: number; discarded: number }>;
  moveOpportunityCost: number;
  guardAbsorbed: number;
  fights: Array<{
    fightId: number;
    result: CardTrialResult;
    rounds: number;
    ratKingHp: number;
    oldManHp: number;
    enemyTurns: number;
  }>;
}

export interface CardTrialState {
  fightId: number;
  fightName: string;
  round: number;
  heroes: Record<HeroId, HeroState>;
  enemies: EnemyState[];
  opened: OpenedMeta | null;
  rat: { row: PlayerRow } | null;
  queue: QueueActor[];
  queueIndex: number;
  phase: "hero-turn" | "enemy-turn" | "result";
  result: CardTrialResult | null;
  streams: Record<HeroId, ShuffleStream>;
  entryClock: number;
  slotCounter: number;
  uidSeq: number;
  events: CardTrialEvent[];
  telemetry: CardTrialTelemetry;
  /** In-progress hero turn telemetry (closed on endHeroTurn). */
  openTurn: HeroTurnRecord | null;
  /** Snapshot of Opened at the start of the current hero turn (after draw). */
  openedAtTurnStart: string | null;
  consumeCardsAtTurnStart: CardId[];
  consumedThisTurn: boolean;
  lastHeroToAct: HeroId | null;
  hpAtHeroTurnEnd: Record<HeroId, number>;
}
