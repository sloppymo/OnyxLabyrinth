# Evaluation request: corridor fog-taper (Phase 2) — plan and measurement design

## Your role

You are reviewing an in-flight change to the corridor renderer of **OnyxLabyrinth**, a
Wizardry-style first-person dungeon crawler (TypeScript + Vite, hand-rolled 2D canvas
raycaster, no engine, no UI framework).

I am the agent executing the work. I want an adversarial review, not a sign-off. Assume I
am wrong somewhere and find where. Specifically:

- **Do not propose "modernizing" the look.** The governing brief for this work says: *"An
  agent that arrives and starts 'modernizing' the look will make this game worse and will
  be reverted. Earn the right to change something by first proving what is wrong with it."*
  A recommendation to add bloom, PBR, colour grading, ambient occlusion, or a post-processing
  stack is an automatic fail of this review. The target aesthetic is a deliberately austere
  1980s dungeon-crawler corridor: amber-on-dark, fog to a near-black background, CRT
  scanlines, vignette.
- **Do not agree with me to be agreeable.** If the change is unjustified, say so. If the
  measurement design is unsound, say so — that is the part I am least confident about.
- **Do argue with the numbers.** Everything below is measured or derived; all of it is
  checkable. If a derivation is wrong, the conclusion probably is too.

---

## 1. The system under change

### 1.1 How a corridor frame is drawn

Per frame, far-to-near:

1. **`drawFloorCeilingCast`** — perspective floor/ceiling casting into one reused
   `ImageData` buffer, uploaded with a single `putImageData`. Screen row → world depth is
   `rowDistance = halfH / |y − halfH|`. Each row is fogged, then written.
2. **Wall strip pass** — DDA raycast; each strip drawn with `ctx.globalAlpha = opacityForDepth(hit.perpWallDist)`.
3. **Map sprites / depth feature glyphs** — drawn with `globalAlpha = opacityForDepth(depth)`.
4. **Amber edge glow** — batched strokes coloured by `strokeColorForDepth(d)`.
5. `ctx.restore()`, then screen-space overlays: torch flicker, vignette, CRT scanlines.

### 1.2 The fog curve (current, shipped)

```ts
// MATH_CONFIG (src/engine/render-math.ts) — single source of truth since Phase 0
fogFalloff: 0.70,        // per grid unit
fogMidtoneLift: 0.25,    // blend the exponential toward 1.0 so mid-range stays readable
baseOpacity: 1.0,
maxDepth: 4,             // draw distance is maxDepth * 2 = 8
darknessMaxDist: 1.5,    // draw distance inside darkness zones

export function opacityForDepth(d: number): number {
  const exponential = MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
  const lift = MATH_CONFIG.fogMidtoneLift;
  return exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
}
```

Fog is applied as a **lerp toward the background colour** `PALETTE.bg` `#0e0d0a`
(luminance 13.0), not toward black.

### 1.3 The defect (finding F1, diagnosed and approved as P1)

Both floor/ceiling loops clip with `if (rowDistance > maxDist) continue;`, and the raycaster
clips with `if (perpWallDist > maxDist) return null;` — but **`opacityForDepth(8) = 0.293`**.
Surfaces are therefore cut off at 29 % strength against raw background. The result is a
hard-edged bar at the horizon occupying **12.5 % of canvas height**
(`2 · halfH/8 ÷ H`), measured on `f1-straight` as a one-pixel-row step: row 366 luma
26.6 → row 367 luma 42.68 (+60 %); ceiling side row 284 → 285, 44.82 → 26.17 (−42 %).

Severity is geometry-dependent. Where a wall stands within 8 units it covers the band
entirely. Across 44 captured views the median band-to-surroundings ratio is 1.13 (band
usually *brighter*, because a wall fills it). Five views are the tail — all with an 8+ cell
open forward run, four of them on Floor 1 (25×32, by far the largest map, and the tutorial
floor).

**A structural point that I believe forces the shape of the fix — please check it.**
The midtone lift makes the fog curve **asymptote to `fogMidtoneLift` = 0.25**, not to 0:

```
lim(d→∞) opacityForDepth(d) = 0 + (1−0)·0.25·1 = 0.25
```

So `opacityForDepth(12) ≈ 0.260`, `opacityForDepth(20) ≈ 0.250`. **There is no draw distance
at which the clip becomes invisible.** Raising `maxDepth` cannot fix this — it only moves the
same-sized step further out while costing fill rate. The only alternatives are (a) taper the
curve to zero at the boundary, or (b) reduce `fogMidtoneLift` toward 0, which crushes exactly
the mid-range detail that the 0.70 / 0.25 pair was tuned to preserve (the comment in the
source records that `fogFalloff: 0.42` was reverted for dropping distance-2 walls to 17 %).

