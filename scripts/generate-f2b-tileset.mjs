#!/usr/bin/env node
/**
 * Bake the "f2b" tileset: a colder-lit recolor of the shipping f2 (Cursed
 * Library) bundled textures, used for floor 2's forbidden-wing tileset zone.
 * Same recolor technique as scripts/recolor-sprites.mjs (HSL hue rotation),
 * applied to tileset PNGs instead of enemy sprites, and written to
 * src/assets/ with the same fN_{slot}_256.png naming convention the renderer
 * statically imports (see BUNDLED_THEME_URLS in src/engine/renderer.ts) so
 * it ships as a first-class bundled theme, not a runtime-fetch fallback.
 *
 * Usage: node scripts/generate-f2b-tileset.mjs
 */
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const SRC_DIR = path.resolve("src/assets");
const OUT_DIR = path.resolve("src/assets");

// Cold shift away from the warm wood/book brown, darkened for the "wing the
// library forbade" mood — same material family as base f2, not a new
// tileset.
const HUE_SHIFT_DEG = 200;
const SAT_MULT = 0.85;
const LIGHT_ADD = -0.08;

const SLOTS = [
  { src: "f2_wall_256.png", out: "f2b_wall_256.png" },
  { src: "f2_floor_a_256.png", out: "f2b_floor_a_256.png" },
  { src: "f2_floor_b_256.png", out: "f2b_floor_b_256.png" },
  { src: "f2_ceiling_256.png", out: "f2b_ceiling_256.png" },
  { src: "f2_door_256.png", out: "f2b_door_256.png" },
];

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function recolorPng(png, hueShiftDeg, satMult, lightAdd) {
  const hueShift = hueShiftDeg / 360;
  const out = PNG.sync.read(PNG.sync.write(png));
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3];
    if (a === 0) continue;

    let r = out.data[i] / 255;
    let g = out.data[i + 1] / 255;
    let b = out.data[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    h = (h + hueShift) % 1;
    if (h < 0) h += 1;
    s = Math.min(1, Math.max(0, s * satMult));
    const newL = Math.min(1, Math.max(0, l + lightAdd));

    if (s === 0) {
      r = g = b = newL;
    } else {
      const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s;
      const p = 2 * newL - q;
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
      b = hueToRgb(p, q, h - 1 / 3);
    }

    out.data[i] = Math.round(r * 255);
    out.data[i + 1] = Math.round(g * 255);
    out.data[i + 2] = Math.round(b * 255);
  }
  return out;
}

function main() {
  for (const { src, out } of SLOTS) {
    const srcPath = path.join(SRC_DIR, src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  SKIP ${out}: source not found at ${srcPath}`);
      continue;
    }
    const png = PNG.sync.read(fs.readFileSync(srcPath));
    const recolored = recolorPng(png, HUE_SHIFT_DEG, SAT_MULT, LIGHT_ADD);
    const outPath = path.join(OUT_DIR, out);
    fs.writeFileSync(outPath, PNG.sync.write(recolored));
    console.log(`  OK   ${out}  (${png.width}x${png.height})`);
  }
}

main();
