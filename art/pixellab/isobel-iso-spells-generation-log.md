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

## Final hand-authored / de-AI pass

No PixelLab jobs or replacement concepts were used. The approved correction
exports remained the immutable inputs. A deterministic Aseprite 1.3.18.1
working pass converted those low-colour imports to true-colour, edited only
opaque pixel clusters, and re-exported every production PNG without scaling,
antialiasing, feathering, or semitransparent edges. Layered `.aseprite` files,
the production-sized working PNGs, and the repeatable edit script are preserved
under
`art/pixellab-candidates/isobel-iso-spells/aseprite-working/hand-finish-pass/`.

These edits are explicitly **humanization / de-AI** finishing rather than new
generation:

| Asset | Preserved | Hand-authored intervention |
|---|---|---|
| Catalogue cabinet | frame, drawers, most bottle art, dimensions | removed one evenly spaced bottle, replaced one tall bottle with a tied ceramic reagent crock, fitted one mismatched iron drawer pull and repair strap |
| Formula archive | frame, parchment fields, scroll construction, dimensions | left one consulted formula slot open with a loose scrap and lone rack peg, removed one mirrored folio sigil, added a backwards dark bundle and wax-sealed packet |
| Charm cabinet | frame, backing, bottom merchandise, one cyan charm, dimensions | replaced three regular jewels with an old key, cloth-wrapped talisman, and tooth/bone charm; retained an empty hook; replaced the centered heraldic gem with an iron ring and sealed tag |
| Sales counter | silhouette, dimensions, left bottle/folio, wood/brass construction | replaced the centered cyan diamond with a small scuffed lock plate and added an asymmetric inkpot/quill work cluster |
| Iso-Prism backdrop | outer arch, top prism, one side prism, transparent quiet center, dimensions | replaced the mirrored side prism and matching arcs with interrupted measuring rails, an unlit optical lens, mismatched repair plate, tied wire, and short trajectory marks |
| Prism mobile | short production footprint, central prism, clearance, dimensions | rebuilt the lower half as three unequal weights (key, violet prism, dark optical weight), retained one empty eyelet, and added an offset tied crossbar extension |

The family retains its established walnut, aged brass, indigo, plum, cyan,
violet, amber, and parchment vocabulary. Magical jewel motifs were reduced in
secondary positions rather than recoloured wholesale. The canonical Isobel,
hero door, tileset surfaces, ceiling medallion, renderer configuration, and all
placement/scale data remain unchanged.

## Final hero-wall / shopkeeper composition pass

No PixelLab generation, concept-sheet pixels, tracing, cropping, or resampling
were used. The approved hand-finished backdrop was re-authored at its native
256×256 density in Aseprite 1.3.18.1. Its outer arch and transparent negative
space remain the foundation; only the interior optical/mechanical apparatus was
rebuilt. The deterministic working scripts and layered files are preserved in
`art/pixellab-candidates/isobel-iso-spells/aseprite-working/hero-wall-pass/`.

| Production asset | Source | Hand-authored work | Production use |
|---|---|---|---|
| `isobel-iso-prism-backdrop.png` | approved hand-finished backdrop | retained the broad arch; shifted the sole bright prism off-axis; added an interrupted inner rib, left calibration carriage/tag/counterweight, right unlit lens/empty socket/repair plate/tied wire, mounting feet and supported trajectories; removed the sparse mirrored interior marks | east-wall feature at `(17,28)`, scaled from `0.98 × 0.98` to `1.04 × 1.04` after three renderer trials |
| `isobel-sales-counter-front.png` | canonical approved counter pixels | isolated only the lower central apron and added a four-pixel wood front lip; no character pixels and no new counter concept | opt-in foreground billboard at `(17,28)` so the counter crosses Isobel's waist/lower torso while the full counter, clutter, and light remain in their original background pass |

The canonical Isobel PNG, approved full counter PNG, prism mobile, hero door,
catalogue/archive/charm cabinetry, base surfaces, and ceiling art are unchanged.
The foreground apron exists only to express the intended renderer-native depth
order (`wall apparatus → Isobel → counter front`) without flattening the scene
into a composite image.
