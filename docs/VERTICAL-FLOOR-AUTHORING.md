# Vertical Floor Authoring Contract

This document is the source-of-truth contract for authoring floors with
`heightZones`, `ramps`/`stairs`, and variable ceiling/floor heights in
Onyx Labyrinth. It hardens the Maze Renderer 2 / vertical traversal feature
set into a production-ready, validator-enforced authoring grammar.

## Data model

### `heightZones`

Rectangular cell-volume overrides. Later overlapping zones win (same
precedence rule as `tilesetZones`).

```json
{
  "id": "zone-name",
  "x1": 2,
  "y1": 2,
  "x2": 6,
  "y2": 8,
  "floorZ": 0.0,
  "ceilingZ": 3.0
}
```

- `floorZ` is optional. When omitted, the cell keeps the default `0`.
- `ceilingZ` is optional. When omitted, the cell keeps the default `1`.
- `floorZ` must be `< ceilingZ`.
- Out-of-order bounds (`x1 > x2` or `y1 > y2`) are rejected.
- Zones may extend outside the floor; anything outside the grid is ignored.

### `ramps` and `stairs`

Local within-floor connectors. `dir` is the **uphill** edge.

```json
{
  "x": 2,
  "y": 2,
  "dir": "e",
  "surface": "ramp"
}
```

- `surface` is either `ramp` or `stairs`. Gameplay is identical; only the
  GPU mesh differs.
- The low end is the cell's own `floorZ`; the high end is the uphill
  neighbor's `floorZ`.
- The low and high edges must be `open` and geometrically continuous.
- Side edges (the two faces perpendicular to `dir`) must be `wall`.
- Two connectors cannot share the same cell.

## Camera clearance

The camera eye sits `0.5` cells above the floor, plus a small head-bob
margin. The validator enforces a shared worst-case clearance constant
(`MIN_CAMERA_CLEARANCE = 0.625` cell-height units) between the highest
traversable floor surface in a cell and its ceiling. This prevents the
camera from clipping through the ceiling.

Authoring rule: ensure `ceilingZ - maxFloorSurfaceZ >= 0.625` for every
cell. Ramps that rise to a high `floorZ` need a proportionally higher
`ceilingZ`.

## Surface continuity and edge state parity

The validator and runtime now agree on which edges are actually crossable:

- **`open` and `door` edges** must have matching floor surfaces on both
  sides. If they don't, the validator raises `height_surface_mismatch` and
  the runtime blocks the step with "The change in elevation is too steep."
- **`locked` and `barred` edges** are also validated as **errors** when
  their floor surfaces do not match (`height_surface_mismatch_sealed`),
  because once the key/gate condition is satisfied the edge becomes a
  `door` and the same surface-continuity check still fails at runtime. A
  sealed edge with mismatched heights is therefore not crossable even after
  opening.
- **`wall` edges** are always blocked and are not checked for surface
  continuity.

## Connector occupancy rules

A connector cell (`ramps`/`stairs`) is for movement, not for stacking
interactive content. The validator rejects the following on a connector
cell:

- `stairs_up`/`stairs_down` inter-floor tiles (`ramp_interfloor_stairs_conflict`)
- `treasure`, `event`, `water`, `teleporter`, `chute`, `guardian` tiles
  (`ramp_tile_unsupported`)
- `mapSprites` (`ramp_map_sprite_unsupported`)
- `npcs` (`ramp_npc_unsupported`)
- `treasures`, `events`, `waters`, `teleporters`, `chuteDrops` overlay
  entries (`ramp_*_unsupported`)

Place these features on flat landing cells adjacent to the connector.

## Teleporter and chute landing semantics

Teleporters and chutes bypass normal edge traversal, but the validator
forbids them from landing on a ramp/stair connector
(`link_lands_on_connector` error). Only the following destinations are
valid:

- **Flat elevated cells** — the camera eye derives from the cell's
  `floorZ`, the player can stand and walk off if the surrounding edges are
  valid, and the within-cell surface position is unambiguous.
- **Flat legacy cells** — the default `floorZ = 0` case.

Connector destinations are disallowed because the within-cell surface
position of a ramp is ambiguous and interaction/event/movement behavior
after landing is undefined. Place the arrival on the nearest flat landing
cell.

## Reachability

The validator's BFS is **height-aware for `open` and `door` edges** and
uses `surfacesConnectAcrossEdge` to decide whether a cell is reachable. It
remains **height-agnostic and key-agnostic for `locked` and `barred`**
edges (they are treated as passable to the BFS because the BFS is not a
key/gate planner). Their geometric correctness is covered by the
per-edge continuity checks in `validateHeightConfig`.

## Canvas fallback semantics

Canvas 2D remains the default renderer. In Canvas mode:

- Traversal is fully correct — the same `resolveFloorSurface` and
  `surfacesConnectAcrossEdge` logic runs.
- Walls render at the legacy `0 -> 1` height regardless of `floorZ` and
  `ceilingZ`.
- Ramps and stairs render as flat connectors.
- The player may appear to walk across a visually flat tile while the
  gameplay elevation changes. This is intentional: the Canvas renderer is a
  flat approximation, not a full 3D raycaster.

Correct behavior: no crash, no missing floors, no movement mismatch.
Incorrect behavior: any discrepancy between gameplay elevation and
interaction/door/NPC targeting. Report those as bugs.

## Backward compatibility

Legacy floors with no `heightZones` or `ramps` resolve to the legacy
`floorZ = 0`/`ceilingZ = 1` volume and behave identically. No
`floorRevision` bump is needed for existing floors that stay flat.
