# Phaser combat-presentation port — design

**Date:** 2026-07-29  
**Status:** draft / approved-for-planning  
**Type:** presentation-only port (no combat rules, no corridor/town rewrite)

**Related:**

- Planning prompt: the one-off planning prompt is no longer retained; this design
  document is the surviving authority for the port.
- Earlier shorter draft: superseded and no longer retained.
- Implementation plan (may lag this doc): [`../plans/2026-07-29-phaser-combat-renderer.md`](../plans/2026-07-29-phaser-combat-renderer.md) — **this design is source of truth** for interface naming (`CombatStage`), Phaser.AUTO, sibling canvas, and Phase 0→5 sequencing when the plan conflicts
- Parity baseline: [AGENTS.md](../../../AGENTS.md) “Combat (FF6) verification checklist”
- Boss display names only; internal ids `headmasters-echo` / `-remnant` / `-ascendant` stay frozen. Do **not** restore retired player-facing *Headmaster* / *Echo* vocabulary.

---

## Goal

Rehost only the combat **presentation** layer on **Phaser 4** (`phaser@4.2.1`) so sprite animation import becomes a loader/atlas concern, while leaving dungeon, town, camp, title, and every rule in `src/game/` untouched.

Players enter a normal fight (dungeon or Arena) and see combat rendered by Phaser, driven by the existing per-turn combat API and `CombatEvent` stream, with visual/behavioral parity (or explicitly listed deferrals), `npm run build` / `npm test` green, and debug/playtest seams intact.

---

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Phaser version | Pin **`phaser@4.2.1`** (exact). Greenfield embed → Phaser **4**, not frozen 3.90. |
| Phase 0 | File split (choreography vs painter) lands on **`main` as its own PR** before any Phaser dependency or code. |
| Scope | Ship **A → B as one effort**; **defer C** (menus into Phaser / mobile scale). |
| Architecture | Phaser replaces the **painter**, not the choreography engine. Keep `playTurn` / `updateScene` / the step scheduler. |

---

## Critical correction: Phaser 4 still has Canvas

Earlier drafts claimed Phaser 4 was WebGL-only with no fallback. **That is false.**

Verified in the shipped **4.2.1** package:

- `types/phaser.d.ts` still declares `class CanvasRenderer extends Phaser.Events.EventEmitter`
- `dist/phaser.esm.js` contains real `CanvasRenderer` / `getContext('2d')` paths
- `Phaser.AUTO` docs in 4.2.1: auto-detect WebGL; if unavailable, **fall back to the Canvas Renderer**
- All four renderer consts remain: `AUTO` / `CANVAS` / `WEBGL` / `HEADLESS`

**Consequence:** no WebGL capability check and **no** bespoke no-WebGL fallback path. Use `Phaser.AUTO`. Drop any “WebGL-only / need capability check” risk from earlier drafts (including the superseded renderer design).

### Implementation note (Phase 5) — `Phaser.AUTO` + custom canvas

Phaser **4.2.1 throws** if `config.canvas` is set **and** `type` is `Phaser.AUTO` (“custom environment”). The shipped stage therefore keeps AUTO’s *intent* without using the AUTO const:

1. Probe `webgl2` / `webgl` on a temporary canvas.
2. Boot with `Phaser.WEBGL` when the probe succeeds, else `Phaser.CANVAS`.
3. If WEBGL construction throws, retry once with `Phaser.CANVAS`.

Sibling `#combat-phaser-canvas` is still required (sticky 2d context on `#combat-canvas` must not be reused). Do not “fix” this back to bare `type: Phaser.AUTO` without dropping the custom-canvas config.

---

## Phaser 4.2.1 — verified package facts

Every API this port leans on exists in 4.2.1’s `.d.ts` (checked, not assumed):

`load.spritesheet`, `anims.generateFrameNumbers`, `anims.create`, `setFlipX`, `setTint`, camera `shake()`, `Scale.NONE`, `pixelArt`, `preserveDrawingBuffer`, and `canvas?: HTMLCanvasElement` in game config.

**Exports map** (bundled types — no `@types/phaser`):

```text
exports: {
  ".": {
    types: "./types/phaser.d.ts",
    import: "./dist/phaser.esm.js",
    require: "./dist/phaser.js"
  }
}
```

