/**
 * Darkness isolation + torch-guard capture (WebGL).
 *
 * Walk vs jumpTo at Floor 1 (3,7) — approached from (3,8), not the chest
 * at (3,4). Boundary flips, plus a chest-exit check. Torch is captured as
 * a visual guard; F2 torch luma is not compared to the pre-vault suite
 * (library ceilingZ 4 changed that room).
 *
 *   npx vite preview --host 127.0.0.1 --port 5176 --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5176/OnyxLabyrinth/?debug=1 node scripts/playtests/lighting-darkness-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  ensureOutDir,
  jumpTo,
  launch,
  snap,
  wait,
  waitForIdle,
  ensureAudioResumed,
  probePngBuffer,
  act,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/lighting-darkness-verify");
const F3_STRAIGHT_BASELINE = 26.76;

const findings = [];
function check(id, ok, detail) {
  findings.push({ id, ok, detail });
  console.log(ok ? "OK  " : "FAIL", id, detail);
}

async function shot(page, name) {
  const el = await page.$("#maze-webgl");
  if (!el) throw new Error("no #maze-webgl");
  const png = await el.screenshot({ path: path.join(OUT, `${name}.png`) });
  const probe = await probePngBuffer(page, png);
  const st = await snap(page);
  return { probe, st };
}

const url = `${BASE}${BASE.includes("?") ? "&" : "?"}mazeRenderer=webgl`;
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await wait(500);
await ensureAudioResumed(page);

await jumpTo(page, { floorId: 1, x: 4, y: 6, facing: 3, autosave: false });
await waitForIdle(page, 5000);
await wait(200);
const outside = await shot(page, "outside-4-6-w");
check("outside-not-dark", outside.st.flags?.inDarkness === false, `inDarkness=${outside.st.flags?.inDarkness}`);

await act(page, "ArrowUp", 5000);
await waitForIdle(page, 5000);
await wait(600);
const walked = await shot(page, "walk-darkness-3-6-w");
check("walk-inDarkness", walked.st.flags?.inDarkness === true, `inDarkness=${walked.st.flags?.inDarkness}`);
check("walk-pos", walked.st.pos?.x === 3 && walked.st.pos?.y === 6, `pos=${walked.st.pos?.x},${walked.st.pos?.y}`);

await jumpTo(page, { floorId: 1, x: 3, y: 6, facing: 3, autosave: false });
await waitForIdle(page, 5000);
await wait(600);
const jumped = await shot(page, "jump-darkness-3-6-w");
check("jump-inDarkness", jumped.st.flags?.inDarkness === true, `inDarkness=${jumped.st.flags?.inDarkness}`);

const lumaRel = Math.abs(walked.probe.meanLuma - jumped.probe.meanLuma) / Math.max(jumped.probe.meanLuma, 1);
check(
  "walk-vs-jump-luma",
  lumaRel < 0.18,
  `jump L=${jumped.probe.meanLuma} walk L=${walked.probe.meanLuma} rel=${lumaRel.toFixed(3)}`
);

const boundary = [];
for (let i = 0; i < 4; i++) {
  await act(page, "ArrowDown", 5000);
  await waitForIdle(page, 5000);
  const left = await snap(page);
  boundary.push({ dir: "leave", inDarkness: left.flags?.inDarkness, pos: left.pos });
  await act(page, "ArrowUp", 5000);
  await waitForIdle(page, 5000);
  const entered = await snap(page);
  boundary.push({ dir: "enter", inDarkness: entered.flags?.inDarkness, pos: entered.pos });
}
check(
  "boundary-leave",
  boundary.filter((b) => b.dir === "leave").every((b) => b.inDarkness === false && b.pos?.x === 4 && b.pos?.y === 6),
  JSON.stringify(boundary.filter((b) => b.dir === "leave"))
);
check(
  "boundary-enter",
  boundary.filter((b) => b.dir === "enter").every((b) => b.inDarkness === true && b.pos?.x === 3 && b.pos?.y === 6),
  JSON.stringify(boundary.filter((b) => b.dir === "enter"))
);

await jumpTo(page, { floorId: 1, x: 3, y: 5, facing: 0, autosave: false });
await waitForIdle(page, 5000);
await act(page, "ArrowUp", 5000);
await waitForIdle(page, 5000);
const chest = await snap(page);
check(
  "chest-clears-darkness",
  chest.flags?.inDarkness === false && chest.pos?.x === 3 && chest.pos?.y === 4,
  `inDarkness=${chest.flags?.inDarkness} pos=${chest.pos?.x},${chest.pos?.y}`
);

await jumpTo(page, { floorId: 2, x: 2, y: 4, facing: 0, autosave: false });
await waitForIdle(page, 5000);
await wait(250);
const torch = await shot(page, "torch-guard-f2");
check("torch-not-darkness", torch.st.flags?.inDarkness === false, `inDarkness=${torch.st.flags?.inDarkness}`);

await jumpTo(page, { floorId: 3, x: 2, y: 4, facing: 2, autosave: false });
await waitForIdle(page, 5000);
await wait(250);
const f3 = await shot(page, "f3-straight-guard");
const f3Rel = Math.abs(f3.probe.meanLuma - F3_STRAIGHT_BASELINE) / F3_STRAIGHT_BASELINE;
check(
  "f3-straight-isolated",
  f3Rel < 0.12,
  `L=${f3.probe.meanLuma} baseline=${F3_STRAIGHT_BASELINE} rel=${f3Rel.toFixed(3)}`
);

check("no-page-errors", errors.length === 0, errors.slice(0, 6).join(" | ") || "none");

const report = {
  capturedAt: new Date().toISOString(),
  findings,
  jumped: jumped.probe,
  walked: walked.probe,
  torch: torch.probe,
  f3: f3.probe,
  errors,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const failed = findings.filter((f) => !f.ok);
console.log(failed.length ? "\nDarkness verify FAILED" : "\nDarkness verify PASSED");
console.log("Output:", OUT);
await browser.close();
if (failed.length) process.exit(1);
