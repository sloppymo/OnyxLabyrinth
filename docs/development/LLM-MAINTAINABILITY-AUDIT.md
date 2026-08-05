# OnyxLabyrinth — LLM-Native Maintainability Audit (Synthesis)

> Status: Point-in-time audit. Synthesis of 3 parallel independent audits (broad, adversarial, testing/CI-DX) conducted on the same commit.
> This report records the repository state at commit `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.
> Revalidate recommendations against current `main` before implementation.
> Source audits (uncommitted to this branch, available on their own branches): worktree-agent-aae77fb23fee4122f (broad), worktree-agent-adea0d6506dd066f3 (adversarial), worktree-agent-a6a6cbfd3afddc399 (testing/CI-DX).

**Note on source availability.** The three sub-audit reports are *not present in this branch's tree*. They live on the three branches named above and were read directly from their worktrees during synthesis. If you want all four documents on one branch, that requires a separate merge or cherry-pick step — this report deliberately cites them inline by name rather than by relative link, because a relative link would be broken here.

---

## 1. Executive summary

**Verdict: Strong but with identifiable friction.**

OnyxLabyrinth is a hand-rolled, no-framework TypeScript game codebase built by mixed human and agent authorship, and it is markedly more disciplined than that description usually predicts. Three findings are worth stating up front because all three audits reached them independently and I re-verified each against the source myself:

1. **Authoring discipline substantially outruns enforcement discipline.** The architectural boundaries the project claims are *actually true*: zero `src/game/** → src/engine/**` and zero `src/data/** → src/engine/**` production imports across 111 files, and `Math.random` appears nowhere in the rules or content trees except inside `src/game/rng.ts` itself. Meanwhile, at the audited commit, CI ran build-only on push-to-main with **no `pull_request` trigger at all**, so none of that discipline was enforced anywhere.
2. **The single automated quality signal was not reliably green.** `src/game/rng.ts:61` defaults the global gameplay RNG to `Math.random`; `vitest.config.ts` declared no `setupFiles`; 37 test files construct characters and only 4 seed the RNG. Two of the three audits reproduced a real failure on a clean checkout. A ~1.9% background failure rate trains humans and agents alike to re-run rather than investigate.
3. **Derived artifacts drifted silently, and nothing detected it.** The WYSIWYG floor editor loaded a committed export describing a floor that no longer shipped. My own verification found this to be *worse* than the broad audit reported (see §11).

The distribution of scores is bimodal rather than uniformly mediocre — failure diagnostics and debug tooling score 5, CI enforcement scores 1. This is not a codebase in decline; it is a codebase whose guardrails were written as documentation and convention rather than as automation.

**How this report was produced.** Three agents audited disjoint scopes of the same commit in three isolated worktrees, without visibility into each other's findings: (1) broad topology, context hotspots, and a 20-category scorecard; (2) adversarial architecture — LLM traps, hidden coupling, silent fallbacks; (3) testing, CI, and developer experience. This document merges them under an explicit confidence hierarchy (three-audit agreement > two-audit agreement with evidence > single-audit finding independently verified > single-audit speculation), and every claim that anchors a Group-1 recommendation or a top-ranked ticket was re-checked by opening the cited file at the audited commit. Two sub-audit claims did not survive that check and were corrected or dropped; one new finding surfaced that no audit reported. See §11.

**No browser or visual testing was performed by any of the three audits or by this synthesis.** This is static, code-reading, and test-log analysis only.

---

## 2. Verified repository baseline

### 2.1 Baseline at the audited commit (`be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`)

```markdown
node v22.23.2, npm 11.5.2
npm ci: PASS (~3.1s, 150 packages, 3 high-severity dev-only transitive audit warnings:
  playwright/postcss/undici — not runtime risk, only runtime dep is phaser 4.2.1)
npm test: 95 files / 1934 tests — INTERMITTENTLY FAILS (~1.9%+ of runs) due to
  src/game/rng.ts:61 defaulting to Math.random with no vitest setupFiles; known example
  src/game/features.test.ts:302; second known flake in src/game/combat-turns.test.ts
  (see docs/AGENT-READING-LIST.md:7-10)
npm run build: PASS (~9.7s), zero TypeScript errors on both tsconfig.json and
  tsconfig.tools.json; one non-fatal warning (combat-phaser-stage chunk 1,411 kB > 500kB)
npm run floor:validate: PASS (~0.4s), all 5 floors OK
git diff --check: clean
.github/workflows/deploy.yml is the ONLY workflow: push:main + workflow_dispatch,
  build+deploy only, NO test/floor-validate gate, NO pull_request trigger at all
src/main.ts: 2,528 lines, 65 imports (3x the next-highest file), ~50 top-level functions
Layer discipline measured clean: 0 game->engine and 0 data->engine production imports;
  only 3 small cycles
Size: src production .ts 111 files, *.test.ts 93 files, docs 140, scripts 99, tools 15;
  95 test files / 1934 tests total
```

I independently re-confirmed, at `be6131c`: `src/game/rng.ts:61` (`let gameplayRng: Rng = Math.random;`); `vitest.config.ts` has no `setupFiles`; `.github/workflows/` contains exactly one file (`deploy.yml`, `on: push: branches: [main]` + `workflow_dispatch`, steps `npm ci` + `npm run build`); `src/main.ts` is 2,528 lines; zero `game→engine` and zero `data→engine` production imports; `Math.random` in `src/game`/`src/data` occurs only inside `rng.ts` plus one explanatory comment at `src/game/perks.ts:490`.

**Minor correction to the import count.** The baseline's "65 imports" for `main.ts` does not reproduce exactly; I count **67 distinct module specifiers** (69 `from "` occurrences). This is a counting-method difference, not a substantive disagreement — `main.ts` remains roughly 3× the fan-out of the next-highest file. Treat the figure as approximate.

**Note on the broad audit's arithmetic.** Its §4 computes a scorecard total of **69/100**; its §11 refers to "the 68/100 total." The category scores sum to 69. I reproduce 69 below and flag the inconsistency rather than silently picking one.

### 2.2 Final validation performed by this synthesis

Run in an isolated worktree at `be6131c`, after writing the report and before committing:

| Command | Result |
|---|---|
| `git status --short` | only `docs/development/LLM-MAINTAINABILITY-AUDIT.md` |
| `git diff --check` | clean |
| `npm ci` | PASS (3 high-severity dev-only advisories, unchanged) |
| `npm test` | **PASS on the first run** — 95 files / 1934 tests, 0 failed, ~12.7s. The flake did not surface this run, which is exactly what a ~1.9% rate predicts; it is not evidence the defect is absent. Note `setup 0ms` in the reporter output — confirming no `setupFiles` at this commit. |
| `npm run build` | PASS, zero TypeScript errors on both projects; the known non-fatal `combat-phaser-stage` 1,411.33 kB chunk warning |
| `npm run floor:validate` | PASS, all 5 floors OK |

### 2.3 Revalidation against current `main` — READ THIS FIRST

**This is the most operationally important section of the report.** Between the audited commit and the time of synthesis, `origin/main` advanced from `be6131c` to **`ed1704e1c2262bb5e5e0bd5a2eec116698a9745f`** (PRs #22 and #23), and a further unmerged branch **`origin/chore/llm-drift-guards` (`6dee164`)** carries more. I verified each item below by reading the file at that SHA, not by trusting commit subjects.

**A large majority of this report's Group 1 and Group 2 recommendations are already implemented.** That does not invalidate the analysis — the findings were correct, and the fixes confirm them — but it does mean *nobody should implement from this report without checking this table first.*

#### Landed on `origin/main` (`ed1704e`)

| Audit item | Evidence of completion | Assessment |
|---|---|---|
| RNG seeding (broad T1 / testing T1) | New `vitest-setup.ts` registers `beforeEach(() => setGameplayRng(createSeededRng(seed)))` + `afterEach(resetGameplayRng)`; `vitest.config.ts:10` adds `setupFiles: ["./vitest-setup.ts"]` | **Done, and better than specified.** It uses `beforeEach` (which the testing audit correctly argued was required to close within-file order-dependence, not merely file-level setup) *and* adds an `ONYX_TEST_RNG_SEED` env override, which directly enables the "prove it isn't seed-dependent" acceptance criterion. |
| PR CI (broad T3 / testing T3) | New `.github/workflows/ci.yml`: `on: pull_request` + `push: [main]` + `workflow_dispatch`, `concurrency: ci-${{ github.ref }}`, runs `npm ci` + `npm run check` | **Done, and correctly designed.** It is a *new* workflow with its own concurrency group rather than an edit to `deploy.yml` — exactly the design the testing audit specified, avoiding contention with the `pages` group. |
| `npm run check` wrapper (testing T6) | `package.json`: `"check": "npm run test:typecheck && npm run build && npm test && npm run floor:validate && npm run floor:export-check"` | **Done, and expanded.** Adds a new `test:typecheck` (`tsconfig.test.json`) and the floor export drift check beyond what was recommended. |
| Floor export drift (broad T2) | New `floor:export-check` script (`tsx scripts/floor-tool.ts export-check`), wired into `npm run check`; all five exports regenerated and now normalized-deep-equal to their source packs | **Done.** Implemented as a CLI subcommand gated by CI rather than as a vitest test — a legitimate alternative to the ticket's suggested shape, and arguably better since it reuses the existing floor-tool. |
| Damage-preview parity (adversarial T1) | `src/game/combat-preview.ts` now applies `s.damageBuffs` + `warlordDamageMultiplier` + `scaleOutgoingDamage` in `previewPhysicalDamageAtVariance`, and `warlordDamageMultiplier` + `scaleOutgoingDamage` in `previewSpellDamage`; `action-preview.test.ts` +121 lines | **Done, in its stronger form.** The ticket offered "fix the formula OR document the exclusion"; the team fixed the formula, in both functions, in resolver order. I specifically checked the asymmetry: the spell preview omitting `damageBuffs` is **correct, not a remaining gap** — `applySpell` never applied Battle Cry (verified: no `damageBuffs` reference in `combat-spells.ts` at either SHA), so each preview now mirrors its own resolver exactly. |
| `features.test.ts:302` flake (testing T2) | The test now pins `state.party[1].maxHp = 30; state.party[1].hp = 30;` before `openChest` | **Done, using the approach the audit argued for** — pinning, not collapsing the assertion to `Math.max(...)`, which would have silently duplicated the `party[0]` clamp check. |
| Asset integrity (adversarial G1 #5) | `sprite-manifest.ts` +14, `sprite-manifest.test.ts` +19, `enemy-sprite-cache.ts` gains fallback warnings and procedural opt-outs | **Substantially done** (PR #23). |

#### In flight on `origin/chore/llm-drift-guards` (`6dee164`, unmerged)

| Audit item | Evidence |
|---|---|
| `PARTY_SIZE` collision (adversarial T2) | `combat-choreography.ts:99` renamed to `PARTY_SPRITE_SIZE`; import sites in `combat-scene.ts` / `combat-phaser-stage.ts` updated; `AGENTS.md:173` reworded to `PARTY_SIZE = 4`; `combat-scene-math.ts` comment updated |
| Dependency-boundary test (broad T6) | New `src/engine/dependency-guards.test.ts` (95 lines) |
| Floor authoring format split (adversarial T3) | `docs/FLOOR-AUTHORING.md` gains a "Campaign floor authoring split" section naming which floors are TS vs. JSON |
| Third perk mechanism (adversarial T4) | `AGENTS.md` gains a third bullet, "Direct aura/proximity perk-ID checks in `combat-shared.ts`", naming `warlordDamageMultiplier` / `vanguardDamageMultiplier` / `sentinelDamageMultiplier` as reference implementations |
| `exitDebugCombat` silent no-op (testing T4) | `main.ts` now throws `"exitDebugCombat: no active combat — only call while a debug combat is running"` |
| NPC sprite integrity | `floor-validate.ts` severity raised `info` → `warning` |

#### Still open at `6dee164` (verified by direct read)

`captureFailureBundle` still records no `commitSha`/`rngSeed`/`rendererMode` (testing T5) · `docs/AGENT-READING-LIST.md` still reads "PR-5 not built" in its banner while line 105 says the seeded-RNG half is done (testing T7) · `main.ts` still contains the `as unknown as` cast for `groundPlaneProbe` (testing T8) · `maybeTriggerEncounter` still duplicates `buildDebugCombat`'s roll-and-build sequence (adversarial T5) · no test enumerates `presentation` values against choreography branches (adversarial T6) · AGENTS.md has no subsystem navigation index (broad T4) · `src/main.ts` mode/controller wiring unchanged (broad T7) · **`src/content/floors/index.ts:7` still describes `floor-1.json` as "The Proving Depths"** (new finding, §11.2).

**Synthesis conclusion from this table:** the freshest actionable material left is predominantly the *documentation and evidence-plumbing* items — which is a genuinely different priority picture than the one the three audits produced. See Group 1 (revised) in §8.

---

## 3. LLM maintainability scorecard

Reproduced from the broad audit, with my verification annotations. Scale: 0 = severely obstructive · 1 = poor · 2 = fragile · 3 = workable · 4 = strong · 5 = exceptionally clear/reliable. All scores are as-of `be6131c`.

| # | Category | Score | Evidence | My verification |
|---|---|---|---|---|
| 1 | Onboarding clarity | **4** | `CLAUDE.md` → `AGENTS.md` → `README.md` → `docs/AGENT-READING-LIST.md` is coherent and non-circular. Docked because AGENTS.md costs ~30K tokens to read whole. | Confirmed: AGENTS.md is 303 lines / 64,863 bytes. |
| 2 | Source-of-truth clarity | **3** | Named and verified SoTs: `effective-stats.ts`, `render-math.ts`, `rng.ts`, `combat-choreography.ts`, `save.ts` (v14). Docked for floor-1 duplication. | **Evidence corrected, score unchanged.** The broad audit said floor 1 exists in *three* places. It does not — `src/data/floors.ts:515` is `export const FLOORS = [floor2(), floor3()]`. Floor 1 exists in **two**: the live pack and a stale export. But the drift is *worse* than reported — floors 4 and 5 also drifted semantically (§11.2). Net effect on the score is neutral. |
| 3 | Module-boundary clarity | **4** | 0 `game→engine`, 0 `data→engine`; 5/7 `data→game` edges type-only; 3 small cycles; renderer free of floor literals. Docked for `shell.ts` module-level DOM binding and `main.ts` fan-out. | Confirmed both zero-counts by grep at `be6131c`. |
| 4 | State ownership | **3** | Single `GameState` owned by `main.ts`; strict mode union. Four module-level mutable holders: `gameplayRng`, `floorList`, shell DOM handles, the perk queue. | Confirmed `floor-registry.ts:9` computes `merge(FLOORS, loadExtraFloors())` at module scope. |
| 5 | API explicitness | **4** | Strict mode union; structured `CombatEvent` with a 1:1 parallel array; `parseFloorMapJSON` is a strict parser; rng passed explicitly with a default at every gameplay entry point. | Not independently re-derived; spot-consistent with files read. |
| 6 | Determinism & reproducibility | **3** | Infrastructure near-5 (seeded LCG, `rng-wiring.test.ts`, `afterEach` leak guard, 8 replay fixtures). Wiring into the test suite near-1 (unseeded default, no `setupFiles`, measured ~1.87% failure rate). | Confirmed. **Now materially higher on current `main`** — see §2.3. |
| 7 | Test discoverability | **4** | Co-located `.test.ts`; AGENTS.md file map names test files against their subject. | Confirmed by directory structure. |
| 8 | Test fidelity | **4** | Real variety — pure math, contract, measurement, wiring, on-disk asset checks, replay fixtures. Docked because the default Phaser painter is excluded by policy. | Confirmed, **with a caveat the broad audit missed and the testing audit caught**: `scripts/debug-choreography.test.ts` contains **zero `expect()` calls** yet contributes 2 counted tests. I reproduced this (`grep -c "expect(" → 0`). |
| 9 | Failure diagnostics | **5** | `captureFailureBundle` writes screenshot + snapshot + ASCII map + `log(300)` + `sounds(80)` + `readiness()` + console/network errors + a replayable action transcript, and never throws. Non-resetting `seq` makes dropped history detectable. | Confirmed by reading `scripts/playtests/lib.mjs:134-169`. Note the missing SHA/seed/renderer-mode fields (testing T5) — a real gap inside an otherwise excellent facility. |
| 10 | Browser/visual validation | **3** | Playwright is a devDependency; `lib.mjs` is a mature harness; `arena-freeze-verify.mjs` hashes screenshots. But none of it runs in CI. | Confirmed structurally; not exercised. |
| 11 | Content-authoring ergonomics | **3** | Strong substrate (JSON packs, WYSIWYG editor, a 732-line linter, `docs/FLOOR-AUTHORING.md`, two-line corridor props). Docked hard because the editor opened a floor that no longer existed. | Confirmed and **strengthened** — the drift covered all three JSON-authored floors, not one (§11.2). |
| 12 | Asset-pipeline safety | **4** | `effect-sprite-wiring.test.ts:92` verifies every referenced effect URL exists on disk; `sprite-manifest.test.ts` reads PNG bytes rather than trusting the manifest; unreferenced strips must be allowlisted. Docked because none runs in CI. | Not independently re-derived. The CI half is now fixed on `main`. |
| 13 | Save & identifier safety | **4** | `SAVE_VERSION = 14` with a real `migrate()` chain, future-version saves rejected, migration tests, explicit "do not rename ids" guardrail. | Confirmed via the testing audit's per-version test inventory; spot-consistent. |
| 14 | CI enforcement | **1** | One workflow, `push`-only, build-only. No `npm test`, no `floor:validate`, no `pull_request` trigger. | **Confirmed by direct read of `deploy.yml`.** Now resolved on `main` (§2.3) — this is the single largest score movement since the audit. |
| 15 | Multi-agent concurrency safety | **2** | AGENTS.md:103 has a thoughtful parallel-session rule, but `main.ts` is a mandatory touchpoint, `styles.css` is a named conflict file, and there is no CODEOWNERS, no boundary test, and no CI to arbitrate. | Confirmed structurally. Partly improved by CI + the dependency-guards test. |
| 16 | Context efficiency | **3** | Helped by co-located tests and well-sectioned large files; hurt by AGENTS.md's ~30K-token whole-file read and `main.ts` sitting on most change paths. | Confirmed AGENTS.md size. |
| 17 | Refactor safety | **4** | 1,934 tests including explicit contract tests; two TypeScript projects at zero errors; strict-ish compiler flags. Docked because the background failure rate makes "did I break something?" ambiguous. | Confirmed. Improved on `main` by RNG seeding + `test:typecheck`. |
| 18 | Documentation drift resistance | **4** | Unusually strong *correction* machinery — AGENTS.md retracts its own guidance in place; `AGENT-READING-LIST.md` carries a "Known stale claims (do not re-assert)" section. Docked for 140 doc files and no detection for derived artifacts. | **Partly contradicted by my own findings.** Three separate live doc-drift instances exist simultaneously: the stale floor export, the `AGENT-READING-LIST.md` banner contradicting its own line 105, and `src/content/floors/index.ts:7`. The *machinery* is good; the *outcome* is mixed. A 3 would be defensible; I leave 4 and record the dissent. |
| 19 | Debug-tool quality | **5** | `__onyxDebug` is `?debug=1`-gated; pure builders are DOM-free and unit-tested; `route` derives from the *same* `currentRouteFlags()` builder the real router uses, so the debug view cannot drift; `jumpTo` routes through real `transitionToFloor`. | Confirmed the architecture. Two blemishes the testing audit found and I verified: `exitDebugCombat` silently no-ops, and `groundPlaneProbe` uses an inline `as unknown as` cast. Neither is enough to move a 5 to a 4. |
| 20 | Deployment confidence | **2** | Deploy is `git push` to `main` with a build-only gate — no tests, no floor validation, no smoke check, no documented rollback. `cancel-in-progress: true` means a rapid second push can cancel an in-flight deploy. | Confirmed by direct read. Improved on `main` (CI now also runs on `push: [main]`). |

**Raw total: 69 / 100.** (The broad audit's §11 says 68; its own category scores sum to 69.)

**Strongest five:** 9 Failure diagnostics (5) · 19 Debug-tool quality (5) · 3 Module-boundary clarity (4) · 8 Test fidelity (4) · 13 Save & identifier safety (4).

**Weakest five:** 14 CI enforcement (1) · 15 Multi-agent concurrency safety (2) · 20 Deployment confidence (2) · 6 Determinism (3) · 11 Content-authoring ergonomics (3).

Treat these as a calibrated summary with roughly ±1 of judgement per category. The useful signal is the *shape* — authoring in the 4s, enforcement in the 1s and 2s — not the total.

---

## 4. Repository strengths (consensus-weighted)

1. **The rules/presentation boundary is real, not aspirational.** *(Three-audit agreement; mechanically verified by me.)* Zero `game→engine` and zero `data→engine` production imports across 111 files. Most codebases that claim this boundary do not have it.
2. **Debug and diagnostic tooling is exceptional.** *(Three-audit agreement.)* The design decision that matters most: `route` and `jumpTo` derive from the *same* code paths production uses, so the debug surface cannot lie. `captureFailureBundle` is documented as never throwing, so a broken capture cannot mask its trigger. This is the correct pattern and should be the model for future tooling.
3. **`Math.random` discipline is fully honored at call sites.** *(Two-audit agreement; verified.)* It appears nowhere in `src/game/` or `src/data/` except inside `rng.ts`. The determinism problem was a *default value*, not a culture problem — which is exactly why it was cheap to fix.
4. **AGENTS.md is a genuinely high-quality agent manual.** *(Three-audit agreement.)* File map, "where do I make this change?" table, explicit `Do not do this` list, and long-form pitfall entries encoding hard-won root causes. It retracts its own prior guidance in place when wrong — rare and valuable.
5. **The `src/debug/*.ts` pure-helper pattern.** *(Testing audit; verified.)* Eight modules, each a pure typed function with a matching `.test.ts`, with `main.ts` holding only DOM/async glue. This is the codebase's demonstrated method for making previously-untestable code testable, and it is applied consistently.
6. **Save compatibility is handled seriously.** *(Two-audit agreement.)* v14 with a per-version-bump migration test, future-version rejection, and an explicit identifier-stability guardrail.
7. **The team fixes findings fast and correctly.** *(My observation, §2.3.)* Within the audit window, main gained seeded test RNG, PR CI, a floor-export drift check, and a preview-parity formula fix — several implemented *better* than the tickets specified.

---

## 5. Top friction points (consensus-weighted, ranked)

1. **A flaky test suite** — three-audit agreement, two independent reproductions. Corrodes the value of the only automated signal and teaches re-running instead of investigating. *(Resolved on current `main`.)*
2. **No PR CI whatsoever** — three-audit agreement, directly verified. Nothing prevented any other finding from reaching `main`. *(Resolved on current `main`.)*
3. **Silent drift in committed derived artifacts** — broad audit, verified and *strengthened* by me. The primary content-authoring surface was wrong, and no mechanism existed to notice. *(Resolved on current `main`.)*
4. **`main.ts` as mandatory touchpoint** — three-audit agreement on the *fact*, genuine disagreement on the *remedy* (§8, Group 3). The merge-conflict and context bottleneck for parallel agent work.
5. **AGENTS.md cannot be read in one pass** — broad audit, verified (303 lines / 64,863 bytes; a single read exceeds a 25K-token cap). The designated first read for every agent is too large to load selectively. *(Still open.)*
6. **Undocumented third implementation channels** — adversarial audit, verified. Perk auras (9 perk ids, 6 files) had no documented pattern; the floor-authoring format split had no doc. Agents following the documented decision procedure literally would get stuck or ship a no-op. *(Now documented on the in-flight branch.)*
7. **Silent fallbacks that hide missing wiring** — adversarial audit, verified. An unrecognized `CombatEvent.presentation` value falls through to the generic cast animation with no error, no log, and no test. *(Still open.)*

---

## 6. Representative task walkthrough findings (A–H)

Eight walkthroughs were traced across two audits — A/C/D/F/G by the testing audit, B/E/H by the adversarial audit. None were implemented; all are traced-not-built.

**A — Add a new enemy with unique art and one special ability.** *(Testing audit.)* Five touchpoints: `EnemyDef` in `data/enemies.ts`, optional `EnemyAbilityDef` in `data/enemy-abilities.ts`, an `ENCOUNTER_TABLES` entry, a `sprite-manifest.ts` entry, and PNGs under `public/assets/enemies/<id>/`. The safety net is already strong and needs no new tooling: `enemies.test.ts:100` fails if an encounter-table enemy id doesn't resolve, `:248` fails if an `abilityIds` entry doesn't resolve, and `sprite-manifest.test.ts` reads real PNG bytes and asserts declared frame dimensions. Missing art degrades to a documented procedural placeholder. **Gap:** nothing verifies the sprite actually *renders correctly* (anchors, choreography timing) short of a manual Arena pass — inherent to visual correctness, not a process defect.

**B — Add a perk that modifies damage and reacts to a combat event.** *(Adversarial audit; verified.)* The two documented mechanisms are genuinely low-friction and cover ~52 of 56 perks: numeric `PerkEffect` fields folded automatically by `perkModifiers()`, or a `dispatchHook` registration. **The gap is the third, undocumented mechanism** — full-party-context "aura" perks implemented as hardcoded `perksForCharacter(c).some(p => p.id === "...")` checks at each damage site. I verified all four reference helpers exist (`combat-shared.ts:326/343/363/382`) and that `data/perks.ts`'s Warlord definition carries an empty `effect: {}` with a comment explaining why neither documented path fit. An agent following `AGENTS.md:277` literally would try `PerkEffect` (impossible — `perkModifiers()` only ever sees the acting character's own perks) or `dispatchHook` (awkward — it is a standing condition, not an event), and ship a no-op.

**C — Add a new regional floor material (water-floor case study, real merged PR #19).** *(Testing audit.)* Traced from the actual diff. The material rode entirely on a *pre-existing* tile value (`tile === "water"`), which is why the PR was small: one new pure module (`water-floor.ts`, 11 lines, unit-tested), ~93 renderer lines mirroring the existing door-texture pattern, two 256×256 PNGs with a dimension test. Floor data, the validator, encounter tables, the save schema, and fog math were all untouched. **Inference (one data point):** a material reusing an existing tile value costs ~15–40 renderer lines; one needing a *new* `Cell.tile` value has a much larger blast radius — the union type, `floor-validate.ts`, the editor's Feature tool, and `floor-ascii.ts` all need to learn it.

**D — Add a new floor or major floor region.** *(Testing audit.)* Author in the editor → export JSON → `src/content/floors/` → register in `EXTRA_FLOOR_MAPS` → `parseFloorMapJSON` validates strictly at load → resolve through `floor-registry.ts`. Four engine constraints an agent must know first, all documented: stairs are implicitly `floorId ± 1`; stairs land at the *target's* `startX/startY`; **`FloorDef.encounterTable` is dead** — real tables live in `ENCOUNTER_TABLES` keyed by floor id, so a new non-campaign floor id gets *zero* random encounters unless an `encounterZones` entry sets `tableFloorId`; keys are freeform `*-key` strings, not real items. `docs/FLOOR-AUTHORING.md` is unusually good — current, path-accurate, and explicit about which of its own rules the validator can and cannot enforce.

**E — Change combat animation without changing combat rules.** *(Adversarial audit; verified.)* Mostly yes. Rules emit structured `CombatEvent`s; choreography consumes them; timing/VFX changes need no rules changes. **The one real exception:** coordinated multi-actor presentations are *authored in the content layer*. `EnemyAbilityDef.presentation` (`data/enemy-abilities.ts:84`) selects which engine-layer choreography runs, and the literal union is declared **twice, independently** — at `enemy-abilities.ts:84` and `combat-types.ts:121`. Shipping a new coordinated animation touches three files, two of them nominally "rules/content." I confirmed the branch at `combat-choreography.ts:2964` is an `if` inside `case "cast":`, so a missing branch is a silent no-op, not a compile or test failure.

**F — Reproduce and fix a combat bug deterministically.** *(Testing audit.)* Three surfaces at three completeness levels. **Browser/Playwright reproduction is largely solved** — `setGameplayRng` + `createSeededRng` are on `__onyxDebug`, and `rng-wiring.test.ts` proves every system's default path consults the global RNG. **Full transcript replay is explicitly not implemented** — `AGENTS.md:194` and `README.md` both state independently that transcripts are "evidence only." **Unit-test reproduction was the weak point** at the audited commit, since rerunning gave a different roll every time. This is the precise, concrete answer to how much the RNG gap hurt: it was narrower than "nothing is deterministic," but it hit exactly the layer agents iterate in fastest.

**G — Change the save schema.** *(Testing audit.)* Bump `SAVE_VERSION`, add a sequential `migrate()` branch, add one dedicated `it(...)` — the established and already-good pattern, needing no new infrastructure. Persisted vs. transient state is explicit at `save.ts:1-16`: combat state is deliberately not saved; `Set`s convert to/from arrays; the floor grid is never persisted but re-cloned from the immutable definition, so floor-data changes need no migration unless they change what a saved *reference into* that data means.

**H — Add a temporary fifth party member or companion.** *(Adversarial audit; verified.)* **The key insight is that the engine already has the right extension point and it is not the party array.** `SummonedAlly` (`combat-types.ts:169-180`) is a lighter-weight temporary participant with its own `ALLY_FORMATION_SLOTS` and its own auto-played `resolveAllyTurn` — for "an NPC fights alongside you this encounter," this is a small, contained change. A genuinely *controllable* 5th member is much bigger, and I verified every cited blocker: `PARTY_FORMATION_SLOTS` (`combat-scene-math.ts:308-313`) is exactly four hand-tuned pixel positions; `partySlot()` (`:459-461`) clamps via `Math.min(index, length - 1)`, so a 5th member would **silently render on top of the 4th**; front/back row is `formationSlot <= 1` at five call sites across three files (`party.ts:329`, `party.ts:358`, `combat-equipment.ts:31`, `combat-shared.ts:303`, `combat-shared.ts:313`), which hardcodes both the split point *and* an even 2/2 shape; and `#party-strip` is a 4-column CSS grid. The silent clamp is the sharpest risk — it fails as a mid-combat visual overlap, not as a crash or a test failure.

---

## 7. Top LLM traps in OnyxLabyrinth

Ranked by (severity of the plausible mistake) × (ease of making it) × (weakness of current protection). All five were re-verified by me at `be6131c`; verification notes are inline.

**Trap 1 — The damage preview silently omitted three real damage modifiers.** *(Verified — this was the highest-value single finding in the entire audit set.)* `combat-preview.ts`'s doc comment says it excludes "no crits, no reactive hooks," which reads as exhaustive. But `resolveAttack` (`combat-actions.ts`) applies three further *deterministic, non-reactive* multipliers that preview did not: `s.damageBuffs` (Battle Cry), `warlordDamageMultiplier` (`combat-actions.ts:212`), and `scaleOutgoingDamage` (`:214`); `combat-spells.ts` applies the latter two at `:60` and `:103`. I read both files and confirmed all three omissions in both preview functions. The existing "parity" tests could not detect this because they build state from `createDefaultParty()` with zero buffs, perks, and statuses — a textbook case of a test that proves a helper assumption but not the public behavior. **Resolved on current `main`** by fixing the formula in both functions.

**Trap 2 — `PARTY_SIZE` names two unrelated constants.** *(Verified.)* `game/party.ts:35` is the party headcount (`4`); `engine/combat-choreography.ts:98` is the sprite draw size (`300`). Both are exported. **Both combat painters import the 300px meaning** (`combat-scene.ts:28`, `combat-phaser-stage.ts:38`) while `debug/invariants.ts:10` imports the headcount meaning. And the project's own manual makes the conflation: `AGENTS.md:173` says "all four party members (`PARTY_SIZE`)" *inside the section about the files where `PARTY_SIZE` means 300px*. The trap is specific and nasty: an agent auditing "everywhere `PARTY_SIZE` is used" before a party-size change finds it flowing through both painters and wrongly concludes the render layer already scales with headcount — then skips `PARTY_FORMATION_SLOTS` entirely. **Fixed on the in-flight branch** (`PARTY_SPRITE_SIZE`).

**Trap 3 — An unrecognized `CombatEvent.presentation` falls through silently.** *(Verified.)* `combat-choreography.ts:2964` is `if (evt.presentation === "meleeGangUp" && evt.targetId)` inside `case "cast":` — any other value drops to the generic stationary cast. The union is declared twice independently (`enemy-abilities.ts:84`, `combat-types.ts:121`), so TypeScript cannot enforce that a new literal has a matching branch. An agent adding a second coordinated attack would widen both unions, wire the ability, ship it, and get an ordinary cast animation with no compile error, no test failure, and no log line. Mitigating context: exactly one `presentation` value has shipped, and the team's `debug-choreography` tracing workflow is a reasonable informal check — so this is **high confidence on mechanism, medium on urgency**. **Still open.**

**Trap 4 — Perk effects have a third, undocumented implementation channel.** *(Verified.)* `AGENTS.md:277` describes exactly two mechanisms. A third exists in production across 9 perk ids and 6 files, with four reference helpers in `combat-shared.ts`. The author of the Warlord perk already knew neither documented path fit and said so in a code comment. All nine have direct unit-test coverage, so a typo'd id fails a test rather than shipping — the gap is discoverability, not correctness. **Documented on the in-flight branch.**

**Trap 5 — Not every floor uses the same authoring format.** *(Verified.)* `src/data/floors.ts:515` is `export const FLOORS = [floor2(), floor3()]` — floors 2 and 3 are imperative TS grid-carving functions with no JSON source at all, while floors 1, 4, and 5 are declarative JSON packs. `docs/FLOOR-AUTHORING.md:3` described only the JSON format with no caveat. An agent told to "add a room to Floor 2" would open the WYSIWYG editor expecting to load it. The saving grace is that `floor:validate` runs against the *merged post-`mapToFloorDef` runtime list*, so both pipelines get identical structural linting — the mismatch is in the *editing workflow*, not the validation. **Documented on the in-flight branch.**

**Runner-up — the `partySlot()` silent clamp** (Walkthrough H) is a real silent-substitution mechanism but is currently unreachable, since party size is fixed and enforced at creation. Correctly classified by the adversarial audit as a speculative future concern, not a live defect.

---

## 8. Prioritized recommendations

Ranked conceptually by Impact × Confidence × Frequency ÷ (Effort × Risk). These are not precise numbers and should not be read as such.

### Group 1 — Immediate high-return improvements (max 5)

**As-of the audited commit**, the top five were: (1) seed the gameplay RNG in a Vitest setup file; (2) add a `pull_request`-triggered CI workflow running build + test + floor:validate; (3) regenerate the floor exports and add a drift check; (4) close the damage-preview parity gap; (5) add an `npm run check` wrapper. **All five are now landed on `origin/main`** (§2.3). They are recorded here because they were the correct answer and because the tickets in §9 document why.

**Revised Group 1 for the current tree** — the five highest-return items still open, all verified by me at `6dee164`:

1. **Add a subsystem navigation index to the top of AGENTS.md.** *(Broad T4; still open.)* AGENTS.md is 303 lines / 64,863 bytes and exceeds a single-read token cap, yet it is the designated first read for every agent. A ~20-row table mapping subsystem → existing section heading → primary source files lets an agent grep to one section instead of loading ~30K tokens. Zero new files, zero content removed. This is now the largest remaining per-task context cost in the repository.
2. **Fix the three live documentation-drift instances.** *(Testing T7 + my new finding; still open.)* `docs/AGENT-READING-LIST.md:5` says "PR-5 not built" while its own line 105 says the seeded-RNG half is done — and it is now *fully* done, so the banner is doubly wrong. `src/content/floors/index.ts:7` describes `floor-1.json` as "The Proving Depths" when the live pack is "The Hall of Five Wounds." Both are cheap edits that prevent an agent from acting on a false status.
3. **Add `commitSha`, `rngSeed`, and `rendererMode` to `captureFailureBundle`.** *(Testing T5; still open.)* The evidence facility is otherwise best-in-class, and these three fields are what make a bundle *actionable* rather than merely descriptive — especially now that seeded reproduction actually works.
4. **Add a `presentation` coverage regression test.** *(Adversarial T6; still open.)* The one silent-fallthrough with a real correctness consequence. Cheap at N=1 and prevents a class of bug that is invisible to the compiler, the test suite, and code review alike.
5. **Land `chore/llm-drift-guards` once its author considers it ready.** *(My recommendation, stated conditionally.)* It carries five verified audit fixes (`PARTY_SPRITE_SIZE`, dependency-guards test, floor-format doc, perk third-mechanism doc, `exitDebugCombat` throw). I verified its *contents* by reading files at `6dee164`; I did **not** verify that it is green, mergeable, or finished — it is an active working branch. The point is only that these five fixes are worth not losing.

### Group 2 — Improvements during the next relevant feature (max 8)

1. **Share the encounter-build core between `maybeTriggerEncounter` and `buildDebugCombat`** *(adversarial T5)* — verified duplicated; today's divergence (the treasure-tile guard, production-only) is intentional and correct, so this is forward-looking only. Do it whenever either is next touched, not as a standalone PR.
2. **Type `groundPlaneProbe` against the real `CombatScene`** *(testing T8)* — remove the `as unknown as` cast; `CombatController.scene` is already a public typed getter.
3. **Export a canonical `SPELLS_BY_ID` from `data/spells.ts`** *(adversarial G2 #3)* — parallel to the existing `ITEMS_BY_ID`; `main.ts` and `debug/start-combat.ts` each rebuild it independently today. Pure dedup, zero behavior change; bundle into any unrelated `main.ts` touch.
4. **Make `partySlot()`'s clamp a dev-mode assertion** *(adversarial G2 #6)* — cheap, and directly converts Walkthrough H's sharpest silent failure into a loud one without requiring the full formation redesign.
5. **Give `scripts/debug-choreography.test.ts` real assertions, or exclude it from the counted glob** *(testing G2 #7)* — it currently contributes 2 tests and 0 `expect()` calls.
6. **Add a one-line consistency test when next balancing an aura perk** *(adversarial G2 #4)* — assert the description string's stated percentage matches the hardcoded multiplier literal. The description-vs-literal pattern repeats across all 56 perks; fix it where you are already editing rather than sweeping.
7. **Correct the stale instruction comment at `vite.config.ts:4-5`** *(broad G2 #3)* — it still says "replace 'wizardry-clone' with your actual GitHub repo name" directly above a correctly-set `base`.
8. **Address the three high-severity dev-dependency advisories** (`playwright`, `postcss`, `undici`) during a routine dependency pass. All have fixes; none affect the shipped bundle.

### Group 3 — Strategic architectural improvements (max 5)

1. **Full input-transcript + seed replay.** *(Testing audit G3 #1; already tracked by the team as the second half of "PR-5".)* Now that seeded RNG is wired *and* defaulted in tests, this is the natural successor and the last major gap in deterministic reproduction. Both `AGENTS.md:194` and `README.md` state independently that transcripts are currently evidence-only.
2. **Establish an owner and a regeneration trigger for every committed derived artifact.** The floor-export drift is fixed; the *policy* that would have prevented it does not exist. Currently applies to `tools/floor-data/` and `public/tools/floor-data/`.
3. **Reduce `main.ts`'s mandatory-touch surface — design first, and only if the pain is real.** See the preserved disagreement below. This is deliberately *not* framed as "split main.ts."
4. **Investigate whether any further pure-function extraction from `combat-phaser-stage.ts` is possible** — flagged by the testing audit as "check before investing," not as a committed recommendation. The genuinely Phaser-specific remainder may be irreducibly untestable in jsdom, in which case this yields nothing.
5. **Consider automated coverage for the default Phaser painter.** It is the shipped default at 1,411 kB and is untested *by policy*. The correct surface is browser-based and scheduled, not a jsdom unit test — see Group 4.

> **Preserved disagreement — `main.ts` decomposition.** The broad audit recommends (T7, strategic) designing a declarative mode/controller registration table so adding an overlay is one entry rather than five edits. The adversarial audit says the opposite (Group 4 #7 and "attractive but wrong" #4): do not schedule a split, because the genuinely testable slices have *already* been extracted into `src/debug/*.ts`, and what remains is DOM/mode-orchestration glue that legitimately needs single ownership of `GameState`.
>
> **My resolution: the adversarial audit is better-supported on the question it actually answers, and the broad audit is right about a question the adversarial audit does not address.** The adversarial audit did the deeper structural work — it traced the extraction history, identified module-scope `state` and the import-time `requestAnimationFrame` loop as the real reason `main.ts` is untestable (not line count), and correctly noted no obvious pure subset remains in `endCombat`/`onMove`. That decisively refutes "split it because it is 2,528 lines." But the broad audit's narrower claim — that adding an overlay requires coordinated edits to `showMode`, `transitionToMode`, `currentRouteFlags`, a keydown listener, and a `justOpened*` flag — is independently verifiable and untouched by the adversarial analysis. **Actionable synthesis: do not split for size. If the five-site overlay cost becomes painful in practice, design a registration table, and treat preserving `currentRouteFlags()` as the single builder feeding both the real router and the debug `route` field as a hard constraint** — that property is worth more than the refactor.

> **Preserved disagreement — is anything strategic-scale at all?** The adversarial audit's Group 3 is a single entry: *nothing* here rises to strategic scale, and it argues that an adversarial pass specifically hunting hidden coupling finding nothing structural is itself evidence of architectural health. The broad and testing audits both list three-to-five strategic items. I have not forced these together. The adversarial claim is credible for *its scope* (coupling and abstraction quality) and I found nothing to contradict it; the other two audits' strategic items are mostly about *reproducibility and enforcement infrastructure*, which is a different axis. Both can be true.

### Group 4 — Do not change

*(Consolidated in §10.)*

---

## 9. Implementation tickets

Ordered by priority **as ranked at the audited commit**, per the synthesis brief. Each carries a verified current status so nobody implements work that has already landed. Ordering dependencies are stated explicitly.

---

### T1 — Seed the gameplay RNG for the test suite
**Status vs. current main: DONE on `ed1704e`** (`vitest-setup.ts` + `vitest.config.ts:10`). Implemented with `beforeEach`, as specified, plus an `ONYX_TEST_RNG_SEED` override.

- **Objective:** Make `npm test` deterministic.
- **Problem (re-verified):** `src/game/rng.ts:61` is `let gameplayRng: Rng = Math.random;`. `vitest.config.ts` declared no `setupFiles`. 37 test files construct characters via `createDefaultParty`/`createCharacter`; 26 call `createCharacter` directly; **only 4 seed the RNG**. Character creation flows unconditionally through the global: `createCharacter` → `rollStatsForRace` → `roll3d6` → `rollD6` → `getGameplayRng()()`, and `computeMaxHp = stats.vit * 2 + hpBonus`, so every unseeded test's `maxHp` is a random variable. Two audits reproduced a failure at `src/game/features.test.ts:302`.
- **Scope:** A setup file installing a fixed seeded RNG per test, registered via `setupFiles`.
- **Non-goals:** Do **not** change the production default — unseeded `Math.random` is correct for real play and `rng.test.ts` asserts it. Do not rewrite the 34 affected test files. **Do not add retry logic** — retries mask this exact class of bug.
- **Implementation approach:** `beforeEach(() => setGameplayRng(createSeededRng(SEED)))` + `afterEach(() => resetGameplayRng())`, mirroring the pattern already proven at `rng-wiring.test.ts:31`. `beforeEach` (not file-level only) is required to also close within-file order dependence.
- **Tests:** The suite is the test.
- **Manual verification:** Confirm `?debug=1` play still produces varied party rolls.
- **Acceptance criteria:** Green across ≥5 consecutive runs at the chosen seed **and** at ≥2 alternate seeds. Any test that passes at some seeds and fails at others has a latent stat dependency and must be fixed *at that test* — do not seed-shop.
- **Effort:** S. **Dependencies:** none; **blocks T3.** **Branch:** `test/seed-gameplay-rng-by-default`

---

### T2 — Add a `pull_request`-triggered CI workflow
**Status vs. current main: DONE on `ed1704e`** (`.github/workflows/ci.yml`, `on: pull_request`, runs `npm run check`).

- **Objective:** Make the existing quality signals gate merges.
- **Problem (re-verified):** `.github/workflows/deploy.yml` was the only workflow. Triggers: `push: branches: [main]` + `workflow_dispatch`. Steps: `npm ci`, `npm run build`. **No `pull_request` trigger anywhere**, so no status check could gate a PR regardless of content.
- **Scope:** A **new** workflow file — not an edit to `deploy.yml`, whose `concurrency: group: pages` is scoped to deploys and is the wrong group for PR validation.
- **Non-goals:** Do not modify `deploy.yml`. Do not add Playwright/visual jobs to the required workflow. Do not gate on `npm audit`.
- **Implementation approach:** Mirror `deploy.yml`'s Node 22 + `cache: npm` setup; separate concurrency group; run the commands as distinct steps for per-step pass/fail in the PR UI.
- **Ordering:** **Must land after T1**, or the gate fails ~1.9% of runs on arrival and gets disabled. If it must land first, run `npm test` with `continue-on-error: true` until T1 merges — a plain `run:` step fails its whole job on a flake and takes `build` down with it.
- **Acceptance criteria:** PRs show a required check running build + test + floor:validate.
- **Effort:** S. **Dependencies: T1.** **Branch:** `ci/add-pull-request-workflow`

---

### T3 — Regenerate the floor-data export and add a drift check
**Status vs. current main: DONE on `ed1704e`** (`floor:export-check` script, wired into `npm run check`; all exports regenerated).

- **Objective:** Make the floor editor show the floors the game actually ships, and keep it that way.
- **Problem (re-verified, and stronger than originally reported):** `tools/floor-editor.ts:1187` fetches `${BASE}tools/floor-data/floor-${id}.json` from the committed `public/tools/floor-data/`. At `be6131c` I ran a normalized deep-diff of every JSON-authored floor against its export:
  - **floor-1:** export is `"The Proving Depths"` 25×32; live pack is `"The Hall of Five Wounds"` 24×28. Fifteen keys differ, and `waters` (5 cells including a poison-cure tile) and `tilesetZones` are **absent from the export entirely**.
  - **floor-4:** `treasures` differs — the export carries `runeblade+3` / `mythril-plate+3` where the pack ships `runeblade+2` / `mythril-plate+2`.
  - **floor-5:** `treasures` differs — export has `bow+3`, `voidblade+4`, `dragonscale-mail+4`; pack ships `bow+2`, `voidblade+2`, `dragonscale-mail+2`.
  **This corrects the broad audit**, which inferred from identical serialized lengths that floors 4/5 differed only by key ordering. They differ by *loot enhancement tier* — the strings happen to be the same length. All three JSON-authored floors had drifted.
- **Scope:** Regenerate both export directories; add a check that re-derives each floor and compares against the committed export, failing with the floor id and differing keys.
- **Non-goals:** Do not change floor content. Do not change the editor's fetch URL. Do not delete the committed export — the editor is a static page and needs it served.
- **Manual verification:** `npm run floor:editor`, open floor 1, confirm "The Hall of Five Wounds" at 24×28 with water cells present.
- **Effort:** S–M. **Dependencies:** none. **Branch:** `fix/floor-data-export-drift`

---

### T4 — Close the damage-preview parity gap
**Status vs. current main: DONE on `ed1704e`**, in the stronger of the two forms the ticket allowed — the formula was fixed in both preview functions, not merely documented.

- **Objective:** Make the preview shown to the player match the damage actually dealt.
- **Problem (re-verified by reading both files at `be6131c`):** `combat-preview.ts`'s doc comment excludes only "crits" and "reactive hooks." But `resolveAttack` applies three further deterministic multipliers that preview did not: `s.damageBuffs[actor.id]` (Battle Cry), `warlordDamageMultiplier(s, actor)` (`combat-actions.ts:212`), and `scaleOutgoingDamage(damage, actor)` (`:214`). `combat-spells.ts` applies the latter two at `:60` and `:103`; `previewSpellDamage` had neither. Both helpers (`combat-shared.ts:140-152`, `:326-336`) are plain deterministic functions — neither a crit nor a `dispatchHook`, so neither is covered by the stated exclusion. The existing parity tests (`action-preview.test.ts:107`, `:190`) build state from `createDefaultParty()` with zero buffs/perks/statuses and prove parity only on the no-buff branch.
- **Scope:** Extend the parity tests to cover an active Battle Cry buff, a living adjacent Warlord holder, and a `shrunk`/`giantStrength` status; then either fix the formula or make the exclusion explicit in the doc comment.
- **Non-goals:** Do **not** add crit or reactive-hook simulation to preview — `guaranteedKill` must never overclaim.
- **Acceptance criteria:** The new cases exist and either pass against a corrected formula, or document a now-explicit intentional exclusion. Not left silently red or silently absent.
- **Effort:** 2–4 h. **Dependencies:** none. **Branch:** `fix/preview-parity-buff-coverage`

---

### T5 — Add an `npm run check` wrapper
**Status vs. current main: DONE on `ed1704e`**, expanded to include `test:typecheck` and `floor:export-check`.

- **Objective:** Collapse a three-command sequence documented independently in two places.
- **Problem (re-verified):** `README.md:41-43` and `docs/FLOOR-AUTHORING.md:136-140` each write out the same `npm test && npm run build && npm run floor:validate` sequence by hand; `README.md:162` lists only two of the three. `docs/FLOOR-AUTHORING.md:134-140` explicitly concedes CI does not run them.
- **Scope:** One `package.json` script line plus two doc lines. Purely additive.
- **Non-goals:** Do not fold browser/visual/replay scripts in — it must stay fast and non-interactive, matching what CI runs.
- **Effort:** Trivial. **Dependencies:** benefits from T1 but is not blocked by it. **Branch:** `chore/add-check-script`

---

### T6 — Rename the sprite-size `PARTY_SIZE` constant
**Status vs. current main: DONE on the unmerged `chore/llm-drift-guards` (`6dee164`)** — renamed to `PARTY_SPRITE_SIZE`, import sites updated, `AGENTS.md:173` reworded. Land that branch when its author considers it ready.

- **Objective:** Eliminate a domain-significant identifier collision.
- **Problem (re-verified):** `game/party.ts:35` `PARTY_SIZE = 4` (headcount) vs. `engine/combat-choreography.ts:98` `PARTY_SIZE = 300` (sprite draw size). Both painters import the 300px meaning (`combat-scene.ts:28`, `combat-phaser-stage.ts:38`); `debug/invariants.ts:10` imports the headcount meaning. `AGENTS.md:173` uses the bare name ambiguously *inside the section about the 300px consumers*.
- **Scope:** Rename the choreography constant and its import sites; fix the AGENTS.md wording.
- **Non-goals:** Do **not** rename `game/party.ts`'s `PARTY_SIZE` — it is the more fundamental and more widely referenced name. Do not touch `ENEMY_SIZE`/`BOSS_SIZE`.
- **Tests:** None needed — `npm run build` catches any missed import site, which is the correct safety net for a pure rename.
- **Acceptance criteria:** Exactly one exported `PARTY_SIZE` remains in the codebase.
- **Effort:** 1–2 h. **Dependencies:** none. **Branch:** `chore/rename-sprite-size-constant`

---

### T7 — Add a subsystem navigation index to AGENTS.md
**Status vs. current main: STILL OPEN** (verified at `6dee164`). **This is the highest-value remaining item.**

- **Objective:** Let an agent load one subsystem's guidance without reading ~30K tokens.
- **Problem (re-verified):** `AGENTS.md` is 303 lines / 64,863 bytes; a single read exceeds a 25,000-token cap. It is the designated first read for every agent — `CLAUDE.md` names it "the authoritative repository manual." Its density is concentrated in a few very long pitfall entries (813–1,347 characters each), and that length is *earned* — each encodes a root cause that would otherwise be rediscovered expensively.
- **Scope:** One markdown table, ~20 rows, mapping subsystem → existing section heading → primary source files.
- **Non-goals:** **Do not shorten or delete any existing content.** Do not split AGENTS.md into multiple files. **Do not create a `docs/context/` hierarchy** — a second hierarchy would immediately become the thing that drifts, and the substrate already exists here. Do not duplicate the existing file map or "Where do I make this change?" table; reference them.
- **Manual verification:** Pick three representative tasks (change combat animation timing; add a perk; ship a corridor prop) and confirm the index routes to the right section without a full read.
- **Acceptance criteria:** Index exists; every referenced heading resolves; `git diff` shows additions only.
- **Effort:** S. **Dependencies:** none. **Branch:** `docs/agents-subsystem-index`

---

### T8 — Fix the three live documentation-drift instances
**Status vs. current main: STILL OPEN** (all three verified at `6dee164`).

- **Objective:** Remove status claims that are actively false.
- **Problem (re-verified):**
  1. `docs/AGENT-READING-LIST.md:5` states "PR-5 not built" in its summary banner, while `:105` — updated later — states "**Seeded gameplay RNG done** … Transcript replay still open." Since `ed1704e`, the seeded-RNG half is *fully* done including the test-runner default, so the banner is now wrong twice over. A banner exists precisely to be read instead of the body.
  2. **`src/content/floors/index.ts:7`** reads `floor-1.json ("The Proving Depths") replaces the hand-carved tutorial crypt.` The live pack is **"The Hall of Five Wounds."** *(New finding — reported by none of the three audits; same drift class as T3, in the module that loads the floor.)*
  3. `vite.config.ts:4-5` still instructs "replace 'wizardry-clone' with your actual GitHub repo name" directly above a correctly-set `base: "/OnyxLabyrinth/"`.
- **Scope:** Three targeted edits. Nothing else.
- **Non-goals:** Do not restructure `AGENT-READING-LIST.md` — this is a factual correction, not a documentation overhaul, and the repository has already completed a documentation-rationalization project.
- **Acceptance criteria:** Banner and body agree; the module comment names the floor that actually loads; the vite comment is gone.
- **Effort:** Trivial (~20 min). **Dependencies:** none. **Branch:** `docs/fix-stale-status-claims`

---

### T9 — Add SHA, seed, and renderer-mode to `captureFailureBundle`
**Status vs. current main: STILL OPEN** (verified — no `commitSha` at `6dee164`).

- **Objective:** Make playtest evidence actionable rather than merely descriptive.
- **Problem (re-verified by reading `scripts/playtests/lib.mjs:134-169`):** The bundle records `name`, `capturedAt`, `transcript`, `consoleErrors`, `screenshot`, `snapshot`, `log`, `sounds`, `readiness`, `url`, and `viewport` — but **no commit SHA, no RNG seed, and no explicit renderer mode**. `url` would incidentally reveal `?phaser=0` if the caller included it, but there is no explicit field and no seed at all.
- **Scope:** Three fields. `commitSha` from `process.env.GITHUB_SHA` or `git rev-parse HEAD`. `rendererMode` derived from the URL's `phaser` param, defaulting to `"phaser"`.
- **Implementation note — the one non-obvious part:** `rngSeed` is **not** recoverable after the fact. `setGameplayRng` takes an `Rng` *function*, and `rng.ts` exposes no "what seed produced this" getter, so a `page.evaluate` cannot retrieve it the way it retrieves `snapshot`. Pick one: (a) add an explicit `{ seed }` option that calling scripts pass through, or (b) record the seed into the same page-keyed `WeakMap` that already holds the action transcript. Do not ship without choosing — "the caller already knows the seed" is true but does not get the value into the bundle.
- **Non-goals:** Do not build a new evidence system, schema, or dashboard. Do not touch `snapshot()`/`readiness()`.
- **Acceptance criteria:** Every written bundle includes all three fields.
- **Effort:** Trivial (~45 min). **Dependencies:** none. **Branch:** `feat/playtest-bundle-evidence-fields`

---

### T10 — Add a `presentation` coverage regression test
**Status vs. current main: STILL OPEN** (verified at `6dee164`).

- **Objective:** Catch a silently-unwired `CombatEvent.presentation` value before it ships.
- **Problem (re-verified):** `combat-choreography.ts:2964` — `if (evt.presentation === "meleeGangUp" && evt.targetId)` inside `case "cast":` — falls through to the generic stationary cast for any other value, with no console line and no debug event. The literal type is declared **twice, independently** (`data/enemy-abilities.ts:84`, `game/combat-types.ts:121`), and because the dispatch is an `if` rather than a `switch`, TypeScript has no mechanism to require a branch per literal. `AGENTS.md:283` documents the intended extension procedure but not that skipping the branch is a silent no-op.
- **Scope:** A data-driven test iterating every ability in `ALL_ENEMY_ABILITIES` with a non-undefined `presentation`, asserting the traced choreography is *not* the generic-cast signature. Reuse `scripts/debug-choreography.test.ts`'s existing real-resolver-plus-real-choreography tracing pattern.
- **Non-goals:** **Do not** add a compile-time exhaustiveness mechanism (a switch-based dispatch table) until a second `presentation` value actually ships. One consumer does not justify the refactor; a test is cheaper and sufficient at N=1.
- **Acceptance criteria:** Temporarily commenting out the `meleeGangUp` branch turns the new test red; revert and it is green.
- **Effort:** 2–3 h. **Dependencies:** none. **Branch:** `test/presentation-coverage`

---

### T11 — Add a dependency-boundary test for the rules/presentation split
**Status vs. current main: DONE on the unmerged `chore/llm-drift-guards`** (`src/engine/dependency-guards.test.ts`, 95 lines). Land that branch when its author considers it ready.

- **Objective:** Convert an observed architectural property into an enforced one.
- **Problem (re-verified):** Zero `src/game/** → src/engine/**` and zero `src/data/** → src/engine/**` production imports exist today. AGENTS.md states the boundary as a rule. Nothing enforces it — one future import would silently break it, and that regression is close to invisible in review.
- **Scope:** One test walking `src/game/**` and `src/data/**` production files, extracting relative import specifiers, asserting none resolve into `src/engine/**`.
- **Non-goals:** **Do not add a lint dependency** — this is ~30 lines of `fs` plus a regex, and no library alternative is warranted at that size. Do **not** enforce the `data → game` direction: 5 of those 7 edges are `import type` and erased at build time, and the two value imports (`data/floors.ts:35`, `data/enemies.ts:15`) are defensible.
- **Acceptance criteria:** Passes on `main`; fails on a deliberately injected violation.
- **Effort:** S. **Dependencies:** best landed alongside CI so it actually gates. **Branch:** `test/dependency-boundary-rules-vs-engine`

---

### T12 — (Strategic, design-first) Reduce `main.ts`'s mandatory-touch surface
**Status vs. current main: STILL OPEN. Read the preserved disagreement in §8 before starting — one audit recommends against doing this at all.**

- **Objective:** Make adding a mode/overlay a local change rather than a coordinated five-site edit.
- **Problem (re-verified):** `src/main.ts` is 2,528 lines with ~67 distinct import specifiers (~3× the next-highest file) and ~50 top-level functions spanning town, party creation, prologue, ending, title, encounters, combat lifecycle, perk overlay, game over, camp, movement, trap prompt, action ring, controller routing, arena, save menu, spell menu, NPC panel, and automap. AGENTS.md documents the resulting hazards at length (borrowed-`"title"` mode, synchronous mode-open mid-keydown, `justOpened*` guards) — which is itself evidence the coupling is real and repeatedly costly. It is also the highest merge-conflict surface for parallel agents.
- **Counter-evidence you must weigh first:** `main.ts` declares `const state` at module scope and schedules a `requestAnimationFrame` loop at import time, so it cannot be imported by a test at all; the genuinely extractable pure logic has *already* been pulled into `src/debug/*.ts`; and `endCombat`/`onMove` are mode-transition and DOM-orchestration glue with no obvious pure subset left.
- **Scope:** **Design only, not implementation.** A written design for a declarative mode/controller registration table, reviewed against the AGENTS.md pitfall list.
- **Non-goals:** **Do not do a mechanical line-count split** — line count is not the evidence here. Do not change mode semantics. **Do not break the property that `currentRouteFlags()` is the single builder feeding both the real input router and the debug `route` field** — that invariant is why the debug surface is trustworthy and is worth more than the refactor.
- **Acceptance criteria (if it proceeds):** Adding a new overlay requires one registration entry plus its controller; every mode remains reachable and exitable; `__onyxDebug.snapshot().route` stays correct for each overlay; no double-fire on the keypress that opens a mode.
- **Effort:** L. **Dependencies:** **do not start without T1 and T2 landed** — this refactor is unsafe without a trustworthy, enforced test signal. **Branch:** `refactor/main-mode-registry` (design first)

---

## 10. Do-not-change list

Drawn from all three audits, with the adversarial audit's populated list as the backbone. Each entry states *why*, because a do-not-change list without rationale is just an obstacle.

1. **Do not split `src/engine/combat-choreography.ts`.** 3,854 lines, but cleanly banner-sectioned into small named functions, and it is the deliberate single source of shared animation state for *both* painters. Splitting would create exactly the second-choreography-engine ambiguity AGENTS.md forbids. Line count is not architectural evidence here.
2. **Do not remove the `?phaser=0` Canvas painter.** It is the tested backend and the documented rollback path.
3. **Do not force `combat-phaser-stage.ts` into the jsdom unit suite.** `AGENTS.md:160` documents the exclusion as deliberate — Phaser needs a real canvas/WebGL context. The correct verification surface is browser-based (`arena-freeze-verify.mjs`, manual checklists), not vitest.
4. **Do not add browser/Playwright/replay/visual scripts as required PR gates.** Valuable, but slower and less deterministic than unit tests. Hard-gating them without measuring their own flake rate would repeat precisely the mistake `npm test` had.
5. **Do not route presentation-layer jitter through the seeded gameplay RNG "for consistency."** All 27 `Math.random` hits in `src/engine/` are cosmetic — particle jitter, screen-shake offsets, audio noise, music selection. Making them deterministic would put cosmetic frame-to-frame variance into the replay stream for zero gameplay benefit and complicate replay-hash comparison across playback speeds.
6. **Do not convert floors 2/3 to JSON for uniformity.** This churns two shipped, save-referenced, already-validated floors for a cosmetic consistency win. The imperative `carveRoom`/`carveVertical` style is arguably *more* readable for maze topology than a tile array. Fix the documentation gap instead — which the in-flight branch already did.
7. **Do not build a generic perk-effect DSL to unify the three mechanisms.** The third mechanism has exactly 4 consumers, all needing full-party adjacency scans a numeric-field DSL cannot express without reinventing arbitrary code. Name the pattern in docs; do not abstract it.
8. **Do not codegen perk descriptions from `effect` fields.** They are hand-tuned player-facing prose. A template would be rigid boilerplate for the 52 simple perks and unable to describe the 4 aura perks at all. A one-time consistency-check script gets most of the safety without owning prose generation.
9. **Do not make `perksForCharacter`'s silent unknown-id filter throw or warn.** It is correct for legacy-save robustness and is tested (`perks.test.ts:67`). It is also *why* the "do not rename perk ids" rule is load-bearing rather than stylistic — keep enforcing the rule, not changing the filter.
10. **Do not touch `assertFloorBottomClearOfWindows`.** A fail-fast throw-on-violation guard for new combat backdrop art — exactly the right failure mode. Commend, do not modify.
11. **Do not build a second, format-specific floor validator.** `floor:validate` runs against the merged post-`mapToFloorDef` runtime list, so TS-authored and JSON-authored floors already get identical linting. The existing one generalizes correctly.
12. **Do not create a second documentation hierarchy (`docs/context/`).** AGENTS.md is the right container; it needs an index (T7), not a sibling that will drift.
13. **Do not shorten AGENTS.md's long pitfall entries.** Their length encodes root causes that cost real debugging to find. Index them; do not compress them.
14. **Do not "fix" the `data → game` type-only imports.** Five of seven are erased at build time under `verbatimModuleSyntax`; the two value imports are defensible and neither reaches presentation.
15. **Do not adopt a shared character/party test-builder abstraction now.** Only 3 ad hoc `makeChar` helpers exist, and two exist *specifically* to escape unseeded stat rolls — a downstream symptom of the RNG default, not an independent fixture problem. Now that T1 has landed, re-evaluate whether they still have a reason to exist before building anything.
16. **Do not add CODEOWNERS, multi-approval rules, or heavyweight PR templates.** No evidence of a review-bypass or ownership-confusion problem in a solo/small-team project; this would be disproportionate process.
17. **Do not touch the `?debug=1` gating pattern or the `src/debug/*.ts` pure-helper split.** It is a strong, consistently-tested architecture that should be *extended*, not replaced.
18. **Do not schedule a reflexive "split main.ts" project.** See §8's preserved disagreement — decompose only against a demonstrated overlay-authoring cost, never against line count.
19. **Do not migrate to a framework, and do not rewrite the renderer.** Nothing in the evidence supports either. The boundary discipline here is better than most framework codebases achieve.

---

## 11. Verification performed

Everything below was performed by me, in an isolated worktree, against the audited commit unless stated otherwise.

### 11.1 Claims confirmed

| Claim | Source | Check | Result |
|---|---|---|---|
| `rng.ts:61` defaults to `Math.random` | all 3 | read file | **Confirmed** verbatim |
| `vitest.config.ts` has no `setupFiles` | all 3 | read file | **Confirmed** |
| `deploy.yml` is the only workflow; no `pull_request` trigger | all 3 | `ls` + read | **Confirmed** |
| `main.ts` is 2,528 lines | all 3 | `wc -l` | **Confirmed** |
| 0 `game→engine`, 0 `data→engine` production imports | broad | grep | **Confirmed** (only hits: one test file, one comment) |
| `Math.random` absent from `game`/`data` except `rng.ts` | broad | grep | **Confirmed** (+ one comment at `perks.ts:490`) |
| AGENTS.md is 303 lines / 64,863 bytes | broad | `wc` | **Confirmed** |
| Floor editor fetches the committed export | broad | `tools/floor-editor.ts:1187` | **Confirmed** |
| `floor-registry.ts:9` merges packs over campaign floors, pack wins | broad | read `merge()` | **Confirmed** |
| Preview omits Battle Cry / Warlord / `scaleOutgoingDamage` | adversarial | read both files | **Confirmed** — resolver applies all three at `combat-actions.ts:212`/`:214` and `combat-spells.ts:60`/`:103`; neither preview function had any |
| `PARTY_SIZE` collision (4 vs. 300) | adversarial | grep 6 files + AGENTS.md | **Confirmed**, including the `AGENTS.md:173` conflation |
| `presentation` silent fallthrough at `:2964` | adversarial | read branch + both unions | **Confirmed** |
| `FLOORS = [floor2(), floor3()]` — floors 2/3 are TS-authored | adversarial | `data/floors.ts:515` | **Confirmed** |
| Third perk mechanism; 4 helpers in `combat-shared.ts` | adversarial | grep + read `data/perks.ts:307-316` | **Confirmed** at `:326`, `:343`, `:363`, `:382` |
| `partySlot()` clamps via `Math.min`; 4 hand-tuned slots | adversarial | read `combat-scene-math.ts:308-313`, `:459-461` | **Confirmed** |
| `formationSlot <= 1` at 5 sites in 3 files | adversarial | grep | **Confirmed** exactly |
| `maybeTriggerEncounter` duplicates `buildDebugCombat` | adversarial | read both | **Confirmed**, including the production-only treasure guard at `main.ts:551-553` |
| `debug-choreography.test.ts` has 0 `expect()` calls | testing | `grep -c` | **Confirmed** |
| `exitDebugCombat` silently no-ops | testing | `main.ts:870-876` | **Confirmed** |
| `groundPlaneProbe` uses `as unknown as` | testing | `main.ts:2485` | **Confirmed** |
| `captureFailureBundle` lacks SHA/seed/renderer-mode | testing | read `lib.mjs:134-169` | **Confirmed** |
| `features.ts` gas clamp vs. `features.test.ts:302` assertion | testing | read both | **Confirmed** — clamp is `Math.max(1, c.hp - dmg)`; the test asserts unclamped `maxHp - 12` |
| `AGENT-READING-LIST.md:5` contradicts `:105` | testing | read both | **Confirmed** |
| `FLOOR-AUTHORING.md:134-140` concedes the CI gap | testing | read | **Confirmed** verbatim |
| No `check` script in `package.json` | testing | read | **Confirmed** |

### 11.2 Claims revised, corrected, or rejected

1. **REJECTED — "Floor 1 is dual-defined in `src/data/floors.ts` and `src/content/floors/floor-1.json`."** *(Broad audit §3.2, scorecard category 2, and its Group-1 item 5 / ticket T5.)* `src/data/floors.ts:515` reads `export const FLOORS: readonly FloorDef[] = [floor2(), floor3()];` and the file defines only `floor2()` and `floor3()`. **There is no floor-1 definition in `FLOORS` to conflict with the pack.** The pack-override mechanism the broad audit describes is real, but floor 1 does not exercise it. Floor 1 existed in **two** places (live pack + stale export), not three. The claim was *plausible* because it used to be true: `git log -S "function floor1" -- src/data/floors.ts` shows commit `a5a8eb7` ("feat(floor-1): replace tutorial crypt with Proving Depths layout") removed the TS definition when the JSON pack landed. The broad auditor described a state that had already been cleaned up. **Action taken: the broad audit's T5 is dropped entirely** — it would have sent an implementer hunting for a dead definition that does not exist — and scorecard category 2's evidence is corrected in §3. The score is unchanged, because the drift that justified the deduction is real and, per the next item, worse than reported.

2. **CORRECTED AND STRENGTHENED — "Floors 4/5 export differences are key-ordering only."** *(Broad audit §3.2, self-labelled medium confidence, inferred from identical serialized lengths.)* I ran a normalized recursive deep-diff (sorted keys, order-insensitive at the object level). Floors 4 and 5 differ in `treasures` **semantically**: the exports carry `runeblade+3`, `mythril-plate+3`, `bow+3`, `voidblade+4`, `dragonscale-mail+4` where the live packs ship the `+2` variants. The serialized lengths matched because `+2` and `+3` are the same string length — the inference method could not have detected this. **All three JSON-authored floors had drifted, in loot balance as well as geometry.** I also found the broad audit's "differ in `treasures` and `npcs`" to be a slight over-claim: only `treasures` differs. Action: T3's problem statement rewritten with the verified diff.

3. **NEW FINDING — not reported by any of the three audits.** `src/content/floors/index.ts:7` states: `floor-1.json ("The Proving Depths") replaces the hand-carved tutorial crypt.` The pack that file actually loads is **"The Hall of Five Wounds."** This is the same drift class as the stale export, sitting in the module that performs the load, and it is *still present* on the most advanced branch. Added to T8.

4. **DOWNGRADED — scorecard category 18 (documentation drift resistance, scored 4).** I found three simultaneous live drift instances (stale export, self-contradicting reading-list banner, wrong floor name in `index.ts`). The *correction machinery* the score rewards is genuinely excellent, but the *outcome* is mixed. I record the dissent in §3 rather than silently changing another auditor's score.

5. **RECONCILED, not a conflict — test-file counts.** Broad says "37 files construct characters, 34 roll random"; testing says "26 call `createCharacter`, only 4 seed." I reproduced all four numbers: 37 match `createDefaultParty` OR `createCharacter`; 26 match `createCharacter` alone; 4 seed. Different greps, both correct.

6. **RECONCILED, not a conflict — `Math.random` counts.** Broad says it appears nowhere in `game`/`data` except `rng.ts`; adversarial says "all 27 production hits are cosmetic." Both are right — the adversarial grep spanned `src/engine` too, where the cosmetic hits live.

7. **NOTED — `main.ts` import count.** The shared baseline says 65; I count 67 distinct specifiers. Counting-method difference; the substantive point (≈3× the next file) is unaffected.

8. **NOTED — arithmetic inconsistency in the broad audit.** §4 totals 69/100; §11 says 68. The categories sum to 69.

### 11.3 Revalidation against current `main`

I verified each claimed fix by reading the file at `ed1704e` (origin/main) or `6dee164` (unmerged `chore/llm-drift-guards`) rather than trusting commit subjects: `vitest-setup.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `package.json`, the `combat-preview.ts` diff, the `features.test.ts` diff, `combat-choreography.ts`'s `PARTY_SPRITE_SIZE`, `dependency-guards.test.ts`'s existence, the `AGENTS.md`/`FLOOR-AUTHORING.md` additions, the `exitDebugCombat` throw, and the continued absence of `commitSha`, the reading-list banner fix, the `groundPlaneProbe` retyping, and the `index.ts` comment fix. Results are in §2.3.

### 11.4 Commands run

```
git status --short / git branch --show-current / git rev-parse HEAD / git rev-parse origin/main
git worktree list; git worktree add <isolated> -b audit/llm-maintainability-synthesis-2 be6131c…
git log/diff/show against be6131c, ed1704e, 6dee164 (read-only)
grep/wc/sed over src/, docs/, scripts/, tools/, .github/
python3 normalized deep-diff of src/content/floors/*.json vs tools/floor-data/*.json (read-only)
npm ci; npm test; npm run build; npm run floor:validate      (final validation)
```

**Deliberately not run:** `floor:export-all`, `sprite-preview:generate`, `generate:combat-bg`, `tileset:gallery`, `visual:floors`, `replay`, `replay:record` — all write into the tree, and this audit must modify no file but this report.

---

## 12. Confidence and limitations

**Directly observed and verified by execution:** the baseline commands; the RNG default and the absence of `setupFiles`; the CI trigger gap; the floor-export drift (deep-diffed, not inferred); the import graph and the two zero-counts; AGENTS.md's size; the `PARTY_SIZE` collision; the `presentation` fallthrough; the preview parity gap; the formation-slot clamp; the `formationSlot <= 1` sites; the encounter-build duplication; `debug-choreography.test.ts`'s zero assertions; `exitDebugCombat`'s silent return; `captureFailureBundle`'s missing fields; and every "already implemented" claim in §2.3.

**Built:** `npm run build` — both TypeScript projects and the Vite bundle. **Unit-tested:** the full suite (12 runs by the broad audit, 2 by the testing audit, 1 by me). **Floor-validated:** all 5 floors.

**Statically inspected, not executed:** `main.ts`'s structure; `combat-choreography.ts`'s sectioning; `shell.ts` and `floor-registry.ts` module-level effects; save versioning; the test-portfolio variety.

**NOT VERIFIED — browser-tested or visually reviewed.** **No browser or visual testing was performed by any of the three audits or by this synthesis.** Nobody launched the game, ran a Playwright playtest, captured a screenshot, or reviewed rendered output. Scorecard categories 10 and 20 are scored on *infrastructure and enforcement*, not observed correctness. **No claim in this report is evidence of visual correctness**, and passing tests must not be read as such.

**Inferred rather than proven:**
- That `features.test.ts:391` and `:411` are additional live flake sources — the mechanism is identical to `:302` but only `:302` was measured.
- The suite-level flake rate. 1.87% is measured for one assertion; the true rate is that plus those two plus the separate, unreproduced `combat-turns.test.ts` order-dependent flake.
- That the water-floor case study generalizes to "the next material" — one data point.
- Sizing of the two Walkthrough-H paths — neither was implemented.
- Scorecard categories 11, 12, and 18 rest partly on judgement about authoring workflows nobody exercised end-to-end.

**Low confidence / inference only:** all branch-protection recommendations. GitHub repository settings are not inspectable from a git worktree; those recommendations derive from file structure and commit history alone and were never checked against actual configuration.

**Not inspected deeply by anyone:** the audio engine's synthesis internals (`audio.ts`, 1,131 lines); the Phaser painter's pooling and depth-sort machinery (`combat-phaser-stage.ts`, 2,480 lines); `town-ui.ts` (1,706 lines) and the shop/economy paths; `src/vfx-vignette.ts`; the corridor-projection math in `renderer.ts`/`render-math.ts`; most of the ~99 files under `scripts/`; the `src/assets/` tileset pipeline; and **combat math correctness** — the audits verified the module boundaries around the formulas, not the formulas themselves.

**Scoring uncertainty:** 69/100 is a calibrated summary, not a measurement. Individual categories carry roughly ±1 of judgement. The aggregate is most useful for its *shape* — authoring discipline mostly in the 4s, enforcement discipline in the 1s and 2s — not its precise value.

**Time-sensitivity — the most important limitation.** `origin/main` moved from `be6131c` to `ed1704e` during the audit window, and a further branch carries more. This report describes `be6131c` because that is what all three source audits examined and what the scorecard, baseline, and walkthroughs are coherent against. **§2.3 is the bridge to reality; read it before acting on anything here.**

---

## 13. Answers to the 20 audit questions

Short answers, each grounded in a finding above.

**1. How easy is it for a new advanced LLM to make a safe change today?** Moderately easy, and materially easier than at the audited commit. Navigation is genuinely good (co-located tests, an excellent AGENTS.md, a "where do I make this change?" table), and the two things that most undermined confidence — a flaky suite and no PR gate — are now fixed on `main` (§2.3). The residual obstacle is context cost: the designated first read cannot be loaded in one pass (§5, T7).

**2. What currently consumes the most unnecessary context?** AGENTS.md — 303 lines, 64,863 bytes, ~30K tokens, unloadable selectively, and mandatory. Its *content* is not the problem and must not be cut; the absence of an index is (T7). Second: `main.ts` sitting on most change paths (§5).

**3. What are the five most likely sources of plausible-but-wrong agent changes?** (i) The `PARTY_SIZE` collision, which makes the render layer look party-size-parametrized when it is not (Trap 2). (ii) The damage preview looking like a faithful subset of the resolver when it omitted three multipliers (Trap 1). (iii) Following AGENTS.md's two-mechanism perk procedure literally and shipping a no-op aura perk (Trap 4). (iv) Adding a `presentation` value and getting a silent generic animation (Trap 3). (v) Opening floor 2 or 3 in the JSON editor that cannot load them (Trap 5).

**4. Which public behaviors lack direct regression coverage?** The default Phaser combat painter (untested by policy, §10 item 3); anything `scripts/debug-choreography.test.ts` nominally covers, since it has zero assertions (§3, category 8); every `presentation` value's choreography branch (T10); `exitDebugCombat` and `groundPlaneProbe` (§7 of the testing audit); and all visual correctness everywhere (§12).

**5. Which systems are too dependent on `main.ts`?** Mode transitions, controller lifecycle, and the single `GameState` — which means town, party creation, prologue, ending, title, encounters, combat lifecycle, perk overlay, camp, movement, arena, save menu, spell menu, NPC panel, and automap all route through it. But see §8's preserved disagreement: the *testable* parts have already been extracted, so this is a merge-conflict and context problem, not an untested-logic problem.

**6. Which extension paths require editing too many files?** Adding a mode/overlay (five coordinated sites in `main.ts`, T12). Adding a coordinated attack presentation (three files, two of them nominally rules/content, with a silent failure if you miss the third — Trap 3). Adding a controllable 5th party member (formation geometry, the front/back magic number at five sites, and CSS — Walkthrough H).

**7. Which runtime contracts exist only as comments or convention?** That every `CombatEvent.presentation` literal has a choreography branch (Trap 3). That `combat-preview.ts` mirrors the resolver's deterministic multipliers (Trap 1 — was a comment, now enforced by tests). The rules/presentation import boundary (was convention; now a test on the in-flight branch, T11). That committed floor exports match their sources (was nothing; now `floor:export-check`). That `currentRouteFlags()` remains the single builder for both the router and the debug `route`.

**8. Which fallbacks hide missing content or broken configuration?** Dangerous: unrecognized `presentation` → generic cast, with no log line (Trap 3). Mildly weak: an NPC's `combatEnemyIds` resolving to an enemy with no sprite-manifest entry — the validator checked data-to-data but not data-to-asset. Healthy and to be preserved: missing enemy sprite → documented procedural placeholder; unknown perk id in a legacy save → silent filter (§10 item 9); sample-load failure → now observable via `readiness().failed`.

**9. Which tasks remain difficult to reproduce deterministically?** Full input-transcript replay — explicitly not implemented, and stated as such independently by `AGENTS.md:194` and `README.md`. Transcripts are forensic evidence; nothing can feed one back in (Walkthrough F, Group 3 item 1). Unit-test reproduction *was* the weak point and is now fixed. Anything visual remains irreproducible by definition here.

**10. Which validation steps are manual but should be automated?** At the audited commit: the entire `npm test && npm run build && npm run floor:validate` sequence, which `docs/FLOOR-AUTHORING.md:134-140` explicitly conceded was manual — now automated via `npm run check` in CI. Still manual and appropriately so: the rendering, combat, and boss verification checklists (visual correctness cannot be automated cheaply). Candidates for *scheduled* rather than required automation: `arena-freeze-verify.mjs`, `floor-editor-smoke.mjs`, `scripts/playtests/*.mjs`.

**11. Which checks should be required on every pull request?** Exactly what `npm run check` now runs: tests typecheck, build (both tsconfig projects), unit tests, floor validation, and floor export drift. Fast (~15s) and deterministic. **Nothing browser-based should be required** (§10 item 4).

**12. Where would subsystem-level test builders provide real value?** Nowhere yet — and this is a deliberate negative answer. Only 3 ad hoc `makeChar` helpers exist, and two existed *specifically* to escape unseeded stat rolls. Now that T1 has landed, that motivation has largely evaporated. Re-evaluate whether they still have a non-RNG reason to exist before building an abstraction (§10 item 15).

**13. Would dependency-boundary enforcement help?** Yes, and it is the cleanest available example of converting an observed property into an enforced one: the boundary is *currently perfect*, so the test locks in a real invariant rather than aspiring to one, at ~30 lines with no new dependency (T11). Already implemented on the in-flight branch.

**14. Would splitting any large file materially reduce risk?** **No.** `combat-choreography.ts` (3,854 lines) must stay whole — it is the single shared animation-state source for both painters, and splitting it creates exactly the ambiguity AGENTS.md forbids (§10 item 1). `main.ts` is a genuine hotspot but for fan-out and mandatory-touch, not size, and its testable parts are already extracted (§8's disagreement). Line count is not architectural evidence in this repository.

**15. Which apparent imperfections should deliberately remain untouched?** The floor 2/3 imperative authoring style; the hardcoded-id aura perk pattern at 4 consumers; `perksForCharacter`'s silent unknown-id filter; cosmetic `Math.random` in the engine; the Phaser painter's test exclusion; the `data → game` type-only imports; and `main.ts`'s remaining size. Full rationale in §10.

**16. What is the single highest-return next maintainability investment?** At the audited commit it was seeding the gameplay RNG in a Vitest setup file — a handful of lines converting the most-used quality signal from "usually green" to "green means green," and a precondition for CI being worth anything. **That is now done.** The highest-return *remaining* investment is the AGENTS.md subsystem navigation index (T7): it addresses the largest per-task context cost for every agent on every task, costs ~20 lines, removes no content, and adds no new file to drift.

**17. What should be completed before implementing temporary fifth-party companions?** Read Walkthrough H first — it *is* the pre-work. Then decide which thing you actually want: an auto-played companion should extend `SummonedAlly`, which already has its own layout and turn resolution and is a small contained change. A *controllable* 5th member requires budgeting explicitly for `PARTY_FORMATION_SLOTS` redesign, the `formationSlot <= 1` split at five sites (which hardcodes an even 2/2 shape, so the constant cannot simply be changed), and the party-strip CSS grid. Land the `PARTY_SPRITE_SIZE` rename (T6) first so the audit of "everywhere `PARTY_SIZE` is used" returns the truth, and convert `partySlot()`'s silent clamp into a dev-mode assertion (Group 2 item 4) so an off-by-one fails loudly instead of rendering an overlap.

**18. What should be completed before adding more floors?** Mostly done: the export drift check (T3) and the floor-format documentation (T6's branch) both landed or are in flight. Still worth doing first: fix `src/content/floors/index.ts:7`'s wrong floor name (T8), since that is the file an author edits to register a new pack. And internalize the constraint `docs/FLOOR-AUTHORING.md` already states — `FloorDef.encounterTable` is dead, and a new non-campaign floor id gets **zero** random encounters unless an `encounterZones` entry sets `tableFloorId`.

**19. What should be completed before adding many more enemy and NPC assets?** The integrity net is already strong and largely sufficient: encounter-table ids, `abilityIds`, and on-disk PNG dimensions are all asserted, and PR #23 added fallback warnings and procedural opt-outs. Land the NPC `combatEnemyIds` → sprite-manifest warning (on the in-flight branch). Then accept the honest limit: nothing verifies a sprite *renders correctly* — anchors, foot offsets, choreography timing — short of a manual Arena pass. Budget for that visual review; do not expect the suite to substitute for it.

**20. What will make the next 100 commits safer than the previous 100?** Four things, in order. (i) The suite is now deterministic, so a red run means a real regression — the single largest change in signal quality. (ii) PRs are now gated on build, typecheck, tests, floor validation, and export drift, so the guardrails are enforced rather than advisory. (iii) The dependency-boundary test converts the repository's best structural property from *observed* to *enforced* — merge it. (iv) Closing the remaining silent-failure paths (`presentation` coverage, T10) and making evidence self-describing (SHA/seed/renderer-mode, T9), so that when something does break, the bundle says which commit, which seed, and which renderer produced it.
