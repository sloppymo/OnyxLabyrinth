import { describe, expect, it } from "vitest";
import { sampleCombatBackdropEnvironment } from "./combat-backdrop-environment";

describe("combat backdrop environment", () => {
  it("is active only for the flooded F1 backdrop", () => {
    expect(sampleCombatBackdropEnvironment("theme:f1", 1200, 768, 672).active).toBe(true);
    expect(sampleCombatBackdropEnvironment("theme:f2", 1200, 768, 672).active).toBe(false);
    expect(sampleCombatBackdropEnvironment("combat-bg", 1200, 768, 672).active).toBe(false);
  });

  it("is deterministic and keeps every primitive inside the design surface", () => {
    const a = sampleCombatBackdropEnvironment("theme:f1", 2468, 768, 672);
    const b = sampleCombatBackdropEnvironment("theme:f1", 2468, 768, 672);
    expect(a).toEqual(b);
    expect(a.torchFrame).toBeGreaterThanOrEqual(0);
    expect(a.torchFrame).toBeLessThan(4);
    for (const drop of a.droplets) {
      expect(drop.x).toBeGreaterThanOrEqual(0);
      expect(drop.x).toBeLessThanOrEqual(768);
      expect(drop.y).toBeGreaterThanOrEqual(0);
      expect(drop.y).toBeLessThanOrEqual(672);
      expect(drop.alpha).toBeGreaterThanOrEqual(0);
      expect(drop.alpha).toBeLessThanOrEqual(1);
    }
  });
});
