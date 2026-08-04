# LLM Maintainability Audit — Broad / Topology / Scorecard

> Status: Point-in-time audit (1 of 3 parallel independent audits — broad/topology/scorecard scope).
> This report records the repository state at commit `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.
> Revalidate recommendations against current `main` before implementation.

Audit date: 2026-08-04. Scope: verified baseline (Phase 1), repository topology and context cost
(Phase 2), 20-category maintainability scorecard (Phase 3), documentation context-efficiency
(Phase 8), prioritization (Phase 9). Adversarial architecture analysis and testing/CI/DX depth are
covered by two sibling audits and are deliberately not developed here.

---

## 1. Executive summary

OnyxLabyrinth is, for a hand-rolled no-framework game codebase built by mixed human/agent authorship,
**unusually disciplined in the places that normally rot first**. Its layer boundaries are real and
mechanically verifiable: there are **zero** production imports from `src/game/` into `src/engine/`
and **zero** from `src/data/` into `src/engine/`, and `Math.random` appears nowhere in the entire
rules or content tree except inside `src/game/rng.ts` itself. Its debug and failure-diagnostic
surfaces (`src/debug/`, `scripts/playtests/lib.mjs`) are the best I have seen in a repository of this
size — structured state snapshots, a non-resetting event ring buffer, pure unit-tested invariant
checks, and failure bundles that capture screenshot + snapshot + log + audio + action transcript in
one call.

Against that, three concrete defects dominate the findings, and they compound:

1. **`npm test` is not reliably green at this commit.** The global gameplay RNG defaults to
   `Math.random` (`src/game/rng.ts:61`), nothing seeds it in test setup (`vitest.config.ts` declares
   no `setupFiles`), and **34 test files construct characters with real random stat rolls**. I
   observed a genuine failure on the first clean run of the suite and measured the recurrence rate at
   **1.87% per run** over 50,000 samples of the exact failing condition.
2. **The floor editor loads a stale committed export.** `public/tools/floor-data/floor-1.json`
   describes a floor ("The Proving Depths", 25×32) that **no longer exists in the game**; the live
   floor 1 is "The Hall of Five Wounds" (24×28). Nothing checks the export against its source.
3. **CI enforces almost nothing.** `.github/workflows/deploy.yml` is the only workflow, triggers only
   on push to `main`, and runs `npm ci` + `npm run build`. There is **no PR-triggered CI at all**, no
   `npm test`, and no `npm run floor:validate`.

Together these mean a red main can be deployed without anyone noticing, and the one automated signal
that does exist (the local test suite) has a background failure rate that trains developers and
agents to re-run rather than investigate.

The single highest-return change is **seeding the gameplay RNG in a Vitest setup file** — a handful of
lines that converts the repository's most-used quality signal from "usually green" to "green means
green," and is a prerequisite for CI enforcement being worth anything.

Overall scorecard: **69 / 100 (69%)**. The distribution is bimodal rather than uniformly mediocre:
diagnostics and debug tooling score 5, CI enforcement scores 1. This is a codebase whose *authoring*
discipline substantially outruns its *enforcement* discipline.

---

## 2. Verified repository baseline

*(This section is self-contained and intended to be reused verbatim by the sibling audits so they do
not need to re-run `npm ci` / `npm test` / `npm run build`.)*

### Environment and git state

```
git branch --show-current   worktree-agent-aae77fb23fee4122f
git rev-parse HEAD          be6131c1dcdf5a06922a3b6cb6fac4f9447f5415
git rev-parse origin/main   be6131c1dcdf5a06922a3b6cb6fac4f9447f5415   (identical — HEAD is current main)
git status --short          (empty — clean worktree; the known untracked
                             public/assets/tilesets/f1/water_floor.png is not present in this
                             worktree, as expected for a tracked-files-only checkout)
git diff --check            clean, exit 0
git remote -v               origin  https://github.com/sloppymo/OnyxLabyrinth.git (fetch/push)
node --version              v22.23.2
npm --version               11.5.2
```

`git log -12 --oneline`:

```
be6131c Merge pull request #21 from sloppymo/fix/debug-start-combat
ce78cf0 Merge pull request #18 from sloppymo/review/repository-rationalization-hardening
ea08814 test(debug): cover zero-argument combat helper
0550fc4 fix(debug): repair __onyxDebug.startCombat() isBoss crash
6e45942 Merge pull request #19 from sloppymo/feature/dungeon-water-floor
3b47e9f feat(renderer): render water cells with the shared water tileset
533792a feat(assets): add authored water floor tileset
c649861 docs(review): adversarial review corrections and report
1a4e08c docs(claude): reconcile CLAUDE.md with AGENTS and README
f0f5bff docs(development): complete the rationalization report
2db3d04 docs(hygiene): remove stale procedural boss bed references
ea3bc14 docs(agents): add architecture map, change table, and guardrails
```

### Command results

| Command | Result | Duration | Notes |
|---|---|---|---|
| `npm ci` | **PASS** | ~3.1 s | 150 packages added, 151 audited. Emits `3 high severity vulnerabilities`. |
| `npm test` (run 1) | **FAIL** | ~16.9 s | 95 test files (1 failed, 94 passed); **1934 tests: 1 failed, 1933 passed, 0 skipped**. |
| `npm test` (run 2) | **PASS** | ~16.4 s | 95 files passed; **1934 tests passed, 0 failed, 0 skipped**. |
| `npm test` (runs 3–12) | **PASS** ×10 | ~16 s each | 1934/1934 each run. |
| `npm run build` | **PASS** | ~9.7 s | Includes `tsc` (app) + `tsc -p tsconfig.tools.json` (tools) + `vite build`. Both TypeScript checks pass with **zero errors**. Built in 994 ms after typecheck. |
| `npm run floor:validate` | **PASS** | ~0.4 s | All 5 floors `OK (no issues)`. |
| `git diff --check` | **PASS** | — | No whitespace errors, exit 0. |

**TypeScript:** zero errors on both projects (`tsconfig.json` app scope, `tsconfig.tools.json` tools
scope). Both are strict-ish: `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `noEmit`.

**Floor validation output (run 1, identical each run):**

```
=== Floor 1: The Hall of Five Wounds ===  OK (no issues)
=== Floor 2: The Cursed Library ===       OK (no issues)
=== Floor 3: The Forge of Ashes ===       OK (no issues)
=== Floor 4: The Null Choir ===           OK (no issues)
=== Floor 5: The Weeping Cistern ===      OK (no issues)
```

### ⚠️ `npm test` is intermittently red at this commit

**This is a property of the commit, not of any audit's changes.** Run 1 of 12 failed:

```
FAIL  src/game/features.test.ts > openChest trap effects
      > gas damages every living member but never below 1 HP
AssertionError: expected 1 to be +0
 ❯ src/game/features.test.ts:302:31
   expect(state.party[1].hp).toBe(state.party[1].maxHp - 12);
```

Root cause and measurement are in §3.1. **Measured failure rate: ≥1.87% per run** — 1.87% is the
measured rate for *this specific assertion* (50,000 samples of the precise failing condition); at
least two further assertions in the same file share the mechanism, so the suite-level rate is a lower
bound, not an exact figure. Observed: 1 failure in 12 full-suite runs, consistent with that rate.
**If your suite fails on this test, re-run before attributing it to your own changes.**

Note also that a *second, unrelated* suite flake is already known to the project and remains
unresolved: `docs/AGENT-READING-LIST.md:7-10` records an "order-dependent flake (ice-shards test)" in
`src/game/combat-turns.test.ts` attributed to "cross-test state leakage within that file", flagged as
"still unfixed/unroot-caused if it resurfaces". I did not observe it in 12 runs. Treat `npm test` at
this commit as having at least two independent nondeterminism sources.

### Dependency warnings

`npm audit` reports **3 high-severity advisories, all in dev-only transitive dependencies**, all with
fixes available:

- `playwright <1.55.1` — browser downloads without SSL certificate verification (GHSA-7mvr-c777-76hp)
- `postcss <=8.5.22` — path traversal via `sourceMappingURL` (GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp)
- `undici 7.0.0–7.28.0` — five advisories (response desync, cache-directive disclosure, CRLF injection, cookie injection)

