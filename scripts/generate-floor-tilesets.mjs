// Procedural 16-bit-style tileset generator for the three-floor campaign.
//
// Renders twelve seamless 256x256 PNGs into src/assets/ — wall / floorA /
// floorB / ceiling for each floor (f1 = The Flooded Crypt, f2 = The Cursed
// Library, f3 = The Forge of Ashes). Textures are drawn at a logical 128x128
// and upscaled 2x nearest-neighbor for a chunky pixel-art read.
//
// Everything is seeded and deterministic: re-running the script reproduces
// the exact same PNGs. Dev tooling only — not part of the build.
//
// Usage: node scripts/generate-floor-tilesets.mjs

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets");
const L = 128; // logical pixel-art size; output is L*2

// --- Minimal PNG encoder (RGB, 8-bit) --------------------------------------

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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + size * 3) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing helpers ---------------------------------------------------------

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

/** Torus-wrapped value noise: lattice of `period` cells, bilinear + smoothstep. */
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
/** Fractal sum of wrapped value noise, normalized ~0..1. */
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

/** Meandering crack walk; calls plot(x, y) per step (coordinates may wrap). */
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
      // keep the walk loosely following its bias direction
      dx = dx * 0.7 + dirBias[0] * 0.3;
      dy = dy * 0.7 + dirBias[1] * 0.3;
    }
    x += dx;
    y += dy;
  }
}

/** Staggered stone-course helper: block id + local coords for (x,y). */
function courses(x, y, rowH, blockW) {
  const row = Math.floor(y / rowH);
  const off = (row % 2) * (blockW / 2);
  const col = Math.floor((((x + off) % L) + L) % L / blockW);
  const lx = ((((x + off) % L) + L) % L) % blockW;
  const ly = y % rowH;
  return { row, col, lx, ly };
}

// ===========================================================================
// FLOOR 1 — THE FLOODED CRYPT: mossy grey-green stone, stagnant water.
// ===========================================================================

function f1Wall() {
  const rng = mulberry32(101);
  const px = new Px();
  const mottle = makeFbm(mulberry32(102));
  const mossN = makeFbm(mulberry32(103), [4, 8, 16]);
  const stones = [hex("#5b6354"), hex("#525a4c"), hex("#4a5245"), hex("#565f4e")];
  const mosses = [hex("#4d6b3a"), hex("#405c2f"), hex("#5a7d46")];
  const mortar = hex("#2a2f24");
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, stones[Math.floor(rng() * stones.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, mortar);
        continue;
      }
      let c = blockTone.get(key);
      // quantized mottle with ordered dither
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.92, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      // bevel: top-lit blocks
      if (ly === 1) c = shade(c, 1.18);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      else if (lx === 1) c = shade(c, 1.08);
      else if (lx === blockW - 1) c = shade(c, 0.88);
      px.set(x, y, c);
    }
  }
  // moss creeping from mortar lines (denser toward block bottoms)
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { ly } = courses(x, y, rowH, blockW);
      const nearSeam = Math.min(ly, rowH - ly) / rowH; // 0 at seam
      const m = mossN(x, y) - nearSeam * 0.55;
      if (m > 0.52 + dither(x, y) * 0.08) {
        const g = mosses[Math.floor(mossN(x + 37, y + 61) * mosses.length) % mosses.length];
        px.set(x, y, mix(px.get(x, y), g, 0.85));
      }
    }
  }
  // cracks on some blocks
  const crackRng = mulberry32(104);
  for (let i = 0; i < 9; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 8 + Math.floor(crackRng() * 8), [0.2, 1], (x, y) =>
      px.blend(x, y, hex("#232820"), 0.8)
    );
  }
  // damp streaks running down from a few seams
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * (L / 2)) * 2;
    const len = 10 + Math.floor(crackRng() * 18);
    for (let y = sy; y < sy + len; y++) {
      px.blend(sx, y, hex("#2e3830"), 0.35);
      if (crackRng() < 0.4) px.blend(sx + 1, y, hex("#2e3830"), 0.2);
    }
  }
  px.save("f1_wall_256.png");
}

