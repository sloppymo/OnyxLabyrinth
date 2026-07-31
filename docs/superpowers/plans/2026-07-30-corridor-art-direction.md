# Corridor art-direction pass — diagnosis

**Date:** 2026-07-30 · **Status:** diagnosis complete · **Phase 0 shipped** `84e9fe7` ·
**Phase 1 shipped** `4aae61b` · Phases 2–4 not started. Branch `corridor-art-direction`,
not pushed.

> ## Implementation status
>
> | Phase | State | Evidence |
> |---|---|---|
> | 0 — unify `RENDER_CONFIG`/`MATH_CONFIG` | **Done** `84e9fe7` | Setting canonical `fogFalloff` to 0.42 moved f1 mean luma 35.13 → 25.78 and depth-4 floor luma 40.89 → 30.58; reverting returned both exactly. Before the change that edit was a no-op. |
> | 1 — un-invert the torch | **Done** `4aae61b` | Near-wall flicker amplitude 0.037 → 0.761 (f1), 0.057 → 1.065 (f5); frame luminance −0.51 % / −0.50 %; falloff now monotonic near → annulus → centre. |
> | 2 — taper fog to the clip boundary | Not started | Curve pre-verified (§5 under A): full-curve smoothstep only. |
> | 3 — per-floor door panels | Not started | |
> | 4 — extend the style guide | Not started | |
>
> **Two corrections made during Phase 1, both to my own measurements:**
> 1. The `±3 %` frame-luminance gate was initially evaluated on single-frame
>    captures. That is unsound — `drawTorchFlicker` early-returns when its alpha
>    goes negative, which happens for part of every cycle, so an arbitrary-phase
>    snapshot can catch a frame with no overlay drawn and report a falsely stable
>    number. All Phase 1 figures come from `corridor-torch-probe.mjs`, which
>    averages across whole flicker periods.
> 2. `torchFlickerEdgeScale` was first set to 0.45 on an area-integral estimate.
>    Measured, 0.65 was both *closer* to baseline frame luminance (−0.51 % vs
>    −0.85 %) and more perceptible, so 0.65 shipped.
>
> **Phase 1 slightly increases near-background pixel counts in six views** (worst
> `f5-treasure` +5.3 pp). This is not a regression: the old centre-weighted torch
> was tinting the F1 void band amber, lifting those pixels just above the
> near-bg threshold. Removing a cosmetic mask over F1 is the intended direction,
> and Phase 2 addresses the void itself. Verified as uniform frame darkening
> rather than band-specific — on `f2-straight` the band moved −4.1 and its
> surroundings −4.2.

Scope: the first-person corridor view (`src/engine/renderer.ts`, `render-math.ts`, the
`f1`–`f5` tilesets, the shared door panel). Measured against the design bar in
`docs/PROMPT-maze-art-direction-pass.md` and the constraints in `AGENTS.md` and
`docs/TILESET-ART-STYLE-GUIDE.md`.

**Headline:** the corridor is in good shape and its art pipeline is unusually disciplined —
the style guide's measured luminance table still reproduces to ±0.6 on all twenty tiles.
Three real defects sit on top of that, and all three are *invisible in a still screenshot
taken at a random spot*, which is why they have survived. One is a hard-clipped fog
boundary, one is a shared door asset that overrides floor identity on every floor, and one
is a torch flicker that lights the far end of the corridor instead of the near walls.

---

## 1. Baseline gallery

| Artifact | Location |
|---|---|
| 44 pinned-pose PNGs — **pre-Phase-1** (the original diagnosis capture) | `playtest-screenshots/2026-07-30-corridor-BEFORE/` |
| 44 pinned-pose PNGs — **post-Phase-1** (current build) | `playtest-screenshots/2026-07-30-corridor-baseline/` |
| Per-view numeric probes | `<either dir>/probes.json` |
| Falsification experiments | `.../experiments.json`, `.../experiment-e3b.json` |
| Torch probe, time-averaged (BEFORE / scale045 / scale065) | `.../torch-probe-*.json` |
| Fog-curve probe (Phase 0 falsification) | `.../fog-probe-*.json` |
| Checklist views 5 & 6 | `.../transition-check.json`, `.../check-*.png` |
| Pose table (machine-readable) | `scripts/playtests/corridor-poses.json` |

