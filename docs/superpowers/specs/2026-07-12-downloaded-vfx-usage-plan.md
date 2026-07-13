# Downloaded VFX Assets — Usage Plan

> **Status:** all assets have been copied into `public/assets/effects/` and registered in `src/engine/effect-sprite-cache.ts`. Spells still need to be created for the water/wind/earth/plant elements; the sprites are ready.

Assets are in `~/Downloads/Spell Effects/` and fall into three packs:

1. **Pixelart Spells** by DevWizard (OpenGameArt, CC0) — 22 horizontal PNG strips, mostly 16×16 projectiles and orbs.
2. **Magic Pack 9** by ansimuz (itch.io, royalty-free) — 4 effect sets in individual frames + pre-built spritesheets.
3. **Foozle Pixel Magic Effects** (CC0) — 10 animation folders of numbered 64×64 frames, plus a big sheet and icons.

This document maps every usable asset to the spells/techniques in OnyxLabyrinth so the next integration step is clear.

---

## Asset inventory and how to use each

### Pixelart Spells (CC0)

All files are already horizontal PNG strips. Frame size = height; frame count = width / height.

| Asset | Dimensions | Frames | Frame size | What it looks like | Suggested use in game |
|-------|------------|--------|------------|--------------------|----------------------|
| `Arcane Bolt.png` | 96×16 | 6 | 16×16 | Purple arcane missile | Projectile for `mage-arcane-ward` or generic arcane spell |
| `Black And White Ray.png` | 128×16 | 8 | 16×16 | White/black ray (engine-tintable) | Tint gold for Guiding Bolt, blue for Magic Ray, red for a laser |
| `Black And White Sparks.png` | 96×16 | 6 | 16×16 | White sparkle strip (engine-tintable) | Tint green for heal sparkles, yellow for buff sparkles |
| `Bolt Of Purity.png` | 96×16 | 6 | 16×16 | White/gold holy bolt | Projectile for `priest-sacred-flame`, `priest-guiding-bolt`, `priest-divine-smite` |
| `Darkness Bolt.png` | 96×16 | 6 | 16×16 | Purple/black bolt | Recolor to green for `mage-poison-spray` projectile; or use for dark spells |
| `Darkness Orb.png` | 96×16 | 6 | 16×16 | Purple/black orb | Recolor to green for poison orb; or use for dark magic bursts |
| `Fireball.png` | 96×16 | 6 | 16×16 | Orange fireball with slight tail | Projectile for `mage-fire-bolt`, `mage-ember` |
| `Firebomb.png` | 96×16 | 6 | 16×16 | Expanding orange fire burst | Burst for `mage-fireball`, `mage-immolate`, or `mage-burning-hands` field |
| `Ice Lance.png` | 64×16 | 4 | 16×16 | Cyan ice shard | Projectile for `mage-frostbite`, `mage-cone-of-cold`, `mage-ice-storm` |
| `Light Bolt.png` | 96×16 | 6 | 16×16 | Blue/white lightning bolt | Projectile for `mage-spark`, `priest-guiding-bolt` |
| `Magic Orb.png` | 96×16 | 6 | 16×16 | Purple magic orb | Burst for `mage-arcane-ward`, or projectile for `mage-magic-missile`-style spells |
| `Magic Ray.png` | 128×16 | 8 | 16×16 | Purple magic ray/beam | Beam projectile for high-tier Mage spells |
| `Magic Sparks.png` | 96×16 | 6 | 16×16 | Small purple/white sparkle burst | Burst for heals, buffs, or status-clear spells; tintable |
| `Pixelart Shield.png` | 288×48 | 6 | 48×48 | Blue circular shield that forms and fades | Burst for `priest-shield-of-faith`, `priest-bless`, `mage-arcane-ward`, `mage-spell-shield` |
| `Plant Missle.png` | 96×16 | 6 | 16×16 | Green leaf/plant projectile | Incorporated as `px_plant_missle` — awaiting nature spell |
| `Pure Bolt 2.png` | 96×16 | 6 | 16×16 | White holy bolt variant | Alternative projectile for `priest-guiding-bolt`, `priest-divine-smite` |
| `Rock Sling.png` | 16×16 | 1 | 16×16 | Single rock chunk | Incorporated as `px_rock_sling` — awaiting earth spell |
| `Splash.png` | 192×32 | 6 | 32×32 | Water splash burst | Incorporated as `px_splash` — awaiting water spell |
| `Water Blast.png` | 96×16 | 6 | 16×16 | Water projectile | Incorporated as `px_water_blast` — awaiting water spell |
| `Water Bolt.png` | 96×16 | 6 | 16×16 | Water bolt | Incorporated as `px_water_bolt` — awaiting water spell |
| `Water Orb.png` | 96×16 | 6 | 16×16 | Water orb | Incorporated as `px_water_orb` — awaiting water spell |
| `Wind Bolt.png` | 96×16 | 6 | 16×16 | Wind slash | Incorporated as `px_wind_bolt` — awaiting wind spell |

