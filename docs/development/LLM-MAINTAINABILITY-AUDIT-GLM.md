# OnyxLabyrinth — LLM-Native Maintainability Audit

> Status: Point-in-time audit.
> This report records the repository state at commit `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.
> Revalidate recommendations against current `main` before implementation.

---

## 1. Executive Summary

**Overall assessment: Strong but with identifiable friction.**

OnyxLabyrinth is a well-structured small-game codebase with clear architectural layering (`game/` rules → `engine/` presentation), a strong `AGENTS.md` operating manual, a working deterministic RNG layer, and 1,934 passing tests. The documentation rationalization pass was effective — `AGENTS.md` is genuinely useful for LLM onboarding, with a file map, change-location table, and explicit "Do not do this" guardrails.

The most impactful remaining friction points are:

1. **No CI gate on pull requests** — the only workflow deploys on push to `main`; tests, build, and floor validation run only locally. This is the single highest-return fix.
2. **No shared test fixtures** — 12+ duplicated `makeEnemy`/`makeParty`/`makeCombatState` helpers across test files, each slightly different, creating both wasted context and drift risk.
3. **`main.ts` is a 2,528-line composition root** with 46 mutable module-level variables and 41 functions, making it the highest-conflict file for multi-agent work and the hardest file to unit-test.
4. **Combat preview vs. resolver drift risk** — `combat-preview.ts` and `combat-actions.ts`/`combat-spells.ts` share imports but compute damage independently; AGENTS.md warns about this but there is no automated guard.
5. **Silent asset fallbacks** — missing sprites, textures, and audio files degrade to procedural shapes or `catch(() => null)` without any visible warning, making it easy to ship broken content.

The codebase is genuinely pleasant to navigate for an LLM that reads `AGENTS.md` first. The friction is concentrated in developer-infrastructure gaps (CI, fixtures, drift guards) rather than architectural problems.

---

## 2. Verified Repository Baseline

| Metric | Value |
|--------|-------|
| Branch | `audit/llm-maintainability-glm` |
| Base SHA | `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415` |
| Node | v22.23.2 |
| npm | 11.5.2 |
| Test files | 95 |
| Tests | 1,934 passed, 0 failed, 0 skipped |
| Test duration | ~13s |
| Build | Success (tsc + tsc tools + vite build), zero TS errors |
| Build duration | ~891ms (vite) |
| Floor validation | All 5 floors OK (no issues) |
| `git diff --check` | Clean |
| Dependencies | `phaser@4.2.1` (runtime); `vitest`, `playwright`, `tsx`, `typescript`, `vite`, `jsdom`, `pngjs` (dev) |
| CI workflows | 1 (deploy-only: `push: branches: [main]`) |
| Branch protection | None (`404` from GitHub API) |

**Package scripts available:** `dev`, `build`, `check:tools`, `preview`, `test`, `test:watch`, `floor:validate`, `floor:dump`, `floor:export-all`, `floor:check`, `floor:editor`, `sprite-preview:generate`, `generate:combat-bg`, `tileset:gallery`, `visual:floors`, `sprite-preview:serve`, `sprite-preview`, `replay`, `replay:record`.

---

## 3. LLM-Native Maintainability Scorecard

| # | Category | Score | Evidence |
|---|----------|-------|----------|
| 1 | Onboarding clarity | **4** | `AGENTS.md` has file map, change-location table, pitfalls, "Do not do this". `README.md` has install/run/build commands. `docs/README.md` indexes docs. `CLAUDE.md` is a thin pointer. An LLM that reads `AGENTS.md` first can navigate effectively. |
| 2 | Source-of-truth clarity | **5** | `AGENTS.md` "Where do I make this change?" table maps 18 task types to primary files. `effective-stats.ts` is documented as the single stats source. `render-math.ts` owns fog/geometry. `combat-choreography.ts` owns animation state. Exceptionally clear. |
| 3 | Module-boundary clarity | **4** | `game/` → `engine/` boundary is clean (zero runtime `game/` → `engine/` imports). `engine/` → `game/` imports exist but are mostly `import type` (compile-time only). `data/` → `engine/` is virtually absent (one test). Clear convention. |
| 4 | State ownership | **3** | `main.ts` owns `GameState` and 46 mutable module-level variables (controllers, flags, transition state). `shell.ts` has module-level DOM queries and mutable message/party-strip state. `audio` is a module singleton. `renderer.ts` has module-level caches. Ownership is documented but scattered. |
| 5 | API explicitness | **4** | TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. `verbatimModuleSyntax` enforces type-only imports. Public debug API is typed via `__onyxDebug`. Combat APIs are typed via `combat-types.ts`. |
| 6 | Determinism and reproducibility | **4** | Seeded RNG (`rng.ts`) wired into all gameplay systems. `deterministic-replay.test.ts` and `rng-wiring.test.ts` prove same-seed determinism per system. `__onyxDebug.setGameplayRng`/`createSeededRng` exposed. Full playthrough replay not yet implemented (documented gap). |
| 7 | Test discoverability | **4** | Tests co-located with source (`*.test.ts` next to `*.ts`). 95 test files. Naming is consistent. `AGENTS.md` file map lists each test file's purpose. |
| 8 | Test fidelity | **3** | Strong unit coverage for combat math, perks, renderer math, save migrations. But: 12+ duplicated test fixture builders with subtle differences. No shared test helpers. Some tests verify helper assumptions rather than public behavior. No automated visual regression (Playwright scripts exist but are manual). |
| 9 | Failure diagnostics | **3** | Test failures include file/test name. Floor validation reports per-floor with coordinates. But: runtime errors in renderer/audio fallbacks are silent (`catch(() => null)`). Debug event buffer exists but is opt-in (`?debug=1`). No structured error IDs. |
| 10 | Browser and visual validation | **3** | Playwright scripts exist (`scripts/playtests/`) for corridor capture, combat smoke, floor visual audit, replay. But all are manual — no CI integration, no pass/fail gate. `floor-visual-audit.mjs` derives poses from runtime but isn't automated. |
| 11 | Content-authoring ergonomics | **4** | Floor editor (`tools/floor-editor.ts`), CLI (`floor:validate`/`floor:check`), JSON packs (`src/content/floors/`), `FLOOR-AUTHORING.md` guide. Adding a maze prop is a 2-line change (drop PNG + add `MAP_SPRITES` entry). Adding an enemy requires 4-5 files but is well-documented. |
| 12 | Asset-pipeline safety | **2** | No automated asset validation. Sprite dimensions, alpha rules, and manifest entries are convention-only. `sprite-manifest.ts` maps enemy IDs to paths but missing assets silently fall back to procedural shapes. `sprite-alpha.ts` handles background keying but is opt-in. No CI check for missing/malformed assets. |
| 13 | Save and identifier safety | **4** | Save version 14 with 10 documented migrations (v4→v14). `save.test.ts` covers migration paths. `AGENTS.md` explicitly warns against renaming save-compatible IDs. Migrations are linear and tested. |
| 14 | CI enforcement | **1** | Only a deploy workflow (`push: branches: [main]`). No PR checks. No required status checks. No branch protection. Tests, build, and floor validation run only locally. An agent can push broken code to `main` without any automated gate. |
| 15 | Multi-agent concurrency safety | **3** | `main.ts` (2,528 lines, 41 functions) is a high-conflict file for concurrent work. `combat-choreography.ts` (3,854 lines) and `combat-phaser-stage.ts` (2,480 lines) are also large. But: the module split is logical, and `AGENTS.md` documents ownership. Worktrees work well (evidenced by this audit). |
| 16 | Context efficiency | **3** | `AGENTS.md` is 303 lines and high-signal. But `main.ts` (2,528 lines), `combat-choreography.ts` (3,854 lines), and `combat-phaser-stage.ts` (2,480 lines) require reading most of the file for small changes. No subsystem "context packs" exist. The file map helps but doesn't replace reading the actual code. |
| 17 | Refactor safety | **3** | `render-math.ts` extraction is a positive example (pure functions, unit-tested). Combat module split (`combat-types.ts`, `combat-shared.ts`, etc.) is clean. But: no dependency-boundary tests. No automated guard against preview/resolver drift. Large files are hard to refactor safely without full reads. |
| 18 | Documentation drift resistance | **3** | `AGENT-READING-LIST.md` tracks doc currency with status tables. `AGENTS.md` is manually maintained. No generated docs. No drift detection. The reading list is comprehensive but requires manual updates — last refreshed 2026-07-26, 9 days ago. |
| 19 | Debug-tool quality | **4** | 8 debug modules with tests (`src/debug/`). `__onyxDebug` API is typed, documented in README, and covers snapshot/idle/jumpTo/startCombat/RNG/audio. `start-combat.test.ts` covers the debug combat helper. Phaser debug hooks (`__onyxPhaserActors`, etc.) exist. Good quality. |
| 20 | Deployment confidence | **2** | CI builds and deploys on push to `main`. But: no test gate before deploy, no branch protection, no required checks. The deploy workflow runs `npm run build` but not `npm test` or `npm run floor:validate`. A passing build does not guarantee passing tests. |

**Raw total: 67 / 100**
**Percentage: 67%**

### Strongest five areas
1. Source-of-truth clarity (5) — the "Where do I make this change?" table is exceptional
2. Onboarding clarity (4) — `AGENTS.md` is a genuinely useful LLM entrypoint
3. Module-boundary clarity (4) — clean `game/` → `engine/` separation
4. Save and identifier safety (4) — versioned migrations with tests
5. Debug-tool quality (4) — typed, tested, documented debug APIs

### Weakest five areas
1. CI enforcement (1) — no PR checks, no branch protection
2. Deployment confidence (2) — deploy runs build but not tests
3. Asset-pipeline safety (2) — no automated asset validation
4. State ownership (3) — 46 mutable globals in `main.ts`
5. Test fidelity (3) — duplicated fixtures, no visual regression gate

---

## 4. Repository Strengths

1. **`AGENTS.md` is a best-in-class LLM operating manual.** The file map, change-location table, "Do not do this" guardrails, and architecture overview let an LLM orient in one read. The "Where do I make this change?" table alone saves significant context.

2. **Clean architectural layering.** `src/game/` (rules) → `src/engine/` (presentation) → `src/data/` (content) with zero runtime `game/` → `engine/` imports. `engine/` → `game/` imports are almost exclusively `import type`. This is rare for a vanilla-TS codebase.

3. **Seeded RNG with proven wiring.** `rng.ts` is wired into all gameplay systems (combat, encounters, features, NPC, party). `deterministic-replay.test.ts` and `rng-wiring.test.ts` prove same-seed determinism per system. The `__onyxDebug.setGameplayRng`/`createSeededRng` API makes reproduction easy.

4. **Combat module split is well-executed.** `combat.ts` (orchestrator) + `combat-types.ts` (domain) + `combat-shared.ts` (helpers) + `combat-actions.ts`/`combat-spells.ts`/`combat-ai.ts`/`combat-eor.ts`/`combat-enemy.ts`/`combat-techniques.ts`/`combat-preview.ts`/`combat-reach.ts`/`combat-equipment.ts`/`combat-inventory.ts` (leaf modules). Each has a focused responsibility.

5. **Two-painter combat architecture with shared choreography.** `combat-choreography.ts` builds DOM-free animation state; both `combat-phaser-stage.ts` (Phaser) and `combat-scene.ts` (Canvas rollback) paint the same state. `AGENTS.md` explicitly forbids adding a second choreography engine.

6. **Save migration discipline.** 10 linear migrations (v4→v14), each documented with a comment explaining what changed and why. `save.test.ts` covers the migration paths.

7. **Floor authoring pipeline.** WYSIWYG editor, CLI validator, JSON packs, `FLOOR-AUTHORING.md` guide, and `floor-validate.ts` linter that mirrors `floors.test.ts` invariants.

8. **Debug surface is typed and tested.** 8 debug modules with co-located tests. `__onyxDebug` API is documented in README and covers the key workflows (snapshot, idle, jumpTo, startCombat, RNG, audio).

---

## 5. Top Friction Points

### 5.1 No CI gate on pull requests (Confidence: High)

**Evidence:** `.github/workflows/deploy.yml` triggers only on `push: branches: [main]`. It runs `npm ci` + `npm run build` but NOT `npm test` or `npm run floor:validate`. GitHub API returns `404` for branch protection. No `.github/workflows/ci.yml` exists.

**Problem:** An agent (or human) can push broken tests or invalid floors to `main` and the deploy will succeed as long as the build passes. There is no automated gate between "code written" and "code deployed."

**Why it matters here:** This repository is developed primarily by LLM agents. Agents make plausible-but-wrong changes. Without a CI gate, the only barrier is the agent's own self-verification, which is unreliable. Every previous PR merge cycle required manual `npm test` + `npm run build` + `npm run floor:validate` — but nothing enforces this.

### 5.2 No shared test fixtures (Confidence: High)

**Evidence:** 12+ duplicated `makeEnemy`/`makeParty`/`makeCombatState` helpers across test files, each with slightly different signatures and defaults:
- `combat.test.ts:41` — `makeEnemy(id, hp?, ac?, ...)`
- `combat-turns.test.ts:52` — `makeEnemy(id, overrides?)`
- `combat-saint.test.ts:26` — `makeEnemy(id)` (no overrides)
- `combat-damage-contract.test.ts:20` — `makeEnemy(id, opts?)`
- `combat-barks.test.ts:21` — `makeEnemy(id, hp?)`
- `combat-eor.test.ts:8` — `makeEnemy(...)`
- `combat-spells-smoke.test.ts:35` — `makeEnemy(...)`
- `combat-body-magic.test.ts:20` — `makeEnemy(id, overrides?)`
- `action-preview.test.ts:18` — `makeEnemy(...)`
- `perks.test.ts:42` — `makeEnemy(id, name?, hp?)`
- `floor4-ttk-measurement.test.ts:33` — `makeEnemyFromDef(enemyId, instanceId, row)`

No `src/test/` directory, no shared helpers, no `*fixture*` or `*test-utils*` files.

**Problem:** Each test file reinvents party/enemy/combat construction. The helpers drift (different default HP, AC, row assignment). An agent writing a new combat test must copy a helper from an existing file, but may pick one with different defaults, producing tests that don't represent real gameplay.

### 5.3 `main.ts` is a 2,528-line composition root (Confidence: High)

**Evidence:** `src/main.ts` has 2,528 lines, 41 functions, 46 mutable module-level `let` variables (controllers, flags, transition state, debug buffers). It owns: mode transitions, combat start/end, encounter triggering, level-up processing, perk selection queue, save/load, debug API installation, input binding, and the entire application lifecycle.

**Problem:** Any change to game flow, combat lifecycle, save/load, debug APIs, or mode transitions touches `main.ts`. This makes it the highest-conflict file for multi-agent work. It's also impossible to unit-test (it imports `./styles.css`, queries `document`, and creates singletons at module load).

**Why not split it reflexively:** `main.ts` IS the composition root — having lifecycle ownership in one place is architecturally correct. The problem is that it also contains business logic (level-up processing, perk queue management, encounter triggering) that could be extracted and tested independently.

### 5.4 Combat preview vs. resolver drift (Confidence: High)

**Evidence:** `combat-preview.ts` (157 lines) and `combat-actions.ts` (938 lines) / `combat-spells.ts` (409 lines) both compute damage but independently. They share imports (`combat-shared.ts`, `perks.ts`, `combat-reach.ts`) but the preview computes expected damage while the resolver computes actual damage through different code paths. `AGENTS.md` explicitly warns: "Do not update damage preview (`combat-preview.ts`) without also updating the actual resolver path in `combat-actions.ts`/`combat-spells.ts`."

**Problem:** The warning is a convention, not an automated guard. An LLM changing damage formulas can update the resolver and forget the preview (or vice versa), producing a UI that lies about expected damage. There is no test that asserts preview ≈ resolver for the same inputs.

### 5.5 Silent asset fallbacks (Confidence: High)

**Evidence:** In `renderer.ts`:
- `loadImage(urls.wall).catch(() => null)` (line 560) — missing wall texture → null → procedural fallback
- `loadImage(WATER_FLOOR_A_URL).catch(() => null)` (line 496) — missing water texture → null
- `tilesetCache` falls back to placeholder textures silently

In `combat-scene.ts`:
- "Procedural fallback for enemies with no image strip" (line 271)
- "Procedural fallback for party members while sprites are loading" (line 321)

In `audio.ts`:
- `void this.dungeonMusic.play().catch(() => {...})` — audio failures caught silently

In `maze-props.ts`:
- "Listing art that does not exist yet is deliberately safe — the lookup misses and the next candidate (or the glyph) takes over."

**Problem:** Missing assets degrade gracefully, which is good for runtime stability but bad for development. An agent can add an enemy to `enemies.ts`, forget the sprite manifest entry, and the game runs fine with a procedural shape. The bug is invisible until someone notices the wrong visual. There is no "missing asset" warning in dev mode.

---

## 6. Representative Task Walkthroughs

### Task A — Add a new enemy with unique art and one special ability

**Docs to read:** `AGENTS.md` (file map + "Where do I make this change?" table), `SPRITE-ART-GENERATION-GUIDE.md`.

**Files to inspect:** `src/data/enemies.ts` (1,697 lines — enemy defs + encounter tables), `src/data/enemy-abilities.ts` (49 ability ids), `src/engine/sprite-manifest.ts` (581 lines — enemy→asset mapping), `src/data/enemies.test.ts`.

**Files to modify:**
1. `src/data/enemies.ts` — add `EnemyDef` + add to `ENCOUNTER_TABLES[floorId]`
2. `src/data/enemy-abilities.ts` — add `EnemyAbilityDef` if ability is new
3. `src/engine/sprite-manifest.ts` — add sprite strip mapping
4. `public/assets/enemies/<id>/` — add sprite PNG strips
5. `src/data/enemies.test.ts` — add test for new enemy

**Tests to run:** `npm test`, `npm run build`.

**Browser checks:** Combat against the new enemy in Arena mode (`?debug=1` → `__onyxDebug.startCombat`).

**Hidden assumptions:**
- Enemy art faces RIGHT, drawn unmirrored (AGENTS.md documents this).
- Sprite strips are 100×100 px per frame (sprite-manifest.ts header).
- `ENCOUNTER_TABLES[floorId]` is the live encounter source, NOT `FloorDef.encounterTable` (deprecated).
- Bosses can borrow other enemies' strips via `strip()` + `withTop()`.

**Likely mistakes:**
- Adding enemy to `enemies.ts` but forgetting `sprite-manifest.ts` → silent procedural fallback.
- Adding enemy to `FloorDef.encounterTable` instead of `ENCOUNTER_TABLES` → enemy never appears.
- Adding ability to `enemy-abilities.ts` but not referencing it in `EnemyDef.abilityIds` → ability never used.

**Source-of-truth clarity:** Good — the "Where do I make this change?" table covers this exactly.

**Context burden:** Medium. `enemies.ts` is 1,697 lines but well-structured. `sprite-manifest.ts` is 581 lines but mostly repetitive entries.

**Opportunities:** A test that asserts every `EnemyDef.id` has a `sprite-manifest.ts` entry (or explicitly opts out) would catch the silent-fallback mistake.

### Task B — Add a new perk that modifies damage and reacts to a combat event

**Docs to read:** `AGENTS.md` (Class perks section), `docs/superpowers/specs/2026-07-11-class-perks-design.md`.

**Files to inspect:** `src/data/perks.ts` (56 perks), `src/game/perks.ts` (engine: `perkModifiers`, `dispatchHook`, `freshPerkState`), `src/game/combat-shared.ts` (damage helpers), `src/game/combat-actions.ts` (melee resolution), `src/game/combat-spells.ts` (spell resolution).

**Files to modify:**
1. `src/data/perks.ts` — add `PerkDef` (8 per class × 5 classes = 56 existing)
2. `src/game/perks.ts` — add hook handler if reactive, or ensure `perkModifiers` covers it if passive
3. `src/game/combat-actions.ts` or `combat-spells.ts` — add hook dispatch site if new hook type
4. `src/game/perks.test.ts` — add test

**Tests to run:** `npm test`, `npm run build`.

**Hidden assumptions:**
- Two mechanisms: `perkModifiers` (passive numeric) vs `dispatchHook` (reactive/stateful). Pick the right one.
- `CombatState.perkState` holds per-combat scratch data, reset at combat start.
- Perks needing bespoke logic are marked `// TODO(v1.1)` in `data/perks.ts`.
- Level-ups happen automatically post-combat, not at Training Ground.
- `PendingPerkChoice` queue is a local variable in `main.ts`, never persisted.

