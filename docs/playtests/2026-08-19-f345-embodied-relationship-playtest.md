# Phase A Embodied Relationship Playtest — Floors 3/4/5

Date: 2026-08-19
Runs: `.tmp-ai-player/run-1787116421617-42` … `run-1787118051105-42` (13 episodes)
Method: Targeted checkpoint staging (not organic play), driven through the real
browser UI with ordinary keys
Authority: `docs/encounter-audit.md` § "Playtest protocol (Floor 2)"
Precedent: `docs/playtests/2026-08-18-f2-targeted-chemistry-verification.md`

## Executive result

**MIXED — the mechanics all work and all read clearly. But three of the four
rarely get the chance to happen in natural play.**

Every relationship fires correctly and is legible when it fires. The problem
found in embodied play is **tempo**: at level-appropriate party strength, the
party destroys one end of the relationship before it can express itself. The
headless verification measured 95–99% appearance rates, but it measured a
**defending** party that never kills anything. A party that actually fights
suppresses most of these relationships.

Six new checkpoints were added (`scripts/ai-player/checkpoints.ts`) so each
formation could be observed rather than waited for.

## The headline finding: default-target position decides whether a relationship survives

The single most useful thing this playtest produced is a rule that predicts
which relationships work:

> **A Protect relationship whose protector occupies the default target slot
> reinforces itself. A Consume relationship whose resource occupies the
> default target slot destroys itself.**

The combat UI opens the target list on the front-most enemy. So:

- **Choir Warden / Drowned Sentinel (Protect).** The protector is the front
  body. A player attacking normally attacks *the protector* — which is exactly
  what the relationship wants. The protected caster survives, the guard fires,
  the player sees it. **Self-reinforcing.**
- **Rune Knight → Lesser Construct (Consume).** The construct is the front
  body *and* the ammunition. A player attacking normally destroys *the
  resource* before it can be spent. **Self-defeating.**
- **Demon Mage → Spawn (Detonate).** Same shape as Overload — the spawn is a
  low-HP body that dies to any attention at all.

This is a composition-level insight, not a code bug, and it is the thing worth
carrying into Phase B.

## Per-relationship results

### F3 · Rune Knight → Lesser Construct — mechanic ✓, delivery ✗

**Formation:** `f3-guardian-rune-line` — Lesser Construct + Animated Armor
(front), Rune Knight + Warlock (back). Party level 8.

**Four episodes, three lines of play:**

| Play style | Target order | Overload fired? |
|---|---|---|
| Naive (accept default target) ×2 | Lesser Construct | **No** — construct destroyed round 2 |
| "Smart" (focus squishy back casters) | Warlock → Rune Knight | **No** — Knight destroyed round 3 |
| Deliberately sparing both ends | Animated Armor only | **Yes** |

Both *natural* lines of play kill an end of the relationship. The naive player
kills the ammunition because it is the default target; the thoughtful player
kills the caster because the target list advertises it as squishy (`Rune
Knight 10-18`, `Warlock 15-23`, versus `Animated Armor 4-6`). **There is no
natural line of play that spares both.**

When spared, it reads well — a full round of warning, then the payoff:

```
t3   Rune Knight begins charging Rune Overload!
...
t7   Rune Knight resolves Rune Overload!
     Lesser Construct is consumed by Rune Knight!
     Rune Knight resolves Rune Overload on Aria for 12 damage!   (x4 party)
     Lesser Construct is consumed.
```

**Six-question protocol** (from the spared run, the only one where it happened):

1. *Noticed first?* Two armoured bodies in front, two casters behind. A
   standard-looking wall formation.
2. *Wanted to kill first?* The Warlock — highest damage preview, so softest.
3. *Did anything change the plan?* **Yes, once — "Rune Knight begins charging
   Rune Overload!"** That line reframes the construct from "tanky wall I can
   ignore" to "thing that is about to be fired at me," and it arrives a full
   round before the payoff. That is a real T3 beat.