Clean under `moduleResolution: "bundler"`.

### Measured bundle cost (full build, not an estimate)

| Artifact | Raw | Gzip |
|----------|-----|------|
| `phaser.esm.min.js` (full) | 1.38 MB | 356 KB |
| `phaser-arcade-physics.min.js` (slim) | 1.27 MB | 322 KB |
| Current main chunk (for scale) | 257 KB | 69 KB |

~5× the current JS payload — **dynamic `import("phaser")` is mandatory**, not merely nice. Re-measure the tree-shaken figure at **Phase 2 exit**. A custom Phaser build (we need no physics) is a later optimization, not a Phase-1 concern.

Import style: `import * as Phaser from "phaser"` / dynamic equivalent (Phaser 4 default import is broken). Prefer `import type` for type-only imports (`verbatimModuleSyntax`).

---

## The finding that reshapes the port

`src/engine/combat-scene.ts` (~4173 LOC) already has a clean pure/canvas seam at line **~3117** (`// --- Drawing ---`).

Verified independently:

```bash
awk 'NR<3117 && /\bctx\b/' src/engine/combat-scene.ts   # → empty
# First CanvasRenderingContext2D hit is in the Drawing section (~3123)
```

| Region | Lines (approx) | Role |
|--------|----------------|------|
| Choreography | 1–3116 (~74%) | Scene model, `playTurn` (~888 LOC), `updateScene` step scheduler, timing tables, ~570 LOC VFX style data (`ELEMENT_STYLES`, `SPELL_OVERRIDES`, `STATUS_STYLES`). Only two DOM touches: `new Image()` in `getCombatBg` and `backdrop: HTMLCanvasElement` on the type. |
| Painter | 3117–end (~1057 LOC) | Every `draw*` + `renderScene` — **only** the painter. |

**Therefore: Phaser replaces the painter, not the engine.** Both backends share one choreography engine that already exists, is already tested, and already works.

### Shared-engine port vs naive rewrite

| | Naive rewrite | Shared-engine port |
|--|---------------|-------------------|
| LOC to write | ~4200 | ~1100 |
| Timing parity | Eyeballed | Structural — same clock, same tables |
| `combat-scene.test.ts` (~866 lines) | Rewritten | Survives untouched |
| Churn risk (15 recent commits) | High — moving target | Low — churn is in the shared half |

One explore pass concluded `combat-scene.test.ts` “dies.” That was conditional on replacing the step scheduler with Phaser tweens. The seam grep breaks the tie: **keep the scheduler, keep the test.**

```mermaid
flowchart LR
  game["src/game/combat*"] -->|CombatEvent[]| ui["CombatController"]
  ui -->|CombatStage| stage["CombatStage"]
  stage --> choreo["combat-choreography\nplayTurn / updateScene"]
  ui -->|DOM| menus["combat-select-action-view"]
  choreo -->|same state each tick| canvas["Canvas painter TODAY"]
  choreo -->|same state each tick| phaser["Phaser painter NEW"]
```

---

## Recommended scope

**Ship A → B as one effort. Defer C.**

Argue from architecture, not ambition: because Phaser reads the same `CombatScene` model, barks / particles / glows / FAST / skip / death-fades arrive as data that is already populated. Splitting A from B would mean deliberately not drawing `scene.barks` and `scene.particles` for a release. There is no clean A-shaped stopping point.

| Scope | What | Default |
|-------|------|---------|
| **A** | Phaser draws actors + bg + cursor; DOM menus stay | Vertical slice / early phase |
| **B** | Popups, barks, banner, nameplate, effects, particles, shake, glows, FAST/skip, death fades — AGENTS checklist parity | **Ship target (with A)** |
| **C** | Menus inside Phaser + scale/touch | **Deferred** |

Defer C: moving menus discards ~824 lines of green tests (`combat-select-action-view.test.ts` 507 + `ff6-window-library.test.ts` 317) for zero player-facing gain. The DOM overlay is already correctly layered as siblings of the stage canvas.

**Rough effort (high velocity):** ~5–6 days; Phase 4 the largest.

---

## Architectural invariants (do not violate)

