import { describe, expect, it } from "vitest";
import { FLOORS } from "../data/floors";
import { revealAround } from "./explore";

describe("revealAround", () => {
  it("fills the F1 entry hall from the start tile, not just a 4-neighbor cross", () => {
    const floor = FLOORS.find((f) => f.id === 1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, floor.startX, floor.startY);

    // Start + the carved entry room (4..7, 8..10) should be largely visible.
    expect(explored.has("5,9")).toBe(true);
    expect(explored.has("4,9")).toBe(true);
    expect(explored.has("6,9")).toBe(true);
    expect(explored.has("7,9")).toBe(true);
    expect(explored.has("5,8")).toBe(true);
    expect(explored.has("4,8")).toBe(true);
    expect(explored.has("6,8")).toBe(true);
    // Solid rock beyond the room must stay fogged (was falsely marked before).
    expect(explored.has("5,11")).toBe(false);
    expect(explored.has("3,9")).toBe(false);
  });

  it("does not walk through walls into the north sanctum from the entry hall", () => {
    const floor = FLOORS.find((f) => f.id === 1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, 5, 9, 3);
    // Crossroads (5,5) is 4 steps north of start — outside depth 3 via the corridor.
    expect(explored.has("5,5")).toBe(false);
    // Sanctum stairs stay hidden.
    expect(explored.has("5,1")).toBe(false);
  });

  it("extends along an open corridor as the party walks", () => {
    const floor = FLOORS.find((f) => f.id === 1)!;
    const explored = new Set<string>();
    revealAround(explored, floor, 5, 9, 3);
    revealAround(explored, floor, 5, 7, 3);
    expect(explored.has("5,5")).toBe(true);
    // Still blocked west into the crypt until the party reaches the junction.
    expect(explored.has("2,5")).toBe(false);
  });
});
