/**
 * Arena freeze verification (2026-08-01).
 *
 * Confirms the causal chain behind "I select an action and it doesn't run the
 * animation": an uncaught TypeError inside Phaser's `scene.update` stops
 * Phaser's RequestAnimationFrame loop for good (it reschedules only *after*
 * `callback()` returns), so the battle canvas stops repainting while the DOM
 * menus and the combat logic — which run on combat-ui's own RAF — keep going.
 *
 * Evidence collected: screenshot hashes of the combat canvas sampled during
 * playback, before and after the first pageerror. Identical hashes across a
 * whole action = the canvas is frozen.
 *
 * Run: node scripts/playtests/arena-freeze-verify.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is running)
 */
import { launch, wait, press, snap, ensureAudioResumed } from "./lib.mjs";
import crypto from "crypto";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const log = (...a) => console.log(...a);

let firstError = null;
page.on("pageerror", (e) => {
  if (!firstError) firstError = { at: Date.now(), message: e.message };
  log(`  !!! pageerror: ${e.message}`);
});

const hash = async () => {
  const buf = await page.screenshot();
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
};

/** Sample distinct canvas hashes across one action's playback. */
async function sampleFrames(label, samples = 10, interval = 120) {
  const seen = [];
  for (let i = 0; i < samples; i++) {
    seen.push(await hash());
    await wait(interval);
  }
  const distinct = new Set(seen).size;
  log(`  ${label}: ${distinct} distinct frames of ${samples}  ${distinct === 1 ? "<<< FROZEN" : ""}`);
  return distinct;
}

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);
  await press(page, "a");
  await wait(600);
  await press(page, "ArrowDown", 4, 150); // level 12 — long fights, many heals
  await press(page, "Enter");
  await wait(3000);

  const before = [];
  const after = [];

  for (let turn = 0; turn < 40; turn++) {
    let st = await snap(page);
    if (st.route !== "combat") {
      log(`turn ${turn}: route=${st.route} — leaving`);
      break;
    }
    if (st.combat?.phase !== "palette") {
      await wait(300);
      continue;
    }
    const wasErrored = !!firstError;
    await press(page, "a", 1, 120);
    st = await snap(page);
    if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 120);

    const distinct = await sampleFrames(`turn ${turn} (${wasErrored ? "AFTER error" : "pre-error"})`);
    (wasErrored ? after : before).push(distinct);

    if (after.length >= 4) break;
  }

  log("\n--- verdict ---");
  log(`pre-error  distinct-frame counts: ${JSON.stringify(before)}`);
  log(`post-error distinct-frame counts: ${JSON.stringify(after)}`);
  log(`first error: ${firstError ? firstError.message : "(never fired)"}`);
  log(`all errors: ${JSON.stringify(errors)}`);
} catch (e) {
  log("script threw:", e);
} finally {
  await browser.close();
}