function f1Floor(name, seed, waterThreshold, baseHex) {
  const rng = mulberry32(seed);
  const px = new Px();
  const mottle = makeFbm(mulberry32(seed + 1));
  const waterN = makeFbm(mulberry32(seed + 2), [4, 8, 16]);
  const base = hex(baseHex);
  const gap = hex("#262b22");
  const deep = hex("#2c4a34");
  const shallow = hex("#3f6044");
  const rim = hex("#6f8262");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const col = Math.floor(x / 32);
      const row = Math.floor(y / 32);
      const key = `${row},${col}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.94 + rng() * 0.12));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.93, 1.0, 1.07][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // slab cracks
  const crackRng = mulberry32(seed + 3);
  for (let i = 0; i < 7; i++) {
    crackWalk(
      crackRng,
      Math.floor(crackRng() * L),
      Math.floor(crackRng() * L),
      6 + Math.floor(crackRng() * 10),
      [crackRng() - 0.5, crackRng() - 0.5],
      (x, y) => px.blend(x, y, hex("#20261e"), 0.75)
    );
  }
  // stagnant puddles sit over slabs and gaps alike
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const w = waterN(x, y);
      if (w > waterThreshold) {
        const depth = Math.min(1, (w - waterThreshold) * 6);
        let c = mix(shallow, deep, depth);
        // faint scummy sheen
        if ((x + y * 2) % 16 === 0 && depth < 0.6) c = shade(c, 1.12);
        px.set(x, y, c);
      } else if (w > waterThreshold - 0.03) {
        px.set(x, y, mix(px.get(x, y), rim, 0.7)); // wet rim
      }
    }
  }
  px.save(name);
}

function f1Ceiling() {
  const px = new Px();
  const mottle = makeFbm(mulberry32(120));
  const base = hex("#3d443a");
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const m = mottle(x, y);
      const lvl = Math.floor(m * 4 + dither(x, y) * 0.999);
      px.set(x, y, shade(base, [0.78, 0.9, 1.0, 1.1][Math.max(0, Math.min(3, lvl))]));
    }
  }
  const rng = mulberry32(121);
  // speckle + mineral glints
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    px.blend(x, y, rng() < 0.85 ? hex("#2b3129") : hex("#5f6b57"), 0.7);
  }
  // drip stains
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    const len = 4 + Math.floor(rng() * 7);
    for (let k = 0; k < len; k++) px.blend(x, y + k, hex("#2e3a30"), 0.45);
    px.blend(x, y + len, hex("#54705a"), 0.6); // hanging drop
  }
  px.save("f1_ceiling_256.png");
}

// ===========================================================================
// FLOOR 2 — THE CURSED LIBRARY: bookshelf walls, dark wood, arcane accents.
// ===========================================================================

function f2Wall() {
  const rng = mulberry32(201);
  const px = new Px();
  const grain = makeFbm(mulberry32(202), [8, 16, 32]);
  const woodMid = hex("#6d4526");
  const woodDark = hex("#452a15");
  const woodLight = hex("#8c5c33");
  const bgDark = hex("#191310");
  const spines = [
    hex("#7c2f28"),
    hex("#3e4c7a"),
    hex("#4f6136"),
    hex("#6b4663"),
    hex("#2f6b64"),
    hex("#8a6c38"),
    hex("#5c3a28"),
    hex("#41527a"),
  ];

  // shelf background
  px.fill(bgDark);
  for (let y = 0; y < L; y++)
    for (let x = 0; x < L; x++)
      if (grain(x + 51, y + 17) > 0.62) px.blend(x, y, hex("#221a14"), 0.6);

  const drawWood = (x0, y0, w, h, horizontal) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const g = grain(horizontal ? x * 1.7 : x, horizontal ? y : y * 1.7);
        let c = mix(woodMid, woodDark, Math.floor(g * 3) / 2 > 0.5 ? 0.45 : 0);
        if (g > 0.68) c = mix(c, woodLight, 0.5);
        const edge = horizontal ? y - y0 : x - x0;
        if (edge === 0) c = mix(c, woodLight, 0.55);
        if (edge === h - 1 || (!horizontal && edge === w - 1)) c = mix(c, woodDark, 0.6);
        px.set(x, y, c);
      }
    }
  };

  // books per 32px shelf band, standing on the next board down
  for (let band = 0; band < 4; band++) {
    const bottom = band * 32 + 31; // last row above the next board
    for (const [xStart, xEnd] of [
      [4, 64],
      [68, 128],
    ]) {
      let x = xStart;
      while (x < xEnd - 2) {
        const r = rng();
        if (r < 0.1) {
          x += 2 + Math.floor(rng() * 3); // gap of dark shelf
          continue;
        }
        if (r < 0.2) {
          // horizontal stack of 2-3 tomes
          const w = 9 + Math.floor(rng() * 5);
          if (x + w > xEnd) break;
          const n = 2 + Math.floor(rng() * 2);
          for (let s = 0; s < n; s++) {
            const c = shade(spines[Math.floor(rng() * spines.length)], 0.85 + rng() * 0.3);
            const yTop = bottom - (s + 1) * 4 + 1;
            px.rect(x, yTop, w, 4, c);
            px.rect(x, yTop, w, 1, shade(c, 1.3));
            px.rect(x + w - 1, yTop, 1, 4, shade(c, 0.65));
          }
          x += w + 1;
          continue;
        }
        const w = 3 + Math.floor(rng() * 5);
        if (x + w > xEnd) break;
        const h = 17 + Math.floor(rng() * 9);
        const isRune = rng() < 0.06;
        const c = isRune
          ? hex("#241a30")
          : shade(spines[Math.floor(rng() * spines.length)], 0.85 + rng() * 0.3);
        px.rect(x, bottom - h + 1, w, h, c);
        px.rect(x, bottom - h + 1, 1, h, shade(c, 1.35)); // lit left edge
        px.rect(x + w - 1, bottom - h + 1, 1, h, shade(c, 0.6)); // shadow right
        px.rect(x, bottom - h + 1, w, 1, shade(c, 1.2)); // top
        // title bands
        if (!isRune && w >= 4 && rng() < 0.75) {
          const by = bottom - h + 3 + Math.floor(rng() * 3);
          px.rect(x + 1, by, w - 2, 1, shade(c, 1.45));
          if (h > 20) px.rect(x + 1, by + Math.floor(h * 0.55), w - 2, 1, shade(c, 1.45));
        }
        if (isRune) {
          // faint glowing glyph
          const gx = x + Math.floor(w / 2);
          const gy = bottom - Math.floor(h / 2);
          px.set(gx, gy, hex("#b9a5ec"));
          px.set(gx, gy - 2, hex("#8f76c9"));
          px.set(gx, gy + 2, hex("#8f76c9"));
        }
        x += w;
      }
    }
    // shadow under the board above
    for (let x = 0; x < L; x++)
      for (let dy = 4; dy < 8; dy++) px.blend(x, band * 32 + dy, hex("#0e0a08"), 0.35 - (dy - 4) * 0.08);
  }

  // shelf boards + uprights drawn over the books
  for (let band = 0; band < 4; band++) drawWood(0, band * 32, L, 4, true);
  drawWood(0, 0, 4, L, false);
  drawWood(64, 0, 4, L, false);
  px.save("f2_wall_256.png");
}

function f2Floor(name, seed, vertical, baseHex) {
  const rng = mulberry32(seed);
  const px = new Px();
  const grain = makeFbm(mulberry32(seed + 1), [8, 16, 32]);
  const base = hex(baseHex);
  const dark = hex("#2e1f12");
  const light = hex("#6b4a2b");
  const plankT = 8;

  // per-plank tone and staggered joints
  const jointOffsets = [];
  for (let i = 0; i < L / plankT; i++) jointOffsets.push(Math.floor(rng() * 4) * 32);
  const tones = jointOffsets.map(() => 0.9 + rng() * 0.22);

  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const u = vertical ? y : x; // along the plank
      const v = vertical ? x : y; // across planks
      const plank = Math.floor(v / plankT);
      const lv = v % plankT;
      let c = shade(base, tones[plank]);
      const g = grain(vertical ? x * 0.6 : x * 1.9, vertical ? y * 1.9 : y * 0.6);
      const lvl = Math.floor(g * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.88, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (lv === 0) c = mix(c, light, 0.3);
      if (lv === plankT - 1) c = mix(c, dark, 0.45);
      const joint = (((u + jointOffsets[plank]) % 64) + 64) % 64;
      if (joint === 0) c = mix(c, dark, 0.7);
      px.set(x, y, c);
    }
  }
  // nails beside joints
  for (let plank = 0; plank < L / plankT; plank++) {
    for (let j = 0; j < L; j += 64) {
      const u = (((j - jointOffsets[plank]) % L) + L) % L;
      const v = plank * plankT + 2 + Math.floor(rng() * (plankT - 4));
      const [x, y] = vertical ? [v, (u + 2) % L] : [(u + 2) % L, v];
      px.set(x, y, hex("#1f1610"));
      px.blend(x, y - 1, hex("#7d5a38"), 0.5);
    }
  }
  // faint arcane scuff-glyphs on a couple of spots
  const glyphRng = mulberry32(seed + 5);
  for (let i = 0; i < 2; i++) {
    const gx = 16 + Math.floor(glyphRng() * (L - 32));
    const gy = 16 + Math.floor(glyphRng() * (L - 32));
    const glow = hex("#6f5b9e");
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      if (glyphRng() < 0.7)
        px.blend(gx + Math.round(Math.cos(a) * 5), gy + Math.round(Math.sin(a) * 5), glow, 0.4);
    }
    px.blend(gx, gy, glow, 0.35);
  }
  px.save(name);
}

function f2Ceiling() {
  const px = new Px();
  const mottle = makeFbm(mulberry32(230));
  const grain = makeFbm(mulberry32(231), [8, 16, 32]);
  const plaster = hex("#3a332b");
  const beamMid = hex("#4c3018");
  const beamDark = hex("#33200f");
  const beamLight = hex("#6a4826");
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      px.set(x, y, shade(plaster, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]));
    }
  }
  // two horizontal beams per tile
  for (const y0 of [10, 74]) {
    for (let y = y0; y < y0 + 12; y++) {
      for (let x = 0; x < L; x++) {
        const g = grain(x * 1.8, y);
        let c = g > 0.62 ? mix(beamMid, beamLight, 0.5) : g < 0.4 ? mix(beamMid, beamDark, 0.5) : beamMid;
        if (y === y0) c = mix(c, beamLight, 0.6);
        if (y === y0 + 11) c = mix(c, beamDark, 0.7);
        px.set(x, y, c);
      }
    }
    // drop shadow on plaster below the beam
    for (let x = 0; x < L; x++) {
      px.blend(x, y0 + 12, hex("#171310"), 0.45);
      px.blend(x, y0 + 13, hex("#171310"), 0.22);
    }
    // pegs
    for (let x = 8; x < L; x += 32) {
      px.set(x, y0 + 3, beamDark);
      px.set(x, y0 + 8, beamDark);
    }
  }
  px.save("f2_ceiling_256.png");
}

// ===========================================================================
// FLOOR 3 — THE FORGE OF ASHES: charred stone, ember cracks, iron grates.
// ===========================================================================

function f3Wall() {
  const rng = mulberry32(301);
  const px = new Px();
  const mottle = makeFbm(mulberry32(302));
  const stones = [hex("#463e38"), hex("#3e3833"), hex("#37312c"), hex("#423a33")];
  const mortar = hex("#1d1815");
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, stones[Math.floor(rng() * stones.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, mortar);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.15);
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // char scorch: darker toward block bottoms
      if (mottle(x + 71, y + 23) > 0.6) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  // glowing ember cracks on some blocks
  const crackRng = mulberry32(303);
  const emberCore = hex("#ffb347");
  const emberMid = hex("#e2703a");
  const emberDim = hex("#8a3a1c");
  for (let i = 0; i < 7; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 10), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.3 ? emberCore : emberMid);
      px.blend(x + 1, y, emberDim, 0.55);
      px.blend(x - 1, y, emberDim, 0.55);
      px.blend(x, y + 1, emberDim, 0.35);
      px.blend(x, y - 1, emberDim, 0.35);
    });
  }
  // stray ember flecks
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? emberMid : emberDim);
  }
  // riveted iron band across the middle seam
  const iron = hex("#3b3f46");
  const ironLight = hex("#585f6a");
  const ironDark = hex("#22252a");
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = iron;
        if (y === y0) c = ironLight;
        if (y === y0 + 5) c = ironDark;
        if (mottle(x * 2, y * 2) > 0.66) c = shade(c, 0.85); // grime
        px.set(x, y, c);
      }
    }
    for (let x = 6; x < L; x += 16) {
      px.set(x, y0 + 2, ironLight);
      px.set(x + 1, y0 + 2, ironDark);
      px.set(x, y0 + 3, ironDark);
    }
  }
  px.save("f3_wall_256.png");
}

function f3FloorA() {
  const rng = mulberry32(310);
  const px = new Px();
  const mottle = makeFbm(mulberry32(311));
  const base = hex("#38322d");
  const gap = hex("#16120f");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const key = `${Math.floor(y / 32)},${Math.floor(x / 32)}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.9 + rng() * 0.2));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // branching molten veins
  const veinRng = mulberry32(312);
  const plotVein = (x, y) => {
    px.set(x, y, veinRng() < 0.25 ? hex("#ffd27a") : hex("#f08a3c"));
    px.blend(x + 1, y, hex("#a8401f"), 0.6);
    px.blend(x - 1, y, hex("#a8401f"), 0.6);
    px.blend(x, y + 1, hex("#6b2413"), 0.5);
    px.blend(x, y - 1, hex("#6b2413"), 0.5);
  };
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(veinRng() * L);
    const sy = Math.floor(veinRng() * L);
    const bias = [veinRng() - 0.5, veinRng() - 0.5];
    crackWalk(veinRng, sx, sy, 22 + Math.floor(veinRng() * 16), bias, (x, y) => {
      plotVein(x, y);
      if (veinRng() < 0.12) {
        crackWalk(veinRng, x, y, 5 + Math.floor(veinRng() * 6), [bias[1], -bias[0]], plotVein);
      }
    });
  }
  // ash speckle
  for (let i = 0; i < 160; i++) {
    px.blend(Math.floor(veinRng() * L), Math.floor(veinRng() * L), hex("#6b655c"), 0.5);
  }
  px.save("f3_floor_a_256.png");
}

