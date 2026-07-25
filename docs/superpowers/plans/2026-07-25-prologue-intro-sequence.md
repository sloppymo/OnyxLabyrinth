# Prologue Intro Sequence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On New Game, play a skippable SNES-style narration intro (locked prologue copy, typewriter reveal, black field) then hand off to party creation.

**Architecture:** A `PrologueController` borrows mode `"title"` (same pattern as perk/save overlays). It does **not** use `FF6Window` — world narration is white text on black, one beat at a time, with a visible-character typewriter and two-stage confirm. Pure timing helpers live beside the controller so Vitest can lock pacing without flaky animation. `main.ts` inserts the sequence between title New Game and `openPartyCreation`.

**Tech Stack:** TypeScript, Vite, Vitest, existing shell modes, existing **FF36** bitmap font (`src/assets/final-fantasy-36.ttf` → `@font-face "FF36"` → `--game-font`). No new fonts, no new dependencies.

**Specs:**
- Narrative: `docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md` §5
- Presentation: `docs/superpowers/specs/2026-07-25-snes-era-intro-style-guide.md` (**follow this for visuals/timing/input**)

This plan implements **only** the intro sequence — not boss renames, century wipe, or ending.

## Global Constraints

1. **Locked prologue copy — verbatim.** Do not paraphrase, reorder, or soft-edit.
2. **Font — existing FF36 only.** All prologue text uses `font-family: var(--game-font)` (resolves to `"FF36"` from `src/assets/final-fantasy-36.ttf`). Do **not** add Inter/system/serif faces, do **not** load a second font file, do **not** use canvas text for this screen. Keep body anti-aliasing rules already set globally (`-webkit-font-smoothing: none`, etc.).
3. **No menu chrome.** Black full-panel narration. Never wrap beats in `FF6Window.frame` / blue window borders — that is dialogue UI, not myth text (style guide §2).
4. **Replace, don’t stack.** One beat visible at a time.
5. **Two-stage confirm.** While typing: confirm completes the beat. When complete: confirm advances (or finishes). Esc skips the whole intro. First key after open is swallowed (`justOpened`).
6. **New Game only.** Reform Party / Continue / Arena never show the prologue.
7. **No game-logic changes.** No combat, floors, save version, or `GameState` fields.
8. **Borrowed `"title"` mode** — own controller + route flag; AGENTS.md pitfall.
9. **Build gate:** `npm run build` clean; targeted Vitest green before a task is done.
10. **Commits:** do **not** commit unless the human explicitly asks.

### Locked copy (five beats)

```text
1. We made war on the gods. We lost.

2. They did not destroy us. They left, and took Death with them. Nothing here ends.

3. They buried one thing before they went: a labyrinth, and at the bottom of it a lamp, and in the lamp the last thing in existence that can still grant a wish.

4. It has one left.

5. Edgehollow is the last town at the mouth of the hole. Everyone here is going down. Everyone here has been going down for a very long time.
```

Optional author line-breaks for beats 3 and 5 (same words, `\n` + `white-space: pre-line`) are allowed for cadence; do not change wording.

### Timing constants (from style guide §13)

```ts
export const INTRO_STYLE = {
  charsPerSec: 32,
  pauseFullMs: 350,      // . ? !
  pauseHalfMs: 120,      // , ; :
  holdAfterRevealMs: 1600,
  holdPivotExtraMs: 800, // beat index 3 — "It has one left."
  fadeMs: 180,
  gapMs: 200,
  caretBlinkMs: 250,
} as const;
```

### File map

| File | Responsibility |
|------|----------------|
| `src/engine/prologue-ui.ts` | `PROLOGUE_BEATS`, `INTRO_STYLE`, pure reveal helpers, `PrologueController` |
| `src/engine/prologue-ui.test.ts` | Exact copy + reveal/skip math + controller smoke |
| `src/engine/controller-route.ts` | `"prologue"` route |
| `src/engine/controller-route.test.ts` | Route preference |
| `src/main.ts` | `openPrologue`, New Game wire, key/gamepad |
| `src/styles.css` | `.prologue-root` black panel; **inherits `--game-font` / FF36** |
| `src/assets/final-fantasy-36.ttf` | **Existing** — do not replace or duplicate |

---

### Task 1: Pure reveal helpers + locked copy tests

