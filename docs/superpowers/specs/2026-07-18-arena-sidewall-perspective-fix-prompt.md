# Handoff prompt: fix flat/frontal side-wall perspective in the combat arena backdrop

Paste everything below this line to the other model.

---

You are working in **OnyxLabyrinth**, a TypeScript + Vite first-person dungeon crawler. It renders a 2D canvas corridor view plus hand-built DOM UI. No WebGL anywhere — everything is Canvas 2D / raw `ImageData` manipulation.

## The bug

The combat screen bakes a "3/4 top-down arena" backdrop (floor + back wall + side walls + void) into an offscreen canvas once per combat encounter, via `renderArenaRoom()` in `src/engine/arena-renderer.ts`. The **side walls** are rendered wrong: they read as a flat, frontal fence/plank texture pasted onto the screen edges, with no sense of receding into depth. Every other surface in the same shot — the floor (checkerboard tiles that visibly recede and narrow toward a vanishing point) and the back wall (visible brick coursing that shrinks correctly with distance) — has correct perspective. Only the side walls look wrong: flat and frontal instead of receding.

A previous pass already fixed a *different*, now-resolved defect in the same function: the side-wall texture used to have a visible diagonal shear (texture columns sheared row-to-row, like a card-shuffle effect). That was caused by a per-row "coursing offset" (`depthTexX`) being summed directly into the horizontal texture-coordinate (`texX`) alongside a per-pixel horizontal term, and was fixed by removing `depthTexX` from that sum. The shear is confirmed gone. **Do not reintroduce that specific bug** (i.e. don't add a term to `texX` that varies by screen row `y` and is simply summed with the per-pixel `x`-based term — that reintroduces diagonal shear). But removing it did not fix the underlying issue: the side walls still don't look like they recede in depth, because the function was never actually projecting per-pixel world coordinates for the side-wall surface — it was faking depth with screen-space interpolation (`lerp`) of height fraction and top-of-wall position between two hand-picked endpoints. That's the real bug to fix now.

## Architecture context

`src/engine/arena-renderer.ts` bakes the whole backdrop into one `ImageData` buffer with these passes, in order:

1. `fillCeilingGradient` — flat gradient above the horizon.
2. `drawFloor` — for each screen row below the horizon, computes the true world-space depth `worldY` via `arenaFloorRowDistance(y, camera, h)` (an exact inverse-projection formula, not an approximation), then for each screen column in that row's silhouette span, linearly interpolates `worldX` across the span and samples the floor texture at `(worldX, worldY)`. This is why the floor perspective already looks correct.
3. `drawBackWall` — for each screen row spanning the back wall's screen-space height, computes the **true per-pixel** `worldZ` (height on the wall) via an inverse ray/plane intersection (`rayY`/`rayZ` derived from the pitched camera ray, intersected with the `Y = roomDepth` plane). Then for each screen column, linearly interpolates `worldX` across the far silhouette span (exact, because that span is a single-depth row) and samples wall texture at `(worldX, worldZ)`. This is why the back wall's brick coursing already shrinks correctly with distance.
4. `drawSideWalls` — **this is the broken one.** It does NOT compute true per-pixel world coordinates for the side wall's surface. Instead, for each screen row `y`, it:
   - Gets the left/right silhouette insets from `roomInsets(y, ...)` (correct, reused from the floor/back-wall silhouette).
   - Computes `tFloor`, a 0→1 blend factor based on how far `y` is past the horizon.
   - **Fakes** the wall's height and top edge by `lerp`-ing hand-tuned endpoints (`heightFrac = lerp(1, 0.78, tFloor)`, `topAtY = lerp(wallTopY, h * 0.48, tFloor * 0.85)`) instead of solving for the actual world-space intersection of the camera ray with the side wall's vertical plane (`X = ±roomWidth/2`).
   - Samples the wall texture using a `texX` that is purely a function of on-screen pixel distance from the strip's inner edge (`Math.abs(x - refX) * 2`), which has no relationship to true world depth along the wall at all.

Because none of this is derived from an actual world-space projection of the `X = ±halfW` vertical plane, the wall never visually "turns away" from the camera the way the floor and back wall do — it just sits there as a flat texture band whose height happens to taper a bit via the hand-tuned lerps. That reads as frontal/flat, not receding.

## The projection primitives already available (use these — don't invent new ones)

`src/engine/render-math.ts` exports the pure projection math (already unit tested, DOM-free):

```ts
export interface ArenaCamera {
  camHeight: number;   // camera height above floor, world units
  pitch: number;       // pitch down from horizontal, radians
  focalLength: number; // pixels
  horizonY: number;    // screen y of horizon
}

// world -> screen
export function arenaProject(
  world: { x: number; y: number; z: number },
  camera: ArenaCamera,
  screenW: number,
  screenH: number
): { x: number; y: number } {
  const halfH = screenH / 2;
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const a = world.x;
  const b = world.y * sinPitch + (world.z - camera.camHeight) * cosPitch;
  const c = world.y * cosPitch - (world.z - camera.camHeight) * sinPitch;
  if (Math.abs(c) < 1e-9) return { x: screenW / 2, y: halfH };
  return {
    x: screenW / 2 + (camera.focalLength * a) / c,
    y: halfH - (camera.focalLength * b) / c,
  };
}
```

`arena-camera.ts` provides `ARENA_CAMERA` (roomWidth 12, roomDepth 18, wallHeight 5.5, camHeight 4.5, pitch 33°, horizonFrac 0.16, maxVisibleDist 28) and `buildArenaCamera(h, params)` which builds an `ArenaCamera` for a given canvas height.

## What to implement

Replace the body of `drawSideWalls` (currently lines ~419–486 of `src/engine/arena-renderer.ts`) so that, for every screen pixel it paints, it derives the **true world-space `(worldY, worldZ)` point on the vertical plane `X = ±halfW`** that projects to that pixel, then samples the wall texture from that true `(worldY, worldZ)` — exactly the same rigor `drawBackWall` already applies to its own plane, just solved for the other plane orientation.

### Closed-form inverse projection for a side wall (X fixed)

`arenaProject` computes, given world `(x, y, z)`:

```
a = x
b = y·sinP + (z − camH)·cosP
c = y·cosP − (z − camH)·sinP
screenX = W/2 + f·a/c
screenY = H/2 − f·b/c
```

For a side wall, `x = ±halfW` is fixed and known per-strip (left strip vs. right strip). Given a screen pixel `(x, y)`, first recover `c` and `b`:

```
c = f·a / (screenX − W/2)      // a = ±halfW, known
b = (H/2 − screenY) · c / f
```

Then solve for `(worldY, worldZ)` in:

```
b = worldY·sinP + (worldZ − camH)·cosP
c = worldY·cosP − (worldZ − camH)·sinP
```

This is a 2×2 linear system; the matrix `[[sinP, cosP], [cosP, −sinP]]` is involutory (its own inverse, since its determinant is exactly −1), which gives the closed form:

```
worldY = sinP·b + cosP·c
worldZ = camH + cosP·b − sinP·c
```

This is offered as a derivation, not gospel — work it out carefully yourself and verify it numerically (e.g. round-trip: project a known `(halfW, someY, someZ)`, recover `(worldY, worldZ)` from the resulting screen pixel via your formula, and confirm you get back the original `someY`/`someZ` to floating-point precision) before trusting it — don't take the algebra on faith. A quick sanity check via a small unit test (there's precedent for this: see `render-math.test.ts`, which already unit-tests `arenaFloorRowDistance`/`arenaProject`/etc.) is strongly recommended, and importing/reusing `arenaProject` itself for the round-trip check avoids re-deriving the forward direction by hand.

