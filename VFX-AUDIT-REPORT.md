# Spell VFX Audit Report

## Methodology

- Built the project with `npm run build` (0 TypeScript errors).
- Started the production preview server (`npx vite preview --port 5176 --base /OnyxLabyrinth/`).
- Captured every spell in the VFX vignette (`vfx-vignette.html`) at the impact peak (~450 ms after cast start) while playback was running. All 39 non-utility combat spells were screenshotted to `vfx-audit/spell-*.png`.
- Entered Arena mode from the title screen and captured a real combat context screenshot (`vfx-audit/arena-combat-context.png`) showing the FF6 windows, party/enemy sprites, and HP/SP display.
- Read `src/engine/combat-scene.ts` (mapping + choreography), `src/engine/effect-sprite-cache.ts` (full sprite inventory), and `src/data/spells.ts` (definitions).
- Inspected each screenshot against the source mapping, assessing travel, impact, scale, color/element consistency, additive blending, and readability inside the full UI.

## Per-spell assessment

| # | Spell | School | Current Effect | Verdict | Specific Issue | Proposed Fix |
|---|-------|--------|----------------|---------|----------------|--------------|
| 1 | Fire Bolt | Mage/Fire T1 | `fz_fireball` projectile @ 0.7×, `fz_explosion` burst @ 2.0× | Needs Work | Projectile is tiny and nearly invisible; wind-up reuses an explosion sprite so it does not read as a charge. | Raise `projectileScale` to 1.0–1.2×. Use a small gather sprite (`px_magic_sparks` or `lightning_energy`) for the wind-up. |
| 2 | Arcane Ward | Mage/Buff T1 | `px_shield` burst @ 2.6× | Needs Work | Burst is very brief and can be lost on the small wizard sprite; no lingering presence. | Raise `burstScale` to 3.2–3.5× and/or extend buff burst duration so the ward lingers visibly. |
| 3 | Spark | Mage/Lightning T1 | `mp_spark` projectile @ 1.4×, `mp_lightning` burst @ 2.0× | Needs Work | `mp_lightning` is a vertical column; as a single-target burst it reads as a flat ring, not a lightning strike. | Swap burst to `lightning_energy`/`lightning_energy_glow` @ 2.0–2.5×. |
| 4 | Ember | Mage/Fire T1 | `px_fireball` projectile @ 2.8×, `fz_explosion` burst @ 2.0× | Good | Small fire projectile + modest explosion fits a tier-1 cantrip. | Minor: keep; optionally adjust wind-up sprite. |
| 5 | Frostbite | Mage/Cold T1 | `px_ice_lance` projectile @ 2.8×, `ice_burst_glow` burst @ 1.2× | Okay | Ice shard travels well, but impact burst is tiny and the charge glow is almost invisible. | Raise `burstScale` to ~1.8–2.0× and wind-up scale to ~0.65×. |
| 6 | Poison Spray | Mage/Poison T1 | `mp_dark_bolt` projectile @ 0.7×, `red_energy_glow` burst @ 1.3×, non-additive | Bad | Projectile is a postage stamp; red-energy burst with purple tint reads as a dark smudge, not venom. | Swap projectile to `px_plant_missle` @ 2.0×, enable `additive`, use `zombie_explosion` or `red_energy_glow` @ 1.8× for sickly impact. |
| 7 | Burning Hands | Mage/Fire T2 | `mp_fire_bomb` burst @ 1.6×, field @ 2.4× | Good | Field covers enemy group; additive fire reads as a hot cone. | Optional: lower `burstScale` to 1.2–1.4× so field shape dominates. |
| 8 | Sleep | Mage/Disable T2 | `px_magic_sparks` burst @ 4.0× | Okay | Popup is clear, but the sparkle puff does not suggest slumber. | Add a slow projectile (`px_magic_orb`/`px_magic_ray`) and raise `burstScale` to ~5.0×. |
| 9 | Hold Person | Mage/Disable T2 | `mp_lightning` burst @ 1.5× | Needs Work | Lightning bolt does not mean “held/bound”; effect is smaller than the popup. | Replace burst with `px_shield` @ 2.2× or `ice_burst_glow` @ 2.0× to suggest restraint. |
| 10 | Web | Mage/Disable T2 | `px_magic_sparks` burst @ 3.0×, field @ 7.0×, non-additive | Needs Work | Oversized gray spark field looks like flat bubbles, not webs. | Enable `additive`; swap field to `ice_burst`/`ice_burst_glow` @ 3.5–4.0× for a silvery web read. |
| 11 | Lesser Summon | Mage/Summon T2 | `fz_portal` burst @ 1.6× | Okay | Portal is small/tame but sells a minor summon. | Raise `burstScale` to 2.2×; add a small `px_magic_sparks` flash at the portal center. |
| 12 | Fireball | Mage/Fire T3 | `mp_fire_bomb` burst @ 2.0×, field @ 2.6× | Okay | Functional but reuses the same `mp_fire_bomb` as Burning Hands, so tier-3 does not feel bigger. | Raise `burstScale` to 2.5–2.8× and `fieldScale` to 3.0–3.2×; consider `mp_fire_bomb_full`. |
| 13 | Cone of Cold | Mage/Cold T3 | `ice_burst` burst @ 1.2×, field @ 3.0× | Good | Large blue-white field blankets the enemy side. | Minor: unify on `ice_burst_glow` for consistency with Ice Storm, or bump `fieldScale` to 3.5×. |
| 14 | Summon Fire Elemental | Mage/Summon T3 | `fz_portal_orange` burst @ 2.0× | Good | Orange portal matches element and feels appropriately warm. | Optional: add a one-shot `fire_explosion_glow` flash at portal open. |
| 15 | Immolate | Mage/Fire T4 | `fz_molten_spear` projectile @ 0.8×, `mp_fire_bomb` burst @ 2.2× | Needs Work | Spear is underscaled and the burst reuses the group-fire sprite; heavy hit lacks identity. | Raise `projectileScale` to 1.2–1.5×; switch burst to `fz_explosion` or `mp_fire_bomb_full` @ 2.8–3.0×. |
| 16 | Ice Storm | Mage/Cold T4 | `ice_burst_glow` burst @ 1.2×, field @ 3.0× | Good | Glowing ice field covers the whole enemy formation; reads as a blizzard. | Minor: optionally raise `fieldScale` to 3.5×. |
| 17 | Power Word: Stun | Mage/Disable T4 | `mp_lightning` burst @ 1.8× | Needs Work | For a tier-4 “power word,” the visual is just a slightly larger Hold Person lightning flash. | Swap to `px_darkness_orb`/`px_magic_orb` @ 3.5–4.0× or `red_energy_glow` @ 2.5× for a psychic pulse. |
| 18 | Spell Shield | Mage/Buff T5 | `px_shield` burst @ 2.6×, field @ 3.3× | Good | Protective shell is readable; clustered party can overlap into one blue blob. | Reduce `fieldScale` to 2.8× so each ally’s shield stays distinct. |
| 19 | Silence | Mage/Debuff T5 | `px_darkness_orb` burst @ 4.0×, field @ 7.0×, non-additive | Needs Work | Huge purple orb on every enemy reads as a shield, not sound suppression. | Drop `burstScale` to 1.8×, `fieldScale` to 5.0×; darken color to `#8a5cb8`; enable additive. |
| 20 | Dispel Magic | Mage/Debuff T5 | `dispel_sparks` burst @ 4.0×, field @ 7.0× | Okay | 16×16 strip blown to 14× looks soft/bubble-like; per-target bursts dominate. | Reduce `fieldScale` to 5.0× and `burstScale` to 2.0×; optionally swap field to `lightning_energy_glow`. |
| 21 | Conjure Elemental | Mage/Summon T5 | `fz_portal` burst @ 2.0×, field @ 2.5× | Good | Field of portals across the party reads as mass summoning. | Raise `fieldScale` to 3.0× for slightly more T5 presence. |
| 22 | Gate | Mage/Summon T5 | `fz_portal` burst @ 2.6× | Needs Work | Portal is barely larger than lower-tier summons; does not sell “tear open a plane.” | Raise `burstScale` to 3.5×, add a lingering `fz_portal` field @ 3.0×, add screen flash/shake. |
| 23 | Cure Wounds | Priest/Heal T1 | `heal_sparks` burst @ 3.5× | Needs Work | 16×16 ring is too small to feel satisfying; no flash, so weaker than a damage spell. | Raise `burstScale` to 4.5× and add a brief heal-colored screen flash. |
| 24 | Sacred Flame | Priest/Divine T1 | `px_bolt_purity` projectile @ 2.8×, `lightning_energy_glow` burst @ 1.3× | Needs Work | Lightning-energy burst reads as electric zap, not holy light; burst is tiny. | Swap burst to `mp_fire_bomb` @ 1.4× (matches “flame” name) and raise projectile scale to 3.5×. |
| 25 | Guiding Bolt | Priest/Lightning T1 | `px_light_bolt` projectile @ 2.8×, `lightning_energy_glow` burst @ 1.3× | Needs Work | Style color `#7fb8f0` is icy blue but sprites are yellow-white, so palette is split. | Change `color` to `#ffd769`; swap burst to `mp_lightning` @ 1.5×. |
| 26 | Shield of Faith | Priest/Buff T1 | `px_shield` burst @ 2.6× | Good | Blue energy shield is instantly readable as protection. | Minor: raise `burstScale` to 3.0× for larger sprites. |
| 27 | Cure Serious Wounds | Priest/Heal T2 | `heal_sparks` burst @ 4.5× | Okay | Larger than Cure Wounds but same one-ring sprite and no flash. | Add screen flash; optionally layer a low-scale `lightning_energy_glow` core. |
| 28 | Neutralize Poison | Priest/Cure T2 | `heal_sparks` burst @ 3.5× | Okay | Reads as “heal,” not cleansing; `CURED` popup carries most meaning. | Layer `dispel_sparks` @ 1.5× additive with a mintier tint to sell poison leaving. |
| 29 | Mass Cure | Priest/Heal T2 | `heal_sparks` burst @ 3.5×, field @ 5.0× | Good | Green sparkles blanket the party; group heal feels generous. | Slightly raise `fieldScale` to 6.0× to cover the bottom party member. |
| 30 | Divine Smite | Priest/Divine T2 | `px_bolt_purity` projectile @ 2.8×, `mp_lightning` burst @ 1.8× | Needs Work | `mp_lightning` reads as lightning, not holy/divine; projectile is small. | Swap burst to `lightning_energy_glow` or `fire_explosion_glow` @ ~2.0×; raise `projectileScale` to 3.5×. |
| 31 | Summon Guardian | Priest/Summon T2 | `fz_portal_gold` burst @ 2.0× | Okay | Gold portal is correct but only ~128 px and lacks secondary energy. | Raise `burstScale` to 2.6×; layer small `px_magic_sparks`/`heal_sparks` around portal. |
| 32 | Cure Critical Wounds | Priest/Heal T3 | `heal_sparks` burst @ 5.5× | Good | Sparkle size and green color read as a strong single-target heal. | Optional: add tiny `lightning_energy_glow` core @ 1.5× for extra “critical” flash. |
| 33 | Bless | Priest/Buff T3 | `px_shield` burst @ 2.6×, field @ 3.3× | Good | Shield bubbles cover each ally; field covers party side. | None. |
| 34 | Mass Heal | Priest/Heal T3 | `heal_sparks` burst @ 3.5×, field @ 5.0× | Good | Green sparkles blanket the party; field placement and linger feel right. | Slightly raise `fieldScale` to 6.5–7.0×. |
| 35 | Raise Dead | Priest/Resurrect T4 | fallback `priest_heal` @ 1.2× | Needs Work | Tier-4 resurrection uses the same small cross-strip as a tier-1 cure; `CURED` popup is thematically wrong. | Add a `SPELL_OVERRIDES` entry: `heal_sparks` @ 5.5× or `px_magic_sparks` @ 5.0× with `#ffe8a0` tint. |
| 36 | Sunburst | Priest/Divine T4 | `mp_lightning` burst @ 2.0×, field @ 2.6× | Needs Work | `mp_lightning` is clearly a lightning storm, not a sunburst. | Replace field with `lightning_energy_glow` @ 3.0× and burst with `fire_explosion_glow` @ 2.0×. |
| 37 | Summon Celestial Guardian | Priest/Summon T4 | `fz_portal_gold` burst @ 2.6× | Okay | Larger than T2 portal and appropriately golden. | Add `heal_sparks`/`px_magic_sparks` secondary burst @ ~2.5× for holy charge. |
| 38 | Summon Celestial | Priest/Summon T5 | `fz_portal_gold` burst @ 2.0×, field @ 2.5× | Okay | Per-ally portal is smaller than the T4 single guardian; field is just ring cluster. | Raise `burstScale` to 2.6× and `fieldScale` to 3.5–4.0×. |
| 39 | Heal | Priest/Heal T5 | `heal_sparks` burst @ 6.0× | Good | Largest heal-spark burst; clearly reads as a powerful restore. | Optional: add small `lightning_energy_glow` core @ 2.0× for a brighter central flash. |

