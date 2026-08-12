/**
 * One-off verification: confirm the replacement chest-closed/chest-open art
 * renders correctly in the actual corridor at the treasure tile that
 * prompted the "terrible vector treasure chest" fix.
 *
 * Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
 */
import { launch, wait, jumpTo, shot, ensureOutDir } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-08-12-chest-verify");

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);

const views = [
  { name: "adjacent-18-2", opts: { floorId: 1, x: 18, y: 3, facing: 0 } },
  { name: "two-tiles-18-2", opts: { floorId: 1, x: 18, y: 4, facing: 0 } },
  { name: "east-approach-19-2", opts: { floorId: 1, x: 19, y: 2, facing: 3 } },
];

for (const v of views) {
  await jumpTo(page, v.opts);
  await wait(300);
  const out = await shot(page, OUT, `${v.name}.png`);
  console.log(`wrote ${out}`);
}

// Force the (18,2) treasure looted so the corridor draws chest-open instead.
await jumpTo(page, { floorId: 1, x: 18, y: 3, facing: 0 });
await page.evaluate(() => {
  const dbg = window.__onyxDebug;
  const t = dbg.state.floor.treasures?.find((tr) => tr.x === 18 && tr.y === 2);
  if (t) t.itemIds = [];
});
await wait(300);
console.log(`wrote ${await shot(page, OUT, "looted-adjacent-18-2.png")}`);

console.log(`console/page errors: ${errors.length}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
