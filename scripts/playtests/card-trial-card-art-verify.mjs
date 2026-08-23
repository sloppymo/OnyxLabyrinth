/**
 * Card Trial production-art gate.
 *
 * It derives card names, rules, hero ownership, and costs from the live
 * source file, verifies one native 128×96 PNG per unique CardId, renders a
 * full family gallery plus mixed hand sheets, and then captures the actual
 * sparse CardTrialHandPresentation from the production runtime for both
 * heroes. Expects a production preview, for example:
 *
 *   npm run build
 *   npx vite preview --host 127.0.0.1 --port 5208 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5208/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-card-art-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5208/OnyxLabyrinth/";
const DEBUG_ROOT = new URL("?debug=1", ROOT).href;
const OUT = path.resolve("playtest-screenshots/card-trial-card-art");
const ART_DIR = path.resolve("public/assets/card-trial/cards");
fs.mkdirSync(OUT, { recursive: true });

function readSourceCards() {
  const source = fs.readFileSync(path.resolve("src/game/card-trial/cards.ts"), "utf8");
  const cards = [];
  const entryRe = /^\s{2}(?:"([a-z0-9-]+)"|([a-z0-9-]+)): \{\n([\s\S]*?)\n\s{2}\},/gm;
  for (const match of source.matchAll(entryRe)) {
    const block = match[3];
    const field = (name) => block.match(new RegExp(`^    ${name}: "([^"]+)"`, "m"))?.[1];
    const id = field("id");
    if (!id) continue;
    const name = field("name");
    const hero = field("hero");
    const text = field("text");
    const cost = Number(block.match(/^    cost: (\d+)/m)?.[1]);
    const consume = field("consume") ?? "none";
    if (!name || !hero || !text || !Number.isFinite(cost)) {
      throw new Error(`Could not parse complete CARD_DEFS entry for ${id}`);
    }
    cards.push({ id, name, hero, text, cost, consume });
  }
  if (cards.length !== 22) throw new Error(`Expected 22 live unique CardDefs, got ${cards.length}`);
  return cards;
}

const cards = readSourceCards();
const liveIds = cards.map((card) => card.id).sort();
const assetIds = fs
  .readdirSync(ART_DIR)
  .filter((name) => name.endsWith(".png"))
  .map((name) => name.slice(0, -4))
  .sort();
if (new Set(assetIds).size !== assetIds.length) throw new Error("Duplicate card-art filenames detected");
if (JSON.stringify(assetIds) !== JSON.stringify(liveIds)) {
  throw new Error(`Card art/source mismatch\nassets: ${assetIds.join(",")}\nlive: ${liveIds.join(",")}`);
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tier(text) {
  if (text.length <= 28) return "short";
  if (text.length <= 64) return "medium";
  return "long";
}

function artUrl(id) {
  return new URL(`assets/card-trial/cards/${id}.png`, ROOT).href;
}

function cardMarkup(card, className = "") {
  const cardTier = tier(card.text);
  return `<article class="review-card ${className}" data-card-id="${esc(card.id)}" data-tier="${cardTier}">
    <div class="review-head"><span class="review-name">${esc(card.name)}</span><span class="review-cost">${card.cost}</span></div>
    <div class="review-art"><img src="${artUrl(card.id)}" alt="${esc(card.name)} illustration"></div>
    <div class="review-rules">${esc(card.text)}</div>
    ${card.consume !== "none" ? `<div class="review-consume">◉ Consume</div>` : ""}
  </article>`;
}

const byHero = {
  "rat-king": cards.filter((card) => card.hero === "rat-king"),
  "old-man": cards.filter((card) => card.hero === "old-man"),
};
const short = [...cards].sort((a, b) => a.text.length - b.text.length).slice(0, 5);
const long = [...cards].sort((a, b) => b.text.length - a.text.length).slice(0, 5);
const mixed = [cards[0], cards[11], cards[5], cards[17], cards[9]];

const browser = await chromium.launch({ headless: true });
const errors = [];
const gallery = await browser.newPage({ viewport: { width: 1440, height: 1900 }, deviceScaleFactor: 1 });
gallery.on("pageerror", (error) => errors.push(`gallery pageerror: ${error.message}`));
gallery.on("console", (message) => {
  if (message.type() === "error") errors.push(`gallery console: ${message.text()}`);
});
gallery.on("requestfailed", (request) => errors.push(`gallery requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));

const galleryHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Card Trial production art gate</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#0b0d14;color:#eee8d5;font-family:monospace}body{padding:28px}
h1,h2,p{margin:0 0 12px}h1{font-size:22px;color:#ffe08a}h2{font-size:16px;color:#d8c27a;margin-top:30px}p{font-size:12px;color:#aeb4c5}
.panel{padding:16px;border:1px solid #34394a;background:#111521;width:max-content;max-width:100%}.grid{display:flex;flex-wrap:wrap;gap:10px;max-width:1180px}
.review-card{position:relative;width:132px;height:184px;overflow:hidden;border:2px solid #8790b4;border-radius:8px;background:linear-gradient(#283874,#15204f);box-shadow:0 5px 12px #000a}
.review-head{height:27px;display:flex;align-items:flex-start;justify-content:space-between;padding:4px 5px 0;color:#fff8dc;text-shadow:0 1px #000;font-size:10px;font-weight:700;line-height:1.1;position:relative;z-index:1;background:linear-gradient(#12182dcc,transparent)}
.review-name{max-width:105px}.review-cost{color:#ffe08a;font-size:14px}.review-art{width:128px;margin:0 auto;overflow:hidden;background:#0c0a08;flex:0 0 auto}.review-art img{display:block;width:128px;image-rendering:pixelated;image-rendering:crisp-edges}.review-card[data-tier=short] .review-art{height:96px}.review-card[data-tier=medium] .review-art{height:80px}.review-card[data-tier=long] .review-art{height:64px}.review-card[data-tier=short] .review-art img{height:96px}.review-card[data-tier=medium] .review-art img,.review-card[data-tier=long] .review-art img{height:96px;object-fit:cover;object-position:top}
.review-rules{font-size:9px;line-height:1.2;padding:4px 5px 0;color:#f2e8c8}.review-consume{font-size:8px;color:#e8a84a;padding:2px 5px}
.fan{position:relative;width:768px;height:380px;background:linear-gradient(#131727,#211d22);overflow:hidden}.fan .review-card{position:absolute;left:50%;top:62px;transform-origin:50% 50%;}.fan .review-card:nth-child(1){transform:translateX(-260px) rotate(-9deg)}.fan .review-card:nth-child(2){transform:translateX(-150px) translateY(28px) rotate(-4deg)}.fan .review-card:nth-child(3){transform:translateX(-50%) translateY(-8px) scale(1.07);z-index:5;border-color:#ffe08a}.fan .review-card:nth-child(4){transform:translateX(50px) translateY(28px) rotate(4deg)}.fan .review-card:nth-child(5){transform:translateX(160px) rotate(9deg)}
.label{font-size:11px;color:#c8cad3;margin:0 0 7px}.section{margin-top:15px}
</style></head><body>
<h1>Card Trial — complete production art gate</h1>
<p>Source-derived 22-card gallery · native 128×96 masters · gameplay cards 132×184 · image-rendering pixelated.</p>
<h2>RAT KING</h2><section class="panel grid">${byHero["rat-king"].map((card) => cardMarkup(card)).join("")}</section>
<h2>OLD MAN</h2><section class="panel grid">${byHero["old-man"].map((card) => cardMarkup(card)).join("")}</section>
<h2>Representative mixed sheets</h2>
<div class="section"><div class="label">short-text / frequent-read cards</div><section class="panel grid">${short.map((card) => cardMarkup(card)).join("")}</section></div>
<div class="section"><div class="label">long-text / reduced art-well cards</div><section class="panel grid">${long.map((card) => cardMarkup(card)).join("")}</section></div>
<div class="section"><div class="label">mixed hand: Rat King / Old Man / splash / control / movement</div><section class="panel fan">${mixed.map((card) => cardMarkup(card)).join("")}</section></div>
</body></html>`;

await gallery.setContent(galleryHtml, { waitUntil: "load" });
await gallery.waitForFunction(() => [...document.images].every((image) => image.complete));
const imageFacts = await gallery.evaluate(() => [...document.querySelectorAll(".review-card img")].map((image) => ({
  id: image.closest("[data-card-id]")?.dataset.cardId,
  naturalWidth: image.naturalWidth,
  naturalHeight: image.naturalHeight,
})));
if (imageFacts.length !== 22 + 5 + 5 + 5) throw new Error(`Expected gallery instances, got ${imageFacts.length}`);
if (imageFacts.some((fact) => fact.naturalWidth !== 128 || fact.naturalHeight !== 96)) {
  throw new Error(`One or more gallery images are not native 128×96: ${JSON.stringify(imageFacts.filter((fact) => fact.naturalWidth !== 128 || fact.naturalHeight !== 96))}`);
}
await gallery.screenshot({ path: path.join(OUT, "full-deck-gallery.png"), fullPage: true });
await gallery.locator(".panel").nth(0).screenshot({ path: path.join(OUT, "rat-king-deck.png") });
await gallery.locator(".panel").nth(1).screenshot({ path: path.join(OUT, "old-man-deck.png") });
await gallery.locator(".fan").screenshot({ path: path.join(OUT, "mixed-hand-sheet.png") });

const runtime = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
runtime.on("pageerror", (error) => errors.push(`runtime pageerror: ${error.message}`));
runtime.on("console", (message) => {
  if (message.type() === "error") errors.push(`runtime console: ${message.text()}`);
});
runtime.on("requestfailed", (request) => errors.push(`runtime requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));

async function waitForPhysicalHand() {
  await runtime.waitForFunction(() => document.querySelectorAll("#card-trial-overlay .ct2-card").length === 5, null, { timeout: 30000 });
  await runtime.waitForTimeout(500);
}

async function startTriangle() {
  await runtime.goto(DEBUG_ROOT, { waitUntil: "networkidle" });
  await runtime.waitForTimeout(600);
  await runtime.keyboard.press("Enter");
  await runtime.waitForTimeout(500);
  for (let i = 0; i < 5; i += 1) await runtime.keyboard.press("ArrowDown");
  await runtime.keyboard.press("Enter");
  await runtime.waitForTimeout(800);
  await runtime.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  await waitForPhysicalHand();
}

await startTriangle();
const ratHand = await runtime.evaluate(() => {
  const view = window.__onyxDebug.cardTrial.view();
  return { hero: view?.actingHero, cards: view?.hand?.map((card) => card.defId) ?? [] };
});
const ratFallbackCount = await runtime.locator("#card-trial-overlay .ct2-card-art.fallback").count();
if (ratFallbackCount !== 0) throw new Error(`Rat King production hand used ${ratFallbackCount} art fallback(s)`);
await runtime.screenshot({ path: path.join(OUT, "real-hand-rat-king.png"), fullPage: true });

await runtime.keyboard.press("b");
await runtime.waitForFunction(() => window.__onyxDebug.cardTrial.view()?.actingHero === "old-man" && document.querySelectorAll("#card-trial-overlay .ct2-card").length === 5, null, { timeout: 30000 });
await runtime.waitForTimeout(500);
const oldManHand = await runtime.evaluate(() => {
  const view = window.__onyxDebug.cardTrial.view();
  return { hero: view?.actingHero, cards: view?.hand?.map((card) => card.defId) ?? [] };
});
const oldManFallbackCount = await runtime.locator("#card-trial-overlay .ct2-card-art.fallback").count();
if (oldManFallbackCount !== 0) throw new Error(`Old Man production hand used ${oldManFallbackCount} art fallback(s)`);
await runtime.screenshot({ path: path.join(OUT, "real-hand-old-man.png"), fullPage: true });

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({
  sourceCards: cards,
  assetIds,
  imageFacts,
  realHands: { ratHand, oldManHand, ratFallbackCount, oldManFallbackCount },
  cardDimensions: { width: 132, height: 184 },
  nativeArt: { width: 128, height: 96 },
  pageErrors: errors,
}, null, 2));
await browser.close();

if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial complete art gate passed; evidence: ${OUT}`);
console.log(`source cards ${cards.length}; art files ${assetIds.length}; page errors []`);
console.log(`real Rat King hand: ${ratHand.cards.join(", ")}`);
console.log(`real Old Man hand: ${oldManHand.cards.join(", ")}`);
