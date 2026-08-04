# OnyxLabyrinth — LLM Maintainability Audit Synthesis

> Status: Authoritative synthesis of four independent LLM maintainability audits.
> Audited commit: `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415` (HEAD == `origin/main` at audit time).
> Revalidate every recommendation against current `main` before implementation.
> Synthesis date: 2026-08-04.

## Source audits

| Tag | Report | Scope |
|-----|--------|-------|
| **BROAD** | `LLM-MAINTAINABILITY-AUDIT-BROAD.md` | Topology, 20-category scorecard, documentation/context-efficiency, prioritization |
| **ADV** | `LLM-MAINTAINABILITY-AUDIT-ADVERSARIAL.md` | Adversarial architecture: hidden coupling, silent fallbacks, LLM traps, walkthroughs |
| **TDX** | `LLM-MAINTAINABILITY-AUDIT-TESTING-DX.md` | Test suite, CI, debug surface, developer experience, reproducibility |
| **GLM** | `LLM-MAINTAINABILITY-AUDIT-GLM.md` | LLM-native maintainability scorecard, friction points, walkthroughs, traps |

All four audits were run against the same commit in isolated worktrees. The synthesis worktree
itself (`audit/llm-maintainability-synthesis`) was created from that commit, and every claim
below was re-verified against the source tree before inclusion.

---

## 1. Executive summary

OnyxLabyrinth is an unusually disciplined hand-rolled TypeScript game codebase. Its layer
boundaries are mechanically clean (zero production `src/game/**` → `src/engine/**` imports,
zero `src/data/**` → `src/engine/**` imports, `Math.random` absent from the rules/content
tree except inside `src/game/rng.ts`), its debug surface (`src/debug/*.ts`) is a deliberately
designed, typed, and unit-tested pattern, and `AGENTS.md` is a best-in-class LLM operating
manual with a file map, change-location table, and explicit guardrails.

Against that, a small set of concrete defects dominate the findings, and they compound:

1. **The test suite is intermittently red.** `src/game/rng.ts:61` defaults the global gameplay
   RNG to `Math.random`, `vitest.config.ts` declares no `setupFiles`, and 34 test files
   construct characters with real random stat rolls. The failure was reproduced independently
   by BROAD, TDX, and ADV at a measured rate of ≥1.87% per run. This corrodes the only
   automated quality signal that exists.
2. **The floor editor loads a stale committed export of a deleted floor.**
   `public/tools/floor-data/floor-1.json` describes "The Proving Depths" (25×32) while the
   live floor 1 is "The Hall of Five Wounds" (24×28) in `src/content/floors/floor-1.json`.
   Nothing checks the export against its source.
3. **CI enforces almost nothing.** `.github/workflows/deploy.yml` is the only workflow,
   triggers only on push to `main`, and runs `npm ci` + `npm run build`. There is no
   `pull_request` trigger, no `npm test`, no `npm run floor:validate`, and GitHub branch
   protection returns 404 (GLM verified via API).
4. **The damage preview silently omits three deterministic damage modifiers** (Battle Cry,
   Warlord aura, Shrink/Giant Strength scaling) that the actual resolver applies. Existing
   parity tests only exercise the no-buff baseline, so they cannot detect this drift.
5. **`main.ts` is a 2,528-line composition root** with 46 mutable module-level variables
   and ~50 top-level functions spanning most subsystems — the highest-conflict file for
   multi-agent work and the hardest file to unit-test.

Together, items 1–3 mean a red `main` can be deployed without anyone noticing, and the one
automated signal that does exist has a background failure rate that trains developers and
agents to re-run rather than investigate. Item 4 is a live UI-accuracy gap conditional on
specific buffs being active. Item 5 is a structural bottleneck, not a defect.

**Scorecard reconciliation.** BROAD scored 69/100; GLM scored 67/100. The 2-point delta is
almost entirely explained by GLM scoring `Asset-pipeline safety` at 2 (BROAD did not score
this category separately) and `Test fidelity` at 3 vs. BROAD's implicit 4 for the test
suite's breadth. Both audits agree on the bimodal distribution: diagnostics/debug tooling
score 4–5, CI enforcement scores 1. The synthesis scorecard adopts BROAD's 69 as the
headline figure, with GLM's asset-pipeline finding folded in as an additional weak area.

**Single highest-return change (all four audits agree):** seed the gameplay RNG in a Vitest
setup file. A handful of lines converts the suite from "usually green" to deterministic and
is a precondition for CI enforcement being worth anything.

---

## 2. Verified repository baseline

Reused from BROAD's baseline run; re-verified by ADV, TDX, and GLM in their respective
worktrees. All four audits independently confirmed the same environment and command results.

| Command | Result | Notes |
|---|---|---|
| `npm ci` | PASS | 150 packages, 3 high-severity dev-only advisories (playwright, postcss, undici) |
| `npm test` (run 1) | **FAIL** | `src/game/features.test.ts:302` — `expected 1 to be +0` |
| `npm test` (runs 2–12) | PASS ×11 | 1934/1934 each run |
| `npm run build` | PASS | Zero TypeScript errors on both `tsconfig.json` and `tsconfig.tools.json` |
| `npm run floor:validate` | PASS | All 5 floors `OK (no issues)` |
| `git diff --check` | PASS | Clean |

**Measured flake rate:** ≥1.87% per run for the `features.test.ts:302` assertion alone
(50,000 samples of the precise failing condition, BROAD). At least two further assertions
in the same file (`:391`, `:411`) share the mechanism. A second, unrelated flake is recorded
in `docs/AGENT-READING-LIST.md:7-10` (order-dependent ice-shards test in
`combat-turns.test.ts`); TDX traced this to commit `e63619a` and found the doc's hedge is
partially stale.

