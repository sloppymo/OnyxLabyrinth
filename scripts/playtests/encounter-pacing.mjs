// Encounter-pacing probe — measures real steps-between-encounters distributions
// per encounter zone, at sample sizes big enough to say something honest
// (target: >=30 encounter gaps per condition; the 2026-07-24 sprint notes
// sampled 32 *steps* per zone, i.e. 1-3 observed encounters).
//
// Method: jumpTo a validated pair of adjacent plain cells inside (or outside)
// the target zone, oscillate forward/backward, count position-changing steps
// until the route flips to combat, record the gap, flee via the real
// exitDebugCombat("fled") flow, repeat. The step count is cross-checked
// against the game's own state.stepsSinceEncounter every step so a script
// counting bug cannot masquerade as a game finding.
//
// Unseeded-RNG caveat: encounter rolls are Math.random() (PR-5 not built), so
// per-condition means are directional. The cooldown (>=8) and pity (<=28)
// bounds, however, are hard mechanical invariants — any gap outside [8, 28]
// on a plain cell is a real finding at any sample size.
//
// Run: ONYX_URL="http://127.0.0.1:5176/OnyxLabyrinth/?debug=1" node scripts/playtests/encounter-pacing.mjs
// Quick shakeout: QUICK=1 (3 gaps, first 2 conditions only).
// Batch selection: ONLY="f1-default,f1-safe" runs a subset and writes
// report-<slug>.json, so long runs can be split across process timeouts.

