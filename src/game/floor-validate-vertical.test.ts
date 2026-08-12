import { describe, it, expect } from "vitest";
import { newFloorMapJSON } from "./floor-map";
import { validateFloorMap } from "./floor-validate";
import { buildOpenRoom } from "./dungeon";
import type { FloorMapJSON } from "./floor-map";

function baseMap(partial: Partial<FloorMapJSON> = {}): FloorMapJSON {
  const map = newFloorMapJSON(8, 8, {
    id: 900,
    name: "Vertical QA",
    ...partial,
  });
  map.grid = buildOpenRoom(8, 8) as unknown as FloorMapJSON["grid"];
  return { ...map, ...partial };
}

describe("vertical landing validation", () => {
  it("accepts a well-formed upper landing", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 3 }],
      verticalLandings: [
        { id: "base", x: 1, y: 1, z: 0 },
        {
          id: "upper",
          x: 1,
          y: 1,
          z: 1,
          edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
        },
      ],
    });
    const issues = validateFloorMap(map).filter((i) => i.severity === "error");
    expect(issues).toEqual([]);
  });

  it("rejects a Z not aligned to the vertical quantum", () => {
    const map = baseMap({
      verticalLandings: [{ id: "bad", x: 1, y: 1, z: 0.13 }],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("landing_z_not_quantized");
  });

  it("rejects duplicate (x,y,z) landings", () => {
    const landing = { id: "base", x: 1, y: 1, z: 0 };
    const map = baseMap({
      verticalLandings: [landing, { ...landing, id: "other" }],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("landing_duplicate_xyz");
  });

  it("requires complete edges on upper (non-base) landings", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 3 }],
      verticalLandings: [
        { id: "base", x: 1, y: 1, z: 0 },
        { id: "upper", x: 1, y: 1, z: 1 },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("landing_incomplete_edges");
  });

  it("rejects an upper landing with insufficient ceiling clearance", () => {
    const map = baseMap({
      heightZones: [{ id: "low", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 1 }],
      verticalLandings: [
        { id: "base", x: 1, y: 1, z: 0 },
        {
          id: "upper",
          x: 1,
          y: 1,
          z: 0.5,
          edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
        },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("landing_clearance_too_small");
  });

  it("rejects a non-wall landing edge that has no neighbor at the same Z", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 3, y2: 1, floorZ: 0, ceilingZ: 3 }],
      verticalLandings: [
        {
          id: "upper",
          x: 1,
          y: 1,
          z: 1,
          edgeOverrides: { n: "wall", e: "open", s: "wall", w: "wall" },
        },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("landing_edge_no_neighbor");
  });
});

describe("ladder validation", () => {
  it("accepts a well-formed ladder between a base and upper landing", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 3 }],
      verticalLandings: [
        { id: "base", x: 1, y: 1, z: 0 },
        {
          id: "upper",
          x: 1,
          y: 1,
          z: 1,
          edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
        },
      ],
      ladders: [{ id: "l1", x: 1, y: 1, fromZ: 0, toZ: 1, facing: "n" }],
    });
    const issues = validateFloorMap(map).filter((i) => i.severity === "error");
    expect(issues).toEqual([]);
  });

  it("rejects a ladder with fromZ === toZ", () => {
    const map = baseMap({
      ladders: [{ id: "l1", x: 1, y: 1, fromZ: 0, toZ: 0, facing: "n" }],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ladder_same_z");
  });

  it("rejects a ladder with non-quantized Z values", () => {
    const map = baseMap({
      ladders: [{ id: "l1", x: 1, y: 1, fromZ: 0, toZ: 0.13, facing: "n" }],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ladder_z_not_quantized");
  });

  it("rejects a ladder whose endpoint has no landing or base surface", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 3 }],
      ladders: [{ id: "l1", x: 1, y: 1, fromZ: 0, toZ: 1, facing: "n" }],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ladder_endpoint_missing");
  });

  it("rejects an invalid unlockFrom direction", () => {
    const map = baseMap({
      heightZones: [{ id: "room", x1: 1, y1: 1, x2: 1, y2: 1, floorZ: 0, ceilingZ: 3 }],
      verticalLandings: [
        { id: "base", x: 1, y: 1, z: 0 },
        {
          id: "upper",
          x: 1,
          y: 1,
          z: 1,
          edgeOverrides: { n: "wall", e: "wall", s: "wall", w: "wall" },
        },
      ],
      ladders: [
        {
          id: "l1",
          x: 1,
          y: 1,
          fromZ: 0,
          toZ: 1,
          facing: "n",
          unlockFrom: "up" as any,
        },
      ],
    });
    const codes = validateFloorMap(map).map((i) => i.code);
    expect(codes).toContain("ladder_unlock_from_invalid");
  });
});
