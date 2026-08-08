// P0 visual gate for The Camp's false-outdoor ceiling treatment.
// Captures only RAW GAMEPLAY exposure at controlled cardinal sightlines.
//
// Run against:
//   npx vite preview --port 5176 --base /OnyxLabyrinth/

import { launch, boot, jumpTo, shot, snap, ensureOutDir } from "./lib.mjs";

const URL = process.env.CAMP_PREVIEW_URL ?? "http://localhost:5196/OnyxLabyrinth/?debug=1";
const OUT = "docs/camp-art-review/screenshots/false-sky-prototype/raw-gameplay";

const poses = [
  { name: "01-dungeon-approach", x: 22, y: 12, facing: 1 },
  { name: "02-threshold", x: 24, y: 12, facing: 1 },
  { name: "03-first-reveal", x: 25, y: 12, facing: 1 },
  { name: "04-one-tile", x: 33, y: 12, facing: 1 },
  { name: "05-three-tiles", x: 31, y: 12, facing: 1 },
  { name: "06-five-tiles", x: 29, y: 12, facing: 1 },
  { name: "07-eight-tiles", x: 26, y: 12, facing: 1 },
  { name: "08-longest-axis", x: 25, y: 12, facing: 1 },
  { name: "09-longest-cross-view", x: 29, y: 8, facing: 2 },
  { name: "10-looking-back", x: 27, y: 12, facing: 3 },
];

async function main() {
  ensureOutDir(OUT);
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  await boot(page, URL, { scenario: { floorId: 1, x: poses[0].x, y: poses[0].y, facing: poses[0].facing } });
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
  });

  const results = [];
  for (const pose of poses) {
    await jumpTo(page, { floorId: 1, x: pose.x, y: pose.y, facing: pose.facing, autosave: false });
    const state = await snap(page);
    await shot(page, OUT, `${pose.name}.png`);
    results.push({ name: pose.name, pos: state.pos, route: state.route, tile: state.tile });
  }

  console.log(JSON.stringify({ results, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
