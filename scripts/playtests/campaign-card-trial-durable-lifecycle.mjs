/**
 * Production-browser proof for the durable campaign Card Trial lifecycle.
 *
 * Covers wipe → checkpoint → Retry, a real reserve/deck swap, Leave, and
 * closing/reloading during combat. Run against a production preview.
 */
import {
  bootToDungeon,
  clickAct,
  ensureOutDir,
  launch,
  shot,
  snap,
  wait,
  waitForIdle,
  waitUntil,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5179/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("output/playwright/campaign-card-trial-durable-lifecycle");
const failures = [];

function check(name, condition, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    const message = `${name}${detail ? ` — ${detail}` : ""}`;
    failures.push(message);
    console.log(`  FAIL ${message}`);
  }
}

async function waitForRoute(page, route, timeout = 10000) {
  await waitUntil(page, async () => (await snap(page)).route === route, `route ${route}`, timeout);
  return snap(page);
}

async function clickDialogChoice(page, label) {
  await waitUntil(
    page,
    async () =>
      (await page.locator(".ff6-menu-item").allTextContents()).some(
        (text) => text.trim() === label
      ),
    `dialog choice ${label}`
  );
  const rows = page.locator(".ff6-menu-item");
  for (let index = 0; index < (await rows.count()); index++) {
    const row = rows.nth(index);
    if ((await row.innerText()).trim() === label) {
      await row.click();
      return;
    }
  }
  throw new Error(`dialog choice disappeared before click: ${label}`);
}

async function passUntilResult(page, maxActions = 80) {
  for (let action = 0; action < maxActions; action++) {
    const state = await snap(page);
    if (state.route !== "card_trial") throw new Error(`fight left Card Trial at ${state.route}`);
    const phase = state.combat?.phase;
    if (phase === "result") return state;
    if (phase === "playback") {
      await waitForIdle(page, 7000);
      continue;
    }
    if (phase === "hand") {
      await clickAct(page, "pass");
      await waitForIdle(page, 7000);
      continue;
    }
    await wait(80);
  }
  throw new Error("fight did not reach a result while both heroes passed");
}

async function returnFromDefeatResult(page) {
  const result = await passUntilResult(page);
  check("passing reaches a wipe", result.combat?.result === "wipe", `got ${result.combat?.result}`);
  await page.keyboard.press("Enter");
  return waitForRoute(page, "dialog", 12000);
}

const { browser, page, errors } = await launch();