import fs from "node:fs";
import path from "node:path";
import {
  launch,
  snap,
  act,
  press,
  waitForIdle,
  debugLog,
  createFindings,
  ensureOutDir,
  writeReport,
  wait,
  captureFailureBundle,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const QUICK = process.env.QUICK === "1";
const TARGET_GAPS = QUICK ? 3 : 30;
const OUT = ensureOutDir("playtest-screenshots/2026-07-25-encounter-pacing");

// --- Mirror of game/encounters.ts encounterRollChance constants -----------
// (kept in the script only to compute a theoretical expectation to compare
// the observed means against; the game's own module is TS and not importable
// here. If the game constants change, this comparison goes stale — the
// bounds checks below do NOT depend on these numbers.)
const COOLDOWN = 8;
const PITY_START = 20;
const PITY_FORCE = 28;

function chanceAt(rate, s) {
  if (s < COOLDOWN) return 0;
  if (s >= PITY_FORCE) return 1;
  const r = Math.max(0, Math.min(1, rate));
  if (s < PITY_START) return r;
  const t = (s - PITY_START) / (PITY_FORCE - PITY_START);
  return r + (1 - r) * t;
}

function theoreticalMeanGap(rate) {
  let mean = 0;
  let alive = 1;
  for (let s = COOLDOWN; s <= PITY_FORCE; s++) {
    const c = chanceAt(rate, s);
    const p = alive * c;
    mean += s * p;
    alive *= 1 - c;
    if (alive <= 1e-12) break;
  }
  return mean;
}

function stats(gaps) {
  if (gaps.length === 0) return null;
  const n = gaps.length;
  const mean = gaps.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const forced = gaps.filter((g) => g >= PITY_FORCE).length;
  return {
    n,
    mean: +mean.toFixed(2),
    sd: +sd.toFixed(2),
    sem: +(sd / Math.sqrt(n)).toFixed(2),
    median,
    min: sorted[0],
    max: sorted[n - 1],
    forcedPityCount: forced,
    forcedPityPct: +((100 * forced) / n).toFixed(1),
  };
}

// --- In-page helpers -------------------------------------------------------

/** Zone rect (or null for "outside every zone") matching a rateMul predicate. */
async function zoneByRateMul(page, floorId, pred) {
  return page.evaluate(
    ([fid, predSrc]) => {
      const f = window.__onyxDebug.findFloor(fid);
      const pred = new Function("m", `return (${predSrc})(m);`);
      const z = (f.encounterZones ?? []).find((zz) => pred(zz.rateMul));
      return z ? { id: z.id, x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2, rateMul: z.rateMul } : null;
    },
    [floorId, pred.toString()]
  );
}

/**
 * Find two adjacent plain cells (tile == null, open edge between them) both
 * inside `rect`, or — when rect is null — both outside every encounter zone.
 * Returns { x, y, facing } such that one forward step from (x,y) lands on the
 * partner cell, or null when the zone has no such pair (itself reportable).
 */
async function findPair(page, floorId, rect) {
  return page.evaluate(
    ([fid, r]) => {
      const f = window.__onyxDebug.findFloor(fid);
      const DX = [0, 1, 0, -1];
      const DY = [-1, 0, 1, 0];
      const EDGE = ["n", "e", "s", "w"];
      const inRect = (rr, x, y) =>
        x >= Math.min(rr.x1, rr.x2) &&
        x <= Math.max(rr.x1, rr.x2) &&
        y >= Math.min(rr.y1, rr.y2) &&
        y <= Math.max(rr.y1, rr.y2);
      const zones = f.encounterZones ?? [];
      const ok = (x, y) => {
        const row = f.grid[y];
        if (!row) return false;
        const c = row[x];
        if (!c) return false;
        if (c.tile != null) return false;
        if (r) return inRect(r, x, y);
        return !zones.some((z) => inRect(z, x, y));
      };
      for (let y = 0; y < f.grid.length; y++) {
        for (let x = 0; x < (f.grid[y]?.length ?? 0); x++) {
          if (!ok(x, y)) continue;
          for (let d = 0; d < 4; d++) {
            if (f.grid[y][x][EDGE[d]] !== "open") continue;
            if (ok(x + DX[d], y + DY[d])) return { x, y, facing: d };
          }
        }
      }
      return null;
    },
    [floorId, rect]
  );
}

const gameSteps = (page) =>
  page.evaluate(() => window.__onyxDebug.state.stepsSinceEncounter);

/**
 * Press a movement key and wait for either quiescence OR a route flip to
 * combat, whichever comes first — NOT a fixed idle timeout.
 *
 * Rationale: `route` flips to "combat" synchronously on the triggering
 * keypress, but `isIdle()` stays false for the rest of that round's full
 * choreography (each actor's turn is a real ~840ms attack animation plus
 * gaps; a 5-enemy pack's first round legitimately runs past any fixed
 * per-step budget sized for an ordinary dungeon step). Waiting for idle
 * before reacting to combat mistook slow multi-enemy playback for a hang —
 * it isn't one; `exitDebugCombat` force-ends through the real `endCombat`
 * regardless of playback phase, so there is no need to wait it out at all.
 */
async function pressAndSettle(page, key, timeout = 6000, interval = 30) {
  await press(page, key, 1, 0); // delay 0: this function owns the wait, and lib's press() records the transcript entry
  const deadline = Date.now() + timeout;
  for (;;) {
    const [idle, route] = await page.evaluate(() => [
      window.__onyxDebug.isIdle(),
      window.__onyxDebug.snapshot().route,
    ]);
    if (idle || route === "combat") return { settled: true, route };
    if (Date.now() >= deadline) return { settled: false, route };
    await wait(interval);
  }
}

// --- Sampling loop ----------------------------------------------------------

async function sampleCondition(page, cond, findings, errors) {
  const { name, floorId, rect, effRate, targetGaps } = cond;
  const pair = await findPair(page, floorId, rect);
  if (!pair) {
    return { name, floorId, effRate, unsampleable: true, gaps: [] };
  }

  // Position-anchored oscillation between exactly two validated cells.
  // v1 of this script alternated keys blindly; one desynced press walked the
  // party off the pair and onto F1's trapped chest at (2,5), where the trap
  // prompt (correctly) gates all movement. The key is now recomputed from the
  // current position every step, so a swallowed press can never invert the
  // parity, and any position outside {A, B} discards the in-flight gap and
  // re-jumps instead of wandering.
  const DXv = [0, 1, 0, -1];
  const DYv = [-1, 0, 1, 0];
  const A = { x: pair.x, y: pair.y };
  const B = { x: A.x + DXv[pair.facing], y: A.y + DYv[pair.facing] };
  const keyAt = (p) =>
    p.x === A.x && p.y === A.y ? "ArrowUp" : p.x === B.x && p.y === B.y ? "ArrowDown" : null;

  const rejump = async () => {
    // Defensive: jumpTo refuses while any combat (even one that only just
    // ended) is still attached to state — flee it first so a prior
    // condition's cleanup can never strand this one mid-setup.
    const pre = await snap(page);
    if (pre.route === "combat") {
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await waitForIdle(page, 8000);
    }
    await page.evaluate(
      (o) => window.__onyxDebug.jumpTo(o),
      { floorId, x: A.x, y: A.y, facing: pair.facing, autosave: false, stepsSinceEncounter: 0 }
    );
    await waitForIdle(page, 5000);
    return snap(page);
  };

  let st = await rejump();
  const gaps = [];
  const mismatches = [];
  const eatenDiags = [];
  const cellsVisited = new Set([`${st.pos.x},${st.pos.y}`]);
  let scriptSteps = 0; // position-changing steps since last combat
  let lastGameSteps = 0;
  let totalSteps = 0;
  let eatenTotal = 0; // cumulative swallowed presses (diagnostic)
  let eatenRun = 0; // consecutive swallowed presses (stuck detector)
  let stepsSinceFlee = 0; // position-changing steps since the last flee
  let discardedGaps = 0;
  let bundled = false;
  let pos = { x: st.pos.x, y: st.pos.y };
  const maxSteps = targetGaps * (PITY_FORCE + 7) + 60;

  while (gaps.length < targetGaps && totalSteps < maxSteps) {
    const key = keyAt(pos);
    if (!key) {
      // Off the pair — should be impossible with anchored keys. Evidence + reset.
      if (!bundled) {
        await captureFailureBundle(page, `off-pair-${name}`, { outDir: OUT, errors });
        bundled = true;
      }
      findings.find("P2", floorId, `oscillation left the pair in ${name}`, `at (${pos.x},${pos.y}), pair A=(${A.x},${A.y}) B=(${B.x},${B.y})`);
      discardedGaps += 1;
      st = await rejump();
      pos = { x: st.pos.x, y: st.pos.y };
      scriptSteps = 0;
      lastGameSteps = 0;
      continue;
    }

    const { settled } = await pressAndSettle(page, key, 6000);
    if (!settled) {
      // Neither idle nor combat within budget on an ordinary dungeon step —
      // this one really is unexplained; keep the fixed-timeout hang path.
      await captureFailureBundle(page, `hang-${name}`, { outDir: OUT, errors });
      findings.find("P1", floorId, `hang during ${name}`, `waitForIdle timed out after step ${totalSteps}`);
      break;
    }
    const s2 = await snap(page);

    if (s2.route === "combat") {
      scriptSteps += 1;
      totalSteps += 1;
      const gap = lastGameSteps + 1; // the triggering move incremented, rolled, then reset
      if (gap !== scriptSteps) mismatches.push({ gap, scriptSteps, at: totalSteps });
      gaps.push(gap);
      if (gap < COOLDOWN) {
        findings.find("P1", floorId, `cooldown violated in ${name}`, `encounter after only ${gap} steps (< ${COOLDOWN}); zone=${rect?.id ?? "default"}`);
      }
      if (gap > PITY_FORCE) {
        findings.find("P1", floorId, `pity cap violated in ${name}`, `dry spell of ${gap} steps (> ${PITY_FORCE}); zone=${rect?.id ?? "default"}`);
      }
      scriptSteps = 0;
      lastGameSteps = 0;
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
      await waitForIdle(page, 6000);
      const s3 = await snap(page);
      if (s3.route !== "dungeon") {
        await captureFailureBundle(page, `stuck-after-flee-${name}`, { outDir: OUT, errors });
        findings.find("P1", floorId, `route ${s3.route} after debug flee in ${name}`, "expected dungeon");
        break;
      }
      pos = { x: s3.pos.x, y: s3.pos.y };
      cellsVisited.add(`${pos.x},${pos.y}`);
      stepsSinceFlee = 0;
      continue;
    }

    if (s2.route !== "dungeon") {
      // Trap prompt or any other modal — defensive: evidence once, reset.
      if (!bundled) {
        await captureFailureBundle(page, `route-${s2.route}-${name}`, { outDir: OUT, errors });
        bundled = true;
      }
      findings.find("P2", floorId, `unexpected route ${s2.route} in ${name}`, `at (${s2.pos.x},${s2.pos.y})`);
      if (s2.route === "trap") await press(page, "l"); // Leave restores movement
      discardedGaps += 1;
      st = await rejump();
      pos = { x: st.pos.x, y: st.pos.y };
      scriptSteps = 0;
      lastGameSteps = 0;
      continue;
    }

    if (s2.pos.x === pos.x && s2.pos.y === pos.y) {
      // Press swallowed (no movement). Key is position-derived, so retrying
      // the same key is always safe. Track WHEN swallows happen — v2 of this
      // script conflated cumulative with consecutive here and aborted a
      // healthy self-healing run at 26 sporadic swallows in ~460 steps.
      eatenTotal += 1;
      eatenRun += 1;
      if (eatenDiags.length < 12) {
        eatenDiags.push({
          at: totalSteps,
          stepsSinceFlee,
          pos: { ...pos },
          key,
          route: s2.route,
          idle: await page.evaluate(() => window.__onyxDebug.isIdle()),
        });
      }
      if (eatenRun > 8) {
        await captureFailureBundle(page, `stuck-${name}`, { outDir: OUT, errors });
        findings.find("P1", floorId, `oscillation stuck in ${name}`, `no movement at (${pos.x},${pos.y}) key=${key} after ${eatenRun} consecutive swallowed presses`);
        break;
      }
      continue;
    }

    eatenRun = 0;
    pos = { x: s2.pos.x, y: s2.pos.y };
    cellsVisited.add(`${pos.x},${pos.y}`);
    scriptSteps += 1;
    totalSteps += 1;
    stepsSinceFlee += 1;
    lastGameSteps = await gameSteps(page);
    if (lastGameSteps !== scriptSteps) {
      mismatches.push({ lastGameSteps, scriptSteps, at: totalSteps });
      scriptSteps = lastGameSteps; // trust the game's counter
    }
  }

  return {
    name,
    floorId,
    zoneId: rect?.id ?? "default (outside all zones)",
    rateMul: rect?.rateMul ?? 1,
    effRate,
    pair: { A, B, facing: pair.facing },
    gaps,
    totalSteps,
    swallowedPresses: eatenTotal,
    swallowedDiags: eatenDiags,
    discardedGaps,
    cellsVisited: [...cellsVisited],
    counterMismatches: mismatches,
    shortfall: gaps.length < targetGaps ? `insufficient sample: ${gaps.length} of ${targetGaps}` : null,
  };
}

// --- Main -------------------------------------------------------------------

const { browser, page, errors } = await launch();
const findings = createFindings({ page, outDir: OUT, errors });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400); // __onyxDebug attach settle; isIdle has nothing to poll yet

  // Resolve zone rects from live floor data (no hardcoded coords).
  const f1Safe = await zoneByRateMul(page, 1, (m) => m > 0 && m < 1);
  const f1Hot = await zoneByRateMul(page, 1, (m) => m > 1);
  const f2Safe = await zoneByRateMul(page, 2, (m) => m > 0 && m < 1);
  const f3Hot = await zoneByRateMul(page, 3, (m) => m === 1.5);
  const f5Hot2 = await zoneByRateMul(page, 5, (m) => m === 2);
  const f4Quiet = await zoneByRateMul(page, 4, (m) => m === 0);

  const baseRates = await page.evaluate(() =>
    Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, window.__onyxDebug.findFloor(id).encounterRate]))
  );

  let conditions = [
    { name: "f1-default", floorId: 1, rect: null, effRate: baseRates[1], targetGaps: TARGET_GAPS },
    { name: "f1-safe", floorId: 1, rect: f1Safe, effRate: baseRates[1] * (f1Safe?.rateMul ?? 1), targetGaps: TARGET_GAPS },
    { name: "f1-hot", floorId: 1, rect: f1Hot, effRate: baseRates[1] * (f1Hot?.rateMul ?? 1), targetGaps: TARGET_GAPS },
    { name: "f2-safe", floorId: 2, rect: f2Safe, effRate: baseRates[2] * (f2Safe?.rateMul ?? 1), targetGaps: TARGET_GAPS },
    { name: "f3-hot", floorId: 3, rect: f3Hot, effRate: baseRates[3] * (f3Hot?.rateMul ?? 1), targetGaps: TARGET_GAPS },
    { name: "f5-hot-x2", floorId: 5, rect: f5Hot2, effRate: baseRates[5] * (f5Hot2?.rateMul ?? 1), targetGaps: TARGET_GAPS },
    // Mechanism check, not a rate estimate: with rate=0 the pity ramp (steps
    // pityStart..pityForce) still climbs 0%->100% off the same formula, so
    // gaps land mostly in that ramp, NOT pinned at PITY_FORCE (confirmed:
    // observed mean 23.6 vs. theoreticalMeanGap(0) = 23.25, n=10, see
    // 2026-07-25-invariants-pacing-playtest.md). The only true hard fact is
    // the ceiling — no gap can exceed PITY_FORCE — so a smaller n still says
    // something honest (each sample costs ~24 real steps).
    { name: "f4-quiet-pity", floorId: 4, rect: f4Quiet, effRate: 0, targetGaps: QUICK ? 2 : 10 },
  ];
  if (QUICK) conditions = conditions.slice(0, 2);
  const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length) conditions = conditions.filter((c) => only.includes(c.name));

  const results = [];
  for (const cond of conditions) {
    console.log(`--- sampling ${cond.name} (effRate ${cond.effRate.toFixed(3)}, target ${cond.targetGaps} gaps)`);
    const r = await sampleCondition(page, cond, findings, errors);
    if (r.unsampleable) {
      console.log(`    UNSAMPLEABLE: no adjacent plain-cell pair in zone`);
    } else {
      const s = stats(r.gaps);
      r.stats = s;
      r.theoreticalMean = +theoreticalMeanGap(cond.effRate).toFixed(2);
      console.log(
        `    n=${s?.n ?? 0} mean=${s?.mean} sd=${s?.sd} min=${s?.min} max=${s?.max} ` +
          `forced=${s?.forcedPityCount} theo=${r.theoreticalMean}${r.shortfall ? ` [${r.shortfall}]` : ""}`
      );
      if (r.counterMismatches.length > 0) {
        console.log(`    counter mismatches: ${JSON.stringify(r.counterMismatches.slice(0, 5))}`);
      }
    }
    results.push(r);
  }

  const errKind = await debugLog(page, 500, "error");
  const report = {
    url: URL,
    when: new Date().toISOString(),
    quick: QUICK,
    constantsMirroredFromEncountersTs: { COOLDOWN, PITY_START, PITY_FORCE },
    results,
    inPageErrors: errKind,
    consoleErrors: errors,
    findings: findings.findings,
  };
  await findings.flush();
  let p;
  if (only.length) {
    const fname = `report-${only.join("-").replace(/[^a-z0-9-]+/gi, "_")}.json`;
    p = path.join(OUT, fname);
    fs.writeFileSync(p, JSON.stringify(report, null, 2));
  } else {
    p = writeReport(OUT, report);
  }
  console.log(`\nreport: ${p}`);
  console.log(`findings: ${findings.findings.length}, console errors: ${errors.length}, in-page errors: ${errKind.length}`);
} finally {
  await findings.flush();
  await browser.close();
}
