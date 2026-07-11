# Ultimate Autonomous Test Suite Design: OnyxLabyrinth

> A comprehensive QA automation architecture for the OnyxLabyrinth browser-based dungeon crawler. This document covers testing philosophy, the full testing pyramid, autonomous playtesting AI, property/fuzz/snapshot/rendering/save/balance testing, AI-agent integration, and a phased implementation roadmap.

---

## Phase 1 — Architecture Analysis

### Project stack

- **Language / build:** TypeScript, Vite, `npm run build` (`tsc && vite build`).
- **Test runner:** Vitest for unit/integration tests.
- **UI:** Vanilla HTML/CSS, hand-drawn DOM + 2D canvas corridor renderer.
- **Entry:** `src/main.ts` mounts into `#app`.
- **State:** Single mutable `GameState` object in `src/main.ts`, mutated by input handlers and UI controllers. Combat uses a cloned `CombatState`.
- **Modes:** `title | party_creation | town | dungeon | combat | camp | game_over`.
- **Rendering:** Canvas-based first-person raycaster (`src/engine/renderer.ts`) + auto-map (`src/engine/automap.ts`) + FF6 combat scene (`src/engine/combat-scene.ts`).
- **Audio:** Procedural Web Audio (`src/engine/audio.ts`).
- **Save:** localStorage, version 6, with migrations.

### Major systems and fragility

| System | Location | Fragility / regression risk |
|--------|----------|----------------------------|
| Corridor renderer | `src/engine/renderer.ts` | Canvas pattern lifecycle, far-to-near ordering, front-wall depth 0, camera animation. |
| Render math | `src/engine/render-math.ts` | Geometry, fog, camera interpolation. Already well unit-tested. |
| Camera / movement | `src/engine/camera.ts` | Collision, door unlock, turning. Untested directly. |
| Input bindings | `src/engine/input.ts` | Single key map; easy to break a binding. Untested. |
| Tile features | `src/game/features.ts` | Traps, water, events, floor transitions, `pendingTrap` gating. |
| Combat resolver | `src/game/combat.ts` | Damage formulas, initiative, crit/flee/evasion, perks, events. Complex and balance-sensitive. |
| Combat UI / scene | `src/engine/combat-ui.ts`, `combat-scene.ts`, `combat-select-action-view.ts` | DOM/canvas choreography, mode transitions, sprite caching. |
| Perks | `src/game/perks.ts`, `src/data/perks.ts` | Hook dispatcher, modifiers, many v1.1 stubs. |
| Effective stats | `src/game/effective-stats.ts` | Equipment + perk aggregation. |
| Leveling | `src/game/leveling.ts` | HP/SP growth, spell grants. |
| Party | `src/game/party.ts` | Creation, status, KO/revive. |
| Save/load | `src/game/save.ts` | Version migrations, Set serialization, floor restoration. |
| UI controllers | `src/engine/*-ui.ts` | Mode overlays, controller lifecycle, borrowed `"title"` mode. |
| Data layer | `src/data/*.ts` | Enemy encounters, items, spells, floors, perks. |

### Pure vs. DOM-coupled

- **Pure / deterministic:** `game/dungeon.ts`, `game/combat.ts` (with injected RNG), `game/perks.ts` modifiers, `game/effective-stats.ts`, `game/leveling.ts`, `game/npc.ts`, `game/save.ts`, `render-math.ts`, `data/*`.
- **DOM-coupled / side-effecting:** `main.ts`, `engine/renderer.ts`, `engine/shell.ts`, `engine/automap.ts`, `engine/audio.ts`, `engine/*-ui.ts`, `engine/combat-scene.ts`.

### Determinism

- `combat.ts` accepts an `Rng` function; tests can pass seeded PRNGs.
- Most other systems use `Math.random` with no global seed. A fully deterministic end-to-end run requires injecting a seeded RNG at every random site or accepting statistical testing.

### Existing coverage

- 411 unit tests across 20 files.
- Gaps: `main.ts` orchestration, renderer visuals, audio, input, camera, automap, most full-screen UI controllers, mode-transition integration, screenshot regression.

