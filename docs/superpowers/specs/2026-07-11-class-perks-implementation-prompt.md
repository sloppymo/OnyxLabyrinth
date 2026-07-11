# Comprehensive Implementation Prompt: Class Perks + Stat Refactor

> Pass this entire prompt to an advanced coding LLM. It is self-contained and points to the design spec and relevant source files.

---

## Role and task

You are an expert TypeScript game engineer. Your job is to:

1. Read and analyze the design document at `docs/superpowers/specs/2026-07-11-class-perks-design.md`.
2. Identify any contradictions, missing details, or implementation risks in the design.
3. Present a brief analysis and any proposed changes to the user **before writing code**.
4. Once the user approves, implement the entire system end-to-end.
5. Verify the build, tests, and relevant in-game behavior.

Do not skip the analysis step. The user wants to see your reasoning before code changes begin.

---

## Project context

This is **OnyxLabyrinth**, a browser-based first-person dungeon crawler written in TypeScript with Vite, vanilla HTML/CSS, and a hand-drawn DOM + 2D canvas renderer.

- **Entry:** `src/main.ts`
- **Build:** `npm run build` (must pass TypeScript with zero errors)
- **Tests:** `npm test` (Vitest)
- **Dev server:** `npm run dev`
- **Production preview:** `npx vite preview --port 5176 --base /OnyxLabyrinth/`

Read `AGENTS.md` in the project root before touching code. In particular:

- Run `npm run build` before claiming any fix is complete.
- Run `npm test` before claiming any combat/save/party/renderer-math change is complete.
- Do not change game logic (movement, collision, combat math, encounter rates, map data) unless explicitly asked.
- Do not remove existing visual effects.
- Do not mutate git history unless asked.
- Remove `console.log`, `window.__` exposures, `debugger`, and temporary timing hooks before committing.
- Update `AGENTS.md` if you change conventions it documents.

---

## Required reading

Read these files in order before planning implementation:

1. `docs/superpowers/specs/2026-07-11-class-perks-design.md` — the full design spec.
2. `AGENTS.md` — project conventions and hard rules.
3. `src/game/party.ts` — `Character`, `Stats`, `RACES`, `CLASSES`, `createCharacter`, `computeMaxHp`, `computeMaxSp`.
4. `src/game/combat.ts` — combat resolver, damage formulas, `Loadout`, `equipItem`, `canReach`, initiative, crit, flee.
5. `src/engine/town-ui.ts` — current leveling logic: `xpForNextLevel`, `levelUpChar`, `doTraining`.
6. `src/game/save.ts` — save format version, migration logic, serialization.
7. `src/game/state.ts` — `GameState` factory and initial fields.
8. `src/engine/shell.ts` — DOM shell helpers for overlays/modes.
9. `src/main.ts` — post-combat XP award flow and mode switching.
10. `src/engine/combat-ui.ts` and `src/engine/combat-select-action-view.ts` — existing menu/overlay patterns.

---

## Implementation scope

Implement everything described in the design doc:

### A. Stat system refactor

- Create `src/game/effective-stats.ts` with `effectiveStats(character, loadout, perks)`.
- Aggregate base stats + racial modifiers + equipment `statBonuses` + perk stat modifiers.
- Update combat formulas in `src/game/combat.ts` to use effective stats for:
  - Melee damage (`STR`)
  - Initiative (`AGI`, tie-break `LUK`)
  - Crit chance (`LUK`, capped at 25%)
  - Flee success (`AGI`)
  - Physical evasion (`AGI`)
  - Spell damage/healing (`INT` for Mage, `PIE` for Priest)
- Update `levelUpChar` in `src/engine/town-ui.ts` to use effective VIT/INT/PIE for HP/SP growth.
- Update trap disarm/avoid logic in `src/game/features.ts` to use the new trap check formula.
- Ensure the town Training Grounds still works but is no longer the only place level-ups happen.

### B. Perk data and hook system

- Create `src/data/perks.ts` defining all perks from the design doc using the structured schema.
- Create `src/game/perks.ts` with:
  - A `PerkDef` type and `PERKS_BY_ID` map.
  - A `perksForCharacter(character)` helper.
  - A hook dispatcher (`dispatchHook(state, hook, context)`) that runs matching perk listeners in priority order.
  - Individual perk handlers for every implemented perk.
