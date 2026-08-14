// Production wall-family generator for Floors 1-5.
//
// The canonical walls (fN_wall_256.png) are curated anchors and are never
// overwritten here. This script creates nine deterministic siblings for each
// floor at a logical 128x128, then writes 256x256 RGB PNGs with exact 2x
// nearest-neighbour pixels. The variants deliberately favour material rhythm
// over landmarks: irregular circular masonry courses, localized wear, broken
// architectural fragments, and broad book groups rather than stamped motifs.
//
// Usage: node scripts/generate-wall-variants.mjs

// Category plan (recorded again in the production report):
//   b-f quiet/common, g-i character, j rare/hero.

// PixelLab trials for the F2 family were rejected during the 2026-08-13 pass
// because they produced framed mini-bookcases and repeated internal modules.
// The library siblings below are therefore authored procedurally at the same
// logical pixel scale as the shipped walls.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets");
const L = 128;
const SHIP = L * 2;

// --- Minimal true-colour PNG encoder ---------------------------------------

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC_TABLE[(c ^ out[i]) & 0xff] ^ (c >>> 8);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
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

// --- Pixel helpers ----------------------------------------------------------

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

function hex(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function shade(color, factor) {
  return color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor))));
}

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
    const wrappedX = ((x % L) + L) % L;
    const wrappedY = ((y % L) + L) % L;
    return (wrappedY * L + wrappedX) * 3;
  }

  set(x, y, color) {
    const i = this.idx(x, y);
    this.d[i] = color[0];
    this.d[i + 1] = color[1];
    this.d[i + 2] = color[2];
  }

  get(x, y) {
    const i = this.idx(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }

  blend(x, y, color, amount) {
    this.set(x, y, mix(this.get(x, y), color, amount));
  }

  fill(color) {
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) this.set(x, y, color);
    }
  }

  rect(x0, y0, width, height, color) {
    for (let y = y0; y < y0 + height; y++) {
      for (let x = x0; x < x0 + width; x++) this.set(x, y, color);
    }
  }

  line(x0, y0, x1, y1, color, amount = 1) {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      if (amount === 1) this.set(x, y, color);
      else this.blend(x, y, color, amount);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  posterize(step) {
    for (let i = 0; i < this.d.length; i++) {
      this.d[i] = Math.min(255, Math.round(this.d[i] / step) * step);
    }
  }

  save(name) {
    const out = Buffer.alloc(SHIP * SHIP * 3);
    for (let y = 0; y < SHIP; y++) {
      for (let x = 0; x < SHIP; x++) {
        const source = this.idx(x >> 1, y >> 1);
        const target = (y * SHIP + x) * 3;
        out[target] = this.d[source];
        out[target + 1] = this.d[source + 1];
        out[target + 2] = this.d[source + 2];
      }
    }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, name), encodePNG(SHIP, out));
    console.log(`wrote ${name}`);
  }
}

function makeNoise(period, rng) {
  const grid = new Float64Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const fx = (((x / L) * period) % period + period) % period;
    const fy = (((y / L) * period) % period + period) % period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

function makeFbm(rng, periods = [4, 8, 16, 32]) {
  const layers = periods.map((period) => makeNoise(period, rng));
  return (x, y) => {
    let total = 0;
    let weight = 1;
    let weights = 0;
    for (const layer of layers) {
      total += layer(x, y) * weight;
      weights += weight;
      weight *= 0.55;
    }
    return total / weights;
  };
}

function crackWalk(rng, x, y, steps, bias, plot) {
  let dx = bias[0];
  let dy = bias[1];
  for (let step = 0; step < steps; step++) {
    plot(Math.round(x), Math.round(y));
    if (rng() < 0.38) {
      const turn = (rng() - 0.5) * 1.45;
      const nextX = dx - dy * turn;
      const nextY = dy + dx * turn;
      const length = Math.hypot(nextX, nextY) || 1;
      dx = (nextX / length) * 0.72 + bias[0] * 0.28;
      dy = (nextY / length) * 0.72 + bias[1] * 0.28;
    }
    x += dx;
    y += dy;
  }
}

function matchOppositeEdges(px) {
  // The renderer uses nearest sampling, so one exact logical-pixel agreement
  // on each opposing edge is sufficient to prevent a filtered-looking jump.
  // Interior geometry still crosses the boundary naturally because every
  // drawing primitive above writes through Px's toroidal coordinates.
  for (let y = 0; y < L; y++) px.set(L - 1, y, px.get(0, y));
  for (let x = 0; x < L; x++) px.set(x, L - 1, px.get(x, 0));
}

function distribute(total, count, rng, jitter) {
  const values = Array.from({ length: count }, () => 1 + (rng() - 0.5) * jitter);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const result = values.map((value) => Math.max(8, Math.round((value / sum) * total)));
  let delta = total - result.reduce((acc, value) => acc + value, 0);
  let index = 0;
  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    if (result[index] + direction >= 8) {
      result[index] += direction;
      delta -= direction;
    }
    index = (index + 1) % result.length;
  }
  return result;
}

