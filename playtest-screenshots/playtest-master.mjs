import { launchBrowser, openPage, goto, screenshot, press, evaluate } from './playwright-helper.mjs';

const log = [];
function note(msg) {
  console.log(msg);
  log.push(msg);
}

async function checkVisible(page, selector, expected) {
  const visible = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
  }, selector);
  note(`${selector} visible=${visible} (expected ${expected})`);
  return visible === expected;
}

async function runDesktopTitle(page) {
  note('=== A. Title & Meta-Flow (Desktop) ===');
  await goto(page);
  await screenshot(page, '01-title-desktop.png');
  const hasNewGame = await page.evaluate(() => !!document.querySelector('[data-testid="title-new-game"], .title-option') || document.body.innerText.includes('New Game'));
  const hasArena = await page.evaluate(() => document.body.innerText.includes('Arena'));
  const hasContinue = await page.evaluate(() => document.body.innerText.includes('Continue'));
  note(`New Game present: ${hasNewGame}`);
  note(`Arena present: ${hasArena}`);
  note(`Continue present: ${hasContinue} (expected false with no autosave)`);
  await checkVisible(page, '#hint', true);
}

async function runMobileTitle(page) {
  note('=== L. Mobile Title ===');
  await goto(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await screenshot(page, '02-title-mobile.png');
  await checkVisible(page, '#hint', false);
}

async function runPartyCreationDefault(page) {
  note('=== B. Party Creation (Default Party) ===');
  await goto(page);
  await press(page, 'Enter'); // New Game
  await page.waitForTimeout(1000);
  await screenshot(page, '03-party-choice.png');
  // Default party option should be selected by default; press Enter
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await screenshot(page, '04-dungeon-start.png');
  const inDungeon = await page.evaluate(() => {
    const wrap = document.getElementById('viewport-wrap');
    return wrap && getComputedStyle(wrap).display !== 'none';
  });
  note(`Dungeon viewport visible after default party: ${inDungeon}`);
}

async function runTownHub(page) {
  note('=== C. Town Hub ===');
  // Assume we are in dungeon from previous test
  await press(page, 't'); // town
  await page.waitForTimeout(1000);
  await screenshot(page, '05-town-hub.png');
  const townVisible = await page.evaluate(() => document.getElementById('town-screen')?.offsetParent !== null);
  note(`Town screen visible: ${townVisible}`);
  // Try temple tab (arrow right a few times? let's use direct click or keys)
  // Town uses number keys? Let's inspect quickly via evaluate
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#town-screen .tab, #town-screen button, [data-tab]')).map(e => e.textContent));
  note(`Town tabs found: ${tabs.join(' | ')}`);
  // Go back to dungeon
  await press(page, 'Escape');
  await page.waitForTimeout(500);
}

async function runDungeonBasics(page) {
  note('=== D. Dungeon Exploration Basics ===');
  // Already in dungeon
  await screenshot(page, '06-dungeon-view.png');
  await press(page, 'w', 3); // move forward
  await screenshot(page, '07-dungeon-forward.png');
  await press(page, 'a'); // turn left
  await press(page, 'w', 2);
  await screenshot(page, '08-dungeon-turned.png');
  // Map
  await press(page, 'm');
  await page.waitForTimeout(500);
  await screenshot(page, '09-map-open.png');
  const mapVisible = await page.evaluate(() => document.getElementById('map-canvas')?.offsetParent !== null);
  note(`Map visible: ${mapVisible}`);
  await press(page, 'm'); // close map
  await page.waitForTimeout(500);
  // Camp
  await press(page, 'c');
  await page.waitForTimeout(500);
  await screenshot(page, '10-camp-open.png');
  const campVisible = await page.evaluate(() => document.getElementById('camp-screen')?.offsetParent !== null);
  note(`Camp visible: ${campVisible}`);
  await press(page, 'Escape'); // leave camp
  await page.waitForTimeout(500);
}

async function runArenaDesktop(page) {
  note('=== E. Combat via Arena (Desktop) ===');
  await goto(page);
  await press(page, 'ArrowDown'); // select Arena
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await screenshot(page, '11-arena-level-select.png');
  await press(page, 'Enter'); // Level 1
  await page.waitForTimeout(2000);
  await screenshot(page, '12-arena-combat-desktop.png');
  const combatVisible = await page.evaluate(() => document.getElementById('combat-wrap')?.offsetParent !== null);
  note(`Combat wrap visible: ${combatVisible}`);
  await checkVisible(page, '.ff6-footer', true);
  // Wait a bit for idle
  await page.waitForTimeout(2000);
}

async function runArenaMobile(page) {
  note('=== L. Mobile Combat ===');
  await goto(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await press(page, 'Enter'); // Level 1
  await page.waitForTimeout(2500);
  await screenshot(page, '13-arena-combat-mobile.png');
  await checkVisible(page, '#hint', false);
  await checkVisible(page, '.ff6-footer', false);
  const hudVisible = await page.evaluate(() => document.querySelector('.ff6-mobile-hud')?.offsetParent !== null);
  note(`Mobile HUD visible: ${hudVisible}`);
}

async function runDebugCombat(page) {
  note('=== E. Debug Combat (spells, summons) ===');
  await goto(page, '?debug=1');
  await press(page, 'Enter'); // new game default
  await page.waitForTimeout(1500);
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  // Start a debug combat using window.__onyxDebug
  await page.evaluate(() => {
    const d = window.__onyxDebug;
    const enc = d.FLOORS[0].encounterTable[0];
    d.startCombat(d.createCombatFromEncounter(d.state, enc));
  });
  await page.waitForTimeout(2500);
  await screenshot(page, '14-debug-combat.png');
  note('Debug combat started');
}

async function runSaveLoadContinue(page) {
  note('=== J. Save/Load/Continue ===');
  await goto(page);
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  // Move a bit to trigger autosave? Save manually
  await press(page, 'Escape'); // menu
  await page.waitForTimeout(500);
  await screenshot(page, '15-save-menu.png');
  // Select save (probably arrow down to Save, Enter)
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await page.waitForTimeout(1000);
  await screenshot(page, '16-save-complete.png');
  // Hard refresh and check Continue
  await page.reload();
  await page.waitForTimeout(1500);
  await screenshot(page, '17-title-after-save.png');
  const hasContinue = await page.evaluate(() => document.body.innerText.includes('Continue'));
  note(`Continue appears after save: ${hasContinue}`);
}

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });
  try {
    await runDesktopTitle(page);
    await runMobileTitle(page);
    await runPartyCreationDefault(page);
    await runTownHub(page);
    await runDungeonBasics(page);
    await runArenaDesktop(page);
    await runArenaMobile(page);
    await runDebugCombat(page);
    await runSaveLoadContinue(page);
  } catch (e) {
    note(`ERROR: ${e.message}\n${e.stack}`);
  } finally {
    await screenshot(page, '99-final.png');
    await browser.close();
  }
  await Bun.write?.('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/playtest-log.txt', log.join('\n'))
    ?? (await import('node:fs/promises')).writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/playtest-log.txt', log.join('\n'));
  console.log('Log written to playtest-log.txt');
}

main().catch(e => { console.error(e); process.exit(1); });
