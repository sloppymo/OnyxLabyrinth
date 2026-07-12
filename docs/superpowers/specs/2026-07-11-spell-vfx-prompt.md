# Prompt: Create 16-bit Spell Effect Sprite Sheets for OnyxLabyrinth

## Context

OnyxLabyrinth is a Wizardry-style first-person dungeon crawler with an FF6-style combat screen. Spells are cast by party members (Mage and Priest classes) against enemies or allies. When a spell is cast, the combat engine plays a visual effect (VFX) animation on the combat canvas — a projectile traveling from caster to target, a burst explosion at the impact point, or a field effect lingering on the field.

The game already has a set of effect sprite strips, but many spells share the same generic effect (e.g., all fire spells use the same `fireball` projectile + `fire_explosion` burst). We want **unique, high-quality 16-bit style sprite sheets** for as many spells as possible, so each spell feels visually distinct.

## Technical Format

### Sprite Strip Convention

All effect sprites are **horizontal PNG strip sheets** — a single PNG file with frames laid out left-to-right in one row. The engine crops each frame by a fixed `frameWidth × frameHeight` and advances through them at a set `fps`.

**Example:** A 12-frame animation at 48×48 px per frame is a single PNG that is 576×48 pixels wide (12 × 48 = 576).

### File Location

All effect PNGs go in: `public/assets/effects/<name>.png`

### Registration

Each new effect must be registered in the `EFFECT_STRIPS` record in `src/engine/effect-sprite-cache.ts`. The entry specifies:

```typescript
{
  name: "effect_name",       // matches the filename (without .png)
  url: "effect_name.png",    // filename
  frameWidth: 48,            // px width of one frame
  frameHeight: 48,           // px height of one frame
  frameCount: 10,            // total frames in the strip
  fps: 12,                   // animation speed (12 fps is standard)
  loop: false,               // optional: true for looping animations (projectiles)
}
```

### Wiring into Combat

Effects are referenced by name in `src/engine/combat-scene.ts` via the `EffectStyle` system:

```typescript
interface EffectStyle {
  color: string;             // fallback procedural color (hex)
  projectile?: string;       // effect name for traveling projectile
  burst?: string;            // effect name for impact explosion
  field?: string;            // effect name for lingering field effect
  scale?: number;            // overall scale multiplier
  projectileScale?: number;  // projectile-specific scale
  burstScale?: number;       // burst-specific scale
  fieldScale?: number;       // field-specific scale
}
```

There are two lookup tables:
1. `ELEMENT_STYLES` — fallback per damage element (fire, cold, lightning, poison, undead, physical, divine)
2. `SPELL_OVERRIDES` — per-spell-id overrides that take priority

### Rendering Details

- **Canvas size:** 768 × 672 pixels
- **Rendering:** `imageSmoothingEnabled = false` (pixel-perfect, no smoothing)
- **Burst effects:** Play once, fade out via `globalAlpha = 1 - progress`, hold last frame
- **Projectile effects:** Loop continuously, rotate to face travel direction, no fade
- **Field effects:** Play once, partial fade (`globalAlpha = 1 - progress * 0.5`), hold last frame
- **Scaling:** Effects are drawn at `frameWidth × scale` pixels. Scale 1 = native size, scale 2.5 = 2.5×. Most bursts use scale 1.0–2.5.
- **Positioning:** Effects are centered on the target's screen position (enemy on left side, party on right side)

## Art Style Guidelines

- **16-bit/SNES era** aesthetic — think Final Fantasy VI, Chrono Trigger, Secret of Mana
- **Pixel art** with deliberate, visible pixels (no anti-aliasing, no gradients except dithered)
- **Limited palette per effect** — 4–8 colors plus alpha
- **Dark background compatibility** — effects must read well against dark backgrounds (the combat scene is dim/dark). Use bright cores, glowing outlines, and high-contrast rims.
- **Alpha channel** — PNG with transparency. Backgrounds must be fully transparent (alpha = 0). Use partial alpha for glow halos.
- **Dithering** is acceptable for gradient transitions (e.g., fire core → outer flame)
- **Frame count:** 8–14 frames per animation is ideal. Fewer = choppy, more = large files.
- **Frame size:** 48×48 for bursts/fields, 16×16 to 32×32 for projectiles, 100×100 for full-screen cast animations.

## Spells Needing Unique VFX

### Priority 1: Damage Spells (most visible, biggest impact)

These are the spells players cast most often. Each should have a unique projectile and/or burst.

