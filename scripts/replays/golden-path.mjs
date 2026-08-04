/**
 * Golden path playtest: drives through the full opening sequence from
 * title screen to first dungeon expedition, capturing screenshots at
 * each transition point. Evaluates the player experience for friction.
 *
 * Note: several controllers (PartyCreationController, SaveController,
 * PerkSelectController, ...) set a `justOpened` flag that swallows the
 * very first keydown after they're constructed. This exists because a
 * single physical keypress that triggers a mode transition (e.g. Escape
 * during the prologue) can cascade through *both* the outgoing and
 * incoming controllers' keydown listeners in the same browser event tick
 * (both listeners check `state.mode`, which has already flipped by the
 * time the second listener runs). For a real player this is invisible —
 * their next physical keypress is a distinct event. For scripted
 * automation, we replicate that "distinct event" property by not chaining
 * the transition key and the next action key without a settle wait.
 */
import { launch, wait, snap, waitForIdle, ensureAudioResumed } from "../playtests/lib.mjs";
import fs from "node:fs";

const BASE = process.env.ONYX_URL || "http://127.0.0.1:5174/OnyxLabyrinth/?debug=1";
const VIEWPORT = process.env.ONYX_VIEWPORT === "mobile"
  ? { width: 390, height: 844 }
  : { width: 1280, height: 800 };
const OUT_DIR = process.env.ONYX_VIEWPORT === "mobile"
  ? "scripts/replays/screenshots/golden-path-mobile"
  : "scripts/replays/screenshots/golden-path";
const log = (...a) => console.log(...a);

fs.mkdirSync(OUT_DIR, { recursive: true });

async function capture(page, label) {
  const filename = `${OUT_DIR}/${label}.png`;
  await page.screenshot({ path: filename });
  const s = await snap(page);
  log(`  [${label}] route=${s.route} mode=${s.mode} msg="${(s.message?.text ?? "").slice(0, 120)}"`);
  return s;
}

async function waitForRoute(page, targetRoute, timeout = 15000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route === targetRoute) return s;
    if (Date.now() >= deadline) {
      log(`  TIMEOUT waiting for route=${targetRoute} (got ${s.route})`);
      return s;
    }
    await wait(100);
  }
}

/** Wall-following walker: try forward; if blocked (position unchanged),
 *  turn right and retry (up to 3 turns = all directions) before giving up.
 *  Mirrors a first-time player who hits a wall and looks for another way. */
async function smartWalkForward(page) {
  const before = await snap(page);
  if (before.route !== "dungeon") return { moved: false, snap: before };
  for (let turns = 0; turns < 4; turns++) {
    await page.keyboard.press("ArrowUp");
    await waitForIdle(page, 3000);
    await wait(150);
    const after = await snap(page);
    if (after.route !== "dungeon") return { moved: true, snap: after };
    if (after.pos.x !== before.pos.x || after.pos.y !== before.pos.y) {
      return { moved: true, snap: after };
    }
    // Blocked — turn right and try again.
    await page.keyboard.press("ArrowRight");
    await waitForIdle(page, 2000);
    await wait(150);
  }
  return { moved: false, snap: await snap(page) };
}

/** Press a key; if the route didn't change and we expected it to, retry once
 *  (covers the justOpened swallow — see file header). */
async function pressConfirmRobust(page, key = "Enter") {
  const before = (await snap(page)).route;
  await page.keyboard.press(key);
  await wait(300);
  const after = (await snap(page)).route;
  if (after === before) {
    // Possibly swallowed by a justOpened guard — press again.
    await page.keyboard.press(key);
    await wait(300);
  }
}