**Files:**
- Create: `src/engine/prologue-ui.ts` (helpers + constants first; controller stub ok)
- Create: `src/engine/prologue-ui.test.ts`

**Interfaces:**
- Produces:
  - `PROLOGUE_BEATS: readonly string[]`
  - `INTRO_STYLE` (as above)
  - `export type RevealState = { full: string; visible: number; done: boolean; pauseUntil: number }`
  - `export function createReveal(full: string, now: number): RevealState`
  - `export function stepReveal(state: RevealState, now: number, style?: typeof INTRO_STYLE): RevealState`
  - `export function completeReveal(state: RevealState): RevealState`
  - `export function holdDurationMs(beatIndex: number, style?: typeof INTRO_STYLE): number`

- [ ] **Step 1: Write failing tests**

```ts
// src/engine/prologue-ui.test.ts
import { describe, expect, it } from "vitest";
import {
  PROLOGUE_BEATS,
  INTRO_STYLE,
  createReveal,
  stepReveal,
  completeReveal,
  holdDurationMs,
} from "./prologue-ui";

describe("PROLOGUE_BEATS", () => {
  it("is the locked five-beat intro copy, verbatim", () => {
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

  it("pauses longer after a period", () => {
    let s = createReveal("A.", 0);
    s = stepReveal(s, 0); // 'A'
    const afterLetter = s.pauseUntil;
    s = stepReveal(s, afterLetter); // '.'
    expect(s.pauseUntil - afterLetter).toBe(INTRO_STYLE.pauseFullMs);
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
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/engine/prologue-ui.test.ts
```

- [ ] **Step 3: Implement helpers in `prologue-ui.ts`**

```ts
export const PROLOGUE_BEATS: readonly string[] = [
  "We made war on the gods. We lost.",
  "They did not destroy us. They left, and took Death with them. Nothing here ends.",
  "They buried one thing before they went: a labyrinth, and at the bottom of it a lamp, and in the lamp the last thing in existence that can still grant a wish.",
  "It has one left.",
  "Edgehollow is the last town at the mouth of the hole. Everyone here is going down. Everyone here has been going down for a very long time.",
] as const;

export const INTRO_STYLE = {
  charsPerSec: 32,
  pauseFullMs: 350,
  pauseHalfMs: 120,
  holdAfterRevealMs: 1600,
  holdPivotExtraMs: 800,
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

export function createReveal(full: string, now: number): RevealState {
  return { full, visible: 0, done: full.length === 0, pauseUntil: now };
}

export function completeReveal(state: RevealState): RevealState {
  return { ...state, visible: state.full.length, done: true, pauseUntil: 0 };
}

export function holdDurationMs(
  beatIndex: number,
  style: typeof INTRO_STYLE = INTRO_STYLE,
): number {
  const extra = beatIndex === 3 ? style.holdPivotExtraMs : 0;
  return style.holdAfterRevealMs + extra;
}

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
```

Leave `PrologueController` for Task 2 (or export a stub that throws — prefer implementing in Task 2 only).

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/engine/prologue-ui.test.ts
npm run build
```

---

### Task 2: `PrologueController` + FF36 black-screen CSS

**Files:**
- Modify: `src/engine/prologue-ui.ts` (add controller)
- Modify: `src/engine/prologue-ui.test.ts` (controller + DOM smoke)
- Modify: `src/styles.css` (prologue panel styles using `--game-font`)

**Interfaces:**
- Consumes: `stepReveal` / `completeReveal` / `holdDurationMs` / `audio.uiConfirm` / `audio.uiCancel` / `audio.uiCursor` (soft tick: prefer `uiCursor` rate-limited while typing; confirm on advance/skip)
- Produces:
  - `export interface PrologueControllerOptions { panel: HTMLElement; onDone: () => void; now?: () => number }`
  - `export class PrologueController { handleKey(key: string): void; dispose(): void }`  
    (`now` injectable for tests — default `() => performance.now()`)

**Visual contract (style guide + font):**
- Root: full size of `#combat-panel`, `background: #000`, flex center.
- Text node: `font-family: var(--game-font)` → FF36; size ~`var(--fs-panel)` or `var(--fs-body)` (start `--fs-panel` / 36px; tune if wrap looks wrong).
- Color: `var(--warm-white)` or `#f0f0f0` — not menu blue.
- `text-align: center`; `max-width: min(36em, 90%)`; `white-space: pre-line`; `line-height: 1.45`.
- No `.ff6-window` class anywhere in this tree.
- Caret `.prologue-caret` only when reveal `done`; blink via CSS animation using `INTRO_STYLE.caretBlinkMs`.