**Repository size:** 111 production `.ts` files, 93 test files under `src/`, 95 test files
executed by `npm test` (includes `scripts/**/*.test.ts`), 1934 tests, 140 docs files, 99
scripts, 15 tools files, ~135,905 total lines.

---

## 3. Consolidated finding inventory

Each finding is tagged with its source audits, confidence, and severity. Findings are
grouped by theme. Where audits disagreed, the synthesis resolves the conflict explicitly.

### 3.1 Test determinism

#### F1 — Unseeded gameplay RNG in test runner
**Sources:** BROAD §3.1, ADV §2, TDX §3 Finding 1–2, GLM §5 (implicit via scorecard)
**Confidence:** High (directly observed, reproduced 3× across audits)
**Severity:** High — corrodes the only automated quality signal

`src/game/rng.ts:61` defaults `gameplayRng` to `Math.random`.
`vitest.config.ts` declares no `setupFiles`. 34 test files construct characters via
`createCharacter`/`createDefaultParty` and roll real random stats on every run. Only 4
files (`rng-wiring.test.ts`, `rng.test.ts`, `npc-ui.test.ts`, `deterministic-replay.test.ts`)
call `setGameplayRng`/`createSeededRng`.

The team has worked around this per-call-site at least three times (ice-shards pin in
`e63619a`, single-construction-then-reuse in `deterministic-replay.test.ts`, production-path
wiring in `1cdb084`) without fixing the shared root cause. `1cdb084` deliberately left the
default unseeded for normal play but did not add a parallel default seed for the test runner.

**Synthesis resolution:** All four audits independently identified this as the highest-return
fix. No conflicts. The fix design is TDX's (T1): a `setupFiles` entry with `beforeEach`
reseed (per-file setup alone is insufficient — `beforeEach` is required to close within-file
order-dependence). Acceptance is "green at the chosen seed AND demonstrably not seed-dependent
across ≥3 different seeds," not "green once."

#### F2 — `features.test.ts:302` (and `:391`, `:411`) flaky assertions
**Sources:** BROAD §3.1, TDX §3, TDX T2
**Confidence:** High (reproduced)
**Severity:** Medium (specific instance of F1)

