# Floor 2 Abyss Bridge Entrance — Implementation Note

Date: 2026-08-13
Branch: `feat/floor2-abyss-bridge-face`
Base: `feat/floor1-vertical-revamp-qa` (`2089c00`)

## Existing Floor 2 audit

Floor 2 is a hand-carved 14×14 map. The Floor 1 transition currently lands on
the `stairs_up` tile at `(2,11)` in the southwest atrium; a new game/floor
transition faces north. The rest of the floor forms a loop through the west
stacks, north corridor, scriptorium, reading hall, forbidden wing, and southeast
stair room. The Floor 3 return stair remains `(11,12)`. Vestra remains `(1,1)`;
treasures remain `(12,3)` and `(12,8)`; the lexicon-key lock remains
`(10,7)e`; all eight events, four decor sprites, and existing encounter zones
remain in place.

## Chosen floor plan

The map grows south from 14×14 to 14×26, so no existing coordinate other than
the Floor 1 arrival stair changes.

- Existing library/atrium: rows `0–12`, unchanged.
- North masonry throat: bridge centerline `(2,13)`.
- Exposed bridge: `(2,14)` through `(2,20)`, seven tiles, north/south.
- South masonry throat: rows `21–24`, centered on `x=2`.
- New `stairs_up` / Floor 1 arrival: `(2,23)`, facing north.
- Buffer row: `25`, preserving the renderer's absolute-edge safety margin.
- Abyss cells: the non-bridge cells surrounding rows `13–24`; they are
  authored as non-walkable void and opened toward the map boundary so neither
  backend invents a distant perimeter wall.
- Bridge and throat are a safe encounter zone. Existing Floor 2 combat density
  elsewhere is unchanged.

## Reusable schema and traversal changes

`Cell.void?: true` means the cell has no walkable surface and contributes no
floor or ceiling geometry. `Cell.noCeiling?: true` suppresses only its ceiling;
the exposed bridge uses this while remaining walkable. Both fields round-trip
through FloorMapJSON and the schema/editor/export pipeline. Validation rejects
void starts, features, ramps, and redundant `void + noCeiling` cells. Traversal
rejects entry into void before height-connection checks. Automaps continue to
show only explored walkable bridge cells.

## Face rendering strategy

Add a reusable `environmentalSprites` floor definition for fixed-orientation,
animated world planes. The abyss face is one seamless west-facing plane east of
the bridge, centered at `(4.7,16.5)`, 4.8 map tiles wide along the bridge and
4.6 legacy wall-heights tall. It does not billboard toward the
camera. WebGL uses a fixed Three.js plane and nearest-filtered sprite-sheet
frames; Canvas uses the same definition and texture, projected as narrow
overlapped vertical strips to preserve perspective without tile seams. Different
parts enter/leave the frustum naturally as the party walks.

The production sheet contains neutral eye-track states (south/center/north), a
blink, and three mouth openings. Frame selection combines discrete player-Y
tracking, a restrained periodic blink, and whether the face's ambient bark is
currently active.

## Encounter and text presentation

The authored encounter lives in a focused data module: spatial first-crossing
triggers, direction-aware repeat pools, one-shot cue ids, silence weights,
cooldowns, and context selectors are data rather than coordinate branches in
`main.ts`. A pure resolver updates a small persisted encounter-progress record.
The first northbound crossing is authored; later north/south crossings use
weighted pools and may stay silent. Representative party context covers KO,
low HP, poison, no Mage, high/low gold, and high-level returners. Rotation
acknowledgements use the same resolver.

Lines render in a compact FF6-style environmental bark box that does not block
movement or replace the ordinary modal dungeon-dialog system.

## Audio and ambience

Void adjacency drives a reusable abyss ambience layer: sparse low wind/rumble,
with dungeon music ducked rather than replaced. The fart
is a dedicated procedural low-bit/noise cue in the existing audio engine and is
fired by one authored first-crossing cue only.

## Art pipeline

Generate a small candidate set through the repository's PixelLab pipeline,
palette-locked to the current Floor 2 material family. Select at gameplay scale,
then use Aseprite for exact dimensions, opaque-palette reduction, transparent
edge cleanup, symmetry/cluster correction, and deterministic frame assembly.
Keep the production sheet, its Aseprite source, the selected source candidate,
and a short generation log; discard rejected candidates from the branch.

## Principal risks and QA

- Canvas floor casting must skip void/no-ceiling samples without invalidating
  its frame cache contract.
- Rays crossing void must escape to black rather than hit a fabricated map-edge
  wall.
- The face plane needs conservative near clipping, depth behavior, and strip
  overlap in Canvas to avoid seams.
- Save migration must initialize encounter progress without disturbing existing
  v17 saves.
- Renderer changes require the standard corridor regression captures in
  addition to the eight entrance views requested for both WebGL and Canvas.