---

## Phase 2 — Testing Philosophy

### What should be tested

1. **Invariants that must never break:** damage non-negativity, HP clamping, save compatibility, inventory count integrity, front-wall rendering.
2. **Behavioral contracts:** combat event emission matches log output, `effectiveStats` aggregates bonuses correctly, leveling restores HP/SP.
3. **Mode transitions:** dungeon → combat → dungeon, combat → game-over → continue, town → dungeon, save/load preserves state.
4. **Balance-sensitive formulas:** crit cap, flee chance curve, spell damage scaling, trap disarm bonus.
5. **Rendering correctness:** no black walls, no ceiling blackout from message overlay, combat sprite visibility.
6. **Save migrations:** every old version must load and produce a valid current state.

### What should not be tested

1. **Purely aesthetic details** unless they are regression-prone (e.g., exact pixel values of glow intensity).
2. **Audio waveforms** beyond "sound plays without throwing" and basic timing.
3. **Exact `Math.random` outcomes** outside seeded runs; use statistical properties instead.
4. **Internal implementation details** that do not affect player-visible behavior.

### Test granularity

- **Unit tests:** single pure functions (`render-math`, `effectiveStats`, damage rolls, save serialization helpers).
- **Integration tests:** system pipelines (combat turn resolution, trap handling, floor transition, save/load round-trip).
- **Simulation tests:** headless game loops running thousands of encounters.
- **End-to-end browser tests:** mode transitions, UI interactions, screenshots.
- **Property tests:** universal invariants across randomized inputs.
- **Fuzz tests:** chaotic invalid inputs to find crashes.

### Deterministic vs. randomized testing

- **Deterministic:** Use for regressions, snapshot tests, balance baselines. Requires seeded RNGs or fixed fixtures.
- **Randomized / statistical:** Use for balance analysis, encounter sampling, exploit detection. Report distributions, not single outcomes.
- **Hybrid:** Run deterministic seeds for CI stability, plus nightly randomized simulation runs for balance.

### Regression prevention strategy

- Every new system gets an integration test.
- Every bug fix gets a regression test.
- Every renderer change gets a visual screenshot comparison.
- Every save version bump gets a migration round-trip test.
- Every perk/combat change gets a simulation sample.

### How AI-generated code should interact with tests

- AI agents must run `npm test` before claiming completion.
- AI agents must run `npm run build` before committing.
- AI agents modifying a subsystem must run the subsystem's simulation tests (e.g., combat → `npm run test:combat-sim`).
- CI gates prevent merging if any test tier fails.

---

## Phase 3 — Testing Pyramid

### 1. Unit Tests (base layer)

Already strong; extend into uncovered pure modules.

#### New unit test files

- `src/engine/input.test.ts` — verify every `KEY_MAP` entry calls the correct handler.
- `src/engine/camera.test.ts` — movement collision, turning wrap, door unlock with/without key, thief pick.
- `src/engine/automap.test.ts` — verify explored tiles render, wall/door icons, player marker.
- `src/engine/audio.test.ts` — mock `AudioContext`, assert nodes are created and no exceptions.
- `src/game/save-helpers.test.ts` — serialize/deserialize edge cases (empty sets, missing fields).

#### Example unit test cases

```ts
// input.test.ts
it("maps ArrowUp to onForward", () => {
  const handlers = { onForward: vi.fn(), /* ... */ };
  const unbind = bindInput(window, handlers);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
  expect(handlers.onForward).toHaveBeenCalled();
  unbind();
});

// camera.test.ts
it("blocks movement into walls", () => {
  const state = createGameState(FLOORS[0]);
  state.player.x = 1; state.player.y = 1; state.player.facing = 0;
  // wall north of (1,1)
  state.floor.grid[1][1].edges[0] = "wall";
  moveForward(state);
  expect(state.player.y).toBe(1);
});
```

### 2. Integration Tests

Test multi-system pipelines.

