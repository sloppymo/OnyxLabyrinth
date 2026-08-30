import { CARD_DEFS } from "../cards";
import type { CardId, CardTrialState } from "../types";
import type { FightRunRecord } from "./runner";
import type { RowCounterfactualMetrics } from "./row-value";

export interface CardSimStats {
  drawn: number;
  played: number;
  discarded: number;
  discardedPlayable: number;
}

export interface OpenedSimStats {
  created: number;
  consumed: number;
  sameHero: number;
  partner: number;
  diedUnconsumed: number;
  movedBeforeConsume: number;
}

export interface SimFightMetrics {
  outcome: FightRunRecord["outcome"];
  rounds: number;
  heroTurns: number;
  damageDealt: number;
  guardGained: number;
  guardAbsorbed: number;
  paidMoves: number;
  energyLeftAtTurnEnd: number[];
  discardedPlayable: CardId[];
  cards: Record<string, CardSimStats>;
  opened: OpenedSimStats;
  hpRemaining: FightRunRecord["hpRemaining"];
  uniqueCardsPlayed: number;
  partnerDead: boolean;
  rowChanges: number;
  cardPrintedMoves: number;
  emptyRowMisses: number;
  rowCounterfactual: RowCounterfactualMetrics;
  actions: FightRunRecord["actions"];
  stateCoverage: FightRunRecord["stateCoverage"];
}

function emptyCardStats(): CardSimStats {
  return { drawn: 0, played: 0, discarded: 0, discardedPlayable: 0 };
}

export function collectMetrics(s: CardTrialState, run: FightRunRecord): SimFightMetrics {
  const cards: Record<string, CardSimStats> = {};
  for (const [id, st] of Object.entries(s.telemetry.cardStats)) {
    cards[id] = {
      drawn: st.drawn,
      played: st.played,
      discarded: st.discarded,
      discardedPlayable: 0,
    };
  }
  const discardedPlayable: CardId[] = [];
  for (const turn of s.telemetry.turns) {
    for (const id of turn.cardsDiscarded) {
      const extra = s.ruleset?.cards[id];
      const cost = extra?.cost ?? (CARD_DEFS as Record<string, { cost: 1 | 2 } | undefined>)[id]?.cost ?? 99;
      if (cost <= turn.energyRemaining) {
        discardedPlayable.push(id);
        const slot = cards[id] ?? (cards[id] = emptyCardStats());
        slot.discardedPlayable += 1;
      }
    }
  }
  const openedRec = s.telemetry.opened;
  const unique = new Set([
    ...s.telemetry.turns.flatMap((t) => t.cardsPlayed),
    ...(s.openTurn?.cardsPlayed ?? []),
  ]);
  const partnerDead =
    s.heroes["rat-king"].hp <= 0 || s.heroes["old-man"].hp <= 0 || run.hpRemaining["rat-king"] <= 0 || run.hpRemaining["old-man"] <= 0;
  return {
    outcome: run.outcome,
    rounds: run.rounds,
    heroTurns: run.heroTurns,
    damageDealt: run.damageDealt,
    guardGained: s.telemetry.turns.reduce((n, t) => n + t.guardGained, 0) + (s.openTurn?.guardGained ?? 0),
    guardAbsorbed: s.telemetry.guardAbsorbed,
    paidMoves: s.telemetry.turns.filter((t) => t.paidMove).length + (s.openTurn?.paidMove ? 1 : 0),
    energyLeftAtTurnEnd: s.telemetry.turns.map((t) => t.energyRemaining),
    discardedPlayable,
    cards,
    opened: {
      created: openedRec.length,
      consumed: openedRec.filter((o) => o.openedConsumedBy).length,
      sameHero: openedRec.filter((o) => o.openedConsumedBy && o.openedConsumedBy === o.openedCreatedBy).length,
      partner: openedRec.filter((o) => o.openedConsumedBy && o.openedConsumedBy !== o.openedCreatedBy).length,
      diedUnconsumed: openedRec.filter((o) => o.diedUnconsumed).length,
      movedBeforeConsume: openedRec.filter((o) => o.movedBeforeConsume).length,
    },
    hpRemaining: run.hpRemaining,
    uniqueCardsPlayed: unique.size,
    partnerDead,
    rowChanges: s.telemetry.turns.filter((t) => t.row !== t.endingRow).length +
      (s.openTurn && s.openTurn.row !== s.openTurn.endingRow ? 1 : 0),
    cardPrintedMoves: s.telemetry.turns.filter((t) => t.cardPrintedMovement).length +
      (s.openTurn?.cardPrintedMovement ? 1 : 0),
    emptyRowMisses: s.telemetry.intents.reduce((sum, intent) => sum + intent.missedEmpty, 0),
    rowCounterfactual: run.rowCounterfactual,
    actions: run.actions,
    stateCoverage: run.stateCoverage,
  };
}

export function actionDiversity(metrics: SimFightMetrics): number {
  return metrics.uniqueCardsPlayed + (metrics.paidMoves > 0 ? 1 : 0);
}
