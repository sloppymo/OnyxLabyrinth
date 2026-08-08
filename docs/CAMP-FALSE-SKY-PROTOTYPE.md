# The Camp — false-sky P0 gate

Date: 2026-08-08
Branch: `agent/floor1-camp`
Raw captures: `docs/camp-art-review/screenshots/false-sky-prototype/raw-gameplay/`

## Decision

**PASS after one rejected art treatment. No renderer extension is required.**

The existing regional theme, floor caster, and ceiling caster can make the
10×10 Camp heart feel materially larger and cooler than ordinary Floor 1.
The accepted technical approach is:

- a dedicated `camp` regional theme;
- worn dirt for `floorA`/`floorB`;
- low-contrast twilight for `ceiling`;
- old courtyard masonry at the perimeter;
- only a few existing per-cell `ceilingFeatures` for sparse stars or later
  false-sky clues;
- large billboards, warm local sources, smoke, tents, and banners to provide
  the outdoor context without changing projection math.

## Candidate findings

### Candidate 1 — rejected

The first draft used distinct broad elliptical cloud masses. The ceiling
caster repeated those motifs once per world cell and perspective converted
them into an obvious polka-dot roof. It failed the gate despite otherwise
useful darkness and openness.

Reusable lesson: any discrete Camp-sky motif becomes a stamp. Prefer a nearly
solid field, long edge-crossing wisps, and sparse per-cell variants.

### Candidate 2/3 — accepted architecture

The accepted draft is a muted navy field with very small value shifts and
three sparse star-feature cells. At raw gameplay exposure:

- the sky remains a mid-dark cool mass rather than a bright-blue light source;
- the 8–9 tile view is visibly more open than a corridor;
- fog creates a useful soft horizon instead of exposing a giant square box;
- the perimeter remains old masonry and therefore still belongs to the
  labyrinth;
- repetition is not a first-glance motif;
- faint ceiling perspective survives as restrained wrongness rather than a
  visual defect.

The empty prototype alone is intentionally austere. A large tent, wagon,
campfire, tree, and populated work zones must provide the final outdoor read.
The next gate is to add contextual hero assets without increasing sky detail.

## Raw gameplay capture set

1. dungeon approach;
2. threshold;
3. first reveal;
4. one-tile wall read;
5. three-tile view;
6. five-tile view;
7. eight-tile view;
8. longest axial view;
9. longest cross view;
10. looking back toward the threshold.

All captures are raw gameplay exposure. No brightened images are used as
authoritative evidence.
