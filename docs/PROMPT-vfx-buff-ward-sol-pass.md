# OnyxLabyrinth combat VFX — Top-5 expansion plan + Session 1 (buff/ward)

You are a senior combat-presentation engineer working directly in:

/home/sloppymo/OnyxLabyrinth

This is an **implementation session with a locked roadmap**. You will:

1. Confirm and refine the **Top 5 easiest × most necessary** presentation
   expansions below against live source (spell system + `SPELL_OVERRIDES`).
2. Write the refined plan into your closing report (so the next session can
   paste it without rediscovery).
3. **Implement only Slice 1** this session (Priest Shield of Faith vs Bless),
   with full dual-renderer evidence, then **stop**.

Do not implement Slices 2–5 now. Do not expand into corridor art, doors,
combat math, Phaser menus, or perk engines.

## Why these five (easiest × necessary)

Ranked by **player-visible coherence gain ÷ implementation risk** using
existing effect strips and `SPELL_OVERRIDES` only:

| # | Slice | Why necessary | Why easy |
|---|-------|---------------|----------|
| 1 | Priest buff/ward (Shield of Faith vs Bless) | Same `px_shield` fallback; single vs party is unreadable | Two overrides + tests; heal pattern already proven |
| 2 | Stun twins (Hold Person vs Power Word Stun) | Both paralysis / `free_stunburst`; banners do the work | Two spell IDs; Web already shows how to diverge |
| 3 | Miss presentation | Evades are popup-only (`"MISS"`) — weakest impact read | Wire an existing strip on miss events; no new math |
| 4 | Summon portal polish | Summon cast / portal is thin vs heal/damage language | Override summon styles; facing already mirrored |
| 5 | Mag vs Tech mid-impact pass | Players still lean on banners for Mag≠Tech | Mostly Arena evidence + thin Tech overrides if gaps |

**Explicitly deferred** (necessary but *not* easy / not this prompt): F2–F5
door art (human), boss unique strips (art), audio sample reliability,
Arena shell polish, perk v1.1 systems.

## Product and visual direction

OnyxLabyrinth is a TypeScript/Vite dungeon crawler using vanilla DOM, CSS,
Canvas, and Phaser. Combat uses an FF6-style composition:

- Enemies on the left
- Party on the right
- Chunky 16-bit presentation
- Dark, desaturated backgrounds
- Sparse, readable luminous accents
- Strong silhouettes instead of indistinct “glow soup”

This work concerns combat spell VFX only — but you **must** understand the
live spell system first so presentation matches how spells actually resolve
(target, event shape, Mag vs Tech), not just strip names.

## Top-5 detailed plans (lock these; refine IDs from live source)

### Slice 1 — Priest buff / ward differentiation ← **THIS SESSION**

**Spells:** `priest-shield-of-faith` (singleAlly armor buff) ·
`priest-bless` (allAllies armor buff)

**Problem:** Both resolve via shared buff/magicScreen fallback →
`px_shield` burst + field. Single vs party is invisible without the banner.

**Plan:**

1. Spell-system orientation (buff/magicScreen table + CombatEvent path).
2. `SPELL_OVERRIDES` for both IDs; leave Mage Arcane Ward / Spell Shield /
   Holy Aura untouched.
3. Visual contract:
   - Shield of Faith → focused single-body ward (not party wash, not heal).
   - Bless → party-wide blessing field (not Holy Aura solar twin, not heal).
4. Tests pin ≠ fallback, ≠ each other, ≠ neighboring ward overrides.
5. Evidence: 2 spells × Phaser + `?phaser=0` mid-impact under
   `vfx-audit/2026-07-31-buff-wards/{phaser,canvas}/`.

**Files (expected):** `combat-choreography.ts`, `combat-scene.test.ts`

**Done when:** four mid-impact shots + focused tests + build; no math/art.

---

### Slice 2 — Stun status twins (next session)

**Spells:** `mage-hold-person` · `mage-power-word-stun` (confirm ids/effects
in `spells.ts`). **Neighbor:** `mage-web` already diverges (`free_tangle`) —
do not regress it.

**Problem:** Both land paralysis via shared `STATUS_STYLES.paralysis` /
`free_stunburst` (and/or matching overrides). Hold vs Power Word read identical.

