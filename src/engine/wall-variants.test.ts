import { describe, expect, it } from "vitest";
import {
  WALL_VARIANT_SUFFIXES,
  wallEdgeKey,
  wallVariantForEdge,
} from "./wall-variants";

describe("wall variant selection", () => {
  it("normalizes both sides of a physical edge to one key", () => {
    expect(wallEdgeKey(3, 3, "n")).toBe(wallEdgeKey(3, 2, "s"));
    expect(wallEdgeKey(3, 3, "w")).toBe(wallEdgeKey(2, 3, "e"));
  });

  it("keeps regional themes without a family on their canonical wall", () => {
    expect(wallVariantForEdge(2, "f2b", 4, 4, "n")).toBe("");
    expect(wallVariantForEdge(1, "namanda", 4, 4, "n")).toBe("");
  });

  it("is deterministic and always returns a shipped suffix", () => {
    const first = wallVariantForEdge(3, "f3", 18, 12, "e");
    const second = wallVariantForEdge(3, "f3", 18, 12, "e");
    expect(first).toBe(second);
    expect(WALL_VARIANT_SUFFIXES).toContain(first);
  });

  it("does not place adjacent hero candidates along one wall plane", () => {
    let heroCount = 0;
    for (let x = 0; x < 48; x++) {
      for (let y = 0; y < 48; y++) {
        const vertical = wallVariantForEdge(4, "f4", x, y, "e");
        const north = wallVariantForEdge(4, "f4", x, y, "n");
        if (vertical === "_j") {
          heroCount++;
          expect(wallVariantForEdge(4, "f4", x, y - 1, "e")).not.toBe("_j");
          expect(wallVariantForEdge(4, "f4", x, y + 1, "e")).not.toBe("_j");
        }
        if (north === "_j") {
          heroCount++;
          expect(wallVariantForEdge(4, "f4", x - 1, y, "n")).not.toBe("_j");
          expect(wallVariantForEdge(4, "f4", x + 1, y, "n")).not.toBe("_j");
        }
      }
    }
    expect(heroCount).toBeGreaterThan(0);
  });
});