1. `src/game/` remains source of truth for combat resolution. Phaser must not compute damage, initiative, or status — only present `CombatEvent`s / `CombatState` snapshots.
2. Structured events only: `playTurn` builds choreography from `CombatEvent[]`; `null` log-only events are skipped. Preserve that contract.
3. Round-based `resolveCombatRound` (tests) and per-turn UI API share internals — do not break game tests.
4. `shell.showMode()` remains the only major mode DOM visibility toggle. Combat is mode `"combat"`.
5. `CombatController.isChoreographyDone()` / `debugView()` keep feeding `__onyxDebug.isIdle()` / `snapshot()`.
6. Boss audio bed starts/stops in `main.ts` from `combat.isBoss` / `endCombat` — do not regress.
7. Prefer **zero** `src/game/` edits.
8. Boss internal ids stay frozen; no *Headmaster* / *Echo* player-facing vocabulary.

### Comment-only invariants (restate in implementation)

- `state.events` is index-parallel with `state.log` (`combat-types.ts`); length-diffed in `combat-ui.ts`.
- `COMBAT_WINDOW_OVERLAP_PX = 150` (`combat-scene-math.ts`) is duplicated as a literal in `styles.css` — it is what makes `floorBottomY` keep sprite feet above the FF6 windows.

---

## Port surface (verified)

### Consumers of `combat-scene.ts`

| Consumer | Symbols |
|----------|---------|
| `combat-ui.ts` | `createScene`, `renderScene`, `updateScene`, `playTurn`, `isPlaybackDone`, `absorbDeaths`, `skipPlaybackToEnd`, `setBossIntroNameplate`, type `CombatScene` |
| `main.ts` | `partyPos`, `enemyPos`, `setBarksEnabled`, `getBarksEnabled` |
| `src/vfx-vignette.ts` | `createScene`, `playTurn`, `updateScene`, `renderScene`, `resolveEffectStyle` |
| Tests | `combat-scene.test.ts` and related |

That is **9 functions** (+ types / pos helpers / bark toggles) as the public port surface from the controller’s perspective.

### Hidden API: 13 direct `scene.*` field writes

`CombatController` also writes `scene.*` directly. A `CombatStage` interface **must absorb** them:

| Fields | Sites (illustrative) |
|--------|----------------------|
| `backdrop` / `backdropId` | constructor / setup |
| `playbackRate` / `showFastCue` / `showAutoCue` | FAST / AUTO |
| `state` | sync |
| `banner` | clear / set |
| `activeActorId` | multiple turn phases |
| `cursor` | target selection |

### Frame loop order (load-bearing)

`main.ts`’s rAF renders dungeon only. `CombatController.startRenderLoop()` is the sole combat frame driver. `tick()` order:

1. `updateScene(scene, now)` — nulls `scene.choreo` when elapsed ≥ duration  
2. `isPlaybackDone(scene, now)` — reads that null  
3. paint (`renderScene` today / stage `tick` paint path)

`updateScene` nulling choreo **is** the completion signal. Call update **before** the done-check or completion lands a frame late (and, at `playbackRate: 2`, inconsistently).

### DOM overlay — zero CSS change; sibling canvas

`shell.ts` builds:

```text
#combat-wrap                 position:relative; aspect-ratio:768/672
├─ canvas#combat-canvas      768×672; width/height 100%; pixelated
├─ #combat-popup-anchor      absolute inset 0; pointer-events:none
├─ #combat-turn-order        absolute top/right; z-index:2
└─ #combat-windows           absolute bottom band
```

Overlays are **siblings** of the canvas, not children. Swapping what paints the stage changes nothing about menus — no CSS, z-index, or pointer-events work required for Scopes A–B.

**Do not reuse `#combat-canvas`.** At boot, `shell.ts` runs `combatCanvas.getContext("2d")!`. Canvas context type is sticky: after a successful `"2d"`, `getContext("webgl")` returns `null` forever. `new Phaser.Game({ canvas: combatCanvas })` could never get WebGL.

→ Add sibling `<canvas id="combat-phaser-canvas">` in `#combat-wrap`; promote the shared sizing rule to a class (e.g. `.combat-stage-canvas`); toggle `display` per backend.

### Dynamic import (jsdom + payload)

