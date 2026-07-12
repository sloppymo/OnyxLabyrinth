#!/usr/bin/env node
/**
 * Recolor enemy sprite strips for summoned allies.
 *
 * Reads base sprite PNGs from public/assets/enemies/<base-id>/<state>.png,
 * applies a hue rotation to all non-transparent pixels, and writes the
 * result to public/assets/enemies/<summon-id>/<state>.png.
 *
 * Usage: node scripts/recolor-sprites.mjs
 *
 * The recolor table is defined below — add new entries there.
 */
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const ENEMIES_DIR = path.resolve("public/assets/enemies");

/**
 * Convert RGB to HSL, rotate hue, convert back.
 * Transparent pixels are left untouched.
 */
function recolorPng(png, hueShiftDeg, satMult = 1, lightAdd = 0) {
  const hueShift = (hueShiftDeg / 360);
  const out = PNG.sync.read(PNG.sync.write(png)); // deep copy
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3];
    if (a === 0) continue; // skip transparent

    let r = out.data[i] / 255;
    let g = out.data[i + 1] / 255;
    let b = out.data[i + 2] / 255;

    // RGB -> HSL
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

    // Rotate hue
    h = (h + hueShift) % 1;
    if (h < 0) h += 1;

    // Adjust saturation
    s = Math.min(1, Math.max(0, s * satMult));

    // Adjust lightness
    const newL = Math.min(1, Math.max(0, l + lightAdd));

    // HSL -> RGB
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
    // Keep original alpha
  }
  return out;
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Recolor definitions: summonId -> { base, hueShift, satMult?, lightAdd? }
 *
 * hueShift is in degrees (0-360):
 *   0 = no change, 120 = green→magenta, 180 = invert, etc.
 */
const RECOLORS = {
  // Mage summons
  "summon-slime":               { base: "slime",             hueShift: 200, satMult: 1.2, lightAdd: 0.05 },  // blue slime
  "summon-fire-elemental":      { base: "acid-puddle",       hueShift: -40, satMult: 1.3, lightAdd: 0.05 },  // red/orange
  "summon-eldritch-guardian":   { base: "stone-guardian",    hueShift: 280, satMult: 1.4, lightAdd: -0.05 }, // dark purple
  "summon-elemental":           { base: "failed-experiment", hueShift: 100, satMult: 1.2, lightAdd: 0.0 },   // green tint

  // Priest summons
  "summon-holy-guardian":       { base: "animated-armor",    hueShift: 50,  satMult: 1.3, lightAdd: 0.1 },   // gold/white
  "summon-celestial-guardian":  { base: "animated-armor",    hueShift: 200, satMult: 1.2, lightAdd: 0.1 },   // blue/white
  "summon-celestial":           { base: "skeleton",          hueShift: 60,  satMult: 1.4, lightAdd: 0.15 },  // white/gold
};

const STATES = ["idle", "attack", "hurt", "death"];

function main() {
  let generated = 0;
  let skipped = 0;

  for (const [summonId, cfg] of Object.entries(RECOLORS)) {
    const baseDir = path.join(ENEMIES_DIR, cfg.base);
    const outDir = path.join(ENEMIES_DIR, summonId);

    if (!fs.existsSync(baseDir)) {
      console.warn(`  SKIP ${summonId}: base dir ${baseDir} not found`);
      skipped++;
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });

    for (const state of STATES) {
      const srcPath = path.join(baseDir, `${state}.png`);
      const outPath = path.join(outDir, `${state}.png`);

      if (!fs.existsSync(srcPath)) {
        console.warn(`  SKIP ${summonId}/${state}: source not found`);
        continue;
      }

      const buf = fs.readFileSync(srcPath);
      const png = PNG.sync.read(buf);
      const recolored = recolorPng(png, cfg.hueShift, cfg.satMult, cfg.lightAdd);
      const outBuf = PNG.sync.write(recolored);
      fs.writeFileSync(outPath, outBuf);
      console.log(`  OK   ${summonId}/${state}.png  (${png.width}x${png.height})`);
      generated++;
    }
  }

  console.log(`\nDone: ${generated} files generated, ${skipped} skipped.`);
}

main();
