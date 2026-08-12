// Deterministic maze-prop sprite generator.
//
// Builds the corridor feature props listed in `src/data/maze-props.ts` — the
// engine already looks these ids up and falls back to a text glyph when the art
// is missing, so dropping the PNGs here plus a `MAP_SPRITES` entry is the whole
// wiring job. No renderer change.
//
// Source art is the Electric Lemon "Classic Dungeons" pack under
// `assets/Classic Dungeons - Files/`, which is authored on the 16-colour PICO-8
// palette at 16x16. That constraint is why it reads as real 16-bit work: three
// to six colours per object, hard edges, one-pixel near-black outline. We keep
// that discipline by only ever remapping palette entries 1:1 — never blending,
// never resampling with a smoothing filter — so an output prop can never have
// more colours than its source cell.
//
// Pack licence (`License - No Attribution Required.txt`): free use inside a game
// product, no attribution required, redistribution of the raw pack prohibited.
// Shipping derived sprites inside the game is exactly the permitted case.
//
// Everything is deterministic: re-running reproduces byte-identical PNGs.
// Dev tooling only — not part of the build.
//
// Usage: node scripts/generate-maze-props.mjs

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "assets", "Classic Dungeons - Files");
const OUT_DIR = join(ROOT, "public", "assets", "map-sprites");

const CELL = 16; // source cell size
const SCALE = 2; // integer nearest-neighbour upscale -> 32x32 output
const OUT = CELL * SCALE;

// --- PICO-8 source palette ---------------------------------------------------
// Every colour the pack uses. Named so recipes read as intent rather than hex.

const P8 = {
  BLACK: "#000000",
  DARKBLUE: "#1D2B53",
  DARKPURPLE: "#7E2553",
  DARKGREEN: "#008751",
  BROWN: "#A46422",
  DARKGREY: "#5F574F",
  LIGHTGREY: "#C2C3C7",
  WHITE: "#FFF1E8",
  RED: "#FF004D",
  ORANGE: "#FFA300",
  YELLOW: "#FFEC27",
  GREEN: "#00E436",
  BLUE: "#29ADFF",
  INDIGO: "#83769C",
  PINK: "#FF77A8",
  PEACH: "#FFCCAA",
};

// --- Tiny RGBA canvas --------------------------------------------------------

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

class Buf {
  constructor(size) {
    this.size = size;
    this.d = new Uint8Array(size * size * 4); // all transparent
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
  /** Paint only where something is already opaque — keeps silhouettes intact. */
  setIfOpaque(x, y, rgb) {
    if (!this.inside(x, y)) return;
    if (this.d[this.idx(x, y) + 3] === 0) return;
    this.set(x, y, rgb);
  }
}

/** Load a sheet once and hand back a 16x16 cell as an RGBA Buf. */
const sheetCache = new Map();
function cell(sheet, col, row) {
  let png = sheetCache.get(sheet);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(SRC_DIR, `${sheet}.png`)));
    sheetCache.set(sheet, png);
  }
  const buf = new Buf(CELL);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const si = ((row * CELL + y) * png.width + (col * CELL + x)) * 4;
      const di = buf.idx(x, y);
      buf.d[di] = png.data[si];
      buf.d[di + 1] = png.data[si + 1];
      buf.d[di + 2] = png.data[si + 2];
      // Source alpha is already binary; anything not fully opaque is background.
      buf.d[di + 3] = png.data[si + 3] >= 128 ? 255 : 0;
    }
  }
  return buf;
}

/**
 * Remap palette entries 1:1. `map` is source-hex -> target-hex, or null to cut
 * the colour to transparency (used to snuff the darkness idol's flame).
 * Throws on an unmapped opaque colour: silent pass-through is how a prop ends
 * up half in the source palette and half in ours.
 */
