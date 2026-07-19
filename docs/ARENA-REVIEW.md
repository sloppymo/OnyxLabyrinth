# Arena Backdrop Renderer — Architecture & Code Review

**Reviewed:** 2026-07-13  
**Scope:** `arena-renderer.ts`, arena math in `render-math.ts` (+ tests), `renderBattleArena` wrapper, combat sprite projection, design doc  
**Verdict:** No blockers. Projection math and pitched-camera raycasting are algebraically correct. Highest real risk is the **intentional dual-camera** between backdrop and sprites, plus **design-doc drift** from the shipped code.

> Note: The review prompt described an earlier snapshot (flat `drawImage` back wall, unused `xSign`, `arenaFloorRowDistanceForWorldY` in `arena-renderer.ts`). The live code already evolved past that — findings below are against **current** sources.
>
> **Related docs:** [`docs/AGENT-READING-LIST.md`](docs/AGENT-READING-LIST.md) · design doc synced in `docs/superpowers/specs/2026-07-14-arena-renderer-design.md`.

---

## Summary table (by severity)

| Severity | ID | Finding | Status |
|----------|-----|---------|--------|
| blocker | — | *(none)* | — |
| warning | W1 | Backdrop `ArenaCamera` and combat `projectArenaPos` are unrelated models; sprites do not geometrically stand on the baked floor | **partially addressed 2026-07-16** — the ground-plane contract's seam now DERIVES from the camera (`arenaSeamFrac` in `arena-camera.ts`), so a camera retune can no longer strand sprite feet on the wall; slots remain screen-space (full geometric unification still open) |
| warning | W2 | Design doc disagreed with implementation on pipeline, back wall, params, pitch | **doc patched** |
| warning | W3 | Side-wall bbox walk over-covers ~400k px/wall; fine for one-time bake, fragile if per-frame | open (accept) |
| warning | W4 | Horizon / void color sync between `DEFAULTS` and `ARENA_HORIZON_FRAC` / `PALETTE.bg` is comment-enforced only | **horizon half closed 2026-07-16** — single-sourced in `arena-camera.ts` (`ARENA_HORIZON_FRAC` removed from renderer.ts; tests import the tuple). Void color remains an explicit `PALETTE.bg` argument at the bake call site |
| nit | N1 | Stale comment in `combat-scene.ts` still said “baked corridor backdrop” | **fixed** |
| nit | N2 | `getWallData` re-`getImageData`s every bake; acceptable once-per-combat | open (accept) |
| nit | N3 | No rasterizer smoke/integration tests (math-only coverage) | open |
| nit | N4 | `arenaFloorScreenYForDepth` is tested but unused by the rasterizers | open (accept) |
| nit | N5 | Arena unit tests used pitch 35° only; production is 30° | **test added** |
| praise | P1 | Pitched-camera floor / wall / project math round-trips cleanly | — |
| praise | P2 | Arena isolated from corridor `render()` — no scanline-pattern invalidation needed | — |
| praise | P3 | Single opaque `ImageData` bake + far-to-near overwrite order | — |
| praise | P4 | Inverse + round-trip tests in `render-math.test.ts` | — |
| praise | P5 | Fog midtone lift keeps d≈18 readable (~0.30 opacity) | — |

---

## 1. Projection math correctness

### Algebra check (praise / correct)

Camera at `(0,0,H)`, look basis:

- `R = (1,0,0)`, `D = (0, cos θ, -sin θ)`, `U = (0, sin θ, cos θ)`
- `V = (X, Y, Z−H)` → `a=X`, `b=V·U`, `c=V·D`
- `screenX = w/2 + f·a/c`, `screenY = h/2 − f·b/c`

**Floor row distance** from `Z=0` with `dy = h/2 − y`:

\[
Y = H\frac{1 + (dy/f)\tanθ}{\tanθ - dy/f}
\]

matches `arenaFloorRowDistance` (`render-math.ts` ~441–453). Verified numerically: depths `{1,2.5,5,9,18}` recover with error &lt; 1e-13.

**`arenaFloorWorldAt`** uses \(X = dx · (d\cosθ + H\sinθ) / f\), which is exactly `c` on the floor plane — consistent with `arenaProject` inverse (also covered by tests ~640–652).

**`arenaProject`** matches the design basis and the optical-axis / far-floor tests.

**`buildArenaCamera`**: `f = (0.5 − horizonFrac)·h / tanθ` is the correct rearrangement of `horizonY = h/2 − f·tanθ`. With `horizonFrac=0.30`, `θ=30°`, `h=672` → `f≈232.79`, horizon at `y=201.6`.