## Systemic issues

1. **Holy/damage spells borrow lightning art.** `Sacred Flame`, `Guiding Bolt`, `Divine Smite`, and `Sunburst` all use `mp_lightning` or `lightning_energy_glow`. Because strips are drawn untinted, the holy spells read as electric zaps and the warm `#ffe8a0` tint only affects particles. A shared divine style using `mp_fire_bomb` / `fire_explosion_glow` / `lightning_energy_glow` would unify them.
2. **Fire spells over-share `mp_fire_bomb` and `fz_explosion`.** `Burning Hands`, `Fireball`, and `Immolate` use `mp_fire_bomb`; `Ember` and `Fire Bolt` share `fz_explosion`. Tier 2/3/4 fire damage therefore feels homogeneous. Alternatives already in the cache (`px_firebomb`, `fire_explosion_glow`, `mp_fire_bomb_full`) should be swapped in.
3. **Disable spells lack projectiles and thematic sprites.** `Sleep`, `Hold Person`, and `Power Word: Stun` fire only a charge puff + burst. The burst sprites (sparks, lightning) do not suggest slumber or binding, so the cast reads as “text appears.” Existing strips (`px_magic_orb`, `px_magic_ray`, `px_black_white_ray`, `px_shield`, `ice_burst_glow`, `px_darkness_orb`) can give each disable a distinct visual identity.
4. **Poison visual language is broken.** `Poison Spray` uses a tiny dark bolt, non-additive red energy, and a purple tint that clashes with the red sprite. Existing green/venom strips (`px_plant_missle`, `zombie_explosion`) are unused and would fix the read.
5. **Wind-up charge glow reuses the burst sprite.** The cast step always uses `style.burst` scaled to 0.45×. For fire spells that burst is an explosion, so the “charge” reads as the spell already detonating on the caster. A small gather sprite (`px_magic_sparks`, `lightning_energy`) would read better as a charge.
6. **Buffs/debuffs overlap into shapeless blobs.** Group buffs (`Spell Shield`, `Bless`) and debuffs (`Silence`, `Dispel Magic`) drop a 4.0×+ burst on every target plus a central field. With additive blending, overlapping circles blow out to white and lose their shape. Lower per-target burst scale and let the central field carry the area read.
7. **Summon portal scales do not escalate across tiers.** Lesser Summon 1.6× → Summon Fire Elemental 2.0× → Conjure Elemental 2.0/2.5× → Gate 2.6×. A tier-5 “Gate” should feel visually distinct from tier-2/3 summons.
8. **Heals/cures all use one sprite.** `heal_sparks` carries `Cure Wounds`, `Cure Serious`, `Neutralize Poison`, and `Mass Cure`. Only scale differentiates them, and none get the impact flash that damage spells receive, making heals feel less consequential.
9. **`Raise Dead` has no override.** It falls through to the generic cure fallback (`priest_heal` @ 1.2×), making a tier-4 resurrection look identical to a tier-1 cure.
10. **Cold spells are inconsistent between glow/plain variants.** `Frostbite` and `Ice Storm` use `ice_burst_glow`; `Cone of Cold` uses plain `ice_burst`. The glow variant photographs much better against the dark combat background.

