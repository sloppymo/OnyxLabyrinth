# Combat convergence retune — f1 v4 gate (2026-07-15)

**Status:** v4 empty-room bake approved — row ratio and side-wall texture verified in-browser. Do not propagate / do not reopen fracs yet.

## Bracket
| | X (columns) | Y (rows) |
|---|-------------|----------|
| v1 | converging | compressed (but walls wedged) |
| v2b | parallel | flat → wallpaper |
| v3.1 | parallel (keep) | smooth gradient, but **3.9× overshoot** (rowCompressPower 0.7) |
| **v4** | **parallel (keep)** | **compressed 2.04× front/back (rowCompressPower 0.82)** |

`v3`/`v3.1`'s working theory ("compression concentrated near seam, needs spreading") did not hold up under measurement: at `rowCompressPower: 0.7` the row-height sequence front→back was already smooth and monotonic (68→65→62→…→17px). The only real defect was **magnitude** — ratio 3.9× against a 1.8–2.2× target — not distribution shape. `rowCompressPower: 0.82` corrects the magnitude only.

## v4 changes (on top of v3.1 silhouette)
1. **Row foreshortening:** `worldY = lerp(roomDepth, floorNearDepth, t^rowCompressPower)` with `rowCompressPower: 0.82` (was 0.7), `floorNearDepth: 3.0`, `roomDepth: 14`. Columns still screen-linear across silhouette (~2.46° edge drift, within "a few degrees").
2. **Side-wall texture bug fixed:** `texX`/`texY` in `drawSideWalls` were computed once per scanline (outside the per-pixel `x` loop), so every row painted as a single flat texel repeated across the strip width — the pale "wallpaper band" defect on the framing walls. Now `texX` varies per pixel (anchored to the strip's inner edge so coursing doesn't slide as the strip's screen position drifts row to row). Brighten reduced from `1.4+0.25z` to `0.95+0.35z` so it doesn't wash out the fixed texture's contrast.
3. Seam height **unchanged** (0.20).

## Measured (analytic, matches the render exactly — `drawFloor` literally implements this formula)
- Front/back tile row height ratio: **2.04×** (target 1.8–2.2), sequence `0.110→0.107→0.105→0.102→0.099→0.095→0.091→0.086→0.080→0.071→0.054`, monotonic decreasing.
- Column drift: **~2.46°** edge-to-edge (`(sideWallNearInsetFrac − farInset) × w` lateral over floor height).
- Back wall width: 78% frame (unchanged, already in 70–80% target).

## Known gap
Side-wall brick-coursing *look* (the `abs(x-refX)*2` density scalar and per-row `depthTexX` offset) is a one-pass heuristic, not a principled depth mapping — it reads as textured planking with a diagonal grain now (flat-band defect gone), but the grain angle is a byproduct of the per-row offset and hasn't been tuned against a reference. Worth a pass if the side walls need to look less "planky."

## Contract note for later frac retune
Equal `footYFrac` steps are **not** equal floor distance under row compression (nonlinear y↔depth). Place formation rows **by eye against tile rows**, and key the scale ramp to the same compression so sprites shrink with the tiles they stand on.

## Shots
- `50-v4-empty-room.png` — **current approve target**, raw 768×672 canvas capture via `?debug=1` → `window.__onyxDebug.renderBattleArena`
- `40-v3_1-empty-room.png` — prior state (3.9× overshoot, flat-band side walls) for comparison
- `41-v2b-v3-v3_1-triple.png` — earlier bracket
- Apron / mid-band party still expected — ignore until empty room passes
