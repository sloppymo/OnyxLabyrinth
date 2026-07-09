#!/usr/bin/env node
/**
 * Generates a standalone preview of the Creature Extended - Supporter Pack
 * sprites in /home/sloppymo/jewelflame/assets/Creature Extended- Supporter Pack/.
 *
 * The pack contains mixed sprite strips:
 *   - 64×N vertical side-view creature strips (frames are 64×32)
 *   - W×16 horizontal fireball strips (frames are 32×16)
 *   - W×64 horizontal explosion strips (frames are 32×64)
 *
 * The generated page auto-detects frame layout with a 32-px stride heuristic
 * and animates every strip at a fixed rate.
 *
 * Run with:
 *   node scripts/generate-jewelflame-creature-extended-preview.mjs
 * Then open jewelflame-creature-extended-preview.html in a browser.
 */
import { readdir, stat } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";

const root = resolve(process.cwd());
const packRoot = "/home/sloppymo/jewelflame/assets/Creature Extended- Supporter Pack";
const outFile = join(root, "jewelflame-creature-extended-preview.html");
const indexFile = join(root, "jewelflame-preview-index.html");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FRAME_STRIDE = 32;

function readUint32BE(buf, offset) {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  ) >>> 0;
}

function pngSize(file) {
  const buf = new Uint8Array(readFileSync(file));
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) throw new Error(`${file}: not a PNG`);
  }
  let offset = 8;
  while (offset < buf.length) {
    const length = readUint32BE(buf, offset);
    const type = String.fromCharCode(
      buf[offset + 4],
      buf[offset + 5],
      buf[offset + 6],
      buf[offset + 7]
    );
    if (type === "IHDR") {
      return {
        width: readUint32BE(buf, offset + 8),
        height: readUint32BE(buf, offset + 12),
      };
    }
    offset += 12 + length;
  }
  throw new Error(`${file}: IHDR not found`);
}

function inferStrips({ width, height }) {
  const horizontal = width > height;
  const vertical = height > width;

  if (horizontal) {
    const frameH = height;
    if (width >= FRAME_STRIDE && width % FRAME_STRIDE === 0) {
      const frameW = FRAME_STRIDE;
      const frameCount = Math.floor(width / frameW);
      if (frameCount > 1) {
        return { orientation: "h", frameW, frameH, frameCount };
      }
    }
    return { orientation: "h", frameW: width, frameH, frameCount: 1 };
  }

  if (vertical) {
    const frameW = width;
    if (height >= FRAME_STRIDE && height % FRAME_STRIDE === 0) {
      const frameH = FRAME_STRIDE;
      const frameCount = Math.floor(height / frameH);
      if (frameCount > 1) {
        return { orientation: "v", frameW, frameH, frameCount };
      }
    }
    return { orientation: "v", frameW, frameH: height, frameCount: 1 };
  }

  // Square: treat as a single frame unless it tiles evenly on a 32×32 grid.
  if (width >= FRAME_STRIDE && width % FRAME_STRIDE === 0) {
    return {
      orientation: "h",
      frameW: FRAME_STRIDE,
      frameH: height,
      frameCount: Math.floor(width / FRAME_STRIDE),
    };
  }
  return { orientation: "h", frameW: width, frameH: height, frameCount: 1 };
}

async function collectAssets() {
  const entries = (await readdir(packRoot))
    .filter((f) => f.endsWith(".png") && !f.endsWith(".png.import"))
    .sort();

  const assets = [];
  for (const f of entries) {
    const file = join(packRoot, f);
    const size = pngSize(file);
    const strips = inferStrips(size);
    const name = basename(f, ".png");
    const base = name.split("_")[0];
    assets.push({
      name,
      base,
      src: encodeURI(`../jewelflame/assets/Creature Extended- Supporter Pack/${f}`),
      width: size.width,
      height: size.height,
      fileSize: (await stat(file)).size,
      ...strips,
    });
  }
  return assets;
}

function renderHtml(assets) {
  const groups = new Map();
  for (const a of assets) {
    if (!groups.has(a.base)) groups.set(a.base, []);
    groups.get(a.base).push(a);
  }

  const groupHtml = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, items]) => {
      const cards = items
        .map(
          (s) => `
<div class="state ${s.frameCount > 1 ? "" : "single"}">
<canvas
  id="c-${s.name.replace(/\s/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_")}"
  width="240" height="240"></canvas>
<img
  class="strip"
  id="i-${s.name.replace(/\s/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_")}"
  src="${s.src}"
  style="display:none;"
  data-frame-w="${s.frameW}"
  data-frame-h="${s.frameH}"
  data-frame-count="${s.frameCount}"
  data-orientation="${s.orientation}" />
<div class="meta">
<strong>${s.name}</strong><br>
${s.width}x${s.height} · ${s.frameCount} frame${s.frameCount === 1 ? "" : "s"} · ${s.frameW}x${s.frameH} per frame · ${s.fileSize} bytes
</div>
</div>`
        )
        .join("");
      return `
<div class="group">
<h2>${items[0].base}</h2>
<div class="states">${cards}</div>
</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Jewelflame · Creature Extended - Supporter Pack Preview</title>
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
<h1>Creature Extended - Supporter Pack</h1>
<div class="hint">Sprite strips are auto-detected and drawn at 240×240. Multi-frame strips loop automatically.</div>
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
      const fps = 8;
      anims.push({ ctx, img, frameW, frameH, frameCount, orientation, fps, last: 0, frame: 0 });
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
        let sx = 0, sy = 0;
        if (a.orientation === 'h') {
          sx = a.frame * a.frameW;
        } else {
          sy = a.frame * a.frameH;
        }
        const scale = Math.min(240 / a.frameW, 240 / a.frameH);
        const dw = a.frameW * scale;
        const dh = a.frameH * scale;
        const x = (240 - dw) / 2;
        const y = (240 - dh) / 2;
        a.ctx.drawImage(a.img, sx, sy, a.frameW, a.frameH, x, y, dw, dh);
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
