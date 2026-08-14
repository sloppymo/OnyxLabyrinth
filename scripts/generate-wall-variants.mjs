// Sibling wall-tile variants for F01/F03/F04/F05 (Pipeline A), generated per
// docs/art/WALL-TILE-INVENTORY.md's priority queue (§1a-1d). This is a
// standalone companion to scripts/generate-floor-tilesets.mjs — it
// duplicates that script's minimal PNG encoder and drawing helpers verbatim
// (rather than importing it) because generate-floor-tilesets.mjs runs its
// full 25-file generation as an import-time side effect and has no exports.
//
// Each variant is a new function with its own mulberry32 seed block (never
// reusing the base wall's seeds), writing to a NEW filename in src/assets/.
// The shipped base files (f1_wall_256.png, f3_wall_256.png, f4_wall_256.png,
// f5_wall_256.png) are never touched.
//
// Usage: node scripts/generate-wall-variants.mjs

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets");
const L = 128;

// --- Minimal PNG encoder (verbatim from generate-floor-tilesets.mjs) -------

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    rgb.copy(raw, y * (1 + size * 3) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing helpers (verbatim from generate-floor-tilesets.mjs) -----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const shade = (c, f) => [
  Math.max(0, Math.min(255, Math.round(c[0] * f))),
  Math.max(0, Math.min(255, Math.round(c[1] * f))),
  Math.max(0, Math.min(255, Math.round(c[2] * f))),
];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const dither = (x, y) => BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16;

class Px {
  constructor() {
    this.d = new Uint8Array(L * L * 3);
  }
  idx(x, y) {
    x = ((x % L) + L) % L;
    y = ((y % L) + L) % L;
    return (y * L + x) * 3;
  }
  set(x, y, c) {
    const i = this.idx(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
  }
  get(x, y) {
    const i = this.idx(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  blend(x, y, c, t) {
    this.set(x, y, mix(this.get(x, y), c, t));
  }
  fill(c) {
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) this.set(x, y, c);
  }
  rect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  save(name) {
    const out = Buffer.alloc(L * 2 * L * 2 * 3);
    for (let y = 0; y < L * 2; y++) {
      for (let x = 0; x < L * 2; x++) {
        const i = this.idx(x >> 1, y >> 1);
        const o = (y * L * 2 + x) * 3;
        out[o] = this.d[i];
        out[o + 1] = this.d[i + 1];
        out[o + 2] = this.d[i + 2];
      }
    }
    writeFileSync(join(OUT_DIR, name), encodePNG(L * 2, out));
    console.log("wrote", name);
  }
}

function makeNoise(period, rng) {
  const g = new Float64Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (cx, cy) => g[(((cy % period) + period) % period) * period + (((cx % period) + period) % period)];
  return (x, y) => {
    const fx = (((x / L) * period) % period + period) % period;
    const fy = (((y / L) * period) % period + period) % period;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let tx = fx - cx;
    let ty = fy - cy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = at(cx, cy) + (at(cx + 1, cy) - at(cx, cy)) * tx;
    const b = at(cx, cy + 1) + (at(cx + 1, cy + 1) - at(cx, cy + 1)) * tx;
    return a + (b - a) * ty;
  };
}
function makeFbm(rng, periods = [4, 8, 16, 32]) {
  const layers = periods.map((p) => makeNoise(p, rng));
  return (x, y) => {
    let v = 0;
    let amp = 1;
    let tot = 0;
    for (const n of layers) {
      v += n(x, y) * amp;
      tot += amp;
      amp *= 0.55;
    }
    return v / tot;
  };
}

function crackWalk(rng, x, y, steps, dirBias, plot) {
  let dx = dirBias[0];
  let dy = dirBias[1];
  for (let i = 0; i < steps; i++) {
    plot(Math.round(x), Math.round(y));
    if (rng() < 0.4) {
      const turn = (rng() - 0.5) * 1.6;
      const nx = dx - dy * turn;
      const ny = dy + dx * turn;
      const len = Math.hypot(nx, ny) || 1;
      dx = nx / len;
      dy = ny / len;
      dx = dx * 0.7 + dirBias[0] * 0.3;
      dy = dy * 0.7 + dirBias[1] * 0.3;
    }
    x += dx;
    y += dy;
  }
}

function courses(x, y, rowH, blockW) {
  const row = Math.floor(y / rowH);
  const off = (row % 2) * (blockW / 2);
  const col = Math.floor((((x + off) % L) + L) % L / blockW);
  const lx = ((((x + off) % L) + L) % L) % blockW;
  const ly = y % rowH;
  return { row, col, lx, ly };
}

// ===========================================================================
// F01 — f1 green-gray masonry variants
// Base palette/mortar match src/assets/f1_wall_256.png (f1Wall(), seeds 101-104).
// ===========================================================================

const F1_STONES = [hex("#5b6354"), hex("#525a4c"), hex("#4a5245"), hex("#565f4e")];
const F1_MOSSES = [hex("#4d6b3a"), hex("#405c2f"), hex("#5a7d46")];
const F1_MORTAR = hex("#2a2f24");

// A — alt block layout: same palette, different brick rhythm (28x14 courses
// instead of 32x16).
function f1WallVariantA() {
  const rng = mulberry32(111);
  const px = new Px();
  const mottle = makeFbm(mulberry32(112));
  const mossN = makeFbm(mulberry32(113), [4, 8, 16]);
  const rowH = 14;
  const blockW = 28;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F1_STONES[Math.floor(rng() * F1_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F1_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.92, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.18);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      else if (lx === 1) c = shade(c, 1.08);
      else if (lx === blockW - 1) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { ly } = courses(x, y, rowH, blockW);
      const nearSeam = Math.min(ly, rowH - ly) / rowH;
      const m = mossN(x, y) - nearSeam * 0.55;
      if (m > 0.52 + dither(x, y) * 0.08) {
        const g = F1_MOSSES[Math.floor(mossN(x + 37, y + 61) * F1_MOSSES.length) % F1_MOSSES.length];
        px.set(x, y, mix(px.get(x, y), g, 0.85));
      }
    }
  }
  const crackRng = mulberry32(114);
  for (let i = 0; i < 9; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 8 + Math.floor(crackRng() * 8), [0.2, 1], (x, y) =>
      px.blend(x, y, hex("#232820"), 0.8)
    );
  }
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * (L / 2)) * 2;
    const len = 10 + Math.floor(crackRng() * 18);
    for (let y = sy; y < sy + len; y++) {
      px.blend(sx, y, hex("#2e3830"), 0.35);
      if (crackRng() < 0.4) px.blend(sx + 1, y, hex("#2e3830"), 0.2);
    }
  }
  px.save("f1_wall_b_256.png");
}

