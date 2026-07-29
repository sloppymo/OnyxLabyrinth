/**
 * Smoke playtest for Floor 1 "The Proving Depths" redesign.
 *
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 * Run: node scripts/playtests/smoke-floor-1-proving-depths.mjs
 */
import {
  launch,
  wait,
  press,
  snap,
  snapWithMap,
  waitForIdle,
  ensureOutDir,
  shot,
  jumpTo,
  boot,
  debugLog,
  createFindings,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/smoke-floor-1-proving-depths");
const log = (...a) => console.log(...a);

const { browser, page, errors } = await launch();
const findings = createFindings({ page, outDir: OUT, errors, log });

function check(name, cond, detail = "") {
  if (cond) log(`  ok   ${name}`);
  else findings.find("P0", 1, name, detail);
}

async function recentMessages(n = 40) {
  const entries = await debugLog(page, n, "message");
  return entries.map((e) => e.text ?? e.message ?? JSON.stringify(e));
}

async function face(target) {
  const cur = await page.evaluate(() => window.__onyxDebug.state.player.facing);
  let delta = (target - cur + 4) % 4;
  if (delta === 3) await press(page, "ArrowLeft");
  else for (let i = 0; i < delta; i++) await press(page, "ArrowRight");
  await waitForIdle(page);
}

async function step() {
  await press(page, "ArrowUp");
  await waitForIdle(page);
  const mode = await page.evaluate(() => window.__onyxDebug.state.mode);
  if (mode === "combat") {
    log("  (flee combat)");
    await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
    await wait(400);
    await press(page, "Enter");
    await waitForIdle(page);
  }
}

async function stepOnto(x, y, facing, from) {
  await jumpTo(page, {
    floorId: 1,
    x: from.x,
    y: from.y,
    facing,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await face(facing);
  await step();
  return snap(page);
}

async function edgeAt(x, y, dir) {
  return page.evaluate(
    ([cx, cy, d]) => window.__onyxDebug.state.floor.grid[cy][cx][d],
    [x, y, dir]
  );
}

async function grantKey(keyId) {
  await page.evaluate((id) => {
    const k = window.__onyxDebug.state.keys;
    if (!k.includes(id)) k.push(id);
  }, keyId);
}

try {
  log("=== boot to Floor 1 start ===");
  await boot(page, BASE, {
    scenario: {
      floorId: 1,
      x: 2,
      y: 22,
      facing: 0,
      keys: [],
      autosave: false,
      stepsSinceEncounter: 0,
    },
  });

  let s = await snapWithMap(page, 6);
  const dims = await page.evaluate(() => ({
    w: window.__onyxDebug.state.floor.width,
    h: window.__onyxDebug.state.floor.height,
  }));
  check("floor name is The Proving Depths", s.floor?.name === "The Proving Depths", `got ${s.floor?.name}`);
  check("floor size 25x32", dims.w === 25 && dims.h === 32, JSON.stringify(dims));
  check("spawn at start (2,22)", s.pos?.x === 2 && s.pos?.y === 22, `got (${s.pos?.x},${s.pos?.y})`);
  check("dungeon route", s.route === "dungeon", `got ${s.route}`);
  await shot(page, OUT, "01-start.png");

  log("=== inert sealed-arch event (16,10) ===");
  s = await stepOnto(16, 10, 1, { x: 15, y: 10 });
  check("still floor 1 after sealed arch", s.floor?.id === 1);
  {
    const msgs = await recentMessages();
    check(
      "sealed-arch message fired",
      msgs.some((m) => /sealed arch/i.test(String(m))),
      JSON.stringify(msgs.slice(0, 8))
    );
  }

  log("=== inert chute message (15,30) ===");
  s = await stepOnto(15, 30, 2, { x: 15, y: 29 });
  check("still floor 1 after chute tile", s.floor?.id === 1);
  {
    const msgs = await recentMessages();
    check(
      "chute inert message",
      msgs.some((m) => /chute drops into darkness/i.test(String(m))),
      JSON.stringify(msgs.slice(0, 8))
    );
  }

  log("=== pit damage (7,23) — no floor change ===");
  s = await stepOnto(7, 23, 3, { x: 8, y: 23 });
  check("still floor 1 after pit", s.floor?.id === 1);
  check("on pit tile", s.pos?.x === 7 && s.pos?.y === 23, `(${s.pos?.x},${s.pos?.y})`);
  check(
    "party not wiped by pit",
    (s.party ?? []).every((c) => c.hp >= 1),
    JSON.stringify((s.party ?? []).map((c) => ({ hp: c.hp, name: c.name })))
  );

  log("=== crypt-key unlock at (6,5) e ===");
  await jumpTo(page, {
    floorId: 1,
    x: 6,
    y: 5,
    facing: 1,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await grantKey("crypt-key");
  await face(1);
  await press(page, "u");
  await waitForIdle(page);
  {
    const edge = await edgeAt(6, 5, "e");
    const msgs = await recentMessages();
    check(
      "crypt-key unlocks eastern lock",
      edge === "door" || edge === "open" || msgs.some((m) => /unlock|swings open/i.test(String(m))),
      `edge=${edge} msgs=${JSON.stringify(msgs.slice(0, 6))}`
    );
  }

  log("=== brass-key unlock at (6,23) n ===");
  await jumpTo(page, {
    floorId: 1,
    x: 6,
    y: 23,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
  });
  await grantKey("brass-key");
  await face(0);
  await press(page, "u");
  await waitForIdle(page);
  {
    const edge = await edgeAt(6, 23, "n");
    const msgs = await recentMessages();
    check(
      "brass-key unlocks northern lock",
      edge === "door" || edge === "open" || msgs.some((m) => /unlock|swings open/i.test(String(m))),
      `edge=${edge} msgs=${JSON.stringify(msgs.slice(0, 6))}`
    );
  }

  log("=== same-floor teleporter (18,12) → SE pocket (22,28) ===");
  s = await stepOnto(18, 12, 1, { x: 17, y: 12 });
  check(
    "teleporter landed in SE pocket",
    s.floor?.id === 1 && s.pos?.x === 22 && s.pos?.y === 28,
    `got floor=${s.floor?.id} (${s.pos?.x},${s.pos?.y})`
  );
  await shot(page, OUT, "02-teleporter-pocket.png");

  log("=== stairs_down (4,1) → Floor 2 ===");
  s = await stepOnto(4, 1, 0, { x: 4, y: 2 });
  await waitForIdle(page, 5000);
  s = await snap(page);
  check("descended to Floor 2", s.floor?.id === 2, `got floor ${s.floor?.id} route=${s.route} pos=(${s.pos?.x},${s.pos?.y})`);
  await shot(page, OUT, "03-floor-2.png");

  log("=== Maro NPC panel ===");
  s = await stepOnto(8, 6, 1, { x: 7, y: 6 });
  check("Maro NPC route", s.route === "npc", `route=${s.route}`);
  if (s.route === "npc") {
    await press(page, "Escape");
    await waitForIdle(page);
  }
  await shot(page, OUT, "04-end.png");
} catch (e) {
  findings.find("P0", 1, "script crashed", String(e?.stack ?? e));
  console.error(e);
} finally {
  await findings.flush();
  await browser.close();
}

const fails = findings.findings.filter((f) => f.sev === "P0" || f.sev === "P1");
log(`\n=== result: ${fails.length === 0 ? "PASS" : "FAIL"} (${fails.length} failures) ===`);
for (const f of fails) log(`  [${f.sev}] ${f.title}${f.body ? ` — ${f.body}` : ""}`);
if (errors.length) {
  log(`browser errors (${errors.length}):`);
  for (const e of errors.slice(0, 10)) log(`  ${e}`);
}
process.exit(fails.length ? 1 : 0);
