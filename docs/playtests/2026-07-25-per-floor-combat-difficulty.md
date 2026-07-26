# Per-floor combat difficulty probe — 2026-07-25

Plan: [`superpowers/plans/2026-07-25-per-floor-combat-difficulty-probe.md`](../superpowers/plans/2026-07-25-per-floor-combat-difficulty-probe.md).
Sequel to the encounter-pacing playtest ([`2026-07-25-invariants-pacing-playtest.md`](2026-07-25-invariants-pacing-playtest.md)),
which established that campaign zones are frequency-only (safe/hot share one
`ENCOUNTER_TABLES[floor.id]` per floor) — this probe measures the axis that
actually varies: **floor id → encounter table**, at a fixed party level.

## Headline

At a fixed **L8** party, combat difficulty ramps steeply and mostly-monotonically
from floor 1 (a stomp: 1.07 rounds, 0.8% party HP lost) to floor 3 (a real fight:
4.80 rounds, 23.2% HP lost, 40% near-wipe), then continues climbing but **levels
off in per-round lethality** from floor 3 onward — floors 4-5 take longer (more
enemies, more total HP to grind through) rather than hitting meaningfully harder
per round. All 5 floors returned a full N=15 sample; zero outright wipes in this
run (near-wipes did occur, 27-40% of encounters floors 3-5).

The probe also **surfaced a real, unrelated gameplay bug**: confirming a
**wipe's** combat-result screen with Enter/Space used to skip the Game Over
screen entirely — the party landed straight in town, never seeing the
century/`worldYear` copy. Root cause below. **Fixed 2026-07-25:**
`GameOverController` stays unarmed until the next macrotask so the same
keydown that opens the screen cannot dismiss it (`game-over-ui.ts` + unit
test).

## Method and confidence

- SHA: `e3b1950` (clean tree at start; only new file added is the probe script
  itself, `scripts/playtests/per-floor-combat-difficulty.mjs`, not committed).