// B — light-crack: fewer, fainter cracks and damp streaks than the shipped
// base (9 cracks / 6 streaks); moss stays at base density.
function f1WallVariantB() {
  const rng = mulberry32(121);
  const px = new Px();
  const mottle = makeFbm(mulberry32(122));
  const mossN = makeFbm(mulberry32(123), [4, 8, 16]);
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F1_STONES[Math.floor(rng() * F1_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F1_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.92, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.18);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      else if (lx === 1) c = shade(c, 1.08);
      else if (lx === blockW - 1) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { ly } = courses(x, y, rowH, blockW);
      const nearSeam = Math.min(ly, rowH - ly) / rowH;
      const m = mossN(x, y) - nearSeam * 0.55;
      if (m > 0.52 + dither(x, y) * 0.08) {
        const g = F1_MOSSES[Math.floor(mossN(x + 37, y + 61) * F1_MOSSES.length) % F1_MOSSES.length];
        px.set(x, y, mix(px.get(x, y), g, 0.85));
      }
    }
  }
  // fewer, shorter, fainter cracks (4 vs 9; blend 0.45 vs 0.8)
  const crackRng = mulberry32(124);
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 5 + Math.floor(crackRng() * 5), [0.2, 1], (x, y) =>
      px.blend(x, y, hex("#232820"), 0.45)
    );
  }
  // fewer, fainter damp streaks (2 vs 6)
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * (L / 2)) * 2;
    const len = 8 + Math.floor(crackRng() * 12);
    for (let y = sy; y < sy + len; y++) {
      px.blend(sx, y, hex("#2e3830"), 0.2);
    }
  }
  px.save("f1_wall_c_256.png");
}

