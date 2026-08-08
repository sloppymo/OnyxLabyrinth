# The Camp — Floor 1 location gate

Date: 2026-08-08
Branch: `agent/floor1-camp`
Audited revision: `831448317b1792e9e2b8013ee61798d4e427809c`

## Result

The current 24×28 Floor 1 has no safe approximately 10×10 unused-rock region.
The Camp cannot be carved at the requested scale without either overwriting
substantial authored content or enlarging the floor dimensions.

This was a mission stop gate. The user approved an eastward expansion with
additional future-proof rock on 2026-08-08. No existing coordinates moved and
no PixelLab production batch began before approval.

## Method

A cell counted as authored/active when any of the following was true:

- one or more of its four edges was not `wall`;
- it carried a tile feature;
- it was referenced by an event, treasure, water, NPC, map sprite, wall
  feature, ceiling sprite, ceiling feature, door feature, lock, teleporter,
  chute, barred gate, raft route, or other coordinate overlay.

Every 10×10 rectangle inside the required one-cell absolute-grid safety margin
was scanned. The audit also searched all smaller untouched axis-aligned
rectangles from 6×6 through 11×11.

## Quantitative findings

- Safe-margin 10×10 rectangles available: **0**.
- Safe-margin untouched rectangles of at least 6×6: **0**.
- Largest untouched axis-aligned rectangle: **17×3** at `(1,1)`–`(17,3)`.
- Least-conflicting 10×10 candidate: `(1,1)`–`(10,10)`, with **28 active
  cells** and 13 coordinate overlays inside it.
- The tied candidate `(1,2)`–`(10,11)` has the same 28 active cells and the
  same overlay conflict.

## Ranked in-bounds candidates

| Rank | Bounds | Active cells overwritten | Why it is not safe |
|---|---|---:|---|
| 1 | `(1,1)`–`(10,10)` | 28 | Cuts through Saint Namanda's chapel wing, its NPC, hero door approach, treasure, chute, events, ceiling art, and accepted environmental features. |
| 2 | `(1,2)`–`(10,11)` | 28 | Same chapel/Namanda conflict; merely shifts the empty top strip. |
| 3 | `(2,1)`–`(11,10)` | 29 | Adds both sides of the Namanda hero door to the chapel conflicts. |
| 4 | `(2,2)`–`(11,11)` | 30 | Adds the central junction/ceiling landmark as well as the church content. |
| 5 | `(4,1)`–`(13,10)` | 34 | Spans the church/ember intrusion boundary and consumes both established regional routes. |
| 6 | `(13,9)`–`(22,18)` | 37 | Cuts through the central east route, Upward Cistern content, treasure/water/event space, and Tallow's area. |

The remaining candidates are worse. None can be reframed as harmless rock:
all require removing large stretches of authored circulation and/or accepted
hub, puzzle, event, treasure, NPC, or regional-art content.

## Content explicitly preserved by stopping

- campaign start `(11,25)`;
- stairs and the stairs guardian route;
- raft channels and water puzzle;
- Saint Namanda's chapel, Sister Caldris, hero door, and church art;
- Hot Boi's Tavern, Hot Boi, hero door, and safe hub route;
- all six treasures and twelve events;
- all five current NPCs;
- locks, barred gates, teleporters, chute, and regional intrusion themes;
- all current map, wall, ceiling, and door feature placements.

## Least-invasive way forward

The approved option is an eastward-only width expansion from **24×28 to
40×28**. This preserves every existing coordinate and gives the new authored
region five columns of rock beyond the Camp.

Proposed first-pass geometry after approval:

- 10×10 walkable Camp heart: `(25,8)`–`(34,17)`;
- east safety/future headroom: untouched solid-rock columns `x=35`–`x=39`;
- enclosed approach: extend east from the existing open route at `(22,12)`
  through rock cells `(23,12)` and `(24,12)`;
- entrance orientation: player travels east through a narrow corridor and
  crosses the threshold into the Camp;
- new Camp theme zone: sized to the Camp and approach only, leaving existing
  Floor 1 regional themes unchanged.

Why east is preferred:

- no existing coordinate shifts, unlike inserting north/west rows or columns;
- no existing content needs to move or be deleted;
- the entrance can branch from a current east-side route without touching its
  overlays;
- it anchors a new far-eastern destination, spatially distinct from Saint
  Namanda in the northwest and Hot Boi's lower refuge;
- it also puts new rock beyond the current eastern boundary, avoiding another
  edge-flush bespoke room.

The extra four columns beyond the minimum were explicitly approved as unused
future headroom. They are not permission to enlarge or add speculative Camp
content in this pass.

Southward expansion is technically possible but is not recommended: it would
place the Camp close to the campaign start and the lower refuge network,
weakening the requested geographic separation between hubs.
