#!/usr/bin/env node
/**
 * Replays a Card Trial playtest session through the production DOM controls.
 * Setup uses the existing debug surface; decisions use [data-uid], actor-chip,
 * Move, and Pass click paths just like a browser player.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { launch, ensureAudioResumed, shot, wait, assertRendererAlive } from "./lib.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string", default: process.env.ONYX_URL || "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1" },
    renderer: { type: "string", default: "phaser" },
    fight: { type: "string", default: "all" },
    out: { type: "string", default: "" },
  },
});

if (!positionals[0]) {
  console.error("Usage: node scripts/playtests/card-trial-replay.mjs session.json [--renderer canvas] [--fight 0] [--out DIR]");
  process.exit(2);
}

const sessionPath = positionals[0];
const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
if (session.schemaVersion !== 1 || !Array.isArray(session.fights)) {
  console.error("Unsupported or malformed Card Trial session schema");
  process.exit(2);
}

const selected = values.fight === "all"
  ? session.fights
  : [session.fights[Number(values.fight)]].filter(Boolean);
if (!selected.length) {
  console.error(`No fight selected from ${session.fights.length} recorded fights`);
  process.exit(2);
}

const outDir = values.out || path.join("output/playtest-artifacts/replays", `${session.sessionId}-${values.renderer}`);
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = new URL(values.url);
baseUrl.searchParams.set("debug", "1");
if (values.renderer === "canvas") baseUrl.searchParams.set("phaser", "0");
const url = baseUrl.toString();

function diff(a, b, prefix = "", out = [], limit = 12) {
  if (out.length >= limit || a === b) return out;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    out.push({ field: prefix || "state", expected: a, actual: b });
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    diff(a[key], b[key], prefix ? `${prefix}.${key}` : key, out, limit);
    if (out.length >= limit) break;
  }
  return out;
}

async function waitFor(page, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function snapshot(page) {
  return page.evaluate(() => window.__onyxDebug.snapshot());
}

async function playtestSnapshot(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.playtestSnapshot());
}

async function waitForDecision(page) {
  await waitFor(page, async () => {
    const snap = await snapshot(page);
    return snap.route === "card_trial" && !!snap.combat && snap.combat.phase !== "playback";
  }, "Card Trial decision phase");
}

async function clickCard(page, uid) {
  const selector = `button[data-uid="${uid}"]`;
  await page.locator(`.ct-sparse ${selector}`).evaluate((element) => element.click());
}

async function selectTarget(page, id) {
  const target = page.locator(`.ct-sparse .ct-actor-chip[data-actor="enemy:${id}"]`);
  await waitFor(
    page,
    async () => await target.evaluate((element) =>
      element.classList.contains("targetable") && element.style.pointerEvents === "auto"
    ),
    `target ${id} ready`
  );
  await target.evaluate((element) => element.click());
}

async function replayAction(page, action) {
  if (action.kind === "card") {
    await clickCard(page, action.cardUid);
    await waitFor(page, async () => {
      const phase = (await snapshot(page)).combat?.phase;
      return phase === "target" || phase === "target2" || phase === "playback" || phase === "hand";
    }, "target selection");
    if (action.targetId) {
      await selectTarget(page, action.targetId);
      if (action.secondTargetId) {
        await waitFor(page, async () => (await snapshot(page)).combat?.phase === "target2", "second target selection");
        await selectTarget(page, action.secondTargetId);
      }
    }
  } else {
    await page.locator(`.ct-sparse [data-act="${action.kind}"]`).click({ timeout: 5000, force: true });
  }
  await waitForDecision(page);
}

async function replayFight(page, fight, fightIndex) {
  if (fightIndex > 0) {
    await waitFor(page, async () => {
      const current = await snapshot(page);
      return current.route === "card_trial" && !current.combat;
    }, `fight ${fightIndex} lobby transition`);
  }
  const setup = fight.setup === "triangle" ? "triangle" : "fight";
  if (setup === "triangle") {
    await page.evaluate((seed) => window.__onyxDebug.cardTrial.forceTriangle({ seed }), fight.seed);
  } else {
    await page.evaluate(({ fightId, seed }) => window.__onyxDebug.cardTrial.startFight(fightId, { seed }), {
      fightId: fight.fightId,
      seed: fight.seed,
    });
  }
  await waitFor(page, async () => {
    const current = await snapshot(page);
    const replay = await playtestSnapshot(page);
    return current.route === "card_trial" &&
      replay?.state.fightId === fight.fightId &&
      replay.hash === fight.actions[0]?.stateHashBefore;
  }, `fight ${fightIndex + 1} seeded boot`);
  await waitForDecision(page);
  const start = await playtestSnapshot(page);
  if (!start) throw new Error("Card Trial playtest snapshot unavailable");

  const result = { fightIndex, fightId: fight.fightId, actions: fight.actions.length, matched: 0, divergence: null };
  for (const action of fight.actions) {
    const before = await playtestSnapshot(page);
    if (!before || before.hash !== action.stateHashBefore) {
      result.divergence = {
        actionIndex: action.index,
        kind: "before-hash",
        expectedHash: action.stateHashBefore,
        actualHash: before?.hash ?? null,
        differences: before ? diff(action.stateBefore, before.state) : [],
      };
      break;
    }
    await replayAction(page, action);
    const after = await playtestSnapshot(page);
    if (!after || after.hash !== action.stateHashAfter) {
      result.divergence = {
        actionIndex: action.index,
        kind: "after-hash",
        action,
        expectedHash: action.stateHashAfter,
        actualHash: after?.hash ?? null,
        differences: after ? diff(action.stateAfter, after.state) : [],
      };
      break;
    }
    result.matched += 1;
  }
  if (!result.divergence && (await snapshot(page)).combat?.phase === "result") {
    await page.keyboard.press("Enter");
    await waitFor(page, async () => {
      const current = await snapshot(page);
      return current.route === "card_trial" && !current.combat;
    }, `fight ${fightIndex + 1} result transition`);
  }
  if (result.divergence) {
    result.screenshot = await shot(page, outDir, `fight-${fightIndex}-divergence-${result.divergence.actionIndex}.png`);
  }
  return result;
}

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const results = [];
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);
  const rendererHealth = await assertRendererAlive(page);
  if (rendererHealth.count === 0 || rendererHealth.visibility !== "visible") {
    throw new Error(`INCONCLUSIVE: renderer is not alive (${JSON.stringify(rendererHealth)})`);
  }
  for (const [index, fight] of selected.entries()) {
    console.log(`replay fight ${index + 1}/${selected.length}: ${fight.fightName}`);
    results.push(await replayFight(page, fight, index));
    console.log(`replay fight ${index + 1}/${selected.length}: ${results.at(-1).divergence ? "DIVERGED" : "matched"}`);
    if (results.at(-1).divergence) break;
  }
  const report = {
    schemaVersion: 1,
    session: sessionPath,
    renderer: values.renderer,
    url,
    results,
    passed: results.length === selected.length && results.every((result) => !result.divergence),
    pageErrors: [...errors],
    rendererHealth,
  };
  fs.writeFileSync(path.join(outDir, "replay-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed && errors.length === 0 ? 0 : 1);
} catch (error) {
  const report = { schemaVersion: 1, session: sessionPath, renderer: values.renderer, passed: false, error: String(error?.stack || error), pageErrors: [...errors] };
  fs.writeFileSync(path.join(outDir, "replay-report.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exit(2);
} finally {
  await browser.close();
}
