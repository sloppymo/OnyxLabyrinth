import { launchBrowser, openPage, goto, screenshot, evaluate } from './playwright-helper.mjs';
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

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });

  note('=== A. Title & Meta-Flow (Desktop) ===');
  await goto(page);
  await screenshot(page, 'a01-title-desktop.png');
  const text = await bodyText(page);
  note(`New Game present: ${text.includes('New Game')}`);
  note(`Arena present: ${text.includes('Arena')}`);
  note(`Continue present: ${text.includes('Continue')} (expected false with no autosave)`);
  note(`#hint visible on desktop: ${await isVisible(page, '#hint')}`);

  note('=== L. Mobile Title ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await screenshot(page, 'a02-title-mobile.png');
  note(`#hint hidden on mobile: ${!await isVisible(page, '#hint')}`);

  await browser.close();
  await writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/log-title-mobile.txt', log.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