// C — sparse-moss: drier read, moss threshold raised so far fewer patches
// show; damp streaks reduced too. Cracks stay at base density.
function f1WallVariantC() {
  const rng = mulberry32(131);
  const px = new Px();
  const mottle = makeFbm(mulberry32(132));
  const mossN = makeFbm(mulberry32(133), [4, 8, 16]);
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F1_STONES[Math.floor(rng() * F1_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F1_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.92, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.18);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      else if (lx === 1) c = shade(c, 1.08);
      else if (lx === blockW - 1) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  // moss threshold raised 0.52 -> 0.72: reads drier, patches only in the
  // dampest pockets
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { ly } = courses(x, y, rowH, blockW);
      const nearSeam = Math.min(ly, rowH - ly) / rowH;
      const m = mossN(x, y) - nearSeam * 0.55;
      if (m > 0.72 + dither(x, y) * 0.08) {
        const g = F1_MOSSES[Math.floor(mossN(x + 37, y + 61) * F1_MOSSES.length) % F1_MOSSES.length];
        px.set(x, y, mix(px.get(x, y), g, 0.85));
      }
    }
  }
  const crackRng = mulberry32(134);
  for (let i = 0; i < 9; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 8 + Math.floor(crackRng() * 8), [0.2, 1], (x, y) =>
      px.blend(x, y, hex("#232820"), 0.8)
    );
  }
  // damp streaks reduced 6 -> 2 (drier overall)
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * (L / 2)) * 2;
    const len = 10 + Math.floor(crackRng() * 18);
    for (let y = sy; y < sy + len; y++) {
      px.blend(sx, y, hex("#2e3830"), 0.35);
      if (crackRng() < 0.4) px.blend(sx + 1, y, hex("#2e3830"), 0.2);
    }
  }
  px.save("f1_wall_d_256.png");
}

// D — clean: freshly-built read, no moss / no cracks / no damp streaks at all.
function f1WallVariantD() {
  const rng = mulberry32(141);
  const px = new Px();
  const mottle = makeFbm(mulberry32(142));
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F1_STONES[Math.floor(rng() * F1_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F1_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.92, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.18);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      else if (lx === 1) c = shade(c, 1.08);
      else if (lx === blockW - 1) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  px.save("f1_wall_e_256.png");
}

// ===========================================================================
// F03 — f3 ember masonry variants
// Base palette/mortar/ember colors match src/assets/f3_wall_256.png
// (f3Wall(), seeds 301-303).
// ===========================================================================

const F3_STONES = [hex("#463e38"), hex("#3e3833"), hex("#37312c"), hex("#423a33")];
const F3_MORTAR = hex("#1d1815");
const F3_EMBER_CORE = hex("#ffb347");
const F3_EMBER_MID = hex("#e2703a");
const F3_EMBER_DIM = hex("#8a3a1c");
const F3_IRON = hex("#3b3f46");
const F3_IRON_LIGHT = hex("#585f6a");
const F3_IRON_DARK = hex("#22252a");

function f3RivetedBand(px, mottle) {
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = F3_IRON;
        if (y === y0) c = F3_IRON_LIGHT;
        if (y === y0 + 5) c = F3_IRON_DARK;
        if (mottle(x * 2, y * 2) > 0.66) c = shade(c, 0.85);
        px.set(x, y, c);
      }
    }
    for (let x = 6; x < L; x += 16) {
      px.set(x, y0 + 2, F3_IRON_LIGHT);
      px.set(x + 1, y0 + 2, F3_IRON_DARK);
      px.set(x, y0 + 3, F3_IRON_DARK);
    }
  }
}

