/**
 * Cast-path presentation capture.
 *
 * Closes the evidence gaps left by Phases 1-3: the spotlight Glow/ColorMatrix,
 * the Mag-vs-Tech impact language, and the cast banner all engage only while
 * `CombatScene.banner` is set, which pressing Enter (Attack) never produces.
 * `castFirstSpell` drives a real spell, and this script samples the camera
 * filter list across the cast so the spotlight add/remove path is exercised
 * in-browser rather than only in `combat-phaser-fx.test.ts`.
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/capture-phaser-cast-fx.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  press,
  snap,
  castFirstSpell,
  useFirstTechnique,
  createFindings,
  writeReport,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/";
const outDir = ensureOutDir("playtest-screenshots/phaser-cast-fx");

/** Sample the filter list in-page while the cast plays out. */
async function startFilterRecorder(page) {
  await page.evaluate(() => {
    window.__fxTrace = [];
    window.__fxTimer = setInterval(() => {
      const f = window.__onyxPhaserFilters?.();
      if (f) window.__fxTrace.push(f);
    }, 40);
  });
}

async function stopFilterRecorder(page) {
  return page.evaluate(() => {
    clearInterval(window.__fxTimer);
    const t = window.__fxTrace ?? [];
    return {
      samples: t.length,
      gateOpen: t.filter((s) => s.gate).length,
      maxExternal: Math.max(0, ...t.map((s) => s.external)),
      maxInternal: Math.max(0, ...t.map((s) => s.internal)),
      maxSpotlightExternal: Math.max(0, ...t.map((s) => s.spotlightExternal ?? 0)),
      bloomSamples: t.filter((s) => s.bloom).length,
      bloomOutsideBanner: t.filter((s) => s.bloom && !s.gate).length,
      keys: [...new Set(t.map((s) => s.key).filter(Boolean))],
      webgl: t[0]?.webgl ?? null,
    };
  });
}

async function bootArenaCombat(page, query = "") {
  await page.goto(`${BASE}?debug=1${query}`, { waitUntil: "networkidle" });
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

const { browser, page, errors } = await launch({
  viewport: { width: 1100, height: 900 },
});
const findings = createFindings({ page, outDir, errors });

try {
  const st = await bootArenaCombat(page);
  if (st.route !== "combat") {
    findings.find("P0", 0, "reach combat", `route=${st.route}`);
  } else {
    console.log("  OK: reached combat");
  }

  await startFilterRecorder(page);
  const result = await castFirstSpell(page);
  console.log("  cast:", JSON.stringify(result));

  // Grab the banner frame while the spell resolves.
  await shot(page, outDir, "01-cast-midflight.png");
  await wait(220);
  await shot(page, outDir, "02-cast-impact.png");
  await waitForIdle(page, 10000);
  await shot(page, outDir, "03-cast-settled.png");

  const trace = await stopFilterRecorder(page);
  console.log("  filters:", JSON.stringify(trace));

  if (!result.cast) {
    findings.find(
      "P1",
      0,
      "no castable spell found",
      `tried ${result.actorTried} actors — Arena roster may have no SP`
    );
  } else {
    console.log("  OK: spell cast drove the banner path");
  }

  if (trace.gateOpen === 0) {
    findings.find(
      "P1",
      0,
      "spotlight gate never opened during cast",
      JSON.stringify(trace)
    );
  } else {
    console.log(`  OK: spotlight engaged (${trace.gateOpen}/${trace.samples} samples)`);
  }

  // Budget policy: the spotlight owns at most one external Glow + one internal
  // ColorMatrix, and the cast bloom may add one more external ParallelFilters
  // but ONLY inside its <=180ms pulse. A bare count cap would be tripped by the
  // bloom legitimately, so assert the two properties separately.
  if (trace.maxSpotlightExternal > 1 || trace.maxInternal > 1) {
    findings.find(
      "P0",
      0,
      "spotlight filter leak during cast",
      `peak spotlight external=${trace.maxSpotlightExternal} internal=${trace.maxInternal}`
    );
  } else if (trace.gateOpen > 0) {
    console.log(
      `  OK: spotlight bounded through recipe churn (keys: ${trace.keys.join(", ")})`
    );
  }

  if (trace.bloomOutsideBanner > 0) {
    findings.find(
      "P0",
      0,
      "cast bloom outlived its banner",
      `${trace.bloomOutsideBanner} samples with bloom live and no banner up`
    );
  } else if (trace.bloomSamples > 0) {
    console.log(
      `  OK: cast bloom pulsed and tore down (${trace.bloomSamples} samples, none outside the banner)`
    );
  } else {
    console.log("  NOTE: bloom never sampled — pulse is <=180ms, may fall between 40ms ticks");
  }

  // Phase 2 evidence: the Mag frame above vs a Tech frame from a fresh fight,
  // so the two impact languages can be compared without reading the banner.
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await waitForIdle(page, 10000);
  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    if ((await snap(page)).route === "combat") break;
  }
  const tech = await useFirstTechnique(page);
  console.log("  technique:", JSON.stringify(tech));
  await shot(page, outDir, "04-tech-midflight.png");
  await wait(220);
  await shot(page, outDir, "05-tech-impact.png");
  await waitForIdle(page, 10000);
  if (!tech.used) {
    findings.find(
      "P1",
      0,
      "no technique available",
      `tried ${tech.actorTried} actors — Arena roster may be all casters`
    );
  } else {
    console.log("  OK: technique drove the Tech impact path");
  }

  const pageErrors = errors.filter((e) => e.startsWith("pageerror:"));
  if (pageErrors.length) {
    findings.find("P0", 0, "pageerrors during cast", pageErrors.join(" | "));
  } else {
    console.log("  OK: no pageerrors");
  }
} catch (e) {
  findings.find("P0", 0, "capture script threw", String(e));
  console.error(e);
} finally {
  await findings.flush();
  const list = findings.findings;
  writeReport(outDir, {
    title: "phaser-cast-fx",
    findings: list,
    errors,
    base: BASE,
  });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log(`shots → ${outDir}`);
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
