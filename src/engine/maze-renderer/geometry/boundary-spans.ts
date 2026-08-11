import type { CellVolume } from "./cell-volume";

export interface VerticalSpan {
  minY: number;
  maxY: number;
  kind: "lowerClosure" | "upperClosure" | "fullClosure";
}

export interface OpenBoundarySpans {
  valid: boolean;
  open: { minY: number; maxY: number } | null;
  aClosed: VerticalSpan[];
  bClosed: VerticalSpan[];
}

function outsideOpenSpan(
  volume: CellVolume,
  openMin: number,
  openMax: number
): VerticalSpan[] {
  const spans: VerticalSpan[] = [];
  if (volume.floorZ < openMin) {
    spans.push({ minY: volume.floorZ, maxY: openMin, kind: "lowerClosure" });
  }
  if (volume.ceilingZ > openMax) {
    spans.push({ minY: openMax, maxY: volume.ceilingZ, kind: "upperClosure" });
  }
  return spans;
}

/** Compile the portal overlap and the solid vertical remainder on each side. */
export function compileOpenBoundarySpans(
  a: CellVolume,
  b: CellVolume
): OpenBoundarySpans {
  const openMin = Math.max(a.floorZ, b.floorZ);
  const openMax = Math.min(a.ceilingZ, b.ceilingZ);
  if (!(openMin < openMax)) {
    return {
      valid: false,
      open: null,
      aClosed: [{ minY: a.floorZ, maxY: a.ceilingZ, kind: "fullClosure" }],
      bClosed: [{ minY: b.floorZ, maxY: b.ceilingZ, kind: "fullClosure" }],
    };
  }
  return {
    valid: true,
    open: { minY: openMin, maxY: openMax },
    aClosed: outsideOpenSpan(a, openMin, openMax),
    bClosed: outsideOpenSpan(b, openMin, openMax),
  };
}

export function fullBoundarySpan(volume: CellVolume): VerticalSpan {
  return {
    minY: volume.floorZ,
    maxY: volume.ceilingZ,
    kind: "fullClosure",
  };
}
