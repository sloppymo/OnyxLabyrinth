# Level 2 Visual Bible — "The Sunken Processional"

The visual thesis and reusable environment kit for Level 2, built for Maze
Renderer 2 (WebGL, variable-height cells, ramps/stairs). The reference
implementation is the vertical-slice floor `src/content/floors/level-2-slice.json`
(35 traversable cells), driven by `scripts/playtests/level2-slice-map.mjs` and
captured by `scripts/playtests/level2-slice-walk.mjs`.

**Status:** slice validated 2026-08-11 by a continuous (non-teleporting),
HUD-off playthrough of the full route — see `progress.md`'s 2026-08-11
entry. No navigation confusion, dead zones, repetition, or broken reveals
found. Treat the slice as **locked**: no further polish pass on it absent a
specific problem found while building the real floor. It is now the
reference for the visual grammar above and the pacing grammar below.

## Visual thesis

Level 2 is a **ceremonial descent-road that outlived its purpose**: a
processional causeway of megalithic masonry, bronze fittings, and votive
clutter, built to parade downward toward a gate that never opened. It is
ancient, dry, warm-dark, and maintained by nobody — but *used* by somebody
(bowls get restacked, standards get dropped).

It is not Floor 1 (mossy olive crypt, small brick) and not Isobel's
(indigo/brass boutique). It is **monumental umber**: bigger blocks, warmer
shadow, taller air.

### Palette

| Role | Colors |
|------|--------|
| Shadow | `#241f1a`, `#2e2a24` |
| Basalt (dominant) | `#3b342c`, `#4f463a`, `#655a4b` |
| Sandstone trim (secondary, sparing) | `#8a7a5c`, `#a8946e` |
| Aged bronze (fittings) | `#5a4a28`, `#8a6f3a`, `#b08d4a` |
| Oxblood (rare accent: paint, banners) | `#6e2f28` |

Measured shipping luminance: wall ~65, floorA ~54, floorB ~48, ceiling ~40.
Stay inside the project's target band (wall 55–90, floors 45–80, ceiling 40–70,
see `docs/TILESET-ART-STYLE-GUIDE.md`).

### Materials and construction language

- **Walls:** megalithic ashlar — very large running-bond blocks (about 3
  courses per 128px logical tile). Dark mortar, chisel pitting. No small
  brick; Floor 1 owns small brick.
- **Floors:** huge worn flagstones; floorB is the settled/cracked twin.
  Pale sand sits in the joints (the place is *dry*, not wet — F5 owns wet).
- **Ceilings:** dark coffered vault, beams slightly warmer than panels.
  Ceilings recede; they are never the brightest surface.
- **Doors:** bronze-banded dark timber slab in a stone surround; the texture
  includes its own wall frame like the campaign doors.
- **Trim:** sandstone is reserved for edges that matter (door surrounds,
  lintels). Bronze is hardware: straps, rings, chains, grates, plates.

## Height grammar

Height is contrast, not a uniform upgrade. The slice demonstrates the scale:

| Space | ceilingZ | Use |
|-------|----------|-----|
| Ordinary corridor | 1 | Default compression |
| Seam / slot | 2.5 | Brief vertical foreshadow, hanging chains |
| Threshold antechamber | 1.5 | "You are entering somewhere" |
| Climb shaft | 2 | Ramps rising in quarter steps |
| Chapel (secondary room) | 2 | Intimate tall |
| Gallery | floorZ 1, ceilingZ 3 | Elevated ledge, 2 units of air above |
| Procession hall | 3 | Rare monumental reveal |

Rules of thumb:

- Never make two adjacent *ordinary* areas tall; the tall space must be
  earned by a compressed approach.
- Elevation changes use ramp/stair connectors (`ramps[]`); flat-to-flat
  steps between different floorZ are invalid by design.
- A 4-cell quarter-step ramp chain (0 → .25 → .5 → .75 → 1) reads as a
  processional ascent; 2-cell `stairs` connectors read as a grand stair.
- Connector cells must keep their side edges walled — plan 1-wide climbs,
  or parallel flights separated by a spine wall.

## Vertical motifs

- **Chains and hooks** hanging from high ceilings (the place hoisted things).
- **Square hoist shafts** as ceiling features above important cells.
- **Counterweights**: suspended stone blocks, bronze-strapped.
- **Processional reliefs**: marching-figure friezes on approach walls.
- **Votive niches** with offering bowls at rest points.

## Fog and light

- The renderer's exponential fog (near-black) is the darkness language; tall
  rooms fade upward and inward. Do not fight it with bright textures.
- Warm local glow comes from brazier props (`descent-brazier` carries a
  `light` def: `255,154,60`, radiusScale 1.3, intensity ~0.34). One glow per
  landmark view; never line corridors with them.

