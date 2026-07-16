import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENEMY_SPRITE_DEFS } from "./sprite-manifest";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  ) >>> 0;
}

function pngSize(file: string): { width: number; height: number } {
  const buf = new Uint8Array(readFileSync(file));
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) throw new Error(`${file}: not a PNG`);
  }

  let offset = 8;
  while (offset < buf.length) {
    const length = readUint32BE(buf, offset);
    const type = String.fromCharCode(
      buf[offset + 4],
      buf[offset + 5],
      buf[offset + 6],
      buf[offset + 7]
    );
    if (type === "IHDR") {
      return {
        width: readUint32BE(buf, offset + 8),
        height: readUint32BE(buf, offset + 12),
      };
    }
    offset += 12 + length;
  }
  throw new Error(`${file}: IHDR not found`);
}

function resolveAsset(url: string): string {
  const match = url.match(/\/?assets\/enemies\/(.+)$/);
  if (!match) throw new Error(`could not resolve sprite URL: ${url}`);
  return resolve(process.cwd(), "public/assets/enemies", match[1]);
}

describe("sprite-manifest", () => {
  it("squat / short-frame packs override artFootFromTop below pack default", () => {
    for (const id of [
      "slime",
      "lava-slime",
      "acid-puddle",
      "summon-slime",
      "summon-fire-elemental",
      "hellbat",
      "eyeball-monster",
    ]) {
      const foot = ENEMY_SPRITE_DEFS[id]?.idle.artFootFromTop;
      expect(foot, id).toBeDefined();
      expect(foot!, id).toBeLessThan(0.57);
    }
  });

  for (const [enemyId, def] of Object.entries(ENEMY_SPRITE_DEFS)) {
    describe(enemyId, () => {
      for (const [state, strip] of Object.entries(def)) {
        it(`${state} PNG matches manifest dimensions`, () => {
          const file = resolveAsset(strip.url);
          const { width, height } = pngSize(file);
          expect(height).toBe(strip.frameHeight);
          expect(width).toBe(strip.frameWidth * strip.frameCount);
        });
      }
    });
  }
});
