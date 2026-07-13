#!/usr/bin/env node
/**
 * Generates a standalone sprite-preview.html from the sprite strips the game
 * actually loads: party classes (public/assets/party/), enemies
 * (public/assets/enemies/), and spell/status effects (EFFECT_STRIPS in
 * src/engine/effect-sprite-cache.ts). Run with:
 *   node scripts/generate-sprite-preview.mjs
 * Then open sprite-preview.html in a browser.
 *
 * The effects section is parsed directly out of effect-sprite-cache.ts rather
 * than hand-listed here, so a new EFFECT_STRIPS entry always shows up on the
 * next regenerate without this script needing to be kept in sync by hand.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const enemiesDir = join(root, "public", "assets", "enemies");
const partyDir = join(root, "public", "assets", "party");
const effectsDir = join(root, "public", "assets", "effects");
const effectCacheFile = join(root, "src", "engine", "effect-sprite-cache.ts");
const outFile = join(root, "sprite-preview.html");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ENEMY_STATE_ORDER = ["idle", "attack", "hurt", "death"];
const PARTY_STATE_ORDER = ["idle", "walk", "attack", "cast", "hurt", "death"];

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

async function collectStrips(baseDir, srcPrefix, stateOrder) {
  const sets = [];
  const dirNames = await readdir(baseDir);
  for (const id of dirNames.sort()) {
    const dir = join(baseDir, id);
    const entries = (await readdir(dir))
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({ state: basename(f, ".png"), file: join(dir, f) }))
      .filter((s) => stateOrder.includes(s.state));
    entries.sort((a, b) => stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state));

    const states = [];
    for (const s of entries) {
      const buf = await readFile(s.file);
      const { width, height } = getPngDimensions(buf);
      const frameCount = Math.floor(width / 100);
      const expectedWidth = frameCount * 100;
      const valid = height === 100 && width === expectedWidth && frameCount > 0;
      states.push({
        state: s.state,
        src: `${srcPrefix}/${id}/${s.state}.png`,
        width,
        height,
        frameCount,
        valid,
        fileSize: (await stat(s.file)).size,
      });
    }
    if (states.length) sets.push({ enemyId: id, states });
  }
  return sets;
}

/**
 * Parse the EFFECT_STRIPS object literal out of effect-sprite-cache.ts. Each
 * entry looks like `key: { name: "...", url: "...", frameWidth: N,
 * frameHeight: N, frameCount: N, fps: N },` (single- or multi-line) — no
 * entry contains nested braces, so a non-greedy `{...}` match per key is safe.
 */
async function parseEffectStrips() {
  const src = await readFile(effectCacheFile, "utf-8");
  const startMarker = "const EFFECT_STRIPS: Record<string, EffectStrip> = {";
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error("EFFECT_STRIPS block not found in " + effectCacheFile);
  const bodyStart = start + startMarker.length;
  const end = src.indexOf("\n};", bodyStart);
  if (end === -1) throw new Error("end of EFFECT_STRIPS block not found");
  const body = src.slice(bodyStart, end);

  const entries = [];
  const entryRe = /(\w+):\s*\{([^{}]*)\}/g;
  let m;
  while ((m = entryRe.exec(body))) {
    const [, key, fields] = m;
    const get = (field, isString) => {
      const re = isString
        ? new RegExp(`${field}:\\s*"([^"]*)"`)
        : new RegExp(`${field}:\\s*(\\d+)`);
      const fm = fields.match(re);
      return fm ? (isString ? fm[1] : Number(fm[1])) : undefined;
    };
    entries.push({
      key,
      name: get("name", true),
      url: get("url", true),
      frameWidth: get("frameWidth"),
      frameHeight: get("frameHeight"),
      frameCount: get("frameCount"),
      fps: get("fps"),
    });
  }
  return entries;
}

async function collectEffects() {
  const strips = await parseEffectStrips();
  const effects = [];
  for (const s of strips) {
    const file = join(effectsDir, s.url);
    let width, height, fileSize, exists = true;
    try {
      const buf = await readFile(file);
      ({ width, height } = getPngDimensions(buf));
      fileSize = (await stat(file)).size;
    } catch {
      exists = false;
      width = height = fileSize = 0;
    }
    const cols = exists ? Math.max(1, Math.floor(width / s.frameWidth)) : 0;
    const rows = exists ? Math.max(1, Math.floor(height / s.frameHeight)) : 0;
    const naturalFrames = cols * rows;
    const valid = exists && width % s.frameWidth === 0 && height % s.frameHeight === 0 && naturalFrames >= s.frameCount;
    effects.push({ ...s, src: `public/assets/effects/${s.url}`, width, height, fileSize, exists, cols, rows, naturalFrames, valid });
  }
  return effects;
}

