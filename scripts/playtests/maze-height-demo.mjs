// Renderer 2 variable-height proof. Builds a dev-only portable floor in
// localStorage, boots the actual game through ?playtestFloor=1, and captures
// low/tall transition views without changing campaign content.
import { writeFileSync } from "node:fs";
import { launch, boot, shot, ensureOutDir, wait } from "./lib.mjs";

const URL =
  process.env.MAZE_HEIGHT_URL ??
  "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1&mazeRenderer=webgl&mazePerf=1&playtestFloor=1";
const OUT = ensureOutDir(
  process.env.MAZE_HEIGHT_OUT ?? "playtest-screenshots/maze-renderer-2/height-demo"
);

function makeCell() {
  return { n: "wall", e: "wall", s: "wall", w: "wall" };
}

function makeDemoMap() {
  const width = 11;
  const height = 11;
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, makeCell)
  );
  const air = new Set();
  for (let x = 1; x <= 3; x++) air.add(`${x},5`);
  for (let y = 1; y <= 9; y++) for (let x = 4; x <= 6; x++) air.add(`${x},${y}`);
  for (let y = 1; y <= 9; y++) for (let x = 7; x <= 9; x++) air.add(`${x},${y}`);
  const dirs = [
    ["n", 0, -1, "s"],
    ["e", 1, 0, "w"],
    ["s", 0, 1, "n"],
    ["w", -1, 0, "e"],
  ];
  for (const key of air) {
    const [x, y] = key.split(",").map(Number);
    for (const [dir, dx, dy, opposite] of dirs) {
      if (!air.has(`${x + dx},${y + dy}`)) continue;
      grid[y][x][dir] = "open";
      grid[y + dy][x + dx][opposite] = "open";
    }
  }
  return {
    formatVersion: 1,
    id: 91,
    name: "Renderer 2 Height Laboratory",
    width,
    height,
    startX: 1,
    startY: 5,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "two-high", x1: 4, y1: 1, x2: 6, y2: 9, ceilingZ: 2 },
      { id: "three-high", x1: 7, y1: 1, x2: 9, y2: 9, ceilingZ: 3 },
    ],
    ceilingFeatures: [{ x: 5, y: 4, spriteId: "f1-ceiling-grate" }],
    ceilingSprites: [{ x: 8, y: 4, spriteId: "f1-chain-long", scale: 1 }],
    grid,
  };
}

const map = makeDemoMap();
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const captures = [];
try {
  await page.addInitScript((floorMap) => {
    localStorage.setItem("onyx-floor-playtest", JSON.stringify(floorMap));
  }, map);
  await boot(page, URL, {
    scenario: { floorId: 91, x: 1, y: 5, facing: 1, autosave: false },
  });
  await wait(400);
  captures.push(await shot(page, OUT, "01-low-looking-high.png"));

  for (const pose of [
    { name: "02-low-transition-close", x: 3, y: 5, facing: 1 },
    { name: "03-two-high", x: 5, y: 8, facing: 0 },
    { name: "04-three-high", x: 8, y: 8, facing: 0 },
    { name: "05-three-looking-low", x: 8, y: 5, facing: 3 },
  ]) {
    await page.evaluate((next) => {
      window.__onyxDebug.jumpTo({ floorId: 91, ...next });
    }, pose);
    await wait(300);
    captures.push(await shot(page, OUT, `${pose.name}.png`));
  }

  const result = await page.evaluate(() => ({
    renderer: window.__onyxDebug.mazeRendererInfo(),
    performance: window.__onyxDebug.mazeRendererPerformance.snapshot(),
    state: window.__onyxDebug.snapshot(),
  }));
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    url: URL,
    floor: map,
    captures,
    renderer: result.renderer,
    sampleCount: result.performance.samples.length,
    browserErrors: errors,
    pass:
      errors.length === 0 &&
      result.renderer.active === "webgl" &&
      result.renderer.statistics?.triangles > 0,
  };
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    pass: report.pass,
    output: OUT,
    captures,
    renderer: report.renderer,
    browserErrors: errors,
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}
