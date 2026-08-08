// Walkthrough capture for Hot Boi's Tavern room assembly (agent/hot-bois-interior-art).
// Entrance -> north row -> both sides of the pillar -> bar -> kitchen spur -> return.
// Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
import { launch, boot, act, shot, snap, ensureOutDir } from "./lib.mjs";

const URL = "http://localhost:5176/OnyxLabyrinth/?debug=1";
const OUT = "docs/hot-bois-art-review/screenshots/room-walkthrough";

async function main() {
  ensureOutDir(OUT);
  const { browser, page, errors } = await launch();

  // Start in the existing corridor cell right outside the door, facing south (2).
  await boot(page, URL, { scenario: { floorId: 1, x: 19, y: 20, facing: 2 } });
  await shot(page, OUT, "02-at-the-door.png");

  await act(page, "ArrowUp"); // through the door -> (19,21), inside the room
  await shot(page, OUT, "03-inside-entrance.png");

  await act(page, "ArrowUp"); // (19,22)
  await act(page, "ArrowUp"); // (19,23) - pillar cell
  await shot(page, OUT, "04-at-the-pillar.png");

  await act(page, "ArrowLeft"); // face east
  await shot(page, OUT, "05-pillar-east-side.png");
  await act(page, "ArrowLeft");
  await act(page, "ArrowLeft"); // now facing west
  await shot(page, OUT, "06-pillar-west-side.png");
  await act(page, "ArrowLeft"); // back to facing south

  await act(page, "ArrowUp"); // (19,24) - chandelier / kitchen spur row
  await shot(page, OUT, "07-past-pillar-chandelier.png");

  await act(page, "ArrowLeft"); // face east toward the kitchen spur
  await shot(page, OUT, "08-facing-kitchen-opening.png");
  await act(page, "ArrowUp"); // (19,24) -> east into (20,24)
  await shot(page, OUT, "09-at-kitchen-doorway.png");
  await act(page, "ArrowUp"); // (20,24) -> (21,24) inside the spur
  await shot(page, OUT, "10-inside-kitchen.png");

  // Back out of the kitchen to the main lane.
  await act(page, "ArrowLeft");
  await act(page, "ArrowLeft"); // face west
  await act(page, "ArrowUp"); // (21,24) -> (20,24)
  await act(page, "ArrowUp"); // (20,24) -> (19,24)
  await act(page, "ArrowLeft"); // face south again (from west: left -> south)

  await act(page, "ArrowUp"); // (19,25) - talk position
  await shot(page, OUT, "11-talk-position.png");

  const st = await snap(page);
  console.log("At talk position (expect 19,25 facing S):", JSON.stringify({ pos: st.pos, tile: st.tile }));

  await act(page, "ArrowUp"); // (19,26) - onto Hot Boi's tile, should open NPC panel
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
