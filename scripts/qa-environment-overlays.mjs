#!/usr/bin/env node
/** Deterministic pixel QA for transparent environmental overlays. */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const groups = [
  ["wall", "public/assets/wall-features", /^wall-(crack|damp|moss|root|soot)-.*\.png$/],
  ["ceiling", "public/assets/ceiling-features", /^f1-ceiling-.*\.png$/],
  ["hanging", "public/assets/ceiling-sprites", /^f1-(chain-loop|rope-loop|hook-small|pulley|bucket-small|web-strands|counterweight-small)-.*\.png$/],
];
const files = groups.flatMap(([group, dir, pattern]) =>
  readdirSync(dir).filter((file) => pattern.test(file)).map((file) => ({ group, dir, file }))
);
if (!files.length) throw new Error("No environment overlay assets found");

console.log("file\tcanvas\talpha-bbox\tcolors\tcoverage");
for (const { group, dir, file } of files) {
  const path = join(dir, file);
  const identify = execFileSync("identify", ["-format", "%wx%h %[colors] %[bounding-box]", path], { encoding: "utf8" });
  const coverage = execFileSync("convert", [path, "-alpha", "extract", "-threshold", "0", "-format", "%[fx:mean]", "info:"], { encoding: "utf8" });
  const [canvas, colors, ...bbox] = identify.trim().split(/\s+/);
  if (!canvas || !colors || bbox.length !== 2) throw new Error(`Could not parse identify output for ${file}: ${identify}`);
  const percent = (Number(coverage) * 100).toFixed(2);
  console.log(`${group}\t${file}\t${canvas}\t${bbox.join(" ")}\t${colors}\t${percent}%`);
  if (group === "wall" && Number(coverage) >= 0.9) throw new Error(`${file} is suspiciously opaque (${percent}%)`);
}
