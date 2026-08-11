# Isobel's Iso-Spells — production art log

Branch: `feat/isobels-iso-spells`

The mockup was used as a palette/composition reference only. No perspective
room screenshot was used as a texture. New assets were generated with
`scripts/pixellab-generate.mjs` via the configured PixelLab REST workflow,
then cleaned/reframed in `art/pixellab-candidates/isobel-iso-spells/aseprite-working/`
and re-exported with Aseprite using nearest-neighbour pixel preservation.

| Asset family | Candidate | Status | Finishing | Production path |
|---|---|---|---|---|
| Wall material | `tileset-wall-02` | approved | palette-preserving Aseprite export | `public/assets/tilesets/isobel/wall.png` |
| Floor A | `tileset-floorA-02` | approved | palette-preserving Aseprite export | `public/assets/tilesets/isobel/floorA.png` |
| Floor B | `tileset-floorB-02` | approved | palette-preserving Aseprite export | `public/assets/tilesets/isobel/floorB.png` |
| Ceiling material | `tileset-ceiling-02` | approved | palette-preserving Aseprite export | `public/assets/tilesets/isobel/ceiling.png` |
| Hero door | `hero-door-02` | approved | cropped/reframed, exact sign lettering composited, Aseprite export | `public/assets/door-features/isobels-iso-spells-door.png` |
| Iso-Prism backdrop | `iso-prism-backdrop-02` | approved | flood alpha cleanup, quiet lower edge, restrained prism repair, Aseprite export | `public/assets/wall-features/isobel-iso-prism-backdrop.png` |
| Catalogue cabinet | `catalogue-cabinet-01` | approved | palette-preserving Aseprite export | `public/assets/wall-features/isobel-catalogue-cabinet.png` |
| Formula archive | `formula-archive-01` | approved | palette-preserving Aseprite export | `public/assets/wall-features/isobel-formula-archive.png` |
| Charm cabinet | `charm-cabinet-01` | approved | palette-preserving Aseprite export | `public/assets/wall-features/isobel-charm-cabinet.png` |
| Sales counter | `sales-counter-01` | approved | palette-preserving Aseprite export | `public/assets/map-sprites/isobel-sales-counter.png` |
| Ceiling mobile | `prism-mobile-01` | approved | palette-preserving Aseprite export | `public/assets/ceiling-sprites/isobel-prism-mobile.png` |
| Ceiling medallion | `ceiling-medallion-01` | approved | palette-preserving Aseprite export | `public/assets/ceiling-features/isobel-astral-medallion.png` |

Rejected/archived: `tileset-*-01` material candidates were rejected where they
contained object-like accents or unusable borders; `hero-door-01` and
`iso-prism-backdrop-01` were rejected for surrounding room context and a
backdrop character silhouette. All raw generations remain under the
`raw/` candidate directory.

Reused unchanged: `public/assets/map-sprites/isobel-npc-pixellab.png` is the
canonical Isobel sprite and was never regenerated or composited over.
`isobels-sign-pixellab.png` remains in the repository as retained source art;
only its old wall placement was removed.

## Visual correction pass

Production screenshots exposed a projection mismatch rather than weak Isobel
surface art: the floor/ceiling caster did not apply the wall projection's
`projectionScale * heightFlatten`, so hidden samples beyond the shop walls
leaked Floor 1 gray ceiling and olive floor into the room. The renderer math
was synchronized before judging or replacing any assets.

No new PixelLab jobs were needed. The catalogue and archive source art stayed
intact; Aseprite exports removed their opaque generation backgrounds and
cropped unused padding so configuration scale reads as built-in cabinetry.
The existing counter was widened 40% with nearest-neighbour scaling at
unchanged height. The charm frame and mobile were retained and given larger,
physical hanging silhouettes. The backdrop was rebuilt from the approved
prism vocabulary as a mostly transparent brass wall apparatus with a quiet
center. Correction working exports are under
`art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/`.

Renderer-scale corrections: backdrop `0.95×0.95` → `0.98×0.98` wall fraction;
catalogue/archive `0.92×0.92` → `0.98×0.95`; charm cabinet `0.58×0.66` →
`0.82×0.82`; counter `baseSize 14` → `16` after widening; mobile `baseSize 38`
→ `26` after two corrected hero reviews shortened its hanging lengths and
cleared the hat silhouette. The mobile's cell placement and per-instance scale
remain unchanged.