The gas-trap assertion `expect(state.party[1].hp).toBe(state.party[1].maxHp - 12)` fails when
a randomly-rolled `maxHp <= 12` because the production clamp at `features.ts:820`
(`c.hp = Math.max(1, c.hp - dmg)`) correctly floors at 1 HP. TDX's T2 pins
`state.party[1].maxHp = 30` before the test, following the `e63619a` precedent, rather than
rewriting the assertion to `Math.max(1, ...)` (which would collapse `party[1]`'s coverage
into `party[0]`'s clamp assertion).

**Synthesis resolution:** F1 and F2 are complementary. F2 can land independently of and
before F1. F1 makes the suite deterministic; F2 makes this specific test robust regardless
of seed.

#### F3 — `scripts/debug-choreography.test.ts` has zero `expect()` calls
**Sources:** TDX §3 Finding 4
**Confidence:** High (directly observed)
**Severity:** Low (informational — counter-example to "test count = test quality")

This file matches the vitest include glob and runs as part of `npm test` (contributing 2 of
the 1934 counted tests) but contains zero `expect()` calls. It is a `console.log` trace
harness per `AGENTS.md:178`. It would silently accept a wrong-but-non-throwing choreography
change. No action required beyond awareness.

### 3.2 CI and deployment

#### F4 — No PR-triggered CI; deploy runs build only
**Sources:** BROAD §2, ADV §2, TDX §5, GLM §5.1, GLM scorecard category 14 (score 1)
**Confidence:** High (directly observed by all four audits)
**Severity:** High — nothing prevents broken code from reaching `main`

`.github/workflows/deploy.yml` is the only workflow. Triggers: `push: branches: [main]` +
`workflow_dispatch`. Steps: `npm ci` + `npm run build` + upload `dist` + deploy to Pages.
No `pull_request` trigger. No `npm test`. No `npm run floor:validate`. GitHub branch
protection returns 404 (GLM verified via API).

**Synthesis resolution:** All four audits agree. TDX's design (T3) is adopted: a new
`.github/workflows/ci.yml` with `on: pull_request`, separate `concurrency` group from
`deploy.yml`'s `pages` group. **Pre-F1, the `npm test` step must run with
`continue-on-error: true`** — a plain `run: npm test` would fail its job on every random
flake and take `build`/`floor:validate` down with it. Once F1 lands, drop `continue-on-error`
and fold `npm test` into the required status check. GLM's recommendation to also add
`floor:validate` to the deploy workflow (GLM 2.8) is adopted as a secondary hardening step.

#### F5 — No `npm run check` wrapper
**Sources:** TDX T6, GLM 1.5
**Confidence:** High
**Severity:** Low (DX friction)

The exact sequence `npm test && npm run build && npm run floor:validate` is written out by
hand in two separate docs (`README.md:41-43`, `docs/FLOOR-AUTHORING.md:136-140`), and
`README.md:162`'s Git workflow section omits `floor:validate`. Both TDX and GLM recommend
adding `"check": "npm run build && npm test && npm run floor:validate"` to `package.json`.

**Synthesis resolution:** Adopted. Both audits agree on the exact script. TDX's ordering
(`build` first, so a TS error fails fast before the slower test step) is preferred over
GLM's (`test` first) for CI ergonomics, though the difference is cosmetic.

### 3.3 Floor data and authoring

#### F6 — Stale floor-1 export in `public/tools/floor-data/`
**Sources:** BROAD §3.2
**Confidence:** High (directly observed, semantic diff)
**Severity:** Medium — primary content-authoring surface is silently wrong

Three on-disk representations of floor 1 exist:

| Path | Name | Dimensions | Role |
|---|---|---|---|
| `src/data/floors.ts` (`FLOORS`) | — | — | campaign definition, overridden at runtime |
| `src/content/floors/floor-1.json` | "The Hall of Five Wounds" | 24 × 28 | **the live floor** (JSON pack) |
| `tools/floor-data/floor-1.json` + `public/tools/floor-data/floor-1.json` | "The Proving Depths" | 25 × 32 | stale derived export |

The floor editor fetches the export (`tools/floor-editor.ts:1187`), not the source. The drift
is not cosmetic: floor 1 differs in `name`, `width`, `height`, `startX`, `startY`, `grid`,
`encounterZones`, `mapSprites`, `teleporters`, `lockedDoors`, `treasures`, `npcs`, `events`,
and the export is missing `waters` and `tilesetZones` entirely. Floors 4 and 5 also differ
but only in `treasures`/`npcs` key ordering (medium confidence — BROAD compared lengths and
content strings, not a normalized deep diff).

**Synthesis resolution:** BROAD's T2: regenerate `tools/floor-data/` +
`public/tools/floor-data/` via `npm run floor:export-all` and add a drift check. BROAD's T5
(resolve the floor-1 dual definition: decide whether campaign floor 1 lives in
`src/data/floors.ts` or `src/content/floors/floor-1.json` and delete the loser) is adopted as
a follow-up. No other audit independently surfaced this; BROAD's direct semantic diff is the
authoritative evidence.

#### F7 — Dual floor authoring format (TS imperative vs. JSON declarative)
**Sources:** ADV Trap 3
**Confidence:** High (directly observed)
**Severity:** Low (workflow confusion, not a defect)

Floors 2 and 3 are hand-coded imperative TS grid-carving functions in `src/data/floors.ts`.
Floors 1, 4, and 5 are declarative JSON packs in `src/content/floors/`. `docs/FLOOR-AUTHORING.md`
describes only the JSON format with no caveat. An agent told to "add a room to Floor 2" would
open the floor editor expecting to load/export it like the other three, but floor 2/3 have no
JSON source file.

`npm run floor:validate` validates the merged runtime `FloorDef` list post-`mapToFloorDef`,
so both authoring paths get identical structural linting — the gap is the editing workflow
mismatch, not validation.

**Synthesis resolution:** ADV's T3: one paragraph in `docs/FLOOR-AUTHORING.md` naming which
floors use which pipeline. Do not convert floor 2/3 to JSON (ADV Group 4 item 7: stable,
shouldn't be churned for uniformity alone).

#### F8 — Deprecated `FloorDef.encounterTable` has no validation warning
**Sources:** GLM 2.4
**Confidence:** High
**Severity:** Low

`AGENTS.md` states `FloorDef.encounterTable` is deprecated/ignored, but the field still
exists in the type and `floor-validate.ts` emits no warning when it is populated. An agent
can populate it and encounters never trigger.

**Synthesis resolution:** GLM's 2.4: `floor-validate.ts` should emit a warning when
`encounterTable` is non-empty, pointing to `ENCOUNTER_TABLES[floorId]`. Leave the field
itself for backward compat.

### 3.4 Combat preview / resolver drift

#### F9 — Damage preview omits three deterministic damage modifiers
**Sources:** ADV Trap 1, GLM §5.4, GLM Trap 2
**Confidence:** High (directly observed by reading both files)
**Severity:** Medium — live UI-accuracy gap conditional on specific buffs

`src/game/combat-preview.ts` (`previewPhysicalDamageAtVariance`, `:28-65`) computes
`base * variance * meleeDamageMultiplier + meleeBonusDamage`, then `tagDamageMultiplier`,
then AC reduction, then `highDefense`/`resistPhysical`. It never calls
`warlordDamageMultiplier`, never reads `s.damageBuffs`, never calls `scaleOutgoingDamage`.

`src/game/combat-actions.ts` (`resolveAttack`, `:187-266`) applies all three:
`s.damageBuffs[actor.id]` (Battle Cry, ~`:200`), `warlordDamageMultiplier(s, actor)`
(~`:206`), `scaleOutgoingDamage(damage, actor)` for Shrink/Giant Strength (~`:208`).
`combat-spells.ts` (`applySpell`, `:33-104`) independently applies `warlordDamageMultiplier`
(`:60`) and `scaleOutgoingDamage` (`:103`); `combat-preview.ts`'s `previewSpellDamage`
(`:96-157`) has neither.

All three omitted modifiers are plain, deterministic, non-reactive functions
(`combat-shared.ts:140-149`, `:326-336`) — neither crits nor `dispatchHook` calls, so none
are covered by the preview module's own stated exclusion list ("no crits, no reactive hooks").

Existing parity tests (`action-preview.test.ts:107`, `:190`) build their `CombatState` from
`createDefaultParty()` with `stats.luk = 0` and zero perks/buffs/statuses. They prove parity
only on the no-buff branch and would keep passing if a fourth deterministic multiplier were
added to `resolveAttack` without touching `combat-preview.ts`.

**Synthesis resolution:** ADV and GLM agree on the finding. ADV's T1 (extend parity tests to
cover Battle Cry/Warlord/status-scaled damage; the failing assertion is the bug report) is
adopted as the primary fix. GLM's 1.2 (parameterized drift test across melee/spell/technique)
is adopted as the durable guardrail. The fix sequence is: (1) write the failing parity tests
to confirm the drift, (2) decide whether to bring preview into sync or document the exclusion
as intentional, (3) land the parameterized drift test as the regression guard.

**Conflict note:** ADV frames this as "preview is *already* missing coverage — check before
you add more," while GLM frames it as "an agent changing damage formulas can forget the
preview." Both framings are correct and complementary; the synthesis adopts ADV's framing
because it identifies a live bug, not just a future risk.

### 3.5 Naming and duplication

#### F10 — `PARTY_SIZE` names two unrelated constants
**Sources:** ADV Trap 2
**Confidence:** High (directly observed)
**Severity:** Low (confusion, not a defect — TypeScript module scoping prevents a compile-time collision)

`src/game/party.ts:34-35`: `PARTY_SIZE = 4` (party headcount).
`src/engine/combat-choreography.ts:96-98`: `PARTY_SIZE = 300` (sprite draw size at scale 1.0).
Both painters (`combat-scene.ts:26-29`, `combat-phaser-stage.ts:16-38`) import the 300px
meaning. `debug/invariants.ts:10,30-31` imports the headcount meaning. `AGENTS.md:173`
conflates the two in prose, inside the exact section discussing the files that use the 300px
meaning.

**Synthesis resolution:** ADV's T2: rename `combat-choreography.ts`'s constant to
`PARTY_SPRITE_SIZE` and fix the `AGENTS.md:173` wording. Do not rename `game/party.ts`'s
`PARTY_SIZE` (more fundamental, more widely referenced). Mechanical rename; `npm run build`
catches any missed import site.

#### F11 — `formationSlot <= 1` front/back row logic duplicated across five call sites
**Sources:** ADV Trap 5
**Confidence:** High (directly observed)
**Severity:** Low (today) / Medium (future 5th-member work)

The `formationSlot <= 1` magic number for front/back row determination is duplicated across
`party.ts`, `combat-shared.ts`, `combat-equipment.ts` (five call sites in three files). It
hardcodes both the row split point and an even 2-front/2-back shape. `partySlot(index)`
(`combat-scene-math.ts:459-461`) clamps via `Math.min(index, PARTY_FORMATION_SLOTS.length - 1)`
— a 5th party member would silently render at the exact same screen position as the 4th,
not error.

**Synthesis resolution:** No immediate action (party size is fixed and enforced elsewhere).
ADV's Group 2 item 6: change `partySlot()`'s silent clamp to a dev-mode assertion
(throw when `NODE_ENV !== "production"` and `index >= PARTY_FORMATION_SLOTS.length`) so any
future off-by-one fails loudly. Budget for `PARTY_FORMATION_SLOTS` redesign and the
`formationSlot <= 1` split if a 5th playable party member is ever scoped (ADV Walkthrough H).

#### F12 — `buildDebugCombat` duplicated encounter-building logic
**Sources:** ADV Trap 6
**Confidence:** High (directly observed)
**Severity:** Low (zero current drift; intentional divergence today)

`buildDebugCombat` (`src/debug/start-combat.ts`) duplicated rather than reused the production
encounter-building logic in `main.ts:542-578` (`maybeTriggerEncounter`). The two copies can
now drift independently.

**Synthesis resolution:** ADV's T5: share the encounter-build core when either is next
touched. Not worth a standalone refactor PR today given zero current drift.

#### F13 — Unrecognized `CombatEvent.presentation` value silently falls through
**Sources:** ADV Trap 7, ADV Walkthrough E
**Confidence:** High (directly observed)
**Severity:** Low (one `presentation` value shipped in over a year)

An unrecognized/future `CombatEvent.presentation` value silently falls through to the generic
cast animation in `combat-choreography.ts` with no error and no test coverage forcing every
presentation value to have a matching choreography branch. The `presentation` union is
declared independently in `data/enemy-abilities.ts:84` and `combat-types.ts`, so adding a
new literal to one and forgetting the other is a silent no-op.

**Synthesis resolution:** ADV's T6: add a presentation-coverage regression test specifically
the next time a second coordinated-attack `presentation` value is added, per `AGENTS.md:283`'s
own stated extension procedure. Not urgent (precautionary).

### 3.6 Perk implementation mechanisms

#### F14 — Third (undocumented) perk-effect mechanism
**Sources:** ADV Trap 4
**Confidence:** High (directly observed, 9 perk ids across 6 files)
**Severity:** Low (docs gap, not a defect)

`AGENTS.md:277` names only two perk-effect mechanisms: `PerkEffect` numeric fields
(`perkModifiers()`) and `dispatchHook` registrations. A third exists in production: hardcoded
`perksForCharacter(c).some((p) => p.id === "...")` checks at damage-dealing/damage-taken
sites, used by 9 perk ids across 6 files (`combat-shared.ts:326-386` for warlord/vanguard/
sentinel/paladin; `combat-actions.ts:227,249,638,669,932`; `combat-spells.ts:94,147`;
`combat-eor.ts:177`; `combat-enemy.ts:557`). `data/perks.ts:307-316`'s own code comment
acknowledges the choice.

**Synthesis resolution:** ADV's T4: document the third mechanism in `AGENTS.md`'s perk
guidance. Do not build tooling/abstraction for this pattern (ADV Group 4 item 2: right shape
for 4 consumers, do not build a generic aura-perk framework).

### 3.7 Debug surface

#### F15 — `exitDebugCombat` silent no-op
**Sources:** TDX §4 Finding 8, TDX T4
**Confidence:** High (directly observed)
**Severity:** Low

`src/main.ts:870-876`: `if (!combatController || !state.combat) return;` — no thrown error, no
log, no return value, unlike `jumpTo`, `loadSave`, and the fixed `startCombat`, all of which
throw explicit `"helperName: reason"` errors for equivalent precondition failures.

**Synthesis resolution:** TDX's T4: make `exitDebugCombat` throw on invalid preconditions,
matching the explicit-error convention every sibling helper already follows.

#### F16 — `groundPlaneProbe` uses `as unknown as` cast
**Sources:** TDX §4 Finding 7, TDX T8
**Confidence:** High (directly observed)
**Severity:** Low

`src/main.ts:2465-2510`, specifically `:2485`
(`(cc as unknown as { scene: { backdropId: string; state: {...} } }).scene`) redeclares
`CombatScene`'s shape inline instead of importing the real type from `combat-scene.ts`, even
though `CombatController.scene` is a legitimately public getter. No test exists for
`groundPlaneProbe`.

**Synthesis resolution:** TDX's T8: import `CombatScene` from `combat-scene.ts`, replace the
inline cast with direct `combatController.scene` access, optionally extract the pure math
into `src/debug/ground-plane-probe.ts` following the `jump-to.ts`/`start-combat.ts` pattern.

#### F17 — `captureFailureBundle` missing commit SHA, RNG seed, renderer mode
**Sources:** TDX §5, TDX T5
**Confidence:** High (directly observed)
**Severity:** Low (evidence-quality)

`scripts/playtests/lib.mjs:134-169`'s `captureFailureBundle` records `name`, `capturedAt`,
`transcript`, `consoleErrors`, `screenshot`, `snapshot`, `log`, `sounds`, `readiness`, `url`,
`viewport` — but no commit SHA, no RNG seed, and no explicit renderer-mode field.

**Synthesis resolution:** TDX's T5: add three fields. `commitSha` and `rendererMode` are
straightforward (~5 lines). `rngSeed` is not recoverable from the page after the fact
(`setGameplayRng` takes an `Rng` function, not a seed number, and `rng.ts` exposes no getter)
— pick one of two approaches during implementation: (a) explicit `{ seed }` option to
`captureFailureBundle` that every calling script passes through, or (b) record the seed into
the page-keyed `WeakMap` that already holds the action transcript at the moment a script
calls `setGameplayRng`.

### 3.8 Asset pipeline

#### F18 — Silent asset fallbacks; no dev-mode warnings
**Sources:** GLM §5.5, GLM Trap 1, GLM 2.2
**Confidence:** High (directly observed)
**Severity:** Medium (invisible broken content)

Missing sprites, textures, and audio files degrade to procedural shapes or `catch(() => null)`
without any visible warning. `sprite-manifest.ts` maps enemy IDs to paths but missing assets
silently fall back to procedural shapes in `combat-scene.ts`. `maze-props.ts` says "Listing
art that does not exist yet is deliberately safe." An agent can add an enemy to `enemies.ts`,
forget the sprite manifest entry, and the game runs fine with a colored rectangle.

**Synthesis resolution:** GLM's 2.2: in dev mode (`import.meta.env.DEV`), log a `console.warn`
when a sprite/texture/audio asset fails to load and falls back. Keep production silent. Do
not change the fallback behavior itself (runtime stability). GLM's 1.3 (test asserting every
enemy ID has a sprite manifest entry or explicit opt-out) is adopted as the durable guardrail.