`vitest.config.ts` is `environment: "jsdom"` with no Phaser-friendly setup. Phaser does not initialize under jsdom. A top-level `import … from "phaser"` in any `src/engine/*.ts` breaks `npm test` as soon as anything under test transitively imports it.

→ `await import("phaser")` inside the Phaser stage’s async create is **load-bearing** for the test suite and keeps title/dungeon off the Phaser payload.

**Rule:** no `.test.ts` file ever imports the Phaser-backed stage module.

### Assets

- Party/enemy strips: exactly **100×100** px/frame → `this.load.spritesheet(key, url, { frameWidth: 100, frameHeight: 100 })` works directly (Phaser derives frame count from width).
- Effects under `public/assets/effects/` are **not** uniform (e.g. fireball 192×16, fire_explosion 336×28, arrow 32×32). Keep per-file frame sizes from `effect-sprite-cache.ts`.
- Paths already use `import.meta.env.BASE_URL` — Phaser loader must use the same prefix (GitHub Pages).
- `sprite-manifest.test.ts` asserts `width === frameWidth * frameCount` against real PNGs — keep it as a free contract test for the Phaser loader.

### Battle transition + teardown

- Swirl uses its own `#battle-transition` canvas, but `leaveCombat` passes the live combat canvas into `snapshotSource()` → `drawImage`. Drawing from a WebGL canvas yields a blank buffer unless the drawing buffer is preserved.
- Phaser config needs `render: { preserveDrawingBuffer: true }` (negligible at 768×672).
- `CombatStage` exposes `snapshotCanvas()` so `main.ts` asks the stage instead of a hard-coded element.
- Today `leaveCombat` only nulls `combatController` — destroy fires from result-confirm / debug exit. With Phaser, a missed path leaks a WebGL context (browsers cap ~16). **`leaveCombat` must call `combatController?.destroy()`**; **`destroy()` must be idempotent**.

---

## `CombatStage` interface

Introduce in `src/engine/combat-stage.ts`. Implement first by the existing canvas scene (pure delegation, zero behavior change), then by Phaser, so `combat-ui.ts` changes exactly once.

```ts
export interface CombatStage {
  // model
  setState(s: CombatState): void;
  absorbDeaths(s: CombatState): void;

  // presentation inputs (replace the 13 direct field writes)
  setActiveActor(id: string | null): void;
  setCursor(c: SceneCursor | null): void;
  setPlaybackRate(rate: number): void;
  setCues(o: { fast: boolean; auto: boolean }): void;
  clearBanner(): void;
  setBossIntroNameplate(name: string, durationMs: number, bossId?: string): void;

  // playback
  playTurn(
    events: CombatEvent[],
    spellNameFor: (id: string) => string,
    techniqueNameFor: (id: string) => string,
    now: number
  ): number;
  isPlaybackDone(now: number): boolean;
  skipPlaybackToEnd(now: number): void;

  // frame + lifecycle
  tick(now: number): void;                    // update + paint
  snapshotCanvas(): HTMLCanvasElement | null; // for battle-transition
  destroy(): void;                            // idempotent
}
```

`playTurn` drops `w`/`h` params — they are always the 768×672 design constants; the stage owns them.

Two consumers that reach through the controller must keep working:

- `main.ts` `groundPlaneProbe` reads `cc.scene.backdropId` / `cc.scene.state`
- playtest scripts may read private `.autoFast`

Keep both reachable; do not rename without an explicit follow-up.

Phaser input config: `input: { keyboard: false, mouse: false, touch: false }` so DOM menus keep keys. `audio: { noAudio: true }` — game audio stays on `engine/audio.ts`.

---

## Phased breakdown

### Phase 0 — split the file (no Phaser). Own PR to `main`

> This is **not** a line-range cut. Line 3117 is where canvas code *starts*, not where pure code *ends* — several pure symbols live below it, and the painter calls upward constantly. Split by **dependency direction**:
>
> `combat-scene.ts` (painter) imports `combat-choreography.ts` (pure), **never the reverse**.

**Move to `combat-choreography.ts`:** lines 1–3116 **plus** pure stragglers from below the seam:

- `enemyStripState`
- `effectFrame`
- `setBossIntroNameplate` (pure despite address; imported by combat-ui)
- `BOSS_PRESENTATION` (shared by nameplate and boss aura)
- HP-pip lit-count math currently inlined in the painter

