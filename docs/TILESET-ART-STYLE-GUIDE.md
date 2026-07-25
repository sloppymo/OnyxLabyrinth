# OnyxLabyrinth — Tileset Art Style Guide

**Audience:** human pixel artists, AI image workflows, and engineers wiring new themes  
**Scope:** corridor tilesets only (`wall` / `floorA` / `floorB` / `ceiling`)  
**Canonical sources:** `src/assets/f{1-5}_*_256.png`, `scripts/generate-floor-tilesets.mjs`, `src/engine/renderer.ts`  
**Last measured:** 2026-07-24 against shipping campaign art

This guide describes what the game already looks like so new tiles match in-engine, not just in a still preview.

---

## 1. Visual identity

### 1.1 One-sentence brand

**Chunky 16-bit dungeon textures:** dark, desaturated materials with sparse luminous accents, readable at corridor scale, never photoreal, never busy.

### 1.2 Style pillars

| Pillar | Rule |
|--------|------|
| Pixel craft | Hard pixel edges, limited palette, dither/mottle instead of smooth gradients |
| Mid-dark values | Bases live around luminance ~40–90 (8-bit). Not pure black voids, not bright stone |
| Material first | Each floor is one material story (mossy stone, wood+books, charred iron, cold stone, wet teal) |
| Accent sparingly | Glow, moss, runes-as-wear, rivets — few and small. Accents are salt, not the meal |
| Orthographic faces | Wall = front elevation. Floor/ceiling = top-down planar. No perspective baked into the texture |
| Tileable silence | Edges must wrap. Large unique focal scars that stamp identically on every wall face are discouraged |

### 1.3 Anti-pillars (reject these)

- Photoreal stone, PBR metal, soft painted AI gradients
- Neon cyberpunk grids as the base (cyan glow is an *accent* on F5, not the whole surface)
- Full-sheet “special tile atlases” used as `floorB` (runes/hazards/teleporters belong in overlays / `mapSprites`, not the checkerboard texture)
- Bright white highlights that clip under the renderer’s contrast stretch
- Huge singular lava cracks or sigils centered in the wall tile (they repeat on every face)
- Clean modern UI stone, marble, or saturated fantasy crystal caves

### 1.4 Pixel scale

Authoring pipeline (see generator):

- Logical art size: **128×128**
- Ship size: **256×256** via **2× nearest-neighbor** upscale
- Read as chunky SNES/early-PC dungeon, not HD indie pixel

Practical brick/slab sizes at logical resolution (then doubled):

| Element | Typical logical size |
|---------|----------------------|
| Wall brick course height | 16 px |
| Wall brick width | ~32 px (running bond) |
| Floor slab grid | 32×32 px cells inside the 128 canvas (= 4×4 slabs at ship size) |
| Mortar / plank gaps | 1 logical px (2 ship px) |
| Rivet / nail | 1–2 logical px |
| Glow fleck | 1 logical px core ± 1 px soft halo in a darker accent |

### 1.5 Lighting language

- **Implied light:** soft top / top-left. Brick tops slightly lighter; bottoms slightly darker.
- **No baked directional sun.** Corridor fog, vignette, and torch flicker live in the renderer.
- **Depth cues:** 1 px highlight edge + 1 px shadow edge on bands, planks, grate bars.
- **Dither / FBM mottle:** 2–4 value steps of the same hue family, not rainbow noise.

### 1.6 Wear vocabulary (approved)

Use a mix of:

- Hairline cracks (1 px walks, jagged)
- Damp vertical streaks (F1)
- Moss patches hugging mortar (F1)
- Scorch / charcoal mottle (F3)
- Sparse ember / teal flecks (F3 / F5)
- Thin pale scratches (F4)
- Riveted iron / wood bands across mid-wall (F2–F5)

Density target: **most of the tile is quiet base; ~20–40% of floor slabs may carry a crack or fleck.**

---

## 2. Engine contract (must match)

### 2.1 Four files per theme

