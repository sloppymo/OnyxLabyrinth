# Prompt for another LLM: Create a comprehensive plan to integrate downloaded spell VFX sprites

> **Status:** this plan has been executed. Every asset listed below has been copied into `public/assets/effects/` and registered in `src/engine/effect-sprite-cache.ts`. The remaining work is to design spells that use the water/wind/earth/plant strips.

## Project context

You are working on **OnyxLabyrinth**, a Wizardry-style first-person dungeon crawler built with TypeScript + Vite, no framework. The UI is hand-built DOM + a 2D canvas. The code is in `/home/sloppymo/OnyxLabyrinth/`.

The game recently gained a melee technique system and an expanded spell list. The next task is to give every spell a distinct visual identity by incorporating the free sprite assets the user has already downloaded.

**Your job is to produce a detailed, actionable plan** for converting, importing, registering, and wiring these sprites into the game's spell VFX system. Do not implement the changes yet — produce the plan document and a step-by-step checklist that the user (or another LLM) can execute.

---

## Files and systems you must understand

Read these files before planning:

1. `src/data/spells.ts` — all Mage and Priest spell definitions. Note `id`, `name`, `target`, `effect.kind`, and `effect.element` for each spell.
2. `src/engine/effect-sprite-cache.ts` — the registry for standalone VFX sprite strips. Strips live in `public/assets/effects/`. Each strip has `name`, `url`, `frameWidth`, `frameHeight`, `frameCount`, `fps`, and optional `loop`.
3. `src/engine/combat-scene.ts` — especially the `ELEMENT_STYLES`, `SPELL_OVERRIDES`, `STATUS_STYLES`, and `resolveEffectStyle()` functions. This is where spells are mapped to VFX.
4. `docs/superpowers/specs/2026-07-12-downloaded-vfx-usage-plan.md` — the user's existing usage plan mapping the downloaded assets to spells.
5. `docs/superpowers/specs/2026-07-11-spell-vfx-inventory.md` — prior inventory of the spell VFX gaps.
6. `docs/superpowers/specs/2026-07-11-spell-vfx-prompt.md` — technical spec for the sprite format and engine conventions.
7. `docs/superpowers/specs/2026-07-11-spell-vfx-work-prompt.md` — earlier work prompt that may have additional context.
8. `AGENTS.md` — project rules. Pay special attention to: build must pass, do not change game logic, do not remove existing effects, verify renderer changes visually.

The user also has a temporary inventory of the downloaded sprites at `/tmp/vfx-sprite-inventory.md` and a helper script at `/tmp/gen_inventory.sh`.

---

## Downloaded assets (already on disk)

Located in `/home/sloppymo/Downloads/Spell Effects/`.

### Pack 1: Pixelart Spells by DevWizard (CC0)

Folder: `Pixelart Spells/PNG Files/`

22 horizontal PNG strips. Frame size = height; frame count = width / height. All have alpha transparency.

| File | Size | Frames | Frame size | Suggested use |
|------|------|--------|------------|---------------|
| `Arcane Bolt.png` | 96×16 | 6 | 16×16 | Arcane projectile |
| `Black And White Ray.png` | 128×16 | 8 | 16×16 | Engine-tintable ray (holy, arcane, etc.) |
| `Black And White Sparks.png` | 96×16 | 6 | 16×16 | Engine-tintable sparkle (heal, buff) |
| `Bolt Of Purity.png` | 96×16 | 6 | 16×16 | Holy bolt projectile |
| `Darkness Bolt.png` | 96×16 | 6 | 16×16 | Recolor green for poison; or dark bolt |
| `Darkness Orb.png` | 96×16 | 6 | 16×16 | Recolor for poison orb / dark orb |
| `Fireball.png` | 96×16 | 6 | 16×16 | Fire projectile |
| `Firebomb.png` | 96×16 | 6 | 16×16 | Fire burst / field |
| `Ice Lance.png` | 64×16 | 4 | 16×16 | Cold projectile |
| `Light Bolt.png` | 96×16 | 6 | 16×16 | Lightning/holy projectile |
| `Magic Orb.png` | 96×16 | 6 | 16×16 | Arcane shield / orb burst |
| `Magic Ray.png` | 128×16 | 8 | 16×16 | Magic beam |
| `Magic Sparks.png` | 96×16 | 6 | 16×16 | Heal / buff / cure sparkles |
| `Pixelart Shield.png` | 288×48 | 6 | 48×48 | Shield / Bless / Arcane Ward / Spell Shield |
| `Plant Missle.png` | 96×16 | 6 | 16×16 | Unused (no nature spells) |
| `Pure Bolt 2.png` | 96×16 | 6 | 16×16 | Holy bolt variant |
| `Rock Sling.png` | 16×16 | 1 | 16×16 | Unused (no earth spell) |
| `Splash.png` | 192×32 | 6 | 32×32 | Unused (no water spells) |
| `Water Blast.png` | 96×16 | 6 | 16×16 | Unused |
| `Water Bolt.png` | 96×16 | 6 | 16×16 | Unused |
| `Water Orb.png` | 96×16 | 6 | 16×16 | Unused |
| `Wind Bolt.png` | 96×16 | 6 | 16×16 | Unused (no wind spells) |

