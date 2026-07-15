# Effect Sprite Utilization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status note (2026-07-14):** M1–M3 wiring + typo-guard tests landed in `combat-scene.ts` / `effect-sprite-wiring.test.ts`. Lazy-load CORE/OPTIONAL split (Task 7) deferred — still preload-all; still worth a follow-up if boot cost matters.

**Goal:** Make better use of the ~48 registered-but-unstyled strips in `public/assets/effects/` so spells and attacks read more distinct, without new art packs or combat-math changes.

**Architecture:** Keep `effect-sprite-cache.ts` as the only registry. Improve coverage by (1) wiring high-value unused strips into `SPELL_OVERRIDES` / `ELEMENT_STYLES` / weapon VFX in `combat-scene.ts`, (2) giving basic tier-1 bolts and melee/staff attacks their own looks instead of over-sharing element defaults, (3) optionally lazy-loading or pruning true duplicates so boot doesn’t preload unused sheets. Typos fail silently to procedural rings — Arena visual checks are mandatory.

**Tech Stack:** TypeScript, existing `EffectStyle` tables in `combat-scene.ts`, `EFFECT_STRIPS` in `effect-sprite-cache.ts`, Arena mode + optional `vfx-vignette.html` for side-by-side review.

**Constraints (AGENTS.md):** No combat damage/SP/targeting changes. No corridor renderer changes. Prefer reusing registered IDs as-is (engine does **not** tint strips — native PNG colors only).

**Related docs:** `docs/superpowers/specs/2026-07-12-vfx-integration-plan.md` (scales, silent fallback, field×2), `docs/AGENT-READING-LIST.md`.

---

## Current inventory (2026-07-14)

| Bucket | Count | Meaning |
|--------|------:|---------|
| On disk | 111 | All under `public/assets/effects/` |
| In `EFFECT_STRIPS` | 111 | All registered |
| Named by combat styles / weapon VFX | ~63 | Live |
| Registered but never named | ~48 | Boot-loaded, unused |

**Especially wasteful (clear mappings, not used):**

| Asset ID | File | Better use |
|----------|------|------------|
| `px_fireball` | `pixelart-fireball.png` | T1 `mage-fire-bolt` / `mage-ember` (today shares `fz_fireball` with Fireball) |
| `px_arcane_bolt` | `pixelart-arcane-bolt.png` | `mage-spark` / arcane ward poke |
| `px_water_bolt`, `px_water_orb`, `px_water_blast`, `px_splash` | pixelart-water-*.png | Differentiate `mage-water-bolt` / `tidal-wave` / `deluge` |
| `px_wind_bolt` | `pixelart-wind-bolt.png` | `mage-gust` (leave cyclone/tempest on Foozle) |
| `px_rock_sling` | `pixelart-rock-sling.png` | `mage-stone-shard` |
| `px_darkness_bolt` / `px_darkness_orb` | pixelart-darkness-*.png | `mage-disintegrate` / silence-adjacent dark feel (check native colors) |
| `px_magic_sparks`, `px_magic_orb`, `px_magic_ray` | pixelart-magic-*.png | Buffs / `mage-arcane-ward` / sparkle variety |
| `mp_lightning` (+ full) | magicpack-lightning*.png | Lightning element burst/field (today: `lightning_blast` + `mp_spark`) |
| `mp_dark_bolt` (+ full) | magicpack-dark-bolt*.png | Disintegrate / gate charge / undead enemy spells |
| `fz_explosion` | `foozle-explosion.png` | Meteor / immolate alternate burst (vs only `mp_fire_bomb` / mushroom) |
| `fz_molten_spear` | `foozle-molten-spear.png` | `mage-immolate` projectile or meteor shards |
| `free_slash` | `free-slash.png` | Fighter/duelist physical slash variety |
| `wizard_attack1/2`, `priest_attack` | *.png | Class weapon VFX (staff path currently collapses to `staff_attack` only) |
| `zombie_death_explosion` | *.png | Enemy death FX for undead (if death VFX hook exists or can reuse burst) |
| Ice alts (`ice_burst`, `_dark`, `_grey`, `_naked`, `_transparent`) | ice_burst*.png | Cold spell ladder: frostbite → cone → storm → freezing sphere |
| Glow/iso fire variants | `fire_explosion_*`, `large_fire_glow` | Bigger AoE / glow stage — or **do not load** if redundant with live `fire_explosion` / `large_fire` |
| `elemental_v1/v2`, `extra_elemental*` | elemental*.png | Summon presentation or **defer** (busy sheets; hard to read at combat scale) |
| `fz_icons` | `foozle-icons.png` | Likely UI atlas — **do not** use as combat burst; candidate to remove from combat preload |

**Already live but worth not “fixing”:** Foozle portals/elements, retro*/retro2*/retro3*, priest_heal, warlock/rune/ghostfire beams, arrows/cannonball.

---

## File map

