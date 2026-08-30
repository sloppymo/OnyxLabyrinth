import { comparePaired, summarizeArm, type ComparisonReport } from "./compare";
import type { FightDefinition } from "./definition";
import { dominanceReport, type DominanceReport } from "./dominance";
import { createFightFromDefinition } from "./factory";
import { collectMetrics, type SimFightMetrics } from "./metrics";
import {
  beamSearchPolicy,
  fixedPolicy,
  frontAwarePolicy,
  guardAwarePolicy,
  openedAwarePolicy,
  randomLegalPolicy,
  threatFirstPolicy,
  type CardTrialPolicy,
} from "./policies";
import { runFight, type FightRunRecord } from "./runner";
import type { RowCounterfactualMetrics } from "./row-value";

export type SimPolicyName =
  | "threat-aware"
  | "threat-first"
  | "random-legal"
  | "pass"
  | "damage"
  | "guard-aware"
  | "front-aware"
  | "opened-aware"
  | "beam";

export interface CardTrialSimConfig {
  id: string;
  name: string;
  baseline: FightDefinition;
  variant?: FightDefinition;
  notes?: string;
}

export interface ExperimentFightRow {
  seed: number;
  arm: "baseline" | "variant" | "solo";
  outcome: FightRunRecord["outcome"];
  rounds: number;
  heroTurns: number;
  damageDealt: number;
  paidMoves: number;
  discardedPlayable: number;
  guardGained: number;
  guardAbsorbed: number;
  energyLeft: number;
  rowChanges: number;
  cardPrintedMoves: number;
  emptyRowMisses: number;
  opened: SimFightMetrics["opened"];
  rowCounterfactual: RowCounterfactualMetrics;
  hpRemaining: FightRunRecord["hpRemaining"];
  actions: FightRunRecord["actions"];
}

export interface ExperimentResult {
  config: { id: string; name: string; notes?: string; policy: SimPolicyName; seeds: number[] };
  summary: ComparisonReport["baseline"] & { fights: number };
  variantSummary: ComparisonReport["variant"] | null;
  fights: ExperimentFightRow[];
  cardStats: Record<string, { drawn: number; played: number; discarded: number; discardedPlayable: number }>;
  dominance: DominanceReport | null;
  comparison: ComparisonReport | null;
  reportMd: string;
}

export function parseSeeds(spec: string): number[] {
  const trimmed = spec.trim();
  if (trimmed.includes(":")) {
    const [loRaw, hiRaw] = trimmed.split(":");
    const lo = Number(loRaw);
    const hi = Number(hiRaw);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
      throw new Error(`Invalid seed range "${spec}"`);
    }
    const out: number[] = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  }
  return trimmed.split(",").map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n)) throw new Error(`Invalid seed "${part}"`);
    return n;
  });
}

export function policyForName(name: SimPolicyName, seed: number): CardTrialPolicy {
  switch (name) {
    case "threat-aware":
    case "threat-first":
      return threatFirstPolicy();
    case "random-legal":
      return randomLegalPolicy(seed);
    case "pass":
      return fixedPolicy("pass");
    case "damage":
      return fixedPolicy("damage");
    case "guard-aware":
      return guardAwarePolicy();
    case "front-aware":
      return frontAwarePolicy();
    case "opened-aware":
      return openedAwarePolicy();
    case "beam":
      return beamSearchPolicy({ depth: 2, width: 8 });
  }
}

function aggregateCardStats(rows: SimFightMetrics[]) {
  const out: ExperimentResult["cardStats"] = {};
  for (const metrics of rows) {
    for (const [id, st] of Object.entries(metrics.cards)) {
      const slot = out[id] ?? (out[id] = { drawn: 0, played: 0, discarded: 0, discardedPlayable: 0 });
      slot.drawn += st.drawn;
      slot.played += st.played;
      slot.discarded += st.discarded;
      slot.discardedPlayable += st.discardedPlayable;
    }
  }
  return out;
}

function rowFrom(
  seed: number,
  arm: ExperimentFightRow["arm"],
  metrics: SimFightMetrics,
  actions: FightRunRecord["actions"]
): ExperimentFightRow {
  return {
    seed,
    arm,
    outcome: metrics.outcome,
    rounds: metrics.rounds,
    heroTurns: metrics.heroTurns,
    damageDealt: metrics.damageDealt,
    paidMoves: metrics.paidMoves,
    discardedPlayable: metrics.discardedPlayable.length,
    guardGained: metrics.guardGained,
    guardAbsorbed: metrics.guardAbsorbed,
    energyLeft: metrics.energyLeftAtTurnEnd.reduce((sum, energy) => sum + energy, 0),
    rowChanges: metrics.rowChanges,
    cardPrintedMoves: metrics.cardPrintedMoves,
    emptyRowMisses: metrics.emptyRowMisses,
    opened: metrics.opened,
    rowCounterfactual: metrics.rowCounterfactual,
    hpRemaining: metrics.hpRemaining,
    actions,
  };
}

