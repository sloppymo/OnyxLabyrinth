# Raycast Dungeon Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trapezoid-based corridor renderer in `src/engine/renderer.ts` with a perspective-correct 2.5D raycasting engine while preserving existing game logic, effects, and UI.

**Architecture:** Cast one ray per screen column through the 2D grid to find the nearest wall; draw a vertical texture strip for that column. Fill floor and ceiling with perspective-correct floor casting. Continue rays through open grid edges to render side-passage back walls. Keep fog, glow, vignette, and scanlines.

**Tech Stack:** TypeScript, Vite, Canvas 2D. No new dependencies.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/engine/renderer.ts` | Corridor raycast renderer, texture loading, effects | Major rewrite of render path |
| `src/engine/shell.ts` | Canvas sizing and mode visibility | No changes expected |
| `src/engine/save-ui.ts` / `camp-ui.ts` / etc. | Other UI controllers | No changes |
| `src/types.ts` | Game state and grid types | No changes |
| `src/game/dungeon.ts` | Grid helpers (`edgeInDirection`, `DX`, `DY`) | No changes |

---

## Project Context

- The game uses a 2D grid. `player.facing` is `0=N, 1=E, 2=S, 3=W`.
- `edgeInDirection(cell, dir)` returns `"open"`, `"wall"`, `"door"`, or `"locked"`.
- `state.floor.grid[y][x]` gives the current floor's cell.
- `state.inDarkness` reduces visibility to roughly one tile.
- Existing effects: distance fog (`opacityForDepth`), amber edge glow, vignette, scanlines.
- No test framework is installed; verification is `npm run build` plus Playwright screenshots.

---

## Task 1: Add Raycast Constants and Math Helpers

**Files:**
- Modify: `src/engine/renderer.ts:38-60` (add to `RENDER_CONFIG`)

Add raycast-specific tunables to `RENDER_CONFIG`:

```ts
const RENDER_CONFIG = {
  // ... existing constants stay ...
  raycastFov: Math.PI / 3,          // 60 degrees
  raycastStripWidth: 1,             // one ray per screen column
  wallRepeatsX: 1,                  // horizontal repeats per wall face
  wallRepeatsY: 3,                  // vertical repeats per wall face
  floorRepeats: 1,                  // texture repeats per floor grid tile
  ceilingRepeats: 1,                // texture repeats per ceiling grid tile
  darknessMaxDist: 1.5,             // tiles visible in darkness zone
} as const;
```

**Step 1: Define ray-related types**

```ts
interface RayHit {
  side: "ns" | "ew";                // which set of grid lines was hit
  mapX: number;                     // grid cell hit
  mapY: number;
  perpWallDist: number;             // perpendicular distance, no fisheye
  wallX: number;                    // exact hit position along wall (0..1)
  edge: EdgeType;                   // "wall" | "door" | "locked" | "open"
}
```

**Step 2: Add direction vectors**

```ts
const DIR_VECTORS = [
  { x: 0, y: -1 }, // N
  { x: 1, y: 0 },  // E
  { x: 0, y: 1 },  // S
  { x: -1, y: 0 }, // W
] as const;
```

**Step 3: Add camera-plane helper**

```ts
function cameraPlaneForFacing(facing: number): { planeX: number; planeY: number } {
  // Plane is perpendicular to the facing direction.
  const dir = DIR_VECTORS[facing % 4];
  return { planeX: -dir.y * Math.tan(RENDER_CONFIG.raycastFov / 2), planeY: dir.x * Math.tan(RENDER_CONFIG.raycastFov / 2) };
}
```

**Step 4: Build and verify no TypeScript errors**

Run: `npm run build`
Expected: passes.

---

## Task 2: Implement Core DDA Ray Cast

**Files:**
- Modify: `src/engine/renderer.ts` (add `castRay` function)

**Step 1: Write `castRay`**

```ts
function castRay(
  state: GameState,
  rayDirX: number,
  rayDirY: number,
  maxDist: number
): RayHit | null {
  const grid = state.floor.grid;
  const playerWX = state.player.x + 0.5;
  const playerWY = state.player.y + 0.5;

  let mapX = Math.floor(playerWX);
  let mapY = Math.floor(playerWY);

  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);

  let stepX: number, sideDistX: number;
  let stepY: number, sideDistY: number;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (playerWX - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - playerWX) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (playerWY - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - playerWY) * deltaDistY;
  }

  let side: "ns" | "ew" = "ns";

  while (true) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = "ew";
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = "ns";
    }

    if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) {
      return null;
    }

    const cell = grid[mapY][mapX];
    // Determine which edge of this cell the ray crossed.
    const dir = side === "ns"
      ? (stepY > 0 ? 0 : 2)   // N or S edge
      : (stepX > 0 ? 3 : 1);  // W or E edge
    const edge = edgeInDirection(cell, dir);

    if (edge !== "open") {
      const perpWallDist = side === "ns"
        ? (mapY - playerWY + (1 - stepY) / 2) / rayDirY
        : (mapX - playerWX + (1 - stepX) / 2) / rayDirX;

      if (perpWallDist > maxDist) return null;

      let wallX: number;
      if (side === "ns") {
        wallX = playerWX + perpWallDist * rayDirX;
      } else {
        wallX = playerWY + perpWallDist * rayDirY;
      }
      wallX -= Math.floor(wallX);

      return { side, mapX, mapY, perpWallDist, wallX, edge };
    }
  }
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: passes.