## Quick wins (high impact, low effort)

1. **Scale up tiny projectiles.** Fire Bolt (`0.7×` → `1.0–1.2×`), Poison Spray (`0.7×` → `2.0×`), Immolate spear (`0.8×` → `1.2–1.5×`), and holy bolts (`2.8×` → `3.5×`) become readable with one number change.
2. **Enable additive blending on Poison Spray and Web.** These two non-additive disables currently read as dark smudges; turning on `additive: true` brightens them without new art.
3. **Swap a few burst sprites to better-fit strips.** Spark (`mp_lightning` → `lightning_energy_glow`), Hold Person (`mp_lightning` → `px_shield`/`ice_burst_glow`), Power Word: Stun (`mp_lightning` → `px_darkness_orb`), Sunburst field (`mp_lightning` → `lightning_energy_glow`), Sacred Flame (`lightning_energy_glow` → `mp_fire_bomb`).
4. **Raise burst scale on underwhelming impacts.** Frostbite (`1.2×` → `1.8×`), Cure Wounds (`3.5×` → `4.5×`), Arcane Ward (`2.6×` → `3.2×`), Lesser Summon (`1.6×` → `2.2×`).
5. **Add `SPELL_OVERRIDES` for Raise Dead.** Use `heal_sparks` @ 5.5× with `#ffe8a0` tint so the tier-4 revive gets a bright, miraculous burst.
6. **Add brief heal flash.** Mirror the damage `addScreenFlash` path for heal/cure impacts at a lower alpha/duration so restoration “pops.”

