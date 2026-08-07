// Saint Namanda's mark — hand-authored, not PixelLab. This is a recurring
// worldbuilding motif (church door relief, priest robes, shrines, fonts,
// grave markers) meant to stay visually identical everywhere it appears, and
// PixelLab has no image-to-image edit: every generation is a fresh
// interpretation, which is exactly the failure mode for a symbol whose whole
// point is recognition. Authored once, deterministically, then composited
// (nearest-neighbour, no resampling) onto whatever surface needs it.
//
// Design: an open palm resting in front of a plain ring — echoes the
// "cold hand closes your wounds" heal event already in this chapel. Deliberately
// primitive: no fingers-and-knuckle detail, no halo rays, a single fill
// colour plus one outline, readable at 16x16 and legible when scaled up.
//
// Usage: node scripts/generate-namanda-mark.mjs
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "assets", "symbols");
const CELL = 16;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

class Buf {
  constructor(size) {
    this.size = size;
    this.d = new Uint8Array(size * size * 4);
  }
  idx(x, y) {
    return (y * this.size + x) * 4;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  set(x, y, rgb, a = 255) {
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    this.d[i] = rgb[0];
    this.d[i + 1] = rgb[1];
    this.d[i + 2] = rgb[2];
    this.d[i + 3] = a;
  }
  get(x, y) {
    const i = this.idx(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
}

function outline(buf, colorHex = "#241f18") {
  const c = hex(colorHex);
  const edges = [];
  for (let y = 0; y < buf.size; y++) {
    for (let x = 0; x < buf.size; x++) {
      if (buf.get(x, y)[3] !== 0) continue;
      const touching = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => buf.inside(x + dx, y + dy) && buf.get(x + dx, y + dy)[3] !== 0);
      if (touching) edges.push([x, y]);
    }
  }
  for (const [x, y] of edges) buf.set(x, y, c);
  return buf;
}

function namandaMark() {
  const b = new Buf(CELL);
  const ringFill = hex("#8f8168"); // dimmer worn bronze — reads as "behind"
  const handFill = hex("#cfc3ab"); // pale worn stone/bone — reads as "in front"
  const cx = 7.5;
  const cy = 7.8;

  // Plain ring, mostly eclipsed by the hand — a halo peeking out at the
  // edges, not a face outline. Radius sized to clear the fingertip row.
  const R = 7.3;
  const THICK = 0.85;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - R) < THICK) b.set(x, y, ringFill);
    }
  }

  // Open palm, drawn on top: four single-pixel-wide fingers held apart by
  // a full-height gap before merging into the palm, a thumb notch on the
  // left. Unconditional overwrite — the hand sits in front of the ring.
  const rows = [
    "................",
    "................",
    "...o.o.o.o......",
    "...o.o.o.o......",
    "...o.o.o.o......",
    "...o.o.o.o......",
    "...oooooooo.....",
    "..oooooooooo....",
    ".ooooooooooo....",
    ".ooooooooooo....",
    "..oooooooooo....",
    "...oooooooo.....",
    "................",
    "................",
    "................",
    "................",
  ];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "o") b.set(x, y, handFill);
    });
  });

  return outline(b);
}

function save(buf, name, scale) {
  const out = CELL * scale;
  const png = new PNG({ width: out, height: out });
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const [r, g, bl, a] = buf.get((x / scale) | 0, (y / scale) | 0);
      const i = (y * out + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = bl;
      png.data[i + 3] = a === 0 ? 0 : 255;
    }
  }
  writeFileSync(join(OUT_DIR, name), PNG.sync.write(png));
  console.log(`wrote ${name}  ${out}x${out}`);
}

mkdirSync(OUT_DIR, { recursive: true });
const mark = namandaMark();
save(mark, "namanda-mark.png", 2); // 32x32, for in-scene use (shrines, priest, fonts)
save(mark, "namanda-mark-large.png", 8); // 128x128, reference/inspection size
save(mark, "namanda-mark-relief.png", 3); // 48x48, sized for the church-door panel composite