> **Read the directory names carefully.** `-BEFORE/` is the pre-Phase-1 capture that
> every §3 finding was measured on. `-baseline/` is the *current* build. Any Phase 2
> before/after must start from `-baseline/`, or it will be measuring Phase 2 against
> Phase 1 rather than against the original.

Three new scripts, following the existing `scripts/playtests/` shape (they reuse
`launch`/`jumpTo`/`waitForIdle`/`shot`/`ensureOutDir` from `lib.mjs`, and are currently
untracked):

- `corridor-pose-discovery.mjs` — walks each floor's live grid and *derives* the checklist
  poses geometrically (forward-run depth, lateral openings, door proximity, tile type)
  rather than hand-picking coordinates. Re-runnable after a map edit.
- `corridor-baseline-capture.mjs` — jumps to each pose, screenshots `#view`, and reads the
  canvas back with `getImageData`. All probes run on the renderer's own 744×651 bitmap, so
  CSS pixel-scaling and the DOM HUD cannot contaminate a measurement.
- `corridor-experiments.mjs` — the three falsification experiments in §4.

Poses are pinned via `__onyxDebug.jumpTo({ ..., autosave: false })`, so every later
before/after is at an identical camera. `readiness().failed` was empty on capture — no
tileset silently fell back to gradients.

**Pose table** (x, y, facing; 0=N 1=E 2=S 3=W):

| Floor | straight | sidePassage | frontWall | door | darkness | water | treasure | npc |
|---|---|---|---|---|---|---|---|---|
| F1 | 5,1,f1 | 4,2,f2 | 1,14,f0 | 6,5,f1 | — | — | 11,9,f0 | 13,5,f2 |
| F2 | 9,2,f3 | 5,2,f1 | 1,2,f3 | 6,4,f2 | 7,2,f3 | — | 12,3,f0 | 1,1,f1 |
| F3 | 2,4,f2 | 2,12,f0 | 1,1,f0 | 7,5,f2 | 13,7,f2 | — | 2,14,f0 | 3,9,f0 |
| F4 | 2,4,f2 | 2,7,f2 | 1,1,f0 | 5,9,f1 | 14,5,f2 | 2,14,f0 | 12,1,f3 | 2,10,f0 |
| F5 | 4,2,f1 | 6,2,f1 | 1,1,f0 | 9,8,f2 | 11,11,f3 | 14,13,f3 | 15,10,f3 | 2,7,f0 |

(Plus `stairs_down` and `teleporter` where present. F1 has no darkness or water tile; F5 has
no `stairs_down`.)

---

## 2. What already works — preserve this

Stated specifically, because these are the things a "modernizing" pass would break.

1. **The tileset pipeline is honest.** The style guide's §2.2 measured-luminance table was
   re-measured from the shipping PNGs and reproduces almost exactly — f1 wall 90.1 vs stated
   90, f2 floorA 60.2 vs 60, f3 ceiling 41.4 vs 41, f4 wall 80.8 vs 81, f5 floorB 43.4 vs 43.
   Twenty of twenty within ±0.6. The guide is trustworthy about tilesets and should be
   treated as binding.
2. **Floor identity is real for three of five floors**, and separable by measurement, not
   vibes. Authored hue: F1 88–102° (olive), F4 255–258° (violet), F5 187–192° (teal). In
   engine, at the `straight` pose: F1 hue 64°/chroma 10.8, F4 321°/8.8, F5 160°/10.5. A
   HUD-cropped screenshot of any of these three is identifiable.
3. **The edge-glow wash split is a genuinely good solution.** `glowWashAlphaScale: 0.22` for
   flat strips vs full strength on depth discontinuities (`glowEdgeDepthDelta`) means the
   amber lines trace corners and doorways without repainting flat walls amber. Visible
   working on `f1-straight` and `f5-straight`. Do not simplify this back to a uniform glow.
