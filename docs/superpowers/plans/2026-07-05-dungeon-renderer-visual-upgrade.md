# Dungeon Renderer Visual Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the first-person corridor renderer, top-left minimap, and optional HUD bars to a moody, atmospheric CRT-era style without changing any game logic.

**Architecture:** Keep all changes inside `src/engine/renderer.ts` for the corridor/minimap, plus targeted CSS in `src/styles.css` for the HUD. Add small helper functions for depth-based opacity/gradient/glow and replace wireframe-only drawing with fill-then-stroke quads. Cache gradients where possible. Verify by running `npm run dev` and visually inspecting the dungeon view and minimap.

**Tech Stack:** TypeScript, Canvas2D, Vite, CSS.

---

## File Mapping

- `src/engine/renderer.ts` — main corridor renderer + minimap. This file already contains `render()`, `drawMinimap()`, `drawQuad()`, and palette constants. All visual upgrades live here.
- `src/styles.css` — HUD party strip bar styles (`.ps-char`, `.ps-bar`, `.ps-bar-fill.hp`, `.ps-bar-fill.sp`).
- `src/main.ts` — only if a tiny HTML class hook is needed for HUD gradients (likely not required; CSS can style the existing fill spans).

---

## Task 1: Refactor renderer palette and add depth/fog/glow helpers

**Files:**
- Modify: `src/engine/renderer.ts` lines 5–47 (constants and helper functions)

- [ ] **Step 1: Replace the fixed depth palette with tunable constants and helper functions.**

Replace the existing `COLORS` block and depth helpers with the following constants and functions. The existing `colorForDepth`, `lineWidthForDepth`, and `fillAlphaForDepth` functions are replaced by a unified opacity model.

```typescript
// --- Tunable atmosphere constants ----------------------------------------
const PALETTE = {
  bg: "#0e0d0a",
  amber: "#e0a458",
  warmWhite: "#f5f0e6",
  wallFill: { r: 61, g: 50, b: 40 },       // #3d3228
  floorFill: { r: 42, g: 34, b: 26 },      // #2a221a
  ceilingFill: { r: 31, g: 27, b: 22 },    // #1f1b16
  doorMarker: "#e0a458",
  lockedMarker: "#c44",
  feature: "#e0a458",
  featureDark: "#8a6a38",
};

const MAX_DEPTH = 4;
const DARKNESS_DEPTH = 1;

const FOG_FALLOFF = 0.55;
const BASE_OPACITY = 1.0;
const FILL_OPACITY_MULTIPLIER = 0.45;

const GLOW_BLUR_NEAR = 7;
const GLOW_BLUR_FAR = 2;

const SCANLINE_OPACITY = 0.12;
const SCANLINE_SPACING = 3;

/** Compute stroke/fill opacity for a depth index. */
function opacityForDepth(d: number): number {
  return BASE_OPACITY * Math.pow(FOG_FALLOFF, d);
}

/** Convert an RGB object + alpha to a CSS rgba() string. */
function rgba(
  color: { r: number; g: number; b: number },
  alpha: number
): string {
  return `rgba(${color.r},${color.g},${color.b},${Math.max(0, alpha)})`;
}

/** Build a warm stroke color from the amber family at a given depth. */
function strokeColorForDepth(d: number): string {
  const a = opacityForDepth(d);
  return `rgba(224,164,88,${a})`;
}

/** Wall gradient: brighter near the camera edge, darker toward vanishing point. */
function wallGradient(
  ctx: CanvasRenderingContext2D,
  xNear: number,
  xFar: number,
  base: { r: number; g: number; b: number },
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(xNear, 0, xFar, 0);
  g.addColorStop(0, rgba({ r: base.r + 14, g: base.g + 8, b: base.r + 4 }, alpha));
  g.addColorStop(1, rgba({ r: base.r - 6, g: base.g - 6, b: base.b - 8 }, alpha * 0.5));
  return g;
}

/** Floor gradient: dark at the corridor opening, fading to transparent/black. */
function floorGradient(
  ctx: CanvasRenderingContext2D,
  yNear: number,
  yFar: number,
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(0, yNear, 0, Math.max(yFar, yNear + 1));
  g.addColorStop(0, rgba(PALETTE.floorFill, alpha));
  g.addColorStop(1, rgba({ r: 14, g: 13, b: 10 }, 0));
  return g;
}

/** Ceiling gradient: dark at the top, brightening slightly toward corridor opening. */
function ceilingGradient(
  ctx: CanvasRenderingContext2D,
  yNear: number,
  yFar: number,
  alpha: number
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, yNear);
  g.addColorStop(0, rgba({ r: 14, g: 13, b: 10 }, 0));
  g.addColorStop(1, rgba({ r: PALETTE.ceilingFill.r + 6, g: PALETTE.ceilingFill.g + 2, b: PALETTE.ceilingFill.b }, alpha));
  return g;
}
```