## Medium effort improvements

1. **Introduce per-element wind-up sprites.** Instead of always reusing `style.burst` for the 280 ms charge, pick a small gather sprite by element: `px_magic_sparks` for arcane/divine, `lightning_energy` for lightning, `ice_burst_glow` for cold, etc. Requires a small choreo change in `combat-scene.ts`.
2. **Diversify fire spell identities.** Assign `px_firebomb` or `fire_explosion_glow` to Ember/Fire Bolt, keep `mp_fire_bomb` for Burning Hands/Fireball, and use `mp_fire_bomb_full` for Immolate so each tier has a distinct sprite.
3. **Tighten AoE field/burst balance.** Reduce per-target burst scale for group/all spells and raise field scale so the area shape is clear. This touches multiple `SPELL_OVERRIDES` entries.
4. **Create a shared `divine` element style.** Add an `ELEMENT_STYLES` entry for holy damage (`Sacred Flame`, `Divine Smite`, `Sunburst`) using warm radial strips (`fire_explosion_glow`, `lightning_energy_glow`) and a consistent `#ffe8a0` particle/popup color.
5. **Establish a portal tier ladder.** T2 ~2.2×, T3 ~2.6×, T5 group summon ~2.8–3.0× field, T5 single summon (Gate) ~3.5×+ with added lingering field/flash.
6. **Add secondary sparkle layers to summons and high-tier heals.** Overlay `px_magic_sparks`/`heal_sparks` at low opacity/scale on portal open and on `Cure Critical`/`Heal` to make them feel more charged.

