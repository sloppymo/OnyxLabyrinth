# Wall, floor, ceiling, and transition asset inventory

Audit date: 2026-08-13

Audit branch: `audit/wall-tile-inventory-2026-08-13`

Base: `origin/main` at `11573958c9a69875317ef952f660ee01dc707420`

## Executive result

The campaign has no confirmed production wall/floor/ceiling defect that warrants an art or renderer change in this pass. All reachable themes loaded in the production bundle, Canvas passed 49 live campaign captures plus map/combat lifecycle checks, and the focused Floor 2 abyss bridge route passed in both WebGL and Canvas. No broken requests, browser errors, black walls, missing ceilings, transparent rectangles, boundary fallback, or incorrect material assignments were observed.

The repository does contain stale and reserved assets:

- The 20 `public/assets/tilesets/f1..f5/{wall,floorA,floorB,ceiling}.png` files are stale public mirrors. The renderer always chooses the bundled `src/assets/fN_*_256.png` files for these themes.
- Four early generic primitives in `src/assets/` are unreferenced (`wall_tile_amber`, `wall_tile_vine`, `floor_tile_a`, `floor_tile_b`, plus `ceiling_tile`). They are stale candidates, not runtime fallbacks.
- The complete `camp` tileset is intentionally reserved. The ordinary Camp screen is DOM-based, but the renderer retains a dedicated outdoor `camp` sky path and hub work exists; it should not be deleted as part of this pass.
- The WebGL run exposed a maintained-playtest harness defect: `floor-visual-audit.mjs` probes hidden `#view` Canvas pixels even when WebGL is active. Its screenshots, renderer identity, readiness, network, console, and error-event results were valid; its luminance/visibility failures were false negatives.

No production asset was changed. This is deliberate: the visible repetition is coherent old-school repetition, while the separate `art/wall-tile-variants` branch adds files the current renderer does not reference. Merging those files alone would not alter gameplay visuals.

## Runtime path and fallback behavior

1. `FloorDef.tilesetTheme` supplies the primary theme. `tilesetZones` override it per cell, with the last overlapping zone winning (`themeAt`).
2. `f1`, `f2`, `f2b`, `f3`, `f4`, and `f5` resolve through Vite imports in `BUNDLED_THEME_URLS`; same-named public files cannot win.
3. `hotboi`, `namanda`, `isobel`, and `camp` resolve from `public/assets/tilesets/<theme>/`.
4. Canvas prepares one surface image per theme and builds a cell texture grid. A missing regional surface falls back to the primary theme; a missing primary theme falls back to `f1`; a final missing surface becomes the procedural fill.
5. WebGL consumes the same prepared sources, uses nearest filtering, and uses a flat material color only when no prepared source exists.
6. Water replaces only floor A/B. Doors use the regional door, then the primary door, then the shared placeholder. Stairs use a theme-specific panel when present, otherwise the normal door. Door-feature images are overlays/replacements, not base tiles.

## Campaign theme use

| Theme | Actual runtime use | Classification | Confidence |
|---|---|---|---|
| `f1` | Floor 1 base; Floor 2 abyss-bridge masonry | Actively used and healthy | High: static trace + live captures |
| `f2` | Floor 2 base; Floor 1 unfinished index | Actively used and healthy; bookshelf repetition intentional | High |
| `f2b` | Floor 2 forbidden wing | Actively used and healthy | High |
| `f3` | Floor 3 base; Floor 1 ember regions | Actively used and healthy | High |
| `f4` | Floor 4 base; Floor 1 cut-bell chapel | Actively used and healthy | High |
| `f5` | Floor 5 base; Floor 1 cistern regions | Actively used and healthy | High |
| `hotboi` | Floor 1 tavern | Actively used and healthy | High |
| `namanda` | Floor 1 church and threshold | Actively used and healthy; intentionally restrained | High |
| `isobel` | Floor 1 Iso-Spells nook | Actively used; low-detail but coherent at its tiny exposure | High |
| `water` | Water cells on authored floors | Actively used floor override | High |
| `camp` | No campaign floor/zone; dedicated renderer sky support | Intentionally reserved | Medium-high |

