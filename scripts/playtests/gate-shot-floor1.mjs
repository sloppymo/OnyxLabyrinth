// One-off: screenshot the ported Kept Gate entrance on real Floor 1.
import { boot, ensureOutDir, jumpTo, launch, shot, waitForIdle } from "./lib.mjs";

const URL = process.env.F1_URL ?? "http://127.0.0.1:5191/OnyxLabyrinth/?debug=1&mazeRenderer=webgl";
const OUT = ensureOutDir("playtest-screenshots/gate-shot-floor1");

const { browser, page } = await launch({ viewport: { width: 1280, height: 800 } });

try {
  const snap = await boot(page, URL, { scenario: { floorId: 1, x: 11, y: 39, facing: 0, autosave: false } });
  console.log("boot snapshot:", JSON.stringify({ route: snap.route, floor: snap.floor, x: snap.x, y: snap.y }));
  await waitForIdle(page, 4000);
  const shots = {};
  shots.spawn = await shot(page, OUT, "01-entrance-spawn.png");

  for (const y of [37, 35, 33, 32]) {
    await jumpTo(page, { floorId: 1, x: 11, y, facing: 0, autosave: false });
    await waitForIdle(page, 4000);
    shots[`y${y}`] = await shot(page, OUT, `y${y}-approach.png`);
  }

  console.log(JSON.stringify(shots, null, 2));
} finally {
  await browser.close();
}
