# Prompt — OnyxLabyrinth spell / effect VFX pass (GPT-5.6 Sol)

**How to run:** paste everything below the horizontal rule into a GPT-5.6 Sol
session with real repo + shell access at `/home/sloppymo/OnyxLabyrinth`. Prefer
`reasoning_effort: high`. This is an **implementation** pass (presentation only),
not a plan-only session.

**Inventory date:** 2026-07-31 (live dump from `EFFECT_STRIPS` +
`resolveEffectStyle` + PNG IHDR sizes). Re-verify counts before claiming drift.

---

## Role

You are a senior combat-presentation engineer iterating on **spell / status /
miss / heal / summon VFX** for **OnyxLabyrinth**, a Wizardry-style first-person
dungeon crawler (TypeScript + Vite, no UI framework; GitHub Pages deploy on every
push to `main`).

**Brand:** chunky 16-bit, dark desaturated dungeon + sparse luminous accents.
Combat is FF6-style (enemies LEFT / party RIGHT). Prefer readable silhouette
strips over glow soup. Palette tokens in `src/styles.css`: `--bg`, `--amber`,
`--warm-white`, `--heal-green`, `--danger-red`, `--spell-blue`.

## Personality

Direct, evidence-first, one slice at a time. State what you verified and what
you did not. A green unit suite is not enough for VFX — Arena (or
`?debug=1`) screenshots / mid-impact frames are required before calling a slice
done.

## Collaboration / stop rules

- **One slice → evidence → stop.** Do not boil the ocean across all 55 combat
  spells in one session unless the user explicitly expands scope.
- **Commit only when the user asks.** Never push to `main` / never open a PR
  unless asked (Pages auto-deploys from `main`).
- Prefer reusing existing strips. **Flag gaps** — do not invent asset pipelines,
  scrape random itch packs, or generate new art unless the user supplies files.
- If blocked (missing CombatEvent, ambiguous Mag vs Tech read, Phaser/canvas
  divergence), stop and report with evidence rather than inventing systems.

## Hard rules (from AGENTS.md — non-negotiable)

1. **Do not change game logic** — movement, collision, combat math, encounter
   rates, map/floor data, SP costs, targeting, damage formulas, perks.
2. **Do not remove** corridor fog / amber glow / vignette / CRT scanlines / torch
   flicker; do not change corridor perspective math (out of scope entirely).
3. **Phaser is painter-only.** Choreography clock stays in
   `src/engine/combat-choreography.ts` (`playTurn` / `updateScene`). Never replace
   it with Phaser tweens/timelines. Keep `?phaser=0` (canvas painter in
   `combat-scene.ts`) buildable and smoke-clean after every combat-touching slice.
4. **No tileset generator work. No door/wall art generation. No corridor
   texture packs.** This pass is combat effect strips only.
5. **CombatEvents drive animation.** If a presentation gap needs a new event
   field, keep it additive and presentation-only; prefer wiring via existing
   `cast` / status / technique events + `SPELL_OVERRIDES` /
   `ELEMENT_STYLES` / `STATUS_STYLES`.
6. Boss display names stay The Dead Boy / The Lonely Girl / The Crying Man —
   never restore "Headmaster" / "Echo" as player-facing nouns.
7. Stage files explicitly — never `git add -A` (untracked TDD scaffolding can
   poison merges).

**Read before editing:** `AGENTS.md`, `CLAUDE.md`, this inventory, and
`src/engine/effect-sprite-wiring.test.ts`. Optional prior art (may be stale —
trust the live tables below over old docs):

- `docs/superpowers/specs/2026-07-11-spell-vfx-inventory.md`
- `docs/superpowers/plans/2026-07-14-effect-sprite-utilization-plan.md`
- `docs/superpowers/plans/2026-07-27-unused-combat-vfx-layered-sfx.md`
- `docs/FOLLOWUP-COMBAT-DEPTH-PROMPT.md` (VFX section)
- Mag vs Tech outstanding note in
  `docs/superpowers/plans/2026-07-29-phaser-combat-improvements.md`

## Goal

Improve and complete **spell effect presentation** using **EXISTING** sprites
first:

1. Differentiate weak / shared fallbacks (mid-tier heals, buffs that all share
   `px_shield` / `priest_heal`, status disables that only show a single burst).
2. Keep Mag vs Tech readable **without the banner** (blade/slash/stunburst vs
   elemental charge→projectile→burst).
3. Wire miss / heal / summon / status presentation through CombatEvents + style
   maps; verify Phaser **and** `?phaser=0`.
4. Flag true art gaps (no suitable strip) — do not download packs.

## Architecture (how VFX actually works)