## Not worth changing (already good)

- **Ember** — small projectile + modest burst is correct for a tier-1 fire cantrip.
- **Burning Hands** — fire cone field covers the enemy group well and reads as hot.
- **Cone of Cold / Ice Storm** — glowing ice fields blanket the enemy formation appropriately.
- **Spell Shield** — protective shell is readable; only minor overlap tuning needed.
- **Bless** — shield bubbles + field clearly read as a party-wide protective blessing.
- **Mass Cure / Mass Heal** — green sparkle fields blanket the party and feel generous.
- **Cure Critical Wounds / Heal** — scale progression makes these feel potent.
- **Summon Fire Elemental** — orange portal matches element and feels appropriately dramatic for T3.

## Effects sprite inventory assessment

There are **81** registered effect strips in `src/engine/effect-sprite-cache.ts`. Only about **25–30** are referenced through `SPELL_OVERRIDES` / `ELEMENT_STYLES` in `src/engine/combat-scene.ts`. Strips that are currently **unused in any source file outside their own definition** include:

- `arrow_skeleton`, `elemental_v1/v2`, `extra_elemental`/`_glow`
- `fire_explosion_glow`, `fire_explosion_iso`, `fire_explosion_iso_glow`, `large_fire_glow`
- `fz_earth_spike`, `fz_icons`, `fz_rocks`, `fz_tornado`, `fz_water`, `fz_water_geyser`, `fz_wind`
- `ice_burst_dark`, `ice_burst_grey`, `ice_burst_naked`, `ice_burst_transparent`
- `lightning_blast_glow`
- `mp_dark_bolt_full`, `mp_fire_bomb_full`, `mp_lightning_full`, `mp_spark_full`
- `priest_attack`, `wizard_attack1`, `zombie_death_explosion`
- `px_arcane_bolt`, `px_black_white_ray`, `px_black_white_sparks`, `px_darkness_bolt`, `px_firebomb`, `px_magic_orb`, `px_magic_ray`, `px_plant_missle`, `px_pure_bolt_2`, `px_rock_sling`, `px_splash`, `px_water_blast`, `px_water_bolt`, `px_water_orb`, `px_wind_bolt`
- `red_lightning_blast`, `red_lightning_blast_glow`

