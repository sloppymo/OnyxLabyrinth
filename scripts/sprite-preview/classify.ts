import type { MismatchResult, MismatchSeverity } from "./types";

export interface ClassifyStripParams {
  exists: boolean;
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  declaredFrameCount: number;
  /**
   * "single-row": height must equal frameHeight exactly — this is every
   * enemy/party strip (see sprite-manifest.ts / party-sprite-cache.ts: both
   * crop with sy=0 and never read a second row).
   * "grid": height may be any multiple of frameHeight — effect sheets can be
   * genuinely multi-row (see effect-sprite-cache.ts's cols/rows math).
   */
  layout: "single-row" | "grid";
}

/**
 * Classifies a sprite strip's actual PNG dimensions against what the game
 * code declares. Severity distinguishes "will actually crop into garbage at
 * runtime" (fewer-frames-than-declared, height-mismatch, missing) from
 * harmless slack (width-not-multiple, more-frames-than-declared — several
 * effect sheets are deliberately trimmed down from a larger source, see
 * effect-sprite-cache.ts's "01"/"00" sampler comments).
 */
export function classifyStripMismatch(params: ClassifyStripParams): MismatchResult {
  const { exists, width, height, frameWidth, frameHeight, declaredFrameCount, layout } = params;

  if (!exists) {
    return { severity: "missing", message: "file not found on disk" };
  }

  const heightOk = layout === "single-row" ? height === frameHeight : height % frameHeight === 0;
  if (!heightOk) {
    return {
      severity: "height-mismatch",
      message:
        layout === "single-row"
          ? `sheet is ${height}px tall, expected exactly ${frameHeight}px (single-row strip)`
          : `sheet height ${height} isn't a multiple of the ${frameHeight}px frame height`,
    };
  }

  if (width % frameWidth !== 0) {
    return {
      severity: "width-not-multiple",
      message: `sheet width ${width} isn't a multiple of the ${frameWidth}px frame width — the trailing ${
        width % frameWidth
      }px are unused`,
    };
  }

  const rows = layout === "single-row" ? 1 : height / frameHeight;
  const cols = width / frameWidth;
  const naturalFrameCount = rows * cols;

  if (naturalFrameCount < declaredFrameCount) {
    return {
      severity: "fewer-frames-than-declared",
      message: `declared ${declaredFrameCount} frames but the sheet only fits ${naturalFrameCount} at ${frameWidth}x${frameHeight} — playback will crop past the sheet edge`,
    };
  }

  if (naturalFrameCount > declaredFrameCount) {
    return {
      severity: "more-frames-than-declared",
      message: `sheet fits ${naturalFrameCount} frames at ${frameWidth}x${frameHeight} but only ${declaredFrameCount} are declared — trailing frames are unused (may be intentional trimming)`,
    };
  }

  return { severity: "ok", message: null };
}

/** Collapses the five mismatch kinds into a 3-level UI weight. */
export function severityLevel(severity: MismatchSeverity): "ok" | "warn" | "critical" {
  switch (severity) {
    case "ok":
      return "ok";
    case "missing":
    case "fewer-frames-than-declared":
    case "height-mismatch":
      return "critical";
    case "width-not-multiple":
    case "more-frames-than-declared":
      return "warn";
  }
}
