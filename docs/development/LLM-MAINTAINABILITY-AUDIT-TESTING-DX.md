> Status: Point-in-time audit (3 of 3 parallel independent audits — testing/CI/developer-experience scope).
> This report records the repository state at commit `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.
> Revalidate recommendations against current `main` before implementation.

# OnyxLabyrinth — Testing / CI / Developer-Experience Audit

## 1. Executive summary

The test suite is large (1934 tests / 95 files), the build is clean, and the debug-surface architecture (`src/debug/*.ts`) is a genuinely strong, deliberately-designed pattern: every debug helper is a pure, typed, unit-tested function that the `?debug=1`-gated `window.__onyxDebug` object wraps. Save-schema migration (v1→v14) is thoroughly tested with one regression test per version bump. Floor authoring has a real linter (`floor-validate.ts`), a CLI, and a schema doc that already prescribes the exact local verification sequence CI is missing.

The single most consequential finding, reproduced empirically twice in this audit: **`src/game/rng.ts:61` defaults the global gameplay RNG to `Math.random`, and `vitest.config.ts` declares no `setupFiles`**, so ~34 test files that build characters via `createCharacter`/`createDefaultParty` roll real random stats on every run. This is not a hypothetical — it produced an actual `npm test` failure in this session (`src/game/features.test.ts:302`, run 1 of 2). The team has repeatedly worked around individual instances of this class of bug (explicit stat-pinning in the ice-shards test, `e63619a`; single-construction-then-reuse in `deterministic-replay.test.ts`) rather than fixing the shared root cause, and a separate, well-wired production-path fix (`1cdb084`, "wire seeded gameplay RNG into all gameplay paths") deliberately left the *default* unseeded — by design, for normal play — without adding a parallel default seed for the *test* runner. The fix is small, low-risk, and already has all its building blocks (`setGameplayRng`/`resetGameplayRng`/`createSeededRng` are exported and used correctly by 4 files today); it is Group 1's highest-return item.

CI currently runs `npm ci && npm run build` on push-to-main only — there is no `pull_request` trigger anywhere in `.github/workflows/`, so no status check can gate a PR today regardless of what a workflow file contains. `npm test` and `npm run floor:validate` are documented (`docs/FLOOR-AUTHORING.md:136-140`) as things a human/agent must remember to run locally — the doc itself concedes CI doesn't enforce them. Fixing this requires a new `pull_request`-triggered workflow, not an edit to `deploy.yml` (which is `push`-only and shares a `concurrency: group: pages` that PR runs shouldn't contend with).

The default combat painter (`combat-phaser-stage.ts`, 2480 lines) is untested by explicit, documented policy (`AGENTS.md:160`: "Do not import `combat-phaser-stage.ts` from tests (jsdom)"), not oversight — Phaser needs a real canvas/WebGL context jsdom can't provide. This is a reasonable trade-off, evidenced by a real shipped incident (an uncaught Phaser `update` exception froze the battle screen permanently, fixed 2026-08-01, `AGENTS.md:135`) whose regression coverage is a screenshot-hashing script (`scripts/playtests/arena-freeze-verify.mjs`), not a unit test. This is the correct shape for a scheduled/manual check, not a required PR gate.

## 2. Verified repository baseline (commit be6131c1dcdf5a06922a3b6cb6fac4f9447f5415)

### Environment
```
git rev-parse HEAD          be6131c1dcdf5a06922a3b6cb6fac4f9447f5415
git rev-parse origin/main   be6131c1dcdf5a06922a3b6cb6fac4f9447f5415   (HEAD == current main)
git diff --check            clean, exit 0
node --version              v22.23.2
npm --version               11.5.2
```

### Command results (reused from the sibling broad audit's baseline run; not re-executed except where noted)
| Command | Result | Duration | Notes |
|---|---|---|---|
| npm ci | PASS | ~3.1 s | 150 packages added, 151 audited; "3 high severity vulnerabilities" (dev-only transitive: playwright, postcss, undici — not runtime risk, only runtime dep is phaser 4.2.1) |
| npm test | INTERMITTENTLY FAILS (~1.9%+ of runs) | ~16-17 s | 95 files / 1934 tests. Root cause: `src/game/rng.ts:61` defaults the global gameplay RNG to `Math.random`; `vitest.config.ts` declares NO `setupFiles`; 34 test files construct characters with real random stat rolls. Known failure example: `src/game/features.test.ts:302` "gas damages every living member but never below 1 HP" fails when a rolled maxHp <= 12 (measured 1.87% rate over 12 runs / 50,000 samples). A SECOND known flake is recorded in `docs/AGENT-READING-LIST.md:7-10` (order-dependent, `src/game/combat-turns.test.ts`, ice-shards test, cross-test state leakage) — **this audit traced that flake to a specific fix commit and found the doc's hedge is now partially stale; see §3 and §9.** |
| npm run build | PASS | ~9.7 s | tsc (app) + tsc -p tsconfig.tools.json + vite build; ZERO TypeScript errors on both projects. Non-fatal build warning: combat-phaser-stage chunk 1,411.33 kB (gzip 369.35 kB), over the 500 kB Vite threshold. |
| npm run floor:validate | PASS | ~0.4 s | all 5 floors "OK (no issues)" |

### Config facts
- `vitest.config.ts`: environment "jsdom", include `["src/**/*.test.ts","scripts/**/*.test.ts"]`, NO `setupFiles`, no retry, no `sequence.seed`
- `vite.config.ts`: base "/OnyxLabyrinth/", `assetsInlineLimit` 10240, 4 rollup inputs
- `.github/workflows/` = exactly one file, `deploy.yml`: `on: push:branches:[main] + workflow_dispatch` only. Build job runs `npm ci` + `npm run build` + uploads `dist`. Deploy job publishes to Pages. NO `npm test`. NO `floor:validate`. **NO `pull_request` trigger at all** — confirmed by direct read of the file in this worktree, byte-identical to the reused baseline.
- Full npm run script list: `dev, build, check:tools, preview, test, test:watch, floor:validate, floor:dump, floor:export-all` (WRITES into `public/tools/floor-data` — do not run as an integrity check), `floor:check` (NOT a drift check — requires `--file path/to/map.json`, bare invocation errors and exits 1), `floor:editor, sprite-preview:generate` (writes into tree), `generate:combat-bg` (writes into tree), `tileset:gallery` (writes into tree), `visual:floors` (writes into tree), `sprite-preview:serve, sprite-preview, replay, replay:record`.
- Size: src production .ts 111 files | src *.test.ts 93 files | docs 140 | scripts 99 | tools 15. Tests: 95 files / 1934 tests. **One of those files, `scripts/debug-choreography.test.ts`, has zero `expect()` calls** — it is a `console.log` trace harness, not a regression check (see §3).
- `src/main.ts` is 2,528 lines with 65 imports (3x the next-highest file) and ~50 top-level functions spanning most subsystems — a likely single-file bottleneck for concurrent agents editing different features. Confirmed by direct `wc -l` in this worktree: 2528 lines.
- The Phaser combat painter (`combat-phaser-stage.ts`, ~2,480 lines) is the shipped default combat renderer and is untested **by explicit documented policy**, not by oversight — see §4.

