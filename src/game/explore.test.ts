import { describe, expect, it } from "vitest";
import { findFloor } from "./floor-registry";
import { revealAround } from "./explore";

describe("revealAround", () => {
  it("fills the F1 entry corridor from the start tile, not just a 4-neighbor cross", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY);

    expect(explored.has(`${floor.startX},${floor.startY}`)).toBe(true);
    expect(explored.has("1,22")).toBe(true);
    expect(explored.has("2,23")).toBe(true);
    // East is walled off at the entry — not revealed from start.
    expect(explored.has("4,22")).toBe(false);
    // Solid rock beyond the carved corridor stays fogged.
    expect(explored.has("0,22")).toBe(false);
    expect(explored.has(`${floor.startX},31`)).toBe(false);
  });

  it("does not walk through walls into the northern maze from the entry corridor", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY, 4);
    // Stairs down in the north stay hidden from the southwest entry.
    expect(explored.has("5,2")).toBe(false);
  });

  it("extends along an open corridor as the party walks", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY, 3);
    revealAround(explored, floor, 8, 22, 3);
    expect(explored.has("8,22")).toBe(true);
    // East maze stays hidden until the party reaches it.
    expect(explored.has("20,8")).toBe(false);
  });
});
