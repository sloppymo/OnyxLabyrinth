#!/usr/bin/env node
/** State-aware Card Trial input fuzzing. Inputs are intentionally noisy, but
 * every decision still enters through the production keyboard/DOM handlers. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  launch,
  ensureAudioResumed,
  wait,
  assertRendererAlive,
  clickCard,
  selectTarget,
  clickAct,
  pressCancel,
} from "./lib.mjs";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "12" },
    steps: { type: "string", default: "160" },
    renderer: { type: "string", default: "phaser" },
    url: { type: "string", default: process.env.ONYX_URL || "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1" },
    out: { type: "string", default: "output/playtest-artifacts/fuzz" },
  },
});

const outDir = path.join(values.out, values.renderer);
fs.mkdirSync(outDir, { recursive: true });
const base = new URL(values.url);
base.searchParams.set("debug", "1");
if (values.renderer === "canvas") base.searchParams.set("phaser", "0");

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function snap(page) {
  return page.evaluate(() => window.__onyxDebug.snapshot());
}

async function waitFor(page, predicate, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await wait(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function assertInvariants(page, step) {
  const state = await page.evaluate(() => window.__onyxDebug.cardTrial.playtestSnapshot());
  const snapState = await snap(page);
  if (!state) throw new Error(`step ${step}: missing Card Trial playtest snapshot`);
  if (snapState.warnings.length) throw new Error(`step ${step}: invariants ${snapState.warnings.join(" | ")}`);
  const heroIds = new Set(["rat-king", "old-man"]);
  for (const hero of state.state.heroes) {
    if (!heroIds.has(hero.id)) throw new Error(`step ${step}: unknown hero ${hero.id}`);
    if (hero.hp < 0 || hero.hp > hero.maxHp) throw new Error(`step ${step}: invalid HP ${hero.id}=${hero.hp}`);
    if (hero.guard < 0 || hero.energy < 0) throw new Error(`step ${step}: invalid resource ${hero.id}`);
    const uids = [...hero.hand, ...hero.draw, ...hero.discard].map((card) => card.uid);
    if (new Set(uids).size !== uids.length) throw new Error(`step ${step}: duplicate card UID`);
  }
  for (const enemy of state.state.enemies) {
    if (enemy.hp < 0 || enemy.hp > enemy.maxHp) throw new Error(`step ${step}: invalid enemy HP ${enemy.id}`);
  }
  const domCards = await page.locator(".ct-sparse .ct2-card").evaluateAll((nodes) => nodes.map((node) => ({ uid: node.dataset.uid, state: node.dataset.state })).filter((card) => card.uid));
  const domUids = domCards.filter((card) => card.state !== "playing" && card.state !== "discarding").map((card) => card.uid);
  if (new Set(domUids).size !== domUids.length) throw new Error(`step ${step}: duplicate active card DOM`);
  if (snapState.combat?.phase === "hand") {
    const view = await page.evaluate(() => window.__onyxDebug.cardTrial.view());
    const logical = view.hand.map((card) => card.uid).sort();
    const rendered = [...domUids].sort();
    if (JSON.stringify(logical) !== JSON.stringify(rendered)) {
      throw new Error(`step ${step}: DOM hand disagrees with logical hand ${JSON.stringify({ phase: snapState.combat?.phase, logical, rendered, domCards })}`);
    }
    const energyText = await page.locator(".ct-sparse .ct-energy").textContent();
    if (!energyText?.includes(String(view.energy))) throw new Error(`step ${step}: DOM energy disagrees with logical energy`);
  }
}

async function randomInput(page, random, trace) {
  const s = await snap(page);
  const phase = s.combat?.phase;
  if (phase === "playback") {
    const key = ["Enter", "Escape", "m", "ArrowRight", "ArrowLeft"][Math.floor(random() * 5)];
    trace.push({ type: "key", key, phase });
    await page.keyboard.press(key);
    if (random() < 0.35) await page.keyboard.press(key);
    return;
  }
  if (phase === "result") {
    trace.push({ type: "key", key: "Enter", phase });
    await page.keyboard.press("Enter");
    return;
  }
  if (phase === "target" || phase === "target2") {
    const choice = random();
    if (choice < 0.2) {
      trace.push({ type: "key", key: "Escape", phase });
      await pressCancel(page);
    } else if (choice < 0.42) {
      const key = random() < 0.5 ? "ArrowLeft" : "ArrowRight";
      trace.push({ type: "key", key, phase });
      await page.keyboard.press(key);
    } else if (choice < 0.62) {
      trace.push({ type: "key", key: "Enter", phase });
      await page.keyboard.press("Enter");
    } else {
      const targets = await page.locator('.ct-sparse .ct-actor-chip[data-actor^="enemy:"]').evaluateAll((nodes) => nodes.filter((node) => !node.classList.contains("dead")).map((node) => node.dataset.actor?.slice(6)).filter(Boolean));
      if (targets.length) {
        const id = targets[Math.floor(random() * targets.length)];
        trace.push({ type: "target", id, phase });
        await selectTarget(page, id).catch(() => {});
      }
    }
    return;
  }
  const choice = random();
  if (choice < 0.16) {
    const key = random() < 0.5 ? "ArrowLeft" : "ArrowRight";
    trace.push({ type: "key", key, phase });
    await page.keyboard.press(key);
  } else if (choice < 0.34) {
    const cards = await page.locator(".ct-sparse .ct2-card").evaluateAll((nodes) => nodes.map((node) => ({ uid: node.dataset.uid, disabled: node.classList.contains("disabled") })));
    if (cards.length) {
      const card = cards[Math.floor(random() * cards.length)];
      trace.push({ type: "card", uid: card.uid, disabled: card.disabled, phase });
      await clickCard(page, card.uid).catch(() => {});
      if (random() < 0.5) await clickCard(page, card.uid).catch(() => {});
    }
  } else if (choice < 0.46) {
    trace.push({ type: "move", phase });
    await clickAct(page, "move").catch(() => {});
  } else if (choice < 0.58) {
    trace.push({ type: "pass", phase });
    await clickAct(page, "pass").catch(() => {});
  } else if (choice < 0.72) {
    const key = random() < 0.5 ? "Enter" : "Escape";
    trace.push({ type: "key", key, phase });
    await page.keyboard.press(key);
  } else if (choice < 0.84) {
    trace.push({ type: "key", key: "i", phase });
    await page.keyboard.down("i");
    await wait(10);
    await page.keyboard.up("i");
  } else {
    const keys = ["Enter", "Escape", "m", "ArrowRight", "ArrowLeft"];
    for (const key of keys) {
      trace.push({ type: "burst", key, phase });
      await page.keyboard.press(key);
    }
  }
}

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const failures = [];
const completed = [];
try {
  for (let seed = 1; seed <= Number(values.seeds); seed += 1) {
    const trace = [];
    const random = rng(seed * 1009 + 17);
    try {
      await page.goto(base.toString(), { waitUntil: "networkidle" });
      await wait(400);
      await ensureAudioResumed(page);
      const rendererHealth = await assertRendererAlive(page);
      if (rendererHealth.count === 0 || rendererHealth.visibility !== "visible") {
        throw new Error(`INCONCLUSIVE: renderer is not alive (${JSON.stringify(rendererHealth)})`);
      }
      await page.evaluate((value) => window.__onyxDebug.cardTrial.startFight(5, { seed: value }), seed);
      await waitFor(page, async () => (await snap(page)).route === "card_trial", `seed ${seed} boot`);
      for (let step = 0; step < Number(values.steps); step += 1) {
        await assertInvariants(page, step);
        if ((await snap(page)).combat?.result) break;
        await randomInput(page, random, trace);
        await wait(25);
      }
      await assertInvariants(page, trace.length);
      const session = await page.evaluate(() => window.__onyxDebug.cardTrial.session());
      const sessionPath = path.join(outDir, `seed-${seed}.json`);
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      completed.push({ seed, actions: trace.length, session: sessionPath });
    } catch (error) {
      const failure = {
        seed,
        message: String(error?.stack || error),
        trace,
        // Keep a compact tail for quick repro triage; the full trace remains
        // available in the same artifact. This is not delta-debugging.
        reproTail: trace.slice(-32),
        session: await page.evaluate(() => window.__onyxDebug.cardTrial.session()).catch(() => null),
      };
      fs.writeFileSync(path.join(outDir, `seed-${seed}-failure.json`), JSON.stringify(failure, null, 2));
      failures.push({ seed, message: failure.message, actions: trace.length });
    }
  }
} finally {
  await browser.close();
}
const report = {
  schemaVersion: 1,
  renderer: values.renderer,
  seeds: Number(values.seeds),
  stepsPerSeed: Number(values.steps),
  completed,
  failures,
  // A page reload can abort the audio preload queue with Chromium's
  // ERR_NETWORK_CHANGED. Keep those diagnostics visible without treating a
  // navigation seam as a JavaScript/runtime failure.
  resourceFailures: errors.filter((entry) => entry.includes("ERR_NETWORK_CHANGED") || entry.startsWith("console: Failed to load resource")),
  pageErrors: errors.filter((entry) => !entry.includes("ERR_NETWORK_CHANGED") && !entry.startsWith("console: Failed to load resource")),
  passed: failures.length === 0 && errors.every((entry) => entry.includes("ERR_NETWORK_CHANGED") || entry.startsWith("console: Failed to load resource")),
};
fs.writeFileSync(path.join(outDir, "fuzz-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
