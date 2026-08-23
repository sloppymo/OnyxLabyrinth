/**
 * New Game prologue — SNES-style black-field world narration shown once
 * after selecting New Game. This is a real title-mode screen, not a UiStack
 * overlay.
 *
 * Presentation follows docs/superpowers/specs/2026-07-25-snes-era-intro-style-guide.md:
 * full black panel, soft white FF36 text, one beat at a time (replace, not
 * stack), typewriter reveal with punctuation-aware pauses, and a two-stage
 * confirm (complete-then-advance, never both on one press). No FF6Window
 * chrome — this is myth text, not a menu. Title/prologue BGM
 * (`audio.startTitleMusic`) continues under the typewriter from the title
 * screen; cold typewriter ticks stay as the only *SFX* on this screen.
 *
 * The keypress that opens this controller (e.g. the Enter that selected New
 * Game on the title screen) is dispatched to title, not here. This class
 * assumes every handleKey() call is a real, intentional press.
 */

import { audio } from "./audio";

/**
 * Locked prologue copy — same words as the approved myth text. The opening
 * pair, beat 3 of the original five-beat draft, and the Edgehollow close are
 * each split across screens (same wording) so every sentence gets a full beat
 * pause — densest passages never sit as a single long type. `\n` are author
 * line breaks (CSS `white-space: pre-line`).
 */
export const PROLOGUE_BEATS: readonly string[] = [
  // Opening split — full beat pause between war and loss (not a mid-line period).
  "We made war on the gods.",
  "We lost.",
  "They did not destroy us.\nThey left, and took Death with them.\nNothing here ends.",
  "They buried one thing before they went:\na labyrinth,\nand at the bottom of it a lamp,",
  "and in the lamp the last thing in\nexistence that can still grant a wish.",
  "It has one left.",
  // Final Edgehollow passage split across three screens (same words) so each
  // sentence gets a full beat pause — same treatment as the lamp-sentence split.
  "Edgehollow is the last town at the mouth\nof the hole.",
  "Everyone here is going down.",
  "Everyone here has been going down for a\nvery long time.",
] as const;

/** Index of the opening beat — short line, needs breathing room before "We lost." */
const OPENING_BEAT_INDEX = 0;
/** Index of the pivot beat ("It has one left.") that gets an extra hold. */
const PIVOT_BEAT_INDEX = 5;

export const INTRO_STYLE = {
  // Black-field beat after New Game confirm before the first glyph — lets the
  // menu ting land and the cold open breathe before typewriter ticks start.
  leadInMs: 1000,
  // 20 cps: the opening beat is only ~34 chars; at 32 cps it finished in ~1.7s
  // and felt like a flash. Slower typing + opening hold lets the first page land.
  // (20 also keeps 1000/charsPerSec exact in float — avoids flaky pause asserts.)
  charsPerSec: 20,
  pauseFullMs: 420, // . ? ! — slightly longer so sentence ends breathe
  pauseHalfMs: 120, // , ; :
  holdAfterRevealMs: 1600,
  // Beat 0 hold ~3.5s so "We lost." lands after a short silence.
  holdOpeningExtraMs: 1900, // 1600+1900 = 3500ms before auto-advance to "We lost."
  holdPivotExtraMs: 1400, // beat "It has one left." — clearly outlast neighbors
  fadeMs: 180,
  gapMs: 200,
  caretBlinkMs: 250,
} as const;

export type RevealState = {
  full: string;
  visible: number;
  done: boolean;
  pauseUntil: number;
};

/** Fields `stepReveal` actually reads — shared by prologue + ending styles. */
export type RevealTimingStyle = {
  charsPerSec: number;
  pauseFullMs: number;
  pauseHalfMs: number;
};

/** Start a fresh reveal of `full` at time `now` (nothing visible yet). */
export function createReveal(full: string, now: number): RevealState {
  return { full, visible: 0, done: full.length === 0, pauseUntil: now };
}

/** Show the full string immediately — used when confirm completes a reveal. */
export function completeReveal(state: RevealState): RevealState {
  return { ...state, visible: state.full.length, done: true, pauseUntil: 0 };
}

/** How long a fully-revealed beat holds before auto-advancing. */
export function holdDurationMs(
  beatIndex: number,
  style: typeof INTRO_STYLE = INTRO_STYLE,
): number {
  let extra = 0;
  if (beatIndex === OPENING_BEAT_INDEX) extra = style.holdOpeningExtraMs;
  else if (beatIndex === PIVOT_BEAT_INDEX) extra = style.holdPivotExtraMs;
  return style.holdAfterRevealMs + extra;
}

/**
 * Advance the reveal by one visible character if the pause window has
 * elapsed. Punctuation-aware: full stops get a longer pause, commas/
 * semicolons/colons a shorter one. Never advances more than one character
 * per call regardless of how far `now` has moved past `pauseUntil`.
 */
