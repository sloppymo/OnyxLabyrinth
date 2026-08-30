import { describe, expect, it } from "vitest";
import { baseHitWouldKill, hushHalves, openerWillApply, plannedOpenerLabel } from "./plan";

describe("named planning helpers", () => {
  it("treats a base hit that meets remaining HP as a kill", () => {
    expect(baseHitWouldKill(4, 4)).toBe(true);
    expect(baseHitWouldKill(5, 4)).toBe(false);
    expect(openerWillApply(true, 4, 4)).toBe(false);
    expect(plannedOpenerLabel("open-the-rank", 4, 4)).toBe("Kill · no Open");
    expect(plannedOpenerLabel("open-the-rank", 8, 4)).toBe("Open");
  });

  it("halves Hush damage rounding up", () => {
    expect(hushHalves(9)).toBe(5);
    expect(hushHalves(8)).toBe(4);
  });
});
