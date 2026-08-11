# Maze Renderer 2

Maze Renderer 2 replaces maze picture-making with batched Three.js/WebGL2
geometry. Three is a graphics dependency only: `GameState`, `FloorDef`, the
edge grid, movement, collision, encounters, saves, and tools remain
authoritative and do not query the Three scene.

## Backend boundary and selection

`src/engine/maze-renderer/types.ts` defines the graphics-only `MazeRenderer`
contract. `CanvasMazeRenderer` retains the CPU raycaster as a fallback and
comparison backend. `WebGLMazeRenderer` is the production default.

- `?mazeRenderer=webgl` explicitly selects WebGL2.
- `?mazeRenderer=canvas` explicitly selects the legacy Canvas backend.
- A failed WebGL2 initialization reports the reason and falls back to Canvas.
- Three is dynamically imported in its own Vite chunk. Phaser and all existing
  dependencies remain installed and unchanged in responsibility.

The shell owns separate Canvas and WebGL surfaces with identical intrinsic
sizes. Maze DPR is explicitly 1; high browser DPR does not silently multiply
fragment work while the DOM UI remains independently crisp.

## Data flow and scene organization

```text
GameState / FloorDef
  -> resolved cell volumes and themes
  -> pure boundary-span and geometry compiler
  -> static BufferGeometry batches
  -> WebGL scene and pixels
```

The scene contains flat groups for static floor geometry, wall features, and
billboards. There is no cell-per-Object3D tree.

- Static: floor, ceiling, wall and door batches, grouped by 32x32 spatial
  chunk, surface and material.
- Separate visual objects: doors/features requiring distinct art, wall decals,
  NPCs, map decor, feature props, hanging ceiling sprites and additive glows.
- Per-frame work: interpolate the shared legacy camera, update the camera
  transform, orient billboard quads, update stateful visibility/fog, submit.
- Floor geometry is compiled and uploaded after a floor change, never each
  frame.

The 32x32 chunk size was selected after measuring the initial 8x8 and 16x16
compilers. Current floors are only about 30 cells wide and a few thousand
triangles, so reducing regional-theme batch duplication wins more than
fine-grained culling. Larger future floors still split spatially.

## Coordinate system and camera

Game `x` maps to Three world `X`, game `y` maps to world `Z`, and authored
height maps to world `Y`. Cell centers are `(x + 0.5, y + 0.5)` in the
horizontal plane. Camera eye height is:

```text
resolved floorZ * LEGACY_VERTICAL_UNIT + LEGACY_VERTICAL_UNIT / 2
```

The established raycaster uses a 60-degree horizontal FOV. Renderer 2 converts
that to a vertical `PerspectiveCamera` FOV for the current maze aspect:

```text
verticalFov = 2 * atan(tan(horizontalFov / 2) / aspect)
```

At the standard 8:7 maze surface this is approximately 53.6 degrees. Movement
and turn interpolation reuse `RenderCameraAnimator`, so the renderer does not
create a second movement model.

The old wall projection multiplies screen height by `0.62 * 0.85`. The
calibrated `LEGACY_VERTICAL_UNIT` derives the equivalent world height from that
projection and the horizontal FOV; it is approximately `0.5324`. Authoring
still uses intuitive height units: 1 is a legacy corridor, 2 a tall room and 3
a grand room.

## Geometry compiler

`maze-geometry-compiler.ts` emits indexed position/normal/UV arrays. One batch
contains many cells; ordinary floors do not create one Mesh per cell. Horizontal
floor and ceiling planes are real GPU geometry. Wall and door faces are vertical
quads. The depth buffer replaces DDA visibility and CPU wall-strip painting.

Wall V coordinates remain in authored height units. A wall from 0 to 3 uses
UV V 0 to 3, so its texture repeats three times rather than stretching.

Doors occupy at most the first legacy unit above the local floor. A tall room
therefore retains a normal-size door with wall structure above it. Singular
hero-door material keys resolve through the existing prepared door cache and
retain engine-rendered lettering.

## Variable-height cells

Every traversable cell resolves to:

```ts
interface CellVolume {
  floorZ: number;
  ceilingZ: number;
}
```

Missing authoring data resolves to `0 -> 1`. Optional `FloorDef.heightZones`
and `FloorMapJSON.heightZones` are inclusive rectangles. Later zones win per
supplied field, matching tileset-zone precedence.

For an open edge, the portal is the overlap of the adjacent air volumes:

```text
max(floorA, floorB) -> min(ceilingA, ceilingB)
```

The pure boundary compiler emits lower and upper closure spans outside that
overlap. A 0->1 corridor opening into a 0->3 chamber therefore stays open from
0->1 and receives a real 1->3 upper wall face on the tall side. Closed edges
emit a full span for each visible side. Unit tests cover equal volumes, tall
transitions, floor steps, non-overlap, boundaries, UV repetition and regional
materials.

Validation enforces finite values, `floorZ < ceilingZ`, at least 0.25 clearance,
bounds from -8 through 16, in-bounds zones and overlapping air on traversable
edges. The renderer supports floorZ geometrically, but traversable neighboring
floorZ differences are rejected until explicit stair/ramp movement semantics
exist.

Height zones round-trip through parse, FloorDef conversion, export/check and
ASCII dump. The floor editor preserves imported zones and clamps them when a
map is resized; height painting is currently JSON-authored.

## Materials and pixel-art assets