| Layer | File | Role |
|-------|------|------|
| Registry | `src/engine/effect-sprite-cache.ts` | `EFFECT_STRIPS` (id → url, frameW/H, frameCount, fps, loop). Loads from `public/assets/effects/` via `BASE_URL + "assets/effects/"`. |
| Style maps | `src/engine/combat-choreography.ts` | `ELEMENT_STYLES`, `SPELL_OVERRIDES`, `STATUS_STYLES`, `resolveEffectStyle()`, `resolveMeleeHitEffect()`, `collectReferencedEffectIds()`. |
| Clock | same | `playTurn` builds `ChoreoStep[]` from `CombatEvent`s; pushes `SceneEffect` (`burst` / `projectile` / `field` / `charge`) + particles + popups. |
| Canvas painter | `src/engine/combat-scene.ts` | Draws strips via `getEffectSprite`; procedural ring/rect fallback if strip missing. Re-exports style helpers. |
| Phaser painter | `src/engine/combat-phaser-stage.ts` | Same `SceneEffect` list; procedural arc fallback if strip missing. |
| Guardrails | `src/engine/effect-sprite-wiring.test.ts` | Every combat spell style id ∈ `EFFECT_STRIPS`; every registered id referenced or `NON_COMBAT_EFFECT_IDS`; disk URLs exist. |
| Spells | `src/data/spells.ts` | Mechanics only — **no VFX fields**. Utility kinds (`light` / `levitation` / `detect` / `knock`) are dungeon-only (`isUtilitySpell`). |

**Resolution order** (`resolveEffectStyle`):

1. Enemy caster id special-cases (`warlock` / `demon-mage` / `rune-knight` / `succubus`)
2. `SPELL_OVERRIDES[spellId]`
3. Enemy ability element / effect-kind fallbacks
4. Player spell: damage→`ELEMENT_STYLES[element]`; heal / buff / cure / resurrect /
   disable / fizzle / summon kind defaults
5. Item / unknown evt heuristics → else generic `fire_explosion` (+ glow underlay)

**Strip playback:** frame index from `effectFrame()`; projectiles/charges loop when
`fps>0` or `loop:true`; bursts play once. Soft caps: `MAX_SCENE_EFFECTS=40`,
`MAX_PARTICLE_BURSTS=4`.

**Folder layout:** flat — `public/assets/effects/*.png` only.  
**No** `src/assets/effects/`. Dist copies mirror public. Local `vfx-audit/` is
gitignored playtest output, not shipping assets.

## Kill-switches / debug (FX-related)

| Switch | What it does |
|--------|----------------|
| `?phaser=0` | Canvas combat painter rollback (`combat-scene.ts`). **Must** still show the same choreography-driven VFX. |
| `?debug=1` → `window.__onyxDebug` | `state`, Arena helpers, `setBarksEnabled` / `getBarksEnabled` (dialog barks only — **not** a VFX kill-switch). |
| `setBarksEnabled(false)` | Mutes cream dialog barks; damage popups / strips still play. |
| Missing / failed strip load | `getEffectSprite` → null → **procedural** ellipse/rect fallback (both painters). Silent — treat as a bug if a registered id 404s. |
| `NON_COMBAT_EFFECT_IDS` (`fz_icons`) | Icon atlas; excluded from `loadEffectSprites` core preload. |
| Soft effect caps | Extra particle sprinkles dropped when scene effect list is full. |
| Corridor `fogTaperFrac=1` | **Not** spell FX — ignore. |

There is **no** global `effectsEnabled` flag today. Do not invent one unless the
user asks.

## Mag vs Tech (coded intent)

Documented in `resolveMeleeHitEffect` and Mag vs Tech plan notes:

- **Magic (spells):** charge (optional) → projectile (`riseDash` on many showcase
  bolts) → burst / field / underlays. Elemental language (fire/ice/bolt/portal).
- **Techniques (Tech):** blade / slash / stunburst language — **never** elemental
  puff strips for the hit flash. `technique: true` path uses `free_slash` +
  `free_stunburst` (Fighter/Duelist), `slash_attack` + stunburst (other melee),
  Mage/Priest staff overlays stay staff-like.
- `mage-ember` comment: fire mushroom + glow twin so Mag reads as magic, not a
  sword slash vs Tech.
- Outstanding human verification: mid-impact Mag vs Tech screenshots without
  reading the banner (see Phaser improvements plan).

Do **not** blur these languages when retuning styles.

## Non-goals

- New combat systems, DoTs beyond existing event presentation, rage/tech formulas
- Map layouts, floors, tilesets, door/wall art, corridor renderer
- Downloading / generating new sprite packs without user-provided files
- Moving DOM Magic/Tech menus into Phaser
- Committing / pushing / opening PRs unbidden
- Changing `src/data/spells.ts` mechanics (IDs/targets/power)

## How to work (one slice)

1. Pick **one** cluster (examples below).
2. Prefer remapping via `SPELL_OVERRIDES` / `STATUS_STYLES` / small choreography
   presentation tweaks using ids already in the inventory.
3. Update `collectReferencedEffectIds` / wiring tests if you touch reference
   inventory.
4. `npm run build` + relevant tests (`effect-sprite-wiring.test.ts`,
   `combat-scene.test.ts` style tests).
5. Visual evidence: Arena cast (Phaser default) **and** same cast with
   `?phaser=0`. Capture mid-impact.
6. Stop. Report: what changed, before/after evidence, remaining gaps.

### Suggested priority slices