| File | Role |
|------|------|
| `src/engine/effect-sprite-cache.ts` | Registry; optional split into `CORE_STRIPS` + `OPTIONAL_STRIPS` / lazy load |
| `src/engine/combat-scene.ts` | `ELEMENT_STYLES`, `SPELL_OVERRIDES`, status styles, weapon VFX helpers |
| `src/vfx-vignette.ts` / `vfx-vignette.html` | Optional review UI for spelling/scale |
| `docs/superpowers/specs/2026-07-12-vfx-integration-plan.md` | Scale formulas (projectile ~45px, burst ~130px, field accounts for ×2) |

---

## Strategy (do in this order)

1. **Differentiate what already shares art** — biggest player-facing win.  
2. **Fill element defaults that still fall back to fire_explosion / wrong pack.**  
3. **Class weapon polish** — staff/slash/wizard/priest strips.  
4. **Cull or lazy-load** true duplicates so “use more effectively” isn’t “preload more junk.”

---

### Task 1: Inventory spreadsheet in-repo (lock the truth)

**Files:**
- Create: `docs/superpowers/plans/effect-sprite-inventory-2026-07-14.md` (or append a table to this plan’s appendix after regen)
- Modify: none required for gameplay

- [ ] **Step 1:** Regenerate used vs unused with a small script that parses `EFFECT_STRIPS` (including `"hyphen-keys"`) and all `projectile|burst|field|charge|effect` string literals **and** `return "…"` weapon paths in `combat-scene.ts`.
- [ ] **Step 2:** Mark each unused row: `wire` / `lazy` / `delete-candidate`.
- [ ] **Step 3:** Commit as docs-only if desired.

---

### Task 2: Tier-1 bolt identity (Pixelart set)

**Files:**
- Modify: `src/engine/combat-scene.ts` (`SPELL_OVERRIDES`)
- Verify: Arena L1 mage/priest casts

Goal: stop early spells looking like miniature Fireballs.

| Spell | Suggested style |
|-------|-----------------|
| `mage-fire-bolt` | projectile `px_fireball`, burst `px_firebomb` or small `fire_explosion`, scales via 16×16 formula |
| `mage-ember` | projectile `px_fireball`, burst `fz_explosion` (or keep small) |
| `mage-spark` | projectile `px_arcane_bolt` or `mp_spark`, burst `px_magic_sparks` |
| `mage-frostbite` | keep `px_ice_lance` but burst `ice_burst` (non-glow) for quieter T1 |
| `mage-water-bolt` | projectile `px_water_bolt`, burst `px_splash` |
| `mage-stone-shard` | projectile `px_rock_sling`, burst `fz_rocks` (smaller scale) |
| `mage-gust` | projectile `px_wind_bolt`, burst `fz_wind` |
| `priest-cure-wounds` / low heals | if they only use generic heal — prefer `heal_sparks` / `px_magic_sparks` for cast flourish where missing |

- [ ] **Step 1:** Add `SPELL_OVERRIDES` entries; copy scale recipes from existing pixelart overrides (`priest-sacred-flame`, etc.).
- [ ] **Step 2:** Arena-cast each spell; confirm strip animates (not procedural ring).
- [ ] **Step 3:** Screenshot before/after if documenting.

---

### Task 3: Element ladder differentiation (cold / lightning / fire AoE)

**Files:**
- Modify: `src/engine/combat-scene.ts` (`ELEMENT_STYLES` + high-tier overrides)

| Spell / role | Asset to introduce |
|--------------|-------------------|
| Cold T1–T2 | `ice_burst`, `ice_burst_naked` |
| Cold T3–T4 (`cone`, `ice-storm`) | keep `ice_burst_glow`; optional `ice_burst_dark` for storm |
| `mage-freezing-sphere` | larger `ice_burst_glow` field + distinct charge |
| Lightning default | burst/field prefer `mp_lightning` over only `mp_spark` |
| `mage-meteor-swarm` | projectile `fz_molten_spear` or multi `fz_fireball`; burst `fz_explosion` |
| Poison spray | keep verdant; optional projectile `px_plant_missle` if it reads poison/plants |

- [ ] **Step 1:** Patch overrides; do **not** retint (native colors).
- [ ] **Step 2:** Arena L9+ or debug SP cast through each ladder step.
- [ ] **Step 3:** Adjust `burstScale`/`fieldScale` using integration plan formulas (remember field ×2).

---

### Task 4: Dark / arcane / disintegrate identity

**Files:**
- Modify: `src/engine/combat-scene.ts`

- [ ] **Step 1:** Point `mage-disintegrate` at `mp_dark_bolt` / `px_darkness_orb` (projectile + burst) instead of generic physical/fire-adjacent look.
- [ ] **Step 2:** Point `mage-gate` charge or burst secondary at `mp_dark_bolt_full` or `px_darkness_bolt` if readable.
- [ ] **Step 3:** Verify undead enemy specials still readable (don’t steal their only red-lightning look unless intentional).

---

### Task 5: Weapon / class attack strips

**Files:**
- Modify: `src/engine/combat-scene.ts` (weapon VFX helper ~1290+)

Today: Mage/Priest → `staff_attack`; others → `slash_attack`. Unused: `wizard_attack1/2`, `priest_attack`, `free_slash`.