- [ ] **Step 1: Add CSS** (near other panel styles in `src/styles.css`)

```css
/* New Game prologue — SNES-style narration (FF36 via --game-font). No FF6 window chrome. */
.prologue-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
  z-index: 5;
  font-family: var(--game-font);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: grayscale;
}

.prologue-text {
  margin: 0;
  max-width: min(36em, 90%);
  padding: 0 1em;
  font-family: var(--game-font);
  font-size: var(--fs-panel);
  line-height: 1.45;
  text-align: center;
  color: var(--warm-white);
  white-space: pre-line;
}

.prologue-caret {
  margin-top: 1.25em;
  font-family: var(--game-font);
  font-size: var(--fs-small);
  color: var(--warm-white);
  opacity: 0;
}

.prologue-caret.is-visible {
  animation: prologue-caret-blink 0.5s steps(1, end) infinite;
}

@keyframes prologue-caret-blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.prologue-root.is-fading .prologue-text,
.prologue-root.is-fading .prologue-caret {
  opacity: 0;
  transition: opacity 0.18s linear;
}
```

**Do not** introduce a second `@font-face`. FF36 is already declared at the top of `styles.css` from `./assets/final-fantasy-36.ttf`.

- [ ] **Step 2: Controller tests (add to prologue-ui.test.ts)**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROLOGUE_BEATS, PrologueController } from "./prologue-ui";

describe("PrologueController", () => {
  let panel: HTMLDivElement;
  afterEach(() => {
    panel?.remove();
    vi.useRealTimers();
  });

  function mount(onDone = () => {}, now = () => 0): PrologueController {
    panel = document.createElement("div");
    document.body.appendChild(panel);
    return new PrologueController({ panel, onDone, now });
  }

  it("mounts a black prologue-root using game font class, not ff6-window", () => {
    mount();
    expect(panel.querySelector(".ff6-window")).toBeNull();
    const root = panel.querySelector(".prologue-root");
    expect(root).toBeTruthy();
    expect(panel.querySelector(".prologue-text")).toBeTruthy();
  });

  it("shows a prefix of beat 0 (typewriter), never beat 1 yet", () => {
    const c = mount();
    // Force full reveal of beat 0 via two-stage: clear justOpened, then complete
    c.handleKey("Enter");
    c.handleKey("Enter"); // completes typing if mid-reveal, or advances if done
    // After justOpened + one confirm while typing from empty: should complete beat 0
    const text = panel.querySelector(".prologue-text")?.textContent ?? "";
    expect(PROLOGUE_BEATS[0]!.startsWith(text) || text === PROLOGUE_BEATS[0]).toBe(true);
    expect(text).not.toContain("Edgehollow");
  });

  it("two-stage: confirm while incomplete does not advance beat", () => {
    // Inject a controller that starts mid-reveal — or call internal by advancing time.
    // Practical approach: start, clear justOpened, completeReveal via confirm once,
    // assert still beat 0 full text; second confirm moves to beat 1.
    const c = mount();
    c.handleKey("Enter"); // justOpened
    c.handleKey("Enter"); // complete beat 0 (visible may already be typing)
    const afterFirst = panel.querySelector(".prologue-text")?.textContent ?? "";
    // Keep confirming until beat 0 is fully shown but index still 0
    for (let i = 0; i < 5; i++) {
      const t = panel.querySelector(".prologue-text")?.textContent ?? "";
      if (t === PROLOGUE_BEATS[0]) break;
      c.handleKey("Enter");
    }
    expect(panel.querySelector(".prologue-text")?.textContent).toBe(PROLOGUE_BEATS[0]);
    c.handleKey("Enter"); // advance
    // After advance, beat 1 starts (prefix or full after another complete)
    c.handleKey("Enter");
    for (let i = 0; i < 5; i++) {
      const t = panel.querySelector(".prologue-text")?.textContent ?? "";
      if (t === PROLOGUE_BEATS[1]) break;
      c.handleKey("Enter");
    }
    expect(panel.querySelector(".prologue-text")?.textContent).toBe(PROLOGUE_BEATS[1]);
    expect(afterFirst).toBeTruthy();
  });

  it("Esc after justOpened calls onDone", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    c.handleKey("Escape");
    expect(done).toBe(0);
    c.handleKey("Escape");
    expect(done).toBe(1);
  });

  it("finishing the last beat calls onDone", () => {
    let done = 0;
    const c = mount(() => {
      done += 1;
    });
    c.handleKey("Enter"); // clear justOpened
    // Brute-force: Esc is skip; for finish path, advance through all beats
    for (let b = 0; b < PROLOGUE_BEATS.length; b++) {
      // complete current
      for (let i = 0; i < 8; i++) {
        const t = panel.querySelector(".prologue-text")?.textContent ?? "";
        if (t === PROLOGUE_BEATS[b]) break;
        c.handleKey("Enter");
      }
      c.handleKey("Enter"); // advance or finish
    }
    expect(done).toBe(1);
  });
});
```

If the “brute-force confirm” tests are flaky because of async rAF, prefer injecting `now` + a public `tickForTests(now: number)` that runs one reveal step and refreshes DOM — add that test-only method if needed:

```ts
/** @internal test helper */
tickForTests(now: number): void {
  this.onFrame(now);
}
```

- [ ] **Step 3: Implement `PrologueController`**

Skeleton behavior:

```ts
export class PrologueController {
  // fields: panel, onDone, nowFn, beatIndex, reveal, justOpened, phase: "reveal"|"hold"|"fade",
  // rafId, holdUntil, root/text/caret elements

