/**
 * Death-dissolve capture (harvest H1).
 *
 * Auto-battles an Arena fight and screenshots the moment an actor's texture key
 * flips to its death strip, so the Pixelate + grayscale ramp can be eyeballed
 * mid-dissolve rather than after the corpse has already faded out.
 *
 * Also asserts the per-sprite filters are torn down: once no actor is in a death
 * state, no dissolve controllers may remain on any sprite.
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/capture-phaser-death-dissolve.mjs
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
const outDir = ensureOutDir("playtest-screenshots/phaser-death-dissolve");

/**
 * Actors currently showing a death strip.
 *
 * Party sprites use `party:<class>:death` but enemies go through
 * `enemyStripState`, which names the same state `defeated` — match both or
 * every enemy death is invisible to this script.
 */
const DEATH_TEX = /death|defeated/i;

async function dyingActors(page) {
  return page.evaluate(() => {
    const actors = window.__onyxPhaserActors?.() ?? [];
    return actors
      .filter((a) => typeof a.tex === "string" && /death|defeated/i.test(a.tex))
      .map((a) => ({ key: a.key, tex: a.tex }));
  });
}
void DEATH_TEX;

async function dissolveCount(page) {
  return page.evaluate(() => window.__onyxPhaserDissolves?.() ?? null);
}

const { browser, page, errors } = await launch({
  viewport: { width: 1100, height: 900 },
});
const findings = createFindings({ page, outDir, errors });

try {
  await page.goto(`${BASE}?debug=1`, { waitUntil: "networkidle" });
  await wait(500);
  await page.keyboard.press("ArrowDown");
  await wait(150);
  await press(page, "a", 1, 120);
  await waitForIdle(page, 4000);
  let st;
  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    st = await snap(page);
    if (st.route === "combat") break;
  }
  if (st?.route !== "combat") {
    findings.find("P0", 0, "reach combat", `route=${st?.route}`);
    throw new Error("no combat");
  }
  console.log("  OK: reached combat");

  // Auto-battle so kills happen without per-turn driving.
  await press(page, "q", 1, 150);

  let caught = 0;
  let peakDissolves = 0;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && caught < 3) {
    const dying = await dyingActors(page);
    const d = await dissolveCount(page);
    if (d && d.active > peakDissolves) peakDissolves = d.active;
    if (dying.length > 0) {
      caught++;
      await shot(page, outDir, `0${caught}-death-${dying[0].key.replace(/[^a-z0-9]/gi, "-")}.png`);
      console.log(`  caught death frame ${caught}: ${dying.map((a) => a.tex).join(", ")}`);
      // Let this death finish before hunting the next one.
      await wait(700);
    }
    const s = await snap(page);
    if (s.route !== "combat") break;
    await press(page, "Enter", 1, 40);
  }

  if (caught === 0) {
    findings.find("P1", 0, "no death frame captured", "auto-battle produced no visible death strip");
  } else {
    console.log(`  OK: captured ${caught} death frame(s); peak live dissolves = ${peakDissolves}`);
  }

  // Teardown check: settle, then no dissolve controllers may be left alive.
  await waitForIdle(page, 12000);
  await wait(1200);
  const after = await dissolveCount(page);
  if (after && after.active > 0) {
    const stillDying = await dyingActors(page);
    if (stillDying.length === 0) {
      findings.find(
        "P0",
        0,
        "death dissolve leaked",
        `${after.active} controllers live with no actor in a death state`
      );
    }
  } else {
    console.log("  OK: no dissolve controllers left after deaths settled");
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
  writeReport(outDir, { title: "phaser-death-dissolve", findings: list, errors, base: BASE });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log(`shots → ${outDir}`);
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
