# Phaser Innovative Effects Harvest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start until the human has approved this plan.**

**Goal:** Incorporate a short list of *net-new* Phaser 4 visual effects into FF6 combat presentation, harvested from 2025–2026 Phaser showcases and the Filter/Mesh2D/Stencil API surface — without duplicating Phases 0–4 already shipped on `feat/phaser-combat-port`.

**Architecture:** Phaser remains painter-only. Choreography (`playTurn` / `updateScene` / `CombatEvent[]`) stays in `combat-choreography.ts`. New recipes extend `combat-phaser-fx.ts`; stage applies them in `combat-phaser-stage.ts`. Canvas `?phaser=0` stays green (new Filters WebGL-only with graceful no-op).

**Tech Stack:** Phaser `4.2.1` (exact pin), existing effect strips, Vite dynamic `import("phaser")`. No Spine/`spine-phaser-v4` in this plan.

**Depends on:** Phases 0–4 of [`2026-07-29-phaser-combat-improvements.md`](2026-07-29-phaser-combat-improvements.md) (shipped). Design sibling of that plan remains the architecture source of truth.

## Global Constraints

- Phaser is painter only — do not replace `playTurn` with Phaser timelines as clock of record.
- Prefer zero `src/game/` edits; presentation-only hooks in choreography are OK.
- DOM FF6 menus remain; Scope C deferred (icebox).
- Keep `?phaser=0` canvas path buildable and smokeable.
- No corridor / town / camp Phaser.
- Respect existing icebox: Spine, Scope C menus, cone lights (O6), named-import custom Phaser build, stencil spell windows (O12) until this harvest’s Phase A–B land.
- Boss display names: **The Dead Boy** / **The Lonely Girl** / **The Crying Man**; never restore Headmaster/Echo player-facing vocabulary.
- Filter stacking budget: Phase 1 already uses **one Glow + one ColorMatrix** for spotlight — any new camera Filters must share that budget (swap/pulse, not stack indefinitely) or be profiled at 768×672.

---

## 1. Executive summary

Phases 0–4 closed the first Phaser ceiling: ground-plane, dual tint, spotlight Filters, Mag/Tech VFX language, stronger canvas swirl, hit squash. The **next** player-visible wins are mostly **Filter Actions and per-sprite Filters** that Phaser 4 ships ready-made (Bloom, Shine, Pixelate, Wipe, Vignette, Barrel, GradientMap) plus classic motion trails that still read as FF6.

**Recommended first ≤2-day slice (Phase A):** death dissolve (Pixelate + desaturate) + brief cast bloom + heal/buff Shine — all presentation-only, no art, extends `combat-phaser-fx.ts`.

**Rough calendar for Phases A–C:** **4–6 engineer-days**. Icebox (Spine, cone lights, stencil windows, Scope C) unchanged.

---

## 2. Research sources (2025–2026 preferred)

| Source | URL | What we took |
|--------|-----|--------------|
| Phaser v4.2.0 “Giedi” | https://phaser.io/news/2026/06/phaser-v4-2-0-released | Mesh2D, Stencil, AlphaStrategy dither/threshold, cone lights, MULTIPLY_TWO |
| Phaser 4 Filter System | https://phaser.io/news/2026/05/phaser-4-filter-system | Internal/external Filters; Blend, GradientMap, Quantize, Blocky, Wipe, Vignette, ParallelFilters; Bloom/Shine as Actions |
| Phaser 4 Filters skill (4.2.0) | https://cdn.jsdelivr.net/npm/phaser@4.2.0/skills/filters-and-postfx/SKILL.md | Wipe/reveal, ParallelFilters bloom recipe, Pixelate vs Blocky, `enableFilters()` |
| Phaser 4 Shader Guide | https://phaser.io/tutorials/phaser-4-shader-guide | Filter stack contract; cameras vs GO filters |
| Rex notes — Group Actions | https://rexrainbow.github.io/phaser3-rex-notes/docs/site/groupactions/ | `AddEffectBloom` / `AddEffectShine` / `AddMaskShape` params |
| Bauhaus Builder (Gamedev.js Jam 2026 winner) | https://phaser.io/news/2026/05/bauhaus-builder-gamedevjs-winner | Physics-shatter spectacle → inspiration for death/knockback *feel*, not Bauhaus art |
| HEXSTORM on Phaser 4 | https://phaser.io/news/2026/05/hexstorm-tears-of-arcadia-is-now-on-phaser-v4 | Production Phaser 4 migration; energy-grid glow aesthetic (low FF6 fit) |
| HEXSTORM intro | https://phaser.io/news/2026/01/hexstorm-tears-of-arcadia | Atmosphere / interconnected glow — boss-intro accent inspiration only |
| Particle trail (Ourcade / samme mirror) | https://blog.ourcade.co/posts/2020/how-to-make-particle-trail-effect-phaser-3/ · https://samme.github.io/phaser-examples-mirror/particles/smoke%20trail.html | Walk-forward trails / afterimages (classic P3, still valid) |
| Mesh2D / Stencil discussion | https://github.com/phaserjs/phaser/discussions/7318 | Stencil as persistent hard mask; CustomContext |
| Phaser Games index | https://phaser.io/games · jam winners (Rogue Eternal, Fuel Field, Addiction Mini) | Genre inspiration; few combat-specific recipes |

