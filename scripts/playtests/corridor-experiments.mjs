/**
 * Corridor art pass — falsification experiments.
 *
 * Each experiment states a prediction that could come out wrong, then measures.
 * A check that cannot fail is decoration; these are here so the plan's claims
 * are load-bearing.
 *
 *   E1  Fog cutoff is a hard clip, not a fade. The floor/ceiling caster skips
 *       every row past `maxDist`, so a band of |y - halfH| < halfH/maxDist is
 *       left at raw PALETTE.bg. Prediction: forcing `inDarkness` swaps maxDist
 *       from 8 to darknessMaxDist 1.5 and the band edge must move from
 *       halfH - halfH/8 to halfH - halfH/1.5 — a large, specific displacement.
 *
 *   E2  Cached CanvasPattern across a canvas-bitmap reset. `drawScanlines`
 *       memoises `scanlinePattern` at module scope and, unlike `drawVignette`,
 *       never invalidates it on a size change, while `resizeCorridorCanvas`
 *       reassigns `canvas.width`. Prediction: if the documented failure mode is
 *       live, frame luminance collapses after a viewport resize.
 *
 *   E3  Torch flicker is depth-inverted. It is a radial gradient at maximum
 *       alpha in the screen centre — which in a corridor is the *far* end — and
 *       it is painted before the wall pass, so near opaque walls occlude it
 *       while distant translucent ones let it through. Prediction: flicker
 *       amplitude is higher in the centre disc than in the outer ring, i.e. the
 *       torch lights the distance more than the walls beside the party.
 *
 * Run: node scripts/playtests/corridor-experiments.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));
const P = POSES["1"].straight;

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);
await jumpTo(page, { floorId: 1, x: P.x, y: P.y, facing: P.facing, autosave: false });
await waitForIdle(page, 5000);
await wait(200);

const report = {};

/** Mean luminance of each screen row over the centre 40% of columns. */
const rowProfile = () =>
  page.evaluate(() => {
    const cv = document.querySelector("#view");
    const ctx = cv.getContext("2d");
    const { width: W, height: H } = cv;
    const d = ctx.getImageData(0, 0, W, H).data;
    const x0 = Math.floor(W * 0.3), x1 = Math.floor(W * 0.7);
    const rows = [];
    for (let y = 0; y < H; y++) {
      let a = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        a += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      rows.push(a / (x1 - x0));
    }
    return { rows, W, H };
  });

/** Sharpest single-row luminance drop above the horizon = the ceiling-side cutoff. */
const ceilingEdge = ({ rows, H }) => {
  const halfH = H / 2;
  let best = { y: 0, d: 0 };
  for (let y = 4; y < halfH; y++) {
    const drop = rows[y - 1] - rows[y];
    if (drop > best.d) best = { y, d: drop };
  }
  return best;
};

// --- E1: fog cutoff is a hard clip ------------------------------------------
{
  const before = await rowProfile();
  const halfH = before.H / 2;
  const eBefore = ceilingEdge(before);

  await page.evaluate(() => { window.__onyxDebug.state.inDarkness = true; });
  await wait(300); // let the rAF loop repaint
  const after = await rowProfile();
  const eAfter = ceilingEdge(after);
  await page.evaluate(() => { window.__onyxDebug.state.inDarkness = false; });
  await wait(200);

  report.E1 = {
    hypothesis: "floor/ceiling caster hard-clips at maxDist, leaving a raw-bg band at the horizon",
    predictedEdgeNormal: +(halfH - halfH / 8).toFixed(1),
    measuredEdgeNormal: eBefore.y,
    dropNormal: +eBefore.d.toFixed(2),
    predictedEdgeDarkness: +(halfH - halfH / 1.5).toFixed(1),
    measuredEdgeDarkness: eAfter.y,
    dropDarkness: +eAfter.d.toFixed(2),
    bandHeightPx: +(2 * (halfH / 8)).toFixed(0),
    bandPctOfScreen: +((100 * (halfH / 8) * 2) / before.H).toFixed(1),
  };
  report.E1.pass =
    Math.abs(report.E1.measuredEdgeNormal - report.E1.predictedEdgeNormal) <= 3 &&
    Math.abs(report.E1.measuredEdgeDarkness - report.E1.predictedEdgeDarkness) <= 6;
  console.log("E1", JSON.stringify(report.E1, null, 1));
}

// --- E2: cached CanvasPattern across a canvas-bitmap reset -------------------
{
  const meanLuma = () =>
    page.evaluate(() => {
      const cv = document.querySelector("#view");
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return { luma: +(s / (d.length / 4)).toFixed(2), w: cv.width, h: cv.height };
    });

  const before = await meanLuma();
  await page.setViewportSize({ width: 900, height: 620 });
  await wait(500);
  const mid = await meanLuma();
  await page.setViewportSize({ width: 1280, height: 800 });
  await wait(500);
  const after = await meanLuma();

  report.E2 = {
    hypothesis: "scanline CanvasPattern cached across canvas.width reset draws black",
    before, afterShrink: mid, afterRestore: after,
    canvasResized: before.w !== mid.w || before.h !== mid.h,
    // Failure mode would be a collapse toward 0 luminance.
    collapsed: mid.luma < before.luma * 0.5 || after.luma < before.luma * 0.5,
  };
  console.log("E2", JSON.stringify(report.E2, null, 1));
}

// --- E3: torch flicker is depth-inverted ------------------------------------
{
  await jumpTo(page, { floorId: 1, x: P.x, y: P.y, facing: P.facing, autosave: false });
  await waitForIdle(page, 5000);
  await wait(200);

  const samples = [];
  for (let i = 0; i < 40; i++) {
    samples.push(
      await page.evaluate(() => {
        const cv = document.querySelector("#view");
        const { width: W, height: H } = cv;
        const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
        const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const cx = W / 2, cy = H / 2, R = Math.max(W, H) / 2;
        let cSum = 0, cN = 0, oSum = 0, oN = 0;
        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            const r = Math.hypot(x - cx, y - cy) / R;
            const i = (y * W + x) * 4;
            if (r < 0.25) { cSum += L(i); cN++; }
            else if (r > 0.75) { oSum += L(i); oN++; }
          }
        }
        return { centre: cSum / cN, outer: oSum / oN, t: performance.now() };
      })
    );
    await wait(60); // ~2.4s total, > one 2000ms flicker period
  }
  const span = (k) => {
    const v = samples.map((s) => s[k]);
    return { min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3), amp: +(Math.max(...v) - Math.min(...v)).toFixed(3), mean: +(v.reduce((a, b) => a + b) / v.length).toFixed(2) };
  };
  const c = span("centre"), o = span("outer");
  report.E3 = {
    hypothesis: "torch flicker peaks at screen centre (= far end) and is occluded by near walls",
    centre: c, outer: o,
    centreAmpOverOuterAmp: +(c.amp / Math.max(o.amp, 1e-6)).toFixed(2),
    inverted: c.amp > o.amp,
    durationMs: +(samples[samples.length - 1].t - samples[0].t).toFixed(0),
  };
  console.log("E3", JSON.stringify(report.E3, null, 1));
}

report.browserErrors = errors.slice(0, 10);
fs.writeFileSync(path.join(OUT, "experiments.json"), JSON.stringify(report, null, 2));
console.log(`\nwrote ${path.join(OUT, "experiments.json")}`);
await browser.close();
