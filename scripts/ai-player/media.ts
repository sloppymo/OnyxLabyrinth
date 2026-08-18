/**
 * Pixel-art-safe screenshot helpers for the AI player harness.
 * Nearest-neighbour only — never bilinear / smoothing.
 */

import { PNG } from "pngjs";

export const VISUAL_UNCHANGED = 0.004;
export const VISUAL_COMPACT = 0.08;

export type VisualKind = "none" | "still" | "compact" | "full" | "contactSheet";

export interface FrameDiff {
  changed: boolean;
  metric: number;
  kind: VisualKind;
}

export function decodePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

export function encodePng(png: PNG): Buffer {
  return PNG.sync.write(png, { deflateLevel: 9 });
}

/** Mean per-channel absolute difference in 0..1. */
export function meanAbsDiff(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  const n = a.width * a.height;
  if (n === 0) return 0;
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    total += Math.abs(a.data[i] - b.data[i]);
    total += Math.abs(a.data[i + 1] - b.data[i + 1]);
    total += Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return total / (n * 3 * 255);
}

export function classifyVisualChange(metric: number, forceFull = false): FrameDiff {
  if (forceFull) return { changed: true, metric, kind: "full" };
  if (metric < VISUAL_UNCHANGED) return { changed: false, metric, kind: "none" };
  if (metric < VISUAL_COMPACT) return { changed: true, metric, kind: "compact" };
  return { changed: true, metric, kind: "full" };
}

/** Integer nearest-neighbour scale. `scale` < 1 shrinks. */
export function nearestNeighborScale(src: PNG, scale: number): PNG {
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const dst = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y + 0.5) * src.height / height));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x + 0.5) * src.width / width));
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * width + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

export interface ContactSheetFrame {
  png: PNG;
  atMs: number;
}

/**
 * Horizontal contact sheet with a 1px separator. Frames are assumed equal size
 * (sampled from the same crop). Timestamps are stored in the filename/sidecar,
 * not burned into pixels (keeps pixel art clean).
 */
export function composeContactSheet(frames: ContactSheetFrame[]): PNG {
  if (frames.length === 0) {
    return new PNG({ width: 1, height: 1 });
  }
  const w = frames[0].png.width;
  const h = frames[0].png.height;
  const gap = 1;
  const out = new PNG({ width: w * frames.length + gap * (frames.length - 1), height: h });
  out.data.fill(20);
  for (let i = 0; i < frames.length; i++) {
    const src = frames[i].png;
    const ox = i * (w + gap);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(src.width - 1, x);
        const sy = Math.min(src.height - 1, y);
        const si = (sy * src.width + sx) * 4;
        const di = (y * out.width + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = src.data[si + 3];
      }
    }
  }
  return out;
}

export function samplePercents(count = 5): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}

/** Decide which elapsed-ms marks to capture for a known duration. */
export function sampleMarksMs(durationMs: number, count = 5): number[] {
  return samplePercents(count).map((p) => Math.round(p * durationMs));
}

/** Evenly pick up to `count` frames (0/25/50/75/100 when count=5). */
export function subsampleFrames<T>(frames: T[], count = 5): T[] {
  if (frames.length <= count) return frames;
  const marks = samplePercents(count);
  return marks.map((p) => frames[Math.min(frames.length - 1, Math.round(p * (frames.length - 1)))]);
}
