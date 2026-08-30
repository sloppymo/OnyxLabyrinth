import type { ComparisonReport } from "./compare";
import type { StateFeatureCoverage } from "./runner";

export interface DominanceReport {
  winDelta: number;
  moveDelta: number;
  baselineDominatesWins: boolean;
  variantReducesMoves: boolean;
  variantReducesDiversity: boolean;
  partnerDeadBaseline: number;
  partnerDeadVariant: number;
  coverage: {
    baseline: StateFeatureCoverage;
    variant: StateFeatureCoverage;
  };
  pairedOutcomes: Array<{
    seed: number;
    baseline: ComparisonReport["paired"][number]["baseline"]["outcome"];
    variant: ComparisonReport["paired"][number]["variant"]["outcome"];
  }>;
}

function sumCoverage(rows: ComparisonReport["paired"], arm: "baseline" | "variant"): StateFeatureCoverage {
  const out: StateFeatureCoverage = {
    openedTurns: 0,
    hushTurns: 0,
    crownedTurns: 0,
    omenTurns: 0,
    ratTurns: 0,
    frontRowTurns: 0,
    lowHpTurns: 0,
    multiEnemyTurns: 0,
  };
  for (const row of rows) {
    const coverage = row[arm].stateCoverage;
    if (!coverage) continue;
    out.openedTurns += coverage.openedTurns;
    out.hushTurns += coverage.hushTurns;
    out.crownedTurns += coverage.crownedTurns;
    out.omenTurns += coverage.omenTurns;
    out.ratTurns += coverage.ratTurns;
    out.frontRowTurns += coverage.frontRowTurns;
    out.lowHpTurns += coverage.lowHpTurns;
    out.multiEnemyTurns += coverage.multiEnemyTurns;
  }
  return out;
}

/** Cheap paired signals — not a full strategy-steering proof. */
export function dominanceReport(cmp: ComparisonReport): DominanceReport {
  return {
    winDelta: cmp.winDelta,
    moveDelta: cmp.moveDelta,
    baselineDominatesWins: cmp.baseline.wins > cmp.variant.wins,
    variantReducesMoves: cmp.variant.meanPaidMoves < cmp.baseline.meanPaidMoves,
    variantReducesDiversity: cmp.variant.actionDiversity < cmp.baseline.actionDiversity,
    partnerDeadBaseline: cmp.paired.filter((p) => p.baseline.partnerDead).length,
    partnerDeadVariant: cmp.paired.filter((p) => p.variant.partnerDead).length,
    coverage: {
      baseline: sumCoverage(cmp.paired, "baseline"),
      variant: sumCoverage(cmp.paired, "variant"),
    },
    pairedOutcomes: cmp.paired.map((p) => ({
      seed: p.seed,
      baseline: p.baseline.outcome,
      variant: p.variant.outcome,
    })),
  };
}
