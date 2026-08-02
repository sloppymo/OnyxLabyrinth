/**
 * Authored music routing smoke.
 *
 * Run after `npm run build` with a production preview available:
 *   ONYX_URL=http://127.0.0.1:5176/OnyxLabyrinth/?debug=1 \
 *     node scripts/playtests/music-routing-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  boot,
  ensureOutDir,
  launch,
  shot,
  snap,
  wait,
  waitForIdle,
} from "./lib.mjs";

const BASE_URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir(process.env.ONYX_OUT ?? "/tmp/onyx-music-routing");
const DUNGEON_MUSIC_FILES = new Set([
  "torchlight-beneath-stone.mp3",
  "understone-dungeon-loop.mp3",
  "emberwake-strings-loop.mp3",
  "emberwake-organ-loop.mp3",
]);
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const musicResponses = [];
const checks = [];

page.on("response", (response) => {
  if (response.url().includes("/assets/music/")) {
    musicResponses.push({ url: response.url(), status: response.status() });
  }
});

// Keep the real HTMLAudio elements so Chromium still fetches/decodes the MP3s,
// but retain lifecycle evidence for elements created outside the DOM.
await page.addInitScript(() => {
  const NativeAudio = window.Audio;
  window.__musicAudit = [];
  window.Audio = function AudioWithAudit(src) {
    const element = new NativeAudio(src);
    const entry = {
      src: String(src ?? ""),
      plays: 0,
      pauses: 0,
      element,
    };
    window.__musicAudit.push(entry);
    const nativePlay = element.play.bind(element);
    const nativePause = element.pause.bind(element);
    element.play = () => {
      entry.plays++;
      return nativePlay();
    };
    element.pause = () => {
      entry.pauses++;
      return nativePause();
    };
    return element;
  };
  window.Audio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(window.Audio, NativeAudio);
});

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function dungeonMusicFile(entry) {
  const filename = entry?.src.split("/").at(-1);
  return DUNGEON_MUSIC_FILES.has(filename) ? filename : null;
}

async function audioAudit() {
  return page.evaluate(() =>
    window.__musicAudit.map(({ element, ...entry }) => ({
      ...entry,
      loop: element.loop,
      volume: element.volume,
      currentTime: element.currentTime,
      paused: element.paused,
      readyState: element.readyState,
      networkState: element.networkState,
    }))
  );
}

async function startEncounter(asBoss = false) {
  return page.evaluate(async (boss) => {
    const d = window.__onyxDebug;
    const s = d.state;
    let resolved = null;
    for (let attempts = 0; attempts < 300; attempts++) {
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) continue;
      const enemies = d.resolveEncounter(entry);
      if (!enemies.length || enemies.some((candidate) => candidate.enemy.isBoss)) continue;
      resolved = enemies;
      break;
    }
    if (!resolved) return false;
    const combat = d.createCombatFromEncounter(
      s.party,
      resolved,
      d.SPELLS_BY_ID,
      d.ITEMS_BY_ID,
      s.equipment,
      s.inventory,
      s.inAntimagic,
      s.activeCharIds
    );
    combat.isBoss = boss;
    await d.startCombat(combat);
    return true;
  }, asBoss);
}

function freshUrl(attempt) {
  const url = new URL(BASE_URL);
  url.searchParams.set("debug", "1");
  url.searchParams.set("musicAttempt", String(attempt));
  return url.toString();
}

try {
  const scenario = {
    floorId: 1,
    x: 11,
    y: 25,
    facing: 0,
    autosave: false,
    stepsSinceEncounter: 0,
  };

  const firstVisit = await boot(page, freshUrl(0), { scenario });
  await wait(500);
  let audit = await audioAudit();
  const firstDungeon = audit.find((entry) => dungeonMusicFile(entry));
  check("first visit enters dungeon", firstVisit.route === "dungeon", `route=${firstVisit.route}`);
  check(
    "dungeon visit selects one dungeon theme",
    !!firstDungeon && firstDungeon.plays >= 1 && firstDungeon.loop && firstDungeon.volume === 0.4,
    JSON.stringify(firstDungeon)
  );
  const firstTheme = dungeonMusicFile(firstDungeon)?.replace(/\.mp3$/, "") ?? "unknown";
  await shot(page, OUT, `dungeon-first-${firstTheme}.png`);

  const started = await startEncounter(false);
  check("normal combat starts", started === true);
  await wait(2200);
  const combat = await snap(page);
  audit = await audioAudit();
  const battle = audit.find((entry) => entry.src.includes("battle-theme-v3.mp3"));
  const dungeonDuringCombat = audit.find(
    (entry) => dungeonMusicFile(entry) && entry.pauses > 0
  );
  check("normal combat route visible", combat.route === "combat", `route=${combat.route}`);
  check(
    "Battle Theme v3 starts for normal combat",
    !!battle && battle.plays >= 1 && battle.loop && battle.volume === 0.46,
    JSON.stringify(battle)
  );
  check("dungeon stem stops for combat", !!dungeonDuringCombat, JSON.stringify(dungeonDuringCombat));
  await shot(page, OUT, "normal-combat.png");

  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  const deadline = Date.now() + 8000;
  let returned = await snap(page);
  while (returned.route === "combat" && Date.now() < deadline) {
    await wait(120);
    returned = await snap(page);
  }
  await waitForIdle(page, 4000);
  await wait(500);
  audit = await audioAudit();
  const battleAfter = audit.find((entry) => entry.src.includes("battle-theme-v3.mp3"));
  const dungeonVisits = audit.filter((entry) => dungeonMusicFile(entry));
  check("combat returns to dungeon", returned.route === "dungeon", `route=${returned.route}`);
  check(
    "battle theme stops and rewinds",
    !!battleAfter && battleAfter.pauses >= 1 && battleAfter.currentTime === 0,
    JSON.stringify(battleAfter)
  );
  check(
    "return to dungeon starts a fresh random visit",
    dungeonVisits.length === 2 && dungeonVisits[1].plays >= 1,
    JSON.stringify(dungeonVisits)
  );
  await shot(page, OUT, "dungeon-after-combat.png");

  // Reload fresh visits until the real random picker has exercised all four
  // files. Forty-eight attempts leave a negligible chance of missing a theme;
  // unit tests deterministically pin all four equal-probability branches.
  const seenDungeonFiles = new Set(dungeonVisits.map((entry) => dungeonMusicFile(entry)));
  let lastVisit = returned;
  for (let attempt = 1; attempt <= 48 && seenDungeonFiles.size < DUNGEON_MUSIC_FILES.size; attempt++) {
    lastVisit = await boot(page, freshUrl(attempt), { scenario });
    await wait(350);
    audit = await audioAudit();
    for (const entry of audit) {
      const filename = dungeonMusicFile(entry);
      if (filename && entry.plays >= 1) seenDungeonFiles.add(filename);
    }
  }
  check(
    "random picker exercised every dungeon theme",
    seenDungeonFiles.size === DUNGEON_MUSIC_FILES.size,
    JSON.stringify([...seenDungeonFiles])
  );
  check("randomized reload remains in dungeon", lastVisit.route === "dungeon", `route=${lastVisit.route}`);
  await shot(page, OUT, "dungeon-randomized-reload.png");

  const bossStarted = await startEncounter(true);
  check("boss combat starts", bossStarted === true);
  await wait(2200);
  const boss = await snap(page);
  audit = await audioAudit();
  const authoredBattleDuringBoss = audit.find((entry) => entry.src.includes("battle-theme-v3.mp3"));
  check("boss combat route visible", boss.route === "combat", `route=${boss.route}`);
  check(
    "boss keeps the exclusive procedural bed",
    authoredBattleDuringBoss == null,
    JSON.stringify(authoredBattleDuringBoss)
  );
  await shot(page, OUT, "boss-combat-procedural-bed.png");
  await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
  await waitForIdle(page, 8000);

  const failedMusicResponses = musicResponses.filter((response) => response.status >= 400);
  check("music responses succeeded", failedMusicResponses.length === 0, JSON.stringify(failedMusicResponses));
  check("browser errors empty", errors.length === 0, JSON.stringify(errors));
} catch (error) {
  check("script completed", false, String(error?.stack ?? error));
}

const report = {
  at: new Date().toISOString(),
  url: BASE_URL,
  ok: checks.every((entry) => entry.ok),
  checks,
  musicResponses,
  browserErrors: errors,
};
fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${path.join(OUT, "report.json")}`);
await browser.close();
process.exit(report.ok ? 0 : 1);
