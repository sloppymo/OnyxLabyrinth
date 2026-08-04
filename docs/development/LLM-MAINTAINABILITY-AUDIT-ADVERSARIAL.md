# OnyxLabyrinth LLM Maintainability Audit — Adversarial Architecture Track

> Status: Point-in-time audit (2 of 3 parallel independent audits — adversarial architecture scope).
> This report records the repository state at commit `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.
> Revalidate recommendations against current `main` before implementation.

## 1. Executive summary

This audit went looking for plausible-but-wrong changes an LLM agent would make in OnyxLabyrinth, and for places where two things that look like one fact (a number, a rule, a piece of state) are actually asserted independently in more than one place. The codebase is unusually well-documented for its size — `AGENTS.md` already names a long list of hard-won pitfalls — so the highest-value findings here are either (a) gaps *underneath* that documentation that the docs don't cover, or (b) places where the documented guardrail exists but the drift it warns about has already happened.

Seven findings met that bar, all with exact `file:line` evidence:

1. **The damage preview already silently omits three real, deterministic damage modifiers** (Battle Cry buff, Warlord aura, Shrink/Giant Strength scaling) that the actual resolver applies, and the "parity" tests that exist cannot detect this because they only exercise the zero-buff baseline.
2. **`PARTY_SIZE` is two unrelated constants with the same name** — `game/party.ts`'s party headcount (4) and `combat-choreography.ts`'s sprite draw size (300px) — imported into both combat painters under the sprite-size meaning, and even `AGENTS.md`'s own combat-verification checklist conflates the two.
3. **The five shipped floors use two structurally different authoring formats** (two hand-coded imperative TS grid-carving functions vs. three declarative JSON packs), and the authoritative floor-authoring doc doesn't flag the split.
4. **Perk effects are implemented through three independent mechanisms**, not the two documented in `AGENTS.md`'s own "when adding a new perk" guidance — the third (hardcoded `perk.id === "..."` checks for proximity/aura perks) is undocumented as a pattern to reach for.
5. **Front/back row is a magic number (`formationSlot <= 1`) duplicated across five call sites in three files**, and the four hardcoded party formation screen slots silently reuse the last slot's coordinates for any index beyond 3 — a genuine silent-substitution risk for any future 5th-member work.
6. **The new `buildDebugCombat` extraction (the positive example this audit was pointed at) duplicated rather than reused the production encounter-building logic** in `main.ts`, so the two copies can now drift independently.
7. **An unrecognized/future `CombatEvent.presentation` value silently falls through to the generic cast animation** with no error and no test coverage forcing every presentation value to have a matching choreography branch.

None of these are architecture-migration-scale problems. All are narrow, cheap-to-fix, and — except for #1, which is a live UI-accuracy gap conditional on specific buffs being active — none are currently player-visible defects. Section 9 turns the actionable ones into tickets.

## 2. Verified repository baseline (commit be6131c1dcdf5a06922a3b6cb6fac4f9447f5415)

### Environment
git rev-parse HEAD          be6131c1dcdf5a06922a3b6cb6fac4f9447f5415
git rev-parse origin/main   be6131c1dcdf5a06922a3b6cb6fac4f9447f5415   (HEAD == current main)
git diff --check            clean, exit 0
node --version              v22.23.2
npm --version               11.5.2

### Command results
| Command | Result | Duration | Notes |
|---|---|---|---|
| npm ci | PASS | ~3.1 s | 150 packages added, 151 audited; "3 high severity vulnerabilities" (dev-only transitive: playwright, postcss, undici — not runtime risk, only runtime dep is phaser 4.2.1) |
| npm test | INTERMITTENTLY FAILS (~1.9%+ of runs) | ~16-17 s | 95 files / 1934 tests. Root cause: src/game/rng.ts:61 defaults the global gameplay RNG to Math.random; vitest.config.ts declares NO setupFiles; 34 test files construct characters with real random stat rolls. Known failure example: src/game/features.test.ts:302 "gas damages every living member but never below 1 HP" fails when a rolled maxHp <= 12 (measured 1.87% rate). A SECOND known flake is recorded in docs/AGENT-READING-LIST.md:7-10 (order-dependent, src/game/combat-turns.test.ts, ice-shards test, cross-test state leakage). If YOUR test run is red, re-run before attributing the failure to anything you found — it is very likely this pre-existing flake, not a new regression. |
| npm run build | PASS | ~9.7 s | tsc (app) + tsc -p tsconfig.tools.json + vite build; ZERO TypeScript errors on both projects. Non-fatal build warning: combat-phaser-stage chunk 1,411.33 kB (gzip 369.35 kB), over the 500 kB Vite threshold. |
| npm run floor:validate | PASS | ~0.4 s | all 5 floors "OK (no issues)" |

### Config facts
- vitest.config.ts: environment "jsdom", include ["src/**/*.test.ts","scripts/**/*.test.ts"], NO setupFiles, no retry, no sequence.seed
- vite.config.ts: base "/OnyxLabyrinth/", assetsInlineLimit 10240, 4 rollup inputs
- .github/workflows/ = exactly one file, deploy.yml: on push:branches:[main] + workflow_dispatch only. Build job runs npm ci + npm run build + uploads dist. Deploy job publishes to Pages. NO npm test. NO floor:validate. NO pull_request trigger at all.
- Size: src production .ts 111 files | src *.test.ts 93 files | docs 140 | scripts 99 | tools 15. Total lines (src+docs+scripts+tools, .ts/.md/.json): 135,905. Tests: 95 files / 1934 tests.
- `src/main.ts` is 2,528 lines with 65 imports (3x the next-highest file) and ~50 top-level functions spanning most subsystems.
- Layer discipline measured clean by the broad audit: 0 game->engine and 0 data->engine production imports across 111 files; only 3 small cycles found.

This audit did not re-run the above (per instructions); the only commands executed directly were narrow targeted checks — see Section 10.

## 3. Top LLM Traps in OnyxLabyrinth

Ranked by (severity of the plausible mistake) x (how easy the mistake is to make) x (how weak the current protection is).

### Trap 1 — Damage preview silently omits three deterministic damage modifiers

**Evidence:**
- `src/game/combat-preview.ts:1-6` — the module's own doc comment: "compute knowable pre-roll facts only — no crits, no reactive hooks."
- `src/game/combat-preview.ts:28-65` (`previewPhysicalDamageAtVariance`) computes `base * variance * meleeDamageMultiplier + meleeBonusDamage`, then `tagDamageMultiplier`, then AC reduction, then `highDefense`/`resistPhysical`. It never calls `warlordDamageMultiplier`, never reads `s.damageBuffs`, never calls `scaleOutgoingDamage`.
- `src/game/combat-actions.ts:187-266` (`resolveAttack`, the real resolver) applies all three: `s.damageBuffs[actor.id]` (Battle Cry, line ~200), `warlordDamageMultiplier(s, actor)` (line ~206), `scaleOutgoingDamage(damage, actor)` for Shrink/Giant Strength (line ~208).
- `src/game/combat-spells.ts:33-104` (`applySpell`, damage case) independently applies `warlordDamageMultiplier` (line 60, baked into `raw` before AC reduction) and `scaleOutgoingDamage` (line 103) — `combat-preview.ts:96-157` (`previewSpellDamage`) has neither.
- `src/game/combat-shared.ts:140-149` (`scaleOutgoingDamage`) and `:326-336` (`warlordDamageMultiplier`) are both plain, deterministic, non-reactive functions — neither is a crit nor a `dispatchHook` call, so neither is covered by the preview module's own stated exclusion list.

**Typical incorrect change an agent would plausibly make:** add or rebalance a deterministic, always-on damage multiplier (a new aura perk, a new body-magic status, a new stance) in `resolveAttack`/`applySpell` only, because `AGENTS.md`'s hard rule ("Do not update damage preview without also updating the actual resolver path") reads as "preview is already in sync today; keep it that way" rather than "preview is *already* missing coverage — check before you add more."

**Why the mistake is plausible:** the exclusion list in the doc comment (crits, reactive hooks) is specific and reads as exhaustive. Battle Cry, Warlord, and Shrink/Giant-Strength are none of those three things — they are ordinary multipliers gated on state (`s.damageBuffs`, adjacency, `character.status`) that any deterministic-math test would expect a "pre-roll forecast" function to include. An agent skimming the two files side-by-side (rather than diffing them formula-term-by-formula-term) would reasonably conclude preview is a faithful subset.

**Existing protection:** `action-preview.test.ts:107` and `:190` are explicit "parity" tests asserting `preview.minDamage === (actual damage dealt)`.

**Missing protection:** both parity tests build their `CombatState` from `createDefaultParty()` with `stats.luk = 0` and zero perks/buffs/statuses (`action-preview.test.ts:44-56`). They prove parity only on the no-buff branch. They would keep passing unchanged if a fourth deterministic multiplier were added to `resolveAttack` without touching `combat-preview.ts` — this is a live instance of the named Phase-5 pattern "a test that proves a helper assumption but not the public regression."

**Recommended guardrail:** extend the two parity tests to run under an active Battle Cry buff, a live Warlord holder, and a Shrunk/Giant-Strength status, asserting preview still equals dealt damage (it currently will not — that failure is the real bug report). See Ticket T1.

**Severity note:** this is conditional, not universal — preview is exact whenever no buff/aura/status is live, which is most single-fight turns early in a run. It becomes a misleading-UI defect (preview understates real damage) specifically when Battle Cry, a living Warlord holder, or Giant Strength/Shrink is active. **High confidence** (all three omissions directly observed by reading both files).

### Trap 2 — `PARTY_SIZE` names two unrelated constants

**Evidence:**
- `src/game/party.ts:34-35`: `/** Fixed party size — no bench. Formation slots are densely 0..PARTY_SIZE-1. */ export const PARTY_SIZE = 4;`
- `src/engine/combat-choreography.ts:96-98`: `/** Party sprite draw size at scale 1.0 (near row). ... */ export const PARTY_SIZE = 300;`
- `src/engine/combat-scene.ts:26-29` imports `PARTY_SIZE` from `./combat-choreography` (the 300px constant), not from `game/party`.
- `src/engine/combat-phaser-stage.ts:16-38` imports `PARTY_SIZE` from the same `./combat-choreography` module — both combat painters use the sprite-size meaning.
- `src/debug/invariants.ts:10,30-31` imports `PARTY_SIZE` from `../game/party` and asserts `state.party.length !== PARTY_SIZE` — the headcount meaning, in the same codebase, same identifier.
- **`AGENTS.md:173`** (the project's own combat verification checklist, item 11): *"Windows never clip sprites: all four party members (`PARTY_SIZE`) and all enemies stay visible above the bottom windows."* This line is inside the combat-scene/combat-phaser-stage verification section — the exact files where `PARTY_SIZE` in scope means 300px, not 4. The project's own manual already makes the conflation this trap predicts.

**Typical incorrect change an agent would plausibly make:** while investigating a combat-layout or party-count change, grep for `PARTY_SIZE`, find it imported and used inside `combat-scene.ts` / `combat-phaser-stage.ts`, and conclude the render backends are already parametrized by party headcount — then skip auditing `PARTY_FORMATION_SLOTS` (Trap/Finding 5 below) because "`PARTY_SIZE` already flows through here."

**Why the mistake is plausible:** identical identifier, both exported, both plausible-sounding for a combat file (a 300px sprite size and a 4-person roster are both things "combat" code would reasonably reference under that name), and the authoritative doc uses the name ambiguously in exactly the place the collision lives.

**Existing protection:** none — TypeScript module scoping prevents an actual naming *collision* at compile time (they're in different modules), which is precisely what makes this safe to ship and easy to misread; there is no runtime or lint signal.

**Missing protection:** no lint rule or naming convention flags reusing a domain-significant identifier for an unrelated constant across modules.

**Recommended guardrail:** rename one of the two (`ENEMY_SIZE`/`BOSS_SIZE`'s sibling should become e.g. `PARTY_SPRITE_SIZE`) and fix the `AGENTS.md:173` wording. See Ticket T2. **High confidence.**

### Trap 3 — Not every floor uses the same authoring format

**Evidence:**
- `src/data/floors.ts:515`: `export const FLOORS: readonly FloorDef[] = [floor2(), floor3()];` — only floors 2 and 3 come from this module.
- `src/data/floors.ts:210-260` (`floor2()`): imperative construction via `buildSolidGrid`, `carveRoom`, `carveVertical`, `carveHorizontal`, `setEdge`, `setTile` calls on a mutable `grid` object — a scripted-maze-builder style.
- `src/content/floors/index.ts:14-38`: floors 1, 4, and 5 are `FloorMapJSON` files (`floor-1.json`, `floor-4.json`, `floor-5.json`) parsed through `parseFloorMapJSON`/`mapToFloorDef` — a declarative tile-array format, the same one `tools/floor-editor.ts`'s WYSIWYG editor and `floor:validate`/`floor:check` are built around.
- `src/game/floor-registry.ts:9-16` (`merge()`) is what stitches the two sources into one runtime `FLOORS` list, keyed by numeric id.
- `docs/FLOOR-AUTHORING.md:3` describes only the edge-based-grid JSON format and points to `src/data/floors.ts` for "the canonical `FloorDef`" — it does not mention that two of the five shipped floors are not authored that way at all, or that the floor editor's JSON round-trip does not apply to floors 2/3.

**Typical incorrect change an agent would plausibly make:** told to "add a room to Floor 2" (or 3), open `tools/floor-editor.ts` expecting to load/export it like the other three, or hand-edit assuming a `Cell.n/e/s/w` JSON shape exists to modify — floor 2/3 have no JSON source file to edit at all; the only source of truth is the imperative TS function.

**Why the mistake is plausible:** four of five floors *do* share the JSON format, and the authoring doc is written entirely in terms of that format with no caveat, so the natural inference from reading the doc alone is "this is how floors are authored," full stop.

**Existing protection:** `npm run floor:validate` (`scripts/floor-tool.ts:33-53`) validates the merged runtime `FloorDef` list post-`mapToFloorDef`, so both authoring paths get identical structural/reachability linting — an agent who breaks floor 2/3 by editing the TS function directly will still get caught by the validator before shipping.

**Missing protection:** nothing in `docs/FLOOR-AUTHORING.md` or `AGENTS.md`'s file map calls out which floors use which pipeline, so the *editing workflow* mismatch (not the validation gap) is what an agent would hit first.

**Recommended guardrail:** one paragraph in `docs/FLOOR-AUTHORING.md` naming which floors are TS vs. JSON. See Ticket T3. **High confidence** (directly observed in both source files).

### Trap 4 — Perk effects have a third, undocumented implementation channel

**Evidence:**
- `AGENTS.md:277`: *"When adding a new perk: give it a `PerkDef` in `data/perks.ts` with the standard numeric `effect` fields wherever they cover it; only reach for a `dispatchHook` registration in `game/perks.ts` if the effect genuinely needs state or can't be expressed as a flat multiplier/bonus."* This describes exactly two mechanisms.
- A third exists in production: `src/game/combat-shared.ts:326-336` (`warlordDamageMultiplier`), `:338-356` (`vanguardDamageMultiplier`, referenced), `:358-...` (`sentinelDamageMultiplier`), `:...-386` (`paladinDamageMultiplier`) are each a hardcoded `perksForCharacter(c).some((p) => p.id === "halberdier-warlord")`-style lookup, called directly from damage-dealing/damage-taken sites, not through `perkModifiers()` or `dispatchHook()`.
- Full inventory of this third channel: `combat-shared.ts:332` (warlord), `:348` (fighter-vanguard), `:368` (halberdier-sentinel), `:386` (crusader-paladin); `combat-actions.ts:227,249,638,669` (thief-assassin, thief-backstab x2), `:932` (thief-smoke-bomb); `combat-spells.ts:94,147` and `combat-eor.ts:177` (mage-spellbreaker, priest-saint x2); `combat-enemy.ts:557` (duelist-riposte). Nine distinct perk ids, six files.
- `data/perks.ts:307-316` (halberdier-warlord's `PerkDef`) has an empty `effect: {}` and a code comment explaining the aura is "wired directly in combat.ts... no triggers/hook needed, no self-buff" — i.e. the author of this very perk already knew neither of the two documented mechanisms fit, and used the undocumented third one.

**Typical incorrect change an agent would plausibly make:** asked to add a new proximity/aura perk (e.g., "allies adjacent to a Ranger gain +evasion"), follow `AGENTS.md:277` literally: try to express it via `PerkEffect`'s numeric fields (impossible — `perkModifiers()` only ever sees the *acting* character's own perks, never other party members) or via `dispatchHook` (awkward — the effect isn't triggered by an event, it's a standing condition checked at every damage site), get stuck or ship a broken/no-op perk, or reimplement the pattern from scratch without noticing four near-identical helper functions already exist in `combat-shared.ts` to copy.

**Why the mistake is plausible:** the documented decision procedure is binary and doesn't mention "does this perk need full-party context" as a third branch, even though 4 of the 56 shipped perks needed exactly that.

**Existing protection:** all nine hardcoded-id perks have direct unit test coverage (`src/game/perks.test.ts` lines 396-463, 503-545, 788-862, 1051-1090, 1163-1190; `src/game/combat-saint.test.ts`), so a typo'd id string would fail a test, not ship silently.

**Missing protection:** no documentation of the pattern itself, so an agent has to discover it by reading `combat-shared.ts` rather than being told to.

**Recommended guardrail:** one paragraph appended to `AGENTS.md`'s perk-authoring section naming the aura/proximity pattern and pointing at `combat-shared.ts`'s four existing examples as the template. See Ticket T4. **High confidence.**

### Trap 5 — Unrecognized `CombatEvent.presentation` silently falls through to the generic animation

**Evidence:**
- `src/engine/combat-choreography.ts:2964`: inside `case "cast":`, `if (evt.presentation === "meleeGangUp" && evt.targetId) { ...; break; }` — anything else (unset, or a not-yet-wired new value) falls through to the lines immediately below (`showBanner`, `castAnim`, the default stationary-cast impact sequence).
- The literal type is declared **twice, independently**: `src/data/enemy-abilities.ts:84` (`presentation?: "meleeGangUp"`) and `src/game/combat-types.ts:121` (the `"cast"` `CombatEvent` variant's `presentation?: "meleeGangUp"` field) — two separate union declarations, not one shared type.
- `src/game/combat-enemy.ts:179`: `presentation: ability.presentation` is the only plumbing site connecting the two; TypeScript only catches a *widen-one-not-the-other* mismatch here if the ability-def union is widened without widening the event union (an assignment-compatibility check), not the reverse, and never checks that `combat-choreography.ts` has a matching branch for every literal in the union.
- `AGENTS.md:283` documents the *intended* extension procedure ("Adding a second coordinated ability should extend this pattern — new `presentation` value + helper") but does not mention that skipping the choreography branch is a silent no-op rather than a compile or test failure.

**Typical incorrect change an agent would plausibly make (this is Walkthrough E's central finding — see Section 6):** widen both `presentation` unions to add a second coordinated-attack style, wire the new value into the ability def and the emitted event, and stop there — assuming (reasonably, since the code compiles and nothing crashes) that the new choreography is live. Ship it. The ability animates as an ordinary stationary cast; the only way to notice is a targeted visual check of that specific ability.

**Why the mistake is plausible:** the pattern is *presented* as additive and self-contained ("both render backends get it for free since choreography is shared" — true once the branch exists, silent when it doesn't), and there is no `switch`-based exhaustiveness check on `presentation` (it's an `if` inside a `case`), so TypeScript has no mechanism to flag a missing branch.

**Existing protection:** `scripts/debug-choreography.test.ts` is explicitly recommended in `AGENTS.md:178` and `:283` as the fast way to trace a new ability's animation before a browser check — but it is opt-in per-ability, not a blanket regression that runs for every `presentation` value in `data/enemy-abilities.ts`.

**Missing protection:** no test enumerates `ALL_ENEMY_ABILITIES` (or a literal-union type check) and asserts every distinct `presentation` value used in data has a corresponding branch in `combat-choreography.ts`.

**Recommended guardrail:** a small data-driven test — for every ability in `data/enemy-abilities.ts` with a `presentation` set, assert `pushMeleeGangUpSteps`-equivalent behavior fires (not the generic cast fallback) via `debug-choreography`'s trace output. See Ticket T6. **High confidence** for the mechanism; **medium confidence** that this will bite in practice, since the codebase has shipped exactly one `presentation` value in over a year and the team's own debug-choreography workflow is a reasonably strong informal mitigation.

## 4. Hidden coupling & duplicated ownership findings (Phase 6A/6C/6D)

### 4.1 `main.ts::maybeTriggerEncounter` duplicates `debug/start-combat.ts::buildDebugCombat`

**Evidence:** `src/main.ts:542-578` (`maybeTriggerEncounter`) and `src/debug/start-combat.ts:32-58` (`buildDebugCombat`, added in the recent PR #20/#21 fix this audit was pointed at as a positive extraction example) both perform the identical sequence: `encounterTableFloorId` → `rollEncounter` → early-out on null → `resolveEncounter` → early-out on empty → `createCombatFromEncounter(state.party, resolved, SPELLS_BY_ID, ITEMS_BY_ID, loadout, state.inventory, state.inAntimagic)` → assign `state.combat` → reset `state.stepsSinceEncounter`. The only differences are surface-level (throw vs. return-false; `main.ts` also calls `setMode`/`startCombat` and checks `cell?.tile === "treasure"` first, at `main.ts:551-553`, a design-doc-mandated "treasure rooms are guaranteed empty of enemies" rule that `buildDebugCombat` intentionally does not have, since a debug force-fight tool should be able to start combat anywhere).

**Assessment — direction, not existence, is the problem:** the extraction itself (documented in `src/debug/start-combat.ts`'s header comment and covered by `src/debug/start-combat.test.ts`) was the right call — it made a previously-untestable debug code path unit-testable, and its docstring is explicit about scope ("Does NOT mutate `state.mode`; the caller (main.ts) owns mode transitions"). What it missed was reuse: `maybeTriggerEncounter` could call `buildDebugCombat` for its shared core and layer the treasure-tile guard and mode transition on top, rather than maintaining an independent second copy of the roll-and-build sequence. Today the divergence (treasure-safety check present only in `main.ts`) is defensible and intentional. The risk is entirely forward-looking: nothing links or documents the two call sites, so a future precondition added to encounter rolling (e.g., "no encounters within N tiles of stairs") has to be *remembered* to be applied to both, and there is no test that would fail if it were applied to only one. **Medium confidence** this becomes a real bug (it hasn't yet); **high confidence** the duplication itself exists as written. See Ticket T5.

### 4.2 Perk effect ownership is split three ways with no single lookup

Covered in depth as Trap 4 above (Section 3). Restated for the coupling frame: a numeric fact like "Warlord grants +20% damage" is asserted in *three* unconnected places with zero automated cross-check — (a) the literal `1.2` in `combat-shared.ts:333`, (b) the free-text description string `"Allies adjacent to you gain +20% damage."` in `data/perks.ts:309`, and (c) nothing in `perkModifiers()` at all (the numeric aggregator has no entry for this perk since its `effect: {}` is empty). Changing the multiplier during a balance pass means finding and editing (a) by hand and remembering to update (b) by hand; no test asserts they still describe the same number. **Medium confidence** this specific case will ever drift (balance passes on this perk are infrequent), but the pattern — hand-authored description text asserting a number that lives as a separate literal elsewhere — repeats across all 56 perks, not just the four aura perks. Grep confirms zero tests check description-text-vs-effect-value consistency anywhere in `perks.test.ts` or `data/perks.test.ts`.

### 4.3 `main.ts` as a composition root: stateful but not over-decomposed

**Evidence:** `src/main.ts` declares `const state = createGameState(...)` at module scope (line 155) and schedules a `requestAnimationFrame(loop)` loop (line ~2110) that also executes at module-import time — so `main.ts` cannot be `import`ed in a test file without booting a DOM-backed game session. Combined with ~30 module-level `let` controller/flag variables (`townController`, `combatController`, `justOpenedTown`, `combatTransitionActive`, etc., all declared between lines 155-2126), this is the actual reason main.ts is hard to unit-test — not its line count.

**Assessment:** the team has already been proactively extracting the testable slices out of `main.ts` over time: `src/debug/start-combat.ts` (`buildDebugCombat`), `src/debug/idle.ts` (`computeIdle`), `src/debug/snapshot.ts` (`buildSnapshot`), `src/debug/load-normalize.ts` (`normalizeLoadedMode`), `src/debug/jump-to.ts` (`applyJumpPartyOptions`) are all pure functions pulled out of `main.ts`'s orbit specifically so they could be unit-tested, per each file's own header comments. This is exactly the extraction pattern Phase 6A asks to evaluate, and it is already the codebase's practice — not a gap to recommend into existence. `endCombat` (`main.ts:682-800`, ~118 lines) and `onMove` (`main.ts:927-1150`, 224 lines) remain large and un-extracted, but both are genuinely mode-transition/DOM-orchestration glue (calling `showMode`, `audio.*`, `setMessage`, multiple controllers) rather than pure logic with a hidden testable core — there is no obvious pure subset left to pull out of either without fragmenting `state` ownership across files. **This is a Group 4 item, not a Group 1/2 recommendation** — see Section 7.4.

## 5. Silent fallbacks and dangerous vs. healthy degradation (Phase 6G)

| Fallback | Location | Silent? | Assessment |
|---|---|---|---|
| Unrecognized `CombatEvent.presentation` → generic cast animation | `combat-choreography.ts:2964` (Trap 5, Section 3) | Yes, completely — no console line, no debug event | **Dangerous but low-blast-radius**: only affects a hand-authored coordinated-attack ability, of which exactly one exists today. Worth the cheap guardrail in T6, not a priority fix. |
| Enemy with no `sprite-manifest.ts` entry → procedural placeholder shape | `sprite-manifest.ts:7`, `enemy-sprite-cache.ts` | Documented, intentional | **Healthy.** `AGENTS.md:28` names this explicitly as the designed fallback; `sprite-manifest.test.ts` covers the manifest itself. |
| NPC `combatEnemyIds` references a real enemy id with **no** sprite-manifest entry | `floor-validate.ts:377-387` (`validateNpcRefs`) | Yes | **Weak asset-to-data integrity, not dangerous.** The validator checks the enemy id exists in `ENEMIES_BY_ID` (data-to-data) but not that it has art (data-to-asset) — `AGENTS.md:141` states the *rule* ("Their combat identities... must reference enemies with real sprite strips") but nothing enforces it. A floor author following the letter of `floor:validate`'s "OK, no issues" output could still ship an NPC whose combat form silently renders as the generic placeholder. Low priority — the failure mode is a bland sprite, not a crash or wrong data. |
| Sample-backed SFX (`public/assets/sfx/**/*.wav`) 404/decode failure | `audio.ts`, documented in `AGENTS.md:186` | No longer silent | **Healthy, and recently hardened.** `audio.getSampleLoadStatus()` / `readiness().failed` (per `AGENTS.md`) makes a previously-silent failure observable. Correctly called out as a fixed pitfall — do not re-flag as a gap. |
| Unknown/renamed perk id in `character.perkIds` (legacy save) | `perks.ts:154-159` (`perksForCharacter`'s `.filter(p => p !== undefined)`) | Yes, by design | **Healthy for legacy-save robustness, but it doubles as the reason `AGENTS.md`'s "do not rename perk ids" rule is load-bearing rather than merely stylistic.** `perks.test.ts:67` ("ignores unknown perk ids") proves the *drop* is intentional, but there is no test anywhere that would catch an *accidental* rename producing the same silent drop for an existing save's character — the two scenarios are indistinguishable at this layer. Treat as a Group 4 do-not-change (the filter itself is correct), with the anti-rename rule as its necessary companion. |
| `PARTY_FORMATION_SLOTS` array index clamp | `combat-scene-math.ts:459-461` (`partySlot`) | Yes | Covered in depth in Section 6, Walkthrough H — a party member beyond index 3 silently renders on top of the 4th slot rather than erroring. Not reachable today (party size is fixed at 4 and enforced at creation), so this is a **speculative future concern**, not a live defect. |

## 6. Representative task walkthrough findings (B, E, H)

### Walkthrough B — Add a new perk that modifies damage and reacts to a combat event

Traced without implementing, using `data/perks.ts`, `game/perks.ts`, `game/combat-actions.ts`/`combat-spells.ts`, `game/combat-preview.ts`, and `data/perks.test.ts`/`game/perks.test.ts` as the reference.

1. **Definition:** a new `perk(...)` call in `data/perks.ts`, following the existing 8-per-class/2-per-tier pattern (`TIER_LEVEL` maps tier 1-4 to level 3/6/9/12).
2. **Numeric modifier path:** if expressible as a flat multiplier/bonus, add fields to the `PerkEffect` object; `perkModifiers()` (`game/perks.ts:242-303`) already folds any of its ~25 known fields into `PerkModifiers` with zero call-site changes required in combat code — this path is genuinely low-friction and well-designed.
3. **Reactive hook path:** if the effect needs per-combat state or triggers on an event, register a handler via `register(id, hook, handler)` (`game/perks.ts:349-353`) and add it to the `HANDLERS` registry; `dispatchHook()` is already called at the relevant combat sites (`BeforeAttack`, `OnCriticalHit`, `AfterDamageTaken`, etc. — the full list is the `CombatHook` union at `game/perks.ts:30-51`), so a genuinely event-triggered perk requires no new call sites either.
4. **The gap (Trap 4, Section 3):** if the effect is neither ("this character's allies gain a bonus while adjacent," a standing full-party-context condition, not a self-buff and not an event trigger), *neither documented path fits*, and the actual precedent (4 existing perks) is a hardcoded `perksForCharacter(c).some((p) => p.id === "...")` check added directly at each relevant damage site in `combat-shared.ts`/`combat-actions.ts`/`combat-spells.ts`/`combat-enemy.ts`. `AGENTS.md:277` does not mention this third path.
5. **Combat preview:** if the new perk is a `meleeDamageMultiplier`/`spellDamageMultiplier`/`meleeBonusDamage`-style field already read by `perkModifiers()`, `combat-preview.ts` picks it up automatically (both preview functions call `perkModifiers()` themselves). If it needs the third (aura) mechanism, preview will **not** reflect it — the preview functions never call any of the `combat-shared.ts` aura helpers, matching Trap 1's broader finding that preview's coverage is narrower than the resolver's.
6. **Actual resolution:** wherever the multiplier is read (`resolveAttack`, `resolveAmbush`, `applySpell`'s damage case, `dealTechniqueDamage` — the four sites `AGENTS.md:317-318`'s Warlord comment names).
7. **UI description:** a free-text string in the same `perk(...)` call, entirely uncoupled from the numeric value (Section 4.2) — no test enforces the two stay consistent.
8. **Persistence:** `applyPerkSelection` (`game/perks.ts:186-206`) appends the id to `character.perkIds: string[]`; save v6+ serializes it directly, and `perksForCharacter`'s unknown-id filter (Section 5) is the safety net for any future rename.
9. **Tests:** the existing suite's pattern (`perks.test.ts`) is per-perk, hand-written, and thorough for the perks that have it — but there is no generic "every perk with X effect shape gets Y test coverage" enforcement, so a new perk's test coverage is exactly as good as the author remembers to write.

**Verdict:** the two documented mechanisms are genuinely well-designed and low-friction for the ~52 of 56 perks they cover. The gap is specific and narrow (full-party-context, non-event-triggered effects) and has an existing, working, tested precedent that just isn't written down as "the third pattern." **High confidence.**

### Walkthrough E — Change combat animation without changing combat rules

Traced without implementing, using `game/combat.ts`, `engine/combat-choreography.ts`, `engine/combat-phaser-stage.ts`, `engine/combat-scene.ts`, `engine/combat-select-action-view.ts`.

**Can rules and presentation actually be changed independently?** Mostly yes, with one specific, evidenced exception.

- **Rules → events:** `combat.ts` and its split modules (`combat-actions.ts`, `combat-spells.ts`, etc.) emit structured `CombatEvent`s (`AGENTS.md:279-281`: "when adding a new combat action or outcome, you MUST `emit()` a structured `CombatEvent` for it or it will not animate"). This is a real, enforced (by convention, not compiler) coupling in one direction only: rules changes that don't emit new event shapes require zero choreography changes, and choreography/timing changes require zero rules changes — genuinely independent for the *default* per-event-type animation.
- **The exception — coordinated/multi-actor presentations are authored in the content layer, not just consumed there:** `EnemyAbilityDef.presentation` (`data/enemy-abilities.ts:84`) is a *content*-layer field that directly selects which *engine*-layer choreography function runs (`combat-choreography.ts:2964`'s `evt.presentation === "meleeGangUp"` branch calling `pushMeleeGangUpSteps`). This means "change combat animation without changing combat rules" is not fully true for this category: shipping a new coordinated-attack *animation* requires touching `data/enemy-abilities.ts` (widening the `presentation` union, setting the new literal on the ability) as well as `combat-choreography.ts` (the new branch + `push*Steps()` helper) and `combat-types.ts` (widening the parallel, independently-declared union on the `CombatEvent` type) — three files, two of which are nominally "rules/content" not "presentation." As established in Trap 5, forgetting the `combat-choreography.ts` branch specifically is a silent no-op, not a build or test failure.
- **Can Phaser and Canvas paths drift?** The shared `CombatScene` struct (`combat-choreography.ts:359-419`) is genuinely a single state model consumed by both painters (`combat-scene.ts` and `combat-phaser-stage.ts`) — spot-checked `lightGlows`, `screenShake`, `barks`, `showFastCue`/`showAutoCue` fields and found matching consumption (near-identical radial-glow math independently re-derived in both files at `combat-scene.ts:1098-1112` / `combat-phaser-stage.ts:1299-1316`, but currently in agreement) in both backends. `AGENTS.md:134` documents one historical instance of exactly this kind of drift (`paintOrderFootY`, fixed 2026-07-31) — the shared-struct design is sound; the risk is specifically in *new* fields a future change might add to one painter and forget in the other, which is inherent to having two painters at all and not something this audit found a fresh instance of today.

**Verdict:** the choreography/rules separation is a well-designed boundary for the common case (single-actor default animations) and genuinely lets an agent retune timing/VFX without touching `combat.ts` at all. The one real coupling is coordinated multi-actor "presentation" styles, where content-layer data selects engine-layer behavior through an untyped-at-the-branch-level string match with a silent-fallback failure mode. **High confidence**, based on direct reading of the `presentation` branch and both type declarations, not inference.

### Walkthrough H — Add a temporary fifth party member or companion

Traced without implementing (stress test only), using `game/party.ts`, `engine/combat-scene-math.ts`, `engine/party-ui.ts`, `styles.css`, `game/combat-shared.ts`, `game/save.ts`, `game/combat.ts`.

**What's actually flexible:**
- `PARTY_SIZE` (`game/party.ts:35`) is a single named constant; the character-creation loop (`party.ts:292`, `for (let slot = 0; slot < PARTY_SIZE; slot++)`) and `party-ui.ts:519,707` correctly parametrize off it.
- Combat targeting/menu navigation in `combat-ui.ts` iterates `party.length`, not a literal 4 (spot-checked `combat-ui.ts:598,608` — no hardcoded index found there).
- `state.party: Character[]` is a plain array; save serialization (`save.ts`) round-trips arbitrary-length arrays for `Character[]` generically.
- The engine already has a **lighter-weight temporary-participant concept that fits "companion for one fight" much better than growing the party array**: `SummonedAlly` (`combat-types.ts:169-180`) — no `Stats`, no equipment, no `formationSlot`, no leveling, rendered via its own `allyPos`/`allySlot`/`ALLY_FORMATION_SLOTS` layout (parallel to, and independent of, the party/enemy slot tables) and resolved via its own `resolveAllyTurn` (`combat.ts:507-524`, auto-played like an enemy, not player-menu-driven). If "temporary companion" means "an NPC fights alongside you for this encounter, without full character-sheet weight," this is the existing extension point, not the party array.

**What's hardcoded to exactly 4 (the real blockers for a genuine 5th *controllable* party member):**
- `PARTY_FORMATION_SLOTS: FormationSlot[]` (`combat-scene-math.ts:308-313`) is a hand-tuned array of exactly four `{x, footYFrac}` pixel positions, with an extensive design-rationale comment (`:280-307`) about center-aisle clamps and cascade spacing that a 5th slot would need to satisfy by hand.
- `partySlot(index)` (`combat-scene-math.ts:459-461`) clamps via `Math.min(index, PARTY_FORMATION_SLOTS.length - 1)` — a 5th party member (`formationSlot === 4`) would **silently render at the exact same screen position as the 4th member**, not error. This is the sharpest concrete risk in this walkthrough: it fails silently, mid-combat, as a visual overlap, not as a crash or test failure.
- Front/back row is `formationSlot <= 1` (Section 3, five call sites across `party.ts`, `combat-shared.ts`, `combat-equipment.ts`) — this hardcodes both the row split point *and* an even 2-front/2-back shape; a 5th member has no well-defined row under this formula without redesigning the split itself (not just changing the constant).
- `#party-strip`'s CSS grid (`styles.css:2249`, `grid-template-columns: repeat(4, minmax(0, 1fr))`) — a 5th member would visually squeeze into a 4-column grid rather than error.
- `PARTY_SIZE` naming collision (Trap 2) is a direct hazard specifically *for this task*: an agent auditing "everywhere PARTY_SIZE is used" before attempting this change would find it imported into both combat painters and reasonably (wrongly) conclude the render layer already scales with headcount.
- `save.ts:248-263`'s v13→v14 migration comment ("the party is capped at PARTY_SIZE — no 6-person roster, no bench") documents that a *larger* roster was previously supported and was deliberately cut back to 4 — i.e., this direction has already been tried and reversed once at the save-schema level, which is useful context but not a technical blocker for a *temporary* (single-encounter, non-persisted) 5th slot specifically.

