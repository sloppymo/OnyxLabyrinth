/**
 * Prove Card Trial combat loads Rat King / Old Man party strips, not Thief/Priest.
 *
 *   npx vite preview --host 127.0.0.1 --port 5181 --strictPort --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5181/OnyxLabyrinth/ \
 *     node scripts/playtests/card-trial-hero-sprites-verify.mjs
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.env.ONYX_URL ?? "http://127.0.0.1:5181/OnyxLabyrinth/";
const OUT = path.resolve("output/card-trial-hero-sprites");
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function urlFor() {
  const url = new URL(ROOT);
  url.searchParams.set("debug", "1");
  return url.toString();
}

const hits = [];
const { browser, page } = await (async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/assets/party/")) {
      hits.push({ url: u, status: res.status() });
    }
  });
  return { browser, page };
})();

const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

try {
  await page.goto(urlFor(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__onyxDebug, { timeout: 20000 });
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.__onyxDebug.cardTrial.startFight(1));
  await page.waitForFunction(
    () => {
      const s = window.__onyxDebug.snapshot();
      return (
        s.route === "card_trial" &&
        s.combat?.phase === "hand" &&
        window.__onyxDebug.isIdle()
      );
    },
    { timeout: 20000 }
  );
  await wait(400);

  const dirs = await page.evaluate(() => {
    const view = window.__onyxDebug.cardTrial.view();
    return {
      heroIds: view?.heroes?.map((h) => h.id) ?? [],
      heroNames: view?.heroes?.map((h) => h.name) ?? [],
    };
  });

  await page.screenshot({ path: path.join(OUT, "fight-1.png") });

  const partyUrls = hits.map((h) => h.url);
  const ratIdle = hits.find((h) => h.url.includes("/party/rat-king/idle.png"));
  const oldIdle = hits.find((h) => h.url.includes("/party/old-man/idle.png"));

  check("Rat King in live view", dirs.heroIds.includes("rat-king"), JSON.stringify(dirs.heroIds));
  check("Old Man in live view", dirs.heroIds.includes("old-man"), JSON.stringify(dirs.heroIds));
  check("rat-king idle requested", !!ratIdle, partyUrls.filter((u) => u.includes("rat-king")).join("\n"));
  check("old-man idle requested", !!oldIdle, partyUrls.filter((u) => u.includes("old-man")).join("\n"));
  check("rat-king idle HTTP 200", ratIdle?.status === 200, String(ratIdle?.status));
  check("old-man idle HTTP 200", oldIdle?.status === 200, String(oldIdle?.status));

  fs.writeFileSync(
    path.join(OUT, "party-requests.json"),
    JSON.stringify({ dirs, hits }, null, 2)
  );
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`FAILED ${failures.length}:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`wrote ${OUT}/fight-1.png`);
