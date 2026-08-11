// Repeated floor-load/resource-lifecycle probe for the WebGL maze backend.
import { writeFileSync } from "node:fs";
import { launch, boot, jumpTo, wait, ensureOutDir } from "./lib.mjs";

const URL =
  process.env.MAZE_LIFECYCLE_URL ??
  "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1&mazeRenderer=webgl";
const OUT = ensureOutDir(
  process.env.MAZE_LIFECYCLE_OUT ??
    "playtest-screenshots/maze-renderer-2/lifecycle"
);
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });

try {
  await boot(page, URL, {
    scenario: { floorId: 1, x: 4, y: 12, facing: 1, autosave: false },
  });
  const readings = [];
  const read = async (label) => {
    await wait(180);
    readings.push({
      label,
      ...(await page.evaluate(() => window.__onyxDebug.mazeRendererInfo())),
    });
  };

  // Warm every reusable floor texture before taking the stability baseline.
  await jumpTo(page, { floorId: 2, x: 9, y: 2, facing: 3, autosave: false });
  await read("warm-floor-2");
  await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
  await read("baseline-floor-1");
  const baseline = readings.at(-1).statistics;

  for (let cycle = 1; cycle <= 10; cycle++) {
    await jumpTo(page, { floorId: 2, x: 9, y: 2, facing: 3, autosave: false });
    await read(`cycle-${cycle}-floor-2`);
    await jumpTo(page, { floorId: 1, x: 4, y: 12, facing: 1, autosave: false });
    await read(`cycle-${cycle}-floor-1`);
  }
  const final = readings.at(-1).statistics;
  const pass =
    errors.length === 0 &&
    readings.every((reading) => reading.active === "webgl") &&
    final.geometries === baseline.geometries &&
    final.textures === baseline.textures;
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    url: URL,
    baseline,
    final,
    readings,
    browserErrors: errors,
    pass,
  };
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ pass, baseline, final, browserErrors: errors, output: OUT }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
