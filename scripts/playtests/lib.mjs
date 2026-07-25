/**
 * Shared helpers for Playwright playtest scripts.
 *
 * Extracted from the per-script copies that every playtest used to carry.
 * The important change is `snap()`: instead of hand-assembling a state dump in
 * `page.evaluate`, it calls the game's own `__onyxDebug.snapshot()` (see
 * src/debug/snapshot.ts), so every script sees the same fields — including
 * `route`, which distinguishes the four overlays that all borrow game mode
 * "title", and `availableActions`, which lists the legal verbs right now.
 *
 * Requires the page to be loaded with `?debug=1`.
 *
 * Timing note: `waitForIdle`/`act` poll `__onyxDebug.isIdle()` (mode fade,
 * render-camera tween, prologue, combat playback) instead of a fixed sleep.
 * `bootToDungeon` and this script's own step/turn/unlock helpers use them;
 * a few waits remain fixed on purpose — trap-prompt/menu opens and the
 * initial page-load settle don't go through `transitionToMode`, so
 * `isIdle()` has nothing to poll there.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Action transcript -------------------------------------------------------
// Every input this library drives is recorded per page, so a failure bundle can
// answer "what did the script actually do before this broke?" without the
// script having to log by hand. PR-5 adds a seed + per-step state hash on top
// of these entries to make them replayable; today they are evidence only.
const transcripts = new WeakMap();

function transcriptFor(page) {
  let entries = transcripts.get(page);
  if (!entries) {
    entries = [];
    transcripts.set(page, entries);
  }
  return entries;
}

function recordAction(page, kind, detail) {
  transcriptFor(page).push({ t: Date.now(), kind, ...detail });
}

/** Actions driven through this library so far, oldest-first. */
export function getTranscript(page) {
  return [...transcriptFor(page)];
}