- Implement at minimum these representative perks fully:
  - `fighter-cleave`
  - `fighter-protector`
  - `fighter-last-stand`
  - `fighter-warmaster`
  - `mage-spell-echo`
  - `mage-arcane-surge`
  - `mage-archmage`
  - `priest-guardian-angel`
  - `priest-martyr`
  - `thief-ambusher`
  - `thief-shadow`
  - `halberdier-hold-the-line`
  - `duelist-momentum`
  - `crusader-paladin`
- For perks you do not fully implement, provide a no-op or simple numeric stub and mark them with a `// TODO(v1.1)` comment.

### C. Immediate level-ups after combat

- In `src/main.ts`, after combat victory and XP/gold award:
  - Check each living character for level-up eligibility.
  - Apply `levelUpChar` immediately.
  - Queue any characters who reached a perk tier (3/6/9/12).
  - Show a victory summary that includes level-ups.
- Remove the requirement to visit town training for level-ups. Keep the Training Grounds UI as an informational screen or convert it to a perk-review screen.

### D. Perk selection overlay

- Create `src/engine/perk-select-ui.ts`.
- Render a modal over the dungeon view after combat when the perk queue is non-empty.
- Show one character at a time with their two tier perks.
- Support arrow-key selection and Enter confirmation.
- Store the chosen `perkId` on the character and advance to the next queued character.
- Close and return to dungeon when the queue is empty.

### E. Save/load

- Bump `SAVE_VERSION` from 5 to 6 in `src/game/save.ts`.
- Add `perkIds: string[]` to serialized characters.
- Add a v5 → v6 migration that initializes `perkIds: []`.
- Ensure `effectiveStats` is recomputed on load (no persistent derived stats).

### F. Tests

Add or update tests in the existing Vitest style:

- `src/game/effective-stats.test.ts` — base, equipment, racial, and perk modifiers.
- `src/game/perks.test.ts` — hook dispatcher and representative perk behavior.
- `src/game/save.test.ts` — v5 → v6 migration and round-trip with perks.
- `src/engine/perk-select-ui.test.ts` — overlay renders choices and stores selection.

---

## Suggested implementation order

1. **Stat refactor** — `effectiveStats` + combat formula updates. This is the foundation.
2. **Perk data model** — `PerkDef`, `PERKS_BY_ID`, and the hook dispatcher.
3. **Immediate level-up flow** — post-combat level-up in `main.ts`.
4. **Perk selection UI** — `perk-select-ui.ts`.
5. **Save/load** — version bump and migration.
6. **Tests** — cover the above.
7. **Build + test pass** — `npm run build && npm test`.
8. **In-game verification** — start the game, win a fight, verify level-up/HP restore/perk choice.

---

## Verification checklist

Before claiming completion, confirm:

- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] `npm test` passes (all existing + new tests).
- [ ] A character leveling up after combat restores HP and SP to full.
- [ ] Reaching level 3 opens the perk selection overlay in dungeon mode.
- [ ] Choosing a perk stores it and the overlay advances/closes correctly.
- [ ] Save/load preserves chosen perks.
- [ ] Equipment with `statBonuses` now affects combat math.
- [ ] AGI affects flee success and physical evasion.
- [ ] INT/PIE boost spell damage/healing.
- [ ] LUK crit chance is capped at 25%.

For combat/perk changes, also run the game in a browser and verify at least one representative perk (e.g., Fighter Cleave or Mage Spell Echo) triggers visibly.

---

## Output format

### Phase 1 — Analysis

Present your analysis as:

```markdown
## Analysis of class-perks-design.md

### Strengths
...

### Risks / open questions
...

### Proposed changes (if any)
...

### Implementation approach summary
...
```

Wait for the user to approve any changes before Phase 2.

### Phase 2 — Implementation

After approval, implement the system. As you work, update a TODO list and report progress concisely. When done, provide:

```markdown
## Implementation complete

### Files changed
- ...

### Verification results
- Build: pass/fail
- Tests: X passed
- In-game check: ...

### Notes for the user
- Any follow-up work, balance concerns, or known TODOs.
```

---

## Important constraints

- Do **not** change movement, collision, encounter rates, floor data, or core combat math beyond what is required for stats and perks.
- Do **not** add active combat abilities or new menu buttons during combat.
- Do **not** remove existing visual effects (fog, glow lines, vignette, CRT scanlines).
- Keep changes scoped to the perk/stat system. Unrelated refactors should be avoided.
- Match existing code style: `const`, explicit types, conventional commits.
- Do not commit until `npm run build` and `npm test` both pass.

---

## If you find problems

If the design is ambiguous or would require changes that violate `AGENTS.md` (e.g., a perk requires a broad combat rewrite), stop and ask the user. Do not silently redesign.
