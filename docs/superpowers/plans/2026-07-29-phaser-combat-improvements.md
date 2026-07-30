# Phaser Combat Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start until the human has approved this plan and its design sibling.**

**Goal:** Raise FF6 combat presentation using Phaser 4.2.1 capabilities (Filters, dual tint, lights, stencil, Mesh2D) without rewriting choreography or combat rules.

**Architecture:** Phaser remains the painter only. Choreography (`playTurn` / `updateScene` / `CombatEvent[]`) stays in `combat-choreography.ts`. New FX live in `combat-phaser-stage.ts` + a focused `combat-phaser-fx.ts` helper module. Canvas path (`?phaser=0`) stays green as rollback. DOM menus stay.

**Tech Stack:** Phaser `4.2.1` (exact pin), existing sprite strips + `effect-sprite-cache`, Vite dynamic import (Phaser stays out of jsdom unit tests). Spine/`spine-phaser-v4` is icebox — not in `package.json` today.

**Design sibling:** [`../specs/2026-07-29-phaser-combat-improvements-design.md`](../specs/2026-07-29-phaser-combat-improvements-design.md)

## Global Constraints

- Phaser is painter only — do not replace `playTurn` with Phaser timelines as clock of record.
- Prefer zero `src/game/` edits; presentation-only hooks in choreography `EffectStyle` / scene fields are OK.
- DOM FF6 menus remain; Scope C deferred.
- Boss display names: **The Dead Boy** / **The Lonely Girl** / **The Crying Man**; internal ids `headmasters-echo*` frozen; never restore Headmaster/Echo player-facing vocabulary.
- Keep `?phaser=0` canvas parity path buildable and smokeable.
- Dynamic `import("phaser")` (and any future Spine import) stays — unit tests must not load Phaser in jsdom.
- WebGL teardown must continue to call `game.destroy(false)` then `runDestroy()` when pending (`combat-phaser-stage.ts`).
- Ground-plane contract: strip sprites at `ResolvedSlot.centerY` with `setOrigin(0.5, 0.5)` — planting at `drawY` floats actors ~½ height (fixed on branch; may be uncommitted atop `a3d386e`).

---

## 1. Executive summary

**Recommended track:** Phase 0 (parity gate) → Phase 1 (dual tint + camera Filters spotlight) → Phase 2 (Mag/Tech VFX language) → Phase 3 (stencil/stronger swirl) → Phase 4 (Mesh2D hit squash). Park Spine, Scope C, and named-import custom builds in the icebox.

**Why this over icebox:** Day-1/2 work is **filter- and tint-only** (no new art, no Spine license, low WebGL risk) but players notice acting focus, status readability, and impact language. That directly harvests open items from [`docs/FOLLOWUP-2026-07-28-COMBAT-ONLY-PASS.md`](../../FOLLOWUP-2026-07-28-COMBAT-ONLY-PASS.md) (Mag/Tech sameness, swirl identity) using APIs confirmed in Phaser 4.2.1 `.d.ts` (`setTint2`, `TintModes.MULTIPLY_TWO`, `camera.filters.*.addGlow` / `addColorMatrix`, `lights.addConeLight`, `Mesh2D`, `Stencil` / `StencilReference`). Spine on The Dead Boy is the highest spectacle ceiling but fails the ≤2-day vertical-slice bar and needs art + Esoteric runtime licensing.

**Rough calendar:** **7–10 engineer-days** for Phases 0–4; first player-visible demo by end of Phase 1 (~1.5–2 days including Phase 0).

**Tradeoff (Filters-first vs Spine-first):**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A — Filters / tint / EffectStyle first** | No art; ships ≤2 days; hits readability; rollback trivial | Less “new engine” splash | **Recommend** |
| **B — Spine Dead Boy pilot first** | Unique boss breathing/cast; Mesh2D batching story | Art pipeline, Spine Runtime license, bundle size, weeks | Icebox until Option A lands + art exists |

