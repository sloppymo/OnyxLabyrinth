# Floor 1 Environmental Art — PixelLab Generation Log

Path used: **REST** (`scripts/pixellab-generate.mjs` against `api.pixellab.ai/v2/create-image-pixflux`).
No PixelLab MCP server is configured in this repo; per the task priority order,
REST was used directly rather than spending time on MCP setup. API key read
from local `.env` (`PIXELLAB_API_KEY`, gitignored, never committed).

Verified before spending on real assets: one throwaway 64×64 generation
confirmed the API key works and `no_background: true` returns genuine
per-pixel alpha (not a baked flat backdrop) — no flood-fill cleanup step
needed before caching, unlike the `animate-with-text-v3` path used for
combat sprites.

## Asset: f1-stairs (stairway-down architecture)

- **Location**: Floor 1 (20,2), approached from (20,3) facing N. `stairs_down`
  tile; the `n` edge coerces to a "door" hit via `isStairExitFeature`.
- **Mechanism**: full panel replacement via the new `LoadedTileset.stairs`
  slot (theme-keyed, same substitution point as `door.png`), NOT wallFeatures
  — the underlying grid edge here is `open`, not `wall`, so it's outside the
  wallFeatures contract by design (see commit `b9b5647`).
- **Endpoint**: `create-image-pixflux`, size 256×256 (matches `f1_door_256.png`
  exactly — this must tile 1:1, not windowed like a decal).
- **Reference**: `color_image` = `src/assets/f1_wall_256.png` (palette lock to
  the actual F1 crypt wall, not a generic "mossy stone" prompt alone).
- **Description**: "front view of a stone staircase descending into darkness,
  set into an ancient mossy crypt wall, worn stone steps going down, low
  stone side walls flanking the steps, damp olive-grey masonry, torchlit
  opening, dark 16-bit dungeon crawler pixel art, no people, no text"
- **Candidates generated**: 1
- **Accepted**: 1 (`f1-stairs-01.png`, first candidate — no reroll needed)
- **Output**: `public/assets/tilesets/f1/stairs.png`
- **In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-stairs 20 3 0 20 4 0 20 6 0`
  — verified at 1, 2, and 4 tiles' approach distance. Reads clearly as a real
  descending stairwell at all three; at distance it glows as a strong
  navigational landmark against the surrounding ember-suture (f3) zone,
  which the theme-zone system paints on the flanking corridor without any
  extra work — an unplanned but welcome demonstration of the "wound"
  concept (crypt architecture intruded on by a neighboring floor's material).
- **Known issue**: a faint ~1px vertical seam is visible in the exact screen
  center when the camera is perfectly axis-aligned with the corridor
  (visible in the 1-tile shot). Traced to the existing raycaster's
  side/texX-flip tie-break at cameraX≈0, not something this asset's
  integration introduced — the same seam would appear on any texture with
  fine symmetric detail sampled at dead-center (the repeating brick wall
  pattern hides it; this arch's clean lines don't). Documented as a known
  minor rendering quirk rather than touched, since fixing it means editing
  the raycaster's DDA tie-break, out of scope for an art pass.

## Asset: lamp-lock (wallFeatures decal)

- **Location**: Floor 1 (10,14) dir `w`. Event at (11,14): "Five metals meet
  at a lock shaped like a lamp." Placed one tile west, on the plain wall
  the player faces while standing on/near that event tile.
- **Mechanism**: wallFeatures decal (first real one, not the throwaway
  smoke test). `widthFrac: 0.3, heightFrac: 0.4, anchor: "center"`.
- **Endpoint**: `create-image-pixflux`, 64x64, `no_background: true`.
- **Reference**: `color_image` = `src/assets/f1_wall_256.png`.
- **Description**: "small ornate mechanical lock shaped like an oil lamp,
  made of five different tarnished metals - bronze, iron, silver, gold,
  copper - bolted into ancient stone, mysterious dungeon mechanism, front
  view, dark 16-bit dungeon crawler pixel art, no text"
- **Candidates generated**: 1. **Accepted**: 1 (`f1-lamp-lock-01.png`) — reads
  as an ornate mechanism with a lamp-like domed top and a keyhole; genuine
  "five metals" detail is implicit rather than literal, acceptable given the
  event text itself is figurative.
- **Output**: `public/assets/wall-features/lamp-lock.png`
- **In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-lamplock 10 14 3 11 14 3 12 14 3`
  — confirmed centered, wall-attached (not floating), no stretching, no
  mirroring artifacts, legible at 0/1/2-tile distance and appropriately
  subtle (not glowing/UI-like) at range. **This calibration
  (widthFrac 0.3 / heightFrac 0.4 / anchor center) is the baseline reused
  for the remaining Floor 1 wall decals** unless a specific asset's
  silhouette calls for a different aspect (e.g. a taller relief).