4. **The fog midtone lift earns its keep.** `fogMidtoneLift: 0.25` keeps brick courses and
   plank rhythm legible at depth 2–4 instead of crushing them. The in-code comment records
   that `fogFalloff: 0.42` was tried and reverted for exactly this. Do not relitigate it.
5. **F2 (Cursed Library) is the strongest floor in the game.** The bookshelf-as-wall-elevation
   motif reads as a *place* rather than a tiled texture. It is also the one floor that
   legitimately breaks the palette-density rule (173 quantized colours vs ≤60 for stone) and
   is better for it.
6. **The A/B checkerboard works.** Clearly readable in the open-room views — see
   `f1-treasure.png`, where the floor grid is the only thing carrying spatial orientation.

---

## 3. Findings

### F1 — Hard-clipped fog leaves a raw-background band at the horizon · **P1**

`drawFloorCeilingCast` guards each row with `if (rowDistance > maxDist) continue;`
(`renderer.ts:749`, `:781`). That is a clip, not a fade. Rows nearer the horizon than
`halfH / maxDist` are never written and keep the `BG_RGBA_PACKED` pre-fill — raw
`PALETTE.bg` `#0e0d0a`. With `maxDepth: 4` → `maxDist = 8`, that is a band of
**81 px, 12.5 % of screen height**, centred on the horizon.

The clip is visible because the fog curve has not faded out by the time it fires:
`opacityForDepth(8)` = **0.293**. Surfaces are cut off while still at 29 % strength, so the
boundary is a step, not a gradient. Measured on `f1-straight`: row 366 luma 26.6 → row 367
luma 42.68 (+60 % across one pixel row); ceiling side, row 284 luma 44.82 → row 285 luma
26.17 (−42 %).

The **12.5 % of canvas height** figure is invariant; the pixel count is not. Canvas intrinsic
size is container-driven and capped at 768×672 by `shell.resizeCorridorCanvas()`, so 81 px is
the band at the captured height of 651 px and scales with the window.

**Severity is geometry-dependent, and the calibration matters more than the defect.** Where a
wall stands within 8 units it covers the band entirely, and the band is invisible. Across the
44 views the median band-to-surroundings luma ratio is **1.13** — in most views the band is
*brighter* than its surroundings, because a wall is filling it. **The five rows below are the
tail, not the typical case.** All five have a forward open run of 8+ cells, i.e. no wall in
raycast range:

| View | band luma | surrounding luma | ratio |
|---|---|---|---|
| `f1-treasure` | 16.1 | 37.7 | **0.43** |
| `f1-teleporter` | 14.1 | 34.9 | **0.40** |
| `f1-npc` | 23.2 | 38.6 | 0.60 |
| `f5-water` | 14.3 | 22.9 | 0.62 |
| `f5-straight` | 18.9 | 26.2 | 0.72 |

So this concentrates on **Floor 1** — which is 25×32, by far the largest map (others are
14×14 to 18×18), has the longest sightlines, and is the tutorial floor carrying the player's
first impression. `f1-treasure.png` is the clearest case: an open room renders as ceiling,
floor, and a hard-edged black bar where the horizon should be, with the `$` glyph floating
unanchored in the middle of it.

**Cause:** the clip distance and the fog curve were tuned independently and never reconciled.
Not a texture problem — regenerating tilesets cannot touch this.

### F2 — The shared door panel overrides floor identity on every floor · **P1**

`door_placeholder_256.png` (the filename is accurate) is one asset drawn on all five floors.
Measured against the tilesets it sits next to:

| Asset | mean L | chroma | hue | quantized colours |
|---|---|---|---|---|
| `door_placeholder` | 35.9 | **28.8** | **27°** | **268** |
| densest tileset (`f2_wall`) | 62.5 | 45.2 | 17° | 173 |
| typical stone wall (`f4_wall`) | 80.8 | 17.3 | 255° | 45 |

268 quantized colours is 55 % denser than the densest authored tile and ~6× the guide's
≤60 ceiling for stone walls. In engine the effect is total, because a near door fills the
frame — every floor's `door` view collapses onto the same warm brown:

