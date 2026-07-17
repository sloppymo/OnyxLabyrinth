# Echo Boss Phases — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md`, Direction C step 2 ("Echo phase system"). Designer decision 2026-07-16: **abilities + attack bump** escalation (not stat-only, not scripted phases).

## 1. Problem

The Headmaster's Echo (F3 boss) plays identically from full HP to zero. Its whole kit is already telegraphed (Direction B), but the fight has no escalation curve — no moment where the party must change plans.

## 2. Design

The phase machinery already exists in pieces: `hpBelow` ability conditions gate phase-locked content, wind-ups telegraph the big hits, banners announce moments. What is missing is transition detection and the content itself.

**Data (`EnemyDef.phaseThresholds?: number[]`, descending percents):** the Echo gets `[66, 33]` — three phases — and two new abilities appended to `abilityIds`:

| Ability | Effect | Condition | Notes |
|---------|--------|-----------|-------|
| `memory-shatter` | single-target drain 8 (undead) | `hpBelow 66` | phase-2 pressure, cooldown 1 |
| `total-eclipse` | allParty 10 undead | `hpBelow 33` | `windUp: true` — telegraphed desperation nuke, cooldown 3 |

**Engine (`combat.ts`):** `CombatState.bossPhases: Record<string, number>` (lazy — missing means phase 1). `checkBossPhases()` runs at the end of `deathCheck` (which already runs after every action in both combat APIs): for each living boss with thresholds, compute the phase from current HP%; when it exceeds the recorded phase, `attack += 4 × phasesCrossed`, record it, and emit:

```ts
| { type: "phaseChange"; actorId: string; phase: number; name: string }
```

A hit that skips a threshold fires **one** event at the final phase with the cumulative bump. Non-bosses and bosses without thresholds are untouched.

**Scene (`combat-scene.ts`):** `phaseChange` shows `${name} grows stronger!` in the top banner.

## 3. Why this shape

- **Counterplay stays intact:** the phase-3 nuke is telegraphed, so Direction B answers (disable-interrupt, Defend, blind, burn-down) all work on it. Debuff-clearing on transition was rejected — it would undercut disable-interrupt.
- **Generic mechanism, one consumer:** any boss can opt into phases by adding `phaseThresholds`; no Echo-specific code paths in the engine.
- **No new AI system:** abilities gate themselves via existing `hpBelow` conditions; `checkBossPhases` only announces and bumps.

## 4. Non-goals

- No debuff/status clearing on transition, no adds/summons, no per-phase scripted behavior.
- No changes to the Echo's existing four abilities or their conditions.
- No other bosses get thresholds in this pass.
- In-combat row swap remains a separate, later Direction C item.

## 5. Testing (TDD)

- Transition at 66%: `phaseChange` event (phase 2), attack +4, banner; no refire while still in phase 2.
- Second crossing at 33%: phase 3, cumulative +8.
- Skip hit (100% → 30%): one event at phase 3, cumulative +8.
- Non-boss with thresholds and boss without thresholds: no events, no state.
- Data: new abilities exist with the right conditions; `total-eclipse` is windUp-flagged; Echo's `phaseThresholds` = [66, 33] and its kit includes both new ids.
- Round-path parity (shared `deathCheck`).

## 6. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — Direction C: Echo phases shipped.
- `docs/AGENT-READING-LIST.md` — spec table row.