4. *Can I describe what they were doing together?* Yes, unambiguously — the
   Knight drained the construct and threw it through the party.
5. *Reusable rule?* "Rune Knights spend constructs. Kill one end."
6. *Anticipate on a repeat?* Yes — but only because I saw it once. In the two
   naive runs there was nothing to anticipate.

**Tier: designed T3, delivered T1.** The telegraph genuinely creates the "did
something make me change my plan" moment the taxonomy asks for. But across
four episodes it happened only when I deliberately played *around* the
relationship. As shipped, this formation plays as "two walls and two casters."

### F4 · Choir Warden → Discordant Cantor — mechanic ✓, delivery ✓

**Formation:** `f4-choir-armor` — Choir Warden + Animated Armor (front),
Discordant Cantor + Demon Mage (back). Party level 11.

| Play style | Guard fired? |
|---|---|
| Naive (accept default target = the Warden) | **Yes** — "Choir Warden guards Discordant Cantor!" |
| Focus the squishy Cantor immediately | **No** — Cantor destroyed on my third action |

The naive case is the common case, and it works — because the player is
already hitting the protector. The full sequence with the plan change:

```
t7    Choir Warden guards Discordant Cantor!
t8    targets:  Choir Warden(5-7)  Animated Armor(5-7)
                Discordant Cantor(INTERCEPT 5-7)  Demon Mage(15-23)
t8    Choir Warden intercepts the attack meant for Discordant Cantor!
      Eve attacks Choir Warden for 6 damage.
t9    targets:  ... Discordant Cantor(11-21) ...      <- token spent
```

**Six-question protocol:**

1. *Noticed first?* The Warden — biggest body, worst damage preview (5-7),
   obviously a wall.
2. *Wanted to kill first?* The Cantor. The preview said 9-17 against it versus
   5-7 against the Warden, so it was clearly the soft, valuable target.
3. *Did anything change the plan?* **Yes.** The target entry changed from
   `9-17` to `INTERCEPT 5-7`. That is the game telling me, at the exact moment
   of the decision, that my good option has been closed — and quantifying the
   cost. I switched to breaking the guard first.
4. *Can I describe what they were doing together?* Yes — the Warden physically
   stepped in front of the singer.
5. *Reusable rule?* "Wardens cover the Choir's casters. Break the wall or
   spend an attack on it."
6. *Anticipate on a repeat?* Yes. This is the most anticipatable of the four,
   because the forecast lives in the targeting UI rather than in scrollback.

**Tier: T2, honestly earned.** Removing the Warden changes what the Cantor
can survive; the INTERCEPT forecast makes the choice explicit. It is not T3 —
there is one clearly correct answer once you read the label (break the wall or
pick a different target), and nothing during the fight forced me to
re-plan a second time.

### F5 · Drowned Sentinel → Caller/Wraith — mechanic ✓, delivery ◐

**Formation:** `f5-golem-cistern` — Ice Golem + Drowned Sentinel (front),
Cistern Wraith + Undertow Caller (back). Party level 13.

Guard did **not** appear within ~4 rounds in the first episode; it appeared at
round ~4–5 in a longer one, protecting the **Cistern Wraith** (the more
wounded of the two eligible casters, matching the documented HP-fraction
priority):

```
     Drowned Sentinel guards Cistern Wraith!
t16  targets: Ice Golem(6-9)  Drowned Sentinel(4-6)
              Cistern Wraith(INTERCEPT 4-6)  Undertow Caller(13-25)
     Drowned Sentinel intercepts the attack meant for Cistern Wraith!
```

**Six-question protocol:**

1. *Noticed first?* Not the relationship — the **attrition**. Blind on Aria,
   Curse on Coda, paralysis from Shield Bash and Flash Freeze, cone-of-cold
   every round. This fight's identity is status pressure.
2. *Wanted to kill first?* The Ice Golem, because it was in front — a mistake:
   it self-repairs 16 HP, so attacking it is a treadmill.
