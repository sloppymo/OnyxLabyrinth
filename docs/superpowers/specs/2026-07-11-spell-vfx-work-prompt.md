# Work Prompt: Implement 16-bit Spell VFX for OnyxLabyrinth

You have been given two reference documents in this repository:

1. `/docs/superpowers/specs/2026-07-11-spell-vfx-inventory.md` — an inventory of the **current** spell VFX system, including all existing sprite assets, how effects are wired into the game, and which spells currently reuse generic effects.
2. `/docs/superpowers/specs/2026-07-11-spell-vfx-prompt.md` — the full design brief for new 16-bit spell effect sprite sheets, with a prioritized spell list, art-style guidelines, file formats, and integration steps.

Your job is to read **both documents carefully**, then create and integrate new 16-bit pixel-art spell VFX into the game.

---

## Step 0 — Read and plan

Before writing any code or creating any art, read both documents fully and produce a short plan that includes:

- Which spells you will create unique VFX for (start with Priority 1: damage spells, then Priority 2: heals/buffs, etc.)
- Which existing assets, if any, you will keep vs. replace
- A list of new PNG files you intend to create, with dimensions and frame counts
- Any code changes needed in `src/engine/effect-sprite-cache.ts` and `src/engine/combat-scene.ts`

Do not proceed to implementation until the plan is complete.

---

## Step 1 — Understand the technical format

All effect sprites are **horizontal PNG strip sheets** — one PNG file with animation frames laid out left-to-right in a single row. The engine crops each frame by a fixed `frameWidth × frameHeight`.

Key files:

- `public/assets/effects/` — where PNG files live
- `src/engine/effect-sprite-cache.ts` — where each strip is registered in the `EFFECT_STRIPS` record
- `src/engine/combat-scene.ts` — where `SPELL_OVERRIDES` and `ELEMENT_STYLES` map spells to effect names

Example strip registration:

```typescript
fireball: {
  name: "fireball",
  url: "fireball.png",
  frameWidth: 16,
  frameHeight: 16,
  frameCount: 12,
  fps: 12,
},
```

Example spell override:

```typescript
"mage-fire-bolt": {
  color: "#ff8c42",
  projectile: "fire-bolt_proj",
  burst: "fire-bolt_burst",
  scale: 2.0,
},
```

Effect types:

- `projectile` — travels from caster to target, loops, rotates to face direction
- `burst` — plays once at impact point, fades out
- `field` — covers an area (enemy group / party), plays once, fades partially

Rendering is pixel-perfect (`imageSmoothingEnabled = false`). Canvas size is **768 × 672** pixels. Effects must be visible against dark backgrounds.

---

## Step 2 — Create the sprite assets

For each spell you choose to implement, create:

- One or more PNG strip sheets (projectile, burst, and/or field as appropriate)
- Register each new strip in `EFFECT_STRIPS` in `src/engine/effect-sprite-cache.ts`
- Wire the spell to the new effects in `SPELL_OVERRIDES` in `src/engine/combat-scene.ts`

### Art-style requirements

- **16-bit / SNES aesthetic** (Final Fantasy VI, Chrono Trigger)
- **Pixel art** with deliberate, visible pixels; no anti-aliasing, no smooth gradients
- **Transparent backgrounds** (alpha = 0 behind the effect)
- **Limited palette** per effect: 4–8 colors plus alpha
- **Dithered gradients** are acceptable for glow/halos
- **Bright cores + dark-compatible rims** so effects read against the dark combat scene
- Typical frame sizes:
  - Projectiles: 16×16 to 32×32
  - Bursts: 48×48 to 64×64
  - Fields: 96×48 to 128×64
- Typical frame counts: 8–14 frames at 12 fps

### Naming convention

Name each file using the pattern:

```
<spell-name-without-class-prefix>-<type>.png
```

Examples:

- `fire-bolt_proj.png`
- `fire-bolt_burst.png`
- `burning-hands_field.png`
- `cure-wounds_burst.png`
- `raise-dead_burst.png`

Use kebab-case. The `name` field in `EFFECT_STRIPS` should match the filename without `.png`.

---

## Step 3 — Integrate into the game

### Register new strips