**Scope C (menus → Phaser):** Stay DOM. ROI does not beat preserving ~800 lines of green menu tests; revisit only if a single input surface (gamepad + pointer) becomes a hard requirement.

---

## 2. Current-state gaps

Verified against `combat-phaser-stage.ts` (~1311 LOC), port design, and 2026-07-28 combat-only pass.

### Parity debt (match canvas / finish the port)

| Gap | Notes |
|-----|--------|
| Ground-plane / foot anchor | Fix exists in dirty `combat-phaser-stage.ts` on `feat/phaser-combat-port` (uncommitted atop `a3d386e`). Must land before FX work. |
| Banner / nameplate chrome | Phaser uses flat `Rectangle` fills; canvas uses `drawFF6Window` (vertical gradient `#3048b0→#101c58`, dual stroke). Port design accepted “reads as FF6”; still a visible soft spot. |
| Texture filter after `addSpriteSheet` | Game config sets `pixelArt: true`, but sheets added from HTMLImageElements should still assert `Phaser.Textures.FilterMode.NEAREST` on each new texture key (defensive vs soft sprites). |
| Particle / effect GO churn | `syncParticles` / effect sprites destroy+recreate every paint — works at capped counts (~40 effects) but wastes GC and blocks later pooling/Mesh2D FX. |
| Injectable RNG | Port design residual: `varyScale` / particle spawners / shake use `Math.random` — not wired for same-seed A/B. Engineering, low player visibility. |
| Banner chrome + particle RNG | Called out in port design as approximate / deferred — still true. |

### Net-new ceiling (Phaser enables; canvas was painful)

| Gap | Notes |
|-----|--------|
| Dual tint / layered status | Poison/burn use single `setTint`; no `setTint2` / `MULTIPLY_TWO` burn-over-poison language. |
| Camera Filters | No Glow / ColorMatrix / bloom-like / desaturate on cast, death, or boss intro. |
| Dynamic / cone lights | Floor `LightGlow` is Graphics circles only — no `lights.enable()` + cone spotlight on active actor. |
| Stencil | Battle transition is still canvas-2D HDMA swirl (`battle-transition.ts`); no Phaser stencil “windows.” |
| Mesh2D | No hit squash / floor buckle / portal warp. |
| Spine | Not a dependency; bosses still borrow strips (`flame-golem` / `warlock` / `summon-holy-guardian` at `BOSS_SIZE`). |
| Mag/Tech impact language | Open playtest finding: L6 Ember vs techniques both read as small puff + number; only banner disambiguates. Choreography already has rich `EffectStyle` / `ELEMENT_STYLES` / `resolveMeleeHitEffect` — Phaser can amplify without rules changes. |
| Swirl-in identity | Open playtest finding: first ~500ms reads as black fade. |

### Already mirrored (do not re-build)

Actors + shadows, popups, barks, banner/nameplate (basic), markers, HP pips, effects strips, particles (Arc), light glows (Graphics), screen shake (camera scroll), FAST/AUTO cues, boss intro nameplate data from `BOSS_PRESENTATION`, WebGL→CANVAS probe, sibling `#combat-phaser-canvas`, `debugActorLayout()`, dynamic import + `runDestroy` teardown.

---

## 3. Opportunity backlog (scored)

Score = payoff ÷ (effort × risk). Effort S=1, M=2, L=3. Risk L=1, M=1.5, H=2.5. Payoff 1–5.

