# 3/4 Top-Down Arena Backdrop Renderer — Design Doc

**Goal:** Replace the corridor-rendered combat backdrop with a dedicated arena renderer that draws a 3/4 top-down room matching the reference mockup: dominant receding floor tiles, textured back wall, receding side walls with a visible top rim, and a fade-to-black void above.

**Architecture:** A new `src/engine/arena-renderer.ts` draws floor, side walls, and back wall with perspective-correct per-pixel `ImageData` rasterizers (void fill → floor → back wall → side walls, then one `putImageData`). The renderer is parameterized so the same code can later render alternate arena perspectives. New pure projection math lives in `src/engine/render-math.ts` with unit tests.

**Status note (2026-07-13 review):** Shipped defaults and back-wall method diverge from the first draft of this doc. Prefer the Parameter table and Rendering pipeline sections below (updated to match code). Combat sprites still use a separate projection in `combat-scene.ts` sharing only `ARENA_HORIZON_FRAC` — see `ARENA-REVIEW.md` finding W1.

**Tech Stack:** TypeScript, 2D Canvas, no WebGL, no new dependencies.

---

## Constraints

- Do **not** modify `src/engine/renderer.ts` perspective math, wall-strip raycaster, or `drawFloorCeilingCast`.
- Do **not** change `src/game/combat.ts` or combat logic.
- Do **not** remove fog, vignette, scanlines, or amber edge-glow from the dungeon view.
- Reuse existing per-floor tileset cache (`tilesetCache` in `renderer.ts`).
- Keep `renderBattleArena(state, w, h)` export signature unchanged.
- Keep `ARENA_HORIZON_FRAC` in `renderer.ts` and import it from `combat-scene.ts`.

---

## Camera model

World coordinates:
- `X`: right
- `Y`: depth into the room (away from camera)
- `Z`: up

Camera:
- Position: `(0, 0, H)`
- Pitched down by angle `θ` from horizontal
- Looks along `+Y` into the room

Camera basis vectors:
- Right: `R = (1, 0, 0)`
- Forward/down optical axis: `D = (0, cos θ, -sin θ)`
- Up: `U = (0, sin θ, cos θ)`

For a world point `P = (X, Y, Z)`, vector from camera `V = P - C = (X, Y, Z - H)`.
Project onto camera basis:
- `a = V · R = X`
- `b = V · U = Y·sin θ + (Z - H)·cos θ`
- `c = V · D = Y·cos θ - (Z - H)·sin θ`

Pinhole screen projection (screen `y` increases downward, focal length `f` in px):
- `screenX = w/2 + f · a / c`
- `screenY = h/2 - f · b / c`

Horizon line (floor plane at infinity):
- `horizonY = h/2 - f · tan θ`

We pin the horizon to the shared camera tuple (`ARENA_CAMERA.horizonFrac` in
`arena-camera.ts`):
- `horizonY = h · horizonFrac`

With `horizonFrac = 0.16` (shipped 2026-07-16):
- `f · tan θ = 0.34 · h`

So `f` and `θ` are not independent; once `θ` is chosen,
`f = ((0.5 − horizonFrac) · h) / tan θ` — `buildArenaCamera` in
`arena-camera.ts` is the one implementation of this rearrangement.

### Floor row distance

For a floor point `Z = 0` and a given screen row `y`, let `dy = h/2 - y`. Solving the projection for `Y`:

```
rowDistance(y) = H · (1 + (dy/f) · tan θ) / (tan θ - dy/f)
```

This is the depth into the room for that screen row. For `y > horizonY`, `dy` is negative and the row is below the horizon (closer to camera, smaller distance). For `y < horizonY`, `dy` is positive and the row is above the horizon (farther, larger distance).

### Floor world X per screen pixel

At a given row with distance `d = rowDistance(y)`:

```
worldX(x) = (x - w/2) · (d · cos θ + H · sin θ) / f
```

This is the perspective-correct across-screen mapping for a pitched camera.

---

## Rendering pipeline

