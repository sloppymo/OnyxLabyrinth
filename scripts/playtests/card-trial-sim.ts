#!/usr/bin/env tsx
/**
 * Headless Card Trial simulator. DOM / Phaser / Vite are not loaded.
 *
 *   npm run card-trial:sim -- \
 *     --config scripts/playtests/card-trial-experiments/staff-kicker.ts \
 *     --seeds 1:20 \
 *     --policy threat-aware \
 *     --out output/card-trial-sim/staff-kicker
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSeeds,
  runExperiment,
  type ExperimentResult,
  type CardTrialSimConfig,
  type SimPolicyName,
} from "../../src/game/card-trial/sim/experiment.ts";
import type { CardTrialSimSuiteConfig } from "../../src/game/card-trial/sim/production.ts";

const POLICIES: SimPolicyName[] = [
  "threat-aware",
  "threat-first",
  "random-legal",
  "pass",
  "damage",
  "guard-aware",
  "front-aware",
  "opened-aware",
  "beam",
];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--")) {
    return process.argv[i + 1];
  }
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

type LoadedConfig = CardTrialSimConfig | CardTrialSimSuiteConfig;

async function loadConfig(spec: string): Promise<LoadedConfig> {
  const abs = path.resolve(spec);
  if (!fs.existsSync(abs)) throw new Error(`Config not found: ${abs}`);
  const mod = (await import(pathToFileURL(abs).href)) as {
    default?: CardTrialSimConfig;
    config?: CardTrialSimConfig;
    experiment?: CardTrialSimConfig;
    suite?: CardTrialSimSuiteConfig;
  };
  const config = mod.default ?? mod.config ?? mod.experiment ?? mod.suite;
  if (!config || (!("baseline" in config) && !("scenarios" in config))) {
    throw new Error(`Config ${abs} must export a CardTrialSimConfig or CardTrialSimSuiteConfig`);
  }
  return config;
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
}

function writeExperimentOutput(
  outDir: string,
  configPath: string,
  config: CardTrialSimConfig,
  result: ExperimentResult,
  maxRounds: number,
  maxActions: number,
  measureRowValue: boolean,
): void {
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, "config.json"), {
    ...result.config,
    configPath,
    maxRounds,
    maxActions,
    measureRowValue,
    baselineRowMode: config.baseline.rowMode ?? "full",
    variantRowMode: config.variant?.rowMode ?? null,
    notes: config.notes,
  });
  writeJson(path.join(outDir, "summary.json"), {
    baseline: result.summary,
    variant: result.variantSummary,
  });
  fs.writeFileSync(
    path.join(outDir, "fights.jsonl"),
    result.fights.map((row) => JSON.stringify(row)).join("\n") + (result.fights.length ? "\n" : ""),
  );
  writeJson(path.join(outDir, "card-stats.json"), result.cardStats);
  writeJson(path.join(outDir, "dominance-report.json"), result.dominance);
  fs.writeFileSync(path.join(outDir, "report.md"), result.reportMd);
}

async function main(): Promise<void> {
  if (hasFlag("--help") || process.argv.length <= 2) {
    console.log(`Usage: npm run card-trial:sim -- --config <file.ts> --seeds 1:100 --policy threat-aware --out output/card-trial-sim/run

Policies: ${POLICIES.join(", ")}
This answers solvability, dominance, dead cards, Move collapse, and illegal loops.
It cannot answer comprehension, excitement, or UI feel.
Add --row-metrics for shallow current-row counterfactuals (slower, simulator-only).
Configs may also export a production suite with scenarios[].`);
    process.exit(hasFlag("--help") ? 0 : 1);
  }

  const configPath = arg("--config");
  if (!configPath) throw new Error("Missing --config");
  const seeds = parseSeeds(arg("--seeds") ?? "1:20");
  const policy = (arg("--policy") ?? "threat-aware") as SimPolicyName;
  if (!POLICIES.includes(policy)) throw new Error(`Unknown --policy ${policy}`);
  const outDir = path.resolve(arg("--out") ?? path.join("output", "card-trial-sim", "run"));
  const maxRounds = Number(arg("--max-rounds") ?? "20");
  const maxActions = Number(arg("--max-actions") ?? "400");
  const measureRowValue = hasFlag("--row-metrics");

  const config = await loadConfig(configPath);
  if ("scenarios" in config) {
    fs.mkdirSync(outDir, { recursive: true });
    const rows: Array<Record<string, unknown>> = [];
    config.scenarios.forEach((scenario, index) => {
      const result = runExperiment({
        config: scenario,
        seeds,
        policy,
        maxRounds,
        maxActions,
        measureRowValue,
      });
      const scenarioDir = path.join(outDir, `${String(index + 1).padStart(2, "0")}-${slug(scenario.id)}`);
      writeExperimentOutput(
        scenarioDir,
        configPath,
        scenario,
        result,
        maxRounds,
        maxActions,
        measureRowValue,
      );
      rows.push({
        id: scenario.id,
        name: scenario.name,
        baseline: result.summary,
        variant: result.variantSummary,
      });
    });
    writeJson(path.join(outDir, "suite-config.json"), {
      id: config.id,
      name: config.name,
      notes: config.notes,
      configPath,
      policy,
      seeds,
      maxRounds,
      maxActions,
      measureRowValue,
      scenarios: config.scenarios.map((scenario) => ({ id: scenario.id, name: scenario.name })),
    });
    writeJson(path.join(outDir, "suite-summary.json"), rows);
    const lines = [
      `# ${config.name}`,
      "",
      `Policy: ${policy}`,
      `Seeds: ${seeds[0]}..${seeds[seeds.length - 1]} (${seeds.length})`,
      "",
      "| scenario | baseline wins | variant wins | baseline rounds | variant rounds | baseline moves | variant moves | baseline row-sensitive turns | variant row-sensitive turns |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const [index, row] of rows.entries()) {
      const summary = row.baseline as ExperimentResult["summary"];
      const variant = row.variant as ExperimentResult["variantSummary"];
      lines.push(
        `| [${row.id}](./${String(index + 1).padStart(2, "0")}-${slug(String(row.id))}/report.md) | ${summary.wins} | ${variant ? variant.wins : "—"} | ${summary.meanRounds.toFixed(2)} | ${variant ? variant.meanRounds.toFixed(2) : "—"} | ${summary.meanPaidMoves.toFixed(2)} | ${variant ? variant.meanPaidMoves.toFixed(2) : "—"} | ${(summary.rowSensitiveTurnRate * 100).toFixed(1)}% | ${variant ? `${(variant.rowSensitiveTurnRate * 100).toFixed(1)}%` : "—"} |`,
      );
    }
    lines.push("", "This report is mechanical evidence only; it cannot answer comprehension, excitement, or UI feel.", "");
    fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));
    console.log(`Wrote ${outDir} (${config.scenarios.length} scenarios, ${seeds.length} seeds each, policy ${policy})`);
    return;
  }

  const result = runExperiment({
    config,
    seeds,
    policy,
    maxRounds,
    maxActions,
    measureRowValue,
  });
  writeExperimentOutput(outDir, configPath, config, result, maxRounds, maxActions, measureRowValue);
  console.log(`Wrote ${outDir} (${result.summary.fights} seeds, policy ${policy})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