**Plan:**

1. Trace disable → `statusInflicted` / `STATUS_STYLES` / any existing
   `SPELL_OVERRIDES` for these two.
2. Differentiate by **weight**: Hold = binding/immobilize silhouette;
   Power Word = abrupt command/impact stun — still Mag, not Tech slash.
3. Prefer spell-id overrides over rewriting global `paralysis` style (so
   enemy paralysis stays coherent unless intentionally shared).
4. Tests: two overrides differ; Web still tangled; no heal/ward strip theft.
5. Evidence:
   `vfx-audit/<date>-stun-twins/{phaser,canvas}/` — 4 mid-impact frames.

**Files:** `combat-choreography.ts`, `combat-scene.test.ts`  
**Stop if:** no strip can split meaning without looking like damage/Tech.

---

### Slice 3 — Miss presentation (next session)

**Problem:** Evades choreograph to popup `"MISS"` only (`impactSteps` /
miss color) — no burst strip. Feels cheap next to wired hits.

**Plan:**

1. Find miss event path in `playTurn` / `impactSteps` (null damage / evade).
2. Inventory candidate strips (soft puff / spark / whoosh — **not** damage
   boom, not heal cross). Inspect visually.
3. Add a restrained miss burst (and optional tiny field) on miss only;
   keep `"MISS"` popup; do not change evade math or rates.
4. Cover enemy miss on party and party miss on enemy if both share the path.
5. Evidence: at least 2 mid-impact misses per renderer (force via debug /
   Arena scripting if needed) under
   `vfx-audit/<date>-miss/{phaser,canvas}/`.

**Files:** `combat-choreography.ts` (+ tests). Touch painters only if miss
effects are dropped on the floor (unlikely).  
**Stop if:** no suitable strip — report art ask; do not use damage FX.

---

### Slice 4 — Summon portal polish (next session)

**Spells:** Mage/Priest summon ids (`mage-summon-fire-elemental`,
`priest-summon-guardian`, celestial variants — confirm live list).

**Problem:** Summons share thin `fz_portal` kind fallback / light overrides;
arrival reads weaker than heals/smite. Facing is already mirrored toward
enemies — **do not redo facing** unless broken.

**Plan:**

1. Table every `kind: "summon"` spell + current override/fallback.
2. Differentiate school: Mage elemental portal vs Priest holy summon
   (portal vocabulary ≠ heal miracle ≠ Raise Dead flower).
3. Optional: slightly stronger charge / field on cast tile only — still
   presentation-only; no summon HP/AI changes.
4. Evidence: one Mage + one Priest summon × both renderers under
   `vfx-audit/<date>-summon-portals/{phaser,canvas}/`.

**Files:** `combat-choreography.ts`, tests. Preserve any dirty facing fixes.  
**Stop if:** portal strips collide with Holy Aura / Heal sun language.

---

### Slice 5 — Mag vs Tech mid-impact clarity (next session)

**Problem:** Mag/Tech may still be banner-dependent for mid-impact reads;
Tech should not inherit spell-orb / shield vocabulary.

**Plan:**

1. Pick 3 Mag casts + 3 Tech techniques with existing overrides.
2. Arena-capture mid-impact pairs (Phaser + `?phaser=0`) proving Mag ≠ Tech
   without reading banners.
3. Only if a Tech hit still reads as “spell glow,” add the **smallest**
   Tech-side override (slash/spark vocabulary already in inventory) — no
   Mag nerfs, no math.
4. Evidence folder:
   `vfx-audit/<date>-mag-vs-tech/{phaser,canvas}/` with a one-page matrix
   in `report.json` (spell/tech id → strips observed).

**Files:** mostly evidence + maybe 0–2 Tech overrides.  
**Done when:** matrix shows clear Mag vs Tech silhouette language.

---

## Session rule

| This session | Later sessions |
|--------------|----------------|
| Orient on spell system | Paste this roadmap |
| Implement **Slice 1 only** | One slice per session |
| Full evidence for Slice 1 | Same verify bar |
| Report refined plans for 2–5 | Do not jump ahead |

## Required reading before editing

