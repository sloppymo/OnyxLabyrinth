import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function pngDimensions(buf: Buffer): { width: number; height: number } {
  // PNG width/height are big-endian at bytes 16 and 20 (after 8-byte
  // signature and "IHDR" chunk length/type).
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function isPng(buf: Buffer): boolean {
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

describe("water floor production asset", () => {
  it("is a 256x256 PNG with the shared tileset convention", () => {
    const floorA = resolve("public/assets/tilesets/water/floorA.png");
    const floorB = resolve("public/assets/tilesets/water/floorB.png");
    const a = readFileSync(floorA);
    const b = readFileSync(floorB);

    expect(isPng(a)).toBe(true);
    expect(isPng(b)).toBe(true);

    const dimA = pngDimensions(a);
    const dimB = pngDimensions(b);
    expect(dimA.width).toBe(256);
    expect(dimA.height).toBe(256);
    expect(dimB).toEqual(dimA);
  });
});
