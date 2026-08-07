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
| `bookshelf-intrusion` | (10,18) `n` and (5,9) `s` | "Shelves begin where the stone should be." / "The shelves list books not yet written." | placed just *outside* unfinished-index (f1 crypt / f4 chapel respectively — see repositioning note below); art itself is f2 library material | 0.4 / 0.7 / bottom |
| `cold-hand` | (7,6) `e` | "A cold hand closes your wounds." (heal event) | cut-bell-chapel → f4 | 0.28 / 0.4 / center |
| `sweating-iron` | (18,6) `e` | "Iron sweats. Something below coughs once." | ember-suture → f3 | 0.35 / 0.45 / center |
| `ember-scorch` | (12,5) `e` | "Embers flower underfoot." | ember-suture → f3 | 0.3 / 0.35 / bottom |
| `upward-water` | (17,15) `w` | "Black water drips upward, one bead at a time." | upward-cistern → f5 | 0.22 / 0.35 / top |

**In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-decals 5 6 0  8 19 0  3 15 3  7 6 1  18 6 1  12 5 1  17 15 3`
— all six confirmed wall-attached, correctly scaled, no stretching/mirroring
artifacts, legible without reading as a floating UI icon.

**Repositioned after initial QA**: both `bookshelf-intrusion` placements
originally sat several cells inside the already-f2-themed `unfinished-index`
zone (at (8,19) and (3,15)), so the "impossible material crossing into
stone" contrast the event text implies was muted — the decal blended into
the already-library-toned wall around it instead of visibly interrupting a
different material.

Fixed by moving each to a wall face just *outside* the library zone,
verified via `themeAt`/`tilesetZones` inspection, not guessed:
- (8,19) → **(10,18) `n`**: one cell east of the zone's `x2=9` boundary,
  which is plain f1 crypt stone. The shelf now visibly interrupts ordinary
  mossy masonry.
- (3,15) → **(5,9) `s`**: there is no plain-crypt buffer between the
  library and chapel quadrants at this x-range (`unfinished-index` and
  `cut-bell-chapel` are directly adjacent, `y=12` / `y=11`), so this one
  crosses into the cut-bell-chapel (f4) zone instead — cold purple-grey
  choir stone is arguably an even sharper material contrast than crypt
  stone would have been.

Both re-verified in-engine (`f1-bookshelf-fixed-01/02.png`) before
re-validating and rebuilding; `floor:validate` and the full test suite stay
green (the wallFeatures validator only checks edge-type/bounds/spriteId, not
zone placement, so this was a content/QA fix, not a system-level one).

**Floor-decal adaptation note**: `ember-scorch` (12,5) and `upward-water`
(17,15) visualize event text that describes a *floor*-level phenomenon
("flower underfoot", water "drips" implying a ceiling/floor relationship).
wallFeatures only supports wall-face decals in this pass (floor decals are
a different rendering mode, not built here) — both were adapted to a
wall-mounted equivalent (a scorched wall-base patch; a droplet clinging to
a wall crack near the ceiling) rather than left unvisualized. Noted as a
deliberate scope decision, not an oversight.

## Doors pass (branch `agent/tavern-hero-door`)

Reconciled the previously-unmerged `floor1/definitive-pass` branch (Hot Boi's
Tavern hub) onto post-merge main so the tavern and the `wallFeatures`/
stairs-panel system exist in the same tree for the first time. Two
conflicts, both non-overlapping sibling additions (`renderer.ts`'s
`door`/`locked`/`barred` check gaining a `barredGates` branch on one side
and a wallFeatures decal pass on the other; `floor-1.json`'s new top-level
`chuteDrops`/`barredGates`/`raftRoutes`/`stairsGuardian` keys vs
`wallFeatures`) — resolved by keeping both sides.

### Full-face door override: `doorFeatures`

Built a new coordinate-keyed system, structurally parallel to `wallFeatures`
but modeled on the stairs-panel substitution (full wall-face image, not a
windowed decal): `src/data/door-features.ts` (registry),
`src/engine/door-feature-cache.ts` (image cache, mirrors
`wall-feature-cache.ts`), a `doorFeatures?: {x,y,dir,spriteId}[]` field
threaded through `FloorDef`/`FloorMapJSON`/`cloneFloor`/`floorDefToMap`/
`mapToFloorDef`/`newFloorMapJSON`/`parseFloorMapJSON` (all four
touch-points from the earlier `wallFeatures` `cloneFloor` bug, grepped and
confirmed this time), a `validateDoorFeatures` check (edge must be
`door`/`locked`/`barred`, spriteId must resolve), and a renderer hook: the
existing `door`/`locked`/`barred` draw branch now resolves the hit's
near-cell+dir (reusing `wallFeatureCellForHit` — a door hit shares the same
geometry as a wall hit) against `state.floor.doorFeatures` and substitutes
the matched image for the generic per-theme door texture when found.
Bidirectional doors need one entry per approach side, same as how the grid
itself stores the edge on both adjoining cells.

| Asset | Coords | Prompt intent | Palette | Result |
|---|---|---|---|---|
| `hot-bois-tavern-door` | (11,22) `s` / (11,23) `n` | massive blackened double doors, iron banding, brass ring pulls, stone arch, flanking lantern sconces, asymmetric wear, no text | f2 (zone theme at that coordinate) | Accepted on the first candidate |

**In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-tavern-door 11 21 2
11 20 2 11 18 2` (1/2/4-tile approach, matching the stairs QA convention).
Reads as an unmistakable landmark at 1–2 tiles; at 4 tiles it's legible but
dim — the engine's fog falloff (`MATH_CONFIG.fogFalloff`/`maxDepth: 4` in
`render-math.ts`) attenuates all wall art heavily near the draw-distance
edge, not specific to this asset (the stairs panel reads brighter at a
comparable distance only because that scene had a different environmental
lighting state, not because of a difference in the texture itself).