#### Fire Spells

| Spell ID | Name | Element | Power | Target | Current Effect | Desired VFX |
|----------|------|---------|-------|--------|----------------|-------------|
| `mage-ember` | Ember | fire | 5 | singleEnemy | fireball + fire_explosion_glow | Small, weak ember — a tiny flickering spark that sputters toward the target and pops with a minimal puff of smoke. 16×16 projectile, 32×32 burst. |
| `mage-fire-bolt` | Fire Bolt | fire | 10 | singleEnemy | fireball + fire_explosion | A concentrated arrow-shaped bolt of flame with a trailing tail. 24×16 projectile (8 frames). Impact: a focused fire burst with a bright white-yellow core, orange mid, dark red edges. 48×48 burst (10 frames). |
| `mage-burning-hands` | Burning Hands | fire | 8 | groupEnemies | (no projectile, field only) | A spreading fan of flames washing over the enemy group. No projectile — field effect only. 96×48 field (10 frames), flames licking upward from the bottom. |
| `mage-fireball` | Fireball | fire | 14 | allEnemies | fireball + fire_explosion | A large rolling sphere of fire with internal turbulence. 32×32 projectile (12 frames, looping). Impact: massive explosion with shockwave ring, bright core, rising sparks. 64×64 burst (12 frames). |
| `mage-immolate` | Immolate | fire | 25 | singleEnemy | fireball + fire_explosion | A pillar of fire descending from above onto the target. No projectile — burst only. 48×72 burst (12 frames), flames converging from top to bottom then exploding outward. White-hot core. |

#### Cold Spells

| Spell ID | Name | Element | Power | Target | Current Effect | Desired VFX |
|----------|------|---------|-------|--------|----------------|-------------|
| `mage-frostbite` | Frostbite | cold | 5 | singleEnemy | wizard_attack2 + ice_burst_glow | A small shard of ice forming and shattering. 16×16 projectile (6 frames). Impact: ice crystal burst, blue-white shards radiating outward. 32×32 burst (8 frames). |
| `mage-cone-of-cold` | Cone of Cold | cold | 12 | groupEnemies | (field only) | A triangular cone of frost emanating from the caster side. 96×48 field (10 frames), frost particles and ice crystals spreading leftward. |
| `mage-ice-storm` | Ice Storm | cold | 16 | allEnemies | (field only) | Hailstones and ice shards raining down across the entire field. 128×64 field (12 frames), multiple ice particles falling at different speeds, white-blue palette. |

#### Lightning Spells

| Spell ID | Name | Element | Power | Target | Current Effect | Desired VFX |
|----------|------|---------|-------|--------|----------------|-------------|
| `mage-spark` | Spark | lightning | 5 | singleEnemy | lightning_blast + lightning_energy | A tiny zap — a short jagged lightning bolt. 32×16 projectile (5 frames). Impact: small electric pop with yellow sparks. 32×32 burst (6 frames). |
| `priest-guiding-bolt` | Guiding Bolt | lightning | 5 | singleEnemy | priest_attack + lightning_energy_glow | A bolt of golden-white divine light. 24×16 projectile (6 frames), straight beam with halo. Impact: radiant burst with cross-shaped light rays. 48×48 burst (8 frames), white-gold palette. |

#### Poison Spells

| Spell ID | Name | Element | Power | Target | Current Effect | Desired VFX |
|----------|------|---------|-------|--------|----------------|-------------|
| `mage-poison-spray` | Poison Spray | poison | 5 | singleEnemy | red_lightning_blast_glow + red_energy_glow | A spray of toxic green-purple droplets. 32×16 projectile (8 frames, looping). Impact: splashing poison burst with dripping droplets. 48×48 burst (10 frames), sickly green + purple. |

#### Undead/Holy Spells

| Spell ID | Name | Element | Power | Target | Current Effect | Desired VFX |
|----------|------|---------|-------|--------|----------------|-------------|
| `priest-sacred-flame` | Sacred Flame | undead | 8 | singleEnemy | (generic) | A holy flame — white-gold fire that burns with a blue-white core. 24×24 projectile (8 frames). Impact: cross-shaped holy explosion. 48×48 burst (10 frames), white-gold with blue undertones. |
| `priest-divine-smite` | Divine Smite | divine | 12 | singleEnemy | priest_attack + lightning_energy_glow | A hammer of light crashing down. No projectile — burst only. 48×72 burst (10 frames), light pillar from top, shockwave at bottom. Gold-white palette. |
| `priest-sunburst` | Sunburst | undead | 18 | allEnemies | (generic) | A blinding flash of sunlight expanding outward. 96×96 burst (8 frames), radial light rays from center, white-yellow-orange. Screen-filling. |

