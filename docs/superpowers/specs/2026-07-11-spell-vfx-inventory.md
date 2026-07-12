# Spell VFX Inventory — OnyxLabyrinth

This document inventories the current spell visual effects as of the melee-techniques update.

## How VFX are selected

The combat renderer in `src/engine/combat-scene.ts` resolves a visual style for each spell via `resolveEffectStyle(spellId, evt)`:

1. **Spell-specific override** (`SPELL_OVERRIDES`) — per-spell-id style
2. **Damage element fallback** (`ELEMENT_STYLES`) — fire, cold, lightning, poison, undead, physical, divine
3. **Effect-kind fallback** — heal, buff, cure/resurrect, disable, fizzleField/dispelMagic, summon
4. **Event fallback** — for items / unknown IDs

Effects are rendered as horizontal PNG sprite strips in `public/assets/effects/`. Each strip is registered in `src/engine/effect-sprite-cache.ts` with `frameWidth`, `frameHeight`, `frameCount`, and `fps`.

---

## Current sprite assets

| Filename | Dimensions | Frame size | Frames | Used for |
|----------|------------|------------|--------|----------|
| `arrow.png` | 32x32 | 32x32 | 1 | Physical projectile fallback |
| `arrow_archer.png` | 32x32 | 32x32 | 1 | Archer attacks |
| `arrow_skeleton.png` | 32x32 | 32x32 | 1 | Skeleton attacks |
| `fireball.png` | 192x16 | 16x16 | 12 | Fire element projectile |
| `fire_explosion.png` | 336x28 | 28x28 | 12 | Fire element burst |
| `fire_explosion_glow.png` | 336x28 | 28x28 | 12 | Ember spell burst |
| `fire_explosion_iso.png` | 336x28 | 28x28 | 12 | — (unused variant) |
| `fire_explosion_iso_glow.png` | 336x28 | 28x28 | 12 | — (unused variant) |
| `large_fire.png` | 112x84 | 28x28 | 12 | Fire field effect |
| `large_fire_glow.png` | 112x84 | 28x28 | 12 | — (unused variant) |
| `ice_burst.png` | 384x48 | 48x48 | 8 | Cold element burst |
| `ice_burst_glow.png` | 384x48 | 48x48 | 8 | Frostbite burst |
| `ice_burst_dark.png` | 384x48 | 48x48 | 8 | — (unused variant) |
| `ice_burst_grey.png` | 384x48 | 48x48 | 8 | — (unused variant) |
| `ice_burst_naked.png` | 384x48 | 48x48 | 8 | — (unused variant) |
| `ice_burst_transparent.png` | 384x48 | 48x48 | 8 | — (unused variant) |
| `lightning_blast.png` | 486x18 | 54x18 | 9 | Lightning element projectile |
| `lightning_blast_glow.png` | 486x18 | 54x18 | 9 | — (unused variant) |
| `red_lightning_blast.png` | 486x18 | 54x18 | 9 | Poison projectile |
| `red_lightning_blast_glow.png` | 486x18 | 54x18 | 9 | Poison Spray projectile |
| `lightning_energy.png` | 432x48 | 48x48 | 9 | Lightning/poison/undead burst, buffs, summons |
| `lightning_energy_glow.png` | 432x48 | 48x48 | 9 | Lightning field, Guiding Bolt / Divine Smite burst |
| `red_energy.png` | 432x48 | 48x48 | 9 | Undead/poison burst/field, fizzle/dispel |
| `red_energy_glow.png` | 432x48 | 48x48 | 9 | Poison Spray burst, poison status |
| `wizard_attack1.png` | 1000x100 | 100x100 | 10 | — (unused?) |
| `wizard_attack2.png` | 700x100 | 100x100 | 7 | Cold element projectile |
| `priest_attack.png` | 500x100 | 100x100 | 5 | Guiding Bolt / Divine Smite projectile |
| `priest_heal.png` | 400x100 | 100x100 | 4 | Heal, cure, resurrect burst |
| `slash_attack.png` | 50x126 | 50x126 | 1 | Melee slash effect |
| `staff_attack.png` | 32x64 | 32x64 | 1 | Staff melee effect |
| `zombie_explosion.png` | 288x64 | 72x64 | 4 | Physical damage burst |
| `zombie_death_explosion.png` | 288x64 | 72x64 | 4 | — (unused variant) |
| `elemental_v1.png` | 32x208 | 8x8 | 26 | Summoned ally / elemental idle? |
| `elemental_v2.png` | 32x208 | 8x8 | 26 | Summoned ally / elemental idle? |
| `extra_elemental.png` | 56x126 | 14x14 | 36 | Summoned ally / elemental idle? |
| `extra_elemental_glow.png` | 56x126 | 14x14 | 36 | Summoned ally / elemental idle? |

