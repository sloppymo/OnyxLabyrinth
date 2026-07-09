#!/usr/bin/env node
/**
 * Combat background composer.
 *
 * Earlier versions of this script ran a Wave Function Collapse pass over
 * every tile in three Classic Dungeons sheets. WFC only checks that a tile's
 * edge pixels match its neighbor's — it has no idea which tiles are actually
 * *textures* versus one-off set-pieces (doors, archways, skull friezes,
 * mostly-transparent sprites). Matching edges on those produced a mostly
 * black/void image with scattered incoherent fragments floating in it.
 *
 * This version hand-picks a small set of tiles that are visually confirmed
 * (by direct tiling tests) to repeat cleanly — a plain brick wall texture
 * and a crackled stone floor texture — and composes them as two simple
 * bands: wall on top, floor on the bottom, with a soft shadow gradient at
 * the seam and near the ceiling for depth. Small random variety among a
 * handful of near-identical tile variants keeps it from looking like a
 * single stamped-out tile, without risking the WFC failure mode.
 *
 * Output: src/assets/combat-bg.png, imported by combat-scene.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const TILE_SIZE = 16;
const OUTPUT_WIDTH = 768;
const OUTPUT_HEIGHT = 672;
const COLS = Math.floor(OUTPUT_WIDTH / TILE_SIZE);
const ROWS = Math.floor(OUTPUT_HEIGHT / TILE_SIZE);

// Row where the wall ends and the floor begins (0-indexed, in tile rows).
// Character/enemy sprite anchors sit as low as y≈490 of the 672-tall canvas
// (see partyPos/enemyPos/drawShadow in combat-scene.ts) and the DOM menu
// windows cover roughly the bottom 175px — so most of the visible playfield
// needs to read as floor, with only a modest wall band behind the party.
const WALL_ROWS = 12;

// Tile index (row-major, 14 cols/sheet) confirmed by direct visual
// inspection + tiling tests to be plain, fully seamless, non-decorative
// brick texture — no doors, archways, skulls, or mostly-transparent tiles.
// Several neighbors (7, 10, 11, 23, 25...) looked plain at a glance but each
// has a faint vertical mortar seam that turns into a repeating black stripe
// when tiled — only index 24 tiles with zero visible seam in every
// direction, so it's used alone rather than risk reintroducing stripes.
const WALL_TILE_INDICES = [24];
const WALL_SHEET_COLS = 14;

// Tile indices (row-major, 7 cols/sheet) confirmed the same way for the
// crackled stone floor.
const FLOOR_TILE_INDICES = [18, 19, 20, 21];
const FLOOR_SHEET_COLS = 7;

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const srcAssetsDir = path.join(repoRoot, "src", "assets");
const classicDir = path.join(repoRoot, "assets", "Classic Dungeons - Files");

function readPng(file) {
  const data = fs.readFileSync(file);
  return PNG.sync.read(data);
}

function sliceTile(png, sheetCols, index) {
  const tx = index % sheetCols;
  const ty = Math.floor(index / sheetCols);
  const gx = tx * TILE_SIZE;
  const gy = ty * TILE_SIZE;
  const data = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    const srcOffset = ((gy + y) * png.width + gx) * 4;
    const dstOffset = y * TILE_SIZE * 4;
    png.data.copy(data, dstOffset, srcOffset, srcOffset + TILE_SIZE * 4);
  }
  return data;
}

/** Blend a tile's pixels toward black by `amount` (0-1), preserving alpha. */
function darken(tileData, amount) {
  const clamped = Math.max(0, Math.min(1, amount));
  const out = Buffer.from(tileData);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round(out[i] * (1 - clamped));
    out[i + 1] = Math.round(out[i + 1] * (1 - clamped));
    out[i + 2] = Math.round(out[i + 2] * (1 - clamped));
  }
  return out;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function render(wallTiles, floorTiles, outputPath) {
  const png = new PNG({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT });

  for (let cy = 0; cy < ROWS; cy++) {
    const isWall = cy < WALL_ROWS;
    const pool = isWall ? wallTiles : floorTiles;

    // Soft shadow near the ceiling (top 3 rows) and a grounding shadow in
    // the 2 rows straddling the wall/floor seam.
    let shadow = 0;
    if (isWall && cy < 3) shadow = (3 - cy) * 0.08;
    if (cy >= WALL_ROWS - 2 && cy < WALL_ROWS) shadow = 0.22;
    if (cy >= WALL_ROWS && cy < WALL_ROWS + 1) shadow = 0.12;

    for (let cx = 0; cx < COLS; cx++) {
      const base = pickRandom(pool);
      // Tiny per-tile brightness jitter so a single repeated texture doesn't
      // read as an obviously stamped-out grid (alignment stays untouched).
      const jitter = (Math.random() - 0.5) * 0.1;
      const amount = Math.max(0, Math.min(0.6, shadow + jitter));
      const tile = amount > 0 ? darken(base, amount) : base;
      for (let y = 0; y < TILE_SIZE; y++) {
        const srcOffset = y * TILE_SIZE * 4;
        const dstOffset = ((cy * TILE_SIZE + y) * OUTPUT_WIDTH + cx * TILE_SIZE) * 4;
        tile.copy(png.data, dstOffset, srcOffset, srcOffset + TILE_SIZE * 4);
      }
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function main() {
  console.log("Loading Classic Dungeons tile sheets...");
  const wallsPng = readPng(path.join(classicDir, "classic_dungeons_WALLS.png"));
  const floorPng = readPng(path.join(classicDir, "classic_dungeons_stone_floor.png"));

  const wallTiles = WALL_TILE_INDICES.map((i) => sliceTile(wallsPng, WALL_SHEET_COLS, i));
  const floorTiles = FLOOR_TILE_INDICES.map((i) => sliceTile(floorPng, FLOOR_SHEET_COLS, i));

  const outputPath = path.join(srcAssetsDir, "combat-bg.png");
  if (!fs.existsSync(srcAssetsDir)) fs.mkdirSync(srcAssetsDir, { recursive: true });
  console.log(`Rendering ${OUTPUT_WIDTH}×${OUTPUT_HEIGHT} background -> ${outputPath}`);
  render(wallTiles, floorTiles, outputPath);
  console.log("Done.");
}

main();
