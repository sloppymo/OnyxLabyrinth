# The Camp — PixelLab generation log

Branch: `agent/floor1-camp`
Started: 2026-08-08

## Production rules

- PixelLab.ai MCP is the production generator.
- Inspect current OnyxLabyrinth art before each family.
- Use positive physical descriptions; keep avoid lists short.
- Palette/reference conditioning is opt-in because it can erase canvas,
  timber, dirt, or sky material identity.
- Final visual decisions use native image inspection and raw in-engine views.
- Deterministic checks cover dimensions, alpha, transparent corners, bounding
  box, edge bleed, and color count.
- Edit/inpaint a strong composition before rerolling it.

## MCP baseline

- Connection: streamable HTTP MCP at the configured PixelLab server.
- Production tools available: `create_image_pixen`, `create_image_pixflux`,
  `create_image_pro`, `create_map_object`, `get_image`, `edit_image`, and
  `inpaint_image`.
- Opening subscription balance: 1,812 generations remaining.
- Fast Pixen/PixFlux calls cost one generation; Pro is reserved for a small
  number of hero families where multi-candidate quality justifies 20–40.

## False-sky prototype

| Asset | Role | Logical size | Primitive | Operation | Candidate | Decision | Reason / final path |
|---|---|---:|---|---|---:|---|---|
| camp-sky | false twilight ceiling | 64×64 → 256×256 | regional ceiling texture | deterministic draft | 1 | REJECT | Discrete elliptical clouds repeated as a polka-dot roof. |
| camp-sky | false twilight ceiling | 64×64 → 256×256 | regional ceiling texture | deterministic draft | 2 | KEEP FOR PROTOTYPE | Near-solid navy field survives long views; `public/assets/tilesets/camp/ceiling.png`. |
| camp-sky-star-a/b | sparse celestial marks | 64×64 → 256×256 | ceilingFeature | deterministic draft | 1 | KEEP FOR PROTOTYPE | Three isolated cells prevent a regular star grid; `public/assets/ceiling-features/`. |
| camp-ground-a/b | packed earth | 64×64 → 256×256 | regional floor textures | deterministic draft | 1 | KEEP FOR PROTOTYPE | Establishes worn-earth value and two-cell variation; requires PixelLab production replacement. |
| camp-wall | perimeter masonry | 64×64 → 256×256 | regional wall texture | deterministic draft | 1 | KEEP FOR PROTOTYPE | Keeps the chamber physically in the labyrinth; requires PixelLab production replacement. |

No PixelLab generations were spent before the false-sky gate passed.

## Production run summary

- 54 completed PixelLab MCP operations: 48 Pixen generations, 4 PixFlux
  image-to-image generations, 1 inpaint, and 1 whole-image edit.
- Subscription balance moved from 1,812 to 1,717 generations. The 54 jobs
  consumed 95 subscription generations because edit/inpaint use higher-cost
  tiers than Pixen/PixFlux.
- 28 PixelLab outputs were accepted into production: one perimeter material,
  eight hero compositions, twelve support props, and seven ambient scenes.
- The deterministic sky and two ground tiles remain the production base after
  side-by-side renderer testing. PixelLab's texture generators repeatedly
  introduced horizons, scene composition, or value noise that damaged the
  false-outdoor ceiling read. Keeping the stronger authored draft is a quality
  decision, not an uncompleted generation step.

## Materials — 15 candidates

| Candidate | Operation | Decision | Reason / final path |
|---|---|---|---|
| camp-sky-01/02/03 | Pixen 128×128 | REJECT | Scene-like cloud masses and local motifs repeat as ceiling stamps. |
| camp-sky-04-img2img | PixFlux 128×128 | PARK | Preserves the accepted low-frequency draft but does not improve its in-engine read. |
| camp-ground-01/02 | Pixen 128×128 | REJECT | Perspective/scene cues and inconsistent lush patches; poor floor casting. |
| camp-ground-trampled-01 | Pixen 128×128 | PARK | Useful localized dirt patch, not coherent as the repeating 10×10 base. |
| camp-ground-03/04-img2img | PixFlux 128×128 | PARK | Faithful draft variants with no material improvement worth replacing the accepted base. |
| camp-ground-05-edit | whole-image edit 128×128 | REJECT | Produces a conspicuous blank central patch rather than natural wear. |
| camp-wall-01 | Pixen 128×128 | PARK | Strong rooted masonry for a localized intrusion; too distinctive to repeat on every face. |
| camp-wall-02 | Pixen 128×128 | EDIT | Strong ancient masonry, but an unwanted green grass strip contaminated the base. |
| camp-wall-03-img2img | PixFlux 128×128 | REJECT | Retains the contamination and weakens the block hierarchy. |
| camp-wall-04-inpaint | inpaint from wall-02 | **KEEP** | Grass strip removed while preserving the masonry. Nearest-scaled to `public/assets/tilesets/camp/wall.png`. |
| camp-wall-edge-01 | Pixen 128×128 | PARK | Ruined edge composition is useful future wall-feature art, not a seamless base. |

## Hero compositions — 16 candidates

All accepted sprites use the existing `mapSprites` primitive. PixelLab source
sizes are the logical art sizes; shipping files add a transparent safety border
and square bottom-anchored canvas because this renderer projects map sprites as
`size × size`.