**Leave in `combat-scene.ts`:** every `draw*` function, `renderScene`, exported canvas-bound `drawFF6Window`. Painter imports `findActor`, `popupOffsetY`, `visualHeadY`, `sampleProjectilePose`, etc.

**Traps:**

1. **`barksEnabled`** — module-global read by `pushBark` (above) and `drawBarks` (below). Must live in the choreography module with the painter importing the getter, or the split silently forks the mute flag into two independent booleans.
2. **`getCombatBg`** — only `new Image()` above the seam. Move into the painter or inject a loader — choreography must end up **DOM-free**.

**Also export** (currently private; second backend needs them):

`PARTY_SIZE` / `ENEMY_SIZE` / `BOSS_SIZE`, `COLORS`, timing table, `POPUP_DURATION`, `ANIM_SPEED` / `EFFECT_ANIM_SPEED`, `popupOffsetY`, plus `EffectStyle` / `Choreography` types that currently leak through public signatures unexported.

**Exit criteria:**

- `npm run build` clean; `npm test` green with **zero test edits**
- Zero behavior change; `vfx-vignette` still renders
- `grep 'from "./combat-scene"' src/engine/combat-choreography.ts` returns **nothing** (no circular import)

This freezes the region being ported before Phaser exists in the repo.

---

### Phase 1 — `CombatStage` + canvas backend

Add the interface; `CanvasCombatStage` delegates to existing functions. Rewrite the 9 calls and 13 field writes in `combat-ui.ts` to go through it.

**Exit:** controller tests green (portable assertions); a real fight is visually identical.

---

### Phase 2 — Phaser boots, one enemy (vertical slice)

`chore(deps): add phaser@4.2.1`. `PhaserCombatStage` behind **`?phaser=1`** (same `URLSearchParams(location.search).has(...)` idiom as existing debug flags).

```ts
const Phaser = await import("phaser");
new Phaser.Game({
  type: Phaser.AUTO,              // WebGL + Canvas fallback (4.x keeps it)
  canvas: phaserCanvasEl,         // sibling — never #combat-canvas
  width: COMBAT_DESIGN_W,
  height: COMBAT_DESIGN_H,        // 768 × 672 from combat-scene-math
  scale: { mode: Phaser.Scale.NONE },
  pixelArt: true,
  render: { preserveDrawingBuffer: true },
  input: { keyboard: false, mouse: false, touch: false },
  audio: { noAudio: true },
});
```

Load one enemy spritesheet at `{ frameWidth: 100, frameHeight: 100 }`, idle at the slot `combat-scene-math` computes. Everything else still canvas if dual-running, or stage paints bg + one sprite.

**Build against `vfx-vignette` first** — standalone rollup entry driving real choreography with no combat/menus/transitions — then wire into a real fight.

**Exit:**

- `?phaser=1` shows one Phaser-rendered enemy idling in a real dungeon fight; DOM menus fully functional
- Re-measure tree-shaken bundle
- **Scale/CSS checks (do not defer):** `resizeGameScale()` puts `transform: scale()` on `#game-wrap`. Confirm (a) Phaser canvas matches `#combat-canvas` on-screen size at non-1.0 game scale, and (b) Phaser is not writing fighting inline width/height styles. If it fights CSS, add `autoCenter: Phaser.Scale.NO_CENTER` and re-assert `.combat-stage-canvas` after boot.

---

### Phase 3 — all actors

Retained-mode mirror of the immediate-mode model: id-keyed sprite pool synced each frame from `partyAnims` / `enemyAnims` / `allyAnims` + corpses.

- Register Phaser anims from strip metadata (`frameRate: strip.fps * ANIM_SPEED`) rather than recomputing frame indices — this is the “easier animation import” payoff
- Party `setFlipX(true)`; enemies/allies unflipped
- Procedural fallbacks as Phaser Graphics (**five**, not two: enemy, party, ally orb, effect, charge — different foot/top anchors, `ART_FOOT_FROM_TOP_FALLBACK` 0.92 vs 0.57)
- `BOSS_SIZE = 400` at existing call sites
- Depth-sort by `footY` every frame