## Asset inventory

All listed files are PNG. Unless noted, dimensions are 256×256, 8-bit. “Alpha” means an alpha channel is present, not necessarily that transparent pixels are visible. “Generated” includes deterministic project generators and derived recolors; “authored” includes curated hand/PixelLab composites.

### Bundled campaign surfaces (runtime ground truth)

| Asset path | Mode / alpha | Theme / role | Active references and actual use | Origin | Classification / replacement | Confidence |
|---|---|---|---|---|---|---|
| `src/assets/f1_wall_256.png` | RGB / no | f1 wall | `BUNDLED_THEME_URLS`; F1 base, F2 bridge threshold | deterministic generated | Active healthy; keep | High |
| `src/assets/f1_floor_a_256.png` | RGB / no | f1 floor A | Same; checkerboard even cells | deterministic generated | Active healthy; keep | High |
| `src/assets/f1_floor_b_256.png` | RGB / no | f1 floor B | Same; checkerboard odd cells | deterministic generated | Active healthy; keep | High |
| `src/assets/f1_ceiling_256.png` | RGB / no | f1 ceiling | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f1_door_256.png` | RGB / no | f1 door/threshold | Same; regional/primary door selection | deterministic generated | Active healthy; keep | High |
| `src/assets/f2_wall_256.png` | RGB / no | f2 bookshelf wall | F2 base, F1 index | curated/generated pipeline | Active; repeated shelf motif is intentional, not a seam defect | High |
| `src/assets/f2_floor_a_256.png` | RGB / no | f2 floor A | F2/F1 f2 cells | deterministic generated | Active healthy; keep | High |
| `src/assets/f2_floor_b_256.png` | RGB / no | f2 floor B | F2/F1 f2 cells | deterministic generated | Active healthy; keep | High |
| `src/assets/f2_ceiling_256.png` | RGB / no | f2 ceiling | F2/F1 f2 cells | deterministic generated | Active healthy; keep | High |
| `src/assets/f2_door_256.png` | RGB / no | f2 door | F2/F1 f2 doors | deterministic generated | Active healthy; keep | High |
| `src/assets/f2b_wall_256.png` | RGBA / yes | forbidden-wing wall | F2 `f2b` zone | generated HSL recolor | Active healthy; keep | High |
| `src/assets/f2b_floor_a_256.png` | RGBA / yes | forbidden-wing floor A | F2 `f2b` zone | generated HSL recolor | Active healthy; keep | High |
| `src/assets/f2b_floor_b_256.png` | RGBA / yes | forbidden-wing floor B | F2 `f2b` zone | generated HSL recolor | Active healthy; keep | High |
| `src/assets/f2b_ceiling_256.png` | RGBA / yes | forbidden-wing ceiling | F2 `f2b` zone | generated HSL recolor | Active healthy; keep | High |
| `src/assets/f2b_door_256.png` | RGBA / yes | forbidden-wing door | F2 `f2b` zone | generated HSL recolor | Active healthy; keep | High |
| `src/assets/f3_wall_256.png` | RGB / no | ember wall | F3 base, F1 ember zones | deterministic generated | Active reference-quality; keep | High |
| `src/assets/f3_floor_a_256.png` | RGB / no | ember floor A | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f3_floor_b_256.png` | RGB / no | ember grate/floor B | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f3_ceiling_256.png` | RGB / no | ember ceiling | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f3_door_256.png` | RGB / no | ember door | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f4_wall_256.png` | RGB / no | null-choir wall | F4 base, F1 chapel | deterministic generated | Active healthy; keep | High |
| `src/assets/f4_floor_a_256.png` | RGB / no | null-choir floor A | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f4_floor_b_256.png` | RGB / no | null-choir floor B | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f4_ceiling_256.png` | RGB / no | null-choir ceiling | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f4_door_256.png` | RGB / no | null-choir door | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f5_wall_256.png` | RGB / no | cistern wall | F5 base, F1 cistern | deterministic generated | Active healthy; keep | High |
| `src/assets/f5_floor_a_256.png` | RGB / no | cistern floor A | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f5_floor_b_256.png` | RGB / no | cistern floor B | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f5_ceiling_256.png` | RGB / no | cistern ceiling | Same | deterministic generated | Active healthy; keep | High |
| `src/assets/f5_door_256.png` | RGB / no | cistern door | Same | deterministic generated | Active healthy; keep | High |

### Public theme surfaces and transition materials

| Asset path | Mode / alpha | Theme / role | Active references and actual use | Origin | Classification / replacement | Confidence |
|---|---|---|---|---|---|---|
| `public/assets/tilesets/hotboi/wall.png` | RGB / no | tavern wall | F1 `hotboi-tavern` | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/hotboi/floorA.png` | RGB / no | tavern floor A | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/hotboi/floorB.png` | RGB / no | tavern floor B | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/hotboi/ceiling.png` | RGB / no | tavern ceiling | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/namanda/wall.png` | RGB / no | church wall | F1 church/threshold | authored/curated | Active healthy; restraint supported by church review | High |
| `public/assets/tilesets/namanda/floorA.png` | RGB / no | church floor A | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/namanda/floorB.png` | RGB / no | church floor B | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/namanda/ceiling.png` | RGB / no | church ceiling | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/isobel/wall.png` | palette / no | arcane-shop wall | F1 Iso-Spells | authored/curated | Active, visually simple but coherent; no replacement justified | High |
| `public/assets/tilesets/isobel/floorA.png` | palette / no | arcane-shop floor A | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/isobel/floorB.png` | palette / no | arcane-shop floor B | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/isobel/ceiling.png` | palette / no | arcane-shop ceiling | Same | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/isobel/door.png` | palette / no | arcane-shop base door | Same; may sit below named overlay | authored/curated | Active healthy; keep | High |
| `public/assets/tilesets/water/floorA.png` | RGB / no | water floor A | Shared water-cell override | authored | Active healthy; keep | High |
| `public/assets/tilesets/water/floorB.png` | RGB / no | water floor B | Shared water-cell override | authored | Active healthy; keep | High |
| `public/assets/tilesets/camp/wall.png` | palette / no | outdoor wall/horizon | No campaign floor; renderer `camp` path | generated prototype | Intentionally reserved; do not replace/delete here | Medium-high |
| `public/assets/tilesets/camp/floorA.png` | RGBA / yes | outdoor floor A | Same | generated prototype | Intentionally reserved | Medium-high |
| `public/assets/tilesets/camp/floorB.png` | RGBA / yes | outdoor floor B | Same | generated prototype | Intentionally reserved | Medium-high |
| `public/assets/tilesets/camp/ceiling.png` | RGBA / yes | outdoor ceiling | Same | generated prototype | Intentionally reserved | Medium-high |
| `public/assets/tilesets/camp/door.png` | RGBA / yes | outdoor door | Same | generated prototype | Intentionally reserved | Medium-high |
| `public/assets/tilesets/camp/sky.png` | RGB / no; 1254×1254 | heading-aware panorama | Dedicated `skyUrlForTheme("camp")` | generated/curated prototype | Intentionally reserved | High static, medium runtime |
| `public/assets/tilesets/f1/stairs.png` | RGBA / yes | F1 stairs panel | Optional stairs lookup; F1 stairs views | authored | Active healthy; keep | High |
| `src/assets/door_placeholder_256.png` | RGBA / yes | shared door fallback | Loaded at boot; used only when theme door absent/fails | authored | Active fallback; healthy | High |
| `public/assets/doors/door.png` | RGBA / yes | legacy/shared door image | No current import; bundled placeholder owns fallback | authored | Unreferenced, probably stale; leave | High |

### Named transition and architectural overlays

| Asset path | Mode / alpha | Role | Active references and actual use | Origin | Classification / replacement | Confidence |
|---|---|---|---|---|---|---|
| `public/assets/door-features/camp-entrance-gate.png` | palette / no | Camp entrance threshold | `door-features.ts`, F1 gate placement | authored/curated | Active healthy | High |
| `public/assets/door-features/hot-bois-tavern-door.png` | RGBA / yes | Tavern hero door | `door-features.ts`, F1 | authored/curated | Active healthy | High |
| `public/assets/door-features/isobels-iso-spells-door.png` | palette / no | Iso-Spells hero door | `door-features.ts`, F1 | authored/curated | Active healthy | High |
| `public/assets/door-features/namanda-church-door.png` | RGBA / yes | Church hero door | `door-features.ts`, relocated to church mouth | authored composite | Active healthy; correct dedicated threshold | High |
| `public/assets/architectural-props/gate-kept.png` | RGB / no | Kept Gate landmark | F1 architectural prop placement | authored/curated | Active reference-quality | High |
| `public/assets/architectural-props/support-basalt.png` | RGB / no | bridge/elevated support | Authored architectural placements | authored/curated | Active healthy | High |

### Stale public mirrors and unreferenced primitives

These are inventory entries, not deletion instructions.

| Asset path | Mode / alpha | Intended role | Actual runtime use | Origin | Classification / replacement | Confidence |
|---|---|---|---|---|---|---|
| `public/assets/tilesets/f1/wall.png` | RGB / no | old f1 wall | None; bundled f1 wins | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f1/floorA.png` | RGB / no | old f1 floor A | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f1/floorB.png` | RGB / no | old f1 floor B | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f1/ceiling.png` | RGB / no | old f1 ceiling | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f2/wall.png` | RGB / no | old f2 wall | None; bundled f2 wins | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f2/floorA.png` | RGB / no | old f2 floor A | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f2/floorB.png` | RGB / no | old f2 floor B | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f2/ceiling.png` | RGB / no | old f2 ceiling | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f3/wall.png` | RGB / no | old f3 wall | None; bundled f3 wins | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f3/floorA.png` | RGB / no | old f3 floor A | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f3/floorB.png` | RGB / no | old f3 floor B | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f3/ceiling.png` | RGB / no | old f3 ceiling | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f4/wall.png` | RGB / no | old f4 wall | None; bundled f4 wins | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f4/floorA.png` | RGB / no | old f4 floor A | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f4/floorB.png` | RGB / no | old f4 floor B | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f4/ceiling.png` | RGB / no | old f4 ceiling | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f5/wall.png` | RGB / no | old f5 wall | None; bundled f5 wins | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f5/floorA.png` | RGB / no | old f5 floor A | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f5/floorB.png` | RGB / no | old f5 floor B | None | old generated draft | Unreferenced, proven stale mirror | High |
| `public/assets/tilesets/f5/ceiling.png` | RGB / no | old f5 ceiling | None | old generated draft | Unreferenced, proven stale mirror | High |
| `src/assets/wall_tile_amber_256.png` | RGB / no | early generic wall | No import/reference | early placeholder | Unreferenced, probably stale | High |
| `src/assets/wall_tile_vine_256.png` | palette 4-bit / no | early generic wall | No import/reference | early placeholder | Unreferenced, probably stale | High |
| `src/assets/floor_tile_a_256.png` | RGB / no | early generic floor A | No import/reference | early placeholder | Unreferenced, probably stale | High |
| `src/assets/floor_tile_b_256.png` | RGB / no | early generic floor B | No import/reference | early placeholder | Unreferenced, probably stale | High |
| `src/assets/ceiling_tile_256.png` | RGB / no | early generic ceiling | No import/reference | early placeholder | Unreferenced, probably stale | High |

## Visual findings and classification

| Problem | Evidence | Root cause | Proposed smallest fix | Risk |
|---|---|---|---|---|
| WebGL visual audit reports every frame invisible/black | WebGL screenshots visibly render; renderer readiness, requests, console, and debug errors pass; report probes hidden `#view` | Test harness assumes Canvas owns `#view` even when WebGL canvas is active | Future isolated test-only fix: probe active backend canvas or skip 2D luminance on WebGL | Low, but outside production-art scope |
| F1 masonry and F2 shelves repeat conspicuously | Native-scale straight/close-wall captures | One wall texture per theme; intentional renderer contract | Preserve. Variants require an explicit renderer/data design and visual QA, not orphan files | Medium if later implemented |
| F1→F2 abyss bridge changes from masonry to shelves | Focused 18-backend captures; zone trace | Deliberate `abyss-bridge-masonry` threshold | No change | Low |
| Namanda wall is visually quiet | F1 regional capture and existing church art review | Hero door, ceiling, altar panels, and furnishings carry the identity; base wall is intentionally restrained | No change | Replacement could flatten the hierarchy |
| Isobel theme is lower-detail/palette-based | F1 regional capture; 9-wall-edge exposure in prior wall count | Tiny bespoke shop theme with strong colored lighting and feature art | No change | Low payoff, palette mismatch risk |
| Public f1–f5 mirrors disagree with shipping bundle | Static resolver trace and differing files | Historical mirror convention superseded by bundled imports | Document as stale; delete only in a dedicated cleanup commit after team confirmation | Low runtime, medium workflow |
| Rooms at absolute map edges could sample fallback | Source inspection and live edge/front-wall captures | Known Canvas floor-cast limitation | No observed campaign defect; retain authored buffer rule | Renderer change would be high risk |