## Assets: bell, bookshelf-intrusion, cold-hand, sweating-iron, ember-scorch, upward-water

All six generated via `create-image-pixflux`, `no_background: true`, each
`--palette`-locked to the actual wall texture of the theme the target
coordinate's `tilesetZones` entry resolves to (not always f1 — several of
these events sit inside F1's "wound" quadrants, which are pre-textured with
a neighboring floor's theme). One candidate accepted per asset except
upward-water (rerolled once — v1 was too abstract/textural to read as a
droplet; v2's tighter "single droplet, clear silhouette" prompt fixed it).

| Asset | Location | Event source | Zone / reference theme | widthFrac/heightFrac/anchor |
|---|---|---|---|---|
| `bell` | (5,6) `n` | "THE THIRD BELL HAS NO TONGUE." | cut-bell-chapel → f4 | 0.3 / 0.55 / top |
| `bookshelf-intrusion` | (8,19) `n` and (3,15) `w` | "Shelves begin where the stone should be." / "The shelves list books not yet written." | unfinished-index → f2 | 0.4 / 0.7 / bottom |
| `cold-hand` | (7,6) `e` | "A cold hand closes your wounds." (heal event) | cut-bell-chapel → f4 | 0.28 / 0.4 / center |
| `sweating-iron` | (18,6) `e` | "Iron sweats. Something below coughs once." | ember-suture → f3 | 0.35 / 0.45 / center |
| `ember-scorch` | (12,5) `e` | "Embers flower underfoot." | ember-suture → f3 | 0.3 / 0.35 / bottom |
| `upward-water` | (17,15) `w` | "Black water drips upward, one bead at a time." | upward-cistern → f5 | 0.22 / 0.35 / top |

**In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-decals 5 6 0  8 19 0  3 15 3  7 6 1  18 6 1  12 5 1  17 15 3`
— all six confirmed wall-attached, correctly scaled, no stretching/mirroring
artifacts, legible without reading as a floating UI icon.

**Known limitation, documented rather than fixed**: both `bookshelf-intrusion`
placements sit several cells inside the already-f2-themed `unfinished-index`
zone rather than exactly on the crypt/library seam, so the "impossible
material crossing into stone" contrast the event text implies is muted —
the decal mostly blends into the already-library-toned wall around it
instead of visibly interrupting plain crypt stone. The `sweating-iron` and
`cold-hand`/`bell` placements don't have this problem (their events sit
close enough to their zone's edge, or the material families differ sharply
enough from the flanking crypt masonry, that the decal still pops).
Repositioning the two bookshelf entries onto a plain-crypt-themed wall face
one or two cells outside the library zone (still near their event tiles)
would fix this — flagged as the top remaining opportunity in the final
report rather than iterated on further this pass.

**Floor-decal adaptation note**: `ember-scorch` (12,5) and `upward-water`
(17,15) visualize event text that describes a *floor*-level phenomenon
("flower underfoot", water "drips" implying a ceiling/floor relationship).
wallFeatures only supports wall-face decals in this pass (floor decals are
a different rendering mode, not built here) — both were adapted to a
wall-mounted equivalent (a scorched wall-base patch; a droplet clinging to
a wall crack near the ceiling) rather than left unvisualized. Noted as a
deliberate scope decision, not an oversight.
