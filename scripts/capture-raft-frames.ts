/**
 * Capture 3 genuinely different raft-animation frames for PR visual verification.
 * Uses ?debug=1 to enable the __onyxDebug API.
 *
 * Raft route trigger: player must be AT the fromDock (14,21) and move east.
 * So we jump to (13,21) facing east, press ArrowUp to step onto (14,21),
 * then press ArrowUp again to trigger the raft route (player at dock, moving east).
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const URL = process.env.GAME_URL ?? "http://localhost:5179/OnyxLabyrinth/?debug=1";
const OUT_DIR = "playtest-screenshots/floor1-redesign";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("console", (msg) => console.log(`[${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log(`[pageerror]`, err.message));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window as any).__onyxDebug, { timeout: 15000 });
  console.log("Debug API available");

  // Jump to (13,21) facing east with raft
  await page.evaluate(() => {
    const dbg = (window as any).__onyxDebug;
    dbg.state.keyItems = ["raft"];
    dbg.jumpTo({ floorId: 1, x: 13, y: 21, facing: 1, clearUnlockedDoors: true });
  });
  console.log("Jumped to (13,21) facing east with raft");
  await page.waitForTimeout(500);

  // Step 1: Press ArrowUp to step onto dock (14,21)
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  const afterStep1 = await page.evaluate(() => {
    const dbg = (window as any).__onyxDebug;
    return { mode: dbg.state.mode, x: dbg.state.player.x, y: dbg.state.player.y };
  });
  console.log("After step onto dock:", JSON.stringify(afterStep1));

  // Step 2: Press ArrowUp again to trigger raft route (player at dock, moving east)
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  const afterStep2 = await page.evaluate(() => {
    const dbg = (window as any).__onyxDebug;
    return { mode: dbg.state.mode, x: dbg.state.player.x, y: dbg.state.player.y };
  });
  console.log("After raft trigger:", JSON.stringify(afterStep2));

  // Dismiss boarding dialog with Enter (may need 2 presses due to justOpened flag)
  await page.keyboard.press("Enter");
  await page.waitForTimeout(50);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);

  const afterEnter = await page.evaluate(() => {
    const dbg = (window as any).__onyxDebug;
    return { mode: dbg.state.mode, x: dbg.state.player.x, y: dbg.state.player.y };
  });
  console.log("After Enter (dialog dismissed):", JSON.stringify(afterEnter));

  // Capture frames at different animation times (600ms total: 3 steps × 200ms)
  const frames = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const results: { delay: number; dataUrl: string }[] = [];
    for (const delay of [50, 300, 550]) {
      await new Promise((r) => setTimeout(r, delay));
      results.push({ delay, dataUrl: canvas.toDataURL("image/png") });
    }
    return results;
  });

  mkdirSync(OUT_DIR, { recursive: true });
  for (const frame of frames) {
    const filename = `raft-anim-${frame.delay}ms.png`;
    const base64 = frame.dataUrl.split(",")[1];
    writeFileSync(join(OUT_DIR, filename), Buffer.from(base64, "base64"));
    console.log(`Captured ${filename}`);
  }

  const hashes = frames.map((f) => {
    const buf = Buffer.from(f.dataUrl.split(",")[1], "base64");
    return createHash("md5").update(buf).digest("hex");
  });
  console.log("Frame hashes:", hashes);
  const allSame = hashes[0] === hashes[1] && hashes[1] === hashes[2];
  console.log(allSame ? "WARNING: All frames identical!" : "Frames are genuinely different.");

  // Check final state
  const finalState = await page.evaluate(() => {
    const dbg = (window as any).__onyxDebug;
    return { mode: dbg.state.mode, x: dbg.state.player.x, y: dbg.state.player.y, facing: dbg.state.player.facing };
  });
  console.log("Final state:", JSON.stringify(finalState));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