Total: **37** PNG files (including variants and unused assets).

---

## Current VFX wiring tables

### `ELEMENT_STYLES` (fallbacks)

| Element | Projectile | Burst | Field | Scale | Color |
|---------|------------|-------|-------|-------|-------|
| **fire** | `fireball` | `fire_explosion` | `large_fire` | 2.5 | `#ff8c42` |
| **cold** | `wizard_attack2` | `ice_burst` | — | 1.2 | `#80e0ff` |
| **physical** | — | `zombie_explosion` | — | 1.0 | `#f5f0e6` |
| **undead** | `red_energy` | `red_energy` | `red_energy` | 1.3 | `#c080ff` |
| **lightning** | `lightning_blast` | `lightning_energy` | `lightning_energy_glow` | 1.3 | `#ffd769` |
| **poison** | `red_energy` | `red_energy_glow` | `red_energy_glow` | 1.3 | `#c080ff` |
| **divine** | *falls through to ELEMENT_STYLES["divine"] which is missing* → generic fallback | | | | |

Note: `ELEMENT_STYLES` has no entry for `divine`. Divine spells rely on `SPELL_OVERRIDES` (currently only `priest-divine-smite`).

### `SPELL_OVERRIDES` (per-spell)

| Spell ID | Projectile | Burst | Field | Scale | Notes |
|----------|------------|-------|-------|-------|-------|
| `mage-ember` | `fireball` | `fire_explosion_glow` | `large_fire` | 2.5 | Same as fire element but glow burst |
| `mage-frostbite` | `wizard_attack2` | `ice_burst_glow` | — | 1.2 | Same as cold element but glow burst |
| `mage-poison-spray` | `red_lightning_blast_glow` | `red_energy_glow` | — | 1.3 | Uses red lightning projectile |
| `priest-guiding-bolt` | `priest_attack` | `lightning_energy_glow` | — | 1.0 / burstScale 1.3 | Holy light bolt |
| `priest-divine-smite` | `priest_attack` | `lightning_energy_glow` | — | 1.2 / burstScale 1.5 | Holy light hammer |

### `STATUS_STYLES` (disable effects)

| Status | Burst | Color |
|--------|-------|-------|
| sleep | `ice_burst_glow` | `#c080ff` |
| poison | `red_energy` | `#c080ff` |
| paralysis | `lightning_energy` | `#c8c4b8` |
| blind | `lightning_energy` | `#c8c4b8` |

---

## Spell-by-spell VFX status

### Mage spells (18)

