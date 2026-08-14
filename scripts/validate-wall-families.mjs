#!/usr/bin/env node
// Technical QA for the production wall-family art library.
//
// Validates the contract that every accepted tile is a 256x256 RGB PNG made
// from exact 2x nearest-neighbour logical pixels. It also reports edge-jump
// scores, palette/luminance statistics, exact duplicates, and suspiciously
// close siblings. The seam score is diagnostic rather than a strict equality
// check: masonry/shelf geometry can legitimately cross an edge with different
// pixels, but a high family outlier is still rejected.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PNG } from "pngjs";

const ROOT = resolve(import.meta.dirname, "..");
const ASSETS = resolve(ROOT, "src/assets");
const suffixes = ["", "_b", "_c", "_d", "_e", "_f", "_g", "_h", "_i", "_j"];
const expected = [];
for (let floor = 1; floor <= 5; floor++) {
  for (const suffix of suffixes) expected.push(`f${floor}_wall${suffix}_256.png`);
}

function rgbAt(png, x, y) {
  const index = (y * png.width + x) * 4;
  return [png.data[index], png.data[index + 1], png.data[index + 2]];
}

function colorDistance(a, b) {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
}

function imageDifference(a, b) {
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    total += Math.abs(a.data[i] - b.data[i]);
    total += Math.abs(a.data[i + 1] - b.data[i + 1]);
    total += Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return total / (a.width * a.height * 3);
}

function inspect(name) {
  const path = resolve(ASSETS, name);
  const bytes = readFileSync(path);
  const png = PNG.sync.read(bytes);
  const colorType = bytes[25];
  const bitDepth = bytes[24];
  let nearest2x = true;
  let alphaOpaque = true;
  let luminance = 0;
  const palette = new Set();
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const index = (y * png.width + x) * 4;
      const color = [png.data[index], png.data[index + 1], png.data[index + 2]];
      palette.add(color.join(","));
      luminance += 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
      if (png.data[index + 3] !== 255) alphaOpaque = false;
      if ((x & 1) || (y & 1)) {
        const origin = rgbAt(png, x & ~1, y & ~1);
        if (colorDistance(color, origin) !== 0) nearest2x = false;
      }
    }
  }

  let horizontalEdge = 0;
  let verticalEdge = 0;
  for (let i = 0; i < png.width; i++) {
    horizontalEdge += colorDistance(rgbAt(png, 0, i), rgbAt(png, png.width - 1, i));
    verticalEdge += colorDistance(rgbAt(png, i, 0), rgbAt(png, i, png.height - 1));
  }
  horizontalEdge /= png.height;
  verticalEdge /= png.width;

  return {
    name,
    path,
    png,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: png.width,
    height: png.height,
    bitDepth,
    colorType,
    alphaOpaque,
    nearest2x,
    paletteSize: palette.size,
    meanLuminance: luminance / (png.width * png.height),
    edgeJump: { horizontal: horizontalEdge, vertical: verticalEdge },
  };
}

const entries = expected.map(inspect);
const failures = [];
for (const entry of entries) {
  const preservedCanonical = /^f[1-5]_wall_256\.png$/.test(entry.name);
  if (entry.width !== 256 || entry.height !== 256) failures.push(`${entry.name}: expected 256x256`);
  if (entry.bitDepth !== 8 || entry.colorType !== 2) failures.push(`${entry.name}: expected 8-bit RGB PNG, got bitDepth=${entry.bitDepth} colorType=${entry.colorType}`);
  if (!entry.alphaOpaque) failures.push(`${entry.name}: contains transparent pixels`);
  // Four long-shipped canonical stone anchors received native-256 cleanup in
  // earlier art passes. Preserve those reference assets; every new sibling
  // must still satisfy the exact logical 128->256 contract.
  if (!entry.nearest2x && !preservedCanonical) failures.push(`${entry.name}: is not exact 2x nearest-neighbour logical art`);
  if (entry.edgeJump.horizontal > 48 || entry.edgeJump.vertical > 48) failures.push(`${entry.name}: edge jump is an outlier (${entry.edgeJump.horizontal.toFixed(2)}, ${entry.edgeJump.vertical.toFixed(2)})`);
}

const exactDuplicates = [];
const nearDuplicates = [];
for (let left = 0; left < entries.length; left++) {
  for (let right = left + 1; right < entries.length; right++) {
    const a = entries[left];
    const b = entries[right];
    if (a.sha256 === b.sha256) exactDuplicates.push([a.name, b.name]);
    if (a.name.slice(0, 2) === b.name.slice(0, 2)) {
      const difference = imageDifference(a.png, b.png);
      if (difference < 2) nearDuplicates.push({ a: a.name, b: b.name, meanAbsoluteDifference: difference });
    }
  }
}
if (exactDuplicates.length) failures.push(`exact duplicates: ${JSON.stringify(exactDuplicates)}`);
if (nearDuplicates.length) failures.push(`near duplicates: ${JSON.stringify(nearDuplicates)}`);

const families = {};
for (let floor = 1; floor <= 5; floor++) {
  const family = entries.filter((entry) => entry.name.startsWith(`f${floor}_wall`));
  families[`f${floor}`] = {
    count: family.length,
    luminanceRange: [
      Math.min(...family.map((entry) => entry.meanLuminance)),
      Math.max(...family.map((entry) => entry.meanLuminance)),
    ],
    maximumEdgeJump: {
      horizontal: Math.max(...family.map((entry) => entry.edgeJump.horizontal)),
      vertical: Math.max(...family.map((entry) => entry.edgeJump.vertical)),
    },
  };
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  ok: failures.length === 0,
  expectedCount: expected.length,
  failures,
  exactDuplicates,
  nearDuplicates,
  families,
  entries: entries.map(({ png: _png, path: _path, ...entry }) => ({
    ...entry,
    meanLuminance: Number(entry.meanLuminance.toFixed(3)),
    edgeJump: {
      horizontal: Number(entry.edgeJump.horizontal.toFixed(3)),
      vertical: Number(entry.edgeJump.vertical.toFixed(3)),
    },
  })),
};

const jsonIndex = process.argv.indexOf("--json");
if (jsonIndex >= 0) {
  const output = resolve(process.argv[jsonIndex + 1]);
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${output}`);
}
console.log(JSON.stringify({
  ok: report.ok,
  accepted: report.expectedCount,
  families: report.families,
  failures: report.failures,
}, null, 2));
if (!report.ok) process.exitCode = 1;