| Asset | Source size | Candidate | Decision | Reason / final path |
|---|---:|---:|---|---|
| camp-tent-large | 160×112 | 01 | **KEEP** | Broad patched canvas pavilion; strong asymmetry and readable repairs. Ships 168×168. |
| camp-tent-large | 160×112 | 02 | REJECT | Grass platform and cleaner, more generic camping silhouette. |
| camp-wagon | 160×112 | 01 | **KEEP** | Chunky body, legible wheel construction, worn gray cover. Ships 168×168. |
| camp-wagon | 160×112 | 02 | REJECT | Weaker body/wheel read and brighter outdoor-ground contamination. |
| camp-fire | 96×80 | 01 | **KEEP** | Large communal stone ring with useful cooking frame and controlled source highlights. Ships 104×104. |
| camp-fire | 96×80 | 02 | REJECT | Composition is noisier and the flame mass is less controlled. |
| camp-dead-tree | 96×160 | 02 | **KEEP** | Tall wrong-looking roots, restrained dead silhouette, no overt magic. Ships 168×168. |
| camp-dead-tree | 96×160 | 01 | REJECT | Less distinctive silhouette and weaker root physicality. |
| camp-supply-stack | 128×96 | 01 | **KEEP** | One coherent mound of crates, sacks, barrels, and salvage. Ships 136×136. |
| camp-supply-stack | 128×96 | 02 | REJECT | Purple shop palette and tidier market-stall read. |
| camp-smith-work-area | 160×112 | 01 | **KEEP** | Improvised roof, bench, tools, and forge light read as one work neighborhood. Ships 168×168. |
| camp-smith-work-area | 160×112 | 02 | REJECT | Too symmetrical and polished; trends toward a fantasy-shop façade. |
| camp-map-table | 128×88 | 01 | **KEEP** | Strong horizontal planning table with readable map and expedition clutter. Ships 136×136. |
| camp-map-table | 128×88 | 02 | REJECT | Busier tabletop with less readable silhouette. |
| camp-palisade-checkpoint | 160×128 | 01 | **KEEP** | Salvaged masonry gate framed by rough timber. Ships 168×168 and also supplies the entrance-door composite. |
| camp-palisade-checkpoint | 160×128 | 02 | REJECT | Fortress-like symmetry and heavier generic-fantasy styling. |

## Supporting props — 14 candidates

| Decision | Assets | Notes |
|---|---|---|
| **KEEP** | camp-tent-small, camp-handcart, camp-crate-stack, camp-barrel-stack, camp-bedrolls, camp-gear-pile, camp-armor-rack, camp-grindstone, camp-cookpot, camp-lantern-post, camp-weapon-rack, camp-rough-fence | Twelve practical silhouettes; every object has a clear camp use. Shipping canvases are 104, 120, or 136 square pixels according to source family. |
| PARK | camp-tent-collapsed-01 | Generated as a second intact low tent rather than a truly collapsed state; usable later as an alternate, not under the requested id. |
| REJECT | camp-banner-01 | Generic heraldry and decorative polish do not identify this specific settlement. |

## Ambient people — 9 candidates

| Asset | Source size | Decision | Figure count / notes |
|---|---:|---|---|
| camp-adventurer-cards | 128×96 | **KEEP** | 2 seated, practical and tired; ships 136×136. |
| camp-adventurer-map-study | 128×96 | **KEEP** | 2 leaning over a map; ships 136×136. |
| camp-adventurer-shield-repair | 96×96 | **KEEP** | 1 kneeling repair pose; ships 104×104. |
| camp-adventurer-sleeping | 96×80 | **KEEP** | 1 low horizontal silhouette; ships 104×104. |
| camp-adventurer-stew | 96×96 | **KEEP** | 1 tending food; ships 104×104. |
| camp-adventurer-watch | 64×112 | **KEEP** | 1 tall sentry silhouette; ships 120×120. |
| camp-adventurer-wounded | 96×96 | **KEEP** | 1 seated against supplies; ships 104×104. |
| camp-adventurer-packing | 128×96 | REJECT | Bright RPG potion clutter dominates the physical packing action. |
| camp-adventurer-sharpening | 96×96 | REJECT | Glossy full plate and vivid grass read as a hero-card scene, not this Camp. |

Accepted ambient scenes depict nine visible people without adding dialogue-heavy
NPC records. Interactive NPC count for this area remains zero in this pass.

## Derived production art

| Asset | Primitive | Construction |
|---|---|---|
| camp-entrance-gate | full-face `doorFeature` | 256×256 composite of accepted camp-wall masonry and the accepted palisade checkpoint; both faces of the entrance door use it. |
| camp-sky-star-a/b | `ceilingFeature` | Sparse 256×256 deterministic stars placed on only three cells. |
| camp-sky, camp-ground-a/b, camp-door | regional theme textures | 256×256 deterministic false-sky prototype assets retained after production comparison. |

## Coherence audit and reusable PixelLab lessons

- **KEEP:** 28 PixelLab outputs above. They share hard pixels, restrained
  twilight values, mismatched gray-tan canvas, dark salvaged timber, practical
  wear, and broad readable silhouettes.
- **PARK:** low-frequency sky/ground img2img variants, trampled dirt, rooted
  masonry, ruined wall edge, and the alternate intact tent. They are coherent
  but do not improve the current 10×10 composition.
- **REGENERATE/REJECT:** scene-like textures, grass-plinth hero alternates,
  purple market palettes, fortress symmetry, heraldry, bright potion clutter,
  and glossy hero armor.
- Pixen is substantially stronger for isolated transparent environmental
  compositions than for seamless first-person floor/ceiling textures. For the
  latter, renderer-tested low-frequency authored structure is more important
  than added detail.
- Positive material prompts worked best. Repeating exclusions tended to make
  the model emphasize the excluded idea; concise physical descriptions kept
  canvas, timber, masonry, and dirt identities clearer.
- A localized inpaint was the decisive material operation: it preserved a
  strong wall composition while removing one contaminating grass band. Whole-
  image editing was less reliable for subtle texture correction.
- Reference/image conditioning should be used only when structural preservation
  is the goal. Here PixFlux faithfully preserved draft materials but could not
  add enough useful identity to justify replacing them.
