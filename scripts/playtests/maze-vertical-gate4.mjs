// Remaining manual Gate 4 evidence for Maze Renderer 2 vertical traversal.
//
// This is intentionally a dev-server playtest (not `vite preview`): it imports
// the renderer factory and MIN_CAMERA_CLEARANCE through Vite so it can exercise
// three explicit renderer create/dispose cycles without adding lifecycle-only
// hooks to production code. Run the branch on a unique strict port, then point
// MAZE_VERTICAL_GATE4_URL at that server when needed.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { boot, ensureOutDir, jumpTo, launch, shot, wait, waitForIdle } from "./lib.mjs";

const BASE_URL =
  process.env.MAZE_VERTICAL_GATE4_URL ??
  "http://127.0.0.1:5197/OnyxLabyrinth/?debug=1&mazeRenderer=webgl&mazePerf=1&playtestFloor=1";
const OUT = ensureOutDir(
  process.env.MAZE_VERTICAL_GATE4_OUT ??
    "playtest-screenshots/maze-renderer-2/vertical-gate4"
);
const FIXTURE_MIN_CAMERA_CLEARANCE = 0.625;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function expectedBuildIdentity() {
  try {
    return {
      sha: git(["rev-parse", "--short", "HEAD"]),
      branch: git(["branch", "--show-current"]),
    };
  } catch {
    return { sha: "unknown", branch: "unknown" };
  }
}

const EXPECTED_BUILD = expectedBuildIdentity();

const cell = () => ({ n: "wall", e: "wall", s: "wall", w: "wall" });

function makeDemoMap() {
  const width = 10;
  const height = 16;
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, cell)
  );
  const air = new Set();
  for (let x = 1; x <= 7; x++) air.add(`${x},2`);
  for (let x = 1; x <= 2; x++) air.add(`${x},6`);
  for (let y = 4; y <= 8; y++) for (let x = 3; x <= 6; x++) air.add(`${x},${y}`);
  for (let x = 1; x <= 5; x++) air.add(`${x},10`);
  // Dedicated exact-threshold room, kept away from the absolute grid edge.
  for (let x = 1; x <= 3; x++) air.add(`${x},13`);
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
    name: "Renderer 2 Vertical Gate 4 Laboratory",
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
      {
        id: "minimum-legal-clearance",
        x1: 2,
        y1: 13,
        x2: 2,
        y2: 13,
        floorZ: 0,
        ceilingZ: FIXTURE_MIN_CAMERA_CLEARANCE,
      },
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
const saveLoadCases = [];
const downhillCases = [];

async function animationFrames(count = 2) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

async function pressAndSettle(key) {
  await page.keyboard.press(key);
  const settled = await waitForIdle(page, 3000);
  if (!settled) throw new Error(`Timed out waiting for ${key} input to settle`);
}

async function rendererInfo() {
  await animationFrames();
  return page.evaluate(() => window.__onyxDebug.mazeRendererInfo());
}

async function buildIdentity(label) {
  const actual = await page.evaluate(() => window.__onyxBuild ?? null);
  const pass =
    actual?.sha === EXPECTED_BUILD.sha &&
    actual?.branch === EXPECTED_BUILD.branch;
  return { label, expected: EXPECTED_BUILD, actual, pass };
}

function pose(snapshot, renderer) {
  const debugPosition = renderer.statistics?.debugPosition ?? null;
  return {
    floorId: snapshot.floor.id,
    pos: snapshot.pos,
    route: snapshot.route,
    renderer: {
      active: renderer.active,
      surface: debugPosition?.surface ?? null,
      surfaceZ: debugPosition?.surfaceZ ?? null,
      ceilingZ: debugPosition?.ceilingZ ?? null,
      rampDir: debugPosition?.rampDir ?? null,
    },
  };
}

async function saveLoadCase(name, setup, expectedSurface, expectedSurfaceZ) {
  await setup();
  await animationFrames();
  const before = await page.evaluate(() => ({
    save: window.__onyxDebug.dumpSave(),
    snapshot: window.__onyxDebug.snapshot(),
    renderer: window.__onyxDebug.mazeRendererInfo(),
  }));
  await page.evaluate((save) => window.__onyxDebug.loadSave(save), before.save);
  const settled = await waitForIdle(page, 5000);
  await animationFrames();
  const after = await page.evaluate(() => ({
    snapshot: window.__onyxDebug.snapshot(),
    renderer: window.__onyxDebug.mazeRendererInfo(),
  }));
  const beforePose = pose(before.snapshot, before.renderer);
  const afterPose = pose(after.snapshot, after.renderer);
  const pass =
    settled &&
    JSON.stringify(beforePose) === JSON.stringify(afterPose) &&
    afterPose.renderer.active === "webgl" &&
    afterPose.renderer.surface === expectedSurface &&
    Math.abs((afterPose.renderer.surfaceZ ?? Number.NaN) - expectedSurfaceZ) < 1e-6;
  const entry = {
    name,
    saveBytes: before.save.length,
    before: beforePose,
    after: afterPose,
    expectedSurface,
    expectedSurfaceZ,
    pass,
  };
  saveLoadCases.push(entry);
  if (!pass) throw new Error(`Save/load vertical case failed: ${name}`);
}

