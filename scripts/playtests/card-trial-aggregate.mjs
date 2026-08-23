#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readSessions, renderSummary, summarizeSessions } from "./card-trial-analysis.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: "string", default: "" }, out: { type: "string", default: "" } },
});
const files = positionals.flatMap((value) => {
  if (!value.includes("*") && fs.existsSync(value) && fs.statSync(value).isFile()) return [value];
  const dir = path.dirname(value);
  const base = path.basename(value).replaceAll("*", "");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.includes(base) && name.endsWith(".json")).map((name) => path.join(dir, name));
});
if (!files.length) {
  console.error("Usage: node scripts/playtests/card-trial-aggregate.mjs output/playtest-artifacts/sessions/*.json");
  process.exit(2);
}
const summary = summarizeSessions(readSessions(files));
process.stdout.write(renderSummary(summary));
if (values.json) {
  fs.mkdirSync(path.dirname(values.json), { recursive: true });
  fs.writeFileSync(values.json, JSON.stringify(summary, null, 2));
}
if (values.out) {
  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, renderSummary(summary));
}
