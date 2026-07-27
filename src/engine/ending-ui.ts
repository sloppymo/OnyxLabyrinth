/**
 * The wish — design doc §6. Floor-5 boss victory, once per campaign, opens
 * this screen after the level-up/perk queue. Same SNES-style black-field
 * presentation as the prologue (reuses its `.prologue-*` CSS and its
 * beat-agnostic reveal primitives) — a deliberate narrative bookend, not a
 * coincidence of implementation. No fight, no guardian, no menu: this is
 * myth text, not a menu screen.
 *
 * Borrows mode "title" like the prologue/perk/save/NPC overlays, so dungeon/
 * combat input pauses while it plays. `state.hasCompletedEnding` (set by the
 * caller, not this class) is what stops a later re-roll of the same
 * re-rollable boss pack from re-opening this screen — see save.ts v13.
 *
 * The keypress that opens this controller (the "a" that confirmed the
 * combat result screen, or the keypress that closed the perk overlay) is
 * dispatched to every window "keydown" listener registered after the one
 * that constructed it, within that same event — so, exactly like
 * justOpenedPrologue/justOpenedSaveMenu, the caller in main.ts is
 * responsible for swallowing that first keypress via justOpenedEnding. This
 * class assumes every handleKey() call is a real, intentional press.
 */

import { audio } from "./audio";
import { createReveal, completeReveal, stepReveal, type RevealState } from "./prologue-ui";

/**
 * Ending copy — design doc §6, "the wish". The wish wording is its own beat;
 * closing sentences are one-per-beat (same convention as PROLOGUE_BEATS).
 */
export const ENDING_BEATS: readonly string[] = [
  "Bring the gods back.",
  "The gods return.",
  "Death returns with them.",
  "When the news reaches the town,\nthe people make sure.",
  "The hole is still there.\nThe lamp is empty.",
  "But now we rest.",
  "The gods are alone.",
] as const;

/** The wish line gets an extra hold before the closing beats, mirroring the
 *  prologue's pivot-beat treatment of "It has one left." */
const PIVOT_BEAT_INDEX = 0;

export const ENDING_STYLE = {
  charsPerSec: 32,
  pauseFullMs: 350, // . ? !
  pauseHalfMs: 120, // , ; :
  holdAfterRevealMs: 1600,
  holdPivotExtraMs: 1400,
  fadeMs: 180,
  gapMs: 200,
  caretBlinkMs: 250,
} as const;

/** How long a fully-revealed beat holds before auto-advancing. */
export function holdDurationMs(
  beatIndex: number,
  style: typeof ENDING_STYLE = ENDING_STYLE,
): number {
  const extra = beatIndex === PIVOT_BEAT_INDEX ? style.holdPivotExtraMs : 0;
  return style.holdAfterRevealMs + extra;
}

export interface EndingControllerOptions {
  panel: HTMLElement;
  onDone: () => void;
  /** Injectable clock for deterministic tests; defaults to performance.now(). */
  now?: () => number;
}

type Phase = "reveal" | "hold" | "advancing" | "finishing";

export class EndingController {
  private panel: HTMLElement;
  private onDone: () => void;
  private nowFn: () => number;

  private root: HTMLDivElement;
  private textEl: HTMLParagraphElement;
  private caretEl: HTMLDivElement;

  private beatIndex = 0;
  private reveal: RevealState;
  private phase: Phase = "reveal";
  private holdUntil = 0;
  private advanceAt = 0;
  private finishAt = 0;

  private disposed = false;
  private rafId: number | null = null;