None are in the shipped runtime dependency (`phaser 4.2.1` is the only `dependencies` entry).

`npm run build` emits one non-fatal warning: `combat-phaser-stage` chunk is 1,411.33 kB
(gzip 369.35 kB), above the 500 kB advisory threshold. This is the dynamically-imported Phaser
bundle and is expected.

### Full `npm run` script list

```
dev                       vite
build                     tsc && tsc -p tsconfig.tools.json && vite build
check:tools               tsc -p tsconfig.tools.json
preview                   vite preview
test                      vitest run
test:watch                vitest
floor:validate            tsx scripts/floor-tool.ts validate
floor:dump                tsx scripts/floor-tool.ts dump
floor:export-all          tsx scripts/floor-tool.ts export-all && mkdir -p public/tools
                          && rm -rf public/tools/floor-data && cp -r tools/floor-data public/tools/floor-data
floor:check               tsx scripts/floor-tool.ts check
floor:editor              vite --open /tools/floor-editor.html
sprite-preview:generate   tsx scripts/generate-sprite-preview.ts
generate:combat-bg        node scripts/generate-combat-bg.mjs
tileset:gallery           node scripts/generate-tileset-gallery.mjs
visual:floors             node scripts/playtests/floor-visual-audit.mjs
sprite-preview:serve      python3 -m http.server 8080
sprite-preview            npm run sprite-preview:generate && echo '...'
replay                    node scripts/replays/replay.mjs
replay:record             node scripts/replays/record.mjs
```

**Scripts that write into the tree — do not run these as "integrity checks":** `floor:export-all`
(writes `tools/floor-data/` and `public/tools/floor-data/`), `sprite-preview:generate`,
`generate:combat-bg`, `tileset:gallery`, `visual:floors`. Also note `floor:check` is **not** a
drift check — it requires `--file path/to/map.json` and validates an imported map
(`scripts/floor-tool.ts:82-97`); invoked bare it prints an error and exits 1.

### Configuration facts worth carrying forward

- `vitest.config.ts` — `environment: "jsdom"`, `include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`,
  **no `setupFiles`**, no `retry`, no `sequence.seed`.
- `vite.config.ts` — `base: "/OnyxLabyrinth/"`, `assetsInlineLimit: 10240`, four rollup inputs
  (`index.html`, `vfx-vignette.html`, `dungeon-hud-preview.html`, `tools/floor-editor.html`).
- `.github/workflows/` contains exactly one file, `deploy.yml` (722 bytes): `on: push: branches:
  [main]` + `workflow_dispatch`; job `build` runs `npm ci` then `npm run build` then uploads `dist`;
  job `deploy` publishes to Pages. **No `npm test`. No `npm run floor:validate`. No `pull_request`
  trigger.**

### Repository size

| Area | Count |
|---|---|
| `src/**/*.ts` production (non-test) | 111 |
| `src/**/*.test.ts` | 93 |
| `docs/**` files | 140 |
| `scripts/**` files | 99 |
| `tools/**` files | 15 |
| Total lines across `src` + `docs` + `scripts` + `tools` (`.ts`/`.md`/`.json`) | 135,905 |
| Test files / tests executed by `npm test` | 95 files / 1934 tests |

(95 test files execute vs. 93 under `src/` because `vitest.config.ts` also includes
`scripts/**/*.test.ts`.)

---

## 3. Repository topology & context-hotspot findings (Phase 2)

### 3.1 The gameplay RNG default makes the test suite nondeterministic

**High confidence — directly observed evidence.**

`src/game/rng.ts` is well-built: a documented LCG, uint32 normalization, `Math.imul` to avoid float
precision loss. Its problem is one line:

```ts
// src/game/rng.ts:61
let gameplayRng: Rng = Math.random;
```

`createSeededRng(undefined)` likewise returns `Math.random` (`src/game/rng.ts:23-26`).

Character creation flows through this global unconditionally:
`createDefaultParty()` → `createCharacter()` (`src/game/party.ts:249`) → `rollStatsForRace()`
(`:231`) → `rollBaseStats()` (`:201`) → `roll3d6()` (`:196`) → `rollD6()` (`:191`), which calls
`getGameplayRng()()`. `computeMaxHp` is `stats.vit * 2 + CLASSES[cls].hpBonus`
(`src/game/party.ts:236-238`), so a party member's `maxHp` is a random variable in every test that
does not seed.

The failing assertion asserts a value that is only correct for high VIT rolls:

```ts
// src/game/features.test.ts:302
expect(state.party[1].hp).toBe(state.party[1].maxHp - 12);
```

Gas trap damage is 12 (2d6 max, forced by `seqRng([0.99])`), but outside-combat damage floors every
character at 1 HP by design (an invariant AGENTS.md states explicitly). When `party[1].maxHp <= 12`
the clamp fires, `hp` is 1, and `maxHp - 12` is `<= 0`. **Measured over 50,000 `createDefaultParty()`
constructions: `party[1].maxHp <= 12` occurs 933 times = 1.87%.**

Exposure, measured:

- **37** test files construct characters via `createDefaultParty` / `createCharacter`.
- **3** of those also call `setGameplayRng`.
- **34** roll genuinely random stats.
- `vitest.config.ts` declares **no `setupFiles`**, so there is no global seeding hook.

This is a near-miss rather than an oversight in principle, and the project believes this work is
already done. `docs/AGENT-READING-LIST.md:105` records PR-5 as "**Seeded gameplay RNG done** —
`getGameplayRng()` is now the default for every gameplay-affecting rng parameter (combat, encounters,
stat rolls, features, NPC steal, Arena)". That claim is *true for production call sites* — §3.4
confirms it. The repository also has `src/game/rng-wiring.test.ts`, a sophisticated test whose stated
purpose is proving every gameplay system's default parameter path consults the global RNG, with
`afterEach(() => resetGameplayRng())` as a leak guard (`:31`). **The gap is narrower than "RNG is
unseeded": the wiring was proved correct and seed leakage was prevented, but the global default was
never seeded for the test process itself.** That is why this survived a dedicated determinism sprint.

Two further assertions in the same file share the mechanism (**medium confidence** — the mechanism is
identical but I measured only the `:302` case): `src/game/features.test.ts:391` and `:411` compute
damage as `maxHp - hp`, so a clamped `hp` corrupts the comparison exactly as above.

For contrast, `src/game/features.test.ts:275` (`expect(c.hp).toBe(c.maxHp - 2)`) **cannot** flake, and
I initially misjudged it. `MIN_STAT = 3` (`src/game/party.ts:186`) and
`computeMaxHp = stats.vit * 2 + hpBonus` (`:236-238`), so `maxHp >= 6` and `maxHp - 2 >= 4`, always
above the 1-HP clamp. The clamp is only reachable when damage approaches `maxHp`, which is why the
12-damage gas assertions flake and the 2-damage one does not.

*Remediation design is sibling audit (b)'s territory; ticket T1 below is a stub with the evidence.*

### 3.2 The floor editor loads a stale committed export of a deleted floor

**High confidence — directly observed evidence.** This is the finding I would fix first after the RNG.

There are **three** on-disk representations of floor 1:

| Path | Name | Dimensions | Role |
|---|---|---|---|
| `src/data/floors.ts` (`FLOORS`) | — | — | campaign definition, **overridden at runtime** |
| `src/content/floors/floor-1.json` | "The Hall of Five Wounds" | 24 × 28 | **the live floor** (JSON pack) |
| `tools/floor-data/floor-1.json` + `public/tools/floor-data/floor-1.json` | "The Proving Depths" | 25 × 32 | stale derived export |

The runtime resolver merges packs over campaign floors by id, pack wins:

```ts
// src/game/floor-registry.ts:9
let floorList: FloorDef[] = merge(FLOORS, loadExtraFloors());
// :11-17 — merge() sets campaign by id, then overwrites with extras
```

`npm run floor:validate` independently confirms the live name is **"The Hall of Five Wounds"**.

The floor editor fetches the export, not the source:

```ts
// tools/floor-editor.ts:1187
const url = `${BASE}tools/floor-data/floor-${id}.json`;
```

served from the **committed** `public/tools/floor-data/` (10 tracked files), whose `floor-1.json`
still reads `"name": "The Proving Depths"`.

