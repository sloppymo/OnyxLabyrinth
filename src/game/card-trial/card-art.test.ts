import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_DEFS } from "./cards";
import {
  CARD_ART_IDS,
  CARD_ART_NATIVE_HEIGHT,
  CARD_ART_NATIVE_WIDTH,
  cardArtRelPath,
  cardArtUrl,
} from "./card-art";
import type { CardId } from "./types";

function expectedArtUrl(id: CardId): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}assets/card-trial/cards/${id}.png`;
}


const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
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

describe("Card Trial art manifest", () => {
  it("maps every unique card id to a production illustration field", () => {
    expect([...CARD_ART_IDS].sort()).toEqual((Object.keys(CARD_DEFS) as CardId[]).sort());
    for (const id of Object.keys(CARD_DEFS) as CardId[]) {
      expect(cardArtRelPath(id)).toBe(`assets/card-trial/cards/${id}.png`);
      expect(cardArtUrl(id)).toBe(expectedArtUrl(id));
    }
  });

  it("points at existing 128×96 production PNGs", () => {
    expect(CARD_ART_NATIVE_WIDTH).toBe(128);
    expect(CARD_ART_NATIVE_HEIGHT).toBe(96);
    for (const id of CARD_ART_IDS) {
      const rel = cardArtRelPath(id);
      expect(rel).toBeTruthy();
      const file = resolve(process.cwd(), "public", rel!);
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(file)).toEqual({ width: 128, height: 96 });
    }
  });

  it("does not invent art for unknown ids", () => {
    expect(cardArtRelPath("__none__" as CardId)).toBeNull();
    expect(cardArtUrl("__none__" as CardId)).toBeNull();
  });
});