### Magic Pack 9 (ansimuz, royalty-free)

Pre-built spritesheets are single horizontal rows. Individual-frame folders contain one extra frame each (the spritesheets drop the last frame). Use the **individual frames** if you want the full animation, or the **spritesheets** if you want a slightly shorter, already-sliced strip.

| Asset | Sheet size | Frames | Frame size | What it looks like | Suggested use in game |
|-------|------------|--------|------------|--------------------|----------------------|
| `spritesheets/Fire-bomb.png` | 896×64 | 14 | 64×64 | Full fire bomb: spark → charge → explosion → fade | Burst for `mage-fireball`, `mage-immolate`. Excellent upgrade over the generic `fire_explosion` |
| `sprites/FireBomb/*.png` (15 frames) | 64×64 each | 15 | 64×64 | Same animation, includes one extra frame at the end | Incorporated as `mp_fire_bomb_full` |
| `spritesheets/Lightning.png` | 640×128 | 10 | 64×128 | Lightning bolt descending from top + ground impact burst | Burst/field for `mage-spark`, `priest-guiding-bolt`, or `mage-power-word-stun` |
| `sprites/Lightning/*.png` (11 frames) | 64×128 each | 11 | 64×128 | Same, includes one extra frame | Incorporated as `mp_lightning_full` |
| `spritesheets/spark.png` | 224×32 | 7 | 32×32 | Small glowing spark projectile | Projectile for `mage-spark` or low-level lightning spells |
| `sprites/spark/*.png` (8 frames) | 32×32 each | 8 | 32×32 | Same, includes one extra frame | Incorporated as `mp_spark_full` |
| `spritesheets/Dark-Bolt.png` | 704×88 | 11 | 64×88 | Dark purple bolt with trailing energy | Recolor to green for `mage-poison-spray` projectile, or use for dark/arcane spells |
| `sprites/DarkBolt/*.png` (12 frames) | 64×88 each | 12 | 64×88 | Same, includes one extra frame | Incorporated as `mp_dark_bolt_full` |

### Foozle Pixel Magic Effects (CC0)

All animation folders contain numbered 64×64 frames. The big sheet `Spell/Pixel_Magic_Effects_Animations.png` is a 10×13 grid of 64×64 cells containing the same animations in order: Fire_Ball, Rocks, Water, Wind, Portal, Explosion, Molten_Spear, Earth_Spike, Water_Geyser, Tornado. Easiest to use the per-folder individual frames and concatenate them into horizontal strips.

