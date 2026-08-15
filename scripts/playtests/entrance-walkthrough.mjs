#!/usr/bin/env node
/**
 * Entrance set-piece walkthrough capture.
 *
 * Walks the real player route from the Floor 1 start (11,39) north through
 * the Kept Gate hall, capturing every step, oblique views, gate hugs, the
 * threshold crossing, and the backward view. Used as the visual test loop
 * for the labyrinth-entrance set-piece pass (screenshots-as-tests).
 *
 * Usage: node scripts/playtests/entrance-walkthrough.mjs [outDirName]
 */
import { boot, ensureOutDir, jumpTo, launch, act, shot, snap } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(`output/playwright/${process.argv[2] ?? "entrance-baseline"}`);

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  // Suppress random encounters so the walk is deterministic.
  await boot(page, BASE, {
    scenario: { floorId: 1, x: 11, y: 39, facing: 0, autosave: false, stepsSinceEncounter: 0 },
  });
  await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));
  await page.waitForTimeout(400);

  const cap = async (name) => {
    await page.waitForTimeout(250);
    await shot(page, OUT, name);
    const s = await snap(page);
    console.log(`${name}: (${s.pos.x},${s.pos.y}) facing=${s.pos.facing ?? "?"} msg="${(s.message?.text ?? "").slice(0, 60)}"`);
  };

  await cap("01-start-11x39.png");
  await act(page, "ArrowUp"); await cap("02-corridor-11x38.png");
  await act(page, "ArrowUp"); await cap("03-corridor-11x37.png");
  await act(page, "ArrowUp"); await cap("04-corridor-11x36.png");
  await act(page, "ArrowUp"); await cap("05-hall-mouth-11x35.png");
  await act(page, "ArrowUp"); await cap("06-hall-11x34.png");
  await act(page, "ArrowUp"); await cap("07-hall-11x33.png");
  await act(page, "ArrowUp"); await cap("08-hall-11x32.png");
  await act(page, "ArrowUp"); await cap("09-gate-front-11x31.png");

  // Side views inside the hall.
  await jumpTo(page, { floorId: 1, x: 11, y: 33, facing: 3, autosave: false });
  await cap("10-hall-center-west-11x33.png");
  await jumpTo(page, { floorId: 1, x: 11, y: 33, facing: 1, autosave: false });
  await cap("11-hall-center-east-11x33.png");

  // Oblique gate views from the hall corners.
  await jumpTo(page, { floorId: 1, x: 9, y: 33, facing: 0, autosave: false });
  await cap("12-oblique-west-9x33-n.png");
  await jumpTo(page, { floorId: 1, x: 13, y: 33, facing: 0, autosave: false });
  await cap("13-oblique-east-13x33-n.png");

  // Hugging the gate from each flank cell.
  await jumpTo(page, { floorId: 1, x: 9, y: 31, facing: 1, autosave: false });
  await cap("14-hug-west-9x31-e.png");
  await jumpTo(page, { floorId: 1, x: 13, y: 31, facing: 3, autosave: false });
  await cap("15-hug-east-13x31-w.png");
  await jumpTo(page, { floorId: 1, x: 10, y: 31, facing: 0, autosave: false });
  await cap("16-beside-gate-10x31-n.png");
  await jumpTo(page, { floorId: 1, x: 12, y: 31, facing: 0, autosave: false });
  await cap("17-beside-gate-12x31-n.png");

  // The crossing.
  await jumpTo(page, { floorId: 1, x: 11, y: 31, facing: 0, autosave: false });
  await cap("18-threshold-11x31-n.png");
  await act(page, "ArrowUp"); await cap("19-crossing-11x30.png");
  await act(page, "ArrowUp"); await cap("20-beyond-11x29.png");
  // (11,29) hosts the Second Survey NPC panel — close it before jumping.
  await act(page, "Escape");
  await page.waitForTimeout(300);

  // Backward views after crossing.
  await jumpTo(page, { floorId: 1, x: 11, y: 30, facing: 2, autosave: false });
  await cap("21-back-11x30-s.png");
  await jumpTo(page, { floorId: 1, x: 11, y: 29, facing: 2, autosave: false });
  await cap("22-back-11x29-s.png");

  console.log(`browser errors: ${JSON.stringify(errors)}`);
} finally {
  await browser.close();
}
