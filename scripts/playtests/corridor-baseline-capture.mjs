/**
 * Corridor art pass — baseline gallery + numeric probes.
 *
 * Captures the six-view rendering checklist plus special-tile views at the
 * pinned poses in `corridor-poses.json`, for all five campaign floors, and
 * reads the corridor canvas back with getImageData so every claim in the
 * art-direction plan is backed by a number rather than "it looked fine".
 *
 * Probes per view (computed on the raw 768x672 renderer output, not on a
 * CSS-scaled page screenshot):
 *   - mean/percentile luminance, mean chroma, dominant hue  -> floor identity
 *   - near-background pixel fraction                        -> "no black surfaces"
 *   - quantized unique-colour count                         -> palette density
 *   - squint contrast (16x downsample luma range)           -> instant readability
 *   - per-row mean luminance above/below the horizon        -> depth cue curves
 *
 * Writes PNGs + probes.json under playtest-screenshots/<date>-corridor-baseline/.
 *
 * Run: node scripts/playtests/corridor-baseline-capture.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is running)
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, snap, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

/**
 * Read the live corridor canvas and reduce it to scalar probes in-page.
 * Runs on the renderer's own bitmap, so CSS pixel-scaling and the DOM HUD
 * cannot contaminate any measurement.
 */
const probeCanvas = () =>
  page.evaluate(() => {
    const cv = document.querySelector("#view");
    const ctx = cv.getContext("2d");
    const { width: W, height: H } = cv;
    const d = ctx.getImageData(0, 0, W, H).data;

    const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const BG = { r: 14, g: 13, b: 10 }; // PALETTE.bg #0e0d0a
    const hist = new Float64Array(256);
    const colours = new Set();
    let sumL = 0, sumR = 0, sumG = 0, sumB = 0, sumC = 0;
    let nearBg = 0;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const L = luma(r, g, b);
      sumL += L; sumR += r; sumG += g; sumB += b;
      sumC += Math.max(r, g, b) - Math.min(r, g, b);
      hist[Math.min(255, L | 0)]++;
      colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      if (Math.abs(r - BG.r) <= 6 && Math.abs(g - BG.g) <= 6 && Math.abs(b - BG.b) <= 6) nearBg++;
    }
    const N = (d.length / 4) | 0;
    const pct = (p) => {
      let acc = 0;
      const want = N * p;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= want) return i; }
      return 255;
    };

    // Squint test: 16x box downsample, then luma spread of the small image.
    const BS = 16;
    const sw = Math.floor(W / BS), sh = Math.floor(H / BS);
    let smin = 255, smax = 0;
    for (let by = 0; by < sh; by++) {
      for (let bx = 0; bx < sw; bx++) {
        let acc = 0;
        for (let y = 0; y < BS; y++) {
          for (let x = 0; x < BS; x++) {
            const i = ((by * BS + y) * W + (bx * BS + x)) * 4;
            acc += luma(d[i], d[i + 1], d[i + 2]);
          }
        }
        const v = acc / (BS * BS);
        if (v < smin) smin = v;
        if (v > smax) smax = v;
      }
    }

    // Per-row mean luminance over the centre 40% of columns. Rows below the
    // horizon are floor, rows above are ceiling; screen row maps to distance
    // via rowDistance = halfH / |y - halfH|, so this is a depth curve.
    const x0 = Math.floor(W * 0.3), x1 = Math.floor(W * 0.7);
    const rows = [];
    for (let y = 0; y < H; y++) {
      let acc = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        acc += luma(d[i], d[i + 1], d[i + 2]);
      }
      rows.push(+(acc / (x1 - x0)).toFixed(2));
    }

    const mR = sumR / N, mG = sumG / N, mB = sumB / N;
    const mx = Math.max(mR, mG, mB), mn = Math.min(mR, mG, mB);
    let hue = 0;
    if (mx - mn > 0.5) {
      if (mx === mR) hue = 60 * (((mG - mB) / (mx - mn)) % 6);
      else if (mx === mG) hue = 60 * ((mB - mR) / (mx - mn) + 2);
      else hue = 60 * ((mR - mG) / (mx - mn) + 4);
      if (hue < 0) hue += 360;
    }

    return {
      w: W, h: H,
      meanLuma: +(sumL / N).toFixed(2),
      p05: pct(0.05), p50: pct(0.5), p95: pct(0.95),
      meanRGB: [+mR.toFixed(1), +mG.toFixed(1), +mB.toFixed(1)],
      meanChroma: +(sumC / N).toFixed(2),
      hueDeg: +hue.toFixed(1),
      nearBgFrac: +(nearBg / N).toFixed(4),
      uniqueColours: colours.size,
      squintMin: +smin.toFixed(2), squintMax: +smax.toFixed(2),
      squintRange: +(smax - smin).toFixed(2),
      rowLuma: rows,
    };
  });

const results = [];

for (const floorId of Object.keys(POSES)) {
  const floorPoses = POSES[floorId];
  for (const [poseName, pose] of Object.entries(floorPoses)) {
    if (!pose) continue;
    await jumpTo(page, {
      floorId: Number(floorId),
      x: pose.x,
      y: pose.y,
      facing: pose.facing,
      autosave: false,
    });
    await waitForIdle(page, 5000);
    // Two extra frames so the render camera has certainly painted this pose.
    await wait(200);

    const st = await snap(page);
    const name = `f${floorId}-${poseName}`;
    const el = await page.$("#view");
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    const probe = await probeCanvas();

    results.push({
      name, floorId: Number(floorId), pose: poseName,
      at: { x: pose.x, y: pose.y, facing: pose.facing },
      actual: { x: st.player?.x, y: st.player?.y, facing: st.player?.facing, floor: st.floor?.id },
      tile: pose.tile ?? null,
      inDarkness: st.flags?.inDarkness ?? null,
      probe,
    });
    console.log(
      `${name.padEnd(22)} L=${String(probe.meanLuma).padStart(6)} ` +
      `chroma=${String(probe.meanChroma).padStart(5)} hue=${String(probe.hueDeg).padStart(5)} ` +
      `bg%=${(probe.nearBgFrac * 100).toFixed(1).padStart(5)} squint=${String(probe.squintRange).padStart(6)} ` +
      `colours=${probe.uniqueColours}`
    );
  }
}

// --- readiness: did any tileset silently fail to load? ---
const readiness = await page.evaluate(() => window.__onyxDebug.readiness());

fs.writeFileSync(
  path.join(OUT, "probes.json"),
  JSON.stringify({ capturedAt: new Date().toISOString(), readiness, results }, null, 2)
);
console.log(`\nwrote ${path.join(OUT, "probes.json")}  (${results.length} views)`);
console.log("readiness.failed:", readiness.failed);
if (errors.length) console.log("browser errors:", errors.slice(0, 10));
await browser.close();
