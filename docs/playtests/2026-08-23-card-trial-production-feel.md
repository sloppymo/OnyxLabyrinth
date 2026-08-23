# Card Trial production-feel pass — 2026-08-23

## Baseline play

Real fights were mechanically readable but presentation-flat: a card left the
hand with little commitment punctuation, Guard was mostly a number change,
Opened was mostly a persistent chip, Consume had no visible setup/payoff beat,
and enemy turns could begin without a strong hand-to-battlefield transition.

## Shipped presentation vocabulary

- Card commitment: the selected physical card briefly straightens, lifts, and
  exits above the hand before the hand reflows.
- Guard: blue shield burst and amount popup on gain; incoming Guard absorption
  shows a blue `-G` cue or `BLOCK` instead of a fake zero-damage hit.
- Opened / Consume: gold exposure slash with `OPENED`, then a distinct gold
  starburst payoff with `EXPLOIT`; Opened transfer can show the previous target
  closing first.
- Rat: a short low-energy Rat cue with a fast physical slash vocabulary.
- Enemy phase: the sparse playback band explicitly changes to `ENEMY TURN`.
- Audio: Card Trial routes its structured events through the existing combat SFX
  vocabulary; no new sound assets were added.

The changes are presentation-only. Card Trial rules, costs, targeting, RNG,
and campaign combat remain untouched.

## Review evidence

The durable fixture is:

```bash
ONYX_URL=http://127.0.0.1:5220/OnyxLabyrinth/ \
  node scripts/playtests/card-trial-feel-review.mjs
```

It uses live fights and captures decision, commit, contact, effect, settle,
Guard absorption, Rat, Opened, Consume, enemy-turn, and five viewport states.
The final local captures were reviewed for both Phaser and Canvas with zero
page errors under `output/playwright/card-trial-feel-{phaser,canvas}-final/`.

## Playtest instrumentation

Card Trial telemetry now records decision duration, target changes, target
cancels, details holds, and disabled-card attempts alongside the existing rules
telemetry. The session summary reports average/longest decision time in seconds.

## Human questions left open

- Do players understand why a card is disabled without holding details?
- Is the current amount of impact feedback comfortable over a long session?
- Does the fast Rat cue make Rat-related cards easier to remember?

These are observation targets, not balance changes.
