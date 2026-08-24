import { describe, expect, it } from "vitest";
import { handDigitAction } from "./card-trial-hotkeys";

describe("handDigitAction", () => {
  it("maps 1..N onto cards and ignores digits past the live hand", () => {
    expect(handDigitAction(1, 5)).toEqual({ kind: "card", index: 0 });
    expect(handDigitAction(5, 5)).toEqual({ kind: "card", index: 4 });
    expect(handDigitAction(5, 4)).toEqual({ kind: "none" });
    expect(handDigitAction(4, 3)).toEqual({ kind: "none" });
    expect(handDigitAction(1, 0)).toEqual({ kind: "none" });
    expect(handDigitAction(6, 5)).toEqual({ kind: "none" });
    expect(handDigitAction(0, 5)).toEqual({ kind: "none" });
  });
});