function stoneWall(config) {
  const rng = mulberry32(config.seed);
  const px = new Px();
  const mottle = makeFbm(mulberry32(config.seed + 1));
  const rowHeights = distribute(L, config.rows, mulberry32(config.seed + 2), config.rowJitter ?? 0.34);
  const rows = [];
  px.fill(config.mortar);

  let y0 = 0;
  for (let row = 0; row < rowHeights.length; row++) {
    const height = rowHeights[row];
    const blockCount = config.blockCounts[row % config.blockCounts.length];
    const widths = distribute(L, blockCount, rng, config.blockJitter ?? 0.62);
    const offset = Math.floor(rng() * L);
    const blocks = [];
    let cursor = offset;
    for (let block = 0; block < widths.length; block++) {
      const width = widths[block];
      const tone = config.stones[Math.floor(rng() * config.stones.length)];
      blocks.push({ x0: cursor, width });
      for (let localY = 1; localY < height; localY++) {
        for (let localX = 1; localX < width; localX++) {
          const x = cursor + localX;
          const y = y0 + localY;
          const noise = mottle(x, y);
          const level = Math.floor(noise * 3 + dither(x, y) * 0.999);
          let color = shade(tone, [0.87, 1, 1.1][Math.max(0, Math.min(2, level))]);
          if (localY === 1) color = shade(color, 1.12);
          else if (localY === height - 1) color = shade(color, 0.78);
          else if (localX === 1) color = shade(color, 1.06);
          else if (localX === width - 1) color = shade(color, 0.84);
          if (config.baseStain && config.baseStain.noise(x, y) > config.baseStain.threshold) {
            color = mix(color, config.baseStain.color, config.baseStain.amount);
          }
          px.set(x, y, color);
        }
      }

      // Small chipped corners and joint nicks break the perfect rectangle
      // without becoming memorable silhouettes.
      const chipCount = 1 + Math.floor(rng() * (config.chips ?? 3));
      for (let chip = 0; chip < chipCount; chip++) {
        const side = Math.floor(rng() * 4);
        if (side === 0) px.set(cursor + 1 + Math.floor(rng() * Math.max(1, width - 2)), y0 + 1, config.mortar);
        if (side === 1) px.set(cursor + 1 + Math.floor(rng() * Math.max(1, width - 2)), y0 + height - 1, config.mortar);
        if (side === 2) px.set(cursor + 1, y0 + 2 + Math.floor(rng() * Math.max(1, height - 3)), config.mortar);
        if (side === 3) px.set(cursor + width - 1, y0 + 2 + Math.floor(rng() * Math.max(1, height - 3)), config.mortar);
      }
      if (rng() < 0.55) px.set(cursor + 1, y0 + 1, config.mortar);
      if (rng() < 0.42) px.set(cursor + width - 1, y0 + height - 1, config.mortar);
      cursor += width;
    }
    rows.push({ y0, height, blocks });
    y0 += height;
  }

  return { px, rng, rows, mottle };
}

function drawHairlineCracks(px, seed, count, color, options = {}) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * L);
    const y = Math.floor(rng() * L);
    const length = (options.minLength ?? 4) + Math.floor(rng() * (options.extraLength ?? 5));
    const bias = options.bias ?? [rng() - 0.5, 0.7 + rng() * 0.35];
    crackWalk(rng, x, y, length, bias, (plotX, plotY) => px.blend(plotX, plotY, color, options.amount ?? 0.78));
  }
}

function drawSeamGrowth(px, rows, seed, colors, options = {}) {
  const rng = mulberry32(seed);
  const patches = options.patches ?? 10;
  for (let patch = 0; patch < patches; patch++) {
    const row = rows[Math.floor(rng() * rows.length)];
    const x0 = Math.floor(rng() * L);
    const length = (options.minLength ?? 3) + Math.floor(rng() * (options.extraLength ?? 5));
    const y = row.y0 + (rng() < 0.5 ? 0 : row.height - 1);
    for (let x = 0; x < length; x++) {
      const color = colors[Math.floor(rng() * colors.length)];
      px.blend(x0 + x, y, color, options.amount ?? 0.72);
      if (rng() < (options.spread ?? 0.28)) px.blend(x0 + x, y + (rng() < 0.5 ? -1 : 1), color, (options.amount ?? 0.72) * 0.55);
    }
  }
}