### Pack 2: Magic Pack 9 by ansimuz (royalty-free)

Folder: `Magic Pack 9 files/`

Spritesheets are single horizontal rows. Individual-frame folders contain one extra frame each.

| Asset | Sheet size | Frames | Frame size | Suggested use |
|-------|------------|--------|------------|---------------|
| `spritesheets/Fire-bomb.png` | 896×64 | 14 | 64×64 | Best fireball explosion in the pack |
| `sprites/FireBomb/*.png` | 15 frames | 15 | 64×64 | Full fire-bomb animation |
| `spritesheets/Lightning.png` | 640×128 | 10 | 64×128 | Lightning strike + ground burst |
| `sprites/Lightning/*.png` | 11 frames | 11 | 64×128 | Full lightning animation |
| `spritesheets/spark.png` | 224×32 | 7 | 32×32 | Spark projectile |
| `sprites/spark/*.png` | 8 frames | 8 | 32×32 | Full spark animation |
| `spritesheets/Dark-Bolt.png` | 704×88 | 11 | 64×88 | Dark bolt; recolor for poison |
| `sprites/DarkBolt/*.png` | 12 frames | 12 | 64×88 | Full dark-bolt animation |

### Pack 3: Foozle Pixel Magic Effects (CC0)

Folder: `Foozle_2DE0001_Pixel_Magic_Effects/`

Each folder contains numbered 64×64 frames (and one `Icons` folder with 32×32 icons). Frames must be concatenated into horizontal strips. The big sheet `Spell/Pixel_Magic_Effects_Animations.png` is a 10×13 grid of 64×64 cells with the same content.

| Folder | Frames | Suggested use |
|--------|--------|---------------|
| `Fire_Ball` | 10 | Fire projectile |
| `Explosion` | 7 | Fire/smoke burst |
| `Portal` | 10 | Summon cast-flash / Gate |
| `Molten_Spear` | 12 | Alternative fire projectile |
| `Rocks` | 10 | Unused (no earth spell) |
| `Earth_Spike` | 9 | Unused |
| `Water` | 10 | Unused (no water spells) |
| `Water_Geyser` | 13 | Unused |
| `Wind` | 10 | Unused (no wind spells) |
| `Tornado` | 9 | Unused |
| `Icons` | 10 | Unused by VFX engine (could be UI icons later) |

---

## Current spell VFX state

Read `src/engine/combat-scene.ts` to confirm this, but here is the summary:

- Only 5 spells have custom `SPELL_OVERRIDES`.
- Everything else falls back to `ELEMENT_STYLES` by damage element.

### Spells with custom overrides

| Spell id | Current effect |
|----------|----------------|
| `mage-ember` | fireball + fire_explosion_glow |
| `mage-frostbite` | wizard_attack2 + ice_burst_glow |
| `mage-poison-spray` | red_lightning_blast_glow + red_energy_glow |
| `priest-guiding-bolt` | priest_attack + lightning_energy_glow |
| `priest-divine-smite` | priest_attack + lightning_energy_glow |

### All other spells fall back to generic element styles

| Element / effect kind | Fallback |
|-----------------------|----------|
| fire damage | fireball + fire_explosion / large_fire |
| cold damage | wizard_attack2 + ice_burst |
| lightning damage | lightning_blast + lightning_energy |
| undead damage | red_energy |
| poison damage | red_energy |
| heal | priest_heal |
| buff / magicScreen | lightning_energy |
| cure / resurrect | priest_heal |
| disable | ice_burst_glow / red_energy / lightning_energy |
| fizzleField / dispelMagic | red_energy |
| summon | lightning_energy |

The goal is to replace most of these fallbacks with unique assets from the downloaded packs.

---

## Spell list to cover

The plan must account for every combat spell. Utility spells (`mage-wayfinder`, `mage-levitate`, `priest-light`) are dungeon-only and do not need combat VFX.

### Mage combat spells (27)

