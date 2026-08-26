import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function pngHeader(path: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25]!,
  };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < buf.length && buf[offset] === 0xff) offset++;
    const marker = buf[offset++];
    if (marker === undefined) break;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= buf.length) break;
    const segmentLength = buf.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buf.length) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        height: buf.readUInt16BE(offset + 3),
        width: buf.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error("JPEG frame dimensions not found");
}

describe("Floor 1 floor texture assets", () => {
  it("ships the same 256px opaque floor twins in bundled and public paths", () => {
    for (const [sourceName, publicName] of [
      ["f1_floor_a_256.png", "floorA.png"],
      ["f1_floor_b_256.png", "floorB.png"],
    ] as const) {
      const source = readFileSync(resolve("src/assets", sourceName));
      const mirror = readFileSync(resolve("public/assets/tilesets/f1", publicName));
      expect(mirror).toEqual(source);
      expect(pngHeader(resolve("src/assets", sourceName))).toEqual({ width: 256, height: 256, colorType: 2 });
    }
  });

  it("ships the authored environment-only combat plate at the combat design size", () => {
    const plate = readFileSync(resolve("src/assets/f1_arena_backdrop.jpg"));
    expect(jpegDimensions(plate)).toEqual({ width: 768, height: 672 });
    // The runtime plate is intentionally a JPEG environment image, not one of
    // the 256px corridor tile sources.
    expect(plate.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
});
