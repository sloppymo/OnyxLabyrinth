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
/**
 * Simulator-only rule modes. Production fights always use `full`; `none`
 * exists to make a deliberately explicit row-ablation comparison possible.
 */
export type CardTrialRowMode = "full" | "none";
/** How a row-targeted enemy intent maps when rows are ablated. */
export type NoRowIntentTargeting = "lowest-hp" | "both-heroes";

/** A production card id, or a physical campaign instance with a stable uid. */
export type CardTrialDeckEntry = string | { uid: string; defId: string };

export type CardId =
  | "nip"
  | "fight-dirty"
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
  | "the-staff-speaks"
  | "pale-ward"
  | "faultline"
  | "marrow-divide"
  | "full-stop"
  | "sever-the-thread"
  | "the-threshold"
  | "distant-hand"
  | "parting-word"
  | "unlight"
  | "last-bastion"
  | "improvised-theorem"
  // Old Man build-exclusive signature cards (character build selection).
  // Never part of RAT_KING_LIST/OLD_MAN_LIST or the Arena PoC decks.
  | "veil-of-quiet"
  | "the-quiet-after"
  | "silence-the-hall"
  | "hasten-the-hour"
  | "the-final-word"
  | "reckoning-strike"
  | "reckoning-ward"
  | "brace-for-it"
  // Rat King sacrifice-mechanic cards (Consume the Rat). Implemented and
  // tested, and used by The Nest build.
  | "last-litter"
  | "feed-the-king"
  | "one-more-rat"
  // Rat King Crown payoff used by the King of the Heap build.
  | "king's-due";

/** A bounded, temporary three-choice draft created by a card in the live pool. */
export type DraftPoolId = "dirty-tricks" | "arcane-responses";

export type DraftChoiceId =
  | "low-blow"
  | "pocket-sand"
  | "rat-in-the-sleeve"
  | "royal-ambush"
  | "feast-on-the-fallen"
  | "silence-the-room"
  | "distant-judgment"
  | "fracture-script"
  | "late-verdict"
  | "unmake-the-threat";

export type DraftSlot = "safe" | "greedy" | "context";

export interface DraftChoiceDef {
  id: DraftChoiceId;
  pool: DraftPoolId;
  name: string;
  cost: 0 | 1;
  slot: DraftSlot;
  text: string;
}

export interface DraftState {
  heroId: HeroId;
  sourceId: CardId;
  pool: DraftPoolId;
  targetId: string;
  choices: DraftChoiceDef[];
}

export interface DraftChoiceView extends DraftChoiceDef {
  disabled: boolean;
  disabledReason: string | null;
}

export interface DraftView {
  heroId: HeroId;
  sourceId: CardId;
  sourceName: string;
  targetId: string;
  targetName: string;
  choices: DraftChoiceView[];
}

export type ConsumeKind = "none" | "same-target" | "splash-others" | "second-enemy";

export type ExtraEffectTarget = "primary" | "all" | "others" | "second";

export type ExtraEffectCondition =
  | { kind: "row"; row: PlayerRow }
  | { kind: "opened-primary" }
  | { kind: "rat-exists" }
  | { kind: "rat-missing" }
  | { kind: "intent-aims-at-row" }
  | { kind: "hp-at-most"; amount: number; who?: "primary" };

export type ExtraCardEffect =
  | { kind: "damage"; amount: number; target?: ExtraEffectTarget }
  | { kind: "guard"; amount: number }
  | { kind: "open"; target?: "primary" }
  | { kind: "consume" }
  | { kind: "move"; row: PlayerRow | "other" }
  | { kind: "spawn-rat" }
  | { kind: "move-rat" }
  | { kind: "rat-bite"; amount: number }
  | { kind: "if"; when: ExtraEffectCondition; then: readonly ExtraCardEffect[] };

/** Experiment-only card. Never stored in CARD_DEFS. */
export interface ExtraCardDef {
  id: string;
  name: string;
  cost: 1 | 2;
  hero: HeroId;
  target: "none" | "single-enemy" | "all-enemies";
  consume: ConsumeKind;
  opens: boolean;
  text: string;
  effects: readonly ExtraCardEffect[];
}

