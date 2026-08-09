#!/usr/bin/env node
/** Deterministic pixel QA for transparent environmental overlays. */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "public/assets/wall-features";
const files = readdirSync(dir).filter((f) => /^wall-(damp|moss|soot)-.*\.png$/.test(f)).sort();
if (!files.length) throw new Error(`No environment overlays found in ${dir}`);

console.log("file\tcanvas\talpha-bbox\tcolors\tcoverage");
for (const file of files) {
  const path = join(dir, file);
  const identify = execFileSync("identify", ["-format", "%wx%h %[colors] %[bounding-box]", path], { encoding: "utf8" });
  const coverage = execFileSync("convert", [path, "-alpha", "extract", "-threshold", "0", "-format", "%[fx:mean]", "info:"], { encoding: "utf8" });
  const [canvas, colors, ...bbox] = identify.trim().split(/\s+/);
  if (!canvas || !colors || bbox.length !== 2) throw new Error(`Could not parse identify output for ${file}: ${identify}`);
  const percent = (Number(coverage) * 100).toFixed(2);
  console.log(`${file}\t${canvas}\t${bbox.join(" ")}\t${colors}\t${percent}%`);
  if (Number(coverage) >= 0.9) throw new Error(`${file} is suspiciously opaque (${percent}%)`);
}
