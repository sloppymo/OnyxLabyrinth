# Floor 1 Vertical Revamp Bible — "The Hall of Five Wounds"

Spatial thesis for applying Maze Renderer 2 (variable-height cells,
ramps/stairs) to Floor 1, written **before** touching the floor itself —
per the workflow proven on the Level 2 slice (see
`docs/LEVEL2-VISUAL-BIBLE.md`): audit existing graph → write spatial thesis
→ graybox Z changes → continuous traversal → fix composition → only then
create/reuse art → localized lighting → route-at-speed QA → freeze.

This document is the **spatial thesis** step. The audit and graybox steps
are not done yet — see Prerequisites below before starting either.

## Prerequisites (open, not solved by this doc)

Floor 1 is not Level 2. The slice floor (`LEVEL2_SLICE_ID = 6`) is an
**unregistered** playtest-only pack, exempt from `floor:validate` and
`floor:export-check`. Floor 1 (`src/content/floors/floor-1.json`, id
`floor-1`, "The Hall of Five Wounds") is a **registered, shipped** pack
subject to both. Two things must be true before graybox work can start,
neither of which is true today:

1. **Renderer 2 must be merged (or at least reachable).** `feat/maze-vertical-traversal`
   (39 commits, 0 behind `main` as of 2026-08-11) has the WebGL
   variable-height backend, ramp interpolation, and sloped-boundary
   rendering. It is **not merged to `main`**. This worktree/branch
   (`feat/floor1-vertical-revamp`) is currently based on plain `main` and
   has zero `floorZ`/`ceilingZ`/ramp support anywhere in the codebase —
   confirmed by grep, not assumption. Before any graybox editing, merge or
   rebase in `feat/maze-vertical-traversal` (or an equivalent subset).
2. **The validator and exporter must learn the new fields.** `src/game/floor-validate.ts`
   (943 lines) has no concept of `floorZ`, `ceilingZ`, or ramps — it
   validates a purely 2D `FloorDef`. Adding Z-fields to `floor-1.json`
   without teaching `floor:validate`/`floor:export-check` about them means
   either the checks silently ignore the new data (false confidence) or
   reject the floor outright. Teaching the validator precedes any graybox
   work, not follows it.
3. **Watch for the `cloneFloor` gotcha.** `cloneFloor` has already once
   silently dropped a whole `FloorDef` field (`wallFeatures`, fixed
   `f7e3e47`) because a new field wasn't added to its spread/copy list.
   Any new `floorZ`/`ceilingZ`/`ramps` field is the same hazard class —
   verify `cloneFloor` (and any other structural clone/copy of `FloorDef`)
   explicitly carries it.

Nothing below requires these to be resolved to be *written*. They must be
resolved before anything below is *built*.

## Spatial thesis

Floor 1 is **the fractured Hall of Five Wounds** — an old, low crypt whose
five intrusions distort its architecture in five different vertical ways.
It is not a monumental processional (that's Level 2's umber grammar,
locked and not to be copied). Floor 1 stays a crypt: human-scale, familiar,
already-inhabited. The verticality is not decoration — it is what makes
each Wound legible as a place, without the HUD, from the shape of the
space alone:

> "I'm climbing, shelves are appearing above me — Index."
> "The ceiling just vanished and bells are hanging in darkness — Chapel."
> "The path is dropping and the walls are damp — Cistern."
> "I'm climbing through counterweights and scorched iron — Ember."

**Core rule: each Wound gets one distinctive spatial behavior, not merely
a different tileset.** The existing tileset-per-zone system already gives
each Wound a distinct palette (confirmed in `floor-1.json`'s
`tilesetZones`: `unfinished-index`→`f2`, `upward-cistern`→`f5`,
`cut-bell-chapel`→`f4`, `ember-suture`→`f3`, plus `hotboi-tavern`/
`namanda-church`/`namanda-church-threshold` on their own bespoke themes).
That solved color. It never solved shape. This pass solves shape.

## Preserve (frozen, no add/remove/reindex during the Z-pass)