Read these files in full (or the cited sections):

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROMPT-spell-effects-sol-pass.md`
4. The “Tier-2 priest heal VFX slice” / higher-tier heal notes in
   `progress.md` (trust live `SPELL_OVERRIDES` over stale inventory tables)
5. `src/engine/effect-sprite-wiring.test.ts`
6. **Spell system (required — do not skim):**
   - `src/data/spells.ts` — full `SpellEffect` union, `SpellTarget`, Mage +
     Priest catalogs; inventory every `kind: "buff"` and `kind: "magicScreen"`
     spell (id, class, tier, target, effect fields, description)
   - `src/game/combat-spells.ts` (or wherever player/enemy spell resolution
     lives — locate via search) — how buff / magicScreen casts emit
     `CombatEvent`s (`isBuff`, targets, heal vs armor). Presentation must
     follow those events; do not invent parallel timing.
   - `src/engine/combat-ui.ts` — how Magic menu filters utility spells and
     opens target select for `singleAlly` vs resolves `allAllies` immediately
7. Presentation wiring:
   - `src/engine/combat-choreography.ts` (`SPELL_OVERRIDES`, kind fallbacks,
     `resolveEffectStyle`, buff/field spawn in `playTurn`)
   - `src/engine/combat-scene.test.ts` (Tier-2 + higher-tier heal tests)
   - `src/engine/effect-sprite-cache.ts`

Trust live source and tests over older planning documents. The inventory
tables inside `PROMPT-spell-effects-sol-pass.md` still mark several heals as
“shared heal fallback”; those rows are stale after the Tier-2 and higher-tier
heal slices — re-check `SPELL_OVERRIDES` in source.

## Spell system orientation (do this before choosing strips)

Before editing choreography, write a short internal checklist (include a
compressed version in the closing report §2 Baseline findings):

1. **Effect kinds** — List every `SpellEffect.kind` from `spells.ts`. Note
   which kinds share a single `resolveEffectStyle` fallback (especially
   `buff` + `magicScreen` → `px_shield`).
2. **Targets that matter for wards** — `self` / `singleAlly` / `allAllies`
   change whether VFX must look single-body vs party-wide. Confirm
   `priest-shield-of-faith` is `singleAlly` and `priest-bless` is `allAllies`
   in live data.
3. **Same-kind collisions** — Table all armor buffs / magic screens:

   | Spell | Class | Target | Kind | Already has SPELL_OVERRIDE? |
   |-------|-------|--------|------|----------------------------|
   | (fill from live source) | | | | |

   This table is why Mage Arcane Ward / Spell Shield / Holy Aura stay out of
   scope: same fallback family, already differentiated.
4. **CombatEvent contract** — From a buff cast, which structured events fire?
   Does presentation key off `spellId`, `isBuff`, or both? Confirm
   `resolveEffectStyle(spellId, …)` is hit for these two Priest spells today
   only via the kind fallback (no override).
5. **Roadmap cross-check** — Confirm Slice 2–5 spell ids still match live
   `spells.ts` (Hold Person, Power Word Stun, summons). Note any drift in
   the report; do not implement those slices now.
6. **Summon note (context only)** — Summons use enemy strips and are drawn
   mirrored to face the enemy line (canvas + Phaser). Do **not** change
   summon facing or summon spells in Slice 1; if the worktree already has
   that fix dirty, preserve it.
7. **Hard rule** — Understanding the spell system does **not** authorize
   changing `spells.ts`, SP costs, durations, armor values, or combat
   resolution. Presentation-only.

If anything in the spell system contradicts this prompt’s spell IDs/targets,
**stop and report** — do not “fix” data to match the prompt.

## Worktree safety

At the beginning, run:

```bash
git status --short
git diff --stat
git diff -- src/engine/combat-choreography.ts src/engine/combat-scene.test.ts
```

The higher-tier heal slice was committed and pushed
(`feat(combat): differentiate higher-tier priest heal VFX`). The worktree may
be clean, or it may already contain unrelated dirty files from parallel work
(e.g. summon facing mirror in `combat-scene.ts` /
`combat-phaser-stage.ts`).

Preserve all existing unrelated changes. Do not revert, overwrite, reformat,
stage, or otherwise absorb unrelated work.

Do not use:

- `git add -A`
- `git reset`
- `git checkout --`
- `git rebase`
- force operations

Do not commit, push, deploy, or open a PR unless explicitly asked.

When reporting, clearly distinguish pre-existing changes from changes made
during this session. Stage only the files this slice actually needs if/when
the user later asks for a commit.

## Completed baselines: do not redo them

### Tier-2 Priest heals (committed earlier)

Current mappings:

#### Cure Serious Wounds — `priest-cure-serious`

- Projectile: `heal_sparks`
- Burst: `priest_heal`
- Intended read: focused green cross/orb, stronger than Cure Wounds

#### Cure Blindness — `priest-cure-blind`

- Burst: `px_black_white_sparks`
- Intended read: monochrome cleanse rather than generic healing

#### Mass Cure — `priest-mass-cure`

- Three `heal_sparks` projectiles
- Two `heal_sparks` bursts
- Restrained `priest_heal` field
- Intended read: simultaneous party-wide green rings/crosses

Evidence: `vfx-audit/2026-07-31-tier2-heals/{phaser,canvas}/`

### Higher-tier single-target Priest heals (just shipped)

Current mappings (verify in live `SPELL_OVERRIDES`):

#### Cure Critical Wounds — `priest-cure-critical`

- Projectile + burst: `priest_heal`
- `burstCount: 2`, larger scale than Serious
- No field / underlay
- Intended read: escalated single-target cross punch past Serious

#### Regenerate — `priest-regenerate`

- Projectile + burst: `heal_sparks`
- `burstCount: 3`, `burstDurationMs: 1400`
- Underlay: `px_magic_sparks`
- Intended read: soft lingering spark knit (sustain), not a bigger punch

#### Heal — `priest-heal`

- Charge + burst underlay: `retro_sun_ring`
- Projectile + burst: `priest_heal` (`burstCount: 2`)
- No party-wide bloom / Raise Dead vocabulary
- Intended read: single-target divine miracle

Evidence: `vfx-audit/2026-07-31-higher-tier-heals/{phaser,canvas}/`

Inspect those six mid-impact frames and both `report.json` files before
designing buffs. Do not borrow heal miracle / mass bloom / resurrection
language for wards.

### Already-differentiated wards (out of scope — leave alone)

These are **not** part of this slice. Cite them only as neighboring vocabulary
to avoid colliding with:

| Spell ID | Kind / target | Live presentation (approx.) |
|----------|---------------|-----------------------------|
| `mage-arcane-ward` | buff / self | `px_arcane_bolt` → `px_magic_orb` burst + `px_shield` field |
| `mage-spell-shield` | magicScreen / allAllies | `retro2_ward_square` burst + field |
| `priest-holy-aura` | buff / allAllies (T7) | `retro2_solar_ring` burst + field (twin / longer field) |

## Live effect inventory baseline

Reverify these numbers before claiming drift:

- 111 PNGs under `public/assets/effects/`
- 110 registered `EFFECT_STRIPS`
- 1 orphan: `pixelart-magic-ray.png`
- 55 combat spells with resolvable styles
- No registered-but-unused combat strips (`fz_icons` allowlisted non-combat)

`pixelart-magic-ray.png` was deliberately rejected because it reads as a flat
gradient band rather than a bolt. Do not register or reuse it.

Do not generate, download, scrape, or add new art in this slice.

## Immediate objective (Session 1 only)

Complete **Slice 1** from the Top-5 plan:

# Priest buff / ward differentiation

Verified live (2026-07-31): both spells have **no** `SPELL_OVERRIDES` entry and
resolve through the shared buff / magicScreen kind fallback:

```
{ color: COLORS.sp, burst: "px_shield", burstScale: 1.6,
  field: "px_shield", fieldScale: 0.8, scale: 1.2 }