function renderReport(result: ExperimentResult): string {
  const lines = [
    `# ${result.config.name}`,
    "",
    `- id: ${result.config.id}`,
    `- policy: ${result.config.policy}`,
    `- seeds: ${result.config.seeds[0]}..${result.config.seeds[result.config.seeds.length - 1]} (${result.config.seeds.length})`,
    "",
    "## Summary",
    "",
    `| arm | wins | wipes | timeouts | mean rounds | mean damage | mean moves | diversity |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
    `| baseline | ${result.summary.wins} | ${result.summary.wipes} | ${result.summary.timeouts} | ${result.summary.meanRounds.toFixed(2)} | ${result.summary.meanDamageDealt.toFixed(1)} | ${result.summary.meanPaidMoves.toFixed(2)} | ${result.summary.actionDiversity.toFixed(2)} |`,
  ];
  if (result.variantSummary) {
    const v = result.variantSummary;
    lines.push(
      `| variant | ${v.wins} | ${v.wipes} | ${v.timeouts} | ${v.meanRounds.toFixed(2)} | ${v.meanDamageDealt.toFixed(1)} | ${v.meanPaidMoves.toFixed(2)} | ${v.actionDiversity.toFixed(2)} |`,
    );
  }
  lines.push(
    "",
    "## Position and cooperation",
    "",
    `- baseline: row changes ${result.summary.meanRowChanges.toFixed(2)}, empty-row misses ${result.summary.meanEmptyRowMisses.toFixed(2)}, Opened partner consumes ${result.summary.meanOpenedPartner.toFixed(2)}, row-sensitive turns ${(result.summary.rowSensitiveTurnRate * 100).toFixed(1)}%`,
  );
  if (result.variantSummary) {
    const v = result.variantSummary;
    lines.push(
      `- variant: row changes ${v.meanRowChanges.toFixed(2)}, empty-row misses ${v.meanEmptyRowMisses.toFixed(2)}, Opened partner consumes ${v.meanOpenedPartner.toFixed(2)}, row-sensitive turns ${(v.rowSensitiveTurnRate * 100).toFixed(1)}%`,
    );
  }
  if (result.dominance) {
    lines.push(
      "",
      "## Dominance signals",
      "",
      `- winDelta (variant - baseline): ${result.dominance.winDelta}`,
      `- moveDelta: ${result.dominance.moveDelta.toFixed(3)}`,
      `- variant reduces Move usage: ${result.dominance.variantReducesMoves}`,
      `- variant reduces action diversity: ${result.dominance.variantReducesDiversity}`,
    );
  }
  lines.push(
    "",
    "This report cannot answer comprehension, excitement, UI readability, or whether Front felt desirable. Those still need human playtests.",
    "",
  );
  return lines.join("\n");
}

export function runExperiment(opts: {
  config: CardTrialSimConfig;
  seeds: number[];
  policy: SimPolicyName;
  maxRounds?: number;
  maxActions?: number;
  measureRowValue?: boolean;
}): ExperimentResult {
  const policyFor = (seed: number) => policyForName(opts.policy, seed);
  if (opts.config.variant) {
    const comparison = comparePaired({
      baseline: opts.config.baseline,
      variant: opts.config.variant,
      seeds: opts.seeds,
      policyFor,
      maxRounds: opts.maxRounds,
      maxActions: opts.maxActions,
      measureRowValue: opts.measureRowValue,
    });
    const fights: ExperimentFightRow[] = [];
    for (const pair of comparison.paired) {
      fights.push(
        rowFrom(pair.seed, "baseline", pair.baseline, pair.baseline.actions),
        rowFrom(pair.seed, "variant", pair.variant, pair.variant.actions),
      );
    }
    const cardStats = aggregateCardStats([
      ...comparison.paired.map((p) => p.baseline),
      ...comparison.paired.map((p) => p.variant),
    ]);
    const result: ExperimentResult = {
      config: {
        id: opts.config.id,
        name: opts.config.name,
        notes: opts.config.notes,
        policy: opts.policy,
        seeds: opts.seeds,
      },
      summary: { ...comparison.baseline, fights: opts.seeds.length },
      variantSummary: comparison.variant,
      fights,
      cardStats,
      dominance: dominanceReport(comparison),
      comparison,
      reportMd: "",
    };
    result.reportMd = renderReport(result);
    return result;
  }

  const metricsRows: SimFightMetrics[] = [];
  const fights: ExperimentFightRow[] = [];
  for (const seed of opts.seeds) {
    const s = createFightFromDefinition({ ...opts.config.baseline, seed });
    const run = runFight(s, {
      policy: policyFor(seed),
      maxRounds: opts.maxRounds,
      maxActions: opts.maxActions,
      measureRowValue: opts.measureRowValue,
    });
    const metrics = collectMetrics(s, run);
    metricsRows.push(metrics);
    fights.push(rowFrom(seed, "solo", metrics, run.actions));
  }
  const result: ExperimentResult = {
    config: {
      id: opts.config.id,
      name: opts.config.name,
      notes: opts.config.notes,
      policy: opts.policy,
      seeds: opts.seeds,
    },
    summary: { ...summarizeArm(metricsRows), fights: opts.seeds.length },
    variantSummary: null,
    fights,
    cardStats: aggregateCardStats(metricsRows),
    dominance: null,
    comparison: null,
    reportMd: "",
  };
  result.reportMd = renderReport(result);
  return result;
}
