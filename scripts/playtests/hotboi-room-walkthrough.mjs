// Walkthrough capture for Hot Boi's Tavern room assembly (agent/hot-bois-interior-art).
// Entrance -> both sides of the pillar -> bar -> kitchen spur -> return.
//
// Room lives at x19-21,y22-26 (entrance nub at (20,20)-(20,21)) plus an
// east 1x3 kitchen spur at x22,y23-25. Two things shaped this layout:
//
// 1. Merging agent/tavern-hero-door brought in a relocated Floor 2 stairs
//    + raft/guardian puzzle at (18,21)/(19,21), so the room was moved off
//    its original site.
// 2. The bar row was first placed at y27 (the map's last row) and looked
//    wrong in-engine — a stone floor/wall texture bled in around Hot Boi
//    instead of the tavern's wood theme. Root cause: the floor/ceiling
//    raycaster samples slightly past the grid edge for far screen rows
//    near the horizon, and row 27 has no row beyond it to sample, so it
//    silently fell back to the primary f1 theme. Every other room on this
//    floor keeps a buffer row before the map edge; this one now does too
//    (bar at y26, y27 untouched).
//
// See art/pixellab/hot-bois-generation-log.md for the full account.
//
// Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
import { launch, boot, act, shot, snap, ensureOutDir } from "./lib.mjs";

const URL = "http://localhost:5176/OnyxLabyrinth/?debug=1";
const OUT = "docs/hot-bois-art-review/screenshots/room-walkthrough";

async function main() {
  ensureOutDir(OUT);
  const { browser, page, errors } = await launch();

  // Start in the existing corridor cell right outside the door, facing south (2).
  await boot(page, URL, { scenario: { floorId: 1, x: 20, y: 20, facing: 2 } });

  // This is a room-composition regression check, not an encounter-rate
  // test — the walk is ~12 steps with no safe zone covering the new room,
  // so a random fight can otherwise interrupt it non-deterministically.
  // Zero the floor's encounter rate for the duration of this capture only.
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
  });

  await shot(page, OUT, "02-at-the-door.png");

  await act(page, "ArrowUp"); // through the door -> (20,21), the entrance nub
  await shot(page, OUT, "03-inside-entrance.png");

  await act(page, "ArrowUp"); // (20,22)
  await act(page, "ArrowUp"); // (20,23) - pillar cell
  await shot(page, OUT, "04-at-the-pillar.png");

  await act(page, "ArrowLeft"); // face east
  await shot(page, OUT, "05-pillar-east-side.png");
  await act(page, "ArrowLeft");
  await act(page, "ArrowLeft"); // now facing west
  await shot(page, OUT, "06-pillar-west-side.png");
  await act(page, "ArrowLeft"); // back to facing south

  await act(page, "ArrowUp"); // (20,24) - chandelier / kitchen spur row
  await shot(page, OUT, "07-past-pillar-chandelier.png");

  await act(page, "ArrowLeft"); // face east toward the kitchen spur
  await shot(page, OUT, "08-facing-kitchen-opening.png");
  await act(page, "ArrowUp"); // (20,24) -> east into (21,24), the spur doorway
  await shot(page, OUT, "09-at-kitchen-doorway.png");
  await act(page, "ArrowUp"); // (21,24) -> (22,24) inside the spur
  await shot(page, OUT, "10-inside-kitchen.png");

  // Back out of the kitchen to the main lane.
  await act(page, "ArrowLeft");
  await act(page, "ArrowLeft"); // face west
  await act(page, "ArrowUp"); // (22,24) -> (21,24)
  await act(page, "ArrowUp"); // (21,24) -> (20,24)
  await act(page, "ArrowLeft"); // face south again (from west: left -> south)

  await act(page, "ArrowUp"); // (20,25) - talk position
  await shot(page, OUT, "11-talk-position.png");

  const st = await snap(page);
  console.log("At talk position (expect 20,25 facing S):", JSON.stringify({ pos: st.pos, tile: st.tile }));

  await act(page, "ArrowUp"); // (20,26) - onto Hot Boi's tile, should hand off into the tavern UI
  await shot(page, OUT, "12-hot-boi-panel.png");

  const afterTalk = await snap(page);
  console.log("Route after stepping onto Hot Boi:", afterTalk.route, "pos:", JSON.stringify(afterTalk.pos), "tile:", afterTalk.tile);

  if (errors.length) {
    console.log("Console/network errors during walkthrough:", errors);
  }

  await browser.close();
  console.log("Walkthrough complete. Screenshots in", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