  constructor(opts: EndingControllerOptions) {
    this.panel = opts.panel;
    this.onDone = opts.onDone;
    this.nowFn = opts.now ?? (() => performance.now());

    this.panel.classList.add("prologue-host");
    this.panel.style.display = "flex";
    this.panel.innerHTML = "";

    this.root = document.createElement("div");
    this.root.className = "prologue-root";

    this.textEl = document.createElement("p");
    this.textEl.className = "prologue-text";

    this.caretEl = document.createElement("div");
    this.caretEl.className = "prologue-caret";
    this.caretEl.textContent = "▼";

    this.root.appendChild(this.textEl);
    this.root.appendChild(this.caretEl);
    this.panel.appendChild(this.root);

    this.reveal = createReveal(ENDING_BEATS[0]!, this.nowFn());
    this.paint();
    this.scheduleFrame();
  }

  handleKey(key: string): void {
    if (this.disposed) return;
    if (this.phase === "finishing") return;
    const lower = key.toLowerCase();
    if (lower === "escape") {
      audio.uiCancel();
      this.finishImmediate();
      return;
    }
    if (key !== "Enter" && key !== " ") return;
    if (this.phase === "advancing") return; // mid-transition: swallow

    if (!this.reveal.done) {
      // Complete the current beat only — must never also advance.
      this.reveal = completeReveal(this.reveal);
      this.paint();
      this.enterHold();
      return;
    }
    if (this.beatIndex >= ENDING_BEATS.length - 1) {
      audio.uiConfirm();
      this.finishWithFade();
      return;
    }
    audio.uiConfirm();
    this.beginAdvance();
  }

  /** @internal test hook — drives the reveal/hold/advance machine without a real rAF loop. */
  tickForTests(now: number): void {
    this.onFrame(now);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.panel.classList.remove("prologue-host");
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  /** Esc / cancel — abrupt exit is correct. */
  private finishImmediate(): void {
    this.dispose();
    this.onDone();
  }

  /** Confirm on last beat — fade out before handing off to the caller. */
  private finishWithFade(): void {
    this.phase = "finishing";
    this.caretEl.classList.remove("is-visible");
    this.root.classList.add("is-fading");
    this.finishAt = this.nowFn() + ENDING_STYLE.fadeMs;
  }

  private enterHold(): void {
    this.phase = "hold";
    this.holdUntil = this.nowFn() + holdDurationMs(this.beatIndex);
  }

  private beginAdvance(): void {
    this.phase = "advancing";
    this.caretEl.classList.remove("is-visible");
    this.root.classList.add("is-fading");
    this.advanceAt = this.nowFn() + ENDING_STYLE.fadeMs + ENDING_STYLE.gapMs;
  }

  private advanceToNextBeat(): void {
    this.beatIndex += 1;
    this.root.classList.remove("is-fading");
    this.reveal = createReveal(ENDING_BEATS[this.beatIndex]!, this.nowFn());
    this.phase = "reveal";
    this.paint();
  }

  private scheduleFrame(): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => {
      this.onFrame(this.nowFn());
      this.scheduleFrame();
    });
  }

  private onFrame(now: number): void {
    if (this.disposed) return;
    if (this.phase === "finishing") {
      if (now >= this.finishAt) {
        this.dispose();
        this.onDone();
      }
      return;
    }
    if (this.phase === "reveal") {
      const before = this.reveal.visible;
      this.reveal = stepReveal(this.reveal, now, ENDING_STYLE);
      if (this.reveal.visible !== before) {
        const ch = this.reveal.full[this.reveal.visible - 1];
        if (ch && ch !== " " && ch !== "\n") audio.uiTextTick();
        this.paint();
      }
      if (this.reveal.done) this.enterHold();
      return;
    }
    if (this.phase === "hold") {
      if (now >= this.holdUntil && this.beatIndex < ENDING_BEATS.length - 1) {
        this.beginAdvance();
      }
      return;
    }
    if (this.phase === "advancing" && now >= this.advanceAt) {
      this.advanceToNextBeat();
    }
  }

  private paint(): void {
    this.textEl.textContent = this.reveal.full.slice(0, this.reveal.visible);
    this.caretEl.classList.toggle(
      "is-visible",
      this.reveal.done && this.phase !== "advancing" && this.phase !== "finishing",
    );
  }
}