// B — heavier soot: scorch threshold lowered so far more blocks darken, and
// the darken factor itself is stronger.
function f3WallVariantB() {
  const rng = mulberry32(311);
  const px = new Px();
  const mottle = makeFbm(mulberry32(312));
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F3_STONES[Math.floor(rng() * F3_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F3_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.15);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // heavier soot: threshold 0.6 -> 0.4, darken factor 0.82 -> 0.7
      if (mottle(x + 71, y + 23) > 0.4) c = shade(c, 0.7);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(313);
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 10), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.3 ? F3_EMBER_CORE : F3_EMBER_MID);
      px.blend(x + 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x - 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x, y + 1, F3_EMBER_DIM, 0.35);
      px.blend(x, y - 1, F3_EMBER_DIM, 0.35);
    });
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F3_EMBER_MID : F3_EMBER_DIM);
  }
  f3RivetedBand(px, mottle);
  px.save("f3_wall_b_256.png");
}

// C — repaired-masonry patch: two adjacent blocks swapped for a distinctly
// lighter/newer stone color, still shaded by the same mottle/bevel pass so
// they don't read as flat.
function f3WallVariantC() {
  const rng = mulberry32(321);
  const px = new Px();
  const mottle = makeFbm(mulberry32(322));
  const rowH = 16;
  const blockW = 32;
  const patchStone = hex("#8a7c68"); // sandy new-cut stone, distinct from soot palette
  const patchKeys = new Set(["2,1", "2,2"]);

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) {
        blockTone.set(key, patchKeys.has(key) ? patchStone : F3_STONES[Math.floor(rng() * F3_STONES.length)]);
      }
      if (ly === 0 || lx === 0) {
        px.set(x, y, F3_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.15);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // patched blocks are freshly cut — no scorch
      if (!patchKeys.has(key) && mottle(x + 71, y + 23) > 0.6) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(323);
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 10), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.3 ? F3_EMBER_CORE : F3_EMBER_MID);
      px.blend(x + 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x - 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x, y + 1, F3_EMBER_DIM, 0.35);
      px.blend(x, y - 1, F3_EMBER_DIM, 0.35);
    });
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F3_EMBER_MID : F3_EMBER_DIM);
  }
  f3RivetedBand(px, mottle);
  px.save("f3_wall_c_256.png");
}

// D — alt block arrangement: different brick rhythm (24x20 courses), same
// ember-crack and riveted-band treatment.
function f3WallVariantD() {
  const rng = mulberry32(331);
  const px = new Px();
  const mottle = makeFbm(mulberry32(332));
  const rowH = 20;
  const blockW = 24;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F3_STONES[Math.floor(rng() * F3_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F3_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.15);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      if (mottle(x + 71, y + 23) > 0.6) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(333);
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 10), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.3 ? F3_EMBER_CORE : F3_EMBER_MID);
      px.blend(x + 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x - 1, y, F3_EMBER_DIM, 0.55);
      px.blend(x, y + 1, F3_EMBER_DIM, 0.35);
      px.blend(x, y - 1, F3_EMBER_DIM, 0.35);
    });
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F3_EMBER_MID : F3_EMBER_DIM);
  }
  f3RivetedBand(px, mottle);
  px.save("f3_wall_d_256.png");
}

// ===========================================================================
// F04 — f4 null-choir masonry variants
// Base palette/frieze colors match src/assets/f4_wall_256.png (f4Wall(),
// seeds 401-404).
// ===========================================================================

const F4_STONES = [hex("#5a5666"), hex("#524e5e"), hex("#4a4757"), hex("#565064")];
const F4_MORTAR = hex("#2a2733");
const F4_RUNE_CORE = hex("#e8e6f2");
const F4_RUNE_MID = hex("#a9a4c9");
const F4_RUNE_DIM = hex("#5f5a80");
const F4_BAND = hex("#6e6a80");
const F4_BAND_HI = hex("#8f8ba6");
const F4_BAND_SHADOW = hex("#3a3748");

function f4StoneBase(px, rng, mottle, rowH, blockW) {
  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F4_STONES[Math.floor(rng() * F4_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F4_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.88, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.14);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      if (mottle(x + 53, y + 37) > 0.64) c = shade(c, 0.86);
      px.set(x, y, c);
    }
  }
}