function recolor(buf, map) {
  const lut = new Map();
  for (const [from, to] of Object.entries(map)) {
    lut.set(from.toUpperCase(), to === null ? null : hex(to));
  }
  for (let y = 0; y < buf.size; y++) {
    for (let x = 0; x < buf.size; x++) {
      const [r, g, b, a] = buf.get(x, y);
      if (a === 0) continue;
      const key =
        "#" +
        [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      if (!lut.has(key)) {
        throw new Error(`unmapped source colour ${key} at ${x},${y}`);
      }
      const to = lut.get(key);
      if (to === null) buf.set(x, y, [0, 0, 0], 0);
      else buf.set(x, y, to);
    }
  }
  return buf;
}

/**
 * Author a cell as an ASCII map. Used for the two props the pack has no art
 * for. Hand-placing every pixel is the whole point: at 16x16 a generated blob
 * and a deliberate silhouette are the same number of pixels, and only one of
 * them reads at corridor distance.
 */
function fromAscii(rows, legend) {
  if (rows.length !== CELL) throw new Error(`ascii art needs ${CELL} rows, got ${rows.length}`);
  const buf = new Buf(CELL);
  rows.forEach((row, y) => {
    if (row.length !== CELL) throw new Error(`row ${y} is ${row.length} chars, need ${CELL}`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const c = legend[ch];
      if (!c) throw new Error(`row ${y} char ${x}: '${ch}' missing from legend`);
      buf.set(x, y, hex(c));
    });
  });
  return buf;
}

/** Stamp an ASCII overlay onto existing art. '.' leaves the pixel alone. */
function stamp(buf, rows, colorHex, ox = 0, oy = 0) {
  const c = hex(colorHex);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") buf.setIfOpaque(x + ox, y + oy, c);
    });
  });
  return buf;
}