3. *Did anything change the plan?* **Yes, but not because of the guard.** The
   Golem's Self-Repair did. The guard arrived so late that the fight's shape
   was already decided.
4. *Can I describe what they were doing together?* Only after the fact, and
   only for one beat. Mostly this read as four independent enemies applying
   statuses.
5. *Reusable rule?* Weakly — "the big drowned thing will eventually cover one
   of the casters."
6. *Anticipate on a repeat?* Probably not. One late intercept in a long,
   noisy, status-heavy fight is not enough to teach a rule.

**Tier: T2 mechanically, T1 as experienced.** The guard works and the
INTERCEPT forecast is as clear as Floor 4's, but it is buried. `maxUses: 1`
plus a 6-round cooldown plus the slowest actor in the game (agi 4) plus a
formation whose *actual* identity is status attrition means the relationship
is a footnote in its own fight.

### F3/F4 · Demon Mage → Spawn Bomb — mechanic ✓, delivery ✗

Three episodes, three formations, **zero detonations**.

| Formation | What happened |
|---|---|
| `f1-spawn-bomb` (F1, the teaching fight) | Killed a spawn on action 1; Mage **immediately summoned a replacement**; killed that too; killed the Mage. No bomb. |
| `f3-demon-spawn-mage` (pre-placed) | Mage spent its turns on Anti-Magic Field and Hellfire; by the time it might have bombed, focus-fire had cleared the front and the spawn died. No bomb. |
| `f4-viper-mage` (summon-gated, measured 88% headless) | Killed the Viper Man; Mage summoned a spawn; party deleted the 29 HP spawn in one round (18+23); killed the Mage. No bomb. |

The ammunition is a low-HP body that dies to any attention, and the Mage
cannot bomb on its first action (`condition: notFirstTurn`). The window is
narrow and the party routinely closes it.

**This is the most important negative result in the report**, because
`f4-viper-mage` is the formation my headless harness measured at **88%
firing**. Embodied, with a party that fights, it fired **0 of 1**. The
discrepancy is entirely explained by the defending-party artifact.

**Six-question protocol** (F1 teaching fight, the naive run):

1. *Noticed first?* Two small fast things in front, a caster behind.
2. *Wanted to kill first?* The small things — they were poisoning us.
3. *Did anything change the plan?* **Yes, mildly — "Crypt Demon Mage summons
   Crypt Demon Spawn!"** Killing a spawn and watching it be replaced
   immediately does teach *"the caster is the source"*, which is a real and
   useful lesson. It is just not the Spawn Bomb lesson.
4. *Can I describe what they were doing together?* Yes, but as
   **summoner→minion**, not as **bomber→ammunition**.
5. *Reusable rule?* "Kill the mage or it keeps making more."
6. *Anticipate on a repeat?* I would anticipate *summoning*. I have no reason
   to anticipate a detonation, because I have never seen one.

**Tier: T1 as delivered.** "Kill the summoner" is one obvious answer.

## The two flagged questions, resolved with play evidence

### 1. Phalanx-guard vs intercept-guard — NOT muddy. Resolved.

I flagged the risk that the same actor expressing protection two ways would
read as one thing. **In play they are clearly distinct, and the decisive
differentiator is the targeting UI rather than the log.**

| | Phalanx Guard / Ward | Intercept guard |
|---|---|---|
| Log | `Choir Warden uses Phalanx Guard, boosting Discordant Cantor's ac!` + `Discordant Cantor's ac rises!` | `Choir Warden guards Discordant Cantor!` |
| Target list | **unchanged** (`Discordant Cantor 9-17`) | **`Discordant Cantor INTERCEPT 5-7`** |
| On attack | nothing special | `Choir Warden intercepts the attack meant for Discordant Cantor!` |
| Counter | none — just tankier | consumable; one attack spends it |

The AC buff is a number the player never sees directly. The intercept
rewrites the entry the player is looking at *while choosing a target*, and
changes the predicted damage. There is no ambiguity at the decision point.

