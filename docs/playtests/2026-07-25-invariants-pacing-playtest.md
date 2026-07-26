# Invariants-under-stress + encounter-pacing playtest — 2026-07-25

## Headline

Every campaign **and** Arena wipe leaks a stale, already-ended combat reference —
`endCombat`'s wipe branch early-returns before the `state.combat = undefined; combatController =
null` cleanup two sibling branches (`fled`/`victory`) both reach. Investigated the blast radius
directly: `save.ts`'s `serialize()` never reads `state.combat` at all, and `resolveControllerRoute`
requires `mode === "combat"` (not just the stale flag) before it routes there — so **no
player-facing consequence was found**; the practical cost is confined to the `?debug=1` surface,
where `loadSave`/`jumpTo` refuse until a real combat overwrites the stale reference. Still real,
still worth fixing (a maintenance hazard for the next change to that cleanup block), but P2 not
P0/P1. Everything else the hostile-sequence run threw at the game held: the in-flight century-cycle
plumbing (worldYear +100, save v12 migration, wipe→town) is correct end-to-end, and encounter
pacing respects its cooldown/pity bounds in 190 measured fights with zero violations. One pacing
design note: floor 1's three encounter-zone tiers (safe/default/hot) order correctly in both theory
and practice, but the *authored* theoretical contrast (rateMul 0.5–1.5× → a 4.83-step spread) is
already close to a session's perceptual noise floor before any sampling error is even considered —
n=30 can't resolve it either.

## Method and confidence

- Starting SHA: `c422060` — **with caveats.** The working tree carried ~15 uncommitted files of
  in-flight century-cycle/lore work, and the build arrived red: the modified `game-over-ui.ts`
  requires a `worldYear` option that `main.ts` never passed. A minimal completing hunk was added
  and deliberately **left uncommitted** with the rest of that WIP — committing it alone would break
  the build at HEAD, and its cleanup is the user's call. The exact diff, so this report stays
  reproducible independent of what happens to that working tree next:

  ```diff
  --- a/src/main.ts
  +++ b/src/main.ts
  @@ -634,10 +634,16 @@ function openGameOver(): void {
     setMode(state, "game_over");
     showMode("game_over", mapVisible);
     setMessage("");
  +  // §7.1: campaign wipes advance the century cycle before the screen renders
  +  // so the player reads the *new* year; Arena wipes never advance it.
  +  if (!inArena) {
  +    state.worldYear += 100;
  +  }
     gameOverController = new GameOverController({
       panel: document.querySelector<HTMLDivElement>("#combat-panel")!,
       party: state.party,
       floorName: state.floor.name,
  +    worldYear: state.worldYear,
       onContinue: () => {
         gameOverController = null;
         if (inArena) {
  ```

  All results below are against `c422060 + that working tree + this diff`.
- Instrumentation commit made mid-run (before the data runs it gates): `a2963a1` — see
  Instrumentation assessment.
- Scripts run: `scripts/playtests/stress-invariants.mjs` (new), `scripts/playtests/encounter-pacing.mjs`
  (new), `scripts/playtests/smoke-debug-surface.mjs` (start + end).
- Sample sizes: 30 encounter gaps for each of six pacing conditions, 10 for the rateMul-0
  mechanism check (also stochastic — see Encounter pacing measurements); per-condition step
  counts 300-550 real moves; the stress probe's findings reproduced identically on a full
  verification re-run.
- Unseeded-RNG caveat: encounter/combat/trap/party rolls use `Math.random()`; pacing numbers below
  are directional, not reproducible (PR-5 not built). The cooldown/pity **bounds**, by contrast,
  are hard mechanical claims and hold at any sample size.
- Pacing data integrity: position-anchored two-cell oscillation; every step cross-checked against
  the game's own `stepsSinceEncounter` (0 mismatches anywhere); `cellsVisited` proves no condition
  ever left its two validated cells; 0 swallowed presses after the `a2963a1` fix.
- Smoke: passed at session start against the pre-`a2963a1` build, and again on the final tree
  before this report was written.

## Findings

| id | sev | floor | location | system | repro | expected | actual | evidence (local) |
|----|-----|-------|----------|--------|-------|----------|--------|------------------|
| F1 | P2 | any | wipe → game_over → town/arena | combat lifecycle (debug-surface impact only — see below) | any party wipe (campaign or Arena); scripted: force encounter, `exitDebugCombat("wipe")`, Enter through game-over | `state.combat`/`combatController` cleared when combat ends, `snapshot().warnings` empty | `snapshot().warnings` = `["combat view present while route is \"game_over\""]`, then the same for routes `"town"` and (Arena path) `"arena"`; probe `state.combat != null` → true after reaching town. Root cause: `src/main.ts` `endCombat` wipe branch (`openGameOver(); return;`) exits before the `state.combat = undefined; combatController = null;` cleanup ~55 lines below; `fled`/`victory` fall through and reach it. Present at HEAD `c422060`. **Blast radius checked directly, not assumed:** `save.ts`'s `serialize()` never reads `state.combat` (grepped — zero references), and `resolveControllerRoute()` requires `mode === "combat"` before honoring the `hasCombat` flag, so the stale reference cannot mis-route real input; `mode` itself is set correctly to `game_over`/`town`/`arena` throughout. No player-facing symptom found. The one confirmed cost: debug `loadSave`/`jumpTo` refuse with "refuse while combat is active" until the next real combat overwrites the stale reference — a scripted session that tests wipes must fresh-boot to keep testing afterward. | playtest-screenshots/2026-07-25-stress-invariants/bundle-f1-p1-stale-state-combat-…json, …game-over…json, …town-after-wipe…json, bundle-f0-p1-…arena-game-over…json, …arena-after-wipe…json (two timestamps each = original + verification run) |
| F2 | P2 | arena | Arena wipe game-over screen | UX copy (`game-over-ui.ts`, currently open in the user's working tree) | enter Arena from title, wipe | Arena wipe messaging matches what actually happens (return to Arena, no century passes) | Screen shows the campaign century copy verbatim — "Year 3847. A hundred years in the dark. Edgehollow is still waiting." and "Press [Enter] to wake in town." — while `worldYear` correctly does **not** advance and Enter correctly returns to the **Arena** chooser, not town. `render()` in `game-over-ui.ts` emits the §7.1 strings unconditionally, with no branch on an Arena flag. Recommend: pass an `inArena: boolean` into `GameOverControllerOptions` and swap the last two lines for something Arena-appropriate (e.g. drop the year/Edgehollow beat entirely, keep "The labyrinth does not keep the dead." and change the prompt to "[Enter] to continue."). Two lines, cheap while the file is already open. | playtest-screenshots/2026-07-25-stress-invariants/bundle-f0-p1-invariant-warnings-at-arena-game-over-…json (screenshot shows the copy) |

No cooldown violation (gap < 8) and no pity violation (gap > 28) occurred in any of the 190
measured encounter gaps across five floors/seven zones — every gap fell in [8, 28] on plain cells.

## Encounter pacing measurements

Mechanics measured (from `game/encounters.ts`, confirmed in play): chance 0 below 8 steps since
last fight, flat base·rateMul from 8–19, linear ramp to certainty over 20–27, forced at 28.

| condition | zone (rateMul) | eff. rate | n | mean ± sem | median | min–max | pity-forced | theoretical mean |
|-----------|----------------|-----------|---|------------|--------|---------|-------------|------------------|
| f1-default | outside all zones (1.0) | 0.080 | 30 | 17.17 ± 1.08 | 19 | 8–26 | 0 | 16.25 |
| f1-safe | crypt-tutorial-safe (0.5) | 0.040 | 30 | 18.20 ± 1.05 | 21 | 8–24 | 0 | 19.10 |
| f1-hot | flooded-gallery-risk (1.5) | 0.120 | 30 | 16.57 ± 0.93 | 16 | 8–25 | 0 | 14.27 |
| f2-safe | library-loop-safe (0.6) | 0.060 | 30 | 18.63 ± 1.07 | 21 | 8–26 | 0 | 17.54 |
| f3-hot | chain-hall-hot (1.5) | 0.180 | 30 | 12.83 ± 0.92 | 11 | 8–24 | 0 | 12.32 |
| f5-hot-x2 | undersong-vault (2.0) | 0.290 | 30 | 10.23 ± 0.36 | 9 | 8–17 | 0 | 10.43 |
| f4-quiet-pity | vestry-quiet (0) | 0 | 10 | 23.60 ± 0.52 | — | 21–27 | 0 | 23.25 |

Reading (see Design feedback for the interpretation):

- Observed means track the theoretical expectation of the authored formula within ~1 step in every
  completed condition — the implementation does what `encounterRollChance` says it does.
- The hard bounds held universally: no fight before step 8, none later than step 28.
- **Correction to the original probe design:** f4-quiet-pity was written expecting a rateMul-0
  zone to force every gap to exactly step 28 (a "deterministic bound"). That's wrong — the pity
  ramp (steps 20-27) runs off the *same formula* regardless of base rate: with `rate = 0` it still
  climbs linearly from 0% at step 20 to 100% at step 28, so a rateMul-0 pocket only guarantees
  safety through step 20, not indefinitely, and most fights land in the ramp (observed 21-27,
  n=10) rather than pinned at the hard cap. The 28-step **ceiling** is real; "deterministic" was
  not. The script's own `theoreticalMeanGap` helper already modeled the ramp correctly (23.25
  predicted vs. 23.60 observed) — only the surrounding prose comment was wrong, now fixed.

## Findings ruled out

1. **"Oscillation stuck — no movement at (2,5)" (pacing script v1)** — root cause: the script
   alternated forward/backward keys blindly; one swallowed press inverted the parity and walked the
   party off its validated cell pair onto floor 1's trapped chest at (2,5), where the trap prompt
   modality gates all movement **by design** (`route: "trap"`, `availableActions:
   [inspect,disarm,open,leave]` in the bundle). Script bug; fixed by position-anchored keys.
   Not a game bug — the trap modal behaved exactly as documented.
2. **"Oscillation stuck after 26 swallowed presses" (pacing script v2)** — root cause: the
   script's stuck detector conflated *cumulative* with *consecutive* swallows and aborted a healthy
   self-healing run (26 sporadic swallows across ~460 steps, each recovered on retry). Script bug;
   fixed. The *underlying* sporadic swallow was real and led to the `a2963a1` instrumentation fix
   (see below).
3. **"25 key-press pairs needed for 24 perk picks" (stress probe)** — the perk overlay swallows
   the keypress that opened it (`justOpened*` guard, documented in AGENTS.md); one press pair is
   expected to vanish. Not a bug; reproduced identically in both runs.
4. **`ERR_NETWORK_CHANGED` console/requestfailed noise (one early run)** — environment-level
   network interface flap during WAV fetches; absent in every subsequent run including both final
   data runs. Environmental, not the game (and distinct from the 404-style asset failures the
   evidence layer exists to catch).
5. **"One-way wall at (2,2)" hypothesis** — checked the grid data directly: edges are symmetric
   (`(2,1).s = open`, `(2,2).n = open`) and both directions move fine in a fresh session; the
   real cause was the false-idle window (instrumentation, below).
6. **"Hang during f3-hot at step 196" (pacing script)** — root cause: the script waited for full
   `isIdle()` quiescence after the movement keypress that triggered the encounter, but `route`
   flips to `"combat"` synchronously on that keypress while `isIdle()` stays false for the rest of
   the round's choreography — and this pack (2 Hellhounds + 3 Hellbats, 5 actors) legitimately
   ran its first round past the script's 6s per-step budget (`combat-scene.ts`'s own `ATTACK_MS
   = 840` × up to 9 actor turns plus gaps easily exceeds 6s). `exitDebugCombat` force-ends through
   the real `endCombat` regardless of playback phase, so there was never a need to wait it out.
   Script bug; fixed by reacting to the route flip directly instead of waiting for idle. The
   resulting stranded combat state also crashed the next condition's `jumpTo` ("refuse while
   combat is active") — `rejump()` now defensively flees any leftover active combat before
   jumping. Not a game bug — combat itself was progressing normally.

## Design feedback

### Encounter zones (floor 1's three-tier comparison)

Floor 1 is the only floor where safe/default/hot were all sampled, so it's the only place a
same-floor, same-run comparison is honest. (Floors 2/3/5 each had one zone sampled and are
compared only against the *theoretical* formula, not an empirically-sampled default on that same
floor — that three-way sampling would need three more 30-gap runs per floor, out of this pass's
budget; flag as a follow-up if zone legibility is a priority elsewhere.)

- Interesting: the ordering is right. Observed means run hot (16.57) < default (17.17) < safe
  (18.20), matching the theoretical ordering (14.27 < 16.25 < 19.10) exactly — the mechanism is
  not broken, and the pity ramp gives even the rateMul-0 floor-4 pocket a hard fight-by-28
  ceiling, so loitering is never fully safe anywhere, which fits the labyrinth framing.
- Flat / confusing: **even the theoretical contrast is already close to the noise floor, before
  sampling error enters at all.** The *authored* formula itself only predicts a 4.83-step spread
  across the full 0.5×-1.5× range (theoretical means 19.10 vs. 14.27) — on a floor where the
  8-step cooldown and the step-20 pity onset already dominate the distribution, that's a thin
  margin for a player to notice across a session. Sampling then makes it worse: the observed
  spread (1.63 steps, 16.57-18.20) sits well inside that already-thin margin, and per-condition
  standard errors (~1 step each) mean hot vs. safe isn't statistically distinguishable at n=30
  (difference 1.63, combined SE ≈1.40) — so this run can't say whether the compression below 4.83
  is a real in-play effect or just noise, only that the *ceiling* on how distinguishable these
  zones can ever feel is already low by design.
- Suggested change (pick one, don't do both): either widen authored contrast specifically on
  low-base-rate floors (cooldown length is the lever the pity math doesn't erase — a safe zone
  that also extends its own cooldown would separate cleanly), or treat floor-1-tier zones as
  flavor/wayfinding rather than a felt difficulty signal and concentrate real rateMul contrast on
  higher-base-rate floors (3+) where the multiplier has more room before pity dominates.

### Wipe flow (century cycle — in-flight work)

- Interesting: the whole cycle holds under hostile probing — +100 exactly once per campaign wipe,
  never for Arena; the new year is on the game-over screen and the town header; a v11 save
  migrates to 3847; a v12 save round-trips 3947; missing-field fallback lands 3847.
- Flat / confusing: the Arena wipe shows the campaign's century copy and "wake in town" prompt
  (F2). For the audience Arena serves (fast combat iteration), a lying prompt is friction.
- Suggested change: branch the two bottom lines of the game-over screen on the Arena flag the
  caller already has. Two strings; the file is already open in the working tree.

### Perk / progression plumbing

- Interesting: the perk queue is robust at absurd depth — six characters crossing all four tiers
  in one victory (24 queued choices) drains cleanly, with full-restore level-ups and
  `perkIds = [4,4,4,4,4,4]`, zero invariant warnings, and `jumpTo` correctly refusing while the
  overlay is open. Bench characters level and choose perks too, which reads as intended design.

## Instrumentation assessment

- **Where the tooling let me down, and what I fixed (commit `a2963a1`, its own commit before the
  data runs that depend on it):** `isIdle()` had a false-idle window on movement. The render-camera
  tween starts in the render loop's `cameraAnim.update()`, not in the keydown handler — so between
  a movement keypress and the next frame, `isRenderCameraAnimating()` is still false and `isIdle()`
  reported idle. When `waitForIdle`'s 30 ms poll landed in that window, the next scripted press
  arrived mid-tween and the dungeon input gate (`!isRenderCameraAnimating()` in `main.ts`) silently
  swallowed it — ~1 lost press per combat-flee cycle in practice (diagnostics: swallows at
  `idle: true`, zero engine events emitted). This single defect caused both pacing-script failure
  modes above (parity desync → trapped chest; false stuck detection). Fix:
  `RenderCameraAnimator.isSettledAt(x, y, facing)` (8 new unit tests in `render-math.test.ts`),
  exported as `isRenderCameraSettledFor()` and folded into `isIdle()`'s camera input, scoped to
  dungeon mode. Empirical before/after on the same probe: 26 swallowed presses per ~460 steps → 0
  across every subsequent run. **Findings enabled: the entire pacing table** (F-bounds claims
  require that no press is silently lost) — and it retroactively explains ruled-out items 1 and 2.
- **The §5 animation-timing registry was NOT built.** No pursued finding needed per-animation
  visibility; the quiescence fix above is a correctness repair to the existing PR-2 surface, not
  new observability.
- What worked well: `snapshot().warnings` caught F1 within seconds of the first wipe — the
  invariant layer paid for itself in one probe; `captureFailureBundle`'s transcript + route +
  message snapshot made both script-bug diagnoses (trap chest, swallow pattern) five-minute jobs
  instead of an afternoon.
- Highest-value next addition: **PR-5 (seeded RNG + transcript replay)** remains the top gap — all
  pacing numbers here are directional because every run rolls fresh. Second: `jumpTo`/`loadSave`'s
  "refuse while combat is active" check should distinguish a *live* combat from an *ended* one
  (`state.combat.ended`), so a leaked-but-finished combat (F1) doesn't lock the setup accelerators
  for the rest of a scripted session — today a wipe-testing script must fresh-boot to keep working.