export function stepReveal(
  state: RevealState,
  now: number,
  style: RevealTimingStyle = INTRO_STYLE,
): RevealState {
  if (state.done || now < state.pauseUntil) return state;
  const visible = Math.min(state.full.length, state.visible + 1);
  const ch = state.full[visible - 1] ?? "";
  let pauseMs = 1000 / style.charsPerSec;
  if (".?!".includes(ch)) pauseMs = style.pauseFullMs;
  else if (",;:".includes(ch)) pauseMs = style.pauseHalfMs;
  else if (ch === " " || ch === "\n") pauseMs = Math.min(pauseMs, 20);
  return {
    full: state.full,
    visible,
    done: visible >= state.full.length,
    pauseUntil: now + pauseMs,
  };
}

export interface PrologueControllerOptions {
  panel: HTMLElement;
  onDone: () => void;
  /** Injectable clock for deterministic tests; defaults to performance.now(). */
  now?: () => number;
  /** Override black-field pause before beat 0; defaults to INTRO_STYLE.leadInMs. */
  leadInMs?: number;
}

type Phase = "leadIn" | "reveal" | "hold" | "advancing" | "finishing";

export class PrologueController {
  private panel: HTMLElement;
  private onDone: () => void;
  private nowFn: () => number;

  private root: HTMLDivElement;
  private textEl: HTMLParagraphElement;
  private caretEl: HTMLDivElement;

  private beatIndex = 0;
  private reveal: RevealState;
  private phase: Phase = "leadIn";
  private leadInUntil = 0;
  private holdUntil = 0;
  private advanceAt = 0;
  private finishAt = 0;

  private disposed = false;
  private rafId: number | null = null;

  constructor(opts: PrologueControllerOptions) {
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

    const leadInMs = opts.leadInMs ?? INTRO_STYLE.leadInMs;
    const now = this.nowFn();
    if (leadInMs > 0) {
      // Empty field until lead-in elapses — New Game's confirm cue lands here.
      this.reveal = createReveal("", now);
      this.phase = "leadIn";
      this.leadInUntil = now + leadInMs;
    } else {
      this.reveal = createReveal(PROLOGUE_BEATS[0]!, now);
      this.phase = "reveal";
    }
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
    if (this.phase === "leadIn") {
      // Impatient confirm skips the black pause and starts typing.
      this.beginFirstBeat(this.nowFn());
      return;
    }

    if (!this.reveal.done) {
      // Complete the current beat only — must never also advance.
      this.reveal = completeReveal(this.reveal);
      this.paint();
      this.enterHold();
      return;
    }
    if (this.beatIndex >= PROLOGUE_BEATS.length - 1) {
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

  /** Confirm on last beat — fade out before handing off to party creation. */
  private finishWithFade(): void {
    this.phase = "finishing";
    this.caretEl.classList.remove("is-visible");
    this.root.classList.add("is-fading");
    this.finishAt = this.nowFn() + INTRO_STYLE.fadeMs;
  }

  private beginFirstBeat(now: number): void {
    this.reveal = createReveal(PROLOGUE_BEATS[0]!, now);
    this.phase = "reveal";
    this.paint();
  }

  private enterHold(): void {
    this.phase = "hold";
    this.holdUntil = this.nowFn() + holdDurationMs(this.beatIndex);
  }

  private beginAdvance(): void {
    this.phase = "advancing";
    this.caretEl.classList.remove("is-visible");
    this.root.classList.add("is-fading");
    this.advanceAt = this.nowFn() + INTRO_STYLE.fadeMs + INTRO_STYLE.gapMs;
  }

  private advanceToNextBeat(): void {
    this.beatIndex += 1;
    this.root.classList.remove("is-fading");
    this.reveal = createReveal(PROLOGUE_BEATS[this.beatIndex]!, this.nowFn());
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
    if (this.phase === "leadIn") {
      if (now < this.leadInUntil) return;
      this.beginFirstBeat(now);
      // Fall through so the first glyph can appear on this same frame.
    }
    if (this.phase === "finishing") {
      if (now >= this.finishAt) {
        this.dispose();
        this.onDone();
      }
      return;
    }
    if (this.phase === "reveal") {
      const before = this.reveal.visible;
      this.reveal = stepReveal(this.reveal, now);
      if (this.reveal.visible !== before) {
        const ch = this.reveal.full[this.reveal.visible - 1];
        if (ch && ch !== " " && ch !== "\n") audio.uiTextTick();
        this.paint();
      }
      if (this.reveal.done) this.enterHold();
      return;
    }
    if (this.phase === "hold") {
      if (now >= this.holdUntil && this.beatIndex < PROLOGUE_BEATS.length - 1) {
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
