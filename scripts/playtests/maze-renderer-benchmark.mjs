#!/usr/bin/env node
/**
 * Reproducible maze-renderer CPU/frame-pacing benchmark.
 *
 * Run against a production preview. Output belongs in the gitignored
 * playtest-screenshots tree unless ONYX_MAZE_BENCH_OUT says otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  boot,
  ensureOutDir,
  jumpTo,
  launch,
  shot,
  wait,
  waitForIdle,
} from "./lib.mjs";

const URL =
  process.env.ONYX_MAZE_BENCH_URL ??
  "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1&mazePerf=1&mazeRenderer=canvas";
const OUT = ensureOutDir(
  path.resolve(
    process.env.ONYX_MAZE_BENCH_OUT ??
      "playtest-screenshots/maze-renderer-2/benchmark"
  )
);
const VIEWPORT = { width: 1280, height: 800 };
const WARMUP_FRAMES = Number(process.env.ONYX_MAZE_BENCH_WARMUP ?? 60);
const SAMPLE_FRAMES = Number(process.env.ONYX_MAZE_BENCH_FRAMES ?? 180);
const corridorPoses = JSON.parse(
  fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8")
)["1"];

const staticScenes = [
  { id: "floor1-straight", floorId: 1, ...corridorPoses.straight },
  { id: "floor1-side-passage", floorId: 1, ...corridorPoses.sidePassage },
  { id: "floor1-front-wall", floorId: 1, ...corridorPoses.frontWall },
  { id: "floor1-door", floorId: 1, ...corridorPoses.door },
  { id: "isobel-hero", floorId: 1, x: 16, y: 28, facing: 1 },
  { id: "camp", floorId: 1, x: 25, y: 12, facing: 1 },
  { id: "hot-bois", floorId: 1, x: 20, y: 25, facing: 2 },
  { id: "namanda", floorId: 1, x: 10, y: 4, facing: 0 },
];

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * quantile))
  );
  return sorted[index];
}

function summarize(values) {
  return {
    count: values.length,
    median: Number(percentile(values, 0.5).toFixed(3)),
    p95: Number(percentile(values, 0.95).toFixed(3)),
    p99: Number(percentile(values, 0.99).toFixed(3)),
    max: Number((values.length ? Math.max(...values) : 0).toFixed(3)),
  };
}

async function animationFrames(page, count) {
  return page.evaluate(async (frameCount) => {
    const intervals = [];
    let previous = null;
    for (let i = 0; i < frameCount; i++) {
      const timestamp = await new Promise((resolve) => requestAnimationFrame(resolve));
      if (previous !== null) intervals.push(timestamp - previous);
      previous = timestamp;
    }
    return intervals;
  }, count);
}

async function resetProfiler(page) {
  await page.evaluate(() => window.__onyxDebug.mazeRendererPerformance.reset());
}

async function sample(page, backend, id, drive) {
  await animationFrames(page, WARMUP_FRAMES);
  await resetProfiler(page);
  const heapBefore = await page.evaluate(
    () => performance.memory?.usedJSHeapSize ?? null
  );

  let intervals;
  if (drive) {
    const intervalPromise = animationFrames(page, SAMPLE_FRAMES);
    await drive();
    intervals = await intervalPromise;
  } else {
    intervals = await animationFrames(page, SAMPLE_FRAMES);
  }

  const heapAfter = await page.evaluate(
    () => performance.memory?.usedJSHeapSize ?? null
  );
  const perf = await page.evaluate(() =>
    window.__onyxDebug.mazeRendererPerformance.snapshot()
  );
  const samples = perf.samples.slice(-SAMPLE_FRAMES);
  const sectionNames = [
    "totalMs",
    "cameraMs",
    "floorCeilingCpuMs",
    "putImageDataMs",
    "raycastMs",
    "wallsMs",
    "billboardsMs",
    "postprocessMs",
  ];
  const timings = Object.fromEntries(
    sectionNames.map((name) => [name, summarize(samples.map((entry) => entry[name]))])
  );
  const longFrames = intervals.filter((ms) => ms > 25).length;
  const renderer = await page.evaluate(() => window.__onyxDebug.mazeRendererInfo());
  const screenshot = await shot(page, OUT, `${backend}-${id}.png`);
  return {
    id,
    sampleFrames: samples.length,
    timings,
    framePacing: {
      ...summarize(intervals),
      framesOver25Ms: longFrames,
      framesOver50Ms: intervals.filter((ms) => ms > 50).length,
    },
    heap: {
      before: heapBefore,
      after: heapAfter,
      delta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null,
    },
    rendererStatistics: renderer.statistics,
    screenshot: path.relative(process.cwd(), screenshot),
  };
}

async function browserInfo(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    let vendor = null;
    let renderer = null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    }
    const text = `${vendor ?? ""} ${renderer ?? ""}`.toLowerCase();
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
      webgl2: !!gl,
      gpuVendor: vendor,
      gpuRenderer: renderer,
      likelySoftwareRendering:
        /swiftshader|llvmpipe|software|microsoft basic render/.test(text),
      canvas: (() => {
        const view = document.querySelector("#view");
        return view ? { width: view.width, height: view.height } : null;
      })(),
    };
  });
}

async function main() {
  const { browser, page, errors } = await launch({ viewport: VIEWPORT });
  const results = [];
  try {
    await boot(page, URL, { scenario: staticScenes[0] });
    await page.evaluate(() => {
      window.__onyxDebug.state.floor.encounterRate = 0;
      window.__onyxDebug.mazeRendererPerformance.setEnabled(true);
    });
    const backend = await page.evaluate(
      () => window.__onyxDebug.mazeRendererInfo().active
    );

    for (const scene of staticScenes) {
      await jumpTo(page, { ...scene, autosave: false });
      await waitForIdle(page, 5000);
      results.push(await sample(page, backend, scene.id));
      console.log(
        `${scene.id.padEnd(24)} median=${results.at(-1).timings.totalMs.median}ms ` +
          `p95=${results.at(-1).timings.totalMs.p95}ms`
      );
    }

    const darkness = await page.evaluate(() => {
      const floor = window.__onyxDebug.findFloor(1);
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          if (floor.grid[y][x].tile === "darkness") return { x, y };
        }
      }
      throw new Error("Floor 1 has no darkness fixture");
    });
    await jumpTo(page, { floorId: 1, ...darkness, facing: 0, autosave: false });
    await waitForIdle(page, 5000);
    results.push(await sample(page, backend, "darkness"));

    await jumpTo(page, { floorId: 1, x: 16, y: 29, facing: 0, autosave: false });
    await waitForIdle(page, 5000);
    results.push(
      await sample(page, backend, "isobel-walking", async () => {
        const keys = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"];
        for (let cycle = 0; cycle < 4; cycle++) {
          for (const key of keys) {
            await page.keyboard.press(key);
            await wait(170);
          }
        }
      })
    );

    await jumpTo(page, { floorId: 1, ...corridorPoses.straight, autosave: false });
    await page.evaluate(() => window.__onyxDebug.startCombat());
    await wait(350);
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
    await waitForIdle(page, 5000);
    results.push(await sample(page, backend, "combat-return"));

    const info = await browserInfo(page);
    const report = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      git: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      backend,
      url: URL,
      methodology: {
        warmupFrames: WARMUP_FRAMES,
        sampleFrames: SAMPLE_FRAMES,
        productionBuild: true,
        profiler:
          "opt-in in-render section timing; disabled in ordinary play; frame pacing sampled independently with requestAnimationFrame",
        caveat: info.likelySoftwareRendering
          ? "Headless browser reports likely software rendering. Treat frame pacing as diagnostic only, not a hardware GPU claim."
          : "Browser reports hardware rendering; results remain local-machine evidence, not a universal FPS guarantee.",
      },
      browser: info,
      results,
      browserErrors: errors,
    };
    fs.writeFileSync(
      path.join(OUT, backend === "canvas" ? "canvas-baseline.json" : "webgl-benchmark.json"),
      `${JSON.stringify(report, null, 2)}\n`
    );
    console.log(
      `wrote ${path.join(OUT, backend === "canvas" ? "canvas-baseline.json" : "webgl-benchmark.json")}`
    );
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
