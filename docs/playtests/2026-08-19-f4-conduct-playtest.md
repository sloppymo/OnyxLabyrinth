# Phase B — Null Choir "Conduct" Embodied Playtest

Date: 2026-08-19
Runs: `.tmp-ai-player/run-1787151*-42`, `run-1787152172604-42` (3 episodes)
Method: Targeted checkpoint staging (`f4-conduct`), driven through the real
browser UI with ordinary keys. Naive-play-first, per the methodology that
actually surfaced problems in the previous pass.
Formation: `f4-chorister-demon` (w3) — 2× Iron Chorister (front), Discordant
Cantor + Demoness + Succubus (back). Party level 11.

## Executive result

**PASS. Conduct is the strongest relationship shipped so far.**

It is the only one where the player can *watch the number they changed*. All
three intended counters were executed in embodied play, and the payoff ranges
3× between an unsupported Cantor and a full choir.

Crucially, it worked **on the first embodied attempt** — no tempo-fix cycle
was needed, because the lesson from the previous round was applied at design
time rather than rediscovered.

## Why no tempo failure this time

The previous pass produced a rule: *don't let naive play delete or bypass the
mechanism before it can express*. Applying it here required noticing that
**Conduct inverts it.**

Conduct is not a Consume relationship. Nothing is reserved, nothing is
destroyed, and the payoff reads living allies at resolve time. So it
**degrades** rather than **breaks**:

| | Rune Overload (Consume) | Conduct (scaling) |
|---|---|---|
| Resource in default target slot | **fatal** — naive play cancels it outright | **desirable** — naive play thins it |
| Killing one amplifier | denies the whole payoff | reduces the payoff |
| What needs protecting | the resource | nothing; the conductor is already back-row |

So the Choristers were deliberately placed **in** the front/default slot, and
the Cantor behind them. Naive play chips an amplifier — the intended counter —
and cannot cancel the phrase by accident. That is the opposite of the Rune
Knight fix, and it is the right call for this shape.

Measured before playing, party level 11, 300 trials:

| Line of play | Phrase fires | Avg voices |
|---|---:|---:|
| Naive front-focus | **95%** | 1.03 |
| Hunt the Cantor | 45% | — |
| Spread damage | 66% | 1.99 |

## Embodied episodes

### Episode 1 — naive play (accept the default target)

```
t4   Discordant Cantor begins charging Discordant Phrase! (2 voices answering)
...
t8   Discordant Cantor's Discordant Phrase swells — 1 voice joins!
     Discordant Cantor uses Discordant Phrase on Aria for 12 damage!  (15/18/18)
```

The telegraph announced **2 voices**; by resolution it was **1**. The player
is shown the number before they act and the changed number when it lands.
That is the whole relationship, legible in two log lines.

### Episode 2 — hunt the conductor

Cantor destroyed in 5 actions, before it ever began a phrase. The target list
even forecast the kill (`Discordant Cantor(11-21 KO)`). **Cancelling is a real,
executable counter**, not a theoretical one.

### Episode 3 — the unsupported floor

By the time the Cantor charged, the singers were dead:

```
Discordant Cantor begins charging Discordant Phrase! (1 voice answering)
Discordant Cantor's Discordant Phrase swells — 0 voices join!
Discordant Cantor uses Discordant Phrase on Aria for 6 damage!  (6/9/7)
```

**The full observed range is 3×:** 6–9 damage unsupported, 12–18 at one voice.
A silenced choir makes its conductor pitiful, which is exactly the fantasy.

## Six-question protocol (from Episode 1, the naive line)

1. *What did I notice first?* Two identical heavy armoured bodies in front and
   three casters behind. The Succubus put Coda to sleep on the opening turn,
   so the back line read as the "annoying" half.
2. *What did I want to kill first?* The front Iron Chorister — it was the
   default target and it was hitting for 27–29.
3. *Did anything make me change the plan?* **Yes.** `(2 voices answering)`
   reframed the front line from "tanky nuisance soaking my damage" into "the
   reason the back-row caster is dangerous." It also made the Demoness's
   healing matter in a new way — she was repairing the *amplifiers*.
4. *Can I describe what they were doing together?* Yes, precisely: the Cantor's
   attack is powered by how many singers are still standing.
5. *Did I learn a reusable rule?* Yes — "Cantors get stronger with every singer
   alive. Thin the choir or kill the conductor."
6. *Would I anticipate it on a repeat?* Yes, and specifically I would **watch
   the number in the telegraph**, which is a more actionable form of
   anticipation than the other four relationships offer.

## Tier: T3, argued

I have been conservative about T3 throughout this program and rejected it for
the other four relationships. Conduct earns it, for reasons the others did not:

- **Battle state forces reconsideration, with a visible one-round timer.** The
  telegraph is not flavour — it publishes the current payoff strength while the
  player still has a turn to change it.
- **Three responses genuinely compete, and all three were executed embodied.**
  Thin the choir (Ep. 1), cancel by killing the conductor (Ep. 2), or endure
  (Ep. 3). Each has a different, real cost: the Choristers are 82 HP with 15%
  physical resistance *and* are being healed; the Cantor is 54 HP but is behind
  them; enduring costs ~10% party HP per phrase.
- **The choice is quantified, not vibes.** "Two voices" versus "one voice" is a
  number the player can act on.

**Honest caveat:** my driver runs a fixed target policy per episode, so I could
not demonstrate the mid-fight *pivot* within a single run. Episode 1 supplied
the information that demands reconsideration; Episode 2 proves the pivot is
executable in the available time. A human would close that loop in one fight. I
am claiming T3 on those two facts together, not on a listable strategy menu.

## Findings worth the human's attention (not fixed)

1. **The fight is grindy.** Two 82 HP Choristers with 15% physical resistance,
   healed 8–10 HP by the Demoness, took 15+ turns of naive play without
   dropping both. The relationship reads well; the fight around it is long.
   Dropping the Demoness would sharpen it — I kept her because Mass Mend at
   6 power on a 2-round cooldown cannot outpace a level-11 party, so she is not
   a *false counter*, only a tax.
2. **The Demoness heals the amplifiers**, which is an unplanned but coherent
   second-order interaction: a healer on a scaling relationship extends the
   payoff's strength. Worth knowing before healers are added to other Conduct
   formations.
3. **`f4-choir-armor` (w4) and `f4-choir-guardian` (w2) contain a Cantor with
   no Choristers**, so the phrase is inert there — correctly, and by design.
   Those two keep the Warden→Cantor guard as their relationship.

## Verification status

- `npm run check` passes; 37 tests in `combat-f345-chemistry.test.ts`,
  12 of them covering Conduct.
- The generic `livingAllies` scaling has no `conduct` effect kind — the
  resolver counts tagged allies and adds power; the choir exists only in the
  ability name and `presentation: "conduct"`.
- Boss tables re-audited after the change: both still **CLOSED**.
- `discordant-cantor` + `iron-chorister` coexist in exactly one formation.
