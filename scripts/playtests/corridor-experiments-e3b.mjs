/**
 * Corridor art pass — E3b: torch flicker depth-inversion, vignette-isolated.
 *
 * E3's original centre-vs-outer-ring measurement overstated the effect: the
 * outer ring (r > 0.75) sits under the vignette's darkest stop
 * (rgba(0,0,0,0.65) at r=1) AND under the flicker gradient's own zero stop
 * (rgba(...,0) at r=1), so it reads near-zero amplitude by construction of two
 * unrelated effects rather than by depth occlusion alone.
 *
 * This re-measures with bands chosen so neither confound applies:
 *   centre   r < 0.20                  — the far end of the corridor
 *   annulus  0.45 < r < 0.65           — same vignette/gradient zone, nearer geometry
 *   nearWall first 15% of columns,     — actual near wall surface, the thing a
 *            middle 40% of rows          carried torch should modulate most
 *
 * The claim under test is "the torch modulates the distance more than the walls
 * beside the party", so nearWall amplitude vs centre amplitude is the number
 * that matters.
 */
import fs from "node:fs";
import path from "node:path";
import { launch, wait, jumpTo, waitForIdle, ensureOutDir, ensureAudioResumed } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-30-corridor-baseline");
const POSES = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: "networkidle" });
await wait(400);
await ensureAudioResumed(page);

const out = {};
for (const floorId of [1, 5]) {
  const P = POSES[String(floorId)].straight;
  await jumpTo(page, { floorId, x: P.x, y: P.y, facing: P.facing, autosave: false });
  await waitForIdle(page, 5000);
  await wait(250);

  const samples = [];
  for (let i = 0; i < 45; i++) {
    samples.push(
      await page.evaluate(() => {
        const cv = document.querySelector("#view");
        const { width: W, height: H } = cv;
        const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
        const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const cx = W / 2, cy = H / 2, R = Math.max(W, H) / 2;
        let c = 0, cN = 0, a = 0, aN = 0, nw = 0, nwN = 0;
        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            const i = (y * W + x) * 4;
            const r = Math.hypot(x - cx, y - cy) / R;
            if (r < 0.2) { c += L(i); cN++; }
            else if (r > 0.45 && r < 0.65) { a += L(i); aN++; }
            // near wall: outermost 15% of columns, middle 40% of rows
            if ((x < W * 0.15 || x > W * 0.85) && y > H * 0.3 && y < H * 0.7) { nw += L(i); nwN++; }
          }
        }
        return { centre: c / cN, annulus: a / aN, nearWall: nw / nwN };
      })
    );
    await wait(55);
  }
  const span = (k) => {
    const v = samples.map((s) => s[k]);
    const mn = Math.min(...v), mx = Math.max(...v);
    return { mean: +(v.reduce((x, y) => x + y) / v.length).toFixed(2), amp: +(mx - mn).toFixed(3), ampPctOfMean: +(((mx - mn) / (v.reduce((x, y) => x + y) / v.length)) * 100).toFixed(2) };
  };
  const c = span("centre"), a = span("annulus"), n = span("nearWall");
  out[`f${floorId}-straight`] = {
    centre: c, annulus: a, nearWall: n,
    centreOverAnnulus: +(c.amp / Math.max(a.amp, 1e-6)).toFixed(2),
    centreOverNearWall: +(c.amp / Math.max(n.amp, 1e-6)).toFixed(2),
    inverted: c.amp > n.amp,
  };
  console.log(`f${floorId}-straight`, JSON.stringify(out[`f${floorId}-straight`], null, 1));
}

out.note =
  "Bands chosen so the vignette's darkest stop and the flicker gradient's own zero stop " +
  "do not confound the comparison. centreOverNearWall is the load-bearing number.";
out.browserErrors = errors.slice(0, 5);
fs.writeFileSync(path.join(OUT, "experiment-e3b.json"), JSON.stringify(out, null, 2));
console.log(`\nwrote ${path.join(OUT, "experiment-e3b.json")}`);
await browser.close();