- [ ] **Step 2: Update the existing `drawQuad` helper to support a glow toggle.**

Change `drawQuad` so callers can request an edge glow. This affects the function signature and body.

```typescript
function drawQuad(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  strokeStyle: string,
  fillStyle?: string,
  lineWidth: number = 1.5,
  glowBlur: number = 0
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (glowBlur > 0) {
    ctx.shadowColor = PALETTE.amber;
    ctx.shadowBlur = glowBlur;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 3: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add src/engine/renderer.ts
git commit -m "refactor(renderer): tunable atmosphere constants and helpers"
```

---

## Task 2: Fill corridor walls, floor, and ceiling with depth-aware gradients

**Files:**
- Modify: `src/engine/renderer.ts` lines 275–377 (the main corridor loop)

- [ ] **Step 1: Precompute near-plane floor/ceiling gradients and remove the old flat gradients.**

Replace the existing floor/ceiling near-plane gradient code (around lines 243–267) with the following. It keeps the same geometry but uses the new gradient helpers.

```typescript
// Near-plane floor/ceiling gradient fills (depth 0, full opacity).
const nearRect = getDepthRect(w, h, 0);

const floorGrad = floorGradient(ctx, nearRect.bottom, h, opacityForDepth(0));
ctx.fillStyle = floorGrad;
ctx.beginPath();
ctx.moveTo(0, h);
ctx.lineTo(w, h);
ctx.lineTo(nearRect.right, nearRect.bottom);
ctx.lineTo(nearRect.left, nearRect.bottom);
ctx.closePath();
ctx.fill();

const ceilGrad = ceilingGradient(ctx, nearRect.top, 0, opacityForDepth(0));
ctx.fillStyle = ceilGrad;
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.lineTo(w, 0);
ctx.lineTo(nearRect.right, nearRect.top);
ctx.lineTo(nearRect.left, nearRect.top);
ctx.closePath();
ctx.fill();
```

- [ ] **Step 2: Update the main loop to fill each segment's left wall, right wall, ceiling strip, and floor strip.**

Inside the `for (let d = 0; d < maxDepth; d++)` loop, replace the `drawQuad` calls for left/right walls and ceiling/floor strips with filled versions. Keep the existing door/locked markers and feature drawing intact.

After the change, the loop body should look like this (only the changed parts are shown; preserve the surrounding logic):

```typescript
const near = getDepthRect(w, h, d);
const far = getDepthRect(w, h, d + 1);
const stroke = strokeColorForDepth(d);
const fillAlpha = opacityForDepth(d) * FILL_OPACITY_MULTIPLIER;
const lw = lineWidthForDepth(d);
const glowBlur = Math.max(GLOW_BLUR_FAR, GLOW_BLUR_NEAR - d * 1.5);

// Left wall
if (leftEdge !== "open") {
  drawQuad(
    ctx,
    [
      [near.left, near.top],
      [far.left, far.top],
      [far.left, far.bottom],
      [near.left, near.bottom],
    ],
    stroke,
    wallGradient(ctx, near.left, far.left, PALETTE.wallFill, fillAlpha),
    lw,
    glowBlur
  );
  if (leftEdge === "door") drawDoorMarker(ctx, near, far, "left", d);
  else if (leftEdge === "locked") drawLockedMarker(ctx, near, far, "left", d);
}

// Right wall
if (rightEdge !== "open") {
  drawQuad(
    ctx,
    [
      [near.right, near.top],
      [far.right, far.top],
      [far.right, far.bottom],
      [near.right, near.bottom],
    ],
    stroke,
    wallGradient(ctx, near.right, far.right, PALETTE.wallFill, fillAlpha),
    lw,
    glowBlur
  );
  if (rightEdge === "door") drawDoorMarker(ctx, near, far, "right", d);
  else if (rightEdge === "locked") drawLockedMarker(ctx, near, far, "right", d);
}

// Ceiling strip for this segment
ctx.fillStyle = ceilingGradient(ctx, near.top, far.top, fillAlpha);
ctx.beginPath();
ctx.moveTo(near.left, near.top);
ctx.lineTo(near.right, near.top);
ctx.lineTo(far.right, far.top);
ctx.lineTo(far.left, far.top);
ctx.closePath();
ctx.fill();

// Floor strip for this segment
ctx.fillStyle = floorGradient(ctx, near.bottom, far.bottom, fillAlpha);
ctx.beginPath();
ctx.moveTo(near.left, near.bottom);
ctx.lineTo(near.right, near.bottom);
ctx.lineTo(far.right, far.bottom);
ctx.lineTo(far.left, far.bottom);
ctx.closePath();
ctx.fill();

// Stroke the ceiling/floor strip edges with glow
drawQuad(
  ctx,
  [
    [near.left, near.top],
    [near.right, near.top],
    [far.right, far.top],
    [far.left, far.top],
  ],
  stroke,
  undefined,
  lw,
  glowBlur
);
drawQuad(
  ctx,
  [
    [near.left, near.bottom],
    [near.right, near.bottom],
    [far.right, far.bottom],
    [far.left, far.bottom],
  ],
  stroke,
  undefined,
  lw,
  glowBlur
);
```

