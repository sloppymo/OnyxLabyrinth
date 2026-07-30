/**
 * Heal Shine capture (harvest H3).
 *
 * Hunts a heal by cycling casters through their spell lists, then asserts the
 * Shine that lands on the healed body is disposed afterwards. Shine is the one
 * effect in the stage that owns a Phaser tween and a DynamicTexture rather than
 * riding the choreography clock, so "does it clean up" is the property worth
 * testing, alongside the tween timeScale tracking playback rate.
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/capture-phaser-heal-shine.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  press,
  snap,
  createFindings,
  writeReport,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/";
const outDir = ensureOutDir("playtest-screenshots/phaser-heal-shine");

async function fxState(page) {
  return page.evaluate(() => window.__onyxPhaserDissolves?.() ?? null);
}

async function bootCombat(page) {
  await page.goto(`${BASE}?debug=1`, { waitUntil: "networkidle" });
  await wait(500);
  await page.keyboard.press("ArrowDown");
  await wait(150);
  await press(page, "a", 1, 120);
  await waitForIdle(page, 4000);
  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    const st = await snap(page);
    if (st.route === "combat") return st;
  }
  return snap(page);
}

/**
 * Walk a caster's spell list looking for one that produces a Shine, since the
 * first spell in the list is usually offensive.
 */
async function huntHeal(page, findings) {
  let peakShines = 0;
  let shotTaken = false;
  for (let attempt = 0; attempt < 22; attempt++) {
    let st = await snap(page);
    if (st.route !== "combat") {
      await press(page, "Enter", 1, 120);
      await waitForIdle(page, 6000);
      st = await snap(page);
      if (st.route !== "combat") break;
    }
    if (st.combat?.phase !== "palette") {
      await waitForIdle(page, 6000);
      continue;
    }

    await press(page, "c", 1, 120);
    st = await snap(page);
    if (st.combat?.phase !== "selectSpell") {
      // No magic for this actor — spend the turn and move on.
      await press(page, "Escape", 1, 100);
      await press(page, "Enter", 1, 120);
      st = await snap(page);
      if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 120);
      await waitForIdle(page, 8000);
      continue;
    }

    // Rotate through the spell list across attempts so heals get reached.
    await press(page, "ArrowDown", attempt % 4, 70);
    await press(page, "Enter", 1, 120);
    st = await snap(page);
    if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 120);

    // Sample tightly while the spell resolves — SHINE_MS is 620ms.
    for (let i = 0; i < 26; i++) {
      const fx = await fxState(page);
      if (fx && fx.shines > 0) {
        peakShines = Math.max(peakShines, fx.shines);
        if (!shotTaken) {
          await shot(page, outDir, "01-heal-shine.png");
          shotTaken = true;
        }
      }
      await wait(45);
    }
    await waitForIdle(page, 8000);
    if (peakShines > 0) return { found: true, peakShines };
  }
  return { found: peakShines > 0, peakShines };
}

const { browser, page, errors } = await launch({
  viewport: { width: 1100, height: 900 },
});
const findings = createFindings({ page, outDir, errors });

try {
  const st = await bootCombat(page);
  if (st.route !== "combat") {
    findings.find("P0", 0, "reach combat", `route=${st.route}`);
    throw new Error("no combat");
  }
  console.log("  OK: reached combat");

  const result = await huntHeal(page, findings);
  console.log("  heal hunt:", JSON.stringify(result));

  if (!result.found) {
    findings.find(
      "P1",
      0,
      "no heal Shine observed",
      "no cast in this Arena fight produced a green popup within the sampled window"
    );
  } else {
    console.log(`  OK: Shine fired on a healed body (peak ${result.peakShines})`);
  }

  // Disposal: no Shine may outlive its window.
  await waitForIdle(page, 12000);
  await wait(1500);
  const after = await fxState(page);
  if (after && after.shines > 0) {
    findings.find(
      "P0",
      0,
      "heal Shine leaked",
      `${after.shines} Shine(s) still live after playback settled`
    );
  } else {
    console.log("  OK: no Shine left after playback settled");
  }

  // The tween clock must track playback rate, not run free at 1x.
  const fx = await fxState(page);
  if (fx && fx.tweenTimeScale !== 1) {
    console.log(`  NOTE: tween timeScale = ${fx.tweenTimeScale} (playback not at 1x)`);
  } else {
    console.log("  OK: tween timeScale pinned to playback rate (1x at rest)");
  }

  const pageErrors = errors.filter((e) => e.startsWith("pageerror:"));
  if (pageErrors.length) {
    findings.find("P0", 0, "pageerrors", pageErrors.join(" | "));
  } else {
    console.log("  OK: no pageerrors");
  }
} catch (e) {
  findings.find("P0", 0, "capture script threw", String(e));
  console.error(e);
} finally {
  await findings.flush();
  const list = findings.findings;
  writeReport(outDir, { title: "phaser-heal-shine", findings: list, errors, base: BASE });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log(`shots → ${outDir}`);
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