| Folder | Frames | Frame size | What it looks like | Suggested use in game |
|--------|--------|------------|--------------------|----------------------|
| `Fire_Ball` | 10 | 64×64 | Classic fireball with a trailing tail | Projectile for `mage-fire-bolt`, `mage-ember`, or `mage-fireball` |
| `Explosion` | 7 | 64×64 | Circular fire/smoke explosion | Generic fire burst for `mage-fireball`, `mage-immolate`, or `mage-burning-hands` |
| `Portal` | 10 | 64×64 | Purple swirling magic portal | Cast-flash / burst for summon spells: `mage-lesser-summon`, `mage-summon-fire-elemental`, `mage-conjure-elemental`, `mage-gate`, `priest-summon-guardian`, `priest-summon-celestial-guardian`, `priest-summon-celestial` |
| `Molten_Spear` | 12 | 64×64 | Red/orange spear-like projectile | Alternative fire projectile for `mage-fire-bolt` or high-tier fire spells |
| `Rocks` | 10 | 64×64 | Rock chunks falling/launching | Incorporated as `fz_rocks` — awaiting earth spell |
| `Earth_Spike` | 9 | 64×64 | Earth spike erupting from ground | Incorporated as `fz_earth_spike` — awaiting earth spell |
| `Water` | 10 | 64×64 | Water blob/blast | Incorporated as `fz_water` — awaiting water spell |
| `Water_Geyser` | 13 | 64×64 | Water column erupting | Incorporated as `fz_water_geyser` — awaiting water spell |
| `Wind` | 10 | 64×64 | Wind slash/crescent | Incorporated as `fz_wind` — awaiting wind spell |
| `Tornado` | 9 | 64×64 | Tornado vortex | Incorporated as `fz_tornado` — awaiting wind spell |
| `Icons` | 10 | 32×32 | 32×32 spell icons | Incorporated as `fz_icons` — could be used for UI icons later |

---

## Recommended spell-by-spell mapping

### Damage spells

| Spell | Element | Target | Current effect | Recommended new asset | How to use it |
|-------|---------|--------|----------------|----------------------|---------------|
| `mage-ember` | fire | single | Generic fireball | `Fireball.png` (Pixelart) | projectile, scale 2.0 |
| `mage-fire-bolt` | fire | single | Generic fireball | `Fire_Ball` (Foozle) OR `Fireball.png` (Pixelart) | projectile, scale 1.5–2.0 |
| `mage-burning-hands` | fire | group | `large_fire` field | `Firebomb.png` (Pixelart) as field | field, scale 4.0 |
| `mage-fireball` | fire | all | Generic fireball/burst | `Fire-bomb.png` (Magic Pack 9) as burst | burst, scale 2.5 |
| `mage-immolate` | fire | single | Generic fireball | `Fire-bomb.png` (Magic Pack 9) as burst | burst, scale 2.0 |
| `mage-frostbite` | cold | single | `wizard_attack2` + `ice_burst_glow` | `Ice Lance.png` (Pixelart) | projectile, scale 2.0 |
| `mage-cone-of-cold` | cold | group | `ice_burst` field | `Ice Lance.png` (Pixelart) as field, or keep `ice_burst` | field, scale 4.0 |
| `mage-ice-storm` | cold | all | `ice_burst` field | `Ice Lance.png` (Pixelart) as field, or `Lightning.png` recolored | field, scale 5.0 |
| `mage-spark` | lightning | single | `lightning_blast` + `lightning_energy` | `spark.png` (Magic Pack 9) as projectile, `Lightning.png` (Magic Pack 9) as burst | projectile scale 1.5, burst scale 1.0 |
| `mage-poison-spray` | poison | single | Red lightning | `Darkness Bolt.png` (Pixelart) recolored green, OR `Dark-Bolt.png` (Magic Pack 9) recolored | projectile, scale 2.0 |
| `priest-sacred-flame` | undead | single | `red_energy` | `Bolt Of Purity.png` (Pixelart) | projectile, scale 2.0 |
| `priest-guiding-bolt` | lightning | single | `priest_attack` + `lightning_energy_glow` | `Light Bolt.png` (Pixelart) OR `Bolt Of Purity.png` | projectile, scale 2.0 |
| `priest-divine-smite` | divine | single | `priest_attack` + `lightning_energy_glow` | `Bolt Of Purity.png` (Pixelart) or `Pure Bolt 2.png` | projectile, scale 2.0 |
| `priest-sunburst` | undead | all | `red_energy` field | `Lightning.png` (Magic Pack 9) recolored gold/white, or `Firebomb.png` recolored | field, scale 3.0 |

### Heal / buff / cure spells

