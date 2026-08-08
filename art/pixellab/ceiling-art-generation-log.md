# Floor 1 Ceiling Art — PixelLab Generation Log

Path used: **REST** (`scripts/pixellab-generate.mjs` against
`api.pixellab.ai/v2/create-image-pixflux`). No PixelLab MCP server is
configured in this repo; REST was used directly, matching the prior
wallFeatures pass (`art/pixellab/maze-environment-generation-log.md`).

Every hanging sprite was conditioned (`--palette`) on the actual `wall.png`
of the theme its Floor 1 placement zone resolves to (`tilesetZones` in
`src/content/floors/floor-1.json`); every ceiling feature was conditioned on
the matching `ceiling.png`, since a feature fully replaces the sampled
ceiling texture for its cell rather than compositing over it.

Total generations: 21 (18 accepted first-candidate, 3 rerolled once).

## Hanging sprites (`public/assets/ceiling-sprites/`)

| id | palette ref | size | candidates | notes |
|---|---|---|---|---|
| f1-chain-hook | f3_wall (forge) | 64x128 | 1 | accepted first try |
| f1-chain-long | f1_wall (crypt) | 56x144 | 1 | accepted first try |
| f1-chain-broken | f1_wall (crypt) | 48x88 | 2 | kept v01 (two-chain pair); v02 came out noisy/blocky, discarded |
| f1-cage | f1_wall (crypt) | 88x128 | 1 | accepted first try — hero landmark |
| f1-censer | f4_wall (chapel) | 56x96 | 1 | accepted first try |
| f1-bell-cracked | f4_wall (chapel) | 56x96 | 1 | accepted first try |
| f1-root-curtain | f5_wall (cistern) | 72x128 | 1 | accepted first try |
| f1-root-bundle | f5_wall (cistern) | 56x104→64x96 | 2 | v01 read as a thin wispy strand, too similar to root-curtain; v02 (explicit "much thicker, blunt, architectural") accepted |
| f1-lantern-hanging | f1_wall (crypt) | 48x80 | 1 | accepted first try |
| f1-forge-counterweight | f3_wall (forge) | 64x120→56x104 | 2 | v01 read as a second lantern (windowed/glowing); v02 (explicit "solid iron mass, no windows, no glow") accepted |

## Ceiling features (`public/assets/ceiling-features/`)

All 256x256, matching the campaign `ceiling.png` dimensions exactly (the
per-pixel ceiling cast maps a cell's local UV across the full texture, so
each of these is really an alternate "ceiling tile" for one cell, not a
decal). All accepted on the first candidate.

| id | palette ref | reads as |
|---|---|---|
| f1-ceiling-grate | f5_ceiling (cistern) | iron grate over a dark void, radial masonry border |
| f1-ceiling-crack-roots | f5_ceiling (cistern) | hairline crack + one root growing through |
| f1-ceiling-beam | f1_ceiling (crypt) | heavy timber cross-brace with iron corner fittings — landmark-strength |
| f1-ceiling-chain-plate | f3_ceiling (forge) | riveted iron plate with a central hanging ring |
| f1-ceiling-drain | f5_ceiling (cistern) | dark circular drain, wet-stain halo |
| f1-ceiling-hole | f1_ceiling (crypt) | broken masonry gap with rubble at the edges |
| f1-ceiling-water-stain | f5_ceiling (cistern) | subtle damp discoloration — the "ordinary dressing" entry |
| f1-ceiling-namanda-mark | f4_ceiling (chapel) | plain worn sun/wheel relief medallion, no invented iconography (no canonical Namanda symbol exists in the merged codebase — see task note in `docs/AGENT-READING-LIST.md`-style caveat below) |

**Namanda note:** no canonical Namanda visual symbol exists anywhere in
`main` (checked `docs/**/*.md` for the string — zero hits; a symbol does
exist on the unmerged `agent/tavern-hero-door` branch per prior-session
memory, but that branch isn't merged and wasn't pulled in). Per the task's
own fallback instruction, this pass did not invent one — the chapel relief
is a neutral worn medallion, and `f1-censer` (chapel-palette hanging censer)
is the "Namanda-compatible" asset the task asked for.

## Rejected/superseded candidates

Kept on disk in `art/pixellab-candidates/ceiling/` for the record, not
shipped: `f1-chain-broken-02` (noisy), `f1-root-bundle-01` (too thin),
`f1-forge-counterweight-01` (read as a lantern, not a weight).

## Second pass — placement + one new floor (2026-08-08)

Placed the two Floor 1 ceiling features that were generated in the first
pass but never wired into `floor-1.json`: `f1-ceiling-grate` at (17,19)
over the shallow-water cistern room (pairs with the existing drain/water-
stain features already in that zone) and `f1-ceiling-crack-roots` at (9,15)
in the overgrown-library zone.

Then generated one new sprite for Floor 4 (The Null Choir), palette-
conditioned on `public/assets/tilesets/f4/wall.png` (cold purple-grey, pale
lilac/white accents, no orange — per `TILESET-ART-STYLE-GUIDE.md` §F4):

| id | palette ref | size | candidates | notes |
|---|---|---|---|---|
| f4-bell-cracked | f4_wall (choir) | 56x96 | 1 | accepted first try — matches the existing F4 `(10,2)` damage event ("The cracked bells overhead strike a chord you cannot hear") which previously rendered nothing |

`f4-bell-cracked` reuses the F1 `f1-bell-cracked` silhouette language
(cracked bell + short chain) but is a fresh generation, not a recolor —
palette-conditioned directly on the F4 wall texture rather than adjusted
from the F1 asset, keeping it consistent with how every other sprite in
this pack was made.

## Cost

21 `create-image-pixflux` generations, no auth/infrastructure issues.
`no_background: true` (the default for hanging sprites) returned genuine
per-pixel alpha — no flood-fill chroma cleanup needed. Ceiling features used
`--background` (opaque) since they replace a texture, not a transparent
billboard.
