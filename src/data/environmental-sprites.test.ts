import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENVIRONMENTAL_SPRITES } from "./environmental-sprites";

describe("environmental sprite assets", () => {
  it("ships every registered animation sheet with valid frame metadata", () => {
    for (const asset of ENVIRONMENTAL_SPRITES) {
      expect(asset.frameWidth).toBeGreaterThan(0);
      expect(asset.frameHeight).toBeGreaterThan(0);
      expect(asset.frameCount).toBeGreaterThan(0);
      const file = join(process.cwd(), "public", "assets", "environmental-sprites", asset.file);
      expect(existsSync(file)).toBe(true);
      const png = readFileSync(file);
      expect(png.readUInt32BE(16)).toBe(asset.frameWidth * asset.frameCount);
      expect(png.readUInt32BE(20)).toBe(asset.frameHeight);
    }
  });
});
