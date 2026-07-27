# SNES-Era Intro Sequence — Style Guide

**Date:** 2026-07-25  
**Status:** Working guide for Onyx Labyrinth prologue (and any future attract/narration screens)  
**Companion docs:**
- Narrative: `docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md` §5
- Plan: `docs/superpowers/plans/2026-07-25-prologue-intro-sequence.md`

This is not nostalgia cosplay. It is a checklist of techniques that repeatedly produce readable, skippable, atmospheric openings in 16-bit RPGs — translated into numbers and patterns that work in this repo (vanilla TypeScript + DOM + procedural audio).

---

## 1. What “good” looks like (the FF6 pattern)

Final Fantasy VI’s opening is the reference standard for this game’s aesthetic:

1. **Logo / mood image** (storm, organ) — optional; we can skip for v1.
2. **World narration** — short white text on black, no dialogue window.
3. **In-engine scene** — playable or semi-playable beat that teaches controls while story continues.
4. **Title / New Game** — or, in FF6’s case, the menu arrives *after* the attract reel.

Onyx Labyrinth already has (4). The prologue work is (2). Do not bolt (2) into an FF6 blue menu window — that reads as *someone talking*, not as *history being told*.

**Primary sources worth re-checking:**
- [FF6 SNES script — intro crawl](https://finalfantasy.fandom.com/wiki/Final_Fantasy_VI_SNES_script)
- [The Temp Track — FF6 opening sequence](https://www.thetemptrack.com/2016/07/31/the-music-of-final-fantasy-vi-act-ii-the-opening-sequence/)
- [JRPG startup cost (timing data)](https://significant-bits.com/the-jrpg-startup-cost/)
- [Subtitle / on-screen text best practices](https://www.gamedeveloper.com/audio/how-to-do-subtitles-well-basics-and-good-practices)
- [Typewriter via visible-character index (not string append)](https://blog.febucci.com/2026/05/how-to-make-a-typewriter-effect-in-unity-with-textmeshpro/)
- [Godot DialogueLabel defaults (speed + punctuation pause)](https://www.mintlify.com/nathanhoad/godot_dialogue_manager/usage/dialogue-label)
- [Pixel Crushers typewriter: cps, pause chars, audio per glyph](https://www.pixelcrushers.com/dialogue_system/manual2x/html/class_pixel_crushers_1_1_dialogue_system_1_1_abstract_typewriter_effect.html)

---

## 2. Visual rules

| Rule | Do | Don’t |
|------|----|-------|
| Frame | Full black (or near-black) panel | Blue `FF6Window` / menu chrome |
| Text color | Soft white / off-white (`#e8f0ff` or `#f0f0f0`) | Menu-blue body text |
| Alignment | Centered block, vertically mid-screen | Top-left menu dump |
| Beats | **Replace** previous beat (wipe/fade) | Stack paragraphs until the screen fills |
| Logo | Optional tiny title above first/last beat only | Brand competing with every line |
| Continue caret | Small blinking `▼` only when reveal is complete | Footer spam during typing |
| Safe area | Keep copy inside ~80% of `#game-wrap` width | Edge-to-edge wall of text |

**Replace, don’t accumulate.** Subtitle practice and FF6 both clear the previous block before the next. Stacking five paragraphs turns inscription into a wall of homework.

**Fade between beats.** Aim for ~150–250 ms fade out → clear → fade in (or a hard cut if fades feel soft). Gap between titles in broadcast subtitle practice is ~0.16 s; games can go slightly longer for drama.

---

## 3. Typography & chunking

### Hard limits (design box ≈ 768×672, font = existing FF36)

**Font lock:** use only the project’s authentic FF6 face already wired in
`src/styles.css`:

- File: `src/assets/final-fantasy-36.ttf`
- `@font-face` family: `"FF36"`
- CSS: `font-family: var(--game-font)` (equals `"FF36", "Courier New", …`)

Do not add a second webfont. Prologue DOM must inherit the same face as town,
title, and combat windows. Canvas text is not used for this screen.

| Constraint | Value | Why |
|------------|-------|-----|
| Max chars / line | **≤ 42** | Netflix / Channel 4 subtitle line cap; also Chrono Trigger’s ~36-char dialogue comfort zone |
| Max lines / beat | **≤ 4** | Matches FF6 crawl screens and CT dialogue pages |
| Max beats in one intro | **3–6** | Longer than ~30–45 s of *unskippable* reading feels like a tax |
| Short-beat privilege | 1-line beats get a full screen | “It has one left.” needs silence around it |

### Locked Onyx prologue beats (already within limits)

Beat 3 of the original five-beat draft is **split across two screens**, and the
final Edgehollow passage across **three** (same words, no paraphrase) so each
sentence gets a full beat pause. Author `\n` breaks are intentional
(`white-space: pre-line`).

| # | Text | Notes |
|---|------|-------|
| 1 | We made war on the gods. We lost. | |
| 2 | They did not destroy us. / They left… / Nothing here ends. | Author breaks; ≤42 |
| 3a | They buried…went: / a labyrinth, / and at the bottom of it a lamp, | Split; ≤42 chars/line |
| 3b | and in the lamp the last thing in / existence that can still grant a wish. | Split; ≤42 chars/line |
| 4 | It has one left. | Pivot — extra hold |
| 5a | Edgehollow is the last town at the mouth / of the hole. | Edgehollow split |
| 5b | Everyone here is going down. | Edgehollow split |
| 5c | Everyone here has been going down for a / very long time. | Edgehollow split |

**Do not paraphrase these.** Soft-wrap only; never rewrite mid-sentence unless a future edit is explicitly approved.

Note: eight screens exceeds the §3 “3–6 beats” comfort band; the Edgehollow
split is an intentional exception so the closing sentences land separately.

### Manual line breaks

Author-chosen `\n` in beat strings + `white-space: pre-line` in CSS. Escaped
silence (no BGM under the prologue) is intentional — cold typewriter ticks only
(`audio.uiTextTick()`, not the menu cursor sample).

---

## 4. Typewriter reveal (the reliable pattern)

### Core idea: visible-character index, not string concatenation

Industry consensus (TMP `maxVisibleCharacters`, Godot `visible_characters` / `visible_ratio`, Pixel Crushers typewriter):

1. Set the **full** beat string into the DOM once.
2. Reveal with a counter `visibleCount` from `0 → length`.
3. Render via one of:
   - **Plain text (our case):** `el.textContent = full.slice(0, visibleCount)` — fine when there is no rich markup.
   - **Rich text / future:** keep full HTML, clip with a CSS approach or per-glyph spans; never build the string by appending tags mid-tag.

**Never** do `text += nextChar` as the primary approach if you later add color/emphasis tags — layouts thrash and tags flash broken.

### Timing constants (start here; tune by feel)

| Constant | Recommended | Notes |
|----------|-------------|-------|
| `CHARS_PER_SEC` | **28–40** | Godot Dialogue Manager often ~0.02–0.05 s/step (20–50 cps). Pixel Crushers default example: 50 cps. SNES feel is usually slower → prefer **~30–35 cps**. |
| Pause on `.?!` | **+280–450 ms** | Full stop / question / bang |
| Pause on `,;:` | **+80–150 ms** | Breath, not a halt |
| No pause after | `Mr.` / `…` / `!!` edge cases | Skip pause when `.` is followed by another `.` or letter in abbreviation tables if needed |
| Beat hold after reveal | **1.2–2.0 s** then auto-advance | Subtitle rule of thumb: ~2–2.5 s per line for timed media; interactive games can be shorter if confirm is available |
| Extra hold on pivot | **+1.4 s** | Pivot line: “It has one left.” (beat index 4 after the 3a/3b split) |
| Inter-beat gap | **150–250 ms** | Black frame between beats |
| Fade duration | **180 ms** | Keep total sequence under ~45 s if the player never presses; terminal fade also runs before party creation (Esc stays instant) |

### Pseudocode (DOM / rAF)

```ts
type RevealState = {
  full: string;
  visible: number;
  done: boolean;
  pauseUntil: number; // performance.now()
};

function stepReveal(s: RevealState, now: number, cps: number): void {
  if (s.done || now < s.pauseUntil) return;
  s.visible = Math.min(s.full.length, s.visible + 1);
  const ch = s.full[s.visible - 1] ?? "";
  if (".?!".includes(ch)) s.pauseUntil = now + 350;
  else if (",;:".includes(ch)) s.pauseUntil = now + 120;
  else s.pauseUntil = now + 1000 / cps;
  if (s.visible >= s.full.length) s.done = true;
}
```

Drive from `requestAnimationFrame` or a single `setInterval` owned by the controller; clear on dispose.

---

## 5. Input contract (two-stage skip)

This is the single most important UX rule. Every modern dialogue toolkit implements it; SNES games approximated it with “mash A.”

| State | Confirm (Enter / Space / A) | Cancel (Esc / B) |
|-------|-----------------------------|------------------|
| Typing in progress | **Complete current beat instantly** (no advance) | Skip **entire** intro → `onDone` |
| Reveal complete, holding | Advance to next beat (or finish if last) | Skip entire intro → `onDone` |
| First frame after open | Ignore (`justOpened`) | Ignore (`justOpened`) |

Same confirm button must **never** both complete *and* advance on one press. That is the classic “I skipped half the story” bug.

### Optional: hold-to-speed

Holding confirm can multiply cps ×3 while held. Nice; not required for v1.

---

## 6. Audio

| Event | Sound | Notes |
|-------|-------|-------|
| Each printable char | Soft tick / blip, low volume | Skip whitespace; don’t spam on pauses |
| Beat complete | Optional softer confirm | Or silence + caret blink |
| Advance / skip | Existing `audio.uiConfirm()` | Reuse; don’t invent a new bus yet |
| Background | Optional low drone / no music for v1 | Silence + typewriter can be colder than score |

Implementation tip from Pixel Crushers-style systems: one short clip, `playbackRate` / pitch lightly randomized (±5%), interrupt previous tick if still playing so it doesn’t stack into mush.

For this repo: start with a quiet procedural blip in `audio.ts` (e.g. `uiTextTick()`), or temporarily reuse `uiCursor()` at reduced gain. Prefer a dedicated tick once the intro ships.

---

## 7. Continue indicator

- Show **only** when `reveal.done === true`.
- Blink ~2 Hz (250 ms on / 250 ms off) or a simple CSS animation.
- Glyph: `▼` or `▸` in the game font, centered under the text block.
- Hide instantly when advancing or skipping.

---

## 8. Auto-advance vs player-advance

| Mode | Use when |
|------|----------|
| **Player-advance only** | Accessibility default; dyslexia / slow readers; first implementation |
| **Auto-advance after hold** | Attract / “cinema” feel closer to FF6 |
| **Hybrid (recommended)** | Auto-advance *and* allow confirm to move early; Esc always skips |

Hybrid is the FF6-adjacent choice: the sequence can play itself, but the player is never trapped.

---

## 9. Accessibility (do not skip)

1. **Instant-text option** (future settings): `CHARS_PER_SEC = Infinity` / skip reveal.
2. Never time-gate *choices* on reading speed (we have no choices here — good).
3. Esc must always exit; do not require watching the full crawl on New Game #4.
4. Contrast: white on pure black passes; avoid gray-on-gray.
5. Prefer `prefers-reduced-motion`: hard cuts instead of fades; optional instant text.

---

## 10. Architecture for this codebase

```
PrologueController
  ├─ owns panel (#combat-panel), borrows mode "title"
  ├─ state machine: idle → revealing → holding → fading → next | done
  ├─ rAF / timer for reveal + hold + caret blink
  ├─ handleKey: justOpened → two-stage confirm → Esc skip
  └─ onDone → party creation

Pure helpers (unit-testable, no DOM):
  advanceReveal(state, now, cfg) → new state
  shouldAutoAdvance(state, now, cfg) → boolean
  PROLOGUE_BEATS: readonly string[]
```

**Do not** put timing math only in the controller. Extract pure functions so Vitest can lock cps, pauses, and two-stage skip without jsdom animation flakiness.

**Borrowed title mode:** same pitfall as perk/save/NPC — `justOpened`, own controller instance, route `"prologue"` ahead of `"title"` in `controller-route.ts`.

---

## 11. Acceptance checklist (playtest)

- [ ] Black field; no blue window chrome
- [ ] One beat visible at a time; previous beat gone
- [ ] Typewriter at ~30–35 cps with pauses on `.?!`
- [ ] Confirm while typing → full beat, stays on same beat
- [ ] Confirm while holding → next beat
- [ ] Esc after open → party creation
- [ ] Pivot beat (“It has one left.”, index 4) held longer than others
- [ ] Full unattended run finishes in ≤ ~45 s
- [ ] Readable at 1× / 1.5× / 2× `pixelScaleToFit`
- [ ] New Game only — Continue / Arena / Reform Party never enter this screen
- [ ] `PROLOGUE_BEATS` test asserts exact locked copy

---

## 12. Anti-patterns (observed failures)

| Anti-pattern | Why it fails |
|--------------|--------------|
| Narration inside menu window | Feels like UI, not myth |
| Dumping all paragraphs at once | Players skim; short lines lose punch |
| One button press completes *and* advances | Skips unread text |
| Unskippable 2+ minute crawl | Startup tax; see JRPG startup cost |
| String-append typewriter with HTML | Broken tags, layout thrash |
| Auto-advance with no confirm | Traps slow readers |
| Footer “A next · B skip” during typing | Lies about what A does mid-reveal |
| Loud per-character SFX at full UI volume | Fatigue by beat 3 |

---

## 13. Suggested constants block (copy into code)

```ts
export const INTRO_STYLE = {
  charsPerSec: 20,
  pauseFullMs: 420,      // . ? !
  pauseHalfMs: 120,      // , ; :
  holdAfterRevealMs: 1600,
  holdOpeningExtraMs: 1200, // beat 0 — short opening line needs breathing room
  holdPivotExtraMs: 1400, // add on beat index 4 ("It has one left.")
  fadeMs: 180,
  gapMs: 200,
  caretBlinkMs: 250,
} as const;
```

Tune only these numbers when playtesting — don’t rewrite the state machine for pacing.

---

## 14. How to use this guide

1. **Implementing the prologue:** follow §2–§8 and the checklist in §11; revise the plan’s Task 1 away from `FF6Window.frame`.
2. **Writing future narration** (ending, century-wipe interstitial): same visual rules; keep beats ≤4 lines / ≤42 chars.
3. **Attract mode later:** same reveal engine, loop beats 1–5, any key → title menu.

If a future change fights this guide, update the guide in the same PR — don’t silently invent a second intro language.
