import { describe, expect, it } from "vitest";
import type { FloorDef } from "../../../data/floors";
import { newFloorMapJSON, mapToFloorDef } from "../../../game/floor-map";
import {
  floorSurfaceEdgeHeights,
  floorSurfaceZAtDisplayPosition,
  floorSurfaceZAt,
  floorSurfaceZAtWorldPosition,
  resolveFloorSurface,
  surfacesConnectAcrossEdge,
  type FloorSurface,
} from "./floor-surface";

function sample(surface: FloorSurface): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((progress) => {
    if (surface.kind === "flat") return floorSurfaceZAt(surface, progress, progress);
    if (surface.dir === "n") return floorSurfaceZAt(surface, 0.5, 1 - progress);
    if (surface.dir === "s") return floorSurfaceZAt(surface, 0.5, progress);
    if (surface.dir === "e") return floorSurfaceZAt(surface, progress, 0.5);
    return floorSurfaceZAt(surface, 1 - progress, 0.5);
  });
}

describe("floor surfaces", () => {
  it.each(["n", "e", "s", "w"] as const)(
    "%s-rising surfaces interpolate low to high",
    (dir) => {
      expect(sample({ kind: "ramp", lowZ: 0, highZ: 1, dir })).toEqual([
        0, 0.25, 0.5, 0.75, 1,
      ]);
    }
  );

  it.each([
    [0, 0.25],
    [0.25, 1],
    [1, 2.5],
  ])("supports a non-unit rise from %s to %s", (lowZ, highZ) => {
    expect(sample({ kind: "ramp", lowZ, highZ, dir: "e" })).toEqual([
      lowZ,
      lowZ + (highZ - lowZ) * 0.25,
      lowZ + (highZ - lowZ) * 0.5,
      lowZ + (highZ - lowZ) * 0.75,
      highZ,
    ]);
  });

  it("resolves gradual connectors from their base and uphill neighbor", () => {
    const floor = mapToFloorDef(newFloorMapJSON(6, 3)) as FloorDef;
    floor.heightZones = [
      { id: "quarter", x1: 2, y1: 1, x2: 2, y2: 1, floorZ: 0.25, ceilingZ: 2 },
      { id: "half", x1: 3, y1: 1, x2: 3, y2: 1, floorZ: 0.5, ceilingZ: 2 },
      { id: "high", x1: 4, y1: 1, x2: 4, y2: 1, floorZ: 0.75, ceilingZ: 2 },
    ];
    floor.ramps = [
      { x: 1, y: 1, dir: "e", surface: "ramp" },
      { x: 2, y: 1, dir: "e", surface: "ramp" },
      { x: 3, y: 1, dir: "e", surface: "stairs" },
    ];
    expect(resolveFloorSurface(floor, 1, 1)).toEqual({
      kind: "ramp", lowZ: 0, highZ: 0.25, dir: "e",
    });
    expect(resolveFloorSurface(floor, 2, 1)).toEqual({
      kind: "ramp", lowZ: 0.25, highZ: 0.5, dir: "e",
    });
    expect(resolveFloorSurface(floor, 3, 1)).toEqual({
      kind: "stairs", lowZ: 0.5, highZ: 0.75, dir: "e",
    });
  });

  it("reports sloped side-edge endpoint heights", () => {
    const surface: FloorSurface = { kind: "ramp", lowZ: 0, highZ: 1, dir: "n" };
    expect(floorSurfaceEdgeHeights(surface, "w")).toEqual({ z0: 1, z1: 0 });
    expect(floorSurfaceEdgeHeights(surface, "e")).toEqual({ z0: 1, z1: 0 });
    expect(floorSurfaceEdgeHeights(surface, "n")).toEqual({ z0: 1, z1: 1 });
    expect(floorSurfaceEdgeHeights(surface, "s")).toEqual({ z0: 0, z1: 0 });
  });

  it("samples continuous world positions across flat and ramp cells", () => {
    const floor = mapToFloorDef(newFloorMapJSON(4, 3)) as FloorDef;
    floor.heightZones = [
      { id: "high", x1: 2, y1: 1, x2: 3, y2: 1, floorZ: 1, ceilingZ: 2 },
    ];
    floor.ramps = [{ x: 1, y: 1, dir: "e", surface: "ramp" }];
    expect(floorSurfaceZAtWorldPosition(floor, 0.5, 1.5)).toBe(0);
    expect(floorSurfaceZAtWorldPosition(floor, 1, 1.5)).toBe(0);
    expect(floorSurfaceZAtWorldPosition(floor, 1.5, 1.5)).toBe(0.5);
    expect(floorSurfaceZAtWorldPosition(floor, 2, 1.5)).toBe(1);
    expect(floorSurfaceZAtWorldPosition(floor, 2.5, 1.5)).toBe(1);
  });

  it("derives smooth camera base elevation across both ramp half-steps", () => {
    const floor = mapToFloorDef(newFloorMapJSON(5, 3)) as FloorDef;
    floor.heightZones = [
      { id: "high", x1: 3, y1: 1, x2: 4, y2: 1, floorZ: 1, ceilingZ: 2 },
    ];
    floor.ramps = [{ x: 2, y: 1, dir: "e", surface: "ramp" }];
    // Display positions are cell-center indices: low cell 1, ramp cell 2,
    // high cell 3. The ramp itself occupies world X 2→3.
    expect([1, 1.5, 2, 2.5, 3].map((x) =>
      floorSurfaceZAtDisplayPosition(floor, x, 1)
    )).toEqual([0, 0, 0.5, 1, 1]);
  });

  it("permits low/high connector edges and rejects side entry or raw steps", () => {
    const floor = mapToFloorDef(newFloorMapJSON(5, 5)) as FloorDef;
    floor.heightZones = [
      { id: "high", x1: 2, y1: 1, x2: 2, y2: 1, floorZ: 1, ceilingZ: 2 },
      { id: "raw-high", x1: 4, y1: 3, x2: 4, y2: 3, floorZ: 1, ceilingZ: 2 },
    ];
    floor.ramps = [{ x: 2, y: 2, dir: "n", surface: "ramp" }];
    expect(surfacesConnectAcrossEdge(floor, 2, 3, "n")).toBe(true);
    expect(surfacesConnectAcrossEdge(floor, 2, 2, "n")).toBe(true);
    expect(surfacesConnectAcrossEdge(floor, 2, 2, "e")).toBe(false);
    expect(surfacesConnectAcrossEdge(floor, 3, 3, "e")).toBe(false);
  });
});