**`arenaFloorScreenYForDepth`** (`render-math.ts` ~513–524) is the correct inverse; tested against both `arenaFloorRowDistance` and `arenaProject`.

### Edge cases

| Case | Behavior | Severity |
|------|----------|----------|
| `\|denom\| &lt; 1e-9` in row distance | returns `Infinity` | praise |
| Rows above horizon | negative depth; floor loop skips `d ≤ 0` | praise |
| `\|c\| &lt; 1e-9` in `arenaProject` | clamps to screen center | nit (rare) |
| `dx ≈ 0` on side walls | skipped (`t` undefined) | correct — center ray never hits `X=±halfW` |

**Finding P1:** Math is sound. No fix required.

---

## 2. Rasterizer correctness and performance

### Floor (`drawFloor`, `arena-renderer.ts` ~278–323)

- Across-screen step `depthScale = d·cosθ + H·sinθ` matches `arenaFloorWorldAt`.
- Culls to `|worldX| ≤ halfW` and `d ≤ roomDepth` / `maxVisibleDist`.
- Uses `Math.floor` + bit parity for checkerboard — correct for negative `worldX` (unlike corridor `| 0` truncation).

### Side walls (`drawSideWalls`, ~325–409)

Unnormalized ray through `(x,y)`:

```
dir = (dx/f) R + (dy/f) U + D
    = (dx/f, cos+(dy/f)sin, −sin+(dy/f)cos)
```

Intersection with plane `X = wallX`: `t = wallX·f/dx`, then `Y=t·rayY`, `Z=H+t·rayZ`. **Matches the camera model.** (The review prompt’s minus-signed ray coeffs were wrong relative to this codebase.)

Texture: `u` tiles every `wallHeight` units of depth, `v` from world `Z` top-down. Consistent with back wall’s horizontal tiling rule.

### Draw order / z-order

```
fill void → floor → back wall → side walls
```

Far surfaces first; nearer walls overwrite shared edges. **No ImageData z-fighting** — last write wins, intentionally.

Floor includes `worldX === ±halfW`; side walls also write those columns → walls win at the join. Acceptable.

### Performance (W3)

Rough bbox for each side wall on 768×672 with default room: **~398k pixels**/wall. Pure-JS timing of the inner ray math ≈ **~10 ms** for both walls on a desktop Node run. Fine for **once-per-combat** bake.

**Risk:** if this path is ever called every frame, it becomes a problem. Document as bake-only (already implied by `renderBattleArena`).

### `getWallData` (N2)

Calls `getImageData` on `repeatedWall` every bake. Once per combat — OK. Optional: attach cached `ImageData` on the tileset object.

---

## 3. Back wall rendering

Live code: **perspective-correct per-pixel raycast** into the `ImageData` buffer (`drawBackWall`, ~209–276), plane `Y = roomDepth`.

### Geometry

Back wall corners project to a **trapezoid that is wider at the top** (~162 px vs ~138 px bottom at defaults). That is correct for a pitched-down camera (smaller `c` at higher `Z` → larger scale). The design doc’s intuition of “wider at bottom” and flat `drawImage` band is outdated.

### Inverse helper

`arenaFloorScreenYForDepth` is the inverse; no separate `arenaFloorRowDistanceForWorldY` remains in `arena-renderer.ts`.

**Finding P3 / W2:** Implementation is better than the design doc’s sketched back wall; docs must catch up.

---

## 4. Sprite / floor alignment (W1 — highest product risk)

| System | Model |
|--------|--------|
| Backdrop | `ArenaCamera`: `H=2.5`, `θ=30°`, `f≈0.2·h/tanθ`, world `(X,Y=depth,Z=up)` |
| Sprites | Separate: `CAM_HEIGHT=0.85`, `ARENA_FOCAL=150`, `scale=f/z`, world `z` = “depth” |

They share **only** `ARENA_HORIZON_FRAC`. Comments in `combat-scene.ts` ~75–77 already admit this.

Empirical mismatch: sprite “front” `z=1.3` → screenY ≈ **277**. The true arena floor at world depth `1.3` projects to screenY ≈ **484**. Sprites sit near depths ~**8–10** in the baked room’s screen space, by coincidence of tuning — not by shared math.

**If you change** pitch, camHeight, roomDepth, or horizon without retuning `ARENA_Z_*` / `CAM_HEIGHT` / `ARENA_FOCAL`, characters will float or sink.

**Unifying with `arenaProject`:** doable — place feet at `{x, y:depth, z:0}` and size by `∂screen/∂world` — but it **will move every combat actor** and needs a layout pass. Not a silent fix.

**Recommended (not done in this pass):** keep dual systems for now; treat W1 as a known hazard; any arena camera retune must include sprite screenshot checks.