**Cross-audit note:** BROAD's §3.4 confirmed `Math.random` appears nowhere in the rules/
content tree except `rng.ts`, and ADV's Group 4 item 3 confirmed all 27 production
`Math.random` hits are cosmetic (particle jitter, screen-shake, audio noise, music track
selection). GLM's Trap 6 (`Math.random` forbidden-zone test) is adopted as a cheap guardrail
to convert this observed property into an enforced one.

### 3.9 Documentation and context

#### F19 — `AGENTS.md` exceeds 25K-token read cap
**Sources:** BROAD §7
**Confidence:** High (measured: 26,026 tokens for lines 1–248 alone; full-file ≈30K)
**Severity:** Medium (per-task context cost)

`AGENTS.md` is 303 lines / 64,863 bytes. A single `Read` exceeded the 25,000-token cap at
line 248. The density is concentrated in a small number of very long lines (the ten longest
are 813–1,347 characters each — the pitfall and architecture entries). The content should
not be cut; the problem is purely that there is no way to load one subsystem's worth of it.

**Synthesis resolution:** BROAD's T4: add a ~20-line subsystem navigation index (anchor
table) at the top of `AGENTS.md` mapping subsystem → AGENTS.md anchor + primary source files.
Zero new files, zero new hierarchy, no generator. Explicitly reject `docs/context/` subsystem
packs (BROAD §7: second hierarchy, duplicates AGENTS.md, no owner, guaranteed drift).

