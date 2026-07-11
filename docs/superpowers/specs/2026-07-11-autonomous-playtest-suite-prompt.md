# Comprehensive Prompt: Plan a Full Autonomous Dungeon-Crawler Test Suite

> Pass this entire prompt to an advanced coding/QA LLM. It is self-contained and points to the relevant source files. The desired output is a **detailed implementation plan**, not code.

---

## Role and task

You are an expert TypeScript game engineer and QA automation architect. Your job is to:

1. Read and analyze the project context and source files listed below.
2. Design a plan for a **comprehensive, autonomous browser-based playtest suite** for OnyxLabyrinth.
3. Identify the highest-value test scenarios, technical challenges, and tooling choices.
4. Present a detailed, actionable plan document that a later implementer can execute.

Do not write the implementation code or tests yet. Produce a **plan document** and, if the user approves, a follow-up implementation prompt.

---

## Project context

**OnyxLabyrinth** is a browser-based first-person dungeon crawler written in TypeScript with Vite, vanilla HTML/CSS, and a hand-drawn DOM + 2D canvas renderer.

- **Entry:** `src/main.ts`
- **Build:** `npm run build` (must pass TypeScript with zero errors)
- **Tests:** `npm test` (Vitest unit tests)
- **Dev server:** `npm run dev`
- **Production preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/`
- **Deployment:** GitHub Pages serves the `docs/` folder.

Read `AGENTS.md` in the project root first. It documents hard rules, verification checklists, and common pitfalls. Do not propose changes that violate those rules (e.g., do not remove visual effects, do not change core game logic unless required, build/test must pass).

---

## Required reading

Read these files in order before writing the plan:

1. `AGENTS.md` — project conventions and hard rules.
2. `src/main.ts` — game bootstrap, mode switching, post-combat XP/level-up flow, save/load.
3. `src/engine/input.ts` — all keyboard bindings for dungeon exploration.
4. `src/engine/shell.ts` — DOM shell, canvas structure, mode visibility, party strip rendering.
5. `src/game/state.ts` — `GameState` factory and fields.
6. `src/engine/camera.ts` — movement, turning, collision, door unlock.
7. `src/game/dungeon.ts` — grid model, edge helpers, carving.
8. `src/engine/combat-ui.ts` — FF6 combat controller and key handlers.
9. `src/engine/combat-select-action-view.ts` — combat menu DOM renderer.
10. `src/engine/perk-select-ui.ts` — perk selection overlay.
11. `src/engine/save-ui.ts` — save/load menu controller.
12. `src/engine/party-ui.ts` — party creation controller.
13. `src/game/combat.ts` — combat resolver, damage formulas, flee, status effects.
14. `src/game/features.ts` — tile features, traps, chests, events, water.
15. `src/game/perks.ts` — perk definitions, hook dispatcher, pending perk choices.
16. `src/game/leveling.ts` — `xpForNextLevel`, `levelUpChar`.
17. `src/game/save.ts` — save format, serialization, migrations.
18. `package.json` — available scripts and dependencies (check for Playwright/Puppeteer).

---

## Current state of the game

### What already works

- The game boots into party creation, then town, then dungeon.
- Dungeon exploration uses arrow keys / WASD for movement/turning and single-letter keys for camp/map/town/unlock/grimoire/menu.
- Combat is FF6-style: enemies left, party right, menu-driven turns with immediate playback.
- Party creation, town, camp, save/load, game-over, and perk-select are DOM overlays that borrow `"title"` mode.
- The class-perks/stat-refactor was recently completed:
  - `effectiveStats()` aggregates base + equipment + perk modifiers.
  - Level-ups happen immediately after combat victory.
  - A perk selection overlay appears when a character reaches level 3, 6, 9, or 12.
  - Save format v6 stores `perkIds` per character.
- Unit tests cover math, combat resolution, save serialization, etc., but there is **no end-to-end browser automation suite yet**.

### Browser automation tools available to the agent

The runtime exposes Playwright- and Puppeteer-style browser tools:

- `mcp__playwright__browser_navigate` — load a URL.
- `mcp__playwright__browser_snapshot` — read the accessibility/DOM tree.
- `mcp__playwright__browser_click`, `browser_type`, `browser_press_key` — input.
- `mcp__playwright__browser_evaluate` — run arbitrary JS in the page context.
- `mcp__playwright__browser_take_screenshot` — capture the viewport or full page.
- `mcp__playwright__browser_console_messages` — read browser console logs.
- `mcp__puppeteer__puppeteer_navigate`, `puppeteer_evaluate`, `puppeteer_screenshot`, etc.

You may also use `Bash` to start the dev server or production preview in the background, and `Read`/`Grep`/`Glob` for code exploration.

---

## Goals for the playtest suite

Design a system that can, with minimal human intervention:

1. **Boot the game** in a real browser from a fresh state.
2. **Create a party** (default or custom) and enter the dungeon.
3. **Navigate the dungeon** autonomously using available state (DOM, injected JS, or canvas pixel analysis).
4. **Detect and survive combat** with heuristic or scripted decision-making.
5. **Verify core flows:** level-up after combat, HP/SP restoration, perk selection, save/load round-trip, town interactions, trap handling.
6. **Collect telemetry** (screenshots, logs, state snapshots, win/loss rates, level progression, deaths) for later analysis.
7. **Fail gracefully** on assertions and produce actionable reports.
8. **Run in CI** eventually (headless browser, deterministic seeding where possible, timeout guards).

---

## Scope tiers to consider

Your plan should cover at least these tiers and explain how they build on each other:

### Tier 1 — Smoke tests
- Game boots and reaches dungeon view without console errors.
- Party creation can be completed.
- A single step forward/backward/turn works.
- Entering and fleeing combat works.
- Town can be opened and exited.

### Tier 2 — Feature regression tests
- Level-up after combat victory restores HP and SP.
- Reaching level 3 opens the perk selection overlay.
- Choosing a perk stores it on the character.
- Save/load preserves levels and perks.
- Trap disarm/avoid uses effective stats.
- Spell damage/healing scales with INT/PIE.
- Equipment stat bonuses affect combat.

### Tier 3 — Combat sampler
- Run many fights with fixed or seeded parties.
- Record win/loss, average damage taken/dealt, flee success rate, crit rate.
- Detect crashes, soft-locks, or infinite loops during combat playback.

### Tier 4 — Autonomous dungeon crawler
- Navigate multiple floors without human input.
- Use a policy such as:
  - Wall-following / right-hand rule.
  - Map exploration based on `state.explored`.
  - Flee when party HP is low; camp to recover when safe.
  - Return to town to save or revive.
- Reach a target floor or die trying, then report what happened.

### Tier 5 — Stress / edge-case tests
- Very high AGI / LUK / STR characters.
- Cursed gear force-equip behavior.
- Anti-magic and darkness zones.
- NPC interactions (talk, barter, steal, attack).
- Game-over and continue flow.

---

## Key technical questions your plan must answer

1. **State access:** How does the test read the game state?
   - Option A: Inject a small `window.__TEST__` bridge in dev builds only.
   - Option B: Read only the DOM (party strip, `#message`, combat windows, etc.).
   - Option C: Use canvas pixel analysis for corridor/combat state.
   - Option D: Combination of the above.
   Recommend one and justify it.