```

### Shield of Faith

- ID: `priest-shield-of-faith`
- Tier: 1
- Target: `singleAlly`
- Effect: `{ kind: "buff", stat: "armor" }`
- Meaning: shrouds **one** ally in a protective aura that turns aside blows
- Current presentation: shared bland `px_shield` burst + field

### Bless

- ID: `priest-bless`
- Tier: 3
- Target: `allAllies`
- Effect: `{ kind: "buff", stat: "armor" }`
- Meaning: bestows a protective blessing on the **whole party**
- Current presentation: identical shared bland `px_shield` burst + field

Treat these two as one coherent ward cluster: single-target faith shield vs
party blessing. Prefer solving via explicit `SPELL_OVERRIDES` only.

### Do not expand (same-kind neighbors, not this slice)

Other buff / magicScreen spells already diverge or belong to other schools.
Do **not** retune them unless a collision forces a one-line comment:

- `mage-arcane-ward` — already overridden (Mage self ward)
- `mage-spell-shield` — already overridden (magic screen square)
- `priest-holy-aura` — already overridden (T7 solar aura)

Keep the slice to `priest-shield-of-faith` and `priest-bless` only. Do not
expand into heals, status twins, miss, summons, Mag vs Tech, UI, or combat
math.

## Design goals

Create an immediately legible distinction without relying on the spell banner:

1. **Shield of Faith** must read as a **single-ally** protective ward —
   focused shield / aura on one body, not a party-wide wash.
2. **Bless** must read as a **party-wide** blessing — simultaneous coverage
   across allies, still protective/holy rather than heal/resurrect language.
3. The two must differ at a glance from each other **and** from:
   - `mage-arcane-ward` (arcane self ward / orb)
   - `mage-spell-shield` (`retro2_ward_square` magic screen)
   - `priest-holy-aura` (T7 solar vortex — do not demote Bless into that look)
   - Heal vocabulary (`priest_heal`, `heal_sparks`, mass bloom, sun miracle)
   - Raise Dead (`retro_dot_flower`)
4. Prefer silhouette / layering / field-vs-single differences over scale-only
   hierarchy.
5. Keep Mag-versus-Tech clarity: wards must not use slash, blade, or
   stunburst language.
6. Preserve the restrained 16-bit palette; avoid glow soup that hides actors
   or the bottom FF6 windows.
7. Inspect candidate strips visually (actual silhouettes/animation), not only
   names.

Potential existing vocabulary includes, but is not limited to:

- `px_shield` (current shared fallback — may remain one side’s base if layered)
- `free_wardring`
- `retro2_ward_square` (already Mage Spell Shield — avoid identical twin)
- `retro2_solar_ring` / `retro_sun_ring` (Holy Aura / Heal — collide carefully)
- `retro2_arcane_sigil`
- `retro3_sigil_charge`
- `px_magic_orb` / `px_arcane_bolt` (Arcane Ward — Mage school)
- Soft divine accents already used on Priest damage (`retro_starburst`, etc.)

These are candidates, not mandatory assignments. If available strips cannot
produce a convincing single-vs-party ward distinction without stealing Holy
Aura / Spell Shield / heal miracle identity, report the art gap instead of
assigning a wrong strip.

## Architecture constraints

The shared presentation clock and state live in:

`src/engine/combat-choreography.ts`

Important components:

- `SPELL_OVERRIDES`
- `ELEMENT_STYLES`
- `STATUS_STYLES`
- `resolveEffectStyle()`
- `collectReferencedEffectIds()`
- `playTurn()`
- `updateScene()`

Both renderers consume the same choreography state:

- Phaser: `src/engine/combat-phaser-stage.ts`
- Canvas rollback: `src/engine/combat-scene.ts`

Phaser is painter-only. Do not introduce Phaser tweens, timelines, or
renderer-specific spell timing. The choreography engine must remain the
single clock.

Prefer solving this slice entirely through `SPELL_OVERRIDES` and focused
tests.

A small presentation-only choreography adjustment is allowed only if style
data is demonstrably insufficient. If you make one:

- Keep it additive
- Drive it through existing CombatEvents
- Do not change resolution timing
- Do not change buff values, targets, SP cost, duration, initiative, or turn
  order
- Ensure both painters receive identical scene state

Do not change `src/data/spells.ts`.

## Hard prohibitions

Do not change:

- Combat math
- Buff / armor formulas or power
- SP costs
- Targeting
- Status duration
- Turn order or initiative
- Encounter behavior
- Perks
- Equipment
- Party progression
- Movement or collision
- Floor/map data
- Corridor renderer or perspective
- Tilesets or environment art
- DOM Magic/Tech menus
- Audio
- Enemy or party sprites

Do not remove or weaken:

- Fog
- Amber glow
- Vignette
- CRT scanlines
- Torch flicker

## Required workflow

### 1. Establish the live baseline

Before editing:

- Complete the **Spell system orientation** checklist above (buff /
  magicScreen table + CombatEvent path for these two casts).
- Confirm `priest-shield-of-faith` and `priest-bless` still lack
  `SPELL_OVERRIDES` and resolve to `px_shield` via the buff kind fallback.
- Inspect neighboring ward overrides (`mage-arcane-ward`,
  `mage-spell-shield`, `priest-holy-aura`) so you do not collide.
- Inspect prior heal evidence dirs (Tier-2 + higher-tier) so you do not reuse
  heal miracle language for wards.
- Reverify effect registry/disk counts (111 / 110 / 1 orphan).
- Run the focused tests and build.
- Capture baseline Arena casts for both target spells if practical, so the
  shared `px_shield` fallback can be compared with the new result.

Suggested commands:

```bash
npx vitest run src/engine/effect-sprite-wiring.test.ts src/engine/combat-scene.test.ts
npm run build
git diff --check
```

If the baseline fails, determine whether it is caused by pre-existing
unrelated work. Do not “fix” unrelated failures.

### 2. Inspect candidate strips

Inspect candidate effect sheets or make temporary local contact sheets if
useful.

Temporary audit output must go under a gitignored or temporary location such
as:

- `/tmp/`
- `vfx-audit/`

Do not add generated audit artifacts to shipping assets. Leave
`vfx-audit/` untracked (gitignored).

### 3. Implement the smallest coherent change

Expected source scope:

- `src/engine/combat-choreography.ts`
- `src/engine/combat-scene.test.ts`

Only touch another file if the presentation genuinely requires it, and
explain why.

Add explicit `SPELL_OVERRIDES` for:

- `priest-shield-of-faith`
- `priest-bless`

Keep comments concise and focused on visual semantics (single ward vs party
blessing).

Update reference collection or wiring tests if new referenced IDs require
it. Every referenced style ID must:

- Exist in `EFFECT_STRIPS`
- Point to a real file under `public/assets/effects/`
- Pass the unused/reference guardrails

### 4. Add focused tests

Tests should pin semantic distinctions, not fragile implementation trivia.

At minimum, prove:

- Neither spell still resolves to the untouched generic buff fallback alone
  without an override (or, if one side keeps `px_shield`, prove the pair
  differs via scale/layers/field/charge).
- Shield of Faith and Bless differ from each other.
- Shield of Faith does not look party-wide (no mass field language that
  matches Bless / Holy Aura / Spell Shield identically).
- Bless does not collapse onto `priest-holy-aura` or `mage-spell-shield`
  strip identity.
- Neither borrows Raise Dead / Mass Heal miracle vocabulary.
- Existing Tier-2 and higher-tier heal tests remain intact.
- All effect IDs are registered.

Do not import `combat-phaser-stage.ts` from jsdom tests.

### 5. Verify mechanically

Run:

```bash
npx vitest run src/engine/effect-sprite-wiring.test.ts src/engine/combat-scene.test.ts
npm run build
git diff --check
```

If an unrelated flaky test fails, rerun it in isolation and report both
outcomes. Do not conceal failures.

### 6. Verify in the real game

A green suite is not sufficient.

Use Arena or `?debug=1` to cast both target spells in actual combat.

Verify both:

1. Default Phaser renderer
2. Canvas rollback using `?phaser=0`

Use the production preview when possible:

```bash
npx vite preview --port 5176 --base /OnyxLabyrinth/
```

Open:

- `http://localhost:5176/OnyxLabyrinth/`
- `http://localhost:5176/OnyxLabyrinth/?phaser=0`

