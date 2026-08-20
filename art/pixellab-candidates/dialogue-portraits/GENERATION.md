# Great Gate dialogue portraits — production art log

Date: 2026-08-20

The supplied Rat King (100×100) and Old Man (64×64) animated GIFs were used as
identity and palette references only. They remain combat references; no GIF
frame is shipped as a dialogue portrait.

| Portrait | PixelLab source | Palette reference | Aseprite finish | Production path |
|---|---|---|---|---|
| Rat King | `raw/rat-king-01.png`, 128×160 | supplied Rat King frame 0 | binary-alpha hardening, RGB working document, nearest-neighbour export | `public/assets/portraits/rat-king/portrait.png` |
| Old Man | `raw/old-man-01.png`, 128×160 | supplied Old Man frame 0 | binary-alpha hardening, RGB working document, nearest-neighbour export | `public/assets/portraits/old-man/portrait.png` |

PixelLab's PixFlux generation was run through `scripts/pixellab-generate.mjs`
with transparent backgrounds, a limited palette, and the supplied sprite frame
as `--palette`. The prompts requested vertical head-and-shoulders portraits,
hard pixel clusters, no anti-aliasing, no scenery, and no baked UI border.

The deterministic Aseprite pass is
`aseprite-working/build-portraits.lua`. It preserves the generated clusters,
removes any semi-transparent fringe, saves the editable `.aseprite` working
documents, and exports the candidate PNGs without resampling. Those retained
first-pass candidates contain binary alpha and 16/18 opaque colors
respectively; the supplied replacements below are the production assets.

## Supplied portrait replacement

The author-provided 256×256 transparent portraits superseded those first-pass
PixelLab candidates after visual review:

| Portrait | Supplied source | Aseprite packaging | Production path |
|---|---|---|---|
| Old Man | `raw/old-man-supplied.png` | centered unchanged on a 256×320 transparent canvas | `public/assets/portraits/old-man/portrait.png` |
| Rat King | `raw/rat-king-supplied.png` | centered unchanged on a 256×320 transparent canvas | `public/assets/portraits/rat-king/portrait.png` |

`aseprite-working/build-supplied-portraits.lua` performs only the vertical
canvas packaging required by the dialogue frame. No authored portrait pixels
are resampled, cropped, recoloured, or given a baked border.