1. **Heal differentiation** — many mid heals share bare `priest_heal`; T1
   `priest-cure-wounds` already uses `heal_sparks`; AOE heals use
   `retro3_arcane_bloom`. Make mid-tier / regen / cure-blind read distinct using
   existing heal/sigil/spark strips.
2. **Buff / ward differentiation** — `priest-shield-of-faith` / `priest-bless`
   share `px_shield`; `mage-spell-shield` / `mage-arcane-ward` /
   `priest-holy-aura` already diverge — extend that pattern.
3. **Status / miss** — miss is popup `"MISS"` only (no strip). Status disables
   mostly single-burst. Technique status has dedicated strip picks; align spell
   disable presentation if thin. **Do not** invent miss math — presentation only.
4. **Summon portal polish** — school-colored portals already exist; lesser summon
   uses generic `fz_portal`. Optional particle sprinkles already patterned.
5. **Mag vs Tech evidence pass** — no formula changes; screenshot Arena Mag bolt
   vs Fighter technique mid-impact on both painters.

## Definition of done (per slice)

- [ ] Only presentation files touched (typically `combat-choreography.ts`,
      maybe `effect-sprite-cache.ts` comments/registration, tests). No combat math.
- [ ] Every new style string is a registered `EFFECT_STRIPS` id with a PNG on disk.
- [ ] `npx vitest run src/engine/effect-sprite-wiring.test.ts` passes.
- [ ] `npm run build` zero TS errors.
- [ ] Arena evidence for the touched spells (Phaser + `?phaser=0`).
- [ ] Mag vs Tech still distinguishable without the banner (if melee/tech touched).
- [ ] Gaps that need new art listed explicitly — not papered over with wrong
      elemental strips.
- [ ] No commit unless the user asked.

## Full inventory (2026-07-31)

### Summary

| Metric | Count |
|--------|------:|
| PNGs under `public/assets/effects/` | 111 |
| Registered `EFFECT_STRIPS` ids | 110 |
| Orphan PNG (on disk, not registered) | 1 — `pixelart-magic-ray.png` (deliberately removed 2026-07-27; flat gradient, not a bolt) |
| Registered but unused | 0 (guarded by wiring test; `fz_icons` allowlisted non-combat) |
| Spells in `ALL_SPELLS` | 60 |
| Utility (no combat VFX expected) | 5 |
| Combat spells with resolveable style | 55 (all resolve; quality varies) |
| Explicit `SPELL_OVERRIDES` | ~41 |
| Combat spells on element/kind fallback only | ~14 |

### Folder structure

```
public/assets/effects/          # flat; all shipping strips
  *.png                         # 111 files
src/assets/effects/             # DOES NOT EXIST
dist/assets/effects/            # build copy of public (ignore for authoring)
vfx-audit/                      # local gitignored screenshots (not assets)
```

### Non-strip presentation channels (also “effects”)

| Channel | Behavior | Notes |
|---------|----------|-------|
| Damage popups | white / green heal / purple poison / `"MISS"` | Choreography; not strip-based |
| Dialog barks | cream text | Toggle: `setBarksEnabled` |
| Spell banner | top name window | Cast / technique |
| Procedural particles | colored sparks | Soft-capped |
| Procedural fallback burst/projectile | ring + dots / tiny rect | When strip missing |
| Actor anim states | walk / attack / cast / hurt / death | Party/enemy strips, not effects/ |
| Summon actor sprites | `spriteId` on summon spells | Enemy-like strips under `public/assets/enemies/`, not effects/ |

### Element defaults (`ELEMENT_STYLES`)

| Element | Projectile | Burst | Field | Charge | Notes |
|---------|------------|-------|-------|--------|-------|
| fire | `fz_fireball` | `mp_fire_bomb` | `large_fire` + `large_fire_glow` underlay | `mp_fire_bomb_full` | riseDash |
| cold | `px_ice_lance` | `ice_burst_glow` | `ice_burst_glow` | `px_ice_lance` | glow |
| lightning | `lightning_blast` | `mp_lightning` + glow underlay | `lightning_energy_glow` | `mp_lightning_full` | |
| poison | `px_plant_missle` | `retro2_verdant_burst` | `red_energy_glow` | `px_plant_missle` | |
| water | `fz_water` | `fz_water_geyser` | `fz_water_geyser` | `fz_water` | riseDash |
| earth | `fz_earth_spike` | `fz_rocks` | `retro2_earth_swirl` | `retro2_earth_swirl` | riseDash |
| wind | `fz_wind` | `fz_tornado` | `fz_tornado` | `fz_wind` | |
| physical | — | `retro2_crescent_slash` | `retro_crescent_arc` | — | blade language |
| undead | `red_lightning_blast` | `zombie_explosion` | `red_energy_glow` | `red_lightning_blast_glow` | |
| divine | — | `retro_starburst` | `retro_sun_ring` | `retro_sun_ring` | |

### Status defaults (`STATUS_STYLES`)

| Status | Burst | Notes |
|--------|-------|-------|
| sleep | `free_moon` | |
| poison | `dispel_sparks` | |
| paralysis | `free_stunburst` | |
| blind | `mp_spark` | |
| slow | `ice_burst_grey` | glow |
| burn | `fire_explosion` + `fire_explosion_glow` underlay | Meteor followup DoT |

