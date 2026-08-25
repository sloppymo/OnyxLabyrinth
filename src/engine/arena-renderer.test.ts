import { describe, expect, it } from "vitest";
import {
  neutralizeBakedWaterColor,
  quantizeArenaUnit,
  sluiceWaterCoverage,
} from "./arena-renderer";

describe("arena presentation math", () => {
  it("quantizes the existing fog response into stable depth bands", () => {
    expect(quantizeArenaUnit(0.51, 8)).toBe(4 / 7);
    expect(quantizeArenaUnit(-1, 8)).toBe(0);
    expect(quantizeArenaUnit(2, 8)).toBe(1);
    expect(quantizeArenaUnit(0.51, 0)).toBe(0.51);
  });

  it("keeps the authored water channel continuous from sluice to foreground", () => {
    expect(sluiceWaterCoverage(-0.65, 18)).toBeGreaterThan(0.8);
    expect(sluiceWaterCoverage(0.6, 3.2)).toBeGreaterThan(0.8);
    expect(sluiceWaterCoverage(7, 12)).toBe(0);
  });

  it("turns baked green puddles into dry stone without touching neutral stone", () => {
    expect(neutralizeBakedWaterColor(40, 92, 52)[1]).toBeLessThan(92);
    expect(neutralizeBakedWaterColor(70, 72, 68)).toEqual([70, 72, 68]);
  });
});