| id | Name | Target | Effect kind | Element |
|----|------|--------|-------------|---------|
| `mage-fire-bolt` | Fire Bolt | singleEnemy | damage | fire |
| `mage-arcane-ward` | Arcane Ward | self | buff | — |
| `mage-spark` | Spark | singleEnemy | damage | lightning |
| `mage-ember` | Ember | singleEnemy | damage | fire |
| `mage-frostbite` | Frostbite | singleEnemy | damage | cold |
| `mage-poison-spray` | Poison Spray | singleEnemy | damage | poison |
| `mage-burning-hands` | Burning Hands | groupEnemies | damage | fire |
| `mage-sleep` | Sleep | singleEnemy | disable | sleep |
| `mage-hold-person` | Hold Person | singleEnemy | disable | paralysis |
| `mage-web` | Web | groupEnemies | disable | paralysis |
| `mage-lesser-summon` | Lesser Summon | self | summon | — |
| `mage-fireball` | Fireball | allEnemies | damage | fire |
| `mage-cone-of-cold` | Cone of Cold | groupEnemies | damage | cold |
| `mage-summon-fire-elemental` | Summon Fire Elemental | self | summon | — |
| `mage-immolate` | Immolate | singleEnemy | damage | fire |
| `mage-ice-storm` | Ice Storm | allEnemies | damage | cold |
| `mage-power-word-stun` | Power Word: Stun | singleEnemy | disable | paralysis |
| `mage-spell-shield` | Spell Shield | allAllies | magicScreen | — |
| `mage-silence` | Silence | groupEnemies | fizzleField | — |
| `mage-dispel-magic` | Dispel Magic | allEnemies | dispelMagic | — |
| `mage-conjure-elemental` | Conjure Elemental | allAllies | summon | — |
| `mage-gate` | Gate | self | summon | — |

### Priest combat spells (16)

| id | Name | Target | Effect kind | Element |
|----|------|--------|-------------|---------|
| `priest-cure-wounds` | Cure Wounds | singleAlly | heal | — |
| `priest-sacred-flame` | Sacred Flame | singleEnemy | damage | undead |
| `priest-guiding-bolt` | Guiding Bolt | singleEnemy | damage | lightning |
| `priest-shield-of-faith` | Shield of Faith | singleAlly | buff | — |
| `priest-cure-serious` | Cure Serious Wounds | singleAlly | heal | — |
| `priest-neutralize-poison` | Neutralize Poison | singleAlly | cure | poison |
| `priest-mass-cure` | Mass Cure | allAllies | heal | — |
| `priest-divine-smite` | Divine Smite | singleEnemy | damage | divine |
| `priest-summon-guardian` | Summon Guardian | self | summon | — |
| `priest-cure-critical` | Cure Critical Wounds | singleAlly | heal | — |
| `priest-bless` | Bless | allAllies | buff | — |
| `priest-mass-heal` | Mass Heal | allAllies | heal | — |
| `priest-raise-dead` | Raise Dead | singleAlly | resurrect | — |
| `priest-sunburst` | Sunburst | allEnemies | damage | undead |
| `priest-summon-celestial-guardian` | Summon Celestial Guardian | self | summon | — |
| `priest-summon-celestial` | Summon Celestial | allAllies | summon | — |
| `priest-heal` | Heal | singleAlly | heal | — |

---

## Technical requirements for the plan

1. **Sprite format:** The engine expects horizontal PNG strips with equal-sized frames. Each strip must be registered in `src/engine/effect-sprite-cache.ts` with `frameWidth`, `frameHeight`, `frameCount`, and `fps`. Use `fps: 12` as a default unless the animation clearly needs slower/faster.
2. **File location:** Converted/copied PNGs must end up in `public/assets/effects/` so Vite serves them at runtime.
3. **Naming convention:** Use kebab-case names, prefixed by source if needed to avoid collisions, e.g. `pixelart-fireball.png`, `foozle-portal.png`, `magic-pack-fire-bomb.png`.
4. **Avoid overwriting existing assets:** The repo already has `fireball.png`, `fire_explosion.png`, `ice_burst.png`, etc. Keep the new files separate and wire them through `SPELL_OVERRIDES`.
5. **Recoloring:** Some assets are grayscale or tintable (e.g., `Black And White Ray.png`, `Black And White Sparks.png`, `Magic Sparks.png`). The engine can draw them with `color` via the canvas. Alternatively, you may choose to pre-recolor in ImageMagick / GIMP. The plan must state which approach for each asset.
6. **Scaling:** The engine's `EffectStyle` supports `scale`, `projectileScale`, `burstScale`, and `fieldScale`. Use these to fit effects to the canvas instead of resizing the source art. Keep source art at native pixel resolution (nearest-neighbor scaling at runtime preserves crisp pixels).
7. **Conversion tooling:** Plan to use ImageMagick for batch concatenation (Foozle frames and Magic Pack 9 individual frames). Example:
   ```bash
   convert +append frame1.png frame2.png ... output-strip.png
   ```
   For 2D sheets like Foozle's big animation grid, decide whether to slice it or use the individual frames. The per-folder numbered frames are usually easier.
