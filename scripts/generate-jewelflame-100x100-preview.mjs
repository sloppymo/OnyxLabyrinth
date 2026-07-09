#!/usr/bin/env node
/**
 * Generates a standalone preview of every 100x100 side-view character strip in
 * assets/Characters(100x100)/.
 * Run with:
 *   node scripts/generate-jewelflame-100x100-preview.mjs
 * Then open jewelflame-100x100-preview.html in a browser.
 */
import { readdir, stat } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(process.cwd());
const charsRoot = join(root, "assets/Characters(100x100)");
const outFile = join(root, "jewelflame-100x100-preview.html");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const STATE_ORDER = ["Idle", "Walk", "Block", "Attack01", "Attack02", "Attack03", "Hurt", "Death", "DEATH"];

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
          state,
          src: encodeURI(`./assets/Characters(100x100)/${name}/${name}/${f}`),
          width,
          height,
          frameCount,
          valid,
          fileSize: (await stat(file)).size,
        });
      }
      states.sort((a, b) => {
        const ai = STATE_ORDER.indexOf(a.state);
        const bi = STATE_ORDER.indexOf(b.state);
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

function renderHtml(characters) {
  const cards = characters
    .map(
      (c) => `
<div class="character">
<h2>${c.name}</h2>
<div class="states">
${c.states
  .map(
    (s) => `
<div class="state ${s.valid ? "" : "bad"}">
<canvas id="c-${c.name.replace(/\s/g, "_")}-${s.state.replace(/\s/g, "_")}" width="240" height="240"></canvas>
<img class="strip" id="i-${c.name.replace(/\s/g, "_")}-${s.state.replace(/\s/g, "_")}" src="${s.src}" style="display:none;" />
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
<title>Jewelflame · Characters(100x100) Strip Preview</title>
<style>
body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #0e0d0a; color: #d0c0a0; margin: 0; padding: 1rem; }
h1 { text-align: center; margin-bottom: 0.5rem; }
.hint { text-align: center; color: #a09070; margin-bottom: 1.5rem; }
.character { margin-bottom: 2rem; border-bottom: 1px solid #3a3025; padding-bottom: 1.5rem; }
.character h2 { margin: 0 0 0.75rem; color: #f0d080; }
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
<h1>Characters(100x100) Strip Preview</h1>
<div class="hint">Pixel-art strips are drawn at 240×240. All states loop automatically.</div>
${cards}
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
      const frameCount = Math.floor(img.naturalWidth / 100) || 1;
      const fps = id.endsWith('Idle') || id.endsWith('Walk') ? 6 : 8;
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
        const sx = a.frame * 100, sy = 0, sw = 100, sh = 100;
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

const characters = await collectCharacters();
writeFileSync(outFile, renderHtml(characters), "utf-8");
console.log(`Wrote ${outFile} with ${characters.length} characters.`);
