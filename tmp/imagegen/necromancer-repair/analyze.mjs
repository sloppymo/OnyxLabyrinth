import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  throw new Error("usage: node analyze.mjs <sheet.png> [...]");
}

function analyze(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const frameCount = png.width % 100 === 0 ? png.width / 100 : 0;
  const frames = [];
  const alpha = new Set();
  for (let frame = 0; frame < frameCount; frame += 1) {
    let minX = 100;
    let minY = 100;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    const colors = new Set();
    let edgePixels = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = frame * 100; x < (frame + 1) * 100; x += 1) {
        const i = (y * png.width + x) * 4;
        const a = png.data[i + 3];
        alpha.add(a);
        if (a === 0) continue;
        const localX = x - frame * 100;
        pixels += 1;
        minX = Math.min(minX, localX);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, localX);
        maxY = Math.max(maxY, y);
        if (localX === 0 || localX === 99 || y === 0 || y === 99) edgePixels += 1;
        weightedX += localX;
        weightedY += y;
        colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
      }
    }
    frames.push({
      frame: frame + 1,
      bbox: pixels ? `${minX},${minY} ${maxX - minX + 1}x${maxY - minY + 1}` : "empty",
      pixels,
      colors: colors.size,
      edgePixels,
      center: pixels ? `${(weightedX / pixels).toFixed(1)},${(weightedY / pixels).toFixed(1)}` : "-",
    });
  }
  return {
    file: path.relative(process.cwd(), file),
    dimensions: `${png.width}x${png.height}`,
    frameCount,
    alpha: [...alpha].sort((a, b) => a - b),
    frames,
  };
}

for (const file of inputs) {
  console.log(JSON.stringify(analyze(file)));
}
