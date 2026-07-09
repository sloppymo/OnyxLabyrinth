# Asset Integration & Combat Presentation Audit — OnyxLabyrinth

**Asset root:** `/home/sloppymo/jewelflame/assets`  
**Game code:** `/home/sloppymo/OnyxLabyrinth/src/engine/combat-renderer.ts`, `enemy-sprite-cache.ts`, `combat-select-action-view.ts`  
**Audit date:** 2026-07-08

---

## 1. Complete Asset Inventory

The external asset library contains **~1,383 raster/image files** totalling **~46 MB**. After de-duplication, the useful unique set is considerably smaller because several packs are copied/embedded inside one another.

### High-level category totals

| Category | Folders audited | Image files | Approx. size | Notes |
|----------|-----------------|------------:|-------------:|-------|
| **Humanoid / Enemy Characters** | `Characters(100x100)/`, `Tiny RPG Character Asset Pack*/`, `Citizens-Guards-Warriors/`, `Warriors/`, `Mages/`, `Rogues/`, `heavy_knight/` | ~1,166 | ~5.05 MB | Largest and most combat-relevant category |
| **Creatures / Dragons / Bosses** | `animations/creatures/`, `dragon/`, `Dragon/`, `Creature Extended- Supporter Pack/` | 30 | ~269 KB | Small but high-impact boss kit |
| **Effects & Projectiles** | `animations/effects/`, `effects/`, `Magical Effects/`, `Generic Weapon Attack Effects/`, `*Effect*.png`, projectile folders | 216 (92 unique) | ~452 KB (~206 KB unique) | Heavy duplication; many usable spell/attack FX |
| **UI, Portraits, Battlefields** | `ui/`, `portraits/`, `battlefields/`, `icons/`, `fonts/`, root-level UI files | 44+ | ~15.17 MB+ | Portraits dominate by size; `battlefields/` is empty |
| **Dungeon / Terrain / Audio** | `animations/tilesets/`, `terrain/`, `maps/`, `Classic Dungeons - Files/`, `Lonesome Forest*/`, audio | 67 | ~3.39 MB | Mostly top-down tilesets; one MIDI file |
| **Existing project assets** | `src/assets/` | 6 | ~91.6 KB | Tiny; only one enemy sprite wired |

### Folder relationship map (duplicates)

- `Characters(100x100)/` is a byte-for-byte extraction of `Tiny RPG Character Asset Pack v1.03 -Full 20 Characters/Characters(100x100)/`.
- `Tiny RPG Character Asset Pack -Full 10 Characters/` is a subset of the 20-char pack.
- `Tiny RPG Character Asset Pack v1.03 -Free Soldier&Orc/` is fully contained in the Full 20 pack.
- `Citizens - Guards - Warriors/` and `Citizens-Guards-Warriors/` are the same pack, plus three large annotated reference screenshots in the spaced-name variant.
- `Warriors/`, `Mages/`, `Rogues/`, `heavy_knight/` largely duplicate subfolders inside `Citizens-Guards-Warriors`.
- `Magical Effects/` at root duplicates `Citizens-Guards-Warriors/Magical Effects/`.

**Recommendation:** consolidate to two canonical sources:
1. `Tiny RPG Character Asset Pack v1.03 -Full 20 Characters/` — for 100×100 side-view enemy/party sprites.
2. `Citizens-Guards-Warriors/` — for 24×24/32×32 combat sheets, townspeople, and magical effects.

---

## 2. Visual Style Analysis

### Tiny RPG 100×100 character packs

| Attribute | Finding |
|-----------|---------|
| **Native frame size** | 100×100 px |
| **Perspective** | Side-view, JRPG combat stance |
| **Animation states** | Idle (6), Walk (8), Hurt (4), Death (4), Block (4), Heal (4–6), Attack01/02/03 (6–15 frames each) |
| **Shadows** | Separate `Shadow sprites/` folders + `with shadows/` variants |
| **Split effects** | Separate `...(Split Effects)/` folders per character |
| **Projectiles** | Archer/Soldier/Skeleton Archer arrows; Priest/Wizard magic bolts |
| **Color palette** | Limited, muted retro JRPG palette; hard black outlines |
| **Scale suitability** | Nearest-neighbor ideal; current 4.5× on 48×64 logical box gives ~216×288 display, so a 100×100 frame should be scaled to ~2.88× within that box |
| **Style** | Consistent across all 20 characters; matches the existing `enemy_big_titty_ogre.png` reasonably well |