### Kind fallbacks (when no override)

| Kind | Default look |
|------|----------------|
| heal | `priest_heal` projectile+burst |
| buff / magicScreen | `px_shield` burst+field |
| cure / resurrect | `priest_heal` burst |
| disable | `STATUS_STYLES[status]` |
| fizzleField / dispelMagic | `free_wardring` field + `px_black_white_sparks` burst |
| summon | `fz_portal` + `elemental_v1` underlay |

### Spell → VFX map (combat)

Columns: projectile / burst / field / charge / underlays / path / count.

| Spell id | Kind | Projectile | Burst | Field | Charge | Underlays | Path | # | Coverage note |
|----------|------|------------|-------|-------|--------|-----------|------|---|---------------|
| mage-fire-bolt | damage/fire | px_fireball | px_firebomb | | | | riseDash | 1 | override |
| mage-arcane-ward | buff | px_arcane_bolt | px_magic_orb | px_shield | | | | 1 | override |
| mage-spark | damage/lightning | lightning_blast | px_magic_sparks | | mp_spark_full | b:lightning_blast_glow | riseDash | 1 | override (not px_magic_ray) |
| mage-ember | damage/fire | fireball | fz_explosion | | mp_fire_bomb_full | b:fire_explosion_glow | riseDash | 1 | Mag vs Tech exemplar |
| mage-frostbite | damage/cold | px_ice_lance | ice_burst | ice_burst_grey | | | riseDash | 1 | override |
| mage-poison-spray | damage/poison | px_plant_missle | retro2_verdant_burst | red_energy_glow | px_plant_missle | | | 1 | element default |
| mage-burning-hands | damage/fire | | px_firebomb | px_firebomb | | | | 1 | override (no projectile) |
| mage-sleep | disable/sleep | | free_moon | | | | | 1 | status default |
| mage-hold-person | disable/paralysis | | free_stunburst | | | | | 1 | status default |
| mage-web | disable/paralysis | | free_tangle | free_tangle | | | | 1 | override (distinct from stun) |
| mage-lesser-summon | summon | | fz_portal | fz_portal | | b:elemental_v1 | | 1 | kind default |
| mage-fireball | damage/fire | fz_fireball | mp_fire_bomb | mp_fire_bomb | mp_fire_bomb_full | | riseDash | 2 | override |
| mage-cone-of-cold | damage/cold | px_ice_lance | ice_burst_glow | ice_burst_glow | | | | 2 | override |
| mage-summon-fire-elemental | summon | | fz_portal_orange | fz_portal_orange | | b:elemental_v1 | | 1 | override |
| mage-immolate | damage/fire | fz_fireball | retro_fire_mushroom | retro_fire_mushroom | mp_fire_bomb_full | f:fire_explosion_iso | riseDash | 3 | override |
| mage-ice-storm | damage/cold | px_ice_lance | ice_burst_dark | ice_burst_glow | | | | 4 | override |
| mage-power-word-stun | disable/paralysis | | free_stunburst | | | | | 1 | status default (shares hold) |
| mage-spell-shield | magicScreen | | retro2_ward_square | retro2_ward_square | | | | 1 | override |
| mage-silence | fizzleField | | px_black_white_sparks | free_wardring | | | | 1 | override |
| mage-dispel-magic | dispelMagic | | px_black_white_sparks | free_wardring | | | | 1 | override |
| mage-conjure-elemental | summon | | fz_portal | fz_portal | | b:elemental_v2 | | 1 | override |
| mage-gate | summon | | fz_portal | fz_portal | mp_dark_bolt_full | b:elemental_v1; f:retro3_sigil_charge | | 1 | override |
| mage-meteor-swarm | damage/fire | fz_molten_spear | fz_explosion | retro_fire_mushroom | mp_fire_bomb_full | f:fire_explosion_iso | | 5 | override (rain) |
| mage-disintegrate | damage/physical | px_black_white_ray | px_darkness_orb | px_darkness_bolt | mp_dark_bolt_full | b:mp_dark_bolt | riseDash | 1 | override |
| mage-freezing-sphere | damage/cold | px_ice_lance | ice_burst_glow | ice_burst_naked | ice_burst_transparent | | | 4 | override |
| mage-water-bolt | damage/water | px_water_bolt | px_splash | | | | riseDash | 1 | override |
| mage-tidal-wave | damage/water | px_water_orb | px_water_blast | fz_water_geyser | | | riseDash | 2 | override |
| mage-deluge | damage/water | fz_water | fz_water_geyser | retro2_aqua_vortex | fz_water | | | 3 | override |
| mage-stone-shard | damage/earth | px_rock_sling | fz_rocks | retro2_earth_swirl | retro2_earth_swirl | | riseDash | 1 | override |
| mage-rock-slide | damage/earth | fz_earth_spike | fz_rocks | retro2_earth_swirl | retro2_earth_swirl | | | 3 | override |
| mage-quake | damage/earth | | retro_shockwave | retro_shockwave | | | | 1 | override |
| mage-gust | damage/wind | px_wind_bolt | fz_wind | | | | riseDash | 1 | override |
| mage-cyclone | damage/wind | fz_wind | fz_tornado | fz_tornado | fz_wind | | | 1 | element default |
| mage-tempest | damage/wind | fz_wind | retro2_wind_pinwheel | retro3_wind_cross | fz_wind | | | 3 | override |
| priest-cure-wounds | heal | heal_sparks | px_magic_sparks | | | | | 1 | override |
| priest-sacred-flame | damage/undead | px_bolt_purity | heal_sparks | | | | riseDash | 1 | override |
| priest-guiding-bolt | damage/lightning | px_light_bolt | heal_sparks | | | | riseDash | 2 | override |
| priest-shield-of-faith | buff | | px_shield | px_shield | | | | 1 | **shared buff fallback** |
| priest-cure-serious | heal | priest_heal | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-neutralize-poison | cure/poison | | retro2_arcane_sigil | | | | | 1 | override |
| priest-cure-blind | cure/blind | | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-mass-cure | heal | priest_heal | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-divine-smite | damage/divine | px_pure_bolt_2 | retro_starburst | retro_sun_ring | | | riseDash | 2 | override |
| priest-summon-guardian | summon | | fz_portal_gold | fz_portal_gold | | b:elemental_v2 | | 1 | override |
| priest-cure-critical | heal | priest_heal | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-bless | buff | | px_shield | px_shield | | | | 1 | **shared buff fallback** |
| priest-regenerate | heal | priest_heal | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-mass-heal | heal | priest_heal | priest_heal | retro3_arcane_bloom | | | | 1 | override |
| priest-raise-dead | resurrect | | retro_dot_flower | | | | | 1 | override |
| priest-sunburst | damage/undead | | free_sunburst | retro2_solar_ring | | | | 1 | override |
| priest-summon-celestial-guardian | summon | | fz_portal_gold | fz_portal_gold | | b:elemental_v1 | | 1 | override |
| priest-summon-celestial | summon | | fz_portal_gold | fz_portal_gold | | b:elemental_v2 | | 1 | override |
| priest-heal | heal | priest_heal | priest_heal | | | | | 1 | **shared heal fallback** |
| priest-mass-regenerate | heal | priest_heal | priest_heal | retro3_arcane_bloom | | | | 1 | override |
| priest-holy-aura | buff | | retro2_solar_ring | retro2_solar_ring | | | | 1 | override |