| Spell | Effect | Target | Current effect | Recommended new asset | How to use it |
|-------|--------|--------|----------------|----------------------|---------------|
| `priest-cure-wounds` | heal 12 | single | `priest_heal` | `Magic Sparks.png` (Pixelart) tinted green | burst, scale 3.0 |
| `priest-cure-serious` | heal 30 | single | `priest_heal` | `Magic Sparks.png` (Pixelart) tinted green + more particles | burst, scale 4.0 |
| `priest-cure-critical` | heal 60 | single | `priest_heal` | `Pixelart Shield.png` (Pixelart) tinted green + `Magic Sparks` | burst, scale 2.0 |
| `priest-heal` | heal 9999 | single | `priest_heal` | `Pixelart Shield.png` tinted bright gold + `Bolt Of Purity` particles | burst, scale 3.0 |
| `priest-mass-cure` | heal 15 | all | `priest_heal` field | `Magic Sparks.png` field, tinted green | field, scale 4.0 |
| `priest-mass-heal` | heal 30 | all | `priest_heal` field | `Pixelart Shield.png` field, tinted green | field, scale 3.0 |
| `priest-shield-of-faith` | buff | single | `lightning_energy` | `Pixelart Shield.png` (Pixelart) | burst, scale 2.0 |
| `priest-bless` | buff | all | `lightning_energy` field | `Pixelart Shield.png` field | field, scale 3.0 |
| `mage-arcane-ward` | buff | self | `lightning_energy` | `Pixelart Shield.png` (Pixelart) tinted blue | burst, scale 2.0 |
| `mage-spell-shield` | magicScreen | all | `lightning_energy` field | `Pixelart Shield.png` field, tinted blue | field, scale 3.0 |
| `priest-neutralize-poison` | cure poison | single | `priest_heal` | `Magic Sparks.png` tinted green (poison being drawn out) | burst, scale 3.0 |
| `priest-raise-dead` | resurrect | single | `priest_heal` | `Bolt Of Purity.png` (Pixelart) as burst from below + `Magic Sparks` | burst, scale 2.5 |

### Status / disable / special spells

| Spell | Effect | Target | Current effect | Recommended new asset | How to use it |
|-------|--------|--------|----------------|----------------------|---------------|
| `mage-sleep` | sleep | single | `ice_burst_glow` | `Magic Sparks.png` (Pixelart) tinted purple + custom Z-moon if drawn | burst, scale 2.0 |
| `mage-hold-person` | paralysis | single | `lightning_energy` | `Lightning.png` (Magic Pack 9) as a stun burst | burst, scale 1.0 |
| `mage-web` | paralysis | group | `red_energy` field | `Magic Sparks.png` field tinted white/gray (web-like) | field, scale 4.0 |
| `mage-power-word-stun` | paralysis | single | `lightning_energy` | `Lightning.png` (Magic Pack 9) as a shockwave burst | burst, scale 1.5 |
| `mage-silence` | fizzleField | group | `red_energy` field | `Darkness Orb.png` (Pixelart) field recolored purple, or `Magic Orb` | field, scale 4.0 |
| `mage-dispel-magic` | dispelMagic | all | `red_energy` field | `Magic Sparks.png` field tinted white/blue (dispelling) | field, scale 4.0 |

### Summon spells

| Spell | Effect | Current effect | Recommended new asset | How to use it |
|-------|--------|----------------|----------------------|---------------|
| `mage-lesser-summon` | summon | `lightning_energy` | `Portal` (Foozle) | burst, scale 1.5 |
| `mage-summon-fire-elemental` | summon | `lightning_energy` | `Portal` (Foozle) tinted orange | burst, scale 2.0 |
| `mage-conjure-elemental` | summon | `lightning_energy` field | `Portal` (Foozle) field | field, scale 3.0 |
| `mage-gate` | summon | `lightning_energy` | `Portal` (Foozle) | burst, scale 2.5 |
| `priest-summon-guardian` | summon | `lightning_energy` | `Portal` (Foozle) tinted gold | burst, scale 2.0 |
| `priest-summon-celestial-guardian` | summon | `lightning_energy` | `Portal` (Foozle) tinted gold/white | burst, scale 2.5 |
| `priest-summon-celestial` | summon | `lightning_energy` field | `Portal` (Foozle) field tinted gold | field, scale 3.0 |