| Floor | corridor hue / chroma | door-view hue / chroma |
|---|---|---|
| F1 | 64° / 10.8 | 28° / **46.5** |
| F3 | 27° / 14.3 | 30° / 43.2 |
| F4 | 321° / 8.8 | **29°** / **41.2** |
| F5 | 160° / 10.5 | **27°** / **44.7** |

F4's identity paragraph says *"pale lilac scratches — **no orange**"* and F5's says
*"sparse mint cyan seepage — **never** full neon wash… no orange"*. `f4-door.png` is a
screen-filling warm-orange wooden panel with a soft-shaded metal ring — it also violates the
global anti-pillars "hard pixel edges" and "no soft painted gradients". This is the single
most style-discordant surface in the corridor, and doors are common.

**Cause:** the style guide's scope line reads *"corridor tilesets only (wall / floorA /
floorB / ceiling)"*. Doors were never in scope, so nothing constrained this asset. See F6.

### F3 — Torch flicker is depth-inverted · **P1**

`drawTorchFlicker` builds a radial gradient with maximum alpha at the screen centre
(`renderer.ts:1167-1170`) and is called at `:868` — **before** the wall pass. Two
consequences, both pushing the same way:

- In a corridor, the screen centre *is* the far end. The gradient puts the most torch light
  at maximum distance.
- Being under the walls, near walls (drawn at `globalAlpha` ≈ 0.85) occlude it, while distant
  walls (α ≈ 0.29) let it through.

A first measurement compared a centre disc (r < 0.25) against an outer ring (r > 0.75) and
returned a 63× amplitude ratio. **That number is inflated and should not be quoted:** the
outer ring sits under the vignette's darkest stop (`rgba(0,0,0,0.65)` at r=1) *and* under the
flicker gradient's own zero stop, so it reads near-zero by construction of two unrelated
effects rather than by depth alone.

Re-measured (E3b) with bands chosen so neither confound applies — a centre disc r < 0.2
versus an annulus 0.45 < r < 0.65 in the same vignette zone, plus the actual near-wall
surface (outermost 15 % of columns, middle 40 % of rows). 45 samples over ~2.7 s, camera
settled:

| Region | mean luma | **amplitude** | amp as % of mean |
|---|---|---|---|
| centre — far end (F1 / F5) | 28.77 / 19.30 | **6.158 / 6.383** | 21.4 % / 33.1 % |
| annulus — nearer, same vignette zone | 44.89 / 33.03 | 1.464 / 1.556 | 3.3 % / 4.7 % |
| near wall surface | 42.72 / 31.73 | **0.037 / 0.057** | **0.09 % / 0.18 %** |

**The honest figure is a 4.2× centre-to-annulus ratio** (F1 4.21, F5 4.10 — reproducing to
within 3 % on two independent floors, so this is structural, not noise). The near-wall
surface is modulated by 0.09 % of its own mean, i.e. not at all.

The party's own torch modulates the distance and leaves the walls beside them static — the
opposite of how a carried light behaves, and design bar #2 ("any two cues fighting reads as
flatness") in its purest form. It also compounds F1: the region it pulses hardest is
precisely the black void band, so on F1 the darkness at the end of the corridor visibly
breathes.

### F4 — 15 of 38 `RENDER_CONFIG` keys are inert · **P2**

`render-math.ts` hand-duplicates renderer constants into `MATH_CONFIG` with a comment asking
future editors to keep them in sync. The consequence is that `RENDER_CONFIG` is no longer the
control surface it claims to be:

- **10 shadow keys** — declared in `RENDER_CONFIG`, never read by `renderer.ts`, live twin in
  `MATH_CONFIG`: `fogFalloff`, `fogMidtoneLift`, `baseOpacity`, `projectionScale`,
  `heightFlatten`, `glowBlurNear`, `glowBlurFar`, `moveAnimDuration`, `turnAnimDuration`,
  `teleportSnapThreshold`. **Editing any of these does nothing.**
- **5 fully dead keys** — no reader anywhere in `src/`: `floorDarkenMultiplier`,
  `ceilingDarkenMultiplier`, `darknessDepth`, `floorRepeats`, `ceilingRepeats`.
