// In-engine visual QA capture for Floor 1 environmental art landmarks.
// Requires a production preview running at ONYX_URL (default 127.0.0.1:5176).
//
// Usage: node scripts/floor1-wallfeature-qa.mjs <name> <x> <y> <facing> [<x2> <y2> <facing2> ...]
//   facing: 0=N 1=E 2=S 3=W
// Captures a screenshot from each given pose into
// playtest-screenshots/floor1-art-qa/<name>-NN.png
import { launch, boot, jumpTo, shot, ensureOutDir } from "./playtests/lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/floor1-art-qa");

const [name, ...rest] = process.argv.slice(2);
if (!name || rest.length < 3 || rest.length % 3 !== 0) {
  console.error(
    "Usage: node scripts/floor1-wallfeature-qa.mjs <name> <x> <y> <facing> [<x> <y> <facing> ...]"
  );
  process.exit(1);
}
const poses = [];
for (let i = 0; i < rest.length; i += 3) {
  poses.push({ x: Number(rest[i]), y: Number(rest[i + 1]), facing: Number(rest[i + 2]) });
}

const { browser, page } = await launch({ viewport: { width: 1280, height: 800 } });

await boot(page, URL, { scenario: { floorId: 1, ...poses[0] } });
await shot(page, OUT, `${name}-01.png`);

for (let i = 1; i < poses.length; i++) {
  await jumpTo(page, { floorId: 1, ...poses[i] });
  await shot(page, OUT, `${name}-${String(i + 1).padStart(2, "0")}.png`);
}

await browser.close();
console.log("wrote", poses.length, "screenshots to", OUT);