---

## Task 3: Draw Walls as Vertical Texture Strips

**Files:**
- Modify: `src/engine/renderer.ts` (rewrite `render()` wall pass)

**Step 1: Replace trapezoid wall drawing with raycast wall strip loop**

Inside `render()`, after clearing the background and before near-plane floor/ceiling, add:

```ts
const dir = DIR_VECTORS[player.facing % 4];
const { planeX, planeY } = cameraPlaneForFacing(player.facing);
const maxDist = state.inDarkness ? RENDER_CONFIG.darknessMaxDist : RENDER_CONFIG.maxDepth * 2;

const wallImg = textures ? textures.wall : null;
const texWidth = wallImg ? wallImg.width : 1;
const texHeight = wallImg ? wallImg.height : 1;

for (let x = 0; x < w; x += RENDER_CONFIG.raycastStripWidth) {
  const cameraX = (2 * x) / w - 1;
  const rayDirX = dir.x + planeX * cameraX;
  const rayDirY = dir.y + planeY * cameraX;

  const hit = castRay(state, rayDirX, rayDirY, maxDist);
  if (!hit) continue;

  const lineHeight = Math.floor(h / hit.perpWallDist);
  const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
  const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));

  // Texture X
  let texX = Math.floor(hit.wallX * texWidth);
  if ((hit.side === "ew" && rayDirX > 0) || (hit.side === "ns" && rayDirY < 0)) {
    texX = texWidth - texX - 1;
  }

  // Fog factor
  const fog = opacityForDepth(hit.perpWallDist);

  if (wallImg) {
    // Sample a 1-pixel-wide vertical slice of the texture.
    ctx.globalAlpha = fog;
    ctx.drawImage(
      wallImg,
      texX * RENDER_CONFIG.wallRepeatsX, 0,
      1, texHeight / RENDER_CONFIG.wallRepeatsY,
      x, drawStart,
      RENDER_CONFIG.raycastStripWidth, drawEnd - drawStart + 1
    );
    ctx.globalAlpha = 1.0;
  } else {
    // Fallback gradient strip
    ctx.fillStyle = rgba(PALETTE.wallFill, fog * RENDER_CONFIG.fillOpacityMultiplier);
    ctx.fillRect(x, drawStart, RENDER_CONFIG.raycastStripWidth, drawEnd - drawStart + 1);
  }

  // Door/locked markers
  if (hit.edge === "door") {
    // draw thin vertical line at center of strip
    ctx.fillStyle = PALETTE.doorMarker;
    ctx.globalAlpha = fog;
    ctx.fillRect(x + RENDER_CONFIG.raycastStripWidth / 2 - 1, drawStart, 2, drawEnd - drawStart + 1);
    ctx.globalAlpha = 1.0;
  } else if (hit.edge === "locked") {
    ctx.strokeStyle = PALETTE.lockedMarker;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, drawStart + 4, RENDER_CONFIG.raycastStripWidth - 2, drawEnd - drawStart - 8);
  }
}
```

