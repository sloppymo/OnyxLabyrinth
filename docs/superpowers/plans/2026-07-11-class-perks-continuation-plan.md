# Class Perks + Stat Refactor — Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Detailed spec/handoff:** `docs/superpowers/specs/2026-07-11-class-perks-continuation-prompt.md` (read it first).

**Goal:** Finish the class-perk/stat-refactor feature by wiring existing `effectiveStats`/`perks.ts` code into combat, adding post-combat leveling, building the perk-selection UI, bumping save format, and adding tests.

**Architecture:** The foundation (`src/game/perks.ts`, `src/data/perks.ts`, `src/game/effective-stats.ts`, `Character.perkIds`) is already built and passing tests. Remaining work is integration-only.

**Tech Stack:** TypeScript, Vite, Vitest, vanilla DOM.

---

## Baseline (verified)

- `npm run build` passes with zero TypeScript errors.
- `npm test` passes: 364/364 tests.

---

## Task 1: Integrate effective stats + perk hooks into `src/game/combat.ts`

**Files:**
- Modify: `src/game/combat.ts`
- Modify: `src/game/perks.ts` (only if hook shapes need adjustment during integration)

- [ ] **Step 1.1:** Add `perkState: Record<string, Record<string, unknown>>` to `CombatState` and initialize it in `createCombatState` using `freshPerkState()`.
- [ ] **Step 1.2:** Add internal helper `effStatsFor(s, c)` returning `effectiveStats(c, s.loadout[c.id], perksForCharacter(c))`.
- [ ] **Step 1.3:** Update initiative in `initiativeOrder` and `beginRound` to use effective AGI/LUK for party members.
- [ ] **Step 1.4:** Update melee damage in `resolveAttack` to use effective STR, `perkModifiers(...).meleeDamageMultiplier`, and `meleeBonusDamage`.
- [ ] **Step 1.5:** Update crit chance to `Math.min(0.25, effLUK/100 + critChanceBonus)` and crit damage to `perkModifiers(...).critDamageMultiplier`.
- [ ] **Step 1.6:** Add physical evasion in `resolveEnemyAction` party-target melee branch (after blind, before damage).
- [ ] **Step 1.7:** Update `attemptFlee` to consume effective AGI + flee bonus; update both call sites.
- [ ] **Step 1.8:** Add INT/PIE scaling to spell damage/healing and `spCostMultiplierFor` to `resolveCast`.
- [ ] **Step 1.9:** Add `dispatchHook` calls at the points listed in the continuation prompt (`OnCombatStart`, `BeforeAttack`, `OnAttackMiss`, `OnAttackHit`, `BeforeDamageTaken`, `AfterDamageTaken`, `OnAllyWouldDie`, `OnSpellCast`, `OnSpellResolve`), building `ctx` to match the registered handlers.
- [ ] **Step 1.10:** Update `cloneCharacter` to copy `perkIds`.
- [ ] **Step 1.11:** Run `npm run build` and `npm test`; fix any regressions.

---

## Task 2: Extract leveling and wire post-combat level-ups

**Files:**
- Create: `src/game/leveling.ts`
- Modify: `src/engine/town-ui.ts`
- Modify: `src/main.ts`

- [ ] **Step 2.1:** Create `src/game/leveling.ts` exporting `xpForNextLevel(level)` and `levelUpChar(c, loadout?)`.
- [ ] **Step 2.2:** `levelUpChar` uses effective VIT/INT/PIE and adds `hpGrowthBonusPercent`/`spGrowthBonusPercent` from `perkModifiers`.
- [ ] **Step 2.3:** Remove old `xpForNextLevel`/`levelUpChar` from `src/engine/town-ui.ts`; import from `src/game/leveling.ts`.
- [ ] **Step 2.4:** Convert `doTraining()` to a read-only info screen (no level-ups).
- [ ] **Step 2.5:** In `src/main.ts` `endCombat()` victory branch, loop living characters and apply level-ups immediately; build a local `PendingPerkChoice[]` queue for tier levels.
- [ ] **Step 2.6:** Append level-up summary to the victory `setMessage`.
- [ ] **Step 2.7:** If perk queue is non-empty, open perk selection overlay; otherwise return to dungeon.
- [ ] **Step 2.8:** Run `npm run build` and `npm test`; fix regressions.

