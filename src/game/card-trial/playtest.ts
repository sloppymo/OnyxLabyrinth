/**
 * Debug-only Card Trial playtest recording primitives.
 *
 * This module deliberately knows nothing about DOM, audio, animation, or the
 * campaign. It records semantic decisions against a normalized Card Trial
 * state projection so a browser session can be replayed after the presenter
 * changes without treating CSS or frame timing as gameplay truth.
 */

import { CARD_DEFS } from "./cards";
import type {
  CardId,
  CardTrialResult,
  CardTrialState,
  HeroId,
  PlayerRow,
  DraftChoiceId,
} from "./types";

export const CARD_TRIAL_PLAYTEST_SCHEMA_VERSION = 1 as const;

export type CardTrialPlaytestActionKind = "card" | "move" | "pass";
export type CardTrialPlaytestInteractionKind =
  | "focus"
  | "arm"
  | "target-change"
  | "target-cancel"
  | "details-open"
  | "details-close"
  | "disabled-attempt";

export interface CardTrialPlaytestBuild {
  commit?: string;
  branch?: string;
  builtAt?: string;
}

export interface CardTrialStateFingerprint {
  fightId: number;
  fightName: string;
  seed: number;
  round: number;
  phase: CardTrialState["phase"];
  result: CardTrialResult | null;
  queueIndex: number;
  slotCounter: number;
  uidSeq: number;
  actingHero: HeroId | null;
  heroes: Array<{
    id: HeroId;
    hp: number;
    maxHp: number;
    guard: number;
    row: PlayerRow;
    rowEnteredAt: number;
    energy: number;
    paidMoveUsed: boolean;
    hand: Array<{ uid: string; defId: CardId }>;
    draw: Array<{ uid: string; defId: CardId }>;
    discard: Array<{ uid: string; defId: CardId }>;
  }>;
  enemies: Array<{
    id: string;
    hp: number;
    maxHp: number;
    visualRow: string;
    intentIndex: number;
    hushed: boolean;
  }>;
  opened: CardTrialState["opened"];
  crownedEnemyId: string | null;
  omen: CardTrialState["omen"];
  draft: CardTrialState["draft"] extends infer T
    ? T extends null
      ? null
      : {
          heroId: HeroId;
          sourceId: CardId;
          pool: "dirty-tricks" | "arcane-responses";
          targetId: string;
          choices: Array<{ id: DraftChoiceId; cost: 0 | 1 }>;
        }
    : never;
  rat: CardTrialState["rat"];
  queue: CardTrialState["queue"];
  streams: Record<HeroId, number>;
}

export interface CardTrialPlaytestContext {
  energyBefore: number;
  heroRowBefore: PlayerRow;
  heroHpBefore: number;
  heroGuardBefore: number;
  enemyCount: number;
  openedEnemyId: string | null;
  enemyHp: Record<string, number>;
}

export interface CardTrialRecordedAction {
  index: number;
  kind: CardTrialPlaytestActionKind;
  at: number;
  heroId: HeroId;
  decisionMs: number;
  cardUid?: string;
  cardId?: CardId;
  targetId?: string;
  secondTargetId?: string;
  rowBefore?: PlayerRow;
  rowAfter?: PlayerRow;
  context: CardTrialPlaytestContext;
  stateHashBefore: string;
  stateHashAfter: string;
  stateBefore: CardTrialStateFingerprint;
  stateAfter: CardTrialStateFingerprint;
}

export interface CardTrialRecordedInteraction {
  index: number;
  kind: CardTrialPlaytestInteractionKind;
  at: number;
  heroId: HeroId | null;
  cardUid?: string;
  cardId?: CardId;
  targetId?: string;
  decisionMs?: number;
  stateHash: string;
}

export interface CardTrialCardExposure {
  cardId: CardId;
  seen: number;
  playable: number;
  focused: number;
  armed: number;
  canceled: number;
  played: number;
  decisionMs: number[];
}

export interface CardTrialFightSummary {
  rounds: number;
  cardsPlayed: number;
  moves: number;
  passes: number;
  damageDealt: number;
  damageTaken: number;
  guardGained: number;
  openedApplied: number;
  openedConsumed: number;
}

