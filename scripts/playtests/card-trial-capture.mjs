#!/usr/bin/env node
/** Capture a deterministic synthetic session through the same sparse DOM paths
 * a human uses. Human sessions can export the identical JSON via
 * __onyxDebug.cardTrial.exportSession() in a ?debug=1 tab. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { launch, ensureAudioResumed, wait } from "./lib.mjs";

const { values } = parseArgs({
  options: {
    fight: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    triangle: { type: "boolean", default: false },
    maxActions: { type: "string", default: "80" },
    url: { type: "string", default: process.env.ONYX_URL || "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1" },
    renderer: { type: "string", default: "phaser" },
    out: { type: "string", default: "output/playtest-artifacts/sessions/card-trial-synthetic.json" },
  },
});

const url = new URL(values.url);
url.searchParams.set("debug", "1");
if (values.renderer === "canvas") url.searchParams.set("phaser", "0");
const out = values.out;
fs.mkdirSync(path.dirname(out), { recursive: true });

async function waitFor(page, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function snap(page) {
  return page.evaluate(() => window.__onyxDebug.snapshot());
}

async function waitForDecision(page) {
  await waitFor(page, async () => {
    const s = await snap(page);
    return s.route === "card_trial" && !!s.combat && s.combat.phase !== "playback";
  }, "Card Trial decision");
}

async function act(page) {
  const s = await snap(page);
  if (s.combat?.phase === "result") return false;
  if (s.combat?.phase === "target" || s.combat?.phase === "target2") {
    const targets = await page.locator('.ct-sparse .ct-actor-chip[data-actor^="enemy:"]').evaluateAll((nodes) => nodes.filter((node) => !node.classList.contains("dead")).map((node) => node.dataset.actor?.slice(6)).filter(Boolean));
    const id = targets[0];
    if (!id) throw new Error("target phase had no target chips");
    await page.locator(`.ct-sparse .ct-actor-chip[data-actor="enemy:${id}"]`).click({ force: true });
    return true;
  }
  const cards = await page.locator(".ct-sparse .ct2-card").evaluateAll((nodes) => nodes.map((node) => ({ uid: node.dataset.uid, disabled: node.classList.contains("disabled") })));
  const card = cards.find((candidate) => candidate.uid && !candidate.disabled);
  if (card) {
    await page.locator(`.ct-sparse .ct2-card[data-uid="${card.uid}"]`).click({ force: true });
    return true;
  }
  const move = page.locator('.ct-sparse [data-act="move"]');
  if (await move.count() && !(await move.isDisabled())) {
    await move.click({ force: true });
    return true;
  }
  await page.locator('.ct-sparse [data-act="pass"]').click({ force: true });
  return true;
}

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);
  if (values.triangle) {
    await page.evaluate((seed) => window.__onyxDebug.cardTrial.forceTriangle({ seed }), Number(values.seed));
  } else {
    await page.evaluate(({ fight, seed }) => window.__onyxDebug.cardTrial.startFight(fight, { seed }), {
      fight: Number(values.fight),
      seed: Number(values.seed),
    });
  }
  await waitForDecision(page);
  for (let i = 0; i < Number(values.maxActions); i += 1) {
    if (!(await act(page))) break;
    await waitForDecision(page);
  }
  await page.evaluate(() => window.__onyxDebug.cardTrial.endSession());
  const session = await page.evaluate(() => window.__onyxDebug.cardTrial.session());
  if (!session) throw new Error("No Card Trial session was exported");
  fs.writeFileSync(out, JSON.stringify(session, null, 2));
  const report = {
    sessionId: session.sessionId,
    fights: session.fights.length,
    actions: session.fights.reduce((n, fight) => n + fight.actions.length, 0),
    result: session.fights[0]?.result ?? "unfinished",
    renderer: values.renderer,
    out,
    pageErrors: [...errors],
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(errors.length ? 1 : 0);
} catch (error) {
  console.error(error?.stack || error);
  process.exit(2);
} finally {
  await browser.close();
}
