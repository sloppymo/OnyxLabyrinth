// Renderer 2 local-Z traversal proof. The portable floor exists only in
// localStorage and exercises single/multi-cell ramps, local stairs, turning on
// a connector, a high landing prop, and a tall destination room.
import { writeFileSync } from "node:fs";
import { boot, ensureOutDir, jumpTo, launch, shot, wait, waitForIdle } from "./lib.mjs";

const URL = process.env.MAZE_VERTICAL_URL ??
  "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1&mazeRenderer=webgl&mazePerf=1&playtestFloor=1";
const OUT = ensureOutDir(
  process.env.MAZE_VERTICAL_OUT ??
    "playtest-screenshots/maze-renderer-2/vertical-traversal"
);

const cell = () => ({ n: "wall", e: "wall", s: "wall", w: "wall" });

function makeDemoMap() {
  const width = 10;
  const height = 13;
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, cell)
  );
  const air = new Set();
  for (let x = 1; x <= 7; x++) air.add(`${x},2`);
  for (let x = 1; x <= 2; x++) air.add(`${x},6`);
  for (let y = 4; y <= 8; y++) for (let x = 3; x <= 6; x++) air.add(`${x},${y}`);
  for (let x = 1; x <= 5; x++) air.add(`${x},10`);
  const directions = [
    ["n", 0, -1, "s"],
    ["e", 1, 0, "w"],
    ["s", 0, 1, "n"],
    ["w", -1, 0, "e"],
  ];
  for (const key of air) {
    const [x, y] = key.split(",").map(Number);
    for (const [dir, dx, dy, opposite] of directions) {
      if (!air.has(`${x + dx},${y + dy}`)) continue;
      grid[y][x][dir] = "open";
      grid[y + dy][x + dx][opposite] = "open";
    }
  }
  return {
    formatVersion: 1,
    id: 92,
    name: "Renderer 2 Vertical Traversal Laboratory",
    width,
    height,
    startX: 1,
    startY: 6,
    encounterRate: 0,
    tilesetTheme: "f1",
    heightZones: [
      { id: "single-connector-air", x1: 2, y1: 6, x2: 2, y2: 6, ceilingZ: 2 },
      { id: "tall-high-room", x1: 3, y1: 4, x2: 6, y2: 8, floorZ: 1, ceilingZ: 3 },
      { id: "gradual-air", x1: 2, y1: 2, x2: 5, y2: 2, ceilingZ: 2 },
      { id: "gradual-quarter", x1: 3, y1: 2, x2: 3, y2: 2, floorZ: 0.25 },
      { id: "gradual-half", x1: 4, y1: 2, x2: 4, y2: 2, floorZ: 0.5 },
      { id: "gradual-three-quarter", x1: 5, y1: 2, x2: 5, y2: 2, floorZ: 0.75 },
      { id: "gradual-high", x1: 6, y1: 2, x2: 7, y2: 2, floorZ: 1, ceilingZ: 3 },
      { id: "stair-air", x1: 2, y1: 10, x2: 2, y2: 10, ceilingZ: 2 },
      { id: "stair-high", x1: 3, y1: 10, x2: 5, y2: 10, floorZ: 1, ceilingZ: 2.5 },
    ],
    ramps: [
      { x: 2, y: 6, dir: "e", surface: "ramp" },
      { x: 2, y: 2, dir: "e", surface: "ramp" },
      { x: 3, y: 2, dir: "e", surface: "ramp" },
      { x: 4, y: 2, dir: "e", surface: "ramp" },
      { x: 5, y: 2, dir: "e", surface: "ramp" },
      { x: 2, y: 10, dir: "e", surface: "stairs" },
    ],
    mapSprites: [{ x: 5, y: 6, spriteId: "crate" }],
    ceilingFeatures: [{ x: 4, y: 5, spriteId: "f1-ceiling-grate" }],
    ceilingSprites: [{ x: 4, y: 6, spriteId: "f1-chain-long", scale: 1 }],
    grid,
  };
}

const map = makeDemoMap();
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const captures = [];
const checkpoints = [];

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))] ?? 0;
}

function summarize(values) {
  return {
    count: values.length,
    median: Number(percentile(values, 0.5).toFixed(3)),
    p95: Number(percentile(values, 0.95).toFixed(3)),
  };
}

async function browserInfo() {
  return page.evaluate(() => {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    const vendor = extension
      ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
      : null;
    const renderer = extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : null;
    const gpuText = `${vendor ?? ""} ${renderer ?? ""}`.toLowerCase();
    const view = document.querySelector("#view");
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      webgl2: !!gl,
      gpuVendor: vendor,
      gpuRenderer: renderer,
      likelySoftwareRendering:
        /swiftshader|llvmpipe|software|microsoft basic render/.test(gpuText),
      canvas: view ? { width: view.width, height: view.height } : null,
    };
  });
}

async function animationFrames(count) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

async function capture(name, settleMs = 280) {
  await wait(settleMs);
  captures.push(await shot(page, OUT, `${name}.png`));
  checkpoints.push({
    name,
    state: await page.evaluate(() => window.__onyxDebug.snapshot()),
    renderer: await page.evaluate(() => window.__onyxDebug.mazeRendererInfo()),
  });
}