function drawVerticalSeeps(px, rows, seed, color, options = {}) {
  const rng = mulberry32(seed);
  for (let i = 0; i < (options.count ?? 3); i++) {
    const row = rows[Math.floor(rng() * rows.length)];
    const x = Math.floor(rng() * L);
    const length = (options.minLength ?? 8) + Math.floor(rng() * (options.extraLength ?? 13));
    for (let y = 0; y < length; y++) {
      const drift = y > 0 && rng() < 0.12 ? (rng() < 0.5 ? -1 : 1) : 0;
      px.blend(x + drift, row.y0 + y, color, (options.amount ?? 0.28) * (1 - y / (length * 1.35)));
      if (rng() < 0.22) px.blend(x + drift + 1, row.y0 + y, color, (options.amount ?? 0.28) * 0.45);
    }
  }
}

function drawEdgeScar(px, seed, colors, options = {}) {
  const rng = mulberry32(seed);
  const fromRight = options.fromRight ?? rng() < 0.5;
  const startX = fromRight ? L - 2 : 1;
  const startY = options.y ?? 18 + Math.floor(rng() * 92);
  const bias = [fromRight ? -0.65 : 0.65, options.verticalBias ?? 0.55];
  crackWalk(rng, startX, startY, options.length ?? 24, bias, (x, y) => {
    px.blend(x, y, colors[0], options.amount ?? 0.82);
    if (rng() < 0.62) px.blend(x, y + 1, colors[1], (options.amount ?? 0.82) * 0.55);
    if (rng() < 0.28) px.blend(x + (fromRight ? 1 : -1), y, colors[1], 0.42);
  });
}

function drawIronTies(px, seed, palette, options = {}) {
  const rng = mulberry32(seed);
  for (let tie = 0; tie < (options.count ?? 3); tie++) {
    const width = (options.minWidth ?? 10) + Math.floor(rng() * (options.extraWidth ?? 13));
    const x0 = Math.floor(rng() * L);
    const y0 = 5 + Math.floor(rng() * (L - 12));
    for (let x = 0; x < width; x++) {
      px.set(x0 + x, y0, palette.light);
      px.set(x0 + x, y0 + 1, palette.mid);
      px.set(x0 + x, y0 + 2, palette.dark);
    }
    px.set(x0 + 3, y0 + 1, palette.light);
    px.set(x0 + width - 4, y0 + 1, palette.light);
  }
}

function drawBrokenRail(px, seed, palette, options = {}) {
  const rng = mulberry32(seed);
  const y0 = options.y ?? 30 + Math.floor(rng() * 66);
  const segments = options.segments ?? [[-7, 23], [38, 21], [79, 16], [109, 12]];
  for (const [x0, width] of segments) {
    for (let x = 0; x < width; x++) {
      px.set(x0 + x, y0, palette.light);
      px.set(x0 + x, y0 + 1, palette.mid);
      px.set(x0 + x, y0 + 2, palette.dark);
    }
    if (width > 12 && rng() < 0.8) px.set(x0 + 5 + Math.floor(rng() * (width - 9)), y0 + 1, palette.mark);
  }
}

function drawErasedScore(px, seed, palette, options = {}) {
  const rng = mulberry32(seed);
  const fromRight = options.fromRight ?? rng() < 0.5;
  const x0 = fromRight ? L + 6 : -6;
  const x1 = fromRight ? 61 + Math.floor(rng() * 22) : 45 + Math.floor(rng() * 22);
  const y = options.y ?? 19 + Math.floor(rng() * 88);
  const gapEvery = 5 + Math.floor(rng() * 4);
  const start = Math.min(x0, x1);
  const end = Math.max(x0, x1);
  for (let x = start; x <= end; x++) {
    if ((x - start) % gapEvery < 2) continue;
    const drift = Math.round(Math.sin(x * 0.21) * 1.2);
    px.blend(x, y + drift, palette.light, options.amount ?? 0.48);
    if (rng() < 0.55) px.blend(x, y + drift + 1, palette.dark, 0.45);
  }
}

function drawTideLine(px, seed, palette, options = {}) {
  const rng = mulberry32(seed);
  const y0 = options.y ?? 44 + Math.floor(rng() * 48);
  let x = -8;
  while (x < L + 8) {
    const width = 5 + Math.floor(rng() * 13);
    for (let dx = 0; dx < width; dx++) {
      const wave = Math.round(Math.sin((x + dx) * 0.16) * 1.2);
      px.blend(x + dx, y0 + wave, palette.mid, options.amount ?? 0.38);
      if (rng() < 0.4) px.blend(x + dx, y0 + wave + 1, palette.dark, 0.32);
    }
    x += width + 4 + Math.floor(rng() * 9);
  }
}

// --- Floor 1: damp wounded limestone ---------------------------------------

const F1 = {
  stones: [hex("#596052"), hex("#525a4d"), hex("#4a5247"), hex("#61685a"), hex("#555e50")],
  mortar: hex("#292f26"),
  crack: hex("#252b23"),
  damp: hex("#344139"),
  rust: [hex("#704b36"), hex("#4e3b31")],
  moss: [hex("#3f5834"), hex("#526a3d"), hex("#334b2c")],
};