Once you have true per-pixel `(worldY, worldZ)`:
- Reject pixels where `worldY` falls outside `[floorNearDepth-ish lower bound, roomDepth]` or `worldZ` falls outside `[0, wallHeight]` — those pixels aren't actually on the wall's finite rectangle, they're beyond its edges (mirrors how `drawBackWall` guards `worldZ < 0 || worldZ > params.wallHeight`).
- Use `worldZ` to compute `texY` exactly as `drawBackWall` does (`texY = clamp(floor((1 - worldZ/wallHeight) * texSize))`).
- Use `worldY` (true depth along the wall) to compute `texX` — e.g. `texX = floor((worldY / someCoursingScale) * texSize) % texSize`, analogous to how `drawBackWall` derives its `texX` from `worldX`. This is what makes brick/plank coursing on the side wall visibly shrink/compress as it recedes toward the back of the room, instead of being a fixed on-screen pixel cadence.
- Determine which screen pixels belong to "the side wall" at all (as opposed to floor, void, or back wall) using the existing `roomInsets` silhouette (`x < left` for the left wall, `x > right` for the right wall) combined with a vertical range check (reject pixels above the wall's projected top edge or below its projected foot edge, both computable via `arenaProject({x: ±halfW, y: worldY, z: 0 or wallHeight}, camera, w, h)` at the relevant `worldY`, or more simply by validating the recovered `worldZ` is in `[0, wallHeight]` and recovered `worldY` is in-range as described above — invalid recovered coordinates naturally fall outside those ranges near the wall's edges).
- Keep fog/shading behavior reasonable — the current code deliberately disables depth fog on side walls (`fog = 1`) with a comment explaining it's to avoid crushing them to black gutters, and brightens by `shade = 0.95 + 0.35 * (worldZ / wallHeight)`. You can keep that approach (now driven by true `worldZ`) or tune it, but don't let the wall crush to black — that was a deliberate prior fix, documented in the comment right above `fog = 1`.