| Slot | Role | Checkerboard? |
|------|------|---------------|
| `wall` | Every wall face texture | No — one full texture per face |
| `floorA` | Even cells `(gx+gy)%2===0` | Yes |
| `floorB` | Odd cells | Yes — **subtle twin** of A, not a special atlas |
| `ceiling` | Ceiling plane | No |

Themes are keyed by `FloorDef.tilesetTheme` (e.g. `"f1"`…`"f5"`) and loaded from:

- Bundled: `src/assets/fN_{wall,floor_a,floor_b,ceiling}_256.png`
- Or runtime: `public/assets/tilesets/<theme>/{wall,floorA,floorB,ceiling}.png`

### 2.2 What floorA / floorB are for

They exist so the **world-grid checkerboard** reads while walking. They must be:

- Same material and hue family
- Slightly different value or wear (`floorB` usually a bit darker / more damaged)
- Free of large unique icons (no teleporter runes, no “hazard only” slabs)

Measured mean luminance (shipping):

| Theme | wall | floorA | floorB | ceiling |
|-------|------|--------|--------|---------|
| f1 Crypt | 90 | 81 | 75 | 66 |
| f2 Library | 63 | 60 | 53 | 54 |
| f3 Forge | 56 | 51 | 51 | 41 |
| f4 Choir | 81 | 69 | 62 | 57 |
| f5 Cistern | 57 | 51 | 43 | 45 |

**Target band for new themes:** wall ~55–90 · floors ~45–80 · ceiling ~40–70.  
Stay away from mean luminance &lt;35 (reads as black under fog) or &gt;110 (washes after brightness/contrast).

### 2.3 Renderer processing

`RENDER_CONFIG` applies approximately:

- Floor A brightness ×1.15, B ×0.85, ceiling ×1.4, wall ×1.0
- Contrast stretch ~1.15–1.25 on all
- Floor/ceiling darken multipliers in the distance fog pass

Implication: **mid-grey authored art** survives; already-bright orange cores should be small and surrounded by darker ember midtones so contrast stretch does not blow them to white.

### 2.4 Special gameplay tiles are not tileset cells

Do **not** encode these in `floorA`/`floorB`:

- Teleporters, antimagic wards, scripted events, trap tells, water depth, stairs glyphs

Those use features, messages, wall glyphs, and/or `mapSprites`. A rune sheet is fine as **decor reference** or a future sprite strip — wrong as the floorB texture.

---

## 3. Floor identities (palette & motifs)

Each campaign floor owns one accent story. New art for that theme should stay inside the family.

### F1 — The Flooded Crypt (`f1`)

- **Material:** mossy olive-grey stone
- **Wall:** running-bond bricks, dark mortar, moss on seams, damp streaks, quiet cracks
- **Floor:** 4×4 olive slabs, dark gaps, sparse dark cracks
- **Ceiling:** mottled olive-charcoal, almost no accent
- **Accent:** moss greens (`#4a6a3a` family) — organic, not neon
- **Mood:** damp tutorial crypt

### F2 — The Cursed Library (`f2`)

- **Material:** wood + books
- **Wall:** bookshelf elevation (frame + spines). Dense readable books OK because the *motif is the wall*
- **Floor:** dark brown planks (horizontal or vertical), nails at ends, subtle grain dither
- **Ceiling:** dark timber beams / aged plaster with rivets
- **Accent:** book spine hues (muted crimson, navy, mustard) on walls only — floors stay brown
- **Mood:** warm, enclosed, cursed stacks

### F3 — The Forge of Ashes (`f3`)

- **Material:** charred stone + iron
- **Wall:** dark warm stone, mid iron band + rivets, **sparse** ember cracks and flecks
- **Floor A:** scorched slabs with thin molten veins
- **Floor B:** iron grate over ember glow (allowed exception: B may be a structured twin, still full-cell, still seamless)
- **Ceiling:** near-black with rare ember sparks
- **Accent:** ember orange `#e2703a` / core `#ffb347` / dim `#8a3a1c` — thin lines, not lava lakes
- **Mood:** heat under iron

### F4 — The Null Choir (`f4`)