const f1Configs = [
  { suffix: "b", seed: 1110, rows: 8, blockCounts: [4, 5, 4, 5], cracks: 4, growth: 5, seeps: 2 },
  { suffix: "c", seed: 1120, rows: 7, blockCounts: [4, 4, 5], cracks: 2, growth: 2, seeps: 1 },
  { suffix: "d", seed: 1130, rows: 9, blockCounts: [5, 4, 5, 6], cracks: 8, growth: 3, seeps: 1 },
  { suffix: "e", seed: 1140, rows: 8, blockCounts: [3, 5, 4, 5], cracks: 3, growth: 4, seeps: 3 },
  { suffix: "f", seed: 1150, rows: 7, blockCounts: [5, 4, 4], cracks: 3, growth: 3, seeps: 5 },
  { suffix: "g", seed: 1160, rows: 8, blockCounts: [4, 5, 3, 5], cracks: 6, growth: 5, seeps: 3, rustScar: 16 },
  { suffix: "h", seed: 1170, rows: 7, blockCounts: [3, 4, 5], cracks: 7, growth: 3, seeps: 2, rustScar: 23 },
  { suffix: "i", seed: 1180, rows: 9, blockCounts: [5, 5, 4], cracks: 5, growth: 13, seeps: 4 },
  { suffix: "j", seed: 1190, rows: 7, blockCounts: [3, 4, 4], cracks: 7, growth: 4, seeps: 4, rustScar: 36 },
];

function generateF1(config) {
  const baseStain = {
    noise: makeFbm(mulberry32(config.seed + 40), [6, 12, 24]),
    threshold: config.suffix === "c" ? 0.78 : 0.66,
    color: F1.damp,
    amount: config.suffix === "c" ? 0.12 : 0.2,
  };
  const { px, rows } = stoneWall({ ...config, stones: F1.stones, mortar: F1.mortar, baseStain, chips: 3 });
  drawHairlineCracks(px, config.seed + 10, config.cracks, F1.crack, { minLength: 4, extraLength: config.suffix === "j" ? 8 : 5 });
  drawSeamGrowth(px, rows, config.seed + 20, F1.moss, { patches: config.growth, minLength: 2, extraLength: 4, amount: 0.68 });
  drawVerticalSeeps(px, rows, config.seed + 30, F1.damp, { count: config.seeps, minLength: 7, extraLength: 15, amount: 0.3 });
  if (config.rustScar) drawEdgeScar(px, config.seed + 50, F1.rust, { length: config.rustScar, amount: config.suffix === "j" ? 0.74 : 0.55 });
  px.posterize(4);
  matchOppositeEdges(px);
  px.save(`f1_wall_${config.suffix}_256.png`);
}

// --- Floor 2: cursed archive / bookshelf ----------------------------------

const F2 = {
  background: hex("#24191e"),
  shadow: hex("#110d10"),
  wood: hex("#70473d"),
  woodLight: hex("#95675a"),
  woodDark: hex("#432b2e"),
  bookSpines: [
    hex("#754844"), hex("#765448"), hex("#54505d"), hex("#5b5946"),
    hex("#6b5064"), hex("#7c624e"), hex("#49565a"), hex("#68463f"),
  ],
  paper: hex("#a1846d"),
};

function drawWood(px, grain, x0, y0, width, height, vertical = false) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sample = grain(vertical ? x0 + x : (x0 + x) * 1.7, vertical ? (y0 + y) * 1.7 : y0 + y);
      let color = sample > 0.67 ? mix(F2.wood, F2.woodLight, 0.45) : sample < 0.38 ? mix(F2.wood, F2.woodDark, 0.5) : F2.wood;
      const edge = vertical ? x : y;
      const extent = vertical ? width : height;
      if (edge === 0) color = mix(color, F2.woodLight, 0.55);
      if (edge === extent - 1) color = mix(color, F2.woodDark, 0.68);
      px.set(x0 + x, y0 + y, color);
    }
  }
}

function drawBook(px, rng, x, bottom, maxHeight, lean = 0) {
  const width = 2 + Math.floor(rng() * 4);
  const height = Math.max(7, Math.min(maxHeight, 8 + Math.floor(rng() * Math.max(3, maxHeight - 7))));
  const base = shade(F2.bookSpines[Math.floor(rng() * F2.bookSpines.length)], 0.88 + rng() * 0.2);
  for (let y = 0; y < height; y++) {
    const shift = Math.round(((height - y) / height) * lean);
    for (let dx = 0; dx < width; dx++) {
      let color = base;
      if (dx === 0) color = shade(base, 1.2);
      if (dx === width - 1) color = shade(base, 0.66);
      if (y === height - 1) color = shade(base, 1.12);
      px.set(x + dx + shift, bottom - y, color);
    }
  }
  if (width >= 3 && height >= 11 && rng() < 0.58) {
    const bandY = bottom - 2 - Math.floor(rng() * (height - 5));
    for (let dx = 1; dx < width - 1; dx++) px.blend(x + dx, bandY, F2.paper, 0.45);
  }
  return width + Math.abs(lean);
}

