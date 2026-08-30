/**
 * Production campaign Card Trial vertical slice.
 *
 * This uses the real title/prologue/dungeon path, starts one authored Floor 1
 * encounter through the debug evidence hook (the hook still resolves the
 * actual campaign encounter table), plays the existing cards through the
 * production sparse UI, and verifies return + save persistence.
 *
 * Run with a production preview:
 *   node scripts/playtests/campaign-card-trial-vertical-slice.mjs
 */
import {
  bootToDungeon,
  clickAct,
  clickCard,
  launch,
  shot,
  snap,
  wait,
  waitForIdle,
  ensureOutDir,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5179/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("output/playwright/campaign-card-trial-vertical-slice");
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function cardPriority(card, view) {
  const opened = !!view.openedEnemyId;
  const priority = {
    "full-stop": opened ? 100 : 14,
    "swarm-the-wound": opened ? 96 : 14,
    "burst-the-nest": 90,
    "king-of-the-heap": 88,
    "last-bastion": 86,
    "unlight": 80,
    "from-the-dark": 78,
    "open-the-rank": opened ? 42 : 76,
    faultline: opened ? 42 : 75,
    "marrow-divide": opened ? 42 : 74,
    tide: 72,
    "the-threshold": 70,
    nip: 68,
    "the-staff-speaks": 67,
    "send-the-rat": 65,
    litter: 64,
    "sever-the-thread": 60,
    "distant-hand": 58,
    lunge: 56,
    "parting-word": 54,
    brace: 20,
    "pale-ward": 19,
  };
  return priority[card.defId] ?? 1;
}

async function trialView(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.view());
}

async function selectCampaignTarget(page, id) {
  const target = page.locator(
    `.ct-sparse .ct-actor-chip.enemy.targetable[data-actor="${id}"]:not([hidden])`
  );
  await target.click({ timeout: 5000 });
}

const { browser, page, errors } = await launch();

