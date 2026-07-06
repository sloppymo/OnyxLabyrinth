# Raycast Dungeon Renderer — Design Spec

## Context

The current corridor renderer draws stacked perspective trapezoids and tiles them with `CanvasPattern`. That approach cannot produce perspective-correct texture mapping, so wall tiles drift, stretch, and create visible seams between depth segments. This spec replaces the trapezoid renderer with a classic 2.5D raycasting engine (Wolfenstein/Dungeon Master style) while preserving all game logic.

## Goals

1. Render walls as perspective-correct vertical strips via raycasting.
2. Render floor and ceiling with perspective-correct texture mapping (floor/ceiling casting).
3. Preserve the existing amber/orange torch-lit aesthetic: fog falloff, amber edge glow, vignette, CRT scanlines.
4. Keep wall/floor/ceiling textures (256×256 tiles) and the floor A/B checkerboard tied to grid coordinates.
5. Support side openings/junctions, doors, locked doors, darkness zones, and tile features.
6. Leave movement, collision, combat, map/grid data, keybindings, and state management untouched.

## Non-Goals

- No WebGL/shaders; renderer stays Canvas 2D.
- No new game systems (combat, loot, spells, procedural generation).
- No changes to the auto-map engine (`src/engine/automap.ts`) beyond the existing integration.
- No camera bob, motion blur, or UI redesign; this is strictly the corridor renderer.

## High-Level Approach

Replace the trapezoid walk in `src/engine/renderer.ts` with a raycast pass:

1. **Ray setup:** For each screen column, cast a ray from the player across the 2D grid using DDA.
2. **Wall hit:** Determine the nearest grid edge (wall or door) the ray hits, the perpendicular distance, and the exact hit coordinate along that wall (texture X).
3. **Wall strip:** Draw a vertical rectangle for that screen column using the wall texture, sampled at texture X and stretched to the correct screen height.
4. **Floor/ceiling casting:** For each screen row below/above the wall strip endpoints, compute the world floor/ceiling coordinate at that distance and sample the appropriate floor/ceiling texture.
5. **Side openings:** When the main ray passes through an open side cell, continue casting until it hits the back wall of the side passage. Draw that back wall as a separate vertical strip with its own distance/texture coordinate.
6. **Effects layer:** Apply distance fog/tint, glow lines, vignette, and scanlines on top.

## 1. Coordinate System

- Grid coordinates: integer `(x, y)` with `player.x`, `player.y`, `player.facing` (0=N, 1=E, 2=S, 3=W).
- World coordinates: continuous `(worldX, worldY)` with the player at the center of `(player.x + 0.5, player.y + 0.5)`.
- Ray direction: derived from `player.facing` plus a camera-plane offset for field of view.
- FOV: 60° feels right for a dungeon corridor; tunable via `RAYCAST_FOV`.

## 2. Wall Rendering

### 2.1 Ray casting (DDA)

For each column `cx` from `0` to `canvas.width - 1`:

1. Compute `cameraX = 2 * cx / width - 1`.
2. `rayDirX = dirX + planeX * cameraX`
3. `rayDirY = dirY + planeY * cameraX`
4. Run DDA through the grid until a non-open edge is hit.
5. Compute perpendicular distance `perpWallDist` to avoid fisheye.
6. Compute `lineHeight = int(canvas.height / perpWallDist)`.
7. Compute `drawStart`, `drawEnd` clamped to screen.
8. Compute `wallX` (exact hit position along the wall) for texture X.

### 2.2 Texture mapping

- Wall texture is `wall_tile_amber_256.png`.
- Texture X coordinate: `int(wallX * texture.width)`.
- Texture Y coordinate: for each pixel row in the wall strip, map screen row to texture V coordinate so the full texture is stretched vertically across the strip. This gives one vertical tile per wall face; for multiple repeats per grid unit, scale V by `WALL_REPEATS_Y` (default 3).
- Draw each column with `ctx.drawImage(img, texX, 0, 1, texH, screenX, drawStart, 1, lineHeight)` where `texH = img.height / WALL_REPEATS_Y` (or the full image if repeats are handled by scaling).
- Distance shading: multiply the strip color by a per-column fog factor `fog(perpWallDist)`.

### 2.3 Doors and locked doors

- When DDA hits a cell edge of type `"door"` or `"locked"`, treat it as a wall hit but remember the edge type.
- Draw the door/locked marker overlay on the wall strip (vertical line or X) after the texture, scaled by distance.

### 2.4 Side openings / junctions

- A ray that hits an open edge is not stopped; DDA continues into the adjacent cell.
- The open edge itself is a portal. We record the distance at which the ray crossed the portal so floor/ceiling can be drawn up to that point.
- The ray eventually hits a wall in the side passage; that wall is drawn as a vertical strip with its own distance and texture coordinate.
- For T-junctions and cross-junctions, the ray may cross multiple open edges before hitting a wall. DDA handles this naturally by continuing through open cells.
- To keep the renderer simple, the ray only follows the straight path from the player; it does not recursively cast into side passages at oblique angles. The side-passage back wall is whatever the ray hits after passing through the open edge.