`renderArenaRoom(ctx, w, h, opts)` bakes into one opaque `ImageData` buffer, then blits once (`putImageData` replaces pixels — earlier `ctx` draws would be wiped):

1. **Void fill** — fill the buffer with `PALETTE.bg` / `voidColor`.
2. **Floor** — per-pixel floor caster for rows below the horizon (`Y ∈ (0, roomDepth]`).
3. **Back wall** — per-pixel ray-plane caster on plane `Y = roomDepth` (trapezoid; with pitch-down, typically **wider at the top**).
4. **Side walls** — per-pixel ray-plane casters on `X = ±roomWidth/2` (overwrite floor/back edges).

Fog is applied per texel via `arenaOpacityForDepth` while writing (not a separate overlay pass).

All passes use the same camera model so floor, walls, and back wall share a single vanishing point.

### Floor rasterizer

For each screen row `y` from `horizonY` to `h - 1`:
- Compute `d = arenaFloorRowDistance(y, ...)`.
- If `d > maxVisibleDist`, skip (fog/void).
- Compute `worldX_start = worldX(0, d)` and step `ΔworldX = worldX(1, d) - worldX(0, d)`.
- Walk across `x` from `0` to `w - 1`:
  - Determine floor tile `(gx, gy)` from `worldX` and `d`.
  - Pick `floorA` or `floorB` via checkerboard `(gx + gy) % 2`.
  - Sample texel from the tile's `ImageData`.
  - Apply fog blend toward `PALETTE.bg`.
  - Write RGBA to the output buffer.
- `putImageData` once for the floor region.

### Side-wall rasterizer

For each side wall (left at `X = -W/2`, right at `X = +W/2`):
1. Project the four corners with `arenaProject` and take the screen AABB.
2. For each pixel in the AABB, cast the pitched camera ray
   `dir = (dx/f, cosθ+(dy/f)sinθ, −sinθ+(dy/f)cosθ)` and intersect `X = wallX`
   via `t = wallX·f/dx`.
3. Accept hits with `Y ∈ [0, roomDepth]`, `Z ∈ [0, wallHeight]`.
4. Map `(Y, Z)` to wall texel `(u, v)`, fog-blend, write.

Because we solve `(Y, Z)` per pixel, the wall texturing is perspective-correct with no affine seam. The AABB over-covers empty pixels; that is acceptable for a one-time bake.

### Back wall

The back wall at `Y = roomDepth` uses the same ray approach with `t = roomDepth / rayY`, writing into the projected AABB. Void above the wall top remains the initial buffer fill.

---

## New `render-math.ts` functions

Add pure, unit-tested helpers:

```ts
// Camera parameters bundled for the arena renderer.
export interface ArenaCamera {
  camHeight: number;       // H, world units
  pitch: number;           // θ, radians below horizontal
  focalLength: number;     // f, pixels
  horizonY: number;        // h * ARENA_HORIZON_FRAC
}

// Given camera parameters and screen row y, return world depth Y.
export function arenaFloorRowDistance(
  y: number,
  camera: ArenaCamera
): number;

// Given camera parameters, screen row y, and screen column x,
// return the world (X, Y) point on the floor plane Z=0.
export function arenaFloorWorldAt(
  x: number,
  y: number,
  camera: ArenaCamera,
  screenW: number
): { x: number; y: number };

// Project a world point to screen coordinates.
export function arenaProject(
  world: { x: number; y: number; z: number },
  camera: ArenaCamera,
  screenW: number,
  screenH: number
): { x: number; y: number };

// Fog opacity for arena distances. Distances are shorter than corridors,
// so this may use a different falloff than opacityForDepth.
export function arenaOpacityForDepth(d: number): number;
```

### Tests to add in `src/engine/render-math.test.ts`