/** Re-add a one-pixel near-black outline where art meets transparency. */
function outline(buf, colorHex = "#0b0b10") {
  const c = hex(colorHex);
  const edges = [];
  for (let y = 0; y < buf.size; y++) {
    for (let x = 0; x < buf.size; x++) {
      if (buf.get(x, y)[3] !== 0) continue;
      const touching =
        [
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

// --- Output ------------------------------------------------------------------

/**
 * Drop the art so its lowest opaque row is the last row of the cell.
 *
 * `placeBillboard` returns `drawY = floorLine - size` and the renderer draws the
 * whole PNG into a `size` square, so it is the *bottom edge of the canvas* that
 * lands on the floor — not the bottom of the art. Any empty rows underneath a
 * prop become a proportional gap that grows with proximity, which reads as the
 * prop hovering. Grounding here rather than compensating with `baseSize` is the
 * fix, because `baseSize` scales and the problem is translation.
 */
function ground(buf) {
  let bottom = -1;
  for (let y = buf.size - 1; y >= 0 && bottom < 0; y--) {
    for (let x = 0; x < buf.size; x++) {
      if (buf.get(x, y)[3] !== 0) {
        bottom = y;
        break;
      }
    }
  }
  const dy = buf.size - 1 - bottom;
  if (bottom < 0 || dy === 0) return buf;
  const out = new Buf(buf.size);
  for (let y = 0; y < buf.size; y++) {
    for (let x = 0; x < buf.size; x++) {
      const [r, g, b, a] = buf.get(x, y);
      if (a !== 0) out.set(x, y + dy, [r, g, b], a);
    }
  }
  return out;
}

function save(rawBuf, name) {
  const buf = ground(rawBuf);
  const png = new PNG({ width: OUT, height: OUT });
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      const [r, g, b, a] = buf.get((x / SCALE) | 0, (y / SCALE) | 0);
      const i = (y * OUT + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a === 0 ? 0 : 255; // binary alpha, always
    }
  }
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 255) colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
  }
  if (colors.size > 24) throw new Error(`${name}: ${colors.size} colours exceeds the 24 budget`);
  writeFileSync(join(OUT_DIR, name), PNG.sync.write(png));
  console.log(`wrote ${name}  ${OUT}x${OUT}  ${colors.size} colours`);
}

// --- Prop recipes ------------------------------------------------------------
// Each prop names its source cell and a full palette map. Target ramps follow
// the material stories in docs/MAZE-EVENT-SPRITE-PROMPT.md so props sit inside
// the corridor's colour world instead of fighting the tilesets.

// chestClosed()/chestOpen() were retired 2026-08-12: the harvested source cell
// (classic_dungeons_animated_box_chest 0,0 / 3,0) is a low-detail, near-flat
// silhouette at 32x32 in-corridor scale — no wood-grain shading, no metal
// ramp on the bands, just a handful of flat recolored fills, which read as
// crude vector-style art rather than SNES-era pixel art next to the rest of
// the shipped props. Production art for `chest-closed`/`chest-open` is now
// AI-generated, following the same path as `anvil-altar`/`cistern-basin` (see
// docs/MAZE-EVENT-SPRITE-PROMPT.md #1-2). They are no longer part of this
// deterministic byte-identical batch. Do not re-add `save(..., "chest-closed.png")`
// / `save(..., "chest-open.png")` calls here without checking that doc first.

// cisternBasin() was retired 2026-08-11: the harvested source cell (general_detail
// 5,1) is a pot/urn silhouette, not a basin, and at 32x32 in-corridor its dark
// "window" plus two drip-highlight accents read as a robot/helmet face rather
// than wet stone. Production art for `cistern-basin` is now AI-generated,
// following the same anvil-altar/forge-guardian-statue path (see
// docs/MAZE-EVENT-SPRITE-PROMPT.md #15) — it is no longer part of this
// deterministic byte-identical batch. Do not re-add a `save(..., "cistern-basin.png")`
// call here without checking that doc first.

/** Antimagic ward — upright stele, purple-grey stone, a struck-through sigil. */
function antimagicWard() {
  const b = cell("classic_dungeons_general_detail", 2, 12);
  recolor(b, {
    [P8.BLACK]: "#0b0a10",
    [P8.INDIGO]: "#6d6480", // stone face
    [P8.DARKGREY]: "#4a4458", // shadowed side
    [P8.DARKBLUE]: "#241f30", // recessed panel
  });
  // The cancelled hymn, struck across the stele's recessed face (x 5-9, y 4-9).
  // A plain X, nine pixels. An earlier pass layered a bar, a stem and a slash
  // and they merged into an unreadable lilac blob at corridor distance — at
  // this size the sigil gets one idea, not three.
  return stamp(
    b,
    [
      "#...#",
      ".#.#.",
      "..#..",
      ".#.#.",
      "#...#",
    ],
    "#b6a9d6",
    5,
    4
  );
}

/**
 * Darkness idol — a squat hooded figure with two void eye sockets.
 *
 * First attempt harvested the pack's skull-and-candle and cut the flame out.
 * That was wrong twice: without its flame the prop lost most of its pixels and
 * read as a grey smudge at 32px, and the skulls it left behind collide with the
 * `bones` decor sprite. Hand-authored instead, so the silhouette is squat and
 * wide enough to survive the distance taper.
 *
 * The accent is deliberately absent — the darkness zone is marked by the one
 * prop in the set that emits nothing.
 */
function darknessIdol() {
  return fromAscii(
    [
      "................",
      "................",
      "......oooo......",
      ".....oddddo.....",
      "....oddmmddo....",
      "....odmmmmdo....",
      "....odmmmmdo....",
      "....odvmmvdo....",
      "....odvmmvdo....",
      "....odmmmmdo....",
      "....oddmmddo....",
      "...oddmmmmddo...",
      "...odmmmmmmdo...",
      "..oddmmmmmmddo..",
      "..ollllllllllo..",
      "...oooooooooo...",
    ],
    {
      o: "#08080c", // outline
      d: "#1e1c24", // hood shadow
      m: "#34313d", // stone body
      l: "#4a4654", // plinth catching what little light there is
      v: "#050508", // eye void — darker than the outline
    }
  );
}

/**
 * Teleporter rune disc — drawn, not harvested. The pack has no floor glyph, and
 * a radially symmetric disc is exactly the case where generated geometry beats
 * hand-cut art: it is a pattern, not an object. Ellipse rather than circle
 * because the corridor camera looks down at the floor.
 */
function teleporterDisc() {
  const b = new Buf(CELL);
  const cx = 7.5;
  const cy = 8.5;
  const rimStone = hex("#3a3448");
  const rimLit = hex("#544a66");
  const inner = hex("#191627");
  const rune = hex("#7fe0d2");
  const runeHot = hex("#c8fff2");

  const ellipse = (rx, ry, fn) => {
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        fn(x, y, dx * dx + dy * dy);
      }
    }
  };

  // Outer stone ring.
  ellipse(7, 4.2, (x, y, d) => {
    if (d <= 1) b.set(x, y, y < cy ? rimStone : rimLit);
  });
  // Inner well.
  ellipse(5, 2.9, (x, y, d) => {
    if (d <= 1) b.set(x, y, inner);
  });
  // Three rune notches on the ring, at fixed angles so the result is stable.
  for (const ang of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
    const rx = Math.round(cx + Math.cos(ang) * 6);
    const ry = Math.round(cy + Math.sin(ang) * 3.5);
    b.setIfOpaque(rx, ry, rune);
    b.setIfOpaque(rx, ry - 1, rune);
  }
  // Cross-bars in the well: the glyph itself, kept non-linguistic.
  for (let x = 4; x <= 11; x++) b.setIfOpaque(x, 8, rune);
  for (let y = 7; y <= 10; y++) b.setIfOpaque(7, y, rune);
  b.setIfOpaque(7, 8, runeHot);
  b.setIfOpaque(8, 8, runeHot);
  return outline(b, "#0a0910");
}

