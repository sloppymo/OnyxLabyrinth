import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROLOGUE_BEATS,
  INTRO_STYLE,
  createReveal,
  stepReveal,
  completeReveal,
  holdDurationMs,
  PrologueController,
} from "./prologue-ui";

describe("PROLOGUE_BEATS", () => {
  it("is the locked five-beat intro copy, verbatim and in order", () => {
    expect([...PROLOGUE_BEATS]).toEqual([
      "We made war on the gods. We lost.",
      "They did not destroy us. They left, and took Death with them. Nothing here ends.",
      "They buried one thing before they went: a labyrinth, and at the bottom of it a lamp, and in the lamp the last thing in existence that can still grant a wish.",
      "It has one left.",
      "Edgehollow is the last town at the mouth of the hole. Everyone here is going down. Everyone here has been going down for a very long time.",
    ]);
  });
});

describe("stepReveal", () => {
  it("reveals one character per step when not pausing", () => {
    let s = createReveal("Hi", 0);
    s = stepReveal(s, 0);
    expect(s.visible).toBe(1);
    expect(s.done).toBe(false);
    s = stepReveal(s, s.pauseUntil);
    expect(s.visible).toBe(2);
    expect(s.done).toBe(true);
  });

  it("pauses longer after a full stop", () => {
    let s = createReveal("A.", 0);
    s = stepReveal(s, 0); // 'A'
    const afterLetter = s.pauseUntil;
    s = stepReveal(s, afterLetter); // '.'
    expect(s.pauseUntil - afterLetter).toBe(INTRO_STYLE.pauseFullMs);
  });

  it("pauses briefly after a comma", () => {
    let s = createReveal("A,", 0);
    s = stepReveal(s, 0); // 'A'
    const afterLetter = s.pauseUntil;
    s = stepReveal(s, afterLetter); // ','
    expect(s.pauseUntil - afterLetter).toBe(INTRO_STYLE.pauseHalfMs);
  });

  it("never advances more than one character per call", () => {
    let s = createReveal("Hello", 0);
    s = stepReveal(s, 100000); // far past any pause
    expect(s.visible).toBe(1);
  });

  it("completeReveal shows the full string immediately", () => {
    let s = createReveal(PROLOGUE_BEATS[3]!, 0);
    s = completeReveal(s);
    expect(s.visible).toBe(PROLOGUE_BEATS[3]!.length);
    expect(s.done).toBe(true);
  });
});

describe("holdDurationMs", () => {
  it("adds pivot extra on beat index 3", () => {
    expect(holdDurationMs(3)).toBe(
      INTRO_STYLE.holdAfterRevealMs + INTRO_STYLE.holdPivotExtraMs,
    );
    expect(holdDurationMs(0)).toBe(INTRO_STYLE.holdAfterRevealMs);
    expect(holdDurationMs(4)).toBe(INTRO_STYLE.holdAfterRevealMs);
  });
});