function drawHorizontalStack(px, rng, x, bottom, maxWidth) {
  const width = Math.min(maxWidth, 7 + Math.floor(rng() * 8));
  const count = 2 + Math.floor(rng() * 2);
  for (let stack = 0; stack < count; stack++) {
    const color = shade(F2.bookSpines[Math.floor(rng() * F2.bookSpines.length)], 0.88 + rng() * 0.18);
    px.rect(x + (stack % 2), bottom - stack * 3 - 2, width - (stack % 2), 3, color);
    px.line(x + (stack % 2), bottom - stack * 3 - 2, x + width - 1, bottom - stack * 3 - 2, shade(color, 1.18));
  }
  return width;
}

const f2Configs = [
  { suffix: "b", seed: 2110, shelves: 6, density: 0.83, gaps: 0.13, stacks: 0.03 },
  { suffix: "c", seed: 2120, shelves: 7, density: 0.78, gaps: 0.18, stacks: 0.02 },
  { suffix: "d", seed: 2130, shelves: 6, density: 0.72, gaps: 0.25, stacks: 0.03 },
  { suffix: "e", seed: 2140, shelves: 5, density: 0.82, gaps: 0.13, stacks: 0.04 },
  { suffix: "f", seed: 2150, shelves: 6, density: 0.78, gaps: 0.17, stacks: 0.02, lean: 0.2 },
  { suffix: "g", seed: 2160, shelves: 6, density: 0.64, gaps: 0.3, stacks: 0.06, emptyBay: { row: 2, x: 96, width: 23 } },
  { suffix: "h", seed: 2170, shelves: 6, density: 0.72, gaps: 0.22, stacks: 0.08, brokenEdge: true },
  { suffix: "i", seed: 2180, shelves: 7, density: 0.68, gaps: 0.25, stacks: 0.04, scrolls: true },
  { suffix: "j", seed: 2190, shelves: 6, density: 0.66, gaps: 0.27, stacks: 0.09, collapseEdge: true },
];

function generateF2(config) {
  const rng = mulberry32(config.seed);
  const px = new Px();
  const grain = makeFbm(mulberry32(config.seed + 1), [8, 16, 32]);
  const heights = distribute(L, config.shelves, mulberry32(config.seed + 2), 0.25);
  px.fill(F2.background);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      if (grain(x + 41, y + 17) > 0.61) px.blend(x, y, F2.woodDark, 0.18);
    }
  }

  let y0 = 0;
  const shelves = [];
  for (let row = 0; row < heights.length; row++) {
    const height = heights[row];
    const bottom = y0 + height - 4;
    const maxBookHeight = Math.max(8, height - 7);
    shelves.push({ y0, height, bottom });
    let x = -6 - Math.floor(rng() * 9);
    while (x < L + 8) {
      const groupWidth = 10 + Math.floor(rng() * 18);
      const gapWidth = 3 + Math.floor(rng() * 8);
      const shouldGap = rng() < config.gaps;
      if (shouldGap) {
        x += gapWidth;
        continue;
      }
      const groupEnd = x + groupWidth;
      while (x < groupEnd && x < L + 8) {
        if (rng() > config.density) {
          x += 2 + Math.floor(rng() * 4);
          continue;
        }
        if (rng() < config.stacks && groupEnd - x > 8) {
          x += drawHorizontalStack(px, rng, x, bottom, groupEnd - x) + 1;
          continue;
        }
        const lean = config.lean && rng() < config.lean ? (rng() < 0.5 ? -2 : 2) : rng() < 0.06 ? (rng() < 0.5 ? -1 : 1) : 0;
        x += drawBook(px, rng, x, bottom, maxBookHeight, lean) + 1;
      }
      x = groupEnd + gapWidth;
    }
    y0 += height;
  }

  if (config.emptyBay) {
    const shelf = shelves[config.emptyBay.row];
    px.rect(config.emptyBay.x, shelf.y0 + 4, config.emptyBay.width, shelf.height - 8, F2.background);
    for (let x = 0; x < config.emptyBay.width; x++) {
      if (grain(config.emptyBay.x + x, shelf.y0) > 0.63) px.blend(config.emptyBay.x + x, shelf.bottom, F2.woodDark, 0.3);
    }
  }

  // Boards are drawn over books so each shelf reads as architecture. No
  // full-height uprights: short supports span only one or two bays.
  y0 = 0;
  for (const height of heights) {
    drawWood(px, grain, 0, y0, L, 4, false);
    y0 += height;
  }
  const supportCount = config.suffix === "c" || config.suffix === "i" ? 3 : 2;
  for (let support = 0; support < supportCount; support++) {
    const startRow = Math.floor(rng() * (shelves.length - 2));
    const span = 1 + Math.floor(rng() * 2);
    const x = 12 + Math.floor(rng() * 104);
    const startY = shelves[startRow].y0;
    const end = shelves[Math.min(shelves.length - 1, startRow + span)];
    drawWood(px, grain, x, startY, 3, end.y0 + end.height - startY, true);
  }

  if (config.scrolls) {
    const shelf = shelves[4];
    // Edge-cropped so the scroll mass reads as part of a longer archive bay,
    // never as a small centered emblem when the tile repeats.
    const x0 = 121;
    for (let scroll = 0; scroll < 4; scroll++) {
      const y = shelf.bottom - scroll * 3;
      px.line(x0 + scroll, y, x0 + 12 - scroll, y, shade(F2.paper, 0.75 + scroll * 0.06));
      px.set(x0 + scroll, y - 1, F2.woodDark);
    }
  }

  if (config.brokenEdge || config.collapseEdge) {
    const shelf = shelves[config.collapseEdge ? 3 : 1];
    const width = config.collapseEdge ? 32 : 20;
    px.rect(112, shelf.y0, width, 4, F2.background);
    px.line(112, shelf.y0 + 1, 112 + width - 3, shelf.y0 + (config.collapseEdge ? 8 : 5), F2.woodLight);
    px.line(112, shelf.y0 + 2, 112 + width - 3, shelf.y0 + (config.collapseEdge ? 9 : 6), F2.woodDark);
    if (config.collapseEdge) {
      for (let book = 0; book < 5; book++) {
        const x = 114 + book * 4;
        px.line(x, shelf.y0 + 4 + book, x + 3, shelf.y0 + 10 + book, F2.bookSpines[book]);
      }
    }
  }

  px.posterize(4);
  matchOppositeEdges(px);
  px.save(`f2_wall_${config.suffix}_256.png`);
}

