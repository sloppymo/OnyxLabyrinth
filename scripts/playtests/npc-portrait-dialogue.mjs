/**
 * Browser verification for the cinematic portrait dialogue system
 * (npc-dialogue-view.ts / npc-ui.ts / shell.ts's
 * showNpcDialogueOverlay/hideNpcDialogueOverlay).
 *
 * Covers: Kazeharu greeting + portrait, visible topic, hidden "master"/
 * "join" topics, Vestra greeting/trade/give (no portrait -> silhouette
 * fallback), successful steal, failed steal -> combat, Attack transition,
 * Leave, long-dialogue pagination, and three viewport sizes.
 *
 * Disclosed debug shortcuts: jumpTo() for positioning, setGameplayRng() to
 * make the steal roll deterministic. No shortcuts around the dialogue UI
 * itself — every check drives real keydown events into the real DOM.
 *
 * Run: node scripts/playtests/npc-portrait-dialogue.mjs
 * Expects: npx vite preview --port 5176 --base /OnyxLabyrinth/
 */
import { launch, wait, press, snap, ensureOutDir, shot, jumpTo } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/npc-portrait-dialogue");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function typeWord(page, word) {
  for (const ch of word) {
    await page.keyboard.press(ch);
    await wait(20);
  }
}

async function panelText(page) {
  return page.evaluate(() => document.querySelector("#combat-panel")?.textContent ?? "");
}

async function panelHtml(page) {
  return page.evaluate(() => document.querySelector("#combat-panel")?.innerHTML ?? "");
}

/** Poll snap() until route matches — combat-intro animations can take
 *  longer than a fixed wait reliably covers. */
async function waitForRoute(page, expected, timeout = 5000, interval = 100) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route === expected) return s;
    if (Date.now() >= deadline) return s;
    await wait(interval);
  }
}

const { browser, page } = await launch();
await page.setViewportSize({ width: 1440, height: 900 });

console.log("=== Boot ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await wait(400);
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));

console.log("=== Kazeharu: portrait + greeting (dungeon visible behind panel) ===");
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp"); // step onto (3,9)
await wait(400);

let html = await panelHtml(page);
check("Kazeharu's real portrait <img> renders", html.includes("kazeharu/portrait.png"));
let text = await panelText(page);
check("Greeting text present", text.includes("I am Kazeharu"));
check("Action bar NOT shown before acknowledgment", !text.includes("[T] Talk"));

const canvasVisible = await page.evaluate(() => {
  const canvas = document.querySelector("#view");
  const style = getComputedStyle(canvas);
  return style.display !== "none";
});
check("dungeon canvas stays visible behind the dialogue panel (not display:none)", canvasVisible);
const panelPositioned = await page.evaluate(() => {
  const panel = document.querySelector("#combat-panel");
  return getComputedStyle(panel).position === "absolute" && panel.classList.contains("npc-dialogue-host");
});
check("dialogue panel is the bottom-anchored overlay, not the full-screen host", panelPositioned);
await shot(page, OUT, "01-kazeharu-greeting-1440x900.png");

await press(page, "ArrowDown"); // acknowledge
await wait(150);
text = await panelText(page);
check("Action bar appears after acknowledgment", text.includes("Talk") && text.includes("Attack"));
await shot(page, OUT, "02-kazeharu-action-bar.png");

console.log("=== Kazeharu: visible topic + hidden 'master'/'join' ===");
await press(page, "t"); // Talk
await wait(150);
text = await panelText(page);
check("visible topics listed (forge, duel)", text.includes("forge") && text.includes("duel"));
await shot(page, OUT, "03-kazeharu-topics.png");

await press(page, "ArrowDown", 2); // -> "Ask about…" (forge, duel, ask = 3 items)
await wait(100);
await press(page, "Enter");
await wait(100);
await shot(page, OUT, "04-kazeharu-ask-strip.png");
await typeWord(page, "master");
await press(page, "Enter");
await wait(150);
text = await panelText(page);
check("hidden 'master' topic answers and sets kazeharuToldTruth", text.includes("chasing the deep"));
const toldTruth = await page.evaluate(() => !!window.__onyxDebug.state.kazeharuToldTruth);
check("kazeharuToldTruth flag set", toldTruth);

await press(page, "ArrowDown", 2);
await press(page, "Enter");
await typeWord(page, "join");
await press(page, "Enter");
await wait(150);
text = await panelText(page);
check("hidden 'join' topic (not yet eligible — no ring) refuses", text.includes("Bring me something"));
await press(page, "Escape");
await press(page, "Escape");
await wait(300);

console.log("=== Vestra: no portrait configured -> silhouette fallback ===");
await jumpTo(page, { floorId: 2, x: 2, y: 1, facing: 3, items: [{ itemId: "antidote", identified: true }] });
await press(page, "ArrowUp"); // step onto (1,1) — Vestra's tile
await wait(400);
html = await panelHtml(page);
check("no <img> for Vestra (no portraitId configured)", !html.includes("<img"));
check("silhouette fallback rendered instead", html.includes("npc-dlg-portrait-silhouette"));
text = await panelText(page);
check("Vestra's greeting shown", text.includes("I am Vestra"));
await shot(page, OUT, "05-vestra-silhouette-fallback.png");

