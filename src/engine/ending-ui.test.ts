import { afterEach, describe, expect, it, vi } from "vitest";
import { audio } from "./audio";
import {
  ENDING_BEATS,
  ENDING_STYLE,
  holdDurationMs,
  EndingController,
} from "./ending-ui";

describe("ENDING_BEATS", () => {
  it("is the locked wish/ending copy, verbatim and in order", () => {
    expect([...ENDING_BEATS]).toEqual([
      "Bring the gods back.",
      "The gods return.",
      "Death returns with them.",
      "When the news reaches the town,\nthe people make sure.",
      "The hole is still there.\nThe lamp is empty.",
      "But now we rest.",
      "The gods are alone.",
    ]);
  });

  it("keeps every authored line at ≤42 characters (style guide hard cap)", () => {
    for (const beat of ENDING_BEATS) {
      for (const line of beat.split("\n")) {
        expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(42);
      }
    }
  });
});

describe("holdDurationMs", () => {
  it("adds pivot extra on beat index 0 (the wish line) only", () => {
    expect(holdDurationMs(0)).toBe(
      ENDING_STYLE.holdAfterRevealMs + ENDING_STYLE.holdPivotExtraMs,
    );
    expect(holdDurationMs(1)).toBe(ENDING_STYLE.holdAfterRevealMs);
    expect(holdDurationMs(ENDING_BEATS.length - 1)).toBe(ENDING_STYLE.holdAfterRevealMs);
  });
});

describe("EndingController", () => {
  let panel: HTMLDivElement;
  let controller: EndingController | null = null;
  let time = 0;
  const now = () => time;

  function mount(onDone: () => void = () => {}): EndingController {
    panel = document.createElement("div");
    document.body.appendChild(panel);
    time = 0;
    controller = new EndingController({ panel, onDone, now });
    return controller;
  }

  function text(): string {
    return panel.querySelector(".prologue-text")?.textContent ?? "";
  }

  function revealFully(c: EndingController, beat: string): void {
    for (let i = 0; i < beat.length + 5; i++) {
      if (text() === beat) return;
      time += 400;
      c.tickForTests(time);
    }
  }

  function tickPastAdvance(c: EndingController): void {
    time += ENDING_STYLE.fadeMs + ENDING_STYLE.gapMs + 50;
    c.tickForTests(time);
  }

  function tickPastFinish(c: EndingController): void {
    time += ENDING_STYLE.fadeMs + 50;
    c.tickForTests(time);
  }

  afterEach(() => {
    controller?.dispose();
    controller = null;
    panel?.remove();
  });

  it("mounts a black prologue-root (shared presentation), not ff6-window", () => {
    mount();
    expect(panel.querySelector(".ff6-window")).toBeNull();
    expect(panel.querySelector(".prologue-root")).toBeTruthy();
    expect(panel.querySelector(".prologue-text")).toBeTruthy();
  });

  it("reveals beat 0 character by character and never jumps ahead", () => {
    const c = mount();
    expect(text()).toBe("");
    time += 400;
    c.tickForTests(time);
    const partial = text();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(ENDING_BEATS[0]!.length);
    expect(ENDING_BEATS[0]!.startsWith(partial)).toBe(true);
    revealFully(c, ENDING_BEATS[0]!);
    expect(text()).toBe(ENDING_BEATS[0]);
  });

  it("holds the pivot beat (index 0, the wish) longer before auto-advancing", () => {
    const c = mount();
    revealFully(c, ENDING_BEATS[0]!);
    time += ENDING_STYLE.holdAfterRevealMs + 50; // ordinary hold would have fired
    c.tickForTests(time);
    expect(text()).toBe(ENDING_BEATS[0]); // still on pivot — extra hold
    time += ENDING_STYLE.holdPivotExtraMs + ENDING_STYLE.fadeMs + ENDING_STYLE.gapMs + 50;
    c.tickForTests(time);
    revealFully(c, ENDING_BEATS[1]!);
    expect(text()).toBe(ENDING_BEATS[1]);
  });

  it("shows only one beat at a time — previous beat text is gone, not stacked", () => {
    const c = mount();
    revealFully(c, ENDING_BEATS[0]!);
    c.handleKey("Enter");
    tickPastAdvance(c);
    revealFully(c, ENDING_BEATS[1]!);
    expect(text()).toBe(ENDING_BEATS[1]);
    expect(text()).not.toContain("Bring the gods back");
    expect(panel.querySelectorAll(".prologue-text").length).toBe(1);
  });

  it("Escape immediately skips the whole ending", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    c.handleKey("Escape");
    expect(done).toBe(1);
  });

  it("confirming the final beat fades out then finishes", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    for (let b = 0; b < ENDING_BEATS.length; b++) {
      revealFully(c, ENDING_BEATS[b]!);
      c.handleKey("Enter");
      if (b < ENDING_BEATS.length - 1) tickPastAdvance(c);
    }
    expect(done).toBe(0); // fade still in progress
    expect(panel.querySelector(".prologue-root.is-fading")).toBeTruthy();
    tickPastFinish(c);
    expect(done).toBe(1);
  });

  it("plays every beat in order via confirm, ending on the locked closing line", () => {
    const c = mount();
    for (let b = 0; b < ENDING_BEATS.length - 1; b++) {
      revealFully(c, ENDING_BEATS[b]!);
      expect(text()).toBe(ENDING_BEATS[b]);
      c.handleKey("Enter");
      tickPastAdvance(c);
    }
    const last = ENDING_BEATS[ENDING_BEATS.length - 1]!;
    revealFully(c, last);
    expect(text()).toBe(last);
  });

  it("calls uiTextTick while revealing characters", () => {
    const tick = vi.spyOn(audio, "uiTextTick").mockImplementation(() => {});
    const c = mount();
    time += 400;
    c.tickForTests(time);
    expect(tick).toHaveBeenCalled();
    tick.mockRestore();
  });

  it("dispose cancels the pending animation frame", () => {
    const cafSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const c = mount();
    c.dispose();
    expect(cafSpy).toHaveBeenCalledTimes(1);
    cafSpy.mockRestore();
    controller = null;
  });

  it("tickForTests after dispose is a no-op and does not throw", () => {
    const c = mount();
    c.dispose();
    const before = panel.innerHTML;
    time += 5000;
    expect(() => c.tickForTests(time)).not.toThrow();
    expect(panel.innerHTML).toBe(before);
    controller = null;
  });
});
