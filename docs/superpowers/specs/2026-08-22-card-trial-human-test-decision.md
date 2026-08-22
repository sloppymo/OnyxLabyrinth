# Card Trial — official decision record (2026-08-22)

**Status:** Binding for Card Trial until the naive-human batch is complete.  
**Does not** change campaign combat, saves, or Classic Arena.

## Status line

> **Card Trial has passed mechanical/reference-agent validation. Two measurement/presentation corrections remain before the first actual human design test. No balance iteration is authorized until that test is complete.**

Those two corrections are this freeze-break (telemetry + Consume presentation). After they ship, the test build is frozen.

## Two layers of evidence

**Reference-agent run:** verifies mechanical viability, reachability, regression behavior, and some objective implementation facts.

**Naive-human run:** tests discovery, comprehension, perceived opportunity cost, emotional attachment to position, emergent cooperation, cognitive load, and fun.

The 2026-08-22 sequential 1→10 session is a **design-aware reference-agent run**, not a first playtest. Keep that policy unchanged as a regression oracle (`scripts/playtests/card-trial-reference-agent-run.mjs`). Do not treat its PASS/FAIL character-feel or “players want to stay in Front” claims as human evidence.

## Freeze (after this freeze-break)

Lock until the naive-player batch is complete:

- All card text and numbers
- 5-card draw, 3 energy, Move costs 1
- Guard, Opened rules, Rat rules
- Enemy HP, damage, intent cycles, and encounter composition

Authorized exceptions: the telemetry distinction and Consume “available clause” presentation in this freeze-break; bugfixes that do not change those locked numbers/rules.

## Watch items (not authorized changes)

- **Heap longevity:** 96 HP dying before beat 4 (`Front 12 → Back 11 → both rows 6 → 14`) is a mathematical prior, not an established failure. If three ordinary humans also mostly never see the 14, then HP or cycle length/order becomes earned.
- **Staff:** 16/21 under a leftover-energy policy is a red circle, not a redesign. If naive players independently arrive at “no combo, so Staff, Staff, Staff,” Old Man’s ordinary-hand identity is a real failure.

## Naive-human protocol

2–3 players who do not know the intended solutions.

Teach **controls only** (energy, select card, target, end turn / Pass, Move button exists and costs energy). Do **not** teach strategic interpretations, including:

- “Rat King likes Front.”
- “Use Guard when you want to stay.”
- “Opened can be saved for your partner.”
- “Heap is a stay-in-Front card.”
- which intents to dodge
- that the Rat does not intercept / is not a combatant

Observe specifically:

- Do they voluntarily stay in Front when threatened?
- Do they realize Move costs a card opportunity?
- Do they distinguish Move from Guard?
- Do they understand Opened creation vs consumption?
- Do they deliberately leave Opened standing (including for the partner)?
- Do they misinterpret the Rat?
- Do they default to Staff?
- Do they look at the battlefield, or only the intent rail?
- Which intent-cycle beats actually appear?

## Telemetry (this freeze-break)

`openedAvailableButDeclined` means: a legal Consume was in hand at turn start and the player chose **not** to play a Consume-aimed card before ending the turn.

`consumeCardPlayedBaseKilledTarget` means: they played a Consume-legal attack at the Opened enemy and the **base** hit killed it before the Consume rider could apply. That is not a decline.
