import type { FightDefinition } from "./definition";
import { createFightFromDefinition } from "./factory";
import { actionDiversity, collectMetrics, type SimFightMetrics } from "./metrics";
import type { CardTrialPolicy } from "./policy-types";
import { runFight } from "./runner";

export interface CompareOpts {
  baseline: FightDefinition;
  variant: FightDefinition;
  seeds: number[];
  policyFor: (seed: number) => CardTrialPolicy;
  maxRounds?: number;
  maxActions?: number;
  measureRowValue?: boolean;
  /** Stable shuffle key used for both arms of a paired comparison. */
  pairShuffleKey?: string;
}

export interface ArmSummary {
  wins: number;
  wipes: number;
  timeouts: number;
  meanRounds: number;
  meanDamageDealt: number;
  meanPaidMoves: number;
  actionDiversity: number;
  meanDiscardedPlayable: number;
  meanHeroTurns: number;
  meanGuardGained: number;
  meanGuardAbsorbed: number;
  meanEnergyLeft: number;
  meanRowChanges: number;
  meanCardPrintedMoves: number;
  meanEmptyRowMisses: number;
  meanOpenedCreated: number;
  meanOpenedConsumed: number;
  meanOpenedPartner: number;
  meanOpenedMoved: number;
  meanOpenedDiedUnconsumed: number;
  rowSensitiveActionRate: number;
  rowSensitiveTurnRate: number;
  meanMaxRowTacticalDelta: number;
  partnerDeadFights: number;
}

export interface ComparisonReport {
  seeds: number[];
  baseline: ArmSummary;
  variant: ArmSummary;
  paired: Array<{ seed: number; baseline: SimFightMetrics; variant: SimFightMetrics }>;
  winDelta: number;
  moveDelta: number;
}

function runArm(def: FightDefinition, seed: number, opts: CompareOpts): SimFightMetrics {
  const s = createFightFromDefinition(
    { ...def, seed },
    { shuffleKey: opts.pairShuffleKey ?? opts.baseline.id },
  );
  const run = runFight(s, {
    policy: opts.policyFor(seed),
    maxRounds: opts.maxRounds,
    maxActions: opts.maxActions,
    measureRowValue: opts.measureRowValue,
  });
  return collectMetrics(s, run);
}

export function summarizeArm(rows: SimFightMetrics[]): ArmSummary {
  const n = Math.max(1, rows.length);
  return {
    wins: rows.filter((r) => r.outcome === "victory").length,
    wipes: rows.filter((r) => r.outcome === "wipe").length,
    timeouts: rows.filter((r) => r.outcome === "timeout").length,
    meanRounds: rows.reduce((s, r) => s + r.rounds, 0) / n,
    meanDamageDealt: rows.reduce((s, r) => s + r.damageDealt, 0) / n,
    meanPaidMoves: rows.reduce((s, r) => s + r.paidMoves, 0) / n,
    actionDiversity: rows.reduce((s, r) => s + actionDiversity(r), 0) / n,
    meanDiscardedPlayable: rows.reduce((s, r) => s + r.discardedPlayable.length, 0) / n,
    meanHeroTurns: rows.reduce((s, r) => s + r.heroTurns, 0) / n,
    meanGuardGained: rows.reduce((s, r) => s + r.guardGained, 0) / n,
    meanGuardAbsorbed: rows.reduce((s, r) => s + r.guardAbsorbed, 0) / n,
    meanEnergyLeft: rows.reduce(
      (s, r) => s + r.energyLeftAtTurnEnd.reduce((sum, energy) => sum + energy, 0),
      0,
    ) / n,
    meanRowChanges: rows.reduce((s, r) => s + r.rowChanges, 0) / n,
    meanCardPrintedMoves: rows.reduce((s, r) => s + r.cardPrintedMoves, 0) / n,
    meanEmptyRowMisses: rows.reduce((s, r) => s + r.emptyRowMisses, 0) / n,
    meanOpenedCreated: rows.reduce((s, r) => s + r.opened.created, 0) / n,
    meanOpenedConsumed: rows.reduce((s, r) => s + r.opened.consumed, 0) / n,
    meanOpenedPartner: rows.reduce((s, r) => s + r.opened.partner, 0) / n,
    meanOpenedMoved: rows.reduce((s, r) => s + r.opened.movedBeforeConsume, 0) / n,
    meanOpenedDiedUnconsumed: rows.reduce((s, r) => s + r.opened.diedUnconsumed, 0) / n,
    rowSensitiveActionRate: rows.reduce((s, r) => {
      const compared = r.rowCounterfactual.legalActionsCompared;
      return s + (compared > 0 ? r.rowCounterfactual.rowSensitiveActions / compared : 0);
    }, 0) / n,
    rowSensitiveTurnRate: rows.reduce((s, r) => {
      const turns = r.rowCounterfactual.decisionTurns;
      return s + (turns > 0 ? r.rowCounterfactual.turnsWithRowSensitiveAction / turns : 0);
    }, 0) / n,
    meanMaxRowTacticalDelta: rows.reduce(
      (s, r) => s + r.rowCounterfactual.maxAbsTacticalDelta,
      0,
    ) / n,
    partnerDeadFights: rows.filter((r) => r.partnerDead).length,
  };
}

export function comparePaired(opts: CompareOpts): ComparisonReport {
  const paired = opts.seeds.map((seed) => ({
    seed,
    baseline: runArm(opts.baseline, seed, opts),
    variant: runArm(opts.variant, seed, opts),
  }));
  const baseline = summarizeArm(paired.map((p) => p.baseline));
  const variant = summarizeArm(paired.map((p) => p.variant));
  return {
    seeds: [...opts.seeds],
    baseline,
    variant,
    paired,
    winDelta: variant.wins - baseline.wins,
    moveDelta: variant.meanPaidMoves - baseline.meanPaidMoves,
  };
}