export interface CardTrialRuleset {
  cards: Record<string, ExtraCardDef>;
  /** Optional simulator rule override. Omitted means the production rules. */
  rowMode?: CardTrialRowMode;
  /** Explicit mapping for row intents in `rowMode: "none"`. */
  noRowIntentTargeting?: NoRowIntentTargeting;
}

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
  /** Opens a bounded, temporary three-choice draft after the card is played. */
  draft?: DraftPoolId;
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
  /** Old Man's Hush weakens this enemy's next intent, then clears. */
  hushed?: boolean;
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
  | { type: "hush-applied"; targetId: string }
  | { type: "hush-triggered"; targetId: string; rawDamage: number; damage: number }
  | { type: "omen-armed"; targetId: string; damage: number }
  | { type: "omen-triggered"; targetId: string; damage: number }
  | { type: "omen-fizzled"; targetId: string }
  | { type: "crowned"; targetId: string }
  | { type: "crown-cleared"; targetId: string; reason: "replaced" | "defeated" }
  | { type: "crown-tribute"; targetId: string; amount: number; sourceId: string }
  | { type: "spawn-rat"; row: PlayerRow }
  | { type: "rat-move"; row: PlayerRow }
  | { type: "rat-bite"; targetId: string; damage: number }
  | { type: "rat-consumed" }
  | { type: "defeated"; targetId: string; wasEnemy: boolean }
  | { type: "intent-miss"; enemyId: string }
  | { type: "intent-hit"; enemyId: string; targetId: string; damage: number; absorbed: number }
  | { type: "draft-opened"; actorId: HeroId; sourceId: CardId; targetId: string; choices: DraftChoiceDef[] }
  | { type: "draft-picked"; actorId: HeroId; sourceId: CardId; choiceId: DraftChoiceId; targetId: string }
  | { type: "offer-lost"; actorId: HeroId; sourceId: CardId; targetId: string }
  | { type: "banner"; text: string; actorId?: string; cardId?: CardId };

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
  /** Crown's visible tribute when a non-redirectable intent resolves. */
  tribute?: { heroId: HeroId; amount: number };
}

export interface HandCardView {
  uid: string;
  defId: CardId;
  name: string;
  cost: 1 | 2;
  text: string;
  opens: boolean;
  consume: ConsumeKind;
  target: "none" | "single-enemy" | "all-enemies";
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
  rowMode: CardTrialRowMode;
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
    /** Presentation-only sprite key used by the Card Trial initiative rail. */
    spriteId: string;
    hp: number;
    maxHp: number;
    opened: boolean;
    hushed?: boolean;
    crowned: boolean;
    dead: boolean;
    visualRow: EnemyVisualRow;
  }>;
  /** Presentation-only initiative rail. Combat math still uses `queue` on state. */
  queue: Array<{
    id: string;
    kind: ActorKind;
    name: string;
    acting: boolean;
    done: boolean;
    dead: boolean;
  }>;
  openedEnemyId: string | null;
  crownedEnemyId: string | null;
  /** The one face-up delayed Old Man card, if armed. */
  omen?: {
    targetId: string;
    targetName: string;
    damage: number;
  } | null;
  /** The visible three-choice draft, when a draft card is awaiting a pick. */
  draft?: DraftView | null;
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

export interface OmenState {
  targetId: string;
  createdBy: HeroId;
  damage: number;
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
  /** Session-local presentation signals; never used by Card Trial rules. */
  presentation: {
    decisionMs: number[];
    targetChanges: number;
    targetCancels: number;
    detailHolds: number;
    disabledAttempts: number;
  };
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
  /** Seed used to build this fight's deterministic deck streams. */
  seed: number;
  round: number;
  heroes: Record<HeroId, HeroState>;
  enemies: EnemyState[];
  opened: OpenedMeta | null;
  omen: OmenState | null;
  /** Pending temporary draft; no other hero action is legal while present. */
  draft: DraftState | null;
  /** Rat King's single public subject. */
  crownedEnemyId: string | null;
  rat: { row: PlayerRow } | null;
  queue: QueueActor[];
  queueIndex: number;
  phase: "hero-turn" | "enemy-turn" | "result";
  result: CardTrialResult | null;
  streams: Record<HeroId, ShuffleStream>;
  /** Independent of both deck-shuffle streams. Same fight seed + source ordinal is stable. */
  draftStream: ShuffleStream;
  /** Snapshot taken when a draft opens so an invalid target can restore the source. */
  draftRollback: {
    sourceCard: CardInstance;
    energy: number;
    draftStreamState: number;
  } | null;
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
  /** True if a Consume-legal play was aimed at the Opened enemy this turn. */
  consumeAttemptedThisTurn: boolean;
  lastHeroToAct: HeroId | null;
  hpAtHeroTurnEnd: Record<HeroId, number>;
  /**
   * Experiment-only extra card defs. Production fights leave this null.
   * Extra ids must never be written into CARD_DEFS.
   */
  ruleset: CardTrialRuleset | null;
}
