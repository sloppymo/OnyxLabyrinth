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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import {
  pngSize,
  loadPng,
  parseCreatureSideStates,
  inferEffectGrid,
  safeId,
} from "./jewelflame-creature-utils.mjs";

const root = resolve(process.cwd());
const charsRoot = join(root, "assets/Characters(100x100)");
const packRoot = join(root, "assets/Creature Extended- Supporter Pack");
const tresRoot = join(root, "assets/animations/creatures");
const outFile = join(root, "jewelflame-preview.html");
const indexFile = join(root, "jewelflame-preview-index.html");

const CHAR_STATE_ORDER = ["Idle", "Walk", "Block", "Attack01", "Attack02", "Attack03", "Hurt", "Death", "DEATH"];

function fpsForState(state) {
  const s = state.toLowerCase();
  if (s === "idle" || s === "walk") return 6;
  if (s.startsWith("attack") || s.includes("explosion") || s === "fireball") return 10;
  return 8;
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
          src: encodeURI(`./assets/Characters(100x100)/${name}/${name}/${f}`),
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

async function collectCreatures() {
  const entries = (await readdir(packRoot))
    .filter((f) => f.endsWith(".png") && !f.endsWith(".png.import"))
    .sort();

  const groups = [];
  for (const f of entries) {
    const file = join(packRoot, f);
    const size = pngSize(file);
    const name = basename(f, ".png");
    const src = encodeURI(
      `./assets/Creature Extended- Supporter Pack/${f}`
    );
    const fileSize = (await stat(file)).size;
    const tresPath = join(tresRoot, `${name.toLowerCase()}.tres`);

    const states = [];
    if (existsSync(tresPath)) {
      const png = loadPng(file);
      const parsed = parseCreatureSideStates(tresPath, size, png);
      states.push(...parsed);
    }

    if (states.length === 0) {
      const grid = inferEffectGrid(size);
      states.push({
        state: "default",
        fps: grid.frameCount > 1 ? 8 : 1,
        ...grid,
      });
    }

    for (const s of states) {
      s.name = name;
      s.src = src;
      s.width = size.width;
      s.height = size.height;
      s.fileSize = fileSize;
    }
    groups.push({ name, states });
  }
  return groups;
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
  ${item.sxOffset ? `data-sx-offset="${item.sxOffset}"` : ""}
  ${item.syOffset ? `data-sy-offset="${item.syOffset}"` : ""}
  data-fps="${item.fps}"
  data-state="${item.state}"
  ${item.flipH ? 'data-flip-h="1"' : ""} />
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
    const creatureGroups = creatures
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => `
<div class="group">
<h2>${g.name}</h2>
<div class="states">
${g.states.map((s) => renderGroupCard(s)).join("")}
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
<div class="hint">All sprite strips are auto-detected and drawn at 240×240. Multi-frame strips loop automatically. Creature Extended states animate in a consistent side profile; they are flipped horizontally only when the source sheet provides a left-facing column.</div>
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
          // Grid layout (e.g. 2 columns of 32×32 frames)
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