// B — additional carved-sigil placement: more rune veins and motes than the
// shipped base (6 veins/22 motes -> 10/32), same silhouette otherwise.
function f4WallVariantB() {
  const rng = mulberry32(411);
  const px = new Px();
  const mottle = makeFbm(mulberry32(412));
  const rowH = 16;
  const blockW = 32;
  f4StoneBase(px, rng, mottle, rowH, blockW);

  const crackRng = mulberry32(413);
  for (let i = 0; i < 10; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F4_RUNE_CORE : F4_RUNE_MID);
      px.blend(x + 1, y, F4_RUNE_DIM, 0.55);
      px.blend(x - 1, y, F4_RUNE_DIM, 0.55);
      px.blend(x, y + 1, F4_RUNE_DIM, 0.35);
      px.blend(x, y - 1, F4_RUNE_DIM, 0.35);
    });
  }
  for (let i = 0; i < 32; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F4_RUNE_MID : F4_RUNE_DIM);
  }
  const glyphRng = mulberry32(414);
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = F4_BAND;
        if (y === y0) c = F4_BAND_HI;
        if (y === y0 + 5) c = F4_BAND_SHADOW;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88);
        px.set(x, y, c);
      }
    }
    for (let x = 5; x < L - 4; x += 16) {
      const tall = glyphRng() < 0.5;
      px.set(x, y0 + 1, F4_BAND_SHADOW);
      px.set(x, y0 + 2, F4_BAND_SHADOW);
      px.set(x, y0 + 3, tall ? F4_BAND_SHADOW : F4_BAND_HI);
      px.set(x + 2, y0 + 2, F4_BAND_SHADOW);
      px.set(x + 2, y0 + 3, F4_BAND_SHADOW);
      if (glyphRng() < 0.6) px.set(x + 1, y0 + 2, F4_RUNE_DIM);
      if (glyphRng() < 0.35) px.set(x + 3, y0 + 1, F4_BAND_SHADOW);
    }
  }
  px.save("f4_wall_b_256.png");
}

// C — deeper crack variant: longer crackWalk steps and stronger blend depth
// on the rune veins.
function f4WallVariantC() {
  const rng = mulberry32(421);
  const px = new Px();
  const mottle = makeFbm(mulberry32(422));
  const rowH = 16;
  const blockW = 32;
  f4StoneBase(px, rng, mottle, rowH, blockW);

  const crackRng = mulberry32(423);
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 18 + Math.floor(crackRng() * 14), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.4 ? F4_RUNE_CORE : F4_RUNE_MID);
      px.blend(x + 1, y, F4_RUNE_DIM, 0.7);
      px.blend(x - 1, y, F4_RUNE_DIM, 0.7);
      px.blend(x, y + 1, F4_RUNE_DIM, 0.5);
      px.blend(x, y - 1, F4_RUNE_DIM, 0.5);
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F4_RUNE_MID : F4_RUNE_DIM);
  }
  const glyphRng = mulberry32(424);
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = F4_BAND;
        if (y === y0) c = F4_BAND_HI;
        if (y === y0 + 5) c = F4_BAND_SHADOW;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88);
        px.set(x, y, c);
      }
    }
    for (let x = 5; x < L - 4; x += 16) {
      const tall = glyphRng() < 0.5;
      px.set(x, y0 + 1, F4_BAND_SHADOW);
      px.set(x, y0 + 2, F4_BAND_SHADOW);
      px.set(x, y0 + 3, tall ? F4_BAND_SHADOW : F4_BAND_HI);
      px.set(x + 2, y0 + 2, F4_BAND_SHADOW);
      px.set(x + 2, y0 + 3, F4_BAND_SHADOW);
      if (glyphRng() < 0.6) px.set(x + 1, y0 + 2, F4_RUNE_DIM);
      if (glyphRng() < 0.35) px.set(x + 3, y0 + 1, F4_BAND_SHADOW);
    }
  }
  px.save("f4_wall_c_256.png");
}

