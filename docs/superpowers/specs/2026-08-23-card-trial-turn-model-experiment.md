# Card Trial turn-model experiment — 2026-08-23

This is an experimental fork of frozen Card Trial. It does not rewrite
`docs/superpowers/specs/2026-08-21-card-trial-poc-design.md` or the
2026-08-22 human-test freeze. Interleaved remains the default control.

## BASELINE

Canonical line: `feat/card-trial-production-feel` @ `ffaa3dc`.

Control architecture (unchanged when `turnModel: "interleaved"`):

```text
Rat King → fast enemies → Old Man → slow enemies
```

Held constant: 5-card draw, 3 energy/hero, full discard, current cards,
costs, Move, Guard amounts, Opened, Rat, encounter numbers, one live fan.

## VARIANTS

| id | `turnModel` | Player phase | Enemy phase | Guard |
|---|---|---|---|---|
| A | `interleaved` (default) | one hero | next queue actors | clears at that hero's next card-turn start |
| B | `shared` | both heroes, any order, one live fan + Tab/click switch | all living enemies | both clear at next player-phase start |
| C | `handoff` | Rat King, then one-way handoff to Old Man | all living enemies | both clear at next player-phase start |

Query: `?turnModel=shared` or `?turnModel=handoff`.
Debug: `__onyxDebug.cardTrial.startFight(id, { turnModel })`.

## WHAT WAS HELD CONSTANT

Cards, numbers, Rat, Opened rules, hand size, energy, Move cost, encounters.
No Ripening, retain-one, Shared-4, Rat Clings, new statuses, or enemy retune.

## WHAT WAS CHANGED

Explicit `turnModel` on fight state. Shared/Handoff use `startPlayerPhase` /
`switchActingHero` / `runEnemyPhase` instead of reusing `endHeroTurn` →
`continueInitiative` for partner swaps. Named intents compact to
`RK · FRONT` so the evade row is visible. Telemetry records turn model,
switches, handoffs, partner/same-phase Opened consumes, and player-phase kills.

## INTERNAL PLAY FINDINGS

Design-aware play, not naive-human evidence.

**Interleaved.** On all-fast fights (1, 2, 5) the advertised
`RK → fast → OM → slow` collapses to `RK → all enemies → OM`. The only
reliable duo window is OM → wrap → RK. Fast/slow tension is real on mixed
fights (3, 4, 9) and is the control's unique good. Guard lifetime is
hero-specific and easy to misread.

**Shared-5.** One player phase makes setup→payoff causal in the same
breath. Tab switch + one fan preserves battlefield attention. Arbitrary
RK↔OM interleave is legal but a large search tree; a greedy RK-first
policy makes Shared identical to Handoff. Power-up is real: greedy sample
avg combined HP 53.7 (interleaved) vs 59.5 (shared/handoff) across fights
1,2,3,5,9,10 seed 11, with no enemy retune.

**Handoff-5.** Same power as Shared under RK-first play, with a smaller
decision: setup, then finish. Handoff itself is a real mechanic, not just
constrained Shared, because you cannot take back the first hero. RK-first
matches the designed identities. Opener choice was not added.

## KNOWN POWER CONFOUNDS

Shared/Handoff let both heroes act before any enemy. More pre-act kills
and leftover Guard through the partner segment are expected. Do not retune
HP/damage until a human A/B picks a winner.

## CHALLENGER SELECTED

**Handoff-5** for naive-human test against frozen interleaved.

Shared stays available internally (`?turnModel=shared`) but is not the
human challenger: it adds switch overhead without a proven extra pleasure
once RK-first is the natural line.

## WHAT REQUIRES NAIVE-HUMAN EVIDENCE

Whether Handoff's one-way sequence feels like setup→finish or an arbitrary
restriction. Whether testers form two-hero plans and consume Opened across
heroes. Whether they still look at the battlefield. Whether they ask for
one more fight. Counterbalance A/B order. Do not teach strategy.
