#!/usr/bin/env node
/**
 * Generates a standalone sprite-preview.html from the public enemy sprite
 * strips. Run with:
 *   node scripts/generate-sprite-preview.mjs
 * Then open sprite-preview.html in a browser.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const assetsDir = join(root, "public", "assets", "enemies");
const outFile = join(root, "sprite-preview.html");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STATE_ORDER = ["idle", "attack", "hurt", "death"];

function getPngDimensions(buffer) {
  if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG");
  }
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataOffset = offset + 8;
    if (type === "IHDR") {
      return {
        width: buffer.readUInt32BE(dataOffset),
        height: buffer.readUInt32BE(dataOffset + 4),
      };
    }
    offset += 8 + length + 4;
  }
  throw new Error("IHDR not found");
}

async function collectEnemies() {
  const enemies = [];
  const dirNames = await readdir(assetsDir);
  for (const enemyId of dirNames.sort()) {
    const enemyDir = join(assetsDir, enemyId);
    const entries = (await readdir(enemyDir))
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({ state: basename(f, ".png"), file: join(enemyDir, f) }))
      .filter((s) => STATE_ORDER.includes(s.state));
    entries.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));

    const states = [];
    for (const s of entries) {
      const buf = await readFile(s.file);
      const { width, height } = getPngDimensions(buf);
      const frameCount = Math.floor(width / 100);
      const expectedWidth = frameCount * 100;
      const valid = height === 100 && width === expectedWidth && frameCount > 0;
      states.push({
        state: s.state,
        src: `public/assets/enemies/${enemyId}/${s.state}.png`,
        width,
        height,
        frameCount,
        valid,
        fileSize: (await stat(s.file)).size,
      });
    }
    if (states.length) enemies.push({ enemyId, states });
  }
  return enemies;
}

function renderHtml(enemies) {
  const cards = enemies
    .map(
      (e) => `
<div class="enemy">
<h2>${e.enemyId}</h2>
<div class="states">
${e.states
  .map(
    (s) => `
<div class="state ${s.valid ? "" : "bad"}">
<canvas id="c-${e.enemyId}-${s.state}" width="240" height="240"></canvas>
<img class="strip" id="i-${e.enemyId}-${s.state}" src="${s.src}" style="display:none;" />
<div class="meta">
<strong>${s.state}</strong><br>
${s.width}x${s.height} · ${s.frameCount} frame${s.frameCount === 1 ? "" : "s"} · ${s.fileSize} bytes
${s.valid ? "" : `<br><em class="err">invalid strip (expected height 100, width multiple of 100)</em>`}
</div>
</div>`
  )
  .join("")}
</div>
</div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OnyxLabyrinth · Enemy Sprite Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; }
.enemy { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.enemy h2 { margin: 0 0 0.75rem; color: #f0d080; }
.states { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.state { background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; text-align: center; }
.state.bad { border-color: #c44; }
canvas { image-rendering: pixelated; background: #000; border-radius: 2px; display: block; margin: 0 auto; }
.meta { margin-top: 0.5rem; font-size: 0.8rem; color: #b0a080; }
.meta strong { color: #f0d080; }
.err { color: #f66; }
.strip { display: none; }
</style>
</head>
<body>
<h1>Enemy Sprite Strip Preview</h1>
<div class="hint">Pixel-art strips are drawn at 240×240. Idle/attack/hurt/death loop automatically.</div>
${cards}
<script>
const anims = [];
const dpr = Math.min(window.devicePixelRatio || 1, 2);

document.fonts.ready.catch(() => {}).finally(() => {
  const images = Array.from(document.querySelectorAll('img.strip'));
  let loaded = 0;
  const total = images.length;

  function start() {
    images.forEach((img) => {
      const id = img.id.slice(2);
      const canvas = document.getElementById('c-' + id);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const frameCount = Math.floor(img.naturalWidth / 100) || 1;
      const fps = id.endsWith('idle') ? 6 : (id.endsWith('death') ? 4 : 8);
      anims.push({ ctx, img, frameCount, fps, last: 0, frame: 0 });
    });
    requestAnimationFrame(loop);
  }

  function loop(now) {
    anims.forEach((a) => {
      const elapsed = now - a.last;
      const interval = 1000 / a.fps;
      if (elapsed >= interval) {
        a.frame = (a.frame + Math.floor(elapsed / interval)) % a.frameCount;
        a.last = now;
        a.ctx.clearRect(0, 0, 240, 240);
        const dw = 240, dh = 240;
        const sx = a.frame * 100, sy = 0, sw = 100, sh = Math.min(100, a.img.naturalHeight);
        const x = (240 - dw) / 2, y = (240 - dh) / 2;
        a.ctx.drawImage(a.img, sx, sy, sw, sh, x, y, dw, dh);
      }
    });
    requestAnimationFrame(loop);
  }

  images.forEach((img) => {
    if (img.complete && img.naturalWidth) onLoad();
    else img.addEventListener('load', onLoad);
    img.addEventListener('error', onLoad);
  });

  function onLoad() {
    loaded++;
    if (loaded >= total) start();
  }
});
</script>
</body>
</html>`;
}

const enemies = await collectEnemies();
await writeFile(outFile, renderHtml(enemies), "utf-8");
console.log(`Wrote ${outFile} with ${enemies.length} enemy sets.`);