**Verdict:** a temporary, auto-played companion (extend `SummonedAlly` with a spawn trigger) is a small, well-contained change that reuses an existing pattern. A temporary but player-controllable 5th party member (own FF6 menu turn, own equipment) is a materially bigger change that has to touch formation-slot geometry, the front/back magic number, and the party-strip CSS, with the formation-slot clamp being the one location where getting it wrong fails silently rather than loudly. **High confidence** on all cited hardcoded locations (directly read); **medium confidence** on the overall sizing of the two paths, since neither was implemented to confirm.

## 7. Prioritized recommendations within your scope

### Group 1 — immediate, high-return (max 5)
1. **Close the damage-preview parity gap with tests, not a formula rewrite** (Ticket T1). Cheapest, highest-signal fix: extend the existing parity tests to cover Battle Cry/Warlord/status-scaled damage. Either they reveal the drift as a real bug to fix, or they lock in "preview excludes these on purpose" as a documented, tested decision instead of an undocumented gap.
2. **Rename the sprite-size `PARTY_SIZE`** (Ticket T2). One rename plus one doc-line fix; removes a live source of confusion for any future combat-layout or party-size work, corroborated by the project's own docs already conflating the two.
3. **Document the floor2/floor3 dual-authoring split in `docs/FLOOR-AUTHORING.md`** (Ticket T3). Docs-only, ~1 paragraph, prevents wasted effort trying to load a TS-authored floor into the JSON editor workflow.
4. **Document the third perk-effect mechanism in `AGENTS.md`** (Ticket T4). Docs-only, ~1 paragraph naming the aura/proximity pattern and its four existing examples.
5. **Add the NPC combat-sprite asset-integrity check to `floor-validate.ts`** — extend `validateNpcRefs` (`floor-validate.ts:377-387`) to warn (not error) when an NPC's `combatEnemyIds` references an enemy with no `sprite-manifest.ts` entry. Small, reuses existing validator infrastructure, closes the one asset-integrity gap found in Section 5.