**Note:** “Resistance Racing” did not surface as a Phaser showcase in 2026 news/search (mostly unrelated cam-phaser automotive hits). Dropped from the harvest list.

**Method:** Firecrawl CLI search + scrape of Phaser news/docs; WebSearch/WebFetch for Filters skill + Wipe docs when rate-limited.

---

## 3. Already shipped (Phases 0–4) — do not re-plan

| Shipped | Commit / evidence | Harvest stance |
|---------|-------------------|----------------|
| Ground-plane + NEAREST + FF6 banner chrome | `02a11e0` | **Done** |
| Dual tint (`setTint2` / MULTIPLY_TWO) + status recipes | `dfd1c14`, `combat-phaser-fx.ts` | **Done** |
| Acting spotlight Glow + ColorMatrix dim | `dfd1c14`, stage `spotlightGlow` | **Done** — do not add a second always-on camera Glow |
| Mag/Tech distinct VFX language | `0d45f76` | **Done** — further strip polish only if playtest still fails |
| Stronger battle-transition swirl (canvas-2D) | `1608fc0` | **Done** — Phaser Wipe as *encounter* wipe stays icebox (dual-path risk) |
| Hit squash (display-size factors; Mesh2D deferred) | `8e3dfb6`, `hitSquashScale` | **Done** for player-visible weight; full Mesh2D vertex warp still optional later |

**Stretches from prior plan still open:** O5 cast bloom; death desaturate; O10 particle GO pooling; O6 cone lights (icebox).

---

## 4. Curated innovative effects (16)

Fit = high / med / low for Onyx FF6 combat under painter-only + icebox rules.

| # | Name | Looks like | Phaser APIs | Source | Onyx fit |
|---|------|------------|-------------|--------|----------|
| 1 | **Death Pixelate dissolve** | Dying actor mosaics into chunks then fades | `sprite.enableFilters()` + `filters.internal.addPixelate(amount)` keyed to death anim t | Filter system article; Filters skill | **High** — classic RPG death; no art; choreography already has `death` state |
| 2 | **Death / KO desaturate** | Body drains to grey on KO | `filters.internal.addColorMatrix()` → `saturate(0)` or brightness dip | Filter system; prior plan O5 | **High** — unfinished Phase 1 stretch; pairs with #1 |
| 3 | **Cast bloom pulse** | Brief bright bloom when banner/cast starts | `Phaser.Actions.AddEffectBloom(camera, {…})` or ParallelFilters Threshold+Blur+ADD; **pulse then tear down** (share spotlight budget) | Filter system; Rex Actions | **High** — closes O5; Mag identity beyond strip |
| 4 | **Heal / holy Shine sweep** | Soft specular swipe across healed / blessed targets | `Phaser.Actions.AddEffectShine(sprite, { duration, colorFactor })` | Rex Actions; Filter migration notes | **High** — FF6-adjacent sparkle; priest spells |
| 5 | **Heavy-hit Vignette pulse** | Edges darken for ~150ms on crit / boss hit | `camera.filters.external.addVignette` strength pulse | Filter system Vignette | **High** — cheap drama; must not fight spotlight Matrix |
| 6 | **Walk afterimage** | 2–3 translucent ghost clones behind walk-forward | Cloned sprites / tinted copies + alpha fade (or short-lived Particle emitter) | Classic P3 trail patterns (Ourcade/samme) | **High** — FF6 dash read; no Filters required |
| 7 | **Melee particle trail** | Sparks/dust follow walk→attack path | `particles` emitter `follow` actor; reuse Arc pool if O10 lands | Ourcade trail; samme smoke trail | **Med** — nice; Mag/Tech already differentiated |
| 8 | **Barrel impact punch** | Brief barrel warp on impact frame | `camera.filters.internal.addBarrel(amount)` pulse | Filters skill (Barrel) | **Med** — weight on top of squash; photosensitivity / nausea risk → tiny amp |
| 9 | **GradientMap elemental flash** | One-frame palette remap on fire/ice/holy hit | `filters.internal.addGradientMap` or camera ColorMatrix hue | Filter system GradientMap | **Med** — strong identity; risk of muddy pixel art |
| 10 | **AlphaStrategy dither death** | Semi-transparent death dissolves as opaque pixel cloud | `render.alphaStrategy` / Container `filtersForceComposite` + dither | Phaser 4.2.0 release | **Med** — novel; higher risk (global/config, perf discard) |
| 11 | **CaptureFrame hit-stop** | Single frozen frame of impact before resume | `CaptureFrame` GO / DynamicTexture snapshot flash | Filters skill CaptureFrame | **Med** — juice; must not desync choreography clock |
| 12 | **Mesh2D floor buckle** | Floor triangle mesh ripples under heavy spell | `Phaser.GameObjects.Mesh2D` | Phaser 4.2.0 Mesh2D | **Med** — after squash; more art/layout work |
| 13 | **Wipe reveal into combat canvas** | Directional reveal of battle scene | `camera.filters.external.addWipe` + `setRevealEffect` | Wipe docs; Filters skill | **Low** — swirl already owns encounter identity; dual wipe = confusion |
| 14 | **Stencil spell “window”** | Hard-edged portal/mask for signature casts | `Stencil` / `StencilReference` | 4.2.0; discussion #7318 | **Low** — prior icebox O12; keep parked |
| 15 | **Cone light searchlight** | Directional beam on active actor / boss intro | `lights.addConeLight` | 4.2.0; prior O6 | **Low** — icebox; needs lighting pipeline on strips |
| 16 | **HEXSTORM energy-grid glow** | Network lines linking nodes | Graphics + Glow / PointLight aesthetic | HEXSTORM news | **Low** — wrong genre for Wizardry/FF6; skip |

