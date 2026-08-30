import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_DEFS, OLD_MAN_LIST, RAT_KING_LIST } from "./cards";
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

function pngInfo(file: string): { width: number; height: number; colorType: number } {
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
        colorType: buf[offset + 17],
      };
    }
    offset += 12 + length;
  }
  throw new Error(`${file}: IHDR not found`);
}

describe("Card Trial art manifest", () => {
  it("maps exactly one deterministic illustration field for every locked 24-card definition", () => {
    const lockedIds = [...RAT_KING_LIST, ...OLD_MAN_LIST].sort();
    expect([...CARD_ART_IDS].sort()).toEqual(lockedIds);
    expect(new Set(CARD_ART_IDS).size).toBe(lockedIds.length);
    for (const id of lockedIds as CardId[]) {
      expect(cardArtRelPath(id)).toBe(`assets/card-trial/cards/${id}.png`);
      expect(cardArtUrl(id)).toBe(expectedArtUrl(id));
    }
  });

  it("Old Man build-exclusive and Rat King sacrifice-mechanic cards fall back to the reserved aperture until art exists", () => {
    const liveIds = Object.keys(CARD_DEFS) as CardId[];
    const unmapped = liveIds.filter((id) => !CARD_ART_IDS.includes(id as (typeof CARD_ART_IDS)[number]));
    expect(unmapped.sort()).toEqual([
      "brace-for-it",
      "feed-the-king",
      "hasten-the-hour",
      "last-litter",
      "one-more-rat",
      "reckoning-strike",
      "reckoning-ward",
      "silence-the-hall",
      "the-final-word",
      "the-quiet-after",
      "veil-of-quiet",
    ]);
    for (const id of unmapped) {
      expect(cardArtRelPath(id)).toBeNull();
      expect(cardArtUrl(id)).toBeNull();
    }
  });

  it("points at existing opaque 128×96 production PNGs", () => {
    expect(CARD_ART_NATIVE_WIDTH).toBe(128);
    expect(CARD_ART_NATIVE_HEIGHT).toBe(96);
    for (const id of CARD_ART_IDS) {
      const rel = cardArtRelPath(id);
      expect(rel).toBeTruthy();
      const file = resolve(process.cwd(), "public", rel!);
      expect(existsSync(file), file).toBe(true);
      expect(pngInfo(file)).toEqual({ width: 128, height: 96, colorType: 6 });
    }
  });

  it("has exactly one shipped PNG filename per live card and no extras", () => {
    const dir = resolve(process.cwd(), "public/assets/card-trial/cards");
    const files = readFileNames(dir);
    expect(files).toEqual([...CARD_ART_IDS].map((id) => `${id}.png`).sort());
  });
});

function readFileNames(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".png")).sort();
}
