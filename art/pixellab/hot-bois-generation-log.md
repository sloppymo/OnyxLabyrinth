# Hot Boi's Tavern Interior — PixelLab Generation Log

Branch: `agent/hot-bois-interior-art`. Art-only pass — the tavern gameplay
hub (`floor1/raft-tavern-redesign`, unmerged) and the exterior hero door
(`agent/tavern-hero-door`, unmerged, live in another worktree) were **not**
merged in. Reference art from both was read via `git show <branch>:<path>`
only.

Path used: **REST** (`scripts/pixellab-generate.mjs` against
`api.pixellab.ai/v2/create-image-pixflux`), same as every prior art pass —
no PixelLab MCP server is configured in this repo. `--palette` conditions
color only (PixelLab's `color_image` param); there is no image-to-image/pose
reference in this endpoint, so Hot Boi's species/silhouette is carried by
prompt text, not by feeding his portrait in directly. Every candidate is
checked by eye against `hotboi-refs/ref-hotboi-portrait.png` before
accepting.

## Reference material (not shipped, scratchpad only)

Pulled via `git show <branch>:<path>`, never checked out or merged:

- `ref-hotboi-portrait.png` — `git show c361782:public/assets/portraits/hot-boi.png` (`floor1/definitive-pass`). 300x400 RGB. Hot Boi is an anthropomorphic toad: broad flat dark-grey-green head, huge amber/gold eyes with black slit pupils, wide downturned mouth, tan/khaki throat and shoulders, dark shoulder markings, brass hoop earring dangling from each side of the head.
- `ref-hotboi-door.png` — `git show agent/tavern-hero-door:public/assets/door-features/hot-bois-tavern-door.png`. Stone archway, dark timber double doors, iron banding, brass ring pulls, flanking hanging lantern sconces. This is the material-language anchor for the interior (dark wood + iron + brass + stone).
- `ref-namanda-door.png` — same branch, for contrast/context only (not used as a tavern reference).

## Engine channels actually used (this branch, main-derived)

No `doorFeatures` channel exists here (that's only on `agent/tavern-hero-door`,
unmerged). Available primitives, confirmed by reading `src/data/*.ts` +
`src/engine/render-math.ts` + `src/engine/renderer.ts`:

- **Per-floor tileset** (`public/assets/tilesets/<theme>/{wall,floorA,floorB,ceiling}.png`, 256x256 RGB, no alpha) — applied per-floor or per-rectangle via `FloorDef.tilesetZones` (precedent already shipped in `floor-1.json`: `cut-bell-chapel` zone borrows the f4 theme, `ember-suture` borrows f3, etc.). `hotboi` is a new theme folder, zone-applicable without a new floor id.
- **`wallFeatures`** (`src/data/wall-features.ts`) — decal composited onto one wall face, `widthFrac`/`heightFrac`/`anchor`. Empirically verified (throwaway magenta grid-test decal, wired to a real F1 north wall, screenshotted at 1/3 tiles via Playwright, then fully reverted — not committed): `widthFrac: 0.98, heightFrac: 0.95, anchor: "bottom"` fills a wall face edge-to-edge cleanly, no stretching, no seams. **This is the full-face bar composition channel** — there is no separate "full wall replacement" primitive; a near-1.0 frac wallFeature *is* that. One important finding: the decal renders **horizontally mirrored** on a north-facing wall approached from the south (confirmed with an asymmetric test pattern — top-left source marker rendered top-right in-engine). Bar-left/right art must account for this (see bar section) or be authored already-mirrored.
- **`mapSprites`** (`src/data/map-sprites.ts`) — floor-standing/NPC billboard, bottom-anchored. Reused for Hot Boi via the per-instance NPC corridor-billboard hook built this branch for Vesper (`cf7f56a`/`55d7d3d`) — the one NPC billboard already validated in-engine here.
- **`ceilingSprites`** / **`ceilingFeatures`** — not needed for P0; the tavern's own rafter ceiling is a tileset swap, not a per-cell feature.
- **No solid-interior-cell primitive.** The central pillar has no way to block movement/sightlines on 4 sides without new renderer/collision work, which is out of scope (hard exclusion). It ships as a mapSprite billboard only; the gap is documented, not built around.

## Core materials (`public/assets/tilesets/hotboi/`)

New theme folder, applied via a `tilesetZones` rectangle when the room is
actually built (precedent: F1's existing `cut-bell-chapel`/`ember-suture`
zones borrow other floors' themes the same way) — no new floor id needed.
Verified in-engine with a throwaway `tilesetZones` entry over the (10,15)
corridor (screenshot: `docs/hot-bois-art-review/screenshots/materials-in-corridor.png`),
then reverted (`git checkout -- src/content/floors/floor-1.json`, not committed).
All 256x256 RGB, 2x2-tiling checked before acceptance.

| id | size | candidates | notes |
|---|---|---|---|
| wall | 256x256 | 5 | v1 conditioned on f1's cold stone palette — wrong temperature entirely, discarded. v2/v3/v4 chased genuine half-timber+plaster infill (task brief's "possibly" qualifier) but each broke tiling or drifted to lattice/crosshatch (anti-slop violation) or read as a wood crate. v5 dropped the plaster ask, kept pure heavy dark timber — ties cleanly, reads as intentional tavern wall, accepted. |
| floorA | 256x256 | 1 | accepted first try — horizontal worn planks, boot-wear stains, clean tiling |
| floorB | 256x256 | 3 | v1 came out vertical-plank (orientation mismatch vs floorA), v2 came out far too dark (near-black, would clash badly alternated with floorA), v3 (conditioned on wall.png instead of floorA, explicit brightness-matching language) accepted |
| ceiling | 256x256 | 1 | accepted first try — heavy crossing timber trusses, smoke-blackened, perfect seamless tiling |

## Bar family (`public/assets/wall-features/`)

Bar geometry decision: the "north row" in the floorplan is read as the
**north wall face** of the row-1 cells (wall-mounted, not freestanding
counters players walk around) — one near-full-face `wallFeature` decal per
cell, bar counter + back-bar shelving baked as a single composition each,
matching the verified frac. Registered in `WALL_FEATURES` (not yet placed
on any floor — same "catalogued, unassigned" pattern as `vesper-guarded`).
Verified together in-engine on a real 3-wide F1 junction — (12,4)/(13,4)/(14,4),
all real "wall" edges — screenshotted, then the floor JSON edit was reverted
(`git checkout -- src/content/floors/floor-1.json`, not committed); only the
`WALL_FEATURES` registry change is kept. Screenshots:
`docs/hot-bois-art-review/screenshots/hotboi-bar-{left,center,right}-inengine.png`.

**Mirroring finding:** on a north-facing wall approached from the south
(walking north toward it), the decal renders **horizontally mirrored**
(confirmed with an asymmetric grid-marker test image during the frac
verification). Not corrected in the art — each panel's actual content
doesn't depend on strict left/right orientation (shelving both sides,
counter centered), so this wasn't worth fighting. Note for whoever wires
this into a real floor: verify the final left/right visual read in-engine
before locking cell assignment, don't assume the source PNG's own left/right.

