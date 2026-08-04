/**
 * Transcript replayer for deterministic replay verification.
 *
 * Loads a transcript JSON, restores the starting save, reinstalls the seed,
 * and replays every keyboard input in order. After each input it waits for
 * idle and compares the state hash to the recorded hash. On the first
 * divergence it stops immediately and produces an evidence bundle:
 *   - Expected vs actual state
 *   - Action index and key
 *   - Screenshot
 *   - Debug log
 *   - Audio log
 *   - Browser errors
 *
 * Exit codes:
 *   0 — all hashes matched (replay is deterministic)
 *   1 — divergence detected (state hash mismatch)
 *   2 — setup error (transcript invalid, debug surface missing, etc.)
 *
 * Usage:
 *   npm run replay -- scripts/replays/phaser-basic-combat.json
 *   node scripts/replays/replay.mjs scripts/replays/dungeon-encounter.json
 *
 * Options:
 *   --seed N    override the transcript's seed (for divergence testing)
 *   --url URL   override the base URL
 *   --out DIR   override the evidence output directory
 *
 * Expects: npx vite dev (or preview) serving on ONYX_URL (default 5173 dev).
 */
import { parseArgs } from "node:util";
import fs from "fs";
import path from "path";
import {
  launch,
  wait,
  snap,
  waitForIdle,
  ensureOutDir,
  shot,
  ensureAudioResumed,
  captureFailureBundle,
} from "../playtests/lib.mjs";
import { stateHash, stateHashFields } from "./hash.mjs";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: "string", default: "" },
    url: { type: "string", default: "" },
    out: { type: "string", default: "" },
  },
});

const log = (...a) => console.log(...a);

if (positionals.length === 0) {
  log("Usage: npm run replay -- <transcript.json>");
  log("       node scripts/replays/replay.mjs <transcript.json> [--seed N] [--url URL]");
  process.exit(2);
}

const TRANSCRIPT_PATH = positionals[0];
if (!fs.existsSync(TRANSCRIPT_PATH)) {
  log(`Transcript not found: ${TRANSCRIPT_PATH}`);
  process.exit(2);
}

/**
 * Poll until the combat phase is no longer "playback" (or the route changes
 * away from "combat"). Handles a race condition where isIdle() returns true
 * because playbackDone is true, but the combat controller hasn't called
 * afterPlayback() yet to advance to the next phase.
 */
async function waitForPhaseSettle(page, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route !== "combat") return s;
    if (s.combat?.phase !== "playback") return s;
    if (Date.now() >= deadline) return s;
    await wait(50);
  }
}

const transcript = JSON.parse(fs.readFileSync(TRANSCRIPT_PATH, "utf8"));

if (transcript.version !== 1) {
  log(`Unsupported transcript version: ${transcript.version}`);
  process.exit(2);
}

const SEED = args.seed ? parseInt(args.seed, 10) : transcript.seed;
const RENDERER = transcript.renderer || "phaser";
const VIEWPORT = transcript.viewport || { width: 1280, height: 800 };

// Dev server is the default — debug hooks are tree-shaken from production.
const BASE =
  args.url ||
  process.env.ONYX_URL ||
  "http://127.0.0.1:5173/?debug=1";

const urlSuffix = RENDERER === "canvas" ? "&phaser=0" : "";
const URL = BASE + urlSuffix;

const OUT_DIR = args.out || ensureOutDir("/tmp/onyx-replay");

log(`=== replaying: ${TRANSCRIPT_PATH} ===`);
log(`  seed: ${SEED}${args.seed ? " (OVERRIDE)" : ""}`);
log(`  renderer: ${RENDERER}`);
log(`  actions: ${transcript.actions.length}`);
log(`  URL: ${URL}`);

const { browser, page, errors } = await launch({ viewport: VIEWPORT });