| Spell | Tier | Target | Element / Effect | Current VFX | Status |
|-------|------|--------|------------------|-------------|--------|
| `mage-wayfinder` | 1 | self | detect (utility) | None (dungeon-only) | ✅ N/A |
| `mage-fire-bolt` | 1 | singleEnemy | fire damage 10 | `fireball` → `fire_explosion` | ⚠️ Generic fire set |
| `mage-arcane-ward` | 1 | self | buff armor | `lightning_energy` burst | ⚠️ Reuses lightning graphic |
| `mage-spark` | 1 | singleEnemy | lightning damage 5 | `lightning_blast` → `lightning_energy` | ⚠️ Generic lightning set |
| `mage-ember` | 1 | singleEnemy | fire damage 5 | `fireball` → `fire_explosion_glow` | ⚠️ Slightly differentiated glow only |
| `mage-frostbite` | 1 | singleEnemy | cold damage 5 | `wizard_attack2` → `ice_burst_glow` | ⚠️ Slightly differentiated glow only |
| `mage-poison-spray` | 1 | singleEnemy | poison damage 5 | `red_lightning_blast_glow` → `red_energy_glow` | ⚠️ Repurposed lightning/red energy |
| `mage-burning-hands` | 2 | groupEnemies | fire damage 8 | `large_fire` field | ⚠️ Generic fire field |
| `mage-sleep` | 2 | singleEnemy | disable sleep | `ice_burst_glow` burst | ⚠️ Repurposed ice for sleep |
| `mage-hold-person` | 2 | singleEnemy | disable paralysis | `lightning_energy` burst | ⚠️ Repurposed lightning |
| `mage-web` | 2 | groupEnemies | disable paralysis | `red_energy` field | ⚠️ Repurposed red energy |
| `mage-lesser-summon` | 2 | self | summon | `lightning_energy` cast flash | ⚠️ Generic |
| `mage-fireball` | 3 | allEnemies | fire damage 14 | `fireball` → `fire_explosion` + `large_fire` field | ⚠️ Same projectile/burst as Fire Bolt |
| `mage-cone-of-cold` | 3 | groupEnemies | cold damage 12 | `ice_burst` field | ⚠️ Generic cold field |
| `mage-summon-fire-elemental` | 3 | self | summon | `lightning_energy` cast flash | ⚠️ Generic |
| `mage-immolate` | 4 | singleEnemy | fire damage 25 | `fireball` → `fire_explosion` | ⚠️ Same as Fire Bolt |
| `mage-ice-storm` | 4 | allEnemies | cold damage 16 | `ice_burst` field | ⚠️ Generic cold field |
| `mage-levitate` | 4 | self | levitation (utility) | None (dungeon-only) | ✅ N/A |
| `mage-power-word-stun` | 4 | singleEnemy | disable paralysis | `lightning_energy` burst | ⚠️ Generic |
| `mage-spell-shield` | 5 | allAllies | magicScreen | `lightning_energy` field | ⚠️ Generic |
| `mage-silence` | 5 | groupEnemies | fizzleField | `red_energy` field | ⚠️ Generic |
| `mage-dispel-magic` | 5 | allEnemies | dispelMagic | `red_energy` field | ⚠️ Generic |
| `mage-conjure-elemental` | 5 | allAllies | summon | `lightning_energy` field | ⚠️ Generic |
| `mage-gate` | 5 | self | summon | `lightning_energy` cast flash | ⚠️ Generic |

### Priest spells (15)

| Spell | Tier | Target | Element / Effect | Current VFX | Status |
|-------|------|--------|------------------|-------------|--------|
| `priest-light` | 1 | self | light (utility) | None (dungeon-only) | ✅ N/A |
| `priest-cure-wounds` | 1 | singleAlly | heal 12 | `priest_heal` burst | ⚠️ Generic heal |
| `priest-sacred-flame` | 1 | singleEnemy | undead damage 8 | `red_energy` → `red_energy` | ⚠️ Looks like poison/undead generic |
| `priest-guiding-bolt` | 1 | singleEnemy | lightning damage 5 | `priest_attack` → `lightning_energy_glow` | ✅ Custom override |
| `priest-shield-of-faith` | 1 | singleAlly | buff armor | `lightning_energy` burst | ⚠️ Generic |
| `priest-cure-serious` | 2 | singleAlly | heal 30 | `priest_heal` burst | ⚠️ Same as Cure Wounds |
| `priest-neutralize-poison` | 2 | singleAlly | cure poison | `priest_heal` burst | ⚠️ Generic heal |
| `priest-mass-cure` | 2 | allAllies | heal 15 | `priest_heal` field | ⚠️ Generic heal field |
| `priest-divine-smite` | 2 | singleEnemy | divine damage 12 | `priest_attack` → `lightning_energy_glow` | ✅ Custom override |
| `priest-summon-guardian` | 2 | self | summon | `lightning_energy` cast flash | ⚠️ Generic |
| `priest-cure-critical` | 3 | singleAlly | heal 60 | `priest_heal` burst | ⚠️ Generic heal |
| `priest-bless` | 3 | allAllies | buff armor | `lightning_energy` field | ⚠️ Generic |
| `priest-mass-heal` | 3 | allAllies | heal 30 | `priest_heal` field | ⚠️ Generic heal field |
| `priest-raise-dead` | 4 | singleAlly | resurrect | `priest_heal` burst | ⚠️ Generic heal |
| `priest-sunburst` | 4 | allEnemies | undead damage 18 | `red_energy` field | ⚠️ Generic undead |
| `priest-summon-celestial-guardian` | 4 | self | summon | `lightning_energy` cast flash | ⚠️ Generic |
| `priest-summon-celestial` | 5 | allAllies | summon | `lightning_energy` field | ⚠️ Generic |
| `priest-heal` | 5 | singleAlly | heal 9999 | `priest_heal` burst | ⚠️ Generic heal |

