# Floor 1 Environmental Art — Overnight Production Log

**Starting SHA**: `c590d09bb4e076c4fb2ebadf3a85ef80e66a500b` (main)
**Branch**: `agent/floor1-environment-art`, isolated in a dedicated worktree
(`/home/sloppymo/OnyxLabyrinth-floor1-art`) per [[Concurrent sessions share
the main worktree]] — the main worktree had unrelated uncommitted combat-sprite
work in progress and was not touched.
**PixelLab path**: REST (`scripts/pixellab-generate.mjs` against
`api.pixellab.ai/v2/create-image-pixflux`). No MCP server is configured in
this repo; REST was used directly per the task's stated priority ("don't let
MCP setup block the night").
**Prerequisite audit**: `docs/MAZE-ENVIRONMENT-ART-AUDIT.md` (written earlier
this session, not redone).

## Sequence

1. **Infrastructure (P0)** — `wallFeatures` system: data model
   (`FloorDef.wallFeatures` / `FloorMapJSON.wallFeatures`, mirroring the
   existing `lockedDoors` shape), a sprite registry + image cache
   (`src/data/wall-features.ts`, `src/engine/wall-feature-cache.ts`), pure
   unit-tested projection math in `render-math.ts`, and a composite-draw pass
   in the renderer's wall-strip loop gated on `hit.edge === "wall"`.
   `floor-validate.ts` checks the edge is actually `"wall"` and the spriteId
   resolves.

2. **Verification before spending on art** — a throwaway 32×48 asymmetric
   test decal proved the whole projection pipeline (window, anchor, flip,
   fog, nearest-neighbor) end to end in the live raycaster **before** any
   real generation. This caught a real bug: `cloneFloor()`
   (`src/data/floors.ts`) — called on every floor transition to get a
   private mutable copy — lists `FloorDef` fields explicitly, the same
   pattern as `floorDefToMap`/`mapToFloorDef`/`newFloorMapJSON`, and it was
   the one place I missed when adding the field. The bundle had correct
   data; `state.floor.wallFeatures` was silently `undefined` at runtime on
   every dungeon entry. Found by instrumenting the render loop directly
   since the debug snapshot only exposes a curated subset of `FloorDef`.
   Fixed, regression-tested (`floors.test.ts`), verified, smoke-test content
   removed before shipping.

3. **Stairs architecture (P1, hero asset)** — stairs render via the door-panel
   substitution path (`isStairExitFeature` coerces the `open` edge into a
   `stairs_down` tile to `"door"`), so they're outside the `wallFeatures`
   contract (the stored grid edge is `open`, not `wall`) by design, not by
   omission. Added a second, independent, per-theme `stairs.png` texture
   slot on `LoadedTileset`, silently optional (no `warnAsset` on a missing
   file — most themes won't have one). Generated at 256×256 to match
   `f1_door_256.png` exactly, palette-locked to the real F1 wall.

4. **wallFeatures decals (P2–P8)** — lamp lock generated and calibrated
   fully end-to-end first (generate → register → place → screenshot → tune
   fracs) to fix a baseline (`widthFrac 0.3 / heightFrac 0.4 / anchor
   center`) before batch-producing the remaining six. Each decal's
   `--palette` reference was the actual wall texture of the theme its
   coordinate's `tilesetZones` entry resolves to — several Floor 1 events
   sit inside a "wound" quadrant pre-textured with a different floor's
   theme, so the correct reference often wasn't `f1_wall_256.png`.

5. **Validation and QA** — `npm run check` (typecheck, build, full test
   suite, `floor:validate`, `floor:export-check`) green at every milestone.
   `scripts/floor1-wallfeature-qa.mjs` (new, reusable) drove
   `boot`/`jumpTo`/`shot` against a production preview to capture every
   asset in the live renderer at multiple distances before accepting it.

## PixelLab summary

- Total meaningful generations: 9 (1 stairs, 1 lamp-lock, 6 decals, 1 water
  reroll).
- Accepted: 9/9 (one asset — upward-water — needed one reroll; everything
  else accepted on the first candidate).
- Rejected/abandoned: 0 full rejections; the water v1 was kept on disk in
  `art/pixellab-candidates/` for the record but not shipped.
- No API/auth issues. One 64×64 throwaway call confirmed the key works and
  `no_background: true` returns genuine per-pixel alpha (no flood-fill
  cleanup needed, unlike the `animate-with-text-v3` combat-sprite path).

Full per-asset prompts, palette references, and settings:
`art/pixellab/maze-environment-generation-log.md`.

## Tests run

- `npm run test:typecheck` — clean at every milestone.
- `npm test` — 1962/1962 passing (added: `floors.test.ts` cloneFloor
  regression case, `render-math.test.ts` wall-feature geometry suite,
  `floor-wall-features.test.ts` round-trip/validation suite).
- `npm run floor:validate` — all 5 floors clean at every milestone.
- `npm run floor:export-check` — caught real drift once (direct JSON edits
  bypass the editor's export step); fixed via `npm run floor:export-all`,
  re-verified clean.
- `npm run build` — clean at every milestone, no new bundle errors.
- `npm run check` (canonical) — clean, final run.

## Visual review

`docs/floor1-art-review/index.html` — open directly in a browser. Real
in-game screenshots for every implemented asset, at multiple distances for
the stairs, with per-asset QA notes including the two known limitations
(bookshelf placement, ember-scorch's floor→wall adaptation).

## Not completed / deferred

- **P9 (reliquary gate polish, (11,12) `n`)** — skipped. The gate's edge type
  is `locked`, not `wall`; `wallFeatures` v1 deliberately only composites
  onto plain wall faces (checked and confirmed via advisor review before
  building anything — the runtime `RayHit.edge` coercion that lets stairs
  reuse the door path never touches the *stored* grid data the validator
  reads, so relaxing the gate to accept `locked` there would still fail
  validation against real data). Giving the reliquary door real identity
  would need its own small mechanism (a per-lockedDoors-entry unique door
  texture, structurally similar to the stairs slot but keyed by door
  identity instead of theme) — a clean, scoped follow-up, not attempted
  this pass to keep to the priority order.
- **Bookshelf placement fix** — both `bookshelf-intrusion` placements sit
  inside the already-themed library zone instead of at its boundary with
  plain crypt stone, muting the "impossible material" contrast. Documented
  in the generation log and gallery; a 10-minute fix (move to a plain-crypt
  wall face one or two cells outside the zone) that didn't happen this pass
  because it was caught during QA near the end of the session.
- **NPC billboards** — untouched, per explicit scope (task said do not
  build the NPC hook this pass).
- **Floor decals (true floor-level effects)** — not built as a separate
  rendering mode; `ember-scorch` and `upward-water` were adapted to
  wall-mounted equivalents instead. A real floor-decal system is a
  reasonable Wave 2 candidate if more of the audit's floor-level candidates
  (pressure plates, drain grates on Floors 3/5) get built later.

## Top 3 next actions

1. Reposition the two `bookshelf-intrusion` placements to the actual
   crypt/library zone boundary — highest-value, lowest-effort fix left on
   the table.
2. A per-lockedDoors-entry unique door texture, to give the reliquary gate
   (and eventually each floor's boss door) real architectural identity —
   the same design pattern as the stairs slot, just keyed differently.
3. Extend this same PixelLab + wallFeatures pipeline to Floor 3 (the
   audit's richest floor: guardian statue, anvil altar, pressure-plate/
   flame-jet, fused-smith-in-wall) now that the system and the production
   workflow are both proven.