- Script forces encounters directly via `rollEncounter`/`resolveEncounter`/
  `createCombatFromEncounter`/`startCombat` (not real dungeon walking — pacing
  is a separate, already-measured axis) and resolves them through the **real**
  party-Auto combat path (`Q` toggle → `tryPartyAuto` attacks/casts each turn →
  real `endCombat()`), never `exitDebugCombat` for the actual data points (that
  API only records the pre-fight snapshot once turns have happened — see dev
  notes in the script header — so it's used only for flaky-timeout recovery,
  discarding that attempt's data rather than counting it).
- **N = 15 forced non-boss encounters per floor, L = 8** (mid-campaign, per the
  plan's own recommendation). Boss-pack rolls (weight 1 in the table, ~3-5% of
  rolls on floors 3-5) are rerolled, not sampled — out of scope per the plan.
- Between every forced encounter the whole roster is reset to full HP/SP,
  cleared status, and `xp:0` directly via `__onyxDebug.state` — this isolates
  per-encounter floor difficulty from attrition-order effects (fight #14
  shouldn't look harder than fight #1 just because nobody healed) and keeps
  the party pinned at L8 (a single encounter's XP award, even the biggest
  pack, is nowhere near `xpForNextLevel(8) = 960`).
- Unseeded-RNG caveat applies as usual (PR-5 not built): these are directional
  distributions from one N=15 run per floor, not bit-reproducible numbers.
- Every floor's outcome is read from the **live** `combatController.state`,
  not the outer `GameState.combat` reference (see [Script gotchas](#script-gotchas-worth-keeping-for-the-next-agent)) —
  confirmed correct by cross-checking mean enemies/pack against a 4000-sample
  static bootstrap of the same tables (see below); the two agree within noise.

## Results

| Floor | Name | N | Mean rounds | Mean HP lost | Near-wipe rate | Wipe rate | Mean enemies/pack |
|---|---|---|---|---|---|---|---|
| 1 | The Flooded Crypt | 15/15 | 1.07 | 0.8% | 0% | 0% | 3.27 |
| 2 | The Cursed Library | 15/15 | 2.27 | 4.8% | 0% | 0% | 4.20 |
| 3 | The Forge of Ashes | 15/15 | 4.80 | 23.2% | 40% | 0% | 4.40 |
| 4 | The Null Choir | 15/15 | 8.13 | 33.3% | 33% | 0% | 4.53 |
| 5 | The Weeping Cistern | 15/15 | 8.47 | 40.1% | 27% | 0% | 4.87 |

"Near-wipe" = any active fighter KO'd, or any living fighter under 25% max HP,
at the moment combat ends (read before the wipe-revive/XP writeback runs).
Floor 4 had one flaky Playwright/CDP timing stall recovered via
`exitDebugCombat("fled")` mid-run (not counted toward N; see script comments) —
not a game bug, confirmed non-reproducible across repeated dry runs.

**Per-round lethality (mean HP lost ÷ mean rounds), the more diagnostic number:**

| Floor | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| HP lost per round | 0.8% | 2.1% | 4.8% | 4.1% | 4.7% |

The floor 1→3 ramp is real and steep (per-round lethality grows ~6x). From
floor 3 on, per-round lethality **plateaus around 4-5%** — floors 4 and 5 feel
harder mostly because fights run longer (more enemies to grind through: 4.4 →
4.5 → 4.9 mean pack size), not because individual rounds got meaningfully more
dangerous. That matches the static table trend below, where mean pack HP keeps
climbing but decelerates hard (+110%, +92%, +32%, +12% floor-over-floor) while
mean pack attack keeps climbing at a steadier clip (+101%, +53%, +19%, +16%) —
floors 4-5 lean more on attack-output scaling than raw HP bloat.

**A genuinely surprising point:** near-wipe rate is *not* monotonic with HP
lost — floor 5 has the highest mean HP lost (40.1%) but the *lowest* near-wipe
rate of floors 3-5 (27%, vs. floor 3's 40%). Total damage and "did someone
almost die" are different questions: floor 5's damage looks more evenly spread
across the whole party (bigger packs, more attackers each doing a smaller
share), while floor 3's damage looks spikier — fewer, harder-hitting attacks
more likely to crater one character past the 25% threshold even though the
party-wide total ends up lower. Worth keeping in mind before treating "near-wipe
rate" and "mean HP lost" as interchangeable difficulty proxies.

### Verdict on the plan's question

**Does the curve match the intended progression story, or is some floor a
cliff/flat?** Neither, cleanly — it's a fast initial ramp (F1→F3) settling into
a much shallower one (F3→F5). That is *expected* here, not a red flag by
itself: per the campaign-progression design note and its sprint-notes
follow-up ([`superpowers/specs/2026-07-24-campaign-progression-design.md`](../superpowers/specs/2026-07-24-campaign-progression-design.md),
[`playtests/2026-07-24-progression-sprint-notes.md`](2026-07-24-progression-sprint-notes.md)),
the intended level band is **L3 for floor 1, L6 for floors 2-3, L9 for floors
3-4, L12+ for late floor 4-5**. L8 (this probe's fixed level) sits *above*
floor 1-2's target band and *below* floor 4-5's — so floor 1-2 reading as a
stomp and floor 4-5 reading as brutal (33-40% HP lost, wipes did occur in
discarded preliminary samples at both floors, just not in this final N=15) is
exactly what a correctly-tuned curve should produce at an off-target level.
The one number that *would* be concerning at the target level is floor 3:
L8 is close to floor 3's own target band (L6-9), and a 40% near-wipe rate on
what the table calls ordinary trash (not the floor's boss pack) is a real
signal, not an artifact of under/over-leveling. **This alone doesn't call for
a balance change** (out of scope for this pass per the plan) but is worth a
follow-up look if floor 3 gets human playtest attention.

**Follow-up (same day):** [`2026-07-25-f3-level-matrix.md`](2026-07-25-f3-level-matrix.md)
remeasured F3 at L6/L8/L9 (N=10). Yellow flag **cleared** — L8 40% near-wipe
did not reproduce (0%); at intended entry L6 the floor is spicy but zero
wipes. No table retune.

## Static table baseline (companion, no combat run)

4000 weighted `rollEncounter`/`resolveEncounter` samples per floor (non-boss
only), confirming the live numbers against the config the tables actually
encode:

| Floor | Non-boss samples | Boss packs seen | Mean pack total HP | Mean pack total attack | Mean enemies/pack |
|---|---|---|---|---|---|
| 1 | 4000/4000 | 0 | 41.1 | 15.0 | 3.30 |
| 2 | 4000/4000 | 0 | 86.3 | 30.1 | 4.04 |
| 3 | 3865/4000 | 135 (3.4%) | 165.6 | 46.0 | 4.27 |
| 4 | 3813/4000 | 187 (4.7%) | 218.7 | 54.9 | 4.83 |
| 5 | 3821/4000 | 179 (4.5%) | 244.6 | 63.6 | 5.13 |

Mean enemies/pack tracks the live N=15 sample within noise (3.27/4.20/4.40/4.53/4.87
live vs. 3.30/4.04/4.27/4.83/5.13 static), a useful sanity check that the
forced-encounter path samples the real tables correctly.

## Finding: wipe confirm skips the Game Over screen

**Status: fixed 2026-07-25** (`GameOverController` macrotask arming; see
`game-over-ui.test.ts`). Left below as the reproduction / root-cause writeup.

**Severity when found: real, reproducible, previously unknown.**

Confirming a **wipe's** combat result screen with Enter (or Space) almost
always cascades straight past the Game Over screen into town, in the *same*
keydown dispatch:

1. `main.ts`'s combat key listener (registered ~line 1249) sees `phase ===
   "result"` and calls `combatController.handleKey("Enter")` → `onEnd(state)`
   → `endCombat(result)`.
2. For `result.result === "wipe"`, `endCombat` synchronously revives the
   party and calls `openGameOver()`, which calls `setMode(state,
   "game_over")` and constructs a fresh `GameOverController` — **all still
   inside the original keydown dispatch.**
3. `main.ts`'s separate game-over key listener (registered ~line 1306) is
   invoked for the *same* physical keydown event (browsers dispatch one event
   to every matching listener, synchronously, in registration order). Its
   guard is `state.mode !== "game_over"` — but step 2 already flipped
   `state.mode` to `"game_over"` earlier in this same event, so the guard
   passes, and `gameOverController.handleKey("Enter")` fires immediately →
   `onContinue()` → `openTown()`.

Net effect: one keypress on the wipe result screen takes the player straight
to town. The Game Over screen (including the `worldYear`/century-cycle copy
shipped in `a5bdd5e` earlier today) gets constructed and torn down without
ever being visibly rendered to input. This is not a Playwright/synthetic-input
artifact — it's ordinary JS `addEventListener` semantics (multiple listeners
on the same target both fire for one event, synchronously, and a state
mutation by an earlier listener is visible to a later one's guard check within
the same dispatch); a real human's single Enter/Space press would reproduce it
identically. Victory and fled outcomes don't trigger this — only wipe, because
only wipe's `endCombat` branch opens a *new* mode synchronously within the same
keypress that confirmed the previous screen.

The existing `suppressNextCombatKey` guard (`main.ts`, combat-start path)
exists for exactly this class of bug on the dungeon→combat transition; there
is currently no equivalent guard on the combat→game_over transition.

This probe's own script hit this directly: floors 4-5's first run aborted with
"unexpected route after confirming result: town" (never seeing `"game_over"`
first) — the script now treats a direct `route === "town"` landing as the
(buggy but real) expected outcome of a wipe confirm and jumps straight back in,
rather than treating it as a script error.

## Script gotchas worth keeping for the next agent

Both cost real debugging time this session and aren't obvious from the debug
surface's own docs:

- **`GameState.combat` is a stale snapshot once a fight starts.** It's set
  once at `startCombat()` and never reassigned as turns resolve —
  `resolveAndPlay()` rebinds the *controller's own* `this.state` to each new
  immutable `CombatState`, not the outer reference. Reading
  `__onyxDebug.state.combat` mid/post-fight silently returns round-0 starting
  data (0 rounds, 0 HP lost, `result: null`) with no error. Use
  `__onyxDebug.getCombatController().state` instead, or `snapshot().combat`
  (which already reads from the live controller via `debugView()`).
- **`startCombat()`'s `suppressNextCombatKey` guard can eat a same-tick
  keypress sent programmatically.** It's a one-shot flag armed at
  `startCombat()` and cleared via `setTimeout(fn, 0)`, meant to swallow a
  leaked keypress from the real dungeon-movement-triggers-combat path. Driving
  `startCombat()` via `__onyxDebug` and immediately sending "q" (to toggle
  party Auto) can land before that macrotask flushes, silently eating the
  press with `partyAuto` staying `false`. A short settle, or — more
  robustly — verifying `getCombatController().partyAuto === true` and
  retrying, avoids a long, silent hang in `waitForIdle`.
- `isIdle()` reads `true` for *any* non-playback combat phase, including a
  genuinely-open manual palette — it can't distinguish "the fight is over"
  from "Auto didn't resolve this turn" on its own. Poll in bounded chunks and
  check `snapshot().combat.phase === "result"` explicitly rather than trusting
  one long `waitForIdle` call.

## Definition of done

- [x] Script checked in: `scripts/playtests/per-floor-combat-difficulty.mjs`
      (not committed — per Hard Rule, commits are the human's call)
- [x] Report with N, L, and per-floor means for TTK/HP-lost/near-wipes (above)
- [x] No floor fell short of N=15 in the final run (the routing-bug rerun
      restored floors 4-5 to full samples)
- [x] `npm test` still green (1237/1237), no balance/game-logic edits made

## Artifacts

- `playtest-screenshots/2026-07-25-per-floor-combat-difficulty/report.json` —
  merged machine-readable results (all 5 floors, N=15 each) plus per-encounter
  detail.
- Failure bundles (screenshots/snapshots) for the flaky floor-4 stale-fight
  recovery, same directory.