**Characters available:** Archer, Armored Axeman, Armored Orc, Armored Skeleton, Elite Orc, Greatsword Skeleton, Knight, Knight Templar, Lancer, Orc, Orc rider, Priest, Skeleton, Skeleton Archer, Slime, Soldier, Swordsman, Werebear, Werewolf, Wizard.

### Citizens-Guards-Warriors pack

| Attribute | Finding |
|-----------|---------|
| **Native frame sizes** | 16×16 (top-down non-combat), 24×24 / 32×32 (combat side-view) |
| **Perspective** | Top-down RPG Maker-style for walking; side-view for combat sheets |
| **Animation states** | 4-dir walk + idle/hurt/attack/death rows in combat sheets |
| **Shadows** | Baked or absent; no separate shadow sheets |
| **Split effects** | Some WITH/WITHOUT attack-effect variants |
| **Color palette** | Muted, limited fantasy palette; consistent across citizens/guards/warriors/mages/rogues |
| **Scale suitability** | Heavy upscaling (9–12×) looks blocky; better for small UI/avatar use or low-res combat |
| **Style** | Classic RPG Maker / indie pixel art; slightly different line weight from Tiny RPG 100×100 |

### Creature Extended Supporter Pack

| Attribute | Finding |
|-----------|---------|
| **Native frame size** | 16×16 per frame, 4-column atlas (64 px wide) |
| **Perspective** | Top-down/oblique with 4 directional rows (`_down`, `_left`, `_right`, `_up`) |
| **Animation states** | Idle, Walk, Attack, Hurt (no death frames) |
| **Color palette** | Tiny palettes (4–14 colors), PICO-8-like |
| **Scale suitability** | Requires 13–14× to fill current enemy slot; better for a different layout or as small mob sprites |
| **Style** | Cute/compact; clashes with the larger side-view sprites if mixed directly in the same arena |

### Green Dragon boss kit (`Dragon/Green Dragon/`)

| Attribute | Finding |
|-----------|---------|
| **Native frame size** | 96×96 px |
| **Perspective** | Side-view |
| **Animation states** | Firebreath (64), Fly (24), Hover (24), Launch (32), Melee (24), Walk (24) |
| **Color palette** | Rich green/brown; detailed but still pixel-art |
| **Scale suitability** | At 4.5× would be 432×432 px — too large for current slot; needs ~2–2.5× or arena layout change |
| **Style** | High-quality, dramatic, clearly boss-tier |

### Small Dragon (`dragon/`)

| Attribute | Finding |
|-----------|---------|
| **Native frame size** | 96×96 px |
| **Animation states** | Death only (9 frames) |
| **Use** | Fits a mid-boss or large monster death animation |

### Magical / Weapon Effects

| Attribute | Finding |
|-----------|---------|
| **Native frame sizes** | 8×8 up to 100×100 |
| **Sheet layouts** | Horizontal strips, small grids (4×3, 2×16, 2×9) |
| **Transparency** | PNG alpha everywhere; glow variants have soft halos |
| **Frame counts** | 4–18 frames per effect |
| **Style** | Two distinct families: (a) 100×100 Tiny RPG character-attached effects, (b) 28×28/48×48 compact elemental bursts |
| **Scale suitability** | Compact effects need 3–6× scaling; 100×100 effects need 2–3× |

### UI / Portraits

| Asset | Style |
|-------|-------|
| Ornate frames (`panel_border.png`, `stat_box_bg.png`, `banner_frame.png`, `siderbar_frame_9patch.png`) | Gothic gold/brown, stained-glass influence, high resolution (512–1280 px) |
| Command icons (`sheet3_command_icons.png`) | 64×64 pixel-art combat commands (sword, shield/helmet, gauntlet, fist) |
| Strategy icons (`ui/icons/`, `icons/`) | 32×32/64×64 resource/castle themed — **not** RPG item/spell/status icons |
| Portraits (`portraits/house_*`) | AI-generated pixel-art, 832×1248, ornate frames; some duplicates across houses |
| Font `Ishmeria` | Pixel font based on Gemfire/Super Royal Blood; CC BY-NC-SA 3.0 license |

---

## 3. Hidden Gems — Unused High-Value Assets

These assets could dramatically improve combat presentation with minimal new art creation:

