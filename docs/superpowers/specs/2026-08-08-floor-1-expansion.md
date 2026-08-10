# Floor 1 expansion — revision 7

## Outcome

Floor 1, **The Hall of Five Wounds**, expands from `24×28` to `28×31` while
keeping every pre-expansion landmark, service, stair, guardian, NPC, chute,
raft route, and progression gate at its existing coordinate. The expansion
adds 94 authored walkable cells, moves the existing `crypt-key` reward deeper
into the new Cistern Overflow Gallery, and leaves a full rock buffer around the
new absolute grid boundary for the floor/ceiling renderer.

The four supplied Floor 1 texture references already match the shipping files
under `public/assets/tilesets/f1/` byte-for-byte. The supplied attack strip
already ships for both `training-dummy` and `lesser-construct`. No asset
replacement was necessary.

## 1. Current floor audit (revision 6)

### Geometry and topology

| Metric | Revision 6 |
| --- | ---: |
| Dimensions | `24×28` |
| Bounding cells | 672 |
| Authored walkable cells | 274 |
| Walkable density | 40.8% |
| Authored graph edges | 356 |
| Graph cycle rank | 83 |
| Dead ends | 8 |
| Three/four-way cells | 128 |
| Weighted mandatory route | 63 traversal units |
| Unique cells on mandatory route | 51 |

“Walkable” means a cell with at least one non-wall edge. The graph cycle rank
is `edges - vertices + connected components`; it is reported instead of a
subjective count of every room-sized loop. The mandatory-route model requires
the `crypt-key`, chute/raft pickup, raft traversal, and Returned Party clear;
the four-cell raft crossing costs three traversal units.

### Content inventory

| Content | Revision 6 |
| --- | ---: |
| Named major rooms/landmarks | 9 |
| Tileset zones | 7 |
| Encounter zones | 6 |
| NPC/service encounters | 6 |
| Events | 12 |
| Treasures | 6 |
| Water placements | 7 |
| Map sprites | 16 |
| Wall features | 19 |
| Ceiling sprites | 13 |
| Ceiling features | 8 |
| Door features | 4 |
| Teleporter endpoints | 2 |
| Chutes | 1 |
| Locked doors | 1 |
| One-sided barred gates | 1 |
| Raft routes | 1 |

The nine named major spaces are the entrance threshold, Unfinished Index,
Upward Cistern, Cut-Bell Chapel, Ember Suture, Hot Boi’s Tavern, Church of
Saint Namanda, raft pocket, and Returned Party landing.

### Original critical path

1. Enter at `(11,25)` and orient in the central threshold.
2. Reach the Upward Cistern chest at `(20,12)` for the `crypt-key`.
3. Return to the locked north edge at `(11,12)` and enter the upper wounds.
4. Cross the Chapel to the chute at `(3,8)`.
5. Descend to `(3,22)`, acquire the raft, and release the pocket gate.
6. Return to dock `(14,21)`, cross to `(17,21)`, defeat the Returned Party at
   `(18,21)`, and descend at `(19,21)`.

### Strengths

- Six visually distinct authored regions plus the f1 threshold make the floor
  readable as a place rather than a single texture maze.
- The Church and Tavern are real services and visual landmarks, not flavor-only
  rooms.
- The lock, chute, one-sided return gate, raft channel, and guardian create a
  strong escalating traversal vocabulary.
- Existing event, treasure, NPC, and environmental density is already high.

### Weaknesses addressed

- The `crypt-key` sat at the end of a nearly straight eastward shelf, so the
  first progression objective did not ask the player to understand the Cistern.
- The Ember and Cistern regions touched the central hall but had little
  connective tissue with each other.
- Other adventuring parties were underrepresented outside the Returned Party.
- Hot Boi’s room touched the old absolute east edge, violating the renderer’s
  preferred one-cell boundary buffer.
- There was no optional safe discovery immediately below the entrance.

### Encounter pacing audit

The floor base rate remains `0.08`. Revision 6 ranged from `0.036` in the
Chapel to `0.12` in the Ember Suture, with a true safe zone around the central
rest area. The 63-unit mandatory route normally produces about 2–4 encounters;
moderate exploration is roughly 4–7 and a near-completionist pass roughly
7–11. These are pacing bands derived from the 8-step cooldown, local rate
multipliers, and forced encounter at 28 non-safe steps, not deterministic fight
counts.

## 2. Expansion blueprint

### Coordinate schematic