- [ ] **Step 3: Update the front wall fill to use the new helpers.**

Replace the existing front-wall `drawQuad` call with:

```typescript
drawQuad(
  ctx,
  [
    [far.left, far.top],
    [far.right, far.top],
    [far.right, far.bottom],
    [far.left, far.bottom],
  ],
  stroke,
  d === 0 ? undefined : rgba(PALETTE.wallFill, fillAlpha),
  lw,
  glowBlur
);
```

- [ ] **Step 4: Type-check and run the dev server.**

Run: `npx tsc --noEmit && npm run dev`
Open the game in the browser, proceed through party creation to enter the dungeon, and verify:
- Walls, floor, and ceiling now have subtle brown fills.
- Far geometry is dimmer than near geometry.
- TypeScript shows no errors and Vite serves the page.

- [ ] **Step 5: Commit.**

```bash
git add src/engine/renderer.ts
git commit -m "feat(renderer): depth-aware fills for walls, floor, and ceiling"
```

---

## Task 3: Add vignette, CRT scanlines, and stronger edge glow

**Files:**
- Modify: `src/engine/renderer.ts` (add post-processing overlay functions and call them at the end of `render`)

- [ ] **Step 1: Add helper functions for vignette and scanlines near the bottom of the file.**

Append these helpers after `strokeEdge` (or anywhere outside the exported functions):

```typescript
/** Darken the corners/edges with a radial gradient overlay. */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number = 1.0
): void {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) / 2;
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.55, `rgba(0,0,0,${0.35 * strength})`);
  grad.addColorStop(1, `rgba(0,0,0,${0.75 * strength})`);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Subtle horizontal scanline texture across the whole viewport. */
function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${SCANLINE_OPACITY})`;
  for (let y = 0; y < h; y += SCANLINE_SPACING) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}
```

- [ ] **Step 2: Replace the existing darkness vignette and call the new overlays at the end of `render`.**

Replace the tail of `render()` (the section after `drawMinimap(ctx, state)` and the darkness vignette) with:

```typescript
  drawMinimap(ctx, state);

  // Global vignette: focuses attention on the corridor and softens edges.
  drawVignette(ctx, w, h, 1.0);

  // Subtle CRT scanline texture.
  drawScanlines(ctx, w, h);

  // Extra darkness vignette when in a darkness zone (design doc §6.2).
  if (state.inDarkness) {
    drawVignette(ctx, w, h, 1.35);
  }
```

- [ ] **Step 3: Verify visual effects.**

Run: `npm run dev`
Check in browser:
- Edges/corners are visibly darker than the center.
- Very faint horizontal lines overlay the viewport.
- The effect does not obscure the corridor or minimap.

- [ ] **Step 4: Commit.**

```bash
git add src/engine/renderer.ts
git commit -m "feat(renderer): vignette and CRT scanline overlay"
```

---

## Task 4: Redesign the top-left minimap

**Files:**
- Modify: `src/engine/renderer.ts` (replace `drawMinimap` and add helper functions)

- [ ] **Step 1: Add minimap constants and a movement-trail buffer near the top of the file.**

After the renderer palette constants, add:

```typescript
const MAP = {
  cellSize: 14,
  pad: 16,
  bg: "rgba(14,13,10,0.75)",
  border: "#4a4035",
  explored: "#2a2620",
  current: "#3a3226",
  trail: "rgba(224,164,88,0.25)",
  wall: "rgba(183,179,166,0.55)",
  door: "#e0a458",
  locked: "#c44",
  player: "#e0a458",
  playerGlow: "rgba(224,164,88,0.35)",
};