1. **Tiny RPG 100×100 idle/walk/hurt/death/attack strips** — would replace the procedural bob/lunge/flash/rotate with real frame animation for every humanoid enemy.
2. **Tiny RPG split-effect sheets** — attack VFX separated per character, enabling impactful weapon swings and spell casts.
3. **Tiny RPG arrow and magic projectile sheets** — Archer/Soldier/Skeleton Archer arrows and Wizard/Priest magic bolts could animate ranged attacks across the arena.
4. **Green Dragon boss kit** — 200+ frames of firebreath, hover, fly, melee, launch; perfect for `headmasters-echo` or a new dragon boss.
5. **Magical Effects / Fire_Explosion_28x28.png** — 12-frame explosion, drop-in replacement for procedural `spellBurst`.
6. **Magical Effects / Ice-Burst_crystal_48x48_Anti-Alias_glow.png** — 8-frame ice burst for ice spells.
7. **Magical Effects / Extra_Elemental_Spellcasting_Effects_14x14.png** — heal, shield, poison, sleep, confuse, nova, burst status animations.
8. **Generic Weapon Attack Effects / Slash_Attack_Effect_1.png** — single-frame slash overlay to replace the procedural diagonal line.
9. **Ornate UI frames** (`panel_border.png`, `stat_box_bg.png`, `siderbar_frame_9patch.png`) — would transform the current plain message box and party strip.
10. **Stained-glass sidebar** (`ui/backgrounds/stained_glass_sidebar.png`) — dramatic dark-fantasy backdrop for the DOM `selectAction` phase.
11. **House portraits** — 832×1248 pre-framed character art for major NPCs or boss introductions.
12. **Animated environmental sprites** (candles, chests, water, waterfall) — add life to corridors and camp/town screens.
13. **Classic Dungeons tileset** — complete 16×16 wall/floor/detail/door set for a more cohesive dungeon look.
14. **`ff6_battle_theme.mid`** — only music asset found; could become actual combat music after conversion.

---

## 4. Combat Presentation Design

### Enemy Presentation

**Current state:**
- Logical sprite box: `SPRITE_W = 48`, `SPRITE_H = 64`, scaled by `ENEMY_SPRITE_SCALE = 4.5` → ~216×288 px.
- Only `big-titty-ogre` uses an image; all others fall back to procedural 48×64 silhouettes scaled 4.5×.
- Back row is higher (`rowOffsetY = -SPRITE_H * 0.7`) and slightly right (`rowOffsetX = 20`).
- Enemy spacing: `ENEMY_SLOT_SPACING = 230` px.

**Recommended changes:**

| Element | Current | Recommended | Rationale |
|---------|---------|-------------|-----------|
| **Enemy image scale** | 4.5× on 48×64 logical box | **3.0× on 100×100 native frames** (or fit-to-box with `Math.min`) | 100×100 art at 3× = 300×300 px, filling the 216×288 box without cropping; keeps nearest-neighbor crisp |
| **Procedural sprite scale** | 4.5× | **Keep 4.5× or bump to 5×** | Procedural shapes need the extra size to read as more than blobs |
| **Vertical placement** | `baseY = arenaTop + arenaH * 0.55` | **Move enemies down ~8–10%** so larger sprites sit on the ground line, not float above it |
| **Row depth** | Back row simply higher | **Add alpha/scale depth cue**: back row at 0.9 scale and slightly darker | Reads more like a formation |
| **Idle animation** | Sine-wave bob | **Use real idle strip** (6 frames @ ~8 fps) | Much more alive |
| **Attack animation** | Lunge 30 px | **Lunge + attack strip frame** (e.g. first 3 frames of Attack01) | Communicates weapon type |
| **Hit reaction** | White flash overlay | **Flash + hurt frame** (4 frames @ 12 fps) | More satisfying feedback |
| **Defeated** | Rotate 90° + fade | **Death strip (4 frames) then rotate/fade** | Dramatic and readable |
| **Shadow** | Ellipse drawn by code | **Keep code ellipse, use NO_SHADOW variants** | Consistent dynamic shadow; avoids double-shadow |
| **HP bar** | Text descriptor only | **Add thin HP bar under each enemy** (e.g. 48×4 px, amber fill on dark bg) | Instant readable health state |
| **Status icons** | None | **Small 16×16 icons above enemy** for poison/sleep/silence | Better status communication |
| **Target numbers** | White number above sprite | **Amber number inside a small frame or circle** | More polished |

