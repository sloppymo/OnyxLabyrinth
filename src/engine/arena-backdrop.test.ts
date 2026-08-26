import { describe, expect, it } from "vitest";
import {
  arenaBackdropSource,
  AUTHORED_ARENA_BACKDROP_SIZE,
  hasValidAuthoredArenaBackdrop,
} from "./arena-backdrop";

const loadedPlate = {
  complete: true,
  naturalWidth: AUTHORED_ARENA_BACKDROP_SIZE.width,
  naturalHeight: AUTHORED_ARENA_BACKDROP_SIZE.height,
};

describe("authored combat backdrop contract", () => {
  it("uses the authored plate only for a complete F1-sized image", () => {
    expect(hasValidAuthoredArenaBackdrop("f1", loadedPlate)).toBe(true);
    expect(arenaBackdropSource("f1", loadedPlate)).toBe("authored");
  });

  it.each([
    ["other theme", "f2", loadedPlate],
    ["not loaded", "f1", { ...loadedPlate, complete: false }],
    ["wrong width", "f1", { ...loadedPlate, naturalWidth: 256 }],
    ["wrong height", "f1", { ...loadedPlate, naturalHeight: 256 }],
  ])("keeps the procedural fallback for %s", (_label, theme, image) => {
    expect(arenaBackdropSource(theme, image)).toBe("procedural");
  });

  it("does not claim a missing image is authored", () => {
    expect(arenaBackdropSource("f1", null)).toBe("procedural");
  });
});
