import { PNG } from "pngjs";
import fs from "node:fs";

const src = "public/assets/tilesets/f1/stairs.png";
const buf = fs.readFileSync(src);
const png = PNG.sync.read(buf);
const { width, height, data } = png;

const featherRows = Math.round(height * 0.1);
const featherStart = height - featherRows;

for (let y = featherStart; y < height; y++) {
  const t = (y - featherStart) / (featherRows - 1);
  const alphaMul = 1 - t;
  for (let x = 0; x < width; x++) {
    const idx = (width * y + x) << 2;
    data[idx + 3] = Math.round(data[idx + 3] * alphaMul);
  }
}

fs.writeFileSync(src, PNG.sync.write(png));
console.log("Feathered bottom", featherRows, "rows of", src);