---

## Summary: what is unique vs. generic/reused

### ✅ Custom / distinct (5 spells)

- `mage-ember` — glow variant of fire explosion
- `mage-frostbite` — glow variant of ice burst
- `mage-poison-spray` — red lightning projectile + glow
- `priest-guiding-bolt` — custom holy projectile + burst
- `priest-divine-smite` — custom holy projectile + larger burst

### ⚠️ Generic / heavily reused (27 spells + many utility effects)

- **Fire family reused by 5 spells**: `mage-fire-bolt`, `mage-ember`, `mage-burning-hands`, `mage-fireball`, `mage-immolate`
- **Cold family reused by 4 spells**: `mage-frostbite`, `mage-cone-of-cold`, `mage-ice-storm`
- **Lightning family reused by 4+ spells**: `mage-spark`, `priest-guiding-bolt`, `priest-divine-smite`, plus all buffs/screens/summons
- **Poison/undead red energy reused by 7+ spells**: `mage-poison-spray`, `priest-sacred-flame`, `priest-sunburst`, `mage-web`, `mage-silence`, `mage-dispel-magic`
- **Heal family reused by 8 spells**: all cure/heal/resurrect/mass spells share `priest_heal`
- **Status effects reused**: sleep uses ice, paralysis uses lightning, poison uses red energy

### 🔴 Missing / problematic

- **Divine element has no `ELEMENT_STYLES` entry** — only `priest-divine-smite` is covered by an override. Any future divine spell without an override will fall back to generic fire explosion.
- **No dedicated holy/smite VFX** — Guiding Bolt and Divine Smite repurpose priest_attack + lightning_energy_glow.
- **No dedicated web, sleep, or silence VFX** — all borrow from other elements.
- **No summon-specific cast visuals** — all summons use the generic lightning flash.
- **Burning Hands / Cone of Cold / Ice Storm need distinct field shapes** — currently they all look similar.

---

## Recommended priority for new VFX

Based on visibility (cast frequency + visual distinctness):

1. **Fire spells**: Give Ember, Fire Bolt, Burning Hands, Fireball, and Immolate distinct projectiles/bursts/fields.
2. **Cold spells**: Give Frostbite, Cone of Cold, and Ice Storm distinct visuals.
3. **Holy / divine spells**: Sacred Flame, Sunburst, Divine Smite, Guiding Bolt need golden-white holy effects.
4. **Heal spells**: Tiered heals (Cure Wounds → Heal) need escalating visuals; Raise Dead needs resurrection-specific VFX.
5. **Status spells**: Sleep, Hold Person, Web, Power Word: Stun, Silence need status-themed visuals.
6. **Summon spells**: Each summon tier should have a unique cast circle/portal effect.
7. **Buff / screen spells**: Arcane Ward, Shield of Faith, Bless, Spell Shield need protective-shield visuals.
8. **Poison / dispel**: Poison Spray, Dispel Magic, Silence need dedicated poison/dispel effects.