The drift is not cosmetic. Comparing parsed structures (read-only), floor 1 differs in `name`,
`width`, `height`, `startX`, `startY`, `grid`, `encounterZones`, `mapSprites`, `teleporters`,
`lockedDoors`, `treasures`, `npcs`, and `events` — and the export is missing two keys entirely that
the live floor has: **`waters`** (5 water cells including a poison-cure tile) and **`tilesetZones`**.
Different locked doors (`crypt-key` at 11,12 live vs. `crypt-key` at 6,5 + `brass-key` at 6,23 in the
export), different teleporter pairs, different start position.

Floors 4 and 5 also differ, but only in `treasures` and `npcs` and with **identical serialized
lengths**, which indicates key-ordering differences rather than semantic drift (**medium
confidence** — I compared lengths and content strings, not a normalized deep diff).

Floors 2 and 3 are absent from the comparison because they have **no** `src/content/floors/` pack —
they are campaign-only, defined in `src/data/floors.ts`, so their exports have no second source to
drift against. `src/content/floors/` contains only `floor-1.json`, `floor-4.json`, `floor-5.json`,
`floor-4-demo.json`, and `index.ts`, while `tools/floor-data/` holds all five (the export covers the
merged runtime list, which is correct behavior).

Consequences: an author opening floor 1 in the WYSIWYG editor edits a map that no longer ships, and
`waters`/`tilesetZones` authored in the live pack are invisible and would be dropped on a
round-trip. Nothing detects this — `floor:validate` validates the *runtime* list (correctly), and
`floor:check` is an import validator requiring `--file`. There is no export-vs-source comparison
anywhere, and `floor:export-all` is not run by CI or any test.

### 3.3 `src/main.ts` is the single wiring switchboard

**High confidence — directly observed evidence.**

`src/main.ts` is 2,528 lines and imports **65 modules** — more than 3× the next-highest fan-out
(`src/engine/combat-ui.ts` at 22, `src/game/combat.ts` at 15). It declares roughly 50 top-level
functions spanning nearly every subsystem:

`showMode`/`transitionToMode` (:171, :228) · exploration tracking (:246) · town (:257, :320) · party
creation (:336) · prologue (:384) · ending (:412) · title + save application (:456, :477) ·
encounter trigger (:542) · combat lifecycle (:600, :616, :668, :682) · perk overlay (:800) · game
over (:834) · debug combat exit (:870) · camp (:882) · movement (:927) · trap prompt (:1150, :1193)
· forced encounter (:1165) · action ring (:1235) · **controller routing** (:1294, :1316) · arena
(:1654–:1884) · save menu (:1888) · spell menu (:1952) · NPC panel (:1990, :2015) · automap (:2051).

This is not a line-count objection. The structural point is that **most features must edit this one
file**, because it owns mode transitions, controller lifecycle, and the single `GameState`. AGENTS.md
is candid about the consequences and documents them well (the borrowed-`"title"`-mode pitfall, the
synchronous-mode-open-mid-keydown hazard, the `justOpened*` guard convention, and the rule that new
overlays must extend `currentRouteFlags()`). But documentation of a hazard is not removal of it: for
concurrent agents this file is simultaneously the **highest merge-conflict surface** and a large
mandatory read.

The mitigating design is genuinely good and worth preserving: `currentRouteFlags()` /
`resolveControllerRoute()` is a *single* flag builder consumed by both the real input router and the
debug `route` field, so the debug surface provably cannot drift from actual routing. Any
decomposition must keep that property.

### 3.4 Layer discipline is real and mechanically verifiable

**High confidence — directly observed evidence.** This is the repository's strongest structural
property and should be protected.

Import graph over 111 production `.ts` files (relative imports only):

```
 106  game -> game        91  engine -> engine    54  engine -> game
  46  game -> data        42  (root) -> engine    26  engine -> data
  19  (root) -> game       8  (root) -> debug      7  data -> game
   7  (root) -> data       5  debug -> game        4  debug -> data
   4  dev -> game          3  data -> data         2  debug -> engine
   2  dev -> engine        2  types -> game        1  content -> game
   1  content -> data      1  debug -> debug       1  engine -> debug
   1  game -> content      1  types -> data
```

- **`game -> engine`: 0.** **`data -> engine`: 0.** The rules/content vs. browser-presentation
  boundary AGENTS.md claims is actually enforced in practice. (The single `data -> engine` grep hit,
  `src/data/items-descriptions.test.ts:3`, is a *test* importing `engine/equip-sheet` — not a
  production edge.)
- The 7 `data -> game` edges are the only inversion, and **5 of 7 are `import type`** and therefore
  erased at build time under `verbatimModuleSyntax` (`enemy-abilities.ts:17`, `items.ts:13`,
  `perks.ts:13`, `perks.ts:14`, `techniques.ts:13`). The two value imports are
  `src/data/floors.ts:35` (grid helpers from `game/dungeon`) and `src/data/enemies.ts:15`
  (`getGameplayRng`). Both are defensible; neither reaches presentation.
