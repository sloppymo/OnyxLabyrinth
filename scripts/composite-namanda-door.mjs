// Composites the canonical Namanda mark onto the church door's blank stone
// panel. One-off script, not part of any pipeline — the door art itself is
// PixelLab-generated and hand-placed once.
import { readFileSync, writeFileSync } from "fs";
import { PNG } from "pngjs";

const door = PNG.sync.read(readFileSync("art/pixellab-candidates/namanda-church-door-01.png"));
const mark = PNG.sync.read(readFileSync("public/assets/symbols/namanda-mark-relief.png"));

// Panel center measured from the generated art: roughly x=100-165, y=40-95.
const cx = 132;
const cy = 68;
const ox = cx - Math.floor(mark.width / 2);
const oy = cy - Math.floor(mark.height / 2);

// Tint the mark to sit on pale stone rather than its default bone/bronze —
// darker, so it reads as carved-in relief, not a pasted sticker.
const relief = hex2 => parseInt(hex2, 16);
for (let y = 0; y < mark.height; y++) {
  for (let x = 0; x < mark.width; x++) {
    const mi = (mark.width * y + x) << 2;
    const a = mark.data[mi + 3];
    if (a === 0) continue;
    const dx = ox + x;
    const dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= door.width || dy >= door.height) continue;
    const di = (door.width * dy + dx) << 2;
    // Darker stone-relief tone, keeping the mark's own light/dark split
    // (outline vs fill) by scaling toward a shadow tone rather than flattening.
    const isOutline = mark.data[mi] < 60;
    const [r, g, b] = isOutline ? [42, 40, 38] : [108, 100, 84];
    door.data[di] = r;
    door.data[di + 1] = g;
    door.data[di + 2] = b;
    door.data[di + 3] = 255;
  }
}

writeFileSync("art/pixellab-candidates/namanda-church-door-02-composited.png", PNG.sync.write(door));
console.log("wrote namanda-church-door-02-composited.png");
