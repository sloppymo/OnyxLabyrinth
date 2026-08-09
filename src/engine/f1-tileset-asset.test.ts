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
});
