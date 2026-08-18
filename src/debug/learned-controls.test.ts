import { describe, expect, it } from "vitest";
import { extractControlHints, mergeLearnedControls } from "./learned-controls";

describe("extractControlHints", () => {
  it("learns dungeon chrome keys only after they appear on screen", () => {
    expect(extractControlHints([])).toEqual([]);
    expect(extractControlHints(["Tab:Actions · Esc:Save", "Y / V · MAP"])).toEqual([
      "Tab: Actions",
      "Escape: Save",
      "Y/V: Map",
    ]);
  });

  it("learns Unlock from the contextual prompt, not from a hidden verb list", () => {
    expect(extractControlHints(["U Unlock"])).toEqual(["U: Unlock"]);
    expect(extractControlHints(["the door is locked"])).toEqual([]);
  });

  it("learns trap keys from the trap window footer", () => {
    const hints = extractControlHints(["I inspect · D disarm · O open · L leave"]);
    expect(hints).toEqual(["I: Inspect", "D: Disarm", "O: Open", "L: Leave"]);
  });
});

describe("mergeLearnedControls", () => {
  it("accumulates without duplicates", () => {
    const first = mergeLearnedControls([], ["Tab:Actions"]);
    const second = mergeLearnedControls(first, ["Tab:Actions", "U Unlock"]);
    expect(second).toEqual(["Tab: Actions", "U: Unlock"]);
  });
});
