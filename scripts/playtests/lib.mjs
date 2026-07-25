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
 * Timing note: waits here are fixed sleeps, same as before. PR-2 adds
 * `isIdle()` and will replace them with real quiescence polling.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await wait(delay);
  }
}

/** Structured game state via the in-page debug snapshot. */
export async function snap(page, opts) {
  return page.evaluate((o) => window.__onyxDebug.snapshot(o), opts);
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

/** Findings collector shared by the report writers. */
export function createFindings({ log = console.log } = {}) {
  const findings = [];
  return {
    findings,
    find(sev, floor, title, body = "") {
      findings.push({ sev, floor, title, body });
      log(`[${sev}] F${floor} ${title}${body ? ` — ${body}` : ""}`);
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
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(400);

  let st = await snap(page);
  for (let i = 0; i < maxSteps && st.route !== "dungeon"; i++) {
    switch (st.route) {
      case "title":
        await press(page, "n");
        await wait(350);
        break;
      case "prologue":
        await press(page, "Escape");
        await wait(220);
        break;
      case "party_creation":
        await press(page, "Enter");
        await wait(400);
        break;
      case "town": {
        const body = await page.evaluate(() => document.body.innerText);
        if (/▶.*Enter Dungeon/i.test(body)) {
          await press(page, "Enter");
          await wait(600);
        } else {
          await press(page, ">");
          await wait(250);
        }
        break;
      }
      default:
        await press(page, "Enter");
        await wait(300);
        break;
    }
    st = await snap(page);
  }
  return st;
}