**Step 2: Remove old trapezoid wall draw commands**

Delete the old depth-layer loop that calls `drawFrontWall`, `drawSideWall`, and the associated `depthLayers` accumulation for walls. Keep the depth-layer logic only if still needed for floor/ceiling (see Task 6).

**Step 3: Build and launch**

Run: `npm run build`
Expected: passes.

Run: `npx vite preview --port 5176 --base /OnyxLabyrinth/`
Then navigate to the game, enter the dungeon, and verify walls are drawn as vertical strips.

---

## Task 4: Add Amber Edge Glow to Wall Strips

**Files:**
- Modify: `src/engine/renderer.ts`

**Step 1: Draw subtle vertical glow lines at grid boundaries**

After the wall strip loop, iterate over the same columns and draw a 1-pixel amber line on the side of each strip that faces the camera (determined by `hit.side`):

```ts
for (let x = 0; x < w; x += RENDER_CONFIG.raycastStripWidth) {
  // Recompute or cache hits from Task 3.
  // For simplicity, store hits in an array during Task 3.
}
```

Preferred approach: cache `hits` in a `RayHit[]` array during the Task 3 loop, then draw glow after.

```ts
const hits: (RayHit | null)[] = new Array(Math.ceil(w / RENDER_CONFIG.raycastStripWidth));
// ... during wall loop, store hit per column index ...

for (let i = 0; i < hits.length; i++) {
  const hit = hits[i];
  if (!hit) continue;
  const x = i * RENDER_CONFIG.raycastStripWidth;
  const lineHeight = Math.floor(h / hit.perpWallDist);
  const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + h / 2));
  const drawEnd = Math.min(h - 1, Math.floor(lineHeight / 2 + h / 2));
  const fog = opacityForDepth(hit.perpWallDist);

  ctx.save();
  ctx.strokeStyle = strokeColorForDepth(hit.perpWallDist);
  ctx.lineWidth = 1;
  ctx.shadowColor = PALETTE.amber;
  ctx.shadowBlur = glowBlurForDepth(hit.perpWallDist);
  ctx.beginPath();
  ctx.moveTo(x, drawStart);
  ctx.lineTo(x, drawEnd);
  ctx.stroke();
  ctx.restore();
}
```

**Step 2: Build and visually verify glow is present**

Run: `npm run build`
Expected: passes.

---

## Task 5: Implement Floor Casting with Checkerboard

**Files:**
- Modify: `src/engine/renderer.ts`

**Step 1: Add floor-casting helper**

```ts
function drawFloorCast(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  textures: TextureSet,
  hits: (RayHit | null)[]
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const dir = DIR_VECTORS[state.player.facing % 4];
  const { planeX, planeY } = cameraPlaneForFacing(state.player.facing);

  // Only draw rows below the horizon that are not already covered by a wall strip.
  for (let y = Math.floor(h / 2) + 1; y < h; y++) {
    // Direction vector from camera to floor row.
    const rowDistance = (h / 2) / (y - h / 2);
    const floorStepX = rowDistance * (planeX * 2 / w);
    const floorStepY = rowDistance * (planeY * 2 / w);
    let floorX = state.player.x + 0.5 + rowDistance * (dir.x - planeX);
    let floorY = state.player.y + 0.5 + rowDistance * (dir.y - planeY);

    // Draw this row as 1-pixel-high horizontal strips.
    for (let x = 0; x < w; x++) {
      const gx = Math.floor(floorX);
      const gy = Math.floor(floorY);
      const floorImg = floorTextureForGrid(textures, gx, gy);
      if (floorImg) {
        const texSize = floorImg.width;
        const texX = Math.floor((floorX - gx) * texSize) % texSize;
        const texY = Math.floor((floorY - gy) * texSize) % texSize;
        const fog = opacityForDepth(rowDistance);
        ctx.globalAlpha = fog;
        ctx.drawImage(floorImg, texX, texY, 1, 1, x, y, 1, 1);
        ctx.globalAlpha = 1.0;
      }
      floorX += floorStepX;
      floorY += floorStepY;
    }
  }
}
```