**Exit:** full fight recognizable; `groundPlaneProbe` passes under `?phaser=1`.

---

### Phase 4 — rest of the presentation

Popups (frozen x/y at push) and barks (re-anchored live every frame, suppressed at opacity ≤ 0) — **two different anchoring models; do not unify**. Spell banner, boss nameplate + aura, target cursor + acting marker, FF6 window chrome for the banner, FAST/AUTO cues, effects, particles, light glows (additive), screen shake (camera), poison/burn tints.

**Exit:** the 12-point AGENTS.md combat checklist passes under `?phaser=1`.

---

### Phase 5 — transition, teardown, flip default

- `snapshotCanvas()` wired into `leaveCombat`
- Explicit idempotent `destroy()`; WebGL-context-leak check across victory / flee / wipe / arena-next / `exitDebugCombat`
- Flip default to Phaser; **`?phaser=0`** becomes the rollback

**Exit:** full parity sweep + `npm test` + Playwright `smoke-debug-surface.mjs` and `combat-only-pass-2026-07-28.mjs`.

---

## Timing hazards (all seven)

These are why the shared engine matters — a Phaser-native tween rewrite would get each wrong:

1. **Steps fire in push order, not at `order`.** `impactSteps` returns 3 steps at `t`, `t+80`, `t+450` spliced mid-array. Load-bearing, not incidental.
2. **FAST is asymmetric.** `startMove` divides duration by rate; `pushBark` divides at push. `POPUP_DURATION`, `SceneEffect.duration`, `DEATH_FADE_MS`, particle `maxLife` are **not** rate-scaled. Actor frame index uses **unwarped** `stateAge`. A blanket Phaser `timeScale = 2` would not reproduce this — which is exactly why fixed-`frameRate` Phaser anims are correct.
3. **Enemy/ally death frames** use a different formula: `(stateAge / 675) * frameCount`, ignoring both fps and `ANIM_SPEED`. Special-case as `frameCount / 0.675` fps equivalent.
4. **Steps re-resolve position at fire time** via `findActor`. Pre-computing tweens at build time diverges on rowAdvance, deaths, and multi-hit ordering.
5. **`skipPlaybackToEnd`** fires all remaining steps with one `now` — everything starts simultaneously — then wipes barks.
6. **`drawBarks` gates on `ctx.measureText(...) > 340`** and silently drops. Phaser needs its own text metric or barks vanish with no signal.
7. **RNG is unseeded** (`varyScale`, particle spawners, screen shake). Shared module should take an **injectable RNG**.

---

## Test strategy

| Survives untouched | Rewritten / new fixture |
|--------------------|-------------------------|
| `combat-scene-math.test.ts` (~385) — geometry oracle both backends satisfy | `battle-transition.test.ts` (~205) — snapshot source becomes WebGL-capable |
| `combat-scene.test.ts` (~866) — tests only choreography (lines 1–3116 world) | `combat-ui` tests — assertions portable; getContext/rAF fixture is canvas-shaped → needs a **stage double** |
| `combat-select-action-view.test.ts` (~507), `ff6-window-library.test.ts` (~317) — pure DOM | **new** `combat-stage.test.ts` — interface conformance for both backends |
| `combat-display`, `combat-flow`, `combat-audio`, `combat-action-palette`, `sprite-manifest`, `effect-sprite-wiring` | |

**Net:** ~2,765 lines of tests survive; ~800 need rework. The CombatStage double lets controller tests drop the heavy `getContext` stub.

**Manual / Playwright:** Arena `?phaser=1`, boss nameplate + bed audio, wipe → game over, perk overlay after victory XP, `__onyxDebug.exitDebugCombat`, `isIdle()` during playback vs menu.

### Parity checklist → phase

| AGENTS checklist item | Phase |
|-----------------------|-------|
| Combat starts, FF6 layout, DOM windows | 2–3 |
| Party animates + acting marker | 3–4 |
| Walk → attack → hurt + popup (no Space-gate) | 3–4 (`playTurn` kept) |
| Popup colors / MISS / barks / FAST | 4 |
| Spell banner + burst | 4 |
| Target cursor | 3–4 |
| Strip facing / mirror | 3 |
| Death fade / KO | 3–4 |
| Result window Enter | unchanged DOM |
| Return to dungeon textures | 5 destroy + transition |
| Windows don’t clip sprites | math reused; verify 3–4 |
| Summons + ally cursor | 3 |
| `isChoreographyDone` / idle | unchanged (Phase 1 must not alter) |
| Boss nameplate + bed | 4 + existing `main.ts` audio |