### Priority 2: Heal/Buff Spells

| Spell ID | Name | Effect | Target | Desired VFX |
|----------|------|--------|--------|-------------|
| `priest-cure-wounds` | Cure Wounds | heal 12 | singleAlly | Green sparkles converging on the target from below. 48×48 burst (8 frames), soft green-white, rising particles. |
| `priest-cure-serious` | Cure Serious | heal 30 | singleAlly | Brighter, larger version of cure — green-gold sparkles swirling upward. 48×48 burst (10 frames). |
| `priest-cure-critical` | Cure Critical | heal 60 | singleAlly | Column of healing light descending on the target. 48×72 burst (10 frames), green-white beam + sparkles. |
| `priest-heal` | Heal | heal 9999 | singleAlly | Massive divine healing — golden-green aurora enveloping the target. 64×96 burst (12 frames), radiant. |
| `priest-mass-cure` | Mass Cure | heal 15 | allAllies | Soft green sparkles across the entire party. 128×48 field (8 frames). |
| `priest-mass-heal` | Mass Heal | heal 30 | allAllies | Golden-green light pillars on all party members. 128×96 field (10 frames). |
| `priest-shield-of-faith` | Shield of Faith | buff armor | singleAlly | A shimmering golden hexagonal shield forming in front of the target. 48×48 burst (8 frames), fades to a lingering outline. |
| `priest-bless` | Bless | buff armor | allAllies | Golden light descending on all allies. 128×48 field (8 frames), soft radiance. |
| `mage-arcane-ward` | Arcane Ward | buff armor | self | Blue arcane runes circling the caster. 48×48 burst (10 frames), blue-purple, geometric patterns. |

### Priority 3: Status/Disable Spells

| Spell ID | Name | Effect | Target | Desired VFX |
|----------|------|--------|--------|-------------|
| `mage-sleep` | Sleep | disable sleep | singleEnemy | Soft purple-blue Z particles drifting down. 48×48 burst (10 frames), crescent moon motif. |
| `mage-hold-person` | Hold Person | disable paralysis | singleEnemy | Gray chains materializing around the target. 48×48 burst (8 frames), metallic gray. |
| `mage-web` | Web | disable paralysis | groupEnemies | White web strands spreading across the enemy group. 96×48 field (8 frames), white-gray. |
| `mage-power-word-stun` | Power Word: Stun | disable paralysis | singleEnemy | A shockwave of arcane energy — purple ring expanding from target. 48×48 burst (6 frames), purple-white. |
| `priest-neutralize-poison` | Neutralize Poison | cure poison | singleAlly | Green toxins being drawn out of the target, dissipating upward. 48×48 burst (8 frames), green-to-clear. |

### Priority 4: Special Spells

| Spell ID | Name | Effect | Target | Desired VFX |
|----------|------|--------|--------|-------------|
| `priest-raise-dead` | Raise Dead | resurrect | singleAlly | A column of golden light bringing the fallen ally back — particles rising from below, then a flash. 48×96 burst (12 frames), gold-white. |
| `mage-spell-shield` | Spell Shield | magicScreen 5 | allAllies | Blue shimmering barrier across all allies. 128×48 field (8 frames), translucent blue. |
| `mage-silence` | Silence | fizzleField 5 | groupEnemies | Purple suppression field descending on enemies. 96×48 field (8 frames), purple, muffling visual. |
| `mage-dispel-magic` | Dispel Magic | dispelMagic | allEnemies | White dispelling wave sweeping across the field. 128×48 field (6 frames), white-blue, shattering effect. |
| `priest-light` | Light | light 40 | self | (Dungeon-only, no combat VFX needed) |
| `mage-levitate` | Levitate | levitation 30 | self | (Dungeon-only, no combat VFX needed) |
| `mage-wayfinder` | Wayfinder | detect | self | (Dungeon-only, no combat VFX needed) |

### Priority 5: Summon Spells (cast animation only)

Summon spells already show the summoned ally sprite. The cast animation is the same as a generic cast. A unique cast flash for each summon tier would be nice but is optional:

| Spell ID | Name | Desired Cast VFX |
|----------|------|-------------------|
| `mage-lesser-summon` | Lesser Summon | Small blue arcane circle flash. 48×48 burst (6 frames). |
| `mage-summon-fire-elemental` | Summon Fire Elemental | Orange-red summoning circle with fire particles. 48×48 burst (8 frames). |
| `mage-conjure-elemental` | Conjure Elemental | Larger blue-purple arcane circle. 64×64 burst (10 frames). |
| `mage-gate` | Gate | Massive dark portal opening — swirling purple-black vortex. 64×64 burst (12 frames). |
| `priest-summon-guardian` | Summon Guardian | Golden summoning circle with holy runes. 48×48 burst (8 frames). |
| `priest-summon-celestial-guardian` | Summon Celestial Guardian | Bright golden-white summoning circle with feather particles. 64×64 burst (10 frames). |
| `priest-summon-celestial` | Summon Celestial | Radiant golden column of light. 48×96 burst (10 frames). |

## Deliverables

For each spell VFX you create, provide:

1. **The PNG sprite strip file** — named `<effect_name>.png`, placed in `public/assets/effects/`
2. **The EFFECT_STRIPS entry** — the TypeScript object literal to add to `src/engine/effect-sprite-cache.ts`
3. **The EffectStyle wiring** — the entry to add to `SPELL_OVERRIDES` (or `ELEMENT_STYLES`) in `src/engine/combat-scene.ts`

### Naming Convention

Name effects by spell: `<spell-id-without-class-prefix>-<type>` where type is `proj`, `burst`, or `field`.

Examples:
- `fire-bolt_proj.png` — Fire Bolt projectile
- `fire-bolt_burst.png` — Fire Bolt impact burst
- `burning-hands_field.png` — Burning Hands field effect
- `cure-wounds_burst.png` — Cure Wounds heal effect
- `raise-dead_burst.png` — Raise Dead resurrection effect

## Existing Effects (for reference, do not duplicate)

These effect sprites already exist and are wired up. New effects should be visually distinct from these:

**Projectiles:** `fireball` (16×16, 12f), `wizard_attack2` (100×100, 7f), `red_energy` (48×48, 9f), `lightning_blast` (54×18, 9f), `priest_attack` (100×100, 5f)

**Bursts:** `fire_explosion` (28×28, 12f), `ice_burst` (48×48, 8f), `lightning_energy` (48×48, 9f), `red_energy` (48×48, 9f), `zombie_explosion` (72×64, 4f), `priest_heal` (100×100, 4f)

**Fields:** `large_fire` (28×28, 12f), `lightning_energy_glow` (48×48, 9f), `red_energy_glow` (48×48, 9f)

## Color Palette Reference

The game uses these element-to-color mappings. Stay consistent:

| Element | Primary Color | Secondary | Glow |
|---------|--------------|-----------|------|
| Fire | `#ff8c42` (orange) | `#ffd769` (yellow) | `#ff4c00` (deep red) |
| Cold | `#80e0ff` (ice blue) | `#c0eeff` (white-blue) | `#4080ff` (deep blue) |
| Lightning | `#ffd769` (yellow-gold) | `#ffffff` (white) | `#ffec80` (pale gold) |
| Poison | `#c080ff` (purple) | `#80ff80` (toxic green) | `#604080` (dark purple) |
| Undead/Holy | `#c080ff` (purple) | `#ffe8a0` (pale gold) | `#ffffff` (white) |
| Divine | `#ffe8a0` (pale gold) | `#ffffff` (white) | `#ffd700` (gold) |
| Heal | `#6fe06f` (green) | `#a0ffa0` (pale green) | `#e0ffe0` (white-green) |
| Physical | `#f5f0e6` (bone white) | `#8a7a5a` (earthen) | — |

## Testing

After creating and wiring up new effects:

1. Run `npm run build` — must pass with zero TypeScript errors.
2. Run `npm test` — all tests must pass.
3. Start the dev server (`npm run dev`) and enter combat (use Arena mode for quick access).
4. Cast each spell and verify the VFX plays correctly: projectile travels from caster to target, burst appears at the right position, field covers the right area.
5. Verify effects are visible against the dark combat background.
6. Check that frame animation is smooth (no stuttering, no missing frames).

## Summary

Create unique 16-bit pixel art sprite strip PNGs for each spell's VFX. Register them in `EFFECT_STRIPS`, wire them into `SPELL_OVERRIDES`, and verify they render correctly in combat. Prioritize damage spells first (most frequently cast), then heals, then status effects, then special spells, then summons.