function f3FloorB() {
  const px = new Px();
  const glowN = makeFbm(mulberry32(320), [4, 8, 16]);
  const coal = hex("#1a0e08");
  const emberLow = hex("#5c2210");
  const emberHigh = hex("#c2542a");
  const emberHot = hex("#f08a3c");
  // ember bed beneath the grate
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const g = glowN(x, y);
      let c;
      if (g > 0.72) c = emberHot;
      else if (g > 0.6) c = emberHigh;
      else if (g > 0.45) c = mix(emberLow, emberHigh, (g - 0.45) / 0.15);
      else c = mix(coal, emberLow, Math.max(0, (g - 0.2) / 0.25));
      if (dither(x, y) > 0.85 && g > 0.5) c = shade(c, 1.2); // sparkle
      px.set(x, y, c);
    }
  }
  // iron grate: bars every 16px both ways
  const bar = hex("#2e3238");
  const barLight = hex("#4a505a");
  const barDark = hex("#191c20");
  for (let v = 0; v < L; v += 16) {
    for (let t = 0; t < L; t++) {
      for (let w = 0; w < 3; w++) {
        px.set(t, v + w, w === 0 ? barLight : w === 2 ? barDark : bar);
        px.set(v + w, t, w === 0 ? barLight : w === 2 ? barDark : bar);
      }
    }
  }
  // bolts at intersections
  for (let y = 0; y < L; y += 16) {
    for (let x = 0; x < L; x += 16) {
      px.set(x + 1, y + 1, hex("#5a626e"));
    }
  }
  px.save("f3_floor_b_256.png");
}