Renderer 2 reuses the Canvas renderer's prepared tileset canvases. That keeps
the existing brightness and contrast preparation as one source of truth.
Shared `CanvasTexture` objects use nearest magnification, nearest mip levels,
repeat wrapping for architectural surfaces, sRGB color space and anisotropy 1.
No PBR, normal maps, shadows, environment maps or shadow lights are used.

Binary-alpha art uses alpha testing with depth write. This covers hero doors,
wall features and their text, NPCs, map props, feature props and hanging
sprites without general transparent painter sorting. The authored
`foreground` map-sprite semantic becomes a small physical camera-facing depth
offset. Isobel's backdrop is wall geometry, Isobel is a billboard, and the two
counter layers sit physically closer to the camera, so the depth buffer creates
the approved backdrop -> Isobel -> apron ordering.

Ceiling features replace the actual ceiling material at resolved ceilingZ.
Hanging sprites set their top anchor from resolved ceilingZ. Cheap bounded
local glow uses an additive halo plane; there are no dynamic lights or shadow
maps. Existing DOM/CSS CRT presentation remains outside the WebGL scene.

## Fog and presentation

The scene uses inexpensive unlit materials and GPU exponential fog against the
established near-black dungeon background. Darkness increases fog density.
The camera and renderer use the full current maze surface at DPR 1. A lower
fixed logical framebuffer was evaluated as optional style/headroom, but was not
selected: full current resolution already has ample submission headroom and
preserves the approved special-room detail. Low resolution is therefore not
hiding renderer cost.

## Performance and diagnostics

`?mazePerf=1` enables a bounded profiler and an on-screen HUD with FPS, median
and p95 CPU render time, draw calls, triangles, textures, geometries, chunks,
batches and visible dynamic sprites. The debug API exposes the same renderer
statistics. Profiling is dormant in normal play and allocates no frame samples.

The reproducible harness is `npm run benchmark:maze`. It warms each pose,
records render sections and frame pacing, captures every scene, reports heap
movement and identifies the browser GPU. It covers ordinary corridor poses,
Isobel, Camp coordinate, Hot Boi's, Namanda, darkness, walking and combat
return. Hardware-dependent FPS is not a CI assertion.

The recorded local browser is headless Chromium 140 at 1280x800, maze surface
744x651, DPR 1, using ANGLE SwiftShader. These results demonstrate structural
and CPU-submission behavior, not integrated-GPU FPS. Representative final
measurements are stored under the ignored
`playtest-screenshots/maze-renderer-2/benchmark/` directory:

| Scene | Canvas median | Canvas p95 | WebGL median | WebGL p95 |
|---|---:|---:|---:|---:|
| Floor 1 straight | 1.5 ms | 2.0 ms | 1.1 ms | 1.6 ms |
| Side passage | 2.0 ms | 2.2 ms | 1.0 ms | 1.2 ms |
| Front wall | 1.5 ms | 1.9 ms | 0.8 ms | 0.9 ms |
| Door | 2.4 ms | 3.1 ms | 0.9 ms | 1.1 ms |
| Isobel hero | 2.1 ms | 2.8 ms | 0.7 ms | 1.0 ms |
| Isobel walking | 3.4 ms | 29.3 ms | 1.2 ms | 1.5 ms |
| Combat return | 2.1 ms | 2.6 ms | 1.0 ms | 1.2 ms |

The most important result is removal of the CPU walking hitch: the WebGL path
does no per-pixel JavaScript floor cast, `ImageData` rewrite, `putImageData`, or
per-column DDA rendering. Current Floor 1 compiles to one chunk, a few dozen
static batches and only a few thousand visible triangles; draw calls vary with view
and authored separate alpha assets.

## QA fixtures and lifecycle

- `npm run playtest:maze-heights` creates a dev-only portable 1x -> 2x -> 3x
  test floor in localStorage and captures both transition directions. It also
  verifies the high ceiling feature and hanging-chain anchor.
- `npm run playtest:maze-lifecycle` warms Floors 1 and 2, then repeats
  `1 -> 2 -> 1` ten times. Geometry and texture counts must return exactly to
  the warmed Floor 1 baseline.
- `npm run playtest:hubs` exercises Camp UI, Namanda, Hot Boi's and Isobel.
- `?mazeRenderer=canvas` provides direct comparison and emergency fallback.

Floor-specific BufferGeometry is explicitly disposed. Prepared textures and
materials are retained as a bounded reusable cache for the session and disposed
with the renderer. Context loss pauses rendering without throwing; normal
browser restoration resumes the scene. Initialization failure selects Canvas.

## Known limitations and future geometry

- Height-zone painting has no editor brush yet; import/export/resize are safe.
- Authored floor elevation transitions are intentionally validation errors.
- Doors remain the current static gameplay presentation; no animation was
  invented.
- The main game loop continues rendering subtle animated presentation rather
  than using a full idle dirty-frame scheduler.
- GPU timer queries are not enabled; CPU submission and renderer statistics are
  sufficient for the current structural contract.
- The dynamically split Three chunk is approximately 529 kB minified / 134 kB
  gzip and triggers the existing Vite 500 kB advisory. It does not join the
  main application chunk.

The resolved-volume and general vertical-span model can later express real
stairs, ramps, raised or sunken rooms, low walls, windows, arches, portcullises,
columns, bridges and multi-height chambers. Those authoring and gameplay
semantics are deliberately deferred; adding them does not require gameplay to
derive state from Three.
