#!/usr/bin/env node
/** Browser proof for the two authored key-reward compositions. */
import { act, boot, ensureOutDir, launch, press, shot, snap, wait } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1&mazeRenderer=webgl";
const OUT = ensureOutDir("output/playwright/reward-framing");
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function captureChest(page, name, scenario, itemId) {
  await boot(page, BASE, { scenario });
  await page.evaluate(() => window.__onyxDebug.setGameplayRng(() => 0.999));
  await shot(page, OUT, `${name}-01-approach.png`);
  await act(page, "ArrowUp");
  let state = await snap(page);
  check(`${name} reaches the authored chest`, state.tile === "treasure", JSON.stringify(state.pos));
  check(`${name} opens the trap interaction`, state.route === "trap", `route=${state.route}`);
  await shot(page, OUT, `${name}-02-trap-prompt.png`);
  await press(page, "i");
  await press(page, "o");
  await wait(300);
  state = await snap(page);
  const rewardLabel = itemId.replaceAll("-", " ");
  check(`${name} keeps the completed reward message readable`, state.message.text.toLowerCase().includes(rewardLabel), state.message.text);
  check(`${name} retains the reward`, state.keys.includes(itemId) || state.inventory.some((entry) => entry.itemId === itemId), itemId);
  await shot(page, OUT, `${name}-03-reward-resolved.png`);
}

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  console.log("=== Floor 1 lexicon-key chest ===");
  await captureChest(page, "f1-lexicon-key", { floorId: 1, x: 15, y: 8, facing: 3, autosave: false, stepsSinceEncounter: 0 }, "lexicon-key");
  console.log("=== Floor 3 forge-key chest ===");
  await captureChest(page, "f3-forge-key", { floorId: 3, x: 2, y: 13, facing: 2, autosave: false, stepsSinceEncounter: 0 }, "forge-key");
} finally {
  await browser.close();
}

check("browser has no errors", errors.length === 0, JSON.stringify(errors));
console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`);
for (const failure of failures) console.log(`  - ${failure}`);
if (failures.length > 0 || errors.length > 0) process.exitCode = 1;
