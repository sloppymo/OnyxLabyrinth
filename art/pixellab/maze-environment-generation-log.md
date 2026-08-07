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