**Step 2: Call `drawFloorCast` from `render()` after the wall strip pass**

**Step 3: Build and verify checkerboard pattern**

Run: `npm run build`
Expected: passes.

Visually verify floor alternates A/B tiles tied to grid coordinates.

---

## Task 6: Implement Ceiling Casting

**Files:**
- Modify: `src/engine/renderer.ts`

**Step 1: Mirror floor casting for ceiling**

```ts
function drawCeilingCast(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  textures: TextureSet
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const dir = DIR_VECTORS[state.player.facing % 4];
  const { planeX, planeY } = cameraPlaneForFacing(state.player.facing);
  const ceilImg = textures.ceiling;
  if (!ceilImg) return;

  for (let y = 0; y < Math.floor(h / 2); y++) {
    const rowDistance = (h / 2) / (h / 2 - y);
    const ceilStepX = rowDistance * (planeX * 2 / w);
    const ceilStepY = rowDistance * (planeY * 2 / w);
    let ceilX = state.player.x + 0.5 + rowDistance * (dir.x - planeX);
    let ceilY = state.player.y + 0.5 + rowDistance * (dir.y - planeY);

    for (let x = 0; x < w; x++) {
      const gx = Math.floor(ceilX);
      const gy = Math.floor(ceilY);
      const texSize = ceilImg.width;
      const texX = Math.floor((ceilX - gx) * texSize) % texSize;
      const texY = Math.floor((ceilY - gy) * texSize) % texSize;
      const fog = opacityForDepth(rowDistance);
      ctx.globalAlpha = fog;
      ctx.drawImage(ceilImg, texX, texY, 1, 1, x, y, 1, 1);
      ctx.globalAlpha = 1.0;
      ceilX += ceilStepX;
      ceilY += ceilStepY;
    }
  }
}
```

**Step 2: Call from `render()` before floor casting**

**Step 3: Build and verify ceiling texture is visible**

Run: `npm run build`
Expected: passes.

---

## Task 7: Handle Side Openings

**Files:**
- Modify: `src/engine/renderer.ts` (update `castRay` to continue through open edges)

**Step 1: Modify `castRay` to track open-edge portals**

When an open edge is encountered, continue DDA but record the perpendicular distance at which the ray crossed into the side cell. If a wall is later hit inside the side cell, return that hit instead. This makes the ray see the back wall of the side passage.

```ts
function castRay(
  state: GameState,
  rayDirX: number,
  rayDirY: number,
  maxDist: number
): RayHit | null {
  // ... existing setup ...

  while (true) {
    // ... existing stepping ...

    if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) {
      return null;
    }

    const cell = grid[mapY][mapX];
    const dir = side === "ns"
      ? (stepY > 0 ? 0 : 2)
      : (stepX > 0 ? 3 : 1);
    const edge = edgeInDirection(cell, dir);

    if (edge !== "open") {
      // ... compute perpWallDist, wallX, return hit ...
    }
    // else: continue DDA into the side passage
  }
}
```

**Step 2: Visually verify junctions**

Enter the dungeon and navigate to a junction. Confirm left/right openings show the side-passage back wall instead of black void.

**Step 3: Build**

Run: `npm run build`
Expected: passes.

---

## Task 8: Reintegrate Vignette and Scanlines

**Files:**
- Modify: `src/engine/renderer.ts` (ensure effects are called at the end of `render()`)