- 2 dead keys the other way: `MATH_CONFIG.maxDepth` / `.darknessMaxDist` are declared but
  unread; the renderer reads its own copies.

The values currently agree, so there is no visible bug today. The hazard is procedural:
`AGENTS.md` § Conventions says *"Keep renderer constants in `RENDER_CONFIG`"* and the pass
brief says *"New tunables go in `RENDER_CONFIG`"* — both point an art pass straight at the
inert copies of exactly the fog and projection values it would want to touch. **This is the
most likely way this work ships frozen behind a green build**, which is the failure mode this
repo has already been bitten by once.

### F5 — Style guide §2.3 documents a dead code path · **P2**

§2.3 "Renderer processing" lists *"Floor/ceiling darken multipliers in the distance fog
pass"*. `floorDarkenMultiplier` / `ceilingDarkenMultiplier` have no reader — that model was
replaced by the `fogBlend`-toward-`PALETTE.bg` approach. The rest of §2.3 (brightness
×1.15 / ×0.85 / ×1.4, contrast 1.15–1.25) is accurate and matches `RENDER_CONFIG`.

### F6 — The style guide covers textures and nothing else · **P3**

Its own scope line is *"corridor tilesets only"*. It says nothing about doors, map sprites,
feature glyphs, fog falloff, vignette strength, torch behaviour, or the HUD frame. **Every
defect above lives in that gap** — F1 is fog, F2 is doors, F3 is torch. This is the
structural finding behind the other three, and the cheapest thing on the list to fix.

### F7 — F2 and F3 are the closest identity pair · **P3**

Authored hues overlap: `f2_wall` 17°, `f3_wall` 25°, `f3_floor_b` 14°. They separate on
chroma and value instead (in engine: F2 chroma 22.3 / luma 30.6 vs F3 chroma 14.3 / luma
24.0). Currently sufficient — the bookshelf silhouette does most of the work — but it is the
one place where "identifiable to floor with the HUD cropped" is carried by saturation alone.
Recording it; not proposing action.

---

## 4. Evidence discipline — what I falsified, and what I did not

Every experiment below stated its prediction before measuring; see
`scripts/playtests/corridor-experiments.mjs`.

**E1 — fog clip. CONFIRMED, and the probe is demonstrably able to move.** Predicted the band
edge at `halfH − halfH/8` = 284.8; measured 285. Then forced `state.inDarkness = true`, which
swaps `maxDist` to `darknessMaxDist: 1.5` and predicts a *different* edge at 108.5; measured
**109**. A check that only ever returns one answer proves nothing — this one returns the
right different answer when the underlying condition changes.

**E2 — cached `CanvasPattern` across a canvas-bitmap reset. NOT REPRODUCED.**
`drawScanlines` memoises `scanlinePattern` at module scope and, unlike `drawVignette`, never
invalidates it on a size change, while `resizeCorridorCanvas` reassigns `canvas.height`.
`AGENTS.md` documents this exact failure mode as having shipped once. I resized the viewport
mid-session (canvas 651→620 px tall, so the bitmap *was* reset) and frame luminance went
35.87 → 36.81 → 35.16. **No collapse.** Current Chromium keeps the pattern valid across a
bitmap reset. I am reporting this as a negative result, not a bug — but the asymmetry with
`drawVignette` is real and stays on the risk table rather than becoming a work item.

**E3 — torch inversion. CONFIRMED, but the first magnitude was wrong and I corrected it.**
The initial centre-vs-outer-ring measurement returned 63×; that band choice let the vignette
and the flicker gradient's own alpha ramp do most of the work. E3b re-measured with bands
that isolate depth from both, giving **4.2×** centre-to-annulus, reproducing to within 3 % on
two independent floors. The direction and the mechanism (radial gradient peaks at the far
end; painted under the wall pass) are unchanged; the number is now defensible. Quote 4.2×,
not 63×.

**A's fog curve — VERIFIED, and it killed the first formulation.** See §5 under A. The
lift-taper form I first intended fails this plan's own mid-range cap at depth 3–4; the
full-curve smoothstep form passes at 0.00 % loss. Checked arithmetically before scoring
rather than discovered in Phase 2.

