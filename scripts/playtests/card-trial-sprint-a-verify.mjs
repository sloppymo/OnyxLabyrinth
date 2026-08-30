/**
 * Sprint A gate: card play, draft pick, authored vs routine rewards, deck swap.
 *
 * Expects: npx vite preview --port 5193 --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5193/OnyxLabyrinth/?debug=1 node scripts/playtests/card-trial-sprint-a-verify.mjs
 */
import {
  launch,
  wait,
  waitForIdle,
  boot,
  clickCard,
  clickAct,
  snap,
  ensureOutDir,
  shot,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5193/OnyxLabyrinth/?debug=1";
const SCENARIO = { floorId: 1, x: 11, y: 39, autosave: false };
const OUT = ensureOutDir("playtest-screenshots/card-trial-sprint-a");
const log = (...a) => console.log(...a);
const failures = [];
function check(name, cond, detail = "") {
  if (cond) log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function trialView(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.view());
}

async function uiPhase(page) {
  const s = await snap(page);
  return s.combat?.phase ?? null;
}

async function pickDraft(page) {
  const view = await trialView(page);
  const choices = view?.draft?.choices ?? [];
  check("draft offers three choices", choices.length === 3, JSON.stringify(choices.map((c) => c.id)));
  check("one printed-free option", choices.some((c) => c.cost === 0) === true);
  const overlay = await page.evaluate(() => document.body.innerText);
  check("option cost is visible", /FREE|ENERGY/.test(overlay));
  check("category labels stay off the table", !/\bGreedy\b|\bSafe option\b/i.test(overlay));
  await shot(page, OUT, "01-draft.png");
  const freeIdx = Math.max(0, choices.findIndex((c) => c.cost === 0 && !c.disabled));
  await page.locator(".ct-sparse .ct-draft-choice").nth(freeIdx).click({ timeout: 5000 });
  check("draft pick became idle", await waitForIdle(page, 12000));
  const after = await trialView(page);
  check("draft closed after pick", after?.draft == null);
}

const { browser, page, errors } = await launch();
try {
  log("=== Arena Card Trial: play a card and resolve a draft ===");
  await boot(page, BASE, { scenario: SCENARIO });
  await page.evaluate(() => window.__onyxDebug.cardTrial.startFight(2, { seed: 1 }));
  check("fight boot idle", await waitForIdle(page, 12000));

  let openedDraft = false;
  for (let step = 0; step < 60 && !openedDraft; step += 1) {
    const phase = await uiPhase(page);
    const view = await trialView(page);
    if (!view) break;
    if (phase === "playback") {
      await waitForIdle(page, 8000);
      continue;
    }
    if (phase === "result") break;
    if (phase === "draft") {
      openedDraft = true;
      await pickDraft(page);
      break;
    }
    if (phase === "target" || phase === "target2") {
      await page.keyboard.press("Enter");
      await waitForIdle(page, 8000);
      continue;
    }
    if (phase !== "hand") {
      await wait(80);
      continue;
    }
    const dirty = view.hand.find((c) => c.defId === "fight-dirty" && !c.disabled);
    if (dirty) {
      await clickCard(page, dirty.uid);
      await wait(80);
      const armed = await uiPhase(page);
      if (armed === "target" || armed === "target2") {
        await page.keyboard.press("Enter");
      }
      check("Fight Dirty playback idle", await waitForIdle(page, 12000));
      continue;
    }
    const playable = view.hand.find((c) => !c.disabled && c.defId !== "fight-dirty");
    if (playable && step < 8) {
      await clickCard(page, playable.uid);
      await wait(80);
      const armed = await uiPhase(page);
      if (armed === "target" || armed === "target2") {
        await page.keyboard.press("Enter");
      }
      await waitForIdle(page, 8000);
      continue;
    }
    await clickAct(page, "pass");
    await waitForIdle(page, 8000);
  }
  check("opened a live draft in the browser", openedDraft);

  log("=== routine encounter grants no card ===");
  await boot(page, BASE, { scenario: SCENARIO });
  await page.evaluate(() => {
    window.__onyxDebug.startCampaignEncounter("f1-red-bone-bounty", { seed: 3 });
  });
  check("bounty fight idle", await waitForIdle(page, 12000));
  const bounty = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check("pending bounty reward is null", bounty.pendingCampaignEncounter?.reward == null);
  check("bounty fight is live", ((await trialView(page))?.hand?.length ?? 0) > 0);
  await shot(page, OUT, "02-bounty-no-reward.png");

  log("=== authored miniboss still queues King of the Heap ===");
  await boot(page, BASE, { scenario: SCENARIO });
  await page.evaluate(() => {
    window.__onyxDebug.startCampaignEncounter("f1-ogre-toss", { seed: 3 });
  });
  check("ogre fight idle", await waitForIdle(page, 12000));
  const ogre = JSON.parse(await page.evaluate(() => window.__onyxDebug.dumpSave()));
  check(
    "ogre pending reward is King of the Heap",
    ogre.pendingCampaignEncounter?.reward?.cardId === "king-of-the-heap",
    JSON.stringify(ogre.pendingCampaignEncounter?.reward)
  );
  check(
    "reward stays out of the active deck until victory+edit",
    !ogre.campaignCards["rat-king"].activeDeck.includes(ogre.pendingCampaignEncounter?.reward?.instanceId)
  );

  log("=== collection swap keeps twelve physical cards ===");
  await boot(page, BASE, { scenario: SCENARIO });
  const edited = await page.evaluate(() => {
    const raw = JSON.parse(window.__onyxDebug.dumpSave());
    const reward = {
      instanceId: "encounter:1:verify:marrow-divide",
      cardId: "marrow-divide",
      mastery: 0,
      branch: null,
    };
    const hero = raw.campaignCards["old-man"];
    const outgoing = hero.activeDeck.find((id) => id.includes(":the-staff-speaks:"));
    if (!outgoing) return { ok: false };
    hero.collection.push(reward);
    hero.activeDeck[hero.activeDeck.indexOf(outgoing)] = reward.instanceId;
    window.__onyxDebug.loadSave(JSON.stringify(raw));
    const after = JSON.parse(window.__onyxDebug.dumpSave());
    const deck = after.campaignCards["old-man"].activeDeck;
    return {
      ok: true,
      size: deck.length,
      hasMarrow: deck.includes(reward.instanceId),
      stillStaff: deck.includes(outgoing),
      starterIds: after.campaignCards["rat-king"].collection.slice(0, 2).map((c) => c.instanceId),
      schemaVersion: after.campaignCards.schemaVersion,
    };
  });
  check("swap keeps 12", edited.size === 12);
  check("marrow entered the active deck", edited.hasMarrow === true);
  check("outgoing staff left the deck", edited.stillStaff === false);
  check("starter ids are content-addressed", edited.starterIds?.every((id) => /^starter:rat-king:[a-z0-9-]+:\d+$/.test(id)));
  check("card-progress schema version is 1", edited.schemaVersion === 1);
  await shot(page, OUT, "03-dungeon-after-deck-edit.png");
} catch (err) {
  failures.push(String(err?.stack ?? err));
  log(err);
} finally {
  await browser.close();
}

if (errors.length) {
  log(`\nBrowser console/network notes (${errors.length}):`);
  for (const line of errors.slice(0, 12)) log(`  ${line}`);
}
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}
log("\nSprint A browser checks passed.");