#### F20 — Stale PR-5 status banner in `docs/AGENT-READING-LIST.md`
**Sources:** TDX §5, TDX T7
**Confidence:** High (directly observed)
**Severity:** Low (self-contradictory doc)

`docs/AGENT-READING-LIST.md:5` ("Last refreshed: 2026-07-26... PR-5 not built") contradicts
`:105` (updated later, states "Seeded gameplay RNG done... Transcript replay still open").

**Synthesis resolution:** TDX's T7: update the line-5 banner's PR-5 clause to match line 105's
more accurate, more recent status. One-line factual correction.

#### F21 — Stale instruction comment at `vite.config.ts:4-5`
**Sources:** BROAD Group 2 item 3
**Confidence:** High
**Severity:** Low

Correct the stale instruction comment at `vite.config.ts:4-5` next time that file is opened.

### 3.10 Architecture and structure

#### F22 — `main.ts` as 2,528-line composition root
**Sources:** BROAD §3.3, ADV §4.3, TDX §2, GLM §5.3
**Confidence:** High (all four audits independently measured 2,528 lines)
**Severity:** Medium (multi-agent conflict bottleneck, untestable business logic)

`src/main.ts` has 2,528 lines, 65 imports (3× the next-highest file), ~50 top-level
functions, and 46 mutable module-level `let` variables. It owns mode transitions, combat
start/end, encounter triggering, level-up processing, perk selection queue, save/load, debug
API installation, input binding, and the entire application lifecycle.

**Synthesis resolution:** All four audits agree this is the highest-conflict file for
multi-agent work. BROAD's T7 (extract a declarative mode/controller registration table) and
GLM's 2.3/3.1 (extract level-up processing and encounter triggering into testable modules)
are adopted as strategic recommendations. **All four audits explicitly warn against a
reflexive "split main.ts" project** — the composition-root ownership is architecturally
correct; the problem is business logic mixed into the composition root. ADV's Group 4 item 7
is the strongest statement: "there is no concrete testable boundary left un-extracted that
this audit could find" beyond what the team is already extracting. Treat this as a
design-pass-required item, not a mechanical split.