  constructor(opts: PrologueControllerOptions) {
    // build DOM:
    //   div.prologue-root > p.prologue-text + div.prologue-caret ("▼")
    // start beat 0 reveal; requestAnimationFrame loop
  }

  handleKey(key: string): void {
    if (this.justOpened) { this.justOpened = false; return; }
    if (key.toLowerCase() === "escape") {
      audio.uiCancel();
      this.finish();
      return;
    }
    if (key === "Enter" || key === " ") {
      if (!this.reveal.done) {
        this.reveal = completeReveal(this.reveal);
        this.paint();
        this.enterHold();
        return; // MUST NOT advance
      }
      if (this.beatIndex >= PROLOGUE_BEATS.length - 1) {
        audio.uiConfirm();
        this.finish();
        return;
      }
      audio.uiConfirm();
      this.beginFadeToNext();
    }
  }

  private onFrame(now: number): void {
    if (this.phase === "reveal") {
      const before = this.reveal.visible;
      this.reveal = stepReveal(this.reveal, now);
      if (this.reveal.visible !== before) {
        // soft tick: audio.uiCursor() — already rate-limited
        audio.uiCursor();
        this.paint();
      }
      if (this.reveal.done) this.enterHold();
    } else if (this.phase === "hold" && now >= this.holdUntil) {
      if (this.beatIndex >= PROLOGUE_BEATS.length - 1) {
        // stay until confirm (hybrid: auto-advance only between beats, not off the end)
      } else {
        this.beginFadeToNext();
      }
    }
    // schedule next raf until disposed
  }

  private paint(): void {
    this.textEl.textContent = this.reveal.full.slice(0, this.reveal.visible);
    this.caretEl.classList.toggle("is-visible", this.reveal.done);
  }
}
```

Details left to implementer but must obey: fade uses `.is-fading` + `INTRO_STYLE.fadeMs` / `gapMs`; dispose cancels rAF and clears panel.

- [ ] **Step 4: Run tests + build**

```bash
npx vitest run src/engine/prologue-ui.test.ts
npm run build
```

- [ ] **Step 5: Manual font check**

In devtools on the prologue text node, computed `font-family` must include `FF36` (not fall through to Courier unless the face failed to load). If Courier shows, verify `@font-face` still points at `./assets/final-fantasy-36.ttf` and that `document.fonts.load('14px "FF36"')` in `main.ts` still runs at boot.

---

### Task 3: Controller route for prologue

**Files:**
- Modify: `src/engine/controller-route.ts`
- Modify: `src/engine/controller-route.test.ts`

**Interfaces:**
- Produces: `"prologue"` in `ControllerRouteKind`; `hasPrologue: boolean`; resolve when `mode === "title" && hasPrologue` **before** `hasTitle`.

- [ ] **Step 1: Extend route tests**

Add `hasPrologue: false` to `ctx()` defaults.

```ts
  it("prefers prologue over the title menu while both could be set", () => {
    expect(
      resolveControllerRoute(
        ctx({ mode: "title", hasPrologue: true, hasTitle: true }),
      ),
    ).toBe("prologue");
  });

  it("requires title mode for prologue", () => {
    expect(
      resolveControllerRoute(ctx({ mode: "dungeon", hasPrologue: true })),
    ).toBe("dungeon");
  });
