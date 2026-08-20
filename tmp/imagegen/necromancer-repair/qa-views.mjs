import fs from "node:fs";
import { PNG } from "pngjs";

const root = process.cwd();
const dir = `${root}/tmp/imagegen/necromancer-repair`;
const input = PNG.sync.read(fs.readFileSync(`${root}/public/assets/party/necromancer/attack.png`));

const VFX = new Set([
  "90,50,114", "127,75,156", "162,102,193", "208,164,232",
]);
const PAYOFF_BONE = new Set([
  "74,67,70", "116,107,103", "179,165,141", "224,208,173",
  "181,164,144", "209,174,144", "249,234,212",
]);

function rgbAt(x, y) {
  const i = (y * input.width + x) * 4;
  return `${input.data[i]},${input.data[i + 1]},${input.data[i + 2]}`;
}

function outputFor(mode, fill) {
  const out = new PNG({ width: input.width, height: input.height });
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const i = (y * input.width + x) * 4;
      const alpha = input.data[i + 3];
      if (alpha === 0) continue;
      const frame = Math.floor(x / 100);
      const localX = x - frame * 100;
      const key = rgbAt(x, y);
      const violet = VFX.has(key);
      const payoffBone = frame === 4 && localX >= 62 && y <= 50 && PAYOFF_BONE.has(key);
      const payoffRegion = frame === 4 && localX >= 65 && y <= 50;
      const keep = mode === "vfx"
        ? violet || payoffBone || (payoffRegion && key === "11,10,14")
        : mode === "body"
          ? !violet && !payoffRegion
          : true;
      if (!keep) continue;
      out.data[i] = fill[0];
      out.data[i + 1] = fill[1];
      out.data[i + 2] = fill[2];
      out.data[i + 3] = 255;
    }
  }
  return out;
}

const renders = [
  ["body-only.png", "body", [208, 180, 142]],
  ["vfx-only.png", "vfx", [190, 124, 232]],
  ["silhouette.png", "silhouette", [218, 171, 240]],
];
for (const [name, mode, color] of renders) {
  fs.writeFileSync(`${dir}/${name}`, PNG.sync.write(outputFor(mode, color)));
}
