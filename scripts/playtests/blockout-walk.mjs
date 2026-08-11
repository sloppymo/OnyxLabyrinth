// Blockout composition walk: captures the widened hall reveal + gate closeup
// without performance profiling, so it works against a plain dev server.
import { writeFileSync } from "node:fs";
import { boot, ensureOutDir, jumpTo, launch, shot, wait, waitForIdle } from "./lib.mjs";
import { makeLevel2SliceMap, LEVEL2_SLICE_ID } from "./level2-slice-map.mjs";

const URL = process.env.BLOCKOUT_URL ??
  "http://127.0.0.1:5173/?debug=1&mazeRenderer=webgl&playtestFloor=1";
const OUT = ensureOutDir(
  process.env.BLOCKOUT_OUT ?? "playtest-screenshots/level2-slice/blockout-1"
);

const F = LEVEL2_SLICE_ID;

const POSES = [
  { id: "07-hall-approach", x: 9, y: 7, facing: 2 },
  { id: "08-hall-threshold", x: 10, y: 8, facing: 2 },
  { id: "09-hall-hero", x: 10, y: 9, facing: 2 },
  { id: "10-hall-corner", x: 9, y: 9, facing: 1 },
  { id: "11b-gate-closeup", x: 10, y: 11, facing: 2 },
  // Context views
  { id: "06-gallery-top", x: 6, y: 5, facing: 1 },
  { id: "01-cramped-approach", x: 1, y: 10, facing: 1 },
];

const map = makeLevel2SliceMap({ theme: "descent" });
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const captures = [];

try {
  await page.addInitScript((floorMap) => {
    localStorage.setItem("onyx-floor-playtest", JSON.stringify(floorMap));
  }, map);
  await boot(page, URL, { scenario: { floorId: F, x: 1, y: 10, facing: 1, autosave: false } });

  for (const pose of POSES) {
    await jumpTo(page, { floorId: F, x: pose.x, y: pose.y, facing: pose.facing, autosave: false });
    await waitForIdle(page, 4000);
    await wait(200);
    const p = await shot(page, OUT, `${pose.id}.png`);
    captures.push(p);
    console.log(`  ${pose.id} -> ${p}`);
  }

  writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify({ captures, browserErrors: errors }, null, 2)
  );
  console.log(JSON.stringify({ captures: captures.length, errors }, null, 2));
} finally {
  await browser.close();
}