#### F23 — Module-level DOM binding in `shell.ts`
**Sources:** BROAD §3.5
**Confidence:** High
**Severity:** Low (converts "unit-test a UI helper" into "bootstrap the app")

`shell.ts` has module-scope `querySelector!` calls that execute at import time, converting
"unit-test a UI helper" into "bootstrap the app."

**Synthesis resolution:** BROAD's Group 2 item 4: consider a lazy DOM-binding accessor when
next touching `shell.ts`, only if a concrete test is being blocked by it. Do not do this
speculatively.

#### F24 — No dependency-boundary test
**Sources:** BROAD §3.4, BROAD Group 2 item 1, GLM 2.5
**Confidence:** High (BROAD measured the boundary as currently perfect)
**Severity:** Low (strategic — convert observed property into enforced one)

The `game/` → `engine/` boundary is clean by convention but not enforced. A test asserting
"no `src/game/**` or `src/data/**` file imports `src/engine/**`" (excluding `import type`)
would convert an observed property into an enforced one at ~30 lines with no new dependency.

**Synthesis resolution:** Both BROAD and GLM recommend this. Adopted. Do it while touching
either tree.

### 3.11 Test fixtures

#### F25 — Duplicated test fixture builders
**Sources:** TDX §3 Finding 3, GLM §5.2, GLM 2.1
**Confidence:** High (directly observed)
**Severity:** Low (drift risk, wasted context)

GLM identified 12+ duplicated `makeEnemy`/`makeParty`/`makeCombatState` helpers across test
files, each with slightly different signatures and defaults. TDX identified 3 independent
`makeChar`/`makeCharacter` test-local factories, two of which exist specifically to escape
random stat rolls.

**Synthesis resolution (conflict resolved):** TDX argues a shared test builder is not
recommended standalone (only 3 consumers, anti-pattern rule requires ≥2 proven consumers
plus benefit) and that F1 (RNG seeding) should land first, after which the motivation to
hand-write per-file `makeChar` wrappers mostly evaporates. GLM argues for a shared
`test-fixtures.ts` now. **The synthesis adopts TDX's position**: re-evaluate the fixture
recommendation *after* F1 lands, not in parallel. If F1 eliminates the RNG-escape motivation
for most of the 12+ helpers, the remaining duplication may not meet the bar for a shared
abstraction. GLM's 12+ count is accurate but includes helpers that serve different purposes
(combat fixtures vs. character fixtures vs. enemy fixtures) and consolidating them
prematurely would create a god-fixture.

### 3.12 Dependencies

#### F26 — 3 high-severity dev-dependency advisories
**Sources:** BROAD §2, ADV §2, TDX §2, GLM §2
**Confidence:** High (all four audits observed via `npm audit`)
**Severity:** Low (dev-only transitive, none in shipped runtime)

`playwright <1.55.1` (GHSA-7mvr-c777-76hp), `postcss <=8.5.22` (GHSA-r28c-9q8g-f849,
GHSA-fxqj-rqcc-2cmp), `undici 7.0.0–7.28.0` (five advisories). None are in the shipped
runtime dependency (`phaser 4.2.1` is the only `dependencies` entry).

**Synthesis resolution:** BROAD's Group 2 item 5: address during a routine dependency pass;
all have fixes available and none affect the shipped bundle.

---

## 4. Prioritized implementation tickets

Tickets are ordered by Impact × Confidence × Frequency ÷ (Effort × Risk). Each ticket
references its source audit(s) and finding(s).

### Group 1 — Immediate, high-return (do first)

| ID | Title | Source | Effort | Dependencies |
|----|-------|--------|--------|--------------|
| **T1** | Seed the gameplay RNG in a Vitest `setupFiles` with `beforeEach` reseed | BROAD T1, TDX T1, F1 | 1–2h | None. Must land before T3's `npm test` becomes required. |
| **T2** | Pin `features.test.ts:302` (`:391`, `:411`) `maxHp` to 30 | TDX T2, F2 | <15min | None. Can land independently of T1. |
| **T3** | Add `.github/workflows/ci.yml` (`on: pull_request`, build + floor:validate + test with `continue-on-error` until T1 lands) | BROAD T3, TDX T3, GLM 1.1, F4 | ~1h | Soft dep on T1 for `npm test` required status. |
| **T4** | Regenerate `tools/floor-data/` + `public/tools/floor-data/` and add a drift check | BROAD T2, F6 | ~1h | None. |
| **T5** | Extend combat preview parity tests to cover Battle Cry / Warlord / Shrink-Giant Strength; fix or document the drift | ADV T1, GLM 1.2, F9 | Half day | None. |
| **T6** | Add `npm run check` wrapper (`build && test && floor:validate`) | TDX T6, GLM 1.5, F5 | ~15min | Benefits from T1. |
| **T7** | Add subsystem navigation index to top of `AGENTS.md` | BROAD T4, F19 | ~30min | None. |

### Group 2 — Do during the next relevant feature

