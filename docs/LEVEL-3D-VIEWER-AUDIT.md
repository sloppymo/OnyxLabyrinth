# Canonical 3D level viewer audit

This note records the source-of-truth audit performed before implementing the
development level viewer. It is intentionally about the checked-out
repository, not a parallel level authoring format.

## Canonical inputs

- Runtime floors are resolved by `src/game/floor-registry.ts`. It merges the
  hand-authored campaign definitions in `src/data/floors.ts` (Floors 2 and 3)
  with the JSON floor packs in `src/content/floors/` (Floors 1, 4, and 5).
  The JSON packs are validated and converted through
  `src/game/floor-map.ts`; the viewer uses `getFloors()`/`findFloor()` so
  it sees the same merged floor list as the game.
- `src/types/index.ts` defines the cell contract: `grid[y][x]`, four
  directional edges (`open`, `wall`, `door`, `locked`, `barred`), optional
  `void`/`noCeiling`, and a `TileFeature` overlay.
- `src/game/dungeon.ts` is the edge/carving helper source. Gameplay traversal
  is resolved by `src/game/traversal.ts`; it checks both sides of an edge,
  void cells, water/raft rules, and the shared
  `surfacesConnectAcrossEdge()` height contract.

## Canonical 3D geometry

The existing WebGL maze backend is the reusable geometry source:

- `src/engine/maze-renderer/geometry/cell-volume.ts` resolves overlapping
  `heightZones` and defines the legacy vertical unit.
- `src/engine/maze-renderer/geometry/floor-surface.ts` resolves flat, ramp,
  and stair surfaces, interpolates their heights, and checks endpoint and
  side-entry connectivity.
- `src/engine/maze-renderer/geometry/boundary-spans.ts` computes the exposed
  lower/upper/full vertical closures at unequal-height boundaries.
- `src/engine/maze-renderer/webgl/maze-geometry-compiler.ts` is the canonical
  mesh compiler. It omits void cells, omits equal-height internal walls at
  ordinary openings, retains the appropriate closures at height changes,
  emits four-tread stair geometry, and handles door/locked/barred/stair-exit
  panels. The viewer consumes this compiler instead of rebuilding cell cubes.

The viewer coordinate mapping is therefore:

```text
game cell x + local x  -> Three X
authored floorZ        -> Three Y * LEGACY_VERTICAL_UNIT
game cell y + local y  -> Three Z
```

Cell boundaries remain integer coordinates and cell centers are `x + 0.5`,
`y + 0.5`. This preserves authored dimensions and the same vertical scale as
the in-game WebGL renderer.

## Canonical materials and texture precedence

- `src/game/floor-map.ts::themeAt()` applies the primary floor theme and
  inclusive, later-wins `tilesetZones`.
- The geometry compiler alternates `floorA`/`floorB` by `(x + y) % 2`, uses
  the resolved cell theme for floor/wall/ceiling/door materials, and swaps in
  authored ceiling-feature panels per cell.
- `src/engine/renderer.ts` owns loading and preparing the actual tileset
  assets under `public/assets/tilesets/`, including the campaign themes,
  stairs/door fallbacks, ceiling-feature sources, and the special water floor
  textures. `MazeMaterialLibrary` is the shared Three material bridge and
  preserves nearest-neighbor sampling.
- The checked-out branch does not contain the wall-family integration from
  `00161f24a91b1d60cc95a7549d1d1c6268f735cb`; that commit is on the separate
  `art/wall-tile-variants` branch. The viewer will expose the compiler’s exact
  material key, so it will automatically show per-edge variant suffixes on a
  checkout that contains that canonical integration. It will not invent
  variant assignments on this checkout.

## Props and environmental layers

`src/engine/maze-renderer/webgl/maze-visuals.ts` already adapts the canonical
visual overlays and is reused by the viewer:

- `architecturalProps` use `architectural-prop.ts` for fixed facing, anchors,
  boxes, and planes.
- `mapSprites` and tile-feature props use `map-sprites.ts`, `maze-props.ts`,
  `map-sprite-cache.ts`, and the same grounded billboard sizing/alpha-keying
  path as the game.
- `wallFeatures`, `doorFeatures`, `ceilingFeatures`, and `ceilingSprites` use
  their existing registries/caches.
- `environmentalSprites` use the existing world-fixed animated-sheet path.
- Water cells are a special floor material in the Canvas renderer rather than
  the shared static WebGL compiler. The viewer adds a thin, textured water
  surface from the canonical `floor.grid` water tiles and the shipped water
  tileset, while retaining the shared floor elevation and water definitions.

Events, NPCs, treasures, teleports, chutes, gates, stairs, and encounter zones
are data overlays rather than separate collision meshes. The viewer exposes
them as optional diagnostic markers and inspector metadata; it does not
change their gameplay behavior or pretend concealed event/chute tiles are
visible ordinary props.

## Viewer architecture

The viewer has four layers:

1. A pure floor adapter flattens compiler batches/faces into inspector and
   coverage data, derives canonical physical-edge audits, and exposes resolved
   cell volume/surface/theme values.
2. A Three scene consumes the shared compiled geometry and
   `MazeVisualCollection`, with switchable textured/neutral/wireframe/height
   materials and visibility groups for ceilings, floors, props, water, and
   markers.
3. A small camera controller provides orbit, fly, top, isometric, and reset
   views without changing game camera code.
4. A standalone `tools/level-3d.html` entry point provides floor/mode/toggle
   controls, a hover/click inspector, coverage statistics, and optional GLB
   export.

## Main fidelity traps to test

- Shared open edges must not create phantom internal walls, while unequal
  floor/ceiling volumes must retain only the exposed closure patches.
- Ramp direction and endpoint heights must match `resolveFloorSurface()` and
  `surfacesConnectAcrossEdge()`; stair treads must not be replaced by a block.
- `void` and `noCeiling` are distinct: the former has no ordinary cell
  surfaces, while the latter keeps its floor and opens the ceiling.
- Wall/door material keys must remain per-face and retain regional theme and
  variant information; no randomization is allowed in the viewer.
- Billboard orientation, prop grounding, wall-face decals, ceiling anchors,
  water height epsilon, nearest filtering, and transparent-ceiling depth order
  all need browser inspection.
- The current checkout’s missing wall-variant integration must remain visible
  in the final limitations rather than being silently papered over.

## Validation plan

Pure tests derive dimensions, edge classifications, material keys,
surface elevations, ramp endpoints, closure faces, and topology checks from
the canonical floors and compiler output. Browser checks will load all five
floors, exercise the camera/toggle/inspector controls, capture top and
three-quarter views, and check the console for errors and missing asset
failures.

## Usage

Run `npm run level:3d` for the Vite development entry point, or open
`/tools/level-3d.html` from the production preview. The deterministic QA
capture command is `npm run level:3d:screenshots` after starting the preview;
it writes Floor 1–5 top, isometric, and interior captures under the ignored
`output/playwright/level-3d/` directory and fails on browser errors.
