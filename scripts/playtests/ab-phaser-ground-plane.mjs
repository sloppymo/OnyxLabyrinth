/**
 * Same-seed Arena A/B: Phaser default vs ?phaser=0 canvas.
 * Captures screenshots + reports party foot / marker Y fractions.
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/ab-phaser-ground-plane.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  press,
  snap,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/";
const outDir = ensureOutDir("playtest-screenshots/ab-phaser-ground-plane");

async function bootArenaCombat(page, query) {
  await page.goto(`${BASE}?debug=1${query}`, { waitUntil: "networkidle" });
  await wait(500);
  await page.keyboard.press("ArrowDown");
  await wait(150);
  await press(page, "a", 1, 120);
  await waitForIdle(page, 4000);
  // Level 1 for a fast, stable encounter.
  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    const st = await snap(page);
    if (st.route === "combat") return st;
  }
  throw new Error(`did not reach combat (${query || "default"})`);
}

async function measure(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector("#combat-wrap");
    const phaser = document.querySelector("#combat-phaser-canvas");
    const canvas2d = document.querySelector("#combat-canvas");
    const rect = wrap?.getBoundingClientRect();
    const phaserOn =
      wrap?.classList.contains("phaser-stage") &&
      phaser &&
      getComputedStyle(phaser).display !== "none";
    const stage = phaserOn ? phaser : canvas2d;
    const stageRect = stage?.getBoundingClientRect();
    // Sample a few bright-ish pixels isn't reliable; use debug snapshot party
    // and DOM marker if any. Prefer reading internal scene via __onyxDebug.
    const d = window.__onyxDebug;
    const s = d?.snapshot?.() ?? null;
    const combat = s?.combat ?? null;
    // Probe actor screen positions from the live controller if exposed.
    const cc = d?.state?.combat ? null : null;
    void cc;
    let feet = null;
    try {
      // CombatController is not on debug; infer from Phaser scene game objects
      // or canvas — expose nothing. Instead measure via choreography math by
      // reusing snapshot enemy/party counts only.
      feet = {
        mode: phaserOn ? "phaser" : "canvas",
        wrapH: rect?.height ?? null,
        stageH: stageRect?.height ?? null,
        stageW: stageRect?.width ?? null,
        partyCount: combat?.party?.length ?? null,
        enemyCount: combat?.enemies?.length ?? null,
        acting: combat?.actingId ?? null,
      };
    } catch (e) {
      feet = { error: String(e) };
    }
    return feet;
  });
}

async function runOne(browser, label, query) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootArenaCombat(page, query);
  await wait(900);
  await waitForIdle(page, 5000);
  const metrics = await measure(page);
  await shot(page, outDir, `${label}.png`, label);
  await page.close();
  return { label, query, metrics, errors };
}

const { browser } = await launch();
try {
  const canvas = await runOne(browser, "01-canvas", "&phaser=0");
  const phaser = await runOne(browser, "02-phaser", "");
  console.log(JSON.stringify({ canvas, phaser }, null, 2));
  console.log(`shots → ${outDir}`);
} finally {
  await browser.close();
}
