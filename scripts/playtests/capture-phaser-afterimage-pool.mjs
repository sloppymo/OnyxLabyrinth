/**
 * Walk afterimage + GO pooling capture (harvest H5 + H6).
 *
 * Two properties, one Arena fight:
 *
 *  H5 — ghosts exist only while somebody is walking. Melee approach comes free
 *       from a plain Attack, so unlike the heal Shine hunt there is no RNG to
 *       fight; the trail is sampled tightly through the walk-forward.
 *
 *  H6 — the pools actually reuse. This is the assertion that has teeth: pool
 *       *size* cannot distinguish reuse from destroy-and-recreate (both report
 *       the same number), so the check is that each pool's monotonic `created`
 *       counter plateaus while `sceneParticles` keeps churning. A regression to
 *       the old destroy-every-frame code makes `created` climb without bound.
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/capture-phaser-afterimage-pool.mjs
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
const outDir = ensureOutDir("playtest-screenshots/phaser-afterimage-pool");

async function pools(page) {
  return page.evaluate(() => window.__onyxPhaserPools?.() ?? null);
}

/**
 * Sample the pool probe from inside the page's own rAF loop for `ms`.
 *
 * Polling over the CDP boundary lands a sample every ~60-90ms, which badly
 * under-measures a 435ms approach — the widest part of the trail occupies a
 * window of a few frames and is simply missed. This watches every frame.
 */