console.log("=== Vestra: barter (transaction result) ===");
await press(page, "b"); // Barter
await wait(200);
text = await panelText(page);
check("barter list shows the trade", text.includes("Antidote") && text.includes("Robe"));
await shot(page, OUT, "06-vestra-barter-list.png");
await press(page, "Enter"); // confirm the (only) trade
await wait(200);
text = await panelText(page);
check("transaction result shown, unquoted", text.includes("takes the Antidote") && !text.includes("\u201Ctakes the Antidote"));
await shot(page, OUT, "07-vestra-transaction-result.png");
await press(page, "Escape"); // barter -> root
await press(page, "Escape"); // root -> close
await wait(300);

console.log("=== Vestra: Give (rejected — she has no wantsItemId) ===");
await jumpTo(page, { floorId: 2, x: 2, y: 1, facing: 3, items: [{ itemId: "healing-potion", identified: true }] });
await press(page, "ArrowUp");
await wait(300);
await press(page, "g"); // Give
await wait(150);
await press(page, "Enter"); // offer the only inventory item
await wait(150);
text = await panelText(page);
check("give-item result shown (rejected, since Vestra wants nothing here)", text.includes("has no use for"));
await press(page, "Escape"); // give -> root
await press(page, "Escape"); // root -> close
await wait(300);

console.log("=== Vestra: successful steal ===");
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0));
await jumpTo(page, { floorId: 2, x: 2, y: 1, facing: 3 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "s"); // Steal
await wait(200);
text = await panelText(page);
check("successful steal shows a transaction line, no combat", text.includes("lifts") && text.includes("gold"));
await shot(page, OUT, "08-successful-steal.png");
await press(page, "Escape");
await wait(150);

console.log("=== Vestra: failed steal -> combat handoff ===");
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.99));
await jumpTo(page, { floorId: 2, x: 2, y: 1, facing: 3 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "s"); // Steal — will fail at rng=0.99
let s = await waitForRoute(page, "combat");
check("failed steal starts exactly one combat", s.route === "combat", `got ${s.route}`);
await shot(page, OUT, "09-failed-steal-combat.png");
await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
await wait(900);
await press(page, "Enter");
await wait(400);
await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));

console.log("=== Kazeharu: Attack transition ===");
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "a"); // Attack
s = await waitForRoute(page, "combat");
check("Attack starts combat", s.route === "combat", `got ${s.route}`);
await page.evaluate(() => window.__onyxDebug.exitDebugCombat("fled"));
await wait(900);
await press(page, "Enter");
await wait(400);

console.log("=== Kazeharu: Leave ===");
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "l"); // Leave
await wait(300);
s = await snap(page);
check("Leave closes the panel back to dungeon", s.route === "dungeon", `got ${s.route}`);

console.log("=== Long dialogue pagination ===");
// Kazeharu's "master" line is long enough (over MAX_CHARS_PER_PAGE) to
// exercise pagination — re-check the same topic and inspect the rendered
// page length directly.
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(300);
await press(page, "t");
await press(page, "ArrowDown", 2);
await press(page, "Enter");
await typeWord(page, "master");
await press(page, "Enter");
await wait(200);
const pageInfo = await page.evaluate(() => {
  const el = document.querySelector(".npc-dlg-text");
  return { textLength: el ? el.textContent.length : 0, hasContinue: !!document.querySelector(".npc-dlg-continue:not([hidden])") };
});
check("dialogue text renders without overflow (page kept to a readable length)", pageInfo.textLength > 0 && pageInfo.textLength < 260, JSON.stringify(pageInfo));
await shot(page, OUT, "10-pagination-check.png");
await press(page, "Escape");
await press(page, "Escape");

console.log("=== Viewport screenshots ===");
await page.setViewportSize({ width: 1280, height: 720 });
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(400);
await press(page, "ArrowDown");
await wait(150);
await shot(page, OUT, "11-viewport-1280x720.png");
await press(page, "Escape");
await wait(150);

await page.setViewportSize({ width: 800, height: 700 });
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(400);
text = await panelText(page);
check("narrow viewport still shows portrait + name + greeting", text.includes("Kazeharu"));
const narrowPortraitVisible = await page.evaluate(() => {
  const portrait = document.querySelector(".npc-dlg-portrait");
  return portrait ? portrait.getBoundingClientRect().width > 0 : false;
});
check("portrait remains visible (not dropped) at narrow width", narrowPortraitVisible);
await shot(page, OUT, "12-viewport-narrow-800x700.png");
await press(page, "Escape");
await wait(150);
await page.setViewportSize({ width: 1440, height: 900 });

console.log("=== Reduced motion ===");
await page.emulateMedia({ reducedMotion: "reduce" });
await jumpTo(page, { floorId: 3, x: 2, y: 9, facing: 1 });
await press(page, "ArrowUp");
await wait(200);
const maskWidth = await page.evaluate(() => {
  const mask = document.querySelector(".npc-dlg-reveal-mask");
  return mask ? getComputedStyle(mask).width : null;
});
const textWidth = await page.evaluate(() => {
  const t = document.querySelector(".npc-dlg-text");
  return t ? t.getBoundingClientRect().width : 0;
});
check(
  "reduced motion skips the reveal animation (mask already collapsed)",
  maskWidth === "0px" || (typeof maskWidth === "string" && parseFloat(maskWidth) < 5),
  `maskWidth=${maskWidth} textWidth=${textWidth}`
);
await shot(page, OUT, "13-reduced-motion.png");
await page.emulateMedia({ reducedMotion: "no-preference" });

console.log("\n=== Summary ===");
console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`);
for (const f of failures) console.log(`  - ${f}`);

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