**Likely mistakes:**
- Adding a reactive perk but forgetting to register the hook handler in `perks.ts`.
- Adding a passive perk but not including the field in `perkModifiers`'s fold.
- Updating the damage resolver but not `combat-preview.ts` (the documented drift risk).

**Context burden:** High. Understanding the perk system requires reading `perks.ts` (engine), `data/perks.ts` (definitions), `combat-shared.ts` (where modifiers apply), and potentially `combat-actions.ts`/`combat-spells.ts` (where hooks dispatch).

### Task C — Add a new regional floor material (water case study)

**Docs to read:** `AGENTS.md`, `docs/FLOOR-AUTHORING.md`.

**Files to inspect (water implementation):** `src/engine/water-floor.ts` (11 lines — `isWaterTile`, `waterGridFromFloor`), `src/engine/water-asset.test.ts` (43 lines), `src/engine/water-floor.test.ts` (35 lines), `src/engine/renderer.ts` (water texture loading + floor-cast), `public/assets/tilesets/f1/water_floor.png`.

**Files to modify for a new material:**
1. `src/engine/<material>-floor.ts` — new module (mirror `water-floor.ts`)
2. `src/engine/renderer.ts` — add texture loading + floor-cast sampling
3. `src/content/floors/*.json` — add material tiles to floor grid
4. `src/engine/<material>-floor.test.ts` — new test
5. `public/assets/tilesets/<floor>/` — add texture PNG

