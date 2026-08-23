# Card Trial illustration sources

- `cards/*.aseprite` are the editable 128×96 production masters. Each keeps
  the imported PixelLab image and a separate `Pixel cleanup` layer.
- Runtime-ready PNG exports live in `public/assets/card-trial/cards/`.
- `references/rat-king-identity.png` and `references/old-man-identity.png` are
  identity references only; their tiny battlefield density is not the card-art
  density target.
- `references/king-of-the-heap-composition.png` is composition-only. The prior
  local mockup is too finely rendered to use as the production style master.

The cleaned production King of the Heap PNG is the rendering-density/style
master for this batch. Keep new illustrations native and chunky; do not create
large paintings and downsample them.

All 22 unique CardIds now have a master and a runtime PNG. Import new PixelLab
candidates with `aseprite -b pick.png --script scripts/art/aseprite-card-trial-finish.lua`.