| ID | Opportunity | Player-visible win | Effort | Risk | Art? | Phaser feature | Score |
|----|-------------|-------------------|--------|------|------|----------------|-------|
| O1 | Commit ground-plane + NEAREST assert | Formation planted; crisp pixels | S | L | no | texture filter | **5.0** |
| O2 | FF6 gradient banner/nameplate chrome | Matches DOM windows / canvas | S | L | no | Graphics/texture | **4.0** |
| O3 | Dual tint status (poison/burn/phase) | Status readable on body | S | L | no | `setTint2` / `MULTIPLY_TWO` | **5.0** |
| O4 | Acting spotlight (Glow + dim ColorMatrix) | Who’s acting is unmistakable | M | M | no | Filters | **2.7** |
| O5 | Cast bloom + death desaturate | Spell/death beat punch | M | M | no | Filters | **2.3** |
| O6 | Cone light on active / boss intro | Spotlight / intro drama | M | M | no | `addConeLight` | **2.0** |
| O7 | Mag/Tech distinct impact language | Verb identity without reading banner | M | L | reuse | EffectStyle + blend/glow | **3.3** |
| O8 | Stronger swirl-in (stencil or canvas) | Fight commitment moment | M | M | no | Stencil or 2D | **2.3** |
| O9 | Mesh2D hit squash (melee + 2 spells) | Impact weight | M | M | no | Mesh2D | **2.0** |
| O10 | Effect/particle GO pooling | Smoother long Arena sessions | S | L | no | pooling | **2.0**† |
| O11 | Injectable particle RNG | Same-seed A/B captures | S | L | no | choreography | **1.5**† |
| O12 | Stencil spell “window” masks | Signature spell spectacle | L | M | no | Stencil | **1.1** |
| O13 | Spine pilot — The Dead Boy | Living boss | L | H | **yes** | spine-phaser-v4 / Mesh2D | **0.7** |
| O14 | Named imports / custom Phaser build | Bundle ↓ from ~1.39MB / ~364KB gz | M | M | no | build | **1.0**† |
| O15 | Scope C menus in Phaser | Unified input surface | L | H | no | DOM→Phaser | **0.4** |
| O16 | Palette grey-out unusable slots | UX before keypress | S | L | no | **DOM only** | **3.0**‡ |

† Engineering / perf — rank below player-facing unless ship-blocking.  
‡ Not Phaser-unique; schedule as a **parallel 0.5-day UX PR**, not in the Phaser FX track.

**Recommended track (3–6):** O1 → O2 → O3 → O4 → O7 → O8 → O9 (with O5/O6 as Phase 1 stretch; O10 alongside Phase 2).  
**Icebox:** O12–O15, Spine art pipeline, O11 unless A/B flakes force it.

---

## 4. Architecture constraints

### Invariants

1. **Painter only** — `CombatStage` in `combat-stage.ts`; Phaser implementation `createPhaserCombatStage` in `combat-phaser-stage.ts`.
2. **Event clock** — `playTurn(scene, events, …)` remains the sole author of step times; Filters/Mesh2D key off `CombatScene` timestamps already set by choreography.
3. **DOM menus** — `combat-select-action-view.ts` + controller; do not move into Phaser in this plan.
4. **Rollback** — `resolveCombatStageKind`: default Phaser; `?phaser=0` → canvas. Every phase exit criterion includes canvas smoke.
5. **No corridor Phaser.**

### Proposed module boundaries

| Module | Role |
|--------|------|
| `src/engine/combat-phaser-fx.ts` | Pure-ish helpers: resolve status tint pair; build/teardown camera filter stack from scene flags; map `BOSS_PRESENTATION` accent→glow params. **No Phaser Game construction.** May import Phaser **types only** or accept GO refs passed in. Prefer accepting `Phaser.Scene` methods via a narrow `PhaserFxHost` interface so unit tests can stub. |
| `src/engine/combat-phaser-stage.ts` | Calls fx helpers each paint; owns GO lifecycle. |
| `src/engine/combat-choreography.ts` | Optional: extend `EffectStyle` / `resolveMeleeHitEffect` presentation fields (e.g. `impactLanguage: "slash"|"ember"|"spark"`); **no** Phaser imports. |
| `src/engine/battle-transition.ts` | Phase 3: stronger swirl; optional later Phaser stencil path behind a flag — keep reduced-motion + generation counter. |
| Future `combat-phaser-spine.ts` | Icebox — dynamic import `spine-phaser-v4`, map boss id → skeleton; slot-attach damage Text. |