## Hero landmark rules

The slice's hero is the **Gate of the Kept**: two full-cell wall-feature
leaves (hand-finished, opaque) on the hall's south wall, a suspended
counterweight hanging in front from ceilingZ 3, hoist-shaft ceiling features
above, brazier glow flanking it in the alcoves.

When building new Level 2 landmarks:

- Compose from primitives (wall features fill the *first* vertical unit only;
  ceiling sprites top-anchor at the resolved ceiling and can span multiple
  units; ceiling features replace a cell's ceiling tile).
- One landmark per major space. It must read at 3–5 cells of distance through
  fog — strong silhouette, restrained palette, no glow-spam.
- No giant glowing runes. Ever.
- **The Gate of the Kept is this slice's one hero motif, not a template.**
  Each major region built after this slice needs its own spatial idea —
  a different kind of reveal, not another gate-leaves + counterweight +
  hoist-shaft composition. Copying it dilutes the thing that makes it land.

## Pacing grammar

Validated by the 2026-08-11 continuous walkthrough (see `progress.md`) as
this sequence, in order:

1. **Compression** — ordinary 1× corridor, nothing to look at.
2. **Foreshadowing** — a seam/slot cell (taller ceiling, hanging chain)
   flashes the vertical motif before it pays off.
3. **Vertical transition** — the climb (ramp risers, sconce/relief on the
   flanking wall) is itself the content for that stretch, not a delay
   between rooms.
4. **Widening/release** — the gallery or hall opens ceiling and floor plan
   at once; this is where held breath lets out.
5. **Distant landmark** — the hero motif reveals itself from several cells
   out, in full light — not at its own doorstep. A close-up on the landmark
   can and should be darker/quieter (see the Gate's asymmetric sconces);
   the reveal beat happens on approach, not on arrival.
6. **Optional side interest** — a secondary room (the chapel) branches off
   the main line through its own door; it is not on the return path by
   default.
7. **Return shortcut** — the loop closes via a second connector, not a
   walk back down the same corridor.

Skipping step 5's distance requirement is the most likely mistake: a
landmark first seen up close reads as clutter, not a destination.

## Prop vocabulary (reusable kit)

Common: relief frieze, votive niche, bronze grate, repair plate, sealed
valve (functional/ambiguous mechanism), structural band, animated sconce,
toppled column drum, rubble, offering bowls, fallen standard, heavy chain,
censer, ceiling cross-beam, floor drain grate, floor processional inlay.
Rare/hero: gate leaves, counterweight, ceiling shaft/medallion, brazier.

Floor variation has no decal primitive — it ships as a localized
`tilesetZones` swap to an alternate `floorA`/`floorB` pair (theme folders
`descent-grate`, `descent-inlay`), not a sprite. Keep these to single cells
at meaningful spots (a machinery corner, a threshold); a floor is not a
canvas for repeated decals. See `docs/level2-descent-asset-manifest.md`.

Wear language is *specific*, not random damage: bronze repair plates bolted
over cracks, mismatched reused masonry (floorB), dropped standards, neatly
restacked bowls. See `docs/level2-descent-asset-manifest.md` for the catalog.

## Pixel-art rules (project standard, restated for Level 2)

- 128×128 logical, ship 256×256 at 2× nearest for tileset surfaces; sprites
  ship at 2× their working canvas with binary alpha (0/255 only).
- Hard pixels, no antialiasing, no painterly gradients; dither sparingly.
- Map sprites are bottom-grounded; ceiling sprites top-pinned; wall features
  tightly cropped and centered.
- De-AI pass is mandatory: kill centered jewels, pseudo-runes, even ornament
  spacing, bilateral symmetry, floating parts. PixelLab output is a *candidate*.
- `light.color` in `map-sprites.ts` is an `r, g, b` triplet string, not hex
  (both renderers wrap it in `rgba(...)`).

## Composition examples (what good looks like)

- Approach: long 1× corridor, door as the only focal point.
- Reveal: from the gallery stair top, the hall floor drops away; a single
  warm light anchors the far end.
- Hero: gate centered, counterweight above, chains flanking, glow from one
  side only.

## Things to avoid

- Tiling one brick texture up a tall wall and calling it done — articulate
  with cell geometry (alcoves, pilaster notches), hanging sprites, and
  ceiling features instead.
- Cyan/purple magic shorthand, gemstone centers, pseudo-text.
- Bright ceilings; even value bands with no dominant/shadow relationship.
- More than one glow source per view.
- Props floating off the floor line (bottom-ground them) or clipping the
  camera in 1-wide tall rooms (ceiling sprites need headroom).
