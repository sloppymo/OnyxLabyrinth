#!/usr/bin/env node
/**
 * Procedural combat background generator.
 *
 * Slices the Classic Dungeons 16×16 tiles and uses a Simple Tiled Model
 * (constraint propagation / Wave Function Collapse) to generate a coherent
 * dungeon backdrop: stone walls at the top, a floor at the bottom, and
 * transition tiles in between. The result is written to
 * src/assets/combat-bg.png so it can be imported by combat-renderer.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const TILE_SIZE = 16;
const OUTPUT_WIDTH = 768;
const OUTPUT_HEIGHT = 672;
const COLS = Math.floor(OUTPUT_WIDTH / TILE_SIZE);
const ROWS = Math.floor(OUTPUT_HEIGHT / TILE_SIZE);

// Which sheets to use and which region of the output they are allowed in.
const SHEETS = [
  { name: "stone_floor", file: "classic_dungeons_stone_floor.png", weight: 4 },
  { name: "floor_wall_edges", file: "classic_dungeons_stone_floor_wall_edges.png", weight: 2 },
  { name: "walls", file: "classic_dungeons_WALLS.png", weight: 3 },
];

const WALL_ROWS = 5;
const FLOOR_ROWS = 6;
const MAX_RESTARTS = 100;

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const srcAssetsDir = path.join(repoRoot, "src", "assets");
const classicDir = path.join(repoRoot, "assets", "Classic Dungeons - Files");

function readPng(file) {
  const data = fs.readFileSync(file);
  return PNG.sync.read(data);
}

function sliceTiles(sheetName, png, weight) {
  const tiles = [];
  const cols = Math.floor(png.width / TILE_SIZE);
  const rows = Math.floor(png.height / TILE_SIZE);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const gx = tx * TILE_SIZE;
      const gy = ty * TILE_SIZE;
      const tileData = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
      for (let y = 0; y < TILE_SIZE; y++) {
        const srcOffset = ((gy + y) * png.width + gx) * 4;
        const dstOffset = y * TILE_SIZE * 4;
        png.data.copy(tileData, dstOffset, srcOffset, srcOffset + TILE_SIZE * 4);
      }
      tiles.push({
        sheet: sheetName,
        tx,
        ty,
        weight,
        data: tileData,
        edges: extractEdges(tileData),
      });
    }
  }
  return tiles;
}

function extractEdges(tileData) {
  const top = Buffer.alloc(TILE_SIZE * 4);
  const right = Buffer.alloc(TILE_SIZE * 4);
  const bottom = Buffer.alloc(TILE_SIZE * 4);
  const left = Buffer.alloc(TILE_SIZE * 4);
  for (let i = 0; i < TILE_SIZE; i++) {
    tileData.copy(top, i * 4, i * 4, i * 4 + 4);
    tileData.copy(bottom, i * 4, (TILE_SIZE - 1) * TILE_SIZE * 4 + i * 4, (TILE_SIZE - 1) * TILE_SIZE * 4 + i * 4 + 4);
    tileData.copy(left, i * 4, i * TILE_SIZE * 4, i * TILE_SIZE * 4 + 4);
    tileData.copy(right, i * 4, i * TILE_SIZE * 4 + (TILE_SIZE - 1) * 4, i * TILE_SIZE * 4 + (TILE_SIZE - 1) * 4 + 4);
  }
  return {
    top: top.toString("hex"),
    right: right.toString("hex"),
    bottom: bottom.toString("hex"),
    left: left.toString("hex"),
  };
}

function buildCompatibility(tiles) {
  const compat = tiles.map(() => [new Set(), new Set(), new Set(), new Set()]);
  for (let i = 0; i < tiles.length; i++) {
    for (let j = 0; j < tiles.length; j++) {
      if (tiles[i].edges.bottom === tiles[j].edges.top) compat[i][0].add(j); // i above j
      if (tiles[i].edges.right === tiles[j].edges.left) compat[i][1].add(j); // i left of j
      if (tiles[i].edges.top === tiles[j].edges.bottom) compat[i][2].add(j); // i below j
      if (tiles[i].edges.left === tiles[j].edges.right) compat[i][3].add(j); // i right of j
    }
  }
  return compat;
}

function findCellIndex(grid) {
  let minEntropy = Infinity;
  const minIdx = [];
  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i];
    if (cell.collapsed) continue;
    const entropy = cell.options.length + Math.random() * 0.1;
    if (entropy < minEntropy) {
      minEntropy = entropy;
      minIdx.length = 0;
      minIdx.push(i);
    } else if (Math.abs(entropy - minEntropy) < 0.001) {
      minIdx.push(i);
    }
  }
  if (minIdx.length === 0) return -1;
  return minIdx[Math.floor(Math.random() * minIdx.length)];
}

function collapseCell(cell, tiles) {
  if (cell.options.length === 0) {
    cell.collapsed = true;
    cell.tile = -1;
    return;
  }
  const weights = cell.options.map((idx) => tiles[idx].weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < cell.options.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      cell.collapsed = true;
      cell.tile = cell.options[i];
      cell.options = [cell.tile];
      return;
    }
  }
  cell.collapsed = true;
  cell.tile = cell.options[cell.options.length - 1];
  cell.options = [cell.tile];
}

const DIRS = [
  { dx: 0, dy: 1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: -1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 },
];

function propagate(grid, cols, rows, compat, startIdx) {
  const stack = [];
  if (Array.isArray(startIdx)) {
    for (const i of startIdx) stack.push(i);
  } else if (typeof startIdx === "number") {
    stack.push(startIdx);
  } else {
    for (let i = 0; i < grid.length; i++) stack.push(i);
  }

  while (stack.length > 0) {
    const cur = stack.pop();
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    const options = grid[cur].options;
    if (options.length === 0) return false;

    for (const { dx, dy, dir } of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const ni = ny * cols + nx;
      const neighbor = grid[ni];
      if (neighbor.options.length === 0) return false;
      if (neighbor.collapsed) continue;

      const allowed = new Set();
      for (const t of options) {
        for (const j of compat[t][dir]) allowed.add(j);
      }

      const beforeLen = neighbor.options.length;
      neighbor.options = neighbor.options.filter((opt) => allowed.has(opt));
      if (neighbor.options.length === 0) return false;

      if (neighbor.options.length < beforeLen) {
        stack.push(ni);
      }
      if (!neighbor.collapsed && neighbor.options.length === 1) {
        neighbor.collapsed = true;
        neighbor.tile = neighbor.options[0];
        stack.push(ni);
      }
    }
  }
  return true;
}

function generate(tiles, compat) {
  const total = COLS * ROWS;
  const allIndices = tiles.map((_, i) => i);
  const wallIndices = tiles.filter((t) => t.sheet === "walls").map((t) => tiles.indexOf(t));
  const floorIndices = tiles.filter((t) => t.sheet === "stone_floor").map((t) => tiles.indexOf(t));

  for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
    const grid = Array.from({ length: total }, (_, i) => {
      const row = Math.floor(i / COLS);
      let options = allIndices;
      if (row < WALL_ROWS) options = wallIndices.length ? wallIndices : allIndices;
      else if (row >= ROWS - FLOOR_ROWS) options = floorIndices.length ? floorIndices : allIndices;
      return { options: [...options], collapsed: false, tile: -1 };
    });

    const seeded = [];
    for (let i = 0; i < total; i++) {
      if (grid[i].options.length !== allIndices.length) seeded.push(i);
    }
    if (!propagate(grid, COLS, ROWS, compat, seeded.length ? seeded : undefined)) continue;

    let done = false;
    while (!done) {
      if (grid.some((c) => !c.collapsed && c.options.length === 0)) break;
      const idx = findCellIndex(grid);
      if (idx < 0) {
        done = true;
        break;
      }
      collapseCell(grid[idx], tiles);
      if (!propagate(grid, COLS, ROWS, compat, idx)) break;
    }

    if (done) {
      return grid.map((c) => c.tile);
    }
  }
  throw new Error(`Failed to generate combat background after ${MAX_RESTARTS} attempts`);
}

function render(tiles, grid, outputPath) {
  const png = new PNG({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT });
  for (let i = 0; i < grid.length; i++) {
    const tile = tiles[grid[i]];
    const cx = i % COLS;
    const cy = Math.floor(i / COLS);
    for (let y = 0; y < TILE_SIZE; y++) {
      const srcOffset = y * TILE_SIZE * 4;
      const dstOffset = ((cy * TILE_SIZE + y) * OUTPUT_WIDTH + cx * TILE_SIZE) * 4;
      tile.data.copy(png.data, dstOffset, srcOffset, srcOffset + TILE_SIZE * 4);
    }
  }
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function main() {
  console.log("Loading Classic Dungeons tile sheets...");
  const tiles = [];
  for (const sheet of SHEETS) {
    const file = path.join(classicDir, sheet.file);
    console.log(`  ${sheet.file}`);
    const png = readPng(file);
    const sheetTiles = sliceTiles(sheet.name, png, sheet.weight);
    tiles.push(...sheetTiles);
  }
  console.log(`Total tiles: ${tiles.length}`);

  console.log("Building adjacency rules...");
  const compat = buildCompatibility(tiles);

  console.log(`Generating ${COLS}×${ROWS} tilemap...`);
  const grid = generate(tiles, compat);

  const outputPath = path.join(srcAssetsDir, "combat-bg.png");
  if (!fs.existsSync(srcAssetsDir)) fs.mkdirSync(srcAssetsDir, { recursive: true });
  console.log(`Rendering ${OUTPUT_WIDTH}×${OUTPUT_HEIGHT} background -> ${outputPath}`);
  render(tiles, grid, outputPath);
  console.log("Done.");
}

main();
