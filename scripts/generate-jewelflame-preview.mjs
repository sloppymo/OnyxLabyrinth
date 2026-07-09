#!/usr/bin/env node
/**
 * Generates a unified preview page for all JewelFlame sprite assets:
 *   - Characters (100×100) side-view strips
 *   - Creature Extended - Supporter Pack mixed sprite strips
 *
 * Run with:
 *   node scripts/generate-jewelflame-preview.mjs
 * Then open jewelflame-preview.html in a browser.
 */
import { readdir, stat } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";

const root = resolve(process.cwd());
const charsRoot = "/home/sloppymo/jewelflame/assets/Characters(100x100)";
const packRoot = "/home/sloppymo/jewelflame/assets/Creature Extended- Supporter Pack";
const outFile = join(root, "jewelflame-preview.html");
const indexFile = join(root, "jewelflame-preview-index.html");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CREATURE_GRID_STRIDE = 16;
const CREATURE_FX_STRIDE = 32;
const CHAR_STATE_ORDER = ["Idle", "Walk", "Block", "Attack01", "Attack02", "Attack03", "Hurt", "Death", "DEATH"];

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

function fpsForState(state) {
  const s = state.toLowerCase();
  if (s === "idle" || s === "walk") return 6;
  if (s.startsWith("attack") || s.includes("explosion") || s === "fireball") return 10;
  return 8;
}