- `arenaFloorRowDistance` returns `Infinity` at the horizon row.
- `arenaFloorRowDistance` increases as `y` moves above the horizon.
- `arenaFloorWorldAt(w/2, y)` has `worldX = 0` for all rows (center line).
- `arenaProject({x:0, y:0, z:H})` returns screen center `(w/2, h/2)`.
- `arenaProject` of a far floor point approaches the horizon line.
- `arenaOpacityForDepth(0) === 1` and it decreases monotonically.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/engine/arena-renderer.ts` | New renderer: `renderArenaRoom`, helper rasterizers. |
| `src/engine/renderer.ts` | Export `getTilesetForFloor()`; rewrite `renderBattleArena` as thin wrapper. |
| `src/engine/render-math.ts` | Pure arena projection functions + tests. |
| `src/engine/combat-scene.ts` | No structural change; may tune `ARENA_Z_*` / `CAM_HEIGHT` after visual verification. |

---

## Parameters and tuning

**Source of truth: `src/engine/arena-camera.ts` (`ARENA_CAMERA`).** This table
mirrored the code twice and drifted twice; the module now owns the tuple and
`combat-scene-math.ts` derives its seam from it (`arenaSeamFrac`), so the
numbers below are documentation, not a second copy to keep in sync.

Shipped tuple (2026-07-16 stage-rebalance — floor-dominant composition, wall
band ≈ 20% of frame, projected seam ≈ 32%):

| Parameter | Shipped default | Notes |
|-----------|-----------------|-------|
| `horizonFrac` | `0.16` | `ARENA_CAMERA.horizonFrac`; shared with sprite layout via `arenaSeamFrac`. |
| `θ` (pitch) | `33°` | Steeper look-down raises the seam (more floor, less wall). |
| `H` (camera height) | `4.5` grid units | Backdrop camera only. |
| Room width `W` | `12` grid units | `ARENA_CAMERA.roomWidth`. |
| Room depth `D_room` | `18` grid units | Back wall sits here; deeper room pulls the seam toward the horizon. |
| Wall height | `5.5` grid units | Short frieze behind the fight, not a slab. |
| `maxVisibleDist` | `28` grid units | Floor rows beyond this fog out. |

Tuning levers:
- **Floor looks too flat / horizon too low:** increase `θ` (auto-derives larger `f`).
- **Back wall too small / room too deep:** decrease `D_room`.
- **Side walls too steep / not steep enough:** adjust `W` or `H`.
- **Top rim not visible:** increase `H` or decrease wall height.
- **Floor tiles too noisy far away:** tune `arenaOpacityForDepth` fog curve.

---

## Integration

`renderBattleArena(state, w, h)` in `src/engine/renderer.ts` becomes:

```ts
export function renderBattleArena(state, w, h) {
  const tileset = getTilesetForFloor(state.floor.id);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d")!;

  renderArenaRoom(ctx, w, h, {
    tileset,
    // camera params default to ARENA_CAMERA (arena-camera.ts)
  });

  return off;
}
```

No `scanlinePattern = null` is needed because `renderArenaRoom` does not call the corridor `render()` path.

---

## Visual verification checklist

After implementation:
1. `npm run build` passes with 0 TS errors.
2. `npm test` passes (new `render-math` tests + all existing tests).
3. Start Arena combat and screenshot:
   - Floor tiles recede to a single vanishing point.
   - Side walls slope inward toward the back.
   - Top rim of walls is visible.
   - Back wall is textured and sits near the horizon.
   - Area above back wall is black void.
   - Characters stand on the floor, front row larger than back row.
4. Enter dungeon and verify corridor rendering is unchanged.

---

## Open questions

1. Should the side walls use the same `wall` texture as the back wall, or do we need a separate side-wall variant? The existing `f*_wall_256.png` is used for corridor wall strips; it should work for both back and side walls.
2. Should the floor use `floorA`/`floorB` checkerboard or a single repeated floor tile? Use checkerboard to create the visible grid from the mockup.
3. Do we need a separate `arenaOpacityForDepth` curve, or can we reuse `opacityForDepth` with a scaled distance input? Start with a scaled `opacityForDepth`; introduce a dedicated curve only if visual tuning demands it.