/**
 * Hot Boi's tavern door — a rustic plank door for the Floor 1 hub, distinct
 * from the corridor's own `door.png` (which is a wall-face texture keyed by
 * theme, not by room). This is a floor billboard like every other map
 * sprite: it marks the threshold, it does not gate movement.
 *
 * Source cell (doors sheet, col 3 row 1) is the frontal closed-door panel —
 * picked over the sheet's other closed-door cell (col 0 row 0 of
 * `door_exit_enter`) because that one is a round medallion-style door that
 * reads as a vault, not a tavern. Recoloured into the same small warm
 * family as the sign below (honey wood, wine-red trim, one gold gleam) so
 * the two props read as belonging to the same place.
 */
function tavernDoor() {
  const b = cell("classic_dungeons_doors", 3, 1);
  recolor(b, {
    [P8.BLACK]: "#0b0b10",
    [P8.BROWN]: "#c98a3f", // honey wood — warmer than the chest's, deliberately inviting
    [P8.DARKGREY]: "#6b6259", // iron hardware, same ramp as the chest bands
    [P8.DARKPURPLE]: "#8a2e3f", // wine-red trim — the tavern's colour
    [P8.DARKBLUE]: "#2a2016", // warm shadow, not the cool blue-black elsewhere
    [P8.INDIGO]: "#e8b25a", // one gleam, matches the sign's accent
  });
  return b;
}

/**
 * Hot Boi's tavern sign — hand-authored, not harvested. The pack (checked
 * across `general_detail`, `doors`, `door_exit_enter`) has no hanging-sign
 * art, the same gap `darknessIdol()` hit for the same reason: a generated
 * blob and a deliberate 16x16 silhouette cost the same pixels, only one
 * reads at corridor distance. The board's icon is a deliberately abstract
 * emblem, not a literal tankard — same call the antimagic ward's sigil
 * made ("the sigil gets one idea, not three") — because at this size a
 * detailed mug reads as a smudge, not a mug.
 */
function tavernSign() {
  return fromAscii(
    [
      "................",
      "....cc....cc....",
      "....cc....cc....",
      "...oooooooooo...",
      "..oeeeeeeeeeeo..",
      ".oewwwwwwwwwweo.",
      ".oew........weo.",
      ".oew.wffffw.weo.",
      ".oew.fmmmmf.weo.",
      ".oew.fmgmmf.weo.",
      ".oew.wmmmmw.weo.",
      ".oew........weo.",
      ".oewwwwwwwwwweo.",
      ".oeeeeeeeeeeeeo.",
      "..oooooooooooo..",
      "................",
    ],
    {
      o: "#0b0b10", // outline
      c: "#6b6259", // hanging chain, matches the door's hardware
      e: "#8a5a2b", // board bevel, duller wood
      w: "#c98a3f", // board face, matches the door's honey wood
      m: "#8a2e3f", // emblem body, matches the door's wine-red trim
      f: "#e8d9b8", // emblem highlight band
      g: "#e8b25a", // one gleam, matches the door's accent
    }
  );
}

// -----------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
save(antimagicWard(), "antimagic-ward.png");
save(darknessIdol(), "darkness-idol.png");
save(teleporterDisc(), "teleporter-disc.png");
save(tavernDoor(), "tavern-door.png");
save(tavernSign(), "tavern-sign.png");
console.log("done");