> **Addendum 2026-07-16 (stage-rebalance layout pass):** the retune this section
> warned about happened, with the recommended screenshot checks
> (`playtest-screenshots/2026-07-16-stage-rebalance/`). The camera tuple moved
> to `arena-camera.ts` (pitch 33°, wall 5.5, depth 18, horizon 0.16) and the
> sprite contract's `seamY` is now computed from it via `arenaSeamFrac()` —
> the "characters float or sink after a retune" failure mode is structurally
> gone. Note the sprite model described above (CAM_HEIGHT/ARENA_FOCAL) predates
> the ground-plane contract in `combat-scene-math.ts`; slots are screen-space
> `footYFrac` values today. Full geometric unification (slots as world
> positions through `arenaProject`) remains open.

---

## 5. Fog and visual quality

`arenaOpacityForDepth`: `0.88^d` + midtone lift `0.22`.

| d | opacity |
|---|---------|
| 0 | 1.00 |
| 5 | 0.63 |
| 10 | 0.44 |
| 18 | **0.30** |
| 28 | 0.24 |

Far floor is readable; the prompt’s “≈0.099” ignored the lift term. **P5.**

Walls fog by `worldY` (constant along a vertical column of the back wall; varying along side walls). Reasonable.

Floor/wall join: overwrite order + shared `|X|=halfW` and `Y=roomDepth` should avoid a one-pixel void under normal params. Subpixel gaps are possible at extreme aspect ratios — verify visually after retunes.

---

## 6. Code quality and maintainability

| Item | Notes |
|------|-------|
| Structure | Clear: camera build → buffer fill → floor → back → sides → blit |
| Types | Clean; no `any` |
| `_w` / `xSign` | **Gone** in current file (prompt stale) |
| Magic numbers | `DEFAULTS` in `arena-renderer.ts`; fog knobs in `MATH_CONFIG` — good split |
| Design doc | **Out of date** on params and pipeline (W2) |

### W2 — design doc vs code (concrete)

| Topic | Design doc | Implementation |
|-------|------------|----------------|
| Pitch | 35° | **30°** |
| Room W×D | 7×9 | **10×18** |
| Wall height | 1.0 | **5** |
| Back wall | flat `drawImage` at `Y=0` | raycast trapezoid at **`Y=roomDepth`** |
| Draw order | void → back → sides → floor | void → **floor → back → sides** |
| Side walls | edge-lerp + solve | bbox + ray-plane (correct) |

---

## 7. Test coverage

**Present (good):** horizon Infinity; above-horizon negative depth; deeper rows closer; center/left/right worldX; optical-axis project; far floor → horizon; fog bounds/monotonicity; inverse round-trips; `arenaFloorWorldAt` ↔ `arenaProject`.

**Gaps (N3 / N5):**

- No canvas smoke test for `drawFloor` / walls (hard in Vitest without canvas — optional Playwright or node-canvas later).
- Unit camera uses **35°**; production bake uses **30°** — math is the same form, but a default-params fixture would catch config mistakes.
- No assertion that `horizonFrac` used by `renderBattleArena` equals `ARENA_HORIZON_FRAC` (constant wiring test).

---

## 8. Integration safety

| Check | Result |
|-------|--------|
| Touches corridor `render()` / floor caster / animator? | **No** for `renderBattleArena` |
| Signature `(state, w, h) => HTMLCanvasElement`? | **Yes** |
| Scanline nulling? | Only in legacy `renderCorridorBackdrop` (still exported / debug-imported); **not** required for arena bake — correct |
| Exports `PALETTE`, `LoadedTileset`, `getTilesetForFloor`? | Thin / appropriate |
| `main.ts` combat bake | uses `renderBattleArena` |
| Corridor path regression risk | Low — arena is isolated |

**N1:** `renderScene` comment still describes corridor backdrop preference — should mention arena bake.

---

## Recommended fixes (this review pass)

1. **No math blockers** — leave projection/rasterizers alone.
2. Fix stale combat-scene backdrop comment (**N1**) — done.
3. Add a production-defaults round-trip test (**N5**) — done.
4. Patch design doc to match shipped architecture (**W2**) — done.
5. **Do not** auto-unify sprite projection (**W1**) without an explicit layout/visual task.

---

## What was *not* wrong (prompt corrections)

- Side-wall ray signs in the live code are **correct**; the prompt’s minus form was not.
- Back wall is **not** a naive `drawImage` band anymore.
- `xSign` dead field is **already removed**.
- `buildArenaCamera` no longer takes an unused `_w`.
- Fog at room depth is **~0.30**, not ~0.10.
