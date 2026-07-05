# Dungeon Renderer Visual Upgrade — Design Spec

## Context

The project is a first-person, grid-based dungeon crawler (Wizardry-style) rendered on a 2D canvas. The current renderer draws a wireframe corridor made of converging line segments, plus a small top-left minimap and a bottom HUD party-status strip. This spec defines a rendering-layer-only visual upgrade to make the view feel moody and atmospheric while preserving all game logic.

## Goals

1. Upgrade the main corridor view with depth-based fog, filled wall/floor/ceiling polygons, line glow, vignette, and a subtle CRT scanline texture.
2. Redesign the top-left minimap with explored-tile fills, fog of war, a directional player marker, glow, movement trail, and an inset HUD panel look.
3. (Optional, lower priority) Polish the HUD HP/MP bars with segmented/gradient fills and amber-glowing borders.
4. Keep all changes inside the rendering layer — no changes to movement, collision, combat, map data structures, keybindings, or state management.

## 1. Main Corridor View

### 1.1 Distance fog / falloff

- Each depth segment index `d` (0 = nearest, increasing toward the vanishing point) multiplies stroke and fill opacity by `fogFalloff^d`.
- Default: `FOG_FALLOFF = 0.55`, `BASE_OPACITY = 1.0`.
- The farthest visible geometry should approach near-black, not remain fully lit.

### 1.2 Filled wall / floor / ceiling polygons

- Each quad drawn by `drawQuad` receives a fill in addition to its stroke.
- Wall fill: warm brown `#3d3228` family, with a horizontal linear gradient that is brighter on the edge nearer the camera and darker toward the vanishing point.
- Floor fill: darkest family `#2a221a`, fading to transparent/black toward the bottom of the screen.
- Ceiling fill: slightly lighter than floor `#1f1b16`, fading to transparent/black toward the top.
- Fill opacity follows the same depth falloff as strokes but at a lower multiplier.

### 1.3 Line glow

- Strokes use `ctx.shadowColor = AMBER` and `ctx.shadowBlur` in the 4–8 px range.
- Near edges (`d = 0`) glow strongest; distant edges use smaller blur.
- `shadowBlur` is reset after strokes to avoid affecting fills/text.

### 1.4 Vignette

- After all scene geometry is drawn, overlay a full-canvas radial gradient that is transparent in the center and dark toward the edges/corners.
- Default: transparent at center, `rgba(0,0,0,0.4)` at mid-radius, `rgba(0,0,0,0.75)` at edges.

### 1.5 CRT scanline texture

- Optional finishing touch: draw faint horizontal lines (1 px high, every 3 px) across the whole viewport at very low opacity (~12%).
- Must remain subtle enough to preserve readability.

### 1.6 Color palette

- Keep amber/orange accent (`#e0a458`) for strokes and UI.
- Shift fills to warm near-black browns so the scene reads as torch-lit stone rather than empty vector space.

## 2. Minimap Redesign

- **Explored tiles:** filled with a subtle amber-on-dark tint (`#2a2620` base, `#3a3226` for current tile).
- **Unexplored tiles:** not drawn at all (fog of war).
- **Player marker:** replace the plain dot with a small directional triangle/wedge that rotates with `player.facing`.
- **Glow:** soft amber glow around the player marker.
- **Movement trail:** faint dots or tiny line segments for the last few visited tiles (optional but desirable).
- **Panel styling:** rounded-corner border, semi-transparent dark background, so it reads as a HUD element inset on the 3D view.

## 3. HUD Party Bars (Optional)

- Each party member card keeps its existing name/numbers.
- HP/MP bars get a gradient fill (green toward full, red toward empty) or at minimum a segmented/gradient look.
- Thin amber-glowing border matching the corridor/minimap theme.

## Constraints

- Do not change game logic: movement, collision, combat resolution, map/grid data, or keybindings.
- Preserve the existing coordinate system and vanishing-point math; only change how computed points are drawn.
- Performance must remain acceptable for real-time rendering. Gradients that depend only on screen size can be cached or created once per frame; avoid large blur radii and full-screen per-pixel recomputation.
- Keep the amber/orange-on-black identity.

## Files to Modify

- `src/engine/renderer.ts` — corridor fills/fog/glow/vignette/scanlines, minimap redesign.
- `src/styles.css` — HUD party bar gradient/border styles (optional).
- `src/main.ts` — only if HUD bar HTML structure needs a class hook for gradients.

## Tunable Constants

| Constant | Default | Purpose |
|----------|---------|---------|
| `FOG_FALLOFF` | `0.55` | Per-depth opacity multiplier. |
| `BASE_OPACITY` | `1.0` | Stroke opacity at depth 0. |
| `FILL_OPACITY_MULTIPLIER` | `0.45` | Fill opacity relative to stroke opacity. |
| `GLOW_BLUR_NEAR` | `7` | Shadow blur for nearest edges. |
| `GLOW_BLUR_FAR` | `2` | Shadow blur for deepest edges. |
| `WALL_FILL` | `#3d3228` | Wall base fill color. |
| `FLOOR_FILL` | `#2a221a` | Floor base fill color. |
| `CEILING_FILL` | `#1f1b16` | Ceiling base fill color. |
| `SCANLINE_OPACITY` | `0.12` | CRT line opacity. |
| `MAP_BG` | `rgba(14,13,10,0.75)` | Minimap panel background. |
| `MAP_EXPLORED` | `#2a2620` | Explored tile fill. |
| `MAP_CURRENT` | `#3a3226` | Current tile fill. |
| `MAP_PLAYER` | `#e0a458` | Player marker color. |

## Non-Goals

- No WebGL/shader rewrite; keep Canvas2D.
- No new game features (treasure, combat, spells).
- No changes to the full-screen automap (`src/engine/automap.ts`) unless explicitly requested later.
