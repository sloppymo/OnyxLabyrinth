# Prompt: Combat Depth — Status/Flee Levers, Wireable Perks, Spell DoT/Regen

You are a senior game/systems engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).
Work with full autonomy: explore, implement, test, prove in browser, and update the reading-list docs.
Do **not** commit or push unless asked.

## Why this pass (post 2026-07-13)

These are already **shipped** — do not reopen as bugs:
- L9+ Magic/Tech scroll-follow, wrap, `T` shortcut, dynamic footer hints
- Perk overlay explicit ←/→ confirmation (Arena + dungeon)
- Dead perk tiers wired or honestly stubbed
- Path A T6–T7: Meteor Swarm, Disintegrate, Freezing Sphere / Mass Regenerate, Holy Aura

Still open (reading-list #5 + deferred from spell-expansion §5.2–5.3 + remaining perk stubs):
- Status / flee are not meaningful player levers
- ~22 `TODO(v1.1)` markers remain in `src/data/perks.ts`
- Endgame spells shipped **stripped**: no burn DoT on Meteor, no regen ticks on Mass Regenerate
- Several “Not yet implemented” perks are **wireable now** with existing combat math (heal%, resurrect HP, flee-below-30%, shop discount, undead bonus, AC ignore, defend %) — do them first

## Read first (in order)

1. `docs/AGENT-READING-LIST.md` — current vs stale; update when you finish
2. `AGENTS.md` — hard rules, borrowed `"title"`, combat event system
3. `docs/superpowers/specs/2026-07-11-spell-expansion-design.md` — §5.2 buff/debuff, §5.3 DoT/regen, §5.4 cantrip procs; **skip** §5.6 Time Stop / extra turns
4. `docs/superpowers/specs/2026-07-11-class-perks-design.md` — Implementation status section
5. Code: `src/game/combat.ts` (`endRound` / poison ticks / flee / `applySpell`), `src/game/perks.ts`, `src/data/perks.ts`, `src/data/spells.ts`, `src/engine/town-ui.ts` (shop prices)
6. VFX wiring: `src/engine/combat-scene.ts` (`SPELL_OVERRIDES`, `ELEMENT_STYLES`), `src/engine/effect-sprite-cache.ts` — prefer **reusing** existing strips before inventing art

## Do this in order (A → B → C). Do not skip ahead.

### Phase A — Status & flee as real levers (must ship)

Goal: mid/late combat status and bailouts feel like decisions, not flavor.

1. **Audit** current status model (poison tick damage, paralysis countdown, sleep wake-on-hit, flee formula). Document gaps in 5–10 bullets in your working notes (do not invent a new markdown report unless useful).
2. **Flee lever:** Wire the Escape Artist–style perk (match the real id in `data/perks.ts`): if living HP% < 30%, flee **always succeeds** (still emit flee `CombatEvent`s). Keep boss flee rules honest if bosses already block flee.
3. **Status readability (combat UI):** when a party member or enemy has poison / paralysis / sleep, the FF6 windows or scene must surface it (existing markers OK if already present — fix only if missing or wrong).
4. **Do not** wholesale rebalance encounter rates or poison damage % unless required for a clear bug.
5. Unit tests for the flee override path (seeded RNG; prove always-success when HP<30% with the perk; prove normal path without it).

### Phase B — Wire remaining *engine-ready* perk stubs (must ship)

Constraint from prior pass: **no inventing new perk fantasies**; **no blanket number retunes**.

1. Produce a short table: `perk id → wireable-now / needs-new-system / keep-stub`.
2. **Wire every wireable-now perk** using existing hooks/`perkModifiers`/local combat sites. Minimum expected (ids may vary — match `data/perks.ts`):
   - Heal power +% on priest heal perk
   - Resurrect to 50% HP perk
   - Undead / undead-demon damage bonuses where enemy tags already exist
   - Polearm AC-ignore (+ Thief-style AC ignore patterns already shipped)
   - Defend reduction override (Brace / similar — make Defend % data-driven only for the perk; do not change default Defend for everyone unless the code already has a clean knob)
   - `shopDiscountPercent` actually applied in `town-ui.ts` buy price
   - Perfect Timing / next-attack-cannot-miss **if** you can do it with `perkState` + one hook without restructuring initiative
3. Leave stubs that need **resistance / reflect / silence immunity / steal-on-hit economies / reach overrides across canReach** unless a one-liner hook already exists — keep UI “(Not yet implemented — v1.1.)”.
4. Update descriptions: when you wire a perk, remove the “Not yet implemented” line; when partial, say what works.
5. Tests: at least one unit/integration test per newly wired perk (mirror the Glass Cannon / Riposte style in `perks.test.ts`).

### Phase C — Spell DoT / regen engine (must ship the thin wedge)

Build the **smallest** DoT+regen system that unlocks design-doc truth for spells you already named.

1. Extend `SpellEffect` with:
   - `{ kind: "dot"; element: DamageElement; power: number; duration: number }`
   - `{ kind: "regen"; power: number; duration: number }`
   OR a `damage`/`heal` plus optional `followup` field — pick one shape and stick to it.
2. Track active DoTs/regen on `CombatState`; tick in `endRound` (after or beside poison); emit structured `CombatEvent`s (`statusTick` or a new `dotTick`/`regenTick`) so the FF6 scene pops numbers (purple/green).
3. Upgrade **existing** endgame defs (do not invent brand-new spell names):
   - `mage-meteor-swarm`: keep impact damage; **add** burn DoT per design (10/round ×3 or tuned to fit current HP scales — prefer design numbers, document any scale adjust)
   - `priest-mass-regenerate`: keep burst heal; **add** regen ticks per design (8/round ×3)
4. Optionally (if time after tests pass): one lower-tier design spell that becomes trivial with the new kinds — e.g. Incinerate **or** Regenerate (single-target) — **not both plus a pile**. Cap at +1 extra spell.
5. **Explicitly out of scope:** Time Stop double-actions, Haste extra turns, temp HP, Death Ward, reflect/resistance systems, arena dual-camera (W1).

### Phase D — Generate art only if necessary

Default: **reuse** existing effect strips in `public/assets/effects/` and map them via `SPELL_OVERRIDES` / `ELEMENT_STYLES` / `STATUS_STYLES` (as Meteor / Mass Regenerate already do). Do **not** generate art for curiosity.

**Generate new art** (Cursor `GenerateImage` / equivalent) **only when all are true**:
1. A newly shipped player-facing beat has **no acceptable existing strip** (e.g. a distinct DoT burn field, regen pulse, or status icon that would otherwise silently fall back to a wrong element VFX).
2. The gap is **visible in Arena verification** (wrong/missing burst, wrong color for burn vs cold, regen looking like damage, etc.).
3. You keep scope tiny: **at most 2–3** new assets total for the whole pass.

**If you generate art:**
- Pixel-art, SNES / FF6-adjacent, opaque dark or transparent-friendly silhouette that matches current combat VFX scale (~64×64 or strip-friendly frames).
- Avoid generic AI purple-glow / cream-serif look; match existing fire/ice/heal palettes already used in `SPELL_OVERRIDES`.
- Export or place under `public/assets/effects/` with a clear name; register in `effect-sprite-cache.ts`; wire the spell/status override.
- Prefer a **single-frame or short strip** you can document; do not invent a full multi-pack pipeline.
- If tooling cannot produce a usable game strip (wrong size, muddy pixels), **stop** and reuse the closest existing effect — ship mechanics with reused VFX rather than block on art.

**Never generate art for:** town UI, corridor textures, perk card illustrations, marketing, or “nice to have” polish unrelated to a Phase A–C verification gap.

## Constraints

- No game-logic number nerfs/buffs except where required to wire a broken hook or attach DoT numbers from the design doc.
- No new npm deps, no WebGL, no corridor perspective / fog / CRT changes.
- Follow AGENTS.md (shell modes, trap modality, inventory `InventoryEntry[]`, utility spells stay out of combat).
- Every new combat outcome must `emit()` a structured `CombatEvent` or it will not animate.
- `npm run build` and `npm test` must pass.

## Verification (required — use Arena + `?debug=1`)

1. **Flee:** scripted fight with Escape Artist–style perk + HP forced <30% → flee always succeeds; screenshot or evaluate evidence.
2. **Perk:** at least two newly wired perks proven (unit test + one Arena/manual path).
3. **DoT/regen:** cast Meteor Swarm → enemies take impact + subsequent tick damage with popups; cast Mass Regenerate → party heals then ticks green.
4. **VFX:** ticks/casts use correct family of effects; if you generated art, screenshot before/after proving why reuse was insufficient.
5. **Regression:** L9+ Magic scroll + perk overlay ←/→ guard still work (spot-check, don’t rebuild).
6. **Docs:** update `docs/AGENT-READING-LIST.md` recommended work order; refresh perk/spell shipping notes; note remaining stubs; list any new effect assets.

## How to work (maximize quality)

- Prefer deep surgery in `combat.ts` / `perks.ts` over drive-by CSS.
- Extract pure helpers when math gets hairy; unit-test them.
- Use Playwright/browser tools for Arena proof; keep screenshots focused (one per claim).
- If blocked by missing enemy tags (undead/demon), check `EnemyDef` first — wire tags only if already intended by data, don’t invent a taxonomy.
- When unsure between “wire” and “leave stub”, choose **honest stub** over a fake half-hook.
- Art is a **last resort** after `effect-sprite-cache` inventory; mechanics ship even if VFX stay reused.

## Out of scope

- Town FF6 restyle (`docs/FOLLOWUP-TOWN-FF6-THEME-PROMPT.md`) — separate visual pass
- `POLISH-ISSUES-PROMPT.md` mobile map (footer/`T` already fixed earlier)
- Encounter-rate retunes (reading-list #4) until after this pass
- Arena camera unification (W1)
- Filling every remaining stub that needs resistance/reflect/steal economies
- Bulk sprite packs / character redesign / generated perk icons
