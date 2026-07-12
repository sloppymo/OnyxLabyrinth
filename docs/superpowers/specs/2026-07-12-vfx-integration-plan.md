# Spell VFX Integration Plan — Downloaded Sprite Packs

**Date:** 2026-07-12
**Status:** IMPLEMENTED 2026-07-12. Assets imported via `scripts/import-spell-vfx.sh`, registry + `SPELL_OVERRIDES` wired, verified in Arena (see "Implementation status" at bottom).
**Scope:** Wire the three downloaded free sprite packs into OnyxLabyrinth's combat spell VFX. VFX wiring only (asset files + `effect-sprite-cache.ts` registry + `combat-scene.ts` mapping tables). **No game-logic changes** — no damage formulas, SP costs, targeting, or unlocks are touched.

This plan supersedes the scale/tint guidance in `2026-07-12-downloaded-vfx-usage-plan.md`. That doc's asset→spell intent is sound, but two of its technical assumptions are wrong against the actual engine (see the two boxed corrections below). Where they conflict, follow this plan.

---

## ⚠️ Two engine facts that override the earlier usage plan

### Correction 1 — The engine does NOT tint effect sprites

`drawEffectSprite()` (combat-scene.ts ~L1639) draws an effect strip with a bare `ctx.drawImage(...)`. It sets only `globalAlpha`; there is **no `globalCompositeOperation`**, no tint. Each effect is wrapped in its own `save()`/`restore()`, so nothing leaks in either.

`EffectStyle.color` reaches only three things: the **procedural fallback** shapes (used when the sprite is missing), the **sparkle particles** spawned alongside the burst, and the **damage/heal popup** text. **It never recolors the strip pixels.**

Consequence: every "tint gold/green/blue via the engine" instruction in the earlier usage plan is inert for the sprite itself. A sprite is drawn in its native colors, full stop. Recoloring an element must be **baked into the PNG with ImageMagick** — there is no runtime tint path.

We still set `color` per spell to the element color, because the accompanying sparkle particles and popup should match.

**The recolor rule (answers Q7/Q8):** bake an ImageMagick recolor **only when the asset's native color would read as the wrong element in this game's palette.** Otherwise keep native and share the asset. Applied to this game — where **poison is already purple** (`#c080ff`), holy/divine is gold, fire is orange, cold is cyan, lightning is gold — **no recolors are required for the first pass** (see §7). Every import is copy-rename or frame-concatenation.

### Correction 2 — Scales are native-relative, and field scale is doubled

`EffectStyle` scale is a multiplier on the **native frame size**, applied at draw time with nearest-neighbor. Two traps:

1. **Frame sizes are mixed.** Pixelart strips are **16×16**, Pixelart Shield is **48×48**, Foozle is **64×64**, Magic Pack 9 is **64×64 / 64×128 / 64×88 / 32×32**. The *same* `scale: 2.0` makes a Foozle burst 4× bigger on screen than a Pixelart burst. You cannot reuse one number across packs.
2. **Field scale is silently multiplied by 2.** Both field-push sites use `(fieldScale ?? scale ?? 1) * 2` (combat-scene.ts L1009 and L1031). Burst and projectile are **not** doubled. The earlier plan's field scales of 3.0–5.0 would render at 6–10× — full-screen.

**Therefore this plan expresses every effect as an on-screen pixel target and derives the scale from the native frame:**

```
projectile  target ≈ 45 px      scale        = 45  / nativeFrameW
burst       target ≈ 130 px     burstScale   = 130 / nativeFrameW
field       target ≈ 340 px     fieldScale   = 340 / (nativeFrameW * 2)   ← note the /2
```

Reference: party sprites draw at 210 px, enemies at 300 px, so a single-target burst around 120–140 px sits nicely on an enemy body. **All computed scales below are starting points to confirm in Arena, not gospel.** Round to one decimal.

### Correction 3 — Typos fail silently