#### New integration test files

- `src/game/combat-integration.test.ts` — full round pipelines: attack → damage → status → death → XP.
- `src/game/features-integration.test.ts` — trap chest flow, water swim/levitate, floor transition.
- `src/game/perks-integration.test.ts` — every implemented reactive perk triggers correctly in combat.
- `src/game/save-integration.test.ts` — save in dungeon, load, verify state round-trip including explored tiles and killed NPCs.
- `src/main.integration.test.ts` — JSDOM-based mode transition tests (optional; e2e is better here).

#### Example integration test

```ts
it("defeating an enemy awards XP and can level up the party", () => {
  const state = createCombatFromEncounter(party, ["goblin"], { rng: makeRng(0.01) });
  const result = resolveCombatRound(state, [
    { kind: "attack", actorId: fighter.id, targetId: goblinId },
    /* ... */
  ], seededRng);
  expect(result.victory).toBe(true);
  expect(result.party.some(c => c.xpGained > 0)).toBe(true);
});
```

### 3. Simulation Tests (headless game loop)

Create a deterministic headless runner that executes game logic without the browser.

#### Architecture

```
packages/simulator/
  src/
    runner.ts          # Orchestrates a full adventure
    policies.ts        # Action-selection policies
    reporter.ts        # Aggregates metrics
    fixtures.ts        # Seeded parties, floors, RNGs
  tests/
    combat-sampler.test.ts
    dungeon-crawl.test.ts
    balance.test.ts
```

#### Capabilities

- Create random parties with seeded stat rolls.
- Equip random gear from item tables.
- Assign random perks.
- Run deterministic combat encounters.
- Explore dungeon grids using wall-following or map-aware navigation.
- Record outcomes: wins/losses, levels gained, gold, deaths, soft-locks.

#### Example simulation scenario

```ts
it("runs 1000 seeded fighter-vs-goblin encounters", () => {
  const report = runCombatSampler({
    party: seededFighterParty(),
    enemyIds: ["goblin"],
    rounds: 1000,
    policy: "attack-nearest",
    rngSeed: 12345,
  });
  expect(report.winRate).toBeGreaterThan(0.85);
  expect(report.avgRounds).toBeLessThan(8);
  expect(report.crashes).toBe(0);
});
```

---

## Phase 4 — Autonomous Playtesting AI

### Agent architecture

```
┌─────────────────┐
│  State Observer │  ← DOM + injected JS bridge + console watcher
└────────┬────────┘
         │
┌────────▼────────┐
│ Decision Engine │  ← Rule-based policy + optional ML heuristic
└────────┬────────┘
         │
┌────────▼────────┐
│ Action Executor │  ← Playwright keypress / click
└────────┬────────┘
         │
┌────────▼────────┐
│ Result Analyzer │  ← Screenshot / state diff / metric logging
└────────┬────────┘
         │
┌────────▼────────┐
│  Feedback Loop  │  ← Retry, mutate strategy, report exploit
└─────────────────┘
```

### State observer

Three observation channels:

1. **DOM reader:** parse `#message`, party strip HP/SP, combat window text, mode visibility.
2. **Injected JS bridge:** expose a minimal `window.__TEST_BRIDGE__` in dev/test builds that returns:
   - `getState()` — deep-readonly snapshot of the `GameState`.
   - `getCombatState()` — current `CombatState` if in combat.
   - `getMode()` — current mode.
3. **Console watcher:** capture `error` / `warn` logs and fail on uncaught exceptions.

### Decision engine policies

#### Dungeon exploration policy

```ts
function chooseExplorationAction(state: GameState): GameInput {
  if (state.pendingTrap) return handleTrap(state);
  if (lowHp(state.party)) return "town";
  if (canMoveForward(state)) return "forward";
  if (canTurnAndMove(state)) return turnToPassage(state);
  return "turnLeft"; // wall-follower fallback
}
```

#### Combat policy