function f3Ceiling() {
  const px = new Px();
  const mottle = makeFbm(mulberry32(330));
  const base = hex("#2f2a26");
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const m = mottle(x, y);
      const lvl = Math.floor(m * 4 + dither(x, y) * 0.999);
      px.set(x, y, shade(base, [0.72, 0.86, 1.0, 1.12][Math.max(0, Math.min(3, lvl))]));
    }
  }
  const rng = mulberry32(331);
  // soot streaks
  for (let i = 0; i < 10; i++) {
    const sx = Math.floor(rng() * L);
    const sy = Math.floor(rng() * L);
    crackWalk(rng, sx, sy, 12 + Math.floor(rng() * 12), [1, 0.1], (x, y) => {
      px.blend(x, y, hex("#17130f"), 0.4);
      px.blend(x, y + 1, hex("#17130f"), 0.2);
    });
  }
  // faint ember glints caught in the vault
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    px.blend(x, y, rng() < 0.25 ? hex("#c2542a") : hex("#6b2e18"), 0.8);
  }
  px.save("f3_ceiling_256.png");
}

// ===========================================================================
// FLOOR 4 — THE NULL CHOIR: slate-violet ashlar, silver rune-glow, mute runes.
// ===========================================================================

function f4Wall() {
  const rng = mulberry32(401);
  const px = new Px();
  const mottle = makeFbm(mulberry32(402));
  const stones = [hex("#5a5666"), hex("#524e5e"), hex("#4a4757"), hex("#565064")];
  const mortar = hex("#2a2733");
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, stones[Math.floor(rng() * stones.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, mortar);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.88, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.14);
      else if (ly === rowH - 1) c = shade(c, 0.8);
      // cold damp bloom toward block bottoms
      if (mottle(x + 53, y + 37) > 0.64) c = shade(c, 0.86);
      px.set(x, y, c);
    }
  }
  // silver rune-glow veins seeping between the stones
  const crackRng = mulberry32(403);
  const runeCore = hex("#e8e6f2");
  const runeMid = hex("#a9a4c9");
  const runeDim = hex("#5f5a80");
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.3, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? runeCore : runeMid);
      px.blend(x + 1, y, runeDim, 0.55);
      px.blend(x - 1, y, runeDim, 0.55);
      px.blend(x, y + 1, runeDim, 0.35);
      px.blend(x, y - 1, runeDim, 0.35);
    });
  }
  // stray silver motes
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? runeMid : runeDim);
  }
  // carved choir-script frieze across the middle seam
  const band = hex("#6e6a80");
  const bandHi = hex("#8f8ba6");
  const bandShadow = hex("#3a3748");
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = band;
        if (y === y0) c = bandHi;
        if (y === y0 + 5) c = bandShadow;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88); // wear
        px.set(x, y, c);
      }
    }
    // struck-out hymn glyphs, one per 16px — every voice notched, then cancelled
    const glyphRng = mulberry32(404);
    for (let x = 5; x < L - 4; x += 16) {
      const tall = glyphRng() < 0.5;
      px.set(x, y0 + 1, bandShadow);
      px.set(x, y0 + 2, bandShadow);
      px.set(x, y0 + 3, tall ? bandShadow : bandHi);
      px.set(x + 2, y0 + 2, bandShadow);
      px.set(x + 2, y0 + 3, bandShadow);
      if (glyphRng() < 0.6) px.set(x + 1, y0 + 2, runeDim); // cancel stroke
      if (glyphRng() < 0.35) px.set(x + 3, y0 + 1, bandShadow);
    }
  }
  px.save("f4_wall_256.png");
}

