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

async function testArenaDesktop(page) {
  note('=== E. Arena Combat (Desktop) ===');
  await goto(page);
  await press(page, 'ArrowDown'); // Arena
  await press(page, 'Enter');
  await page.waitForTimeout(1000);
  await screenshot(page, 'e01-arena-level-select.png');
  note(`Arena level select visible: ${(await bodyText(page)).includes('Level 1')}`);

  await press(page, 'Enter'); // Level 1
  await page.waitForTimeout(2000);
  await screenshot(page, 'e02-arena-wave.png');
  note(`Arena wave screen visible: ${(await bodyText(page)).includes('Wave')}`);

  await press(page, 'n'); // Next Fight
  await page.waitForTimeout(2500);
  await screenshot(page, 'e03-arena-combat-desktop.png');
  note(`Combat wrap visible: ${await isVisible(page, '#combat-wrap')}`);
  note(`.ff6-footer visible on desktop: ${await isVisible(page, '.ff6-footer')}`);
  note(`Enemy window visible: ${(await bodyText(page)).includes('Slime') || (await bodyText(page)).includes('Target')}`);

  // Let combat play a bit
  await page.waitForTimeout(3000);
  await screenshot(page, 'e04-arena-combat-progress.png');
}

async function testArenaMobile(page) {
  note('=== L. Mobile Combat ===');
  await goto(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await page.waitForTimeout(1000);
  await press(page, 'Enter'); // Level 1
  await page.waitForTimeout(2000);
  await press(page, 'n'); // Next Fight
  await page.waitForTimeout(3000);
  await screenshot(page, 'e05-arena-combat-mobile.png');
  note(`#hint hidden on mobile: ${!await isVisible(page, '#hint')}`);
  note(`.ff6-footer hidden on mobile: ${!await isVisible(page, '.ff6-footer')}`);
  const hudVisible = await page.evaluate(() => document.querySelector('.ff6-mobile-hud')?.offsetParent !== null);
  note(`Mobile HUD visible: ${hudVisible}`);
}

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });
  await testArenaDesktop(page);
  await testArenaMobile(page);
  await browser.close();
  await writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/log-arena-combat.txt', log.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
