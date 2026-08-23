/**
 * Diagnostic probe: does the visible target highlight in sparse Card Trial
 * actually follow keyboard ArrowRight/ArrowLeft during target phase, in the
 * SAME headless Playwright environment the frozen reference agent uses?
 *
 * Live adversarial browser testing (via a windowed/extension-driven Chrome
 * tab) found `debugView().selection.index` advancing correctly on ArrowRight
 * while the DOM `.targeted` chip class never moved, and traced that specific
 * tab to `document.visibilityState === "hidden"` with zero requestAnimationFrame
 * callbacks firing over a 2s window — i.e. the render tick loop was not
 * running at all in that tab. This script asks the decisive question: does
 * the same freeze happen in the frozen reference agent's own environment
 * (headless Playwright, `launch()` from lib.mjs)? If rAF ticks here and the
 * highlight follows the cursor, the P1 finding was a live-testing-tab
 * artifact, not a production defect, and this script becomes the permanent
 * regression fixture proving that going forward (see AGENTS/QA report §4).
 *
 * Expects a production preview:
 *   npx vite preview --port 5210 --strictPort --base /OnyxLabyrinth/
 *   node scripts/playtests/card-trial-target-cycling-probe.mjs
 */
import { launch, wait, snap, waitForIdle } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5210/OnyxLabyrinth/?debug=1";

function chipState(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".ct-actor-chip.enemy")].map((c) => ({
      actor: c.dataset.actor,
      targeted: c.classList.contains("targeted"),
    }))
  );
}

async function measureRaf(page, ms = 2000) {
  return page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const start = performance.now();
        let count = 0;
        function tick() {
          count++;
          if (performance.now() - start < dur) requestAnimationFrame(tick);
          else resolve({ count, visibility: document.visibilityState, hasFocus: document.hasFocus() });
        }
        requestAnimationFrame(tick);
      }),
    ms
  );
}

const { browser, page, errors } = await launch({ viewport: { width: 1400, height: 900 } });
const results = { pass: null, notes: [] };

try {
  console.log("=== environment check ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(400);
  const env = await measureRaf(page, 2000);
  console.log("rAF over 2s:", env);
  results.raf = env;
  if (env.count === 0) {
    results.pass = null;
    results.notes.push("rAF is dead in this environment too — probe is inconclusive, not a pass/fail.");
    throw new Error("INCONCLUSIVE: rAF not ticking in headless Playwright either");
  }

  console.log("=== boot Fight 5 (3 enemies: cleaver-busy, scrap-a, scrap-b) ===");
  await page.evaluate(() => window.__onyxDebug.cardTrial.startFight(5));
  await waitForIdle(page, 10000);
  let st = await snap(page);
  for (let i = 0; i < 40 && st.combat?.phase !== "hand"; i++) {
    await wait(200);
    st = await snap(page);
  }
  console.log("phase after boot:", st.combat?.phase, "route:", st.route);

  console.log("=== arm a single-target card ===");
  const handView = await page.evaluate(() => window.__onyxDebug.cardTrial.view());
  const targetIdx = handView.hand.findIndex((c) => c.defId !== "move" && !c.disabled);
  if (targetIdx < 0) throw new Error("no playable single-target card in Fight 5 opening hand");
  await page.keyboard.press(String(targetIdx + 1));
  await wait(150);
  st = await snap(page);
  if (st.combat?.phase !== "target") throw new Error(`expected phase "target", got "${st.combat?.phase}"`);

  const before = { index: st.combat.selection.index, entries: st.combat.selection.entries };
  const chipsBefore = await chipState(page);
  console.log("before ArrowRight:", before, chipsBefore);

  await page.keyboard.press("ArrowRight");
  await wait(150);
  st = await snap(page);
  const after = { index: st.combat.selection.index, entries: st.combat.selection.entries };
  const chipsAfter = await chipState(page);
  console.log("after ArrowRight:", after, chipsAfter);

  const expectedTargetedId = after.entries[after.index];
  const domTargetedId = chipsAfter.find((c) => c.targeted)?.actor?.replace(/^enemy:/, "") ?? null;

  results.indexMoved = after.index !== before.index;
  results.domFollowed = domTargetedId === expectedTargetedId;
  results.expectedTargetedId = expectedTargetedId;
  results.domTargetedId = domTargetedId;

  console.log("=== confirm with Enter, check which enemy actually took the hit ===");
  const enemiesBefore = st.combat.enemies;
  await page.keyboard.press("Enter");
  await waitForIdle(page, 8000);
  st = await snap(page);
  const enemiesAfter = st.combat.enemies;
  const hit = enemiesAfter.find((e, i) => e.hp < enemiesBefore[i].hp);
  results.cardResolvedAgainst = hit?.id ?? null;
  results.enterHitExpectedTarget = hit?.id === expectedTargetedId;

  results.pass = results.indexMoved && results.domFollowed && results.enterHitExpectedTarget;
  console.log("=== RESULT ===");
  console.log(JSON.stringify(results, null, 2));
  console.log(results.pass ? "PASS: highlight follows keyboard cursor; oracle silence was a live-tab artifact." : "FAIL: DOM does not follow the keyboard cursor even with rAF ticking — real defect.");
} catch (e) {
  console.error("PROBE ERROR:", e.message);
  results.error = e.message;
} finally {
  console.log("console/page errors captured:", errors);
  await browser.close();
}

process.exit(results.pass === false || results.error ? (results.error?.startsWith("INCONCLUSIVE") ? 2 : 1) : 0);
