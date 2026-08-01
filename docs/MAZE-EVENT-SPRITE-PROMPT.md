# Maze event / dungeon prop sprite prompts

**Audience:** LLM image workflows, pixel artists, and agents generating corridor floor props  
**Scope:** SNES / FF6-era JRPG **object** sprites for the first-person maze — treasure, ritual markers, corpses, hazard tells, event flavor  
**Not this doc:** combat enemy strips ([`SPRITE-ART-GENERATION-GUIDE.md`](SPRITE-ART-GENERATION-GUIDE.md)); wall/floor/ceiling bricks ([`TILESET-ART-STYLE-GUIDE.md`](TILESET-ART-STYLE-GUIDE.md))  
**Status:** generation brief + suggested asset IDs. Interactive tile features still draw as text glyphs in `renderer.ts` (`drawFeatureGlyph`); non-interactive decor uses `src/data/map-sprites.ts` → `public/assets/map-sprites/`. Wiring generated props into the corridor is a separate engine task.

Copy the **Master style lock** into every generation, then append one **Per-prop prompt**, optionally a **Floor-theme palette** line, and the **Animation strip** block when you need idle frames.

---

## Suggested asset ID map

Proposed filenames under a future `public/assets/maze-props/` (or reuse `map-sprites/` for pure decor). Live engine hooks today:

| Prompt # | Suggested id | Reads as | Live hook today | Notes |
|---:|---|---|---|---|
| 1 | `chest-closed` | Closed treasure | `TileFeature` `"treasure"` | Glyph `$` until sprite path exists |
| 2 | `chest-open` | Looted / empty | same tile after `consumed` | Not a separate feature yet — visual state only |
| 3 | `chest-trapped` | Trap tell | `treasure` + `TreasureDef.trap` | Keep primarily chest-shaped |
| 4 | `altar` | Mysterious shrine | `EventDef` flavor / `"event"` | F2 library / general shrine |
| 5 | `anvil-altar` | Forge rest | `EventDef` `kind: "heal"` (F3 anvil) | Matches campaign copy |
| 6 | `dead-adventurer` | Corpse story prop | `EventDef` `kind: "message"` | Not a combat enemy |
| 7 | `skeleton-remains` | Prior-party bones | decor / event | Overlaps map-sprite `bones` — prefer one style |
| 8 | `satchel` | Forgotten pack | `EventDef` `kind: "reward"` | F3 guard satchel, etc. |
| 9 | `warning-plaque` | Brass plate | `EventDef` `kind: "message"` | No readable letters |
| 10 | `brazier` | Heal warmth | `EventDef` `kind: "heal"` | F2 atrium brazier |
| 11 | `pressure-plate` | Hazard tell | `EventDef` `kind: "damage"` | Quiet, not a red button |
| 12 | `teleporter-disc` | Rune platform | `TileFeature` `"teleporter"` | Glyph `✦` today |
| 13 | `antimagic-ward` | Null seal | `TileFeature` `"antimagic"` | Glyph `∅` today |
| 14 | `darkness-idol` | Snuffed lantern / idol | `TileFeature` `"darkness"` | Glyph `◐` today |
| 15 | `cistern-basin` | Wet shrine marker | `TileFeature` `"water"` / F5 flavor | Glyph `≈` today |
| 16a | `camp-bedroll` | NPC camp remnant | additive flavor / near `"npc"` | Never gates progression |
| 16b | `camp-journal` | Candle + journal | additive flavor | Generate separately |
| 16c | `merchant-crate` | Crate stash | overlaps map-sprite `crate` | Match existing decor density |

Existing `MAP_SPRITES` IDs (`torch`, `crate`, `bones`, `barrel`) stay for non-interactive editor decor; regenerate them with this style lock if refreshing that pack.

---

## Master style lock (use every generation)