8. **License attribution:** CC0 assets require no attribution. `Magic Pack 9` is royalty-free. If any CC-BY assets are later added, the plan must note attribution, but the current three packs do not require it.
9. **No game logic changes:** The plan must only touch VFX wiring, asset files, and the effect registry. Do not change damage formulas, SP costs, targeting, or spell unlocks.
10. **Build and test:** The plan must include running `npm run build` and `npm test` after changes. The TypeScript build must have zero errors. Visual verification in Arena mode is strongly recommended.

---

## Deliverables for the plan

Produce a plan document (markdown) with the following sections. Save it to `docs/superpowers/specs/2026-07-12-vfx-integration-plan.md`.

### 1. Asset conversion checklist

For every sprite that will be imported, list:
- Source file path
- Destination filename in `public/assets/effects/`
- Conversion command (if any)
- Frame width, frame height, frame count, fps
- Whether it needs recoloring and how
- License (CC0 / royalty-free)

### 2. Effect registry additions

List every new entry to add to `EFFECT_STRIPS` in `src/engine/effect-sprite-cache.ts`, including all fields.

### 3. Spell VFX mapping

For every combat spell, list the `EffectStyle` to use. This is the new or updated `SPELL_OVERRIDES` entries and any changes to `ELEMENT_STYLES` / `STATUS_STYLES` fallbacks. Include `color`, `projectile`, `burst`, `field`, and scale values.

### 4. Implementation order

Break the work into phases (e.g., fire school, cold school, lightning/holy, heals/buffs, status/summons). Each phase should be independently testable.

### 5. Commands to run

Include the exact shell commands for converting assets, plus the build and test commands.

### 6. Verification steps

- How to run the game in Arena mode
- Which spells to cast to verify each new effect
- How to check for missing or misaligned frames

### 7. Risk / fallback notes

Identify any sprites that might not look good when scaled, any that need manual cleanup, and any spells that still lack a good asset (e.g., water/wind spells have no matching spell in the current list).

### 8. Optional follow-ups

- Should unused assets be archived somewhere?
- Should the `Icons` sheet be turned into spell UI icons later?
- Should recolored variants be generated for additional elements (e.g., a green `Lightning.png` for poison, a gold `Fire-bomb.png` for divine)?

---

## Specific questions the plan must answer

1. Which of the 22 Pixelart Spells PNGs will be imported as-is, which will be renamed, and which will be skipped?
2. For the Magic Pack 9 spritesheets vs individual frames, which version should be used for each effect and why?
3. Which Foozle folders will be converted to strips, and which will be skipped because there is no matching spell?
4. What is the exact mapping for each combat spell (projectile / burst / field / color / scale)?
5. Which existing generic effects can be retired from the `SPELL_OVERRIDES` / `ELEMENT_STYLES` fallbacks once unique assets are wired?
6. Are there any cases where two spells should intentionally share the same asset to preserve visual consistency (e.g., all fire spells sharing one explosion)?
7. What recoloring/tinting is needed, and is it done via engine `color` or ImageMagick?
8. How many new effect files will be created in `public/assets/effects/`?
9. What is the total build/test verification sequence?

---

## Constraints and reminders

- Do not delete existing assets in `public/assets/effects/` unless you are explicitly replacing them with a superior version and the plan justifies it.
- Do not modify `src/data/spells.ts` except possibly to add visual metadata if the project convention allows it. The current convention is to map spells to effects in `combat-scene.ts` via `SPELL_OVERRIDES`, so prefer that.
- Do not introduce new runtime dependencies. Use only ImageMagick (already available) and shell scripts for batch conversion.
- If a script is needed, place it in `scripts/` and document it.
- Keep the source assets in `~/Downloads/Spell Effects/`; only copy converted outputs into `public/assets/effects/`.
- The plan should aim to cover **all or close to all** combat spells. If a spell cannot be covered well, explain why and propose a fallback.

---

## Output format

Return the plan as a markdown file at:

```
/home/sloppymo/OnyxLabyrinth/docs/superpowers/specs/2026-07-12-vfx-integration-plan.md
```

Keep the tone technical and concise. Use tables where possible. Do not write the actual implementation code or copy files yet — this is a plan only.