### What must NOT change

- `src/engine/renderer.ts` (the dungeon corridor raycaster) — completely out of scope, don't touch it.
- `drawFloor` and `drawBackWall` in `arena-renderer.ts` — already correct, don't modify unless you find they share a helper you're refactoring (fine to extract shared inverse-projection helpers, not fine to change their visible output).
- The public signature of `renderArenaRoom` / `ArenaRenderOptions` — other modules depend on it (`renderer.ts`'s `renderBattleArena`).
- `ARENA_CAMERA` tuning values in `arena-camera.ts` — don't retune the camera to paper over the math bug.

## Verification (required, not optional)

This project's `AGENTS.md` flags renderer code as the most fragile in the repo and requires visual verification after any change, not just type-checking:

1. `npm run build` must complete with **zero** TypeScript errors (`tsc` is the type-check gate: `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` are enforced).
2. `npm test` (vitest) must still pass in full — currently 959 tests across 43 files, all passing before this change.
3. Visually verify by actually running the game: `npx vite preview --port <any> --base /OnyxLabyrinth/`, open the title screen, navigate to **Arena** (down, down, Enter from the title menu) and confirm via screenshot that the side walls now visibly recede — texture coursing should compress and the wall should read as turning away into depth, matching how the floor tiles and back wall brick courses already recede in the same shot. Compare against `playtest-screenshots/2026-07-18-arena-sidewall-shear-fix/after-fixed.png` in this repo, which shows the *shear* fix (still flat/frontal) so you can see exactly what "not yet fixed" looks like.
4. Save new before/after screenshots (full-frame and a cropped/zoomed close-up of one side wall, nearest-neighbor upscaled so pixel art isn't blurred) into a new `playtest-screenshots/<date>-arena-sidewall-true-perspective/` directory.

## Deliverable

A patch to `src/engine/arena-renderer.ts` (and, if you add tests, `render-math.test.ts` or a new `arena-renderer.test.ts`) that makes the side walls use genuine per-pixel world-space projection, verified per the steps above, with before/after screenshots saved to the repo.