- **Material:** cold purple-grey stone
- **Wall:** cool bricks, pale lavender scratches, mid rail with cancelled hymn/rivet marks
- **Floor:** indigo/charcoal 4×4 slabs, sparse pale cracks
- **Ceiling:** purple-grey mottling, thin pale scars, dust flecks
- **Accent:** pale lilac/white scratches — **no orange**
- **Mood:** silenced, liturgical, cold

### F5 — The Weeping Cistern (`f5`)

- **Material:** wet teal-charcoal stone
- **Wall:** damp bricks, teal rail, mint/cyan seepage streaks + flecks
- **Floor:** dark teal slabs with rare cyan scratches
- **Ceiling:** deep teal-black mottling
- **Accent:** bioluminescent cyan/mint — sparse drips, never full neon wash
- **Mood:** flooded, weeping, cold light

---

## 4. Production specification

### 4.1 File deliverables

For a new theme `mytheme`:

```
wall.png          # or mytheme_wall_256.png
floorA.png        # floor_a
floorB.png        # floor_b
ceiling.png
```

- Format: PNG, RGB, **no alpha required** (opaque)
- Size: **256×256** exactly
- Seamless on all four edges
- Prefer authored at 128 then NN-scaled ×2 for matching chunk

### 4.2 Palette discipline

Measured unique 8-quantized colors per shipping tile are typically **~10–60** (walls denser; ceilings sparse). F2 wall is an outlier (~170) because of book spines.

Rules of thumb:

- Ceiling: ≤ ~20 hues
- Floor A/B: ≤ ~30 hues
- Wall (stone): ≤ ~60 hues
- Wall (bookshelf): may go higher, but keep spine colors muted and blocky

### 4.3 Seamlessness checklist

1. Offset the texture by 128 px in X and Y — no hard lines.
2. Confirm brick/plank courses continue across the wrap.
3. Confirm glow flecks are not clustered only in the center.
4. View at 25% scale (corridor distance) — silhouette of material still readable.
5. Drop into a 2×2 tile preview of A/B checkerboard — A and B must look like one floor, not two biomes.

### 4.4 In-engine verification

After wiring a theme:

1. Straight corridor — textured floor, ceiling, both walls
2. Open side passage — floor/ceiling continue; no black voids
3. Front wall at depth 0 — textured, not a black hole
4. Checkerboard readable while walking
5. Combat → dungeon return — textures still valid (pattern cache)

Commands: `npm run build`, then `npx vite preview --port 5176 --base /OnyxLabyrinth/`.

---

## 5. Human artist workflow

### 5.1 Recommended process

1. Pick floor identity (or write a new one-line material story).
2. Lock a 6–12 color ramp (base dark, base mid, base light, mortar, accent mid, accent core).
3. Block wall structure at 128×128 (bricks or shelves).
4. Add wear at low density; stop early.
5. Build floorA slabs; duplicate to floorB; darken ~10–15% and add a few more cracks (or grate variant for forge-like floors).
6. Ceiling = quieter cousin of the wall hue, almost no structure.
7. NN upscale ×2 → 256.
8. Run seamlessness + A/B checker tests.
9. Spot-check mean luminance stays in band (§2.2).

### 5.2 Do / Don’t

| Do | Don’t |
|----|-------|
| Running bond or clear plank rhythm | Random rubble with no tile logic |
| 1 px mortar | Soft airbrushed gaps |
| Small accent flecks | Full-tile lava or rune mandalas on floorB |
| Matching A/B materials | A = stone, B = magic circle sheet |
| Desaturated bases | Vivid saturated fills |
| Mid luminance | Pure `#000` fields |

### 5.3 Optional: regenerate from code

`node scripts/generate-floor-tilesets.mjs` rebuilds the procedural campaign set deterministically. Prefer editing the generator when extending the *procedural* look; prefer hand/AI paint when introducing a wholly new painted theme — then keep this guide’s constraints.

---

## 6. AI generation recipes

### 6.1 Global positive prompt (append floor-specific block)

