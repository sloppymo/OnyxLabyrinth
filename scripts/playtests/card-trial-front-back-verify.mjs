/**
 * Final production-preview evidence for Card Trial Front/Back presentation.
 *
 * Expects a freshly built preview, for example:
 *   npx vite preview --host 127.0.0.1 --port 5207 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5207/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-front-back-verify.mjs
 *
 * The frozen reference agent is the rules/DOM oracle. This script is the
 * complementary spatial-presentation fixture: it captures both renderers,
 * both row orders, same-row states, paid moves in both directions, and the
 * printed Lunge banner/move/attack sequence.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5207/OnyxLabyrinth/";
const OUT = path.resolve("playtest-screenshots/card-trial-front-back-final");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { capturedAt: new Date().toISOString(), baseUrl: ROOT, renderers: {}, errors: [] };

function urlFor(renderer) {
  const url = new URL(ROOT);
  url.searchParams.set("debug", "1");
  if (renderer === "canvas") url.searchParams.set("phaser", "0");
  else url.searchParams.delete("phaser");
  return url.toString();
}

async function waitFor(page, predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await wait(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function boot(page, renderer, floorId = 1) {
  await page.goto(urlFor(renderer), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug surface");
  if (floorId !== 1) {
    await page.evaluate((id) => {
      const floor = window.__onyxDebug.FLOORS.find((candidate) => candidate.id === id);
      if (!floor) throw new Error(`Missing floor ${id}`);
      window.__onyxDebug.jumpTo({
        floorId: id,
        x: floor.startX,
        y: floor.startY,
        facing: 0,
        autosave: false,
      });
    }, floorId);
    await waitFor(page, () => window.__onyxDebug.isIdle(), `floor ${floorId} settle`);
  }
}

async function startFight(page, fightId) {
  await page.evaluate((id) => window.__onyxDebug.cardTrial.startFight(id), fightId);
  await waitFor(
    page,
    () => {
      const snap = window.__onyxDebug.snapshot();
      return snap.route === "card_trial" && snap.combat?.phase === "hand" && window.__onyxDebug.isIdle();
    },
    `fight ${fightId} hand`,
    20000,
  );
}

async function waitForHand(page, label, timeout = 20000) {
  await waitFor(
    page,
    () => window.__onyxDebug.snapshot().combat?.phase === "hand" && window.__onyxDebug.isIdle(),
    label,
    timeout,
  );
}

async function evidence(page) {
  return page.evaluate(() => {
    const view = window.__onyxDebug.cardTrial.view();
    const wrap = document.querySelector("#combat-wrap");
    const phaser = document.querySelector("#combat-phaser-canvas");
    const canvas = document.querySelector("#combat-canvas");
    const heroText = [...document.querySelectorAll(".ct-hero")].map((node) => node.textContent?.trim() ?? "");
    const handTitle = document.querySelector(".ct-hand .ff6-menu-title")?.textContent?.trim() ?? null;
    return {
      fightId: view?.fightId ?? null,
      heroes: view?.heroes.map((hero) => ({ id: hero.id, row: hero.row, hp: hero.hp })) ?? [],
      actingHero: view?.actingHero ?? null,
      hand: view?.hand.map((card) => card.defId) ?? [],
      heroLabelCount: document.querySelectorAll(".ct-hero-row").length,
      heroText,
      handTitle,
      ratText: document.querySelector(".ct-rat")?.textContent?.trim() ?? null,
      renderer: wrap?.classList.contains("phaser-stage") ? "phaser" : "canvas",
      canvasVisible: canvas ? getComputedStyle(canvas).display !== "none" : false,
      phaserVisible: phaser ? getComputedStyle(phaser).display !== "none" : false,
      pageErrors: window.__onyxDebug.log(300, "error"),
    };
  });
}

async function capture(page, renderer, name, bucket) {
  const filename = `${renderer}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  const state = await evidence(page);
  bucket.push({ name, screenshot: filename, ...state });
  if (state.heroLabelCount !== 0) throw new Error(`${renderer}/${name}: hero row label survived`);
  if (state.heroText.some((line) => /\b(?:FRONT|BACK)\b/i.test(line))) {
    throw new Error(`${renderer}/${name}: hero status text still names a row`);
  }
  return state;
}

async function paidMoveMatrix(page, renderer, bucket) {
  await boot(page, renderer, 1);
  await startFight(page, 10);
  let state = await capture(page, renderer, "01-fight10-rat-front-old-back", bucket);
  if (state.heroes[0]?.row !== "front" || state.heroes[1]?.row !== "back") {
    throw new Error(`${renderer}: unexpected opening row order`);
  }

  // Rat King: Front -> Back. The 100ms frame is the midpoint of the 200ms move.
  await page.keyboard.press("m");
  await wait(35);
  await capture(page, renderer, "02-paid-front-to-back-early", bucket);
  await wait(65);
  await capture(page, renderer, "03-paid-front-to-back-mid", bucket);
  await waitForHand(page, `${renderer} paid Front->Back settle`);
  state = await capture(page, renderer, "04-both-back-settled", bucket);
  if (!state.heroes.every((hero) => hero.row === "back")) {
    throw new Error(`${renderer}: paid Front->Back did not produce both Back`);
  }

  // Pass Rat King; after the slow boss beat Old Man acts in Back.
  await page.keyboard.press("Escape");
  await waitForHand(page, `${renderer} Old Man turn`);

  // Old Man: Back -> Front.
  await page.keyboard.press("m");
  await wait(35);
  await capture(page, renderer, "05-paid-back-to-front-early", bucket);
  await wait(65);
  await capture(page, renderer, "06-paid-back-to-front-mid", bucket);
  await waitForHand(page, `${renderer} paid Back->Front settle`);
  state = await capture(page, renderer, "07-rat-back-old-front", bucket);
  const rat = state.heroes.find((hero) => hero.id === "rat-king");
  const old = state.heroes.find((hero) => hero.id === "old-man");
  if (rat?.row !== "back" || old?.row !== "front") {
    throw new Error(`${renderer}: reverse row order did not settle`);
  }

  // Pass Old Man into round 2, then move Rat King Back -> Front: both Front.
  await page.keyboard.press("Escape");
  await waitForHand(page, `${renderer} round 2 Rat King turn`);
  await page.keyboard.press("m");
  await waitForHand(page, `${renderer} both Front settle`);
  state = await capture(page, renderer, "08-both-front-settled", bucket);
  if (!state.heroes.every((hero) => hero.row === "front")) {
    throw new Error(`${renderer}: legal both-Front fixture did not settle`);
  }
}

async function lungeMatrix(page, renderer, bucket) {
  await boot(page, renderer, 1);
  await startFight(page, 1);
  await capture(page, renderer, "09-fight1-two-enemies", bucket);

  // Move Rat King to Back, then play printed card #2: Lunge.
  await page.keyboard.press("m");
  await waitForHand(page, `${renderer} Lunge setup move`);
  const ready = await evidence(page);
  if (ready.hand[1] !== "lunge") throw new Error(`${renderer}: expected Lunge in hand slot 2`);
  await page.keyboard.press("2");
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase === "target", "Lunge target");
  await page.keyboard.press("Enter");

  // Preserve the actual multi-beat presentation rather than one lucky frame.
  const frameTimes = [30, 120, 240, 360, 500, 650, 800, 980, 1160];
  let elapsed = 0;
  for (let i = 0; i < frameTimes.length; i++) {
    const target = frameTimes[i];
    await wait(target - elapsed);
    elapsed = target;
    await capture(page, renderer, `10-lunge-${String(target).padStart(4, "0")}ms`, bucket);
  }
  await waitForHand(page, `${renderer} Lunge settle`);
  const settled = await capture(page, renderer, "11-lunge-settled-front", bucket);
  if (settled.heroes.find((hero) => hero.id === "rat-king")?.row !== "front") {
    throw new Error(`${renderer}: Lunge did not settle in Front`);
  }
}

async function countAndBackdropFixtures(page, renderer, bucket) {
  // Three enemies on the second backdrop validates backdrop-relative anchors.
  await boot(page, renderer, 2);
  await startFight(page, 5);
  const state = await capture(page, renderer, "12-floor2-fight5-three-enemies", bucket);
  if (state.fightId !== 5) throw new Error(`${renderer}: floor-2 three-enemy fixture failed`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const renderer of ["canvas", "phaser"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });

    const bucket = [];
    report.renderers[renderer] = bucket;
    await paidMoveMatrix(page, renderer, bucket);
    await lungeMatrix(page, renderer, bucket);
    await countAndBackdropFixtures(page, renderer, bucket);
    if (errors.length) report.errors.push(...errors.map((error) => `${renderer}: ${error}`));
    await context.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial Front/Back visual matrix passed; evidence: ${OUT}`);
console.log("page errors []");
