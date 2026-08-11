import { describe, expect, it } from "vitest";
import {
  LEGACY_VERTICAL_UNIT,
  resolveCellVolume,
} from "./cell-volume";

describe("resolveCellVolume", () => {
  it("defaults every legacy cell to 0→1", () => {
    expect(resolveCellVolume({ id: 1 }, 4, 7)).toEqual({ floorZ: 0, ceilingZ: 1 });
  });

  it("applies later overlapping height zones last", () => {
    const floor = {
      id: 1,
      heightZones: [
        { id: "tall", x1: 1, y1: 1, x2: 3, y2: 3, ceilingZ: 2 },
        { id: "grand", x1: 2, y1: 2, x2: 2, y2: 2, floorZ: 0.25, ceilingZ: 3 },
      ],
    };
    expect(resolveCellVolume(floor, 1, 1)).toEqual({ floorZ: 0, ceilingZ: 2 });
    expect(resolveCellVolume(floor, 2, 2)).toEqual({ floorZ: 0.25, ceilingZ: 3 });
  });

  it("derives a stable legacy vertical world unit", () => {
    expect(LEGACY_VERTICAL_UNIT).toBeCloseTo(0.532, 3);
  });
});
