/**
 * Live Card Trial hand evidence for wired illustration fields.
 *
 * Complements the isolated 1× fixture in card-trial-card-art-verify.mjs.
 * This script boots the real Card Trial renderer (triangle hand) and checks
 * that production art sits in the reserved aperture without changing card
 * width, hand-row layout, or Front/Back battlefield copy.
 *
 * Expects a built production preview, for example:
 *   npx vite preview --host 127.0.0.1 --port 5208 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5208/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-card-art-runtime-verify.mjs
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5208/OnyxLabyrinth/";
const OUT = path.resolve("playtest-screenshots/card-trial-card-art-runtime");
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

async function cardFacts(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll(".ct-card")];
    return {
      handTitle: document.querySelector(".ct-hand .ff6-menu-title")?.textContent?.trim() ?? null,
      heroLabelCount: document.querySelectorAll(".ct-hero-row").length,
      heroText: [...document.querySelectorAll(".ct-hero")].map((node) => node.textContent?.trim() ?? ""),
      ratText: document.querySelector(".ct-rat")?.textContent?.trim() ?? null,
      handRowDisplay: document.querySelector(".ct-hand-row")
        ? getComputedStyle(document.querySelector(".ct-hand-row")).display
        : null,
      cards: cards.map((card, index) => {
        const art = card.querySelector(".ct-card-art");
        const img = card.querySelector("img.ct-card-art-img");
        const box = card.getBoundingClientRect();
        const artBox = art?.getBoundingClientRect();
        return {
          index,
          selected: card.classList.contains("selected"),
          name: card.querySelector(".ct-card-name")?.textContent?.trim() ?? "",
          cost: card.querySelector(".ct-card-cost")?.textContent?.trim() ?? "",
          text: card.querySelector(".ct-card-text")?.textContent?.trim() ?? "",
          width: Math.round(box.width),
          height: Math.round(box.height),
          hasArt: !!art,
          fallback: art?.classList.contains("ct-card-art-fallback") ?? false,
          src: img?.getAttribute("src") ?? null,
          naturalWidth: img?.naturalWidth ?? 0,
          naturalHeight: img?.naturalHeight ?? 0,
          artWidth: artBox ? Math.round(artBox.width) : 0,
          artHeight: artBox ? Math.round(artBox.height) : 0,
          complete: img ? img.complete && img.naturalWidth > 0 : false,
        };
      }),
    };
  });
}

async function bootTriangle(page, renderer) {
  await page.goto(urlFor(renderer), { waitUntil: "networkidle" });
  await waitFor(page, () => !!window.__onyxDebug, "debug surface");
  await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  await waitFor(
    page,
    () => {
      const snap = window.__onyxDebug.snapshot();
      return snap.route === "card_trial" && snap.combat?.phase === "hand" && window.__onyxDebug.isIdle();
    },
    `${renderer} triangle hand`,
    20000,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  for (const renderer of ["phaser", "canvas"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });

    await bootTriangle(page, renderer);
    const unfocused = await cardFacts(page);
    if (unfocused.heroLabelCount !== 0) {
      throw new Error(`${renderer}: hero row label survived`);
    }
    if (unfocused.heroText.some((line) => /\b(?:FRONT|BACK)\b/i.test(line))) {
      throw new Error(`${renderer}: hero status text still names a row`);
    }
    if (unfocused.handRowDisplay !== "flex") {
      throw new Error(`${renderer}: hand row display changed (${unfocused.handRowDisplay})`);
    }
    if (unfocused.cards.length !== 5) {
      throw new Error(`${renderer}: expected five live cards, got ${unfocused.cards.length}`);
    }
    const expected = [
      { name: "King of the Heap", file: "king-of-the-heap.png", cost: "2" },
      { name: "Nip", file: "nip.png", cost: "1" },
      { name: "Nip", file: "nip.png", cost: "1" },
      { name: "Tide", file: "tide.png", cost: "1" },
      { name: "Swarm the Wound", file: "swarm-the-wound.png", cost: "1" },
    ];
    for (let i = 0; i < expected.length; i++) {
      const card = unfocused.cards[i];
      const want = expected[i];
      if (card.name !== want.name) throw new Error(`${renderer} card ${i}: name ${card.name}`);
      if (card.cost !== want.cost) throw new Error(`${renderer} card ${i}: cost ${card.cost}`);
      if (!card.hasArt || card.fallback) throw new Error(`${renderer} card ${i}: missing art aperture`);
      if (!card.src?.endsWith(`/assets/card-trial/cards/${want.file}`)) {
        throw new Error(`${renderer} card ${i}: src ${card.src}`);
      }
      if (!card.complete || card.naturalWidth !== 128 || card.naturalHeight !== 96) {
        throw new Error(`${renderer} card ${i}: source ${card.naturalWidth}×${card.naturalHeight}`);
      }
      if (card.width < 70 || card.width > 118) {
        throw new Error(`${renderer} card ${i}: width ${card.width} left live card bounds`);
      }
    }

    await page.screenshot({ path: path.join(OUT, `${renderer}-hand-cursor-0.png`) });
    const hand = page.locator(".ct-hand-row");
    await hand.screenshot({ path: path.join(OUT, `${renderer}-hand-row-cursor-0.png`) });

    await page.keyboard.press("ArrowRight");
    await wait(80);
    await page.keyboard.press("ArrowRight");
    await wait(80);
    await page.keyboard.press("ArrowRight");
    await wait(80);
    const tideFocused = await cardFacts(page);
    if (!tideFocused.cards[3]?.selected || tideFocused.cards[0]?.selected) {
      throw new Error(`${renderer}: expected Tide focused after three right presses`);
    }
    await page.screenshot({ path: path.join(OUT, `${renderer}-hand-cursor-tide.png`) });
    await hand.screenshot({ path: path.join(OUT, `${renderer}-hand-row-cursor-tide.png`) });

    report.renderers[renderer] = { unfocused, tideFocused, errors };
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
console.log(`Card Trial live card-art fixture passed; evidence: ${OUT}`);
console.log("page errors []");
