// One-off: screenshot the ported Kept Gate entrance on real Floor 1.
import { boot, ensureOutDir, jumpTo, launch, shot, waitForIdle } from "./lib.mjs";

const URL = process.env.F1_URL ?? "http://127.0.0.1:5191/OnyxLabyrinth/?debug=1&mazeRenderer=webgl";
const OUT = ensureOutDir("playtest-screenshots/gate-shot-floor1");

const { browser, page } = await launch({ viewport: { width: 1280, height: 800 } });

try {
  const snap = await boot(page, URL, { scenario: { floorId: 1, x: 11, y: 35, facing: 0, autosave: false } });
  console.log("boot snapshot:", JSON.stringify({ route: snap.route, floor: snap.floor, x: snap.x, y: snap.y }));
  await waitForIdle(page, 4000);
  const p1 = await shot(page, OUT, "entrance-spawn.png");

  await jumpTo(page, { floorId: 1, x: 11, y: 33, facing: 0, autosave: false });
  await waitForIdle(page, 4000);
  const p2 = await shot(page, OUT, "mid-approach.png");

  await jumpTo(page, { floorId: 1, x: 11, y: 32, facing: 0, autosave: false });
  await waitForIdle(page, 4000);
  const p3 = await shot(page, OUT, "gate-closeup.png");

  console.log(JSON.stringify({ p1, p2, p3 }, null, 2));
} finally {
  await browser.close();
}