**What I did not verify — stated plainly:**

- **Frame timing.** I measured no frame times. Every performance claim in §5 is a prediction
  from reading the hot loop, not a measurement. Phase 2 must measure before shipping.
- **The depth-feature glyph's horizontal placement.** `drawDepthFeature` fires on the first
  ray strip that hits a given cell, which should bias the glyph toward that cell's leading
  edge rather than its centre. I did not isolate a view that proves or disproves it.
- **Motion.** Head bob, camera tween and flicker were assessed from stills and from a
  40-sample time series at a fixed pose. I did not evaluate how movement *feels* in play.
- **Non-Chromium browsers.** All captures are headless Chromium.
- ~~**Combat → dungeon return (view 5) and the map overlay (view 6).**~~ Covered during
  Phase 1 by `corridor-transition-check.mjs`: corridor mean luma 35.13 baseline → 35.13 after
  a map toggle → 35.17 after a combat round-trip. Both pass.

**One thing Phase 1 could have broken and did not — checked, not assumed.** The torch lives
inside `render()`, and `renderCorridorBackdrop` runs the whole corridor render on an
offscreen 2×-height canvas and crops to the *lower* portion — which under a centre-weighted
gradient sat in dim falloff and under an edge-weighted one sits near full alpha. That would
have put a warm wash on a combat backdrop. It does not, because `renderCorridorBackdrop` has
no live caller: `main.ts:561` bakes the combat backdrop with `renderBattleArena`
(`arena-renderer.ts`), which never goes through `render()`. `renderCorridorBackdrop` is
imported only to be re-exported on the `?debug=1` surface (`main.ts:2324`), so the
`scanlinePattern = null` invalidation inside it is likewise debug-only. Confirmed visually
against `check-4-combat.png` — the backdrop is the 3/4 arena room, no amber wash.

---

## 5. Scored backlog

Score = payoff ÷ (effort × risk). Payoff 1–5 · effort S=1 M=2 L=3 · risk L=1 M=1.5 H=2.5.

| # | Change | Payoff | Effort | Risk | **Score** |
|---|---|---|---|---|---|
| **C** | **Un-invert the torch** — weight the gradient toward the frame edges (near surfaces) and/or move the call after the wall pass | 4 | S (1) | L (1) | **4.00** |
| **A** | **Taper the fog lift to 0 at `maxDist`** so the clip boundary is reached at fog ≈ 0 and the band edge stops existing | 5 | S (1) | M (1.5) | **3.33** |
| **D** | **Unify `RENDER_CONFIG` / `MATH_CONFIG`** — single source of truth; delete the 5 dead keys | 3 | S (1) | L (1) | **3.00** |
| **E** | **Extend the style guide** with a §10 covering doors, fog/depth, torch, feature glyphs | 3 | S (1) | L (1) | **3.00** |
| **B** | **Per-floor door panels** — bake 5 palette-matched doors through the generator | 4 | M (2) | L (1) | **2.00** |

**A is deliberately scoped as a fog-curve change, not a range change.** The obvious fix —
raise `maxDist` so the caster fills more rows — costs fill rate in the hot loop on exactly
the rows currently skipped. Reshaping `opacityForDepth` instead costs one multiply in a pure
function in `render-math.ts` and is unit-testable. Its risk is M rather than L only because
`opacityForDepth` feeds walls, floor, ceiling, sprites and glow alike, so the whole image
moves together.

**The curve was evaluated before scoring, and the first formulation failed.** Tapering the
midtone lift linearly (`lift × (1 − d/maxDist)`) breaks §2 finding 4 and this plan's own
10 % mid-range cap:

| depth | current fog | linear lift-taper | Δ | **full-curve smoothstep** | Δ |
|---|---|---|---|---|---|
| 2 | 0.600 | 0.573 | −4.6 % | **0.600** | **0.0 %** |
| 3 | 0.499 | 0.441 | **−11.7 %** ✗ | **0.499** | **0.0 %** |
| 4 | 0.427 | 0.333 | **−21.9 %** ✗ | **0.427** | **0.0 %** |
| 6 | 0.338 | 0.173 | −48.9 % | 0.169 | −50.0 % |
| 8 | 0.293 | 0.058 | −80.3 % | **0.000** | **−100 %** |

