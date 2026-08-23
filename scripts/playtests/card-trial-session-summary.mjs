#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readSessions, renderSummary, summarizeSessions } from "./card-trial-analysis.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: "string", default: "" }, out: { type: "string", default: "" } },
});
if (!positionals.length) {
  console.error("Usage: node scripts/playtests/card-trial-session-summary.mjs session.json [session2.json ...] [--json summary.json] [--out summary.md]");
  process.exit(2);
}
const summary = summarizeSessions(readSessions(positionals));
const markdown = renderSummary(summary);
process.stdout.write(markdown);
if (values.json) {
  fs.mkdirSync(path.dirname(values.json), { recursive: true });
  fs.writeFileSync(values.json, JSON.stringify(summary, null, 2));
}
if (values.out) {
  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, markdown);
}