### Group 2 — do during the next relevant feature touching these areas (max 8)
1. Share `maybeTriggerEncounter`'s core with `buildDebugCombat` (Ticket T5) — natural next step whenever either is next touched; not worth a standalone refactor PR today given zero current drift.
2. Add a presentation-coverage regression test (Ticket T6) — do this specifically the next time a second coordinated-attack `presentation` value is added, per `AGENTS.md:283`'s own stated extension procedure, rather than speculatively now.
3. Export a canonical `SPELLS_BY_ID` from `data/spells.ts` (parallel to `ITEMS_BY_ID` already exported from `data/items.ts`) and have `main.ts:526` and `debug/start-combat.ts:17` import it instead of each rebuilding it via `Object.fromEntries(ALL_SPELLS.map(...))`. Pure boilerplate dedup, zero behavior change, low risk — bundle into any unrelated main.ts touch.
4. When next touching `data/perks.ts` for a balance pass on an aura perk (Warlord/Vanguard/Sentinel/Paladin), add a one-line test asserting the description string's stated percentage matches the hardcoded multiplier literal in `combat-shared.ts`, to close Section 4.2's drift risk for that one perk at least.
5. If a 5th playable party member (temporary or permanent) is ever scoped, budget explicitly for `PARTY_FORMATION_SLOTS` redesign and the `formationSlot <= 1` front/back split — treat Walkthrough H's findings as the pre-work, not something to discover mid-implementation.
6. Consider changing `partySlot()`'s silent `Math.min` clamp (`combat-scene-math.ts:460`) to a dev-mode assertion (throw when `NODE_ENV !== "production"` and `index >= PARTY_FORMATION_SLOTS.length`) so any future off-by-one in party-size handling fails loudly in tests/dev instead of rendering an overlap — cheap, and directly answers Walkthrough H's sharpest risk without requiring the full formation redesign.
7. When next adding a floor that needs the imperative carve-function style (unlikely, since the JSON/editor path is now the default workflow), consider whether it should be ported to JSON instead, purely to keep the validator's authoring-format assumptions from growing a third variant — not urgent, floor2/3 are stable and shouldn't be churned for uniformity alone (see Section 8).
8. Audit the remaining ~50 non-aura perks' description strings against their `effect` fields once, as a one-time sweep, rather than perk-by-perk — most are simple enough (`meleeDamageMultiplier: 1.15` ↔ "+15% melee damage") that a short script comparing the two could flag obvious mismatches cheaply.