```ts
function chooseCombatAction(state: CombatState, actor: Character): PlayerAction {
  if (actor.class === "priest" && allyBelowHalf(state, actor)) return healWeakest();
  if (actor.class === "mage" && state.enemies.length > 1) return aoeSpell();
  if (actor.hp < actor.maxHp * 0.25 && canFlee(state)) return flee();
  return attackWeakestEnemy();
}
```

#### Exploit-hunting policy

- Try cursed-gear duplication, spell-spam, infinite flee loops.
- Attempt invalid state transitions (open save menu mid-combat via injected JS).
- Verify invariants after each action.

### Action executor

Use Playwright to send keys and clicks. Map game inputs to Playwright `keyboard.press` calls.

### Result analyzer

- Screenshot on every mode transition and every N steps.
- Log HP/SP/XP/gold deltas per action.
- Detect soft-locks (no mode change after timeout, no valid input accepted).
- Detect impossible states (negative HP, duplicate entity ids, cursed item unequipped).

---

## Phase 5 — Property-Based Testing

Use a property-based library (e.g., `fast-check`) or custom generators.

### Property test catalog

#### Combat

- `∀ attack, damage ≥ 0`.
- `∀ target with hp ≤ 0, target cannot act`.
- `∀ crit roll, crit chance ≤ 25%`.
- `∀ revive, old KO count decreases by 1 and no duplicate character appears`.
- `∀ status effect, blinded actor hit chance ≤ base hit chance`.

#### Inventory

- `∀ item removal, inventory count decreases by exactly removed quantity`.
- `∀ equipment change, effective stats update monotonically with bonus sign`.
- `∀ cursed item pickup, the item occupies its slot and cannot be displaced by normal equip`.

#### Character

- `∀ level-up, maxHp ≥ old maxHp and maxSp ≥ old maxSp`.
- `∀ effectiveStats, each stat ≥ 1`.
- `∀ class, starting spells match class spell table`.

#### Map

- `∀ generated cloned floor, a path exists from start to stairs (BFS)`.
- `∀ locked door, a key of matching color exists somewhere accessible or a thief is in party`.

#### Save

- `∀ save version ≤ current, deserialize(serialize(state)) produces equivalent state`.

---

## Phase 6 — Fuzz Testing

### Fuzz targets

- `effectiveStats` with extreme `statBonuses`.
- `levelUpChar` at level 99 with max/min growth modifiers.
- `resolveCombatRound` with invalid `PlayerAction` shapes.
- `deserialize` with corrupted/missing fields.
- `handleTileFeature` with every feature type stacked on one tile.
- `equipItem` with cursed + non-cursed swaps.

### Invariant harness

```ts
function fuzzCombat(seed: number) {
  const party = randomParty(seed);
  const enemies = randomEnemies(seed);
  const state = createCombatFromEncounter(party, enemies);
  for (let i = 0; i < 100; i++) {
    const actions = randomValidActions(state, seed + i);
    state = resolveCombatRound(state, actions);
    assertInvariants(state); // no negative HP, no duplicate ids, etc.
    if (state.ended) break;
  }
}
```

---

## Phase 7 — Snapshot and Regression Testing

### Snapshot types

1. **Combat state snapshots:** given seed + party + enemy formation, the resulting `CombatState` after N rounds should match a golden snapshot.
2. **Save snapshots:** every version's sample save deserializes to a known current-state shape.
3. **Map snapshots:** cloned floors from a seed produce identical grids.
4. **Character creation snapshots:** same race/class/rolls produce identical stats.

### Snapshot workflow

- Store golden snapshots in `tests/snapshots/`.
- CI compares new runs against goldens; failures require human review.
- Provide `npm run test:update-snapshots` to refresh after intentional balance changes.

### Regression tests for fixed bugs

Every bug fix gets a test named after the issue, e.g.:

```ts
it("regression: cursed item no longer duplicates on save-load", () => {
  // repro steps
});
```

---

## Phase 8 — Rendering Tests

### Visual regression pipeline

