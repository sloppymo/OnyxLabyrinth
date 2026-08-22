/**
 * Isolated native-scale review fixture for the first five Card Trial art fields.
 *
 * The fixture does not alter Card Trial's hand implementation. Its 132×184
 * cards and five-card fan copy the closest-current Gate A geometry solely for
 * visual validation. Expects a built production preview, for example:
 *
 *   npm run build
 *   npx vite preview --host 127.0.0.1 --port 5208 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5208/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-card-art-verify.mjs
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5208/OnyxLabyrinth/";
const OUT = path.resolve("playtest-screenshots/card-trial-card-art");
fs.mkdirSync(OUT, { recursive: true });

const cards = [
  { id: "nip", name: "Nip", cost: 1, text: "Deal 5." },
  {
    id: "king-of-the-heap",
    name: "King of the Heap",
    cost: 2,
    text: "Deal 7 and gain 8 Guard. Front: +3 damage.",
  },
  { id: "tide", name: "Tide", cost: 1, text: "Deal 5. Front: +3." },
  {
    id: "swarm-the-wound",
    name: "Swarm the Wound",
    cost: 1,
    text: "Deal 5. Consume Opened: deal 4 more to that enemy.",
    consume: true,
  },
  { id: "staff", name: "Staff", cost: 1, text: "Deal 6." },
].map((card) => ({
  ...card,
  src: new URL(`assets/card-trial/cards/${card.id}.png`, ROOT).href,
}));

function cardMarkup(card, index, className = "") {
  return `<article class="card ${className}" data-card-id="${card.id}" data-index="${index}">
    <img class="art" src="${card.src}" alt="${card.name} illustration">
    <div class="art-shade"></div>
    <div class="name">${card.name}</div>
    <div class="cost">${card.cost}</div>
    <div class="rules">${card.text}</div>
    ${card.consume ? '<div class="consume">◉ Consume</div>' : ""}
  </article>`;
}

const flatCards = cards.map((card, index) => cardMarkup(card, index)).join("");
const fanCards = cards
  .map((card, index) => {
    const mid = (cards.length - 1) / 2;
    const t = (index - mid) / mid;
    const selected = index === 2;
    const x = 384 + (index - mid) * 86;
    const y = selected ? 560 : 656 + Math.abs(t) * 14;
    const rotation = selected ? 0 : t * 12;
    const scale = selected ? 1.12 : 1;
    return cardMarkup(
      card,
      index,
      `fan-card${selected ? " selected" : ""}`,
    ).replace(
      'data-index="' + index + '"',
      `data-index="${index}" style="transform:translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rotation}deg) scale(${scale})"`,
    );
  })
  .join("");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1240 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
});

try {
  await page.setContent(`<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Card Trial five-card art validation</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #090b12; color: #eee8d5; font-family: monospace; }
      body { padding: 24px; }
      h1, h2, p { margin: 0 0 12px; }
      h1 { font-size: 20px; }
      h2 { color: #d8c27a; font-size: 15px; margin-top: 24px; }
      p { color: #aeb4c5; font-size: 12px; }
      .panel { width: max-content; max-width: 100%; padding: 14px; border: 1px solid #34394a; background: #111521; }
      .native-fields { display: flex; gap: 8px; }
      .native-field { width: 128px; }
      .native-field img { display: block; width: 128px; height: 96px; image-rendering: pixelated; }
      .native-field span { display: block; margin-top: 5px; font-size: 10px; color: #c8cad3; }
      .flat-cards { display: flex; gap: 8px; align-items: flex-start; }
      .card {
        position: relative;
        width: 132px;
        height: 184px;
        overflow: hidden;
        border: 2px solid #c8d0f0;
        border-radius: 8px;
        background: linear-gradient(#283874, #15204f);
        color: #fff8dc;
        box-shadow: 0 5px 12px #000a;
      }
      .art { position: absolute; left: 0; top: 0; width: 128px; height: 96px; object-fit: none; image-rendering: pixelated; }
      .art-shade { position: absolute; inset: 0 0 auto; height: 30px; background: linear-gradient(#05070db8, transparent); }
      .name { position: absolute; left: 6px; top: 5px; width: 104px; font-size: 11px; font-weight: 700; line-height: 1.05; text-shadow: 0 1px #000; }
      .cost { position: absolute; right: 6px; top: 4px; color: #ffe08a; font-size: 14px; font-weight: 700; text-shadow: 0 1px #000; }
      .rules { position: absolute; left: 7px; right: 7px; top: 103px; font-size: 10px; line-height: 1.25; }
      .consume { position: absolute; left: 7px; right: 7px; bottom: 7px; color: #e8a84a; font-size: 9px; }
      .game-stage { position: relative; width: 768px; height: 672px; overflow: hidden; background: linear-gradient(#131727 58%, #211d22); }
      .game-stage::before { content: "Actual 768×672 design space — Tide selected"; position: absolute; left: 10px; top: 9px; color: #8f96a8; font-size: 10px; }
      .fan-card { position: absolute; left: 0; top: 0; transform-origin: center; }
      .fan-card.selected { border-color: #ffe08a; box-shadow: 0 6px 16px #000b, 0 0 0 2px #ffe08a; z-index: 20; }
    </style>
  </head>
  <body>
    <h1>Card Trial — five-card illustration validation</h1>
    <p>128×96 native art; 132×184 cards; browser scale and device pixel ratio both 1.</p>
    <h2>Native art fields at 1×</h2>
    <section class="panel native-fields">
      ${cards.map((card) => `<div class="native-field"><img src="${card.src}" alt="${card.name}"><span>${card.name}</span></div>`).join("")}
    </section>
    <h2>Full cards at gameplay dimensions</h2>
    <section class="panel flat-cards">${flatCards}</section>
    <h2>Five-card hand using the closest-current Gate A fan geometry</h2>
    <section class="panel"><div class="game-stage">${fanCards}</div></section>
  </body>
  </html>`, { waitUntil: "load" });

  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  const imageFacts = await page.evaluate(() => [...document.querySelectorAll(".native-field img")].map((image) => ({
    alt: image.alt,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    renderedWidth: image.getBoundingClientRect().width,
    renderedHeight: image.getBoundingClientRect().height,
  })));
  if (imageFacts.length !== 5) throw new Error(`Expected five native fields, got ${imageFacts.length}`);
  for (const fact of imageFacts) {
    if (fact.naturalWidth !== 128 || fact.naturalHeight !== 96) {
      throw new Error(`${fact.alt}: expected 128×96 source, got ${fact.naturalWidth}×${fact.naturalHeight}`);
    }
    if (fact.renderedWidth !== 128 || fact.renderedHeight !== 96) {
      throw new Error(`${fact.alt}: native field is not rendered at 1×`);
    }
  }

  await page.screenshot({ path: path.join(OUT, "five-card-review.png"), fullPage: true });
  await page.locator(".native-fields").screenshot({ path: path.join(OUT, "native-fields-1x.png") });
  await page.locator(".flat-cards").screenshot({ path: path.join(OUT, "cards-132x184.png") });
  await page.locator(".game-stage").screenshot({ path: path.join(OUT, "five-card-hand.png") });
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    baseUrl: ROOT,
    imageFacts,
    cardDimensions: { width: 132, height: 184 },
    designStage: { width: 768, height: 672 },
    errors,
  }, null, 2));
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}
console.log(`Card Trial five-card art fixture passed; evidence: ${OUT}`);
console.log("page errors []");
