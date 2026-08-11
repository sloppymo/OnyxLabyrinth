import { describe, expect, it } from "vitest";
import { compileOpenBoundarySpans, fullBoundarySpan } from "./boundary-spans";

describe("vertical boundary spans", () => {
  it("emits a full legacy wall span", () => {
    expect(fullBoundarySpan({ floorZ: 0, ceilingZ: 1 })).toEqual({
      minY: 0,
      maxY: 1,
      kind: "fullClosure",
    });
  });

  it("leaves equal open neighbors unobstructed", () => {
    expect(
      compileOpenBoundarySpans(
        { floorZ: 0, ceilingZ: 1 },
        { floorZ: 0, ceilingZ: 1 }
      )
    ).toEqual({
      valid: true,
      open: { minY: 0, maxY: 1 },
      aClosed: [],
      bClosed: [],
    });
  });

  it("closes the upper face over a low-to-tall opening", () => {
    const result = compileOpenBoundarySpans(
      { floorZ: 0, ceilingZ: 1 },
      { floorZ: 0, ceilingZ: 3 }
    );
    expect(result.open).toEqual({ minY: 0, maxY: 1 });
    expect(result.aClosed).toEqual([]);
    expect(result.bClosed).toEqual([
      { minY: 1, maxY: 3, kind: "upperClosure" },
    ]);
  });

  it("creates the lower riser for an open floor step", () => {
    const result = compileOpenBoundarySpans(
      { floorZ: 0, ceilingZ: 2 },
      { floorZ: 0.5, ceilingZ: 2 }
    );
    expect(result.open).toEqual({ minY: 0.5, maxY: 2 });
    expect(result.aClosed).toEqual([
      { minY: 0, maxY: 0.5, kind: "lowerClosure" },
    ]);
  });

  it("rejects non-overlapping air volumes", () => {
    const result = compileOpenBoundarySpans(
      { floorZ: 0, ceilingZ: 1 },
      { floorZ: 2, ceilingZ: 3 }
    );
    expect(result.valid).toBe(false);
    expect(result.open).toBeNull();
    expect(result.aClosed[0]).toMatchObject({ minY: 0, maxY: 1 });
    expect(result.bClosed[0]).toMatchObject({ minY: 2, maxY: 3 });
  });
});