**Front row / back row layout:**
- Front row: scale 1.0, y at arena 62%.
- Back row: scale 0.9, y at arena 48%, opacity 0.95, slight desaturation.
- Reduce `ENEMY_SLOT_SPACING` from 230 to **180–200 px** once sprites are larger, so 3 enemies still fit within the 768 px canvas.

### Spell Effects

- Replace procedural `slash` with `Generic Weapon Attack Effects/Slash_Attack_Effect_1.png` (or a 100×100 character split-effect frame) drawn at the target during the attacker’s `attacking` state.
- Replace procedural `spellBurst` with:
  - Fire: `Magical Effects/Fire_Explosion_28x28.png` scaled 4×.
  - Ice: `Magical Effects/Ice-Burst_crystal_48x48_Anti-Alias_glow.png` scaled 3×.
  - Lightning: `Magical Effects/Lightning_Energy_48x48.png` or `Lightning_Blast_54x18.png`.
  - Heal: `Magical Effects/Extra_Elemental_Spellcasting_Effects_14x14.png` heal row.
- Add **projectiles** for ranged attacks and casters: animate Wizard/Priest magic bolt or arrow sprites from attacker to target.
- Use `ctx.globalCompositeOperation = 'lighter'` briefly before drawing glow effects, then restore `'source-over'`.
- **Target highlight**: draw a subtle amber rect/outline around the selected target during target-selection phases.
- **Damage numbers**: currently text-only in log. If adding floating numbers, render them with the existing `FF36` font at 14–16 px; no number-sprite assets exist.

### Party Presentation

- **Portraits:** Use the house portraits cropped to ~80×120 or 96×128 in the party strip instead of (or alongside) the procedural silhouettes.
- **Action queue:** The DOM `selectAction` phase already shows planned actions in a panel. Add small class icons (from `sheet3_command_icons.png`) next to each action row.
- **HP/SP bars:** Current DOM strip uses CSS bars. Keep them, but style with ornate frame assets (`panel_border.png` scaled/cropped, or `stat_box_bg.png` as a backdrop).
- **Status effects:** Add 16×16 status icons derived from `Extra_Elemental_Spellcasting_Effects_14x14.png` rows.

### Background

- `battlefields/` is empty, so no pre-made arena backgrounds exist.
- **Immediate option:** Use `ui/backgrounds/stained_glass_sidebar.png` or `stat_box_bg.png` as a dark atmospheric backdrop for the DOM selection panel.
- **Canvas arena:** Replace the flat gradient with a subtle tiled floor texture (e.g. from `Classic Dungeons - Files/classic_dungeons_stone_floor.png` or the existing `floor_tile_a_256.png`) and add a distant wall/ruin silhouette using the wall tileset.
- **Lighting:** Add animated torch sprites (`classic_dungeons_animated_candles.png` or Lonesome Forest flame) at the arena edges.

### UI Elements

- **Message box frame:** Replace the simple amber stroke with `stat_box_bg.png` (scaled/cropped to top 24%) or a 9-patch from `siderbar_frame_9patch.png`.
- **Borders/dividers:** Use `divider_gold.png` and `divider_ornate.png` between combat log sections.
- **Command icons:** Slice `sheet3_command_icons.png` (4× 64×64 icons) and draw them beside Attack/Defend/Item/Flee options.
- **Buttons:** Use `sheet2_button_states.png` (3 states) for DOM action buttons.
- **Font hierarchy:** Keep `FF36` for body/log text. Consider adding `Ishmeria` at 16/32 px for headers/round numbers (verify CC BY-NC-SA 3.0 compatibility first).

---

## 5. Asset Usage Matrix