// --- Floor 3: ash forge / molten foundry ----------------------------------

const F3 = {
  stones: [hex("#342e2a"), hex("#2e2926"), hex("#282421"), hex("#38312b"), hex("#2c2723")],
  mortar: hex("#151210"),
  crack: hex("#100e0d"),
  soot: hex("#1d1a19"),
  ember: [hex("#df713b"), hex("#7c351e")],
  slag: [hex("#854427"), hex("#39241d")],
  iron: { light: hex("#55585d"), mid: hex("#36383d"), dark: hex("#1c1d21") },
};

const f3Configs = [
  { suffix: "b", seed: 3110, rows: 8, blockCounts: [4, 5, 4], cracks: 5, ties: 2, sootThreshold: 0.58 },
  { suffix: "c", seed: 3120, rows: 7, blockCounts: [3, 4, 5], cracks: 4, ties: 2, sootThreshold: 0.64 },
  { suffix: "d", seed: 3130, rows: 9, blockCounts: [5, 4, 6], cracks: 3, ties: 3, sootThreshold: 0.62, repair: true },
  { suffix: "e", seed: 3140, rows: 8, blockCounts: [4, 4, 5], cracks: 7, ties: 1, sootThreshold: 0.56 },
  { suffix: "f", seed: 3150, rows: 7, blockCounts: [5, 3, 4], cracks: 4, ties: 4, sootThreshold: 0.67 },
  { suffix: "g", seed: 3160, rows: 8, blockCounts: [4, 5, 3], cracks: 6, ties: 2, sootThreshold: 0.5, slagScar: 18 },
  { suffix: "h", seed: 3170, rows: 7, blockCounts: [3, 4, 4], cracks: 8, ties: 2, sootThreshold: 0.57, slagScar: 25 },
  { suffix: "i", seed: 3180, rows: 9, blockCounts: [5, 5, 4], cracks: 5, ties: 1, sootThreshold: 0.54, brokenBand: true },
  { suffix: "j", seed: 3190, rows: 7, blockCounts: [3, 5, 4], cracks: 8, ties: 2, sootThreshold: 0.48, slagScar: 38 },
];