### Group 3 — strategic architectural (max 5)
1. None of this audit's findings rise to "strategic architectural" scale. The codebase's core boundaries (rules/content vs. presentation, choreography vs. painters, `effectiveStats`/`perkModifiers` as single sources of truth) are sound and actively maintained; the findings above are all narrow, local fixes. **This is itself a finding**: an adversarial pass explicitly looking for hidden coupling and misleading abstractions did not surface anything warranting a structural rework. Treat that as reasonably strong (not conclusive — one audit, one commit) evidence the architecture is in good health for its size.

### Group 4 — do not change, with rationale
1. **`perkModifiers()` / `dispatchHook()` as the two primary perk mechanisms.** Genuinely low-friction for the ~52/56 perks they cover (Walkthrough B). The gap is narrow and already has a working precedent — fix the docs (Group 1 #4), not the mechanism.
2. **The hardcoded-id "aura" perk pattern itself** (`combat-shared.ts`'s four helper functions). It is the right shape for a full-party-context, non-event effect on 4 perks; do not build a generic aura-perk framework for four consumers (see Section 8).
3. **`Math.random()` discipline.** All 27 production-code hits (`combat-scene.ts`, `combat-choreography.ts`, `audio.ts`) are cosmetic — particle jitter, screen-shake pixel offsets, procedural audio noise, background music track selection — never gameplay state. `perks.ts:490`'s comment ("Uses the injected gameplay RNG... never direct `Math.random()`") shows the discipline is actively maintained, not accidental. Do not route presentation-layer jitter through the seeded gameplay RNG "for consistency" — that would make cosmetic frame-to-frame variance part of the deterministic replay stream for no gameplay benefit and would complicate replay-hash comparisons across runs with different playback speeds.
4. **The single shared `CombatScene` struct consumed by both painters** (`combat-choreography.ts:359-419`). This is the correct design for "never add a second choreography engine" (`AGENTS.md:241`) and is working as intended today — spot-checked several fields, found consistent (if independently-coded) consumption in both backends.
5. **`assertFloorBottomClearOfWindows`** (`combat-scene-math.ts:151-161`, called at `main.ts:2503`). A fail-fast throw-on-violation guard for new combat backdrop art, not a silent fallback — exactly the right failure mode for this class of problem. Commend, do not touch.
6. **`floor:validate` running against the merged, post-`mapToFloorDef` runtime list** (`floor-tool.ts:36-46`), not a JSON-only validator. This already gives floors 2/3 (TS-authored) and floors 1/4/5 (JSON-authored) identical structural linting despite the authoring-format split (Trap 3) — do not build a second, format-specific validator; the existing one already generalizes correctly.
7. **`main.ts`'s remaining size and statefulness** (Section 4.3). The team is already extracting the genuinely testable slices (`src/debug/*.ts`) as they come up; what's left is DOM/mode-orchestration glue that legitimately needs single ownership of `state` and the controller lifecycle. Do not schedule a reflexive "split main.ts" project — there is no concrete testable boundary left un-extracted that this audit could find.
8. **`perksForCharacter`'s silent filter of unknown perk ids** (`perks.ts:154-159`). Correct behavior for legacy-save robustness (tested at `perks.test.ts:67`) — do not make this throw or warn in production. It is precisely why the "do not rename perk ids" rule in `AGENTS.md` matters; treat the rule, not the filter, as the thing to keep enforcing.
9. **`floor-4-demo.json` deliberately excluded from `EXTRA_FLOOR_MAPS`** (`content/floors/index.ts:14-38`). Checked as a candidate silent-shadowing risk (per this audit's own advisory review) and found to be correctly and clearly documented as an intentional exclusion (format-example pack, loaded only via the editor's Playtest Floor button or `floor-validate.test.ts`) — not a bug, no id collision with the real floor 4.

## 8. "Attractive but wrong"

1. **Make the damage preview a real dry-run of the resolver against a cloned `CombatState`.** Sounds like it would *guarantee* parity instead of hand-maintaining two formulas. In practice it still has to exclude crits and reactive hooks per the module's own stated contract (`guaranteedKill` must never overclaim from a lucky crit roll or a hook the player hasn't triggered yet) — so you'd need a "resolve with RNG pinned and hooks disabled" mode, which is a new, third code path to keep in sync with the real resolver, not fewer paths. The cheap fix (better parity tests, Ticket T1) gets the same safety without adding a mode flag to the hot combat-resolution code.
2. **Convert floor2/floor3 to JSON for authoring-format uniformity.** Churns two shipped, save-referenced (enemy/treasure/tile ids), already-validated floors for a purely cosmetic consistency win. The imperative `carveRoom`/`carveVertical`/`carveHorizontal` style is arguably *more* readable than a JSON tile array for describing maze topology (the code reads like a floor plan description, per the extensive inline comments in `floors.ts:210-260`) — this is a case where the "inconsistency" is a legitimate two-tool-for-two-jobs situation, not technical debt. Fix the documentation gap (Ticket T3) instead of the format.
3. **Build a generic perk-effect DSL/interpreter to unify the three mechanisms (numeric aggregator, hook registry, hardcoded aura checks) into one.** Fails the "≥2 current consumers or a proven benefit" bar badly — the third mechanism has exactly 4 consumers, all of which need genuinely different context (full-party adjacency scans) that a numeric-field DSL can't express without effectively reinventing arbitrary code (at which point it's not a DSL, it's the current pattern with extra ceremony). The right fix is naming the pattern in docs (Ticket T4), not abstracting it.
4. **Split `main.ts` into per-subsystem controller classes/modules reflexively.** Line count is not evidence of a problem here (per the audit's own anti-pattern list) — the genuinely extractable pure logic is already extracted (Section 4.3), and further splitting the remaining orchestration code would fragment ownership of the single `GameState`/mode-transition lifecycle across more files without removing any actual coupling, since every split-out piece would still need to reach back into the same shared state.
5. **Add a lint rule or codegen step to auto-generate perk description text from `effect` fields.** Sounds like it would eliminate Section 4.2's drift risk entirely, but perk descriptions are hand-tuned player-facing prose ("Allies adjacent to you gain +20% damage" reads naturally; a codegen template would either be rigid boilerplate for the 52 simple perks or completely unable to describe the 4 aura perks' conditions in natural language). A single one-time consistency-check script (Group 2, item 8) gets most of the safety without owning prose generation.

## 9. Implementation tickets

### T1 — Extend damage-preview parity tests to cover Battle Cry, Warlord aura, and body-magic status scaling

**Objective:** make `action-preview.test.ts`'s parity tests actually exercise the branches where `combat-preview.ts` is known to diverge from the real resolver, converting an undetectable gap into either a locked-in documented exclusion or a fixed bug.

**Problem (exact evidence):** `combat-preview.ts:28-65,96-157` never applies `s.damageBuffs` (Battle Cry, applied at `combat-actions.ts:~200`), `warlordDamageMultiplier` (`combat-shared.ts:326-336`, applied at `combat-actions.ts:~206` and `combat-spells.ts:60`), or `scaleOutgoingDamage` (`combat-shared.ts:140-149`, applied at `combat-actions.ts:~208` and `combat-spells.ts:103`) — none of which are crits or reactive hooks, the module's stated exclusions. The existing parity tests (`action-preview.test.ts:107,190`) use `createDefaultParty()` with zero buffs/perks/statuses and therefore cannot detect this.

**Scope:** `src/game/action-preview.test.ts` only (add cases); `src/game/combat-preview.ts` only if the new test cases reveal the gap should be closed rather than documented.

**Non-goals:** do not add crit or reactive-hook simulation to preview — that is explicitly out of the module's contract and should stay that way.

**Implementation approach:** add 3 new parity test cases mirroring the existing pattern (`makeCombatState`, pinned `rng`, compare `preview.minDamage` to actual damage dealt via `resolvePlayerTurn`): (a) actor with an active `s.damageBuffs` entry (Battle Cry-equivalent), (b) actor adjacent to a party member with `halberdier-warlord` selected, (c) actor with `status: ["shrunk"]` or `["giantStrength"]`. If any fail (expected), either update `combat-preview.ts` to include the missing multiplier, or — if the team decides these should stay excluded — update the module's doc comment (`combat-preview.ts:1-6`) to name them explicitly instead of leaving the exclusion list looking exhaustive when it isn't.

**Tests:** the 3 new cases themselves are the deliverable.

**Manual verification:** N/A (pure unit test change) unless the resolution is to fix `combat-preview.ts`, in which case verify a Battle-Cry'd attack's on-screen preview in the Arena matches the FF6 window's post-hit damage popup.

**Acceptance criteria:** the 3 new tests exist and either pass (formula fixed to match) or are marked as documenting an intentional, now-explicit exclusion with an updated doc comment — not left silently red or silently absent.

**Estimated effort:** 2-4 hours.

**Dependencies:** none.

**Suggested branch name:** `fix/preview-parity-buff-coverage`

---

### T2 — Rename `combat-choreography.ts`'s `PARTY_SIZE` sprite-size constant

**Objective:** eliminate the identifier collision between the party-headcount constant (`game/party.ts`) and the sprite-draw-size constant (`combat-choreography.ts`), both named `PARTY_SIZE` and both exported.

**Problem (exact evidence):** `game/party.ts:35` (`PARTY_SIZE = 4`) vs. `combat-choreography.ts:98` (`PARTY_SIZE = 300`); both painters (`combat-scene.ts:28`, `combat-phaser-stage.ts:38`) import the 300px meaning; `debug/invariants.ts:10` imports the headcount meaning; `AGENTS.md:173` conflates the two in prose, inside the exact section discussing the files that use the 300px meaning.

**Scope:** rename `combat-choreography.ts`'s constant (suggest `PARTY_SPRITE_SIZE`) and every import site (`combat-scene.ts`, `combat-phaser-stage.ts`, and any other consumer found via search); fix `AGENTS.md:173`'s wording to not use the bare name ambiguously.

**Non-goals:** do not rename `game/party.ts`'s `PARTY_SIZE` (the headcount) — it is the more fundamental, more widely-referenced, more "default-sounding" name and should keep it; do not touch `ENEMY_SIZE`/`BOSS_SIZE` (no collision).

**Implementation approach:** mechanical rename via IDE/grep-and-replace scoped to `combat-choreography.ts` and its import sites; update the one `AGENTS.md` line.

**Tests:** no new tests needed; `npm run build` (TypeScript) will catch any missed import site as a compile error, which is the correct safety net for a pure rename.

**Manual verification:** `npm run build` passes with zero errors; grep confirms no remaining `PARTY_SIZE` import resolves to `combat-choreography.ts`.

**Acceptance criteria:** exactly one exported symbol named `PARTY_SIZE` exists in the codebase (the `game/party.ts` one); build is green; `AGENTS.md:173` no longer implies the render backends use the headcount constant.

**Estimated effort:** 1-2 hours.

**Dependencies:** none.

**Suggested branch name:** `chore/rename-sprite-size-constant`

---

### T3 — Document the floor2/floor3 vs. floor1/4/5 dual authoring format in `docs/FLOOR-AUTHORING.md`

**Objective:** prevent an agent from assuming all five campaign floors share one authoring workflow.

**Problem (exact evidence):** `data/floors.ts:515` — only `floor2()`/`floor3()` are TS-authored (imperative grid-carving, `floors.ts:210-260`); `content/floors/index.ts:14-38` — floors 1/4/5 are JSON packs. `docs/FLOOR-AUTHORING.md:3` describes only the JSON format with no caveat.

**Scope:** `docs/FLOOR-AUTHORING.md` only — add one paragraph naming which floors use which pipeline and noting that `tools/floor-editor.ts`'s save/export workflow applies to the JSON-authored floors, not floor 2/3.

**Non-goals:** do not convert floor2/floor3 to JSON (see Section 8, item 2); do not restructure the doc.

**Implementation approach:** insert a short "Authoring formats in this repo" callout near the top of the doc, immediately after the existing format description, listing the id→pipeline mapping and pointing to `floor-registry.ts`'s `merge()` as where they combine.

**Tests:** none (docs-only).

**Manual verification:** read-through by someone unfamiliar with the split; confirm the new paragraph would have prevented the misunderstanding this audit found.

**Acceptance criteria:** the doc states which of the 5 floors are TS vs. JSON and that the editor workflow is JSON-only.

**Estimated effort:** 30-60 minutes.

**Dependencies:** none.

**Suggested branch name:** `docs/floor-authoring-format-split`

---

### T4 — Document the third ("aura"/proximity) perk-effect mechanism in `AGENTS.md`

**Objective:** give the existing perk-authoring decision procedure a third branch so an agent adding a full-party-context perk doesn't have to reverse-engineer the pattern from `combat-shared.ts`.

**Problem (exact evidence):** `AGENTS.md:277` names only `PerkEffect` numeric fields and `dispatchHook`; the actual codebase has a third pattern (hardcoded `perksForCharacter(c).some((p) => p.id === "...")` checks at damage sites, `combat-shared.ts:326-386` and 5 more call sites across `combat-actions.ts`/`combat-spells.ts`/`combat-enemy.ts`/`combat-eor.ts`) used by 9 perk ids, with `data/perks.ts:307-316`'s own code comment acknowledging the choice.

**Scope:** `AGENTS.md`'s "Class perks and effective stats" section (around line 277) only.

**Non-goals:** do not build tooling/abstraction for this pattern (see Section 8, item 3).

**Implementation approach:** add a third bullet to the existing decision list: "if the effect modifies *other* characters' stats/damage based on proximity/adjacency (not the holder's own action, not triggered by an event), it needs full-party context that neither `perkModifiers()` nor `dispatchHook()` can express — wire it directly at each damage-dealing site as a hardcoded perk-id check, following `combat-shared.ts`'s `warlordDamageMultiplier`/`vanguardDamageMultiplier`/`sentinelDamageMultiplier`/`paladinDamageMultiplier` as the template."

**Tests:** none (docs-only).

**Manual verification:** none beyond review.

**Acceptance criteria:** `AGENTS.md`'s perk guidance names all three mechanisms actually in use.

**Estimated effort:** 30 minutes.

**Dependencies:** none.

**Suggested branch name:** `docs/perk-aura-pattern`

---

### T5 — Share the encounter-build core between `maybeTriggerEncounter` and `buildDebugCombat`

**Objective:** eliminate the duplicated roll-and-build sequence between production encounter triggering and the debug force-fight helper, so future preconditions on encounter rolling can't be added to only one copy by accident.

**Problem (exact evidence):** `main.ts:542-578` and `debug/start-combat.ts:32-58` independently implement `encounterTableFloorId` → `rollEncounter` → `resolveEncounter` → `createCombatFromEncounter` → assign `state.combat`/`state.stepsSinceEncounter`, differing only in error handling (throw vs. return-false) and the treasure-tile safety check (`main.ts:551-553` only).

**Scope:** either (a) have `maybeTriggerEncounter` call `buildDebugCombat` for the shared core and layer the treasure-tile guard + `setMode`/`startCombat` on top, or (b) extract a smaller shared helper both call. Prefer (a) — `buildDebugCombat` is already tested and already returns the right shape.

**Non-goals:** do not change the treasure-tile safety rule's behavior (production keeps it, debug intentionally doesn't); do not change either function's public signature/call sites beyond the internal refactor.