## Route QA

The maintained audit derived valid runtime poses rather than relying on filenames or static maps. It covered all campaign themes and, per floor, straight corridor, open side passage, front wall, door, floor A/B variation, darkness, landmark, and regional-theme views. This includes representative close/far walls, ceilings, floors, corners, narrow/wide spaces, stairs/doors, darkness, and material transitions.

Focused evidence:

- Canvas campaign gallery/report: `output/playwright/wall-tile-audit-canvas/` — 49/49 captures passed.
- WebGL campaign gallery/report: `output/playwright/wall-tile-audit-webgl/` — screenshots and runtime health valid; luminance objectives invalid because of the harness issue above.
- Abyss bridge parity: `output/playwright/wall-tile-audit-abyss/{webgl,canvas}/` — nine captures per backend, real crossing, blocked void edge, correct backend, zero browser errors.

The generic route set reached F1 base/Kept-Gate approach materials and elevated/landmark regions, all F1 special themes, F2 library/darkness/forbidden-wing/bridge transitions, and F3 ordinary/door/darkness/stairs/forge materials. Existing dedicated route scripts for the Kept Gate, Cursed Library, Duelist's Vigil, cinematic NPC dialogue, and reward framing were inspected for compatibility; none was modified or overwritten.

## Inventory totals

- Assets inspected in the scoped inventory: **85**.
- Actively used or active fallback/overlay assets: **53**.
- Intentionally reserved assets: **6** (`camp` wall/floors/ceiling/door/sky).
- Unreferenced/stale candidates: **26** (20 public campaign mirrors, five generic primitives, one legacy shared door).
- Missing active assets or silent runtime fallback observed: **0**.
- Uncertain assets requiring future runtime activation: **6 reserved Camp assets**.
- Generated/derived assets: **at least 56** (30 bundled campaign surfaces, 20 old mirrors, five generic primitives, Camp prototype family; some later authored assets have mixed generated/curated provenance).
- Hand-authored/curated assets: **at least 29** (special themes, water, doors, named transitions, architectural props; provenance is mixed for PixelLab-derived composites).

## Decision

Stop after inventory and visual reporting. No production art correction clears the evidence threshold. The live materials are coherent, the apparent transition changes are authored zones, and the only demonstrated defect is in the WebGL audit probe. Stale files remain in place because this pass is not authorized to turn a proven inventory finding into a broad cleanup, and a prior unmerged lineage already contains such deletion work.