export interface CardTrialFightRecord {
  fightId: number;
  fightName: string;
  seed: number;
  setup: "fight" | "triangle" | "sequential";
  startedAt: number;
  endedAt?: number;
  result?: "victory" | "defeat" | "abandoned";
  actions: CardTrialRecordedAction[];
  interactions: CardTrialRecordedInteraction[];
  cards: Record<CardId, CardTrialCardExposure>;
  summary: CardTrialFightSummary;
}

export interface CardTrialPlaytestSession {
  schemaVersion: typeof CARD_TRIAL_PLAYTEST_SCHEMA_VERSION;
  sessionId: string;
  gameVersion: CardTrialPlaytestBuild;
  startedAt: number;
  endedAt?: number;
  fights: CardTrialFightRecord[];
}

export interface CardTrialPlaytestActionStart {
  kind: CardTrialPlaytestActionKind;
  stateBefore: CardTrialStateFingerprint;
  decisionMs: number;
  heroId: HeroId;
  cardUid?: string;
  cardId?: CardId;
  targetId?: string;
  secondTargetId?: string;
  rowBefore?: PlayerRow;
  rowAfter?: PlayerRow;
  context: CardTrialPlaytestContext;
}

const HERO_IDS: HeroId[] = ["rat-king", "old-man"];

function cardList(cards: Array<{ uid: string; defId: CardId }>): Array<{ uid: string; defId: CardId }> {
  return cards.map((card) => ({ uid: card.uid, defId: card.defId }));
}

function currentHero(s: CardTrialState): HeroId | null {
  const actor = s.queue[s.queueIndex];
  return actor?.kind === "hero" ? (actor.id as HeroId) : null;
}

export function cardTrialActionContext(s: CardTrialState): CardTrialPlaytestContext {
  const heroId = currentHero(s);
  const hero = heroId ? s.heroes[heroId] : s.heroes["rat-king"];
  return {
    energyBefore: hero.energy,
    heroRowBefore: hero.row,
    heroHpBefore: hero.hp,
    heroGuardBefore: hero.guard,
    enemyCount: s.enemies.filter((enemy) => enemy.hp > 0).length,
    openedEnemyId: s.opened?.enemyId ?? null,
    enemyHp: Object.fromEntries(s.enemies.map((enemy) => [enemy.id, enemy.hp])),
  };
}

/** Explicit gameplay-only projection. Do not add timestamps or presentation state here. */
export function cardTrialStateFingerprint(s: CardTrialState): CardTrialStateFingerprint {
  return {
    fightId: s.fightId,
    fightName: s.fightName,
    seed: s.seed,
    round: s.round,
    phase: s.phase,
    result: s.result,
    queueIndex: s.queueIndex,
    slotCounter: s.slotCounter,
    uidSeq: s.uidSeq,
    actingHero: currentHero(s),
    heroes: HERO_IDS.map((id) => {
      const hero = s.heroes[id];
      return {
        id,
        hp: hero.hp,
        maxHp: hero.maxHp,
        guard: hero.guard,
        row: hero.row,
        rowEnteredAt: hero.rowEnteredAt,
        energy: hero.energy,
        paidMoveUsed: hero.paidMoveUsed,
        hand: cardList(hero.hand),
        draw: cardList(hero.draw),
        discard: cardList(hero.discard),
      };
    }),
    enemies: s.enemies.map((enemy) => ({
      id: enemy.id,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      visualRow: enemy.visualRow,
      intentIndex: enemy.intentIndex,
      hushed: !!enemy.hushed,
    })),
    opened: s.opened ? { ...s.opened } : null,
    crownedEnemyId: s.crownedEnemyId,
    omen: s.omen ? { ...s.omen } : null,
    draft: s.draft
      ? {
          heroId: s.draft.heroId,
          sourceId: s.draft.sourceId,
          pool: s.draft.pool,
          targetId: s.draft.targetId,
          choices: s.draft.choices.map((choice) => ({ id: choice.id, cost: choice.cost })),
        }
      : null,
    rat: s.rat ? { ...s.rat } : null,
    queue: s.queue.map((actor) => ({ ...actor })),
    streams: {
      "rat-king": s.streams["rat-king"].getState(),
      "old-man": s.streams["old-man"].getState(),
    },
  };
}

