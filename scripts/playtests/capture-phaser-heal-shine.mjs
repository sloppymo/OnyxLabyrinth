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

/**
 * Watch the Shine sweep per frame, counting distinct `gradient.offset` values.
 *
 * "A Shine exists and is disposed" was the old bar, and it is the same bar the
 * cast bloom cleared while its envelope was a silent no-op. `offset` is the
 * property `AddEffectShine`'s tween actually animates (its `targets[0]` is the
 * gradient), so a frozen sweep — tween created but not advancing, e.g. if
 * timeScale were ever pinned to 0 — shows up as a single distinct value.
 */
async function watchShine(page, ms) {
  return page.evaluate(async (duration) => {
    const probe = window.__onyxPhaserDissolves;
    if (!probe) return null;
    return await new Promise((resolve) => {
      const seen = new Map();
      let peakShines = 0;
      let frames = 0;
      const end = performance.now() + duration;
      const tick = () => {
        const d = probe();
        frames++;
        if (d) peakShines = Math.max(peakShines, d.shines);
        for (const s of d?.shineOffsets ?? []) {
          let set = seen.get(s.key);
          if (!set) {
            set = new Set();
            seen.set(s.key, set);
          }
          set.add(Math.round(s.offset * 1000) / 1000);
        }
        if (performance.now() < end) requestAnimationFrame(tick);
        else {
          resolve({
            frames,
            peakShines,
            perKey: [...seen].map(([key, set]) => ({ key, steps: set.size })),
          });
        }
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

/**
 * Walk a caster's spell list looking for one that produces a Shine, since the
 * first spell in the list is usually offensive.
 */
async function huntHeal(page, findings) {
  let peakShines = 0;
  let shotTaken = false;
  let bestSteps = 0;
  let sweepFrames = 0;
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

    // Sample per frame while the spell resolves — SHINE_MS is 620ms, and a
    // 45ms poll lands ~13 samples across a sweep whose motion is the point.
    const w = await watchShine(page, 1200);
    if (w) {
      sweepFrames += w.frames;
      peakShines = Math.max(peakShines, w.peakShines);
      for (const k of w.perKey) bestSteps = Math.max(bestSteps, k.steps);
      if (w.peakShines > 0 && !shotTaken) {
        await shot(page, outDir, "01-heal-shine.png");
        shotTaken = true;
        console.log(`    sweep: ${JSON.stringify(w.perKey)} over ${w.frames} frames`);
      }
    }
    await waitForIdle(page, 8000);
    if (peakShines > 0) return { found: true, peakShines, bestSteps, sweepFrames };
  }
  return { found: peakShines > 0, peakShines, bestSteps, sweepFrames };
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

  // Hold Shift for 2x playback and watch whether the rate leaks onto the
  // TweenManager. The probe reads the scene's playback rate too, so it can tell
  // us whether the precondition ever held rather than passing vacuously.
  //
  // Shift is only honoured while `phase === "playback"` (combat-ui syncPlaybackRate),
  // so a turn has to be in flight — holding it at an idle palette leaves the
  // rate at 1, where correct and global-scaling code write the same value.
  let globalScale = null;
  let st2 = await snap(page);
  if (st2.route === "combat") {
    if (st2.combat?.phase === "palette") {
      await press(page, "Enter", 1, 80);
      const t = await snap(page);
      if (t.combat?.phase === "selectTarget") await press(page, "Enter", 1, 80);
    }
    await page.keyboard.down("Shift");
    globalScale = await page.evaluate(async () => {
      const probe = window.__onyxPhaserDissolves;
      if (!probe) return null;
      return await new Promise((resolve) => {
        let peakRate = 0;
        let peakManager = 1;
        const end = performance.now() + 700;
        const tick = () => {
          const d = probe();
          if (d) {
            peakRate = Math.max(peakRate, d.playbackRate ?? 0);
            if (d.managerTimeScale !== 1) peakManager = d.managerTimeScale;
          }
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve({ peakRate, peakManager });
        };
        requestAnimationFrame(tick);
      });
    });
    await page.keyboard.up("Shift");
    console.log(`  hold-Shift probe: ${JSON.stringify(globalScale)}`);
  }

  if (!result.found) {
    findings.find(
      "P1",
      0,
      "no heal Shine observed",
      "no cast in this Arena fight produced a green popup within the sampled window"
    );
  } else {
    console.log(`  OK: Shine fired on a healed body (peak ${result.peakShines})`);
    // Existence is not animation — see the cast bloom. The sweep must move.
    if (result.bestSteps < 2) {
      findings.find(
        "P0",
        0,
        "heal Shine sweep frozen",
        `gradient.offset took only ${result.bestSteps} distinct value(s) across ${result.sweepFrames} frames — the tween is not advancing the sweep`
      );
    } else {
      console.log(`  OK: Shine sweep advances (${result.bestSteps} distinct gradient offsets)`);
    }
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

  if (globalScale) {
    // Shine tweens must be retimed per-tween, never by scaling the TweenManager:
    // its global value multiplies into every tween in the scene, so pinning it
    // to playback rate silently retimes anything added later by unrelated code.
    //
    // Sampled under hold-Shift because at 1x both implementations write the same
    // value and the check is blind. This replaces a check on `tweenTimeScale`,
    // which fell back to the manager's value once no Shine was live and read 1 —
    // green — even with the sweep deliberately frozen.
    if (globalScale.peakRate <= 1) {
      console.log(
        `  NOTE: playback never exceeded 1x (peak ${globalScale.peakRate}) — global-scale check is blind, skipped`
      );
    } else if (globalScale.peakManager !== 1) {
      findings.find(
        "P0",
        0,
        "global tween timeScale scaled",
        `TweenManager.timeScale reached ${globalScale.peakManager} at ${globalScale.peakRate}x playback — rate is applied globally instead of per-tween`
      );
    } else {
      console.log(
        `  OK: TweenManager global timeScale stayed 1 at ${globalScale.peakRate}x playback (per-tween scaling only)`
      );
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
  writeReport(outDir, { title: "phaser-heal-shine", findings: list, errors, base: BASE });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log(`shots → ${outDir}`);
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
