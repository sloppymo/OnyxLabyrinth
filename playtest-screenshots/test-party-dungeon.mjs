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

async function main() {
  const browser = await launchBrowser(true);
  const page = await openPage(browser, { width: 1280, height: 1085 });

  note('=== B. Party Creation (Default Party) ===');
  await goto(page);
  await press(page, 'Enter'); // New Game
  await page.waitForTimeout(1000);
  await screenshot(page, 'b01-party-choice.png');
  const choiceText = await bodyText(page);
  note(`Default Party option present: ${choiceText.includes('Default Party')}`);
  note(`Create Your Own option present: ${choiceText.includes('Create Your Own')}`);
  await press(page, 'Enter'); // Default party
  await page.waitForTimeout(1500);
  await screenshot(page, 'b02-after-default-party.png');
  note(`After default party, #hint visible: ${await isVisible(page, '#hint')}`);

  note('=== C. Town Hub (default party starts in town) ===');
  const townText = await bodyText(page);
  note(`Town of Edgehollow visible: ${townText.includes('Town of Edgehollow')}`);

  // Shop tab
  await press(page, '$');
  await page.waitForTimeout(800);
  await screenshot(page, 'b03-town-shop.png');
  const shopText = await bodyText(page);
  note(`Shop visible (Buy/Sell tabs): ${shopText.includes('Buy') && shopText.includes('Sell')}`);

  // Back to town main
  await press(page, 'Escape');
  await page.waitForTimeout(500);

  // Temple tab using hotkey '+'. Ensure main menu is focused first by pressing 'i' (Inn).
  await press(page, 'i');
  await page.waitForTimeout(300);
  await press(page, 'ArrowDown'); // Inn -> Temple
  await press(page, 'Enter');
  await page.waitForTimeout(800);
  await screenshot(page, 'b04-town-temple.png');
  note(`Temple visible: ${(await bodyText(page)).includes('blessing') || (await bodyText(page)).includes('Temple')}`);

  // Back to town main, then Enter Dungeon using '>' hotkey
  await press(page, 'Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('>');
  await page.waitForTimeout(1500);
  await screenshot(page, 'b05-dungeon-entered.png');
  note(`Dungeon viewport visible: ${await isVisible(page, '#viewport-wrap')}`);

  note('=== D. Dungeon Exploration ===');
  await press(page, 'w', 2, 300);
  await screenshot(page, 'b06-dungeon-forward.png');
  await press(page, 'a');
  await page.waitForTimeout(300);
  await press(page, 'w', 2, 300);
  await screenshot(page, 'b07-dungeon-turned.png');

  // Map
  await press(page, 'm');
  await page.waitForTimeout(600);
  await screenshot(page, 'b08-map-open.png');
  note(`Map canvas visible: ${await isVisible(page, '#map-canvas')}`);
  await press(page, 'm');
  await page.waitForTimeout(300);

  await browser.close();
  await writeFile('/home/sloppymo/OnyxLabyrinth/playtest-screenshots/log-party-dungeon.txt', log.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
