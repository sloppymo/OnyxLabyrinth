/**
 * One-off verification: confirm the replacement cistern-basin art renders
 * correctly in the actual corridor at the water tile that produced the
 * original "ugly placeholder" bug report. Not part of any suite.
 *
 * Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
 */
import { launch, wait, jumpTo, shot, ensureOutDir } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-08-11-cistern-basin-verify");

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);

const views = [
  { name: "adjacent-19-15", opts: { floorId: 1, x: 18, y: 15, facing: 1 } },
  { name: "two-tiles-19-15", opts: { floorId: 1, x: 17, y: 15, facing: 1 } },
  { name: "junction-17-20", opts: { floorId: 1, x: 18, y: 20, facing: 3 } },
];

for (const v of views) {
  await jumpTo(page, v.opts);
  await wait(300);
  const out = await shot(page, OUT, `${v.name}.png`);
  console.log(`wrote ${out}`);
}

console.log(`console/page errors: ${errors.length}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