2. **Determinism:** How do we make runs reproducible?
   - Can the RNG be seeded for tests?
   - Should we inject deterministic party stats?
   - How do we handle random encounters?

3. **Navigation intelligence:** How does the crawler know where walls and passages are?
   - Use `state.floor` grid via injected JS?
   - Parse the auto-map canvas?
   - Run a blind wall-follower with collision feedback?

4. **Combat automation:** How does the bot choose actions?
   - Simple policy: always Attack / flee when low HP.
   - Class-based policy: Fighter attacks, Mage casts, Priest heals.
   - Random-but-valid actions.

5. **Assertion framework:** How do we verify invariants without halting the game?
   - Console-error watchers.
   - DOM state assertions.
   - Injected JS invariant checks.
   - Screenshot diffing at checkpoints.

6. **CI integration:** How should the suite be run in continuous integration?
   - Headless browser flag.
   - Timeout per scenario.
   - Artifact collection (screenshots, logs).

7. **Safety:** How do we avoid mutating git history or leaving background servers running?
   - Explicit cleanup steps.
   - No `git commit`/`git push` without user approval.

---

## Deliverables

Your output must be a plan document (Markdown) saved to:

```
docs/superpowers/specs/2026-07-11-autonomous-playtest-suite-plan.md
```

The plan must include:

1. **Executive summary** — what the suite will do and why.
2. **Architecture** — test runner, browser harness, state bridge (if any), scenario definitions, assertion helpers, reporting.
3. **Tooling recommendation** — Playwright vs. Puppeteer vs. Vitest browser mode, with justification.
4. **Scenario catalog** — a concrete list of scenarios per tier, each with:
   - Goal
   - Preconditions
   - Steps
   - Expected outcome
   - How to verify it
5. **State-access strategy** — exactly how the test reads game state and what (if anything) must be added to the game code.
6. **Determinism strategy** — how to seed/inject state for reproducible runs.
7. **Navigation policy** — detailed algorithm for the autonomous crawler tier.
8. **Combat policy** — detailed action-selection algorithm.
9. **Implementation phases** — ordered milestones with exit criteria.
10. **Risk register** — what could go wrong and mitigations.
11. **Files to create/modify** — list of new files and any changes to existing source.
12. **Follow-up implementation prompt** — a concise prompt that could be handed to another LLM to implement Phase 1 of the plan.

---

## Constraints

- Do **not** change core game logic (movement, collision, combat math, encounter rates, map data) unless the change is a minimal, test-only bridge and is gated behind `process.env.NODE_ENV === "test"` or similar.
- Do **not** remove existing visual effects.
- Do **not** mutate git history unless explicitly asked.
- Build (`npm run build`) and unit tests (`npm test`) must continue to pass.
- Keep new test code isolated (e.g., under `tests/e2e/` or `src/e2e/`).
- Do not commit unless explicitly asked; the deliverable is the plan document.

---

## Output format

Begin your response with:

```markdown
## Plan: Autonomous Dungeon-Crawler Test Suite

### Executive summary
...

### Architecture
...
```

Then fill in every section listed in Deliverables. Save the complete document to the path above and report the file path in your final message.

If you discover that the project is missing a dependency (e.g., Playwright is not installed), note it in the plan but do not install it without user approval.
