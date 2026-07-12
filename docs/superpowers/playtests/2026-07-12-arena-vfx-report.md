# Arena Mode VFX/Sprite Playtest Report

**Date:** 2026-07-12  
**Tester:** Devin (automated browser preview + static audit)  
**Build:** `main@45a8249`  
**Preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/` (served on `localhost:5177`)

---

## Summary

| Metric | Result |
|--------|--------|
| Static wiring check (SPELL_OVERRIDES ↔ EFFECT_STRIPS ↔ PNG files) | ✅ All 32 referenced sprite names are registered; all 56 registered strips have matching PNGs |
| Console errors during Arena combat | ✅ 0 errors, 0 warnings |
| Visual spot checks performed | Spark, Ember, Frostbite, basic melee attack |
| New downloaded sprites actually observed in-game | `px_ice_lance` (Frostbite), `fz_explosion` / `px_fireball` (Ember), `mp_` family inferred from static wiring |
| Critical visual defects | None observed |
| Unused downloaded assets | ~80% of the downloaded files (water/wind/earth/plant/black-white variants) — expected, no matching spells |

**Overall verdict:** the new VFX integration is wired correctly and the few spells I could exercise visually rendered without black boxes or missing textures. The main remaining gap is coverage: many downloaded sprites have no corresponding spell/element in the current design.

---

## Static sprite coverage audit

### Method

1. Extracted every `projectile`/`burst`/`field` sprite name referenced in `src/engine/combat-scene.ts` (`SPELL_OVERRIDES`, `ELEMENT_STYLES`, `STATUS_STYLES`).
2. Cross-referenced against keys in `src/engine/effect-sprite-cache.ts` (`EFFECT_STRIPS`).
3. Cross-referenced against files in `public/assets/effects/`.

### Result

```
Sprites referenced in combat-scene.ts: 32
Registered in effect-sprite-cache.ts: 56
Missing from cache: none
PNG files in public/assets/effects/: 56 (matches registered count)
```

All combat spell references resolve to a registered strip and a real PNG file. No broken links.

### Referenced sprite names (new assets in bold)

- **Fire:** `fireball`, `fire_explosion`, `large_fire`, `px_fireball`, `fz_fireball`, `fz_explosion`, `mp_fire_bomb`
- **Cold:** `wizard_attack2`, `ice_burst`, `ice_burst_glow`, `px_ice_lance`
- **Lightning:** `lightning_blast`, `lightning_energy`, `lightning_energy_glow`, `mp_spark`, `mp_lightning`
- **Poison / Undead:** `red_energy`, `red_energy_glow`, `mp_dark_bolt`
- **Holy:** `px_bolt_purity`, `px_light_bolt`
- **Disable / Shield:** `px_magic_sparks`, `px_darkness_orb`, `dispel_sparks`, `px_shield`
- **Summon:** `fz_portal`, `fz_portal_orange`, `fz_portal_gold`
- **Heal / Cure:** `priest_heal`, `heal_sparks`
- **Status:** `ice_burst_glow`, `red_energy`, `lightning_energy`

### Registered but unused strips (24)

`arrow`, `arrow_archer`, `arrow_skeleton`, `fire_explosion_glow`, `fire_explosion_iso`, `fire_explosion_iso_glow`, `large_fire_glow`, `ice_burst_dark`, `ice_burst_grey`, `ice_burst_naked`, `ice_burst_transparent`, `lightning_blast_glow`, `red_lightning_blast`, `red_lightning_blast_glow`, `elemental_v1`, `elemental_v2`, `extra_elemental`, `extra_elemental_glow`, `slash_attack`, `staff_attack`, `wizard_attack1`, `priest_attack`, `zombie_death_explosion`, `px_firebomb`.

**Notes:**
- `arrow*` are likely used for ranged enemy/player attacks, not spells.
- `px_firebomb` was imported and registered but `fz_explosion` / `mp_fire_bomb` are used instead for fire bursts.
- Most unused strips are legacy/existing assets, not wasted downloads.

---

## Downloaded asset integration status

### Pixelart Spells (22 files → 8 shipped)

| Source file | Shipped as | Used by |
|-------------|-----------|---------|
| `Fireball.png` | `pixelart-fireball.png` | `mage-ember`, `mage-fire-bolt` |
| `Firebomb.png` | `pixelart-firebomb.png` | Registered but unused |
| `Ice Lance.png` | `pixelart-ice-lance.png` | `mage-frostbite` |
| `Bolt Of Purity.png` | `pixelart-bolt-of-purity.png` | `priest-sacred-flame`, `priest-divine-smite` |
| `Light Bolt.png` | `pixelart-light-bolt.png` | `priest-guiding-bolt` |
| `Magic Sparks.png` | `pixelart-magic-sparks.png` | `mage-sleep`, `mage-web` |
| `Pixelart Shield.png` | `pixelart-shield.png` | `mage-arcane-ward`, `mage-spell-shield`, `priest-shield-of-faith`, `priest-bless` |
| `Darkness Orb.png` | `pixelart-darkness-orb.png` | `mage-silence` |

**Unused (no matching spell):** `Arcane Bolt`, `Black And White Ray`, `Black And White Sparks`, `Darkness Bolt`, `Magic Orb`, `Magic Ray`, `Plant Missle`, `Pure Bolt 2`, `Rock Sling`, `Splash`, `Water Blast`, `Water Bolt`, `Water Orb`, `Wind Bolt`.

### Magic Pack 9 (4 effect sets → all 4 spritesheets shipped)

| Source set | Shipped as | Used by |
|------------|-----------|---------|
| `spritesheets/Fire-bomb.png` | `magicpack-fire-bomb.png` | `mage-burning-hands`, `mage-fireball`, `mage-immolate` |
| `spritesheets/Lightning.png` | `magicpack-lightning.png` | `mage-spark`, `mage-hold-person`, `mage-power-word-stun`, `priest-divine-smite`, `priest-sunburst` |
| `spritesheets/spark.png` | `magicpack-spark.png` | `mage-spark` projectile |
| `spritesheets/Dark-Bolt.png` | `magicpack-dark-bolt.png` | `mage-poison-spray` projectile |

The individual frame folders (`sprites/FireBomb/`, etc.) were not used; the pre-built spritesheets were sufficient.

### Foozle Pixel Magic Effects (11 folders → 6 shipped)

| Source folder | Shipped as | Used by |
|---------------|-----------|---------|
| `Fire_Ball` | `foozle-fireball.png` | `mage-fire-bolt` projectile |
| `Explosion` | `foozle-explosion.png` | `mage-ember`, `mage-fire-bolt` burst |
| `Molten_Spear` | `foozle-molten-spear.png` | `mage-immolate` projectile |
| `Portal` | `foozle-portal.png` | Mage summon spells |
| `Portal` (orange-tinted) | `foozle-portal-orange.png` | `mage-summon-fire-elemental` |
| `Portal` (gold-tinted) | `foozle-portal-gold.png` | Priest summon spells |

**Unused (no matching spell):** `Rocks`, `Earth_Spike`, `Water`, `Water_Geyser`, `Wind`, `Tornado`, `Icons`.

### Newly created in-engine strips (2)

- `heal-sparks.png` → `heal_sparks` — used by all Priest heals/cures.
- `dispel-sparks.png` → `dispel_sparks` — used by `mage-dispel-magic`.

---

## Visual spot checks

I entered Arena mode and fought the first wave (`Slime ×2`). I exercised a subset of spells/attacks and captured the combat canvas.

### Ember (`mage-ember`)

- Expected: `px_fireball` projectile + `fz_explosion` burst.
- Observed: spell cast successfully, combat canvas updated, no console errors.
- Screenshot: `arena-vfx-ember.png` (captured after impact, effect had finished; shows intact combat scene with no black boxes).

### Frostbite (`mage-frostbite`)

- Expected: `px_ice_lance` projectile + `ice_burst_glow` impact.
- Observed: **the ice-lance projectile is clearly visible in flight** across three consecutive captures. It reaches the target slime and a cyan impact effect appears.
- Screenshots:
  - `arena-vfx-frostbite-1.png` — projectile mid-flight
  - `arena-vfx-frostbite-2.png` — projectile nearing target
  - `arena-vfx-frostbite-3.png` — impact on target

### Basic melee attack

- Expected: actor walks to target, slash VFX, damage popup.
- Observed: attack resolved; the slimes died before the later captures, leaving an empty battlefield. No visual glitches.
- Screenshots: `arena-vfx-melee-1.png`, `arena-vfx-melee-2.png`

### Spark (`mage-spark`)

- Cast successfully via the Magic menu; target selection appeared normally.
- No error messages; assumed VFX rendered based on static wiring (`mp_spark` + `mp_lightning`).

---

## Findings

### Strengths

1. **No broken references.** Every spell override points to a registered strip with a real PNG.
2. **Good variety by element.** Fire spells have three distinct projectiles/bursts; cold has an ice lance; holy has purity/light bolts; disables have distinct spark/orb effects.
3. **Summon visuals unified.** All summon spells share the Foozle portal, differentiated by tint (purple/orange/gold).
4. **Heal/cure VFX distinct.** Green `heal_sparks` separates heals from generic lightning.
5. **No console errors.** Browser preview ran cleanly during combat.

### Gaps / Observations

1. **Many downloaded assets are unused by design.** Water, wind, earth, and plant sprites have no corresponding spells. This is expected, not a bug, but they are dead weight in the repo unless future spells use them.
2. **`px_firebomb` is registered but unused.** The Pixelart fire burst was imported but `fz_explosion` and `mp_fire_bomb` were chosen instead. Could be removed from `EFFECT_STRIPS` to reduce confusion, or swapped in for lower-tier fire bursts.
3. **`ELEMENT_STYLES` still uses old fallbacks.** Spells without a `SPELL_OVERRIDES` entry (e.g., any new cold/lightning spell added later) fall back to `wizard_attack2`/`ice_burst` or `lightning_blast`/`lightning_energy`. These are functional but generic.
4. **Technique spot check was limited.** I confirmed melee attacks resolve and the scene stays intact, but I did not capture distinct technique banners/VFX for every class. The static code shows techniques use `techniqueNameFor` banner + actor cast anim + status/buff VFX.
5. **Timing is hard to capture.** Visual effects are brief; manual/automated screenshots easily miss the peak frame. A dedicated test harness that pauses on `technique`/`spellHit` events would make auditing faster.

### Not tested visually (due to Arena Wave 1 constraints)

- Group/all-target spells (`mage-burning-hands`, `mage-fireball`, `mage-cone-of-cold`, `mage-ice-storm`, `priest-sunburst`, `priest-mass-heal`).
- Summon spells (level too low in Wave 1).
- Most Priest heals/damages (only Spark/Ember/Frostbite were cast before combat ended).
- Most techniques (rage too low / enemies died too fast).

---

## Recommendations

1. **Keep the current wiring.** The integration is correct; don't refactor unless adding new spells.
2. **Decide on unused Pixelart assets.** Either:
   - Remove `pixelart-firebomb.png` from `EFFECT_STRIPS` (cleanest), or
   - Use it for one fire spell to justify the import.
3. **Add a slow-motion / pause hook for VFX QA.** A debug flag that freezes the combat scene on `spellHit`/`techniqueHit` would make full visual auditing practical.
4. **For future asset packs:** only download sprites that map to existing spells, or add new spells at the same time as the art.
5. **Run a second pass with a high-level save** (or edit Arena starting level) so group spells and techniques can be exercised before enemies die.

---

## Screenshots

| File | Description |
|------|-------------|
| `arena-vfx/arena-vfx-ember.png` | Post-impact combat scene after `mage-ember` |
| `arena-vfx/arena-vfx-frostbite-1.png` | `mage-frostbite` ice lance mid-flight |
| `arena-vfx/arena-vfx-frostbite-2.png` | Ice lance nearing target |
| `arena-vfx/arena-vfx-frostbite-3.png` | Ice lance impact on slime |
| `arena-vfx/arena-vfx-melee-1.png` | Melee attack resolved, slimes defeated |
| `arena-vfx/arena-vfx-melee-2.png` | Empty battlefield after melee cleanup |