**Utility (skip combat VFX):** `mage-wayfinder`, `mage-knock`, `mage-levitate`,
`priest-light`, `priest-unseal`.

### Rough coverage gaps (quality — not missing registry)

1. **Heal / cure blandness** — serious / critical / mass-cure / regenerate /
   heal / cure-blind all resolve to the same `priest_heal` look.
2. **Buff blandness** — shield-of-faith + bless share generic `px_shield`.
3. **Stun twins** — hold-person and power-word-stun share `free_stunburst`
   (web correctly diverges via `free_tangle`).
4. **Miss** — text popup only; no dedicated miss strip wired.
5. **Orphan file** — `pixelart-magic-ray.png` kept on disk but unregistered;
   do not re-wire without a real bolt silhouette.
6. Mag vs Tech mid-impact screenshot evidence still called out as outstanding
   in prior Phaser improvement docs.

### Melee / enemy projectile hardcodes (also effects/)

| Context | Strip ids |
|---------|-----------|
| Mage melee | `wizard_attack1` / crit `wizard_attack2` + `staff_attack` underlay |
| Priest melee | `priest_attack` + `staff_attack` |
| Fighter/Duelist melee | `free_slash` |
| Other melee | `slash_attack` (25×21 grid, scale ~4) |
| Technique hit | slash/stunburst language (`free_stunburst` underlay) |
| Ranged party Thief | `arrow_archer` |
| Default arrow | `arrow` |
| Enemy ranged | `cannonball`, `rune-beam`, `demon-arrow`, `eye-beam`, `ghostfire-beam`, `arrow_skeleton`, `lava-spike`, `warlock-magic` |
| Death / particles | `zombie_death_explosion`, `zombie_explosion`, `elemental_v*`, `extra_elemental*` |

### Complete strip registry