---

## Rollback

1. Dual backend behind **`?phaser=1`**; canvas default until Phase 5; Phaser default after; **`?phaser=0`** escape hatch.
2. Keep the canvas painter rather than deleting it — `src/vfx-vignette.ts` is a separate Vite entry that calls `renderScene` directly, and the painter is the rollback path. Revisit deletion in a later pass.
3. Phase 0 split can stay forever even if Phaser is reverted (pure refactor win).

---

## Explicitly out of scope

- Corridor renderer; town / camp / party-creation / save UI
- Combat rules, perks, techniques, enemy AI
- Native packaging; 3D corridors
- Moving FF6 menus into Phaser (**Scope C**); mobile scale manager
- Renaming boss ids (`headmasters-echo*`); restoring *Headmaster* / *Echo* player-facing vocabulary
- Pixel-perfect recreation of every particle if a simpler Phaser FX reads as good or better — call those out as deliberate substitutions, not silent drops
- Custom Phaser build / physics strip (post–Phase 2 optimization)

---

## Suggested commit sequence

1. `refactor(combat): split choreography engine from canvas painter` — **PR 1 → main**
2. `refactor(combat): export scene constants and choreography types` — **PR 1 → main**
3. `feat(combat): introduce CombatStage with canvas backend` — port branch
4. `chore(deps): add phaser@4.2.1`
5. `feat(combat): phaser stage renders one enemy behind ?phaser=1`
6. `feat(combat): phaser actor pool, anims, facing, fallbacks`
7. `feat(combat): phaser popups, barks, banner, cursor, nameplate`
8. `feat(combat): phaser effects, particles, glows, shake, tints`
9. `fix(combat): stage snapshot for battle transition + idempotent destroy`
10. `feat(combat): default combat stage to phaser`

---

## Verification checklist

- [ ] `npm run build` — zero TS errors (`noUnusedLocals` / `noUnusedParameters` enforced; `verbatimModuleSyntax` → `import type` for type-only Phaser imports)
- [ ] `npm test` — full suite; Phase 0 and 1 green with **zero test edits**
- [ ] `npx vite preview --port 5176 --base /OnyxLabyrinth/` then AGENTS combat checklist **twice**: `?phaser=0` and `?phaser=1`
- [ ] `node scripts/playtests/smoke-debug-surface.mjs` and `combat-only-pass-2026-07-28.mjs`
- [ ] Dungeon regression: fight → flee → corridor textures intact (AGENTS rendering checklist item 5 / combat item 10)
- [ ] WebGL context leak: enter/exit ~20 fights; no context-loss warnings
- [ ] Bundle re-measure at Phase 2 exit (tree-shaken)

---

## Relation to earlier drafts / plan

| Doc | Role after this write |
|-----|------------------------|
| This file | **Authoritative** design for the port |
| `2026-07-29-phaser-combat-renderer-design.md` | Shorter draft; superseded and pruned from the working tree |
| `2026-07-29-phaser-combat-renderer.md` (plan) | May still say `CombatRenderer` / `WEBGL`-preferred / host `div` — **defer rewriting the whole plan**; implementers follow **this** design for `CombatStage`, `Phaser.AUTO`, sibling `#combat-phaser-canvas`, Phase 0 dependency-direction split, and timing hazards |

### Naming note

Prefer **`CombatStage`** (this design) over the earlier draft’s thinner `CombatRenderer { render; destroy }` — the stage absorbs choreography *and* paint lifecycle so the 13 field writes and `playTurn` / tick order stay one API. A canvas adapter and a Phaser adapter both implement `CombatStage`.

---

## Open questions (non-blocking defaults)

1. Dynamic import at first combat vs static — **dynamic** (required for jsdom + payload).
2. Flip default in Phase 5 same effort vs soak week — **flip in Phase 5**.
3. Pixel-perfect FF6 banner vs “reads as FF6” — **reads as FF6**.