---

## 2. What has already shipped (context; not under review, but challenge it if it bears on Phase 2)

**Phase 0** — `RENDER_CONFIG` in `renderer.ts` hand-duplicated 10 tunables that also existed
in `MATH_CONFIG`, plus 5 with no reader at all: 15 of 38 keys inert. The renderer's copies
were never read, so editing the obvious knob silently did nothing. `RENDER_CONFIG` now
spreads `MATH_CONFIG`. Verified by falsification: setting the canonical `fogFalloff` to 0.42
moved f1 mean luma 35.13 → 25.78 and depth-4 floor luma 40.89 → 30.58; reverting returned
both exactly. Before the change that same edit was a no-op.

**Phase 1** — the torch flicker's radial gradient peaked at **screen centre**, which in a
corridor is the vanishing point (the furthest, foggiest pixels), and it drew *before* the
wall pass so walls painted over it. Measured pre-fix, the near wall modulated by 0.09 % of
its own mean. Inverted the gradient (transparent centre → full edge) and moved the call after
`ctx.restore()`. Time-averaged over two flicker periods: near-wall amplitude 0.037 → 0.761
(f1) and 0.057 → 1.065 (f5); frame luminance −0.51 % / −0.50 %; falloff now monotonic
near → annulus → centre. 44-view regression mean ΔL −0.06 %.

---

## 3. The Phase 2 proposal (under review)

### 3.1 The code

```ts
// MATH_CONFIG addition
fogTaperFrac: 0.5,   // taper begins at this fraction of the draw distance.
                     // 1.0 disables the taper entirely — the kill-switch.

export const CORRIDOR_MAX_DIST = MATH_CONFIG.maxDepth * 2;   // 8

export function fogTaperForDepth(d: number, maxDist: number): number {
  const start = maxDist * MATH_CONFIG.fogTaperFrac;
  if (d <= start) return 1;
  if (d >= maxDist) return 0;
  const t = (d - start) / (maxDist - start);
  return 1 - t * t * (3 - 2 * t);      // 1 − smoothstep
}

export function opacityForDepth(d: number): number {
  const exponential = MATH_CONFIG.baseOpacity * Math.pow(MATH_CONFIG.fogFalloff, d);
  const lift = MATH_CONFIG.fogMidtoneLift;
  const base = exponential + (1 - exponential) * lift * (1 - Math.exp(-d));
  return base * fogTaperForDepth(d, CORRIDOR_MAX_DIST);
}
```

### 3.2 The resulting curve

| d | base fog | taper | shipped product | (today) |
|---|---|---|---|---|
| 0 | 1.0000 | 1.000 | **1.0000** | 1.0000 |
| 1 | 0.7474 | 1.000 | **0.7474** | 0.7474 |
| 2 | 0.6003 | 1.000 | **0.6003** | 0.6003 |
| 3 | 0.4991 | 1.000 | **0.4991** | 0.4991 |
| 4 | 0.4266 | 1.000 | **0.4266** | 0.4266 |
| 5 | 0.3747 | 0.844 | **0.3161** | 0.3747 |
| 6 | 0.3377 | 0.500 | **0.1688** | 0.3377 |
| 7 | 0.3116 | 0.156 | **0.0487** | 0.3116 |
| 8 | 0.2932 | 0.000 | **0.0000** | 0.2932 |

Monotone decreasing, C¹ at both knots (smoothstep has zero derivative at 0 and 1).
Depths 0–4 are **bit-identical** to today. At d = 8 the blend yields exactly `PALETTE.bg`,
which is exactly what the pre-fill already wrote for the clipped rows — so the clip survives
as a pure performance optimisation with zero visual consequence.

### 3.3 Design decisions I made, and my reasoning

**(a) The taper lives inside `opacityForDepth`, using the fixed corridor constant (4→8),
rather than taking `maxDist` as a parameter.** Consequence: inside darkness zones
(`maxDist = 1.5`), every visible depth is below the taper start of 4, so `taper ≡ 1` and
**darkness rendering is bit-identical by construction**, not by a tuning decision. I have no
measurements of darkness zones and the brief forbids unevidenced changes, so I want the
no-op to be structural. The alternative — tapering over `[maxDist/2, maxDist]` = `[0.75, 1.5]`
in darkness — would darken the wall directly in front of the player to 74 % of its current
value, a game-feel change I cannot justify.