---

## 5. Scored backlog (net-new only)

Score = payoff ÷ (effort × risk). Effort S=1, M=2, L=3. Risk L=1, M=1.5, H=2.5. Payoff 1–5.

| ID | Opportunity | Payoff | Effort | Risk | Score | Notes |
|----|-------------|--------|--------|------|-------|-------|
| H1 | Death Pixelate + desaturate | 5 | S | L | **5.0** | First-slice core |
| H2 | Cast bloom pulse (O5) | 4 | S | M | **2.7** | Tear down before spotlight conflict |
| H3 | Heal/holy Shine | 4 | S | L | **4.0** | First-slice core |
| H4 | Heavy-hit Vignette pulse | 3 | S | L | **3.0** | Phase A stretch |
| H5 | Walk afterimage | 4 | M | L | **2.0** | Phase B |
| H6 | Particle GO pooling (prior O10) | 2 | S | L | **2.0**† | Engineering; enables trails |
| H7 | Melee particle trail | 3 | M | L | **1.5** | After H6 |
| H8 | Barrel impact punch | 3 | S | M | **2.0** | Tiny amp; photosensitivity |
| H9 | GradientMap elemental flash | 3 | M | M | **1.0** | Spike first |
| H10 | CaptureFrame hit-stop | 3 | M | M | **1.0** | Clock-safe only |
| H11 | Mesh2D floor buckle | 3 | M | M | **1.0** | After H1–H5 |
| H12 | AlphaStrategy dither death | 4 | M | H | **0.8** | Prefer Pixelate path |
| H13 | Wipe combat reveal | 2 | M | M | **0.7** | Skip — swirl owns this |
| — | Stencil windows / cone / Spine / Scope C / named imports | — | — | — | icebox | Unchanged |

† Engineering — schedule beside Phase B if Arena GC churn is visible.

**Recommended track:** H1 → H3 → H2 → H4 → H5 → H6 → H8 → (H7/H9 spikes).

---

## 6. Architecture (unchanged seams)

```
CombatController → CombatStage.paint()
                       ├─ createPhaserCombatStage  (default)
                       └─ createCanvasCombatStage  (?phaser=0)
Both share CombatScene + playTurn from combat-choreography.ts
```

| Module | Role this harvest |
|--------|-------------------|
| `combat-phaser-fx.ts` | Pure recipes: `deathDissolveRecipe(t01)`, `castBloomRecipe`, `shineTargetsFor(events)`, vignette pulse params — **no Phaser.Game** |
| `combat-phaser-stage.ts` | Apply/teardown Filters; afterimage sprite pool; share camera filter budget with spotlight |
| `combat-choreography.ts` | Optional only: expose `deathProgress` / effect tags if missing — prefer reading existing anim state |
| `battle-transition.ts` | **Do not touch** for Wipe dual-path |

Kill-switch: extend existing `?phaserFx=0` / `PHASER_FX_SPOTLIGHT` pattern so bloom/shine/pixelate can disable without reverting tint.

---

## 7. Phased work

### Phase A — Death dissolve + cast bloom + heal Shine (≤2 days) ★ first slice