- [ ] **Step 1:** Map Mage → `wizard_attack1` (or alternate `wizard_attack2` on crit if easy).
- [ ] **Step 2:** Map Priest → `priest_attack`.
- [ ] **Step 3:** Map Fighter/physical → `free_slash` or keep `slash_attack`; Thief keep arrows.
- [ ] **Step 4:** Arena Auto through a full round; confirm timing still lands with hit popups.

---

### Task 6: Summon / elemental sheets (optional, lower priority)

**Files:**
- Modify: `SPELL_OVERRIDES` for summon spells only if sheets read clearly at ~0.6–1.0 scale

- [ ] **Step 1:** Preview `elemental_v1`, `elemental_v2`, `extra_elemental` in vignette at combat sizes.
- [ ] **Step 2:** If muddy/noisy, mark `lazy` / leave unused — **do not force**.
- [ ] **Step 3:** If clear, use as field flourish on `mage-summon-fire-elemental` / `mage-conjure-elemental` behind existing portals.

---

### Task 7: Boot cost — stop preloading junk

**Files:**
- Modify: `src/engine/effect-sprite-cache.ts`, maybe `src/main.ts` `loadEffectSprites()`

Today `loadEffectSprites()` loads **every** strip. After Tasks 2–5, many “unused” become used; remaining duplicates should not block first paint.

- [ ] **Step 1:** Split registry into `CORE_EFFECT_STRIPS` (referenced by live styles) vs `OPTIONAL_EFFECT_STRIPS`.
- [ ] **Step 2:** `loadEffectSprites()` loads CORE only; `getEffectSprite` triggers lazy `loadEffect` for OPTIONAL on first miss.
- [ ] **Step 3:** Or delete/move to `public/assets/effects/_unused/` files marked delete-candidate (`fz_icons` if not combat-usable, redundant ice alts if you settle on 2 cold looks).
- [ ] **Step 4:** Confirm no 404 / ring fallback regression in Arena for wired spells.

---

### Task 8: Guardrail test (catch silent typos)

**Files:**
- Create: `src/engine/effect-sprite-cache.test.ts` or extend an existing combat-scene test

- [ ] **Step 1:** Test that every string in `SPELL_OVERRIDES` / `ELEMENT_STYLES` / `STATUS_STYLES` / weapon VFX returns a non-null strip **or** is explicitly allowlisted as procedural-only.
- [ ] **Step 2:** Test that every `EFFECT_STRIPS[].url` exists under `public/assets/effects/` (read filesystem in vitest).
- [ ] **Step 3:** `npx vitest run` on the new file + `npm run build`.

---

### Task 9: Visual verification checklist

- [ ] Arena L1: fire-bolt, spark, ember, frostbite, cure-wounds, sacred-flame — distinct projectiles.
- [ ] Arena mid: fireball vs burning-hands vs immolate — not identical mushrooms.
- [ ] Arena water/earth/wind ladder: bolt ≠ wave ≠ storm.
- [ ] Lightning spell uses Magicpack lightning sheet visibly.
- [ ] Disintegrate reads dark, not fire.
- [ ] Mage staff vs Priest staff vs Fighter slash looks different.
- [ ] Corridor / non-combat unchanged.
- [ ] `npm test && npm run build` green.

---

## Out of scope

- New PNG generation or ImageMagick recolors (unless a wired strip reads as the wrong element).
- Arena room camera rewrite.
- Changing spell balance, SP, or unlocks.
- Using `fz_icons` as a combat burst without cropping frames.

---

## Suggested milestone slicing

| Milestone | Tasks | Outcome |
|-----------|-------|---------|
| **M1 — Distinct basics** | 1–2 | Early spells stop looking identical |
| **M2 — Element ladders** | 3–4 | Cold/lightning/dark tier readable |
| **M3 — Attacks** | 5 | Class weapons use their strips |
| **M4 — Hygiene** | 6–8 | Optional sheets decided; boot lighter; typo tests |
| **M5 — Sign-off** | 9 | Screenshot pass |

---

## Success metric

- ≥ **85** of 111 files referenced by a live combat style **or** explicitly moved out of combat preload.
- No spell that has a dedicated strip still falling through to `fire_explosion` / procedural ring.
- Zero new TS errors; vitest guard passes.

---

## Appendix — quick wire cheat sheet (M1 start)

```ts
// combat-scene.ts SPELL_OVERRIDES — illustrative starting points only
"mage-fire-bolt": {
  color: "#ff8c42",
  projectile: "px_fireball",
  projectileScale: 2.8, // 16px → ~45px
  burst: "px_firebomb",
  burstScale: 8.0,      // 16px → ~130px; confirm in Arena
},
"mage-spark": {
  color: "#d0e8ff",
  projectile: "px_arcane_bolt",
  projectileScale: 2.8,
  burst: "px_magic_sparks",
  burstScale: 6.0,
},
"mage-water-bolt": {
  color: "#a0f0ff",
  projectile: "px_water_bolt",
  projectileScale: 2.8,
  burst: "px_splash",
  burstScale: 7.0,
  glow: true,
},
```

Confirm every scale in Arena — field scales must account for the engine’s ×2 field multiplier.