1. **Capture:** Playwright navigates to the game, reaches a scenario, takes a screenshot.
2. **Compare:** Pixelmatch against golden screenshot with a small per-pixel diff tolerance.
3. **Report:** Diff image + threshold exceeded pixels.

### Rendering scenario catalog

| Scenario | How to reach | What to verify |
|----------|--------------|----------------|
| Straight corridor | Fresh dungeon, face north into long hall | Walls/floor/ceiling textured, no black box |
| Open side passage | Walk to a T junction | Side void has floor/ceiling |
| Front wall depth 0 | Walk up to a wall | Textured surface, no black rectangle |
| Floor checkerboard | Walk forward several tiles | Alternating A/B tiles visible |
| Darkness zone | Step into darkness feature | Render distance reduced, no crash |
| Map overlay | Press `M` | Auto-map visible, corridor canvas not corrupted |
| Combat start | Trigger encounter | Enemies left, party right, three bottom windows |
| Combat action | Confirm attack | Walk/attack/hurt/damage popup sequence |
| Spell banner | Cast spell | Banner window + burst effect |
| Target cursor | Open target selection | Blinking marker over highlighted target |
| Victory result | Win fight | Gold/XP centered window |
| Perk selection | Reach level 3 | Two perk cards visible, cursor moves, choice persists |

### Tolerance handling

- Use CSS device pixel scaling fixed at 1x for CI.
- Ignore time-based effects (torch flicker, particles) by pausing animations or masking regions.
- Allow small anti-aliasing tolerance (≤ 0.1 per-pixel diff).

---

## Phase 9 — Save Compatibility Testing

### Save fixture library

Create a fixture for every save version ever shipped:

```
tests/fixtures/saves/
  v4-minimal.json
  v4-full.json
  v5-minimal.json
  v5-full.json
  v6-minimal.json
  v6-full.json
  corrupted/
    missing-perkIds.json
    invalid-inventory.json
    unknown-version.json
```

### Test cases

- Every old fixture loads to current `GameState` without throwing.
- Round-trip: `deserialize(serialize(load(fixture)))` is equivalent to `load(fixture)`.
- Corrupted saves are rejected gracefully with a user-facing message.
- Auto-save slot never corrupts on partial writes (simulate localStorage failure).

---

## Phase 10 — Balance Testing Framework

### Metrics to collect

#### Per class

- Average damage per round.
- Effective HP / survivability.
- SP efficiency.
- Win rate vs. each floor.

#### Per perk

- Pick rate (if chosen by AI policy).
- Win rate delta when picked vs. not picked.
- Synergy score (win rate with paired perks).

#### Per enemy

- Player party average damage taken.
- Kill speed.
- Number of rounds before first KO.

#### Per item

- Damage/healing efficiency per gold cost.
- Usage frequency.

### Reporting

Generate `balance-report.json` and a markdown summary after each simulation run:

```json
{
  "classes": { "fighter": { "winRate": 0.82, "avgRounds": 6.3 }, ... },
  "perks": { "fighter-cleave": { "winRateDelta": +0.07 }, ... },
  "enemies": { "goblin": { "avgDamageToParty": 12.4 }, ... }
}
```

### Balance gates

- CI fails if any class win rate on floor 1 drops below 70%.
- CI warns if any perk delta exceeds ±15%.

---

## Phase 11 — AI Coding Agent Integration

### Pre-commit checks

Before any code is accepted by an AI agent:

1. `npm run build` passes.
2. `npm test` passes.
3. `npm run test:integration` passes.
4. `npm run test:sim-smoke` passes (100 deterministic encounters).
5. No new `console.log` / `debugger` / `window.__` exposures.

### Affected-system detection

Create a mapping from file paths to test tags:

```json
{
  "src/engine/renderer.ts": ["visual", "renderer"],
  "src/game/combat.ts": ["combat", "balance", "simulation"],
  "src/game/save.ts": ["save", "migration"],
  "src/data/perks.ts": ["perks", "balance"]
}
```

When an AI modifies a file, the runner automatically invokes the tagged test suites.

### Invariant checklist for AI agents

