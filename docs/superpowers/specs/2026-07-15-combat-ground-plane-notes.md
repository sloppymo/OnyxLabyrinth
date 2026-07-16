# Combat scene ground-plane contract (addendum notes)

Shipped 2026-07-15 with `combat-scene-math.ts`.

## Dead-floor strip

`seamY` is the usable foot plane (below side-wall joins), not the optical
horizon (~30%). The strip between optical horizon and `seamY` is visible
walkable-looking floor that sprites cannot occupy — intentional. Tight bands
(e.g. library ~200px) cap depth stagger; future art painted to a 25–35% seam
widens the band automatically.

## Floaters — deferred

Floating enemies (flame-skull / blood-wraith style) currently get the same
hard contact ellipse at `footY` as grounded sprites. Classic treatment is a
smaller/softer shadow with the sprite hovering above its footY. **Shadow
detach for floaters is deferred** — known cut, not an oversight.

## Scale endpoints

`scaleFar` / `scaleNear` are per-backdrop fields. Arena themes share
`0.78→1.0`; `combat-bg` / `corridor` use `0.72→1.0` so the taller band still
reads as a deeper room.