function safeId(name) {
  return name.replace(/\s/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function collectCharacters() {
  const characters = [];
  const topDirs = (await readdir(charsRoot)).filter((d) => !d.startsWith(".")).sort();
  for (const name of topDirs) {
    const topPath = join(charsRoot, name);
    const innerPath = join(topPath, name);
    try {
      const files = (await readdir(innerPath))
        .filter((f) => f.endsWith(".png") && !f.endsWith(".png.import"))
        .filter((f) => f !== `${name}.png`)
        .filter((f) => f.startsWith(`${name}-`));

      const states = [];
      for (const f of files) {
        const file = join(innerPath, f);
        const raw = f.slice(name.length + 1, -4);
        const state = raw.replace(/^DEATH$/i, "death");
        const { width, height } = pngSize(file);
        const frameCount = Math.floor(width / 100);
        const valid = height === 100 && width === frameCount * 100 && frameCount > 0;
        states.push({
          name,
          state,
          src: encodeURI(`../jewelflame/assets/Characters(100x100)/${name}/${name}/${f}`),
          width,
          height,
          frameW: 100,
          frameH: 100,
          frameCount,
          orientation: "h",
          fps: fpsForState(state),
          fileSize: (await stat(file)).size,
          valid,
        });
      }
      states.sort((a, b) => {
        const ai = CHAR_STATE_ORDER.indexOf(a.state);
        const bi = CHAR_STATE_ORDER.indexOf(b.state);
        if (ai === -1 && bi === -1) return a.state.localeCompare(b.state);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      if (states.length) characters.push({ name, states });
    } catch {
      // no base subfolder; skip
    }
  }
  return characters;
}

function inferCreatureStrips({ width, height }) {
  // The pack uses 16×16 grids for creatures (64×N sheets) and 32-wide
  // horizontal strips for effects (fireball 192×16, explosion 288×64).
  if (width > height && width >= CREATURE_FX_STRIDE && width % CREATURE_FX_STRIDE === 0) {
    const frameW = CREATURE_FX_STRIDE;
    const frameH = height;
    const frameCount = Math.floor(width / frameW);
    if (frameCount > 1) return { frameW, frameH, frameCount, orientation: "h" };
  }

  if (
    width % CREATURE_GRID_STRIDE === 0 &&
    height % CREATURE_GRID_STRIDE === 0
  ) {
    const cols = width / CREATURE_GRID_STRIDE;
    const rows = height / CREATURE_GRID_STRIDE;
    const frameCount = cols * rows;
    if (frameCount > 1) {
      return {
        orientation: "g",
        frameW: CREATURE_GRID_STRIDE,
        frameH: CREATURE_GRID_STRIDE,
        cols,
        rows,
        frameCount,
      };
    }
  }

  return { frameW: width, frameH: height, frameCount: 1, orientation: "h" };
}

async function collectCreatures() {
  const entries = (await readdir(packRoot))
    .filter((f) => f.endsWith(".png") && !f.endsWith(".png.import"))
    .sort();

  const assets = [];
  for (const f of entries) {
    const file = join(packRoot, f);
    const size = pngSize(file);
    const strips = inferCreatureStrips(size);
    const name = basename(f, ".png");
    const base = name.split("_")[0];
    const state = name.slice(base.length).replace(/^[_-]+/, "").replace(/[_-]+/g, "-") || "default";
    const fps = fpsForState(state);
    assets.push({
      name,
      base,
      state,
      src: encodeURI(`../jewelflame/assets/Creature Extended- Supporter Pack/${f}`),
      width: size.width,
      height: size.height,
      fileSize: (await stat(file)).size,
      ...strips,
      fps,
    });
  }
  return assets;
}

function renderGroupCard(item, extraClass = "") {
  const id = `${safeId(item.name)}-${safeId(item.state)}`;
  const meta = `${item.width}x${item.height} · ${item.frameCount} frame${item.frameCount === 1 ? "" : "s"} · ${item.frameW}x${item.frameH} per frame · ${item.fileSize} bytes`;
  const invalid = item.valid === false ? `<br><em class="err">invalid strip (expected height 100, width multiple of 100)</em>` : "";
  return `
<div class="state ${extraClass}">
<canvas id="c-${id}" width="240" height="240"></canvas>
<img
  class="strip"
  id="i-${id}"
  src="${item.src}"
  style="display:none;"
  data-frame-w="${item.frameW}"
  data-frame-h="${item.frameH}"
  data-frame-count="${item.frameCount}"
  data-orientation="${item.orientation}"
  ${item.orientation === "g" ? `data-cols="${item.cols}"` : ""}
  data-fps="${item.fps}"
  data-state="${item.state}" />
<div class="meta">
<strong>${item.state}</strong><br>
${meta}
${invalid}
</div>
</div>`;
}

async function renderHtml() {
  const characters = await collectCharacters();
  const creatures = await collectCreatures();

  const sections = [];

  if (characters.length) {
    const charGroups = characters
      .map((c) => `
<div class="group">
<h2>${c.name}</h2>
<div class="states">
${c.states.map((s) => renderGroupCard(s, s.valid ? "" : "bad")).join("")}
</div>
</div>`)
      .join("");
    sections.push(`
<section>
<h2>Characters (100×100)</h2>
${charGroups}
</section>`);
  }

  if (creatures.length) {
    const groups = new Map();
    for (const a of creatures) {
      if (!groups.has(a.base)) groups.set(a.base, []);
      groups.get(a.base).push(a);
    }
    const creatureGroups = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, items]) => `
<div class="group">
<h2>${items[0].base}</h2>
<div class="states">
${items.map((s) => renderGroupCard(s)).join("")}
</div>
</div>`)
      .join("");
    sections.push(`
<section>
<h2>Creature Extended – Supporter Pack</h2>
${creatureGroups}
</section>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Jewelflame · Asset Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
section h2 { color: #f0d080; border-bottom: 1px solid #3a3025; padding-bottom: 0.5rem; margin-top: 2rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; }
.group { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.group > h2 { margin: 0 0 0.75rem; color: #f0d080; text-transform: capitalize; border: none; padding: 0; }
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
<h1>Jewelflame Asset Preview</h1>
<div class="hint">All sprite strips are auto-detected and drawn at 240×240. Multi-frame strips loop automatically.</div>
${sections.join("")}
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
      const cols = orientation === "g" ? Number(img.dataset.cols) : undefined;
      const fps = Number(img.dataset.fps) || 8;
      anims.push({ ctx, img, frameW, frameH, frameCount, orientation, cols, fps, last: 0, frame: 0 });
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
        } else if (a.orientation === 'v') {
          sy = a.frame * a.frameH;
        } else {
          // Grid layout (e.g. 2 columns of 32×32 frames)
          const cols = a.cols || Math.floor(a.img.naturalWidth / a.frameW);
          sx = (a.frame % cols) * a.frameW;
          sy = Math.floor(a.frame / cols) * a.frameH;
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

function renderIndexRedirect() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=jewelflame-preview.html">
<title>Jewelflame · Asset Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 2rem; }
a { color: #f0d080; text-decoration: none; }
</style>
</head>
<body>
<p>Redirecting to the merged preview: <a href="jewelflame-preview.html">Jewelflame Asset Preview</a></p>
</body>
</html>`;
}

const html = await renderHtml();
writeFileSync(outFile, html, "utf-8");
writeFileSync(indexFile, renderIndexRedirect(), "utf-8");
console.log(`Wrote ${outFile}.`);
console.log(`Updated ${indexFile} to redirect to merged preview.`);
