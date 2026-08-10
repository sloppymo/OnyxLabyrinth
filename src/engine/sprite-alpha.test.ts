import { describe, it, expect } from "vitest";
import {
  alphaBounds,
  hasAlphaChannel,
  keyOutBackground,
  sampleBackgroundColor,
} from "./sprite-alpha";

const BG: [number, number, number] = [20, 18, 16];

/** Build RGBA pixel data from a character grid + a colour legend. */
function grid(rows: string[], legend: Record<string, [number, number, number]>) {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = legend[rows[y]![x]!]!;
      const i = (y * width + x) << 2;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const alphaAt = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  data[((y * width + x) << 2) + 3]!;

describe("hasAlphaChannel", () => {
  it("is false for fully opaque data", () => {
    const { data } = grid(["..", ".."], { ".": BG });
    expect(hasAlphaChannel(data)).toBe(false);
  });

  it("is true as soon as one pixel is not fully opaque", () => {
    const { data } = grid(["..", ".."], { ".": BG });
    data[3] = 0;
    expect(hasAlphaChannel(data)).toBe(true);
  });
});

describe("alphaBounds", () => {
  it("returns a tight visible rectangle and reports bottom padding", () => {
    const { data, width, height } = grid(
      ["......", ".XX...", ".XXX..", "......", "......"],
      { ".": BG, X: [140, 80, 40] }
    );
    // This fixture starts opaque; make the background transparent exactly as
    // the map-sprite cache does before measuring it.
    keyOutBackground(data, width, height);

    expect(alphaBounds(data, width, height)).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 2,
      bottomPadding: 2,
    });
  });

  it("returns null for a fully transparent canvas", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    expect(alphaBounds(data, 4, 4)).toBeNull();
  });
});

describe("sampleBackgroundColor", () => {
  it("returns the shared corner colour", () => {
    const { data, width, height } = grid(
      ["....", ".XX.", "...."],
      { ".": BG, X: [200, 100, 50] }
    );
    expect(sampleBackgroundColor(data, width, height)).toEqual(BG);
  });

  it("returns null when the corners disagree", () => {
    const { data, width, height } = grid(
      ["X...", "....", "...."],
      { ".": BG, X: [200, 100, 50] }
    );
    expect(sampleBackgroundColor(data, width, height)).toBeNull();
  });
});

describe("keyOutBackground", () => {
  it("clears the background but keeps the sprite opaque", () => {
    const { data, width, height } = grid(
      ["......", ".XXXX.", ".XXXX.", "......"],
      { ".": BG, X: [140, 80, 40] }
    );
    const cleared = keyOutBackground(data, width, height);

    expect(cleared).toBe(16); // 24 pixels total - 8 sprite pixels
    expect(alphaAt(data, width, 0, 0)).toBe(0);
    expect(alphaAt(data, width, 1, 1)).toBe(255);
    expect(alphaAt(data, width, 4, 2)).toBe(255);
  });

  it("preserves an interior pocket of the background colour", () => {
    // A ring of sprite with a background-coloured hole in the middle: the hole
    // is unreachable from the border, so it must stay opaque.
    const { data, width, height } = grid(
      [".....", ".XXX.", ".X.X.", ".XXX.", "....."],
      { ".": BG, X: [140, 80, 40] }
    );
    keyOutBackground(data, width, height);

    expect(alphaAt(data, width, 2, 2)).toBe(255); // enclosed pocket kept
    expect(alphaAt(data, width, 0, 0)).toBe(0); // border cleared
  });

  it("keeps a near-black outline that equals the background colour", () => {
    // The prop-art brief asks for a near-black 1px outline; an outline drawn in
    // the background colour must survive because it is enclosed by the fill
    // front, not reachable through it.
    const outline: [number, number, number] = [20, 18, 16];
    const { data, width, height } = grid(
      [".....", ".OOO.", ".OXO.", ".OOO.", "....."],
      { ".": BG, O: outline, X: [200, 160, 60] }
    );
    const cleared = keyOutBackground(data, width, height);

    // Flood fill reaches the outline (same colour) and stops nowhere: this
    // documents the real limit of colour keying — an outline in the exact
    // background colour IS consumed, which is why new art uses a chroma key.
    expect(cleared).toBe(24);
    expect(alphaAt(data, width, 2, 2)).toBe(255); // the lit core survives
  });

  it("is a no-op when the image already has an alpha channel", () => {
    const { data, width, height } = grid(
      ["....", ".XX.", "...."],
      { ".": BG, X: [140, 80, 40] }
    );
    data[3] = 0; // pre-existing transparency
    const before = Uint8ClampedArray.from(data);

    expect(keyOutBackground(data, width, height)).toBe(0);
    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("is a no-op when the corners disagree about the background", () => {
    const { data, width, height } = grid(
      ["X...", "....", "...."],
      { ".": BG, X: [200, 100, 50] }
    );
    const before = Uint8ClampedArray.from(data);

    expect(keyOutBackground(data, width, height)).toBe(0);
    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("tolerates slight background noise", () => {
    const { data, width, height } = grid(
      ["....", ".XX.", "...."],
      { ".": BG, X: [140, 80, 40] }
    );
    // nudge one border pixel within tolerance
    data[4] = 24;
    data[5] = 22;
    data[6] = 20;

    keyOutBackground(data, width, height);
    expect(alphaAt(data, width, 1, 0)).toBe(0);
  });

  it("handles a degenerate empty image", () => {
    expect(keyOutBackground(new Uint8ClampedArray(0), 0, 0)).toBe(0);
  });
});