function f4FloorA() {
  const rng = mulberry32(410);
  const px = new Px();
  const mottle = makeFbm(mulberry32(411));
  const base = hex("#46424f");
  const gap = hex("#201d28");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const key = `${Math.floor(y / 32)},${Math.floor(x / 32)}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.9 + rng() * 0.2));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.87, 1.0, 1.09][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // hairline silver seams where the wardwork bleeds through
  const seamRng = mulberry32(412);
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(seamRng() * L);
    const sy = Math.floor(seamRng() * L);
    const bias = [seamRng() - 0.5, seamRng() - 0.5];
    crackWalk(seamRng, sx, sy, 18 + Math.floor(seamRng() * 14), bias, (x, y) => {
      px.set(x, y, seamRng() < 0.2 ? hex("#a9a4c9") : hex("#5f5a80"));
      px.blend(x + 1, y, hex("#3a3748"), 0.5);
      px.blend(x, y + 1, hex("#3a3748"), 0.4);
    });
  }
  // sparse silver flecks — dust of ground-down voices
  for (let i = 0; i < 120; i++) {
    px.blend(Math.floor(seamRng() * L), Math.floor(seamRng() * L), hex("#8f8ba6"), 0.45);
  }
  px.save("f4_floor_a_256.png");
}

function f4FloorB() {
  const rng = mulberry32(420);
  const px = new Px();
  const mottle = makeFbm(mulberry32(421));
  const base = hex("#413d4b");
  const gap = hex("#1c1923");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const key = `${Math.floor(y / 32)},${Math.floor(x / 32)}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.88 + rng() * 0.18));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.07][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // inlaid mute-rune rings on alternating slabs — the circles that eat sound
  const ringDim = hex("#5f5a80");
  const ringHi = hex("#8f8ba6");
  for (let sy = 0; sy < L / 32; sy++) {
    for (let sx = 0; sx < L / 32; sx++) {
      if ((sx + sy) % 2 !== 0) continue;
      const cx = sx * 32 + 16;
      const cy = sy * 32 + 16;
      const r = 9 + Math.floor(rng() * 3);
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(t) * r);
        const y = Math.round(cy + Math.sin(t) * r);
        px.set(x, y, rng() < 0.18 ? ringHi : ringDim);
      }
      // the bar of silence struck diagonally through the ring
      for (let dx = -r + 2; dx <= r - 2; dx++) {
        if (rng() < 0.8) px.set(cx + dx, cy + Math.round(dx * 0.4), ringDim);
      }
      px.set(cx, cy, ringHi);
    }
  }
  px.save("f4_floor_b_256.png");
}