// D — band-divergent: drops the shared horizontal riveted-trim-band
// silhouette (common to f3/f4/f5) in favor of two vertical carved pilaster
// columns, so this sibling doesn't read as an f3/f5 reskin at a glance.
function f4WallVariantD() {
  const rng = mulberry32(431);
  const px = new Px();
  const mottle = makeFbm(mulberry32(432));
  const rowH = 16;
  const blockW = 32;
  f4StoneBase(px, rng, mottle, rowH, blockW);

  const crackRng = mulberry32(433);
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F4_RUNE_CORE : F4_RUNE_MID);
      px.blend(x + 1, y, F4_RUNE_DIM, 0.55);
      px.blend(x - 1, y, F4_RUNE_DIM, 0.55);
      px.blend(x, y + 1, F4_RUNE_DIM, 0.35);
      px.blend(x, y - 1, F4_RUNE_DIM, 0.35);
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F4_RUNE_MID : F4_RUNE_DIM);
  }
  // vertical pilaster columns instead of the horizontal frieze band
  const glyphRng = mulberry32(434);
  for (const x0 of [30, 98]) {
    for (let x = x0; x < x0 + 6; x++) {
      for (let y = 0; y < L; y++) {
        let c = F4_BAND;
        if (x === x0) c = F4_BAND_HI;
        if (x === x0 + 5) c = F4_BAND_SHADOW;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88);
        px.set(x, y, c);
      }
    }
    for (let y = 5; y < L - 4; y += 16) {
      const tall = glyphRng() < 0.5;
      px.set(x0 + 1, y, F4_BAND_SHADOW);
      px.set(x0 + 2, y, F4_BAND_SHADOW);
      px.set(x0 + 3, y, tall ? F4_BAND_SHADOW : F4_BAND_HI);
      px.set(x0 + 2, y + 2, F4_BAND_SHADOW);
      px.set(x0 + 3, y + 2, F4_BAND_SHADOW);
      if (glyphRng() < 0.6) px.set(x0 + 2, y + 1, F4_RUNE_DIM);
      if (glyphRng() < 0.35) px.set(x0 + 1, y + 3, F4_BAND_SHADOW);
    }
  }
  px.save("f4_wall_d_256.png");
}

// ===========================================================================
// F05 — f5 weeping-cistern masonry variants
// Base palette/glow colors match src/assets/f5_wall_256.png (f5Wall(), seeds
// 501-504).
// ===========================================================================

const F5_STONES = [hex("#33454a"), hex("#2c3d42"), hex("#26363a"), hex("#304248")];
const F5_MORTAR = hex("#141d20");
const F5_GLOW_CORE = hex("#baf7e8");
const F5_GLOW_MID = hex("#5fd6bd");
const F5_GLOW_DIM = hex("#215048");
const F5_BAND = hex("#233c40");
const F5_BAND_HI = hex("#3f5f63");
const F5_BAND_SHADOW = hex("#0f1a1c");

function f5RivetedBand(px, mottle, rippleRng) {
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = F5_BAND;
        if (y === y0) c = F5_BAND_HI;
        if (y === y0 + 5) c = F5_BAND_SHADOW;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88);
        px.set(x, y, c);
      }
    }
    for (let x = 5; x < L - 4; x += 16) {
      px.set(x, y0 + 2, F5_GLOW_DIM);
      px.set(x + 1, y0 + 3, rippleRng() < 0.5 ? F5_GLOW_MID : F5_BAND_SHADOW);
      px.set(x + 2, y0 + 2, F5_GLOW_DIM);
      if (rippleRng() < 0.4) px.set(x + 3, y0 + 1, F5_BAND_SHADOW);
    }
  }
}

// B — mostly-clean wet stone: weeping-stain threshold raised (fewer stains)
// and glow veins/motes thinned out.
function f5WallVariantB() {
  const rng = mulberry32(511);
  const px = new Px();
  const mottle = makeFbm(mulberry32(512));
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F5_STONES[Math.floor(rng() * F5_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F5_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.16);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // fewer stains: threshold 0.62 -> 0.82
      if (mottle(x + 21, y + 71) > 0.82) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(513);
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.2, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F5_GLOW_CORE : F5_GLOW_MID);
      px.blend(x + 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x - 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x, y + 1, F5_GLOW_DIM, 0.4);
      px.blend(x, y - 1, F5_GLOW_DIM, 0.3);
    });
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F5_GLOW_MID : F5_GLOW_DIM);
  }
  const rippleRng = mulberry32(514);
  f5RivetedBand(px, mottle, rippleRng);
  px.save("f5_wall_b_256.png");
}

