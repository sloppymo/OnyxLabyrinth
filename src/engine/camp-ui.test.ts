/** Camp screen tests for the fixed Old Man + Rat King roster. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CampController } from "./camp-ui";
import { createGameState } from "../game/state";
import { createPlayableDuo } from "../game/playable-duo";
import { FLOORS } from "../data/floors";
import { audio } from "./audio";

function flushCampAnim(): void {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    now += 5000;
    cb(now);
    return 1;
  });
}

function openCamp(): {
  ctrl: CampController;
  party: ReturnType<typeof createPlayableDuo>;
  panel: HTMLElement;
} {
  flushCampAnim();
  const party = createPlayableDuo();
  const state = createGameState(FLOORS[0]);
  state.party = party;
  const panel = document.createElement("div");
  const ctrl = new CampController({
    panel,
    party,
    dayCount: 1,
    state,
    onEnd: () => {},
  });
  return { ctrl, party, panel };
}

describe("CampController fixed roster", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not expose a roster reorder action for the fixed duo", () => {
    const { panel } = openCamp();
    expect(panel.textContent).toContain("View character sheets");
    expect(panel.textContent).not.toMatch(/Reorder/);
  });
});

describe("CampController rest audio", () => {
  it("plays the cure cue when rest finishes", () => {
    const cue = vi.spyOn(audio, "uiCureMenu").mockImplementation(() => {});
    openCamp();
    expect(cue).toHaveBeenCalledTimes(1);
  });

  it("owns and releases the shared panel's camp-scene phase", () => {
    const { ctrl, panel } = openCamp();
    expect(panel.dataset.campPhase).toBe("menu");

    ctrl.handleKey("Escape");
    expect(panel.dataset.campPhase).toBeUndefined();
  });
});