Use repository playtest helpers or Playwright. Prefer structured debug state
over DOM scraping:

- `window.__onyxDebug.snapshot()`
- `window.render_game_to_text()`
- `window.__onyxDebug.isIdle()`
- `window.__onyxDebug.readiness()`

Always use `snapshot().route`, not bare `mode`, to identify the live screen.

Capture a meaningful mid-impact frame for each spell in each renderer:
**four** final images total (2 spells × 2 painters).

A valid frame must show the intended effect, not merely the spell banner,
targeting menu, charge prelude, or completed popup.

Save final evidence under:

`vfx-audit/YYYY-MM-DD-buff-wards/{phaser,canvas}/`

(use today’s date, e.g. `2026-07-31-buff-wards`).

Include a small report for each renderer recording:

- Final route and combat phase
- Effect IDs observed during each cast
- Readiness state
- Browser warnings
- Console errors
- Network errors
- Debug errors
- Failed assets

Remove temporary browser drivers or debug scaffolding before finishing.

### 7. Inspect the screenshots yourself

Do not merely state that screenshots exist.

For every image, verify:

- The intended strip is visibly present.
- The spell is legible without reading the banner.
- Shield of Faith and Bless differ at a glance.
- Shield of Faith reads as single-ally; Bless reads as party-wide.
- Neither is confused with Holy Aura, Spell Shield, Arcane Ward, Heal, or
  Raise Dead.