async function exerciseDownhill(name, low, high, expectedSurface) {
  await jumpTo(page, { floorId: 92, ...low, facing: 1, autosave: false });
  await pressAndSettle("ArrowUp");
  await pressAndSettle("ArrowUp");
  const top = await page.evaluate(() => window.__onyxDebug.snapshot());
  await pressAndSettle("ArrowRight");
  await pressAndSettle("ArrowRight");
  await pressAndSettle("ArrowUp");
  const middle = await page.evaluate(() => ({
    snapshot: window.__onyxDebug.snapshot(),
    renderer: window.__onyxDebug.mazeRendererInfo(),
  }));
  await pressAndSettle("ArrowUp");
  const bottom = await page.evaluate(() => window.__onyxDebug.snapshot());
  const pass =
    top.pos.x === high.x &&
    top.pos.y === high.y &&
    middle.snapshot.pos.x === 2 &&
    middle.snapshot.pos.y === low.y &&
    middle.renderer.statistics?.debugPosition?.surface === expectedSurface &&
    bottom.pos.x === low.x &&
    bottom.pos.y === low.y;
  const entry = {
    name,
    top: top.pos,
    middle: {
      pos: middle.snapshot.pos,
      debugPosition: middle.renderer.statistics?.debugPosition ?? null,
    },
    bottom: bottom.pos,
    pass,
  };
  downhillCases.push(entry);
  if (!pass) throw new Error(`Downhill real-input traversal failed: ${name}`);
}

async function sourceModule(path) {
  return page.evaluate(async (modulePath) => {
    const url = new URL(modulePath, document.baseURI).href;
    return { url };
  }, path);
}

async function explicitRendererLifecycleCycles() {
  await jumpTo(page, { floorId: 92, x: 3, y: 6, facing: 1, autosave: false });
  const factory = await sourceModule("src/engine/maze-renderer/renderer-factory.ts");
  return page.evaluate(async ({ factoryUrl }) => {
    const { createMazeRenderer } = await import(factoryUrl);
    const floor = window.__onyxDebug.findFloor(92);
    if (!floor) throw new Error("Gate 4 floor 92 is not registered");
    const readings = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      const canvas = document.createElement("canvas");
      const webglCanvas = document.createElement("canvas");
      canvas.width = webglCanvas.width = 768;
      canvas.height = webglCanvas.height = 672;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to create Canvas 2D context for lifecycle host");
      const selection = await createMazeRenderer(
        { canvas, context, webglCanvas },
        "?mazeRenderer=webgl"
      );
      await selection.renderer.loadFloor(floor);
      selection.renderer.resize({ width: 768, height: 672 });
      selection.renderer.render(window.__onyxDebug.state);
      const beforeDispose = selection.renderer.getStatistics();
      selection.renderer.dispose();
      const afterDispose = selection.renderer.getStatistics();
      readings.push({
        cycle,
        active: selection.active,
        beforeDispose,
        afterDispose,
        pass:
          selection.active === "webgl" &&
          (beforeDispose.triangles ?? 0) > 0 &&
          afterDispose.geometries === 0 &&
          afterDispose.textures === 0,
      });
    }
    return readings;
  }, { factoryUrl: factory.url });
}