### Narrow re-verification performed this session
- Re-ran `npm test` twice (within the audit's 2-3 run allowance). Run 1: **1 test failed** — `src/game/features.test.ts:302` `"gas damages every living member but never below 1 HP"`, `expected 1 to be +0` (i.e. `state.party[1].hp` was `1`, clamped, but the assertion expected `maxHp - 12` which had gone non-positive). Run 2: all 1934 tests passed. This directly reproduces the baseline's documented flake on the very first attempt — strong first-party evidence, not an inferred risk.

## 3. Test & fixture findings (Phase 6E)

**Finding 1 (High confidence, directly observed).** The gameplay RNG defaults to `Math.random` (`src/game/rng.ts:61`, `let gameplayRng: Rng = Math.random;`), and nothing in `vitest.config.ts` seeds it before a test run. `createCharacter` (`src/game/party.ts:249-278`) calls `rollStatsForRace` → `rollD6` (`src/game/party.ts:192`, `getGameplayRng()() * 6`), so every character built via `createCharacter`/`createDefaultParty` gets real random stats in tests, unless a test manually overrides them. `grep -rln "createCharacter(" src --include="*.test.ts"` returns **26 files**. Only 4 files (`rng-wiring.test.ts`, `rng.test.ts`, `npc-ui.test.ts`, `deterministic-replay.test.ts`) call `setGameplayRng`/`createSeededRng` to seed it. This produced a real, reproduced failure this session (see §2).

**Finding 2 (High confidence, directly observed).** The team has fixed this class of bug **per call site**, not at the root, at least three times:
  1. `src/game/combat-turns.test.ts:1529-1578` (the ice-shards test) — fixed in `e63619a` ("pin party stats in the ice-shards soak test") by hardcoding `c.stats` and `c.maxHp` on every party member, plus adding a second regression test (`combat-turns.test.ts:1559-1578`) that force-mocks `Math.random` to `0` to lock in the worst case.
  2. `src/game/deterministic-replay.test.ts:78-83` — the file's own comment states the party is "created ONCE per test... because `createDefaultParty` rolls stats with unseeded `Math.random()` — building it inside each run would inject non-determinism... and defeat the test."
  3. `1cdb084` ("wire seeded gameplay RNG into all gameplay paths", 2026-08-03) wired `getGameplayRng()` into every gameplay randomness site (combat, encounters, stat rolls, features, NPC steal, Arena) specifically so a *caller* (playtest script or test) can seed it — but its own commit message states "Normal play is unchanged (`getGameplayRng()` defaults to `Math.random`)". It deliberately did not touch the test runner's default.
  None of these closes the general case, which is why a *different* test (`features.test.ts:302`) still flakes. **This is the audit's highest-return recommendation** (Group 1, Ticket T1): a `vitest.config.ts` `setupFiles` entry with a `beforeEach` reseed (per-file `setupFiles` alone is insufficient — `beforeEach` is required to also close the *within-file* order-dependence the ice-shards flake description names).

**Finding 3 (Medium confidence, directly observed, narrow scope).** Three independent, non-shared `makeChar`/`makeCharacter` test-local factory functions exist: `src/engine/combat-action-palette.test.ts:7-30` (a hand-rolled literal `Character` object, no RNG), `src/game/perks.test.ts:33-40` (wraps `createCharacter` then overwrites `stats`/`hp`/`sp`), and `src/game/combat-damage-contract.test.ts:42-54` (wraps `createCharacter` then overwrites `level`/`maxHp`/`hp`/`maxSp`/`sp`). Two of the three exist specifically to escape random stat rolls — i.e. this "fixture duplication" is a downstream symptom of Finding 1, not an independent problem. **A shared test builder is not recommended standalone** (only 3 consumers, and the anti-pattern rule requires ≥2 proven consumers plus benefit, not hypothetical value) — if Group 1 (RNG seeding) lands first, the motivation to hand-write per-file `makeChar` wrappers to escape non-determinism mostly evaporates, and any builder recommendation should be re-evaluated *after*, not proposed in parallel.

**Finding 4 (High confidence, directly observed).** `scripts/debug-choreography.test.ts` matches the `vitest.config.ts` include glob (`scripts/**/*.test.ts`) and runs as part of `npm test`, contributing 2 of the 1934 counted tests — but it contains **zero `expect()` calls** (`grep -c "expect(" scripts/debug-choreography.test.ts` → `0`). Per `AGENTS.md:178` it is deliberately a `console.log` trace harness ("run it in isolation... `--reporter=verbose`... prints every actor's state/offset/popup/banner"), and it does still exercise the real AI resolver + choreography engine, so it would catch a thrown exception — but it asserts no specific behavior and would silently accept a wrong-but-non-throwing choreography change. This is a concrete, cited counter-example to "test count = test quality," which the audit brief explicitly warns against treating as equivalent — worth calling out rather than silently absorbing into the "95 files / 1934 tests" headline.

**Finding 5 (High confidence, directly observed).** `src/data/enemies.test.ts` and `src/engine/sprite-manifest.test.ts` together give real, already-working referential-integrity and asset-integrity coverage, which is worth naming because it changes the risk profile of Walkthrough A (§6): `enemies.test.ts:100` asserts "every spawn enemyId in every floor's table resolves to a defined enemy", `enemies.test.ts:248` asserts "every enemy's abilityIds resolve to a defined ability", and `sprite-manifest.test.ts:49-70` reads real PNG files off disk via a hand-rolled IHDR parser and asserts every declared sprite strip's width/height matches the manifest. A malformed or mistyped new-enemy wiring is caught by the existing suite, not just by `floor-validate.ts`.

**Finding 6 (Medium confidence, directly observed).** Save-schema migration testing (`src/game/save.test.ts`) is a strong, representative pattern worth preserving as-is: one dedicated `it(...)` per version-bump migration (v4→v5 inventory, v5→v6 perkIds, v6→v7/v7→v8 spell-id remaps, v10 XP-progress reset, v11 worldYear backfill, v12 hasCompletedEnding backfill, v13→v14 roster trim), plus explicit rejection tests for incompatible/too-old versions (`save.test.ts:116`, `:125`) and corrupted-JSON handling (`save.test.ts:133`). This is the kind of fixture-per-scenario test that should be the template for other schema-shaped changes, not something to "improve" with an abstraction.

## 4. Debug-surface inventory and findings (Phase 6F)

The full `window.__onyxDebug` surface is defined at `src/main.ts:2438-2521`, gated behind `?debug=1` (`src/main.ts:2200`, `new URLSearchParams(window.location.search).has("debug")`) — confirmed not exposed in normal play. A parallel `window.render_game_to_text` alias exists at `src/main.ts:2436`. These are the only two `(window as any).` exposures in `main.ts`.

| Member | Backing implementation | Typed? | Tested? | Error behavior |
|---|---|---|---|---|
| `state`, `SPELLS_BY_ID`, `ITEMS_BY_ID`, `FLOORS`, `getBarksEnabled` | raw references | yes (TS) | indirectly | n/a (data, not a call) |
| `snapshot` / `render_game_to_text` | `src/debug/snapshot.ts` (`buildSnapshot`) — pure, no DOM/engine imports | yes | `src/debug/snapshot.test.ts` (372 lines) | n/a |
| `isIdle`, `readiness` | `src/debug/idle.ts` (`computeIdle`) | yes | `src/debug/idle.test.ts` | n/a |
| `log`, `clearLog`, `sounds`, `soundsPlaying` | `src/debug/event-buffer.ts`, `src/debug/audio-spy.ts` | yes | `event-buffer.test.ts`, `audio-spy.test.ts` | n/a |
| `jumpTo` | `src/debug/jump-to.ts` (`applyJumpPartyOptions`) + real `transitionToFloor` in `main.ts:2354-2405` | yes, `JumpToOptions` interface | `jump-to.test.ts` | **Throws explicit errors**: "refuse while combat is active", "refuse while an overlay controller is open", "refuse while camp/game-over/arena/party-creation is live", "no floor {id}" |
| `dumpSave`, `loadSave` | `serialize`/`deserialize` + `src/debug/load-normalize.ts` | yes | `load-normalize.test.ts`, `save.test.ts` | `loadSave` **throws explicit errors** for combat-active, overlay-open, and deserialize-failed cases (`main.ts:2408-2426`) |
| `startCombat` | `src/debug/start-combat.ts` (`buildDebugCombat`) — extracted specifically to fix Issue #20 | yes | `start-combat.test.ts` | **Throws explicit errors**: "combat is already active", "no party", "no floor", "rollEncounter returned null...", "resolveEncounter returned no spawns" |
| `exitDebugCombat` | inline in `main.ts:870-876` | yes (typed `result` union) | **no dedicated test found** | **Silently no-ops** (`if (!combatController \|\| !state.combat) return;`) — no thrown error, no return value, no log line, if called with no active combat |
| `setGameplayRng`, `resetGameplayRng`, `createSeededRng` | `src/game/rng.ts` (production module) | yes | `rng.test.ts` | n/a |
| `FLOORS`, `findFloor`, `registerFloorMap`, `createGameState`, `createCombatFromEncounter`, `resolveEncounter`, `rollEncounter`, `defaultLoadoutForCharacter` | raw references to production functions | yes (real production signatures) | yes, indirectly, via their own production test files | none — direct passthrough, no console-facing validation; wrong-shape console args produce a normal TS-shape-mismatch runtime error deep in production code, same as any misuse of these functions from real code |
| `renderBattleArena`, `renderCorridorBackdrop` | raw references to `src/engine/renderer.ts` | yes | yes, indirectly | none |
| `groundPlaneProbe` | **inline** in `main.ts:2465-2510`, ~45 lines | **partially** — casts `combatController` via `as unknown as { scene: {...} }` (`main.ts:2485`) instead of importing the real `CombatScene` type | **no test found** | returns `null` if no combat controller; otherwise computes and returns a diagnostic object, no thrown errors |

**Finding 7 (High confidence, directly observed).** The recently-fixed class of bug — "a debug helper exposed as a bare reference to an internal function whose call signature the zero-arg debug convention doesn't match" (`0550fc4`/`ea08814`, Issue #20) — is now well-guarded for the helpers that got the `src/debug/*.ts` extraction treatment (`jump-to.ts`, `start-combat.ts`, `snapshot.ts`, `idle.ts`, `load-normalize.ts`, `event-buffer.ts`, `audio-spy.ts`, `invariants.ts` — every one of these 8 modules has a matching `.test.ts`, 1672 lines of debug-surface tests total). The pattern is genuinely good: pure, DOM-free, typed function + dedicated test, with `main.ts` doing only the async/DOM-touching glue. **It has not been extended to every debug entry**, however: `groundPlaneProbe` remains inline, untested, and uses an inline structural type cast (`as unknown as {...}`) instead of importing the real `CombatScene` type from `combat-scene.ts` — even though `CombatController` (`src/engine/combat-ui.ts:168-169`) exposes a legitimately public `get scene(): CombatScene` getter it could import and use directly. This is not the *same* bug as Issue #20 (it does correctly reuse the real production `partyPos`/`enemyPos` functions, `main.ts:24`, rather than reimplementing positioning math) but it is the same *risk class*: if `CombatScene`'s real shape changes, this inline cast gets no compile-time warning, and the first symptom would be an unhelpful runtime `undefined` access deep in a diagnostic helper nobody is testing. **Medium confidence** on severity — it's a diagnostic/read path, not a state-mutating one, so a crash here can't corrupt game state, only annoy whoever is calling it.

**Finding 8 (Medium confidence, directly observed).** Debug-helper error-handling philosophy is inconsistent. `jumpTo`, `loadSave`, and the fixed `startCombat` all throw explicit, actionable `Error`s with a `"helperName: reason"` message convention when preconditions aren't met (exactly the pattern that fixed Issue #20). `exitDebugCombat` (`main.ts:870-876`) instead silently returns `undefined` if there's no active combat controller — a scripted Playwright/agent session that calls `exitDebugCombat("victory")` at the wrong moment gets no signal at all that nothing happened, unlike every sibling helper. This is a small, cheap, high-value fix in the same spirit as the Issue #20 fix (Group 1, Ticket T4).

**Finding 9 (Not fully in scope — noted briefly).** Whether debug helpers could be called with malformed console input (e.g. `jumpTo({})` missing `floorId`, or `rollEncounter("not-a-number")`) and what happens then is adjacent to hidden-coupling/LLM-trap territory the sibling adversarial audit is covering in depth; flagging the observation here (TypeScript types are compile-time only, so a bare browser-console call bypasses them entirely) without re-deriving their analysis.

## 5. CI, branch protection, evidence, and developer-command findings (Phase 7A-D)

### 7A — CI

**Finding 10 (High confidence, directly observed).** `.github/workflows/deploy.yml` has no `pull_request` trigger — confirmed by direct read of the file (`on: push: branches: [main]` + `workflow_dispatch` only). This means **no status check can gate a PR today**, independent of what any workflow *contains*. Any CI recommendation must therefore add a new, separately-triggered workflow (e.g. `ci.yml` with `on: pull_request`) rather than editing `deploy.yml` — that file's `concurrency: group: pages, cancel-in-progress: true` is also scoped to deploys and would be the wrong group for PR validation runs to share.

**Finding 11 (High confidence, directly observed + reproduced this session).** `docs/FLOOR-AUTHORING.md:134-140` ("Gating changes") already states the gap explicitly: "The Pages workflow runs `npm run build` on pushes to `main`, but it does not run the full test suite or floor validator. Before opening a PR that touches floors or the authoring suite, run locally: `npm test && npm run build && npm run floor:validate`." This is first-party confirmation that the team already knows CI under-covers PRs and is currently relying on manual discipline. The recommended `ci.yml` should implement exactly this documented sequence as an automated gate rather than inventing a new one.

**Concrete smallest-reliable-required-CI-suite proposal:**

*Required on every PR* (new `ci.yml`, `on: pull_request`, fast/deterministic, ~15s total per baseline timings):
1. `npm ci`
2. `npm run build` (tsc app + tsc tools + vite build — zero-TS-error gate, ~9.7s)
3. `npm run floor:validate` (~0.4s)
4. `npm test` — **conditional on Ticket T1 landing first** (RNG default seeding). Until then, this is explicitly *not* safe as a hard-blocking required check per the audit brief's own framing, and this audit's own reproduction (1 failure in 2 consecutive runs this session) is direct evidence, not a hypothetical. Two safe interim options: (a) land T1 first, then add `npm test` as required in the same PR/window; or (b) add it now as a non-blocking/`continue-on-error` step for visibility while T1 is in flight. Do not add it as a hard-blocking required check before T1 lands — it would immediately start failing PRs at random on unrelated changes.

*Optional or scheduled* (`workflow_dispatch` and/or a nightly `schedule` cron, non-blocking):
- `scripts/playtests/*.mjs` (smoke-debug-surface, stress-invariants, playtest-floors-1-3/4-5, map-overlay-verify) — Playwright-driven, needs a running preview server.
- `scripts/playtests/arena-freeze-verify.mjs` — screenshot-hash regression probe for the real, previously-shipped Phaser-freeze incident (`AGENTS.md:135`). Good scheduled-check candidate precisely because it has a documented real incident behind it, unlike a speculative visual check.
- `scripts/floor-editor-smoke.mjs` — Playwright E2E for the WYSIWYG floor editor (documented in `docs/FLOOR-AUTHORING.md:118`, not currently run anywhere automated).
- `npm run visual:floors` (corridor visual audit) and `npm run tileset:gallery`.
- `scripts/replays/*.mjs` (golden-path, verb-*) screenshot-based replay captures.

*Manual before merge for visual changes* (not automated, PR-template checklist candidate — see Ticket T-none, this is process not code): the three checklists already written and maintained in `AGENTS.md` ("Rendering verification checklist", "Combat (FF6) verification checklist", "Boss fights" in `README.md:120-129`) for any PR touching `renderer.ts`, `combat-scene.ts`, `combat-phaser-stage.ts`, `combat-choreography.ts`, `combat-ui.ts`, or `combat-select-action-view.ts`. These already exist and are well-written; the only gap is that nothing currently *reminds* a PR author to run them (no PR template).

### 7B — Branch protection

**Finding 12 (Low confidence — repo settings are not inspectable from a worktree; this is inference from structure only).** No `CODEOWNERS`, no `.github/PULL_REQUEST_TEMPLATE.md` or issue templates, a single workflow file, and a commit history dominated by direct-to-main merges from a solo maintainer plus AI-agent-authored commits (`Devin` co-authorship on several fix/feat commits observed in this audit's `git log`/`git show` output) all point at a solo/small-team project with no existing process overhead. Recommended (lightest useful, no code changes required): require PRs into `main` (disallow direct pushes) once the `ci.yml` from 7A exists, require that `ci.yml`'s fast job as a required status check, require branches be up to date before merge, disallow force-push to `main`, and enable auto-delete of merged branches. Do **not** add required-reviewer-count rules, CODEOWNERS, or multi-approval gates — there's no evidence of a review-bypass problem to solve, and that would be disproportionate process for this project's size.

### 7C — Test-result evidence

**Finding 13 (High confidence, directly observed).** `scripts/playtests/lib.mjs:134-169`'s `captureFailureBundle` — the shared evidence-capture helper `AGENTS.md:194` documents as writing "a screenshot, a full snapshot (with map), `log(300)`, `sounds(80)`, `readiness()`, the browser console/network errors, and the action transcript" — does **not** currently record: the git commit SHA under test, the RNG seed (if any) the run used, or an explicit renderer-mode field (Phaser vs. `?phaser=0` Canvas). `window.location.href` is captured (`lib.mjs:155`), which *would* show `?phaser=0` if the calling script's URL included it, but there is no explicit `rendererMode` field, and no seed/SHA fields at all. This is a precise, cheap fix (Group 1, Ticket T5) — three fields added to one object literal — not a call for a new evidence system, and it directly strengthens exactly the kind of report an agent produces after a playtest run.

**Finding 14 (Medium confidence — a documentation-freshness finding that bears directly on evidence trust, cited briefly since deep doc-currency review is the broad audit's territory).** `docs/AGENT-READING-LIST.md`'s top banner (line 5, "Last refreshed: 2026-07-26... PR-5 not built") is stale relative to its own body text: line 105 (updated later, post-`1cdb084` on 2026-08-03) correctly states "**Seeded gameplay RNG done**... **Transcript replay still open**." An agent that reads only the summary banner — which is exactly what a banner is for — gets an outdated status ("PR-5 not built") that contradicts the accurate, more-specific line 32 rows below it. This doesn't change any code recommendation, but it is a concrete example of exactly the kind of evidence-trust gap Phase 7C asks about: a status claim that is only correct if you read past the summary.

**Finding 15 (High confidence, directly observed — this is the direct answer to how much the RNG gap hurts deterministic bug reproduction today, see also §6 Walkthrough F).** `AGENTS.md:194` states plainly: "PR-5 adds a seed + per-step state hash to make those transcripts replayable; **today they are evidence only**." `README.md`'s own "Automated playtests" section confirms the same thing independently: "Full end-to-end playthrough replay (same inputs → same complete game state) is not yet implemented — it requires transcript replay on top of the seeded RNG." Both are first-party, current (post-`1cdb084`) statements, not audit inference.

### 7D — Developer commands

**Finding 16 (Medium confidence, directly observed).** There is no single wrapper command for "am I ready to commit/PR." `README.md:41-43` lists `npm run build`, `npm test`, `npm run floor:validate` as three separate commands; `docs/FLOOR-AUTHORING.md:136-140` prescribes the same three-command sequence again, independently, for floor-touching changes; `README.md:162` ("Git workflow") lists only `npm run build && npm test`, omitting `floor:validate` even for non-floor changes where it's cheap enough (~0.4s) to always run. A single `npm run check` script (`build && test && floor:validate`) would collapse three independently-documented sequences into one, is purely additive (doesn't remove the individual scripts), and directly mirrors what `ci.yml` (7A) would run — so it also serves as a local pre-push rehearsal of the CI gate. This is real, not hypothetical, value: it's currently documented in **two different places with the same three commands**, which is itself light evidence of duplicated tribal knowledge that a wrapper would consolidate.

## 6. Representative task walkthrough findings

### Walkthrough A — Add a new enemy with unique art and one special ability

1. `EnemyDef` in `src/data/enemies.ts:33-56` — add stats block; add to `ENEMIES_BY_ID` (assembled at `enemies.ts:1167` via `Object.fromEntries`).
2. If it has a bespoke ability: define an `EnemyAbilityDef` in `src/data/enemy-abilities.ts`, reference by id in the new `EnemyDef.abilityIds`; conditions checked via `abilityConditionMet` in `src/game/combat-ai.ts`.
3. Add to a floor's `ENCOUNTER_TABLES[floorId]` entry (`enemies.ts:1177`, `Record<number, EncounterEntry[]>`).
4. Sprite: add a `SpriteStrip`/`EnemySpriteDef` entry in `src/engine/sprite-manifest.ts`; drop the PNG(s) under `public/assets/enemies/<id>/<state>.png`. **If skipped, the enemy silently falls back to the procedural shape in `combat-scene.ts` — this is documented, intentional behavior** (`sprite-manifest.ts` header comment), not a bug to guard against.
5. Automated safety net already in place, no new tooling needed: `src/data/enemies.test.ts:100` fails if the new enemy id in an encounter table doesn't resolve via `ENEMIES_BY_ID`; `enemies.test.ts:248` fails if a new `abilityIds` entry doesn't resolve; `src/engine/sprite-manifest.test.ts:49-70` fails if the new sprite PNG's real on-disk dimensions don't match the declared `frameWidth`/`frameHeight`/`frameCount`.
6. `floor-validate.ts:378-383` separately checks any NPC `combatEnemyIds` reference against `ENEMIES_BY_ID` (for enemies also used as an NPC's forced combat identity) — a second, redundant-in-a-good-way integrity check for that specific path.
7. **Gap**: nothing checks that a sprite PNG referenced in `sprite-manifest.ts` for a *newly added* enemy actually renders correctly in combat (choreography timing, foot/head anchor offsets) short of a manual Arena-mode pass or a Playwright screenshot script — this is inherent to visual correctness, not a process gap, and matches the audit brief's own warning not to expect passing tests to prove visual correctness.

### Walkthrough C — Add a new regional floor material (water-floor case study, `533792a`/`3b47e9f`/`6e45942`, real merged PR #19)

Traced the actual diff. The material rides entirely on a **pre-existing** tile-feature value (`tile === "water"`, already used for swim mechanics in `src/game/features.ts`), which is why this PR was small and low-risk:
- `src/engine/water-floor.ts` (new, 11 lines): `isWaterTile()` + `waterGridFromFloor()` — pure, DOM-free, unit-tested (`water-floor.test.ts`, 3 tests).
- `src/engine/renderer.ts` (+93 lines): new `ensureWaterTextureLoaded()` mirroring the existing `ensureDoorTextureLoaded()` pattern; `ResolvedFloorTextures` gains `waterCells`/`waterFloorAData`/`waterFloorBData`; `drawFloorCeilingCast` samples the water texture when `waterCells[gy]?.[gx]` is true, falling back to the normal per-cell texture otherwise; the floor/ceiling paint-cache invalidation key (`floorCeilCacheWaterCells`/`WaterAData`/`WaterBData`) is extended so late-loading the water tileset still triggers a repaint.
- `public/assets/tilesets/water/floorA.png` + `floorB.png` — the only asset files, at the fixed 256×256 convention validated by `water-asset.test.ts` (43 lines, PNG header dimension check, same technique as `sprite-manifest.test.ts`).
- **Untouched**: floor data (no `FloorDef` schema change), `floor-validate.ts` (no new validation rule needed — it's not a floor authoring concept, just a renderer-side material swap keyed off an existing tile type), encounter tables, save schema, fog math.

**What this reveals about the next material (Medium confidence — inference from one data point).** If the next regional material also reuses an *existing* tile-feature value, the same shape applies almost mechanically: one new `ensure*TextureLoaded()` function, one new cache-invalidation key set, one masking predicate, two asset-dimension tests, ~15-40 renderer.ts lines. If instead it needs a genuinely *new* tile-feature type (not reusing `water`/`darkness`/`antimagic`/etc.), the blast radius grows: `Cell.tile` union type, `floor-validate.ts` awareness (at minimum so the linter doesn't flag it as unknown), the WYSIWYG editor's Feature tool (`docs/FLOOR-AUTHORING.md:66`), and the ASCII dump (`floor-ascii.ts`) would all need to recognize the new value. This audit did not find or trace an example of that heavier path — flagged as **speculative** for anything beyond the observed reuse case.

### Walkthrough D — Add a new floor or major floor region

Traced via `docs/FLOOR-AUTHORING.md` (160 lines, current, directly cites the exact modules) rather than a live example, since no new-floor PR was available to diff in this window. Path: author via `npm run floor:editor` → export JSON → `src/content/floors/<name>.json` → register in `src/content/floors/index.ts` (`EXTRA_FLOOR_MAPS`) → `parseFloorMapJSON` validates strictly at load (fails fast on malformed input) → floors resolve at runtime through `src/game/floor-registry.ts`, never the raw `FLOORS` array → `npm run floor:check -- --file <path>` + `npm test && npm run build`. Concrete engine constraints an agent must know before authoring (all directly quoted from `FLOOR-AUTHORING.md:18-24`, all "the validator flags most of them"): stairs are always `floorId ± 1` with no explicit links; stairs land at the target floor's `startX/startY`, not the source stair tile's coordinates; `FloorDef.encounterTable` is dead — real tables live in `ENCOUNTER_TABLES` keyed by floor id, and a new non-campaign floor id gets **zero** random encounters unless an `encounterZones` entry sets `tableFloorId` explicitly; keys are freeform `*-key` strings via chest `itemIds`, not real items; NPCs must never gate keys/stairs/boss access. **This document is unusually good** — it's current, it names exact file paths, and it explicitly states which of its own rules the validator enforces vs. which are just conventions the validator can't check. No independent finding beyond noting this doc's quality, which is squarely a documentation-audit topic the broad/adversarial siblings likely also touch — kept to one line per the scope boundary.

### Walkthrough F — Reproduce and fix a combat bug deterministically

Two genuinely different reproducibility surfaces exist, at two different states of completeness (this is the direct, concrete answer to how much the RNG-seeding gap hurts today):

1. **Browser/Playwright reproduction is largely solved.** `1cdb084` wired `getGameplayRng()` into every gameplay-affecting randomness site. An agent can boot with `?debug=1`, call `window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(seed))`, then `jumpTo({...})` to the right floor/position, force an encounter, and get a **reproducible** combat from that point forward — proven by `rng-wiring.test.ts` (16+ tests, one pair of "uses the global gameplay RNG" / "changes with a different seed" per system: party stat rolls, encounter selection, Arena encounter selection, chest disarm, chest open, NPC steal) and `deterministic-replay.test.ts` (full multi-round combat snapshot equality under a fixed seed).
2. **Full end-to-end transcript replay is explicitly not implemented.** `AGENTS.md:194`: "PR-5 adds a seed + per-step state hash to make those transcripts replayable; today they are evidence only." `README.md`'s "Automated playtests" section says the same independently. So `captureFailureBundle`'s action transcript (every `press`/`act`/`jumpTo`/`boot` call, per `AGENTS.md:194`) is useful *forensic* evidence for a human/agent reading it after the fact, but nothing today can feed that transcript back in and mechanically reproduce the exact same run — an agent must manually reconstruct the `jumpTo`/keypress sequence and separately supply the seed.
3. **Unit-test reproduction remains the weak point** (§3, Finding 1/2): a bug that only manifests via `createDefaultParty`'s unseeded stat rolls (like the ice-shards flake, before it was pinned) is *not* reproducible via `npm test` alone — rerunning gives a different roll every time. `vi.spyOn(Math, "random").mockReturnValue(0)` (used defensively in `combat-turns.test.ts:1559-1578`) is the one demonstrated workaround inside the unit-test layer today, and it's per-test, not a suite-wide guarantee.

**Net**: the gap is real but narrower than "RNG isn't deterministic anywhere" — production/playtest-path determinism is largely solved (as of `1cdb084`, one day before this baseline commit); it's the *test-runner default* and *full-transcript replay* that remain open, and they're two different tickets (T1 here; transcript replay is a larger, already-tracked, out-of-immediate-scope item — see Group 3).

### Walkthrough G — Change the save schema

`src/game/save.ts`: `SAVE_VERSION = 14` (`save.ts:32`); bump it, add a `migrate()` branch (existing chain runs `v(N) → v(N+1)` sequentially, e.g. the v13→v14 roster-trim step at the versions visible in `save.test.ts:257-299`), and add a dedicated `it(...)` migration test — this is exactly the established, already-good pattern (§3, Finding 6), not something needing new infrastructure. Persisted vs. transient state is explicit and documented at the top of `save.ts:1-16`: combat state is deliberately *not* saved (mode converts to "dungeon" on save-during-combat); `explored`/`lootTaken`/`unlockedDoors` (JS `Set`s) convert to/from arrays; the floor grid itself is never persisted — it's re-cloned from the immutable `FLOORS`/pack definition on load, so a floor-data change doesn't require a save migration unless it changes what a saved *reference into* that data means. ID risk: `AGENTS.md:245` ("Do not casually rename enemy, item, perk, NPC, or floor IDs. They are save-compatible and test-referenced") is the standing guardrail; save-schema work and ID-renaming work are two different risk classes that happen to intersect at "old saves must still deserialize." Compatibility tests already cover both incompatible-newer-version rejection (`save.test.ts:116`) and no-migration-path-for-too-old rejection (`save.test.ts:125`).

## 7. Prioritized recommendations within scope

**Group 1 — immediate, high-return (max 5):**
1. Seed the vitest gameplay RNG by default via `setupFiles` + `beforeEach` reseed (Ticket T1). Highest-return item in this audit — closes the reproduced flake class at its root, using infrastructure that already exists and is already correctly used by 4 files.
2. Fix `features.test.ts:302`'s assertion to mirror the real production clamp (`Math.max(1, ...)`, matching `features.ts:820`) rather than assuming an unclamped `maxHp - 12` (Ticket T2) — the specific, reproduced failure from this session.
3. Add a `pull_request`-triggered `ci.yml` running `build` + `floor:validate` immediately, with `npm test` added as a required gate once T1 lands (Ticket T3).
4. Make `exitDebugCombat` throw explicit errors on invalid preconditions, matching every sibling debug helper (Ticket T4) — same risk class as the Issue #20 fix, cheap to close now while that fix is fresh context.
5. Add commit SHA, RNG seed, and renderer-mode fields to `captureFailureBundle` (Ticket T5) — ~10 lines, directly strengthens evidence trust (Phase 7C).

**Group 2 — do during next relevant feature (max 8):**
1. Add an `npm run check` wrapper (`build && test && floor:validate`) consolidating the sequence already documented independently in two places (Ticket T6).
2. Correct `docs/AGENT-READING-LIST.md`'s stale top-banner PR-5 status against its own already-updated body text (Ticket T7).
3. Type `groundPlaneProbe` against the real `CombatScene` type instead of an inline structural cast; consider extracting it to `src/debug/` alongside its siblings, with a minimal test (Ticket T8).
4. Enable lightweight branch protection on `main` once `ci.yml` exists: required PR, required fast status check, up-to-date-before-merge, no force-push, auto-delete merged branches (no code ticket — repo settings).
5. Schedule (not require) `arena-freeze-verify.mjs`, `floor-editor-smoke.mjs`, and the `scripts/playtests/*.mjs` suite as a nightly/`workflow_dispatch` CI job for visibility without blocking PRs.
6. Add a PR-template checklist item pointing at the existing `AGENTS.md` renderer/combat/boss verification checklists for PRs touching those files — process reminder, not automation.
7. Revisit whether `scripts/debug-choreography.test.ts` should gain real assertions (e.g. "ice-shards fires at least once in N rounds") or be excluded from the counted-test glob — low priority, but currently miscounts as coverage.
8. **Conditionally** consider a shared party/character test builder — only after Group 1 lands and only if the existing 3 ad hoc `makeChar` helpers still have genuine, non-RNG-motivated reasons to exist at that point (§3, Finding 3). Do not build this now.

**Group 3 — strategic / architectural (max 5):**
1. Full input-transcript + seed replay (the remaining half of the already-tracked "PR-5" effort, `AGENTS.md:194`) — closes the last gap identified in Walkthrough F. Already scoped by the team, not a new idea from this audit; noted here because it's the natural Group-1-successor for reproducibility.
2. A repo-wide evidence-bundle convention (seed/SHA/renderer-mode, per Ticket T5) applied consistently across every `scripts/playtests/*.mjs` script, not just the one shared `captureFailureBundle` call site — bigger lift than T5, worth doing once T5's shape is proven.
3. Investigate (don't assume) whether any further pure-function extraction from `combat-phaser-stage.ts` is possible beyond what `combat-choreography.ts` already shares — the genuinely Phaser-specific remainder (sprite pooling, WebGL texture lifecycle) may be irreducibly untestable in jsdom, in which case this yields nothing; flagged as a "check before investing" item, not a committed recommendation.
4. Consistency pass moving the remaining inline `__onyxDebug` entries (`groundPlaneProbe`, and arguably the raw production-function passthroughs) toward the `src/debug/*.ts` pure-module pattern that already covers 8 of the object's members — architectural tidiness, not urgent.
5. `combat-phaser-stage.ts`'s 1.4MB chunk (over Vite's 500KB warning threshold) may warrant a code-splitting investigation — flagged briefly; primarily a build/perf topic more central to the broad audit's scope, noted here only because it shares a file with the testing-policy finding in §4/§7 Group 4.

**Group 4 — do not change, with rationale (max 5):**
1. Do not force `combat-phaser-stage.ts` into the jsdom unit-test suite. `AGENTS.md:160` documents this as deliberate; Phaser needs a real canvas/WebGL context. The correct verification surface is browser-based (`arena-freeze-verify.mjs`, manual checklists), not vitest.
2. Do not add browser/Playwright/replay/visual-audit scripts as required-on-every-PR gates. They're valuable but slower and less deterministic than unit tests; keep them scheduled/manual per §5's proposal. Adding them as hard gates without more evidence of their own flake rate would repeat exactly the mistake `npm test` currently has.
3. Do not adopt a shared test-builder abstraction now (§3, Finding 3 / Group 2 item 8). Only 3 current ad hoc consumers exist, two of which are downstream symptoms of the RNG default, not an independent fixture problem.
4. Do not add CODEOWNERS, PR templates beyond a lightweight checklist reminder, or multi-approval review rules. No evidence of a review-bypass or ownership-confusion problem in a solo/small-team project; this would be disproportionate process.
5. Do not touch the `?debug=1` gating pattern or the existing `src/debug/*.ts` pure-helper split. It is a strong, consistently-tested architecture (§4, Finding 7) that should be *extended* (Group 2 item 3) rather than replaced or second-guessed.

## 8. Implementation tickets

### T1 — Seed the vitest gameplay RNG by default
- **Objective**: Eliminate the reproduced test-suite flake class caused by `createCharacter`'s unseeded stat rolls.
- **Problem** (exact evidence): `src/game/rng.ts:61` (`let gameplayRng: Rng = Math.random;`); `vitest.config.ts` has no `setupFiles`; 26 test files call `createCharacter(` directly, only 4 seed the RNG. Reproduced this session: `npm test` run 1 of 2 failed at `src/game/features.test.ts:302` (`expected 1 to be +0`).
- **Scope**: Add a `src/test/setup.ts` (or similar) registered via `vitest.config.ts`'s `test.setupFiles`. In it, call `beforeEach(() => setGameplayRng(createSeededRng(FIXED_SEED)))` and `afterEach(() => resetGameplayRng())`. `beforeEach`, not just file-level setup, is required to also close within-file order-dependence (the originally-reported ice-shards flake shape).
- **Non-goals**: Do not change any production code path or the production default (`Math.random` for real play stays correct and is separately tested by `rng.test.ts`'s explicit "defaults to Math.random" assertions, which are unaffected since they call `resetGameplayRng()` themselves). Do not attempt full transcript replay (Group 3 item 1).
- **Implementation approach**: Pick a fixed seed. Run the full suite at that seed 2-3 times, then again at 1-2 *different* seeds. **Any test that only passes under some seeds and fails under others has a latent stat-dependency and must be fixed at that test** (pin the relevant stats explicitly, mirroring `e63619a`'s ice-shards fix, or fix the assertion to match production semantics like T2) — do not "seed-shop" a value that happens to make today's suite pass. Acceptance is "green at the chosen seed AND demonstrably not seed-dependent," not "green once."
- **Tests**: The setup file itself needs no new test; its correctness is proven by the full suite going green deterministically across ≥3 different seed values in a row.
- **Manual verification**: `npm test` (3 consecutive local runs, no `--seed` variance) plus 2 runs with the setup file's constant temporarily changed to a different value, confirming no new failures appear.
- **Acceptance criteria**: `npm test` passes deterministically at the chosen default seed across ≥5 consecutive runs; passes at ≥2 alternate seeds with no different failures; `rng.test.ts`'s existing "defaults to Math.random" / "resetGameplayRng restores Math.random" tests still pass unmodified.
- **Estimated effort**: Small (1-2 hours implementation, more if any test is found to be seed-dependent and needs pinning).
- **Dependencies**: None. Should land before Ticket T3's `npm test` CI gate goes required.
- **Suggested branch name**: `test/seed-gameplay-rng-by-default`

### T2 — Fix the reproduced `features.test.ts:302` flaky assertion
- **Objective**: Stop the specific reproduced failure independent of T1, since T1's seed choice could theoretically still land on a low roll for this test unless T2 also lands.
- **Problem** (exact evidence): `src/game/features.test.ts:300-302` asserts `expect(state.party[1].hp).toBe(state.party[1].maxHp - 12)`, but the production gas-trap handler clamps at `src/game/features.ts:820` (`c.hp = Math.max(1, c.hp - dmg)`). When a randomly-rolled `maxHp <= 12`, the assertion's unclamped expected value goes non-positive while the real (correctly clamped) result is `1`, and the test fails. Reproduced this session.
- **Scope**: Pin `state.party[1].maxHp` (and `.hp`) to a fixed value comfortably above 12 (e.g. 30) before calling `openChest`, following the exact precedent `e63619a` set for the ice-shards test — do **not** rewrite the assertion to `Math.max(1, state.party[1].maxHp - 12)`. That alternative was considered and rejected: on a low roll it collapses `party[1]`'s check into a duplicate of the `party[0]` clamp assertion one line above, silently dropping the test's coverage of the unclamped full-12-damage path it exists to exercise. Pinning keeps both code paths (clamped `party[0]`, unclamped `party[1]`) genuinely tested regardless of what `makePerkFreeState`'s random roll produces, and removes this ticket's dependence on T1's eventual seed choice entirely.
- **Non-goals**: Do not change `features.ts`'s clamp behavior — it's correct and intentional (`AGENTS.md:133`, "Outside-combat damage never kills").
- **Implementation approach**: Add one line pinning `state.party[1].maxHp = 30; state.party[1].hp = 30;` (or equivalent) immediately after `makePerkFreeState("gas")` in that test, before `handleTileFeature`/`openChest` run.
- **Tests**: N/A — this is the test fix itself. Confirm the fixed line still catches a real regression by temporarily removing the clamp in `features.ts` and observing the test fail, then reverting.
- **Manual verification**: `npx vitest run src/game/features.test.ts` at several different seeds (or several unseeded runs, pre-T1) to confirm it no longer flakes.
- **Acceptance criteria**: Test passes regardless of `state.party[1]`'s rolled `maxHp`, and still asserts the exact unclamped `maxHp - 12` outcome for `party[1]` (not a clamp-collapsed value).
- **Estimated effort**: Trivial (<15 minutes).
- **Dependencies**: None; can land independently of and before T1.
- **Suggested branch name**: `fix/features-test-gas-clamp-assertion`

### T3 — Add a `pull_request`-triggered CI workflow
- **Objective**: Give PRs an automated, fast, deterministic gate; today none exists.
- **Problem** (exact evidence): `.github/workflows/deploy.yml`'s only triggers are `push: branches: [main]` and `workflow_dispatch` — confirmed by direct file read. `docs/FLOOR-AUTHORING.md:136-140` documents the intended local gate (`npm test && npm run build && npm run floor:validate`) as something a human must remember, because CI doesn't run it.
- **Scope**: New `.github/workflows/ci.yml`, `on: pull_request`. Steps: `npm ci`, `npm run build`, `npm run floor:validate`, and `npm test`. Separate `concurrency` group from `deploy.yml`'s `pages` group. **Pre-T1, the `npm test` step must run with `continue-on-error: true`** (or as its own separate, non-required job) — a plain `run: npm test` step fails its job regardless of whether branch protection marks it "required," and if it shares a job with `build`/`floor:validate` it takes them down with it on every random flake. Once T1 lands, drop `continue-on-error` and fold `npm test` into the required job/status check.
- **Non-goals**: Do not modify `deploy.yml`. Do not add browser/Playwright/visual-audit jobs to this required workflow (§5, Group 4 item 2).
- **Implementation approach**: Mirror `deploy.yml`'s `actions/checkout@v4` + `actions/setup-node@v4` (node 22, npm cache) steps; add the three/four command steps as separate `run:` lines for clear per-step pass/fail in the PR checks UI.
- **Tests**: N/A (CI config).
- **Manual verification**: Open a throwaway PR against a fork/branch and confirm the workflow triggers and all steps pass on a clean change, and fails visibly on an intentionally broken change (e.g. a TS error).
- **Acceptance criteria**: Workflow runs on every PR; `build` and `floor:validate` are required status checks immediately; `npm test` runs on every PR from day one but with `continue-on-error: true` (visible, non-blocking) until T1 merges, at which point that flag is removed and it becomes a required status check in the same PR that lands T1's fix (do not add it as a hard-blocking required check before T1 lands, per the audit brief's explicit unsafe-gate warning, corroborated by this session's reproduction).
- **Estimated effort**: Small (~1 hour).
- **Dependencies**: Soft dependency on T1 for the `npm test` step's required status (workflow itself has no hard dependency and can land first with `npm test` non-blocking).
- **Suggested branch name**: `ci/add-pull-request-workflow`

### T4 — Make `exitDebugCombat` throw on invalid preconditions
- **Objective**: Close the one remaining silent-no-op debug helper, matching the explicit-error convention every sibling helper already follows.
- **Problem** (exact evidence): `src/main.ts:870-876` — `if (!combatController || !state.combat) return;` — no thrown error, no log, no return value, unlike `jumpTo` (`main.ts:2354-2373`), `loadSave` (`main.ts:2408-2426`), and the fixed `startCombat` (`main.ts:2452-2459`), all of which throw explicit `"helperName: reason"` errors for equivalent precondition failures.
- **Scope**: Change the guard to `if (!combatController || !state.combat) throw new Error("exitDebugCombat: no active combat");`.
- **Non-goals**: Do not change `exitDebugCombat`'s success-path behavior (`stop()` + `endCombat()`), which is correct and already reuses the real production `endCombat` path.
- **Implementation approach**: One-line change plus a small test.
- **Tests**: Add (or extend an existing debug-surface test file) a case asserting `exitDebugCombat("victory")` throws when no combat is active. If `exitDebugCombat` stays inline in `main.ts` rather than being extracted, this may require a light DOM/bootstrap test harness — consider extracting a pure precondition-check helper into `src/debug/` (see T8's pattern) if a full `main.ts` test harness is too heavy for one assertion.
- **Manual verification**: `?debug=1` browser session, call `window.__onyxDebug.exitDebugCombat("victory")` with no combat active, confirm a console error/thrown exception instead of silent no-op.
- **Acceptance criteria**: Calling `exitDebugCombat` with no active combat throws a message identifying the helper and the reason, matching the style of `jumpTo`/`loadSave`/`startCombat`.
- **Estimated effort**: Small (~30 minutes code + test).
- **Dependencies**: None.
- **Suggested branch name**: `fix/debug-exit-combat-explicit-error`

### T5 — Add SHA/seed/renderer-mode to `captureFailureBundle`
- **Objective**: Strengthen playtest evidence trust (Phase 7C) with near-zero cost.
- **Problem** (exact evidence): `scripts/playtests/lib.mjs:134-169`'s `captureFailureBundle` bundle object (built at lines 136-158) records `name`, `capturedAt`, `transcript`, `consoleErrors`, `screenshot`, `snapshot`, `log`, `sounds`, `readiness`, `url`, `viewport` — but no commit SHA, no RNG seed, and no explicit renderer-mode field.
- **Scope**: Add three fields to the bundle object: `commitSha` (from `process.env.GITHUB_SHA` when running in CI, else `execSync("git rev-parse HEAD")` locally — cheap to compute inside `captureFailureBundle` itself, no caller change needed), `rngSeed` (see implementation note below — **not** recoverable from the page after the fact), `rendererMode` (derived from the URL's `phaser` query param, defaulting to `"phaser"` when absent per `combat-stage.ts:74-75`'s own rollback logic — the URL is already captured at `lib.mjs:155`, so this is a pure derivation, no new capture needed).
- **Non-goals**: Do not build a new evidence-storage system, dashboard, or schema beyond this one function; do not touch the `readiness()`/`snapshot()` debug-surface functions.
- **Implementation approach**: `commitSha` and `rendererMode` are straightforward additions inside `captureFailureBundle` itself (~5 lines). `rngSeed` is **not** — `window.__onyxDebug.setGameplayRng` takes an `Rng` *function*, not a seed number, and `rng.ts` exposes no getter for "what seed produced the currently-installed RNG," so a `page.evaluate` call inside `captureFailureBundle` cannot recover it after the fact the way it recovers `snapshot`/`log`/`sounds`. Two viable approaches, pick one during implementation: (a) add an explicit `{ seed }` option to `captureFailureBundle(page, name, { outDir, errors, seed })` that every calling script passes through from whatever value it gave `createSeededRng`; or (b) record the seed into the same page-keyed `WeakMap` that already holds the action transcript (`AGENTS.md:194`) at the moment a script calls `setGameplayRng`, and have `captureFailureBundle` read it from there the way it reads the transcript. Either is small; do not ship this ticket without picking one, since "the seed is already known by the caller" is true but does not by itself get the value into the bundle.
- **Tests**: N/A (Node script, not covered by the vitest `src/**` glob); manual verification is sufficient given the function's small size and existing informal verification pattern (`scripts/playtests/smoke-debug-surface.mjs` per `AGENTS.md:195`).
- **Manual verification**: Run `scripts/playtests/smoke-debug-surface.mjs` (or trigger a deliberate finding) against a local preview server, inspect the written `bundle-*.json`, confirm the three new fields are present and correct.
- **Acceptance criteria**: Every bundle written by `captureFailureBundle` includes `commitSha`, `rngSeed`, and `rendererMode`.
- **Estimated effort**: Trivial (~30-45 minutes).
- **Dependencies**: None.
- **Suggested branch name**: `feat/playtest-bundle-evidence-fields`

### T6 — Add an `npm run check` wrapper script
- **Objective**: Collapse the three-command sequence documented independently in `README.md:41-43`/`:162` and `docs/FLOOR-AUTHORING.md:136-140` into one command.
- **Problem** (exact evidence): The exact sequence `npm test && npm run build && npm run floor:validate` (or a reordering of the same three) is written out by hand in two separate docs, and `README.md:162`'s "Git workflow" section only lists two of the three (`build`+`test`, omitting `floor:validate`).
- **Scope**: Add `"check": "npm run build && npm test && npm run floor:validate"` to `package.json`'s `scripts`. Update `README.md:162` to mention `npm run check` as the recommended pre-commit command, keeping the individual scripts documented too (this is additive, not a replacement).
- **Non-goals**: Do not fold browser/visual/replay scripts into this wrapper — it should stay fast (~15s) and non-interactive, matching what `ci.yml` (T3) runs.
- **Implementation approach**: One `package.json` script line; two doc lines.
- **Tests**: N/A.
- **Manual verification**: `npm run check` from a clean checkout, confirm it runs all three steps in order and fails fast on the first failing step (default `&&` chaining behavior is sufficient — no need for a custom script runner).
- **Acceptance criteria**: `npm run check` exists, runs build+test+floor:validate in that order, exits non-zero if any step fails.
- **Estimated effort**: Trivial (~15 minutes).
- **Dependencies**: None; benefits from T1 landing first so the `test` step is deterministic, but not blocked on it.
- **Suggested branch name**: `chore/add-check-script`

### T7 — Correct the stale PR-5 status banner in `docs/AGENT-READING-LIST.md`
- **Objective**: Remove a self-contradictory status claim that could mislead an agent reading only the summary line.
- **Problem** (exact evidence): `docs/AGENT-READING-LIST.md:5` ("Last refreshed: 2026-07-26... PR-5 not built") contradicts `docs/AGENT-READING-LIST.md:105` (updated later, states "Seeded gameplay RNG done... Transcript replay still open").
- **Scope**: Update the line-5 banner's PR-5 clause to match line 105's more accurate, more recent status (e.g. "PR-5 seeded-RNG half done, transcript replay open") and update the "Last refreshed" date if the maintainer wants the banner's timestamp to reflect the `1cdb084` update.
- **Non-goals**: Do not otherwise rewrite `AGENT-READING-LIST.md`'s structure or content — this is a one-line factual correction, not a documentation overhaul (that's the broad audit's territory).
- **Implementation approach**: Direct edit.
- **Tests**: N/A (documentation).
- **Manual verification**: Read both lines side by side after the edit, confirm no contradiction remains.
- **Acceptance criteria**: The summary banner and the detailed status line agree.
- **Estimated effort**: Trivial (~10 minutes).
- **Dependencies**: None.
- **Suggested branch name**: `docs/fix-pr5-status-banner`

### T8 — Type `groundPlaneProbe` against the real `CombatScene` type
- **Objective**: Remove the one remaining inline structural type cast in the debug surface, closing the same risk class as Issue #20 preemptively rather than reactively.
- **Problem** (exact evidence): `src/main.ts:2465-2510`, specifically the cast at `main.ts:2485` (`(cc as unknown as { scene: { backdropId: string; state: {...} } }).scene`) redeclares `CombatScene`'s shape inline instead of importing it from `src/engine/combat-scene.ts`, even though `CombatController.scene` (`src/engine/combat-ui.ts:168-169`) is a legitimately public getter returning the real `CombatScene` type. No test exists for `groundPlaneProbe`.
- **Scope**: Import `CombatScene` from `combat-scene.ts` in `main.ts`; replace the inline cast with a direct `combatController.scene` access typed against the real interface (removing the `as unknown as` entirely, or narrowing it to only what's structurally necessary if `CombatScene`'s full shape has fields this function shouldn't depend on). Optionally extract the pure math (feet/occlusion/x-bounds checks) into a `src/debug/ground-plane-probe.ts` module alongside its siblings, with `main.ts` keeping only the `combatController` access.
- **Non-goals**: Do not change `groundPlaneProbe`'s existing output shape or the geometry checks themselves (`geometryForBackdrop`, `assertFloorBottomClearOfWindows`) — this is a type-safety and testability cleanup, not a behavior change.
- **Implementation approach**: Extract-and-test, following the exact pattern already used for `jump-to.ts`/`start-combat.ts`.
- **Tests**: A new `ground-plane-probe.test.ts` covering the pure math (feet-in-bounds, x-bounds, occlusion-check) with a synthetic `CombatScene`-shaped fixture — this is now possible without a DOM/combat-controller bootstrap once extracted.
- **Manual verification**: `?debug=1` browser session mid-combat, call `window.__onyxDebug.groundPlaneProbe()`, confirm identical output shape to before the change.
- **Acceptance criteria**: No `as unknown as` cast remains for this helper; a real `CombatScene` type-mismatch would now be a compile error, not a silent runtime `undefined`; new pure-function tests pass.
- **Estimated effort**: Small (~1-2 hours if extracted; ~20 minutes if just retyping in place without extraction).
- **Dependencies**: None.
- **Suggested branch name**: `refactor/ground-plane-probe-typed-scene`

## 9. Verification performed

```bash
git status --short              # clean at start
git branch --show-current       # worktree-agent-a6a6cbfd3afddc399
git rev-parse HEAD               # be6131c1dcdf5a06922a3b6cb6fac4f9447f5415
git rev-parse origin/main        # be6131c1dcdf5a06922a3b6cb6fac4f9447f5415 (matches)
cat .github/workflows/deploy.yml # confirmed single workflow, no pull_request trigger, byte-identical to reused baseline
npm test -- --run                # run 1: 1934 tests, 1 FAILED (features.test.ts:302, "expected 1 to be +0")
npm test -- --run                # run 2: 1934 tests, all passed
grep -c "expect(" scripts/debug-choreography.test.ts   # 0
grep -rln "createCharacter(" src --include="*.test.ts" | wc -l   # 26
grep -rlE "setGameplayRng|createSeededRng" src --include="*.test.ts"  # 4 files
for c in 0550fc4 ea08814 533792a 3b47e9f 6e45942 e63619a 1cdb084; do git show --stat "$c"; done   # confirmed each commit's contents, cited throughout
git log --format='%h %ad %s' --date=iso -- docs/AGENT-READING-LIST.md   # confirmed doc update history vs. e63619a/1cdb084 ordering
wc -l src/main.ts                # 2528
wc -l src/debug/*.ts             # 1672 total across 8 module+test pairs
```

No other commands were run against production code; no files other than this report were modified. `npm ci` and `npm run build` were **not** re-run in full this session (reused from the sibling broad audit's baseline per instructions) — only `npm test` was re-run, within the allowed 2-3 executions, and it directly reproduced the documented flake on its first run.

## 10. Confidence and limitations

- **High confidence, directly observed**: the RNG-default root cause and its reproduction (§2, §3 Finding 1-2); the per-callsite-workaround pattern across 3 commits (§3 Finding 2); the CI trigger gap (§5 Finding 10-11); the debug-surface inventory and its typed/tested status (§4, Finding 7-8); the evidence-bundle field gap (§5 Finding 13); the transcript-replay-is-evidence-only status (§5 Finding 15, §6 Walkthrough F).
- **Medium confidence**: `groundPlaneProbe`'s severity assessment (§4 Finding 7 — real gap, but a read-only diagnostic path, downgraded after confirming it reuses real production positioning functions and a legitimately public getter); the water-floor case study's generalization to "the next material" (§6 Walkthrough C — one data point extrapolated); the doc-staleness finding (§5 Finding 14 — real contradiction, but low-stakes since it doesn't change any code recommendation).
- **Low confidence / explicitly inference-only**: branch protection recommendations (§5, 7B) — GitHub repo settings are not inspectable from a git worktree; recommendations are inferred from commit-history/file-structure patterns only, not verified against actual current settings.
- **Not inspected deeply enough to have an opinion**: actual GitHub branch-protection configuration (as above); whether `combat-phaser-stage.ts` could be partially restructured for testability beyond what `combat-choreography.ts` already extracts (flagged Group 3 item 3 as "investigate before committing," not assessed here); the full `scripts/playtests/*.mjs` corpus beyond `lib.mjs` and the few scripts named in `AGENTS.md` — there are ~99 files under `scripts/`, and this audit read representative ones (`lib.mjs`, `debug-choreography.test.ts`) rather than all of them; any deep review of `src/debug/snapshot.ts`'s 318 lines beyond confirming its test file exists and is substantial (372 lines) — took the pairing as evidence of quality rather than re-deriving it line by line, consistent with the audit's time budget.
- **Explicitly deferred to sibling audits, one line each**: doc/context-efficiency and the 20-category scorecard (broad audit); hidden coupling, silent fallbacks, and LLM traps beyond the one instance noted in §4 Finding 9 (adversarial audit); bundle-size/build-performance beyond the one citation in §7 Group 3 item 5 (broad audit's territory).