```text
NORTH

Cut-Bell Chapel / Namanda             Ember Suture
       (1..11, 2..11)        (11..22, 2..11)
                                      │ four old-wall entries
                                      ▼
                              Ember Stitchworks NEW
                               (21..26, 2..11)
                               - Morrow Company
                               - cursed blade cache
                               - cinder hazard
                                      │
                         one-way grate (24,11) south
                                      ▼
Unfinished Index        Upward Cistern ───── Cistern Overflow NEW
(1..9, 12..20)         (15..22, 12..20)      (22..26, 12..20)
                                             - crypt-key at (26,18)
                                             - north/south reconnection

raft pocket ── central threshold / raft ── Returned Party / Tavern
                                            (existing coordinates)
                         │ two open mouths
                         ▼
                  Surveyors’ Rest NEW
                    (8..15, 27..29)
                    - safe optional loop
                    - Second Survey party
                    - quiet fourth-bedroll discovery

SOUTH — row 30 remains solid buffer
```

The exact exported map is in
[`tools/floor-data/floor-1.txt`](../../../tools/floor-data/floor-1.txt).

### Why each addition exists

#### Ember Stitchworks — `(21..26,2..11)`

The Stitchworks explains how the Ember Suture is physically held together.
Four openings from existing Ember corridors create a braided regional loop.
Morrow Company supplies the requested short, strange adventurer-party
encounter. The northeast alarmed cache contains a cursed blade and healing
potion: a useful but dangerous sidegrade that gives Namanda’s Uncurse service
an early spatially-authored purpose.

#### Cistern Overflow Gallery — `(22..26,12..20)`

The Gallery makes the Cistern a place the player must actually learn. The
`crypt-key` moves from `(20,12)` to an untrapped chest at `(26,18)`; the old
chest stays at `(20,12)` with its healing potion, preserving the landmark and
reward beat. Multiple entries connect the Cistern’s north shelf, middle water
passage, and southern approach, creating a real traversal shortcut rather than
a decorative loop.

The new gallery rate is `0.072` per eligible flat-roll step (`0.08×0.90`),
lower than the old Cistern’s `0.10`. The key route is longer without making the
first floor proportionally more attritional.

#### Surveyors’ Rest — `(8..15,27..29)`

Two mouths below the entrance create a legible optional loop without connecting
across the raft/guardian barrier. The zone is truly safe and pauses pity. The
Second Survey gives route information and foreshadows temporary fifth-member
parties in two lines rather than a lore scene. The empty-bedroll event is the
quiet noncombat discovery.

### New loops and reconnections

1. The Stitchworks reconnects four Ember mouths through two long vertical
   spines and three cross galleries.
2. The Overflow Gallery reconnects four Cistern elevations and shortens later
   north/south travel.
3. Surveyors’ Rest loops between `(9,26)` and `(13,26)`.
4. The barred grate at `(24,11)s` can only be released from the upper Ember
   side; once opened it becomes a permanent two-way door into the Cistern.

The last two material reconnection moments are the intended “this connects
back here” reveals. The one-sided gate cannot bypass the original `crypt-key`
lock because it is not openable from the lower Cistern side.

### Secrets and optional risk

- The alarmed northeast Stitchworks cache is a clueable, risky dead end with a
  cursed sidegrade and nearby dialogue pointing to Namanda’s cure.
- Surveyors’ Rest is visible from two suspicious south openings near the start
  and rewards exploration with safety, a party encounter, and route guidance.
- The existing dark chute, folded Index teleporter, and northeast shield cache
  remain untouched.
- There are still no random hidden walls; Floor 1 rewards visible spatial clues
  rather than wall-humping.

### Art request list

No new art is required. The expansion reuses the existing f1/f3/f5 materials,
crates, barrels, bones, torches, chains, counterweights, water stains, scorches,
and bookshelf intrusions. Optional future polish could add a square-padded
“empty fourth bedroll” prop and a cold brazier for Morrow Company, but neither
is needed for readability or shipping.

## 3. Plausible first-playthrough route

1. The player enters at `(11,25)`. The two south openings reveal Surveyors’
   Rest; exploring it introduces another party, provides a safe mental anchor,
   and hints that the old key moved east.
2. The player follows the central threshold into the Cistern, sees the old
   `(20,12)` chest still in place, then discovers that the connected overflow
   galleries continue east and south.
3. The sweating-wall landmark and shallow water lead to the untrapped key chest
   at `(26,18)`. The multiple gallery mouths let the player choose a return
   elevation instead of retracing one corridor.
4. Back at `(11,12)`, the `crypt-key` opens the upper wounds. The Church,
   Chapel, and Ember routes remain where returning players expect them.
5. An optional Ember divergence finds Morrow Company and the cursed cache. At
   `(24,11)`, the player can release the service grate and realize it connects
   directly behind the Cistern they just explored.
6. The Chapel route reaches the existing chute at `(3,8)`. Accepting the drop
   lands in the raft pocket, grants the raft, and preserves the one-way-return
   lesson.
