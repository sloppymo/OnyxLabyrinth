# Agent Notes for OnyxLabyrinth

This file exists to help the next LLM/AI IDE get oriented quickly and avoid the same regressions that have been fixed multiple times.

## Project basics

- **Stack:** TypeScript, Vite, vanilla HTML/CSS/Canvas.
- **No framework.** The UI is hand-drawn DOM + a 2D canvas corridor renderer.
- **Entry:** `src/main.ts` bootstraps the app and mounts it into `#app`.
- **Build:** `npm run build` (runs `tsc && vite build`). The build must pass TypeScript with zero errors.
- **Dev server:** `npm run dev`.
- **Production preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/`.
- **Deployment:** GitHub Pages serves the `docs/` folder. After `npm run build`, copy `dist/` into `docs/` and remove stale hashed JS files in `docs/assets/`.

## File map

| File | Responsibility |
|------|----------------|
| `src/engine/renderer.ts` | Corridor 3D view (the most fragile code). |
| `src/engine/shell.ts` | DOM shell: canvas sizing, message overlay, party strip, mode visibility. |
| `src/engine/input.ts` | Dungeon exploration key bindings. |
| `src/engine/camera.ts` | Movement, turning, collision, door unlock. |
| `src/engine/automap.ts` | Auto-map rendering. |
| `src/game/state.ts` | `GameState` factory and mode setter. |
| `src/game/dungeon.ts` | Grid model, edge helpers, carving. |
| `src/game/party.ts` | Character/party creation. |
| `src/game/combat.ts` | Combat state/helpers. |
| `src/engine/combat-ui.ts` | Combat screen controller. |
| `src/engine/camp-ui.ts` | Camp screen controller. |
| `src/engine/town-ui.ts` | Town/hub screen controller. |
| `src/engine/save-ui.ts` | Save/load menu controller. |
| `src/engine/party-ui.ts` | Party creation controller. |
| `src/data/floors.ts` | Floor definitions and cloning. |
| `src/data/enemies.ts` | Encounter tables and resolution. |
| `src/data/spells.ts` | Spell definitions. |
| `src/data/items.ts` | Item definitions. |
| `src/styles.css` | All styling. |
| `docs/` | GitHub Pages target; copied from `dist/`. |

## Hard rules

1. **Do not change game logic** (movement, collision, combat math, encounter rates, map data) unless the user explicitly asks for it.
2. **Do not remove existing visual effects:** fog falloff, amber glow lines, vignette, CRT scanlines.
3. **Do not change the perspective/vanishing-point math** in the corridor renderer unless asked.
4. **Renderer changes must be verified visually.** After any change to `src/engine/renderer.ts`:
   - Run `npm run build`.
   - Start the production preview.
   - Capture screenshots of at least: straight corridor, open side passage, front wall, darkness zone.
   - Inspect for black walls, missing ceiling, center seams, or texture stretching.

## Common pitfalls

- **`#message` overlay:** The message box is absolutely positioned over the top 35% of the viewport. When empty it must be hidden (`display: none` / `visibility: hidden` / `opacity: 0`) or it covers the ceiling with a black box. `shell.setMessage()` handles this.
- **Texture cache:** `renderer.ts` caches the loaded texture set once. If any image fails, the cache still holds `null` for that slot and the renderer silently falls back to gradients. Check the browser console if a texture seems missing.
- **CanvasPattern lifecycle:** `CanvasPattern` objects are tied to a specific canvas context. When the canvas bitmap is reset (e.g., `canvas.width = ...` in `shell.resizeCorridorCanvas()`), cached patterns become invalid and draw as black/transparent. Do not cache `CanvasPattern` objects across frames; recreate them inside the draw call.
- **Canvas sizing:** The canvas intrinsic size is kept in sync with the CSS container by `shell.resizeCorridorCanvas()`. Do not set `canvas.width`/`height` to fixed values elsewhere.
- **Display state:** `main.ts` previously toggled `viewportWrap`, `canvas`, `map-canvas`, and `combat-panel` visibility in many places. The single source of truth is now `shell.showMode()`.
- **Far-to-near rendering:** The renderer collects per-depth draw commands and executes them far-to-near. Do not insert raw drawing calls inside the forward visibility walk without pushing them into the command list.
- **Front-wall depth 0:** All front-facing wall quads, including the closest one, are textured. Avoid special-casing `depth === 0` to skip the texture fill; that produces a black hole where the wall should be.

## Rendering verification checklist

After any change to `src/engine/renderer.ts`, confirm these in-game views before calling it done:

1. **Straight corridor:** walls, floor, and ceiling all show texture; no black surfaces.
2. **Open side passage:** the lateral void has floor/ceiling/back-wall texture, not a flat black cut-out.
3. **Front wall at depth 0:** walking up to a wall shows a textured surface, not a black rectangle.
4. **Floor checkerboard:** alternating A/B tiles are visible as you move forward.
5. **Combat → dungeon transition:** after fleeing or winning a fight, returning to the dungeon still shows textures (catches pattern-cache invalidation).
6. **Map overlay:** pressing `M` shows the auto-map without corrupting the corridor canvas.

Use Playwright, Puppeteer, or a manual browser at `http://localhost:5176/OnyxLabyrinth/`.

## Conventions

- Prefer `const` and explicit types.
- Keep renderer constants in `RENDER_CONFIG` at the top of `renderer.ts`.
- Run `npm run build` before claiming any fix is complete.
- After rebuilding, refresh `docs/` from `dist/` if the user wants the GitHub Pages build updated.
