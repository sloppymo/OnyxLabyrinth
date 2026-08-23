#!/usr/bin/env node
/** Package a local Card Trial session into a shareable, anonymous repro bundle. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readSessions, renderSummary, summarizeSessions } from "./card-trial-analysis.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    replay: { type: "string", default: "" },
    summary: { type: "string", default: "" },
    out: { type: "string", default: "" },
  },
});

const sessionPath = positionals[0];
if (!sessionPath) {
  console.error("Usage: node scripts/playtests/card-trial-bundle.mjs session.json [--replay replay-report.json] [--out DIR]");
  process.exit(2);
}

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
const outDir = values.out || path.join("output/playtest-artifacts/bundles", session.sessionId);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(sessionPath, path.join(outDir, "session.json"));

const summary = summarizeSessions([session]);
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "summary.md"), renderSummary(summary));

const copied = ["session.json", "summary.json", "summary.md"];
if (values.summary) {
  fs.copyFileSync(values.summary, path.join(outDir, path.basename(values.summary)));
  copied.push(path.basename(values.summary));
}

let replay = null;
if (values.replay) {
  replay = JSON.parse(fs.readFileSync(values.replay, "utf8"));
  const replayName = path.basename(values.replay);
  fs.copyFileSync(values.replay, path.join(outDir, replayName));
  copied.push(replayName);
  const screenshot = replay.results?.find((result) => result.screenshot)?.screenshot;
  if (screenshot && fs.existsSync(screenshot)) {
    const screenshotName = path.basename(screenshot);
    fs.copyFileSync(screenshot, path.join(outDir, screenshotName));
    copied.push(screenshotName);
  }
}

const manifest = {
  schemaVersion: 1,
  sessionId: session.sessionId,
  files: copied,
  replay: replay
    ? {
        renderer: replay.renderer ?? null,
        passed: replay.passed ?? false,
        pageErrors: replay.pageErrors ?? [],
      }
    : null,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    build: session.gameVersion ?? {},
  },
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({ outDir, sessionId: session.sessionId, files: [...copied, "manifest.json"] }, null, 2));
