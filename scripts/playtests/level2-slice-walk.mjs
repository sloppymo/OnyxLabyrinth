// Level 2 vertical slice walkthrough: boots the slice map via the playtest
// localStorage route, captures the twelve required poses plus mid-motion
// frames, samples renderer performance per pose, and cycles Floor 1 <-> slice
// to watch resource lifecycles.
import { writeFileSync } from "node:fs";
import { boot, ensureOutDir, jumpTo, launch, shot, wait, waitForIdle } from "./lib.mjs";
import { makeLevel2SliceMap, LEVEL2_SLICE_ID } from "./level2-slice-map.mjs";

const URL = process.env.L2_WALK_URL ??
  "http://127.0.0.1:5190/OnyxLabyrinth/?debug=1&mazeRenderer=webgl&mazePerf=1&playtestFloor=1";
const OUT = ensureOutDir(
  process.env.L2_WALK_OUT ?? "playtest-screenshots/level2-slice/walk"
);
const THEME = process.env.L2_THEME ?? "f1";

const F = LEVEL2_SLICE_ID;
// facing: 0=n 1=e 2=s 3=w
const POSES = [
  { id: "01-cramped-approach", x: 1, y: 10, facing: 1 },
  { id: "02-seam-foreshadow", x: 3, y: 10, facing: 1 },
  { id: "02b-seam-glance-north", x: 4, y: 10, facing: 0 },
  { id: "03-threshold", x: 4, y: 10, facing: 1 },
  { id: "04-climb-bottom", x: 6, y: 10, facing: 0 },
  { id: "05-climb-mid", x: 6, y: 8, facing: 0 },
  { id: "06-gallery-top", x: 6, y: 5, facing: 1 },
  { id: "07-hall-reveal", x: 9, y: 5, facing: 2 },
  { id: "08-descent-mid", x: 9, y: 6, facing: 2 },
  { id: "09-hall-hero", x: 10, y: 9, facing: 2 },
  { id: "10-hall-corner", x: 8, y: 8, facing: 1 },
  { id: "11-low-to-high-return", x: 9, y: 9, facing: 0 },
  { id: "11b-gate-closeup", x: 10, y: 10, facing: 2 },
  { id: "12-chapel", x: 7, y: 9, facing: 0 },
  { id: "13-return-link", x: 7, y: 10, facing: 3 },
];

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;
}

const map = makeLevel2SliceMap({ theme: THEME });
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const captures = [];
const performanceScenes = [];

async function animationFrames(count) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
  }, count);
}

async function capture(name) {
  await waitForIdle(page, 4000);
  await wait(120);
  captures.push(await shot(page, OUT, `${name}.png`));
}

try {
  await page.addInitScript((floorMap) => {
    localStorage.setItem("onyx-floor-playtest", JSON.stringify(floorMap));
  }, map);
  await boot(page, URL, { scenario: { floorId: F, x: 1, y: 10, facing: 1, autosave: false } });
  await page.evaluate(() => window.__onyxDebug.mazeRendererPerformance.setEnabled(true));

  for (const pose of POSES) {
    await jumpTo(page, { floorId: F, x: pose.x, y: pose.y, facing: pose.facing, autosave: false });
    await capture(pose.id);
    await animationFrames(20);
    await page.evaluate(() => window.__onyxDebug.mazeRendererPerformance.reset());
    await animationFrames(60);
    const sampled = await page.evaluate(() => ({
      samples: window.__onyxDebug.mazeRendererPerformance.snapshot().samples.slice(-60),
      renderer: window.__onyxDebug.mazeRendererInfo(),
    }));
    const totals = sampled.samples.map((s) => s.totalMs);
    performanceScenes.push({
      id: pose.id,
      medianMs: Number(percentile(totals, 0.5).toFixed(3)),
      p95Ms: Number(percentile(totals, 0.95).toFixed(3)),
      drawCalls: sampled.renderer.statistics.drawCalls,
      triangles: sampled.renderer.statistics.triangles,
      surfaceZ: sampled.renderer.statistics.debugPosition?.surfaceZ,
      ceilingZ: sampled.renderer.statistics.debugPosition?.ceilingZ,
    });
  }

  // Mid-motion frame on the ramp climb: stand at the bottom, step, catch the tween.
  await jumpTo(page, { floorId: F, x: 6, y: 10, facing: 0, autosave: false });
  await waitForIdle(page, 4000);
  await page.keyboard.press("ArrowUp");
  await wait(90);
  captures.push(await shot(page, OUT, "05b-climb-in-motion.png"));

  // Lifecycle: Floor 1 <-> slice x10.
  const lifecycle = [];
  const read = async (label) => {
    await wait(180);
    lifecycle.push({
      label,
      ...(await page.evaluate(() => window.__onyxDebug.mazeRendererInfo())),
    });
  };
  await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
  await read("warm-floor-1");
  await jumpTo(page, { floorId: F, x: 1, y: 10, facing: 1, autosave: false });
  await read("warm-slice");
  await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
  await read("baseline-floor-1");
  for (let cycle = 1; cycle <= 10; cycle++) {
    await jumpTo(page, { floorId: F, x: 9, y: 9, facing: 2, autosave: false });
    await read(`cycle-${cycle}-slice`);
    await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
    await read(`cycle-${cycle}-floor-1`);
  }

  writeFileSync(
    `${OUT}/report.json`,
    JSON.stringify(
      {
        theme: THEME,
        url: URL,
        captures,
        performanceScenes,
        lifecycle,
        browserErrors: errors,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ captures: captures.length, performanceScenes, browserErrors: errors }, null, 2));
} finally {
  await browser.close();
}