- VFX do not obscure actor identity, popups, or the bottom combat windows.
- Phaser and Canvas tell the same visual story.
- No strip is stretched, clipped, incorrectly anchored, or replaced by a
  procedural missing-asset fallback.
- The final palette remains consistent with the game.

If the screenshot contradicts the intended style, revise and recapture.

## Definition of done

The session is complete only when all of these are true:

- Top-5 roadmap refined against live source and included in the report
- Exactly Slice 1 (Priest buff/ward: `priest-shield-of-faith`,
  `priest-bless`) was implemented — Slices 2–5 planned only
- Spell-system orientation checklist completed and reflected in the report
  (buff/magicScreen table + event path); no spell data changed.
- The two have distinct readable presentations (single ward vs party bless).
- Neighboring Mage wards and `priest-holy-aura` remain intact.
- Heal baselines remain intact.
- No combat mechanics changed.
- No new art was added.
- Every referenced strip is registered and exists on disk.
- Focused tests pass.
- `npm run build` passes with zero TypeScript errors.
- `git diff --check` is clean.
- Four real Arena mid-impact captures exist.
- Phaser and `?phaser=0` are both visually verified.
- Runtime reports contain no unexplained errors or failed assets.
- Temporary debug code is removed.
- Unrelated dirty files remain preserved (including any summon-facing fix).
- No commit or push was made.