## 3. Floor and Ceiling Casting

After all wall strips are drawn, fill the remaining pixels with floor and ceiling textures.

For each screen row `y` below the horizon:

1. Compute the distance from the player to the floor for that row: `rowDistance = (playerHeight * canvas.height) / (y - canvas.height / 2)` (playerHeight is half the wall height, i.e., the camera is centered vertically).
2. Compute the world step vector per screen column for that row using the camera plane.
3. For each column, compute `floorX = player.x + 0.5 + rowDistance * rayDirX`, `floorY = player.y + 0.5 + rowDistance * rayDirY`.
4. Determine the grid cell `(floor(floorX), floor(floorY))` and choose floor texture A or B based on `(gx + gy) % 2`.
5. Sample texture coordinate `(int((floorX % 1) * texSize), int((floorY % 1) * texSize))`.
6. Draw the pixel with distance fog.

Ceiling is identical but mirrored above the horizon and uses the ceiling texture.

Performance note: Canvas 2D per-pixel drawing is slow. In practice, floor/ceiling will be drawn as horizontal 1-pixel-high strips across the row using `ctx.drawImage` or `putImageData`. If performance is poor, fall back to drawing textured horizontal trapezoid strips per depth layer with raycast-derived texture coordinates.

## 4. Darkness Zones

- `state.inDarkness` limits visibility to one tile.
- In raycasting terms, cap the ray distance: if `perpWallDist > DARKNESS_MAX_DIST`, stop and treat as a black wall.
- Floor/ceiling beyond the darkness distance are not drawn (black).
- The existing extra vignette overlay for darkness remains.

## 5. Tile Features

- Features (`stairs_up`, `treasure`, etc.) are drawn on the floor at the player's current tile (depth 0) or at depth cells as in the current renderer.
- Use the same `drawFloorFeature` / `drawDepthFeature` helpers, positioned using raycast distance.

## 6. Visual Effects

All existing effects are preserved and applied in the same order:

1. **Distance fog/tint:** applied per wall/floor/ceiling strip, stronger with distance.
2. **Amber edge glow:** subtle glow on wall strip edges. With vertical strips, this becomes a per-column or per-edge effect; we can draw thin vertical lines with `shadowBlur` along wall boundaries.
3. **Vignette:** radial gradient overlay after geometry.
4. **Scanlines:** horizontal lines across the viewport.

## 7. Files to Modify

- `src/engine/renderer.ts` — replace trapezoid renderer with raycast engine; keep texture loading helpers.
- `src/engine/shell.ts` — ensure canvas sizing remains correct (should already work).
- `src/styles.css` — no changes expected.
- `src/main.ts` — no changes expected unless mode switching needs adjustment.

## 8. New Constants (to add to `RENDER_CONFIG`)

| Constant | Default | Purpose |
|----------|---------|---------|
| `RAYCAST_FOV` | 60° | Horizontal field of view in degrees. |
| `WALL_REPEATS_X` | 1 | Texture repeats horizontally per wall face. |
| `WALL_REPEATS_Y` | 3 | Texture repeats vertically per wall face. |
| `FLOOR_REPEATS` | 1 | Texture repeats per grid tile. |
| `CEILING_REPEATS` | 1 | Texture repeats per grid tile. |
| `DARKNESS_MAX_DIST` | 1.5 | Maximum ray distance in darkness zones. |
| `WALL_STRIP_WIDTH` | 1 | Screen pixels per ray; 1 = one ray per column. |

## 9. Verification Checklist

After implementation, verify:

- [ ] Straight corridor: walls, floor, and ceiling show perspective-correct textures with no seams.
- [ ] Front wall at depth 0: walking up to a wall shows a textured surface, not a black rectangle.
- [ ] Side opening/junction: left/right passages render correctly with back walls.
- [ ] Floor checkerboard: alternating A/B tiles tied to grid position, stable when turning/moving.
- [ ] Ceiling texture visible, not black.
- [ ] Doors and locked doors display markers.
- [ ] Darkness zone reduces visibility to ~1 tile.
- [ ] Fog falloff, glow, vignette, scanlines still present.
- [ ] Combat → dungeon transition still renders correctly.
- [ ] `npm run build` passes with zero TypeScript errors.

## 10. Risks

- **Performance:** Canvas 2D per-column/per-pixel rendering may be slower than the current trapezoid fills. Mitigate by using 1-pixel-wide strips and caching texture images.
- **Complexity:** Side openings and floor casting add significant code. Mitigate by implementing wall raycasting first, then floor/ceiling, then side openings in separate passes.
- **Regression:** Existing effects may interact unexpectedly with vertical strips. Mitigate by preserving effect helpers and applying them after geometry.

## 11. Incremental Implementation Order

1. Wall raycasting only; floor/ceiling as solid dark fills.
2. Add distance fog and amber edge glow to wall strips.
3. Add floor casting with checkerboard A/B textures.
4. Add ceiling casting with texture.
5. Add side-opening support.
6. Reintegrate doors, locked doors, features, vignette, scanlines.
7. Build and screenshot verification.
