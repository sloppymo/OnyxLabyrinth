# Lonesome Forest title map

This directory contains a deterministic, source-tile-only title backdrop for OnyxLabyrinth.

## Canvas and layers

- Native canvas: 768×672 pixels (the game's authoritative 8:7 title stage)
- Logical grid: 48×42 cells
- Tile size: 16×16 pixels
- V2 presentation export: 1536×1344, exact 2× nearest-neighbor scaling
- V2 inspection export: 3072×2688, exact 4× nearest-neighbor scaling
- Layer order: `01_base_ground` through `10_foreground_framing`, bottom to top
- The road layer is validated against the river mask, and bridge-owned landing
  cells are excluded from road placement; no cobblestone is composited over water.

`final_native.png` and the original `layers/` directory are the preserved
baseline. `final_native_v2.png` is the revised game-ready image.
`final_upscaled_v2.png` is the required 2× review export; the 4× inspection
render is `final_upscaled_4x_v2.png`.

## Regenerate

From the repository root:

```sh
python3 art/generated/lonesome_forest_title_map/generate_map.py
```

The script verifies source dimensions and hashes, confirms the baseline hash,
rebuilds contact sheets, slices only exact 16×16 cells, regenerates every v2
layer/composite, writes the v2 OpenRaster file, and updates
`validation_report_v2.json`. It does not overwrite the baseline outputs.

## Pixelorama

Open `lonesome_forest_title_map_v2.ora` directly. The ORA contains ten named
768×672 layers in the same order as the PNG files. Pixelorama is not installed
in this workspace, so the file is validated structurally as OpenRaster. If a
local Pixelorama build rejects it, import all files from `layers_v2/` as layers
without moving them; every PNG has identical dimensions and origin.

## Supporting files

- `contact_sheets/`: every source cell labeled by column, row, and numeric index
- `tile_catalog.json`: automatic alpha/color facts for every cell plus curated roles and exact multi-cell layouts
- `placement_map_v2.json`: explicit source coordinates and destination cells for every revised placement
- `final_debug_grid_v2.png`: revised native composite with 16×16 grid and title/menu safe areas
- `layer_overview_v2.png`: revised transparent layers on checkerboard backdrops
- `title_screen_preview_v2.png`: live 1280×800 browser proof with the real title DOM over the revised map
- `before_after_comparison.png`: baseline left, revised map right, both at exact native scale
- `revision_report.md`: affected regions, visual decisions, and validation summary
- `source_manifest.json`: dimensions, alpha facts, paths, and SHA-256 hashes
- `validation_report_v2.json`: deterministic technical validation results
