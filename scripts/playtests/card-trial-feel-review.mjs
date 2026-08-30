/**
 * Card Trial presentation review: real hand actions + timed motion frames.
 *
 * This is a debug-only visual fixture. It uses live Card Trial fights and
 * keyboard input; it does not inject combat state or call rules functions.
 *
 *   ONYX_URL=http://127.0.0.1:5220/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-feel-review.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5220/OnyxLabyrinth/";
const OUT = path.resolve(process.env.FEEL_OUT ?? "output/playwright/card-trial-feel");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { root: ROOT, captures: [], sounds: [], errors: [] };

async function waitFor(page, predicate, label, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await wait(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function facts(page) {
  return page.evaluate(() => ({
    phase: window.__onyxDebug.snapshot().combat?.phase ?? null,
    view: window.__onyxDebug.cardTrial.view(),
    playback: document.querySelector(".ct-sparse-playback")?.textContent ?? "",
    opened: [...document.querySelectorAll(".ct-actor-chip.enemy")]
      .filter((node) => node.querySelector(".ct-opened-mark"))
      .map((node) => node.dataset.actor ?? ""),
    guards: [...document.querySelectorAll(".ct-actor-chip.hero .ct-chip-guard")]
      .map((node) => node.textContent ?? ""),
    errors: window.__onyxDebug.log(80, "error"),
  }));
}

async function capture(page, name, delay = 0) {
  if (delay) await wait(delay);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  const state = await facts(page);
  report.captures.push({ name, filename, ...state });
  return state;
}

async function boot(page, { fightId = null, triangle = false, ...extra } = {}) {
  const url = new URL(ROOT);
  url.searchParams.set("debug", "1");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug surface");
  if (triangle) await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  else await page.evaluate((id) => window.__onyxDebug.cardTrial.startFight(id), fightId ?? 1);
  await waitFor(
    page,
    () => window.__onyxDebug.snapshot().combat?.phase === "hand" && window.__onyxDebug.isIdle(),
    "triangle hand"
  );
}

async function playCard(page, defId, targetIndex = 0) {
  const view = await page.evaluate(() => window.__onyxDebug.cardTrial.view());
  const index = view.hand.findIndex((card) => card.defId === defId && !card.disabled);
  if (index < 0) return false;
  await page.keyboard.press(String(index + 1));
  await wait(80);
  if ((await facts(page)).phase === "target") {
    for (let i = 0; i < targetIndex; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  }
  return true;
}

async function capturePlayback(page, prefix) {
  await capture(page, `${prefix}-commit`);
  // The first frame is the hand/commit beat; the later frames deliberately
  // straddle the shared attack contact and any following mechanic event.
  // This keeps Opened/Exploit visible in the review instead of sampling only
  // the card's banner before the effect lands.
  await capture(page, `${prefix}-contact`, 280);
  await capture(page, `${prefix}-effect`, 240);
  await capture(page, `${prefix}-settle`, 700);
  await capture(page, `${prefix}-late`, 900);
  report.sounds.push({ prefix, sounds: await page.evaluate(() => window.__onyxDebug.sounds(120)) });
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase !== "playback", `${prefix} settle`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => report.errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
});

try {
  await boot(page, { triangle: true });
  await capture(page, "01-decision-triangle");

  // Paid Move exercises the existing verified 200ms row slide without
  // changing which cards the forced triangle fixture draws.
  await page.keyboard.press("m");
  await capturePlayback(page, "02-move");

  // Fight 5 has three enemies and exposes Guard/Rat cards in its live opening.
  await boot(page, { fightId: 5 });
  await capture(page, "03-three-enemy-decision");
  if (await playCard(page, "brace")) {
    await capturePlayback(page, "04-guard");
    // Reuse the real authored enemy intent to review full/partial Guard
    // absorption. A fresh fight below keeps the Rat review independent of
    // this turn transition.
    if ((await facts(page)).phase === "hand") {
      await page.keyboard.press("b");
      await capturePlayback(page, "04-guard-absorption");
    }
  }

  await boot(page, { fightId: 5 });
  if (await playCard(page, "litter")) await capturePlayback(page, "05-rat");

  // Scan the live authored openings for a real opener + same-target Consume
  // pair. Fresh fight starts are still production rules/state, not injected
  // fixtures; this keeps the review resilient to deck-order edits.
  let openedPairFound = false;
  for (let fightId = 1; fightId <= 10 && !openedPairFound; fightId++) {
    await boot(page, { fightId });
    const opening = await page.evaluate(() => window.__onyxDebug.cardTrial.view()?.hand?.map((card) => card.defId) ?? []);
    const hasOpener = opening.some((id) => ["open-the-rank", "faultline", "marrow-divide", "from-the-dark"].includes(id));
    const hasConsume = opening.some((id) => ["swarm-the-wound", "full-stop", "burst-the-nest"].includes(id));
    if (!hasOpener || !hasConsume) continue;
    openedPairFound = true;
    await capture(page, `06-opened-hand-fight-${fightId}`);
    const opener = await page.evaluate(() => {
      const hand = window.__onyxDebug.cardTrial.view()?.hand ?? [];
      return ["open-the-rank", "faultline", "marrow-divide", "from-the-dark"].find((id) => hand.some((card) => card.defId === id && !card.disabled)) ?? null;
    });
    if (opener && await playCard(page, opener)) {
      await capturePlayback(page, "06-opened");
      const consume = await page.evaluate(() => {
        const hand = window.__onyxDebug.cardTrial.view()?.hand ?? [];
        return ["swarm-the-wound", "full-stop", "burst-the-nest"].find((id) => hand.some((card) => card.defId === id && !card.disabled)) ?? null;
      });
      if (consume && await playCard(page, consume)) await capturePlayback(page, "07-consume");
    }
  }

  // A real Pass lets the enemy phase punctuation be reviewed without a
  // synthetic enemy action.
  await boot(page, { triangle: true });
  if ((await facts(page)).phase === "hand") {
    await page.keyboard.press("b");
    await capturePlayback(page, "08-enemy-turn");
  }

  for (const viewport of [
    { width: 768, height: 672 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1400, height: 1100 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await boot(page, { triangle: true });
    await capture(page, `09-viewport-${viewport.width}x${viewport.height}`);
  }

  report.final = await facts(page);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial feel review captured ${report.captures.length} frames: ${OUT}`);
console.log("page errors []");
