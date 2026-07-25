import { describe, expect, it } from "vitest";
import { computeIdle, type IdleInput } from "./idle";

function base(overrides: Partial<IdleInput> = {}): IdleInput {
  return {
    modeTransitionPending: false,
    cameraAnimating: false,
    prologueActive: false,
    combat: null,
    ...overrides,
  };
}

describe("computeIdle", () => {
  it("is idle when nothing is happening", () => {
    expect(computeIdle(base())).toBe(true);
  });

  it("is not idle while a mode fade is pending", () => {
    expect(computeIdle(base({ modeTransitionPending: true }))).toBe(false);
  });

  it("is not idle while the render camera is animating", () => {
    expect(computeIdle(base({ cameraAnimating: true }))).toBe(false);
  });

  it("is not idle while the prologue is auto-playing", () => {
    expect(computeIdle(base({ prologueActive: true }))).toBe(false);
  });

  it("is not idle mid-playback with choreography unfinished", () => {
    expect(
      computeIdle(base({ combat: { phase: "playback", playbackDone: false } }))
    ).toBe(false);
  });

  it("is idle once playback choreography finishes", () => {
    expect(
      computeIdle(base({ combat: { phase: "playback", playbackDone: true } }))
    ).toBe(true);
  });

  it("is idle in the result phase regardless of playbackDone", () => {
    expect(
      computeIdle(base({ combat: { phase: "result", playbackDone: false } }))
    ).toBe(true);
  });

  it("is idle in menu/selection phases awaiting input", () => {
    for (const phase of ["palette", "selectTarget", "selectSpell", "selectItem"]) {
      expect(computeIdle(base({ combat: { phase, playbackDone: false } }))).toBe(true);
    }
  });

  it("combines multiple blockers — any one holds it not-idle", () => {
    expect(
      computeIdle(
        base({
          cameraAnimating: false,
          prologueActive: true,
          combat: { phase: "result", playbackDone: true },
        })
      )
    ).toBe(false);
  });

  it("does not mutate its input", () => {
    const input = base({ combat: { phase: "playback", playbackDone: false } });
    const snapshot = JSON.stringify(input);
    computeIdle(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