/** Presentation-independent, deterministic 64-bit FNV-1a digest. */
export function cardTrialStateHash(s: CardTrialState | CardTrialStateFingerprint): string {
  const fingerprint = "events" in s ? cardTrialStateFingerprint(s) : s;
  const json = JSON.stringify(fingerprint);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= BigInt(json.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyExposure(cardId: CardId): CardTrialCardExposure {
  return { cardId, seen: 0, playable: 0, focused: 0, armed: 0, canceled: 0, played: 0, decisionMs: [] };
}

function emptyCards(): Record<CardId, CardTrialCardExposure> {
  return Object.fromEntries(
    (Object.keys(CARD_DEFS) as CardId[]).map((id) => [id, emptyExposure(id)])
  ) as Record<CardId, CardTrialCardExposure>;
}

function emptySummary(): CardTrialFightSummary {
  return {
    rounds: 0,
    cardsPlayed: 0,
    moves: 0,
    passes: 0,
    damageDealt: 0,
    damageTaken: 0,
    guardGained: 0,
    openedApplied: 0,
    openedConsumed: 0,
  };
}

export interface CardTrialPlaytestRecorderOptions {
  build?: CardTrialPlaytestBuild;
  now?: () => number;
  sessionId?: string;
}

/** Session-local recorder. It is only instantiated by the debug surface. */
export class CardTrialPlaytestRecorder {
  private readonly now: () => number;
  private readonly build: CardTrialPlaytestBuild;
  private session: CardTrialPlaytestSession | null = null;
  private current: CardTrialFightRecord | null = null;
  private pending: CardTrialPlaytestActionStart | null = null;
  private interactionSeq = 0;
  private lastHandSignature = "";
  private lastFocusKey = "";
  private telemetryBaseline: {
    turns: number;
    opened: number;
  } | null = null;

  constructor(options: CardTrialPlaytestRecorderOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.build = { ...(options.build ?? {}) };
    this.session = {
      schemaVersion: CARD_TRIAL_PLAYTEST_SCHEMA_VERSION,
      sessionId: options.sessionId ?? newId(),
      gameVersion: { ...this.build },
      startedAt: this.now(),
      fights: [],
    };
  }

  beginFight(
    state: CardTrialState,
    setup: CardTrialFightRecord["setup"] = "fight"
  ): void {
    if (!this.session || this.session.endedAt !== undefined) {
      this.session = {
        schemaVersion: CARD_TRIAL_PLAYTEST_SCHEMA_VERSION,
        sessionId: newId(),
        gameVersion: { ...this.build },
        startedAt: this.now(),
        fights: [],
      };
    }
    if (this.current) this.finishFight(state, "abandoned");
    this.current = {
      fightId: state.fightId,
      fightName: state.fightName,
      seed: state.seed,
      setup,
      startedAt: this.now(),
      actions: [],
      interactions: [],
      cards: emptyCards(),
      summary: emptySummary(),
    };
    this.pending = null;
    this.lastHandSignature = "";
    this.lastFocusKey = "";
    this.telemetryBaseline = {
      turns: state.telemetry.turns.length,
      opened: state.telemetry.opened.length,
    };
    this.session.fights.push(this.current);
  }

  observe(
    state: CardTrialState,
    phase: string,
    cursor: number,
    hand: Array<{ uid: string; defId: CardId; disabled: boolean }>
  ): void {
    const fight = this.current;
    if (!fight) return;
    const hero = currentHero(state);
    if (!hero || state.phase !== "hero-turn") return;
    const signature = `${hero}|${phase}|${hand.map((card) => `${card.uid}:${card.disabled ? 1 : 0}`).join(",")}`;
    if (signature !== this.lastHandSignature && phase === "hand") {
      this.lastHandSignature = signature;
      for (const card of hand) {
        const exposure = fight.cards[card.defId];
        exposure.seen += 1;
        if (!card.disabled) exposure.playable += 1;
      }
    }
    const focused = hand[cursor];
    const focusKey = `${phase}|${cursor}|${focused?.uid ?? ""}`;
    if (focusKey !== this.lastFocusKey && focused) {
      this.lastFocusKey = focusKey;
      const exposure = fight.cards[focused.defId];
      if (phase === "hand") exposure.focused += 1;
      if (phase === "target" || phase === "target2") exposure.armed += 1;
    }
  }

  recordInteraction(
    kind: CardTrialPlaytestInteractionKind,
    state: CardTrialState,
    details: Omit<CardTrialRecordedInteraction, "index" | "kind" | "at" | "heroId" | "stateHash">
  ): void {
    const fight = this.current;
    if (!fight) return;
    const hero = currentHero(state);
    const interaction: CardTrialRecordedInteraction = {
      index: this.interactionSeq++,
      kind,
      at: this.now(),
      heroId: hero,
      stateHash: cardTrialStateHash(state),
      ...details,
    };
    fight.interactions.push(interaction);
    if (kind === "target-cancel" && interaction.cardId) fight.cards[interaction.cardId].canceled += 1;
    if (kind === "disabled-attempt" && interaction.cardId) fight.cards[interaction.cardId].canceled += 1;
  }

  beginAction(action: CardTrialPlaytestActionStart): void {
    if (!this.current) return;
    this.pending = action;
  }

  finishAction(state: CardTrialState): CardTrialRecordedAction | null {
    const fight = this.current;
    const pending = this.pending;
    if (!fight || !pending) return null;
    this.pending = null;
    const action: CardTrialRecordedAction = {
      index: fight.actions.length,
      kind: pending.kind,
      at: this.now(),
      heroId: pending.heroId,
      decisionMs: pending.decisionMs,
      cardUid: pending.cardUid,
      cardId: pending.cardId,
      targetId: pending.targetId,
      secondTargetId: pending.secondTargetId,
      rowBefore: pending.rowBefore,
      rowAfter: pending.rowAfter,
      context: { ...pending.context, enemyHp: { ...pending.context.enemyHp } },
      stateHashBefore: cardTrialStateHash(pending.stateBefore),
      stateHashAfter: cardTrialStateHash(state),
      stateBefore: pending.stateBefore,
      stateAfter: cardTrialStateFingerprint(state),
    };
    fight.actions.push(action);
    if (action.cardId) {
      const exposure = fight.cards[action.cardId];
      exposure.played += 1;
      exposure.decisionMs.push(action.decisionMs);
    }
    return action;
  }

  finishFight(state: CardTrialState, result?: "abandoned"): void {
    const fight = this.current;
    if (!fight) return;
    if (this.pending) {
      this.pending = null;
    }
    const actual = result ?? (state.result === "victory" ? "victory" : state.result === "wipe" ? "defeat" : "abandoned");
    fight.endedAt = this.now();
    fight.result = actual;
    const baseline = this.telemetryBaseline ?? {
      turns: 0,
      opened: 0,
    };
    const turns = state.telemetry.turns.slice(baseline.turns);
    const opened = state.telemetry.opened.slice(baseline.opened);
    fight.summary = {
      rounds: state.round,
      cardsPlayed: fight.actions.filter((action) => action.kind === "card").length,
      moves: turns.filter((turn) => turn.paidMove).length,
      passes: fight.actions.filter((action) => action.kind === "pass").length,
      damageDealt: turns.reduce((n, turn) => n + turn.damageDealt, 0),
      damageTaken: turns.reduce((n, turn) => n + turn.hpLostAfter, 0),
      guardGained: turns.reduce((n, turn) => n + turn.guardGained, 0),
      openedApplied: opened.length,
      openedConsumed: opened.filter((entry) => entry.openedConsumedBy !== null).length,
    };
    this.current = null;
    this.lastHandSignature = "";
    this.lastFocusKey = "";
    this.telemetryBaseline = null;
  }

  endSession(state?: CardTrialState): CardTrialPlaytestSession | null {
    if (!this.session) return null;
    if (this.current && state) this.finishFight(state, "abandoned");
    this.session.endedAt = this.now();
    return this.snapshot();
  }

  snapshot(): CardTrialPlaytestSession | null {
    if (!this.session) return null;
    return JSON.parse(JSON.stringify(this.session)) as CardTrialPlaytestSession;
  }
}