```

- [ ] **Step 2: Run — FAIL, then implement**

```ts
// ControllerRouteKind += "prologue"
// ControllerRouteContext += hasPrologue: boolean
// after perk (or with title overlays), before hasTitle:
if (ctx.mode === "title" && ctx.hasPrologue) return "prologue";
```

- [ ] **Step 3: Grep-fix other context builders** (`hasPrologue: false` temporary in `main.ts` if needed)

```bash
npx vitest run src/engine/controller-route.test.ts
npm run build
```

---

### Task 4: Wire New Game → prologue → party creation

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `PrologueController`
- Produces: `openPrologue(onDone: () => void)` — **only** from title `onNewGame`

- [ ] **Step 1: Opener**

```ts
let prologueController: PrologueController | null = null;

function openPrologue(onDone: () => void): void {
  if (mapVisible) toggleMap();
  setMode(state, "title");
  showMode("title", mapVisible);
  setMessage(""); // critical: empty #message so it cannot cover the black field
  prologueController = new PrologueController({
    panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
    onDone: () => {
      prologueController = null;
      onDone();
    },
  });
}
```

- [ ] **Step 2: Title `onNewGame` only**

```ts
    onNewGame: () => {
      titleController = null;
      Object.assign(state, createGameState(getFloors()[0]!));
      openPrologue(() => openPartyCreation(() => openTown()));
    },
```

Leave Reform Party / Continue / Arena untouched.

- [ ] **Step 3: Keyboard + gamepad**

- Route keys to `prologueController.handleKey` when non-null (mirror perk-select).
- Block title menu while `prologueController` is set.
- `ControllerRouteContext`: `hasPrologue: !!prologueController`
- Switch case `"prologue"`: map adapter menu key → `handleKey` (Enter/Space/Escape — same as title).

- [ ] **Step 4: Gates**

```bash
npm run build
npx vitest run src/engine/prologue-ui.test.ts src/engine/controller-route.test.ts
```

- [ ] **Step 5: Manual verification (style guide §11 + font)**

```bash
npm run dev
```

1. New Game → pure black field; **no** blue window.
2. Text is **FF36** (same face as town/title menus).
3. Typewriter ~32 cps; pauses on periods.
4. Confirm mid-type → full beat, stays; confirm again → next beat.
5. Beat 4 “It has one left.” held longer / feels punchier.
6. Esc → party creation.
7. Continue / Arena / Reform Party never show prologue.
8. Readable at 1× / 1.5× / 2× scale; `#message` empty/hidden.
9. Soft cursor ticks while typing; not ear-splitting.

---

## Self-review (plan author)

| Requirement | Task |
|-------------|------|
| Style guide: black / no window / replace | Task 2 |
| Style guide: typewriter + two-stage skip | Task 1–2 |
| Style guide: INTRO_STYLE timing | Task 1 |
| Existing FF36 / `--game-font` only | Task 2 CSS + Global Constraints |
| Locked copy | Task 1 |
| New Game → party creation | Task 4 |
| Borrowed title + route | Task 3–4 |
| Spec §5 skippable | Task 2 Esc + Task 4 |

Out of scope: boss renames, century wipe, wish ending, Edgehollow flavor, attract-mode loop, dedicated `uiTextTick` sample (reuse `uiCursor` for v1).

**Plan delta vs prior draft:** removed `FF6Window.frame` accumulation UI; added style-guide timing helpers, FF36-only CSS, two-stage skip, fade/hold, and explicit font asset lock (`src/assets/final-fantasy-36.ttf`).