function generateF3(config) {
  const sootNoise = makeFbm(mulberry32(config.seed + 40), [4, 8, 16]);
  const baseStain = { noise: sootNoise, threshold: config.sootThreshold, color: F3.soot, amount: 0.3 };
  const { px } = stoneWall({ ...config, stones: F3.stones, mortar: F3.mortar, baseStain, chips: 4 });
  drawHairlineCracks(px, config.seed + 10, config.cracks, F3.crack, { minLength: 4, extraLength: 5, amount: 0.8 });
  // Ember punctuation is deliberately sparse; the canonical wall already
  // carries the family's strongest crack network.
  const emberRng = mulberry32(config.seed + 20);
  const emberCount = config.suffix === "j" ? 5 : config.suffix >= "g" ? 3 : 2;
  for (let i = 0; i < emberCount; i++) {
    const x = Math.floor(emberRng() * L);
    const y = Math.floor(emberRng() * L);
    crackWalk(emberRng, x, y, 3 + Math.floor(emberRng() * 5), [0.18, 0.75], (plotX, plotY) => {
      px.blend(plotX, plotY, F3.ember[0], 0.82);
      px.blend(plotX + 1, plotY, F3.ember[1], 0.45);
    });
  }
  drawIronTies(px, config.seed + 30, F3.iron, { count: config.ties });
  if (config.repair) {
    // Three non-adjacent stones, only slightly lighter than the family mean.
    for (const [x, y, w, h] of [[7, 19, 15, 8], [72, 47, 18, 9], [105, 91, 13, 8]]) {
      for (let py = 0; py < h; py++) for (let pX = 0; pX < w; pX++) px.blend(x + pX, y + py, hex("#584b40"), 0.22);
    }
  }
  if (config.brokenBand) drawBrokenRail(px, config.seed + 50, { ...F3.iron, mark: F3.ember[1] }, { y: 67, segments: [[-6, 18], [29, 25], [78, 17], [111, 11]] });
  if (config.slagScar) drawEdgeScar(px, config.seed + 60, F3.slag, { length: config.slagScar, verticalBias: 0.28, amount: config.suffix === "j" ? 0.86 : 0.62 });
  px.posterize(4);
  matchOppositeEdges(px);
  px.save(`f3_wall_${config.suffix}_256.png`);
}

// --- Floor 4: The Null Choir ----------------------------------------------

const F4 = {
  stones: [hex("#464251"), hex("#3d3a47"), hex("#4e4958"), hex("#373440"), hex("#474153")],
  mortar: hex("#211e28"),
  coldShadow: hex("#2b2934"),
  void: hex("#17161e"),
  score: { light: hex("#827e99"), dark: hex("#302d3b") },
  rail: { light: hex("#706c82"), mid: hex("#504c5e"), dark: hex("#2a2734"), mark: hex("#8b879d") },
};

const f4Configs = [
  { suffix: "b", seed: 4110, rows: 8, blockCounts: [4, 5, 4], scores: 2 },
  { suffix: "c", seed: 4120, rows: 7, blockCounts: [3, 4, 5], scores: 1, rail: true },
  { suffix: "d", seed: 4130, rows: 9, blockCounts: [5, 4, 5], scores: 3 },
  { suffix: "e", seed: 4140, rows: 8, blockCounts: [4, 3, 5], scores: 1, voids: 3 },
  { suffix: "f", seed: 4150, rows: 7, blockCounts: [5, 4, 4], scores: 4 },
  { suffix: "g", seed: 4160, rows: 8, blockCounts: [4, 5, 3], scores: 2, longScore: true },
  { suffix: "h", seed: 4170, rows: 7, blockCounts: [3, 4, 4], scores: 2, voids: 5, collapsedEdge: true },
  { suffix: "i", seed: 4180, rows: 9, blockCounts: [5, 5, 4], scores: 2, rail: true, brokenRail: true },
  { suffix: "j", seed: 4190, rows: 7, blockCounts: [3, 5, 4], scores: 3, erasedRecess: true },
];

function generateF4(config) {
  const baseStain = {
    noise: makeFbm(mulberry32(config.seed + 40), [6, 12, 24]),
    threshold: 0.67,
    color: F4.coldShadow,
    amount: 0.18,
  };
  const { px } = stoneWall({ ...config, stones: F4.stones, mortar: F4.mortar, baseStain, chips: 4 });
  for (let score = 0; score < config.scores; score++) {
    drawErasedScore(px, config.seed + 10 + score * 7, F4.score, { amount: config.suffix <= "f" ? 0.32 : 0.46 });
  }
  if (config.rail) drawBrokenRail(px, config.seed + 30, F4.rail, config.brokenRail ? { y: 72, segments: [[-9, 16], [23, 13], [48, 27], [98, 14], [122, 7]] } : { y: 56 });
  const voidRng = mulberry32(config.seed + 50);
  for (let i = 0; i < (config.voids ?? 0); i++) {
    const width = 4 + Math.floor(voidRng() * 7);
    const height = 2 + Math.floor(voidRng() * 4);
    const x = Math.floor(voidRng() * L);
    const y = Math.floor(voidRng() * L);
    for (let py = 0; py < height; py++) for (let pX = 0; pX < width; pX++) px.blend(x + pX, y + py, F4.void, 0.62);
  }
  if (config.longScore) drawErasedScore(px, config.seed + 70, F4.score, { y: 93, amount: 0.58, fromRight: false });
  if (config.collapsedEdge) {
    // Several shallow, masonry-aligned losses. The first draft used a single
    // diagonal wedge, which repeated as a row of black slash marks.
    for (const [y0, height, width] of [[22, 8, 8], [61, 10, 12], [103, 6, 7]]) {
      for (let y = y0; y < y0 + height; y++) {
        const jag = (y - y0) % 3 === 0 ? 2 : 0;
        for (let x = 0; x < width + jag; x++) px.blend(L - 1 - x, y, F4.void, 0.6);
      }
    }
  }
  if (config.erasedRecess) {
    // A rare edge-cropped architectural erasure made from offset missing
    // stone shelves. Deliberately angular: the curved first draft formed a
    // crescent/eye in the 3x3 repeat test and was rejected.
    for (const [y0, height, width] of [[31, 11, 13], [43, 9, 22], [54, 13, 29], [68, 9, 19], [79, 12, 11]]) {
      for (let y = y0; y < y0 + height; y++) {
        const jag = (y + y0) % 4 === 0 ? 2 : 0;
        for (let x = 0; x < width + jag; x++) {
          px.blend(L - 1 - x, y, x < width - 3 ? F4.void : F4.coldShadow, x < width - 3 ? 0.77 : 0.48);
        }
      }
    }
    drawErasedScore(px, config.seed + 90, F4.score, { y: 42, amount: 0.63, fromRight: true });
  }
  px.posterize(4);
  matchOppositeEdges(px);
  px.save(`f4_wall_${config.suffix}_256.png`);
}