```text
seamless tileable 256x256 game texture, orthographic, chunky 16-bit pixel art,
limited palette, hard pixels, no anti-alias, dithered mottle, mid-dark luminance,
SNES PC dungeon crawler style, Wizardry-like, opaque, flat lighting,
subtle top-edge highlights, 1-pixel mortar cracks, sparse wear, not photoreal,
not 3D render, not PBR, not smooth gradient painting
```

### 6.2 Global negative prompt

```text
photorealistic, ray tracing, PBR, smooth airbrush, blur, glow bloom large,
UI frame, watermark, text labels, collage, sheet of many icons, sprite atlas,
perspective vanishing point, isometric 3/4 view, neon cyber grid,
bright white clipped highlights, pure black void, anime, modern HD pixel art
with soft shading, marble, crystal cave, grass outdoors
```

### 6.3 Per-slot prompts

**Wall (stone family):**  
`front elevation stone brick wall, running bond, dark mortar, mid horizontal riveted band optional, seamless tile`

**Wall (library only):**  
`front elevation wooden bookshelf filled with muted colorful book spines, pixel art, seamless horizontal tile`

**Floor A:**  
`top-down seamless floor, 4x4 stone slabs OR wood planks, dark grout gaps, sparse hairline cracks, quiet texture`

**Floor B:**  
`same material as floor A, slightly darker, more wear, still seamless full-field texture, NOT a rune atlas, NOT hazard icons`

**Ceiling:**  
`seamless dark mottled ceiling, almost featureless, rare flecks, quieter than floor, no beams unless wood theme`

### 6.4 Per-floor accent lines (add to positive)

| Theme | Add |
|-------|-----|
| F1 | `olive grey damp crypt stone, moss on mortar, water stains, no lava` |
| F2 | `warm dark walnut wood, library, muted book colors on walls only` |
| F3 | `charred warm stone, sparse ember orange cracks, iron rivets, forge heat, thin molten veins not lakes` |
| F4 | `cold purple grey stone, pale lilac scratches, silenced cathedral dungeon, no orange` |
| F5 | `wet teal charcoal stone, sparse mint cyan seepage flecks, cistern damp, no orange` |

### 6.5 Post-AI cleanup (required)

AI outputs rarely meet engine needs raw. Always:

1. Crop to exact 256×256 (or 128→NN×2)
2. Posterize / constrain palette
3. Force seam fix (offset paint)
4. Strip any labels, borders, or multi-tile collage frames
5. Rebuild floorB as a true twin if the model emitted a rune sheet
6. Preview under game brightness (temporarily raise contrast offline to simulate renderer stretch)

---

## 7. Submission checklist

- [ ] Four PNGs: wall, floorA, floorB, ceiling @ 256×256
- [ ] Seamless wrap tested
- [ ] Floor A/B are material twins (checkerboard-safe)
- [ ] No gameplay icons baked into floors
- [ ] Accent density sparse; no face-center hero crack on walls
- [ ] Mean luminance in band (§2.2)
- [ ] Matches one floor identity or a documented new identity paragraph
- [ ] In-corridor verification views pass (§4.4)
- [ ] Theme registered (`tilesetTheme` + asset paths)

---

## 8. Quick reference card

```
SIZE:     256×256 PNG (prefer 128 logical ×2 NN)
STYLE:    chunky 16-bit, dithered, desaturated
VALUES:   mid-dark (floors ~45–80 mean L)
SLOTS:    wall | floorA | floorB | ceiling
FLOOR AB: checkerboard twins — NOT feature atlases
ACCENTS:  sparse glow/moss/scratches only
LIGHT:    flat + tiny top highlights; fog is runtime
VERIFY:   seam offset, A/B pair, corridor screenshots
```

---

## 9. Related docs

- `docs/FLOOR-AUTHORING.md` — map geometry & features
- `AGENTS.md` — renderer pitfalls and verification checklist
- `scripts/generate-floor-tilesets.mjs` — procedural reference implementation
- `src/engine/renderer.ts` — `RENDER_CONFIG` brightness/contrast and theme loading