try {
  await page.addInitScript((floorMap) => {
    localStorage.setItem("onyx-floor-playtest", JSON.stringify(floorMap));
  }, map);

  // Prove the build identity exists before the debug-only main.ts surface is enabled.
  const nonDebugUrl = new URL(BASE_URL);
  nonDebugUrl.searchParams.delete("debug");
  await page.goto(nonDebugUrl.toString(), { waitUntil: "networkidle" });
  await wait(150);
  const nonDebugBuild = await buildIdentity("non-debug");
  if (!nonDebugBuild.pass) {
    throw new Error(`Non-debug build identity mismatch: ${JSON.stringify(nonDebugBuild)}`);
  }

  await boot(page, BASE_URL, {
    scenario: { floorId: 92, x: 1, y: 6, facing: 1, autosave: false },
  });
  const debugBuild = await buildIdentity("debug");
  if (!debugBuild.pass) {
    throw new Error(`Debug build identity mismatch: ${JSON.stringify(debugBuild)}`);
  }

  // Real keyboard traversal down both connector types, not just turn-around screenshots.
  await exerciseDownhill(
    "single-ramp-downhill",
    { x: 1, y: 6 },
    { x: 3, y: 6 },
    "ramp"
  );
  await exerciseDownhill(
    "stairs-downhill",
    { x: 1, y: 10 },
    { x: 3, y: 10 },
    "stairs"
  );

  // Save/load at the four required vertical poses.
  await saveLoadCase(
    "flat",
    () => jumpTo(page, { floorId: 92, x: 1, y: 6, facing: 1, autosave: false }),
    "flat",
    0
  );
  await saveLoadCase(
    "elevated-flat",
    () => jumpTo(page, { floorId: 92, x: 3, y: 6, facing: 1, autosave: false }),
    "flat",
    1
  );
  await saveLoadCase(
    "ramp",
    async () => {
      await jumpTo(page, { floorId: 92, x: 1, y: 6, facing: 1, autosave: false });
      await pressAndSettle("ArrowUp");
    },
    "ramp",
    0.5
  );
  await saveLoadCase(
    "stairs",
    async () => {
      await jumpTo(page, { floorId: 92, x: 1, y: 10, facing: 1, autosave: false });
      await pressAndSettle("ArrowUp");
    },
    "stairs",
    0.5
  );

  // Explicit create -> load/render -> dispose, three times, using the real factory.
  const rendererLifecycle = await explicitRendererLifecycleCycles();
  if (!rendererLifecycle.every((entry) => entry.pass)) {
    throw new Error(`Renderer create/dispose cycle failed: ${JSON.stringify(rendererLifecycle)}`);
  }

  // Mid-turn screenshot while standing on the ramp: this is the oblique connector proof.
  await jumpTo(page, { floorId: 92, x: 1, y: 6, facing: 1, autosave: false });
  await pressAndSettle("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await wait(75);
  captures.push(await shot(page, OUT, "01-oblique-ramp-mid-turn.png"));
  const obliqueInfo = await rendererInfo();
  await waitForIdle(page, 3000);
  const obliqueEvidencePass =
    obliqueInfo.active === "webgl" &&
    obliqueInfo.statistics?.debugPosition?.surface === "ramp";

  // Close high-room wall from half a cell away. Screenshot is the UV-review artifact.
  await jumpTo(page, { floorId: 92, x: 3, y: 4, facing: 0, autosave: false });
  captures.push(await shot(page, OUT, "02-tall-wall-uv-close-up.png"));
  const tallWallInfo = await rendererInfo();
  const tallWallEvidencePass =
    tallWallInfo.active === "webgl" &&
    tallWallInfo.statistics?.debugPosition?.surface === "flat" &&
    tallWallInfo.statistics?.debugPosition?.surfaceZ === 1 &&
    tallWallInfo.statistics?.debugPosition?.ceilingZ === 3;

  // Exact validator threshold fixture. Import the canonical constant so drift fails loudly.
  const clearanceModule = await sourceModule(
    "src/engine/maze-renderer/geometry/cell-volume.ts"
  );
  const canonicalClearance = await page.evaluate(async (moduleUrl) => {
    const { MIN_CAMERA_CLEARANCE } = await import(moduleUrl);
    return MIN_CAMERA_CLEARANCE;
  }, clearanceModule.url);
  await jumpTo(page, { floorId: 92, x: 2, y: 13, facing: 1, autosave: false });
  captures.push(await shot(page, OUT, "03-minimum-legal-clearance.png"));
  const minimumClearanceInfo = await rendererInfo();
  const minPos = minimumClearanceInfo.statistics?.debugPosition;
  const minimumClearancePass =
    canonicalClearance === FIXTURE_MIN_CAMERA_CLEARANCE &&
    minPos?.surface === "flat" &&
    minPos?.surfaceZ === 0 &&
    Math.abs((minPos?.ceilingZ ?? Number.NaN) - canonicalClearance) < 1e-6;

  const automatedPass =
    errors.length === 0 &&
    nonDebugBuild.pass &&
    debugBuild.pass &&
    downhillCases.every((entry) => entry.pass) &&
    saveLoadCases.every((entry) => entry.pass) &&
    rendererLifecycle.every((entry) => entry.pass) &&
    obliqueEvidencePass &&
    tallWallEvidencePass &&
    minimumClearancePass;

  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    url: BASE_URL,
    expectedBuild: EXPECTED_BUILD,
    buildIdentity: { nonDebug: nonDebugBuild, debug: debugBuild },
    downhillCases,
    saveLoadCases,
    rendererLifecycle,
    visualEvidence: {
      obliqueConnector: {
        pass: obliqueEvidencePass,
        renderer: obliqueInfo,
        screenshot: captures[0],
        requiresHumanReview: true,
      },
      tallWallUv: {
        pass: tallWallEvidencePass,
        renderer: tallWallInfo,
        screenshot: captures[1],
        requiresHumanReview: true,
      },
    },
    minimumClearance: {
      fixture: FIXTURE_MIN_CAMERA_CLEARANCE,
      canonical: canonicalClearance,
      renderer: minimumClearanceInfo,
      screenshot: captures[2],
      pass: minimumClearancePass,
    },
    browserErrors: errors,
    automatedPass,
    manualVisualReviewRequired: [
      "01-oblique-ramp-mid-turn.png",
      "02-tall-wall-uv-close-up.png",
    ],
  };
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    automatedPass,
    output: OUT,
    expectedBuild: EXPECTED_BUILD,
    downhillCases,
    saveLoadCases,
    rendererLifecycle,
    minimumClearancePass,
    visualEvidence: report.visualEvidence,
    browserErrors: errors,
  }, null, 2));
  if (!automatedPass) process.exitCode = 1;
} catch (error) {
  const failure = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    url: BASE_URL,
    expectedBuild: EXPECTED_BUILD,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    downhillCases,
    saveLoadCases,
    browserErrors: errors,
    captures,
  };
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
