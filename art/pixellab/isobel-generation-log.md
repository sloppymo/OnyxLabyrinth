# Isobel's PixelLab generation log

Generated 2026-08-09 through the configured PixelLab MCP service. The shop
logic and floor geometry were not changed.

## Jobs

| Asset | PixelLab operation | Job / object | Output |
|---|---|---|---|
| Isobel | `create_character` (v3, 8 directions) | `aa85d66b-fbf7-4306-b364-20b845e544df` | 124×124 south rotation, trimmed to 43×61 RGBA PNG |
| Shelf | `create_image_pixflux` | `725c4870-90c2-41c7-99fd-3998247c6e2e` | 160×96 RGBA PNG |
| Sign board | `create_image_pixflux` | `673bc1ec-3527-4d83-9112-8f243830e240` | 192×80 RGBA PNG |

The character prompt requested a compact low-top-down witch proprietor with a
crooked indigo hat, cloak, spellbook, and cyan spell token. The shelf prompt
requested a crooked walnut shelf with six individually shaped vessels, a
spellbook, and a brass charm. The sign prompt requested an aged walnut plank
sign with iron edging and explicitly excluded lettering; exact `ISOBEL'S` /
`ISO-SPELLS` lettering is composited in-engine with FF36 by
`wall-feature-cache.ts`.

Production uses:

- `MAP_SPRITES[isobel-npc].file` → `public/assets/map-sprites/isobel-npc-pixellab.png`
- `WALL_FEATURES[isobels-shelves].file` → `public/assets/wall-features/isobels-shelf-pixellab.png`
- `WALL_FEATURES[isobels-sign].file` → `public/assets/wall-features/isobels-sign-pixellab.png`

## Secondary wall-art pass (2026-08-09)

PixelLab `create_image_pixflux` was invoked for two additional transparent wall
props and one sconce candidate. The sconce job was not retrievable after the
service reported it missing, so no substitute artwork was shipped.

- Hanging charms job `ecf55870-86a1-4b12-97f8-b5ce3cbaf29b`, 96×96 RGBA,
  saved as `public/assets/wall-features/isobel-wall-charms-pixellab.png`.
- Spellbook stack job `7e25a833-7213-4558-a235-e992f0dd2c41`, 128×96 RGBA,
  saved as `public/assets/wall-features/isobel-spellbook-stack-pixellab.png`.
- Prompts requested late-16-bit SNES pixel clusters, selective outlines,
  restrained dungeon-compatible color, transparent backgrounds, and no text.

The props are registered in `src/data/wall-features.ts` and placed on the
shop's north/east wall faces in Floor 1 without changing the six-cell room.

The south character rotation was trimmed only to remove transparent margins;
no pixels were resampled or painted. All assets remain nearest-neighbor
rendered by the existing corridor caches.

## Final Isobel character polish pass (2026-08-09)

PixelLab `create_image_pixflux` was invoked four times to generate independent
native-resolution candidates. Each job requested a 48×64 transparent RGBA
front-facing SNES-style sprite with an unmistakable pale-gold/honey-blonde
hair mass framing a readable friendly face, crooked violet witch hat, and
selective near-black outline. No generated lettering or hand-authored sprite
geometry was used.

| Candidate | PixelLab job | Output | Decision |
|---|---|---|---|
| 01 | `4f1a8e91-4b1f-4aaf-8d3c-18d0e99bf030` | 48×64 RGBA | retained candidate |
| 02 | `51da2724-be67-48df-8fed-0831ca5ff03d` | 48×64 RGBA | retained candidate |
| 03 | `b70f6c8b-5b46-4047-881d-5395e02411b0` | 48×64 RGBA | **selected for production** |
| 04 | `a6def627-63ac-4206-bd09-c972ee89c10a` | 48×64 RGBA | retained candidate; hair too dark at native size |

The selected candidate is copied byte-for-byte to
`public/assets/map-sprites/isobel-npc-pixellab.png`. The previous 43×61
production PNG is preserved as
`art/pixellab-candidates/isobel-final/isobel-previous-production-43x61.png`
for comparison. The existing `baseSize: 42` registration and all world
placement remain unchanged; only the raster source changed.