### APIs to use (verified in `node_modules/phaser/types/phaser.d.ts` for 4.2.1)

- `sprite.setTint` / `setTint2` / `setTintMode(Phaser.TintModes.MULTIPLY_TWO)`
- `camera.filters.internal|external.addGlow(...)` / `addColorMatrix()`
- `this.lights.enable()`; `this.lights.addConeLight(...)` (needs `Pipeline` lighting on sprites that opt in — **verify per-sprite lighting enable in a spike**; if Canvas renderer path cannot light, gate lights behind WebGL-only and no-op on CANVAS fallback)
- `Phaser.GameObjects.Mesh2D`
- `Phaser.GameObjects.Stencil` / `StencilReference`
- Do **not** invent APIs; if a Filters recipe fails on CANVAS renderer, degrade gracefully (filters WebGL-only is acceptable if canvas rollback exists)

---

## 5. Phased work

### Phase 0 — Parity gate (≤1 day)

**Goal / demo:** Actors sit on the ground plane; pixels stay NEAREST; banner reads as FF6 window chrome in Arena.

**Files:**
- Modify: `src/engine/combat-phaser-stage.ts` (commit ground-plane if still dirty; `textures.get(key).setFilter(NEAREST)` after `addSpriteSheet`; replace flat banner/nameplate rect with Graphics gradient + dual stroke mirroring `drawFF6Window` in `combat-scene.ts`)
- Test: `scripts/playtests/ab-phaser-ground-plane.mjs`, `scripts/playtests/smoke-phaser-combat.mjs`

**Exit criteria:**
- [ ] Dirty ground-plane fix committed (or confirmed already in HEAD)
- [ ] `npm run build` clean
- [ ] Arena default + `?phaser=0` both boot combat
- [ ] A/B footY within ~4px of canvas for same seed (script or manual)
- [ ] AGENTS checklist items 1, 5, 11 still hold

**Rollback:** Revert commit; `?phaser=0` unaffected if Phaser-only.

---

### Phase 1 — Dual tint + acting spotlight (≤2 days total with Phase 0)

**Goal / demo:** Poisoned+burning enemy shows layered tint; acting character pops via camera Glow / slight scene dim; boss intro uses accent-colored soft Glow from `BOSS_PRESENTATION`.

**Files:**
- Create: `src/engine/combat-phaser-fx.ts`
- Create: `src/engine/combat-phaser-fx.test.ts` (tint pair resolution / filter recipe selection — **no Phaser runtime**)
- Modify: `src/engine/combat-phaser-stage.ts` (`upsert*` tint path; paint-time filter sync; clear filters on `destroy`)

**Interfaces (fx module):**
```ts
export type StatusTint = {
  tint?: number;
  tint2?: number;
  mode?: number; // Phaser.TintModes value passed through as number to avoid hard Phaser import in tests
};

export function statusTintFor(flags: {
  poison?: boolean;
  burn?: boolean;
  // extend carefully — presentation only
}): StatusTint;

export type SpotlightRecipe = {
  glowColor: number;
  glowOuter: number;
  dimBrightness: number; // ColorMatrix
};

export function spotlightRecipe(opts: {
  bossAccentHex?: string | null;
  casting?: boolean;
}): SpotlightRecipe;
```

**Player-visible demo:** Arena → poison an enemy (or debug status) → layered green/orange; tab through actors → spotlight follows `activeActorId`.

**Exit criteria:**
- [ ] `npm run build` + `npm test` (fx unit tests green)
- [ ] Filters torn down in `stage.destroy()` (no leak across Arena “Next Fight”)
- [ ] CANVAS fallback: no throw if Filters unsupported — tint still applies
- [ ] `?phaser=0` unchanged visually for status (single tint OK on canvas)
- [ ] AGENTS checklist 1–4, 8

