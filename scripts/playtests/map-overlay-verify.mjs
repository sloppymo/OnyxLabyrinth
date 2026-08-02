/**
 * Nonmodal dungeon-map overlay production-preview verification.
 *
 * Run after `npm run build` with a preview available:
 *   ONYX_URL=http://127.0.0.1:5176/OnyxLabyrinth/?debug=1 \
 *     ONYX_OUT=/tmp/onyx-map-overlay node scripts/playtests/map-overlay-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  boot,
  ensureOutDir,
  getTranscript,
  jumpTo,
  launch,
  press,
  shot,
  snap,
  wait,
  waitForIdle,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(process.env.ONYX_OUT ?? "/tmp/onyx-map-overlay");
const report = {
  at: new Date().toISOString(),
  url: URL,
  checks: [],
  captures: [],
};

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });

function check(name, ok, detail = "") {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function overlayMetrics() {
  return page.evaluate(() => {
    const viewport = document.querySelector("#viewport-wrap");
    const overlay = document.querySelector("#map-overlay");
    const canvas = document.querySelector("#map-overlay-canvas");
    const toggle = document.querySelector("#map-overlay-toggle");
    if (!viewport || !overlay || !canvas || !toggle) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const context = canvas.getContext("2d");
    let nontransparentFraction = 0;
    if (context) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nontransparent = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) nontransparent++;
      }
      nontransparentFraction = nontransparent / (pixels.length / 4);
    }
    return {
      hidden: overlay.hidden,
      ariaHidden: overlay.getAttribute("aria-hidden"),
      background: getComputedStyle(overlay).backgroundColor,
      widthFraction: overlayRect.width / viewportRect.width,
      heightFraction: overlayRect.height / viewportRect.height,
      intrinsic: { width: canvas.width, height: canvas.height },
      nontransparentFraction,
      toggleText: toggle.textContent,
      togglePressed: toggle.getAttribute("aria-pressed"),
      toggleLabel: toggle.getAttribute("aria-label"),
    };
  });
}

async function capture(name) {
  await wait(180);
  const state = await snap(page, { map: true, mapRadius: 7 });
  const metrics = await overlayMetrics();
  const screenshot = await shot(page, OUT, `${name}.png`);
  report.captures.push({ name, screenshot, state, metrics });
  return { state, metrics };
}

async function ensureOverlayOpen() {
  let state = await snap(page);
  if (!state.flags.mapOverlayVisible) {
    await press(page, "v");
    await wait(150);
    state = await snap(page);
  }
  return state;
}

async function startTrashCombat() {
  return page.evaluate(async () => {
    const debug = window.__onyxDebug;
    const state = debug.state;
    let resolved = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      const entry = debug.rollEncounter(state.floor.id);
      if (!entry) continue;
      const enemies = debug.resolveEncounter(entry);
      if (!enemies.length || enemies.some((enemy) => enemy.enemy.isBoss)) continue;
      resolved = enemies;
      break;
    }
    if (!resolved) return false;
    const combat = debug.createCombatFromEncounter(
      state.party,
      resolved,
      debug.SPELLS_BY_ID,
      debug.ITEMS_BY_ID,
      state.equipment,
      state.inventory,
      state.inAntimagic,
    );
    await debug.startCombat(combat);
    return true;
  });
}

try {
  const initial = await boot(page, URL, {
    scenario: {
      floorId: 1,
      x: 11,
      y: 25,
      facing: 0,
      autosave: false,
      stepsSinceEncounter: 0,
    },
  });
  check("boot reaches dungeon", initial.route === "dungeon", `route=${initial.route}`);
  await capture("01-overlay-closed");

  await press(page, "v");
  const opened = await capture("02-overlay-open-facing-north");
  check("V opens quick overlay", opened.state.flags.mapOverlayVisible === true);
  check("full automap remains closed", opened.state.flags.mapVisible === false);
  check(
    "panel is responsive and translucent",
    !!opened.metrics &&
      opened.metrics.widthFraction >= 0.55 &&
      opened.metrics.widthFraction <= 0.73 &&
      opened.metrics.heightFraction >= 0.55 &&
      opened.metrics.heightFraction <= 0.73 &&
      /0\.58\)/.test(opened.metrics.background),
    JSON.stringify(opened.metrics),
  );
  check(
    "map canvas contains transparent composited geometry",
    !!opened.metrics &&
      opened.metrics.nontransparentFraction > 0.05 &&
      opened.metrics.nontransparentFraction < 0.9,
    JSON.stringify(opened.metrics),
  );
  check(
    "toggle exposes pressed accessibility state",
    opened.metrics?.togglePressed === "true" && /Close quick dungeon map/.test(opened.metrics.toggleLabel),
    JSON.stringify(opened.metrics),
  );

  const beforeMove = opened.state;
  await press(page, "ArrowUp");
  await waitForIdle(page);
  const afterMove = await snap(page);
  check(
    "movement remains live with overlay open",
    afterMove.flags.mapOverlayVisible &&
      (afterMove.pos.x !== beforeMove.pos.x || afterMove.pos.y !== beforeMove.pos.y),
    `${beforeMove.pos.x},${beforeMove.pos.y} -> ${afterMove.pos.x},${afterMove.pos.y}`,
  );
  check(
    "newly discovered terrain appears without closing",
    afterMove.explored.length >= beforeMove.explored.length,
    `${beforeMove.explored.length} -> ${afterMove.explored.length}`,
  );

  await press(page, "ArrowRight");
  await waitForIdle(page);
  const turned = await capture("03-overlay-open-facing-east");
  check("turning updates facing marker", turned.state.pos.facing === 1, JSON.stringify(turned.state.pos));

  const repeatResult = await page.evaluate(() => {
    const before = window.__onyxDebug.snapshot().flags.mapOverlayVisible;
    const event = new KeyboardEvent("keydown", {
      key: "v",
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    return {
      before,
      after: window.__onyxDebug.snapshot().flags.mapOverlayVisible,
      prevented: event.defaultPrevented,
    };
  });
  check(
    "repeat keydown cannot flicker toggle",
    repeatResult.before && repeatResult.after && !repeatResult.prevented,
    JSON.stringify(repeatResult),
  );

  const editableResult = await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const before = window.__onyxDebug.snapshot().flags.mapOverlayVisible;
    const event = new KeyboardEvent("keydown", { key: "v", bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    const after = window.__onyxDebug.snapshot().flags.mapOverlayVisible;
    input.remove();
    return { before, after, prevented: event.defaultPrevented };
  });
  check(
    "typing target does not toggle or claim V",
    editableResult.before && editableResult.after && !editableResult.prevented,
    JSON.stringify(editableResult),
  );

  await page.click("#map-overlay-toggle");
  let pointerState = await snap(page);
  check("pointer control closes overlay", pointerState.flags.mapOverlayVisible === false);
  await page.click("#map-overlay-toggle");
  pointerState = await snap(page);
  check("pointer control reopens overlay", pointerState.flags.mapOverlayVisible === true);

  await press(page, "m");
  const fullMap = await capture("04-existing-full-automap");
  check(
    "M preserves full automap and closes quick overlay",
    fullMap.state.flags.mapVisible && !fullMap.state.flags.mapOverlayVisible,
    JSON.stringify(fullMap.state.flags),
  );
  await press(page, "m");
  await ensureOverlayOpen();

  await press(page, "Escape");
  await wait(150);
  const saveOpen = await snap(page);
  check(
    "blocking save menu closes overlay",
    saveOpen.route === "save" && !saveOpen.flags.mapOverlayVisible,
    `route=${saveOpen.route}`,
  );
  await press(page, "Escape");
  await waitForIdle(page);
  const afterSave = await snap(page);
  check(
    "return from menu keeps overlay closed",
    afterSave.route === "dungeon" && !afterSave.flags.mapOverlayVisible,
    `route=${afterSave.route}`,
  );

  await jumpTo(page, {
    floorId: 1,
    x: 13,
    y: 20,
    facing: 1,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  const region = await capture("05-regional-boundary-overlay");
  check("regional boundary remains dungeon route", region.state.route === "dungeon");

  await jumpTo(page, {
    floorId: 1,
    x: 11,
    y: 12,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
    clearUnlockedDoors: true,
  });
  await ensureOverlayOpen();
  await capture("06-known-locked-door");

  await jumpTo(page, {
    floorId: 1,
    x: 3,
    y: 8,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await press(page, "ArrowUp");
  await waitForIdle(page);
  const darkness = await capture("07-darkness-discovery");
  check(
    "darkness does not close or broaden map source",
    darkness.state.flags.inDarkness && darkness.state.flags.mapOverlayVisible,
    JSON.stringify(darkness.state.flags),
  );

  await jumpTo(page, {
    floorId: 1,
    x: 1,
    y: 18,
    facing: 1,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  await capture("08-camera-clamped-west-edge");

  await jumpTo(page, {
    floorId: 1,
    x: 21,
    y: 20,
    facing: 3,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  await capture("09-camera-clamped-southeast");

  await jumpTo(page, {
    floorId: 1,
    x: 2,
    y: 18,
    facing: 3,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  await press(page, "ArrowUp");
  await waitForIdle(page);
  const trappedChest = await snap(page);
  check(
    "blocking trapped-chest prompt closes overlay",
    trappedChest.flags.pendingTrap !== null && !trappedChest.flags.mapOverlayVisible,
    JSON.stringify(trappedChest.flags.pendingTrap),
  );
  await press(page, "Escape");
  await waitForIdle(page);

  await jumpTo(page, {
    floorId: 1,
    x: 19,
    y: 12,
    facing: 1,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  await press(page, "ArrowUp");
  await wait(1300);
  const chest = await capture("10-opened-chest");
  check(
    "opening chest preserves nonmodal overlay",
    chest.state.pos.x === 20 && chest.state.pos.y === 12 && chest.state.flags.mapOverlayVisible,
    JSON.stringify(chest.state.pos),
  );
  const chestOpened = await page.evaluate(
    () => window.__onyxDebug.state.lootTaken[1]?.has("20,12") ?? false,
  );
  check("chest progression state recorded", chestOpened);

  await jumpTo(page, {
    floorId: 1,
    x: 4,
    y: 18,
    facing: 1,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await press(page, "ArrowUp");
  await wait(180);
  const npcOpen = await snap(page);
  check(
    "NPC dialogue closes overlay",
    npcOpen.route === "npc" && !npcOpen.flags.mapOverlayVisible,
    `route=${npcOpen.route}`,
  );
  await press(page, "Escape");
  await waitForIdle(page);
  await ensureOverlayOpen();
  const npcReturn = await capture("11-known-npc-after-meeting");
  const metNpc = await page.evaluate(() =>
    window.__onyxDebug.state.talkedToNPCs.includes("rill-of-pages"),
  );
  check(
    "met NPC becomes eligible as a known landmark",
    npcReturn.state.route === "dungeon" && metNpc,
    `route=${npcReturn.state.route}`,
  );

  const saved = await page.evaluate(() => window.__onyxDebug.dumpSave());
  const exploredBeforeLoad = (await snap(page)).explored.length;
  await page.evaluate((json) => window.__onyxDebug.loadSave(json), saved);
  await waitForIdle(page);
  const loaded = await snap(page);
  check(
    "load restores discovery but not open state",
    !loaded.flags.mapOverlayVisible && loaded.explored.length === exploredBeforeLoad,
    `${exploredBeforeLoad} -> ${loaded.explored.length}`,
  );

  await ensureOverlayOpen();
  const combatStarted = await startTrashCombat();
  check("debug trash combat starts", combatStarted === true);
  const combat = await capture("12-combat-overlay-closed");
  check(
    "combat entry closes overlay",
    combat.state.route === "combat" && !combat.state.flags.mapOverlayVisible,
    `route=${combat.state.route}`,
  );
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  const returnDeadline = Date.now() + 9000;
  let returned = await snap(page);
  while (returned.route === "combat" && Date.now() < returnDeadline) {
    await wait(100);
    returned = await snap(page);
  }
  await waitForIdle(page, 5000);
  const combatReturn = await capture("13-combat-return-overlay-closed");
  check(
    "combat return remains closed with live corridor",
    combatReturn.state.route === "dungeon" && !combatReturn.state.flags.mapOverlayVisible,
    `route=${combatReturn.state.route}`,
  );

  await jumpTo(page, {
    floorId: 1,
    x: 20,
    y: 3,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await ensureOverlayOpen();
  await press(page, "ArrowUp");
  await waitForIdle(page, 4000);
  const floorChange = await capture("14-floor-2-transition");
  check(
    "real stair transition updates open overlay to new floor",
    floorChange.state.floor.id === 2 && floorChange.state.flags.mapOverlayVisible,
    `floor=${floorChange.state.floor.id}`,
  );

  await page.setViewportSize({ width: 390, height: 700 });
  await wait(250);
  const small = await capture("15-small-viewport");
  check(
    "small viewport stays contained",
    !!small.metrics &&
      small.metrics.widthFraction <= 0.73 &&
      small.metrics.heightFraction <= 0.73,
    JSON.stringify(small.metrics),
  );

  const readiness = await page.evaluate(() => window.__onyxDebug.readiness());
  report.readiness = readiness;
  report.finalSnapshot = await snap(page, { map: true, mapRadius: 7 });
  report.transcript = getTranscript(page);
  report.browserErrors = errors;
  check("asset readiness has no failures", readiness.failed.length === 0, JSON.stringify(readiness.failed));
  check("browser console/network log is empty", errors.length === 0, JSON.stringify(errors));
} catch (error) {
  report.exception = String(error?.stack ?? error);
  check("script completed", false, report.exception);
}

report.ok = report.checks.every((entry) => entry.ok);
const reportPath = path.join(OUT, "report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${reportPath}`);
await browser.close();
process.exit(report.ok ? 0 : 1);