| Asset Category | Current Use | Recommended Use | Priority | Implementation Effort |
|----------------|-------------|-----------------|----------|----------------------|
| **Enemy sprites (Tiny RPG 100×100)** | Only `big-titty-ogre` wired | Wire idle/attack/hurt/death frames to all 15+ enemy IDs | High | Medium (needs spritesheet slicing + mapping) |
| **Enemy split effects** | None | Overlay attack VFX during `attacking` state | High | Medium |
| **Projectiles (arrows/magic)** | None | Animate ranged attacks and caster spells | Medium | Medium |
| **Magical Effects (28×28/48×48)** | None | Replace procedural `spellBurst`/`healBurst` | High | Low-Medium |
| **Generic Weapon Attack Effects** | None | Replace procedural `slash` line | High | Low |
| **Ornate UI frames** | None | Frame message box, party strip, modal panels | High | Low |
| **Stained-glass sidebar / stat_box_bg** | None | DOM `selectAction` backdrop | Medium | Low |
| **Command icons (sheet3)** | None | Action menu icons | Medium | Low |
| **House portraits** | None | Party/NPC portraits in camp/town/combat strip | Medium | Low |
| **Classic Dungeons tileset** | None | Corridor wall/floor textures, auto-map | Medium | High (renderer integration) |
| **Lonesome Forest tilesets** | None | Outdoor/forest floor themes | Low | High |
| **Creature Extended 16×16** | None | Too small for current arena; use for auto-map tokens or as small summons | Low | Low |
| **Green Dragon boss kit** | None | Boss encounter for `headmasters-echo` or new dragon | High | Medium |
| **Animated environmental sprites** | None | Torches, chests, water in corridors/camp | Low | Low |
| **Ishmeria font** | None | Headers if license compatible | Low | Low |
| **ff6_battle_theme.mid** | None | Convert to OGG/MP3 for combat music | Low | Medium |

**Focus on high-impact, low-effort wins:** Generic slash effect, magical bursts, ornate UI frames, and wiring static 100×100 base sheets to enemy IDs.

---

## 6. Missing Assets

Assets that are **genuinely not present** and would significantly improve combat:

1. **Damage number sprites / glyph sheet** — floating damage numbers are currently text-only; no pixel-art number sprites exist.
2. **Static status-effect icons** — poison, sleep, silence, stun, paralysis, berserk. Only small animation rows exist; no clean static 16×16 set.
3. **Boss portraits** — the house portraits are generic nobles, not specific boss silhouettes.
4. **Combat arena backgrounds** — `battlefields/` is empty.
5. **First-person wall/floor textures** — all tilesets are top-down; none are authored for the corridor renderer.
6. **Vermin / insect / flying sprites** — no rat, wasp, moth, spider, book, or imp-sized demon sprites in the audited sets.
7. **Item / spell / equipment icons** — current icons are strategy/castle themed, not RPG inventory themed.
8. **Hit spark / impact particles** beyond the existing explosion bursts.
9. **Screen-overlay effects** — no full-screen flash, vignette pulse, or CRT-style overlays beyond what the code already proceduralizes.
10. **Combat music in a web-playable format** — only a MIDI exists.

---

## 7. Scaling Strategy

**Canvas dimensions:** 768×672 combat canvas.

**Recommended sprite scale factors:**

| Asset type | Native size | Recommended display size | Scale | Notes |
|------------|-------------|-------------------------:|------:|-------|
| **Tiny RPG enemy sprites** | 100×100 | 270×270 px (fit in ~216×288 box) | **2.7×** | Keeps crisp pixels; sprite fills the procedural box |
| **Procedural enemy shapes** | 48×64 logical | 240×320 px | **5.0×** | Makes silhouettes readable |
| **Tiny RPG party sprites** | 100×100 | 180×180 px | **1.8×** | Smaller than enemies, appropriate for allies |
| **Compact spell effects** | 28×28 / 48×48 | 112×112 / 144×144 px | **4× / 3×** | Readable without dominating the sprite |
| **Large effects / dragon** | 96×96 | 240×240 px | **2.5×** | Dragon needs custom layout or smaller scale |
| **UI command icons** | 64×64 | 32×32 or 48×48 px | **0.5× / 0.75×** | Downscale for menu use |
| **Portraits** | 832×1248 | 80×120 or 96×128 px | ~0.1× | CSS scale; keep source high-res for zoom |

**Why not 4.5× for the new 100×100 sprites?**  
4.5× on 100×100 = 450×450 px, which is larger than the current enemy slot and will overlap neighbors and the message box. Scaling to **2.5–3.0×** keeps the sprite inside the existing layout while still appearing large and detailed.

**Nearest-neighbor rule:**  
Always set `ctx.imageSmoothingEnabled = false` when drawing pixel-art sprites and effects. The current `drawEnemySprite` already does this. CSS should use `image-rendering: pixelated` for any DOM-placed pixel art.

**Target resolutions:**
- **1080p:** 768×672 canvas upscaled by CSS to ~147% at 1080p. 2.7× sprites remain crisp.
- **1440p:** ~196% CSS scaling. Pixel art still reads cleanly with nearest-neighbor.
- **Steam Deck (1280×800):** ~166% scaling. Same conclusion.

---

