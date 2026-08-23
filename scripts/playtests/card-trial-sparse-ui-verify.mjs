/**
 * Visual fixtures for Card Trial sparse battlefield HUD + physical hand.
 *
 * Expects a production preview, for example:
 *   npx vite preview --host 127.0.0.1 --port 5210 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5210/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-sparse-ui-verify.mjs
 *
 * The frozen reference agent (`card-trial-reference-agent-run.mjs`) is the
 * rules oracle: it plays via `playerView()` + keyboard and does not assert
 * pixels or DOM chrome. This script is the complementary presentation check.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/";
const OUT = path.resolve("playtest-screenshots/card-trial-sparse-ui");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { capturedAt: new Date().toISOString(), baseUrl: ROOT, shots: [], errors: [] };

function urlFor(extra = {}) {
  const url = new URL(ROOT);
  url.searchParams.set("debug", "1");
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  return url.toString();
}

async function waitFor(page, predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await wait(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function bootTriangle(page) {
  await page.goto(urlFor(), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug surface");
  await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  await waitFor(
    page,
    () => {
      const snap = window.__onyxDebug.snapshot();
      return snap.route === "card_trial" && snap.combat?.phase === "hand" && window.__onyxDebug.isIdle();
    },
    "triangle hand",
  );
}

async function facts(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector("#card-trial-overlay");
    const cards = [...(overlay?.querySelectorAll(".ct2-card") ?? [])];
    const wrap = document.querySelector("#combat-wrap");
    return {
      sparse: wrap?.classList.contains("ct-sparse-active") ?? false,
      windowsText: document.querySelector("#combat-windows")?.innerText?.trim() ?? "",
      cardCount: cards.length,
      cardNames: cards.map((c) => c.querySelector(".ct2-card-name")?.textContent?.trim() ?? ""),
      cardTexts: cards.map((c) => c.querySelector(".ct2-card-text")?.textContent?.trim() ?? ""),
      focused: cards.filter((c) => c.classList.contains("focused")).length,
      armed: cards.filter((c) => c.classList.contains("armed")).length,
      hasIntents: !!document.querySelector(".ct-intents"),
      hasHandPane: !!document.querySelector(".ct-hand"),
      hasPartyPane: !!document.querySelector(".ct-party"),
      energy: document.querySelector(".ct-energy")?.textContent ?? "",
      move: document.querySelector("[data-act=move]")?.textContent ?? "",
      pass: document.querySelector("[data-act=pass]")?.textContent ?? "",
      detailsHidden: document.querySelector(".ct-sparse-details")?.hidden ?? true,
      detailsText: document.querySelector(".ct-sparse-details")?.textContent ?? "",
      targetHint: document.querySelector(".ct-sparse-target-hint")?.hidden ?? true,
      heroChips: document.querySelectorAll(".ct-actor-chip.hero").length,
      enemyChips: document.querySelectorAll(".ct-actor-chip.enemy").length,
      overlayOverflowX: overlay ? overlay.scrollWidth > overlay.clientWidth + 1 : false,
      pageErrors: window.__onyxDebug.log(50, "error"),
    };
  });
}

async function shot(page, name, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  const state = await facts(page);
  report.shots.push({ name, filename, viewport: viewport ?? null, ...state });
  if (!state.sparse) throw new Error(`${name}: sparse chrome not active`);
  if (state.hasIntents || state.hasHandPane || state.hasPartyPane) {
    throw new Error(`${name}: legacy panes still present`);
  }
  if (state.windowsText) throw new Error(`${name}: #combat-windows is not empty`);
  if (state.overlayOverflowX) throw new Error(`${name}: overlay scrolled horizontally`);
  return state;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => report.errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
});

try {
  await bootTriangle(page);
  await wait(1700);
  let state = await shot(page, "01-triangle-768-in-1280", { width: 1280, height: 720 });
  if (state.cardCount !== 5) throw new Error(`expected 5 cards, got ${state.cardCount}`);
  if (state.focused !== 1) throw new Error(`expected one focused card, got ${state.focused}`);
  if (state.armed !== 0) throw new Error(`initial cursor was armed (${state.armed})`);
  if (!state.cardTexts.every((t) => t.length > 0)) throw new Error("a card is missing rules text");
  if (!/MOVE/.test(state.move) || !/PASS/.test(state.pass)) throw new Error("Move/Pass missing");

  await shot(page, "02-focus-card-1", { width: 1280, height: 720 });
  await page.keyboard.press("ArrowRight");
  await wait(80);
  state = await shot(page, "03-focused-second-card");
  if (state.focused !== 1) throw new Error("focus did not follow cursor");

  await page.keyboard.press("Enter");
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase === "target", "target phase");
  state = await shot(page, "04-armed-targeting");
  if (state.armed !== 1) throw new Error("targeting did not arm the pending card");
  if (state.targetHint) throw new Error("target hint hidden while targeting");
  await page.keyboard.press("Escape");
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase === "hand", "cancel target");

  await page.keyboard.down("i");
  await wait(60);
  state = await shot(page, "05-hold-details");
  if (state.detailsHidden) throw new Error("details overlay stayed hidden while holding I");
  await page.keyboard.up("i");
  await wait(60);
  state = await shot(page, "06-details-released");
  if (!state.detailsHidden) throw new Error("details overlay remained after release");

  await page.keyboard.press("m");
  await wait(80);
  await shot(page, "07-paid-move-mid");
  await waitFor(
    page,
    () => window.__onyxDebug.snapshot().combat?.phase === "hand" && window.__onyxDebug.isIdle(),
    "after paid move",
  );
  state = await shot(page, "08-rat-king-back");
  const rows = await page.evaluate(() => window.__onyxDebug.cardTrial.view().heroes.map((h) => h.row));
  if (rows[0] !== "back") throw new Error(`expected Rat King Back, got ${rows}`);

  await page.goto(urlFor(), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug reload");
  await page.evaluate(() => window.__onyxDebug.cardTrial.startFight(5));
  await waitFor(
    page,
    () => window.__onyxDebug.snapshot().combat?.phase === "hand" && window.__onyxDebug.isIdle(),
    "fight 5 hand",
  );
  await shot(page, "09-three-enemy-fight");

  await page.setViewportSize({ width: 768, height: 672 });
  await shot(page, "10-native-768x672");

  await page.goto(urlFor({ phaser: "0" }), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug canvas");
  await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  await waitFor(
    page,
    () => window.__onyxDebug.snapshot().combat?.phase === "hand" && window.__onyxDebug.isIdle(),
    "canvas triangle",
  );
  await wait(1700);
  await page.setViewportSize({ width: 1280, height: 720 });
  await shot(page, "11-canvas-triangle");
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial sparse UI fixtures passed; evidence: ${OUT}`);
console.log("page errors []");