**No code change needed.** This concern is closed.

### 2. Is the damage anticlimactic? — Yes for Spawn Bomb; no for Overload.

Observed payoffs at level-appropriate party strength:

| Ability | Observed | Party HP at that level | Share |
|---|---|---|---|
| Rune Overload | 12 / 12 / 16 / 13 (≈53 total) | ~135 each | ~10% each |
| Spawn Bomb (F1, headless reference) | 4 each | ~56 each | ~7% each |
| *For comparison:* Demon Mage Hellfire | 7 / 8 / 11 / 10 | — | same ballpark |

**Rune Overload does not feel anticlimactic.** A full round of telegraph
followed by ~10% of everyone's HP, and the enemy loses a 56 HP body to do it,
reads as a fair trade. The telegraph is doing the dramatic work, not the
number.

**Spawn Bomb does.** It lands in the same range as the Mage's *ordinary*
Hellfire (7–11 per member) while additionally costing the enemy a body. There
is no wind-up to sell it either. If a player did see it, the natural read is
"that was just another fire spell" — the sacrifice is invisible in the
outcome.

Reporting only, per instruction — no numbers were retuned.

## Cross-floor literacy — could not be tested as intended

The intended test was: see Spawn Bomb on Floor 1, then meet Demon Mage +
Spawn later and check for anticipation.

**The test could not run, because the Floor 1 teaching fight never taught the
rule.** In naive play the bomb did not fire on Floor 1, so there was nothing
to transfer, and it did not fire on Floors 3 or 4 either. Zero detonations
across three floors.

The earlier source-level literacy check remains valid and is not contradicted:
name, presentation key, element, log wording and `resourceId` are identical
across floors, so *if* a player sees it once they will recognise it. But this
playtest cannot claim the transfer was observed, because the first exposure
never occurred.

What *did* transfer: **summoning**. Watching the Mage replace a killed spawn
on Floor 1 is a real learned rule, and it recurred on Floor 4.

## Something for the human to decide (not fixed inline)

Per instruction I stopped rather than fixing. The systemic tempo problem is
composition/tuning work, not a bug, and it is larger than "verify what you
built":

1. **`f3-guardian-rune-line` cannot express its relationship.** Both natural
   lines of play kill an end. Options a human should weigh: give the Knight a
   second construct (so killing one does not deny the payoff — this is exactly
   what makes `f1-spawn-bomb` better, it has *two* spawns); move the construct
   off the default target slot; or shorten the wind-up.
2. **Spawn Bomb's window is too narrow to ever be seen.** `notFirstTurn` plus
   a fragile resource plus focus-fire means it effectively does not exist in
   play. The `f1-spawn-bomb` two-spawn pattern is the only version with a real
   chance, and even that failed once.
3. **Headless appearance rates in the previous report are not predictive.**
   The >80% appearance tests in `combat-f345-chemistry.test.ts` use a
   defending party and should be read as "the ability is reachable", not "the
   player will see it". That caveat should be attached to those tests.

## Summary

| Relationship | Fires? | Reads when it fires? | Natural play sees it? | Tier delivered |
|---|---|---|---|---|
| Rune Knight → Construct | ✓ | ✓✓ (1-round telegraph) | **✗** (0 of 3 natural lines) | T1 (designed T3) |
| Choir Warden → Cantor | ✓ | ✓✓✓ (INTERCEPT forecast) | **✓** (naive play works) | **T2** |
| Drowned Sentinel → Caller/Wraith | ✓ | ✓✓ (INTERCEPT forecast) | ◐ (late, buried in attrition) | T1–T2 |
| Demon Mage → Spawn Bomb | ✓ (headless) | — (never observed live) | **✗** (0 of 3 episodes) | T1 |

The guard/Protect pattern is validated and should be the template for future
propagation. The consume/Detonate pattern needs composition support before it
can carry a floor.