**Rollback:** Feature-flag `?phaserFx=0` optional; or revert Phase 1 commits. Prefer compile-time constant `PHASER_FX_SPOTLIGHT = true` flipped false if needed.

**Stretch (same phase if time):** O5 cast bloom keyed off `scene.banner` / charge effects. **O6 cone lights deferred** past Phase 4 (locked §10).

---

### Phase 2 — Mag / Tech VFX language (1–2 days)

**Goal / demo:** Side-by-side Arena Magic wave vs Technique wave: impacts distinguishable **without** reading the banner (closes combat-only pass rec #1).

**Files:**
- Modify: `src/engine/combat-choreography.ts` — `resolveMeleeHitEffect` / technique path: prefer slash/spark strips already in `public/assets/effects/` (`free-slash.png`, etc.); ensure low-tier elemental styles keep travel+burst where defined; optional `glow: true` / scale / `burstCount` differentiation
- Modify: `src/engine/combat-phaser-stage.ts` — honor additive blend / underlay more aggressively; optional brief Glow filter pulse on spell bursts only
- Test: extend or add Playwright capture in `scripts/playtests/` (reuse combat-only-pass pattern); unit tests for `resolveMeleeHitEffect` / style resolution if pure functions change

**Exit criteria:**
- [ ] Screenshots: Ember (or equivalent) vs a Fighter technique mid-impact — different silhouette/color/motion
- [ ] No damage/SP/Rage math changes (`src/game/**` untouched)
- [ ] Effect cap (`MAX_SCENE_EFFECTS`) still respected
- [ ] `?phaser=0` also benefits (choreography-driven) — good
- [ ] AGENTS checklist 3–5

**Rollback:** Revert EffectStyle tweaks; strips remain.

**Parallel (optional small PR):** O16 palette grey-out in `combat-select-action-view.ts` — not Phaser, but same playtest harvest.

**Also in this phase if cheap:** O10 pool particle Arcs / effect sprites (reuse GO, setVisible) to cut destroy churn.

---

### Phase 3 — Battle transition identity (1–2 days)

**Goal / demo:** Mid-swirl frames show clear spiral/ribbon structure in first ~500ms (combat-only pass rec #5), without much longer total duration.

**Files:**
- Modify: `src/engine/battle-transition.ts` (primary — still owns map↔combat wipe; generation + reduced-motion stay)
- Optional spike: Phaser `Stencil` aperture **only if** canvas-2D contrast/ribbon boost is insufficient — do not dual-maintain two swirls without a flag
- Test: existing transition unit tests if any; Playwright burst-capture of swirl-in

**Exit criteria:**
- [ ] Mid-frame screenshot shows readable swirl, not near-solid black
- [ ] `prefers-reduced-motion` still short-fades
- [ ] Overlapping Arena next-fight generation counter still correct
- [ ] Photosensitivity: keep soft flash peaks (`FLASH_PEAK` / boss variant)

**Rollback:** Revert transition tuning constants / ribbon draw.

**Recommendation:** Prefer **canvas-2D swirl strengthening** first (same module, known tests). Promote Phaser stencil transition only as a follow-up if still weak — stencil is higher risk mid wipe over live DOM+canvas stack.

---

### Phase 4 — Mesh2D hit squash (1–2 days)

**Goal / demo:** On melee hit and 1–2 signature spells (e.g. fire explosion / ice burst), target sprite briefly non-uniform scales via Mesh2D or a Mesh2D overlay — weight without new art.

**Files:**
- Modify: `src/engine/combat-phaser-fx.ts` — `hitSquashMesh(host, sprite, t01)` 
- Modify: `src/engine/combat-phaser-stage.ts` — when choreography anim state is `hurt` / impact popup age < N ms, apply squash; WebGL preferred
- Do **not** change hurt duration formulas in `playTurn`

**Exit criteria:**
- [ ] Visible squash on Arena Attack hit; restores to identity before next idle loop looks wrong
- [ ] FAST playback still completes; skip clears deformation
- [ ] CANVAS renderer: no-op or simple `scaleY` fallback (document which)
- [ ] `npm run build`; smoke Phaser + `?phaser=0`

**Rollback:** Disable squash constant; sprites remain.

---

### Icebox (explicitly out of Phases 0–4)

| Item | Why parked |
|------|------------|
| Spine The Dead Boy pilot | Needs Spine Editor export + Runtime license + `spine-phaser-v4@≥4.3.11` + folder convention; weeks |
| Stencil spell windows (O12) | Cool; after Mesh2D and transition settle |
| Named imports / custom Phaser build (O14) | Chore PR; ~364KB gz already behind dynamic import |
| Scope C menus | Test rewrite cost |
| Injectable RNG (O11) | Until visual A/B flakes demand it |

---

## 6. Art / content pipeline

### Phases 0–4 (no new art required)

Reuse:

- `public/assets/effects/*.png` (slash, stunburst, fire/ice, foozle-*, etc.)
- Existing party/enemy strips via `sprite-manifest.ts` / caches
- Boss presentation colors already in `BOSS_PRESENTATION` (`combat-choreography.ts`)

Authors supply: **nothing** for Filters/tint/Mesh2D vertical slice.

### Icebox — Spine pilot (The Dead Boy only)

If greenlit later:

| Artifact | Convention |
|----------|------------|
| Skeleton | `public/assets/spine/bosses/dead-boy/dead-boy.json` (+ `.atlas`, `.png`) |
| Anims | `idle`, `attack`, `hurt`, `death`, optional `cast` — names mapped in `combat-phaser-spine.ts` |
| Plugin | `spine-phaser-v4` ≥ 4.3.11 (requires Phaser ≥ 4.2.1) — dynamic import beside Phaser |
| License | Esoteric Spine Runtime license — **human must confirm** before npm add |
| Fallback | Keep current borrowed `flame-golem` strips if Spine fails to load |
| Slot objects | Damage Text / status icon attach to `ui_head` slot if present |

Do not rename internal enemy id `headmasters-echo`. Display remains **The Dead Boy**.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| WebGL context leaks across Arena fights | Keep `runDestroy()` path; assert `debugActorLayout` / no runaway contexts in long smoke |
| Filter cost @ 768×672 | One camera Glow + one ColorMatrix max in Phase 1; no stacked Bloom until profiled |
| Filters break CANVAS fallback | Try/catch; WebGL-only filters; tint always |
| Cone light needs lighting pipeline on sprites | Spike early; drop O6 from Phase 1 if strip sprites fight Lights |
| Spine license / size | Icebox; never block Filters track |
| jsdom / Vitest | No Phaser in unit tests; fx pure functions only; Playwright for paint |
| GitHub Pages `/OnyxLabyrinth/` base | Asset URLs already via Vite; Spine atlases must use same base |
| Timing hazards if Tweens own clock | Forbidden — decorate only |
| Soft sprites | Phase 0 NEAREST assert |

---

## 8. Test strategy

| Layer | What |
|-------|------|
| Unit (Vitest) | `statusTintFor`, style resolution changes, choreography pure helpers; **no** Phaser.Game |
| Existing suite | Must stay green; combat-choreography / combat-scene tests unchanged in spirit |
| Playwright | `smoke-phaser-combat.mjs`; `ab-phaser-ground-plane.mjs`; extend combat-only Mag vs Tech mid-impact shots; swirl mid-frame |
| Manual Arena | AGENTS combat checklist 1–12 after each phase |
| Rollback | Every phase: one fight with `?phaser=0` |
| Same-seed A/B | Prefer after O11; until then, qualitative side-by-side |

Do not scrape pixels for pass/fail in CI unless a dedicated visual job is added — ship Playwright findings reports as today.

---

## 9. Commit sequence (conventional)

1. `fix(combat): plant Phaser actors on ground-plane centerY`
2. `fix(combat): NEAREST filter on Phaser combat sheets`
3. `feat(combat): FF6 gradient banner chrome in Phaser stage`
4. `feat(combat): dual-tint status + camera spotlight helpers`
5. `feat(combat): differentiate technique vs low-tier spell VFX`
6. `perf(combat): pool Phaser combat particles/effects` (optional with 5)
7. `feat(combat): strengthen battle-transition swirl identity`
8. `feat(combat): Mesh2D hit squash on impact`  
Separate later: `chore(combat): named Phaser imports` / `feat(combat): Spine pilot Dead Boy` / `feat(combat): grey-out empty palette slots`

Keep commits vertical and reversible; do not bundle Spine with Filters.

---

## 10. Open questions — **LOCKED 2026-07-29** (human approved)

1. **Filters-first (Option A)** over Spine-first (B). ✅
2. **Phase 3:** canvas-2D `battle-transition.ts` only this train — no Phaser stencil wipe dual-path. ✅
3. **Cone lights (O6):** defer past Phase 4 (not a Phase 1 stretch). ✅
4. **Spine:** icebox — no Esoteric Runtime / npm work this month unless art + budget are explicitly greenlit later. ✅
5. **O16 palette grey-out:** separate PR, same week as Phase 2 (not bundled into Phaser FX commits). ✅

---

## Task checklist (implementer)

### Task 0: Gate

**Files:** `combat-phaser-stage.ts`, playtests above  

- [ ] Confirm/commit ground-plane origin/`centerY` fix
- [ ] Assert NEAREST on added sheets
- [ ] Port `drawFF6Window` look to Phaser banner/nameplate
- [ ] `npm run build`; smoke Phaser + `?phaser=0`
- [ ] Commit per sequence 1–3

### Task 1: FX module + spotlight

**Files:** Create `combat-phaser-fx.ts` + `.test.ts`; modify stage  

- [ ] Write failing tests for `statusTintFor`
- [ ] Implement tint + spotlight recipe
- [ ] Wire stage paint + destroy cleanup
- [ ] Arena visual check; commit 4

### Task 2: Mag/Tech language

**Files:** `combat-choreography.ts`, stage, playtest shots  

- [ ] Adjust technique vs elemental impact styles (presentation only)
- [ ] Capture Mag vs Tech mid-impact evidence
- [ ] Commit 5 (+ optional pool commit 6)

### Task 3: Swirl

**Files:** `battle-transition.ts`  

- [ ] Strengthen early swirl frames; keep reduced-motion
- [ ] Burst-capture proof; commit 7

### Task 4: Mesh2D squash

**Files:** `combat-phaser-fx.ts`, stage  

- [ ] Spike Mesh2D on one hurt; then melee + 2 spells
- [ ] CANVAS fallback documented; commit 8

### Stop

- [ ] Human review of Arena + checklist; no Spine work without Q4 answer

---

## Appendix — Repo facts (2026-07-29)

- Branch port commit: `a3d386e feat(combat): port combat presentation to Phaser 4`
- Dirty at plan time: `src/engine/combat-phaser-stage.ts` (ground-plane), assorted untracked prompts/playtests
- `package.json`: `"phaser": "4.2.1"` — **no** Spine package
- Phaser 4.2 news: Spine Mesh2D backend, Stencil APIs, `setTint2`, cone lights, Filters — confirmed against installed `.d.ts`
- Primary sources: https://phaser.io/news/2026/07/phaser-4-2-spine-renderer-mesh2d-stencil · https://phaser.io/news/2026/06/phaser-v4-2-0-released · https://esotericsoftware.com/spine-phaser
