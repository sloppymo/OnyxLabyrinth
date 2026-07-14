import { chromium } from '/home/sloppymo/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs';

const BASE_URL = 'http://localhost:5176/OnyxLabyrinth/';

export async function launchBrowser(headless = true) {
  return chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function openPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  return page;
}

export async function goto(page, path = '') {
  await page.goto(BASE_URL + path);
  await page.waitForTimeout(1500);
}

export async function screenshot(page, name) {
  const file = `/home/sloppymo/OnyxLabyrinth/playtest-screenshots/${name}`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function press(page, key, times = 1, delay = 200) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(delay);
  }
}

export async function evaluate(page, fn) {
  return page.evaluate(fn);
}