// --- Floor 5: The Weeping Cistern -----------------------------------------

const F5 = {
  stones: [hex("#26373b"), hex("#213136"), hex("#2a3d40"), hex("#1c2c30"), hex("#2e4145")],
  mortar: hex("#0f181b"),
  wet: hex("#142a2e"),
  mineral: { light: hex("#609b90"), mid: hex("#32675f"), dark: hex("#183b39") },
  tide: { mid: hex("#244d49"), dark: hex("#143330") },
  algae: [hex("#285246"), hex("#315f50"), hex("#23453e")],
};

const f5Configs = [
  { suffix: "b", seed: 5110, rows: 8, blockCounts: [4, 5, 4], seeps: 2, growth: 1 },
  { suffix: "c", seed: 5120, rows: 7, blockCounts: [3, 4, 5], seeps: 2, growth: 2, tide: 0.24 },
  { suffix: "d", seed: 5130, rows: 9, blockCounts: [5, 4, 5], seeps: 5, growth: 2 },
  { suffix: "e", seed: 5140, rows: 8, blockCounts: [4, 3, 5], seeps: 3, growth: 2, eroded: true },
  { suffix: "f", seed: 5150, rows: 7, blockCounts: [5, 4, 4], seeps: 2, growth: 3, mineralFlecks: 18 },
  { suffix: "g", seed: 5160, rows: 8, blockCounts: [4, 5, 3], seeps: 7, growth: 3 },
  { suffix: "h", seed: 5170, rows: 7, blockCounts: [3, 4, 4], seeps: 4, growth: 4, tide: 0.32 },
  { suffix: "i", seed: 5180, rows: 9, blockCounts: [5, 5, 4], seeps: 4, growth: 12 },
  { suffix: "j", seed: 5190, rows: 7, blockCounts: [3, 5, 4], seeps: 6, growth: 5, mineralScar: 34 },
];

function generateF5(config) {
  const wetNoise = makeFbm(mulberry32(config.seed + 40), [4, 8, 16]);
  const baseStain = { noise: wetNoise, threshold: config.suffix === "b" ? 0.77 : 0.61, color: F5.wet, amount: config.suffix === "b" ? 0.12 : 0.28 };
  const { px, rows } = stoneWall({ ...config, stones: F5.stones, mortar: F5.mortar, baseStain, chips: config.eroded ? 6 : 3 });
  drawVerticalSeeps(px, rows, config.seed + 10, F5.mineral.dark, { count: config.seeps, minLength: 9, extraLength: 20, amount: config.suffix >= "g" ? 0.42 : 0.3 });
  drawSeamGrowth(px, rows, config.seed + 20, F5.algae, { patches: config.growth, minLength: 2, extraLength: 4, amount: 0.54, spread: 0.22 });
  if (config.tide) drawTideLine(px, config.seed + 30, F5.tide, { amount: config.tide });
  const fleckRng = mulberry32(config.seed + 50);
  for (let i = 0; i < (config.mineralFlecks ?? 0); i++) {
    const x = Math.floor(fleckRng() * L);
    const y = Math.floor(fleckRng() * L);
    px.blend(x, y, fleckRng() < 0.25 ? F5.mineral.light : F5.mineral.mid, 0.52);
  }
  if (config.mineralScar) drawEdgeScar(px, config.seed + 60, [F5.mineral.mid, F5.mineral.dark], { length: config.mineralScar, verticalBias: 0.72, amount: 0.68 });
  px.posterize(4);
  matchOppositeEdges(px);
  px.save(`f5_wall_${config.suffix}_256.png`);
}

for (const config of f1Configs) generateF1(config);
for (const config of f2Configs) generateF2(config);
for (const config of f3Configs) generateF3(config);
for (const config of f4Configs) generateF4(config);
for (const config of f5Configs) generateF5(config);
