# Plan: per-floor combat difficulty probe (sequel to encounter-pacing)

**Status:** proposed — not started  
**Depends on:** `?debug=1` surface through PR-4 (shipped); zone-flavor addendum in
[`docs/playtests/2026-07-25-invariants-pacing-playtest.md`](../../playtests/2026-07-25-invariants-pacing-playtest.md)

## Why this exists

The 2026-07-25 pacing pass showed within-floor zone contrast is thin, and a static check
confirmed campaign zones never set `tableFloorId` — safe/hot share one enemy table per floor.
A proposed "TTK per zone-rate-tier" experiment would mostly remeasure identical distributions.
**Do not run that.** Measure the axis that actually varies: **floor id → encounter table**.

## Question to answer

At a **fixed party level** (and fixed gear if you pin inventory), how does combat difficulty
ramp across floors 1→5? Report rounds-to-victory (or equivalent), HP lost, near-wipe rate.
Then: does that curve match the intended progression story, or is some floor a cliff / flat?

## Out of scope

- Per-zone-tier TTK within a floor (already known equal in expectation).
- Retuning `rateMul` / pity (separate design call — see pacing report).
- Wiring hot zones to `tableFloorId: id+1` (product decision; implement only if the human asks).
- Changing combat math unless the human explicitly requests a balance change after the report.

## Method (cheap)

1. `npm run build` + `npm test`; start preview with `?debug=1`.
2. Reuse `scripts/playtests/lib.mjs` (`boot`, `jumpTo`, `createFindings`, `waitForIdle`).
3. For each floor `f ∈ {1,2,3,4,5}`:
   - `jumpTo({ floorId: f, x, y, facing, partyLevel: L })` with the **same** `L` for all floors
     (recommend L=6 or L=8 — mid-campaign; note the choice in the report).
   - Force `N ≥ 15` encounters via `__onyxDebug` helpers (`rollEncounter` /
     `resolveEncounter` / `createCombatFromEncounter` / `startCombat`) — do **not** rely on
     walking for sample size; walking is for pacing, not combat difficulty.
   - Resolve with a **scripted attack-spam** (or a documented Auto path), **not**
     `exitDebugCombat("fled")` (that records null TTK/damage).
   - Record: rounds (or turns) to victory, total party HP lost, any wipe / near-wipe
     (e.g. any living member below 25% max HP at end, or any KO).
4. Optional cheap static companion (no Playwright): dump `ENCOUNTER_TABLES[f]` spawn HP/atk
   summaries per floor so the live numbers have a config baseline.
5. Write `docs/playtests/YYYY-MM-DD-per-floor-combat-difficulty.md` with a table and a clear
   verdict. Bundles stay local; quote decisive numbers inline.

## Anti-patterns

- Do not treat `exitDebugCombat` as a combat resolution measurement.
- Do not mix party levels across floors and then claim a floor curve.
- Do not invent a sixth "zone difficulty" condition — zones are frequency-only on campaign maps.
- Do not change game logic under Hard Rule 1 without an explicit ask.

## Definition of done

- [ ] Script checked in under `scripts/playtests/` (or an extension of an existing one)
- [ ] Report with N, L, and per-floor means for TTK / HP lost / near-wipes
- [ ] Explicit "insufficient sample" if any floor falls short of N
- [ ] `npm test` still green; no balance edits unless requested after review