```text
ROLE
You are a senior SNES-era JRPG pixel artist creating ORIGINAL dungeon prop sprites for a Wizardry-style first-person maze crawler (OnyxLabyrinth). Think Final Fantasy VI / Chrono Trigger / Illusion of Gaia object density — anime fantasy silhouettes rendered as true 16-bit pixel art, not modern HD pixel, not AI painterly fantasy.

GOAL
Generate a single readable maze EVENT PROP sprite (or a small related set) that can sit on a dungeon floor tile in a dark pseudo-3D corridor. The prop must read instantly at small size: treasure, ritual object, corpse, hazard marker, etc.

STYLE — NON-NEGOTIABLE
- Medium: authentic hand-pixeled SNES 16-bit RPG sprite art
- Resolution intent: design as if the prop occupies roughly 24–48 px wide and 28–56 px tall inside a generous transparent / chroma canvas
- Hard pixel edges only — no antialiasing, no blur, no soft glow mats, no vector curves, no 3D renders, no photoreal materials
- Near-black 1px outline around the silhouette
- Limited palette: 8–24 opaque colors total for the prop
- Controlled ramps (shadow → mid → highlight → one emissive accent), not rainbow noise
- Deliberate pixel clusters; sparse single-pixel accents; minimal dither (2–3 value steps max)
- Slight anime JRPG flavor in silhouette and props (exaggerated shape language, readable icons) — but still chunky SNES pixels, not modern anime illustration
- Orthographic / 3/4 elevated view of the OBJECT ONLY (like an FF6 map treasure or altar), NOT a full corridor scene, NOT a character portrait
- Implied light from top / top-left; no baked torch bloom filling the frame
- Mood: dark fantasy dungeon — damp, cursed, solemn — never cute chibi, never neon cyberpunk

COMPOSITION
- Subject centered, clear silhouette against empty background
- Generous empty padding around the prop
- No floor tile pattern, no walls, no party characters, no UI, no text, no labels, no watermarks, no frame borders
- No cast shadow larger than a tiny 2–4 px contact shadow (optional; prefer none)
- Do not fill the whole canvas; the prop must look small and iconic

BACKGROUND
- Perfectly flat solid chroma key: #00FF00
- Do NOT use #00FF00 anywhere in the prop itself
- If the prop is mostly green, use #FF00FF as the key instead and say so

NEGATIVE / REJECT
photoreal, PBR, soft painted gradients, oil painting, concept art, 3D model screenshot, modern indie HD pixel with thick AA, webtoon, anime cel shading, glossy highlights, neon vaporwave, cluttered diorama, busy particle storms, readable runic text, logos, watermark, multiple unrelated objects unless requested, full-body adventurer standing for a prop that should be an object

OUTPUT
One clean sprite per image (unless a strip is requested). Same style lock on every variant.
```

---

## Per-prop prompts (append after the style lock)

### 1. Treasure chest (closed)

```text
SUBJECT: Closed wooden treasure chest for a dark dungeon floor.
Silhouette anchors: rounded lid, iron corner bands, single padlock or clasp, short stubby legs.
Materials: warm brown wood boards, cold grey iron fittings, tiny brass lock gleam.
State: closed, intact, inviting but slightly weathered.
Accent: one small highlight on the clasp.
Must not have: open lid, spilling coins, glowing aura filling the frame, oversized fantasy gems covering the whole chest.
```

### 2. Treasure chest (open / looted)

```text
SUBJECT: Same chest design, lid open toward the viewer/camera.
Inside: empty dark cavity OR a tiny sparse glint of remaining coin (2–4 pixels only).
Keep identical wood/iron language as a closed chest set.
Must not have: mountain of treasure, rainbow gem pile, huge sparkles.
```

### 3. Trapped chest (subtle tell)

```text
SUBJECT: Closed dungeon chest that looks almost normal but has a trap tell.
Silhouette anchors: same chest mass + one suspicious cue (thin needle slit near clasp, hairline seam crack, faint greenish corrosion on lock).
Accent: very small sickly green or rust-red fleck on the mechanism only.
Must still read primarily as a chest, not a bomb.
```

### 4. Mysterious altar

```text
SUBJECT: Low stone altar for a cursed labyrinth shrine.
Silhouette anchors: squat rectangular plinth, shallow bowl or flat offering top, one ritual focal object (candle stub, cracked idol, or empty dish).
Materials: desaturated grey-olive stone, dark mortar cracks, sparse moss or ash depending on mood.
Accent: tiny pale ember or cold lilac rune fleck — salt, not the meal.
Must not have: giant floating crystal, full cathedral architecture, readable prayer text.
```

### 5. Anvil altar / forge shrine

```text
SUBJECT: Blackened iron anvil used as a ritual resting place in a forge dungeon.
Silhouette anchors: heavy anvil horn + base, hammer leaning or resting, faint heat cracks.
Palette: charcoal iron, muted ember orange only in thin cracks/flecks.
Mood: heat under iron, solemn, not lava spectacle.
```

### 6. Dead adventurer

```text
SUBJECT: Fallen adventurer corpse as a dungeon story prop (not a combat enemy).
Pose: slumped against unseen wall / crumpled on floor, 3/4 elevated object view.
Silhouette anchors: slumped torso, limp limbs, broken weapon or empty scabbard, torn cloak.
Anime-JRPG costume cues: simple tunic/armor shapes, scarf or hood — readable at tiny size.
Face: helmeted or hair-obscured; no detailed expression; keep facial pixels minimal.
Palette: muted cloth blues/browns, dull steel, dried dark-red blood as small stains only.
Must not have: gore spectacle, severed limbs pile, modern military gear, standing heroic pose.
```

### 7. Skeleton remains / prior party bones

```text
SUBJECT: Scattered skeleton of a failed delver.
Silhouette anchors: skull + ribcage cluster, one bony hand near a rusted blade.
Keep compact as one prop cluster, not a full anatomy lesson.
Palette: ivory bone, brown-grey rust, dark void in eye sockets.
```

### 8. Satchel / forgotten pack

```text
SUBJECT: Abandoned leather satchel slumped against stone.
Silhouette anchors: bag body, strap, tiny buckle, maybe a potion silhouette peeking out.
Reads as lootable story object.
```