const { browser, page, errors } = await launch({ viewport: VIEWPORT });
try {
  // === 1. Title screen ===
  log("\n=== 1. Title screen ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1000);
  await ensureAudioResumed(page);
  await capture(page, "01-title");

  // === 2. New Game → Prologue ===
  log("\n=== 2. New Game → Prologue ===");
  await page.keyboard.press("n");
  await wait(2000);
  await waitForRoute(page, "prologue", 5000);
  await capture(page, "02-prologue-start");

  // Skip prologue with Escape (fastest path through for this pass).
  await page.keyboard.press("Escape");
  await waitForIdle(page, 5000);
  await wait(800);

  // === 3. Party creation ===
  log("\n=== 3. Party creation ===");
  const partySnap = await waitForRoute(page, "party_creation", 5000);
  await wait(500);
  await capture(page, "03-party-creation");

  // Confirm the default (first) preset party — robust against the
  // justOpened swallow from the Escape-cascade above.
  await pressConfirmRobust(page, "Enter");
  await waitForIdle(page, 5000);
  await wait(500);
  const afterParty = await snap(page);
  log(`  After party confirm: route=${afterParty.route}`);
  await capture(page, "04-party-confirmed");

  // === 4. Town ===
  log("\n=== 4. Town ===");
  const townSnap = await waitForRoute(page, "town", 5000);
  await wait(500);
  await capture(page, "05-town");
  log(`  Town: actions=${JSON.stringify(townSnap.availableActions)}`);
  log(`  Message: "${townSnap.message?.text ?? ""}"`);

  // === 5. Enter Dungeon ===
  log("\n=== 5. Enter Dungeon ===");
  // Town's main menu has a bracketed hotkey per row (e.g. "[>]" for Enter
  // Dungeon) — use it directly instead of counting ArrowDown presses,
  // which is fragile against the justOpenedTown swallow timing.
  await capture(page, "06-town-dungeon-selected");
  await page.keyboard.press(">");
  await waitForIdle(page, 8000);
  await wait(1000);
  let dungeonSnap = await capture(page, "07-dungeon-entry");

  // Fallback: if the hotkey didn't register for some reason, navigate by
  // arrow keys (menu order: Inn, Temple, Shop, Guild, Equip, Reform,
  // Enter Dungeon, Save/Load — index 6) and retry.
  if (dungeonSnap.route !== "dungeon") {
    log(`  Hotkey ">" didn't reach dungeon (route=${dungeonSnap.route}) — retrying via arrows.`);
    if (dungeonSnap.route === "party_creation") {
      await page.keyboard.press("Escape");
      await waitForIdle(page, 5000);
      await wait(500);
    }
    await waitForRoute(page, "town", 5000);
    await wait(500);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ArrowDown");
      await wait(150);
    }
    await capture(page, "06b-town-dungeon-retry");
    await pressConfirmRobust(page, "Enter");
    await waitForIdle(page, 8000);
    await wait(1000);
    dungeonSnap = await capture(page, "07-dungeon-entry");
  }
  log(`  Dungeon: route=${dungeonSnap.route} floor=${dungeonSnap.floor?.id}`);
  log(`  Pos=(${dungeonSnap.position?.x},${dungeonSnap.position?.y}) facing=${dungeonSnap.position?.facing}`);
  log(`  Message: "${dungeonSnap.message?.text ?? ""}"`);

  // === 6. Navigate corridors ===
  log("\n=== 6. Navigate corridors ===");
  for (let i = 0; i < 5; i++) {
    const { moved, snap: s } = await smartWalkForward(page);
    if (!moved) { log(`  Stuck at step ${i} (walled in on all 4 sides?)`); break; }
    if (s.route !== "dungeon") break;
  }
  await capture(page, "08-corridor-walk");

  // === 7. First random encounter ===
  log("\n=== 7. First random encounter ===");
  let encountered = false;
  let foundChestEarly = false;
  for (let i = 0; i < 60; i++) {
    const { moved, snap: s } = await smartWalkForward(page);
    if (s.route === "combat") {
      encountered = true;
      log(`  Encounter after ${i + 5} steps!`);
      break;
    }
    if (s.route === "trap") {
      log(`  Found trap/chest before encounter at step ${i}`);
      foundChestEarly = true;
      break;
    }
    if (s.route !== "dungeon") {
      log(`  Unexpected route: ${s.route} at step ${i}`);
      break;
    }
    if (!moved) {
      log(`  Stuck at step ${i} (walled in on all 4 sides)`);
      break;
    }
  }
  if (encountered) {
    await capture(page, "09-first-encounter");
  } else {
    log("  No encounter after up to 60 steps — continuing");
    await capture(page, "09-no-encounter");
  }

  // === 8. Combat ===
  log("\n=== 8. Combat ===");
  if (encountered) {
    const combatSnap = await snap(page);
    log(`  Combat: phase=${combatSnap.combat?.phase} round=${combatSnap.combat?.round}`);
    log(`  Acting: ${combatSnap.combat?.actingCharId}`);
    log(`  Enemies: ${JSON.stringify(combatSnap.combat?.enemies?.map(e => e.name))}`);
    await capture(page, "10-combat-palette");

    // Fight: press Enter through palette/selectTarget phases
    for (let i = 0; i < 30; i++) {
      const s = await snap(page);
      if (s.route !== "combat") break;
      if (s.combat?.result) {
        await capture(page, "11-combat-victory");
        await page.keyboard.press("Enter");
        await waitForIdle(page, 8000);
        await wait(500);
        break;
      }
      const phase = s.combat?.phase;
      if (phase === "palette" || phase === "selectTarget") {
        await page.keyboard.press("Enter");
      }
      await waitForIdle(page, 8000);
      await wait(300);
    }
    await capture(page, "12-post-combat");
  }

  // === 9. Explore more / find chest ===
  log("\n=== 9. Explore more ===");
  let foundChest = foundChestEarly;
  if (!foundChest) {
    for (let i = 0; i < 30; i++) {
      const { moved, snap: s } = await smartWalkForward(page);
      if (s.route === "trap") {
        foundChest = true;
        log(`  Found chest at step ${i}!`);
        break;
      }
      if (s.route !== "dungeon") break;
      if (!moved) {
        log(`  Stuck at step ${i} while looking for a chest`);
        break;
      }
    }
  }
  if (foundChest) {
    await capture(page, "13-chest-found");
    await page.keyboard.press("i");
    await waitForIdle(page, 3000);
    await wait(300);
    await capture(page, "14-chest-inspected");
    await page.keyboard.press("l");
    await waitForIdle(page, 3000);
    await wait(300);
  } else {
    await capture(page, "13-no-chest");
  }

  // === 10. Save menu ===
  log("\n=== 10. Save menu ===");
  const currSnap = await snap(page);
  if (currSnap.route === "trap") {
    await page.keyboard.press("l");
    await waitForIdle(page, 3000);
    await wait(300);
  }
  await page.keyboard.press("Escape");
  await waitForIdle(page, 5000);
  await wait(500);
  const saveSnap = await capture(page, "15-save-menu");
  log(`  Save menu: route=${saveSnap.route}`);
  await pressConfirmRobust(page, "Escape");
  await waitForIdle(page, 3000);
  await wait(300);

  // === Final ===
  log("\n=== Final ===");
  await capture(page, "16-final");

  if (errors.length) {
    log(`\n=== Errors (${errors.length}) ===`);
    errors.forEach(e => log(`  ${e}`));
  } else {
    log("\nNo console/page errors.");
  }
  log("\n=== Golden path complete ===");
} finally {
  await browser.close();
}
