import { describe, expect, it } from "vitest";
import { findFloor } from "./floor-registry";
import { revealAround } from "./explore";

describe("revealAround", () => {
  it("fills the F1 gate-hall atrium from the start tile, not just a 4-neighbor cross", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY);

    expect(explored.has(`${floor.startX},${floor.startY}`)).toBe(true);
    expect(explored.has("9,35")).toBe(true);
    expect(explored.has("11,32")).toBe(true);
    expect(explored.has("13,34")).toBe(true);
    // The far gate-hall corner is outside the default three-step reveal.
    expect(explored.has("9,33")).toBe(false);
    // The gate itself sits one step past the default reveal.
    expect(explored.has("11,31")).toBe(false);
    // Solid rock beyond the gate hall's west wall stays fogged.
    expect(explored.has("8,35")).toBe(false);
  });

  it("does not walk through walls into the northern maze from the entry corridor", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY, 4);
    // Stairs down in the north stay hidden from the southern entry.
    expect(explored.has("20,2")).toBe(false);
  });

  it("extends along an open corridor as the party walks", () => {
    const floor = findFloor(1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY, 3);
    revealAround(explored, floor, 11, 20, 3);
    expect(explored.has("11,20")).toBe(true);
    expect(explored.has("9,19")).toBe(true);
    // The distant cistern key-chest stays hidden until the party reaches it.
    expect(explored.has("20,12")).toBe(false);
  });
});