---

## Task 3: Perk selection overlay

**Files:**
- Create: `src/engine/perk-select-ui.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] **Step 3.1:** Create `PerkSelectController` in `src/engine/perk-select-ui.ts` following existing overlay patterns.
- [ ] **Step 3.2:** Render header, two perk cards, tag chips, footer hint.
- [ ] **Step 3.3:** Handle arrow-key selection and Enter confirmation.
- [ ] **Step 3.4:** Apply chosen perk via `applyPerkSelection` and advance queue; close and call `onDone` when finished.
- [ ] **Step 3.5:** Add CSS classes in `src/styles.css` matching existing visual language.
- [ ] **Step 3.6:** Wire into `src/main.ts` from Task 2's level-up flow; handle `justOpenedPerkSelect` flag.
- [ ] **Step 3.7:** Run `npm run build` and `npm test`; fix regressions.

---

## Task 4: Save v6 + trap formula

**Files:**
- Modify: `src/game/save.ts`
- Modify: `src/game/features.ts`
- Modify: `src/main.ts` (character remapping in `endCombat`)

- [ ] **Step 4.1:** Bump `SAVE_VERSION` to 6 in `src/game/save.ts`.
- [ ] **Step 4.2:** Add v5→v6 migration that initializes `perkIds: []` for older saves.
- [ ] **Step 4.3:** Explicitly copy `perkIds: [...c.perkIds]` in `serialize` and `deserialize`.
- [ ] **Step 4.4:** Copy `perkIds` in `src/main.ts` `endCombat` party remapping.
- [ ] **Step 4.5:** Update `disarmChest` in `src/game/features.ts` to calibrated effective-stat formula + `trapDisarmBonusPercent`.
- [ ] **Step 4.6:** Apply `trapDamageMultiplier` per-character in gas-trap damage.
- [ ] **Step 4.7:** Run `npm run build` and `npm test`; fix regressions.

---

## Task 5: Tests, build, verification, docs

**Files:**
- Create: `src/game/effective-stats.test.ts`
- Create: `src/game/perks.test.ts`
- Create: `src/game/leveling.test.ts`
- Create: `src/engine/perk-select-ui.test.ts`
- Modify: `src/game/save.test.ts`
- Modify: `AGENTS.md` (if needed)

- [ ] **Step 5.1:** Add `src/game/effective-stats.test.ts` covering base, equipment, perk, floor-at-1.
- [ ] **Step 5.2:** Add `src/game/perks.test.ts` covering `dispatchHook` priority, `perkModifiers` aggregation, and representative perks.
- [ ] **Step 5.3:** Add `src/game/leveling.test.ts` covering effective-stat growth and `hpGrowthBonusPercent`.
- [ ] **Step 5.4:** Extend `src/game/save.test.ts` for v5→v6 migration and round-trip.
- [ ] **Step 5.5:** Add `src/engine/perk-select-ui.test.ts` covering rendering, navigation, selection, queue advance.
- [ ] **Step 5.6:** Run `npm run build` — must pass with zero errors.
- [ ] **Step 5.7:** Run `npm test` — all tests must pass.
- [ ] **Step 5.8:** Run the game and manually verify post-combat level-up, perk overlay, save/load.
- [ ] **Step 5.9:** Update `AGENTS.md` with any new conventions worth documenting.

---

## Execution approach

Subagent-driven, sequential dependencies:
1. Tasks 1, 2, and 4 can start in parallel (they touch different files, with only minor coordination around `main.ts` character remapping).
2. Task 3 depends on Task 2's queue interface in `main.ts`.
3. Task 5 depends on all prior tasks.
