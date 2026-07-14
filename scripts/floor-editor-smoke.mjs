/* Editor smoke test: carve, lock, inspect, NPC preservation, erase, undo, playtest. */
import { chromium } from "playwright";

const BASE = "http://localhost:5199/OnyxLabyrinth/";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const dialogs = [];
page.on("dialog", (d) => {
  dialogs.push(d.message());
  d.accept();
});

await page.goto(BASE + "tools/floor-editor.html");
await page.waitForSelector("#map-canvas");

const PAN = 16;
const CELL = 28;
const center = (c) => PAN + c * CELL + CELL / 2;
const box = await page.locator("#map-canvas").boundingBox();

// 1. Carve a room (2,2)-(6,6) with the default Room tool.
await page.mouse.move(box.x + center(2), box.y + center(2));
await page.mouse.down();
await page.mouse.move(box.x + center(6), box.y + center(6));
await page.mouse.up();
await page.waitForTimeout(200);

// 2. Paint a locked edge on (4,4).n — must NOT open a prompt() and must add a lock entry.
await page.click("#edge-modes button:text-is('locked')");
await page.mouse.click(box.x + center(4), box.y + PAN + 4 * CELL + 3);
await page.waitForTimeout(200);
check("locked edge painted without prompt()", dialogs.length === 0, dialogs.join(" | "));

// 3. Select the cell — lock inspector with key input appears; set a key id.
await page.click("#tool-buttons button:text-is('Select')");
await page.mouse.click(box.x + center(4), box.y + center(4));
await page.waitForTimeout(200);
let panel = await page.textContent("#cell-panel");
check("lock inspector shows", panel.includes("Lock n"));
await page.fill("#lk-key-0", "practice-key");
await page.click("#lk-save-0");
await page.waitForTimeout(200);
await page.mouse.click(box.x + center(4), box.y + center(4));
check("lock key saved", (await page.inputValue("#lk-key-0")) === "practice-key");

// 4. Paint the same edge locked AGAIN from the other side (4,3).s — no duplicate entry.
await page.click("#edge-modes button:text-is('locked')");
await page.mouse.click(box.x + center(4), box.y + PAN + 4 * CELL - 3);
await page.waitForTimeout(200);
await page.click("#tool-buttons button:text-is('Select')");
await page.mouse.click(box.x + center(4), box.y + center(4));
await page.waitForTimeout(200);
check(
  "no duplicate lock entry after repaint",
  (await page.locator("#lk-key-1").count()) === 0 &&
    (await page.inputValue("#lk-key-0").catch(() => null)) === "practice-key"
);

// 5. NPC: add on (5,5), rename via quick form, confirm topics survive (advanced JSON).
await page.mouse.click(box.x + center(5), box.y + center(5));
await page.waitForTimeout(150);
await page.click("#btn-add-npc");
await page.waitForTimeout(150);
await page.fill("#npc-name", "Smoke Tester");
await page.click("#npc-save");
await page.waitForTimeout(150);
await page.mouse.click(box.x + center(5), box.y + center(5));
await page.waitForTimeout(150);
const npcJson = await page.inputValue("#npc-json");
check(
  "NPC quick-save preserves topics",
  (await page.inputValue("#npc-name")) === "Smoke Tester" && npcJson.includes('"rumor"')
);

// 6. Erase (4,4): lock entry + locked edge must go away.
await page.click("#tool-buttons button:text-is('Erase')");
await page.mouse.click(box.x + center(4), box.y + center(4));
await page.waitForTimeout(150);
await page.click("#tool-buttons button:text-is('Select')");
await page.mouse.click(box.x + center(4), box.y + center(4));
await page.waitForTimeout(150);
panel = await page.textContent("#cell-panel");
const validation = await page.textContent("#validation-list");
check("erase removes lock entry + edge", !panel.includes("Lock n"));
check("no orphaned locked-edge errors", !validation.includes("locked_edge_no_entry"));

// 7. Undo restores the lock.
await page.keyboard.press("Control+z");
await page.waitForTimeout(150);
await page.mouse.click(box.x + center(4), box.y + center(4));
await page.waitForTimeout(150);
panel = await page.textContent("#cell-panel");
check("undo restores lock", panel.includes("Lock n"));

// 8. Set start inside the room, then Playtest — game must boot the floor.
await page.click("#tool-buttons button:text-is('Start')");
await page.mouse.click(box.x + center(3), box.y + center(3));
await page.waitForTimeout(150);
const before = dialogs.length;
const [popup] = await Promise.all([
  context.waitForEvent("page"),
  page.click("#btn-playtest"),
]).catch(() => [null]);
if (!popup) {
  check("playtest opens game", false, `blocked: ${dialogs.slice(before).join(" | ")}`);
} else {
  await popup.waitForLoadState();
  await popup.waitForTimeout(2500);
  const msg = await popup.textContent("#message").catch(() => "");
  check("playtest boots dungeon on custom floor", msg.includes("Playtesting"), `message="${msg.trim().slice(0, 60)}"`);
  await popup.screenshot({ path: ".tmp-playtest-smoke.png" });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