**Goal / demo:** Arena KO shows pixelate→grey dissolve; casting a spell pulses bloom once; Mass Heal / single heal shows Shine on targets — all without reading the log.

**Files:**
- Modify: `src/engine/combat-phaser-fx.ts` (+ tests in `combat-phaser-fx.test.ts`)
- Modify: `src/engine/combat-phaser-stage.ts` (apply per-sprite Filters on death; camera bloom pulse on `scene.banner` rising edge; Shine on heal effect sprites/targets)
- Do **not** change hurt/death durations in `playTurn`

**Steps:**
- [ ] Add pure `deathDissolveRecipe(t01)` → `{ pixelate, saturation, alpha }` unit-tested
- [ ] Stage: on `anim.state === "death"`, `enableFilters()` once per actor; drive Pixelate + ColorMatrix; clear on destroy / revive
- [ ] Add `castBloomPulse(host, now, bannerStart)` — add bloom ≤180ms then destroy (never leave ParallelFilters stacked with idle spotlight)
- [ ] Wire Shine for heal-colored EffectStyles / heal popups (reuse strip timing)
- [ ] Stretch if time: H4 vignette pulse on crit popup or boss accent hit
- [ ] `npm run build` + `npm test`
- [ ] Arena smoke Phaser + `?phaser=0` (death still fades on canvas without Filters)
- [ ] AGENTS combat checklist 3, 4, 8, 11

**Exit criteria:** Screenshots: mid-death mosaic; cast bloom frame; heal Shine frame. Filters destroyed in `stage.destroy()` / Next Fight. No `src/game/` edits.

**Rollback:** Constants `PHASER_FX_DEATH_DISSOLVE` / `PHASER_FX_CAST_BLOOM` / `PHASER_FX_SHINE` → false.

---

### Phase B — Afterimage + pooling (1–2 days)

**Goal / demo:** Walk-forward leaves 2–3 ghost clones; particle Arc churn drops in long Arena sessions.

**Files:**
- Modify: `combat-phaser-stage.ts` (afterimage pool; reuse particles/effectSprites instead of destroy+recreate — prior O10)
- Optional: `combat-phaser-fx.ts` afterimage alpha curve

**Exit criteria:**
- [ ] Visible afterimages only during walk; cleared on skip / turn end
- [ ] FAST playback still clean
- [ ] Particle count capped; no leak across Next Fight
- [ ] `?phaser=0` unchanged (afterimages Phaser-only OK)

**Rollback:** Disable afterimage constant; pooling can stay.

---

### Phase C — Impact extras (1–2 days, optional)

**Goal / demo:** Tiny Barrel punch on melee squash peak; optional GradientMap elemental one-frame flash behind a flag.

**Exit criteria:** Photosensitivity — Barrel amp ≤ documented constant; reduced-motion skips Barrel. Profile filter stack ≤ budget.

**Icebox still:** H13 Wipe, H12 AlphaStrategy dither (unless Pixelate insufficient), stencil windows, cone lights, Spine, Scope C, named imports.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Bloom + spotlight Glow stack blows GPU / washes scene | Pulse bloom ≤180ms then destroy; never idle-stack with Glow |
| Per-sprite `enableFilters()` framebuffer cost × 6 party + N enemies | Only enable on death / Shine targets; disable when idle |
| Shine Action creates tween owned by Phaser | Drive visibility from choreography timestamps; kill tweens on skip/`destroy` |
| Canvas rollback lacks Filters | No-op; keep alpha fade death from existing path |
| Afterimages desync with FAST/skip | Clear pool whenever choreography skip fires |
| Barrel / vignette photosensitivity | Tiny amp; respect `prefers-reduced-motion` if already wired for swirl |

---

## 9. Verification

- Unit: recipe functions in `combat-phaser-fx.test.ts` (no Phaser runtime).
- Build: `npm run build`.
- Manual / Playwright Arena: death, cast, heal; `?phaser=0` smoke.
- AGENTS FF6 combat checklist items relevant to presentation.

---

## 10. Decisions (proposed — lock on approval)

1. **Phase A first slice** = H1 + H3 + H2 (death dissolve, Shine, cast bloom). ✅ proposed
2. **Do not dual-path encounter wipe** with Phaser Wipe — canvas swirl remains sole identity. ✅
3. **Cone lights / Spine / Scope C / stencil windows / named imports** stay icebox. ✅
4. **Full Mesh2D vertex warp** stays optional; scale squash already shipped. ✅
5. **HEXSTORM energy-grid aesthetic** rejected for combat. ✅

---

## 11. Out of scope

- Game logic, damage math, encounter rates, perk rules
- Corridor Phaser
- New spell art packs (reuse `public/assets/effects/`)
- Rewriting Mag/Tech strips unless playtest re-opens Phase 2