**Implementation approach:** in `main.ts:542`, after the treasure-tile early-return, call `buildDebugCombat(state, buildLoadoutMap())` wrapped in a try/catch translating its thrown errors back to `maybeTriggerEncounter`'s `return false` early-outs (preserving current behavior exactly), then continue with `setMode`/`startCombat` as today.

**Tests:** existing `start-combat.test.ts` and any `main.ts`-level encounter tests (via Playwright playtests, per `AGENTS.md`) should continue passing unchanged, proving behavior parity.

**Manual verification:** step through a floor known to trigger encounters (per `docs/playtests/` scripts) and confirm encounter rate/behavior unchanged before/after.

**Acceptance criteria:** one code path builds the `CombatState` for both production and debug force-fights; behavior (including the treasure-tile exemption for production only) is unchanged.

**Estimated effort:** 2-3 hours including verification.

**Dependencies:** none.

**Suggested branch name:** `refactor/share-encounter-build-core`

---

### T6 — Add a `presentation` coverage regression test

**Objective:** catch a silently-unwired `CombatEvent.presentation` value (Trap 5) before it ships, the next time a second coordinated-attack style is added.

**Problem (exact evidence):** `combat-choreography.ts:2964`'s `if (evt.presentation === "meleeGangUp" && ...)` falls through silently to the generic cast animation for any other value; the `presentation` literal type is independently declared in `data/enemy-abilities.ts:84` and `game/combat-types.ts:121` with no exhaustiveness check tying new literals to new branches.

