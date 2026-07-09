#!/usr/bin/env node
/**
 * Generates a standalone preview of the side-facing Creature Extended sprites.
 *
 * The pack sheets are 16×16 sprite grids. This generator reads the matching
 * Godot SpriteFrames (.tres) files to find the state rows (idle, walk, attack,
 * hurt), picks the right-facing column when available, and falls back to the
 * left-facing column flipped horizontally. Pixel-weighted centroid detection
 * verifies the visual facing, so every animated frame stays in a consistent
 * side profile without flipping back and forth. Effects (fireball, explosions)
 * are previewed as 16×16 grids.
 *
 * Run with:
 *   node scripts/generate-jewelflame-creature-extended-preview.mjs
 * Then open jewelflame-creature-extended-preview.html in a browser.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import {
  pngSize,
  loadPng,
  parseCreatureSideStates,
  inferEffectGrid,
  safeId,
} from "./jewelflame-creature-utils.mjs";

const root = resolve(process.cwd());
const packRoot = join(root, "jewelflame/assets/Creature Extended- Supporter Pack");
const tresRoot = join(root, "jewelflame/assets/animations/creatures");
const outFile = join(root, "jewelflame-creature-extended-preview.html");
const indexFile = join(root, "jewelflame-preview-index.html");

async function collectAssets() {
  const entries = (await readdir(packRoot))
    .filter((f) => f.endsWith(".png") && !f.endsWith(".png.import"))
    .sort();

  const assets = [];
  for (const f of entries) {
    const file = join(packRoot, f);
    const size = pngSize(file);
    const name = basename(f, ".png");
    const src = encodeURI(
      `./jewelflame/assets/Creature Extended- Supporter Pack/${f}`
    );
    const fileSize = (await stat(file)).size;
    const tresPath = join(tresRoot, `${name.toLowerCase()}.tres`);

    if (existsSync(tresPath)) {
      const png = loadPng(file);
      const states = parseCreatureSideStates(tresPath, size, png);
      if (states.length > 0) {
        for (const s of states) {
          assets.push({
            name,
            group: name,
            src,
            width: size.width,
            height: size.height,
            fileSize,
            ...s,
          });
        }
        continue;
      }
    }

    // Fallback for effects / missing metadata.
    const grid = inferEffectGrid(size);
    assets.push({
      name,
      group: name,
      state: "default",
      src,
      width: size.width,
      height: size.height,
      fileSize,
      ...grid,
      fps: grid.frameCount > 1 ? 8 : 1,
    });
  }
  return assets;
}

function renderHtml(assets) {
  const groups = new Map();
  for (const a of assets) {
    if (!groups.has(a.group)) groups.set(a.group, []);
    groups.get(a.group).push(a);
  }

  const groupHtml = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, items]) => {
      const cards = items
        .map((s) => {
          const id = `${safeId(s.name)}-${safeId(s.state)}`;
          return `
<div class="state ${s.frameCount > 1 ? "" : "single"}">
<canvas id="c-${id}" width="240" height="240"></canvas>
<img
  class="strip"
  id="i-${id}"
  src="${s.src}"
  style="display:none;"
  data-frame-w="${s.frameW}"
  data-frame-h="${s.frameH}"
  data-frame-count="${s.frameCount}"
  data-orientation="${s.orientation}"
  data-fps="${s.fps}"
  ${s.orientation === "g" ? `data-cols="${s.cols}"` : ""}
  ${s.sxOffset ? `data-sx-offset="${s.sxOffset}"` : ""}
  ${s.syOffset ? `data-sy-offset="${s.syOffset}"` : ""}
  ${s.flipH ? 'data-flip-h="1"' : ""} />
<div class="meta">
<strong>${s.name}</strong> · ${s.state}<br>
${s.width}x${s.height} · ${s.frameCount} frame${s.frameCount === 1 ? "" : "s"} · ${s.frameW}x${s.frameH} per frame · ${s.fileSize} bytes
</div>
</div>`;
        })
        .join("");
      return `
<div class="group">
<h2>${items[0].group}</h2>
<div class="states">${cards}</div>
</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Jewelflame · Creature Extended - Supporter Pack (Side-facing)</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; }
.group { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.group h2 { margin: 0 0 0.75rem; color: #f0d080; text-transform: capitalize; }
.states { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.state { background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; text-align: center; }
.state.single { border-color: #4a4a35; }
canvas { image-rendering: pixelated; background: #000; border-radius: 2px; display: block; margin: 0 auto; }
.meta { margin-top: 0.5rem; font-size: 0.8rem; color: #b0a080; }
.meta strong { color: #f0d080; }
.strip { display: none; }
</style>
</head>
<body>
<h1>Creature Extended – Supporter Pack (Side-facing)</h1>
<div class="hint">Animated side-facing preview of each creature state. Frames are read from the right-facing column of the matching .tres SpriteFrames row and flipped horizontally when only a left-facing column is available. Pixel-weighted facing detection keeps every frame in the same profile.</div>
${groupHtml}
<script>
const anims = [];

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
      const frameW = Number(img.dataset.frameW);
      const frameH = Number(img.dataset.frameH);
      const frameCount = Number(img.dataset.frameCount);
      const orientation = img.dataset.orientation;
      const cols = orientation === 'g' ? Number(img.dataset.cols) : undefined;
      const sxOffset = Number(img.dataset.sxOffset || 0);
      const syOffset = Number(img.dataset.syOffset || 0);
      const fps = Number(img.dataset.fps) || 8;
      const flipH = img.dataset.flipH === "1";
      anims.push({ ctx, img, frameW, frameH, frameCount, orientation, cols, sxOffset, syOffset, fps, flipH, last: 0, frame: 0 });
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
        let sx = a.sxOffset;
        let sy = a.syOffset;
        if (a.orientation === 'h') {
          sx += a.frame * a.frameW;
        } else if (a.orientation === 'v') {
          sy += a.frame * a.frameH;
        } else {
          const cols = a.cols || Math.floor(a.img.naturalWidth / a.frameW);
          sx += (a.frame % cols) * a.frameW;
          sy += Math.floor(a.frame / cols) * a.frameH;
        }
        const scale = Math.min(240 / a.frameW, 240 / a.frameH);
        const dw = a.frameW * scale;
        const dh = a.frameH * scale;
        const x = (240 - dw) / 2;
        const y = (240 - dh) / 2;
        if (a.flipH) {
          a.ctx.save();
          a.ctx.translate(240, 0);
          a.ctx.scale(-1, 1);
        }
        a.ctx.drawImage(a.img, sx, sy, a.frameW, a.frameH, x, y, dw, dh);
        if (a.flipH) a.ctx.restore();
      }
    });
    requestAnimationFrame(loop);
  }

  function onLoad() {
    loaded++;
    if (loaded >= total) start();
  }

  images.forEach((img) => {
    if (img.complete && img.naturalWidth) onLoad();
    else img.addEventListener('load', onLoad);
    img.addEventListener('error', onLoad);
  });
});
</script>
</body>
</html>`;
}

function renderIndex() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Jewelflame · Asset Preview Index</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 2rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
ul { list-style: none; padding: 0; max-width: 600px; margin: 2rem auto; }
li { margin: 0.75rem 0; }
a { color: #f0d080; text-decoration: none; display: block; background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; }
a:hover { background: #2a2616; }
</style>
</head>
<body>
<h1>Jewelflame Asset Previews</h1>
<ul>
<li><a href="jewelflame-100x100-preview.html">Characters (100×100) Strip Preview</a></li>
<li><a href="jewelflame-creature-extended-preview.html">Creature Extended – Supporter Pack Preview</a></li>
</ul>
</body>
</html>`;
}

const assets = await collectAssets();
writeFileSync(outFile, renderHtml(assets), "utf-8");
writeFileSync(indexFile, renderIndex(), "utf-8");
console.log(`Wrote ${outFile} with ${assets.length} assets.`);
console.log(`Wrote ${indexFile}.`);
