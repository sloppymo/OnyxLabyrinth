/**
 * Combat UI verify gate — catches footer mid-token clips and roster name
 * ellipsis that screenshots keep finding after joinHintParts "fixes".
 *
 * Usage: PLAYTEST_URL=http://127.0.0.1:5180/OnyxLabyrinth/?debug=1 node scripts/combat-ui-verify.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ?? "http://127.0.0.1:5180/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-15-highcam-rebake");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function assertNoMidTokenFooter(text, label) {
  const t = (text ?? "").trim();
  if (!t) return;
  // Trailing "Esc:" / "Start:" / "hold B:" without a verb = CSS mid-token clip.
  if (/:\s*$/.test(t) || /·\s*[A-Za-z]+:\s*$/.test(t)) {
    throw new Error(`${label}: mid-token footer clip → "${t}"`);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await wait(300);
await page.keyboard.press("Enter");
await wait(200);
await page.keyboard.press("Enter");
await wait(500);

await page.evaluate(async () => {
  const d = window.__onyxDebug;
  d.state.floor = structuredClone(d.findFloor(1));
  // Enter dungeon so flee returns to corridor textures.
  d.state.mode = "dungeon";
  const resolved = d.resolveEncounter({
    id: "ui-verify",
    weight: 1,
    spawns: [
      { enemyId: "skeleton", row: "front" },
      { enemyId: "skeleton", row: "front" },
      { enemyId: "skeleton", row: "front" },
      { enemyId: "skeleton-archer", row: "back" },
      { enemyId: "skeleton-archer", row: "back" },
      { enemyId: "armored-skeleton", row: "back" },
    ],
  });
  const loadout = Object.fromEntries(
    d.state.party.map((c) => [c.id, d.defaultLoadoutForCharacter(c)])
  );
  await d.startCombat(
    d.createCombatFromEncounter(
      d.state.party,
      resolved,
      d.SPELLS_BY_ID,
      d.ITEMS_BY_ID,
      loadout,
      d.state.inventory,
      false
    )
  );
});
await wait(900);

const menuCheck = await page.evaluate(() => {
  const hint =
    document.querySelector(".ff6-menu .ff6-hint-row:not(.ff6-resource-row)")
      ?.textContent ?? "";
  const rows = [...document.querySelectorAll(".ff6-party-row")].map((row) => {
    const text = row.querySelector(".ff6-p-name-text");
    return {
      name: text?.textContent ?? "",
      shown: text?.textContent ?? "",
      truncated: !!text && text.scrollWidth > text.clientWidth + 1,
      clientW: text ? Math.round(text.clientWidth) : 0,
      scrollW: text ? Math.round(text.scrollWidth) : 0,
    };
  });
  return { hint, rows };
});

assertNoMidTokenFooter(menuCheck.hint, "palette footer");
for (const r of menuCheck.rows) {
  if (r.truncated && r.name.length <= 4) {
    throw new Error(
      `roster: ${r.name} truncated at ${r.clientW}px (scroll ${r.scrollW}) — 4-letter names must stay recognizable`
    );
  }
}

await page.screenshot({ path: path.join(OUT, "verify-menu.png") });

// Trigger playback footer
await page.keyboard.press("a");
await wait(100);
await page.keyboard.press("Enter");
await wait(180);
const playHint = await page.evaluate(
  () =>
    document.querySelector(".ff6-menu .ff6-hint-row:not(.ff6-resource-row)")
      ?.textContent ?? ""
);
assertNoMidTokenFooter(playHint, "playback footer");
await page.screenshot({ path: path.join(OUT, "verify-playback.png") });

// Wait until the attack playback leaves the menu hint (or times out), then
 // force-flee. Mid-playback exitDebugCombat can race the controller teardown.
for (let i = 0; i < 40; i++) {
  const stillPlaying = await page.evaluate(() => {
    const h =
      document.querySelector(".ff6-menu .ff6-hint-row:not(.ff6-resource-row)")
        ?.textContent ?? "";
    return /Shift:|Tab:FAST|Esc:skip|LT:|Y:FAST/.test(h);
  });
  if (!stillPlaying) break;
  await wait(100);
}
await wait(200);
const exitMeta = await page.evaluate(() => {
  const d = window.__onyxDebug;
  const pre = {
    hasCC: !!d.getCombatController(),
    hasCombat: !!d.state.combat,
    mode: d.state.mode,
  };
  d.exitDebugCombat("fled");
  return { pre, mode: d.state.mode };
});
if (!exitMeta.pre.hasCC || !exitMeta.pre.hasCombat) {
  throw new Error(
    `exitDebugCombat no-op (controller/combat missing) pre=${JSON.stringify(exitMeta.pre)}`
  );
}
await wait(600);
const dungeonOk = await page.evaluate(() => ({
  mode: window.__onyxDebug.state.mode,
}));
await page.screenshot({ path: path.join(OUT, "04-dungeon-after-combat.png") });
if (!["dungeon", "town", "arena", "title"].includes(dungeonOk.mode)) {
  throw new Error(`unexpected mode after flee: ${dungeonOk.mode}`);
}

console.log("combat-ui-verify OK", {
  paletteHint: menuCheck.hint,
  playbackHint: playHint,
  names: menuCheck.rows.map((r) => r.name),
  dungeon: dungeonOk.mode,
});
await browser.close();
