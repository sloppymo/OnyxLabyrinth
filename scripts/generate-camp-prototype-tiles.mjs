// Draft-only false-outdoor material generator for The Camp's P0 visual gate.
// Art is authored on a 64x64 logical grid and nearest-neighbor scaled to the
// renderer's 256x256 tiles. Production replacements come from PixelLab after
// the in-engine ceiling-as-sky approach proves itself.
//
// Usage: node scripts/generate-camp-prototype-tiles.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "assets", "tilesets", "camp");
const CEILING_FEATURE_OUT = join(ROOT, "public", "assets", "ceiling-features");
const LOGICAL = 64;
const SCALE = 4;

const palette = {
  sky: [27, 39, 58],
  skyLift: [30, 43, 63],
  cloud: [25, 36, 53],
  cloudDeep: [23, 33, 49],
  dirt: [66, 57, 45],
  dirtDark: [51, 45, 38],
  dirtLift: [81, 68, 49],
  mud: [43, 43, 39],
  straw: [112, 93, 57],
  olive: [66, 71, 48],
  stone: [64, 68, 66],
  stoneDark: [42, 47, 48],
  stoneLift: [85, 87, 78],
  mortar: [33, 38, 40],
  timber: [72, 50, 34],
  timberDark: [40, 31, 26],
  timberLift: [105, 72, 43],
  iron: [47, 50, 50],
};

function texture(fill) {
  const pixels = Array.from({ length: LOGICAL * LOGICAL }, () => [...fill]);
  return {
    set(x, y, color) {
      if (x < 0 || y < 0 || x >= LOGICAL || y >= LOGICAL) return;
      pixels[y * LOGICAL + x] = [...color];
    },
    fillRect(x, y, w, h, color) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) this.set(px, py, color);
      }
    },
    clone() {
      const copy = texture([0, 0, 0]);
      for (let y = 0; y < LOGICAL; y++) {
        for (let x = 0; x < LOGICAL; x++) copy.set(x, y, pixels[y * LOGICAL + x]);
      }
      return copy;
    },
    save(name, dir = OUT) {
      const png = new PNG({ width: LOGICAL * SCALE, height: LOGICAL * SCALE });
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const color = pixels[Math.floor(y / SCALE) * LOGICAL + Math.floor(x / SCALE)];
          const i = (y * png.width + x) * 4;
          png.data[i] = color[0];
          png.data[i + 1] = color[1];
          png.data[i + 2] = color[2];
          png.data[i + 3] = 255;
        }
      }
      writeFileSync(join(dir, name), PNG.sync.write(png));
    },
  };
}

function skyBase() {
  const t = texture(palette.sky);
  // A near-solid field survives the ceiling caster better than discrete
  // motifs. Very broad 8px clusters create tonal drift without turning each
  // world cell into a repeated cloud stamp. Differences stay deliberately
  // tiny because renderer contrast/brightness adjustment amplifies them.
  for (let by = 0; by < LOGICAL; by += 8) {
    for (let bx = 0; bx < LOGICAL; bx += 8) {
      const n = hash(bx >> 3, by >> 3, 83) % 16;
      const color = n < 3 ? palette.cloud : n > 13 ? palette.skyLift : palette.sky;
      t.fillRect(bx, by, 8, 8, color);
    }
  }
  // Two edge-crossing, jagged charcoal wisps. Their values are close to the
  // field and their silhouettes are long rather than centered/elliptical.
  for (let x = 0; x < LOGICAL; x++) {
    const thickness = 1 + (hash(x >> 2, 9, 31) % 3);
    for (let y = 0; y < thickness; y++) t.set(x, 25 + y, palette.cloudDeep);
    if (x % 3 !== 0) t.set(x, 28, palette.cloud);
  }
  return t;
}

function sky() {
  const base = skyBase();
  base.save("ceiling.png");

  const starA = base.clone();
  starA.set(45, 18, [128, 139, 144]);
  starA.set(46, 18, [73, 91, 108]);
  starA.save("camp-sky-star-a.png", CEILING_FEATURE_OUT);

  const starB = base.clone();
  starB.set(17, 42, [112, 126, 137]);
  starB.set(17, 41, [65, 83, 101]);
  starB.save("camp-sky-star-b.png", CEILING_FEATURE_OUT);
}

function hash(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 69069) >>> 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (n ^ (n >>> 16)) >>> 0;
}

function ground(name, seed, rutOffset) {
  const t = texture(palette.dirt);
  for (let y = 0; y < LOGICAL; y++) {
    for (let x = 0; x < LOGICAL; x++) {
      const n = hash(x >> 1, y >> 1, seed) % 100;
      if (n < 15) t.set(x, y, palette.dirtDark);
      else if (n > 92) t.set(x, y, palette.dirtLift);
      if ((x + rutOffset) % 31 <= 1 && y % 5 !== 0) t.set(x, y, palette.mud);
    }
  }
  // Sparse two-pixel trampled plant remnants.
  for (let i = 0; i < 12; i++) {
    const x = hash(i, seed, 3) % LOGICAL;
    const y = hash(seed, i, 7) % LOGICAL;
    const color = i % 3 === 0 ? palette.straw : palette.olive;
    t.set(x, y, color);
    t.set(x + (i % 2), y - 1, color);
  }
  t.save(name);
}

function wall() {
  const t = texture(palette.mortar);
  for (let row = 0; row < 8; row++) {
    const y = row * 8 + 1;
    const offset = row % 2 ? -8 : 0;
    for (let x = offset; x < LOGICAL; x += 16) {
      const tone = (row + x / 16) % 3 === 0 ? palette.stoneLift : palette.stone;
      t.fillRect(x + 1, y, 14, 6, tone);
      t.fillRect(x + 1, y + 5, 14, 1, palette.stoneDark);
      if ((row * 5 + x) % 7 === 0) t.fillRect(x + 9, y + 2, 3, 1, palette.stoneDark);
    }
  }
  t.save("wall.png");
}

function door() {
  const t = texture(palette.timberDark);
  for (let x = 4; x < 60; x += 8) {
    t.fillRect(x, 2, 7, 60, palette.timber);
    t.fillRect(x, 2, 1, 60, palette.timberLift);
    t.fillRect(x + 6, 2, 1, 60, palette.timberDark);
  }
  t.fillRect(2, 13, 60, 5, palette.iron);
  t.fillRect(2, 47, 60, 5, palette.iron);
  t.fillRect(29, 2, 5, 60, palette.iron);
  t.save("door.png");
}

mkdirSync(OUT, { recursive: true });
mkdirSync(CEILING_FEATURE_OUT, { recursive: true });
sky();
ground("floorA.png", 11, 4);
ground("floorB.png", 29, 19);
wall();
door();
console.log(`Wrote draft Camp tileset to ${OUT}`);