## Stop conditions

Stop and report evidence instead of inventing a new system if:

- Existing CombatEvents cannot express single-vs-party ward presentation
  safely.
- A candidate strip creates misleading heal, resurrection, damage, or Mage
  school language.
- Phaser and Canvas render materially different results from the same scene
  state.
- A suitable visual distinction requires new art.
- Verification is blocked by a reproducible browser or asset failure.

Do not continue into Slices 2–5 during this session.

## Roadmap handoff (Slices 2–5 — plan only)

In the closing report, paste an updated copy of the Top-5 plans from this
document after your live-source cross-check (correct any drifted spell ids).
That paste is the next session’s starting prompt body — do not implement them
now.

Locked order:

1. ~~Priest buff/ward~~ ← done this session (when Slice 1 completes)
2. Stun twins (Hold Person vs Power Word Stun)
3. Miss presentation
4. Summon portal polish
5. Mag vs Tech mid-impact clarity

## Required closing report

Return:

0. **Top-5 plan lock** — refined table + per-slice plans for 2–5 (ids
   verified against live `spells.ts`); note any deferred/changed items
1. Slice goal (Slice 1 only)
2. Baseline findings — **must include** the compressed spell-system
   orientation (effect kinds overview, buff/magicScreen collision table,
   CombatEvent path for these two casts, confirmation of targets from live
   `spells.ts`)
3. Files changed
4. Exact old → new strip/style mapping for each spell
5. Why each visual choice fits its spell (tie to target/`buff` semantics)
6. Focused test results
7. Build and `git diff --check` results
8. Phaser evidence path and findings
9. Canvas evidence path and findings
10. Runtime warnings/errors/failed assets
11. Remaining gaps or genuine art requests
12. Explicit confirmation that:
    - Only Slice 1 was implemented
    - Combat math / `spells.ts` were untouched
    - Spell system was reviewed (not skipped)
    - No new art was added
    - Unrelated dirty work was preserved
    - No commit or push was performed
    - Slices 2–5 remain unimplemented but planned
