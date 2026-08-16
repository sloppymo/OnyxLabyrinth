// @ts-nocheck — Playwright driver; lib.mjs is untyped.
/**
 * Pass/fail dungeon lighting suite (Canvas + WebGL).
 *
 * Assumes production preview:
 *   npx vite preview --host 127.0.0.1 --port 5176 --base /OnyxLabyrinth/
 *   npm run test:lighting
 *
 * Writes playtest-screenshots/lighting-suite/ (gitignored) plus report.json
 * and index.html. Exit 1 if any invariant fails or the page logged errors.
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
} from "./lib.mjs";
import {
  evaluateLightingRun,
  lightingRunPassed,
  type LightingPoseResult,
} from "../../src/engine/lighting-probes.ts";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(process.env.ONYX_OUT ?? "playtest-screenshots/lighting-suite");
const PINNED = JSON.parse(fs.readFileSync("scripts/playtests/corridor-poses.json", "utf8"));

const POSES = [
  { name: "f1-straight", floorId: 1, ...PINNED["1"].straight },
  { name: "f1-sidePassage", floorId: 1, ...PINNED["1"].sidePassage },
  { name: "f1-frontWall", floorId: 1, ...PINNED["1"].frontWall },
  { name: "f1-darkness", floorId: 1, ...PINNED["1"].darkness },
  { name: "f1-gate", floorId: 1, ...PINNED["1"].door },
  { name: "f1-treasure", floorId: 1, ...PINNED["1"].treasure },
  { name: "f1-kept-gate-approach", floorId: 1, x: 11, y: 36, facing: 0 },
  { name: "f1-kept-gate-close", floorId: 1, x: 11, y: 33, facing: 0 },
  { name: "f1-kept-gate-glance", floorId: 1, x: 10, y: 33, facing: 1 },
  { name: "f2-straight-distant", floorId: 2, ...PINNED["2"].straight },
  { name: "f2-gate", floorId: 2, ...PINNED["2"].door },
  { name: "f2-darkness", floorId: 2, ...PINNED["2"].darkness },
  { name: "f2-torch", floorId: 2, x: 2, y: 4, facing: 0 },
  { name: "f3-straight", floorId: 3, ...PINNED["3"].straight },
];

async function captureBackend(backend: "canvas" | "webgl"): Promise<{
  results: LightingPoseResult[];
  errors: string[];
  info: unknown;
}> {
  const joiner = BASE.includes("?") ? "&" : "?";
  const url = `${BASE}${joiner}mazeRenderer=${backend}`;
  const outDir = ensureOutDir(path.join(OUT, backend));
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);

  const info = await page.evaluate("window.__onyxDebug.mazeRendererInfo()");
  const results: LightingPoseResult[] = [];
  for (const pose of POSES) {
    await jumpTo(page, {
      floorId: pose.floorId, x: pose.x, y: pose.y, facing: pose.facing, autosave: false,
    });
    await waitForIdle(page, 5000);
    await wait(250);
    const st = await snap(page);
    const selector = backend === "webgl" ? "#maze-webgl" : "#view";
    const el = await page.$(selector);
    if (!el) throw new Error(`no ${selector} for backend ${backend}`);
    const png = await el.screenshot({ path: path.join(outDir, `${pose.name}.png`) });
    const probe = await probePngBuffer(page, png);
    results.push({
      name: pose.name,
      backend,
      inDarkness: st.flags?.inDarkness ?? null,
      probe,
      errorCount: errors.length,
    });
    console.log(
      `[${backend}] ${pose.name.padEnd(24)} L=${String(probe.meanLuma).padStart(6)} ` +
      `chroma=${String(probe.meanChroma).padStart(5)} colours=${probe.uniqueColours}`
    );
  }
  fs.writeFileSync(
    path.join(outDir, "probes.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), backend, info, errors, results }, null, 2)
  );
  await browser.close();
  return { results, errors, info };
}

function writeGallery(all: LightingPoseResult[]) {
  const names = [...new Set(all.map((r) => r.name))];
  const rows = names.map((name) => {
    const cells = ["canvas", "webgl"].map((be) => {
      const r = all.find((x) => x.name === name && x.backend === be);
      if (!r) return "<td></td>";
      return `<td><img src="${be}/${name}.png" alt="${be} ${name}"><br>${be} L=${r.probe.meanLuma}</td>`;
    }).join("");
    return `<tr><th>${name}</th>${cells}</tr>`;
  }).join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lighting suite</title>
<style>body{font-family:sans-serif;background:#111;color:#ddd}img{max-width:420px}td,th{padding:8px;vertical-align:top}</style>
</head><body><h1>Dungeon lighting suite</h1><table>${rows}</table></body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}

const canvas = await captureBackend("canvas");
const webgl = await captureBackend("webgl");
const results = [...canvas.results, ...webgl.results];
const checks = evaluateLightingRun(results);
const pageErrors = [...canvas.errors, ...webgl.errors];
if (pageErrors.length) {
  checks.push({
    id: "browser-errors",
    ok: false,
    detail: pageErrors.slice(0, 8).join(" | "),
  });
}
writeGallery(results);
const report = {
  capturedAt: new Date().toISOString(),
  passed: lightingRunPassed(checks),
  checks,
  pageErrors,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const failed = checks.filter((c) => !c.ok);
for (const c of failed) console.error("FAIL", c.id, c.detail);
console.log(report.passed ? "\nLighting suite PASSED" : "\nLighting suite FAILED");
console.log("Output:", OUT);
if (!report.passed) process.exit(1);