**Hidden assumptions:**
- The renderer's floor-cast loop checks `isWaterTile()` per cell — a new material needs its own check.
- Texture loading uses `.catch(() => null)` — missing texture is silent.
- Floor validation (`floor-validate.ts`) checks geometry but not material-specific textures.

**Context burden:** Medium. `water-floor.ts` is tiny (11 lines) and is a clean template. But `renderer.ts` is 1,655 lines and the floor-cast loop is the most fragile code in the repo.

### Task D — Add a new floor or major floor region

**Docs to read:** `docs/FLOOR-AUTHORING.md`, `AGENTS.md` (floor section).

**Files to inspect:** `src/data/floors.ts`, `src/content/floors/` (JSON packs), `src/game/floor-registry.ts`, `src/game/floor-validate.ts`, `src/data/enemies.ts` (`ENCOUNTER_TABLES`).

**Files to modify:**
1. `src/content/floors/floor-N.json` — new floor pack
2. `src/game/floor-registry.ts` — auto-loaded from `content/floors/` (no edit needed for JSON packs)
3. `src/data/enemies.ts` — add `ENCOUNTER_TABLES[floorId]`
4. `tools/floor-data/floor-N.json` — editor export (via `floor:export-all`)

**Tests to run:** `npm run floor:validate`, `npm test`, `npm run build`.

**Browser checks:** `npm run visual:floors` (floor visual audit).

**Hidden assumptions:**
- Stairs use `floorId ± 1` and land at the target's start.
- Keys are `*-key` chest strings.
- `FloorDef.encounterTable` is deprecated; use `ENCOUNTER_TABLES[floor.id]`.
- All three campaign floors ship populated `events` arrays.

**Context burden:** Low-medium. The floor authoring pipeline is well-documented and tooled.

### Task E — Change combat animation without changing combat rules

**Docs to read:** `AGENTS.md` (combat choreography section).

**Files to inspect:** `src/engine/combat-choreography.ts` (3,854 lines — the shared choreography engine), `src/engine/combat-phaser-stage.ts` (2,480 lines — Phaser painter), `src/engine/combat-scene.ts` (1,217 lines — Canvas painter).

**Files to modify:**
1. `src/engine/combat-choreography.ts` — if timing/step structure changes
2. `src/engine/combat-phaser-stage.ts` — if Phaser painting changes
3. `src/engine/combat-scene.ts` — if Canvas painting changes (MUST stay in sync)

**Tests to run:** `npm test` (combat-scene.test.ts covers choreography), `npm run build`.

**Browser checks:** Both `?phaser=0` (Canvas) and default (Phaser) modes.

**Hidden assumptions:**
- Both painters consume the same `combat-choreography.ts` state — never the reverse.
- `combat-scene.ts`'s `paintOrderFootY` must include each actor's LIVE move offset, not just static home-slot position (documented pitfall).
- `presentation` field on `CombatEvent` opts into bespoke multi-actor choreography.

**Likely mistakes:**
- Updating Phaser painter but not Canvas fallback (or vice versa).
- Adding a second choreography engine instead of extending the shared one.

**Context burden:** Very high. `combat-choreography.ts` is the largest file in the repo (3,854 lines). `combat-phaser-stage.ts` is 2,480 lines. A small animation change may require reading significant portions of both.

### Task F — Reproduce and fix a combat bug deterministically

**Docs to read:** `AGENTS.md` (RNG section), README (debug surface).

**Files to inspect:** `src/game/rng.ts`, `src/debug/start-combat.ts`, `src/game/deterministic-replay.test.ts`.

**Steps:**
1. `?debug=1` → `__onyxDebug.setGameplayRng(__onyxDebug.createSeededRng(seed))`
2. `__onyxDebug.startCombat()` to force a combat
3. Reproduce the bug
4. Write a regression test with the same seed

**Hidden assumptions:**
- Full playthrough replay is NOT implemented — only per-system determinism.
- `startCombat` throws if combat is already active.
- The seeded RNG must be set BEFORE the encounter roll.

**Context burden:** Low. The debug surface is well-documented and the RNG is straightforward.

### Task G — Change the save schema

**Docs to read:** `AGENTS.md` (save section).

**Files to inspect:** `src/game/save.ts` (SAVE_VERSION = 14, 10 migrations), `src/game/save.test.ts`.

**Files to modify:**
1. `src/game/save.ts` — bump `SAVE_VERSION`, add migration step, update `serialize`/`deserialize`
2. `src/game/save.test.ts` — add migration test

**Hidden assumptions:**
- Save-compatible IDs (enemy, item, perk, NPC, floor) must not be renamed.
- Migrations are linear (v4→v5→...→v14).
- `PendingPerkChoice` is never persisted (local variable in `main.ts`).
- `pendingTrap` is never persisted (not in the save type).

**Context burden:** Low. `save.ts` is well-structured and the migration pattern is clear.

### Task H — Add a temporary fifth party member or companion (stress test)

**Current state:** `PARTY_SIZE = 4` in `src/game/party.ts`.

**Files that assume party size:**
- `src/game/party.ts` — `PARTY_SIZE = 4`
- `src/engine/party-ui.ts` — editor runs `PARTY_SIZE` slots
- `src/engine/combat-scene.ts` — `partyPos(i, w, h, bd)` positions are indexed by slot
- `src/engine/combat-phaser-stage.ts` — actor layout assumes 4 party slots
- `src/engine/combat-select-action-view.ts` — party HP list renders 4 rows
- `src/engine/shell.ts` — `renderPartyStrip()` renders 4 portraits
- `src/game/combat.ts` — `createCombatState` takes a party array (flexible)
- `src/game/combat-equipment.ts` — equipment map keyed by character id (flexible)
- `src/game/leveling.ts` — level-up loops over party array (flexible)
- `src/main.ts` — `buildLoadoutMap()` iterates party (flexible)

