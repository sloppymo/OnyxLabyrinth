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

export interface BoundaryEdgeProfile {
  z0: number;
  z1: number;
}

/** A wall patch whose lower/upper edges may vary along the cell boundary. */
export interface BoundaryPatch {
  bottom0: number;
  bottom1: number;
  top0: number;
  top1: number;
  kind: VerticalSpan["kind"];
}

export interface OpenBoundaryPatches {
  valid: boolean;
  open: { bottom0: number; bottom1: number; top: number } | null;
  aClosed: BoundaryPatch[];
  bClosed: BoundaryPatch[];
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

function hasPatchArea(patch: BoundaryPatch): boolean {
  return patch.top0 > patch.bottom0 || patch.top1 > patch.bottom1;
}

function outsideOpenPatches(
  volume: CellVolume,
  floor: BoundaryEdgeProfile,
  openBottom: BoundaryEdgeProfile,
  openTop: number
): BoundaryPatch[] {
  const patches: BoundaryPatch[] = [];
  const lower: BoundaryPatch = {
    bottom0: floor.z0,
    bottom1: floor.z1,
    top0: openBottom.z0,
    top1: openBottom.z1,
    kind: "lowerClosure",
  };
  if (hasPatchArea(lower)) patches.push(lower);
  const upper: BoundaryPatch = {
    bottom0: openTop,
    bottom1: openTop,
    top0: volume.ceilingZ,
    top1: volume.ceilingZ,
    kind: "upperClosure",
  };
  if (hasPatchArea(upper)) patches.push(upper);
  return patches;
}

/** Endpoint-aware portal compiler for flat or sloped floor boundaries. */
export function compileOpenBoundaryPatches(
  a: CellVolume,
  b: CellVolume,
  aFloor: BoundaryEdgeProfile,
  bFloor: BoundaryEdgeProfile
): OpenBoundaryPatches {
  const openBottom = {
    z0: Math.max(aFloor.z0, bFloor.z0),
    z1: Math.max(aFloor.z1, bFloor.z1),
  };
  const openTop = Math.min(a.ceilingZ, b.ceilingZ);
  if (!(openBottom.z0 < openTop) || !(openBottom.z1 < openTop)) {
    return {
      valid: false,
      open: null,
      aClosed: [fullBoundaryPatch(a, aFloor)],
      bClosed: [fullBoundaryPatch(b, bFloor)],
    };
  }
  return {
    valid: true,
    open: { bottom0: openBottom.z0, bottom1: openBottom.z1, top: openTop },
    aClosed: outsideOpenPatches(a, aFloor, openBottom, openTop),
    bClosed: outsideOpenPatches(b, bFloor, openBottom, openTop),
  };
}

export function fullBoundaryPatch(
  volume: CellVolume,
  floor: BoundaryEdgeProfile
): BoundaryPatch {
  return {
    bottom0: floor.z0,
    bottom1: floor.z1,
    top0: volume.ceilingZ,
    top1: volume.ceilingZ,
    kind: "fullClosure",
  };
}