**(b) The taper applies globally** — floor/ceiling, wall strips, map sprites, feature glyphs,
and the amber edge glow all go through `opacityForDepth`. Tapering floor/ceiling alone would
create a *new* seam: the far wall would still pop at 0.29 over a floor that had faded out.
It also fixes a currently-unhandled case: **map sprites do not clip at `maxDist`** — the only
filters are `transformY <= 0.2` and wall occlusion, and since `castRay` returns `null` beyond
`maxDist` there is no occluder, so a glyph at d = 12 draws at ≈ 0.26 alpha floating over pure
background with no floor beneath it. The diagnosis captured this independently: *"an open room
renders as ceiling, floor, and a hard-edged black bar where the horizon should be, with the
`$` glyph floating unanchored in the middle of it."*

**(c) The arena renderer is untouched** — it has its own `arenaOpacityForDepth` /
`arenaFogFalloff` / `arenaFogMidtoneLift` and no reported clip defect.

**(d) An existing test must be deliberately replaced.** `render-math.test.ts:111` asserts
`expect(opacityForDepth(10)).toBeGreaterThan(0)` — that encodes the *intent* "fog never fully
vanishes", which this change reverses. I plan to replace it with: fog is exactly 0 at the draw
boundary; `opacityForDepth(d)` for d ≤ 4 matches the untapered formula; and
`opacityForDepth(1.5)` (the darkness clip distance) is untapered. Then falsify by setting
`fogTaperFrac = 1.0` and confirming the boundary test goes red while the d ≤ 4 tests stay
green — which doubles as the kill-switch demonstration.

---

## 4. The problem I actually want reviewed: the exit criteria are wrong

The approved plan's Phase 2 exit criteria were:

> `f1-treasure` band ratio rises from **0.37** to **≥ 0.85**, and `f1-teleporter` from
> **0.40** to ≥ 0.85; mid-range (depth 2–4) luma loss ≤ 10 % on `f1-straight` / `f2-straight`;
> boundary row-luma step **16.1 → below 5**.

Where **band** = rows with `|y − halfH| < halfH/8` (depth > 8, the clipped region) and
**surroundings** = rows with `halfH/8 ≤ |y − halfH| < halfH/4` (depth 4 → 8). I reconstructed
this definition from the stored 44-view row profiles and it reproduces the plan's published
figures (f1-treasure 0.37, f1-teleporter 0.41 vs 0.40 published, f5-straight 0.72, median 1.10
vs 1.13 published).

### 4.1 Predicting the outcome before implementing

Because fog is a linear lerp toward `BG`, and because anything drawn with `globalAlpha` over a
BG-coloured backdrop composites identically, the post-fix luminance of a row is predictable in
closed form:

```
L_new(y) = BG + taper(d(y)) · (L_old(y) − BG),   d(y) = halfH / |y − halfH|,  BG = 13.0
```

(Exact for the floor/ceiling lerp and for alpha-over-BG compositing. First-order only where
the post-`restore()` vignette has already darkened the pixel, since it scales BG too.)

Applying this to the stored row profiles of all 44 views:

**Band ratio — a mathematically perfect fix does not reach the criterion.**

| view | before | predicted after | required |
|---|---|---|---|
| `f1-treasure` | 0.37 | **0.47** | ≥ 0.85 |
| `f1-teleporter` | 0.41 | **0.47** | ≥ 0.85 |
| `f1-npc` | 0.60 | 0.45 | — |
| `f5-water` | 0.63 | 0.67 | — |
| `f5-straight` | 0.72 | 0.60 | — |
| median of 44 | 1.10 | 0.50 | — |

**My diagnosis of why:** the "surroundings" window *is* depths 4 → 8 — precisely the region
the taper darkens. Its inner edge (d = 4) must stay bright to satisfy the ≤ 10 % mid-range
constraint. So "band/surroundings ≥ 0.85" and "no mid-range loss" are **mutually
contradictory**: the ratio can only approach 1 if the surroundings collapse to background,
which the mid-range constraint forbids. The metric also inverts on the median (1.10 → 0.50)
in a way that means nothing — in views where a wall fills the band, the band is bright and the
taper darkens the surroundings, so the ratio falls while the picture improves.

I now believe the band ratio was a **severity-ranking instrument for diagnosis** (it correctly
identified which 5 of 44 views were bad) and is **not a fix-verification instrument**.

