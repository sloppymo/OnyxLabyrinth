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
    const resolved = d.resolveEncounter(entry);
    const combat = d.createCombatFromEncounter(
      d.state.party, resolved, d.SPELLS_BY_ID, d.ITEMS_BY_ID,
      d.state.equipment || [], d.state.inventory || [], d.state.inAntimagic || false
    );
    d.state.combat = combat;
    d.startCombat(combat);
  });
}

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });

  await goto(page, '?debug=1');
  await press(page, 'Enter');
  await page.waitForTimeout(1500);
  await startDebugCombat(page);
  await page.waitForTimeout(2500);

  note('=== E. Magic Menu ===');
  // Open Magic menu (M key)
  await press(page, 'm');
  await page.waitForTimeout(800);
  await screenshot(page, 'm01-magic-menu.png');
  const magicText = await bodyText(page);
  note(`Magic menu visible: ${magicText.includes('Magic') || magicText.includes('Spell')}`);

  // Select first spell and confirm
  await press(page, 'Enter');
  await page.waitForTimeout(800);
  await screenshot(page, 'm02-spell-target.png');
  note(`Spell target selection visible: ${(await bodyText(page)).includes('Target')}`);

  // Back out
  await press(page, 'Escape');
  await page.waitForTimeout(500);
  await press(page, 'Escape');
  await page.waitForTimeout(500);

  // Try Run (R key)
  await press(page, 'r');
  await page.waitForTimeout(1500);
  await screenshot(page, 'm03-after-run.png');
  note(`After Run attempt: ${await isVisible(page, '#combat-wrap')}`);

  await browser.close();
  await writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/log-combat-magic.txt', log.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
