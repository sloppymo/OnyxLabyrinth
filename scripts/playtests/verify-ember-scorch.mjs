/**
 * One-off verification: confirm the replacement `ember-scorch` wall decal
 * renders correctly on the F1 Flooded Crypt east wall at (26,6) from the
 * front and one tile back.
 *
 * Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
 */
import { launch, wait, jumpTo, shot, ensureOutDir } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-08-12-ember-scorch-verify");

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);

const views = [
  { name: "front-26-6", opts: { floorId: 1, x: 26, y: 6, facing: 1 } },
  { name: "adjacent-25-6", opts: { floorId: 1, x: 25, y: 6, facing: 1 } },
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
