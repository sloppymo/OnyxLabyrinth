#!/usr/bin/env node
/**
 * Generates a contact-sheet gallery for live corridor tilesets (floors 1–5).
 *
 * Inspects every slot the renderer imports from src/assets/:
 *   wall, ceiling, floor_a, floor_b, door
 *
 * Run:
 *   npm run tileset:gallery
 *   # or: node scripts/generate-tileset-gallery.mjs
 * Then open tileset-gallery.html (file:// or `python3 -m http.server` from repo root).
 *
 * Does NOT regenerate tileset art — only reads existing PNGs.
 */
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { pngSize } from "./jewelflame-creature-utils.mjs";

const root = resolve(process.cwd());
const assetsDir = join(root, "src", "assets");
const outFile = join(root, "tileset-gallery.html");

const FLOORS = [1, 2, 3, 4, 5];
const SLOTS = [
  { id: "wall", label: "wall" },
  { id: "ceiling", label: "ceiling" },
  { id: "floor_a", label: "floor_a" },
  { id: "floor_b", label: "floor_b" },
  { id: "door", label: "door" },
];

function slotPath(floor, slotId) {
  return join(assetsDir, `f${floor}_${slotId}_256.png`);
}

function relSrc(floor, slotId) {
  return `./src/assets/f${floor}_${slotId}_256.png`;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function inspectSlot(floor, slot) {
  const abs = slotPath(floor, slot.id);
  if (!existsSync(abs)) {
    return {
      floor,
      slot: slot.id,
      label: slot.label,
      present: false,
      src: null,
      width: null,
      height: null,
      bytes: null,
      abs,
    };
  }
  const { width, height } = pngSize(abs);
  const bytes = statSync(abs).size;
  return {
    floor,
    slot: slot.id,
    label: slot.label,
    present: true,
    src: relSrc(floor, slot.id),
    width,
    height,
    bytes,
    abs,
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tileCard(info, { size = 96, tiled = false, tileN = 3 } = {}) {
  const missing = !info.present;
  const meta = missing
    ? "missing"
    : `${info.width}×${info.height} · ${formatBytes(info.bytes)}`;
  const body = missing
    ? `<div class="placeholder" style="width:${size}px;height:${size}px">missing</div>`
    : tiled
      ? `<div class="tiled" style="--n:${tileN};--cell:${Math.floor(size / tileN)}px;width:${size}px;height:${size}px;background-image:url('${esc(info.src)}')"></div>`
      : `<img src="${esc(info.src)}" width="${size}" height="${size}" alt="f${info.floor} ${esc(info.label)}" loading="lazy" decoding="async" />`;

  return `<figure class="card${missing ? " missing" : ""}" data-floor="${info.floor}" data-slot="${esc(info.slot)}">
  ${body}
  <figcaption><span class="slot">${esc(info.label)}</span><span class="meta">${esc(meta)}</span></figcaption>
</figure>`;
}

function overviewCell(info) {
  const missing = !info.present;
  const body = missing
    ? `<div class="placeholder sm">—</div>`
    : `<img src="${esc(info.src)}" width="64" height="64" alt="f${info.floor} ${esc(info.label)}" loading="lazy" decoding="async" />`;
  return `<td class="${missing ? "missing" : ""}">${body}</td>`;
}

function buildHtml(inventory) {
  const byFloor = new Map();
  for (const floor of FLOORS) {
    byFloor.set(
      floor,
      SLOTS.map((slot) => inventory.find((i) => i.floor === floor && i.slot === slot.id))
    );
  }

  const present = inventory.filter((i) => i.present).length;
  const missing = inventory.length - present;

  const overviewRows = FLOORS.map((floor) => {
    const cells = byFloor.get(floor).map(overviewCell).join("");
    return `<tr><th scope="row"><a href="#floor-${floor}">F${floor}</a></th>${cells}</tr>`;
  }).join("\n");

  const overviewHead = SLOTS.map((s) => `<th>${esc(s.label)}</th>`).join("");

  const floorSections = FLOORS.map((floor) => {
    const infos = byFloor.get(floor);
    const singles = infos.map((i) => tileCard(i, { size: 192 })).join("\n");
    const tiled = infos
      .map((i) => tileCard(i, { size: 192, tiled: true, tileN: 3 }))
      .join("\n");
    const floorA = infos.find((i) => i.slot === "floor_a");
    const floorB = infos.find((i) => i.slot === "floor_b");
    const checker =
      floorA?.present && floorB?.present
        ? `<div class="checker" style="--a:url('${esc(floorA.src)}');--b:url('${esc(floorB.src)}')" title="floor_a / floor_b alternating 2×2"></div>
           <p class="note">Checker preview: floor_a + floor_b alternating (how the corridor floor reads).</p>`
        : `<p class="note warn">Checker preview skipped — floor_a or floor_b missing.</p>`;

    return `<section class="floor" id="floor-${floor}">
  <h2>Floor ${floor}</h2>
  <h3>Singles (1×)</h3>
  <div class="grid">${singles}</div>
  <h3>Tiled repeat (3×3) — seam check</h3>
  <div class="grid">${tiled}</div>
  <h3>Floor checkerboard</h3>
  ${checker}
</section>`;
  }).join("\n");

  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OnyxLabyrinth — Corridor tileset gallery</title>
<style>
  :root {
    --bg: #12100e;
    --panel: #1a1714;
    --ink: #e8dfd0;
    --muted: #9a8f7e;
    --line: #3a3228;
    --accent: #c4a35a;
    --warn: #c47a5a;
    --ok: #7a9a6a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 14px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(ellipse at top, #1c1814 0%, var(--bg) 55%),
      var(--bg);
    color: var(--ink);
    padding: 24px 28px 64px;
  }
  h1 {
    font: 700 28px/1.2 "IBM Plex Serif", Georgia, serif;
    margin: 0 0 6px;
    letter-spacing: 0.02em;
  }
  .lede { color: var(--muted); max-width: 62ch; margin: 0 0 18px; }
  .stats {
    display: flex; gap: 16px; flex-wrap: wrap;
    margin: 0 0 22px; color: var(--muted); font-size: 13px;
  }
  .stats strong { color: var(--accent); font-weight: 600; }
  nav.toc {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin: 0 0 28px;
  }
  nav.toc a {
    color: var(--ink);
    text-decoration: none;
    border: 1px solid var(--line);
    padding: 4px 10px;
    background: var(--panel);
  }
  nav.toc a:hover { border-color: var(--accent); color: var(--accent); }
  h2 {
    font: 650 20px/1.2 "IBM Plex Serif", Georgia, serif;
    margin: 36px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--line);
    color: var(--accent);
  }
  h3 {
    font: 600 13px/1.2 inherit;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 18px 0 10px;
  }
  .overview {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .overview th, .overview td {
    border: 1px solid var(--line);
    padding: 8px;
    text-align: center;
    vertical-align: middle;
  }
  .overview th {
    color: var(--muted);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .overview th[scope="row"] a { color: var(--accent); text-decoration: none; }
  .overview img {
    display: block;
    margin: 0 auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    background: #0a0908;
  }
  .overview td.missing { background: #2a1814; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
  }
  .card {
    margin: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 10px;
  }
  .card.missing { border-color: var(--warn); }
  .card img, .tiled, .placeholder {
    display: block;
    margin: 0 auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    background: #0a0908;
  }
  .tiled {
    background-repeat: repeat;
    background-size: var(--cell) var(--cell);
  }
  .placeholder {
    display: grid;
    place-items: center;
    color: var(--warn);
    border: 1px dashed var(--warn);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .placeholder.sm { width: 64px; height: 64px; margin: 0 auto; font-size: 18px; }
  figcaption {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
  }
  .slot { color: var(--ink); font-weight: 600; }
  .meta { color: var(--muted); }
  .checker {
    width: 256px;
    height: 256px;
    border: 1px solid var(--line);
    background-color: #0a0908;
    background-image: var(--a), var(--b), var(--b), var(--a);
    background-size: 128px 128px;
    background-position: 0 0, 128px 0, 0 128px, 128px 128px;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
  .note { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
  .note.warn { color: var(--warn); }
  footer {
    margin-top: 48px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
  }
  code { color: var(--accent); }
</style>
</head>
<body>
<header>
  <h1>Corridor tileset gallery</h1>
  <p class="lede">
    Live renderer textures for campaign floors 1–5
    (<code>src/assets/fN_{wall,ceiling,floor_a,floor_b,door}_256.png</code>).
    Generated by <code>scripts/generate-tileset-gallery.mjs</code> — does not regenerate art.
  </p>
  <div class="stats">
    <span>Slots: <strong>${inventory.length}</strong></span>
    <span>Present: <strong>${present}</strong></span>
    <span>Missing: <strong>${missing}</strong></span>
    <span>Generated: <strong>${esc(generatedAt)}</strong></span>
  </div>
  <nav class="toc">
    <a href="#overview">Overview</a>
    ${FLOORS.map((f) => `<a href="#floor-${f}">Floor ${f}</a>`).join("")}
  </nav>
</header>

<section id="overview">
  <h2>Overview — all floors × slots</h2>
  <table class="overview">
    <thead>
      <tr><th></th>${overviewHead}</tr>
    </thead>
    <tbody>
${overviewRows}
    </tbody>
  </table>
</section>

${floorSections}

<footer>
  Open via <code>npm run tileset:gallery</code> then
  <code>file://${esc(outFile)}</code>
  (or serve the repo root with <code>python3 -m http.server</code>).
</footer>
</body>
</html>
`;
}

function main() {
  const inventory = [];
  for (const floor of FLOORS) {
    for (const slot of SLOTS) {
      inventory.push(inspectSlot(floor, slot));
    }
  }

  const html = buildHtml(inventory);
  writeFileSync(outFile, html, "utf8");

  const missing = inventory.filter((i) => !i.present);
  console.log(`Wrote ${outFile}`);
  console.log(`  ${inventory.filter((i) => i.present).length}/${inventory.length} textures present`);
  if (missing.length) {
    console.log("  Missing:");
    for (const m of missing) {
      console.log(`    - f${m.floor}_${m.slot}_256.png`);
    }
  }
  console.log(`  Open: ${pathToFileURL(outFile).href}`);
  console.log(`  Or:   python3 -m http.server 8080  →  http://127.0.0.1:8080/tileset-gallery.html`);
}

main();
