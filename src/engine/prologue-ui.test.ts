import { afterEach, describe, expect, it, vi } from "vitest";
import { audio } from "./audio";
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
  it("is the locked intro copy (lamp + Edgehollow splits), verbatim and in order", () => {
    expect([...PROLOGUE_BEATS]).toEqual([
      "We made war on the gods. We lost.",
      "They did not destroy us.\nThey left, and took Death with them.\nNothing here ends.",
      "They buried one thing before they went:\na labyrinth,\nand at the bottom of it a lamp,",
      "and in the lamp the last thing in\nexistence that can still grant a wish.",
      "It has one left.",
      "Edgehollow is the last town at the mouth\nof the hole.",
      "Everyone here is going down.",
      "Everyone here has been going down for a\nvery long time.",
    ]);
  });

  it("keeps every authored line at ≤42 characters (style guide hard cap)", () => {
    for (const beat of PROLOGUE_BEATS) {
      for (const line of beat.split("\n")) {
        expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(42);
      }
    }
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
    let s = createReveal(PROLOGUE_BEATS[4]!, 0);
    s = completeReveal(s);
    expect(s.visible).toBe(PROLOGUE_BEATS[4]!.length);
    expect(s.done).toBe(true);
  });
});

describe("holdDurationMs", () => {
  it("adds opening extra on beat 0 and pivot extra on beat 4", () => {
    expect(holdDurationMs(0)).toBe(
      INTRO_STYLE.holdAfterRevealMs + INTRO_STYLE.holdOpeningExtraMs,
    );
    expect(holdDurationMs(4)).toBe(
      INTRO_STYLE.holdAfterRevealMs + INTRO_STYLE.holdPivotExtraMs,
    );
    expect(holdDurationMs(3)).toBe(INTRO_STYLE.holdAfterRevealMs);
    expect(INTRO_STYLE.holdOpeningExtraMs).toBe(1200);
    expect(INTRO_STYLE.holdPivotExtraMs).toBe(1400);
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
      time += INTRO_STYLE.pauseFullMs + 50; // exceeds any single pause
      c.tickForTests(time);
    }
  }

  /** Drive past the fade+gap window that follows a confirmed advance. */
  function tickPastAdvance(c: PrologueController): void {
    time += INTRO_STYLE.fadeMs + INTRO_STYLE.gapMs + 50;
    c.tickForTests(time);
  }

  /** Drive past the terminal fade before party creation. */
  function tickPastFinish(c: PrologueController): void {
    time += INTRO_STYLE.fadeMs + 50;
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

  it("holds the pivot beat (index 4) longer before auto-advancing", () => {
    const c = mount();
    for (let b = 0; b < 4; b++) {
      revealFully(c, PROLOGUE_BEATS[b]!);
      c.handleKey("Enter");
      tickPastAdvance(c);
    }
    // Now on beat 4 ("It has one left.");
    revealFully(c, PROLOGUE_BEATS[4]!);
    time += INTRO_STYLE.holdAfterRevealMs + 50; // ordinary hold would have fired
    c.tickForTests(time);
    expect(text()).toBe(PROLOGUE_BEATS[4]); // still on pivot — extra hold
    time += INTRO_STYLE.holdPivotExtraMs + INTRO_STYLE.fadeMs + INTRO_STYLE.gapMs + 50;
    c.tickForTests(time);
    revealFully(c, PROLOGUE_BEATS[5]!);
    expect(text()).toBe(PROLOGUE_BEATS[5]);
  });

  it("Escape immediately skips the whole intro", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    c.handleKey("Escape");
    expect(done).toBe(1);
  });

  it("confirming the final beat fades out then finishes the intro", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    for (let b = 0; b < PROLOGUE_BEATS.length; b++) {
      revealFully(c, PROLOGUE_BEATS[b]!);
      c.handleKey("Enter");
      if (b < PROLOGUE_BEATS.length - 1) tickPastAdvance(c);
    }
    expect(done).toBe(0); // fade still in progress
    expect(panel.querySelector(".prologue-root.is-fading")).toBeTruthy();
    tickPastFinish(c);
    expect(done).toBe(1);
  });

  it("confirm mid-typing on the final beat completes without finishing; second confirm fades", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    for (let b = 0; b < PROLOGUE_BEATS.length - 1; b++) {
      revealFully(c, PROLOGUE_BEATS[b]!);
      c.handleKey("Enter");
      tickPastAdvance(c);
    }
    const last = PROLOGUE_BEATS[PROLOGUE_BEATS.length - 1]!;
    time += 400;
    c.tickForTests(time);
    expect(text().length).toBeGreaterThan(0);
    expect(text()).not.toBe(last);
    c.handleKey("Enter"); // complete only — must not finish
    expect(text()).toBe(last);
    expect(done).toBe(0);
    expect(panel.querySelector(".prologue-root.is-fading")).toBeNull();
    c.handleKey("Enter"); // now finish with fade
    expect(done).toBe(0);
    expect(panel.querySelector(".prologue-root.is-fading")).toBeTruthy();
    tickPastFinish(c);
    expect(done).toBe(1);
  });

  it("calls uiTextTick (not uiCursor) while revealing characters", () => {
    const tick = vi.spyOn(audio, "uiTextTick").mockImplementation(() => {});
    const cursor = vi.spyOn(audio, "uiCursor").mockImplementation(() => {});
    const c = mount();
    time += 400;
    c.tickForTests(time);
    expect(tick).toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalled();
    tick.mockRestore();
    cursor.mockRestore();
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