describe("PrologueController", () => {
  let panel: HTMLDivElement;
  let controller: PrologueController | null = null;
  let time = 0;
  const now = () => time;

  function mount(onDone: () => void = () => {}): PrologueController {
    panel = document.createElement("div");
    document.body.appendChild(panel);
    time = 0;
    controller = new PrologueController({ panel, onDone, now });
    return controller;
  }

  function text(): string {
    return panel.querySelector(".prologue-text")?.textContent ?? "";
  }

  /** Advance the injected clock in coarse steps until `beat` is fully shown. */
  function revealFully(c: PrologueController, beat: string): void {
    for (let i = 0; i < beat.length + 5; i++) {
      if (text() === beat) return;
      time += 400; // comfortably exceeds any single pause (max pauseFullMs=350)
      c.tickForTests(time);
    }
  }

  /** Drive past the fade+gap window that follows a confirmed advance. */
  function tickPastAdvance(c: PrologueController): void {
    time += INTRO_STYLE.fadeMs + INTRO_STYLE.gapMs + 50;
    c.tickForTests(time);
  }

  afterEach(() => {
    controller?.dispose();
    controller = null;
    panel?.remove();
  });

  it("mounts a black prologue-root using the game font class, not ff6-window", () => {
    mount();
    expect(panel.querySelector(".ff6-window")).toBeNull();
    expect(panel.querySelector(".prologue-root")).toBeTruthy();
    expect(panel.querySelector(".prologue-text")).toBeTruthy();
  });

  it("reveals beat 0 character by character and never jumps ahead to beat 1", () => {
    const c = mount();
    expect(text()).toBe("");
    time += 400;
    c.tickForTests(time);
    const partial = text();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(PROLOGUE_BEATS[0]!.length);
    expect(PROLOGUE_BEATS[0]!.startsWith(partial)).toBe(true);
    revealFully(c, PROLOGUE_BEATS[0]!);
    expect(text()).toBe(PROLOGUE_BEATS[0]);
  });

  it("confirm while revealing completes the beat but does not advance", () => {
    const c = mount();
    time += 400;
    c.tickForTests(time); // partial reveal, mid-typing
    expect(text()).not.toBe(PROLOGUE_BEATS[0]);
    c.handleKey("Enter"); // complete — must not also advance on this press
    expect(text()).toBe(PROLOGUE_BEATS[0]);
  });

  it("confirm after the beat is complete advances to the next beat", () => {
    const c = mount();
    revealFully(c, PROLOGUE_BEATS[0]!);
    c.handleKey("Enter"); // advance
    tickPastAdvance(c);
    expect(text()).not.toBe(PROLOGUE_BEATS[0]);
    revealFully(c, PROLOGUE_BEATS[1]!);
    expect(text()).toBe(PROLOGUE_BEATS[1]);
  });

  it("shows only one beat at a time — previous beat text is gone, not stacked", () => {
    const c = mount();
    revealFully(c, PROLOGUE_BEATS[0]!);
    c.handleKey("Enter");
    tickPastAdvance(c);
    revealFully(c, PROLOGUE_BEATS[1]!);
    expect(text()).toBe(PROLOGUE_BEATS[1]);
    expect(text()).not.toContain("We made war");
    expect(panel.querySelectorAll(".prologue-text").length).toBe(1);
  });

  it("holds the pivot beat (index 3) longer before auto-advancing", () => {
    const c = mount();
    for (let b = 0; b < 3; b++) {
      revealFully(c, PROLOGUE_BEATS[b]!);
      c.handleKey("Enter");
      tickPastAdvance(c);
    }
    // Now on beat 3 ("It has one left."); reveal it, then check the shorter
    // hold does NOT yet trigger auto-advance, but the longer pivot hold does.
    revealFully(c, PROLOGUE_BEATS[3]!);
    time += INTRO_STYLE.holdAfterRevealMs + 50; // ordinary hold would have fired
    c.tickForTests(time);
    expect(text()).toBe(PROLOGUE_BEATS[3]); // still on beat 3 — pivot extra hold
    time += INTRO_STYLE.holdPivotExtraMs + INTRO_STYLE.fadeMs + INTRO_STYLE.gapMs + 50;
    c.tickForTests(time);
    revealFully(c, PROLOGUE_BEATS[4]!);
    expect(text()).toBe(PROLOGUE_BEATS[4]);
  });

  it("Escape immediately skips the whole intro", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    c.handleKey("Escape");
    expect(done).toBe(1);
  });

  it("confirming the final beat after full reveal finishes the intro", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    for (let b = 0; b < PROLOGUE_BEATS.length; b++) {
      revealFully(c, PROLOGUE_BEATS[b]!);
      c.handleKey("Enter");
      if (b < PROLOGUE_BEATS.length - 1) tickPastAdvance(c);
    }
    expect(done).toBe(1);
  });

  it("dispose cancels the pending animation frame", () => {
    const cafSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const c = mount();
    c.dispose();
    expect(cafSpy).toHaveBeenCalledTimes(1);
    cafSpy.mockRestore();
    controller = null; // already disposed; skip afterEach double-dispose
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
