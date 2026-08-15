// Deterministic browser QA for the game's small hubs.
//
// Usage:
//   npx vite preview --port 5176 --base /OnyxLabyrinth/
//   npm run playtest:hubs
//   npm run playtest:hubs -- --hub isobel
//
// The runner intentionally uses the real debug jump path, then performs the
// smallest meaningful interaction for each hub. It leaves gameplay untouched:
// encounter rates are disabled only in the in-memory QA session, and every
// scenario starts from a fresh page state.
import { execFileSync } from "node:child_process";
import { launch, boot, act, press, shot, snap, ensureOutDir, wait } from "./lib.mjs";

const URL = process.env.HUB_QA_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(process.env.HUB_QA_OUT ?? "playtest-screenshots/hub-qa");
const args = process.argv.slice(2);
const requested = args.includes("--hub") ? args[args.indexOf("--hub") + 1] : "all";
const validHubs = ["camp", "namanda", "tavern", "isobel"];
const hubs = requested === "all" ? validHubs : [requested];

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run playtest:hubs -- [--hub all|${validHubs.join("|")}]`);
  process.exit(0);
}

if (hubs.some((hub) => !validHubs.includes(hub))) {
  console.error(`Usage: npm run playtest:hubs -- [--hub all|${validHubs.join("|")}]`);
  process.exit(2);
}

const failures = [];
const results = [];

function check(hub, condition, title, details = "") {
  if (condition) return true;
  const finding = { hub, title, details };
  failures.push(finding);
  console.error(`[FAIL] ${hub}: ${title}${details ? ` — ${details}` : ""}`);
  return false;
}

function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function checkpoint(page, hub, name) {
  const state = await snap(page);
  const screenshot = await shot(page, OUT, `${hub}-${name}.png`);
  return { name, screenshot, route: state.route, mode: state.mode, pos: state.pos, state };
}

async function setDeterministicDungeon(page) {
  await page.evaluate(() => {
    window.__onyxDebug.state.floor.encounterRate = 0;
    window.__onyxDebug.state.stepsSinceEncounter = 0;
  });
}

async function floorContract(page) {
  return page.evaluate(() => {
    const floor = window.__onyxDebug.findFloor(1);
    if (!floor) throw new Error("Floor 1 is not registered");
    return {
      dimensions: [floor.width, floor.height],
      npcs: (floor.npcs ?? []).map((npc) => ({ id: npc.id, x: npc.x, y: npc.y })),
      doors: [
        floor.grid[28]?.[15]?.e,
        floor.grid[28]?.[16]?.w,
      ],
      isobelSafe: (floor.encounterZones ?? []).find((zone) => zone.id === "isobels-safe") ?? null,
    };
  });
}

async function finishOverlay(page, hub, expectedRoute) {
  const before = await snap(page);
  check(hub, before.route === expectedRoute, `opened ${expectedRoute} controller`, `got ${before.route}`);
  await act(page, "Escape");
  const after = await snap(page);
  check(hub, after.route === "dungeon", "Escape returns to dungeon", `got ${after.route}`);
  return after;
}

async function runCamp(page) {
  const hub = "camp";
  await boot(page, URL, { scenario: { floorId: 1, x: 11, y: 25, facing: 0, autosave: false } });
  await setDeterministicDungeon(page);
  const floor = await floorContract(page);
  check(hub, floor.dimensions[0] === 28 && floor.dimensions[1] === 41, "Floor 1 dimensions are the expanded hub map");
  const captures = [await checkpoint(page, hub, "01-approach")];

  await act(page, "c");
  const resting = await checkpoint(page, hub, "02-resting");
  captures.push(resting);
  check(hub, resting.route === "camp", "C opens outdoor camp/rest hub", `got ${resting.route}`);
  check(hub, /Camp — Day \d+/i.test(await bodyText(page)), "camp day window is visible");
  check(hub, /Resting\.\.\./i.test(await bodyText(page)), "camp healing phase is visible");

  await wait(3400);
  const rested = await checkpoint(page, hub, "03-rested-menu");
  captures.push(rested);
  check(hub, rested.route === "camp", "camp settles into its menu", `got ${rested.route}`);
  check(hub, /Rested|Continue exploring|View character sheets/i.test(await bodyText(page)), "rested camp menu is visible");
  await finishOverlay(page, hub, "camp");
  captures.push(await checkpoint(page, hub, "04-returned-to-dungeon"));
  return captures;
}

async function runNamanda(page) {
  const hub = "namanda";
  await boot(page, URL, { scenario: { floorId: 1, x: 10, y: 4, facing: 0, autosave: false } });
  await setDeterministicDungeon(page);
  const floor = await floorContract(page);
  const altar = floor.npcs.find((npc) => npc.id === "namanda-altar");
  check(hub, altar?.x === 10 && altar?.y === 3, "altar coordinate contract is intact");
  const captures = [await checkpoint(page, hub, "01-approach")];
  await act(page, "ArrowUp");
  captures.push(await checkpoint(page, hub, "02-church-service"));
  const text = await bodyText(page);
  check(hub, (await snap(page)).route === "namanda", "stepping onto altar opens Church controller");
  check(hub, /Church of Saint Namanda/i.test(text), "church title is visible");
  check(hub, /Heal/i.test(text) && /Blessing/i.test(text) && /Uncurse/i.test(text), "church services are visible");
  await finishOverlay(page, hub, "namanda");
  captures.push(await checkpoint(page, hub, "03-returned-to-dungeon"));
  return captures;
}

async function runTavern(page) {
  const hub = "tavern";
  await boot(page, URL, { scenario: { floorId: 1, x: 20, y: 25, facing: 2, autosave: false } });
  await setDeterministicDungeon(page);
  const floor = await floorContract(page);
  const hotBoi = floor.npcs.find((npc) => npc.id === "hot-boi");
  check(hub, hotBoi?.x === 20 && hotBoi?.y === 26, "Hot Boi coordinate contract is intact");
  const captures = [await checkpoint(page, hub, "01-approach")];
  await act(page, "ArrowUp");
  captures.push(await checkpoint(page, hub, "02-bar-service"));
  const text = await bodyText(page);
  check(hub, (await snap(page)).route === "tavern", "stepping onto Hot Boi opens Tavern controller");
  check(hub, /Hot Boi/i.test(text), "Hot Boi title or greeting is visible");
  check(hub, /Rest/i.test(text) && /Rumors/i.test(text) && /Scorchboard/i.test(text), "bar services are visible");
  await finishOverlay(page, hub, "tavern");
  captures.push(await checkpoint(page, hub, "03-returned-to-dungeon"));
  return captures;
}

async function runIsobel(page) {
  const hub = "isobel";
  await boot(page, URL, { scenario: { floorId: 1, x: 15, y: 28, facing: 1, autosave: false } });
  await setDeterministicDungeon(page);
  const floor = await floorContract(page);
  const isobel = floor.npcs.find((npc) => npc.id === "isobel");
  check(hub, isobel?.x === 17 && isobel?.y === 28, "Isobel coordinate contract is intact");
  check(hub, floor.doors[0] === "door" && floor.doors[1] === "door", "Isobel entrance remains a symmetric door");
  check(
    hub,
    floor.isobelSafe?.safeZone === true && floor.isobelSafe?.rateMul === 0 &&
      floor.isobelSafe.x1 === 16 && floor.isobelSafe.y1 === 27 &&
      floor.isobelSafe.x2 === 17 && floor.isobelSafe.y2 === 29,
    "all six Isobel shop cells remain an encounter-safe zone"
  );
  const captures = [await checkpoint(page, hub, "01-sign-approach")];
  await act(page, "ArrowUp");
  captures.push(await checkpoint(page, hub, "02-shop-interior"));
  check(hub, (await snap(page)).route === "dungeon", "door leads into dungeon shop interior", `got ${(await snap(page)).route}`);

  await act(page, "ArrowUp");
  captures.push(await checkpoint(page, hub, "03-isobel-panel"));
  check(hub, (await snap(page)).route === "npc", "stepping onto Isobel opens NPC controller");
  // The portrait-dialogue system deliberately presents the greeting before
  // exposing actions. Acknowledge it exactly as a player must before testing
  // the shop menu.
  for (let attempt = 0; attempt < 2 && !/Browse Iso-Spells/i.test(await bodyText(page)); attempt++) {
    await press(page, "Enter");
    await wait(150);
  }
  const panelText = await bodyText(page);
  check(hub, /Isobel/i.test(panelText) && /ISO-SPELLS/i.test(panelText), "Isobel identity is visible");
  check(hub, /Browse Iso-Spells/i.test(panelText), "spell-shop action is visible");
  check(hub, !/Attack|Steal|Barter|Give/.test(panelText), "shopkeeper does not expose hostile/trade actions");

  await press(page, "b");
  await wait(150);
  captures.push(await checkpoint(page, hub, "04-spell-list"));
  const shopText = await bodyText(page);
  check(hub, /GOLD:/i.test(shopText), "shop shows current gold");
  for (const spell of ["Isoflare", "Isovoid", "Isostorm", "Isoheal", "Isobarrier", "Isorevive"]) {
    check(hub, shopText.includes(spell), `shop lists ${spell}`);
  }
  check(hub, /2,400g|2,400 G|2400/.test(shopText), "shop exposes deterministic spell pricing");
  await act(page, "Escape");
  const afterShop = await snap(page);
  check(hub, afterShop.route === "npc", "Escape leaves spell list at Isobel's panel", `got ${afterShop.route}`);
  await act(page, "Escape");
  const after = await snap(page);
  check(hub, after.route === "dungeon", "Escape leaves Isobel's cleanly", `got ${after.route}`);
  captures.push(await checkpoint(page, hub, "05-returned-to-dungeon"));
  return captures;
}

const runners = { camp: runCamp, namanda: runNamanda, tavern: runTavern, isobel: runIsobel };
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  for (const hub of hubs) {
    try {
      results.push({ hub, captures: await runners[hub](page) });
    } catch (error) {
      failures.push({ hub, title: "runner exception", details: String(error) });
      console.error(`[FAIL] ${hub}: runner exception — ${error}`);
    }
  }
} finally {
  await browser.close();
}

const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  url: URL,
  hubs,
  git: (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })(),
  results,
  failures,
  browserErrors: errors,
  pass: failures.length === 0 && errors.length === 0,
};
await import("node:fs").then(({ writeFileSync }) => writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2)));
console.log(JSON.stringify({ pass: report.pass, hubs, failures, browserErrors: errors, output: OUT }, null, 2));
if (!report.pass) process.exitCode = 1;