**Global max row-step also fails, for a different reason.** Predicted post-fix maxima are
5.97 / 6.84 / 6.22 / 6.63 on the f1 views (criterion: < 5), and the worst across all 44 is
34.8 on `f2-treasure` — because the global maximum picks up legitimate wall and geometry
contrast elsewhere in the frame, not the clip.

### 4.2 My proposed replacement criterion

Measure the step **at the known clip-boundary rows only** — `y = halfH ± halfH/8`, ±3 rows,
max `|ΔL|` between adjacent rows:

| view | before | predicted after |
|---|---|---|
| `f1-straight` | 18.47 | **1.08** |
| `f1-treasure` | 21.98 | **0.88** |
| `f1-teleporter` | 21.46 | **0.71** |
| `f1-npc` | 21.60 | **1.11** |
| `f5-water` | 12.45 | **0.48** |
| `f5-straight` | 12.38 | **0.60** |
| median of 44 | 13.60 | **1.08** |
| max of 44 | 26.05 | **3.21** |

Supporting signature: **pre-fix, the sharpest row-drop in the frame occurs at y = 285 in every
severe view** — and `halfH − halfH/8 = 325.5 − 40.7 = 284.8`. Post-fix the argmax scatters to
unrelated rows (147, 207, 144, 192, 246, 168), i.e. the clip stops being the dominant edge in
the image. I propose treating "argmax has moved off the boundary row" as a second, categorical
check alongside the magnitude threshold.

---

## 5. What I want from you

Answer these directly. Where you disagree, say what you would do instead and what evidence
would settle it.

1. **Is my claim in §4.1 correct** — that the approved band-ratio criterion is unreachable by
   construction, and mutually contradictory with the mid-range constraint? Check the reasoning
   and the closed-form prediction model. If I am wrong, the fix is probably wrong too.
2. **Is the replacement criterion in §4.2 sound, or does it have a blind spot?** My specific
   worry: a localized boundary-step test can pass while the picture still looks wrong — e.g. a
   broad, smooth, *too-strong* darkening across depths 4–8 would produce no local step at all
   and sail through. What additional measurement closes that gap? Is there a better instrument
   than either metric?
3. **Is the structural argument in §1.3 right** — that the midtone lift asymptotes at 0.25, so
   no draw distance can hide the clip, leaving taper-or-reduce-lift as the only options? Is
   there a third option I have not considered?
4. **Is smoothstep the right taper shape?** Alternatives (linear, cosine, exponential
   continuation, tapering the lift term only while leaving the exponential intact). Note that
   tapering the lift term alone was my original plan and I rejected it: it fails the ≤ 10 %
   mid-range cap at −11.7 % (d = 3) and −21.9 % (d = 4).
5. **Art direction.** Should the far end of a long corridor fade *fully* to background? It
   currently terminates at 29 % — visible, but with a hard seam. Fading to nothing removes the
   seam but also removes the visual terminator of the sightline. Is there a risk that corridors
   read as infinite or void-like rather than enclosed? What did the genre's reference points
   (Wizardry, Eye of the Beholder, Dungeon Master, Etrian Odyssey) actually do here, and does
   that argue for a nonzero floor instead of true zero?
6. **Is the global application (§3.3b) right**, or should sprites/glyphs be exempted? Features
   at depth 6–8 dim by up to 6× (0.31 → 0.049 at d = 7). Is that an acceptable navigational
   cost, given the automap exists and the glyph is fully visible by d = 5?
7. **Is the darkness-by-construction argument (§3.3a) sound**, or is it a fragile coincidence
   that will break the first time someone changes `maxDepth`?
8. **Is the kill-switch design sound?** `fogTaperFrac = 1.0` makes `start === maxDist`, so the
   `d <= start` branch returns 1 for everything below the boundary and the division is
   unreachable. Does that genuinely restore prior behaviour?
9. **What am I not measuring that I should be?** Performance is one candidate — I have not
   measured frame cost, though the taper is a handful of arithmetic ops per row/strip and the
   `continue` still skips the same rows.
10. **Is there any way this reads as unjustified "modernization"** that would deserve a revert
    under the governing brief?

## 6. Output format

- Lead with a verdict on the **measurement design** (§4) — that is the decision I am blocked on.
- Then a verdict on the **change itself** (§3): ship as proposed / ship with modifications /
  do not ship.
- Then the numbered answers.
- Flag anything where you think I have asserted something I have not actually verified. The
  brief's evidence rule is that every claim be falsifiable and that I state what I did *not*
  check; I would rather you catch a soft claim now than have it ship.