## 8. Technical Integration Plan

### Folder organization

Create a new canonical import tree under `src/assets/combat/`:

```
src/assets/combat/
  enemies/
    tiny-rpg-100/
      orc/
        Orc-Idle.png
        Orc-Attack01.png
        ...
      skeleton/
      wizard/
      ...
    citizens/
      warrior/
      mage/
      ...
  effects/
    slash/
    fire-burst/
    ice-burst/
    heal-burst/
    projectiles/
  ui/
    frames/
    icons/
    portraits/
  backgrounds/
```

Copy only the needed unique files from `jewelflame/assets` into this tree. Do **not** import the entire 46 MB library.

### Sprite atlas vs. individual files

- **Keep individual PNGs for enemy states** (e.g. `Orc-Idle.png`, `Orc-Attack01.png`). This matches the existing `enemy-sprite-cache.ts` pattern of one `HTMLImageElement` per enemy ID/state and avoids writing a complex atlas parser.
- **Use horizontal strips for effects** (e.g. `Fire_Explosion_28x28.png`). Frame slicing is trivial: `frameX = frameIndex * frameWidth`.
- **Avoid GIFs and `.import`/`.tres` files** in the shipped build. Use the PNG sheets and embed frame metadata in TypeScript.

### Animation data structure

Define a TypeScript manifest per sprite source:

```typescript
// src/engine/sprite-manifest.ts
export interface SpriteStrip {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export interface EnemySpriteDef {
  idle: SpriteStrip;
  attack: SpriteStrip[]; // multiple attacks
  hurt: SpriteStrip;
  death: SpriteStrip;
  block?: SpriteStrip;
  shadow?: string;
  effects?: Record<string, SpriteStrip>;
}

export const ENEMY_SPRITES: Record<string, EnemySpriteDef> = {
  "big-titty-ogre": { /* ... */ },
  "stone-guardian": { /* Knight Templar strips */ },
  // etc.
};
```

### Lazy loading strategy

Extend `enemy-sprite-cache.ts`:

```typescript
const cache: Map<string, EnemySpriteAssets> = new Map();

export async function loadEnemySpriteDef(id: string): Promise<EnemySpriteAssets> {
  if (cache.has(id)) return cache.get(id)!;
  const def = ENEMY_SPRITES[id];
  if (!def) return { base: null };
  const assets = await loadAll(def);
  cache.set(id, assets);
  return assets;
}
```

Load on demand when an encounter starts, not at app boot.

### Naming conventions

- Enemy folders: kebab-case matching `EnemyDef.id`.
- State files: `{enemyId}-{state}.png` or `{characterName}-{state}.png`.
- Effect files: `{element}-{effect}-{frameWidth}x{frameHeight}.png`.
- Avoid spaces in shipped filenames (the source has many); normalize during import.

### Integration with `combat-renderer.ts`

1. **Modify `drawEnemySprite` signature** to accept a `frame` index and `strip` key:
   ```typescript
   export function drawEnemySprite(
     ctx, x, y, enemy, anim, now, isTargetable, targetIndex, scale, frame, stripKey
   )
   ```
2. **Slice the strip** with `ctx.drawImage(img, sx, sy, 100, 100, dx, dy, dw, dh)`.
3. **State-to-strip mapping:**
   - `idle` → idle strip, frame advances by time.
   - `attacking` → attack strip, frame advances by `progress`.
   - `hit` → hurt strip, one-shot.
   - `defeated` → death strip, then fade/rotate.
4. **Keep procedural fallback** when no image is loaded.
5. **Add HP bar drawing** under each enemy after the sprite.
6. **Add status icon drawing** above the sprite.

### Integration with `enemy-sprite-cache.ts`

- Replace the single `SPRITE_BY_ENEMY_ID` record with the richer `ENEMY_SPRITES` manifest.
- Cache `HTMLImageElement`s per strip URL.
- Expose `getEnemySpriteStrip(enemyId, state)` returning the image + metadata.

### Integration with `CombatScene`

- Add per-enemy `frameIndex` and `stripKey` to `SpriteAnim` (or extend the map values).
- In `updateAnimations`, advance `frameIndex` based on elapsed time and strip FPS.
- In `triggerAnimationsForMessage`, set the appropriate strip key when an attack/spell/hit/death occurs.

### Adding new effects without breaking the renderer