function f4Ceiling() {
  const px = new Px();
  const mottle = makeFbm(mulberry32(430));
  const base = hex("#3a3644");
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const m = mottle(x, y);
      const lvl = Math.floor(m * 4 + dither(x, y) * 0.999);
      px.set(x, y, shade(base, [0.74, 0.88, 1.0, 1.1][Math.max(0, Math.min(3, lvl))]));
    }
  }
  const rng = mulberry32(431);
  // hairline silver cracks in the vault
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(rng() * L);
    const sy = Math.floor(rng() * L);
    crackWalk(rng, sx, sy, 12 + Math.floor(rng() * 14), [1, 0.15], (x, y) => {
      px.blend(x, y, hex("#8f8ba6"), 0.45);
      px.blend(x, y + 1, hex("#26232f"), 0.3);
    });
  }
  // dim violet glints — the choir's held breath
  for (let i = 0; i < 36; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    px.blend(x, y, rng() < 0.25 ? hex("#7a6fa0") : hex("#4a4468"), 0.8);
  }
  px.save("f4_ceiling_256.png");
}

// ===========================================================================
// FLOOR 5 — THE WEEPING CISTERN: teal-black wet ashlar, aquamarine glow-veins.
// ===========================================================================

function f5Wall() {
  const rng = mulberry32(501);
  const px = new Px();
  const mottle = makeFbm(mulberry32(502));
  const stones = [hex("#33454a"), hex("#2c3d42"), hex("#26363a"), hex("#304248")];
  const mortar = hex("#141d20");
  const rowH = 16;
  const blockW = 32;

  const blockTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const { row, col, lx, ly } = courses(x, y, rowH, blockW);
      const key = `${row},${col}`;
      if (!blockTone.has(key)) blockTone.set(key, stones[Math.floor(rng() * stones.length)]);
      if (ly === 0 || lx === 0) {
        px.set(x, y, mortar);
        continue;
      }
      let c = blockTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.86, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      if (ly === 1) c = shade(c, 1.16); // damp sheen along block tops
      else if (ly === rowH - 1) c = shade(c, 0.78);
      // weeping stain trailing down from block seams
      if (mottle(x + 21, y + 71) > 0.62) c = shade(c, 0.82);
      px.set(x, y, c);
    }
  }
  // aquamarine glow-veins — the cistern's bioluminescent seep
  const crackRng = mulberry32(503);
  const glowCore = hex("#baf7e8");
  const glowMid = hex("#5fd6bd");
  const glowDim = hex("#215048");
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(crackRng() * L);
    const sy = Math.floor(crackRng() * L);
    crackWalk(crackRng, sx, sy, 10 + Math.floor(crackRng() * 12), [0.2, 1], (x, y) => {
      px.set(x, y, crackRng() < 0.25 ? glowCore : glowMid);
      px.blend(x + 1, y, glowDim, 0.55);
      px.blend(x - 1, y, glowDim, 0.55);
      px.blend(x, y + 1, glowDim, 0.4);
      px.blend(x, y - 1, glowDim, 0.3);
    });
  }
  // stray aqua motes
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(crackRng() * L);
    const y = Math.floor(crackRng() * L);
    px.set(x, y, crackRng() < 0.3 ? glowMid : glowDim);
  }
  // carved drain-channel frieze across the middle seam
  const band = hex("#233c40");
  const bandHi = hex("#3f5f63");
  const bandShadow = hex("#0f1a1c");
  for (const y0 of [62]) {
    for (let y = y0; y < y0 + 6; y++) {
      for (let x = 0; x < L; x++) {
        let c = band;
        if (y === y0) c = bandHi;
        if (y === y0 + 5) c = bandShadow;
        if (mottle(x * 2, y * 2) > 0.68) c = shade(c, 0.88); // wear
        px.set(x, y, c);
      }
    }
    // ripple notches, one per 16px — the current's endless small pulse
    const rippleRng = mulberry32(504);
    for (let x = 5; x < L - 4; x += 16) {
      px.set(x, y0 + 2, glowDim);
      px.set(x + 1, y0 + 3, rippleRng() < 0.5 ? glowMid : bandShadow);
      px.set(x + 2, y0 + 2, glowDim);
      if (rippleRng() < 0.4) px.set(x + 3, y0 + 1, bandShadow);
    }
  }
  px.save("f5_wall_256.png");
}