**Scope:** a new test (in `scripts/debug-choreography.test.ts` or `combat-scene.test.ts`, following the existing pattern) that iterates every ability in `ALL_ENEMY_ABILITIES` with a non-undefined `presentation` field and asserts the traced choreography for that ability's `cast` event does *not* match the generic-cast step signature (e.g., asserts `pushMeleeGangUpSteps`'s distinctive step count/timing, or a marker step, is present).

**Non-goals:** do not add a compile-time exhaustiveness mechanism (e.g., a switch-based dispatch table) unless/until a second `presentation` value actually ships — one consumer today doesn't justify the refactor (see Section 8's anti-recommendation logic applied narrowly here too); a test is cheaper and sufficient at N=1.

**Implementation approach:** reuse `scripts/debug-choreography.test.ts`'s existing "trace a real ability through the real AI resolver and real choreography" pattern (`AGENTS.md:178`), parametrized over abilities with a `presentation` field instead of one hardcoded ability.

**Tests:** the new test itself.

**Manual verification:** none beyond the automated test; this ticket's entire point is removing the need for a manual visual check to catch this class of bug.

**Acceptance criteria:** the test fails if `pack-leap` (the current `meleeGangUp` ability) were hypothetically un-wired from its branch (verify by temporarily commenting out the branch locally and confirming the new test goes red, then revert).