function renderEffectCards(effects) {
  return `
<div class="states effects-grid">
${effects
  .map(
    (e) => `
<div class="state ${e.valid ? "" : "bad"}">
<canvas id="ce-${e.key}" width="160" height="160" data-fw="${e.frameWidth}" data-fh="${e.frameHeight}" data-fc="${e.frameCount}" data-cols="${e.cols || 1}" data-fps="${e.fps}"></canvas>
<img class="effect-strip" id="ie-${e.key}" src="${e.src}" style="display:none;" />
<div class="meta">
<strong>${e.key}</strong><br>
${e.name}<br>
${e.frameWidth}x${e.frameHeight} frame · ${e.frameCount} frame${e.frameCount === 1 ? "" : "s"} · ${e.fps}fps · ${e.fileSize} bytes<br>
<span class="path">${e.url}</span>
${e.exists ? "" : `<br><em class="err">file not found at ${e.src}</em>`}
${e.exists && !e.valid ? `<br><em class="err">declared ${e.frameCount} frames but sheet is ${e.width}x${e.height} (only fits ${e.naturalFrames} at ${e.frameWidth}x${e.frameHeight})</em>` : ""}
</div>
</div>`
  )
  .join("")}
</div>`;
}

function renderCards(sets) {
  return sets
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
}

function renderHtml(party, enemies, effects) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OnyxLabyrinth · In-Game Sprite Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; }
h1.section { margin-top: 2.5rem; color: #f0d080; border-top: 2px solid #3a3025; padding-top: 1.5rem; }
.enemy { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.enemy h2 { margin: 0 0 0.75rem; color: #f0d080; }
.states { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.state { background: #1a1612; border: 1px solid #3a3025; border-radius: 4px; padding: 0.75rem; text-align: center; }
.state.bad { border-color: #c44; }
canvas { image-rendering: pixelated; background: #000; border-radius: 2px; display: block; margin: 0 auto; }
.meta { margin-top: 0.5rem; font-size: 0.8rem; color: #b0a080; }
.meta strong { color: #f0d080; }
.err { color: #f66; }
.strip, .effect-strip { display: none; }
.effects-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.path { color: #8a7a5c; }
</style>
</head>
<body>
<h1>In-Game Sprite Strip Preview</h1>
<div class="hint">Every sprite strip the game loads, animating at its combat frame rate. Drawn at 240×240; strips are authored facing right (the party is mirrored in combat).</div>
<h1 class="section">Party — combat classes</h1>
<div class="hint">Fighter→Knight · Mage→Wizard · Priest→Priest · Thief→Archer · Ninja→Swordsman (see src/engine/party-sprite-cache.ts)</div>
${renderCards(party)}
<h1 class="section">Enemies</h1>
${renderCards(enemies)}
<h1 class="section">Effects — spell/status VFX</h1>
<div class="hint">Every entry in EFFECT_STRIPS (src/engine/effect-sprite-cache.ts), whether or not a spell currently references it. Drawn at 160×160, one frame-row per strip (multi-row sheets show row 0 only).</div>
${renderEffectCards(effects)}
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
      // Match in-game frame rates (party-sprite-cache STATE_CONFIG).
      const fps = id.endsWith('idle') ? 6
        : id.endsWith('walk') ? 10
        : id.endsWith('attack') ? 12
        : id.endsWith('cast') ? 10
        : id.endsWith('death') ? 4
        : 8;
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

// Effect strips: variable frame size/fps per entry (driven by data-* attrs
// on the canvas, since unlike party/enemy strips these aren't a fixed 100x100).
(function () {
  const effectAnims = [];
  const images = Array.from(document.querySelectorAll('img.effect-strip'));
  let loaded = 0;
  const total = images.length;
  if (!total) return;

  function start() {
    images.forEach((img) => {
      const id = img.id.slice(3);
      const canvas = document.getElementById('ce-' + id);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const fw = Number(canvas.dataset.fw);
      const fh = Number(canvas.dataset.fh);
      const frameCount = Number(canvas.dataset.fc) || 1;
      const cols = Number(canvas.dataset.cols) || 1;
      const fps = Number(canvas.dataset.fps) || 8;
      effectAnims.push({ ctx, img, fw, fh, frameCount, cols, fps, last: 0, frame: 0 });
    });
    requestAnimationFrame(loop);
  }

  function loop(now) {
    effectAnims.forEach((a) => {
      const interval = a.fps > 0 ? 1000 / a.fps : 1e9;
      const elapsed = now - a.last;
      if (elapsed >= interval) {
        a.frame = (a.frame + Math.max(1, Math.floor(elapsed / interval))) % a.frameCount;
        a.last = now;
      }
      const col = a.frame % a.cols;
      const row = Math.floor(a.frame / a.cols);
      const scale = Math.min(140 / a.fw, 140 / a.fh, 8);
      const dw = a.fw * scale, dh = a.fh * scale;
      a.ctx.clearRect(0, 0, 160, 160);
      a.ctx.drawImage(a.img, col * a.fw, row * a.fh, a.fw, a.fh, (160 - dw) / 2, (160 - dh) / 2, dw, dh);
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
})();
</script>
</body>
</html>`;
}

const party = await collectStrips(partyDir, "public/assets/party", PARTY_STATE_ORDER);
const enemies = await collectStrips(enemiesDir, "public/assets/enemies", ENEMY_STATE_ORDER);
const effects = await collectEffects();
await writeFile(outFile, renderHtml(party, enemies, effects), "utf-8");
const invalidEffects = effects.filter((e) => !e.valid).length;
console.log(
  `Wrote ${outFile} with ${party.length} party classes, ${enemies.length} enemy sets, ${effects.length} effect strips` +
    (invalidEffects ? ` (${invalidEffects} invalid/missing)` : "") +
    "."
);