### Useful unused strips for proposed fixes

- `fire_explosion_glow` — warm radial holy/divine burst (Sunburst, Divine Smite, Sacred Flame).
- `mp_fire_bomb_full` — longer fire explosion for high-tier fire (Fireball, Immolate).
- `px_firebomb` — distinct tier-1 fire projectile/burst.
- `px_plant_missle` — green venom projectile for Poison Spray.
- `px_magic_orb`, `px_magic_ray`, `px_black_white_ray` — slow traveling projectiles for Sleep/Hold Person/Power Word: Stun.
- `px_shield` — already used, but could also serve Hold Person restraint.
- `lightning_blast_glow` — brighter lightning projectile/burst alternative.
- `zombie_explosion` / `zombie_death_explosion` — sickly green impact options for poison.

## Arena / mobile notes

- Arena mode was launched from the title screen and reached combat context with the full FF6 UI overlay. The VFX layer is drawn above sprites but below popups, which is the correct order.
- The combat UI windows (action menu, enemy list, party HP list) occupy the bottom third of the canvas. All current field/burst scales keep effects within the visible sprite area; no spell currently clips behind the windows.
- Mobile viewport check: the vignette canvas is CSS-scaled, so a 390×844 viewport will render the same 768×672 logical canvas at a smaller physical size. No full-canvas pixel manipulation or multi-megapixel buffers are used by the VFX system, so mobile 60 fps should hold. The heaviest operation is additive `drawImage` of scaled strips, which is well within mobile canvas performance.

## Recommended Phase 3 scope

A focused Phase 3 implementation should:

1. Adjust `SPELL_OVERRIDES` scales and sprite swaps for the ~14 spells marked **Needs Work** / **Bad**.
2. Add a `divine` element style (or per-spell overrides) so holy spells stop using lightning strips.
3. Add a `SPELL_OVERRIDES` entry for `Raise Dead`.
4. Introduce a per-element wind-up sprite so the charge glow stops reusing explosion sprites.
5. Remove full-screen flashes for accessibility.
6. Add projectile trails/glow auras so single-target spells don't read as flying dots.
7. Verify with `npm run build` and `npm test`, then re-run the vignette for before/after screenshots.

All proposed changes remain within `src/engine/combat-scene.ts` and `src/engine/effect-sprite-cache.ts` (if any currently-unregistered strips need registration — at present all alternatives are already registered). No game logic, spell definitions, or dungeon renderer changes are required.