function f5FloorA() {
  const rng = mulberry32(510);
  const px = new Px();
  const mottle = makeFbm(mulberry32(511));
  const base = hex("#25373b");
  const gap = hex("#0f1b1d");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const key = `${Math.floor(y / 32)},${Math.floor(x / 32)}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.89 + rng() * 0.2));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.87, 1.0, 1.1][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // hairline aqua seams where the cistern water has seeped through the slabs
  const seamRng = mulberry32(512);
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(seamRng() * L);
    const sy = Math.floor(seamRng() * L);
    const bias = [seamRng() - 0.5, seamRng() - 0.5];
    crackWalk(seamRng, sx, sy, 18 + Math.floor(seamRng() * 14), bias, (x, y) => {
      px.set(x, y, seamRng() < 0.2 ? hex("#5fd6bd") : hex("#215048"));
      px.blend(x + 1, y, hex("#0f1a1c"), 0.5);
      px.blend(x, y + 1, hex("#0f1a1c"), 0.4);
    });
  }
  // wet-slab flecks
  for (let i = 0; i < 120; i++) {
    px.blend(Math.floor(seamRng() * L), Math.floor(seamRng() * L), hex("#3f5f63"), 0.45);
  }
  px.save("f5_floor_a_256.png");
}

function f5FloorB() {
  const rng = mulberry32(520);
  const px = new Px();
  const mottle = makeFbm(mulberry32(521));
  const base = hex("#1c2f33");
  const gap = hex("#0a1517");

  const slabTone = new Map();
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const key = `${Math.floor(y / 32)},${Math.floor(x / 32)}`;
      if (!slabTone.has(key)) slabTone.set(key, shade(base, 0.87 + rng() * 0.18));
      if (x % 32 === 0 || y % 32 === 0) {
        px.set(x, y, gap);
        continue;
      }
      let c = slabTone.get(key);
      const m = mottle(x, y);
      const lvl = Math.floor(m * 3 + dither(x, y) * 0.999);
      c = shade(c, [0.85, 1.0, 1.08][Math.max(0, Math.min(2, lvl))]);
      px.set(x, y, c);
    }
  }
  // concentric ripple rings on alternating slabs — the undersong's pulse
  const ringDim = hex("#215048");
  const ringHi = hex("#5fd6bd");
  for (let sy = 0; sy < L / 32; sy++) {
    for (let sx = 0; sx < L / 32; sx++) {
      if ((sx + sy) % 2 !== 0) continue;
      const cx = sx * 32 + 16;
      const cy = sy * 32 + 16;
      for (const r of [4, 8, 12]) {
        for (let a = 0; a < 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          const x = Math.round(cx + Math.cos(t) * r);
          const y = Math.round(cy + Math.sin(t) * r);
          if (rng() < 0.75) px.set(x, y, rng() < 0.2 ? ringHi : ringDim);
        }
      }
      px.set(cx, cy, ringHi);
    }
  }
  px.save("f5_floor_b_256.png");
}

function f5Ceiling() {
  const px = new Px();
  const mottle = makeFbm(mulberry32(530));
  const base = hex("#1e3236");
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const m = mottle(x, y);
      const lvl = Math.floor(m * 4 + dither(x, y) * 0.999);
      px.set(x, y, shade(base, [0.72, 0.86, 1.0, 1.12][Math.max(0, Math.min(3, lvl))]));
    }
  }
  const rng = mulberry32(531);
  // vertical drip-streak trails
  for (let i = 0; i < 10; i++) {
    const sx = Math.floor(rng() * L);
    const sy = Math.floor(rng() * L);
    crackWalk(rng, sx, sy, 12 + Math.floor(rng() * 14), [0.1, 1], (x, y) => {
      px.blend(x, y, hex("#0c1719"), 0.4);
      px.blend(x + 1, y, hex("#0c1719"), 0.2);
    });
  }
  // faint aqua glints caught in the vault — the undersong's held breath
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    px.blend(x, y, rng() < 0.25 ? hex("#5fd6bd") : hex("#215048"), 0.8);
  }
  px.save("f5_ceiling_256.png");
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
f1Wall();
f1Floor("f1_floor_a_256.png", 110, 0.66, "#4c5245");
f1Floor("f1_floor_b_256.png", 115, 0.6, "#454c40");
f1Ceiling();
f2Wall();
f2Floor("f2_floor_a_256.png", 210, false, "#4e3620");
f2Floor("f2_floor_b_256.png", 215, true, "#45301c");
f2Ceiling();
f3Wall();
f3FloorA();
f3FloorB();
f3Ceiling();
f4Wall();
f4FloorA();
f4FloorB();
f4Ceiling();
f5Wall();
f5FloorA();
f5FloorB();
f5Ceiling();
console.log("done");
