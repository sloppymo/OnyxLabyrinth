# Dungeon quick-map overlay

`V` or the controller's `Y` button toggles a translucent, nonmodal map over the
live first-person dungeon view. The semantic `Y / V · MAP` button in the
lower-right of the dungeon viewport invokes the same action for pointer users
and reports its state with `aria-pressed`. `M` still opens the existing opaque,
modal full automap, and `Tab` still opens the action ring.

## Behavior

- The map is north-up. The gold, dark-outlined pixel arrow remains inside the
  current cell and points north, east, south, or west as the party turns.
- Movement, turning, doors, discovery, tile effects, and encounters continue
  normally while the quick map is open.
- The player-centred camera uses square integer-sized cells. It shows roughly
  13 by 11 cells on large floors, clamps at floor edges, and fits small floors
  when possible. The panel itself occupies 72% of the dungeon viewport in both
  dimensions and never covers the party strip.
- Walls are normalized into one shared edge before drawing, avoiding doubled
  boundaries. Doors use an amber bracket mark; locked doors use a red crossed
  mark, so their distinction does not rely on color alone.
- The panel closes when combat or another blocking mode begins, when the full
  automap opens, when a trapped-chest prompt takes input, and on new-game or
  load teardown. Returning to exploration leaves it closed. An ordinary floor
  transition is not modal, so an open quick map stays open and immediately
  renders the destination floor.

## Discovery and persistence

`GameState.explored` is the only terrain source for both maps. Its existing
`exploredByFloor` save path remains responsible for floor-specific memory; no
save-format field was added. Quick-map visibility is deliberately session-only
UI state and is never serialized.

The render model copies only valid explored coordinates. It does not include
scripted events. Treasure appears only after its cell is discovered (`$` while
unopened, `o` after looting), and NPCs appear only after they have been met and
while they remain alive. Stairs, water, darkness, antimagic, teleporters, and
chutes use compact shape/glyph landmarks only on discovered cells. The current
edge model has no secret-door type; if one is introduced later, its discovered
state must be resolved before adding it to `MapOverlayEdge`.

## Rendering and extension points

`src/engine/map-overlay.ts` owns the session visibility helpers, derived model,
viewport geometry, marker geometry, palette/config constants, and retained
renderer. `src/engine/shell.ts` owns the overlay canvas and accessible button;
`src/main.ts` owns lifecycle integration. The renderer compares cheap state
signatures on each dungeon frame, rebuilds the static layer only after map,
progression, floor, camera-window, or size changes, and redraws only the player
layer for a turn within the same camera window. It loads no assets.

Future landmarks belong in `MapOverlayLandmarkKind`, `featureLandmark`, and
`LANDMARK_GLYPH`. New entries must be derived from known progression state and
must never copy undiscovered or untriggered content into the render model.