### Unused (future expansion)

These assets don't map to any current spell but are worth keeping for future water/earth/wind/nature spells:

- Pixelart Spells: `Water Blast`, `Water Bolt`, `Water Orb`, `Splash`, `Wind Bolt`, `Plant Missle`, `Rock Sling`
- Foozle: `Rocks`, `Earth_Spike`, `Water`, `Water_Geyser`, `Wind`, `Tornado`

---

## Conversion notes

1. **Pixelart Spells** need only be copied and renamed. They are already horizontal strips.
2. **Magic Pack 9** spritesheets are already horizontal strips, but they are missing the last frame from each individual folder. Decide per-effect whether to use the sheet (faster) or the full individual frames (slightly longer animation).
3. **Foozle** individual frames must be concatenated into a single horizontal row. A shell/ImageMagick command for one folder:
   ```bash
   cd "Foozle_2DE0001_Pixel_Magic_Effects/Fire_Ball"
   convert +append 001.png 002.png 003.png 004.png 005.png 006.png 007.png 008.png 009.png 010.png ../../../OnyxLabyrinth/public/assets/effects/foozle-fireball.png
   ```
   Or use `montage` mode `concatenate` with `tile=1x`.
4. **No need to resize** the 64×64 effects for the engine; use `scale` in `EffectStyle` to fit the canvas. For example, a 64×64 fireball burst can be scaled to 2.0 (128×128) or kept at 1.0 depending on the spell tier.
5. **Tinting:** Some assets are already colored (Fireball, Ice Lance, Bolt Of Purity). Others are tintable (Black And White Ray, Black And White Sparks, Magic Sparks). Use the game's element colors when tinting:
   - Fire: `#ff8c42`
   - Cold: `#80e0ff`
   - Lightning: `#ffd769`
   - Poison: `#c080ff` / `#80ff80`
   - Divine/Holy: `#ffe8a0`
   - Heal: `#6fe06f`

---

## Suggested first-pass implementation order

1. **Fire family** — `Fireball.png` + `Firebomb.png` (Pixelart) + `Fire-bomb.png` (Magic Pack 9) + `Fire_Ball` (Foozle). This covers Ember, Fire Bolt, Burning Hands, Fireball, Immolate.
2. **Cold family** — `Ice Lance.png` (Pixelart). Covers Frostbite, Cone of Cold, Ice Storm.
3. **Lightning/Holy** — `Light Bolt.png` + `Bolt Of Purity.png` (Pixelart) + `Lightning.png` + `spark.png` (Magic Pack 9). Covers Spark, Guiding Bolt, Divine Smite, Sacred Flame, Sunburst.
4. **Buffs/Heals** — `Pixelart Shield.png` + `Magic Sparks.png` (Pixelart). Covers Shield of Faith, Bless, Arcane Ward, Spell Shield, all Cure/Heal spells, Raise Dead.
5. **Status/Summons** — `Lightning.png` for stuns, `Portal` (Foozle) for summons, `Darkness Bolt`/`Dark-Bolt` for poison/silence.

After this first pass, every spell in the game will have a unique or semi-unique visual instead of reusing the generic element fallbacks.

---

## Appendix — VFX Power & Feel Findings (added after the first pass)

The full analysis is in `VFX-FEEL-ANALYSIS.md` at the repo root. These are the practical findings that affect how the assets above should be wired and scaled.

### Implementation details that affect the top priority fixes

1. **Scene effects do not animate `scale` over time.** `SceneEffect` only stores a fixed `scale` and a duration (`drawEffectSprite`, lines 1756–1786). `t` is used only for alpha fade. If a charge glow should grow, `drawEffectSprite` or `SceneEffect` needs a scale interpolation.

