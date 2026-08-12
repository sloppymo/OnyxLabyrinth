/**
 * One-off verification: confirm the replacement torch, crate, and barrel
 * decor sprites render correctly in the actual Floor 1 corridor from adjacent
 * and opposite approach directions.
 *
 * The coordinates are real `mapSprites` placements in
 * `src/content/floors/floor-1.json`; each target has open edges on the
 * approach sides used below.
 *
 * Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
 */
import { launch, wait, jumpTo, shot, ensureOutDir } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-08-12-basic-decor-verify");

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);

const views = [
  { name: "torch-north-10-24", opts: { floorId: 1, x: 10, y: 23, facing: 2 } },
  { name: "torch-west-10-24", opts: { floorId: 1, x: 9, y: 24, facing: 1 } },
  { name: "crate-north-16-8", opts: { floorId: 1, x: 16, y: 7, facing: 2 } },
  { name: "crate-east-16-8", opts: { floorId: 1, x: 17, y: 8, facing: 3 } },
  { name: "barrel-south-24-18", opts: { floorId: 1, x: 24, y: 19, facing: 0 } },
  { name: "barrel-west-24-18", opts: { floorId: 1, x: 23, y: 18, facing: 1 } },
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
