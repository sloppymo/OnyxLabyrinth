// Walkthrough capture for the Church of Saint Namanda room assembly
// (agent/saint-namanda-church).
//
// Entrance (relocated hero door) -> threshold -> narthex/font -> nave
// (bench, votive wall, censer, reliquary niche) -> altar reveal -> service
// interaction tile (opens the real Church UI) -> leave -> turn back toward
// the door.
//
// The room lives at x8-11,y2-9 (apse row2 narrower than the nave, threshold
// at (11,9) single-file). The hero door was RELOCATED from (10,10)/(11,10)
// (the cut-bell-chapel junction, a live through-corridor) to (11,9)/(11,10)
// (the church's own mouth) so that crossing it delivers an immediate
// pale-stone material transition — see docs/namanda-church-art-review for
// the full writeup of why the original coordinate didn't satisfy that.
//
// Run against `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
import { launch, boot, act, shot, snap, ensureOutDir } from "./lib.mjs";

const URL = "http://localhost:5176/OnyxLabyrinth/?debug=1";
const OUT = "docs/namanda-church-art-review/screenshots/room-walkthrough";

async function main() {
  ensureOutDir(OUT);
  const { browser, page, errors } = await launch();

  // Start in the existing chapel-side corridor, facing east toward the door.
  await boot(page, URL, { scenario: { floorId: 1, x: 9, y: 10, facing: 1 } });

  // Regression capture, not an encounter-rate test — zero the floor's
  // encounter rate for the duration so a random fight can't interrupt it.
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
  });

  await shot(page, OUT, "01-approach-door.png");

  await act(page, "ArrowUp"); // (10,10)
  await act(page, "ArrowUp"); // (11,10)
  await act(page, "ArrowLeft"); // face north, toward the relocated door
  await shot(page, OUT, "02-door-close.png");

  await act(page, "ArrowUp"); // through the door -> (11,9), the threshold
  await shot(page, OUT, "03-immediately-after-entering.png");

  await act(page, "ArrowUp"); // (11,8), narthex
  await act(page, "ArrowLeft"); // face west, toward the font
  await shot(page, OUT, "04-narthex-toward-font.png");

  await act(page, "ArrowUp"); // (10,8)
  await act(page, "ArrowUp"); // (9,8) - at the font
  await shot(page, OUT, "05-at-font.png");

  await act(page, "ArrowRight"); // face north, into the nave
  await act(page, "ArrowUp"); // (9,7)
  await act(page, "ArrowLeft"); // face west, toward the bench
  await shot(page, OUT, "06-bench-alcove.png");

  await act(page, "ArrowRight"); // face north
  await act(page, "ArrowUp"); // (9,6)
  await act(page, "ArrowLeft"); // face west, toward the votive wall
  await shot(page, OUT, "07-votive-wall.png");

  await act(page, "ArrowRight"); // face north
  await act(page, "ArrowUp"); // (9,5)
  await act(page, "ArrowRight"); // face east
  await act(page, "ArrowUp"); // (10,5) - under the censer
  await shot(page, OUT, "08-censer-aisle.png");

  await act(page, "ArrowLeft"); // face north
  await act(page, "ArrowUp"); // (10,4)
  await act(page, "ArrowRight"); // face east, toward the reliquary niche
  await shot(page, OUT, "09-reliquary-niche.png");

  await act(page, "ArrowLeft"); // face north again
  await shot(page, OUT, "10-altar-reveal.png");

  await act(page, "ArrowUp"); // (10,3) - the service interaction tile
  await shot(page, OUT, "11-service-position.png");

  const opened = await snap(page);
  console.log("Route after stepping onto the altar tile:", opened.route);

  await shot(page, OUT, "12-church-ui-open.png");

  await act(page, "Escape"); // leave the church UI
  const closed = await snap(page);
  console.log("Route after leaving the Church UI:", closed.route, "pos:", JSON.stringify(closed.pos));
  await shot(page, OUT, "13-back-in-room.png");

  await act(page, "ArrowLeft");
  await act(page, "ArrowLeft"); // turn to face south, back toward the door
  await shot(page, OUT, "14-turned-toward-entrance.png");

  await act(page, "ArrowUp"); // (10,4)
  await act(page, "ArrowUp"); // (10,5)
  await shot(page, OUT, "15-leaving-the-nave.png");

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
