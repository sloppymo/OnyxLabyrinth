# Phase C — Undertow (Caller → Flood Brute) Embodied Playtest

Date: 2026-08-19
Runs: `.tmp-ai-player/run-1787177*-42` (4 episodes)
Method: Targeted checkpoint staging (`f5-undertow`), driven through the real
browser UI. Naive-play-first.
Formation: `f5-flood-brute` (w4) — Demon Brawler + Flood Brute + Demon Spawn
(front), Undertow Caller + Demon Mage (back). Party level 13.

## Executive result

**PASS on mechanics and readability. T2, not T3 — and the reason is worth
acting on.**

The full Setup → Payoff loop was observed live, the mark is visible on every
player-facing surface, and the Brute demonstrably hunts the marked character
over a more wounded one. But the relationship does not create a competing
claim on the party's turn, because **there is deliberately no removal action**
— so the player's answer is "kill one of the two," the same answer as any
priority target.

## The loop, observed

```
t1   Undertow Caller uses Undertow, inflicting undertow on Aria!
     Aria is undertow!
     PARTY: Aria 196/196 {undertow}   Coda 172/182   Dell 112/112   Eve 135/140
t2   Flood Brute uses Drowning Lunge on Aria for 20 damage!
     PARTY: Aria 176/196 {undertow}
...
     Aria is free of the undertow.
```

**The target-preference evidence is the good part.** The Brute lunged at Aria
at **196/196 — full HP** — while Coda (172/182) and Eve (135/140) were both
wounded and equally reachable. The mark beat the generic "finish the weakest"
instinct in live play, which is exactly what the relationship promises.

## Readability — verified on every surface

| Surface | Result |
|---|---|
| Combat log (setup) | `Undertow Caller uses Undertow, inflicting undertow on Aria!` |
| Party status strip | `Aria 196/196 {undertow}` — renders alongside `{poison}`/`{blind}` |
| Combat log (payoff) | `Flood Brute uses Drowning Lunge **on Aria**` — names the marked target |
| Expiry | `Aria is free of the undertow.` |
| Sprite | `UNDERTOW_TINT` deep-water wash, ranked above the poison tint |

The exploit event names the marked character in the message text, not only in
the event payload — the lesson from Conduct's telegraph line.

## Tempo — the positional rule applied a third time

Setup → Payoff needs **both** halves alive across the marking turn and the
exploiting turn. The Brute was originally listed first in `f5-flood-brute`, so
it was the body the combat UI opens on, and naive play deleted it on round 2.
Measured at party level 13, 300 trials:

| | marked | **exploited** | Brute dies |
|---|---:|---:|---:|
| Brute listed first (before) | 82% | **29%** | round 2 |
| Brute screened behind the brawler (after) | 76% | **53%** | round 3 |
| hunt the Caller | 50% | 45% | round 5 |
| spread damage | 74% | 62% | round 5 |

One line, same pack size, same composition. This is the third distinct shape
of the same rule:

> Whichever body a relationship cannot afford to lose must not be the default
> target. For **Consume** that is the resource; for **Setup → Payoff** it is
> the payoff actor; for **scaling** (Conduct) there is no such body, which is
> why Conduct could safely put its amplifiers in front.

The Caller is also gated on a Brute being present (`allyPresent` on
`flood-brute`). Two formations carry a Caller with no Brute; an ungated Caller
would spend turns there teaching the player the status is harmless.

## Six-question protocol

1. *What did I notice first?* Five bodies, and the Caller chipping the party
   with cone-of-cold every single round. It reads as a caster-pressure fight.
2. *What did I want to kill first?* The Demon Brawler — the default target —
   then whatever came forward next.
3. *Did anything make me change the plan?* **Partly.** The `{undertow}` tag
   appearing on a party member and the Brute lunging at that exact character
   the following turn is the moment the two enemies visibly connect. It made
   me want to protect the marked character — but the game offers no action
   that does so, which is the finding below.
4. *Can I describe what they were doing together?* Yes, immediately and
   precisely: the Caller picks someone out, the Brute goes for them.
5. *Did I learn a reusable rule?* Yes — "Callers mark someone, Brutes hunt
   the marked one."
6. *Would I anticipate it on a repeat?* Yes. Seeing a Caller and a Brute in
   the same formation, I would expect a tag to land and the Brute to redirect.

## Tier: T2, argued down from T3

I claimed T3 for Conduct because battle state published a number on a visible
timer and three responses genuinely competed. Undertow does not clear that bar:

- **The mark creates no competing claim on the turn.** The available answers
  are kill the Caller, kill the Brute, or endure. Those are the same answers
  the formation already had — the mark redirects damage rather than opening a
  new decision.
- **There is no removal action.** Cure was deliberately not implemented (see
  below), so "spend a turn freeing them" is not on the menu. That is precisely
  the action that would make the choice competitive.
- **Defend on the marked character** is technically available but the player
  cannot act out of turn order, so it rarely lines up.

T2 is the honest read: a legible, transferable species relationship that
changes *who* gets hit, not *what the player does about it*.

## Findings for the human (not fixed)

### 1. The payoff does less damage than an ordinary attack

Drowning Lunge landed **20**. Elsewhere in the same fight a plain Flood Brute
attack landed **29**. The "exploit" is a damage *downgrade* over its basic
attack, and its whole value is the redirection.

This is the Spawn Bomb anticlimax in a new costume, and it is my own tuning
call — I set power 14 deliberately conservative per the brief ("start
conservative; a strong AI target preference plus a moderate payoff may be
enough"). Reporting the number rather than tuning toward a feel, as
instructed. If it should hit harder than a basic attack, power needs to go up.

### 2. No cure counter exists, and that is what caps the tier

I chose **not** to promise a cure, and the reasoning should be on record.
Both existing cure spells (`priest-neutralize-poison`, `priest-cure-blind`)
are one-status-per-spell Priest tier-2 *purchases*. Adding a third would gate
the counter behind a spell the party may never have bought — the false-counter
failure the authoring contract exists to prevent. The cure *items* have the
same problem.

So the verified counters are: **prevent** (kill the Caller), **deny** (kill
the Brute), **endure** (3-round expiry), **Defend**. Row positioning is not a
counter and is not claimed — `canReach` is an always-true shim.

**This is the single change that would take Undertow from T2 to T3**, and it
is a content decision (a new spell/item, plus ensuring Floor-5 access) rather
than a mechanic one. The plumbing is intentionally *not* pre-built, to avoid
dead code.

### 3. Frequency is honest but not high

53% exploitation under naive play means roughly half of these fights show the
complete relationship. The mark itself lands 76%. Both halves firing requires
the Caller to act and the Brute to survive a round, which is the correct
fragility for a two-actor combo — but it means the rule is learned over
several encounters rather than in one.

## Verification status

- `npm run check` passes. 46 tests in `combat-f345-chemistry.test.ts`,
  10 covering Undertow.
- Architecture is the narrowest fit: a new `undertow` StatusEffect following
  the existing `s.<name>Timers` + `tickStatuses` pattern. `exposed` (Thief
  post-Hide) and `wet` (dungeon water) were rejected as already-owned. No
  generic mark framework was built.
- `undertow` is in `COMBAT_ONLY_STATUSES`, so it cannot walk the dungeon into
  the next fight and pre-arm the Brute's preference.
- Boss tables re-audited after the change: both still **CLOSED**.