1. Extend `CombatEffect` type with new effect IDs:
   ```typescript
   export interface CombatEffect {
     type: "slash" | "spellBurst" | "healBurst" | "fireProjectile" | "iceBurst" | ...;
     // existing fields
   }
   ```
2. Add a `drawEffect` branch for each new type.
3. Load effect images through a new `effect-sprite-cache.ts` module.
4. Trigger new effects from `triggerAnimationsForMessage` by spell ID or element.

---

## 9. Visual Cohesion Recommendations

### Inconsistencies found

1. **Mixed pixel resolutions:** 16×16 (Creature Extended, Classic Dungeons, Lonesome Forest), 24×32 (Citizens-Guards-Warriors), 100×100 (Tiny RPG), 96×96 (Dragon), 256×256 (existing ogre texture), 832×1248 (portraits).
2. **Mixed perspectives:** side-view (Tiny RPG, Dragon), top-down/oblique (Creature Extended, tilesets), front-facing (ogre, portraits).
3. **Mixed color palettes:** muted JRPG (Tiny RPG), PICO-8 (Lonesome Forest), dark gothic (UI frames), AI-generated painterly (portraits).
4. **Inconsistent outlines:** hard black outlines (Tiny RPG), softer anti-aliased edges (Citizens, Hammer Warrior), no outlines (some UI).
5. **Duplicate/redundant assets:** Full 20 vs Characters(100x100) vs Free Soldier&Orc; Citizens vs spaced-name variant; Magical Effects duplicated; Green Dragon shadow/no-shadow pairs.
6. **Style outlier:** `Warriors/Hammer_Warrior.png` is anti-aliased and much larger than the Citizens pack; `house_lyle/lord_lyle.png` does not match the other house portraits.

### Unified visual style proposal

**Choose one core combat sprite family: Tiny RPG 100×100 side-view.**

- It has the most complete animation sets, the most characters, and a consistent perspective that matches the existing `big-titty-ogre`.
- Use Citizens-Guards-Warriors **only** for town/camp NPCs and small UI avatars, not in the main combat arena.
- Use Creature Extended **only** for auto-map tokens or tiny summons, not as main combat sprites.
- Use Green Dragon as a special boss with its own layout/scale.

**Establish a consistent pipeline:**
1. All combat sprites drawn at integer or clean multiples (2.5×, 2.7×, 3×) with `imageSmoothingEnabled = false`.
2. All combat sprites use the same dynamic shadow ellipse; drop baked shadows.
3. All effects use the compact 28×28/48×48 Magical Effects family (consistent palette and style) plus character split effects.
4. UI uses the gothic gold/brown frame family consistently; avoid mixing the strategy-game icons.
5. Portraits are cropped and framed uniformly; remove the mismatched `lord_lyle.png` or recolor it.

**Palette harmonization:**
- The existing OnyxLabyrinth palette is amber/gold/brown on dark brown/black (`#e0a458`, `#3a3025`, `#14110d`).
- Tiny RPG and Magical Effects already fit this warm palette well.
- For cooler elements (ice spells), use the blue/white ice burst as an intentional accent.
- Avoid the bright PICO-8 forest greens unless the level theme explicitly calls for them.

---

## 10. Prioritized Roadmap

### Immediate Wins (< 1 day)

1. **Wire static base sheets to enemy IDs.**
   - Map `Orc` → `big-titty-ogre`, `Knight Templar` → `stone-guardian`, `Wizard` → `headmasters-echo`, `Skeleton` → `animated-armor`, `Slime` → `acid-puddle`, `Werebear` → `failed-experiment`, `Soldier` → `training-dummy`/`lesser-construct`, `Priest` → `lab-assistant`.
   - Copy just the base `{Name}.png` files into `src/assets/combat/enemies/` and expand `SPRITE_BY_ENEMY_ID`.
   - No frame slicing yet; the existing whole-image draw path works immediately.

2. **Replace the procedural slash effect.**
   - Import `Generic Weapon Attack Effects/Slash_Attack_Effect_1.png`.
   - Draw it at the target during melee attacks.

3. **Add spell burst effects.**
   - Import `Fire_Explosion_28x28.png`, `Ice-Burst_crystal_48x48_Anti-Alias_glow.png`, `Lightning_Energy_48x48.png`.
   - Map fire/ice/lightning spells to these effects in `triggerAnimationsForMessage`.

4. **Frame the message box with an ornate UI asset.**
   - Use `stat_box_bg.png` or `panel_border.png` as the top message-box background.

### Short-Term (1 weekend)