const TRAIL_MAX = 12;
const positionTrail: { x: number; y: number }[] = [];

function updateTrail(x: number, y: number): void {
  const last = positionTrail[positionTrail.length - 1];
  if (last && last.x === x && last.y === y) return;
  positionTrail.push({ x, y });
  if (positionTrail.length > TRAIL_MAX) positionTrail.shift();
}
```

- [ ] **Step 2: Replace the entire `drawMinimap` function with the redesigned version.**

```typescript
function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState): void {
  const grid = state.floor.grid;
  const { player } = state;
  const rows = grid.length;
  const cols = grid[0].length;
  const originX = MAP.pad;
  const originY = MAP.pad;
  const panelW = cols * MAP.cellSize + 12;
  const panelH = rows * MAP.cellSize + 12;

  updateTrail(player.x, player.y);

  ctx.save();

  // Panel background and border
  ctx.fillStyle = MAP.bg;
  ctx.strokeStyle = MAP.border;
  ctx.lineWidth = 1;
  roundRect(ctx, originX - 6, originY - 6, panelW, panelH, 6);
  ctx.fill();
  ctx.stroke();

  const isExplored = (x: number, y: number): boolean =>
    state.explored.has(`${x},${y}`);

  // Pass 1: explored tile fills
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isExplored(x, y)) continue;
      const px = originX + x * MAP.cellSize;
      const py = originY + y * MAP.cellSize;
      ctx.fillStyle = x === player.x && y === player.y ? MAP.current : MAP.explored;
      ctx.fillRect(px, py, MAP.cellSize, MAP.cellSize);
    }
  }

  // Pass 2: movement trail (faint dots on explored tiles)
  ctx.fillStyle = MAP.trail;
  for (let i = 0; i < positionTrail.length - 1; i++) {
    const t = positionTrail[i];
    if (!isExplored(t.x, t.y)) continue;
    const px = originX + t.x * MAP.cellSize + MAP.cellSize / 2;
    const py = originY + t.y * MAP.cellSize + MAP.cellSize / 2;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pass 3: walls and doors on explored tiles
  ctx.lineWidth = 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isExplored(x, y)) continue;
      const cell = grid[y][x];
      const px = originX + x * MAP.cellSize;
      const py = originY + y * MAP.cellSize;

      if (cell.n === "wall") strokeEdge(ctx, px, py, px + MAP.cellSize, py, MAP.wall);
      if (cell.s === "wall") strokeEdge(ctx, px, py + MAP.cellSize, px + MAP.cellSize, py + MAP.cellSize, MAP.wall);
      if (cell.w === "wall") strokeEdge(ctx, px, py, px, py + MAP.cellSize, MAP.wall);
      if (cell.e === "wall") strokeEdge(ctx, px + MAP.cellSize, py, px + MAP.cellSize, py + MAP.cellSize, MAP.wall);

      if (cell.n === "door") strokeEdge(ctx, px, py, px + MAP.cellSize, py, MAP.door);
      if (cell.s === "door") strokeEdge(ctx, px, py + MAP.cellSize, px + MAP.cellSize, py + MAP.cellSize, MAP.door);
      if (cell.w === "door") strokeEdge(ctx, px, py, px, py + MAP.cellSize, MAP.door);
      if (cell.e === "door") strokeEdge(ctx, px + MAP.cellSize, py, px + MAP.cellSize, py + MAP.cellSize, MAP.door);

      if (cell.n === "locked") strokeEdge(ctx, px, py, px + MAP.cellSize, py, MAP.locked);
      if (cell.s === "locked") strokeEdge(ctx, px, py + MAP.cellSize, px + MAP.cellSize, py + MAP.cellSize, MAP.locked);
      if (cell.w === "locked") strokeEdge(ctx, px, py, px, py + MAP.cellSize, MAP.locked);
      if (cell.e === "locked") strokeEdge(ctx, px + MAP.cellSize, py, px + MAP.cellSize, py + MAP.cellSize, MAP.locked);
    }
  }

  // Pass 4: directional player marker with glow
  const pcx = originX + player.x * MAP.cellSize + MAP.cellSize / 2;
  const pcy = originY + player.y * MAP.cellSize + MAP.cellSize / 2;

  ctx.save();
  ctx.translate(pcx, pcy);
  ctx.rotate((player.facing * Math.PI) / 2);

  ctx.shadowColor = MAP.player;
  ctx.shadowBlur = 8;
  ctx.fillStyle = MAP.player;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/** Draw a rounded rectangle path (no fill/stroke). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
```

- [ ] **Step 3: Remove the old `drawMinimap` body and any now-unused constants.**

Delete the previous `drawMinimap` implementation (lines 395–461 in the original file) and remove the old `cellSize`, `pad`, and local palette variables if they are no longer referenced. The new constants at the top of the file replace them.

- [ ] **Step 4: Verify the minimap in browser.**

Run: `npm run dev`
Walk around the dungeon and check:
- Explored tiles show an amber-tinted fill; unexplored tiles are invisible.
- Player marker is a triangle pointing in the facing direction.
- A soft glow surrounds the player marker.
- The last ~12 positions leave faint trail dots.
- The minimap has a rounded border and semi-transparent dark background.

- [ ] **Step 5: Commit.**

```bash
git add src/engine/renderer.ts
git commit -m "feat(renderer): redesigned minimap with fills, fog, marker, and trail"
```

---

## Task 5: Polish HUD party bars (optional)

**Files:**
- Modify: `src/styles.css` lines 605–626 (`.ps-bar`, `.ps-bar-fill` rules)

- [ ] **Step 1: Add gradient fills and amber glow borders to the party strip bars.**

Replace the existing `.ps-bar` and `.ps-bar-fill` rules with:

```css
.ps-char .ps-bar {
  display: inline-block;
  width: 50px;
  height: 6px;
  background: #1a1612;
  border: 1px solid #4a4035;
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 0 4px rgba(224, 164, 88, 0.25);
}

.ps-char .ps-bar-fill {
  display: block;
  height: 100%;
  transition: width 0.08s linear;
}

.ps-char .ps-bar-fill.hp {
  background: linear-gradient(90deg, #c06060 0%, #7abf7a 100%);
}

.ps-char .ps-bar-fill.sp {
  background: linear-gradient(90deg, #3a3a50 0%, #7a9abf 100%);
}
```

- [ ] **Step 2: Verify the HUD in browser.**

Run: `npm run dev`
Check:
- Each party member card has a thin amber-tinged glow around the bars.
- HP bar shows red→green gradient; SP bar shows dark→blue gradient.
- Existing text/numbers remain readable.

- [ ] **Step 3: Commit.**

```bash
git add src/styles.css
git commit -m "feat(ui): gradient HP/SP bars with amber glow border"
```

---

## Verification Summary

After all tasks:

1. `npx tsc --noEmit` passes with zero errors.
2. `npm run dev` serves the game.
3. In the dungeon view:
   - Corridors have warm brown fills and fade with distance.
   - Edges glow amber, stronger up close.
   - Corners are darkened by vignette.
   - Faint scanlines are visible but not distracting.
4. In the top-left minimap:
   - Explored tiles are filled; unexplored tiles are hidden.
   - Player marker is a directional triangle with glow.
   - A faint trail shows recent movement.
   - Panel has rounded border and dark translucent background.
5. (If Task 5 done) HUD bars have gradient fills and amber glow borders.

---

## Plan Self-Review

- **Spec coverage:**
  - Distance fog: Task 1 helpers + Task 2 loop. ✅
  - Filled wall/floor/ceiling: Task 2. ✅
  - Line glow: Task 1 `drawQuad` glow + Task 2 per-depth blur. ✅
  - Vignette: Task 3. ✅
  - CRT texture: Task 3. ✅
  - Warm palette: Task 1 constants. ✅
  - Minimap redesign: Task 4. ✅
  - HUD bars: Task 5. ✅
- **Placeholder scan:** No TBD/TODO/"implement later". All code is explicit. ✅
- **Type consistency:** Helper signatures use `CanvasRenderingContext2D` and `GameState` consistently. Constants are defined before use. ✅
