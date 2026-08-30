import { chromium } from "playwright";

const SHOTS = "/tmp/claude-1000/-home-sloppymo-OnyxLabyrinth/b8428be0-b689-44d5-bc5e-e6b13e85e120/scratchpad/shots";
const URL = "http://localhost:5173/OnyxLabyrinth/?debug=1";

const errors = [];

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("OK:", msg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console.error: " + msg.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__onyxDebug, { timeout: 10000 });
await page.waitForTimeout(300);

await page.screenshot({ path: `${SHOTS}/01-title.png` });

// Click "New Game" in the title FF6Window (text-based row match).
const newGameRow = page.locator(".ff6-selection-list .ff6-menu-item", { hasText: "New Game" }).first();
await newGameRow.click();
await page.waitForTimeout(400);

await page.screenshot({ path: `${SHOTS}/02-build-select-initial.png` });

const title = await page.locator(".ff6-menu-title").first().textContent();
assert(title?.includes("Choose Old Man's Path"), `screen title reads "${title}"`);

const buildNames = await page.locator(".ff6-selection-list .ff6-menu-item").allTextContents();
console.log("Build rows:", buildNames);
assert(buildNames.some((t) => t.includes("Silent Ward")), "Silent Ward row visible");
assert(buildNames.some((t) => t.includes("Last Hour")), "Last Hour row visible");
assert(buildNames.some((t) => t.includes("Reckoning")), "Reckoning row visible");

const initialCardRows = await page.locator(".omb-card-row").count();
assert(initialCardRows >= 7, `at least 7 unique card rows shown for first build (${initialCardRows})`);
const initialTagline = await page.locator(".omb-tagline").textContent();
console.log("Initial tagline:", initialTagline);

// Move selection down twice with keyboard, verify the detail panel updates.
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(150);
const secondTagline = await page.locator(".omb-tagline").textContent();
console.log("After ArrowDown tagline:", secondTagline);
assert(secondTagline !== initialTagline, "detail panel content changes when moving selection");

await page.screenshot({ path: `${SHOTS}/03-build-select-second-hover.png` });

await page.keyboard.press("ArrowDown");
await page.waitForTimeout(150);
const thirdTagline = await page.locator(".omb-tagline").textContent();
assert(thirdTagline !== secondTagline, "detail panel changes again on second move");
await page.screenshot({ path: `${SHOTS}/04-build-select-third-hover.png` });

// Confirm this (third) build with Enter.
await page.keyboard.press("Enter");
await page.waitForTimeout(600);

await page.screenshot({ path: `${SHOTS}/05-rat-king-build-select.png` });

const ratKingTitle = await page.locator(".ff6-menu-title").first().textContent();
assert(ratKingTitle?.includes("Choose Rat King's Path"), `screen title reads "${ratKingTitle}"`);
const ratKingBuildNames = await page.locator(".ff6-selection-list .ff6-menu-item").allTextContents();
console.log("Rat King build rows:", ratKingBuildNames);
assert(ratKingBuildNames.some((t) => t.includes("Nest")), "The Nest row visible");
assert(ratKingBuildNames.some((t) => t.includes("Open the Rank")), "Open the Rank row visible");
assert(ratKingBuildNames.some((t) => t.includes("King of the Heap")), "King of the Heap row visible");
assert(await page.locator(".omb-card-row").count() >= 7, "Rat King card rows shown");

// Choose the second Rat King build so the persisted value proves this screen
// is not merely decorative.
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(150);
await page.keyboard.press("Enter");
await page.waitForTimeout(600);

await page.screenshot({ path: `${SHOTS}/06-after-confirm.png` });

// Should now be in the prologue (black field) or already through it into town.
const modeAfterConfirm = await page.evaluate(() => window.__onyxDebug.state.mode);
console.log("Mode right after confirm:", modeAfterConfirm);

// The prologue is a black-field screen layered over mode "title" (same
// pattern as the build-select screen); Escape is its documented skip key.
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/07-after-prologue.png` });

const finalMode = await page.evaluate(() => window.__onyxDebug.state.mode);
console.log("Final mode:", finalMode);
assert(finalMode === "town" || finalMode === "dungeon", `landed in town/dungeon, got "${finalMode}"`);

const progress = await page.evaluate(() => window.__onyxDebug.state.campaignCards);
console.log("oldManBuildId:", progress.oldManBuildId);
assert(progress.oldManBuildId === "reckoning", `chosen build persisted as "reckoning", got "${progress.oldManBuildId}"`);
assert(progress.ratKingBuildId === "open-rank", `chosen Rat King build persisted as "open-rank", got "${progress.ratKingBuildId}"`);

const oldManDeckIds = await page.evaluate(() => {
  const s = window.__onyxDebug.state;
  const active = new Set(s.campaignCards["old-man"].activeDeck);
  return s.campaignCards["old-man"].collection
    .filter((c) => active.has(c.instanceId))
    .map((c) => c.cardId)
    .sort();
});
console.log("Old Man deck:", oldManDeckIds);
assert(oldManDeckIds.includes("reckoning-strike"), "reckoning-strike is in the active deck");
assert(oldManDeckIds.includes("reckoning-ward"), "reckoning-ward is in the active deck");
assert(!oldManDeckIds.includes("veil-of-quiet"), "Silent Ward's veil-of-quiet is NOT in the deck");
assert(oldManDeckIds.length === 12, `active deck has exactly 12 physical cards (${oldManDeckIds.length})`);

const ratKingDeckIds = await page.evaluate(() => {
  const s = window.__onyxDebug.state;
  const active = new Set(s.campaignCards["rat-king"].activeDeck);
  return s.campaignCards["rat-king"].collection
    .filter((c) => active.has(c.instanceId))
    .map((c) => c.cardId)
    .sort();
});
console.log("Rat King deck:", ratKingDeckIds);
assert(ratKingDeckIds.includes("burst-the-nest"), "Open the Rank's Burst the Nest is in the active deck");
assert(ratKingDeckIds.includes("from-the-dark"), "Open the Rank's From the Dark is in the active deck");
assert(ratKingDeckIds.length === 12, `Rat King active deck has exactly 12 physical cards (${ratKingDeckIds.length})`);

console.log("\n=== Console/page errors captured ===");
console.log(errors.length === 0 ? "(none)" : errors.join("\n"));

await browser.close();
if (errors.length > 0) {
  console.error("FAILING: console/page errors were captured");
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