// C — low water-staining, opposite direction: stains sourced from a
// negated noise offset (reads as rising damp rather than weeping-down),
// still restrained.
function f5WallVariantC() {
  const rng = mulberry32(521);
  const px = new Px();
  const mottle = makeFbm(mulberry32(522));
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F5_STONES[Math.floor(rng() * F5_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F5_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.16);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // opposite-direction stain source, kept low-key (threshold 0.66)
      if (mottle(x - 21, y - 71) > 0.66) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(523);
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.2, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F5_GLOW_CORE : F5_GLOW_MID);
      px.blend(x + 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x - 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x, y + 1, F5_GLOW_DIM, 0.4);
      px.blend(x, y - 1, F5_GLOW_DIM, 0.3);
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F5_GLOW_MID : F5_GLOW_DIM);
  }
  const rippleRng = mulberry32(524);
  f5RivetedBand(px, mottle, rippleRng);
  px.save("f5_wall_c_256.png");
}

// D — sparse algae: teal-green algae patches along mortar lines (aquatic,
// not f1's olive moss), modeled on f1's moss pass but sparser and cooler.
function f5WallVariantD() {
  const rng = mulberry32(531);
  const px = new Px();
  const mottle = makeFbm(mulberry32(532));
  const algaeN = makeFbm(mulberry32(533), [4, 8, 16]);
  const rowH = 16;
  const blockW = 32;
  const algae = [hex("#3f7a63"), hex("#2f6350"), hex("#4a8f72")];

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F5_STONES[Math.floor(rng() * F5_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F5_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.16);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      if (mottle(x + 21, y + 71) > 0.62) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  // sparse algae along mortar seams (threshold 0.66: sparser than f1's moss)
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { ly } = courses(x, y, rowH, blockW);
      const nearSeam = Math.min(ly, rowH - ly) / rowH;
      const a = algaeN(x, y) - nearSeam * 0.55;
      if (a > 0.66 + dither(x, y) * 0.08) {
        const g = algae[Math.floor(algaeN(x + 37, y + 61) * algae.length) % algae.length];
        px.set(x, y, mix(px.get(x, y), g, 0.75));
      }
    }
  }
  const crackRng = mulberry32(534);
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.2, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F5_GLOW_CORE : F5_GLOW_MID);
      px.blend(x + 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x - 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x, y + 1, F5_GLOW_DIM, 0.4);
      px.blend(x, y - 1, F5_GLOW_DIM, 0.3);
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F5_GLOW_MID : F5_GLOW_DIM);
  }
  const rippleRng = mulberry32(535);
  f5RivetedBand(px, mottle, rippleRng);
  px.save("f5_wall_d_256.png");
}

// E — alt stone pattern: different brick rhythm (28x18 courses), same
// weeping-stain / glow-vein / band treatment.
function f5WallVariantE() {
  const rng = mulberry32(541);
  const px = new Px();
  const mottle = makeFbm(mulberry32(542));
  const rowH = 18;
  const blockW = 28;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, F5_STONES[Math.floor(rng() * F5_STONES.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, F5_MORTAR);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.16);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      if (mottle(x + 21, y + 71) > 0.62) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  const crackRng = mulberry32(543);
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.2, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? F5_GLOW_CORE : F5_GLOW_MID);
      px.blend(x + 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x - 1, y, F5_GLOW_DIM, 0.55);
      px.blend(x, y + 1, F5_GLOW_DIM, 0.4);
      px.blend(x, y - 1, F5_GLOW_DIM, 0.3);
    });
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? F5_GLOW_MID : F5_GLOW_DIM);
  }
  const rippleRng = mulberry32(544);
  f5RivetedBand(px, mottle, rippleRng);
  px.save("f5_wall_e_256.png");
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

f1WallVariantA();
f1WallVariantB();
f1WallVariantC();
f1WallVariantD();

f3WallVariantB();
f3WallVariantC();
f3WallVariantD();

f4WallVariantB();
f4WallVariantC();
f4WallVariantD();

f5WallVariantB();
f5WallVariantC();
f5WallVariantD();
f5WallVariantE();
