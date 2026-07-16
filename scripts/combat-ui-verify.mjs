/**
 * Visual gate for combat-ui punch-list closeout:
 * 1) Enemy window worst-case wrap (two 2-line names)
 * 2) Heal-target frame: acting plate on caster + selection on a different ally
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ?? "http://127.0.0.1:5179/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-15-combat-ui");
fs.mkdirSync(OUT, { recursive: true });

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await wait(80);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 800 } })
).newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await wait(500);

await press(page, "Enter"); // New Game
await wait(400);
await press(page, "Enter"); // Default party
await wait(800);

const boot = await page.evaluate(() => {
  const d = window.__onyxDebug;
  if (!d) return { ok: false, reason: "no debug" };
  const party = d.state.party;
  const classes = party.map((c) => `${c.name}:${c.class}`);
  const resolved = d.resolveEncounter({
    id: "verify-wrap",
    weight: 1,
    spawns: [
      { enemyId: "failed-experiment", row: "front" },
      { enemyId: "failed-experiment", row: "front" },
      { enemyId: "blood-wraith", row: "back" },
    ],
  });
  const loadout = {};
  for (const c of party) loadout[c.id] = d.defaultLoadoutForCharacter(c);
  const combat = d.createCombatFromEncounter(
    party,
    resolved,
    d.SPELLS_BY_ID,
    d.ITEMS_BY_ID,
    loadout,
    d.state.inventory,
    false
  );
  const living = [...combat.enemies.front, ...combat.enemies.back];
  if (living[0]) living[0].name = "Failed Experiment";
  if (living[1]) living[1].name = "Failed Experiment";
  if (living[2]) living[2].name = "Blood Wraith Archive Sentinel";
  for (const c of combat.party) {
    if (c.class === "Priest") c.stats.agi = 99;
    else c.stats.agi = 1;
  }
  d.startCombat(combat);
  return { ok: true, classes, n: living.length };
});
console.log("boot", boot);
if (!boot.ok) {
  await browser.close();
  process.exit(1);
}

let phase = null;
for (let i = 0; i < 40; i++) {
  phase = await page.evaluate(() => {
    const cc = window.__onyxDebug.getCombatController();
    return {
      mode: window.__onyxDebug.state.mode,
      phase: cc?.getPhase?.() ?? null,
      name: cc?.state?.party?.find((p) => p.id === cc?.currentActorId)?.name,
      cls: cc?.state?.party?.find((p) => p.id === cc?.currentActorId)?.class,
    };
  });
  if (phase.mode === "combat" && phase.phase === "palette" && phase.cls === "Priest") {
    break;
  }
  await wait(150);
}
console.log("priest turn", phase);

const enemyMetrics = await page.evaluate(() => {
  const root = document.querySelector("#combat-windows");
  const win = root?.querySelector(".ff6-enemies");
  const rows = [...(root?.querySelectorAll(".ff6-enemy-row") ?? [])].map((r) => {
    const nameSpan = r.querySelector("span:first-child");
    const cs = nameSpan ? getComputedStyle(nameSpan) : null;
    return {
      text: r.textContent?.replace(/\s+/g, " ").trim(),
      rowH: r.getBoundingClientRect().height,
      nameH: nameSpan?.getBoundingClientRect().height ?? 0,
      lineClamp: cs?.webkitLineClamp ?? null,
    };
  });
  return {
    winH: win?.clientHeight ?? 0,
    scrollH: win?.scrollHeight ?? 0,
    maxH: win ? getComputedStyle(win).maxHeight : null,
    overflowY: win ? getComputedStyle(win).overflowY : null,
    clipped: win ? win.scrollHeight > win.clientHeight + 1 : null,
    rows,
  };
});
console.log("enemyMetrics", JSON.stringify(enemyMetrics, null, 2));
await page.locator("#combat-windows").screenshot({
  path: path.join(OUT, "01-enemy-wrap-worst-case.png"),
});
await page.screenshot({ path: path.join(OUT, "01-enemy-wrap-full.png") });

await page.evaluate(() => {
  window.__onyxDebug.getCombatController().handleInput({
    kind: "press",
    button: "x",
  });
});
await wait(300);

const spellNav = await page.evaluate(() => {
  const root = document.querySelector("#combat-windows");
  const items = [...(root?.querySelectorAll(".ff6-menu-item") ?? [])].map(
    (el, i) => ({
      i,
      text: el.textContent?.replace(/\s+/g, " ").trim(),
    })
  );
  const cure = items.find((x) => /Cure Wounds/i.test(x.text ?? ""));
  return {
    phase: window.__onyxDebug.getCombatController()?.getPhase?.(),
    items,
    cureIndex: cure?.i ?? -1,
  };
});
console.log("spells", spellNav);

if (spellNav.cureIndex < 0) {
  console.error("Cure Wounds not found");
  await page.screenshot({ path: path.join(OUT, "02-heal-FAIL.png") });
  await browser.close();
  process.exit(1);
}

for (let i = 0; i < spellNav.cureIndex; i++) {
  await page.evaluate(() => {
    window.__onyxDebug.getCombatController().handleInput({
      kind: "press",
      button: "down",
    });
  });
  await wait(60);
}
await page.evaluate(() => {
  window.__onyxDebug.getCombatController().handleInput({
    kind: "press",
    button: "a",
  });
});
await wait(300);

await page.evaluate(() => {
  const cc = window.__onyxDebug.getCombatController();
  cc.handleInput({ kind: "press", button: "down" });
  cc.handleInput({ kind: "press", button: "down" });
});
await wait(250);

const healFrame = await page.evaluate(() => {
  const root = document.querySelector("#combat-windows");
  const cc = window.__onyxDebug.getCombatController();
  const acting = cc?.state?.party?.find((p) => p.id === cc?.currentActorId);
  const selected = root?.querySelector(".ff6-menu-item.selected");
  const actingRow = root?.querySelector(".ff6-party-row.current");
  const actingPlate = actingRow?.querySelector(".ff6-p-name");
  return {
    phase: cc?.getPhase?.(),
    acting: acting?.name,
    selectedLabel: selected?.textContent?.replace(/\s+/g, " ").trim(),
    selColor: selected ? getComputedStyle(selected).color : null,
    plateBg: actingPlate ? getComputedStyle(actingPlate).backgroundColor : null,
    actingPlateText: actingPlate?.textContent?.replace(/\s+/g, " ").trim(),
  };
});
console.log("healFrame", healFrame);
await page.screenshot({
  path: path.join(OUT, "02-heal-target-dual-cue.png"),
});
await page.locator("#combat-windows").screenshot({
  path: path.join(OUT, "02-heal-target-windows.png"),
});

const rgb = (s) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const plate = rgb(healFrame.plateBg);
const sel = rgb(healFrame.selColor);
if (plate && sel) {
  const dist = Math.hypot(plate[0] - sel[0], plate[1] - sel[1], plate[2] - sel[2]);
  console.log("colorDistance", dist.toFixed(1), { plate, sel });
}

const ok =
  healFrame.phase === "selectTarget" &&
  healFrame.acting === "Eve" &&
  !!healFrame.selectedLabel &&
  !healFrame.selectedLabel.startsWith("Eve");
console.log(ok ? "PASS heal dual-cue frame" : "FAIL heal dual-cue frame");

await browser.close();
console.log("saved to", OUT);
process.exit(ok ? 0 : 1);