**Assessment:** The rules layer (`game/`) is mostly array-based and would handle 5 members without changes. The presentation layer (`engine/`) has hardcoded positioning for 4 slots. The UI (`combat-select-action-view.ts`, `shell.ts`) has hardcoded 4-row layouts. A temporary companion would require changes to ~6-8 engine files for positioning and UI layout, plus careful testing of combat flow, targeting, and save/load.

**Verdict:** Workable but requires coordinated changes across positioning, UI layout, and potentially save schema. The rules layer is ready; the presentation layer is not.

---

## 7. Top LLM Traps in OnyxLabyrinth

### Trap 1: Adding content without manifest entries (Rank: 1)

**Evidence:** `sprite-manifest.ts` maps enemy IDs to asset paths. Missing entries silently fall back to procedural shapes in `combat-scene.ts`. `maze-props.ts` says "Listing art that does not exist yet is deliberately safe."

**Typical incorrect change:** Add an enemy to `enemies.ts`, add sprite PNGs to `public/assets/enemies/<id>/`, but forget `sprite-manifest.ts` entry. Game runs, enemy appears as a colored rectangle.

**Why plausible:** The game doesn't error — it gracefully degrades. An agent sees combat working and assumes the sprite is loaded.

**Existing protection:** `AGENTS.md` file map documents `sprite-manifest.ts`. `sprite-manifest.test.ts` exists.

**Missing protection:** No test asserting every `EnemyDef.id` has a manifest entry (or explicit opt-out). No dev-mode warning for missing sprites.

**Recommended guardrail:** Add a test that cross-references `enemies.ts` IDs against `sprite-manifest.ts` entries.

### Trap 2: Updating damage resolver but not preview (Rank: 2)

**Evidence:** `combat-preview.ts` and `combat-actions.ts`/`combat-spells.ts` compute damage independently. `AGENTS.md` warns: "Do not update damage preview without also updating the actual resolver path."

**Typical incorrect change:** Change damage formula in `combat-actions.ts`, tests pass, but `combat-preview.ts` still shows old expected damage. Player sees wrong numbers in the UI.

**Why plausible:** The two files share imports but have separate computation paths. An agent focused on the resolver may not realize the preview exists.

**Existing protection:** `AGENTS.md` warning.

**Missing protection:** No test asserting preview ≈ resolver for the same inputs.

**Recommended guardrail:** Add a parameterized test that runs both paths with identical inputs and asserts they match within rounding.

### Trap 3: Using `FloorDef.encounterTable` instead of `ENCOUNTER_TABLES` (Rank: 3)

**Evidence:** `AGENTS.md` states: "`FloorDef.encounterTable` is deprecated/ignored in favor of `ENCOUNTER_TABLES[floor.id]`." The field still exists in the type.

**Typical incorrect change:** Add encounters to `FloorDef.encounterTable` in a floor JSON. Encounters never trigger.

**Why plausible:** The field exists in the type and the floor data structure. An agent reading floor definitions would reasonably use it.

**Existing protection:** `AGENTS.md` warning. `floor-validate.ts` could flag this.

**Missing protection:** No runtime warning or validation error when `encounterTable` is populated but ignored.