Add an `INVARIANTS.md` file listing rules like:

- Damage cannot be negative.
- `pendingTrap` gates all dungeon input.
- Utility spells never appear in combat lists.
- Cursed gear cannot be displaced normally.
- Outside-combat damage floors HP at 1.

### Automated review prompts

After an AI change, run a small LLM-based reviewer (optional) that checks:

- Does the change modify `renderer.ts` without updating visual tests?
- Does the change add a new combat action without emitting a `CombatEvent`?
- Does the change alter save shape without bumping `SAVE_VERSION`?

---

## Phase 12 — Testing Infrastructure

### Recommended folder structure

```
OnyxLabyrinth/
├── src/                          # source code (unchanged)
├── tests/
│   ├── unit/                     # mirrors src/ structure
│   ├── integration/              # multi-system pipelines
│   ├── e2e/                      # Playwright browser tests
│   ├── simulation/               # headless adventure simulator
│   ├── property/                 # property-based tests
│   ├── fuzz/                     # chaos tests
│   ├── snapshots/                # golden snapshots
│   ├── fixtures/                 # saves, parties, maps
│   └── balance/                  # balance reports
├── tools/
│   ├── simulator/                # CLI for running simulations
│   ├── screenshot-capture/       # visual regression helper
│   └── balance-analyzer/         # report generator
├── playwright.config.ts
├── vitest.config.ts
└── .github/workflows/ci.yml
```

### Recommended tools

| Layer | Tool | Rationale |
|-------|------|-----------|
| Unit/Integration | Vitest | Already in use; fast; good TS support. |
| Browser e2e | Playwright | Built-in tools available; screenshots; trace viewer. |
| Property tests | fast-check | Mature JS property testing. |
| Visual diff | pixelmatch | Lightweight; works with Playwright screenshots. |
| Fuzzing | Custom + `fast-check` | Domain-specific generators are most effective. |
| Simulation | Custom TS runner | Needs tight integration with game state. |
| CI | GitHub Actions | Free for public repos; good artifact storage. |

### New npm scripts

```json
{
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "test:sim-smoke": "tsx tools/simulator/cli.ts --scenario smoke --count 100",
  "test:sim-balance": "tsx tools/simulator/cli.ts --scenario balance --count 10000",
  "test:property": "vitest run tests/property",
  "test:fuzz": "vitest run tests/fuzz",
  "test:visual": "playwright test tests/e2e/visual",
  "test:update-snapshots": "playwright test tests/e2e/visual --update-snapshots"
}
```

### CI pipeline

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run test:integration
      - run: npm run test:sim-smoke
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: screenshots
          path: tests/e2e/screenshots/