try {
  console.log("=== setup a losing authored encounter ===");
  await bootToDungeon(page, BASE);
  await page.evaluate(() => {
    const floor = window.__onyxDebug.findFloor(5);
    window.__onyxDebug.jumpTo({
      floorId: 5,
      x: floor.startX,
      y: floor.startY,
      facing: 0,
      autosave: false,
    });
    window.__onyxDebug.state.campaignCards["old-man"].collection.push({
      instanceId: "browser-reserve:old-man:faultline",
      cardId: "faultline",
      mastery: 0,
      branch: null,
    });
  });
  await waitForIdle(page, 10000);
  const before = await snap(page);
  const checkpoint = { ...before.pos };
  await page.evaluate(() =>
    window.__onyxDebug.startCampaignEncounter("f5-champion-revenant", { seed: 73 })
  );
  await waitForRoute(page, "card_trial", 12000);
  const seeded = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("checkpoint is saved before presentation", !!seeded.pendingCampaignEncounter);
  check("combat seed is persisted", seeded.pendingCampaignEncounter?.seed === 73);

  console.log("=== wipe → exact checkpoint → Retry ===");
  await returnFromDefeatResult(page);
  let state = await snap(page);
  check("defeat menu owns input", state.route === "dialog");
  check(
    "wipe restores exact position",
    state.pos.x === checkpoint.x && state.pos.y === checkpoint.y && state.pos.facing === checkpoint.facing,
    JSON.stringify({ checkpoint, actual: state.pos })
  );
  check("wipe fully restores Old Man", state.party.find((hero) => hero.id === "old-man")?.hp === state.party.find((hero) => hero.id === "old-man")?.maxHp);
  check("wipe fully restores Rat King", state.party.find((hero) => hero.id === "rat-king")?.hp === state.party.find((hero) => hero.id === "rat-king")?.maxHp);
  await shot(page, OUT, "01-defeat-menu.png");
  await page.keyboard.press("Enter");
  await waitForRoute(page, "card_trial", 12000);
  const retried = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("Retry keeps the exact combat seed", retried.pendingCampaignEncounter?.seed === 73);
  check(
    "Retry keeps the exact reward instance",
    retried.pendingCampaignEncounter?.reward?.instanceId === seeded.pendingCampaignEncounter?.reward?.instanceId
  );

  console.log("=== Edit Decks and Retry ===");
  await returnFromDefeatResult(page);
  await clickDialogChoice(page, "Edit Decks and Retry");
  await waitUntil(
    page,
    async () => (await page.locator("body").innerText()).includes("Rat King reserves:"),
    "deck editor"
  );
  await shot(page, OUT, "02-deck-editor.png");
  await clickDialogChoice(page, "Old Man");
  await waitUntil(page, async () => (await page.locator("body").innerText()).includes("Old Man Reserves"), "Old Man reserves");
  await shot(page, OUT, "03-old-man-reserves.png");
  await clickDialogChoice(page, "Faultline · M0");
  await waitUntil(page, async () => (await page.locator("body").innerText()).includes("Replace Which Card?"), "outgoing card picker");
  await page.locator(".ff6-menu-item").first().click();
  await waitUntil(page, async () => (await page.locator("body").innerText()).includes("replaces"), "swap confirmation");
  const edited = await page.evaluate(() => window.__onyxDebug.state.campaignCards["old-man"]);
  check("deck edit keeps exactly twelve cards", edited.activeDeck.length === 12);
  check("deck edit installs the physical reserve", edited.activeDeck.includes("browser-reserve:old-man:faultline"));
  await shot(page, OUT, "04-deck-swap-confirmed.png");
  await clickDialogChoice(page, "Retry Now");
  await waitForRoute(page, "card_trial", 12000);

  console.log("=== Leave clears the transaction but keeps the edit ===");
  await returnFromDefeatResult(page);
  await clickDialogChoice(page, "Leave");
  state = await waitForRoute(page, "dungeon", 5000);
  const left = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("Leave clears pending encounter", left.pendingCampaignEncounter === null);
  check(
    "Leave preserves deck edit",
    left.campaignCards["old-man"].activeDeck.includes("browser-reserve:old-man:faultline")
  );
  check("Leave remains at checkpoint", state.pos.x === checkpoint.x && state.pos.y === checkpoint.y);
  await waitForIdle(page, 10000);
  await wait(1000);
  await shot(page, OUT, "05-left-at-checkpoint.png");

  console.log("=== close mid-combat → Continue → pre-fight choice ===");
  await page.evaluate(() =>
    window.__onyxDebug.startCampaignEncounter("f5-drowned-sentinel", { seed: 91 })
  );
  await waitForRoute(page, "card_trial", 12000);
  const beforeReload = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  await page.reload({ waitUntil: "networkidle" });
  await wait(500);
  check("reload returns to title", (await snap(page)).route === "title");
  await page.keyboard.press("c");
  state = await waitForRoute(page, "dialog", 10000);
  const resumed = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("Continue restores pending seed", resumed.pendingCampaignEncounter?.seed === 91);
  check(
    "Continue restores exact reward",
    resumed.pendingCampaignEncounter?.reward?.instanceId === beforeReload.pendingCampaignEncounter?.reward?.instanceId
  );
  check("Continue restores exact pre-fight position", state.pos.x === checkpoint.x && state.pos.y === checkpoint.y && state.pos.facing === checkpoint.facing);
  await shot(page, OUT, "06-close-resume-menu.png");
  await clickDialogChoice(page, "Leave");
  await waitForRoute(page, "dungeon", 5000);
  check(
    "resumed Leave clears transaction",
    JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave())).pendingCampaignEncounter === null
  );
} catch (error) {
  failures.push(String(error));
  console.error(error);
  try {
    console.error("diagnostic snapshot", JSON.stringify(await snap(page), null, 2));
    console.error("diagnostic body", (await page.locator("body").innerText()).slice(0, 3000));
    console.error("diagnostic save", await page.evaluate(() => window.__onyxDebug.dumpSave()));
  } catch (diagnosticError) {
    console.error("diagnostic capture failed", diagnosticError);
  }
}

console.log("=== result ===");
console.log(JSON.stringify({ failures, errors }, null, 2));
await browser.close();
if (failures.length > 0 || errors.length > 0) process.exitCode = 1;
