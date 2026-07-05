# Wizardry V SNES Layout Alignment — Design Spec

## Goal
Adjust the dungeon crawler UI proportions, typography, and panel borders to match the authentic Wizardry V (SNES, 1992) screen layout, while keeping the existing corridor atmospheric effects (fog, glow, gradient fills, vignette, scanlines) unchanged.

## Reference
- Native SNES resolution: 256×224 (8:7 aspect ratio, boxy / nearly square).
- Text boxes occupy the top third of the screen when active.
- Borders are thin 1px solid rectangles, square corners, no shadows/glow on chrome.
- Text is a chunky low-res bitmap/tile font with hard pixel edges, large relative to the frame.
- Overall UI chrome is flat and crisp.

## Decisions

### 1. Viewport aspect ratio
- Canvas internal resolution changes from 960×600 (16:10-ish) to **768×672** (3× the SNES 256×224 native resolution, exact 8:7 ratio).
- The auto-map canvas (`#map-canvas`) uses the same internal resolution.
- CSS scales the canvas to fit the browser viewport while preserving the 8:7 ratio; pillarbox/letterbox against the black page background.

### 2. Message / dialogue box
- DOM order in `#game-wrap`: `#message` first (top), then `#view`, then `#party-strip`, then `#hint`.
- The message box spans the full width of the game frame, with a **1px solid amber border**, flat black background (`var(--bg)`), no border-radius, no shadow/glow.
- Minimum height is set so the box reads as the top portion of the frame (~140–160 px, multi-line capable), with generous padding.
- Text is centered or left-aligned, rendered in the pixel font at a chunky size (~18–20 px) with tight line-height so a few lines fill the box.

### 3. Font
- The project already uses the custom **FF36** bitmap font (`public/final-fantasy-36.ttf`) loaded via `@font-face` and referenced by the `--game-font` CSS variable.
- Disable anti-aliasing / font smoothing globally for hard pixel edges: `-webkit-font-smoothing: none; -moz-osx-font-smoothing: grayscale; font-smooth: never;`.
- Increase in-game text sizes so they read as chunky relative to the viewport (message ~18–20 px, party strip ~12 px, menus/panels ~14–16 px).
- Canvas text (feature glyphs in `renderer.ts`, auto-map labels in `automap.ts`) already references FF36 and remains unchanged.

### 4. Borders across UI chrome
- Remove `border-radius` from all UI panels and containers: `canvas#view`, `canvas#map-canvas`, `#combat-panel`, `#party-strip` character cards, bars, quick-start cards, character sheets, and menu items.
- Change canvas / combat-panel borders from 2px to **1px solid**.
- Remove `box-shadow` glow from `.ps-bar`.
- Square off the canvas-drawn minimap border in `renderer.ts` (replace `roundRect` with a plain rectangle) so it matches the flat UI style.
- Keep corridor rendering glow/fog effects untouched; this only affects UI panel chrome.

## Scope
- Layout, CSS, and minor DOM order changes only.
- No changes to game logic, movement, combat, map data, or corridor rendering style.
- Minimap remains a separate full-screen toggle, not a corner overlay.

## Files affected
- `src/main.ts` — canvas dimensions, DOM order.
- `src/styles.css` — aspect-ratio scaling, message box styling, font smoothing, border audit.
- `src/engine/renderer.ts` — square minimap corners.