```

---

## Phase 13 — Implementation Roadmap

### Phase 1 — Foundation (week 1)

- Add missing unit tests for `input.ts`, `camera.ts`, `automap.ts`, `audio.ts`.
- Create `tests/integration/` and add combat/feature/save integration tests.
- Add `window.__TEST_BRIDGE__` dev-only state accessor behind `import.meta.env.DEV`.
- Set up Playwright config and a single smoke e2e test: boot → create party → enter dungeon → step forward.

**Exit criteria:** `npm test`, `npm run build`, and `npm run test:e2e` all pass with at least one e2e test.

### Phase 2 — Combat Automation (week 2)

- Build deterministic combat simulator in `tools/simulator/`.
- Add combat policy implementations.
- Add `test:sim-smoke` (100 seeded encounters).
- Add property tests for combat invariants.
- Add fuzz tests for combat resolver.

**Exit criteria:** 1000 encounters run without crashes; balance baseline established.

### Phase 3 — Full Dungeon Simulation (week 3)

- Implement map-aware navigation using injected `GameState`.
- Add floor transition handling, trap/chest policies, camp/town recall.
- Run 100 full-floor crawls seeded per floor.
- Detect soft-locks and unreachable areas.

**Exit criteria:** Crawler completes floor 1 in >80% of seeded runs or reports why it failed.

### Phase 4 — AI Playtester (week 4)

- Build autonomous Playwright agent with observer/decision/executor/analyzer loop.
- Add exploit-hunting policies.
- Add invariant checks after every action.
- Run nightly 30-minute autonomous sessions and collect reports.

**Exit criteria:** Agent explores dungeon, wins fights, handles perk selection, and reports any invariant violations.

### Phase 5 — Balance Analytics (week 5)

- Add metric collection to simulator.
- Generate balance reports.
- Add CI gates for class/perk/enemy win-rate thresholds.
- Tune thresholds with user input.

**Exit criteria:** Balance report is generated automatically on each PR.

### Phase 6 — Continuous Autonomous QA (week 6+)

- Nightly full simulation runs on CI.
- Visual regression suite for renderer/combat UI.
- Save-compatibility fixture library for every version.
- AI-agent pre-commit invariant checker.

**Exit criteria:** Every PR is gated by build, unit, integration, simulation smoke, e2e smoke, and visual diff tests.

---

## Final Deliverables

This design produces:

1. **Testing architecture document** — this file.
2. **Recommended tools/frameworks** — Vitest, Playwright, fast-check, pixelmatch, GitHub Actions.
3. **Test folder structure** — `tests/{unit,integration,e2e,simulation,property,fuzz,snapshots,fixtures,balance}`.
4. **Test categories** — unit, integration, simulation, property, fuzz, snapshot, visual, save compatibility, balance.
5. **Example test cases** — included in every phase above.
6. **Simulation architecture** — headless runner + policies + reporter in `tools/simulator/`.
7. **AI playtester architecture** — observer / decision engine / executor / analyzer / feedback loop.
8. **Balance analysis framework** — metrics + reports + CI gates.
9. **CI/CD integration plan** — GitHub Actions workflow with artifact uploads.
10. **Implementation roadmap** — 6 phases, weekly milestones, exit criteria.

### Estimated development effort

- Phase 1 (Foundation): ~1 week.
- Phase 2 (Combat automation): ~1 week.
- Phase 3 (Dungeon simulation): ~1 week.
- Phase 4 (AI playtester): ~1 week.
- Phase 5 (Balance analytics): ~1 week.
- Phase 6 (Continuous QA): ongoing.

Total MVP: **5–6 weeks** for one engineer; parallelizable across multiple agents.

### Highest-value tests to build first

1. **E2E smoke test** — catches boot/mode-transition crashes immediately.
2. **Combat simulator** — catches combat regressions and balance drift.
3. **Save round-trip tests** — protects player progress across versions.
4. **Property tests for combat invariants** — cheap and high-confidence.
5. **Visual regression for corridor and combat** — catches renderer regressions that unit tests miss.

### Risks and limitations

- **Determinism:** Full end-to-end determinism requires injecting seeded RNGs throughout. Without that, simulation results are statistical.
- **Canvas verification:** Pixel-perfect rendering tests can be brittle; use masks and tolerance.
- **Audio testing:** Web Audio is hard to assert beyond "no crash"; consider mocking.
- **Performance:** 10,000-encounter balance runs may be slow; run them in CI on schedule, not on every PR.
- **Maintenance:** Snapshot goldens must be updated after intentional visual changes.
- **AI agent misuse:** Agents might rely too heavily on simulation and skip visual verification; keep renderer/combat visual checklists in `AGENTS.md`.

### How future LLM coding agents should interact with this system

1. Read `AGENTS.md` and this design doc before modifying code.
2. Run `npm run build && npm test` after every change.
3. If modifying a subsystem, run the tagged simulation/integration tests.
4. If modifying `renderer.ts` or combat UI, run visual regression tests.
5. If modifying save shape, bump `SAVE_VERSION` and add a migration + fixture.
6. If fixing a bug, add a regression test.
7. Never commit broken code; CI gates enforce this.

---

## Next step

If this design is approved, the next action is to invoke the `writing-plans` skill and produce a concrete implementation plan for **Phase 1 — Foundation**, including file paths, exact test cases, and the dev-only state bridge.