async function watchGhosts(page, ms) {
  return page.evaluate(async (duration) => {
    const probe = window.__onyxPhaserPools;
    if (!probe) return null;
    return await new Promise((resolve) => {
      let peakLive = 0;
      let peakSpread = 0;
      let frames = 0;
      const end = performance.now() + duration;
      const tick = () => {
        const p = probe();
        frames++;
        if (p) {
          peakLive = Math.max(peakLive, p.ghosts.live);
          peakSpread = Math.max(peakSpread, p.ghostSpreadPx);
        }
        if (performance.now() < end) requestAnimationFrame(tick);
        else resolve({ peakLive, peakSpread, frames });
      };
      requestAnimationFrame(tick);
    });
  }, ms);
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

  const baseline = await pools(page);
  if (!baseline) {
    findings.find("P0", 0, "no pool probe", "__onyxPhaserPools missing (canvas stage?)");
    throw new Error("no probe");
  }

  // --- H5: sample the walk tightly, looking for live ghosts ----------------
  //
  // The screenshot must be taken at peak separation, NOT at the first frame a
  // ghost exists. The trail is sampled as a fraction of the move and the move
  // eases in, so the earliest ghost sits ~1px behind the body — a shot there
  // shows a perfectly working effect as nothing at all.
  let peakGhosts = 0;
  let peakSpread = 0;
  let shotSpread = 0;
  let sawParticleChurn = 0;

  // When the afterimage is off there is nothing to hunt, so take a single walk
  // (enough to assert no ghosts are drawn) and leave the rest of the fight for
  // the pooling window below — otherwise this loop burns all 8 turns looking
  // for a trail that cannot appear, and H6 measures an empty scene.
  const walkTurns = baseline.afterimageEnabled ? 8 : 1;
  for (let turn = 0; turn < walkTurns && peakGhosts === 0; turn++) {
    const s = await snap(page);
    if (s.route !== "combat") break;
    if (s.combat?.phase !== "palette") {
      await waitForIdle(page, 6000);
      continue;
    }
    // Plain Attack -> walk forward.
    await press(page, "Enter", 1, 100);
    const t = await snap(page);
    if (t.combat?.phase === "selectTarget") await press(page, "Enter", 1, 100);

    // Per-frame in-page measurement across the whole approach + return.
    const watched = await watchGhosts(page, 1800);
    if (watched) {
      peakGhosts = Math.max(peakGhosts, watched.peakLive);
      peakSpread = Math.max(peakSpread, watched.peakSpread);
      console.log(
        `  walk sampled over ${watched.frames} frames:` +
          ` peakLive=${watched.peakLive} peakSpread=${watched.peakSpread.toFixed(1)}px`
      );
    }
    // Best-effort visual, sampled coarsely; the numbers above are the evidence.
    for (let i = 0; i < 12; i++) {
      const p = await pools(page);
      if (p) {
        sawParticleChurn = Math.max(sawParticleChurn, p.sceneParticles);
        if (p.ghosts.live > 0 && p.ghostSpreadPx > shotSpread) {
          shotSpread = p.ghostSpreadPx;
          await shot(page, outDir, "01-walk-afterimage.png");
        }
      }
      await wait(35);
    }
    await waitForIdle(page, 8000);
  }

  // H5 ships disabled (see PHASER_FX_AFTERIMAGE — the trail is real but does
  // not read over a 35px approach). Assert whichever contract is in force, so
  // this stays meaningful either way rather than quietly passing.
  const MIN_SPREAD_PX = 12;
  if (!baseline.afterimageEnabled) {
    if (peakGhosts > 0) {
      findings.find(
        "P0",
        0,
        "afterimage drawn while disabled",
        `PHASER_FX_AFTERIMAGE is off but ${peakGhosts} ghost(s) were drawn`
      );
    } else {
      console.log("  NOTE: afterimage disabled by flag — trail assertions skipped");
    }
  } else if (peakGhosts === 0) {
    findings.find(
      "P1",
      0,
      "no afterimage observed",
      "no walk-forward sampled with live ghosts"
    );
  } else if (peakSpread < MIN_SPREAD_PX) {
    // Counting ghosts is not enough: three ghosts stacked on the body is a
    // no-op that still reports 3. Require a trail wide enough to actually read.
    findings.find(
      "P0",
      0,
      "afterimage trail collapsed",
      `peak ghost spread ${peakSpread.toFixed(1)}px < ${MIN_SPREAD_PX}px — ghosts are stacked, not trailing`
    );
  } else {
    console.log(
      `  OK: afterimage trail live during walk (peak ${peakGhosts} ghosts,` +
        ` spread ${peakSpread.toFixed(1)}px)`
    );
  }

  // Ghosts must not linger once nobody is walking.
  await waitForIdle(page, 10000);
  await wait(600);
  const atRest = await pools(page);
  if (atRest && atRest.ghosts.live > 0) {
    findings.find(
      "P0",
      0,
      "afterimage leaked",
      `${atRest.ghosts.live} ghost(s) still drawn with no walk in flight`
    );
  } else {
    console.log("  OK: no ghosts drawn at rest");
  }

  // --- H6: `created` must plateau while the scene keeps churning ----------
  // Must stay inside ONE fight: Next Fight builds a fresh Phaser.Game, which
  // means fresh pools with `created` back at 0 — chaining fights would make the
  // allocation delta meaningless. So drive attack turns (each one spawns hit
  // particles) and keep the last reading taken while still in combat.
  const mark = await pools(page);
  let churnSamples = 0;
  let after = mark;
  for (let turn = 0; turn < 10; turn++) {
    const s = await snap(page);
    if (s.route !== "combat") break;
    if (s.combat?.phase === "palette") {
      await press(page, "Enter", 1, 80);
      const t = await snap(page);
      if (t.combat?.phase === "selectTarget") await press(page, "Enter", 1, 80);
    }
    // Sample per-frame through the impact, where particles actually live.
    const w = await page.evaluate(async () => {
      const probe = window.__onyxPhaserPools;
      if (!probe) return null;
      return await new Promise((resolve) => {
        let churn = 0;
        let last = null;
        const end = performance.now() + 1400;
        const tick = () => {
          const p = probe();
          if (p) {
            last = p;
            if (p.sceneParticles > 0) churn++;
          }
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve({ churn, last });
        };
        requestAnimationFrame(tick);
      });
    });
    if (w?.last) {
      after = w.last;
      churnSamples += w.churn;
    }
    await waitForIdle(page, 8000);
  }

  if (!after || !mark) {
    findings.find("P1", 0, "pool probe vanished", "combat ended before the churn window");
  } else {
    const grew = {
      particles: after.particles.created - mark.particles.created,
      effectSprites: after.effectSprites.created - mark.effectSprites.created,
      effectArcs: after.effectArcs.created - mark.effectArcs.created,
      ghosts: after.ghosts.created - mark.ghosts.created,
    };
    console.log(`  churn samples with live particles: ${churnSamples}`);
    console.log(`  allocations during churn window: ${JSON.stringify(grew)}`);
    console.log(
      `  pool sizes: particles=${after.particles.size} effectSprites=${after.effectSprites.size}` +
        ` effectArcs=${after.effectArcs.size} ghosts=${after.ghosts.size}`
    );

    if (churnSamples < 3) {
      // Don't claim a green tick on an unexercised path — the same trap the
      // spotlight filter probe fell into when its gate never opened.
      console.log("  NOTE: little/no particle churn sampled; pooling not exercised");
    } else {
      // A pool is allowed to grow to its high-water mark, but 20s of combat
      // must not keep allocating. The old code allocated per particle per frame.
      const total = Object.values(grew).reduce((a, b) => a + b, 0);
      const cap = 200;
      if (total > cap) {
        findings.find(
          "P0",
          0,
          "pools not reusing",
          `${total} GOs allocated across ${churnSamples} particle-live frames (cap ${cap}) — ${JSON.stringify(grew)}`
        );
      } else {
        console.log(
          `  OK: allocations plateaued (${total} new GOs across ${churnSamples} particle-live frames)`
        );
      }
    }

    // The cap is a *retention* limit, not a draw ceiling: `end()` floors `keep`
    // at the live count, so a burst wider than the cap legitimately leaves the
    // pool oversized until the burst subsides (a 6-target heal spawns 16
    // sparkles each = 96). Only flag retention beyond what is actually drawn.
    for (const [name, p] of Object.entries(after)) {
      if (typeof p !== "object" || p === null) continue;
      const allowed = Math.max(96, p.live);
      if (p.size > allowed) {
        findings.find(
          "P0",
          0,
          "pool retained past cap",
          `${name} pool holds ${p.size} with only ${p.live} live (cap 96)`
        );
      }
    }
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
  writeReport(outDir, { title: "phaser-afterimage-pool", findings: list, errors, base: BASE });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log(`shots → ${outDir}`);
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