| Registry id | Path (`public/assets/effects/`) | Frame | Declared frames | fps | Image (IHDR) | Grid | Used by |
|-------------|----------------------------------|-------|----------------:|----:|--------------|------|---------|
| arrow | arrow.png | 32×32 | 1 | 0 | 32×32 | 1×1 | ranged default |
| arrow_archer | arrow_archer.png | 32×32 | 1 | 0 | 32×32 | 1×1 | Thief ranged |
| arrow_skeleton | arrow_skeleton.png | 32×32 | 1 | 0 | 32×32 | 1×1 | skeleton-archer |
| cannonball | cannonball.png | 100×100 | 1 | 0 | 100×100 | 1×1 | ironclad-knight |
| demon-arrow | demon-arrow.png | 100×100 | 1 | 0 | 100×100 | 1×1 | demon-brawler |
| dispel_sparks | dispel-sparks.png | 16×16 | 6 | 12 | 96×16 | 6×1 | poison status / debuff fallback |
| elemental_v1 | elemental_v1.png | 8×8 | 26 | 12 | 32×208 | 4×26 | summon underlay / sprinkles |
| elemental_v2 | elemental_v2.png | 8×8 | 26 | 12 | 32×208 | 4×26 | summon underlay |
| extra_elemental | extra_elemental.png | 14×14 | 36 | 12 | 56×126 | 4×9 | particle helpers |
| extra_elemental_glow | extra_elemental_glow.png | 14×14 | 36 | 12 | 56×126 | 4×9 | particle helpers |
| eye-beam | eye-beam.png | 100×100 | 3 | 12 | 300×100 | 3×1 | eyeball-monster (loop) |
| fire_explosion | fire_explosion.png | 28×28 | 12 | 12 | 336×28 | 12×1 | burn / generic fallback |
| fire_explosion_glow | fire_explosion_glow.png | 28×28 | 12 | 12 | 336×28 | 12×1 | underlays |
| fire_explosion_iso | fire_explosion_iso.png | 28×28 | 12 | 12 | 336×28 | 12×1 | Immolate/Meteor field underlay |
| fire_explosion_iso_glow | fire_explosion_iso_glow.png | 28×28 | 12 | 12 | 336×28 | 12×1 | special third field layer |
| fireball | fireball.png | 16×16 | 12 | 12 | 192×16 | 12×1 | mage-ember projectile |
| free_moon | free-moon.png | 64×64 | 10 | 12 | 640×64 | 10×1 | sleep |
| free_slash | free-slash.png | 64×64 | 8 | 12 | 512×64 | 8×1 | Fighter/Duelist melee; tech |
| free_stunburst | free-stunburst.png | 64×64 | 10 | 12 | 640×64 | 10×1 | paralysis; tech underlay |
| free_sunburst | free-sunburst.png | 64×64 | 9 | 12 | 576×64 | 9×1 | priest-sunburst |
| free_tangle | free-tangle.png | 64×64 | 12 | 12 | 768×64 | 12×1 | mage-web |
| free_wardring | free-wardring.png | 64×64 | 14 | 12 | 896×64 | 14×1 | silence/dispel/fizzle |
| fz_earth_spike | foozle-earth_spike.png | 64×64 | 9 | 12 | 576×64 | 9×1 | earth proj |
| fz_explosion | foozle-explosion.png | 64×64 | 7 | 12 | 448×64 | 7×1 | ember / meteor burst |
| fz_fireball | foozle-fireball.png | 64×64 | 10 | 12 | 640×64 | 10×1 | fire element / fireball |
| fz_icons | foozle-icons.png | 32×32 | 10 | 0 | 320×32 | 10×1 | **non-combat** atlas |
| fz_molten_spear | foozle-molten-spear.png | 64×64 | 12 | 12 | 768×64 | 12×1 | meteor projectile |
| fz_portal | foozle-portal.png | 64×64 | 10 | 12 | 640×64 | 10×1 | mage summons |
| fz_portal_gold | foozle-portal-gold.png | 64×64 | 10 | 12 | 640×64 | 10×1 | priest summons |
| fz_portal_orange | foozle-portal-orange.png | 64×64 | 10 | 12 | 640×64 | 10×1 | fire elemental summon |
| fz_rocks | foozle-rocks.png | 64×64 | 10 | 12 | 640×64 | 10×1 | earth burst |
| fz_tornado | foozle-tornado.png | 64×64 | 9 | 12 | 576×64 | 9×1 | wind field/burst |
| fz_water | foozle-water.png | 64×64 | 10 | 12 | 640×64 | 10×1 | water proj/charge |
| fz_water_geyser | foozle-water_geyser.png | 64×64 | 13 | 12 | 832×64 | 13×1 | water burst/field |
| fz_wind | foozle-wind.png | 64×64 | 10 | 12 | 640×64 | 10×1 | wind |
| ghostfire-beam | ghostfire-beam.png | 100×100 | 3 | 12 | 300×100 | 3×1 | ghostfire / succubus (loop) |
| heal_sparks | heal-sparks.png | 16×16 | 6 | 12 | 96×16 | 6×1 | cure-wounds / holy bursts |
| ice_burst | ice_burst.png | 48×48 | 8 | 12 | 384×48 | 8×1 | frostbite |
| ice_burst_dark | ice_burst_dark.png | 48×48 | 8 | 12 | 384×48 | 8×1 | ice storm |
| ice_burst_glow | ice_burst_glow.png | 48×48 | 8 | 12 | 384×48 | 8×1 | cold default |
| ice_burst_grey | ice_burst_grey.png | 48×48 | 8 | 12 | 384×48 | 8×1 | frostbite field / slow |
| ice_burst_naked | ice_burst_naked.png | 48×48 | 8 | 12 | 384×48 | 8×1 | freezing sphere field |
| ice_burst_transparent | ice_burst_transparent.png | 48×48 | 8 | 12 | 384×48 | 8×1 | freezing sphere charge |
| large_fire | large_fire.png | 28×28 | 12 | 12 | 112×84 | 4×3 | fire element field |
| large_fire_glow | large_fire_glow.png | 28×28 | 12 | 12 | 112×84 | 4×3 | fire field underlay |
| lava-spike | lava-spike.png | 100×100 | 5 | 12 | 500×100 | 5×1 | lava-slime |
| lightning_blast | lightning_blast.png | 54×18 | 9 | 12 | 486×18 | 9×1 | spark / lightning proj |
| lightning_blast_glow | lightning_blast_glow.png | 54×18 | 9 | 12 | 486×18 | 9×1 | underlay |
| lightning_energy | lightning_energy.png | 48×48 | 9 | 12 | 432×48 | 9×1 | technique paralysis |
| lightning_energy_glow | lightning_energy_glow.png | 48×48 | 9 | 12 | 432×48 | 9×1 | lightning field / tech |
| mp_dark_bolt | magicpack-dark-bolt.png | 64×88 | 11 | 14 | 704×88 | 11×1 | disintegrate underlay |
| mp_dark_bolt_full | magicpack-dark-bolt-full.png | 64×88 | 12 | 15 | 768×88 | 12×1 | disintegrate/gate charge |
| mp_fire_bomb | magicpack-fire-bomb.png | 64×64 | 7 | 25 | 448×64 | 7×1 | fireball burst (trimmed) |
| mp_fire_bomb_full | magicpack-fire-bomb-full.png | 64×64 | 15 | 15 | 960×64 | 15×1 | fire charges |
| mp_lightning | magicpack-lightning.png | 64×128 | 10 | 14 | 640×128 | 10×1 | lightning burst |
| mp_lightning_full | magicpack-lightning-full.png | 64×128 | 11 | 15 | 704×128 | 11×1 | lightning charge |
| mp_spark | magicpack-spark.png | 32×32 | 7 | 14 | 224×32 | 7×1 | blind status |
| mp_spark_full | magicpack-spark-full.png | 32×32 | 8 | 16 | 256×32 | 8×1 | spark charge |
| priest_attack | priest_attack.png | 100×100 | 5 | 12 | 500×100 | 5×1 | Priest melee |
| priest_heal | priest_heal.png | 100×100 | 4 | 12 | 400×100 | 4×1 | heal defaults / AOE heals |
| px_arcane_bolt | pixelart-arcane-bolt.png | 16×16 | 6 | 12 | 96×16 | 6×1 | arcane ward |
| px_black_white_ray | pixelart-black-white-ray.png | 16×16 | 8 | 12 | 128×16 | 8×1 | disintegrate |
| px_black_white_sparks | pixelart-black-white-sparks.png | 16×16 | 6 | 12 | 96×16 | 6×1 | silence/dispel |
| px_bolt_purity | pixelart-bolt-of-purity.png | 16×16 | 6 | 12 | 96×16 | 6×1 | sacred flame |
| px_darkness_bolt | pixelart-darkness-bolt.png | 16×16 | 6 | 12 | 96×16 | 6×1 | disintegrate field |
| px_darkness_orb | pixelart-darkness-orb.png | 16×16 | 6 | 12 | 96×16 | 6×1 | disintegrate burst |
| px_fireball | pixelart-fireball.png | 16×16 | 6 | 12 | 96×16 | 6×1 | fire-bolt |
| px_firebomb | pixelart-firebomb.png | 16×16 | 6 | 12 | 96×16 | 6×1 | fire-bolt / burning hands |
| px_ice_lance | pixelart-ice-lance.png | 16×16 | 4 | 12 | 64×16 | 4×1 | cold projectiles |
| px_light_bolt | pixelart-light-bolt.png | 16×16 | 6 | 12 | 96×16 | 6×1 | guiding bolt |
| px_magic_orb | pixelart-magic-orb.png | 16×16 | 6 | 12 | 96×16 | 6×1 | arcane ward burst |
| px_magic_sparks | pixelart-magic-sparks.png | 16×16 | 6 | 12 | 96×16 | 6×1 | spark / cure-wounds |
| px_plant_missle | pixelart-plant-missle.png | 16×16 | 6 | 12 | 96×16 | 6×1 | poison |
| px_pure_bolt_2 | pixelart-pure-bolt-2.png | 16×16 | 6 | 12 | 96×16 | 6×1 | divine smite |
| px_rock_sling | pixelart-rock-sling.png | 16×16 | 1 | 0 | 16×16 | 1×1 | stone shard |
| px_shield | pixelart-shield.png | 48×48 | 6 | 12 | 288×48 | 6×1 | buff default |
| px_splash | pixelart-splash.png | 32×32 | 6 | 12 | 192×32 | 6×1 | water bolt |
| px_water_blast | pixelart-water-blast.png | 16×16 | 6 | 12 | 96×16 | 6×1 | tidal wave |
| px_water_bolt | pixelart-water-bolt.png | 16×16 | 6 | 12 | 96×16 | 6×1 | water bolt |
| px_water_orb | pixelart-water-orb.png | 16×16 | 6 | 12 | 96×16 | 6×1 | tidal wave |
| px_wind_bolt | pixelart-wind-bolt.png | 16×16 | 6 | 12 | 96×16 | 6×1 | gust |
| red_energy | red_energy.png | 48×48 | 9 | 12 | 432×48 | 9×1 | tech poison / fallback |
| red_energy_glow | red_energy_glow.png | 48×48 | 9 | 12 | 432×48 | 9×1 | undead/poison field |
| red_lightning_blast | red_lightning_blast.png | 54×18 | 9 | 12 | 486×18 | 9×1 | undead projectile |
| red_lightning_blast_glow | red_lightning_blast_glow.png | 54×18 | 9 | 12 | 486×18 | 9×1 | undead charge |
| retro2_aqua_vortex | retro2-aqua-vortex.png | 64×64 | 9 | 12 | 576×64 | 9×1 | deluge field |
| retro2_arcane_sigil | retro2-arcane-sigil.png | 64×64 | 7 | 12 | 448×64 | 7×1 | neutralize poison |
| retro2_crescent_slash | retro2-crescent-slash.png | 64×64 | 9 | 12 | 576×64 | 9×1 | physical element |
| retro2_earth_swirl | retro2-earth-swirl.png | 64×64 | 10 | 12 | 640×64 | 10×1 | earth fields/charges |
| retro2_solar_ring | retro2-solar-ring.png | 64×64 | 9 | 12 | 576×64 | 9×1 | sunburst / holy aura |
| retro2_verdant_burst | retro2-verdant-burst.png | 64×64 | 7 | 12 | 448×64 | 7×1 | poison burst |
| retro2_ward_square | retro2-ward-square.png | 64×64 | 8 | 12 | 512×64 | 8×1 | spell shield |
| retro2_wind_pinwheel | retro2-wind-pinwheel.png | 64×64 | 9 | 12 | 576×64 | 9×1 | tempest burst |
| retro3_arcane_bloom | retro3-arcane-bloom.png | 64×64 | 17 | 14 | 1088×64 | 17×1 | mass heal / mass regen |
| retro3_sigil_charge | retro3-sigil-charge.png | 64×64 | 15 | 14 | 960×64 | 15×1 | gate field underlay |
| retro3_wind_cross | retro3-wind-cross.png | 64×64 | 18 | 14 | 1152×64 | 18×1 | tempest field |
| retro_crescent_arc | retro-crescent-arc.png | 96×48 | 4 | 12 | 384×48 | 4×1 | physical field |
| retro_dot_flower | retro-dot-flower.png | 96×48 | 6 | 12 | 576×48 | 6×1 | raise dead |
| retro_fire_mushroom | retro-fire-mushroom.png | 96×48 | 4 | 12 | 384×48 | 4×1 | immolate / meteor field |
| retro_shockwave | retro-shockwave.png | 96×48 | 6 | 12 | 576×48 | 6×1 | quake |
| retro_starburst | retro-starburst.png | 96×48 | 4 | 12 | 384×48 | 4×1 | divine / smite |
| retro_sun_ring | retro-sun-ring.png | 96×48 | 4 | 12 | 384×48 | 4×1 | divine field |
| rune-beam | rune-beam.png | 100×100 | 7 | 12 | 700×100 | 7×1 | rune-knight (loop) |
| slash_attack | slash_attack.png | 25×21 | 12 | 36 | 50×126 | 2×6 | melee grid (not full-sheet) |
| staff_attack | staff_attack.png | 32×64 | 1 | 0 | 32×64 | 1×1 | Mage/Priest underlay |
| warlock-magic | warlock-magic.png | 100×100 | 9 | 12 | 900×100 | 9×1 | warlock / demon-mage (loop) |
| wizard_attack1 | wizard_attack1.png | 100×100 | 10 | 12 | 1000×100 | 10×1 | Mage melee |
| wizard_attack2 | wizard_attack2.png | 100×100 | 7 | 12 | 700×100 | 7×1 | Mage crit melee |
| zombie_death_explosion | zombie_death_explosion.png | 72×64 | 4 | 12 | 288×64 | 4×1 | death FX |
| zombie_explosion | zombie_explosion.png | 72×64 | 4 | 12 | 288×64 | 4×1 | undead burst / death |

**Orphan (not in `EFFECT_STRIPS`):** `pixelart-magic-ray.png` — do not register
without replacing art; prior pass rejected it as a flat gradient band.

## Verification commands

```bash
npm run build
npx vitest run src/engine/effect-sprite-wiring.test.ts src/engine/combat-scene.test.ts
npm run dev
# or: npx vite preview --port 5176 --base /OnyxLabyrinth/
# Arena from title [A]; also open ?phaser=0 for canvas painter parity
# Optional: ?debug=1 for __onyxDebug helpers
```

## Closing report template

When you stop after a slice, return:

1. Slice goal + files touched  
2. Spells / statuses remapped (old → new strip ids)  
3. Evidence (Arena Phaser + `?phaser=0`)  
4. Tests / build result  
5. Remaining gaps / art asks (no invented pipelines)  
6. Explicit confirmation: combat math untouched; no commit unless requested  