For every new PNG, add an entry to `EFFECT_STRIPS` in `src/engine/effect-sprite-cache.ts`:

```typescript
"fire-bolt_proj": {
  name: "fire-bolt_proj",
  url: "fire-bolt_proj.png",
  frameWidth: 24,
  frameHeight: 16,
  frameCount: 8,
  fps: 12,
},
```

### Wire spells to new effects

For each spell, add an entry to `SPELL_OVERRIDES` in `src/engine/combat-scene.ts`. Use `projectileScale`, `burstScale`, and `fieldScale` if the default `scale` is not right for each stage.

```typescript
"mage-fire-bolt": {
  color: "#ff8c42",
  projectile: "fire-bolt_proj",
  burst: "fire-bolt_burst",
  field: "large-fire_field",   // only if applicable
  scale: 2.0,
  projectileScale: 1.5,
  burstScale: 2.0,
},
```

If you add a new element style (e.g., a better generic `divine` fallback), update `ELEMENT_STYLES` as well.

---

## Step 4 — Verify the work

After every batch of changes, run the verification commands:

1. `npm run build` — must pass with **zero TypeScript errors**
2. `npm test` — all tests must pass
3. `npm run dev` — open the game, enter **Arena mode** (fastest way to reach combat), and cast each modified spell
4. Confirm:
   - The projectile (if any) travels from caster to target
   - The burst appears at the correct position
   - Fields cover the correct side of the field (enemies at x ≈ 26%, party at x ≈ 72%)
   - Effects are visible against the dark background
   - Animation is smooth and frames are not misaligned
   - No console errors about missing effects

If a spell has no projectile (e.g., cone spells, area spells, summons), only a field or burst is expected. That is fine — just confirm it looks correct.

---

## Step 5 — Update the inventory document

After implementation, update `/docs/superpowers/specs/2026-07-11-spell-vfx-inventory.md` to reflect:

- Which new sprites now exist
- Which spells now use which new effects
- Which spells still reuse generic effects (so future work is documented)
- Any new `EFFECT_STRIPS` entries or `SPELL_OVERRIDES` added

Keep the document accurate so the next person does not redo your research.

---

## Step 6 — Refresh GitHub Pages assets

If the build succeeds and you want the changes visible on the deployed site:

```bash
npm run build
rm -f docs/assets/index-*.js docs/assets/index-*.css
cp -r dist/* docs/
cp -r dist/assets/* docs/assets/
```

This copies the production build into `docs/`, which is served by GitHub Pages.

---

## Important constraints

- **Do not break existing behavior.** Spells that currently work must continue to work. If you replace an existing effect asset, make sure its `EFFECT_STRIPS` registration is updated and all references are changed.
- **Do not edit combat math.** This task is VFX only. Do not change `src/game/combat.ts` except to add new `CombatEvent` types if absolutely necessary (which is not expected here).
- **Preserve existing unused assets** unless explicitly replacing them. It is fine to leave old variants in place; just point spells at the new ones.
- **Keep commits clean.** Follow conventional commits: `feat(assets):`, `feat(combat-vfx):`, etc. Remove any debug logging before committing.

---

## Suggested starting scope

If you cannot do everything, implement in this order:

1. **Fire damage spells** — Ember, Fire Bolt, Burning Hands, Fireball, Immolate. These are the most visible and currently the most reused.
2. **Cold damage spells** — Frostbite, Cone of Cold, Ice Storm.
3. **Holy / divine spells** — Sacred Flame, Guiding Bolt, Divine Smite, Sunburst. Note: Guiding Bolt and Divine Smite already have custom overrides but reuse generic burst graphics.
4. **Heals** — Cure Wounds, Cure Serious, Cure Critical, Heal, Mass Cure, Mass Heal, Raise Dead.
5. **Status / buff / utility** — Sleep, Hold Person, Web, Power Word: Stun, Arcane Ward, Shield of Faith, Bless, Spell Shield, Silence, Dispel Magic, Neutralize Poison.
6. **Summons** — Lesser Summon, Summon Fire Elemental, Conjure Elemental, Gate, Summon Guardian, Summon Celestial Guardian, Summon Celestial.

Report your final scope in a summary at the end.