### 9. Warning plaque / brass plate

```text
SUBJECT: Half-melted or corroded brass wall plate / freestanding marker.
Silhouette anchors: rectangular plate, bolts/rivets, damaged corner.
IMPORTANT: no readable letters — use abstract scratch marks that suggest writing.
```

### 10. Brazier / healing warmth

```text
SUBJECT: Iron brazier with small controlled flame for a heal/rest tile.
Silhouette anchors: tripod or bowl brazier, short flame tongue.
Flame: 3–5 warm colors max, chunky pixels, no soft blur glow.
```

### 11. Pressure-plate / hazard tell

```text
SUBJECT: Subtle dungeon pressure plate set into floor context-free (object only).
Silhouette anchors: square stone plate, thin seam gap, one raised corner or click peg.
Accent: tiny warning color fleck optional.
Must remain quiet and ominous, not a big red button.
```

### 12. Teleporter rune disc

```text
SUBJECT: Circular floor glyph platform for teleportation.
Silhouette anchors: stone ring, inner disc, simple geometric rune shapes (non-linguistic).
Accent: sparse cold teal or lilac luminous cracks — small.
Must not have: sci-fi hologram, dense mandala noise, readable magic circles copied from real seals.
```

### 13. Antimagic ward / null seal

```text
SUBJECT: Cold sealed ward stone with cancelled hymn marks.
Palette: purple-grey stone, pale lilac scratches, no orange.
Silhouette: upright short stele or floor seal with an X’d / broken sigil.
Mood: silenced, liturgical, null.
```

### 14. Darkness idol / snuffed lantern

```text
SUBJECT: Extinguished iron lantern or hooded idol that marks a darkness zone.
Silhouette: hanging lantern body or squat idol with empty eye hollows.
Accent: almost none — the point is absence of light.
```

### 15. Water / cistern shrine marker

```text
SUBJECT: Wet stone basin or cracked fountain niche object for flooded dungeon flavor.
Palette: teal-charcoal stone, dark water, sparse drip highlights.
```

### 16. NPC camp remnant (additive flavor)

```text
SUBJECT: Small non-gating dungeon flavor prop suggesting someone lives/hides here.
Examples to generate separately: bedroll + tin cup; candle stump + journal; merchant crate.
Keep each as one tidy prop group.
```

---

## Optional animation strip variant

When you want idle motion (torch flicker, altar hum, chest sparkle):

```text
ANIMATION OUTPUT
Create a horizontal strip of exactly 4 frames (or 6 if requested), equal cell widths, one prop per cell, identical design and scale across frames.
Idle verbs: subtle breathe / ember flicker / dust mote / cloth settle — NO dramatic action.
Keep every part of the prop inside its own cell; no overlap into neighbors.
Same chroma background across the whole strip.
Frame 1 must strongly match the approved still identity.
```

Ship strips only after chroma → binary alpha cleanup. Prefer matching combat-guide discipline (hard edges, no AA soup) even if maze prop cell size differs from the 100×100 combat contract.

---

## Floor-theme palette swaps (append one)

| Floor | Append this line |
|--------|------------------|
| F1 Flooded Crypt | `Palette family: mossy olive-grey stone, damp greens, muted browns; accent = moss, not neon.` |
| F2 Cursed Library | `Palette family: dark wood, aged parchment, muted crimson/navy accents; dusty warm gloom.` |
| F3 Forge of Ashes | `Palette family: charred stone + iron; sparse ember orange flecks only.` |
| F4 Null Choir | `Palette family: cold purple-grey stone, pale lilac scratches; no orange accents.` |
| F5 Weeping Cistern | `Palette family: wet teal-charcoal stone, dark water highlights; cold damp mood.` |

Align accent choices with [`TILESET-ART-STYLE-GUIDE.md`](TILESET-ART-STYLE-GUIDE.md) material stories so props do not fight the corridor textures.

---

## One-shot “batch brief” (if the tool supports multi-subject lists)

```text
Generate a matching SET of dungeon event props in identical SNES 16-bit anime-JRPG pixel style:
1) closed treasure chest
2) trapped chest with subtle needle tell
3) mysterious stone altar
4) dead slumped adventurer
5) forgotten satchel
6) iron brazier with small flame
7) teleporter rune disc
8) antimagic ward stele

Shared rules: same pixel density, same outline weight, same light direction, same chroma #00FF00 background, each prop as its own centered image, readable silhouette at postage-stamp size, dark fantasy JRPG dungeon mood, original designs only.
```

---

## Quality checklist before you accept a result

- Reads as a **prop icon**, not a scene
- Silhouette clear at ~25% zoom
- ≤ ~24 colors, hard edges, 1px dark outline
- Flat chroma background, no baked corridor
- Anime/JRPG *shape language*, SNES *pixel craft*
- Accents sparse; no neon wash, no AA soup

Reject and regenerate if any checklist item fails. Raw image-gen output is source material only — same principle as the combat sprite guide.