try {
  // --- Setup --------------------------------------------------------------
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);

  // Verify debug surface.
  const exposed = await page.evaluate(() => ({
    loadSave: typeof window.__onyxDebug.loadSave,
    setGameplayRng: typeof window.__onyxDebug.setGameplayRng,
    createSeededRng: typeof window.__onyxDebug.createSeededRng,
    resetGameplayRng: typeof window.__onyxDebug.resetGameplayRng,
  }));
  for (const [k, v] of Object.entries(exposed)) {
    if (v !== "function") {
      log(`FAIL: ${k} not exposed on __onyxDebug (got ${v})`);
      process.exit(2);
    }
  }

  // Restore the starting save.
  await page.evaluate((json) => window.__onyxDebug.loadSave(json), transcript.startingSave);
  await waitForIdle(page, 5000);
  await wait(300);

  // Install the seeded gameplay RNG.
  await page.evaluate((sd) => {
    window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(sd));
  }, SEED);

  // Optionally force combat via the debug surface (same call the recorder
  // made after seeding the RNG — the seeded RNG ensures the same encounter).
  if (transcript.forceCombat) {
    log("  forcing combat via debug surface...");
    const combatInfo = await page.evaluate(async () => {
      const d = window.__onyxDebug;
      const st = d.state;
      for (let attempts = 0; attempts < 400; attempts++) {
        const entry = d.rollEncounter(st.floor.id);
        if (!entry) return { ok: false, reason: "no encounter rolled" };
        const r = d.resolveEncounter(entry);
        if (r.length === 0) continue;
        const combat = d.createCombatFromEncounter(
          st.party,
          r,
          d.SPELLS_BY_ID,
          d.ITEMS_BY_ID,
          st.equipment,
          st.inventory,
          st.inAntimagic,
          st.activeCharIds
        );
        await d.startCombat(combat);
        return { ok: true, enemyCount: r.length, enemyIds: r.map((e) => e.enemy.id) };
      }
      return { ok: false, reason: "no valid encounter in 400 attempts" };
    });
    if (!combatInfo.ok) {
      log(`FAIL: could not force combat: ${combatInfo.reason}`);
      process.exit(2);
    }
    log(`  forced combat: ${combatInfo.enemyCount} enemies: ${JSON.stringify(combatInfo.enemyIds)}`);
    await waitForIdle(page, 8000);
    await wait(500);
  }

  // Verify the starting state hash matches the first action's routeBefore
  // context (i.e., we're in the right state before replaying).
  const startSnap = await snap(page);
  log(`  starting state: mode=${startSnap.mode} route=${startSnap.route} floor=${startSnap.floor.id}`);

  // --- Replay actions -----------------------------------------------------
  let diverged = false;
  let divergenceInfo = null;

  for (let i = 0; i < transcript.actions.length; i++) {
    const action = transcript.actions[i];

    // Check routeBefore matches (early divergence indicator).
    const before = await snap(page);
    if (before.route !== action.routeBefore) {
      log(`\nDIVERGENCE at action ${i} (route mismatch before key press):`);
      log(`  expected routeBefore: ${action.routeBefore}`);
      log(`  actual route:         ${before.route}`);
      log(`  action: ${action.action} (key=${action.key})`);
      diverged = true;
      divergenceInfo = { index: i, kind: "route-before", action, beforeSnap: before };
      break;
    }

    // Press the key.
    await page.keyboard.press(action.key);

    // Wait for the game to settle.
    await waitForIdle(page, 8000);
    // Combat playback race: isIdle() may return true while the phase is
    // still "playback" (playbackDone=true but afterPlayback() hasn't run
    // yet). Poll until the phase settles to a non-playback state.
    const afterSnap = await waitForPhaseSettle(page, 5000);

    // Compute the state hash.
    const actualHash = stateHash(afterSnap);

    if (actualHash !== action.stateHashAfter) {
      log(`\nDIVERGENCE at action ${i} (state hash mismatch):`);
      log(`  expected: ${action.stateHashAfter}`);
      log(`  actual:   ${actualHash}`);
      log(`  action: ${action.action} (key=${action.key})`);
      log(`  route: ${afterSnap.route}`);
      if (afterSnap.combat) {
        log(`  combat: round=${afterSnap.combat.round} phase=${afterSnap.combat.phase} result=${afterSnap.combat.result}`);
      }
      diverged = true;
      divergenceInfo = { index: i, kind: "hash", action, beforeSnap: before, afterSnap };
      break;
    }

    // Progress indicator.
    if (i % 10 === 0 || i === transcript.actions.length - 1) {
      log(`  [${i + 1}/${transcript.actions.length}] ${action.action} (key=${action.key}) hash=${actualHash} route=${afterSnap.route}`);
    }
  }

  // --- Result -------------------------------------------------------------
  if (diverged) {
    log("\n=== REPLAY FAILED — divergence detected ===");

    // Capture evidence bundle.
    const bundlePath = await captureFailureBundle(page, `divergence-action-${divergenceInfo.index}`, {
      outDir: OUT_DIR,
      errors,
    });
    if (bundlePath) log(`  evidence bundle: ${bundlePath}`);

    // Write a divergence report with expected vs actual state.
    const report = {
      transcript: TRANSCRIPT_PATH,
      seed: SEED,
      seedOverridden: !!args.seed,
      divergence: {
        actionIndex: divergenceInfo.index,
        kind: divergenceInfo.kind,
        action: divergenceInfo.action,
        expectedHash: divergenceInfo.action.stateHashAfter,
        actualHash: divergenceInfo.kind === "hash" ? stateHash(divergenceInfo.afterSnap) : null,
      },
      expectedState: divergenceInfo.action
        ? null // We don't store the full state in the transcript, only the hash.
        : null,
      actualState: stateHashFields(divergenceInfo.afterSnap || divergenceInfo.beforeSnap),
      consoleErrors: [...errors],
    };
    const reportPath = path.join(OUT_DIR, "divergence-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`  divergence report: ${reportPath}`);

    await shot(page, OUT_DIR, "divergence-final.png");
    process.exit(1);
  }

  // All hashes matched.
  log(`\n=== REPLAY PASSED — all ${transcript.actions.length} actions matched ===`);
  if (errors.length) {
    log(`  WARNING: ${errors.length} console/page errors (hashes still matched):`);
    errors.slice(0, 5).forEach((e) => log(`    ${e}`));
  } else {
    log(`  no console/page errors`);
  }

  // Reset the RNG to Math.random (cleanup).
  await page.evaluate(() => window.__onyxDebug.resetGameplayRng());

  process.exit(0);
} catch (err) {
  log(`\n=== REPLAY ERROR ===`);
  log(`  ${err.message}`);
  log(`  ${err.stack}`);
  try {
    await captureFailureBundle(page, "replay-error", { outDir: OUT_DIR, errors });
  } catch {}
  process.exit(2);
} finally {
  await browser.close();
}
