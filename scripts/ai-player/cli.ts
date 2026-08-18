#!/usr/bin/env node
// @ts-nocheck — Playwright driver; lib.mjs is untyped.
/**
 * AI player harness CLI.
 *
 *   npm run playtest:ai -- demo title-to-dungeon
 *   npm run playtest:ai -- demo dungeon-move
 *   npm run playtest:ai -- demo combat
 *   npm run playtest:ai -- demo checkpoint --checkpoint f2-abyss-bridge
 *   npm run playtest:ai -- demo replay
 *   npm run playtest:ai -- stdio
 *
 * Stdio JSON-lines protocol (one object per line):
 *   {"op":"start","mode":"blind","seed":42,"fresh":true}
 *   {"op":"key","key":"ArrowUp"}
 *   {"op":"observe","detail":"full"}
 *   {"op":"checkpoint","id":"f2-abyss-bridge"}
 *   {"op":"note","kind":"mental-map","text":"..."}
 *   {"op":"probe","kind":"experience"}
 *   {"op":"finish"}
 */

import readline from "node:readline";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AiPlayerSession, type ObserveDetail, type StartOptions } from "./session";
import { CHECKPOINTS } from "./checkpoints";
import { scanPlayerLog } from "./leak-scan";

const log = (...a: unknown[]) => console.error(...a);

function printPlayerPayload(session: AiPlayerSession, result: Awaited<ReturnType<AiPlayerSession["key"]>>, full = false) {
  console.log(JSON.stringify(session.playerFacingPayload(result, full)));
}

async function runStdio(startOpts: StartOptions) {
  const session = new AiPlayerSession();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  log("ai-player stdio ready. Send JSON lines.");
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed);
    } catch (e) {
      console.log(JSON.stringify({ ok: false, error: `invalid json: ${e}` }));
      continue;
    }
    try {
      const op = String(msg.op ?? "");
      if (op === "start") {
        const result = await session.start({ ...startOpts, ...(msg as StartOptions) });
        printPlayerPayload(session, result, false);
      } else if (op === "key") {
        const result = await session.key(String(msg.key));
        printPlayerPayload(session, result, false);
      } else if (op === "observe") {
        const result = await session.observe((msg.detail as ObserveDetail) ?? "compact");
        printPlayerPayload(session, result, msg.detail === "full");
      } else if (op === "checkpoint") {
        const result = await session.checkpoint(String(msg.id));
        printPlayerPayload(session, result, false);
      } else if (op === "note") {
        const stored = await session.note(
          (msg.kind as "mental-map" | "reaction" | "hypothesis" | "experience") ?? "reaction",
          String(msg.text ?? "")
        );
        console.log(JSON.stringify({ ok: true, ...stored }));
      } else if (op === "probe") {
        const probe = await session.probe(msg.kind === "mental-map" ? "mental-map" : "experience");
        console.log(JSON.stringify({ ok: true, ...probe }));
      } else if (op === "finish") {
        const done = await session.finish();
        log(JSON.stringify(done));
        console.log(JSON.stringify({ ok: true, runId: done.runId }));
        break;
      } else {
        console.log(JSON.stringify({ ok: false, error: `unknown op ${op}` }));
      }
    } catch (err) {
      console.log(JSON.stringify({ ok: false, error: String(err) }));
    }
  }
}

async function demoTitleToDungeon(session: AiPlayerSession) {
  await session.start({ mode: "blind", fresh: true, seed: 42 });
  // Title: New Game is the first item. Enter selects it.
  await session.key("Enter");
  // Prologue accepts keys while auto-playing; Escape skips.
  for (let i = 0; i < 4; i++) {
    const obs = await session.observe("compact");
    if (obs.observation.screen !== "prologue" && obs.observation.screen !== "title") break;
    await session.key("Escape");
  }
  // Party creation carousel: Enter confirms the focused preset.
  for (let i = 0; i < 6; i++) {
    const obs = await session.observe("compact");
    if (obs.observation.screen !== "party_creation") break;
    await session.key("Enter");
  }
  // Town: cursor to Enter Dungeon.
  for (let i = 0; i < 10; i++) {
    const obs = await session.observe("full");
    if (obs.observation.screen === "dungeon") return;
    const labels = obs.observation.menu?.entries.map((e) => e.label).join(" ") ?? "";
    if (/Enter Dungeon/i.test(labels)) {
      const idx = obs.observation.menu?.entries.findIndex((e) => /Enter Dungeon/i.test(e.label)) ?? 0;
      const cur = obs.observation.menu?.selectedIndex ?? 0;
      if (idx > cur) {
        for (let s = 0; s < idx - cur; s++) await session.key("ArrowDown");
      } else if (idx < cur) {
        for (let s = 0; s < cur - idx; s++) await session.key("ArrowUp");
      }
      await session.key("Enter");
      return;
    }
    if (obs.observation.screen === "town") await session.key("ArrowDown");
    else await session.key("Enter");
  }
}

async function demoDungeonMove(session: AiPlayerSession) {
  await session.start({ mode: "checkpoint", checkpoint: "f1-entrance", seed: 42 });
  await session.key("ArrowUp");
  await session.key("ArrowUp");
  await session.key("ArrowRight");
  await session.key("ArrowUp");
  await session.note("reaction", "Demo dungeon traversal.");
}

async function demoCombat(session: AiPlayerSession) {
  await session.start({ mode: "checkpoint", checkpoint: "first-combat", seed: 42 });
  // Confirm attack / target a few times without skipping playback.
  for (let i = 0; i < 8; i++) {
    const obs = await session.observe("compact");
    if (obs.observation.screen !== "combat") break;
    if (obs.observation.result) {
      await session.key("Enter");
      break;
    }
    await session.key("Enter");
  }
}