Grounded in `floor-1.json`'s actual top-level keys, not prose intent:
`npcs`, `treasures`, `teleporters`, `lockedDoors`, `waters`, `raftRoutes`,
`chuteDrops`, `barredGates`, `stairsGuardian`, `events`, `doorFeatures`,
`encounterZones`, `mapSprites`, `wallFeatures`, `ceilingSprites`,
`ceilingFeatures`. Also preserve: Hot Boi's Tavern, Isobel's Iso-Spells,
the Church of Saint Namanda, Camp, and every recognizable regional
identity already shipped. A Z-pass changes `grid` cell heights and
connector geometry; it does not touch what's placed in those cells or
where progression gates sit.

## Transform

Ceiling heights, local floor elevations, ramps/stairs, regional-transition
architecture, sightlines, compression/release rhythm, distant-landmark
reveals, lighting composition, ceiling/floor/wall dressing.

## Do not

- Flatten the five Wounds into one aesthetic — each keeps its own
  tileset *and* now its own spatial behavior.
- Copy the Gate of the Kept, or any other Level 2 hero-motif composition.
  Level 2's rule stands for Floor 1 too: one hero motif is not a kit.
- Make every room tall. Height is contrast (see Level 2's height grammar);
  a crypt with five tall rooms has no compression left to release from.
- Use Z merely because the renderer supports it. Every Z change must serve
  the region's one spatial behavior, not decorate a room that doesn't need it.
- Destroy the mature gameplay graph (see Preserve) to make prettier
  screenshots.

## Feasibility gate — ceilingZ is cheap, floorZ/ramps are expensive

This is the collision the user's Transform list creates against the
Preserve list, and it has to be resolved per-region, not assumed away:

- **`ceilingZ` changes are free.** No connector cells, no edge rewiring,
  no route risk — a cell's ceiling height is local to that cell. This
  alone (plus ceiling features and localized lighting) delivers most of
  "each Wound reads distinctly," with zero risk to `npcs`/`treasures`/
  `teleporters`/`raftRoutes` placement or reachability.
- **`floorZ`/ramps are expensive.** Per Level 2's own height grammar,
  elevation changes must go through `ramps[]`/`stairs` connectors — flat-
  to-flat steps between different `floorZ` are invalid by design, and
  connector cells must keep their side edges walled (1-wide climbs, or
  parallel flights separated by a spine wall). Floor 1's region boundaries
  are multi-cell-wide, and the floor already carries `raftRoutes` over
  `waters`, `chuteDrops`, and `teleporters` crossing those boundaries.
  Raising a region's `floorZ` forces a walled 1-wide connector at *every*
  crossing — a topology edit to a graph that already has working
  progression logic threaded through it. Treat every proposed `floorZ`
  change as a named-connector-cell design decision, not a slider.

**Resulting split**, matching the user's per-Wound table:

| Region | Spatial behavior | Z budget |
|--------|-------------------|----------|
| Entrance / Camp / Isobel's | Low, human-scale, safe compression | ceilingZ only |
| Central Hall | Broadening datum / orientation space | ceilingZ only |
| Unfinished Index | Ascending shelves, upper archive galleries | floorZ + ramps — vertical movement *is* the identity |
| Cut-Bell Chapel / Namanda | Vaulted upward, bells/censers disappearing overhead | ceilingZ only — the vault is height, not elevation change |
| Upward Cistern | Descending toward water / lower channels | floorZ + ramps — vertical movement *is* the identity |
| Ember Suture / Stitchworks | Rising industrial route, ramps, machinery, heat | floorZ + ramps — vertical movement *is* the identity |
| Returned Party landing | Final elevation crescendo before Floor 2 | floorZ + ramps — single deliberate connector, last beat of the floor |

Only four rows carry the expensive treatment, and each has a stated reason
tying the elevation change to the region's identity rather than to "tall
rooms look cool." Every other Wound gets its distinct read from
`ceilingZ`, dressing, and lighting alone.

## Open work (next steps, not done in this document)

1. Resolve the two prerequisites above (merge/rebase Renderer 2 in;
   teach the validator/exporter about the new fields).
2. Full content audit of the four expensive regions: name the actual
   grid cells that become connectors, and confirm each against
   `raftRoutes`/`chuteDrops`/`teleporters`/`npcs`/`treasures` coordinates
   already in `floor-1.json` so no existing placement gets orphaned by a
   floorZ boundary.
3. Graybox the Z changes on a copy/branch, then run the same
   continuous-traversal + blind-playtest QA methodology validated on the
   Level 2 slice — before any new art.