**Found and fixed in the same pass**: the pre-existing `tavern-sign`
billboard (from the original tavern branch, authored before this hero door
existed) sat at (11,21) — dead-center in the 1-wide corridor's sightline to
the door — and fully occluded the new door from 2+ tiles away, undermining
the "recognizable across the room" goal. Moved to (10,21), one tile off-axis
but still adjacent to the doorway; re-verified in-engine after the move.

### Secret-door art (parked, not wired — no discovery mechanic exists yet)

Explicit scope decision: generate hidden/revealed art pairs for three Floor 1
zones now, but build no interaction/discovery system this pass (`EdgeType`
has no hidden/secret state — see `src/types/index.ts` — so there is nowhere
in the data model for these to attach yet). Filed as candidates only, not
copied into `public/` and not registered in any sprite registry.

| Pair | Palette | Hidden-state intent | Revealed-state intent | File(s) |
|---|---|---|---|---|
| Native crypt | f1 | suspicious-but-plausible masonry, no obvious tell | rectangular recessed stone panel, dark cavity, iron pull ring | `secret-f1-hidden-01.png`, `secret-f1-revealed-01.png` |
| Unfinished Index (bookshelf) | f2 | ordinary bookshelf, no visible tell | shelf pivoted open, dark passage, spilled books at the base | `secret-f2-hidden-01.png`, `secret-f2-revealed-01.png` |
| Ember Suture (iron hatch) | f3 | plain riveted iron plate, indistinguishable from the existing `sweating-iron` decal style | hatch open on a hinge, dark cavity, ember glow at the frame | `secret-f3-hidden-02.png` (accepted; `-01` rejected — read as an obviously distinct hatch outline, failing the "plausibly missable" requirement), `secret-f3-revealed-01.png` |

Total this pass: 8 PixelLab generations (1 tavern door, 6 secret-door
pairs + 1 rejected `secret-f3-hidden-01` reroll). Quality bar for "hidden"
states going forward: if a wall/shelf/plate reads as obviously special on
first glance, it has failed — the tell should only be legible in hindsight,
after the player already knows to look.

**Next step, not started**: a real secret-door mechanic (an interact/search
input, a discovered-state flag per grid edge or a new `EdgeType`, and a
render swap between hidden/revealed art) — this pass deliberately stopped at
art generation, per explicit scope decision.

## Church of Saint Namanda door + the mark (same branch)

