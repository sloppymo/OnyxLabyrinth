import { launchBrowser, openPage, goto, screenshot, press, evaluate } from './playwright-helper.mjs';
import { writeFile } from 'node:fs/promises';

const log = [];
function note(msg) { console.log(msg); log.push(msg); }

async function isVisible(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
  }, selector);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function startDebugCombat(page) {
  await page.evaluate(() => {
    const d = window.__onyxDebug;
    const entry = d.rollEncounter(1);
    if (!entry) throw new Error('No encounter rolled');
    const resolved = d.resolveEncounter(entry);
    const combat = d.createCombatFromEncounter(
      d.state.party,
      resolved,
      d.SPELLS_BY_ID,
      d.ITEMS_BY_ID,
      d.state.equipment || {},
      d.state.inventory || [],
      d.state.inAntimagic || false
    );
    d.state.combat = combat;
    d.startCombat(combat);
  });
}

async function testDebugCombatDesktop(page) {
  note('=== E. Debug Combat (Desktop) ===');
  await goto(page, '?debug=1');
  await press(page, 'Enter'); // New Game default
  await page.waitForTimeout(1500);
  await startDebugCombat(page);
  await page.waitForTimeout(2500);
  await screenshot(page, 'd01-debug-combat-desktop.png');
  note(`Combat wrap visible: ${await isVisible(page, '#combat-wrap')}`);
  note(`Enemy rows present: ${(await bodyText(page)).includes('Slime')}`);
  note(`.ff6-footer visible on desktop: ${await isVisible(page, '.ff6-footer')}`);
}

async function testDebugCombatMobile(page) {
  note('=== L. Mobile Combat (Debug) ===');
  await goto(page, '?debug=1');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await startDebugCombat(page);
  await page.waitForTimeout(2500);
  await screenshot(page, 'd02-debug-combat-mobile.png');
  note(`#hint hidden: ${!await isVisible(page, '#hint')}`);
  note(`.ff6-footer hidden: ${!await isVisible(page, '.ff6-footer')}`);
  const hudVisible = await page.evaluate(() => document.querySelector('.ff6-mobile-hud')?.offsetParent !== null);
  note(`Mobile HUD visible: ${hudVisible}`);
}

async function testSaveLoad(page) {
  note('=== J. Save/Load/Continue ===');
  await goto(page);
  await press(page, 'Enter'); // New Game
  await page.waitForTimeout(1000);
  await press(page, 'Enter'); // Default party
  await page.waitForTimeout(1500);
  // Save via Esc menu
  await press(page, 'Escape');
  await page.waitForTimeout(500);
  await screenshot(page, 'd03-save-menu.png');
  await press(page, 'Enter'); // Save
  await page.waitForTimeout(1000);
  await screenshot(page, 'd04-save-done.png');

  // Reload and check Continue
  await page.reload();
  await page.waitForTimeout(1500);
  await screenshot(page, 'd05-title-continue.png');
  const hasContinue = (await bodyText(page)).includes('Continue');
  note(`Continue appears after save: ${hasContinue}`);
}

async function testMapInDebug(page) {
  note('=== D. Map (debug mode, no encounters) ===');
  await goto(page, '?debug=1');
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  // Enter dungeon
  await page.keyboard.press('>');
  await page.waitForTimeout(1500);
  await screenshot(page, 'd06-debug-dungeon.png');
  await press(page, 'm');
  await page.waitForTimeout(800);
  await screenshot(page, 'd07-debug-map.png');
  note(`Map canvas visible: ${await isVisible(page, '#map-canvas')}`);
}

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });
  await testDebugCombatDesktop(page);
  await testDebugCombatMobile(page);
  await testSaveLoad(page);
  await testMapInDebug(page);
  await browser.close();
  await writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/log-debug-extras.txt', log.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