async function demoCheckpoint(session: AiPlayerSession, id: string) {
  await session.start({ mode: "checkpoint", checkpoint: id, seed: 42 });
  await session.key("ArrowUp");
  await session.note("mental-map", "Demo mental-map note at checkpoint.");
}

async function leaveCombat(session: AiPlayerSession) {
  for (let i = 0; i < 24; i++) {
    const obs = await session.observe("compact");
    if (obs.observation.screen !== "combat") return;
    if (obs.observation.result) {
      await session.key("Enter");
      continue;
    }
    await session.key("Enter");
  }
}

async function demoCoverage(session: AiPlayerSession) {
  await demoTitleToDungeon(session);
  const dirs = ["ArrowUp", "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowUp"];
  for (let i = 0; i < 40; i++) {
    await session.key(dirs[i % dirs.length]);
    await leaveCombat(session);
  }
  await session.key("Escape");
  await session.key("ArrowDown");
  await session.key("Escape");
  await session.key("Tab");
  await session.key("Escape");
  await leaveCombat(session);
  await session.checkpoint("first-combat");
  for (let i = 0; i < 8; i++) {
    const obs = await session.observe("compact");
    if (obs.observation.screen !== "combat") break;
    if (obs.observation.result) {
      await session.key("Enter");
      break;
    }
    await session.key("Enter");
  }
  await leaveCombat(session);
  await session.checkpoint("f2-abyss-bridge");
  for (let i = 0; i < 12; i++) await session.key(i % 2 ? "ArrowRight" : "ArrowUp");
  await leaveCombat(session);
  await session.checkpoint("hot-boi-tavern");
  await session.key("ArrowUp");
  await session.key("Escape");
  await leaveCombat(session);
  await session.checkpoint("first-combat");
  await session.forceWipeForAudit();
  await session.key("Enter");
}

async function demoReplay(session: AiPlayerSession) {
  await demoDungeonMove(session);
  const done = await session.finish();
  log(`replaying ${done.replayPath}`);
  const replay = spawn(
    "node",
    [
      "scripts/replays/replay.mjs",
      done.replayPath,
      ...(process.env.ONYX_URL ? ["--url", process.env.ONYX_URL] : []),
    ],
    { stdio: "inherit", env: process.env }
  );
  await new Promise<void>((resolve, reject) => {
    replay.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`replay exit ${code}`))));
  });
}

async function runDemo(name: string, opts: StartOptions & { checkpoint?: string }) {
  const session = new AiPlayerSession();
  try {
    if (name === "title-to-dungeon") await demoTitleToDungeon(session);
    else if (name === "dungeon-move") await demoDungeonMove(session);
    else if (name === "combat") await demoCombat(session);
    else if (name === "checkpoint") await demoCheckpoint(session, opts.checkpoint ?? "f2-abyss-bridge");
    else if (name === "coverage") await demoCoverage(session);
    else if (name === "replay") {
      await demoReplay(session);
      return;
    } else if (name === "bundle") {
      await demoTitleToDungeon(session);
    } else {
      throw new Error(`Unknown demo ${name}`);
    }
    const last = await session.observe("full");
    printPlayerPayload(session, last, true);
    const done = await session.finish();
    log(JSON.stringify(done, null, 2));
    fs.writeFileSync(
      path.join(done.summaryPath.replace(/player-summary\.json$/, "demo.json")),
      JSON.stringify({ demo: name, ...done }, null, 2)
    );
  } catch (err) {
    log(err);
    try {
      await session.finish();
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: "string" },
    seed: { type: "string" },
    checkpoint: { type: "string" },
    headed: { type: "boolean", default: false },
    fresh: { type: "boolean", default: true },
    url: { type: "string" },
    demo: { type: "string" },
  },
});

const cmd = positionals[0] ?? (values.demo ? "demo" : "stdio");
const startOpts: StartOptions = {
  mode: (values.mode as StartOptions["mode"]) ?? "blind",
  seed: values.seed ? parseInt(values.seed, 10) : 42,
  headed: values.headed,
  fresh: values.fresh,
  url: values.url,
  checkpoint: values.checkpoint,
};

if (cmd === "checkpoints") {
  console.log(CHECKPOINTS.map((c) => c.id).join("\n"));
} else if (cmd === "demo") {
  await runDemo(positionals[1] ?? values.demo ?? "title-to-dungeon", startOpts);
} else if (cmd === "stdio") {
  await runStdio(startOpts);
} else if (cmd === "replay") {
  const file = positionals[1];
  if (!file) {
    console.error("Usage: playtest:ai replay <replay.json>");
    process.exit(2);
  }
  const child = spawn(
    "node",
    ["scripts/replays/replay.mjs", file, ...(process.env.ONYX_URL ? ["--url", process.env.ONYX_URL] : [])],
    { stdio: "inherit", env: process.env }
  );
  child.on("exit", (code) => process.exit(code ?? 2));
} else if (cmd === "scan") {
  const file = positionals[1];
  if (!file) {
    console.error("Usage: playtest:ai scan <player-log.jsonl>");
    process.exit(2);
  }
  const result = scanPlayerLog(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.hits.length ? 1 : 0);
} else if (cmd === "mcp") {
  await import("./mcp");
} else {
  console.error(`Unknown command ${cmd}`);
  process.exit(2);
}

void path;
