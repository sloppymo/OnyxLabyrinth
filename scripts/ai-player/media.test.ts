import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  classifyVisualChange,
  composeContactSheet,
  encodePng,
  meanAbsDiff,
  nearestNeighborScale,
  sampleMarksMs,
  subsampleFrames,
} from "./media";

function solid(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return png;
}

function checker(size: number): PNG {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (x + y) % 2 === 0;
      const i = (y * size + x) * 4;
      png.data[i] = on ? 255 : 0;
      png.data[i + 1] = on ? 255 : 0;
      png.data[i + 2] = on ? 255 : 0;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

describe("meanAbsDiff / classifyVisualChange", () => {
  it("reports unchanged for identical frames", () => {
    const a = solid(8, 8, [10, 20, 30]);
    expect(meanAbsDiff(a, a)).toBe(0);
    expect(classifyVisualChange(0).kind).toBe("none");
    expect(classifyVisualChange(0).changed).toBe(false);
  });

  it("classifies a major change as full and can force full for menus", () => {
    const a = solid(4, 4, [0, 0, 0]);
    const b = solid(4, 4, [255, 255, 255]);
    const metric = meanAbsDiff(a, b);
    expect(metric).toBeGreaterThan(0.9);
    expect(classifyVisualChange(metric).kind).toBe("full");
    expect(classifyVisualChange(0.001, true).kind).toBe("full");
  });
});

describe("nearestNeighborScale", () => {
  it("does not smooth a checkerboard when scaling 2x", () => {
    const src = checker(4);
    const dst = nearestNeighborScale(src, 2);
    expect(dst.width).toBe(8);
    expect(dst.height).toBe(8);
    // Each logical pixel is a 2x2 block of the same color.
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        const expected = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 255 : 0;
        expect(dst.data[i]).toBe(expected);
      }
    }
  });
});

describe("composeContactSheet", () => {
  it("lays out a deterministic 5-frame sheet", () => {
    const frames = [0, 1, 2, 3, 4].map((n) => ({
      png: solid(4, 4, [n * 50, 0, 0]),
      atMs: n * 190,
    }));
    const sheet = composeContactSheet(frames);
    expect(sheet.width).toBe(4 * 5 + 4);
    expect(sheet.height).toBe(4);
    expect(sheet.data.length).toBe(sheet.width * sheet.height * 4);
  });

  it("returns a 1x1 placeholder when there are no frames", () => {
    const sheet = composeContactSheet([]);
    expect(sheet.width).toBe(1);
    expect(sheet.height).toBe(1);
  });
});

describe("sampleMarksMs", () => {
  it("samples 0/25/50/75/100 of the duration", () => {
    expect(sampleMarksMs(760)).toEqual([0, 190, 380, 570, 760]);
  });
});

describe("encodePng / subsampleFrames", () => {
  it("deflate-compresses so a solid frame is far smaller than raw RGBA", () => {
    const png = solid(64, 64, [40, 30, 20]);
    const buf = encodePng(png);
    expect(buf.length).toBeLessThan(64 * 64 * 4);
    expect(buf.slice(1, 4).toString()).toBe("PNG");
  });

  it("subsamples to five temporal positions", () => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n);
    expect(subsampleFrames(frames, 5)).toEqual([0, 2, 5, 7, 9]);
    expect(subsampleFrames(frames.slice(0, 3), 5)).toEqual([0, 1, 2]);
  });
});