2. **Projectile aura already doubles the visible size.** `drawEffectSprite` draws each projectile at its own scale and then a 2× semi-transparent additive copy behind it (lines 1775–1781). So a `projectileScale` of 1.5 already reads as ~3×. Keep 64×64 projectiles under 2.5× to avoid a distracting halo.

3. **Impact points are not affected by recoil.** `findActor` returns static slot positions (lines 347–388), while `ActorAnim` offsets are only applied at draw time. Burst, popup, and floor glow stay at the original slot position while the sprite shifts. Keep recoil under 10px to avoid disconnect.

4. **Floor glow is hidden by sprites if drawn pre-sprite.** `renderScene` order is background → enemies → allies → party → effects (lines 1968–2004). A pre-sprite glow only lights the ground around the target. To rim-light the target, add a second small glow after the actor with `globalCompositeOperation = "lighter"`.

5. **`impactSteps` is shared by every impact type.** It is used for melee, ranged, technique, and spell `spellEffect` events. Any recoil or flash tweak applies consistently across all damage types, but should be reduced or skipped for heals/buffs.

6. **`screenShake` is pure white noise, not directional.** It uses `Math.random()` per frame (lines 1962–1963). Raising the amount is the quick win; directional bias is more code for marginal benefit.

7. **`combat-scene.test.ts` does not assert on step count.** It checks popup timing, animation states, effect spawn, and death fade. Adding `startMove` calls or `scene.lightGlows` bookkeeping is safe as long as `createScene` initializes new fields.

8. **The banner is drawn on top of everything and has no fade.** `drawBanner` (lines 1928–1943) is called after effects, particles, and popups (line 2007). Moving it before `drawEffects` and adding `globalAlpha` fade-in/out lets the spell effect own the visual moment.

### Useful unused sprite strips for the feel fixes

- `mp_fire_bomb_full` (15 frames, 64×64) — longer explosion for high-tier fire (`mage-fireball`, `mage-immolate`).
- `fire_explosion_glow` (28×28, 12 frames) — warm, additive-ready fire for holy/divine spells (`priest-sunburst`, `priest-divine-smite`).
- `lightning_blast_glow` (54×18, 9 frames) — brighter lightning bolt alternative for `mage-spark` or `priest-guiding-bolt`.
- `px_magic_orb` and `px_magic_ray` (16×16, 6–8 frames) — slow orbs/rays for disable spells (`mage-sleep`, `mage-hold-person`, `mage-power-word-stun`).
- `zombie_explosion` (72×64, 4 frames) — sickly green impact for `mage-poison-spray`.

### Tier-based helpers are straightforward

`SpellDef` already exposes `tier: 1 | 2 | 3 | 4 | 5 | 6 | 7` (`src/data/spells.ts`, line 49). `resolveEffectStyle` is called with `spellId` at every cast, so a helper like `tierForSpell(spellId)` can drive `burstDurationFor`, `spellTierShake`, and `windupDurationFor` without touching game logic.

### One-line safe wins

- Change `showBanner(spellNameFor(...), CAST_MS + 900)` to `CAST_MS + 300` (line 1000) so the banner disappears before the impact burst peaks.
- Raise `addScreenShake` in `impactSteps` from `big ? 5 : 2.5` to `big ? 7 : 3.5` (line 469) and in spell damage from `3` to tier-scaled 3–6 (line 1071).
- Swap `mp_fire_bomb` for `mp_fire_bomb_full` in `mage-immolate` and `mage-fireball` overrides to differentiate tier-3/4 fire.

### Recommended priority order

1. **Target recoil (Point 5)** — largest single "feel" improvement; uses the existing `ActorAnim` tween machinery.
2. **Tier-scaled screen shake (Point 8)** — ~5 lines of code, huge perceptual payoff.
3. **Bigger, longer bursts for high-tier spells (Point 2)** — mostly `SPELL_OVERRIDES` tweaks.
4. **Dimmer, fading banner (Point 10)** — reduces UI stealing attention from the spell effect.
5. **Floor illumination at impact (Point 4)** — the one medium-effort change that makes spells feel like light sources in the world.

Defer the background/vignette issue (Point 3) until after the code-level changes are in place and evaluated.
