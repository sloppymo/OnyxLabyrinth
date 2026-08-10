// Persistent raw-gameplay walkthrough for The Camp (Floor 1).
//
// Run against:
//   npx vite preview --port 5196 --base /OnyxLabyrinth/

import {
  launch,
  boot,
  jumpTo,
  act,
  shot,
  snap,
  ensureOutDir,
  waitForIdle,
} from "./lib.mjs";

const URL = process.env.CAMP_PREVIEW_URL ?? "http://localhost:5196/OnyxLabyrinth/?debug=1";
const OUT = "docs/camp-art-review/screenshots/walkthrough/raw-gameplay";

async function captureAt(page, name, pose) {
  await jumpTo(page, { floorId: 1, ...pose, autosave: false });
  await shot(page, OUT, `${name}.png`);
  return snap(page);
}

async function main() {
  ensureOutDir(OUT);
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  await boot(page, URL, { scenario: { floorId: 1, x: 22, y: 12, facing: 1 } });
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
  });

  await shot(page, OUT, "01-dungeon-approach.png");
  await act(page, "ArrowUp");
  await act(page, "ArrowUp");
  await shot(page, OUT, "02-entrance-threshold.png");

  // Depending on whether this save has seen the door, one press opens and a
  // second enters. Stop as soon as the player reaches the Camp side.
  for (let i = 0; i < 2; i++) {
    const state = await snap(page);
    if (state.pos.x >= 25) break;
    await act(page, "ArrowUp");
  }
  await waitForIdle(page);
  await shot(page, OUT, "03-first-camp-reveal.png");

  const captures = [
    ["04-central-long-view", { x: 25, y: 12, facing: 1 }],
    ["05-campfire", { x: 28, y: 12, facing: 1 }],
    ["06-wagon", { x: 31, y: 9, facing: 1 }],
    ["07-pavilion", { x: 29, y: 9, facing: 3 }],
    ["08-dead-tree", { x: 31, y: 14, facing: 1 }],
    ["09-smith-area", { x: 29, y: 15, facing: 1 }],
    ["10-supplies", { x: 29, y: 9, facing: 1 }],
    ["11-ambient-adventurers", { x: 26, y: 13, facing: 1 }],
    ["12-longest-cross-view", { x: 29, y: 8, facing: 2 }],
    ["13-false-sky-root-clue", { x: 32, y: 14, facing: 1 }],
    ["14-looking-back", { x: 27, y: 12, facing: 3 }],
  ];
  const states = [];
  for (const [name, pose] of captures) {
    states.push({ name, state: await captureAt(page, name, pose) });
  }

  console.log(
    JSON.stringify(
      {
        captures: states.map(({ name, state }) => ({ name, pos: state.pos, route: state.route })),
        errors,
      },
      null,
      2
    )
  );
  if (errors.length) process.exitCode = 1;
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
