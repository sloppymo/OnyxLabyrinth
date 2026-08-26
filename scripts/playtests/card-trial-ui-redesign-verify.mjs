/**
 * Card Trial UI redesign visual/integration matrix.
 *
 * Runs against a production preview and captures the same semantic states in
 * Phaser and Canvas. It also verifies the roomLight=0 URL path remains safe
 * and records one untouched campaign-combat baseline.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/";
const OUT = path.resolve(
  process.env.CT_UI_OUT ?? "output/card-trial-ui-redesign/evidence"
);
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  capturedAt: new Date().toISOString(),
  baseUrl: ROOT,
  renderers: {},
  roomLightZero: null,
  campaign: null,
  errors: [],
};

function check(value, message) {
  if (!value) throw new Error(message);
}

function urlFor(renderer, extra = {}) {
  const url = new URL(ROOT);
  url.searchParams.set("debug", "1");
  if (renderer === "canvas") url.searchParams.set("phaser", "0");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function waitFor(page, predicate, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await wait(35);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForActorHand(page, actorId) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate((expected) => {
      const snap = window.__onyxDebug?.snapshot();
      const view = window.__onyxDebug?.cardTrial?.view();
      return snap?.route === "card_trial" && snap.combat?.phase === "hand" &&
        window.__onyxDebug.isIdle() && view?.actingHero === expected;
    }, actorId);
    if (ready) return;
    await wait(35);
  }
  throw new Error(`Timed out waiting for ${actorId} hand`);
}

async function bootTriangle(page, renderer, extra = {}) {
  await page.goto(urlFor(renderer, extra), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug surface");
  await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle({ seed: 1 }));
  await waitForActorHand(page, "rat-king");
  // Let the one-shot fight-title banner clear before baseline captures; the
  // redesign assertions target the steady decision state, not intro timing.
  await wait(1750);
}

async function facts(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      if (!node || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    };
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    };
    const overlap = (a, b) =>
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
    const view = window.__onyxDebug.cardTrial.view();
    const cards = [...document.querySelectorAll("#card-trial-overlay .ct2-card")];
    const allPlates = [...document.querySelectorAll(".ct-actor-chip")];
    const plates = allPlates.filter(visible);
    const plateRects = plates.map(rect);
    const plateOverlaps = [];
    for (let i = 0; i < plateRects.length; i++) {
      for (let j = i + 1; j < plateRects.length; j++) {
        if (overlap(plateRects[i], plateRects[j])) {
          plateOverlaps.push([plates[i].textContent?.trim(), plates[j].textContent?.trim()]);
        }
      }
    }
    const topNodes = [
      document.querySelector(".ct-sparse-meters"),
      document.querySelector(".ct-sparse-init"),
      document.querySelector(".ct-sparse-hold"),
      document.querySelector(".ct-decision-bar"),
    ].filter(visible);
    const topRects = topNodes.map(rect);
    const topOverlaps = [];
    for (let i = 0; i < topRects.length; i++) {
      for (let j = i + 1; j < topRects.length; j++) {
        if (overlap(topRects[i], topRects[j])) topOverlaps.push([i, j]);
      }
    }
    const images = [...document.querySelectorAll("#card-trial-overlay img")];
    const brokenImages = images
      .filter((image) => !image.complete || image.naturalWidth <= 0)
      .map((image) => image.getAttribute("src"));
    const wrap = document.querySelector("#combat-wrap");
    const initiative = [...document.querySelectorAll(".ct-init-pip")];
    const indicators = [...document.querySelectorAll(".ct-actor-indicator")];
    return {
      route: window.__onyxDebug.snapshot().route,
      phase: window.__onyxDebug.snapshot().combat?.phase ?? null,
      renderer: wrap?.classList.contains("phaser-stage") ? "phaser" : "canvas",
      actingHero: view?.actingHero ?? null,
      energy: view?.energy ?? null,
      rows: view?.heroes.map((hero) => ({ id: hero.id, row: hero.row })) ?? [],
      queueIds: view?.queue.map((actor) => actor.id) ?? [],
      initiativeIds: initiative.map((node) => node.dataset.id),
      activeInitiativeIds: initiative.filter((node) => node.classList.contains("acting"))
        .map((node) => node.dataset.id),
      currentRings: [...document.querySelectorAll(".ct-current-ring")].filter(visible).length,
      legalMarkers: [...document.querySelectorAll(".ct-legal-marker")].filter(visible).length,
      targetArrows: [...document.querySelectorAll(".ct-target-arrow")].filter(visible).length,
      targetReticles: [...document.querySelectorAll(".ct-target-reticle")].filter(visible).length,
      targetLabels: [...document.querySelectorAll(".ct-target-label")].filter(visible).length,
      edgeCues: [...document.querySelectorAll(".ct-target-edge")].filter(visible).length,
      actorIndicatorCount: indicators.length,
      livingActorCount: (view?.heroes.filter((hero) => !hero.dead).length ?? 0) +
        (view?.enemies.filter((enemy) => !enemy.dead).length ?? 0),
      cardCount: cards.length,
      cards: cards.map((card) => ({
        uid: card.dataset.uid,
        name: card.querySelector(".ct2-card-name")?.textContent?.trim() ?? "",
        focused: card.classList.contains("focused"),
        armed: card.classList.contains("armed"),
        unavailable: card.classList.contains("disabled"),
        reason: card.querySelector(".ct2-card-why")?.textContent?.trim() ?? "",
        rect: rect(card),
        transform: getComputedStyle(card).transform,
        scale: (() => {
          const matrix = new DOMMatrix(getComputedStyle(card).transform);
          return Math.hypot(matrix.a, matrix.b);
        })(),
      })),
      instruction: document.querySelector(".ct-instruction-text")?.textContent?.trim() ?? "",
      decision: document.querySelector(".ct-decision-bar")?.textContent?.trim() ?? "",
      visiblePlateIds: plates.map((plate) => plate.dataset.actor),
      targetedPlateIds: plates
        .filter((plate) => plate.classList.contains("targeted"))
        .map((plate) => plate.dataset.actor),
      allPlateTexts: allPlates.map((plate) => plate.textContent?.trim() ?? ""),
      allPlateIntentCount: document.querySelectorAll(".ct-actor-chip .ct-chip-intent").length,
      allPlateGuardTextCount: allPlates.filter((plate) => /Guard/i.test(plate.textContent ?? "")).length,
      detailsVisible: visible(document.querySelector(".ct-sparse-details")),
      detailsText: document.querySelector(".ct-sparse-details")?.textContent?.trim() ?? "",
      actionRailVisible: visible(document.querySelector(".ct-action-rail")),
      plateOverlaps,
      topOverlaps,
      brokenImages,
      customHeroAssets: performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /assets\/card-trial\/heroes\/(?:rat-king|old-man)\//.test(name)),
      genericPartyAssets: performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /assets\/party\//.test(name)),
      debugErrors: window.__onyxDebug.log(300, "error"),
    };
  });
}

async function capture(page, renderer, name, bucket) {
  const filename = `idle-thin-${renderer}-${name}.png`;
  await page.locator("#combat-wrap").screenshot({ path: path.join(OUT, filename) });
  const state = await facts(page);
  bucket.push({ name, screenshot: filename, ...state });
  check(state.renderer === renderer, `${renderer}/${name}: wrong renderer ${state.renderer}`);
  check(state.route === "card_trial", `${renderer}/${name}: route ${state.route}`);
  check(state.queueIds.join("|") === state.initiativeIds.join("|"), `${renderer}/${name}: duplicate/drifted initiative`);
  check(state.activeInitiativeIds.length === 1, `${renderer}/${name}: active initiative count ${state.activeInitiativeIds.length}`);
  check(state.actorIndicatorCount === state.livingActorCount, `${renderer}/${name}: stale/missing actor indicators`);
  check(state.plateOverlaps.length === 0, `${renderer}/${name}: actor plate collision ${JSON.stringify(state.plateOverlaps)}`);
  check(state.topOverlaps.length === 0, `${renderer}/${name}: top-rail collision ${JSON.stringify(state.topOverlaps)}`);
  check(state.brokenImages.length === 0, `${renderer}/${name}: broken UI images ${state.brokenImages}`);
  check(state.debugErrors.length === 0, `${renderer}/${name}: debug error events`);
  return state;
}

async function playFocusedSingleTarget(page) {
  await page.keyboard.press("Enter");
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase === "target", "target phase");
  await wait(380);
}

async function confirmTargetAndWait(page) {
  await page.keyboard.press("Enter");
  await waitForActorHand(page, "rat-king");
  await wait(180);
}

async function rendererMatrix(page, renderer) {
  const bucket = [];
  report.renderers[renderer] = bucket;
  await bootTriangle(page, renderer);

  let state = await capture(page, renderer, "01-idle-current-actor", bucket);
  check(state.currentRings === 1, `${renderer}: expected one current-actor ring`);
  check(state.visiblePlateIds.length === 1 && state.visiblePlateIds[0] === "rat-king", `${renderer}: idle plate visibility is not thin`);
  check(state.legalMarkers === 0, `${renderer}: idle unexpectedly shows legal-target markers`);
  check(state.allPlateIntentCount === 0, `${renderer}: idle plate still renders intent copy`);
  check(state.instruction === "", `${renderer}: idle field line duplicates the decision cue`);
  check(state.cards.filter((card) => card.focused).length === 1, `${renderer}: focus missing`);
  check(state.cards.every((card) => !card.armed), `${renderer}: focus incorrectly armed`);
  // Exact protagonist selection is covered by the pure cache test and visual
  // evidence. Chromium may omit Image()-decoded strips from Resource Timing,
  // so retain the list in the report without using it as a pass/fail oracle.

  const focusedCard = state.cards.find((card) => card.focused);
  await playFocusedSingleTarget(page);
  state = await capture(page, renderer, "02-card-armed-choose-target", bucket);
  const armedCard = state.cards.find((card) => card.armed);
  check(!!focusedCard && !!armedCard && focusedCard.uid === armedCard.uid, `${renderer}: armed UID drifted`);
  check(focusedCard.rect.top - armedCard.rect.top >= 24, `${renderer}: armed card did not rise 28–36 design px`);
  check(armedCard.scale > focusedCard.scale * 1.05, `${renderer}: armed card did not scale`);
  check(state.targetArrows === 1 && state.targetReticles === 1 && state.targetLabels === 1, `${renderer}: selected red target incomplete`);
  check(state.legalMarkers >= 1 && state.edgeCues >= 2, `${renderer}: legal target cues incomplete`);
  check(state.visiblePlateIds.length === 2 && state.visiblePlateIds.includes("rat-king"), `${renderer}: target phase plate visibility is not acting-plus-selected`);
  check(state.targetedPlateIds.length === 1 && state.visiblePlateIds.includes(state.targetedPlateIds[0]), `${renderer}: selected target plate is hidden`);
  check(state.allPlateIntentCount === 0, `${renderer}: target phase plate still renders intent copy`);
  check(/→/.test(state.instruction) && /DEAL/i.test(state.instruction), `${renderer}: outcome preview missing`);

  await page.keyboard.press("ArrowRight");
  await wait(100);
  await capture(page, renderer, "03-selected-target-cycled", bucket);
  await page.keyboard.press("Escape");
  await waitForActorHand(page, "rat-king");

  await page.keyboard.down("i");
  await wait(90);
  state = await capture(page, renderer, "04-details-held", bucket);
  check(state.detailsVisible && /Guard|HP|Front|Back/i.test(state.detailsText), `${renderer}: Details copy missing`);
  check(/FIGHT\s*2.*CLEAVER AND ASH/i.test(state.detailsText), `${renderer}: fight identity missing from Details`);
  check(/CLEAVER.*our Front.*11/i.test(state.detailsText) && /ASH.*our Back.*8/i.test(state.detailsText), `${renderer}: exact enemy intent missing from Details`);
  check(/ASH.*Back.*Opened/i.test(state.detailsText), `${renderer}: Opened state missing from Details`);
  check(state.visiblePlateIds.length === 1 && state.visiblePlateIds[0] === "rat-king", `${renderer}: Details spawned extra visible plates`);
  check(state.allPlateIntentCount === 0 && state.allPlateGuardTextCount === 0, `${renderer}: Details copy leaked onto plates`);
  check(state.allPlateTexts.every((plate) => !/our Front/i.test(plate)), `${renderer}: intent copy leaked onto a plate`);
  await page.keyboard.up("i");

  await page.keyboard.press("m");
  await wait(95);
  await capture(page, renderer, "05-front-back-move-mid", bucket);
  await waitForActorHand(page, "rat-king");
  state = await capture(page, renderer, "06-front-back-move-settled", bucket);
  check(state.rows.find((hero) => hero.id === "rat-king")?.row === "back", `${renderer}: paid move did not settle Back`);

  await page.keyboard.press("Escape");
  await waitFor(page, () => window.__onyxDebug.snapshot().combat?.phase === "playback", "enemy handoff playback");
  await wait(70);
  await capture(page, renderer, "07-enemy-turn-handoff", bucket);
  await waitForActorHand(page, "old-man");
  state = await capture(page, renderer, "08-old-man-turn", bucket);
  check(state.actingHero === "old-man", `${renderer}: initiative did not hand to Old Man`);
  check(state.activeInitiativeIds[0] === "old-man", `${renderer}: active tile did not hand to Old Man`);
  check(state.visiblePlateIds.length === 1 && state.visiblePlateIds[0] === "old-man", `${renderer}: Old Man idle plate visibility is not thin`);

  // Fresh triangle: spend two 1-energy Nips so the retained 2-cost card is
  // visibly unavailable at 1 energy while other 1-cost cards remain legal.
  await bootTriangle(page, renderer);
  await page.keyboard.press("ArrowRight");
  await playFocusedSingleTarget(page);
  await confirmTargetAndWait(page);
  await page.keyboard.press("ArrowRight");
  await playFocusedSingleTarget(page);
  await confirmTargetAndWait(page);
  state = await capture(page, renderer, "09-unavailable-card", bucket);
  check(state.energy === 1, `${renderer}: unavailable fixture energy ${state.energy}`);
  check(state.cards.some((card) => card.unavailable && /Need 2 energy/i.test(card.reason)), `${renderer}: unavailable reason missing`);
  check(state.cards.some((card) => !card.unavailable), `${renderer}: all cards incorrectly unavailable`);

  return bucket;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const renderer of ["phaser", "canvas"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) =>
      browserErrors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`)
    );
    await rendererMatrix(page, renderer);
    if (browserErrors.length) report.errors.push(...browserErrors.map((error) => `${renderer}: ${error}`));
    await context.close();
  }

  // Existing query contract: this pass must not intercept or break it.
  const roomContext = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const roomPage = await roomContext.newPage();
  const roomErrors = [];
  roomPage.on("pageerror", (error) => roomErrors.push(`pageerror: ${error.message}`));
  roomPage.on("console", (message) => {
    if (message.type() === "error") roomErrors.push(`console: ${message.text()}`);
  });
  await bootTriangle(roomPage, "phaser", { roomLight: 0 });
  const roomBucket = [];
  report.roomLightZero = (await capture(roomPage, "phaser", "10-room-light-zero", roomBucket));
  check(new URL(roomPage.url()).searchParams.get("roomLight") === "0", "roomLight=0 query was lost");
  if (roomErrors.length) report.errors.push(...roomErrors.map((error) => `roomLight=0: ${error}`));
  await roomContext.close();

  // Campaign-isolation baseline: debug-start the existing four-character
  // combat, confirm sparse Card Trial chrome is absent, and capture it.
  const campaignContext = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const campaignPage = await campaignContext.newPage();
  const campaignErrors = [];
  campaignPage.on("pageerror", (error) => campaignErrors.push(`pageerror: ${error.message}`));
  campaignPage.on("console", (message) => {
    if (message.type() === "error") campaignErrors.push(`console: ${message.text()}`);
  });
  await campaignPage.goto(urlFor("phaser"), { waitUntil: "networkidle" });
  await waitFor(campaignPage, () => !!window.__onyxDebug, "campaign debug surface");
  await campaignPage.evaluate(() => window.__onyxDebug.startCombat());
  await waitFor(
    campaignPage,
    () => window.__onyxDebug.snapshot().route === "combat" && window.__onyxDebug.isIdle(),
    "campaign combat"
  );
  await wait(350);
  const campaignShot = "idle-thin-campaign-baseline.png";
  await campaignPage.locator("#combat-wrap").screenshot({ path: path.join(OUT, campaignShot) });
  report.campaign = await campaignPage.evaluate((screenshot) => ({
    screenshot,
    route: window.__onyxDebug.snapshot().route,
    partyIds: window.__onyxDebug.snapshot().combat?.party.map((actor) => actor.id) ?? [],
    sparseActive: document.querySelector("#combat-wrap")?.classList.contains("ct-sparse-active") ?? false,
    overlayChildren: document.querySelector("#card-trial-overlay")?.childElementCount ?? -1,
    errors: window.__onyxDebug.log(300, "error"),
  }), campaignShot);
  check(report.campaign.route === "combat", "campaign baseline did not enter campaign combat");
  check(report.campaign.partyIds.length === 4, `campaign party changed: ${report.campaign.partyIds}`);
  check(!report.campaign.sparseActive && report.campaign.overlayChildren === 0, "Card Trial chrome leaked into campaign");
  check(report.campaign.errors.length === 0, "campaign debug errors");
  if (campaignErrors.length) report.errors.push(...campaignErrors.map((error) => `campaign: ${error}`));
  await campaignContext.close();
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial UI redesign fixtures passed: ${OUT}`);
console.log("page errors []");