**Estimated effort:** 2-3 hours.

**Dependencies:** none.

**Suggested branch name:** `test/presentation-coverage`

## 10. Verification performed

This audit reused the baseline block supplied in Section 2 verbatim and did not re-run `npm ci`/`npm test`/`npm run build`. The following narrow, targeted commands were run directly to verify specific claims (all from the worktree root, all read-only):

```
git status --short && git branch --show-current && git rev-parse HEAD && git rev-parse origin/main
wc -l src/main.ts src/game/combat.ts src/game/combat-preview.ts src/game/combat-actions.ts \
      src/game/combat-spells.ts src/game/perks.ts src/data/perks.ts src/game/party.ts src/game/save.ts \
      src/engine/combat-choreography.ts src/engine/combat-scene.ts src/engine/combat-phaser-stage.ts \
      src/engine/combat-ui.ts src/game/combat-types.ts src/game/combat-shared.ts src/game/combat-ai.ts \
      src/game/combat-techniques.ts src/game/combat-enemy.ts src/game/combat-eor.ts
grep -n "PARTY_SIZE" AGENTS.md src/game/party.ts src/engine/combat-choreography.ts \
      src/engine/combat-scene.ts src/engine/combat-phaser-stage.ts src/debug/invariants.ts
grep -n "formationSlot <= 1" src/game/*.ts src/engine/*.ts
grep -rn '\.id === "' src/game/combat-actions.ts src/game/combat-spells.ts src/game/combat-shared.ts \
      src/game/combat-enemy.ts src/game/combat-techniques.ts src/game/combat-eor.ts src/game/combat.ts
grep -rln "thief-backstab|halberdier-warlord|...|thief-assassin" src/**/*.test.ts   # confirmed all 9 hardcoded-id perks have direct test coverage
grep -n "presentation" src/engine/combat-choreography.ts src/data/enemy-abilities.ts src/game/combat-types.ts
grep -rn "Math\.random(" src/game src/engine src/data --include=*.ts   # 27 hits, all confirmed cosmetic (particles/screen-shake/audio)
grep -n "PERKS_BY_ID\[" src/game/*.ts   # confirmed perksForCharacter's defensive filter, cross-checked against perks.test.ts:67
grep -n "SPELLS_BY_ID" src/main.ts src/debug/start-combat.ts src/data/spells.ts
cat src/content/floors/index.ts   # confirmed floor-4-demo.json intentionally excluded, no id collision
grep -n "combatEnemyIds" src/game/floor-validate.ts   # confirmed enemy-id existence checked, sprite-manifest coverage not
```

