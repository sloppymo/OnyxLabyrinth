/**
 * Phaser combat-port smoke (verification aid).
 *
 *   npx vite preview --port 5176 --base /OnyxLabyrinth/
 *   node scripts/playtests/smoke-phaser-combat.mjs
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
const outDir = ensureOutDir("playtest-screenshots/smoke-phaser-combat");

async function stageInfo(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector("#combat-wrap");
    const phaser = document.querySelector("#combat-phaser-canvas");
    const canvas2d = document.querySelector("#combat-canvas");
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const p = cs(phaser);
    const c = cs(canvas2d);
    return {
      wrapPhaserClass: wrap?.classList.contains("phaser-stage") ?? false,
      phaserDisplay: p?.display ?? null,
      phaserVisibility: p?.visibility ?? null,
      phaserOpacity: p?.opacity ?? null,
      canvas2dDisplay: c?.display ?? null,
      canvas2dVisibility: c?.visibility ?? null,
      menuVisible: (() => {
        const m = document.querySelector("#combat-action-menu, .combat-action-menu, #ff6-windows");
        if (!m) return !!document.querySelector("#combat-wrap .ff6-window");
        return getComputedStyle(m).display !== "none";
      })(),
      windowsText: (document.querySelector("#combat-wrap")?.innerText ?? "").slice(0, 300),
    };
  });
}

async function bootTitle(page, extraQuery) {
  const url = `${BASE}?debug=1${extraQuery}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await page.keyboard.press("ArrowDown");
  await wait(150);
}

async function enterArenaCombat(page, findings, label) {
  await press(page, "a", 1, 120);
  await waitForIdle(page, 4000);
  let st = await snap(page);
  if (st.route !== "arena") {
    findings.find("P0", 0, `${label}: opened arena`, `route=${st.route}`);
  } else {
    console.log(`  OK: ${label}: opened arena`);
  }

  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    st = await snap(page);
    if (st.route === "combat") break;
  }
  if (st.route !== "combat") {
    findings.find("P0", 0, `${label}: reached combat`, `route=${st.route}`);
  } else {
    console.log(`  OK: ${label}: reached combat`);
  }
  await wait(800);
  await waitForIdle(page, 5000);
  return st;
}

function assertVisiblePhaser(info, findings, label) {
  if (!info.wrapPhaserClass) {
    findings.find("P0", 0, `${label}: phaser-stage class`, JSON.stringify(info));
  } else {
    console.log(`  OK: ${label}: phaser-stage class`);
  }
  const phaserShown =
    info.phaserDisplay !== "none" &&
    info.phaserVisibility !== "hidden" &&
    info.phaserOpacity !== "0";
  if (!phaserShown) {
    findings.find("P0", 0, `${label}: phaser canvas visible`, JSON.stringify(info));
  } else {
    console.log(`  OK: ${label}: phaser canvas visible`);
  }
  const canvasHidden =
    info.canvas2dDisplay === "none" || info.canvas2dVisibility === "hidden";
  if (!canvasHidden) {
    findings.find("P0", 0, `${label}: 2d canvas hidden`, JSON.stringify(info));
  } else {
    console.log(`  OK: ${label}: 2d canvas hidden`);
  }
}

const { browser, page, errors } = await launch();
const findings = createFindings({ page, outDir, errors });

try {
  console.log("=== Phaser default (no ?phaser=) ===");
  await bootTitle(page, "");
  await enterArenaCombat(page, findings, "phaser-default");
  let info = await stageInfo(page);
  console.log("  stage:", JSON.stringify(info));
  await shot(page, outDir, "01-phaser-combat.png");
  assertVisiblePhaser(info, findings, "phaser-default");
  if (!(info.windowsText || "").trim()) {
    findings.find("P1", 0, "DOM combat menus empty", JSON.stringify(info));
  } else {
    console.log("  OK: DOM combat chrome has text");
  }

  let st = await snap(page);
  console.log("  combat phase:", st.combat?.phase);

  // Try one Attack confirm if on palette
  if (st.combat?.phase === "palette") {
    await press(page, "Enter", 1, 80);
    await wait(200);
    st = await snap(page);
    if (st.combat?.phase === "selectEnemy" || st.combat?.phase === "select_enemy") {
      await press(page, "Enter", 1, 80);
      await waitForIdle(page, 10000);
    }
  }

  const beforeFlee = errors.length;
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await wait(1000);
  await waitForIdle(page, 10000);
  st = await snap(page);
  if (st.route !== "arena" && st.route !== "title") {
    findings.find("P0", 0, "after flee: left combat", `route=${st.route}`);
  } else {
    console.log(`  OK: after flee route=${st.route}`);
  }
  const fleeErrs = errors.slice(beforeFlee);
  if (fleeErrs.some((e) => e.startsWith("pageerror:"))) {
    findings.find("P0", 0, "flee/teardown pageerror", fleeErrs.join(" | "));
  } else {
    console.log("  OK: flee/teardown no pageerror");
  }

  console.log("=== Second fight after teardown ===");
  for (let i = 0; i < 12; i++) {
    await press(page, "Enter", 1, 100);
    await waitForIdle(page, 6000);
    st = await snap(page);
    if (st.route === "combat") break;
  }
  if (st.route !== "combat") {
    findings.find("P0", 0, "second fight started", `route=${st.route}`);
  } else {
    console.log("  OK: second fight started");
  }
  await wait(800);
  info = await stageInfo(page);
  await shot(page, outDir, "02-second-fight.png");
  assertVisiblePhaser(info, findings, "second-fight");

  const beforeVictory = errors.length;
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
  await wait(1000);
  await waitForIdle(page, 12000);
  for (let i = 0; i < 8; i++) {
    st = await snap(page);
    if (st.route === "arena" || st.route === "title") break;
    await press(page, "Enter", 1, 120);
    await waitForIdle(page, 5000);
  }
  st = await snap(page);
  if (st.route === "combat" && st.combat?.phase && st.combat.phase !== "result") {
    findings.find("P0", 0, "victory stuck in combat", `route=${st.route} phase=${st.combat?.phase}`);
  } else {
    console.log(`  OK: victory path settled route=${st.route}`);
  }
  const vicErrs = errors.slice(beforeVictory).filter((e) => e.startsWith("pageerror:"));
  if (vicErrs.length) {
    findings.find("P0", 0, "victory pageerror", vicErrs.join(" | "));
  } else {
    console.log("  OK: victory no pageerror");
  }

  console.log("=== Rollback ?phaser=0 ===");
  await bootTitle(page, "&phaser=0");
  await enterArenaCombat(page, findings, "canvas-rollback");
  info = await stageInfo(page);
  console.log("  stage:", JSON.stringify(info));
  await shot(page, outDir, "03-canvas-rollback.png");
  if (info.wrapPhaserClass) {
    findings.find("P0", 0, "?phaser=0: no phaser-stage class", JSON.stringify(info));
  } else {
    console.log("  OK: ?phaser=0 no phaser-stage class");
  }
  const canvasShown =
    info.canvas2dDisplay !== "none" && info.canvas2dVisibility !== "hidden";
  if (!canvasShown) {
    findings.find("P0", 0, "?phaser=0: 2d canvas visible", JSON.stringify(info));
  } else {
    console.log("  OK: ?phaser=0 2d canvas visible");
  }
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await waitForIdle(page, 10000);

  const pageErrors = errors.filter((e) => e.startsWith("pageerror:"));
  if (pageErrors.length) {
    findings.find("P0", 0, "pageerrors overall", pageErrors.join(" | "));
  } else {
    console.log("  OK: no pageerrors overall");
  }
} catch (e) {
  findings.find("P0", 0, "smoke script threw", String(e));
  console.error(e);
} finally {
  await findings.flush();
  const list = findings.findings;
  writeReport(outDir, {
    title: "smoke-phaser-combat",
    findings: list,
    errors,
    base: BASE,
  });
  console.log(`Findings: ${list.length} (P0=${list.filter((f) => f.sev === "P0").length})`);
  console.log("Errors:", errors.slice(0, 20));
  await browser.close();
  process.exit(list.some((f) => f.sev === "P0") ? 1 : 0);
}