An unknown effect name → `getEffectSprite()` returns `null` → the **procedural fallback** draws (a colored ring) with **no TypeScript error and no console error**. `npm run build` will pass with a misspelled `burst:` key. This makes per-spell **visual verification in Arena the only thing that catches a typo** (§6), and it must be treated as required, not optional.

---

## 1. Asset conversion checklist

Native frame counts were confirmed with `identify` on disk. Frame size = strip height for horizontal strips; frame count = width ÷ frame width. Destination for all files: `public/assets/effects/`. **None of the core-set assets need recoloring** (see §7).

### Core set — required for full coverage

| # | Source | Dest filename | Conversion | fW | fH | frames | fps | Recolor | License |
|---|--------|---------------|-----------|----|----|--------|-----|---------|---------|
| 1 | `Pixelart Spells/PNG Files/Fireball.png` | `pixelart-fireball.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 2 | `Pixelart Spells/PNG Files/Firebomb.png` | `pixelart-firebomb.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 3 | `Pixelart Spells/PNG Files/Ice Lance.png` | `pixelart-ice-lance.png` | copy | 16 | 16 | 4 | 12 | no | CC0 |
| 4 | `Pixelart Spells/PNG Files/Bolt Of Purity.png` | `pixelart-bolt-of-purity.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 5 | `Pixelart Spells/PNG Files/Light Bolt.png` | `pixelart-light-bolt.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 6 | `Pixelart Spells/PNG Files/Pixelart Shield.png` | `pixelart-shield.png` | copy | 48 | 48 | 6 | 12 | no | CC0 |
| 7 | `Pixelart Spells/PNG Files/Magic Sparks.png` | `pixelart-magic-sparks.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 8 | `Magic Pack 9 files/.../spritesheets/Fire-bomb.png` | `magicpack-fire-bomb.png` | copy | 64 | 64 | 14 | 14 | no | royalty-free |
| 9 | `Magic Pack 9 files/.../spritesheets/Lightning.png` | `magicpack-lightning.png` | copy | 64 | 128 | 10 | 14 | no | royalty-free |
| 10 | `Magic Pack 9 files/.../spritesheets/spark.png` | `magicpack-spark.png` | copy | 32 | 32 | 7 | 14 | no | royalty-free |
| 11 | `Magic Pack 9 files/.../spritesheets/Dark-Bolt.png` | `magicpack-dark-bolt.png` | copy | 64 | 88 | 11 | 14 | no | royalty-free |
| 12 | `Foozle.../Fire_Ball/*.png` (10) | `foozle-fireball.png` | `convert +append` | 64 | 64 | 10 | 12 | no | CC0 |
| 13 | `Foozle.../Explosion/*.png` (7) | `foozle-explosion.png` | `convert +append` | 64 | 64 | 7 | 12 | no | CC0 |
| 14 | `Foozle.../Portal/*.png` (10) | `foozle-portal.png` | `convert +append` | 64 | 64 | 10 | 12 | no | CC0 |

### Optional set — polish, not needed for coverage

| # | Source | Dest filename | Conversion | fW | fH | frames | fps | Recolor | License |
|---|--------|---------------|-----------|----|----|--------|-----|---------|---------|
| 15 | `Foozle.../Molten_Spear/*.png` (12) | `foozle-molten-spear.png` | `convert +append` | 64 | 64 | 12 | 12 | no | CC0 |
| 16 | `Pixelart Spells/PNG Files/Arcane Bolt.png` | `pixelart-arcane-bolt.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 17 | `Pixelart Spells/PNG Files/Darkness Orb.png` | `pixelart-darkness-orb.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |
| 18 | `Pixelart Spells/PNG Files/Magic Orb.png` | `pixelart-magic-orb.png` | copy | 16 | 16 | 6 | 12 | no | CC0 |

**Magic Pack 9 fps = 14** (not 12): the sheets have 14/10/11/7 frames and read as fast strikes; 14 fps keeps them ~0.7–1.0 s. Confirm in Arena and drop to 12 if they feel rushed.

**Note on the missing last frame:** Magic Pack 9 spritesheets drop the final frame present in their per-frame folders (14 vs 15, 10 vs 11, 7 vs 8, 11 vs 12). We use the **sheets** — they are already horizontal strips (copy-rename, zero concatenation) and the missing tail frame is a fade-out that is imperceptible at combat speed. Only Foozle requires `+append`.

**Skipped entirely** (no matching spell): Pixelart `Plant Missle`, `Rock Sling`, `Splash`, `Water Blast/Bolt/Orb`, `Wind Bolt`; Foozle `Rocks`, `Earth_Spike`, `Water`, `Water_Geyser`, `Wind`, `Tornado`, `Icons`. Left in `~/Downloads` for future water/earth/wind/nature spells (see §8).

**Total new files created in `public/assets/effects/`: 14 (core) — up to 18 with the optional set.** No existing asset is deleted or overwritten (all new names are prefixed `pixelart-`/`magicpack-`/`foozle-`).

---

## 2. Effect registry additions (`EFFECT_STRIPS` in `effect-sprite-cache.ts`)

Add these keys. **`frameCount` must exactly equal width ÷ `frameWidth`** or `effectFrame` indexes past the sheet — this bit the non-square Magic Pack strips (Lightning 64×**128**, Dark-Bolt 64×**88**). Verified divisible: 896/64=14, 640/64=10, 704/64=11, 224/32=7.

```ts
// --- Downloaded pack: Pixelart Spells (CC0) ---
px_fireball:      { name: "px_fireball",      url: "pixelart-fireball.png",       frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
px_firebomb:      { name: "px_firebomb",      url: "pixelart-firebomb.png",       frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
px_ice_lance:     { name: "px_ice_lance",     url: "pixelart-ice-lance.png",      frameWidth: 16, frameHeight: 16, frameCount: 4, fps: 12 },
px_bolt_purity:   { name: "px_bolt_purity",   url: "pixelart-bolt-of-purity.png", frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
px_light_bolt:    { name: "px_light_bolt",    url: "pixelart-light-bolt.png",     frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
px_shield:        { name: "px_shield",        url: "pixelart-shield.png",         frameWidth: 48, frameHeight: 48, frameCount: 6, fps: 12 },
px_magic_sparks:  { name: "px_magic_sparks",  url: "pixelart-magic-sparks.png",   frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },

// --- Downloaded pack: Magic Pack 9 (ansimuz, royalty-free) — NON-SQUARE frames ---
mp_fire_bomb:     { name: "mp_fire_bomb",     url: "magicpack-fire-bomb.png",     frameWidth: 64, frameHeight: 64,  frameCount: 14, fps: 14 },
mp_lightning:     { name: "mp_lightning",     url: "magicpack-lightning.png",     frameWidth: 64, frameHeight: 128, frameCount: 10, fps: 14 },
mp_spark:         { name: "mp_spark",         url: "magicpack-spark.png",         frameWidth: 32, frameHeight: 32,  frameCount: 7,  fps: 14 },
mp_dark_bolt:     { name: "mp_dark_bolt",     url: "magicpack-dark-bolt.png",     frameWidth: 64, frameHeight: 88,  frameCount: 11, fps: 14 },

// --- Downloaded pack: Foozle Pixel Magic Effects (CC0) ---
fz_fireball:      { name: "fz_fireball",      url: "foozle-fireball.png",         frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },
fz_explosion:     { name: "fz_explosion",     url: "foozle-explosion.png",        frameWidth: 64, frameHeight: 64, frameCount: 7,  fps: 12 },
fz_portal:        { name: "fz_portal",        url: "foozle-portal.png",           frameWidth: 64, frameHeight: 64, frameCount: 10, fps: 12 },

// Optional set:
// fz_molten_spear:  { ..., frameWidth: 64, frameHeight: 64, frameCount: 12, fps: 12 },
// px_arcane_bolt:   { ..., frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
// px_darkness_orb:  { ..., frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
// px_magic_orb:     { ..., frameWidth: 16, frameHeight: 16, frameCount: 6, fps: 12 },
```

The registry loads every entry via `loadEffectSprites()` at boot; adding keys costs one extra image fetch each, no code change beyond the object literal.

---

## 3. Spell VFX mapping (`SPELL_OVERRIDES` / fallbacks in `combat-scene.ts`)

Scales below are computed from §Correction-2's pixel targets and the native frame size, rounded to 0.1. **Confirm each in Arena.** `color` is set to the element/effect color so the sparkle particles and popup match, even though it does not tint the strip.

Recall the engine flow: single-enemy `damage` uses `projectile` (caster→target) then `burst` on impact; `groupEnemies`/`allEnemies`/`allAllies` push a `field` at the group centroid; `heal`/`buff`/`cure`/`summon` use `burst` (and `field` for all-target). `field` scale is halved here because the engine doubles it.

### Mage — damage

| Spell id | color | projectile (scale) | burst (scale) | field (scale) | Notes |
|----------|-------|--------------------|---------------|---------------|-------|
| `mage-ember` | `#ff8c42` | `px_fireball` (2.8) | `fz_explosion` (2.0) | — | 16px proj→~45px; 64px burst→~128px |
| `mage-fire-bolt` | `#ff8c42` | `fz_fireball` (0.7) | `fz_explosion` (2.0) | — | Foozle fireball proj differentiates it from Ember |
| `mage-burning-hands` | `#ff8c42` | — | `px_firebomb` (2.5) | `px_firebomb` (10.6) | group; field 340/(16·2) |
| `mage-fireball` | `#ff8c42` | — | `mp_fire_bomb` (2.0) | `mp_fire_bomb` (2.7) | all; the pack's best explosion |
| `mage-immolate` | `#ff8c42` | `px_fireball` (2.8) | `mp_fire_bomb` (2.0) | — | single big burst |
| `mage-frostbite` | `#80e0ff` | `px_ice_lance` (2.8) | `ice_burst_glow` (1.2)* | — | *existing asset, keep |
| `mage-cone-of-cold` | `#80e0ff` | — | `ice_burst` (1.2)* | `ice_burst` (2.5)* | group; existing cold field |
| `mage-ice-storm` | `#80e0ff` | — | `ice_burst_glow` (1.2)* | `ice_burst_glow` (2.5)* | all |
| `mage-spark` | `#ffd769` | `mp_spark` (1.4) | `mp_lightning` (2.0) | — | 32px proj→~45px; Lightning strike burst |
| `mage-poison-spray` | `#c080ff` | `mp_dark_bolt` (0.7) | `red_energy_glow` (1.3)* | — | native purple = this game's poison; no recolor |

### Priest — damage

| Spell id | color | projectile (scale) | burst (scale) | field (scale) | Notes |
|----------|-------|--------------------|---------------|---------------|-------|
| `priest-sacred-flame` | `#ffe8a0` | `px_bolt_purity` (2.8) | `lightning_energy_glow` (1.3)* | — | holy bolt vs undead |
| `priest-guiding-bolt` | `#7fb8f0` | `px_light_bolt` (2.8) | `lightning_energy_glow` (1.3)* | — | replaces `priest_attack` proj |
| `priest-divine-smite` | `#ffe8a0` | `px_bolt_purity` (2.8) | `mp_lightning` (2.0) | — | gold divine strike |
| `priest-sunburst` | `#ffe8a0` | — | `mp_lightning` (2.0) | `mp_lightning` (2.7) | all undead; gold light column |

### Mage / Priest — buff, shield, heal, cure

| Spell id | kind | color | burst (scale) | field (scale) | Notes |
|----------|------|-------|---------------|---------------|-------|
| `mage-arcane-ward` | buff self | `#7fb8f0` | `px_shield` (2.6) | — | 48px→~125px |
| `priest-shield-of-faith` | buff single | `#7fb8f0` | `px_shield` (2.6) | — | |
| `priest-bless` | buff all | `#7fb8f0` | `px_shield` (2.6) | `px_shield` (3.5) | field 340/(48·2) |
| `mage-spell-shield` | magicScreen all | `#7fb8f0` | `px_shield` (2.6) | `px_shield` (3.5) | |
| `priest-cure-wounds` | heal | `#6fe06f` | `priest_heal` (1.2)* | — | keep existing heal (no green asset yet) |
| `priest-cure-serious` | heal | `#6fe06f` | `priest_heal` (1.4)* | — | |
| `priest-cure-critical` | heal | `#6fe06f` | `priest_heal` (1.6)* | — | larger |
| `priest-heal` | heal full | `#6fe06f` | `priest_heal` (1.8)* | — | biggest single heal |
| `priest-mass-cure` | heal all | `#6fe06f` | `priest_heal` (1.2)* | `priest_heal` (1.5)* | |
| `priest-mass-heal` | heal all | `#6fe06f` | `priest_heal` (1.4)* | `priest_heal` (1.5)* | |
| `priest-neutralize-poison` | cure | `#6fe06f` | `priest_heal` (1.2)* | — | |
| `priest-raise-dead` | resurrect | `#6fe06f` | `priest_heal` (1.4)* | — | `revived` event hardcodes `priest_heal` — no override needed |

Heals intentionally stay on the existing `priest_heal` (it already reads as a heal; `px_magic_sparks` is native purple and would read as arcane). A baked green heal-sparkle is a §8 follow-up. Scale is the one thing changed, to make bigger heals visually bigger.

### Mage — status / disable / field

| Spell id | kind | color | burst (scale) | field (scale) | Notes |
|----------|------|-------|---------------|---------------|-------|
| `mage-sleep` | disable sleep | `#c080ff` | `px_magic_sparks` (2.6) | — | purple sleep shimmer |
| `mage-hold-person` | paralysis | `#c8c4b8` | `mp_lightning` (1.5) | — | stun jolt |
| `mage-web` | paralysis group | `#c8c4b8` | `px_magic_sparks` (2.0) | `px_magic_sparks` (8.0) | web shimmer field |
| `mage-power-word-stun` | paralysis | `#c8c4b8` | `mp_lightning` (1.8) | — | shockwave |
| `mage-silence` | fizzleField group | `#c080ff` | `px_magic_sparks` (2.0) | `px_magic_sparks` (8.0) | (or `px_darkness_orb` if imported) |
| `mage-dispel-magic` | dispelMagic all | `#7fb8f0` | `px_magic_sparks` (2.0) | `px_magic_sparks` (8.0) | dispel shimmer over enemy side |

### Summons (Mage + Priest) — all share the portal

| Spell id | color | burst (scale) | field (scale) | Notes |
|----------|-------|---------------|---------------|-------|
| `mage-lesser-summon` | `#c080ff` | `fz_portal` (1.5) | — | |
| `mage-summon-fire-elemental` | `#ff8c42` | `fz_portal` (2.0) | — | orange sparkle accent |
| `mage-conjure-elemental` | `#c080ff` | `fz_portal` (2.0) | `fz_portal` (2.0) | all-ally |
| `mage-gate` | `#c080ff` | `fz_portal` (2.5) | — | biggest portal |
| `priest-summon-guardian` | `#ffe8a0` | `fz_portal` (2.0) | — | gold sparkle accent |
| `priest-summon-celestial-guardian` | `#ffe8a0` | `fz_portal` (2.5) | — | |
| `priest-summon-celestial` | `#ffe8a0` | `fz_portal` (2.0) | `fz_portal` (2.0) | all-ally |

All summons deliberately **share `fz_portal`** (native purple reads as "a portal" for every summon; the sparkle `color` distinguishes fire/holy variants). See Q6.

### How this lands in code

- Add/replace entries in the `SPELL_OVERRIDES` map for every row above. Most rows become one `SPELL_OVERRIDES["..."] = {...}` literal with `color`, `projectile?`, `burst`, `field?`, and the per-stage `projectileScale`/`burstScale`/`fieldScale`.
- Rows marked `*` reuse existing assets; keep them exactly as-is if the current look is acceptable, or move them into overrides only for the scale change.
- `ELEMENT_STYLES` / `STATUS_STYLES` become pure fallbacks — reached only by enemy casts and items that have no per-spell override. **Leave them intact** (see §5); they are still the safety net when a spell id is absent.

---

## 4. Implementation order (independently testable phases)

Each phase = copy/convert its assets → register keys → add overrides → `npm run build` → Arena-verify that phase's spells → commit.

| Phase | Assets | Spells covered | Verify by casting |
|-------|--------|----------------|-------------------|
| **0. Scaffolding** | none | none | Add the registry keys with placeholder-free `frameCount`; `npm run build` passes. Copy the 14 core files first so nothing 404s. |
| **1. Fire** | px_fireball, px_firebomb, mp_fire_bomb, fz_fireball, fz_explosion | Ember, Fire Bolt, Burning Hands, Fireball, Immolate | all 5 fire spells |
| **2. Cold** | px_ice_lance (+ existing ice assets) | Frostbite, Cone of Cold, Ice Storm | 3 cold spells |
| **3. Lightning / Holy / Divine** | mp_spark, mp_lightning, px_light_bolt, px_bolt_purity | Spark, Guiding Bolt, Sacred Flame, Divine Smite, Sunburst | 5 spells + poison-spray proj (mp_dark_bolt) |
| **4. Buffs / Shields / Heals** | px_shield (heals reuse priest_heal) | Arcane Ward, Shield of Faith, Bless, Spell Shield, all Cure/Heal/Mass, Raise Dead | shields on allies; heals for scale check |
| **5. Status / Summons** | px_magic_sparks, fz_portal | Sleep, Hold Person, Web, Power Word: Stun, Silence, Dispel, all 7 summons | each status + each summon |

Phases 1–5 are order-independent except that Phase 0 (registry + files on disk) must land first. Poison-spray's `mp_dark_bolt` rides along in Phase 3.

---

## 5. Which fallbacks can be retired

**None should be deleted.** `ELEMENT_STYLES` and `STATUS_STYLES` are still hit by:
- enemy spellcasters (their casts carry damage/element but no player-spell override),
- consumable items resolved through `resolveEffectStyle`'s `evt`-based fallback branch,
- any spell id typo (the silent-fallback path — Correction 3).

Once every player combat spell has an override, those maps stop firing **for player spells** but remain the safety net for the three cases above. Retire nothing; just stop relying on them for player VFX. The five existing `SPELL_OVERRIDES` (`mage-ember`, `mage-frostbite`, `mage-poison-spray`, `priest-guiding-bolt`, `priest-divine-smite`) are **replaced in place** by the richer rows in §3.

---

## 6. Verification steps (required, not optional)

Because a misspelled effect key fails silently to the procedural ring (Correction 3), **casting each spell in Arena is the only real test.**

1. **Build gate:** `npm run build` — zero TS errors. This catches nothing about VFX correctness, only type/syntax.
2. **Serve the build:** `npx vite preview --port 5176 --base /OnyxLabyrinth/` (or `npm run dev`).
3. **Enter Arena mode** from the title screen (Arena is the repeatable-combat testing mode; `arena-ui.ts`). Build a party with a Mage and a Priest so every spell is castable; pick a high level so all tiers are unlocked.
4. **Cast every spell in §3, one per phase.** For each, check:
   - the **strip animates** (not a static frame or the procedural ring — a ring = wrong/misspelled key or a 404 filename),
   - **size** looks right (≈45 px projectile, ≈130 px burst, ≈340 px field). Oversized/tiny → adjust the scale;
   - **frames are aligned** — jitter, doubled sprites, or a sliver of the next frame means `frameWidth`/`frameCount` is wrong in the registry (re-check width÷frameWidth is exact);
   - the **sparkle color** matches the element (that's `color` doing its job).
5. **404 check:** open DevTools → Network, filter `assets/effects`, confirm no red entries. A 404 = filename mismatch between the copied PNG and the registry `url`.
6. Optionally record the pass with the GIF tool for review.

---

## 7. Risk / fallback notes

- **Recoloring: none needed for the first pass.** Applying the rule "bake only when native reads as the wrong element" to this game's palette: fire=orange, cold=cyan, lightning=gold, holy/divine=gold, and crucially **poison=purple** — every downloaded asset's native color already matches its target element. `mp_dark_bolt`/Darkness assets are purple, which *is* this game's poison color, so no green bake. This is the whole reason the file count stays at copy-rename + concat.
- **Non-square Magic Pack strips** (Lightning 64×128, Dark-Bolt 64×88) are the most likely to render misaligned if `frameHeight` is set to 64 out of habit. Double-check those two rows in the registry.
- **Lightning is a top-down column**, not a horizontal bolt. As a `burst` it plays in place on the target (good for a strike). As a `projectile` it would look wrong (it doesn't travel horizontally) — never assign `mp_lightning` to `projectile`.
- **Pixelart 16px assets scaled ~2.8×** are only ~45 px; at higher `burstScale` (Shield at 48px is fine, but a 16px strip pushed past ~3× on a field) they get soft/blocky. Nearest-neighbor keeps them crisp but chunky; if `px_magic_sparks` fields look too coarse at 8×, fall back to the existing `red_energy`/`lightning_energy` field for that spell.
- **Water / wind / earth / nature have no spells** — those assets (both packs) stay unused. No fallback needed; they're future stock.
- **Heals** keep `priest_heal` because no green-tinted asset exists without a bake; only their scale changes. If that reads as too samey, the §8 green-sparkle bake is the fix.
- **fps 14 for Magic Pack** is a guess from frame count; if any of the four feels rushed or sluggish, adjust that one key's `fps` — it's isolated.

---

## 8. Optional follow-ups

- **Archive unused assets:** leave them in `~/Downloads/Spell Effects/` (per the constraint to keep sources there). If they clutter, move the skipped water/wind/earth folders into a `~/Downloads/Spell Effects/_unused-for-now/` subfolder — do **not** copy them into the repo until a matching spell exists.
- **Icons → UI:** Foozle `Icons/` (10× 32×32) and `Pixel_Magic_Effects_Icons.png` could become spell-menu icons in `combat-select-action-view.ts` later. Out of scope here (not a combat-scene VFX concern).
- **Baked recolor variants** (each is one ImageMagick `-modulate`/`-fill ... -colorize` or channel remap, per §Correction-1):
  - `heal-sparks.png` — green `Magic Sparks` for a distinct heal shimmer instead of reusing `priest_heal`.
  - `divine-portal.png` — gold `Portal` so priest summons differ from mage summons at a glance (currently only the sparkle color differs).
  - `fire-portal.png` — orange `Portal` for Summon Fire Elemental.
  - Only worth it if the shared-asset look reads as too repetitive in playtest.
- **Molten Spear** (optional file 15) as the Immolate projectile would give the top fire single-target its own projectile instead of reusing `px_fireball`.

---

## Answers to the nine required questions

1. **Pixelart PNGs:** imported+renamed = Fireball, Firebomb, Ice Lance, Bolt Of Purity, Light Bolt, Pixelart Shield, Magic Sparks (7 core); optional = Arcane Bolt, Darkness Orb, Magic Orb. Skipped = Pure Bolt 2 (Bolt Of Purity covers it), Plant Missle, Rock Sling, Splash, all Water*, Wind Bolt, Magic Ray, Black And White Ray/Sparks (grayscale — useless without a bake, and no bake is needed).
2. **Magic Pack 9 sheets vs frames:** use the **spritesheets** — already horizontal strips (zero concatenation), and the dropped final frame is an imperceptible fade tail at combat speed. Individual frames would only add one frame at the cost of a `+append` step.
3. **Foozle folders converted:** Fire_Ball, Explosion, Portal (core); Molten_Spear (optional). Skipped: Rocks, Earth_Spike, Water, Water_Geyser, Wind, Tornado, Icons — no matching spell.
4. **Per-spell mapping:** §3, full tables with projectile/burst/field/color and native-relative scales.
5. **Retire from fallbacks:** none deleted — `ELEMENT_STYLES`/`STATUS_STYLES` remain the safety net for enemy casts, items, and typo protection (§5). The 5 old `SPELL_OVERRIDES` are replaced in place.
6. **Intentional shared assets:** all 7 summons share `fz_portal`; all fire single-targets share `fz_explosion` burst; all shields/buffs share `px_shield`; all heals share `priest_heal`. Consistency by school is deliberate (Q6/§3).
7. **Recoloring:** **none via engine (it can't tint) and none via ImageMagick for the first pass** — native colors already match this game's palette (poison=purple). Optional bakes listed in §8.
8. **New files created:** **14 core** (7 Pixelart + 4 Magic Pack + 3 Foozle), up to **18** with the optional set. Zero overwrites.
9. **Build/test sequence:** copy 14 files → add 14 registry keys → add/replace `SPELL_OVERRIDES` per phase → `npm run build` (zero errors) → `npm test` → `npx vite preview` → Arena-cast every spell in §3 checking animation/size/alignment/404 (§6). Repeat per phase.

---

## Implementation status (2026-07-12)

**Done:** 20 effect files generated into `public/assets/effects/` by `scripts/import-spell-vfx.sh` (14 core copies/concats + 2 optional Pixelart + 4 baked recolors). All keys registered in `effect-sprite-cache.ts`; full `SPELL_OVERRIDES` map wired in `combat-scene.ts`. `npx vite build` (esbuild) succeeds; VFX changes add zero new type errors.

**Recolors — corrected method:** hue-rotation (`-modulate`) muddied the portal's mixed purples (gold→pink, orange→olive, heal→blue, dispel→green). Switched to duotone (`-alpha off -colorspace Gray +level-colors dark,light`) then copy the original alpha back with `-compose CopyOpacity` (level-colors fogs transparent regions otherwise). Verified via contact sheet: gold/orange portals, green heal sparks, cyan dispel sparks all read correctly with clean alpha (alpha-mean matches source exactly).

**Verified in Arena (Level 1, tier-1 only):** Spark (mp_spark proj → mp_lightning burst), Guiding Bolt (px_light_bolt proj → lightning_energy_glow burst), Ember (px_fireball proj → fz_explosion burst). All render at correct size, no 404s, no procedural-ring fallback.

**Wired but NOT verified in-context:** every field-scale spell (all tier 2+), the three portals, and the cyan dispel. Level 1 Arena cannot cast them. Assets themselves are verified via contact sheet; the field ×2 engine multiplier is handled mathematically (fieldScale pre-halved) but not eyeballed on-screen. Re-verify these after leveling a party to tier 2–5.

**Build/combat state (resolved):** during this work the tree briefly failed to build and combat crashed on entry. Root cause was NOT the Rage/Technique feature and NOT the VFX changes — seven unrelated source files (`combat.ts`, `features.ts`, `features.test.ts`, `save.ts`, `main.ts`, `styles.css`, `types/index.ts`) had been accidentally reverted in the working tree to an earlier state, stripping the `rage` field, technique types, the arena `justOpenedArena` guard, and the spell-detail styles. Restoring those files to HEAD (`git checkout HEAD -- …`) fixed everything: `npm run build` passes with zero errors, all 477 vitest tests pass, and combat renders correctly (the rage column displays) with no defensive guard needed. HEAD (`d7b4bdb`) itself was never broken.