**Recommended guardrail:** `floor-validate.ts` should warn when `encounterTable` is non-empty (it's deprecated).

### Trap 4: Confusing borrowed "title" mode with the real title screen (Rank: 4)

**Evidence:** `AGENTS.md` warns: "Several overlays (save menu, spell menu, NPC panel, perk selection) borrow mode `"title"` to pause dungeon input. Borrowing "title" is risky: always restore the real previous mode and never trigger title-music logic from an overlay."

**Typical incorrect change:** Add a new overlay that borrows "title" mode, but forgets to save/restore `previousMode`, or accidentally triggers title music.

**Why plausible:** Mode borrowing is a non-obvious pattern. An agent adding a new overlay would reasonably use `setMode(state, "title")` without realizing the implications.

**Existing protection:** `AGENTS.md` warning. `normalizeLoadedMode` in `debug/load-normalize.ts`.

**Missing protection:** No type-level distinction between "real title" and "borrowed title". No assertion that title music only plays on real title.

**Recommended guardrail:** Document the pattern in a code comment at the `showMode` function in `main.ts`.

### Trap 5: Updating Phaser painter but not Canvas fallback (Rank: 5)

**Evidence:** Both `combat-phaser-stage.ts` (2,480 lines) and `combat-scene.ts` (1,217 lines) paint the same `combat-choreography.ts` state. `?phaser=0` switches to Canvas.

**Typical incorrect change:** Change Phaser painting (e.g., actor position, effect timing) without updating Canvas. Canvas fallback (`?phaser=0`) shows different visuals.

**Why plausible:** The default painter is Phaser. An agent may not realize Canvas exists as a rollback. Tests may not cover both painters.

**Existing protection:** `AGENTS.md` warns: "Do not remove a fallback renderer." `combat-scene.test.ts` exists.

**Missing protection:** No automated visual comparison between Phaser and Canvas. No test asserting both painters consume the same choreography state.

**Recommended guardrail:** A test that asserts both painters read the same `CombatScene` fields for a given choreography step.

### Trap 6: Using `Math.random()` in gameplay code (Rank: 6)

**Evidence:** `AGENTS.md` warns: "Do not use `Math.random()` for gameplay randomness. Use `src/game/rng.ts`." The seeded RNG was recently wired into all gameplay systems.

**Typical incorrect change:** Add a new gameplay feature that uses `Math.random()` for a random outcome. The feature works but is not reproducible with seeded RNG.

**Why plausible:** `Math.random()` is the default JS random. An agent writing new code would naturally use it.

**Existing protection:** `AGENTS.md` warning. `rng-wiring.test.ts` covers wired systems.

**Missing protection:** No lint rule or grep-based check for `Math.random()` in `src/game/`.

**Recommended guardrail:** A grep-based test or ESLint rule that forbids `Math.random()` in `src/game/` and `src/data/`.

### Trap 7: Committing generated output or raw assets (Rank: 7)

**Evidence:** `AGENTS.md` warns: "Do not commit `dist/`" and "Do not commit purchased raw asset packs." Root `*-preview.html` files are gitignored.

**Typical incorrect change:** Run `npm run build`, then `git add .` which stages `dist/` or generated preview files.

**Why plausible:** `git add .` is a common workflow. An agent may not check `.gitignore`.

**Existing protection:** `.gitignore` excludes `dist/`, `assets/`, `playtest-screenshots/`, `vfx-audit/`.

**Missing protection:** No `git status` check in a pre-commit hook.

**Recommended guardrail:** A pre-commit hook that rejects commits touching `dist/` or `*-preview.html`.

---

## 8. Prioritized Recommendations

### Group 1 — Immediate high-return improvements (max 5)

#### 1.1 Add a CI workflow that runs tests + build + floor validation on every PR

**Category:** CI / Developer infrastructure
**Severity:** High
**Evidence:** `.github/workflows/deploy.yml` only runs on `push: branches: [main]` and only runs `npm ci` + `npm run build`. No `npm test`, no `npm run floor:validate`. No branch protection (GitHub API 404).
**Current cost:** Every agent must manually run `npm test` + `npm run build` + `npm run floor:validate` before pushing. There is no automated gate. Broken code can be deployed.
**Human-developer impact:** Must remember to run all three commands manually. No feedback until after push.
**LLM-agent impact:** Can push broken tests to `main` without any automated barrier. The deploy workflow will happily build and deploy code with failing tests.
**Proposed change:** Add `.github/workflows/ci.yml` that runs on `pull_request` and `push` to any branch: `npm ci`, `npm test`, `npm run build`, `npm run floor:validate`. Add basic branch protection: require the CI check to pass before merge to `main`.
**Files likely involved:** `.github/workflows/ci.yml` (new), GitHub branch protection settings.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** A PR with a failing test cannot be merged. A PR with a failing build cannot be merged. A PR with invalid floors cannot be merged.
**How to verify:** Open a PR with a deliberately failing test → CI check fails. Open a PR with passing tests → CI check passes.
**What not to change:** The existing deploy workflow. The test suite itself.

#### 1.2 Add a test asserting combat preview matches resolver output

**Category:** Test fidelity / Drift prevention
**Severity:** High
**Evidence:** `combat-preview.ts` (157 lines) and `combat-actions.ts` (938 lines) compute damage independently. `AGENTS.md` warns about drift but there is no automated guard.
**Current cost:** An agent changing damage formulas can forget the preview, producing a UI that lies about expected damage. The drift is only caught by manual visual inspection.
**Human-developer impact:** Must manually verify preview numbers after any damage formula change.
**LLM-agent impact:** High risk of updating resolver without preview (or vice versa). The warning is in `AGENTS.md` but easy to miss when focused on one file.
**Proposed change:** Add a parameterized test in `combat-preview.test.ts` (or a new `combat-preview-drift.test.ts`) that runs both `computePreview()` and the actual resolver with identical inputs (same party, enemy, seed, action) and asserts the preview's expected damage matches the resolver's actual damage within ±1 (for rounding).
**Files likely involved:** `src/game/combat-preview.ts`, `src/game/combat-actions.ts`, `src/game/combat-spells.ts`, new test file.
**Estimated effort:** Half day.
**Risk:** Low — test-only change. May reveal existing drift (which would be a bug to fix).
**Dependencies:** None.
**Acceptance criteria:** Test passes for melee, spell, and technique actions across multiple party/enemy configurations. If drift exists, it is documented or fixed.
**How to verify:** `npm test` — the new test passes. Temporarily change the resolver without the preview → test fails.
**What not to change:** The preview or resolver logic itself (unless fixing discovered drift).

#### 1.3 Add a test asserting every enemy ID has a sprite manifest entry

**Category:** Asset-pipeline safety / Content integrity
**Severity:** Medium
**Evidence:** 12+ enemies in `enemies.ts` may lack `sprite-manifest.ts` entries, silently falling back to procedural shapes. No test cross-references the two.
**Current cost:** An agent can add an enemy with art assets but forget the manifest entry. The game runs with a colored rectangle instead of the sprite.
**Human-developer impact:** Must manually verify each new enemy's sprite appears in combat.
**LLM-agent impact:** Very likely to forget the manifest entry since the game doesn't error.
**Proposed change:** Add a test in `sprite-manifest.test.ts` (or `enemies.test.ts`) that iterates all `EnemyDef.id`s and asserts each has a manifest entry OR is explicitly listed in an opt-out set (e.g., `ENEMIES_WITHOUT_SPRITES`).
**Files likely involved:** `src/engine/sprite-manifest.test.ts`, `src/data/enemies.ts`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low — test-only change. May reveal existing missing entries (which should be documented in the opt-out set).
**Dependencies:** None.
**Acceptance criteria:** Test passes. Every enemy ID either has a manifest entry or is in the opt-out set.
**How to verify:** `npm test` — the new test passes. Add an enemy without a manifest entry → test fails.
**What not to change:** The sprite manifest or enemy definitions (unless adding missing entries).

#### 1.4 Add a `Math.random()` forbidden-zone test

**Category:** Determinism / Drift prevention
**Severity:** Medium
**Evidence:** `AGENTS.md` warns: "Do not use `Math.random()` for gameplay randomness." The seeded RNG was recently wired in. But there is no automated guard against regression.
**Current cost:** An agent adding new gameplay code can use `Math.random()` and the feature works but is non-deterministic. The seeded RNG tests won't catch it.
**Human-developer impact:** Must manually grep for `Math.random()` after gameplay changes.
**LLM-agent impact:** Natural to use `Math.random()` in new code. The warning is in `AGENTS.md` but not enforced.
**Proposed change:** Add a test that scans `src/game/` and `src/data/` source files for `Math.random()` calls and fails if any are found (excluding test files and `rng.ts` itself).
**Files likely involved:** New test file `src/game/no-math-random.test.ts` or add to `rng-wiring.test.ts`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low — test-only change. May reveal existing `Math.random()` calls that were missed during the RNG wiring.
**Dependencies:** None.
**Acceptance criteria:** Test passes. No `Math.random()` calls in `src/game/` or `src/data/` (excluding tests and `rng.ts`).
**How to verify:** `npm test` — the new test passes. Add `Math.random()` to a game file → test fails.
**What not to change:** The RNG module or existing gameplay code (unless fixing discovered `Math.random()` calls).

#### 1.5 Add a `npm run check` wrapper command

**Category:** Developer experience / Verification reliability
**Severity:** Low
**Evidence:** Baseline verification requires running `npm test` + `npm run build` + `npm run floor:validate` separately. Agents may forget one. The README lists them separately.
**Current cost:** Three separate commands to remember and run. Agents sometimes run only `npm run build` and claim success.
**Human-developer impact:** Must remember three commands.
**LLM-agent impact:** May skip one command, leading to undetected failures.
**Proposed change:** Add `"check": "npm test && npm run build && npm run floor:validate"` to `package.json` scripts. Document it in `AGENTS.md` and `README.md` as the single pre-commit verification command.
**Files likely involved:** `package.json`, `AGENTS.md`, `README.md`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** `npm run check` runs all three commands and exits non-zero if any fail.
**How to verify:** Run `npm run check` — all three commands execute. Break a test → `npm run check` fails.
**What not to change:** The individual commands. They should remain available separately.

### Group 2 — Improvements during next relevant feature (max 8)

#### 2.1 Extract shared test fixtures (during next combat test work)

**Category:** Test fidelity
**Severity:** Medium
**Evidence:** 12+ duplicated `makeEnemy`/`makeParty`/`makeCombatState` helpers across test files with different signatures and defaults.
**Proposed change:** Create `src/game/test-fixtures.ts` (excluded from build tsconfig) with `makeEnemy()`, `makeParty()`, `makeCombatState()`, `makeCharacter()` helpers that accept overrides. Migrate tests incrementally when they're next touched.
**Files likely involved:** New `src/game/test-fixtures.ts`, existing test files (incrementally).
**Estimated effort:** Half day (initial extraction + migration of 3-4 test files).
**Risk:** Low — test-only change. Migrate incrementally to avoid big-bang risk.
**Dependencies:** None.
**Acceptance criteria:** At least 4 test files use the shared fixtures. No behavioral change in tests.
**What not to change:** Test assertions themselves — only the fixture construction.

#### 2.2 Add dev-mode warnings for missing assets (during next asset work)

**Category:** Asset-pipeline safety
**Severity:** Medium
**Evidence:** Missing sprites, textures, and audio files silently fall back to procedural shapes or `catch(() => null)`.
**Proposed change:** In dev mode (`import.meta.env.DEV`), log a `console.warn` when a sprite/texture/audio asset fails to load and falls back. Keep production silent.
**Files likely involved:** `src/engine/enemy-sprite-cache.ts`, `src/engine/renderer.ts`, `src/engine/audio.ts`.
**Estimated effort:** Half day.
**Risk:** Low — dev-only warnings, no production impact.
**Dependencies:** None.
**Acceptance criteria:** In dev mode, missing enemy sprite logs a warning. Missing floor texture logs a warning. Missing audio file logs a warning. Production mode is silent.
**What not to change:** The fallback behavior itself. Fallbacks should remain for runtime stability.

#### 2.3 Extract level-up processing from `main.ts` (during next leveling change)

**Category:** State ownership / Testability
**Severity:** Medium
**Evidence:** `main.ts:700+` contains level-up processing logic (XP banking, `levelUpChar` loop, `PendingPerkChoice` queue management) that is business logic, not composition.
**Proposed change:** Extract `processLevelUps(party, xpEarned): { messages: string[], pendingPerks: PendingPerkChoice[] }` into `src/game/leveling.ts` or a new `src/game/post-combat.ts`. `main.ts` calls it and handles the UI side.
**Files likely involved:** `src/main.ts`, `src/game/leveling.ts` or new `src/game/post-combat.ts`.
**Estimated effort:** Half day.
**Risk:** Low — pure extraction, no behavioral change.
**Dependencies:** None.
**Acceptance criteria:** Level-up processing is unit-testable without `main.ts`. `main.ts` calls the extracted function. All existing tests pass.
**What not to change:** The level-up math itself. The perk selection UI flow.

#### 2.4 Add floor-validation warning for deprecated `encounterTable` (during next floor validation work)

**Category:** Content-authoring ergonomics
**Severity:** Low
**Evidence:** `FloorDef.encounterTable` is deprecated but still in the type. An agent can populate it and encounters never trigger.
**Proposed change:** `floor-validate.ts` should emit a warning when `encounterTable` is non-empty, pointing to `ENCOUNTER_TABLES[floorId]`.
**Files likely involved:** `src/game/floor-validate.ts`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** `npm run floor:validate` warns when a floor has a populated `encounterTable`.
**What not to change:** The `encounterTable` field itself (leave for backward compat).

#### 2.5 Add a dependency-boundary test (during next architecture work)

**Category:** Module-boundary clarity / Refactor safety
**Severity:** Low
**Evidence:** The `game/` → `engine/` boundary is clean by convention but not enforced. An agent could add a runtime import from `game/` to `engine/` and nothing would catch it.
**Proposed change:** Add a test that scans `src/game/**/*.ts` (excluding tests) for `import.*from.*engine/` (excluding `import type`) and fails if any are found.
**Files likely involved:** New test file `src/game/dependency-boundaries.test.ts`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low — test-only change.
**Dependencies:** None.
**Acceptance criteria:** Test passes. No runtime `game/` → `engine/` imports. Adding one → test fails.
**What not to change:** Existing `import type` from `game/` to `engine/` (these are compile-time only and acceptable).

#### 2.6 Document the "borrowed title mode" pattern in code (during next UI overlay work)

**Category:** API explicitness / LLM trap prevention
**Severity:** Low
**Evidence:** `AGENTS.md` warns about borrowed "title" mode but the code has no comment explaining the pattern at the `showMode` function.
**Proposed change:** Add a comment block at `showMode()` in `main.ts` documenting: which overlays borrow "title" mode, why, and the invariant (restore previous mode, don't trigger title music).
**Files likely involved:** `src/main.ts`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low — comment only.
**Dependencies:** None.
**Acceptance criteria:** Comment exists at `showMode()` and lists all overlays that borrow "title" mode.
**What not to change:** The mode borrowing mechanism itself.

#### 2.7 Add a pre-commit hook for `dist/` and generated files (during next repo hygiene work)

**Category:** CI enforcement / Repo hygiene
**Severity:** Low
**Evidence:** `.gitignore` excludes `dist/` and `*-preview.html` but an agent using `git add .` could still stage them if `.gitignore` is misconfigured or bypassed.
**Proposed change:** Add a simple pre-commit hook (via `husky` or a plain `.git/hooks/pre-commit` script) that rejects commits touching `dist/`, `*-preview.html`, or `assets/`.
**Files likely involved:** `.husky/pre-commit` or documentation for manual hook setup.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** Committing `dist/` or `*-preview.html` is rejected.
**What not to change:** The `.gitignore` itself.

#### 2.8 Add `floor:validate` to the deploy workflow (during next CI work)

**Category:** Deployment confidence
**Severity:** Medium
**Evidence:** The deploy workflow runs `npm run build` but not `npm run floor:validate`. Invalid floors could be deployed if the build passes.
**Proposed change:** Add `npm run floor:validate` to the deploy workflow's build job, after `npm run build`.
**Files likely involved:** `.github/workflows/deploy.yml`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** Deploy workflow runs floor validation. Invalid floors block deployment.
**What not to change:** The deploy workflow's deployment job.

### Group 3 — Strategic architectural improvements (max 5)

#### 3.1 Extract encounter triggering from `main.ts` into a testable module

**Category:** State ownership / Testability
**Severity:** Medium
**Evidence:** `main.ts:542` (`maybeTriggerEncounter`) contains encounter rate calculation, table lookup, encounter rolling, and combat state creation — all business logic that can't be unit-tested independently.
**Proposed change:** Extract `maybeTriggerEncounter(state, stepsSinceEncounter, loadoutMap): CombatState | null` into `src/game/encounters.ts` (which already exists) or a new `src/game/encounter-trigger.ts`. `main.ts` calls it and handles the combat transition.
**Files likely involved:** `src/main.ts`, `src/game/encounters.ts` or new module.
**Estimated effort:** Half day.
**Risk:** Low — pure extraction.
**Dependencies:** None.
**Acceptance criteria:** Encounter triggering is unit-testable. `main.ts` calls the extracted function. All existing tests pass.
**What not to change:** The encounter rate formula or table structure.

#### 3.2 Consider splitting `combat-choreography.ts` (3,854 lines)

**Category:** Context efficiency / Multi-agent concurrency
**Severity:** Medium
**Evidence:** `combat-choreography.ts` is the largest file in the repo (3,854 lines). It builds timed animation state from combat events. Both painters consume its output.
**Proposed change:** Do NOT split reflexively. Evaluate whether the `push*Steps()` helpers (e.g., `meleeGangUp`) can be extracted into a `combat-choreography-presentations.ts` leaf module. Only split if there are multiple independent responsibility clusters, not just "it's big."
**Files likely involved:** `src/engine/combat-choreography.ts`, potential new leaf module.
**Estimated effort:** One day (with careful testing).
**Risk:** Medium — choreography is the shared contract between two painters. Splitting must not break either.
**Dependencies:** Requires visual verification of both painters after split.
**Acceptance criteria:** Both painters render identically before and after. All combat-scene tests pass. The file is smaller and the extracted module has a single responsibility.
**What not to change:** The `Choreography`/`ChoreoStep`/`ActorAnim` types. The `playTurn`/`updateScene` public API.

#### 3.3 Add structured asset-integrity validation

**Category:** Asset-pipeline safety
**Severity:** Medium
**Evidence:** No automated check for sprite dimensions, alpha channels, or manifest-to-file consistency. `sprite-alpha.ts` handles background keying but is opt-in.
**Proposed change:** Add a `npm run asset:validate` script that checks: (1) every `sprite-manifest.ts` path exists on disk, (2) sprite PNGs are the expected dimensions (100×100 frames), (3) floor tileset PNGs are 256×256, (4) no orphaned assets. Run in CI.
**Files likely involved:** New `scripts/asset-validate.ts`, `package.json`.
**Estimated effort:** One day.
**Risk:** Low — validation script, no runtime impact.
**Dependencies:** None.
**Acceptance criteria:** `npm run asset:validate` detects missing/malformed assets. CI runs it.
**What not to change:** The asset files themselves or the manifest structure.

#### 3.4 Add a preview/resolver shared computation module

**Category:** Combat / Drift prevention
**Severity:** Medium
**Evidence:** `combat-preview.ts` and `combat-actions.ts`/`combat-spells.ts` both compute damage but through separate code paths.
**Proposed change:** Extract the shared damage computation (base damage, AC, perk modifiers, element multipliers) into a `combat-damage-math.ts` module that both preview and resolver call. The preview calls it with "expected" rolls; the resolver calls it with actual RNG rolls. This eliminates drift by construction.
**Files likely involved:** `src/game/combat-preview.ts`, `src/game/combat-actions.ts`, `src/game/combat-spells.ts`, new `src/game/combat-damage-math.ts`.
**Estimated effort:** One day.
**Risk:** Medium — touches the core combat computation path. Requires thorough testing.
**Dependencies:** Recommendation 1.2 (preview/resolver drift test) should be done first to establish a baseline.
**Acceptance criteria:** Both preview and resolver use the shared module. The drift test passes. No behavioral change in combat outcomes.
**What not to change:** The damage formulas themselves or the perk modifier system.

#### 3.5 Add a lightweight PR template with verification checklist

**Category:** Review efficiency / Process
**Severity:** Low
**Evidence:** PRs are created by agents with varying levels of verification documentation. No template ensures consistent verification claims.
**Proposed change:** Add `.github/pull_request_template.md` with a checklist: `npm test` passed, `npm run build` passed, `npm run floor:validate` passed, visual verification done (if renderer/combat/UI change), `AGENTS.md` pitfalls reviewed.
**Files likely involved:** `.github/pull_request_template.md`.
**Estimated effort:** Under 1 hour.
**Risk:** Very low.
**Dependencies:** None.
**Acceptance criteria:** New PRs include the checklist.
**What not to change:** The existing PR creation process.

### Group 4 — Do not change

#### 4.1 Do not split `renderer.ts` (1,655 lines)

**Why:** The corridor renderer is the most fragile code in the repo (`AGENTS.md` explicitly calls it out). It has one coherent responsibility (pseudo-3D corridor rendering), and the hot-loop code benefits from being in one file where texture sampling, fog, and wall geometry share local state. `render-math.ts` already extracts the pure math. Splitting would introduce cross-file coupling in a performance-critical loop with no testability benefit.

#### 4.2 Do not remove the Canvas combat fallback

**Why:** `combat-scene.ts` is the `?phaser=0` rollback painter. It's explicitly protected by `AGENTS.md`: "Do not remove a fallback renderer or debug surface that is still used by `?phaser=0`, `?debug=1`, or the test suite." It provides a deterministic rendering path that doesn't depend on WebGL, which is valuable for testing and debugging.

#### 4.3 Do not replace vanilla DOM with a framework

**Why:** The hand-drawn DOM UI is appropriate for this project's scale. The FF6-style windows, combat action palette, and town UI are all vanilla DOM + CSS. Introducing React/Vue/Svelte would add bundle size, build complexity, and a learning curve for agents, with no evidence that the current approach is a bottleneck.

#### 4.4 Do not merge game state and UI state into a global store

**Why:** `GameState` (in `game/state.ts`) is cleanly separated from UI controller state (in `engine/`). `main.ts` owns the single `GameState` instance and passes it to controllers. Merging them would create coupling between rules and presentation that the current architecture deliberately avoids.

#### 4.5 Do not rename persisted IDs

**Why:** Enemy, item, perk, NPC, and floor IDs are save-compatible. Renaming them would break existing saves and require migration code. `AGENTS.md` explicitly warns against this.

#### 4.6 Do not remove the `encounterTable` field from `FloorDef`

**Why:** It's deprecated but removing it would break save compatibility and custom floor packs. The field should remain with a validation warning (recommendation 2.4).

#### 4.7 Do not treat line count as proof that `main.ts` needs splitting

**Why:** `main.ts` IS the composition root. Having lifecycle ownership in one place is architecturally correct. The problem is business logic mixed in (level-ups, encounter triggering), not the file's size per se. Extract the business logic (recommendations 2.3, 3.1) but keep the composition root cohesive.

#### 4.8 Do not automate visual regression as a mandatory CI gate

**Why:** Playwright visual tests are valuable but flaky in CI (browser rendering differences, font availability, GPU vs software WebGL). Keep them as manual verification tools. The CI gate should be fast and deterministic: tests + build + floor validation.

---

## 9. Implementation Tickets

### Ticket 1: Add CI workflow for PR checks

**Objective:** Prevent broken code from being merged to `main`.
**Problem:** No CI workflow runs tests/build/floor-validation on PRs. The deploy workflow only runs `npm run build` on push to `main`.
**Scope:** `.github/workflows/ci.yml` (new), GitHub branch protection settings.
**Non-goals:** Do not add browser/visual tests to CI. Do not modify the deploy workflow.
**Implementation approach:** Create `ci.yml` that triggers on `pull_request` and `push` (any branch). Jobs: `npm ci`, `npm test`, `npm run build`, `npm run floor:validate`. Enable branch protection on `main`: require CI check to pass, allow force pushes (solo dev), no required reviewers.
**Tests:** The CI workflow itself is the test — a PR with a failing test should block merge.
**Manual verification:** Open a PR with a deliberately failing test → CI fails. Fix it → CI passes.
**Acceptance criteria:** (1) `ci.yml` exists and runs on PRs. (2) A PR with failing tests cannot be merged. (3) A PR with a failing build cannot be merged. (4) A PR with invalid floors cannot be merged.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `ci/required-pr-checks`

### Ticket 2: Add combat preview/resolver drift test

**Objective:** Automatically detect when damage preview diverges from resolver output.
**Problem:** `combat-preview.ts` and `combat-actions.ts`/`combat-spells.ts` compute damage independently. No test asserts they match.
**Scope:** New test file `src/game/combat-preview-drift.test.ts`, possibly `src/game/combat-preview.ts` (if signature adjustments needed for testing).
**Non-goals:** Do not refactor the computation paths (that's ticket 8). Do not change damage formulas.
**Implementation approach:** Create a parameterized test that constructs a combat state with known party/enemy/equipment, runs `computePreview()` for melee/spell/technique actions, then runs the actual resolver with the same inputs and seeded RNG, and asserts the preview's expected damage matches the resolver's actual damage within ±1.
**Tests:** The test itself. Run with `npm test`.
**Manual verification:** Not required — fully automated.
**Acceptance criteria:** (1) Test passes for melee, spell, and technique actions. (2) Test covers at least 3 party configurations (fighter, mage, mixed). (3) Temporarily changing the resolver without the preview → test fails.
**Estimated effort:** Half day.
**Dependencies:** None.
**Suggested branch name:** `test/combat-preview-resolver-drift`

### Ticket 3: Add enemy sprite manifest coverage test

**Objective:** Detect when an enemy is added without a sprite manifest entry.
**Problem:** Missing manifest entries silently fall back to procedural shapes.
**Scope:** `src/engine/sprite-manifest.test.ts` (extend) or `src/data/enemies.test.ts` (extend).
**Non-goals:** Do not change the manifest or enemy definitions.
**Implementation approach:** Add a test that iterates all `EnemyDef.id`s and asserts each has a `sprite-manifest.ts` entry OR is in an explicit `ENEMIES_WITHOUT_SPRITES` opt-out set. Document the opt-out set as a constant.
**Tests:** The test itself.
**Manual verification:** Not required.
**Acceptance criteria:** (1) Test passes. (2) Every enemy ID has a manifest entry or is in the opt-out set. (3) Adding an enemy without a manifest entry → test fails.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `test/enemy-sprite-manifest-coverage`

### Ticket 4: Add `Math.random()` forbidden-zone test

**Objective:** Prevent regression of the seeded RNG wiring.
**Problem:** No automated guard against `Math.random()` in gameplay code.
**Scope:** New test file or extend `src/game/rng-wiring.test.ts`.
**Non-goals:** Do not change existing gameplay code (unless `Math.random()` is found).
**Implementation approach:** Add a test that reads all `.ts` files in `src/game/` and `src/data/` (excluding `.test.ts` and `rng.ts`), scans for `Math.random()`, and fails if any are found.
**Tests:** The test itself.
**Manual verification:** Not required.
**Acceptance criteria:** (1) Test passes. (2) No `Math.random()` in `src/game/` or `src/data/` (excluding tests and `rng.ts`). (3) Adding `Math.random()` to a game file → test fails.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `test/no-math-random-in-gameplay`

### Ticket 5: Add `npm run check` wrapper command

**Objective:** Provide a single command for baseline verification.
**Problem:** Three separate commands (`npm test`, `npm run build`, `npm run floor:validate`) must be run and remembered.
**Scope:** `package.json`, `AGENTS.md`, `README.md`.
**Non-goals:** Do not remove the individual commands.
**Implementation approach:** Add `"check": "npm test && npm run build && npm run floor:validate"` to `package.json`. Document in `AGENTS.md` and `README.md` as the pre-commit verification command.
**Tests:** Run `npm run check` — all three commands execute.
**Manual verification:** Not required.
**Acceptance criteria:** (1) `npm run check` runs all three commands. (2) Exits non-zero if any fail. (3) Documented in `AGENTS.md` and `README.md`.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `chore/add-check-command`

### Ticket 6: Add floor-validation warning for deprecated `encounterTable`

**Objective:** Prevent agents from using the deprecated `encounterTable` field.
**Problem:** `FloorDef.encounterTable` is deprecated but no validation warns when it's populated.
**Scope:** `src/game/floor-validate.ts`.
**Non-goals:** Do not remove the `encounterTable` field.
**Implementation approach:** Add a warning in `floor-validate.ts` when `floor.encounterTable` is non-empty, with a message pointing to `ENCOUNTER_TABLES[floorId]`.
**Tests:** Add a test case in `floors.test.ts` or `floor-validate.ts` tests that a floor with a populated `encounterTable` emits a warning.
**Manual verification:** Run `npm run floor:validate` — no warnings for current floors (they should use `ENCOUNTER_TABLES`).
**Acceptance criteria:** (1) `npm run floor:validate` warns when `encounterTable` is non-empty. (2) Current floors produce no warnings. (3) Test covers the warning case.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `feat/floor-validate-encounter-table-warning`

### Ticket 7: Add dependency-boundary test

**Objective:** Enforce the `game/` → `engine/` layer boundary at test time.
**Problem:** The boundary is clean by convention but not enforced.
**Scope:** New test file `src/game/dependency-boundaries.test.ts`.
**Non-goals:** Do not change existing imports. Do not forbid `import type`.
**Implementation approach:** Add a test that scans `src/game/**/*.ts` (excluding `.test.ts`) for `import.*from.*engine/` (excluding `import type`) and fails if any runtime imports are found.
**Tests:** The test itself.
**Manual verification:** Not required.
**Acceptance criteria:** (1) Test passes. (2) No runtime `game/` → `engine/` imports. (3) Adding a runtime import → test fails.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `test/dependency-boundary-game-engine`

### Ticket 8: Extract shared combat damage math

**Objective:** Eliminate preview/resolver drift by construction.
**Problem:** `combat-preview.ts` and `combat-actions.ts`/`combat-spells.ts` compute damage through separate code paths.
**Scope:** `src/game/combat-preview.ts`, `src/game/combat-actions.ts`, `src/game/combat-spells.ts`, new `src/game/combat-damage-math.ts`.
**Non-goals:** Do not change damage formulas or perk modifier system. Do not change combat outcomes.
**Implementation approach:** Extract the shared damage computation (base damage, AC, perk modifiers, element multipliers) into `combat-damage-math.ts`. Both preview and resolver call it. The preview passes "expected" rolls (average, min, max); the resolver passes actual RNG rolls.
**Tests:** All existing combat tests must pass. The drift test (ticket 2) must pass. New tests for the shared module.
**Manual verification:** Combat in Arena mode — damage numbers should be unchanged.
**Acceptance criteria:** (1) Both preview and resolver use `combat-damage-math.ts`. (2) All existing tests pass. (3) Drift test passes. (4) No behavioral change in combat outcomes.
**Estimated effort:** One day.
**Dependencies:** Ticket 2 (drift test) should be done first to establish a baseline.
**Suggested branch name:** `refactor/combat-damage-math-shared`

### Ticket 9: Add `floor:validate` to deploy workflow

**Objective:** Prevent invalid floors from being deployed.
**Problem:** Deploy workflow runs `npm run build` but not `npm run floor:validate`.
**Scope:** `.github/workflows/deploy.yml`.
**Non-goals:** Do not modify the deployment job.
**Implementation approach:** Add `- run: npm run floor:validate` after `npm run build` in the build job.
**Tests:** The workflow itself.
**Manual verification:** Not required.
**Acceptance criteria:** (1) Deploy workflow runs `npm run floor:validate`. (2) Invalid floors block deployment.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `ci/deploy-floor-validate`

### Ticket 10: Extract level-up processing from `main.ts`

**Objective:** Make level-up processing unit-testable.
**Problem:** `main.ts:700+` contains level-up business logic (XP banking, `levelUpChar` loop, `PendingPerkChoice` queue) that can't be tested independently.
**Scope:** `src/main.ts`, `src/game/leveling.ts` or new `src/game/post-combat.ts`.
**Non-goals:** Do not change the level-up math. Do not change the perk selection UI.
**Implementation approach:** Extract `processLevelUps(party, xpEarned): { messages: string[], pendingPerks: PendingPerkChoice[] }` into `leveling.ts` or `post-combat.ts`. `main.ts` calls it and handles the UI.
**Tests:** New unit tests for `processLevelUps`. All existing tests pass.
**Manual verification:** Post-combat level-up flow works as before.
**Acceptance criteria:** (1) `processLevelUps` is unit-testable. (2) `main.ts` calls it. (3) All existing tests pass. (4) Level-up flow is unchanged.
**Estimated effort:** Half day.
**Dependencies:** None.
**Suggested branch name:** `refactor/extract-level-up-processing`

### Ticket 11: Add PR template with verification checklist

**Objective:** Standardize PR verification claims.
**Problem:** PRs have inconsistent verification documentation.
**Scope:** `.github/pull_request_template.md` (new).
**Non-goals:** Do not change the PR creation process.
**Implementation approach:** Create a template with: Summary, Test plan (npm test, npm run build, npm run floor:validate, visual verification if applicable), AGENTS.md pitfalls reviewed.
**Tests:** Not applicable.
**Manual verification:** Open a new PR — template appears.
**Acceptance criteria:** (1) Template exists. (2) New PRs include the checklist.
**Estimated effort:** Under 1 hour.
**Dependencies:** None.
**Suggested branch name:** `chore/pr-template`

---

## 10. Do-Not-Change List

1. **`renderer.ts` (1,655 lines)** — Cohesive hot-loop code; `render-math.ts` already extracts pure math. Splitting would harm performance and readability.
2. **Canvas combat fallback (`combat-scene.ts`)** — Protected by `AGENTS.md`, used by `?phaser=0` and tests. Provides a non-WebGL rendering path.
3. **Vanilla DOM architecture** — Appropriate for project scale. No evidence that a framework would help.
4. **Separation of `GameState` from UI state** — Clean architectural boundary. Merging would create coupling.
5. **Persisted IDs (enemy, item, perk, NPC, floor)** — Save-compatible. Renaming would break saves.
6. **Deprecated `encounterTable` field** — Keep for backward compat; add validation warning instead.
7. **`main.ts` as composition root** — Keep cohesive. Extract business logic but don't split the file for size alone.
8. **Manual visual regression** — Playwright visual tests are valuable but too flaky for mandatory CI. Keep as manual verification.

---

## 11. Verification Performed

| Check | Result |
|-------|--------|
| `git status --short` | Clean (no uncommitted changes at start) |
| `git branch --show-current` | `audit/llm-maintainability-glm` |
| `git rev-parse HEAD` | `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415` |
| `npm test` | 1,934 passed, 0 failed, 0 skipped (95 files, ~13s) |
| `npm run build` | Success (tsc + tsc tools + vite build, ~891ms vite) |
| `npm run floor:validate` | All 5 floors OK (no issues) |
| `git diff --check` | Clean |
| `npm run` (script inventory) | 19 scripts available |
| Source file inventory | 245 files in `src/` |
| Largest files identified | `combat-choreography.ts` (3,854), `main.ts` (2,528), `combat-phaser-stage.ts` (2,480) |
| Dependency direction check | Zero runtime `game/` → `engine/` imports; `engine/` → `game/` mostly `import type` |
| CI workflow inspection | 1 workflow (deploy-only, no PR checks) |
| Branch protection check | None (GitHub API 404) |
| Debug API inventory | 8 debug modules with tests, `__onyxDebug` typed API |
| Test fixture duplication | 12+ duplicated helpers across test files |
| Save migration inspection | 10 migrations (v4→v14), tested |
| Silent fallback inspection | Multiple `catch(() => null)` in renderer/audio, procedural shape fallbacks |

---

## 12. Confidence and Limitations

### High confidence (directly observed)
- No CI gate on PRs (read workflow file, verified GitHub API 404)
- 1,934 tests pass (ran `npm test`)
- Build succeeds (ran `npm run build`)
- All 5 floors validate (ran `npm run floor:validate`)
- 12+ duplicated test fixtures (grep across test files)
- `main.ts` is 2,528 lines with 46 mutable globals and 41 functions (wc + grep)
- No runtime `game/` → `engine/` imports (grep)
- Combat preview and resolver are separate code paths (read both files)
- Silent asset fallbacks exist (read renderer/audio source)
- Seeded RNG is wired (read `rng.ts`, `rng-wiring.test.ts`, `deterministic-replay.test.ts`)

### Medium confidence (inferred from structure)
- `combat-choreography.ts` (3,854 lines) is a context burden but may be cohesive (read header, did not read entire file)
- `main.ts` business logic extraction would improve testability (read the level-up section, did not implement)
- Shared damage math extraction would eliminate drift (read both paths, did not verify they're identical)
- Asset-integrity validation would catch missing sprites (inferred from fallback pattern, did not audit every enemy)

### Low confidence (speculative)
- Whether `combat-choreography.ts` can be safely split (would need to read the entire file and understand all `push*Steps` helpers)
- Whether the preview/resolver drift is currently present (the test doesn't exist yet)
- Whether a fifth party member would work (stress-test analysis based on grep, not implementation)
- Exact number of enemies missing sprite manifest entries (did not cross-reference every ID)

### Not verified
- Browser/visual testing (no browser available in this audit environment)
- Playwright script functionality (scripts exist but were not run)
- Phaser-specific debug hooks (read the interface, did not test)
- Full content of `combat-choreography.ts` (3,854 lines — read header and structure only)
- Full content of `combat-phaser-stage.ts` (2,480 lines — read debug hook section only)
- Audio system behavior (read source, did not test audio playback)
- Floor editor functionality (read source, did not run the editor)

---

## Questions Answered

1. **How easy is it for a new advanced LLM to make a safe change today?** Moderately easy if it reads `AGENTS.md` first. The file map and change-location table are excellent. The main risk is the lack of CI — an agent must self-verify with `npm test` + `npm run build` + `npm run floor:validate`, and nothing enforces this.

2. **What currently consumes the most unnecessary context?** `main.ts` (2,528 lines), `combat-choreography.ts` (3,854 lines), and `combat-phaser-stage.ts` (2,480 lines) require reading most of the file for small changes. No subsystem context packs exist to provide focused guidance.

3. **Five most likely sources of plausible-but-wrong agent changes?** (1) Adding content without manifest entries, (2) updating resolver without preview, (3) using deprecated `encounterTable`, (4) confusing borrowed "title" mode, (5) updating Phaser without Canvas fallback.

4. **Which public behaviors lack direct regression coverage?** Combat preview ↔ resolver consistency. Enemy ID ↔ sprite manifest coverage. `Math.random()` forbidden zone. Visual regression (Phaser vs Canvas parity).

5. **Which systems are too dependent on `main.ts`?** Level-up processing, encounter triggering, perk selection queue management, save/load orchestration, debug API installation. All are business logic mixed into the composition root.

6. **Which extension paths require editing too many files?** Adding an enemy (4-5 files: enemies.ts, enemy-abilities.ts, sprite-manifest.ts, asset folder, test). Adding a perk (3-4 files: data/perks.ts, game/perks.ts, combat-actions/spells.ts, test). Both are well-documented but could benefit from coverage tests.

7. **Which runtime contracts exist only as comments or convention?** Preview ↔ resolver consistency. Sprite manifest coverage. `Math.random()` forbidden zone. Borrowed "title" mode invariants. Both painters consuming the same choreography state.

8. **Which fallbacks hide missing content or broken configuration?** Missing enemy sprites → procedural shapes. Missing floor textures → placeholder textures. Missing audio → silent catch. Missing maze props → glyph fallback. All are silent in production.

9. **Which tasks remain difficult to reproduce deterministically?** Full playthrough replay (not implemented — only per-system determinism). Visual regression (no automated comparison). Phaser-specific rendering bugs (no headless WebGL in CI).

10. **Which validation steps are manual but should be automated?** `npm test` + `npm run build` + `npm run floor:validate` (should be one command + CI gate). Enemy sprite manifest coverage. `Math.random()` forbidden zone. Preview/resolver drift. Asset integrity.

11. **Which checks should be required on every PR?** `npm ci`, `npm test`, `npm run build`, `npm run floor:validate`. All are fast (<30s total) and deterministic.

12. **Where would subsystem-level test builders provide real value?** Combat test fixtures (12+ duplicated `makeEnemy`/`makeParty`/`makeCombatState` helpers). A shared `test-fixtures.ts` would reduce context, prevent drift, and make new tests easier to write correctly.

13. **Would dependency-boundary enforcement help?** Yes — a test asserting no runtime `game/` → `engine/` imports would protect the cleanest architectural boundary in the codebase at zero cost.

14. **Would splitting any large file materially reduce risk?** `main.ts` — yes, extracting business logic (not splitting for size). `combat-choreography.ts` — maybe, but needs careful analysis. `renderer.ts` — no, it's cohesive and fragile.

15. **Which apparent imperfections should deliberately remain untouched?** `renderer.ts` size, Canvas fallback, vanilla DOM, `GameState`/UI separation, persisted IDs, deprecated `encounterTable` field, `main.ts` as composition root, manual visual regression.

16. **Single highest-return next maintainability investment?** Add a CI workflow that runs `npm test` + `npm run build` + `npm run floor:validate` on every PR, plus basic branch protection. This is under 1 hour of work, very low risk, and prevents every class of broken-code-deployed bug.

17. **What should be completed before implementing temporary fifth-party companions?** Verify that combat positioning, UI layout, and save/load handle a 5-member party. The rules layer is array-based and likely ready. The presentation layer has hardcoded 4-slot positioning. A spike test with `PARTY_SIZE = 5` would identify the exact break points.

18. **What should be completed before adding more floors?** The floor authoring pipeline is ready. Add `floor:validate` to the deploy workflow (ticket 9) and the CI gate (ticket 1) first. No other blockers.

19. **What should be completed before adding many more enemy and NPC assets?** Add the sprite manifest coverage test (ticket 3) and dev-mode asset warnings (recommendation 2.2) first. Without these, missing assets are invisible.

20. **What will make the next 100 commits safer than the previous 100?** (1) CI gate on every PR, (2) `npm run check` wrapper, (3) drift tests (preview/resolver, Math.random, manifest coverage, dependency boundaries), (4) shared test fixtures, (5) PR template with verification checklist.