**Step 1: Keep existing calls at the end of `render()`**

```ts
drawVignette(ctx, w, h, 1.0);
drawScanlines(ctx, w, h);
if (state.inDarkness) drawVignette(ctx, w, h, 1.35);
```

**Step 2: Remove old near-plane floor/ceiling fills and depth-layer accumulation**

The old trapezoid-based depth loop, `drawSideOpening`, `drawFrontWall`, `drawSideWall`, `drawCeilingStrip`, `drawFloorStrip`, `drawCeilingFloorStrokes`, and the near-plane fills are no longer needed. Delete them once floor/ceiling casting and wall raycasting are working.

**Step 3: Build**

Run: `npm run build`
Expected: passes.

---

## Task 9: Reintegrate Tile Features

**Files:**
- Modify: `src/engine/renderer.ts` (update feature drawing to use raycast depth)

**Step 1: Update `drawDepthFeature`**

Instead of using `near`/`far` trapezoids, compute screen position from a ray hit or from a known distance. For the player's current tile feature (`drawFloorFeature`), keep the existing depth-0 helper.

```ts
function drawDepthFeature(
  ctx: CanvasRenderingContext2D,
  distance: number,
  screenX: number,
  feature: TileFeature,
  inDarkness: boolean
): void {
  const lineHeight = Math.floor(ctx.canvas.height / distance);
  const cy = Math.floor(ctx.canvas.height / 2 + lineHeight * 0.4);
  const size = Math.max(8, 24 / distance);
  drawFeatureGlyph(ctx, screenX, cy, feature, inDarkness ? PALETTE.featureDark : PALETTE.feature, size);
}
```

**Step 2: Call feature drawing after wall/floor/ceiling casting**

Iterate over visible cells and draw features at the screen X corresponding to the cell center ray.

**Step 3: Build and verify**

Run: `npm run build`
Expected: passes.

---

## Task 10: Final Build and Visual Verification

**Files:**
- All modified files.

**Step 1: Full build**

Run: `npm run build`
Expected: zero TypeScript errors.

**Step 2: Start preview server**

Run: `npx vite preview --port 5176 --base /OnyxLabyrinth/`

**Step 3: Screenshot verification checklist**

Use Playwright to capture and inspect:

- [ ] Straight corridor: walls, floor, and ceiling show perspective-correct textures with no chevron seams.
- [ ] Front wall at depth 0: walking up to a wall shows a textured surface.
- [ ] Side opening/junction: left/right passages render correctly.
- [ ] Floor checkerboard: alternating A/B tiles tied to grid position, stable when turning/moving.
- [ ] Ceiling texture visible, not black.
- [ ] Doors and locked doors display markers.
- [ ] Darkness zone reduces visibility to ~1 tile.
- [ ] Fog falloff, glow, vignette, scanlines still present.
- [ ] Combat → dungeon transition still renders correctly.
- [ ] HUD remains a strict 3×2 grid.

**Step 4: Commit**

```bash
git add src/engine/renderer.ts docs/superpowers/specs/2026-07-05-raycast-dungeon-renderer-design.md docs/superpowers/plans/2026-07-05-raycast-dungeon-renderer-plan.md
git commit -m "feat: replace trapezoid corridor renderer with raycast engine"
```

---

## Spec Coverage Check

| Spec Requirement | Task(s) |
|------------------|---------|
| Walls as perspective-correct vertical strips | 2, 3 |
| Floor casting with checkerboard | 5 |
| Ceiling casting | 6 |
| Preserve fog/glow/vignette/scanlines | 4, 8 |
| Side openings / junctions | 7 |
| Doors / locked markers | 3 |
| Darkness zones | 2 (maxDist) |
| Tile features | 9 |
| No changes to game logic | all (only `renderer.ts`) |
| Build passes / visual verification | 10 |

## Placeholder Scan

- No TBD/TODO items.
- Code snippets are concrete and reference existing functions/constants.
- File paths are exact.
- Commands include expected outcomes.