/** Launch a headless browser + page with console/pageerror capture attached. */
export async function launch({ viewport = { width: 1280, height: 800 } } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("requestfailed", (r) => {
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`);
  });
  return { browser, context, page, errors };
}

/** Press a key n times with a small settle delay between presses. */
export async function press(page, key, n = 1, delay = 90) {
  recordAction(page, "press", { key, n });
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await wait(delay);
  }
}

/** Structured game state via the in-page debug snapshot. */
export async function snap(page, opts) {
  return page.evaluate((o) => window.__onyxDebug.snapshot(o), opts);
}

/**
 * Poll `__onyxDebug.isIdle()` until it's true or `timeout` elapses. Returns
 * whether it settled in time (callers decide whether that's fatal).
 */
export async function waitForIdle(page, timeout = 3000, interval = 30) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const idle = await page.evaluate(() => window.__onyxDebug.isIdle());
    if (idle) return true;
    if (Date.now() >= deadline) return false;
    await wait(interval);
  }
}

/** Press a key, then wait for the game to settle instead of a fixed sleep. */
export async function act(page, key, timeout = 3000) {
  recordAction(page, "act", { key });
  await page.keyboard.press(key);
  return waitForIdle(page, timeout);
}

/** Recent in-page debug events (mode/route/message/feature/audio/error). */
export async function debugLog(page, n = 200, kind) {
  return page.evaluate(([count, k]) => window.__onyxDebug.log(count, k), [n, kind]);
}

/** Audio cue records: id, firedAt, durationMs, endsAt, bufferMissing. */
export async function sounds(page, n) {
  return page.evaluate((count) => window.__onyxDebug.sounds(count), n);
}

/** Snapshot including the ASCII map render. */
export async function snapWithMap(page, mapRadius) {
  return snap(page, { map: true, mapRadius });
}

export async function shot(page, outDir, name) {
  const p = path.join(outDir, name);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Everything needed to diagnose a failure after the run: screenshot, full
 * snapshot (with map), the in-page event log, audio cue history, asset
 * readiness, browser console/network errors, and the action transcript.
 *
 * Written as `<name>.png` + `<name>.json` in `outDir`. Never throws — a
 * capture failing must not mask the finding that triggered it.
 */
export async function captureFailureBundle(page, name, { outDir, errors = [] } = {}) {
  const base = `bundle-${slug(name)}-${Date.now()}`;
  const bundle = {
    name,
    capturedAt: new Date().toISOString(),
    transcript: getTranscript(page),
    consoleErrors: [...errors],
  };
  try {
    bundle.screenshot = await shot(page, outDir, `${base}.png`);
  } catch (e) {
    bundle.screenshotError = String(e);
  }
  try {
    Object.assign(
      bundle,
      await page.evaluate(() => ({
        snapshot: window.__onyxDebug.snapshot({ map: true }),
        log: window.__onyxDebug.log(300),
        sounds: window.__onyxDebug.sounds(80),
        readiness: window.__onyxDebug.readiness(),
        url: window.location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }))
    );
  } catch (e) {
    bundle.pageError = String(e);
  }
  const p = path.join(outDir, `${base}.json`);
  try {
    fs.writeFileSync(p, JSON.stringify(bundle, null, 2));
  } catch {
    return null;
  }
  return p;
}

/**
 * Findings collector shared by the report writers.
 *
 * Pass `page`/`outDir` to auto-capture a failure bundle for each severe
 * finding. `find()` stays synchronous so existing call sites are unchanged;
 * the capture runs on a serialized queue that the caller drains with
 * `await flush()` before writing the report. Because the script keeps running
 * during a capture, a bundle may reflect state a beat later than the finding.
 */
export function createFindings({
  log = console.log,
  page = null,
  outDir = null,
  errors = [],
  captureSeverities = ["P0", "P1"],
} = {}) {
  const findings = [];
  const bundles = [];
  let queue = Promise.resolve();

  return {
    findings,
    bundles,
    find(sev, floor, title, body = "") {
      findings.push({ sev, floor, title, body });
      log(`[${sev}] F${floor} ${title}${body ? ` — ${body}` : ""}`);
      if (page && outDir && captureSeverities.includes(sev)) {
        queue = queue.then(async () => {
          const p = await captureFailureBundle(page, `f${floor}-${sev}-${title}`, {
            outDir,
            errors,
          });
          if (p) bundles.push(p);
        });
      }
    },
    /** Await all queued captures. Call before writing the report. */
    async flush() {
      await queue;
      return bundles;
    },
  };
}

export function ensureOutDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeReport(outDir, report) {
  const p = path.join(outDir, "report.json");
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  return p;
}

/**
 * Boot from the title screen into the dungeon along the real key path.
 *
 * Route-driven rather than a fixed key sequence: each iteration reads
 * `snapshot().route` and presses whatever that screen needs. That makes it
 * immune to new screens being inserted into the flow (the prologue, for
 * instance) and to variable settle times.
 *
 * Returns the final snapshot; callers should assert `route === "dungeon"`.
 */
export async function bootToDungeon(page, url, { maxSteps = 40 } = {}) {
  recordAction(page, "bootToDungeon", { url });
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(400); // initial page-load settle; isIdle() has nothing to poll before __onyxDebug attaches

  let st = await snap(page);
  for (let i = 0; i < maxSteps && st.route !== "dungeon"; i++) {
    switch (st.route) {
      case "title":
        // "n" opens the prologue, which auto-plays and is never idle by
        // design (isIdle() would spin the full timeout) — a short settle
        // is the correct wait here, not idle-polling.
        await press(page, "n");
        await wait(250);
        break;
      case "prologue":
        // A single Escape may only advance one beat of the two-stage skip
        // rather than close it, so bound the poll well under the default
        // timeout — a non-closing press still falls through to the next
        // loop iteration's Escape instead of stalling here for 3s.
        await press(page, "Escape");
        await waitForIdle(page, 500);
        break;
      case "party_creation":
        // Confirms the default party -> openTown(), which uses the real
        // transitionToMode fade tracked by modeTransitionPending.
        await press(page, "Enter");
        await waitForIdle(page);
        break;
      case "town": {
        const body = await page.evaluate(() => document.body.innerText);
        if (/▶.*Enter Dungeon/i.test(body)) {
          // onEnterDungeon -> transitionToFloor + transitionToMode("dungeon").
          await press(page, "Enter");
          await waitForIdle(page);
        } else {
          // Menu-cursor move only; nothing blocks isIdle() here, so this
          // settles as fast as the poll interval instead of a fixed 250ms.
          await press(page, ">");
          await waitForIdle(page, 500);
        }
        break;
      }
      default:
        await press(page, "Enter");
        await waitForIdle(page, 500);
        break;
    }
    st = await snap(page);
  }
  return st;
}

/**
 * Jump to a dungeon cell via `__onyxDebug.jumpTo` (real transitionToFloor).
 * Replaces the old hand-rolled `warp()` that cloned floors without applying
 * killed-NPC / loot / unlocked-door bookkeeping.
 */
export async function jumpTo(page, opts) {
  recordAction(page, "jumpTo", { opts });
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), opts);
  await waitForIdle(page);
  return snap(page);
}

/**
 * Boot to title, then jumpTo a scenario — skips prologue/party-creation.
 * `scenario` is passed straight to jumpTo (floorId/x/y required).
 */
export async function boot(page, url, { scenario } = {}) {
  if (scenario == null || scenario.floorId == null || scenario.x == null || scenario.y == null) {
    throw new Error("boot({ scenario }) requires scenario.{ floorId, x, y }");
  }
  recordAction(page, "boot", { url, scenario });
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(400);
  // Title is idle; jumpTo closes the title controller and lands in dungeon.
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), scenario);
  await waitForIdle(page);
  return snap(page);
}
