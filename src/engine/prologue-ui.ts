/**
 * New Game prologue — SNES-style black-field world narration shown once,
 * before party creation. Borrows mode "title" (same pattern as the perk/
 * save/NPC overlays) so dungeon/title input pauses while it plays.
 *
 * Presentation follows docs/superpowers/specs/2026-07-25-snes-era-intro-style-guide.md:
 * full black panel, soft white FF36 text, one beat at a time (replace, not
 * stack), typewriter reveal with punctuation-aware pauses, and a two-stage
 * confirm (complete-then-advance, never both on one press). No FF6Window
 * chrome — this is myth text, not a menu. Intentionally silent of music —
 * cold typewriter ticks only.
 *
 * The keypress that opens this controller (e.g. the Enter that selected New
 * Game on the title screen) is dispatched to *every* window "keydown"
 * listener in registration order within the same event — including this
 * controller's, if it were registered before the title screen's own
 * listener finishes creating it. Because of that ordering hazard, the
 * "swallow the opening keypress" responsibility lives in main.ts as an
 * external flag (mirroring justOpenedSaveMenu/justOpenedNPCPanel), not here
 * — this class assumes every handleKey() call is a real, intentional press.
 */

import { audio } from "./audio";

/**
 * Locked prologue copy — same words as the approved myth text. Beat 3 of the
 * original five-beat draft is split across two screens (same wording) so the
 * densest passage does not sit at the fatigue point as a single long type.
 * `\n` are author line breaks (CSS `white-space: pre-line`).
 */
export const PROLOGUE_BEATS: readonly string[] = [
  "We made war on the gods. We lost.",
  "They did not destroy us.\nThey left, and took Death with them.\nNothing here ends.",
  "They buried one thing before they went:\na labyrinth,\nand at the bottom of it a lamp,",
  "and in the lamp the last thing in\nexistence that can still grant a wish.",
  "It has one left.",
  "Edgehollow is the last town at the mouth\nof the hole. Everyone here is going down.\nEveryone here has been going down for a\nvery long time.",
] as const;

/** Index of the pivot beat ("It has one left.") that gets an extra hold. */
const PIVOT_BEAT_INDEX = 4;

export const INTRO_STYLE = {
  charsPerSec: 32,
  pauseFullMs: 350, // . ? !
  pauseHalfMs: 120, // , ; :
  holdAfterRevealMs: 1600,
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
  const extra = beatIndex === PIVOT_BEAT_INDEX ? style.holdPivotExtraMs : 0;
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
  style: typeof INTRO_STYLE = INTRO_STYLE,
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
}

type Phase = "reveal" | "hold" | "advancing" | "finishing";

export class PrologueController {
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

    this.reveal = createReveal(PROLOGUE_BEATS[0]!, this.nowFn());
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