All were read-only greps/cats/wc against the checked-out worktree; none mutated any file. `git status --short` before writing this report showed a clean tree (matching the expected pre-audit state).

## 11. Confidence and limitations

**High confidence** findings (directly observed, exact line citations, no inference required): Traps 1-5 (Section 3), Sections 4.1, 4.3, the `PARTY_FORMATION_SLOTS` clamp and front/back magic-number findings in Walkthrough H, the SummonedAlly/resolveAllyTurn characterization in Walkthrough H, and the `presentation` type-duplication mechanism in Walkthrough E.

**Medium confidence** findings: whether Section 4.1's (`maybeTriggerEncounter`/`buildDebugCombat`) duplication will actually cause a future bug (it hasn't yet — the divergence today is intentional and correct); whether Section 4.2's perk-description drift will materialize for any specific perk (infrequent balance passes make this low-likelihood per-perk even though the pattern is universal); Trap 5's real-world likelihood (one `presentation` value shipped in over a year, so the guardrail is precautionary, not urgent).

**Low confidence / speculative:** none of the findings in this report are purely speculative — every item in Sections 3-6 traces to code actually read during this session, not to an assumed-but-unverified pattern. The one genuinely forward-looking item is the `PARTY_FORMATION_SLOTS` silent-overlap risk (Walkthrough H), which is real as written but currently unreachable (party size is fixed and enforced elsewhere) — flagged explicitly as a speculative future concern in Section 6, not presented as a live bug.

**Systems not inspected deeply enough to have an opinion on:** the audio engine's procedural synthesis internals (`audio.ts`'s oscillator/envelope code) beyond confirming its `Math.random()` usage is cosmetic; the Phaser-specific rendering internals (`combat-phaser-stage.ts`'s pooling/depth-sort machinery) beyond the specific fields spot-checked for painter parity; the renderer (`renderer.ts`/`render-math.ts`) corridor-projection math, which this audit deliberately did not touch since it is well-covered by `AGENTS.md`'s own extensive pitfall documentation and is squarely renderer/visual-verification territory rather than adversarial-coupling territory; town/shop/equipment UI (`town-ui.ts`) beyond the front-row-slot references found via grep; save-schema migration history beyond the v13→v14 party-size note and the perk-id filter; and the testing/CI/debug-tooling surface, explicitly out of scope per the assignment (covered by the sibling testing/DX audit).
