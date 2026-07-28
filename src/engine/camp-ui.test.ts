/**
 * Camp reorder: controller (D-pad + A) must work — the old screen only
 * accepted digit keys, which gamepads never send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CampController } from "./camp-ui";
import { createGameState } from "../game/state";
import { createDefaultParty } from "../game/party";
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
  party: ReturnType<typeof createDefaultParty>;
  panel: HTMLElement;
} {
  flushCampAnim();
  const party = createDefaultParty();
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

/** From post-camp menu: open Reorder Party (3rd item after continue, cast). */
function openReorder(ctrl: CampController): void {
  ctrl.handleKey("ArrowDown"); // cast
  ctrl.handleKey("ArrowDown"); // sheet
  ctrl.handleKey("ArrowDown"); // reorder
  ctrl.handleKey("Enter");
}

describe("CampController reorder (controller-friendly)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("swaps two characters with ArrowDown + Enter (pad → synthetic keys)", () => {
    const { ctrl, party, panel } = openCamp();
    const first = party[0]!.name;
    const second = party[1]!.name;
    openReorder(ctrl);

    expect(panel.textContent).toMatch(/Reorder Party/);
    expect(panel.textContent).toMatch(/D-pad select/);

    // Cursor starts on slot 0 — mark Aria, then move to Bram and swap.
    ctrl.handleKey("Enter");
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("Enter");

    expect(party[0]!.name).toBe(second);
    expect(party[1]!.name).toBe(first);
  });

  it("still supports digit hotkeys 1-4", () => {
    const { ctrl, party } = openCamp();
    openReorder(ctrl);
    const a = party[0]!.name;
    const c = party[2]!.name;
    ctrl.handleKey("1");
    ctrl.handleKey("3");
    expect(party[0]!.name).toBe(c);
    expect(party[2]!.name).toBe(a);
  });

  it("Escape returns to the camp menu", () => {
    const { ctrl, panel } = openCamp();
    openReorder(ctrl);
    ctrl.handleKey("Escape");
    expect(panel.textContent).toMatch(/Continue exploring/);
  });
});

describe("CampController rest audio", () => {
  it("plays the cure cue when rest finishes", () => {
    const cue = vi.spyOn(audio, "uiCureMenu").mockImplementation(() => {});
    openCamp();
    expect(cue).toHaveBeenCalledTimes(1);
  });
});