| ID | Title | Source | Effort |
|----|-------|--------|--------|
| **T8** | Rename `combat-choreography.ts`'s `PARTY_SIZE` to `PARTY_SPRITE_SIZE`; fix `AGENTS.md:173` | ADV T2, F10 | 1–2h |
| **T9** | Document floor2/floor3 vs. floor1/4/5 dual authoring format in `docs/FLOOR-AUTHORING.md` | ADV T3, F7 | 30–60min |
| **T10** | Document the third (aura/proximity) perk-effect mechanism in `AGENTS.md` | ADV T4, F14 | ~30min |
| **T11** | Add sprite-manifest coverage test (every enemy ID has entry or explicit opt-out) | GLM 1.3, F18 | <1h |
| **T12** | Add `Math.random()` forbidden-zone test for `src/game/` and `src/data/` | GLM 1.4, F18 | <1h |
| **T13** | Add dependency-boundary test (`game`/`data` ↛ `engine`) | BROAD T6, GLM 2.5, F24 | <1h |
| **T14** | Add dev-mode `console.warn` for missing sprite/texture/audio assets | GLM 2.2, F18 | Half day |
| **T15** | Make `exitDebugCombat` throw on invalid preconditions | TDX T4, F15 | <30min |
| **T16** | Type `groundPlaneProbe` against real `CombatScene`; extract pure math to `src/debug/ground-plane-probe.ts` | TDX T8, F16 | 1–2h |
| **T17** | Add SHA/seed/renderer-mode to `captureFailureBundle` | TDX T5, F17 | 30–45min |
| **T18** | Add `floor:validate` warning for deprecated `encounterTable` | GLM 2.4, F8 | <1h |
| **T19** | Fix stale PR-5 status banner in `docs/AGENT-READING-LIST.md` | TDX T7, F20 | ~10min |
| **T20** | Correct stale instruction comment at `vite.config.ts:4-5` | BROAD Group 2 item 3, F21 | <5min |
| **T21** | Add `floor:validate` to the deploy workflow | GLM 2.8, F4 | <1h |
| **T22** | Tighten `features.test.ts:391` and `:411` secondary unseeded assertions | BROAD Group 2 item 2 | <30min |
| **T23** | Change `partySlot()`'s silent clamp to a dev-mode assertion | ADV Group 2 item 6, F11 | <30min |
| **T24** | Share `maybeTriggerEncounter` core with `buildDebugCombat` | ADV T5, F12 | When either is next touched |
| **T25** | Add presentation-coverage regression test | ADV T6, F13 | When 2nd `presentation` value is added |
| **T26** | Address 3 high-severity dev-dependency advisories | BROAD Group 2 item 5, F26 | Routine dep pass |

### Group 3 — Strategic / architectural (design pass required)

