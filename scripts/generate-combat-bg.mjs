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
 * (by direct tiling tests) to repeat cleanly and composes them as two bands
 * in classic FF style: a modest wall backdrop on top (~21% of the canvas)
 * and a dominant floor plane where the combatants stand. Perspective is
 * sold three ways: the floor tiles are drawn at 2× the wall's tile size
 * (nearer plane, bigger texel), the floor brightens toward the viewer while
 * the wall is uniformly dimmed so sprites pop against it, and the seam gets
 * a baseboard-darkened wall row plus a soft contact-shadow gradient cast
 * onto the floor.
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

// Row where the wall ends and the floor begins (0-indexed, in 16px tile
// rows). Sprite feet sit ~7% of sprite size below the position anchor (see
// drawShadow callers in combat-scene.ts), so with party/enemy anchors at
// h*0.27+/h*0.29+ every combatant's feet land on the floor plane with room
// to spare, while the wall stays a backdrop band behind their heads.
const WALL_ROWS = 9;
const WALL_HEIGHT = WALL_ROWS * TILE_SIZE;

// The floor is drawn at 2× tile scale: a nearer, coarser plane reads as
// horizontal ground instead of a darker copy of the wall grid.
const FLOOR_TILE_SIZE = 32;
const FLOOR_COLS = Math.ceil(OUTPUT_WIDTH / FLOOR_TILE_SIZE);
const FLOOR_ROWS = Math.ceil((OUTPUT_HEIGHT - WALL_HEIGHT) / FLOOR_TILE_SIZE);

// How much the wall is uniformly dimmed so the high-contrast mortar pattern
// stops competing with sprites.
const WALL_DIM = 0.12;

// Floor value ramp: slightly shadowed where it meets the wall, brightening
// toward the viewer at the bottom edge.
const FLOOR_SHADE_NEAR_WALL = 0.1; // extra darken at the seam row
const FLOOR_BRIGHTEN_AT_BOTTOM = 0.14; // brighten at the last row

// Contact shadow the wall casts onto the floor (px, fading to nothing).
const CONTACT_SHADOW_PX = 10;
const CONTACT_SHADOW_ALPHA = 0.4;

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

/** Nearest-neighbor upscale of a square RGBA tile buffer by an integer factor. */
function upscaleTile(tileData, size, factor) {
  const outSize = size * factor;
  const out = Buffer.alloc(outSize * outSize * 4);
  for (let y = 0; y < outSize; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < outSize; x++) {
      const sx = Math.floor(x / factor);
      const src = (sy * size + sx) * 4;
      const dst = (y * outSize + x) * 4;
      tileData.copy(out, dst, src, src + 4);
    }
  }
  return out;
}

/**
 * Scale a tile's brightness. Negative amount darkens toward black, positive
 * brightens (clamped at white). Alpha is preserved.
 */
function shade(tileData, amount) {
  const out = Buffer.from(tileData);
  const factor = 1 + Math.max(-1, amount);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.min(255, Math.round(out[i] * factor));
    out[i + 1] = Math.min(255, Math.round(out[i + 1] * factor));
    out[i + 2] = Math.min(255, Math.round(out[i + 2] * factor));
  }
  return out;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Copy a square tile buffer into the output PNG, clipping at the bottom edge. */
function blit(png, tileData, tileSize, dx, dy) {
  for (let y = 0; y < tileSize; y++) {
    if (dy + y >= OUTPUT_HEIGHT) break;
    const srcOffset = y * tileSize * 4;
    const dstOffset = ((dy + y) * OUTPUT_WIDTH + dx) * 4;
    tileData.copy(png.data, dstOffset, srcOffset, srcOffset + tileSize * 4);
  }
}

function render(wallTiles, floorTiles, outputPath) {
  const png = new PNG({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT });

  // --- Wall band (16px tiles, uniformly dimmed, ceiling shade on top) ---
  for (let cy = 0; cy < WALL_ROWS; cy++) {
    let amount = -WALL_DIM;
    if (cy < 3) amount -= (3 - cy) * 0.08; // ceiling shade
    if (cy === WALL_ROWS - 1) amount -= 0.18; // baseboard/trim row
    for (let cx = 0; cx < COLS; cx++) {
      const jitter = (Math.random() - 0.5) * 0.06;
      const tile = shade(pickRandom(wallTiles), amount + jitter);
      blit(png, tile, TILE_SIZE, cx * TILE_SIZE, cy * TILE_SIZE);
    }
  }

  // --- Floor plane (32px tiles, brightening toward the viewer) ---
  for (let fy = 0; fy < FLOOR_ROWS; fy++) {
    const t = FLOOR_ROWS > 1 ? fy / (FLOOR_ROWS - 1) : 1;
    const amount = -FLOOR_SHADE_NEAR_WALL + t * (FLOOR_SHADE_NEAR_WALL + FLOOR_BRIGHTEN_AT_BOTTOM);
    for (let fx = 0; fx < FLOOR_COLS; fx++) {
      const jitter = (Math.random() - 0.5) * 0.06;
      const tile = shade(pickRandom(floorTiles), amount + jitter);
      blit(png, tile, FLOOR_TILE_SIZE, fx * FLOOR_TILE_SIZE, WALL_HEIGHT + fy * FLOOR_TILE_SIZE);
    }
  }

  // --- Contact shadow: the wall grounds itself on the floor ---
  for (let y = 0; y < CONTACT_SHADOW_PX; y++) {
    const alpha = CONTACT_SHADOW_ALPHA * (1 - y / CONTACT_SHADOW_PX);
    const row = WALL_HEIGHT + y;
    for (let x = 0; x < OUTPUT_WIDTH; x++) {
      const i = (row * OUTPUT_WIDTH + x) * 4;
      png.data[i] = Math.round(png.data[i] * (1 - alpha));
      png.data[i + 1] = Math.round(png.data[i + 1] * (1 - alpha));
      png.data[i + 2] = Math.round(png.data[i + 2] * (1 - alpha));
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function main() {
  console.log("Loading Classic Dungeons tile sheets...");
  const wallsPng = readPng(path.join(classicDir, "classic_dungeons_WALLS.png"));
  const floorPng = readPng(path.join(classicDir, "classic_dungeons_stone_floor.png"));

  const wallTiles = WALL_TILE_INDICES.map((i) => sliceTile(wallsPng, WALL_SHEET_COLS, i));
  const floorTiles = FLOOR_TILE_INDICES.map((i) =>
    upscaleTile(sliceTile(floorPng, FLOOR_SHEET_COLS, i), TILE_SIZE, FLOOR_TILE_SIZE / TILE_SIZE)
  );

  const outputPath = path.join(srcAssetsDir, "combat-bg.png");
  if (!fs.existsSync(srcAssetsDir)) fs.mkdirSync(srcAssetsDir, { recursive: true });
  console.log(`Rendering ${OUTPUT_WIDTH}×${OUTPUT_HEIGHT} background -> ${outputPath}`);
  render(wallTiles, floorTiles, outputPath);
  console.log("Done.");
}

main();