| id | size | candidates | notes |
|---|---|---|---|
| hotboi-bar-center | 240x240 | 1 | accepted first try — counter, tapped keg centered, back-bar shelving, hanging lanterns. Strongest of the three, matches brief's "center supports Hot Boi as focal character" |
| hotboi-bar-left | 240x240 | 4 | v1 isometric corner (broke flat-orthographic requirement), v2 fixed angle but added an unwanted potted plant + stone-wall background inconsistent with the timber wall, v3 dropped the stone wall but kept the plant, v4 (maximally explicit "no plants/vases/foliage" + swapped crates/barrels/rope-coil content) accepted — crates, barrels, salvage shelving |
| hotboi-bar-right | 240x240 | 3 | v1 isometric corner (rejected with left's v1), v2 added an unwanted potted plant, v3 (same plant exclusion) accepted — cash box, ledger, mug rack, dried herb bundles (kept; dried/brown reads distinct from the excluded live potted greenery) |

## Hot Boi NPC (`public/assets/map-sprites/`)

Registered in `MAP_SPRITES` (not yet assigned to a real `npcs[]` entry —
same "catalogued, unassigned" pattern as `vesper-guarded`/the bar panels).
Verified in-engine via the per-instance NPC billboard hook (`mapSpriteId`)
built this branch for Vesper — a throwaway `npcs[]` entry + matching
`grid[y][x].tile = "npc"` on a real F1 cell, screenshotted, then fully
reverted (`git checkout -- src/content/floors/floor-1.json`, not committed).
Screenshot: `docs/hot-bois-art-review/screenshots/hotboi-npc-inengine.png`.
Palette conditioned on a tight crop of the canonical portrait
(`git show c361782:public/assets/portraits/hot-boi.png`, `floor1/definitive-pass`) —
this endpoint has no image-to-image/pose reference, so species/color fidelity
was carried mainly by very explicit prompt text, verified by eye against the
portrait after each candidate.

| id | size | baseSize | candidates | notes |
|---|---|---|---|---|
| hotboi-npc | 64x64 | 44 | 3 | v-a: good pose/apron/mug, but skin read warty/mottled olive-green and eyes reddish-brown instead of the reference's smooth dark charcoal-grey and amber-gold — archived as an alternate, not a reject (identity drift, not a technical flaw). v-c: explicit color correction applied, leaning-forward two-handed pose, but eye rims read stern/reddish, less inviting — archived as an alternate. v-b (accepted): same color correction as v-c, one-arm-up-with-foamy-mug pose — closest color match to the portrait (smooth dark head, clean amber-gold eyes, warm tan throat gradient) and the most inviting expression of the three. |

## Pillar (`public/assets/map-sprites/`)

Registered in `MAP_SPRITES` (not yet placed on any floor). Ships as a
visual-only billboard — **there is no 4-sided solid-interior-cell primitive
in this renderer** (walls are per-edge on the grid, not per-cell-fill), and
building one is out of scope for an art pass (hard exclusion: no gameplay,
no renderer migration). Whoever wires the real room needs to either accept
it as decoration only, or treat adding real 4-sided obstruction as a small
follow-up renderer task — flagged here, not solved here. `baseSize: 74` is
deliberately far above every other registered prop (next-highest is 48) —
verified in-engine it needs that scale to read floor-to-ceiling rather than
knee-high. Bottom-anchor was off by 5px on the raw generation (checked via
alpha-channel row scan, same method as the ceiling-art pass) — corrected by
shifting the canvas content down 5px before registering.

Screenshots: `docs/hot-bois-art-review/screenshots/hotboi-pillar-{close,far}.png`
(1 tile and 2 tiles, temporarily placed via `mapSprites` on a real F1 cell,
then reverted — not committed).

| id | size | baseSize | candidates | notes |
|---|---|---|---|---|
| hotboi-pillar | 128x256 | 74 | 1 | accepted first try — massive timber shaft, iron straps, stone base, reads as genuinely structural at both 1 and 2 tile distances |

## Hearth (`public/assets/wall-features/`)

Same near-full-face wallFeature approach as the bar. Verified in-engine
(1 asset alone, reverted). Screenshot: `docs/hot-bois-art-review/screenshots/hotboi-hearth-inengine.png`.

| id | size | candidates | notes |
|---|---|---|---|
| hotboi-hearth | 240x240 | 1 | accepted first try — arched masonry, mantel with objects, stacked firewood, fire poker, glowing embers |

## Chandelier + hanging bar rack (`public/assets/ceiling-sprites/`)

Both top-anchor flush at row 0 with no correction needed. Verified in-engine
individually (stacking all three P1 hanging/wall pieces in one tight
corridor cell was tried first and was too cluttered to judge — reverted,
retested one at a time). Screenshots: `docs/hot-bois-art-review/screenshots/hotboi-{chandelier,hanging-rack}-inengine.png`.

| id | size | baseSize | candidates | notes |
|---|---|---|---|---|
| hotboi-chandelier | 160x100 | 56 | 1 | accepted first try — broad iron ring, chains, lit candles; baseSize pushed well above every other ceiling sprite so it genuinely dominates, per the "big fake geometry" principle |
| hotboi-hanging-rack | 96x72 | 40 | 1 | accepted first try — tankards on an iron rail, kept secondary in scale to the chandelier |

## Furniture (`public/assets/map-sprites/`)

Curated per the brief's own "1-2 table compositions rather than dozens of
individual props" guidance — table and keg-stack are baked compositions
(mugs+bread; barrels+tapped keg), not single objects. Standalone chair/stool/
bottle-crate skipped: stools are already part of `hotboi-bar-center`'s
composition, and the base game's generic `crate`/`barrel` map-sprites cover
that role without new art. All three needed a bottom-anchor correction
(4-7px gap, same alpha-scan method as every prior asset this pass). Verified
in-engine (table+bench together, then keg-stack alone — reverted).

| id | size | baseSize | candidates | notes |
|---|---|---|---|---|
| hotboi-table | 64x56 | 30 | 1 | accepted first try — round table, two mugs, half a loaf |
| hotboi-bench | 64x36 | 28 | 1 | accepted first try — simple long bench, clean silhouette |
| hotboi-keg-stack | 56x56 | 32 | 1 | accepted first try — barrel/keg pyramid, one tapped |

## Wall art (`public/assets/wall-features/`)

Frac/anchor pre-committed before generating, per §18's anti-slop rule —
irregular collage (bottom), top-mounted trophy, narrow-vertical rack. None
are a centered rectangle at eye height. Notice-board verified in-engine
(reverted); trophy/key-rack were not (both already inspected at 5x zoom and
structurally sound — judgment call to save generation/screenshot budget,
noted here rather than left implicit).

| id | size | frac/anchor | candidates | notes |
|---|---|---|---|---|
| hotboi-notice-board | 92x88 | 0.4/0.5/bottom | 4 | v1-v3 all collapsed to a blank rectangular panel despite explicit "papers, torn edges, no frame, no board" language — the model has a strong prior toward a single flat panel for this concept. v4 broke it by describing a "collage of four separate rotated paper scraps" instead of one board — worked immediately. Rejected candidates kept for the record; this cost 4x the generations of anything else in the pass. |
| hotboi-monster-trophy | 76x92 | 0.35/0.45/top | 1 | accepted first try — horned beast skull on a plaque, restrained (not glowing/ornate) |
| hotboi-key-rack | 40x112 | 0.18/0.5/center | 1 | accepted first try — mismatched keys, two columns instead of the requested one, still reads as a coherent narrow rack |

## Kitchen (`public/assets/map-sprites/` + `public/assets/wall-features/`)

Minimum P1 kitchen set — stove, prep table, pantry shelving (clutter
compositions like hanging cookware rack / cauldron / sack pile are P2, not
generated this pass). Stove + prep table needed the same bottom-anchor
correction as the other furniture. Stove verified in-engine (reverted);
prep table and shelving were inspected at full res only, not screenshotted
individually — same time/generation-budget tradeoff as the wall art batch.

| id | size | baseSize/frac | candidates | notes |
|---|---|---|---|---|
| hotboi-kitchen-stove | 64x64 | baseSize 34 | 1 | accepted first try — soot-blackened brick, glowing firebox, iron pot |
| hotboi-kitchen-prep | 64x52 | baseSize 32 | 1 | accepted first try — butcher table, cleaver, vegetables |
| hotboi-kitchen-shelves | 240x240 | 0.98/0.95/bottom | 1 | accepted first try — sacks, jars, hanging dried herbs and garlic, bread, cabinet below; cluttered/utilitarian per the kitchen brief |

## P2 — secondary lantern + clutter (`public/assets/ceiling-sprites/` + `public/assets/map-sprites/`)

Curated P2 pass, not exhaustive — brief's own stop condition ("additional
generations start becoming redundant") applies once the room has enough to
compose from. Lantern verified in-engine (reverted); the two clutter piles
were inspected at full res only.

| id | size | baseSize | candidates | notes |
|---|---|---|---|---|
| hotboi-lantern | 44x64 | 30 | 1 | accepted first try — modest iron/brass lantern, correctly reads as secondary next to the chandelier |
| hotboi-bar-clutter | 48x36 | 22 | 1 | accepted first try — mugs, bottle, coins, dice; 2px bottom-anchor correction |
| hotboi-kitchen-clutter | 48x40 | 22 | 1 | accepted first try — sack, cheese, sausage, small pot |

## Rejected/superseded candidates

Kept in `art/pixellab-candidates/hot-bois-tavern/` for the record.