So **A must be implemented as multiplying the whole curve by a smoothstep that is 1.0 until
`maxDist/2` and 0 at `maxDist`**, not as a lift taper. That form:
- leaves depths 0–4 **bit-identical** (max mid-range loss 0.00 %),
- reaches exactly 0.0 at the clip boundary (from 0.293), so the boundary stops existing,
- predicts the boundary row-luma step falls from 16.1 to **0.03**.

Had this not been checked, Phase 2 would have shipped a change that visibly crushed depth 3–4
detail — the exact regression `fogFalloff: 0.42` caused and that the source comments warn
about.

### Rejected, with reasons

A backlog without rejections means nobody was discriminating.

- **Bloom / god rays / light shafts.** Anti-pillar ("no glow bloom large"). Adds no
  readability and would wash the mid-dark value band the whole palette depends on.
- **Dynamic per-light wall shading or normal maps.** Photoreal anti-pillar, and a per-pixel
  cost in the documented hot loop. The style guide's "implied light: soft top / top-left,
  baked" is a deliberate choice, not a limitation.
- **Higher-resolution tilesets.** "Chunky 16-bit, authored at 128 and NN-upscaled" *is* the
  identity. 256×256 is correct.
- **Retuning `fogFalloff` globally.** Already tried at 0.42, reverted for crushing mid-range
  detail, and the reason is recorded in the source. Relitigating it would be rediscovering a
  known answer.
- **Tinting the vignette per floor.** The vignette is black-alpha; the fog already tints
  toward `PALETTE.bg`. Two overlapping colour cues would fight, which is the exact failure
  mode of design bar #2.
- **Replacing or animating the A/B checkerboard.** It measurably works.
- **Rebuilding F2/F3 to separate their hues (F7).** They are separable on chroma and value
  today, and F2 is the best-looking floor in the game. Risking it for a marginal gain is a
  bad trade.
- **A distance fade for map sprites so they stop floating in the void.** Real symptom — see
  the lamp hanging in the black rectangle in `f2-straight.png` — but it is caused by F1 and
  disappears when F1 is fixed. Treating it separately would be patching a symptom.
- **Touching the perspective/vanishing-point math.** Hard rule, and nothing in the evidence
  suggests it is wrong.

---

## 6. Phased plan

Each phase is independently shippable and revertible. Exit criteria are written as things
that can **fail**.

**Phase 0 — D: unify the config. Prerequisite, not optional.**
Make `render-math.ts` the single source for the shared values (or have it import them), and
delete the 5 dead keys. Ships no visual change.
*Exit — must fail if broken:* temporarily set `fogFalloff` to 0.42 in the one remaining
place, re-run `corridor-baseline-capture.mjs`, and confirm the `f1-straight` depth curve
**moves**; then revert and confirm it returns. If editing the canonical constant does not
move the curve, Phase 0 is not done. `npm test` render-math suite stays green.

**Phase 1 — C: un-invert the torch.**
*Exit — measured with E3b's bands, not E3's:* the load-bearing gate is **near-wall amplitude
must exceed centre amplitude** (currently 0.037 vs 6.158 on F1 — the claim being fixed is
literally that this is backwards). Secondary: centre-to-annulus ratio must fall below 1.0
from 4.21. Mean frame luminance at `f1-straight` and `f5-straight` must not move more than
±3 %. Visual check that the effect is still perceptible — a fix that reads as "torch turned
off" fails.
*Note:* the original E3 centre-vs-outer gate would have been unfalsifiable. The vignette
crushes the outer ring regardless of what the torch does, so a perfect fix could still fail
it. E3b's bands are the ones to gate on.

