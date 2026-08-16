/**
 * Dungeon lighting pass — fixed-pose before/after capture for BOTH maze
 * renderer backends (Canvas raycaster and WebGL/Three.js).
 *
 * Reuses the pinned poses from `corridor-poses.json` plus lighting-specific
 * poses (torch prop, regional theme, distant unlit corridor), captures the
 * active maze surface (#view or #maze-webgl) at each pose, and computes the
 * same numeric probes as corridor-baseline-capture.mjs so before/after claims
 * are backed by numbers.
 *
 * Usage:
 *   node scripts/playtests/lighting-pass-capture.mjs <label>
 * writes to playtest-screenshots/2026-08-15-lighting-<label>/ with one
 * subrun per backend (canvas / webgl).
 *
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is running)
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, snap, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const LABEL = process.argv[2] ?? "run";
const BASE_URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(`playtest-screenshots/2026-08-15-lighting-${LABEL}`);
const PINNED = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));

/** Pose list covering the lighting-pass checklist. */
const POSES = [
  { name: "f1-straight", floorId: 1, ...PINNED["1"].straight },
  { name: "f1-sidePassage", floorId: 1, ...PINNED["1"].sidePassage },
  { name: "f1-frontWall", floorId: 1, ...PINNED["1"].frontWall },
  { name: "f1-darkness", floorId: 1, ...PINNED["1"].darkness },
  { name: "f1-gate", floorId: 1, ...PINNED["1"].door },
  { name: "f1-treasure", floorId: 1, ...PINNED["1"].treasure },
  { name: "f1-npc", floorId: 1, ...PINNED["1"].npc },
  { name: "f1-teleporter", floorId: 1, ...PINNED["1"].teleporter },
  // Regional theme + distant unlit corridor on floor 2.
  { name: "f2-straight-distant", floorId: 2, ...PINNED["2"].straight },
  { name: "f2-gate", floorId: 2, ...PINNED["2"].door },
  { name: "f2-darkness", floorId: 2, ...PINNED["2"].darkness },
  // Torch prop poses: floor 2 ships torches at (2,2) and (11,11).
  { name: "f2-torch", floorId: 2, x: 2, y: 4, facing: 0 },
  { name: "f2-torch-b", floorId: 2, x: 11, y: 9, facing: 2 },
  // Second theme sanity view.
  { name: "f3-straight", floorId: 3, ...PINNED["3"].straight },
  { name: "f3-stairs", floorId: 3, ...PINNED["3"].stairs_down },
];

/**
 * Probe the active maze surface. WebGL buffers can't be read back with
 * getImageData (preserveDrawingBuffer: false), so both backends are probed
 * from an element screenshot decoded back inside the page — identical method
 * for before/after and across backends.
 */
async function probeFromScreenshot(page, pngBuffer) {
  const b64 = pngBuffer.toString("base64");
  return page.evaluate(async (data) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:image/png;base64,${data}`;
    });
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data: d } = ctx.getImageData(0, 0, cv.width, cv.height);
    const W = cv.width, H = cv.height;
    const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const hist = new Float64Array(256);
    let sumL = 0, sumR = 0, sumG = 0, sumB = 0, sumC = 0;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const L = luma(r, g, b);
      sumL += L; sumR += r; sumG += g; sumB += b;
      sumC += Math.max(r, g, b) - Math.min(r, g, b);
      hist[Math.min(255, L | 0)]++;
      colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    const N = (d.length / 4) | 0;
    const pct = (p) => {
      let acc = 0;
      const want = N * p;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= want) return i; }
      return 255;
    };
    // Per-row mean luminance over the centre 40% of columns (depth cue curve).
    const x0 = Math.floor(W * 0.3), x1 = Math.floor(W * 0.7);
    const rows = [];
    for (let y = 0; y < H; y += 4) {
      let acc = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        acc += luma(d[i], d[i + 1], d[i + 2]);
      }
      rows.push(+(acc / (x1 - x0)).toFixed(2));
    }
    const mR = sumR / N, mG = sumG / N, mB = sumB / N;
    return {
      w: W, h: H,
      meanLuma: +(sumL / N).toFixed(2),
      p05: pct(0.05), p50: pct(0.5), p95: pct(0.95),
      meanRGB: [+mR.toFixed(1), +mG.toFixed(1), +mB.toFixed(1)],
      meanChroma: +(sumC / N).toFixed(2),
      uniqueColours: colours.size,
      rowLumaEvery4: rows,
    };
  }, b64);
}

async function captureBackend(backend) {
  const url = `${BASE_URL}&mazeRenderer=${backend}`;
  const outDir = ensureOutDir(path.join(OUT, backend));
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);

  const info = await page.evaluate(() => window.__onyxDebug.mazeRendererInfo());
  const results = [];
  for (const pose of POSES) {
    await jumpTo(page, {
      floorId: pose.floorId, x: pose.x, y: pose.y, facing: pose.facing, autosave: false,
    });
    await waitForIdle(page, 5000);
    await wait(250);
    const st = await snap(page);
    const selector = backend === "webgl" ? "#maze-webgl" : "#view";
    const el = await page.$(selector);
    if (!el) throw new Error(`no ${selector} element for backend ${backend}`);
    const png = await el.screenshot({ path: path.join(outDir, `${pose.name}.png`) });
    const probe = await probeFromScreenshot(page, png);
    results.push({
      name: pose.name,
      at: { floorId: pose.floorId, x: pose.x, y: pose.y, facing: pose.facing },
      actual: { x: st.player?.x, y: st.player?.y, facing: st.player?.facing, floor: st.floor?.id },
      inDarkness: st.flags?.inDarkness ?? null,
      probe,
    });
    console.log(
      `[${backend}] ${pose.name.padEnd(22)} L=${String(probe.meanLuma).padStart(6)} ` +
      `p50=${String(probe.p50).padStart(3)} p95=${String(probe.p95).padStart(3)} ` +
      `chroma=${String(probe.meanChroma).padStart(5)} colours=${probe.uniqueColours}`
    );
  }
  const readiness = await page.evaluate(() => window.__onyxDebug.readiness());
  fs.writeFileSync(
    path.join(outDir, "probes.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), backend, info, readiness, errors, results }, null, 2)
  );
  if (errors.length) console.log(`[${backend}] browser errors:`, errors.slice(0, 10));
  await browser.close();
  return { backend, info, errorCount: errors.length };
}

const summary = [];
for (const backend of ["canvas", "webgl"]) {
  summary.push(await captureBackend(backend));
}
console.log("\nDone:", JSON.stringify(summary, null, 2));
console.log("Output:", OUT);
