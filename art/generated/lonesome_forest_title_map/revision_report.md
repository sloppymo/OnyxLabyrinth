# Lonesome Forest v2 revision report

The original `final_native.png` is preserved unchanged on the left of
`before_after_comparison.png`; `final_native_v2.png` is the revised map.

## Targeted grid regions

| Revision | Primary cells |
|---|---|
| Gateway massif and forecourt | x14–35, y1–9 |
| Title-safe northern route and outer terraces | x0–47, y10–28 |
| Meandering river and landings | x0–47, y27–39 |
| Campsite branch and foreground framing | x0–47, y36–41 |

## Art-direction changes

- Re-authored the river as asymmetric broad bends with a western basin,
  narrow bridge channel, northern indentation, and eastern lower-bank inlet.
- Replaced paving blocks with a connected cobble/worn-earth spine, tapered
  bridge landings, a wider foreground approach, and one fading campsite branch.
- Rebuilt repeated tree stamps as touching, offset forest masses made from
  multiple inspected source silhouettes; the bottom frame is staggered.
- Enlarged the entrance's presence with an 11-cell crown, recessed two-cell
  mouth, offset monoliths, collapsed wings, boulders, and a clear forecourt.
- Consolidated cliffs into a gateway massif plus west/east stepped terraces.
- Grouped floor variation and small vegetation at edges and story pockets,
  preserving the low-frequency title/menu clearing.
- Measured the live 1280×800 title DOM: panel `(268, 74.5)–(1012, 725.5)`,
  lockup `(307, 251.33)–(973, 373.91)`, wordmark
  `(459.83, 287.33)–(820.16, 336.72)`, and menu
  `(320, 387.91)–(960, 548.66)`. Native-map equivalents are stored in
  `placement_map_v2.json` and drawn in `final_debug_grid_v2.png`.

## Validation summary

- Passed: `True`
- Source-tile placements: `1231`
- River cells connected: `316/316`
- Journey cells connected: `53/53`
- Path/water overlap cells: `0`
- Path/bridge overlap cells: `0`
- Final visible colors: `8`; unexpected colors: `0`
- Baseline SHA-256: `8ac6c5936701545968a8443ac0bbca9bd9c4a4b94e622db8215a5e847e9ea07e`

The real title DOM is captured separately in `title_screen_preview_v2.png`.
