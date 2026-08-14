import { describe, expect, it } from "vitest";
import { FLOORS, cloneFloor } from "../data/floors";
import {
  analyzeRecoveryPath,
  isSafeRecoveryLanding,
  resolveRecoveryLanding,
} from "./recovery";

describe("wipe recovery landing", () => {
  it("keeps an ordinary floor checkpoint exact", () => {
    const floor = cloneFloor(FLOORS.find((entry) => entry.id === 2)!);
    expect(isSafeRecoveryLanding(floor, 2, 12)).toBe(true);
    expect(resolveRecoveryLanding(floor, 2, 12)).toEqual({
      x: 2,
      y: 12,
      exact: true,
      distance: 0,
      reason: "exact",
    });
  });

  it("moves a climax chest checkpoint onto nearby ordinary floor", () => {
    const floor = cloneFloor(FLOORS.find((entry) => entry.id === 3)!);
    const landing = resolveRecoveryLanding(floor, 9, 13);
    expect(landing.exact).toBe(false);
    expect(landing.distance).toBe(1);
    expect(floor.grid[landing.y]?.[landing.x]?.tile).toBeUndefined();
    expect(isSafeRecoveryLanding(floor, landing.x, landing.y)).toBe(true);
  });

  it("rejects void, stairs, and authored event cells as landing targets", () => {
    const bridge = cloneFloor(FLOORS.find((entry) => entry.id === 2)!);
    const voidLanding = resolveRecoveryLanding(bridge, 3, 17);
    expect(bridge.grid[voidLanding.y]?.[voidLanding.x]?.void).not.toBe(true);
    expect(bridge.grid[voidLanding.y]?.[voidLanding.x]?.tile).toBeUndefined();
    expect(isSafeRecoveryLanding(bridge, voidLanding.x, voidLanding.y)).toBe(true);

    const forge = cloneFloor(FLOORS.find((entry) => entry.id === 3)!);
    const stairLanding = resolveRecoveryLanding(forge, 2, 2);
    expect(forge.grid[stairLanding.y]?.[stairLanding.x]?.tile).toBeUndefined();
    expect(isSafeRecoveryLanding(forge, stairLanding.x, stairLanding.y)).toBe(true);
  });

  it("reports an unavailable route instead of inventing a progression bypass", () => {
    const floor = cloneFloor(FLOORS.find((entry) => entry.id === 2)!);
    floor.grid[13]![2]!.n = "locked";
    floor.grid[12]![2]!.s = "locked";
    floor.grid[13]![2]!.s = "wall";
    floor.grid[14]![2]!.n = "wall";
    const path = analyzeRecoveryPath(floor, { x: 2, y: 13 }, { x: 2, y: 11 });
    expect(path.available).toBe(false);
    expect(path.length).toBeNull();
  });

  it("counts doors and authored event cells on a reachable retry path", () => {
    const floor = cloneFloor(FLOORS.find((entry) => entry.id === 2)!);
    floor.grid[11]![2]!.s = "door";
    floor.grid[12]![2]!.n = "door";
    const path = analyzeRecoveryPath(floor, { x: 2, y: 13 }, { x: 3, y: 11 });
    expect(path.available).toBe(true);
    expect(path.crossedDoors).toBeGreaterThanOrEqual(1);
    expect(path.crossedEvents).toContain("3,11");
  });
});