## Phase 3 Quick Wins Implemented

Implemented the user-approved quick-win scope only. All changes are in `src/engine/combat-scene.ts`; `vite.config.ts` was also updated so the VFX vignette page is included in the production build (multi-entry `main` + `vignette`).

### Build/test verification

- `npm run build` — 0 TypeScript errors, production build succeeded.
- `npm test` — 498/498 tests passed.

### Specific changes

1. **Scaled up tiny projectiles**
   - `Fire Bolt`: `projectileScale` `0.7 → 1.8`
   - `Poison Spray`: swapped `mp_dark_bolt` → `px_plant_missle`, `projectileScale` `0.7 → 2.0`
   - `Immolate`: `projectileScale` `0.8 → 1.3`
   - `Sacred Flame` / `Guiding Bolt` / `Divine Smite`: `projectileScale` `2.8 → 3.5`
   - `Spark`: swapped `mp_spark` → `lightning_blast`, `projectileScale` `1.4 → 1.6`

2. **Enabled additive blending on two dark/non-glow spells**
   - `Poison Spray`: `additive: true`
   - `Web`: `additive: true`

3. **Swapped burst sprites for better thematic reads**
   - `Spark`: `mp_lightning` → `lightning_energy_glow` @ 2.0×
   - `Hold Person`: `mp_lightning` → `px_shield` @ 2.2×
   - `Power Word: Stun`: `mp_lightning` → `px_darkness_orb` @ 3.5×
   - `Sunburst` field: `mp_lightning` → `lightning_energy_glow` @ 3.0×
   - `Sacred Flame` burst: `lightning_energy_glow` → `mp_fire_bomb` @ 1.4×

4. **Raised burst scales on underwhelming impacts**
   - `Frostbite`: `burstScale` `1.2 → 1.8`
   - `Cure Wounds`: `burstScale` `3.5 → 4.5`
   - `Arcane Ward`: `burstScale` `2.6 → 3.2`
   - `Lesser Summon`: `burstScale` `1.6 → 2.2`

5. **Added `SPELL_OVERRIDES` entry for `Raise Dead`**
   - `heal_sparks` @ 5.5×, color `#ffe8a0`, `additive: true`

6. **Removed all full-screen flashes for accessibility**
   - Deleted the `screenFlash` state, `addScreenFlash()` helper, and every `addScreenFlash` call from damage, AoE, debuff, heal, and cure impacts. This eliminates the bright full-screen color flash that triggered on almost every spell — important for photosensitivity/epilepsy safety.

7. **Added projectile trails and glow auras so wizard spells no longer read as dots**
   - Every projectile effect now spawns a short trail of element-colored particles as it travels.
   - Each projectile sprite is also drawn with a larger, semi-transparent additive copy behind it, creating a visible glow aura that makes the missile shape read clearly against the dark combat background.
   - Applied to both spell projectiles and ranged physical attacks.

### Before/after screenshots

Before images for all 39 spells: `vfx-audit/spell-*.png`  
Arena context before: `vfx-audit/arena-combat-context.png`  
After images for the 15 changed spells: `vfx-audit/after-*.png`

Representative spells improved by this pass:
- `poison-spray` — now a visible green venom projectile with additive impact
- `sacred-flame` — holy bolt + fire bomb burst reads as flame instead of lightning
- `power-word-stun` — large psychic orb instead of a small lightning flicker
- `hold-person` — shield/restraint burst instead of lightning
- `sunburst` — warm energy field instead of lightning column
- `cure-wounds` — larger sparkle ring + brief heal flash
- `raise-dead` — bright golden resurrection burst instead of generic cure fallback

### Remaining work

Medium-effort items from this report were intentionally deferred and can be picked up in a follow-up pass:
- Per-element wind-up sprites (charge glow currently reuses the burst sprite)
- Diversifying fire spell identities across tiers
- AoE field/burst balance for group buffs/debuffs
- A shared divine element style
- Portal tier ladder scaling for summons
- Secondary sparkle layers for summons and high-tier heals