async function press(key, settle = true) {
  await page.keyboard.press(key);
  if (settle) await waitForIdle(page, 3000);
}

try {
  await page.addInitScript((floorMap) => {
    localStorage.setItem("onyx-floor-playtest", JSON.stringify(floorMap));
  }, map);
  await boot(page, URL, {
    scenario: { floorId: 92, x: 1, y: 6, facing: 1, autosave: false },
  });
  await capture("01-ramp-bottom-looking-up");
  await page.keyboard.press("ArrowUp");
  await wait(75);
  await capture("02-ramp-in-motion", 20);
  await waitForIdle(page, 3000);
  await capture("03-ramp-center");
  await press("ArrowLeft");
  await capture("04-ramp-center-turned");
  await press("ArrowRight");
  await press("ArrowUp");
  await press("ArrowRight");
  await press("ArrowRight");
  await capture("05-ramp-top-looking-down");
  await press("ArrowLeft");
  await press("ArrowLeft");
  await capture("06-tall-room-and-high-prop");

  await jumpTo(page, { floorId: 92, x: 1, y: 2, facing: 1, autosave: false });
  await capture("07-gradual-ramp-bottom");
  await press("ArrowUp");
  await press("ArrowUp");
  await press("ArrowUp");
  await capture("08-gradual-ramp-midpoint");
  await press("ArrowUp");
  await press("ArrowUp");
  await press("ArrowRight");
  await press("ArrowRight");
  await capture("09-gradual-ramp-top-looking-down");

  await jumpTo(page, { floorId: 92, x: 1, y: 10, facing: 1, autosave: false });
  await capture("10-stairs-bottom");
  await press("ArrowUp");
  await capture("11-stairs-center");
  await press("ArrowUp");
  await press("ArrowRight");
  await press("ArrowRight");
  await capture("12-stairs-top-looking-down");

  const performanceScenes = [];
  for (const pose of [
    { id: "single-ramp", x: 1, y: 6, facing: 1 },
    { id: "gradual-ramp", x: 1, y: 2, facing: 1 },
    { id: "local-stairs", x: 1, y: 10, facing: 1 },
    { id: "high-room", x: 3, y: 6, facing: 1 },
  ]) {
    await jumpTo(page, { floorId: 92, ...pose, autosave: false });
    await animationFrames(30);
    await page.evaluate(() => window.__onyxDebug.mazeRendererPerformance.reset());
    await animationFrames(90);
    const sampled = await page.evaluate(() => ({
      samples: window.__onyxDebug.mazeRendererPerformance.snapshot().samples.slice(-90),
      renderer: window.__onyxDebug.mazeRendererInfo(),
    }));
    performanceScenes.push({
      id: pose.id,
      totalMs: summarize(sampled.samples.map((entry) => entry.totalMs)),
      drawCalls: sampled.renderer.statistics.drawCalls,
      triangles: sampled.renderer.statistics.triangles,
    });
  }

  const lifecycle = [];
  const readLifecycle = async (label) => {
    await wait(180);
    lifecycle.push({
      label,
      ...(await page.evaluate(() => window.__onyxDebug.mazeRendererInfo())),
    });
  };
  await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
  await readLifecycle("warm-floor-1");
  await jumpTo(page, { floorId: 92, x: 1, y: 6, facing: 1, autosave: false });
  await readLifecycle("baseline-ramp-floor");
  const lifecycleBaseline = lifecycle.at(-1).statistics;
  for (let cycle = 1; cycle <= 10; cycle++) {
    await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
    await readLifecycle(`cycle-${cycle}-floor-1`);
    await jumpTo(page, { floorId: 92, x: 1, y: 6, facing: 1, autosave: false });
    await readLifecycle(`cycle-${cycle}-ramp-floor`);
  }
  const lifecycleFinal = lifecycle.at(-1).statistics;
  const lifecyclePass =
    lifecycleFinal.textures === lifecycleBaseline.textures &&
    lifecycleFinal.geometries === lifecycleBaseline.geometries;

  const result = await page.evaluate(() => ({
    renderer: window.__onyxDebug.mazeRendererInfo(),
    performance: window.__onyxDebug.mazeRendererPerformance.snapshot(),
  }));
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    url: URL,
    floor: map,
    captures,
    checkpoints,
    performanceScenes,
    lifecycle: {
      readings: lifecycle,
      baseline: lifecycleBaseline,
      final: lifecycleFinal,
      pass: lifecyclePass,
    },
    renderer: result.renderer,
    browser: await browserInfo(),
    sampleCount: result.performance.samples.length,
    browserErrors: errors,
    pass: errors.length === 0 && result.renderer.active === "webgl" &&
      result.renderer.statistics?.triangles > 0 &&
      checkpoints.some((entry) => entry.renderer.statistics?.debugPosition?.surface === "ramp") &&
      checkpoints.some((entry) => entry.renderer.statistics?.debugPosition?.surface === "stairs") &&
      lifecyclePass,
  };
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    pass: report.pass,
    output: OUT,
    captures,
    renderer: report.renderer,
    performanceScenes,
    lifecycle: { pass: lifecyclePass, baseline: lifecycleBaseline, final: lifecycleFinal },
    browserErrors: errors,
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}
