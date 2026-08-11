# Level 2 "descent" Asset Manifest

All assets ship under `public/assets/`. Working candidates, palette
references, and intermediate passes live (uncommitted) under
`art/pixellab-candidates/descent/`. Renderer plumbing: tileset theme
`descent` is registered in `BUILT_IN_TILESET_THEMES`
(`src/game/floor-map.ts`); sprite ids are registered in
`src/data/wall-features.ts`, `src/data/ceiling-sprites.ts`,
`src/data/ceiling-features.ts`, `src/data/map-sprites.ts`.

Provenance legend: **PixelLab** = `scripts/pixellab-generate.mjs` (pixflux,
palette-conditioned), then Pillow cleanup (alpha keying, palette recolor,
quantize, luma targeting via `scripts/process-generated-tileset.py`);
**hand-built** = composed/pixel-edited programmatically (PIL) from project
palette + wall texture.

## Tileset surfaces (`public/assets/tilesets/descent/`)

| ID | File | Size | Role | Reuse | Provenance |
|----|------|------|------|-------|-----------|
| wall | `wall.png` | 256×256 RGB | Megalithic ashlar wall, ~3 courses/tile | kit base | PixelLab `wall-02` → seam/luma/quantize |
| floorA | `floorA.png` | 256×256 RGB | Worn flagstones, sanded joints | kit base | PixelLab `floorA-01` → normalized (luma 55) |
| floorB | `floorB.png` | 256×256 RGB | Settled/cracked flagstones | kit base | PixelLab `floorB-01` → normalized (luma 48) |
| ceiling | `ceiling.png` | 256×256 RGB | Dark coffered vault | kit base | hand-built from wall (×0.42 + coffer beams) |
| door | `door.png` | 256×256 RGB | Bronze-banded slab door in stone surround | kit base | PixelLab `door-02` center composited onto wall |

## Wall features (`public/assets/wall-features/`, first vertical unit only)

| Sprite id | File | Size | Role | Reuse | Provenance |
|-----------|------|------|------|-------|-----------|
| descent-relief-procession | `descent-relief-procession.png` | 256×128 RGBA | Marching-figure frieze | common | PixelLab `wf-relief-01` |
| descent-niche-votive | `descent-niche-votive.png` | 128×128 RGBA | Votive niche with bowl | common | PixelLab `wf-niche-01`, darkened |
| descent-bronze-grate | `descent-bronze-grate.png` | 128×128 RGBA | Vent/service grate | common | PixelLab `wf-grate-01` |
| descent-repair-plate | `descent-repair-plate.png` | 128×128 RGBA | Bolted bronze patch over crack | common | hand-built |
| descent-gate-left | `descent-gate-left.png` | 128×256 RGB | Hero gate left leaf | hero-only | PixelLab base → hand-rebuilt (PIL) |
| descent-gate-right | `descent-gate-right.png` | 128×256 RGB | Hero gate right leaf | hero-only | same master, split |

## Ceiling sprites (`public/assets/ceiling-sprites/`, top-anchored at ceilingZ)

| Sprite id | File | Size | baseSize | Role | Provenance |
|-----------|------|------|----------|------|-----------|
| descent-chain-heavy | `descent-chain-heavy.png` | 128×128 RGBA | 52 | Hanging chain + ring | PixelLab `cs-chain-01` |
| descent-censer | `descent-censer.png` | 128×128 RGBA | 40 | Hanging censer, embers | PixelLab `cs-censer-01`, darkened |
| descent-counterweight | `descent-counterweight.png` | 192×384 RGBA | 72 | Suspended stone block | hand-built (PIL) |

## Ceiling features (`public/assets/ceiling-features/`, replace ceiling tile)

| Sprite id | File | Size | Role | Provenance |
|-----------|------|------|------|-----------|
| descent-ceiling-shaft | `descent-ceiling-shaft.png` | 256×256 RGB | Square hoist shaft opening | PixelLab `cf-shaft-01` → normalized |
| descent-ceiling-medallion | `descent-ceiling-medallion.png` | 256×256 RGB | Bronze ring medallion | PixelLab `cf-medallion-01` → normalized |

## Map sprites (`public/assets/map-sprites/`, floor-grounded billboards)

| Sprite id | File | Size | baseSize | Role | Provenance |
|-----------|------|------|----------|------|-----------|
| descent-toppled-drum | `descent-toppled-drum.png` | 128×128 RGBA | 36 | Toppled column drum | PixelLab `ms-drum-01` |
| descent-offering-bowls | `descent-offering-bowls.png` | 128×128 RGBA | 16 | Stacked votive bowls | PixelLab `ms-bowls-01`, de-gilded |
| descent-rubble | `descent-rubble.png` | 128×128 RGBA | 40 | Collapsed masonry pile | PixelLab `ms-rubble-01` |
| descent-fallen-standard | `descent-fallen-standard.png` | 128×128 RGBA | 36 | Standard + oxblood banner | PixelLab `ms-standard-02`, recolored |
| descent-brazier | `descent-brazier.png` | 128×128 RGBA | 40 | Burning tripod brazier, `light` def | PixelLab `ms-brazier-01`, red coals cleaned |

## Renderer requirements

- Tileset surfaces: opaque RGB, tileable (seam-blended at 10px), nearest
  sampling; the renderer applies its own brightness/contrast prep.
- Wall features and ceiling/map sprites: binary alpha (0/255), camera-facing
  billboards except wall features (wall-anchored quads).
- Wall features occupy only the first legacy vertical unit above the local
  floor — for tall-wall moments compose with ceiling sprites/features.
- Ceiling sprites hang from the resolved ceilingZ; `baseSize`/56 = world
  height, so size hangs against `ceilingZ × 0.5324` world units.
- The slice floor itself: `src/content/floors/level-2-slice.json`
  (unregistered pack, id 6), generator `scripts/playtests/level2-slice-map.mjs`.