7. The player returns to the central docks, crosses the raft channel, defeats
   the Returned Party at `(18,21)`, and descends at `(19,21)`.

## 4. Implemented files

- `src/content/floors/floor-1.json` — revision 7 map and content.
- `src/game/floor1-expansion.test.ts` — expansion, boundary, coordinate,
  content, key-location, safe-zone, and one-way-gate contracts.
- `src/data/floors.test.ts` — updated authored NPC-count contract.
- `tools/floor-data/floor-1.{json,txt}` — editor/LLM mirror.
- `public/tools/floor-data/floor-1.{json,txt}` — shipped editor mirror.

## 5. Post-expansion metrics

| Metric | Revision 6 | Revision 7 | Change |
| --- | ---: | ---: | ---: |
| Bounding cells | 672 | 868 | +29.2% |
| Walkable cells | 274 | 368 | +34.3% |
| Walkable density | 40.8% | 42.4% | +1.6 pp |
| Weighted mandatory route | 63 | 75 | +19.0% |
| Unique mandatory-route cells | 51 | 71 | +39.2% |
| Optional walkable cells | 223 | 297 | +33.2% |
| Named major rooms/landmarks | 9 | 12 | +3 |
| Graph cycle rank | 83 | 121 | +38 |
| Dead ends | 8 | 10 | +2 |
| Authored shortcuts/reconnections | 2 | 4 | +2 |
| NPC encounters | 6 | 8 | +33.3% |
| Events | 12 | 16 | +33.3% |
| Treasures | 6 | 8 | +33.3% |
| Semi-secret optional branches | 3 | 5 | +2 |
| Encounter regions | 6 | 9 | +50.0% |
| Interactive mechanic placements | 18 | 22 | +4 |
| Map/wall/ceiling art placements | 56 | 73 | +30.4% |

“Interactive mechanic placements” counts locked doors, teleporter endpoints,
chutes, barred gates, raft routes, water definitions, and trapped treasures.
“Art placements” counts map sprites, wall features, ceiling sprites, and
ceiling features. The mandatory route grows by 19.0% in weighted movement—an
effective “about 20%”—while unique route tiles grow more because the relocated
key replaces repeated east-row backtracking with an actual Cistern circuit.

## 6. QA report

### Automated validation

- Focused Floor 1 suite: expansion contracts, campaign floor invariants, raft
  pocket/route, and Returned Party guardian.
- Full TypeScript test typecheck.
- Production TypeScript build and Vite build.
- Full Vitest suite.
- Floor parser/linter for all campaign floors.
- Floor export drift check against both generated mirrors.

The workspace blocks the `tsx` CLI's temporary IPC socket, so the two floor
commands were executed through `node --import tsx scripts/floor-tool.ts ...`.
That runs the same validator/export-check implementation without the denied
CLI control socket.

### Topology and progression validation

- All 368 authored cells form one connected graph when intended locked/barred
  edges are treated as eventually openable.
- The new `crypt-key` chest is reachable before any locked door.
- The lexicon remains behind the original `crypt-key` edge.
- The chute still lands at `(3,22)` and immediately grants the raft.
- The raft pocket remains escapable only by its inside release.
- The new Stitchworks gate is openable only from `(24,11)` facing south.
- The raft route and Returned Party still gate the stairs under the production
  progression model.
- Tavern, Church, Caldris, Hot Boi, Namanda’s altar, guardian, and stairs retain
  their old coordinates.
- No authored room touches row `0`, row `30`, column `0`, or column `27`.

### Warnings

The floor linter retains the same intentional pre-existing warnings:

- Namanda’s altar is non-attackable and has no combat encounter.
- `hotboi` and `namanda` are shipped custom themes outside the validator’s
  built-in `f1..f5` list.
- Namanda’s deliberately later tileset zones overlap the Chapel/Ember zones so
  the church material wins.

No new warning class is introduced by the expansion.

### Visual inspection

An exact top-down PNG generated from revision 7 was inspected for topology,
zone identity, feature distribution, progression seams, and the absolute rock
buffer. It confirmed that the new regions are connected as designed and that
the one-way gate is the only Ember-to-Overflow edge.

Headless Chromium was then installed and the production preview started, but
the workspace process sandbox terminates Chromium with `SIGTRAP` before page
creation. Consequently, the remaining manual in-engine corridor pass should
confirm:

- the new east rooms sample f3/f5 rather than default f1 near the horizon;
- the new south room remains f1 and does not expose the absolute boundary;
- the four old-to-Stitchworks openings read as deliberate architecture;
- the one-way grate does not visually imply an ordinary open passage;
- reused props do not occlude the Morrow Company or Second Survey interactions.