| ID | Title | Source | Notes |
|----|-------|--------|-------|
| **T27** | Reduce `main.ts`'s mandatory-touch surface via declarative mode/controller registration table | BROAD T7, F22 | **Needs a real design pass.** Must preserve `currentRouteFlags()` single-builder property. Not a mechanical split. |
| **T28** | Extract level-up processing from `main.ts` into testable module | GLM 2.3, F22 | Pure extraction, no behavioral change. |
| **T29** | Extract encounter triggering from `main.ts` into testable module | GLM 3.1, F22 | Pure extraction. |
| **T30** | Resolve floor-1 dual definition (campaign `src/data/floors.ts` vs. JSON pack) | BROAD T5, F6 | Decide ownership, delete the loser. |
| **T31** | Establish owner + regeneration trigger for every committed derived artifact | BROAD Group 3 item 3, F6 | T4 fixes today's instance; this prevents the next one. |
| **T32** | Consider automated coverage for the default Phaser painter | BROAD Group 3 item 2 | Currently untested by documented policy (jsdom can't provide WebGL). Design belongs to testing work. |

### Group 4 — Do not change (with rationale)

| Item | Rationale |
|------|-----------|
| **Do not split `combat-choreography.ts`.** | 3,854 lines but cleanly banner-sectioned; the deliberate single source of shared animation state for both painters. Splitting would create the second-choreography-engine ambiguity `AGENTS.md` forbids. (BROAD Group 4 item 1, ADV Group 4 item 4) |
| **Do not remove the `?phaser=0` Canvas painter.** | It is the tested backend and the documented rollback path. (BROAD Group 4 item 2) |
| **Do not migrate to a framework.** | The boundary discipline is better than most framework codebases achieve. (BROAD Group 4 item 3) |
| **Do not create a second documentation hierarchy (`docs/context/`).** | Second hierarchy; duplicates AGENTS.md; no owner; guaranteed drift. (BROAD §7) |
| **Do not build a generic aura-perk framework.** | Right shape for 4 consumers; do not abstract. (ADV Group 4 item 2) |
| **Do not route cosmetic `Math.random()` through the seeded gameplay RNG.** | All 27 production hits are cosmetic (particle jitter, screen-shake, audio noise, music selection). Routing them through the seeded RNG would complicate replay-hash comparisons for no gameplay benefit. (ADV Group 4 item 3) |
| **Do not add browser/Playwright/replay/visual-audit scripts as required-on-every-PR gates.** | Valuable but slower and less deterministic than unit tests; keep them scheduled/manual. (TDX Group 4 item 2) |
| **Do not adopt a shared test-builder abstraction now.** | Re-evaluate after T1 lands. Only 3 current ad hoc consumers of `makeChar`; 2 are downstream symptoms of the RNG default. (TDX §3 Finding 3, adopted over GLM 2.1) |
| **Do not add CODEOWNERS or multi-approval review rules.** | No evidence of a review-bypass problem in a solo/small-team project; disproportionate process. (TDX Group 4 item 4) |
| **Do not convert floor2/floor3 to JSON for uniformity alone.** | Stable, shouldn't be churned. (ADV Group 4 item 7) |
| **Do not make `perksForCharacter`'s unknown-id filter throw or warn in production.** | Correct behavior for legacy-save robustness. The "do not rename perk ids" rule is the thing to enforce, not the filter. (ADV Group 4 item 8) |
| **Do not change `features.ts`'s outside-combat-damage clamp.** | Correct and intentional (`AGENTS.md:133`, "Outside-combat damage never kills"). (TDX T2 non-goals) |

---

## 5. Cross-audit conflicts and resolutions

### 5.1 Scorecard delta (BROAD 69 vs. GLM 67)

The 2-point delta is explained by category selection and weighting, not by substantive
disagreement. GLM scores `Asset-pipeline safety` at 2 (BROAD does not score this category
separately) and `Test fidelity` at 3 (BROAD's implicit score is 4, reflecting the suite's
breadth). Both audits agree on the bimodal distribution and on CI enforcement scoring 1.
**Resolution:** adopt BROAD's 69 as the headline; fold GLM's asset-pipeline finding (F18)
into the weak-areas list.

### 5.2 Shared test fixtures (TDX vs. GLM)

GLM (§5.2, 2.1) recommends a shared `test-fixtures.ts` now, citing 12+ duplicated helpers.
TDX (§3 Finding 3) argues against standalone adoption, noting only 3 `makeChar` consumers
(two of which are downstream symptoms of the RNG default) and that F1 should land first.

**Resolution:** adopt TDX's position. Re-evaluate after T1 lands. GLM's 12+ count is accurate
but conflates helpers serving different purposes; consolidating them prematurely would create
a god-fixture. The anti-pattern rule (≥2 proven consumers plus benefit) is not met for a
single shared builder today.

### 5.3 Damage preview framing (ADV vs. GLM)

ADV (Trap 1) frames F9 as "preview is *already* missing coverage — check before you add more."
GLM (§5.4, Trap 2) frames it as "an agent changing damage formulas can forget the preview."

**Resolution:** both are correct and complementary. ADV's framing is adopted as primary
because it identifies a live bug (three modifiers already omitted), not just a future risk.
GLM's parameterized drift test (1.2) is adopted as the durable guardrail.

### 5.4 `main.ts` disposition (all four audits)

All four audits identify `main.ts` as a bottleneck. BROAD (T7) and GLM (2.3, 3.1) recommend
extractions. ADV (Group 4 item 7) explicitly warns against a reflexive split, stating "there
is no concrete testable boundary left un-extracted that this audit could find" beyond what
the team is already extracting. TDX concurs with ADV.

**Resolution:** adopt the extraction recommendations (T27–T29) as strategic, design-pass-
required items. Explicitly reject a mechanical "split main.ts" project. The composition-root
ownership is architecturally correct; the problem is business logic mixed into the
composition root, not file size per se.

---

## 6. Verification performed during synthesis

The synthesis worktree was created from `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`. All
findings were re-verified against the source tree before inclusion. Key verifications:

- `src/game/rng.ts:61` — `let gameplayRng: Rng = Math.random;` confirmed.
- `vitest.config.ts` — no `setupFiles`, no `retry`, no `sequence.seed` confirmed.
- `src/game/features.test.ts:302` — assertion and clamp mechanism confirmed.
- `src/game/combat-preview.ts:28-65` — omitted modifiers confirmed by reading both files.
- `src/game/combat-actions.ts:187-266` — three applied modifiers confirmed.
- `public/tools/floor-data/floor-1.json` — "The Proving Depths", 25×32 confirmed.
- `src/content/floors/floor-1.json` — "The Hall of Five Wounds", 24×28 confirmed.
- `.github/workflows/deploy.yml` — push-only, no `pull_request`, no `npm test` confirmed.
- `src/game/party.ts:34-35` (`PARTY_SIZE = 4`) and `src/engine/combat-choreography.ts:96-98`
  (`PARTY_SIZE = 300`) — collision confirmed.
- `src/main.ts` — 2,528 lines confirmed.
- `AGENTS.md` — 303 lines, exceeds 25K-token read cap confirmed.

No files other than this report were modified in the synthesis worktree.

---

## 7. Confidence and limitations

**High confidence** (directly observed by ≥1 audit, re-verified during synthesis, exact line
citations): F1, F2, F4, F6, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F22,
F23, F24, F25, F26.

**Medium confidence**: F3 (zero `expect()` calls is directly observed; severity assessment is
judgment), F7 (workflow mismatch is directly observed; severity is low), F8 (deprecated field
is directly observed; warning value is judgment), F21 (stale comment directly observed).

**Low confidence / speculative**: T23's real-world likelihood (party size is fixed and
enforced elsewhere — the silent-overlap risk is real as written but currently unreachable),
T25's urgency (one `presentation` value shipped in over a year).

**Not inspected deeply enough to have a synthesis opinion**: audio engine internals beyond
`Math.random()` usage; Phaser-specific rendering internals beyond the spot-checked painter-
parity fields; the full `scripts/playtests/*.mjs` corpus beyond `lib.mjs` and the few scripts
named in `AGENTS.md`; actual GitHub branch-protection configuration (GLM's 404 is the only
evidence); whether `combat-phaser-stage.ts` could be partially restructured for testability
beyond what `combat-choreography.ts` already extracts.

**Deferred to future work**: full end-to-end transcript replay (`AGENTS.md:194` documents
this as an open, already-tracked item — not in scope for this synthesis).

---

## 8. Source audit file locations

| Tag | Path |
|-----|------|
| BROAD | `/home/sloppymo/OnyxLabyrinth/.claude/worktrees/agent-aae77fb23fee4122f/docs/development/LLM-MAINTAINABILITY-AUDIT-BROAD.md` |
| ADV | `/home/sloppymo/OnyxLabyrinth/.claude/worktrees/agent-adea0d6506dd066f3/docs/development/LLM-MAINTAINABILITY-AUDIT-ADVERSARIAL.md` |
| TDX | `/home/sloppymo/OnyxLabyrinth/.claude/worktrees/agent-a6a6cbfd3afddc399/docs/development/LLM-MAINTAINABILITY-AUDIT-TESTING-DX.md` |
| GLM | `/home/sloppymo/OnyxLabyrinth-audit-glm/docs/development/LLM-MAINTAINABILITY-AUDIT-GLM.md` |