try {
  console.log("=== boot real campaign path ===");
  let state = await bootToDungeon(page, BASE);
  check("title → prologue → town → dungeon", state.route === "dungeon", `got ${state.route}`);
  const before = await snap(page);
  const startingPosition = { ...before.pos };
  check("fixed duo is present", before.party.length === 2 &&
    before.party.map((member) => member.id).sort().join(",") === "old-man,rat-king");
  await shot(page, OUT, "01-dungeon-before.png");

  console.log("=== authored campaign encounter → Card Trial ===");
  await page.evaluate(() =>
    window.__onyxDebug.startCampaignEncounter("f1-red-bone-bounty", { seed: 7 })
  );
  await waitForIdle(page, 10000);
  const pendingBounty = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("routine pending reward is null", pendingBounty.pendingCampaignEncounter?.reward == null);
  state = await snap(page);
  check("campaign encounter enters Card Trial", state.route === "card_trial", `got ${state.route}`);
  check("campaign encounter uses real formation", state.combat?.enemies.length === 3,
    JSON.stringify(state.combat?.enemies));
  check("campaign Card Trial exposes rows", state.combat?.enemies.some((enemy) => enemy.row === "back"));
  check("Card Trial identifies Old Man as Mage", state.combat?.party?.find((member) => member.id === "old-man")?.class === "Mage");
  await shot(page, OUT, "02-campaign-card-trial-start.png");

  console.log("=== play existing cards through production UI ===");
  for (let action = 0; action < 140; action++) {
    state = await snap(page);
    if (state.route === "dungeon") {
      break;
    }
    if (state.route !== "card_trial") {
      await wait(100);
      continue;
    }
    const view = await trialView(page);
    if (!view) break;
    // `cardTrial.view()` is the rules view and reports the current hero turn;
    // targeting/playback are controller-only UI phases. Read those from the
    // unified debug snapshot so this driver follows the production surface.
    const uiPhase = state.combat?.phase;
    if (uiPhase === "playback") {
      await waitForIdle(page, 6000);
      continue;
    }
    if (uiPhase === "result") {
      await shot(page, OUT, "03-campaign-card-trial-result.png");
      await page.keyboard.press("Enter");
      await waitForIdle(page, 10000);
      continue;
    }
    if (uiPhase === "draft") {
      const freeIdx = Math.max(0, (view.draft?.choices ?? []).findIndex((c) => c.cost === 0 && !c.disabled));
      await page.locator(".ct-sparse .ct-draft-choice").nth(freeIdx).click({ timeout: 5000 });
      await waitForIdle(page, 8000);
      continue;
    }
    if (uiPhase === "target" || uiPhase === "target2") {
      const target = view.enemies.find((enemy) => !enemy.dead);
      if (!target) break;
      await selectCampaignTarget(page, target.id);
      await waitForIdle(page, 6000);
      continue;
    }
    if (uiPhase !== "hand") {
      await wait(100);
      continue;
    }

    const usable = view.hand.filter((card) => !card.disabled);
    const card = [...usable].sort((a, b) => cardPriority(b, view) - cardPriority(a, view))[0];
    if (!card) {
      await clickAct(page, "pass");
      await waitForIdle(page, 6000);
      continue;
    }
    await clickCard(page, card.uid);
    await wait(70);
    const armed = await snap(page);
    if (armed.combat?.phase === "target" || armed.combat?.phase === "target2") {
      const target = view.enemies.find((enemy) => !enemy.dead);
      if (!target) break;
      await selectCampaignTarget(page, target.id);
    }
    await waitForIdle(page, 6000);
  }

  state = await snap(page);
  check("Card Trial ends in campaign dungeon", state.route === "dungeon", `got ${state.route}`);
  check("return preserves exact floor position",
    state.floor.id === before.floor.id && state.pos.x === startingPosition.x &&
    state.pos.y === startingPosition.y && state.pos.facing === startingPosition.facing,
  JSON.stringify({ before: startingPosition, after: state.pos }));
  const afterSave = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check(
    "routine bounty grants no campaign card",
    afterSave.campaignCards["rat-king"].collection.length === 12 &&
      afterSave.campaignCards["old-man"].collection.length === 12 &&
      afterSave.pendingCampaignEncounter === null,
    JSON.stringify({
      rat: afterSave.campaignCards["rat-king"].collection.length,
      old: afterSave.campaignCards["old-man"].collection.length,
    })
  );
  await shot(page, OUT, "04-dungeon-after-card-reward.png");

  console.log("=== save/load reward persistence ===");
  const saved = await page.evaluate(() => window.__onyxDebug.dumpSave());
  const savedState = JSON.parse(saved);
  const savedCardCount = Object.values(savedState.campaignCards ?? {}).reduce(
    (sum, hero) => sum + (hero.collection?.length ?? 0),
    0
  );
  check("campaign save still has only the twelve-per-hero starters", savedCardCount === 24);
  check("victory atomically clears the pending encounter", savedState.pendingCampaignEncounter === null);
  await page.evaluate(() => {
    window.__onyxDebug.jumpTo({ floorId: 2, x: 2, y: 11, facing: 0, autosave: false });
  });
  await waitForIdle(page, 10000);
  await page.evaluate((json) => window.__onyxDebug.loadSave(json), saved);
  await waitForIdle(page, 10000);
  state = await snap(page);
  check("load returns to dungeon", state.route === "dungeon", `got ${state.route}`);
  check("load restores exact position", state.floor.id === before.floor.id &&
    state.pos.x === startingPosition.x && state.pos.y === startingPosition.y &&
    state.pos.facing === startingPosition.facing);
  const loadedSave = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check(
    "load restores starter collections",
    loadedSave.campaignCards["rat-king"].collection.length === 12 &&
      loadedSave.campaignCards["old-man"].collection.length === 12
  );
  await shot(page, OUT, "05-dungeon-after-load.png");
} catch (error) {
  failures.push(String(error));
  console.error(error);
}

console.log("=== result ===");
console.log(JSON.stringify({ failures, errors }, null, 2));
await browser.close();
if (failures.length > 0 || errors.length > 0) process.exitCode = 1;