1. **Add frame-slicing for Tiny RPG enemy strips.**
   - Implement idle/attack/hurt/death animation for wired enemies.
   - Update `SpriteAnim` to track frame index and strip key.

2. **Add character split effects.**
   - Overlay attack VFX during the `attacking` state.

3. **Add projectiles for ranged attacks.**
   - Wizard/Priest magic bolts and Archer/Skeleton Archer arrows.

4. **Add enemy HP bars and status icons.**
   - Draw under/above enemies in `drawEnemySprite`.

5. **Polish the DOM `selectAction` backdrop.**
   - Use `stained_glass_sidebar.png` or `stat_box_bg.png` as a dark atmospheric background.

### Medium-Term (1 week)

1. **Green Dragon boss integration.**
   - Add a special boss layout with larger scale and centered position.
   - Wire hover/firebreath/melee states to `headmasters-echo`.

2. **Party portraits and class icons.**
   - Add 80×120 portraits to the party strip.
   - Use `sheet3_command_icons.png` for action menu icons.

3. **Combat arena background.**
   - Replace the flat gradient with a tiled floor and distant wall.

4. **Audio conversion.**
   - Convert `ff6_battle_theme.mid` to OGG/MP3 and integrate into combat.

### Long-Term (1 month)

1. **Create or commission missing sprites:** vermin (rat), insects (wasp/moth), imp/demon, animated book, cobweb.
2. **First-person corridor tileset integration** using Classic Dungeons or a custom set.
3. **Full animated environmental sprites** (torches, water, chests) in corridors.
4. **Custom RPG item/spell/status icon set** to replace strategy icons.
5. **Screen-overlay effects** (encounter flash, boss reveal, critical-hit flash).

---

## 11. Art Director's Review

**What assets are being wasted?**

Almost everything in `/home/sloppymo/jewelflame/assets` is being wasted. The game currently ships one 256×256 ogre sprite and four corridor textures while sitting next to 1,383 files of animation, effects, UI, and portraits. The most egregious waste is the Tiny RPG 100×100 packs: 20 fully animated side-view characters with idle/attack/hurt/death frames, plus split effects and projectiles, doing nothing. The Green Dragon kit is another tragedy — 200+ frames of boss animation unused while the final boss is a procedural silhouette.

**What combinations would produce excellent results?**

1. **Tiny RPG 100×100 sprites + Magical Effects 28×28/48×48 + Generic Weapon Attack Effects** = a complete JRPG combat visual language. The character art and effects share a retro pixel-art vocabulary.
2. **Ornate UI frames + stained-glass sidebar + house portraits** = a dark-fantasy presentation that feels like Dark Spire or Etrian Odyssey.
3. **Classic Dungeons tileset + animated candles + Lonesome Forest water** = an atmospheric dungeon environment that finally matches the tone of the combat UI.
4. **Green Dragon + a custom boss arena background** = a genuine "boss fight" moment.

**What's the single highest-impact change?**

**Wire the Tiny RPG 100×100 base sheets to the 15 enemy IDs.** It requires almost no renderer changes (the existing whole-image draw path works), costs ~1.5 MB of assets, and instantly turns every combat from "colored blobs in empty space" into "actual monsters fighting the party." The visual gain per hour of work is unmatched.

**What's holding the combat presentation back?**

1. **Scale mismatch and empty space.** The 48×64 procedural silhouettes at 4.5× are too small for the 768×672 canvas and leave huge dead zones.
2. **No animation beyond bob/lunge/flash.** Static procedural shapes feel lifeless.
3. **No enemy HP bars or status icons.** The player has to read log text to assess threat.
4. **No combat backdrop.** The flat gradient ground line reads as placeholder.
5. **Asset fragmentation.** Duplicated packs and Godot metadata make it hard to know what is canonical.

**If I could change one thing about the current visual approach, what would it be?**

I would **commit to side-view 100×100 pixel-art sprites as the single combat art standard** and stop using procedural shapes for enemies. The procedural silhouettes were a sensible placeholder, but the asset library now exists to replace them. Mixing the 100×100 side-view ogre with 48×64 colored blobs creates a jarring "one real monster, five debug objects" look. Pick the Tiny RPG style, map every enemy to it, and let the procedural renderer fall back only for genuinely missing creature types (rat, wasp, book, imp). That one decision fixes scale, consistency, animation, and the empty-space problem simultaneously.

---

*End of audit.*
