import { describe, expect, it } from "vitest";
import { floorBounceLightForActor, floorBounceRgba } from "./combat-floor-light";

describe("shared combat floor bounce light", () => {
  it("is a quiet, deterministic pool anchored to the live foot position", () => {
    const input = { x: 312, footY: 544, drawSize: 120, opacity: 1 };
    const first = floorBounceLightForActor(input);
    const second = floorBounceLightForActor(input);
    expect(first).toEqual(second);
    expect(first.x).toBe(312);
    expect(first.y).toBeCloseTo(538.6);
    expect(first.radius).toBeCloseTo(45.6);
    expect(first.alpha).toBeLessThan(0.06);
    expect(floorBounceRgba(first)).toBe("rgba(115, 152, 134, 0.055)");
  });

  it("scales visibility with actor opacity without changing its geometry", () => {
    const visible = floorBounceLightForActor({ x: 1, footY: 2, drawSize: 80, opacity: 1 });
    const hidden = floorBounceLightForActor({ x: 1, footY: 2, drawSize: 80, opacity: 0.35 });
    expect(hidden.x).toBe(visible.x);
    expect(hidden.y).toBe(visible.y);
    expect(hidden.radius).toBe(visible.radius);
    expect(hidden.alpha).toBeCloseTo(visible.alpha * 0.35);
  });
});