- **`Math.random` appears nowhere in `src/game/` or `src/data/` except `src/game/rng.ts` itself**
  (occurrences at `:16`, `:25`, `:59`, `:61`, `:73`, `:80`, `:83` — the default, plus comments) and
  one explanatory comment at `src/game/perks.ts:490`. The documented guardrail ("Do not use
  `Math.random()` for gameplay randomness") is genuinely obeyed at every call site. The flake in
  §3.1 is a *default-value* problem, not a discipline problem.
- **`src/engine/renderer.ts` contains no floor-specific literals.** Grepping for `floor.id ===` /
  `floorId ===` returns nothing; the only `=== 1` hits are `:1458-1459` comparing a darkness
  *strength* value. Tileset selection is by `state.floor.id` into a cache, i.e. data-driven.
- **Only 3 import cycles exist**, all small and none crossing the rules/presentation boundary:
  `game/party.ts ↔ game/preset-parties.ts` (a re-export at `party.ts:366`),
  `data/perks.ts ↔ game/perks.ts` (type-only in one direction), and
  `engine/renderer.ts ↔ engine/arena-renderer.ts`.

Fan-in concentrates where you would want it: `game/party.ts` (44), `game/combat-types.ts` (29),
`data/spells.ts` (26), `game/perks.ts` (19), `data/floors.ts` (17). These are stable type/data
facades, not god objects.

### 3.5 Module-level side effects create hidden init-order requirements

**High confidence — directly observed evidence.**

Two production modules do meaningful work at import time:

- **`src/engine/shell.ts:23-91`** binds ~15 DOM nodes at module scope with non-null assertions
  (`const app = document.querySelector<HTMLDivElement>("#app")!;` and similar for `#game-wrap`,
  `#viewport-wrap`, `#map-canvas`, `#message`, `#party-strip`, `#combat-wrap`, …) and registers
  `window.addEventListener("resize", …)` at `:182`. **Importing `shell.ts` at all requires the full
  `index.html` DOM to already exist.** This is the mechanism by which "just unit-test this UI helper"
  turns into "bootstrap the app."
- **`src/game/floor-registry.ts:9`** computes `floorList = merge(FLOORS, loadExtraFloors())` at
  module scope, so the runtime floor list is fixed at first import and is module-level mutable state
  thereafter (`registerFloorDef` at `:28` mutates it).

Neither is a bug today. Both are the kind of hidden lifecycle dependency that is invisible in a
diff and expensive to discover from a stack trace.

### 3.6 Large files: which ones actually cost context, and which do not

**Medium-to-high confidence — directly observed structure, judgement applied.**

Largest tracked `.ts`/`.md`/`.json` files:

```
5172  tools/floor-data/floor-1.json      (stale derived artifact — see §3.2)
4526  src/content/floors/floor-1.json    (data; never read linearly)
3854  src/engine/combat-choreography.ts
2528  src/main.ts
2480  src/engine/combat-phaser-stage.ts
1930  src/engine/combat-ui.ts
1769  src/game/combat-turns.test.ts
1706  src/engine/town-ui.ts
1697  src/data/enemies.ts
1655  src/engine/renderer.ts
```

**`combat-choreography.ts` (3,854 lines) is large but not a context problem, and should not be
split.** It is organized as a clearly banner-sectioned library — `// --- Palette ---` (:69),
`Layout` (:94), `Actor animation state` (:181), `Damage popups` (:277), `Choreography` (:336),
`Scene state` (:350), `Actor lookup helpers` (:541), `Choreography construction` (:673) — composed of
small named functions (`geoFor`, `partyPos`, `newActorAnim`, `animOffset`, `frameIndexFor`,
`pushPopup`, `impactSteps`, …) plus a block of named timing constants at `:675-686`. An agent adding
a new attack presentation reads one section and one `push*Steps()` helper, not the file. It is also
the **single shared source of animation state for both painters**, an invariant AGENTS.md names
explicitly ("never add a second choreography engine"). Splitting it would trade a navigable
single-owner module for exactly the ambiguity that guardrail exists to prevent. **Recommend leaving
it alone** — this is a case where line count is not architectural evidence.

`src/main.ts` is the genuine hotspot, for the reasons in §3.3 (fan-out and mandatory-touch, not
size).

`tools/floor-data/floor-1.json` at 5,172 lines is the largest file in the repository and is a
**committed build output that is wrong** (§3.2).

### 3.7 Test-to-source topology

**Medium confidence — structural inference plus spot checks.**

Tests are co-located (`src/game/features.ts` ↔ `src/game/features.test.ts`), which makes
discoverability essentially free and is the right call for LLM navigation. 93 test files sit beside
111 production files.

Fidelity is more varied than "1934 unit tests" suggests, and in a good way. Spot-checked kinds:
pure-math tests (`render-math.test.ts`, 1,180 lines), explicit **contract** tests
(`combat-damage-contract.test.ts`, `row-targeting-contract.test.ts`,
`shield-bash-contract.test.ts`), **measurement** tests (`floor4-ttk-measurement.test.ts`,
`summon-damage-measurement.test.ts`), **wiring** tests (`rng-wiring.test.ts`,
`effect-sprite-wiring.test.ts`), and **on-disk asset** tests — `effect-sprite-wiring.test.ts:92`
asserts "every url referenced by `resolveEffectStyle` exists on disk," and
`src/engine/sprite-manifest.test.ts:2,18` reads PNG bytes directly (`readFileSync` into a
`Uint8Array`) rather than trusting the manifest. `scripts/replays/` holds 8 recorded replay
fixtures. That is a materially better test portfolio than the headline number implies.

The structural gap: the **Phaser painter is excluded from tests by policy** (AGENTS.md: "Do not
import `combat-phaser-stage.ts` from tests (jsdom)"), and it is the **default** presentation backend
at 1,411 kB. The `?phaser=0` Canvas painter is the tested one. This is a reasonable engineering
tradeoff, not a defect — but it means the default combat rendering path has no automated coverage,
which the sibling testing audit should weigh.

---

## 4. LLM maintainability scorecard (Phase 3)

Scale: 0 = severely obstructive · 1 = poor · 2 = fragile · 3 = workable · 4 = strong ·
5 = exceptionally clear/reliable.

| # | Category | Score | Evidence |
|---|---|---|---|
| 1 | Onboarding clarity | **4** | `CLAUDE.md` → `AGENTS.md` (file map, change table, guardrails) → `README.md` → `docs/AGENT-READING-LIST.md` is a coherent, non-circular chain. Docked one point: AGENTS.md costs ~30K tokens to read whole (§7), and no command verifies a working setup beyond build/test. |
| 2 | Source-of-truth clarity | **3** | Explicitly named and *verified* SoTs: `effective-stats.ts` (stats), `render-math.ts` (fog/geometry), `rng.ts` (randomness), `combat-choreography.ts` (animation), `save.ts` (v14). Docked to workable because floor 1 exists in three places — `src/data/floors.ts`, `src/content/floors/floor-1.json` (silently wins via `floor-registry.ts:9`), and a stale `tools/floor-data/floor-1.json` (§3.2). |
| 3 | Module-boundary clarity | **4** | 0 `game -> engine` and 0 `data -> engine` production imports; 5/7 `data -> game` edges type-only; only 3 small cycles; renderer free of floor literals (§3.4). Docked for `shell.ts` module-level DOM binding and `main.ts` fan-out of 65. |
| 4 | State ownership | **3** | Single `GameState` owned by `main.ts` and documented; mode union is a strict type. But four module-level mutable holders: `gameplayRng` (`rng.ts:61`), `floorList` (`floor-registry.ts:9`), shell DOM handles (`shell.ts:23-91`), and the perk queue as a `main.ts` local. All documented; none discoverable from a diff. |
| 5 | API explicitness | **4** | Strict mode union; structured `CombatEvent` with a 1:1 parallel array; `parseFloorMapJSON` is a strict parser with `formatVersion`; rng passed as an explicit parameter with a default at every gameplay entry point. |
| 6 | Determinism & reproducibility | **3** | Infrastructure is near-5: seeded LCG with uint32 normalization, `rng-wiring.test.ts` proving default paths consult the global RNG, `afterEach` leak guard, 8 replay fixtures, `jumpTo`/`dumpSave`/`loadSave`, `Math.random` absent from all rules code. Wiring into the test suite is near-1: unseeded default, no `setupFiles`, 34 test files rolling real dice, **measured 1.87% suite failure rate** (§3.1). Net: workable, actively harmful at the margin. |
| 7 | Test discoverability | **4** | Co-located `.test.ts`; AGENTS.md's file map names many test files against their subject. Finding the test for a module is a filename transformation. |
| 8 | Test fidelity | **4** | Genuine variety — pure math, contract, measurement, wiring, on-disk asset checks, replay fixtures, and a text-only choreography harness (§3.7). Docked because the **default** Phaser painter is excluded from tests by policy and nothing runs in a browser automatically. |
| 9 | Failure diagnostics | **5** | Best-in-class. `captureFailureBundle` writes screenshot + full snapshot + ASCII map + `log(300)` + `sounds(80)` + `readiness()` + console/network errors + a replayable **action transcript**, and is documented as never throwing so a broken capture cannot mask its trigger. Event ring buffer keeps a non-resetting `seq` so dropped history is *detectable*. `bufferMissing` distinguishes "cue fired but inaudible" from "cue never fired". `snapshot().warnings` runs pure unit-tested invariants (`src/debug/invariants.ts`). |
| 10 | Browser/visual validation | **3** | Playwright is a devDependency; `scripts/playtests/lib.mjs` is a mature harness (`waitForIdle` polling `isIdle()` rather than fixed sleeps, measured ~30% faster); `arena-freeze-verify.mjs` hashes screenshots to catch a frozen canvas. But **none of it runs in CI**, and AGENTS.md itself warns a screenshot is not proof of correctness. |
| 11 | Content-authoring ergonomics | **3** | Strong substrate: JSON floor packs, WYSIWYG editor, a real linter with codes/severities (`floor-validate.ts`, 732 lines), `docs/FLOOR-AUTHORING.md`, and a genuinely elegant prop pipeline ("shipping a corridor prop is a two-line change" via `data/maze-props.ts` preference-ordered ids with glyph fallback). Docked hard because the primary authoring surface — the editor — **opens a floor that no longer exists** (§3.2). |
| 12 | Asset-pipeline safety | **4** | `effect-sprite-wiring.test.ts:92` verifies every referenced effect URL exists on disk; `sprite-manifest.test.ts:18` reads PNG bytes rather than trusting the manifest; grid-slicing is asserted (`:72`); alpha keying is pure and unit-tested (`sprite-alpha.ts`); unreferenced strips must be explicitly allowlisted (`:151`). Docked because none of it runs in CI. |
| 13 | Save & identifier safety | **4** | `SAVE_VERSION = 14` with a real `migrate()` chain (`save.ts:135`), future-version saves rejected rather than mangled (`:137`), version-mismatch rejection at `:291`, migration tests, and an explicit "do not rename ids" guardrail covering enemy/item/perk/NPC/floor ids. |
| 14 | CI enforcement | **1** | One workflow (`deploy.yml`, 722 bytes). Triggers only on `push: branches: [main]`. Runs `npm ci` + `npm run build`. **No `npm test`, no `npm run floor:validate`, no `pull_request` trigger** — pull requests receive zero automated checks. Combined with §3.1, a red main deploys silently. |
| 15 | Multi-agent concurrency safety | **2** | AGENTS.md:103 has a thoughtful explicit rule for parallel sessions sharing one tree (scope destructive git ops to owned paths; diff `src/styles.css` before committing). But `main.ts` is a mandatory touchpoint for most features (§3.3), `styles.css` is a named known-conflict file, and there is no CODEOWNERS, no dependency-boundary test, and no CI to arbitrate. |
| 16 | Context efficiency | **3** | Helped by co-located tests, the "Where do I make this change?" table, small focused `src/game/` modules, and well-sectioned large files (§3.6). Hurt by AGENTS.md's ~30K-token whole-file read, `main.ts` sitting on most change paths, and `docs/AGENT-READING-LIST.md` at 24,150 bytes for 105 lines. |
| 17 | Refactor safety | **4** | 1,934 tests including explicit contract tests; two TypeScript projects both at zero errors; `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax`. Docked because a 1.87% background failure rate makes "did I break something?" ambiguous, and nothing enforces the suite before merge. |
| 18 | Documentation drift resistance | **4** | Unusually strong *correction* machinery. AGENTS.md retracts its own prior guidance in place (`:265`, `:273`). `docs/AGENT-READING-LIST.md` carries a dedicated **"Known stale claims (do not re-assert)"** section (`:65-87`) with struck-through claims and the correction — including one annotated as having "already cost a session" (`:67`, the party-size-six error that AGENTS.md and CLAUDE.md both asserted until 2026-08-01). `docs/README.md:41` explicitly refuses to hardcode a test count ("obtained by running the suite, not by reading a static number in a document") and `:28-37` separates historical/archaeology material from current sources. Docked one point: 140 doc files is a lot of surface, prose-level drift clearly still happens, and the floor export (§3.2) shows *derived artifacts* have no detection at all. |
| 19 | Debug-tool quality | **5** | `__onyxDebug` exposes `snapshot`/`route`/`isIdle`/`readiness`/`log`/`sounds`/`jumpTo`/`dumpSave`/`loadSave`/`exitDebugCombat`, all gated behind `?debug=1`. The pure builders (`src/debug/snapshot.ts`, `idle.ts`, `invariants.ts`, `jump-to.ts`, `load-normalize.ts`) are DOM-free and unit-tested. Critically, `route` is derived from **the same** `currentRouteFlags()` builder the real input router uses, so the debug view provably cannot drift from reality, and `jumpTo` routes through the real `transitionToFloor` rather than a private `warp()` — debug helpers deliberately do *not* duplicate production behavior. |
| 20 | Deployment confidence | **2** | Deploy is `git push` to `main` with a build-only gate — no tests, no floor validation, no post-deploy smoke check, no documented rollback. `concurrency: cancel-in-progress: true` means a rapid second push can cancel an in-flight deploy. Minor live inconsistency: `vite.config.ts:4-5` still instructs "replace 'wizardry-clone' with your actual GitHub repo name" directly above a correctly-set `base: "/OnyxLabyrinth/"`. |

**Raw total: 69 / 100 (69%).**

*Uncertainty:* these scores are calibrated against what I could verify statically, by running the
build/test/validate commands, and by reading source. I did **not** run the game in a browser, did not
execute the Playwright playtests, and did not review visual output. Categories 10 and 20 are
therefore scored on *infrastructure and enforcement*, not on observed correctness, and could be
higher or lower with browser evidence. Category 12 could plausibly be a 5 — I confirmed on-disk URL
checks and PNG byte reads but did not verify that every sprite dimension/animation-state combination
is asserted.

**Strongest five:** 9 Failure diagnostics (5) · 19 Debug-tool quality (5) · 3 Module-boundary
clarity (4) · 8 Test fidelity (4) · 13 Save & identifier safety (4).

**Weakest five:** 14 CI enforcement (1) · 15 Multi-agent concurrency safety (2) · 20 Deployment
confidence (2) · 6 Determinism & reproducibility (3) · 11 Content-authoring ergonomics (3).

---

## 5. Repository strengths (within this audit's scope)

1. **The rules/presentation boundary is real, not aspirational** (§3.4). Zero `game -> engine` and
   zero `data -> engine` production imports across 111 files, verified mechanically. Most codebases
   that claim this boundary do not have it.
2. **`Math.random` discipline is fully honored at call sites** — it appears nowhere in `src/game/` or
   `src/data/` except inside `rng.ts` itself. The determinism problem is a default value, not a
   culture problem, which makes it cheap to fix.
3. **Debug and diagnostic tooling is exceptional** (categories 9 and 19). The design decision that
   matters most: `route` and `jumpTo` are derived from the *same* code paths production uses, so the
   debug surface cannot lie. This is the correct pattern and should be held up as the model for any
   future tooling.
4. **AGENTS.md is a genuinely high-quality agent manual** — file map, "where do I make this change?"
   table, explicit `Do not do this` list, and long-form pitfall entries that encode hard-won
   root-cause knowledge (the Phaser `update`-throw freeze, the `paintOrderFootY` live-offset bug, the
   borrowed-`"title"`-mode hazard). It also *retracts* its own prior guidance in place when it turns
   out to be wrong, which is rare and valuable.
5. **Test portfolio has real variety** — contract, measurement, wiring, and on-disk asset tests, not
   just unit assertions (§3.7).
6. **Save compatibility is handled seriously** — v14 with a migration chain, future-version rejection,
   and an explicit identifier-stability guardrail.

---

## 6. Top friction points (within this audit's scope)

1. **A 1.87%-per-run flaky suite** (§3.1) — corrodes the value of the only automated signal.
2. **The floor editor edits a deleted map** (§3.2) — the primary content-authoring surface is wrong,
   silently, with no detection.
3. **No PR CI whatsoever** (§2, category 14) — nothing prevents any of the above from reaching `main`.
4. **`main.ts` as mandatory touchpoint** (§3.3) — the merge-conflict and context bottleneck for
   parallel agent work.
5. **AGENTS.md cannot be read in one pass** (§7) — the designated first read exceeds a 25K-token tool
   cap.
6. **Module-level DOM binding in `shell.ts`** (§3.5) — converts "unit-test a UI helper" into
   "bootstrap the app."

---

## 7. Documentation / context-efficiency findings (Phase 8)

**Direct answer to the framing question: no, do not create `docs/context/` subsystem packs.** The
substrate they would provide already exists in AGENTS.md, and a second hierarchy would immediately
become the thing that drifts. The real problem is not *missing* context documentation — it is that
the existing context documentation **cannot be loaded selectively**.

**Measured evidence (directly observed):**

| File | Lines | Bytes | Notes |
|---|---|---|---|
| `AGENTS.md` | 303 | 64,863 | A single `Read` **exceeded the 25,000-token cap at line 248**, measuring **26,026 tokens for lines 1–248 alone**. Full-file cost ≈ 30K tokens. |
| `docs/AGENT-READING-LIST.md` | 105 | 24,150 | ~230 bytes/line — extremely dense. |
| `README.md` | 167 | 8,369 | Fine. |
| `docs/README.md` | 59 | 3,473 | Fine. |
| `CLAUDE.md` | 9 | 599 | Correctly minimal — a pure pointer. |

AGENTS.md's density is concentrated in a small number of very long lines — the ten longest are
813–1,347 characters each (`:135` at 1,347, `:134` at 1,210, `:186` at 1,120, `:287` at 1,118,
`:296` at 1,080, `:50` at 1,063). Those are the pitfall and architecture entries, and their length is
*earned*: each encodes a real root cause that would otherwise be rediscovered expensively. **The
content should not be cut.** The problem is purely that there is no way to load one subsystem's worth
of it.

So an agent asked to "change combat animation timing" today either (a) reads ~30K tokens of AGENTS.md
to find the three relevant paragraphs, or (b) skips it and re-introduces a documented bug. Both
outcomes are bad, and (b) is what actually happens under context pressure.

**Comparing the alternatives named in the brief:**

| Option | Verdict |
|---|---|
| `docs/context/` subsystem packs | **Reject.** Second hierarchy; duplicates AGENTS.md; no owner; guaranteed drift. Explicitly out of bounds and correctly so. |
| **Section index / anchor table at the top of AGENTS.md** | **Recommend.** Zero new files, zero new hierarchy, no generator. A ~20-line table mapping subsystem → AGENTS.md anchor + primary source files lets an agent `grep`/read one section instead of the file. Preserves single ownership. |
| Generated architecture inventory | **Reject for now.** No stable generator and no owner; the brief correctly warns against generated docs without both. My import-graph script (§3.4) was throwaway analysis, not a maintainable artifact. |
| Symbol ownership table | **Partially exists** — AGENTS.md's file map and "Where do I make this change?" table already serve this. Not worth duplicating. |
| Machine-readable subsystem map | **Reject.** No current consumer. Would need ≥2 to justify. |
| Tested path references | **Recommend, cheap.** Several AGENTS.md claims cite file paths that nothing verifies. The stale floor export (§3.2) is the same class of failure. A small test asserting that paths named in AGENTS.md exist would be low-cost drift resistance — but this overlaps sibling audit (b) and I defer the design. |
| "Change recipes" | **Already exists** as the "Where do I make this change?" table. Adequate. |
| Module headers | **Already the convention** — spot-checked files (`rng.ts:1-5`, `preset-parties.ts:1-4`, `floor-registry.ts:1-3`, `features.test.ts:1-5`) all carry purposeful header comments. Working well; nothing to do. |
| Typed registries | **Already used** (`sprite-manifest.ts`, `maze-props.ts`, `PERKS_BY_ID`, `ITEMS_BY_ID`, `ENCOUNTER_TABLES`). Nothing to add. |
| Dependency-boundary tests | **Recommend (strategic).** §3.4 shows the boundary is currently perfect. A test asserting "no `src/game/**` or `src/data/**` file imports `src/engine/**`" would convert an *observed* property into an *enforced* one, at maybe 30 lines with no new dependency. Two current consumers exist in principle (the AGENTS.md guardrail and the architecture overview), and the property is real today — this is not an abstraction for a hypothetical need. |

**Net Phase 8 recommendation:** add a navigation index to AGENTS.md (T4) and, when convenient, a
dependency-boundary test (T6). Do not add documentation files.

---

## 8. Prioritized recommendations (within this audit's scope)

Ranked conceptually by Impact × Confidence × Frequency ÷ (Effort × Risk).

### Group 1 — Immediate, high-return (max 5)

1. **Seed the gameplay RNG in a Vitest setup file.** Highest impact × confidence × frequency, lowest
   effort × risk in the entire report. Converts the suite from "usually green" to deterministic and
   is a precondition for CI being meaningful. (T1)
2. **Regenerate `tools/floor-data/` + `public/tools/floor-data/` and add a drift check.** Fixes a
   content-authoring surface that is actively wrong today. (T2)
3. **Add a PR-triggered CI workflow running `npm test`, `npm run build`, `npm run floor:validate`.**
   Trivial effort; converts every other guardrail from advisory to enforced. Sequence *after* T1 or
   it will be flaky on arrival. (T3)
4. **Add a subsystem navigation index to the top of AGENTS.md.** ~20 lines, no new files, directly
   addresses the largest per-task context cost. (T4)
5. **Resolve the floor-1 dual definition.** Decide whether campaign floor 1 lives in
   `src/data/floors.ts` or `src/content/floors/floor-1.json` and delete the loser. (T5)

### Group 2 — Do during the next relevant feature (max 8)

1. Add a dependency-boundary test enforcing `game`/`data` ↛ `engine` (T6) — do it while touching
   either tree.
2. Tighten the two secondary unseeded assertions in `features.test.ts` (`:391`, `:411`) when next
   editing that file; T1 makes them deterministic but they remain fragile to a seed change.
3. Correct the stale instruction comment at `vite.config.ts:4-5` next time that file is opened.
4. When next touching `shell.ts`, consider a lazy DOM-binding accessor rather than module-scope
   `querySelector!` — only if a concrete test is being blocked by it. Do not do this speculatively.
5. Address the 3 high-severity dev-dependency advisories (`playwright`, `postcss`, `undici`) during a
   routine dependency pass; all have fixes available and none affect the shipped bundle.
6. When adding the next overlay/mode, extend `currentRouteFlags()` as AGENTS.md instructs and add the
   route to the debug snapshot in the same commit — the existing single-builder property is the thing
   worth protecting.
7. Normalize `treasures`/`npcs` key ordering in `floorDefToMap` so floor-4/5 exports are
   byte-stable, making T2's drift check a clean equality rather than a semantic compare.

### Group 3 — Strategic / architectural (max 5)

1. **Reduce `main.ts`'s mandatory-touch surface** by extracting a declarative mode/controller
   registration table, so adding an overlay means adding a table entry rather than editing five
   places. **This needs a real design pass before implementation** and must preserve the
   `currentRouteFlags()` single-builder property that makes the debug `route` trustworthy. Do not
   attempt as a mechanical split. (T7)
2. Consider adding automated coverage for the **default** Phaser painter — currently untested by
   policy while being the shipped default. Design belongs to the sibling testing audit; flagged here
   only because §3.7 surfaced it.
3. Establish an owner + regeneration trigger for every committed derived artifact (currently
   `tools/floor-data/`, `public/tools/floor-data/`). T2 fixes today's instance; the general policy
   prevents the next one.

### Group 4 — Do not change

1. **Do not split `src/engine/combat-choreography.ts`.** 3,854 lines, but cleanly banner-sectioned
   into small named functions (§3.6), and it is the deliberate single source of shared animation
   state for both painters. Splitting would create exactly the second-choreography-engine ambiguity
   AGENTS.md forbids. Line count is not evidence here.
2. **Do not remove the `?phaser=0` Canvas painter.** It is the tested backend and the documented
   rollback path.
3. **Do not migrate to a framework.** Nothing in the topology evidence supports it; the boundary
   discipline (§3.4) is better than most framework codebases achieve.
4. **Do not create a second documentation hierarchy** (§7). AGENTS.md is the right container; it
   needs an index, not a sibling.
5. **Do not shorten AGENTS.md's long pitfall entries.** Their length encodes root causes that cost
   real debugging to find. Index them; do not compress them.
6. **Do not "fix" the `data -> game` type-only imports.** Five of seven are erased at build time and
   the two value imports are defensible.

---

## 9. Implementation tickets

### T1 — Seed the gameplay RNG for the test suite

- **Objective:** Make `npm test` deterministic.
- **Problem (exact evidence):** `src/game/rng.ts:61` sets `let gameplayRng: Rng = Math.random;`.
  `vitest.config.ts` declares no `setupFiles`. 37 test files construct characters via
  `createDefaultParty`/`createCharacter`; only 3 call `setGameplayRng`; **34 roll real random stats**.
  Observed failure at `src/game/features.test.ts:302` on a clean checkout; measured recurrence
  **1.87%** over 50,000 samples (`party[1].maxHp <= 12` in 933/50,000).
- **Scope:** Add a Vitest setup file that installs a fixed seeded RNG before each test; register it
  via `setupFiles` in `vitest.config.ts`.
- **Non-goals:** Do not change `src/game/rng.ts`'s production default — unseeded `Math.random` is
  correct for real play, and `README.md:63` documents it as the intended reset state. Do not rewrite
  the 34 test files. Do not add retry logic — retries would mask this class of bug. Do not attempt to
  fix the separate, known `combat-turns.test.ts` order-dependent flake
  (`docs/AGENT-READING-LIST.md:7-10`) in this ticket; it has a different root cause (cross-test state
  leakage) and deserves its own investigation.
- **Implementation approach:** `beforeEach(() => setGameplayRng(createSeededRng(<constant>)))` plus
  the existing `afterEach(() => resetGameplayRng())` pattern already proven in
  `src/game/rng-wiring.test.ts:31`. Pick the seed by confirming the full suite passes with it.
- **Tests:** The suite itself is the test. Verify by running `npm test` ≥20 times consecutively with
  zero failures, and separately `npx vitest run src/game/features.test.ts` ≥100 times.
- **Manual verification:** Confirm `?debug=1` play still produces varied party rolls (production
  default must remain unseeded).
- **Acceptance criteria:** 20 consecutive green full-suite runs; `src/game/rng-wiring.test.ts` still
  passes (it must keep proving the default path consults the global RNG).
- **Estimated effort:** S (under an hour, most of it verification runs).
- **Dependencies:** None. Blocks T3.
- **Suggested branch:** `fix/test-seed-gameplay-rng`
- **Note:** Remediation design overlaps sibling audit (b) (testing/CI/DX). Coordinate before
  implementing so the setup-file approach is not designed twice.

### T2 — Regenerate the floor-data export and add a drift check

- **Objective:** Make the floor editor show the floors the game actually ships, and keep it that way.
- **Problem (exact evidence):** `tools/floor-editor.ts:1187` fetches
  `${BASE}tools/floor-data/floor-${id}.json`, served from the committed `public/tools/floor-data/`.
  `public/tools/floor-data/floor-1.json` and `tools/floor-data/floor-1.json` both contain
  `"name": "The Proving Depths"` (25×32) while the live floor 1 is "The Hall of Five Wounds" (24×28)
  per `src/content/floors/floor-1.json` and the `npm run floor:validate` output. The export is
  missing `waters` (5 cells, including a poison-cure tile) and `tilesetZones` entirely, and differs in
  `grid`, `startX`/`startY`, `lockedDoors`, `teleporters`, `treasures`, `npcs`, `events`,
  `encounterZones`, `mapSprites`. `floor:check` is an import validator requiring `--file`
  (`scripts/floor-tool.ts:82-97`), not a drift check; nothing compares export to source.
- **Scope:** Run `npm run floor:export-all`; commit the regenerated `tools/floor-data/` and
  `public/tools/floor-data/`. Add a test that re-derives each floor via `floorDefToMap(getFloors())`
  and compares against the committed export, failing with the offending floor id and differing keys.
- **Non-goals:** Do not change floor content. Do not change the editor's fetch URL. Do not remove the
  committed export (the editor is a static page and needs it served).
- **Implementation approach:** The check is a pure comparison — `floorDefToMap` is already imported by
  `scripts/floor-tool.ts:14`, so a `scripts/*.test.ts` (already inside `vitest.config.ts`'s `include`)
  can assert equality without touching the filesystem beyond reading the committed JSON. Consider
  T2/Group-2-item-7 (stable key ordering) first so the comparison is a clean deep-equal.
- **Tests:** The new drift test; it must fail on the current committed export before regeneration and
  pass after.
- **Manual verification:** `npm run floor:editor`, open floor 1, confirm the map is
  "The Hall of Five Wounds" at 24×28 with the water cells present.
- **Acceptance criteria:** Drift test passes; editor shows live floor 1; `npm run floor:validate`
  still clean.
- **Estimated effort:** S–M.
- **Dependencies:** None (independent of T1).
- **Suggested branch:** `fix/floor-data-export-drift`

### T3 — Add a PR-triggered CI workflow

- **Objective:** Make the existing quality signals actually gate merges.
- **Problem (exact evidence):** `.github/workflows/deploy.yml` is the only workflow (722 bytes). Its
  trigger is `on: push: branches: [main]` + `workflow_dispatch`. Its build job runs exactly `npm ci`
  and `npm run build`. There is **no `pull_request` trigger anywhere**, so PRs receive zero automated
  checks, and `npm test` and `npm run floor:validate` never run in CI at all.
- **Scope:** Add a CI workflow triggered on `pull_request` and `push` to `main` running `npm ci`,
  `npm run build`, `npm test`, `npm run floor:validate`.
- **Non-goals:** Do not modify `deploy.yml`'s deploy job. Do not add browser/Playwright jobs in this
  ticket. Do not add `npm audit` as a blocking gate.
- **Implementation approach:** New workflow file mirroring `deploy.yml`'s Node 22 + `cache: npm`
  setup. Must land **after T1**, or the new gate will fail ~1.9% of runs on arrival and be disabled.
- **Tests:** N/A (CI config). Verify by opening a draft PR and observing all four steps run.
- **Manual verification:** Confirm a PR with a deliberately failing test is blocked.
- **Acceptance criteria:** PRs show a required check running build + test + floor:validate.
- **Estimated effort:** S.
- **Dependencies:** **T1 must land first.**
- **Suggested branch:** `ci/pr-verification-workflow`
- **Note:** CI depth is sibling audit (b)'s scope. This ticket deliberately specifies only the
  minimum gate matching commands that already exist; defer job-matrix/caching/browser-test design to
  that audit.

### T4 — Add a subsystem navigation index to AGENTS.md

- **Objective:** Let an agent load one subsystem's guidance without reading ~30K tokens.
- **Problem (exact evidence):** `AGENTS.md` is 303 lines / 64,863 bytes. A single `Read` **hit the
  25,000-token cap at line 248**, measuring **26,026 tokens for lines 1–248**. It is the designated
  first read for every agent (`CLAUDE.md` points at it as "the authoritative repository manual").
  Its ten longest lines are 813–1,347 characters (`:135`, `:134`, `:186`, `:287`, `:296`, `:50`, …).
- **Scope:** Add a compact index table near the top of AGENTS.md mapping subsystem → section heading
  → primary source files, so an agent can grep to a heading and read one section.
- **Non-goals:** **Do not shorten or delete any existing content** — the long pitfall entries encode
  real root causes. Do not split AGENTS.md into multiple files. Do not create `docs/context/`. Do not
  duplicate the existing file map or "Where do I make this change?" table — reference them.
- **Implementation approach:** One markdown table, ~20 rows, using the section headings already
  present (`Common pitfalls`, `Architecture overview`, `Combat event system`, `Class perks and
  effective stats`, `Renderer performance / feel notes`, `Debug/testing aids`, …).
- **Tests:** None warranted.
- **Manual verification:** Pick three representative tasks (change combat animation timing; add a
  perk; ship a corridor prop) and confirm the index routes to the right section without a full read.
- **Acceptance criteria:** Index exists; every referenced heading resolves; no existing content
  removed (`git diff` shows additions only).
- **Estimated effort:** S.
- **Dependencies:** None.
- **Suggested branch:** `docs/agents-subsystem-index`

### T5 — Resolve the floor-1 dual definition

- **Objective:** One source of truth per floor.
- **Problem (exact evidence):** Floor 1 is defined in both `src/data/floors.ts` (`FLOORS`) and
  `src/content/floors/floor-1.json`. `src/game/floor-registry.ts:9` computes
  `merge(FLOORS, loadExtraFloors())` at module scope, and `merge` (`:11-17`) sets campaign floors by
  id then **overwrites them with extras**, so the JSON pack silently wins. Nothing in the type system
  or tests signals that the `src/data/floors.ts` floor-1 definition is dead at runtime.
- **Scope:** Decide the canonical home for campaign floor 1; remove or clearly annotate the other.
- **Non-goals:** Do not change the merge semantics (pack-override is intentional and used by
  `?playtestFloor=1` hot-registration). Do not touch floors 2–5 unless the same duplication exists.
- **Implementation approach:** Confirm which definition matches shipped content (`floor:validate`
  says the pack does), then either delete the dead campaign entry or add an explicit comment at both
  sites stating the pack overrides it. Prefer deletion if nothing else references it.
- **Tests:** Add an assertion that no floor id is defined in both `FLOORS` and the content-pack
  loader, or that the runtime name matches the intended source.
- **Manual verification:** `npm run floor:validate` still lists all 5 floors with correct names; boot
  the game and confirm floor 1 is unchanged.
- **Acceptance criteria:** Exactly one authoring location per campaign floor, or an explicit
  documented override with a test guarding it.
- **Estimated effort:** S–M (M if deletion turns out to affect tests referencing `FLOORS`).
- **Dependencies:** Related to T2; do T2 first so the export reflects the resolved state.
- **Suggested branch:** `refactor/floor-1-single-source`

### T6 — Dependency-boundary test for the rules/presentation split

- **Objective:** Convert an observed architectural property into an enforced one.
- **Problem (exact evidence):** §3.4 measured **zero** `src/game/** -> src/engine/**` and **zero**
  `src/data/** -> src/engine/**` production imports across 111 files. AGENTS.md states this boundary
  as a rule ("The practical boundary is rules/content versus browser presentation") and lists related
  guardrails under `Do not do this`. Nothing enforces it — a single future import would silently
  break it, and it is exactly the kind of regression that is invisible in review.
- **Scope:** One test that walks `src/game/**` and `src/data/**` production files, extracts relative
  imports, and asserts none resolve into `src/engine/**`.
- **Non-goals:** Do not add a lint dependency (no new packages; the lockfile is fixed). Do not
  enforce the `data -> game` direction — 5 of 7 such edges are legitimate type-only imports. Do not
  attempt a general architecture-fitness framework.
- **Implementation approach:** Node `fs` + a regex over `from "…"` specifiers, mirroring the throwaway
  analysis in §3.4. No dependency needed — this is the no-dependency solution and no library
  alternative is warranted for ~30 lines.
- **Tests:** The test is the deliverable. Verify it fails when a deliberate `src/game/x.ts` →
  `src/engine/y.ts` import is temporarily added.
- **Manual verification:** None needed.
- **Acceptance criteria:** Test passes on current `main`; fails on an injected violation.
- **Estimated effort:** S.
- **Dependencies:** Best landed with T3 so it actually gates.
- **Suggested branch:** `test/dependency-boundary-rules-vs-engine`

### T7 — (Strategic) Reduce `main.ts`'s mandatory-touch surface

- **Objective:** Make adding a mode/overlay a local change rather than a five-site edit in a
  2,528-line file.
- **Problem (exact evidence):** `src/main.ts` is 2,528 lines and imports **65** modules — 3× the next
  highest (`combat-ui.ts`, 22). It declares ~50 top-level functions spanning town, party creation,
  prologue, ending, title, encounters, combat lifecycle, perk overlay, game over, camp, movement,
  trap prompt, action ring, controller routing, arena, save menu, spell menu, NPC panel, and automap
  (see §3.3 for line numbers). AGENTS.md documents the resulting hazards at length (borrowed-`"title"`
  mode, synchronous mode-open mid-keydown, `justOpened*` guards), which is evidence the coupling is
  real and repeatedly costly — it is also the highest merge-conflict surface for parallel agents.
- **Scope:** Design (not yet implement) a declarative mode/controller registration table so a new
  overlay is one entry rather than edits to `showMode`, `transitionToMode`, `currentRouteFlags`, a
  keydown listener, and a `justOpened*` flag.
- **Non-goals:** **Do not do a mechanical line-count split.** Do not change mode semantics. Do not
  break the property that `currentRouteFlags()` is the single builder feeding both the real input
  router and the debug `route` field — that invariant is why the debug surface is trustworthy and is
  worth more than the refactor.
- **Implementation approach:** Start with a written design reviewed against the AGENTS.md pitfall
  list; land incrementally, one mode family at a time, with the full suite green between steps.
- **Tests:** Existing suite must stay green; add route-resolution tests per migrated mode.
- **Manual verification:** Every mode reachable and exitable; `__onyxDebug.snapshot().route` correct
  for each overlay; no double-fire on the keypress that opens a mode.
- **Acceptance criteria:** Adding a new overlay requires one registration entry plus its controller.
- **Estimated effort:** L. **Do not start without T1 and T3** — this refactor is unsafe without a
  trustworthy, enforced test signal.
- **Dependencies:** T1, T3.
- **Suggested branch:** `refactor/main-mode-registry` (design first)

---

## 10. Verification performed

All commands run from the isolated worktree
`/home/sloppymo/OnyxLabyrinth/.claude/worktrees/agent-aae77fb23fee4122f` at
`be6131c1dcdf5a06922a3b6cb6fac4f9447f5415`.

| Command | Result |
|---|---|
| `git status --short` | clean before and after (only this report added) |
| `git branch --show-current` | `worktree-agent-aae77fb23fee4122f` |
| `git rev-parse HEAD` / `origin/main` | identical: `be6131c1dcdf5a06922a3b6cb6fac4f9447f5415` |
| `git log -12 --oneline`, `git remote -v` | recorded in §2 |
| `node --version` / `npm --version` | v22.23.2 / 11.5.2 |
| `npm ci` | PASS, ~3.1 s, 3 high-severity dev advisories |
| `npm test` | **FAIL run 1** (1/1934), **PASS runs 2–12** (1934/1934) |
| `npx vitest run src/game/features.test.ts` | PASS in isolation (49/49) — established the failure is run-to-run random, not order-dependent |
| `npm run build` | PASS, ~9.7 s, both `tsc` projects zero errors |
| `npm run floor:validate` | PASS, all 5 floors OK |
| `git diff --check` | clean, exit 0 |
| `npm run` | full script list recorded in §2 |
| `npm audit` | 3 high severity (playwright, postcss, undici) — all dev-only |
| Scratchpad analysis (read-only, outside repo) | 50,000-sample RNG measurement; import-graph + cycle detection over 111 production files; parsed floor JSON comparison |

**Not run, deliberately:** `floor:export-all`, `sprite-preview:generate`, `generate:combat-bg`,
`tileset:gallery`, `visual:floors`, `replay`, `replay:record` — all write into the tree or require a
running server, and this audit must not modify any file but the report.

---

## 11. Confidence and limitations

**Directly observed and verified by execution:** the Phase 1 baseline in §2; the test flake and its
≥1.87% rate (§3.1); the floor-data staleness (§3.2); the import graph, cycle count, and absence of
`game -> engine` / `data -> engine` edges (§3.4); AGENTS.md's token cost (§7); CI contents (§2).

**Documentation read in full:** `AGENTS.md` (both pages), `README.md`, `docs/README.md`,
`docs/AGENT-READING-LIST.md`, `CLAUDE.md` — i.e. every Phase 1 documentation target.

**Statically inspected (read, not executed):** `main.ts` structure (§3.3);
`combat-choreography.ts` sectioning (§3.6); `shell.ts` and `floor-registry.ts` module-level effects
(§3.5); save versioning; the test-portfolio variety in §3.7.

**Built:** `npm run build` — both TypeScript projects and the Vite bundle.
**Unit-tested:** the full 1,934-test suite, 12 times.
**Floor-validated:** all 5 floors.

**Not verified — browser-tested / visually reviewed:** I did **not** launch the game, run any
Playwright playtest, capture screenshots, or review any rendered output. Categories 10 (browser/visual
validation) and 20 (deployment confidence) are therefore scored on infrastructure and enforcement
only. No claim in this report should be read as evidence of visual correctness.

**Inferred rather than proven:**
- That floors 4/5 export differences are key-ordering only (§3.2) — based on identical serialized
  lengths with differing content strings; a normalized deep diff would settle it.
- That `features.test.ts:391` and `:411` are additional live flake sources (§3.1) — the mechanism is
  identical but I measured only the `:302` case. (`:275` is *proven* safe via `MIN_STAT = 3`; I
  initially listed it in error and corrected it before publishing.)
- The suite-level flake rate. 1.87% is measured for one assertion; the true per-run rate is that plus
  the `:391`/`:411` contribution plus the separate known `combat-turns.test.ts` order-dependent flake
  documented at `docs/AGENT-READING-LIST.md:7-10`, which I did not reproduce in 12 runs.
- Scorecard categories 11, 12, and 18 rest partly on judgement about authoring workflows I did not
  exercise end-to-end.

**Systems not inspected deeply:** audio (`src/engine/audio.ts`, 1,131 lines) beyond its documented
contract; the Phaser painter (`combat-phaser-stage.ts`, 2,480 lines); `town-ui.ts` (1,706 lines) and
the shop/economy paths; `src/vfx-vignette.ts`; the 99 files under `scripts/`; the `src/assets/`
tileset pipeline; and combat *math* correctness (I verified the module boundaries around it, not the
formulas).

**Explicitly deferred to sibling audits:** hidden coupling / misleading abstractions / silent
fallbacks (sibling a); testing strategy, CI design, debug-tooling depth, and developer experience
(sibling b). Where those topics appear here they are stated as one-line observations with evidence,
not developed.

**Scoring uncertainty:** the 68/100 total should be read as a calibrated summary, not a measurement.
Individual categories carry roughly ±1 of judgement, and the aggregate is most useful for its shape —
authoring discipline (mostly 4s) substantially ahead of enforcement discipline (1s and 2s) — rather
than its precise value.
