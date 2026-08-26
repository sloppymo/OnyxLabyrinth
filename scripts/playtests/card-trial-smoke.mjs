/**
 * Card Trial smoke: Arena row, lobby, forced triangle, Classic Arena path.
 * Expects: npx vite preview --port 5193 --base /OnyxLabyrinth/
 *   ONYX_URL=http://127.0.0.1:5193/OnyxLabyrinth/?debug=1 node scripts/playtests/card-trial-smoke.mjs
 */
import {
  launch,
  wait,
  press,
  snap,
  waitForIdle,
  shot,
  ensureOutDir,
} from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5193/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/card-trial-smoke");
const log = (...a) => console.log(...a);
const failures = [];
function check(name, cond, detail = "") {
  if (cond) log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const { browser, page, errors } = await launch();
try {
  log("=== title → Arena setup ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(500);
  let s = await snap(page);
  check("title route", s.route === "title", `got ${s.route}`);
  await press(page, "a");
  await waitForIdle(page, 4000);
  s = await snap(page);
  const body = await page.evaluate(() => document.body.innerText);
  check("arena setup route", s.route === "arena", `got ${s.route}`);
  check("Classic Level 1 still listed", /Level 1/.test(body));
  check("Classic Level 12 still listed", /Level 12/.test(body));
  check("Card Trial row listed", /Card Trial/.test(body));
  await shot(page, OUT, "01-arena-setup.png");

  log("=== open Card Trial lobby ===");
  // Levels 1,3,6,9,12 then Card Trial — five downs from the first row.
  await press(page, "ArrowDown", 5, 80);
  await press(page, "Enter");
  await waitForIdle(page, 4000);
  s = await snap(page);
  const lobby = await page.evaluate(() => document.body.innerText);
  check("card_trial lobby route", s.route === "card_trial", `got ${s.route}`);
  check("ten fights listed", /Fight 1/.test(lobby) && /Fight 10/.test(lobby));
  check("sequential option listed", /Begin sequential/.test(lobby));
  check("campaign party still 4", s.party.length === 4, `got ${s.party.length}`);
  await shot(page, OUT, "02-card-trial-lobby.png");

  log("=== forced triangle ===");
  await page.evaluate(() => window.__onyxDebug.cardTrial.forceTriangle());
  const idle = await waitForIdle(page, 12000);
  check("triangle boot became idle", idle);
  s = await snap(page);
  check("card_trial fight route", s.route === "card_trial", `got ${s.route}`);
  const liveCombat = await page.evaluate(() => window.__onyxDebug.state.combat);
  check("GameState.combat unused", liveCombat == null, `got ${liveCombat && Object.keys(liveCombat)}`);
  const view = await page.evaluate(() => window.__onyxDebug.cardTrial.view());
  check("triangle hand locked", JSON.stringify(view?.hand?.map((c) => c.defId)) === JSON.stringify([
    "king-of-the-heap",
    "nip",
    "nip",
    "tide",
    "swarm-the-wound",
  ]), JSON.stringify(view?.hand?.map((c) => c.defId)));
  check("Ash Opened", view?.openedEnemyId === "ash", `got ${view?.openedEnemyId}`);
  check("Rat Front", view?.ratRow === "front");
  check("campaign party still 4 in fight", s.party.length === 4);
  const ui = await page.evaluate(() => {
    const overlay = document.querySelector("#card-trial-overlay");
    const windows = document.querySelector("#combat-windows");
    return {
      overlay: overlay?.innerText ?? "",
      windows: windows?.innerText ?? "",
      cards: overlay?.querySelectorAll(".ct2-card").length ?? 0,
      intentsPane: !!document.querySelector(".ct-intents"),
      handPane: !!document.querySelector(".ct-hand"),
      partyPane: !!document.querySelector(".ct-party"),
      move: document.querySelector("[data-act=move]")?.textContent ?? "",
    };
  });
  check("legacy intents pane gone", !ui.intentsPane);
  check("legacy hand pane gone", !ui.handPane);
  check("legacy party pane gone", !ui.partyPane);
  check("five physical cards", ui.cards === 5, `got ${ui.cards}`);
  check("Consume clause visible on a card", /\bConsume\b/.test(ui.overlay));
  check("fifth card Swarm visible", /Swarm the Wound/i.test(ui.overlay));
  check("Move utility visible", /MOVE/.test(ui.move));
  check("labeled energy chip visible", /ENERGY\s*3\/3/i.test(ui.overlay));
  check(
    "actor-local name and HP visible",
    /RAT KING[\s\S]*40\/40/i.test(ui.overlay) && /OLD MAN[\s\S]*40\/40/i.test(ui.overlay),
  );
  check("default plates omit secondary ATK detail", !/\bATK\b/i.test(ui.overlay));
  await shot(page, OUT, "03-triangle-hand.png");

  log("=== Line B stay (Heap + Nip Cleaver) via UI ===");
  // Heap is cursor 0. Default target is Opened Ash — move to Cleaver.
  await press(page, "Enter");
  await wait(200);
  await press(page, "ArrowUp");
  await wait(120);
  await press(page, "Enter");
  await waitForIdle(page, 8000);
  await press(page, "Enter");
  await wait(200);
  await press(page, "ArrowUp");
  await wait(120);
  await press(page, "Enter");
  await waitForIdle(page, 12000);
  const afterStay = await page.evaluate(() => window.__onyxDebug.cardTrial.view());
  const cleaver = afterStay?.enemies?.find((e) => e.id === "cleaver");
  const rk = afterStay?.heroes?.find((h) => h.id === "rat-king");
  const om = afterStay?.heroes?.find((h) => h.id === "old-man");
  log("  after Line B", {
    cleaverHp: cleaver?.hp,
    rk,
    om,
    opened: afterStay?.openedEnemyId,
    acting: afterStay?.actingHero,
  });
  check("Cleaver took 15 (Heap 10 + Nip 5)", cleaver?.hp === 25, `hp ${cleaver?.hp}`);
  check("Rat King lost 3 after Guard (40→37)", rk?.hp === 37, `hp ${rk?.hp}`);
  check("Old Man took Ash 8 (40→32)", om?.hp === 32, `hp ${om?.hp}`);
  check("Ash remains Opened", afterStay?.openedEnemyId === "ash");
  check("Rat King kept Front", rk?.row === "front");
  check("Old Man's turn after the fast enemies", afterStay?.actingHero === "old-man", `acting ${afterStay?.actingHero}`);
  await shot(page, OUT, "04-after-stay-line.png");

  log("=== Classic Arena still starts a campaign combat ===");
  await page.reload({ waitUntil: "networkidle" });
  await wait(500);
  await press(page, "a");
  await waitForIdle(page, 4000);
  await press(page, "Enter");
  const classicIdle = await waitForIdle(page, 15000);
  check("Classic Arena fight idle", classicIdle);
  s = await snap(page);
  check("Classic Arena uses combat route", s.route === "combat", `got ${s.route}`);
  check("Classic Arena has campaign party of 4", (s.combat?.party?.length ?? s.party.length) === 4);
  await shot(page, OUT, "05-classic-arena.png");
} catch (err) {
  failures.push(String(err));
  log("error", err);
} finally {
  log("page errors", errors);
  await browser.close();
}

if (failures.length) {
  console.error("FAILURES\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
log("Card Trial smoke passed");