The user's explicit next-door-candidate call, with an explicit constraint:
visually the *opposite* of Hot Boi's (pale stone, tall narrow severe arch)
while also reading as "even more imposing" (bigger scale, dark carved timber
leaves, heavy iron hinges) — those two notes were in tension (the "dark
timber + iron + imposing" phrasing alone would have reproduced the tavern
door's own material palette). Resolved by keeping the tavern-door *material
scale* for the door leaves only, while holding the *architecture* — arch
shape, stone tone, symmetry — to the opposite-of-tavern brief. One PixelLab
candidate, accepted on the first try, palette-locked to `f4_wall_256.png`
(the cut-bell-chapel zone's theme, which is where this door's edge already
sits).

Placed at (10,10) `e` / (11,10) `w` — the chapel zone's *only* existing
doorway (confirmed by scanning every edge in the zone's bounding box, not
guessed), so this reuses the zone's real, sole entrance rather than carving
new maze topology. This is also the first door art placed on a coordinate
that already has non-trivial lore: `src/data/quests-floor1.ts` already
references a "Sister Caldris" in "the chapel wing" — the Church of Saint
Namanda is that same room, not a new location.

### Saint Namanda's mark

Explicit design constraint from the user: this needs to recur, pixel-
identical, across many future assets (door relief, priest robes, shrines,
fonts, grave markers) — exactly the case PixelLab's lack of image-to-image
editing breaks, since every generation is a fresh interpretation. Authored
once, deterministically, in `scripts/generate-namanda-mark.mjs` (same
approach as the tavern-sign/darkness-idol hand-authored props): a 16x16
ASCII-authored open palm (four single-pixel fingers held apart by a full-
height gap before merging into the palm, one thumb notch) composited over a
procedurally-drawn ring, two-tone (dimmer ring, paler hand) so the two
elements read as layered rather than one blob.

**First attempt read as a smiling face**, not a hand — the fingers merged
into a solid block after only 2 rows, and the ring's top arc intersected the
finger-tip gaps in a way that looked like two eyebrow dots. Fixed by
extending the individual finger stems to 4 full rows before merging, and
enlarging/repositioning the ring so its arc clears the fingertip row instead
of cutting through it. Lesson for future hand-authored icons at 16x16:
verify the *silhouette* reads as intended by eye before accepting — a
technically-correct pixel count doesn't guarantee the gestalt lands.

Output at three scales (`namanda-mark.png` 32x32 for in-scene props,
`namanda-mark-large.png` 128x128 for inspection, `namanda-mark-relief.png`
48x48 sized for the door panel) via `save(mark, name, scale)`, all from the
same 16x16 source buffer — pixel-identical at every scale, by construction.

Composited onto the church door's blank stone panel (left intentionally
blank in the PixelLab prompt, not generated) via
`scripts/composite-namanda-door.mjs`: panel center measured by sampling the
generated PNG's pixel values to find the panel's bounds, mark tinted toward
a warm gilt-on-stone tone (rather than left in its default bone/bronze) so
it reads as an aged relief, not a pasted sticker.

**In-engine QA**: `scripts/floor1-wallfeature-qa.mjs f1-namanda-door 9 10 1
8 10 1 7 10 1` (1/2/3-tile approach — the chapel's straight corridor
segment here is only 3 tiles deep before a wall, one tile short of the
stairs/tavern 4-tile convention). Reads clearly as a severe, unmistakable
sanctuary entrance at all three distances; the pale stone contrasts harder
against the dark corridor than the tavern door's dark-on-dark palette does
at range, so if anything this reads *better* at distance than Hot Boi's did.

Total this addendum: 1 PixelLab generation (church door) + 2 hand-authored
sprite iterations (the mark, no PixelLab cost).

### Design principle (explicit, per the user)

> Important doors advertise themselves. Secret doors deny that they're
> doors.

Hot Boi's and Namanda's are both "important door" cases — different moods,
same rule: unmistakable at range. The secret-door pairs above are the
inverse case. Any future door/landmark work should sort into one of these
two buckets before generation starts, not land ambiguously in between.

### Deliberately not started this pass

The user pitched Namanda as a full second hub (Heal / Cure / Raise /
Uncurse / Identify / Blessing / Pray / Donate, a one-blessing-at-a-time
buff, an unexplained "one strange thing" detail) — a real gameplay system,
not an art task. Scoped but not built. Evidence checked before deferring
(not just "it's big"): `identified`/`cursed` are already per-item fields
(`src/types/index.ts`, `src/data/items.ts`), and town already has an
appraise-for-a-fee flow (`src/engine/town-ui.ts`) an in-dungeon Identify
could extend — but no `uncurse`/`removeCurse` function exists anywhere, no
blessing/buff-slot system exists, and Camp already free-revives KO'd
characters to 1 HP (`src/engine/camp-ui.ts`), so "Raise" needs its own
differentiator the same way Rest needed one against Camp. Also not started:
the ceiling-hanging sprite primitive the user named as the item after this
door (billboards currently bottom-anchor per the maze-prop anchoring
convention in `scripts/generate-maze-props.mjs`'s `ground()` — a ceiling
sprite needs the opposite anchor, not a variant of the existing one).