**Phase 2 — A: taper the fog to the clip boundary.**
*Exit — measured against the post-Phase-1 build in `-baseline/`, not the original numbers:*
`f1-treasure` band ratio rises from **0.37** to **≥ 0.85**, and `f1-teleporter` from **0.40**
to ≥ 0.85. (`f1-treasure` was 0.43 pre-Phase-1; removing the centre-weighted torch took the
amber wash off the void, which is the intended direction, not a regression. The other four
severe views are unchanged to two decimals, and the median across all 44 is still 1.13.)
Simultaneously, mid-range legibility must hold: mean luma over depth 2–4 rows on
`f1-straight` and `f2-straight` must not drop more than **10 %** — the pre-verified
full-curve smoothstep predicts 0.00 %, so any measured loss means the wrong formulation
shipped. Row-to-row luma step at the old boundary (currently +16.1 / −18.6, predicted 0.03)
must fall below 5. Six-view checklist on ≥3 floors via `corridor-transition-check.mjs`.

**Phase 3 — B: per-floor door panels.**
Generate 5 palette-matched doors through `generate-floor-tilesets.mjs` (deterministic; do not
hand-edit PNGs, and do not parallelise — it writes shared outputs).
*Exit:* each floor's rendered `door`-view hue lands within **30°** of that floor's corridor
hue; F4 and F5 door-view chroma drops **below 25** (from 41.2 / 44.7); quantized colour count
per door drops below 100 (from 268). Doors must still read as doors — a recolour that makes
F5's door invisible against F5's wall fails.

**Phase 4 — E: extend the style guide.**
Add §10 covering doors, fog/depth cueing, torch behaviour, feature glyphs — the gap F6
identifies. Record the measured numbers from this pass as the new baseline.

Work happens on a branch. Nothing is pushed to `main` without asking, since `main`
auto-deploys to Pages.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **A fog/projection retune silently no-ops** because it edited a shadow key | High if Phase 0 is skipped | Work ships frozen behind a green build | Phase 0 is a hard prerequisite; its exit criterion is specifically "prove the constant moves the curve" |
| Phase 2 costs frame time in the documented hot loop | Low — the proposed change is a multiply in a pure function, not extra rows | Beautiful 30 fps is worse than good 60 fps | Measure frame time before/after; the range-extension variant is explicitly rejected for this reason |
| `opacityForDepth` feeds walls, floor, ceiling, sprites and glow — Phase 2 moves all of them | Certain | Could flatten mid-range depth cues | Exit criterion caps mid-range luma loss at 10 %; all 44 poses re-captured and diffed, not just the fixed one |
| Cached `scanlinePattern` has no size-change invalidation (E2 did not reproduce, but `drawVignette` guards and this does not) | Low today | Black frame on some engine/browser | Leave as recorded risk; if any phase touches `drawScanlines`, add the invalidation `drawVignette` already has |
| Phase 3 regenerates shared PNG outputs | Certain | Racing runs corrupt output | Single serial run; never fan out tileset generation |
| Retuning re-crushes the mid-range the way `fogFalloff: 0.42` did | Medium | Loses §2 finding 4 | The 10 % mid-range cap is the guard; if it trips, drop the phase |
| An "improvement" that is really a new aesthetic | Medium | Reverted work | Every phase's exit criteria are stated against the *existing* identity, not a new one |

**Test baseline:** `npm test` currently reports 12 known failures — 4 reach-perk tests in
`src/game/perks.test.ts` and 8 from the two untracked TDD files (`src/data/items.test.ts`,
`src/data/items-descriptions.test.ts`) targeting unbuilt features. Not chasing them; not
committing those two files. Any 13th failure belongs to this work. `npm run build` is clean
as of this diagnosis.

---

## 8. On the brief's premise

The brief argued the corridor was the target because it had gone longest without attention
while combat absorbed a Phaser port. The evidence supports that, but not for the reason
given: the corridor is not *stale*, it is *well-built with three specific defects that stills
don't reveal*. F3 (torch inversion) needed a time series to see at all, F1 needed a
geometry-dependent survey to separate "usually fine" from "bad in open rooms on the tutorial
floor", and F2 needed the source PNGs measured against the guide's own numbers. None of the
three would have surfaced from looking at a screenshot and forming an opinion.

The appendix's retarget-at-combat option is not needed.
