# Three-Boss Combat Audit and Differentiation Proposal

Date: 2026-08-19
Baseline: `774c87d` + this branch's Phase A–C work
Scope: `headmasters-echo` (The Dead Boy, F3), `headmasters-echo-remnant`
(The Lonely Girl, F4), `headmasters-echo-ascendant` (The Crying Man, F5)
Status: **Audit + proposal. No boss changes implemented.**
Narrative authority: `docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md` §4.1

## Executive finding

**All three climax bosses are T1, and they are the *same* T1.**

The escalation from Floor 3 to Floor 5 is almost entirely numerical. This is
the exact failure this project spent its whole span fixing on the roaming
floors — stat escalation substituting for authored behaviour — and the
climax fights are now the last place in the campaign where it is still true.

Worse, the roaming floors have moved: an ordinary Floor 4 `f4-chorister-demon`
encounter is now **T3**, while the Floor 4 *boss* is T1. The filler is more
authored than the climax.

## 1. What they actually share (verified from source)

The original roster audit's claim is **confirmed**. All three carry the same
six abilities, byte-identical:

| Ability | Target | Real effect | Condition | Wind-up |
|---|---|---|---|---|
| `echo-of-silence` "Stolen Quiet" | allParty | **status `blind`** 50% / 2r | turnInterval 3 | yes |
| `memory-drain` | allParty | drain 6 | turnInterval 3 | yes |
| `dark-pulse` | allParty | drain 4 | turnInterval 3 | yes |
| `memory-shatter` | singleParty | drain 8 | hpBelow 66 | no |
| `total-eclipse` | allParty | damage 10 | hpBelow 33 | yes |
| `anti-magic-field` | self | fizzleField 3 | **firstTurn only** | yes |

Plus an identical passive on all three:
`special: { kind: "silenceRandom", target: "party", duration: "combat" }`.

### Everything that differs

| | Dead Boy (F3) | Lonely Girl (F4) | Crying Man (F5) |
|---|---:|---:|---:|
| HP | 192 | 235 | 285 |
| Attack | 24 | 27 | 31 |
| AC | 13 | 15 | 17 |
| AGI | 9 | 10 | 11 |
| Extra abilities | — | `curse` | `curse`, `ice-shards` |
| Phase thresholds | 66 / 33 | 66 / 33 | 70 / 45 / 20 |

**That is the entire authored difference between three campaign climaxes:
four stat lines and two generic abilities borrowed from ordinary roaming
casters.**

## 2. Three findings the roster audit did not capture

### 2.1 The kit is not six abilities — it is about four verbs, and two are duplicates

Three of the six are the **same verb**: `drain`. And two of those three are
near-identical twins:

| | `memory-drain` | `dark-pulse` |
|---|---|---|
| target | allParty | allParty |
| effect | drain | drain |
| condition | turnInterval 3 | turnInterval 3 |
| wind-up | yes | yes |
| power | 6 | **4** |

Same target, same verb, same condition, same telegraph, differing only in a
power value. In play these are one button with two names. The player cannot
distinguish them and there is no reason to respond differently.

Counting honestly, the kit is: **one AoE blind, one AoE drain (×2 names), one
single-target drain, one flat AoE nuke, one first-turn antimagic.** Five of
the seven possible actions are "hit the whole party a bit."

### 2.2 The silence passive eats 40% of every boss turn

`combat-ai.ts:349` checks `silenceRandom` **before** abilities and
`return`s immediately, so a fired silence consumes the boss's entire turn. At
`rng() < 0.4`, roughly **two turns in five** the campaign's climax boss does
exactly one thing: silence one character.

Combined with five of six abilities carrying `windUp: true`, the boss spends
most of the fight either telegraphing or silencing. The damage cadence is slow
and the player mostly watches.

### 2.3 "Stolen Quiet" does not do what it says — three layers disagree

Flagged before dispatch and **confirmed still true**:

```
id:          "echo-of-silence"     <- says silence
name:        "Stolen Quiet"        <- says silence
description: "Silences the entire party."   <- says silence
effect:      { kind: "status", status: "blind", ... }   <- applies BLIND
```

The ability the fiction calls a silence is mechanically a **party-wide
blind**. The actual silencing in these fights comes from somewhere else
entirely — the `silenceRandom` passive (§2.2).

This matters beyond tidiness. Blind and silence have *different counters*:
blind is cured by `priest-cure-blind` and ends on a timer, while the
`silenceRandom` silence is a per-round flag with a dedicated counter
(`mage-spellbreaker` grants immunity). A player reasoning from the ability
name will prepare the wrong answer. It is also, thematically, the single most
important ability on a boss whose floor NPC says *she took her voice* — and
it does not take anyone's voice.

## 3. T0–T3 audit

Applying the same taxonomy used for the roaming formations, and the same
standard of evidence — what actually happens in play, not what the code
suggests.

### The escorts are inert by construction

| Boss | Escort composition |
|---|---|
| Dead Boy (`f3-grand-forge-guardian`) | 2× animated-armor, ironclad-knight, **boss**, warlock |
| Lonely Girl (`f4-lonely-girl`) | animated-armor, demon-champion, ironclad-knight, **boss**, warlock |
| Crying Man (`f5-crying-man`) | ironclad-knight, black-knight, demon-champion, **boss**, warlock, succubus |

Structurally the same fight three times: a generic armoured wall, the boss,
and a generic caster. **No enemy in any boss formation interacts with any
other.** Chemistry is closed in these tables — deliberately, by the decision
recorded in `combat-relationship-vocabulary.md` (Correction 2) — so nothing
here is accidental. But the consequence is that the escorts contribute
nothing except HP.

Note what is *absent*: the Lonely Girl is the boss of **the Null Choir** and
her escort contains no Choir member. The Crying Man is the boss of **the
Weeping Cistern** and his escort contains no Cistern native. The floors' own
casts do not appear at their own climaxes.

### The boss's own kit has no internal structure

No ability references another. There is no setup→payoff, no resource, no
protection, no scaling. `memory-shatter` (hpBelow 66) and `total-eclipse`
(hpBelow 33) unlock as HP falls, but unlocking *more of the same verb* does
not change what the player should do.

### Phases are a stat bump and a log line

`checkBossPhases` (`combat-eor.ts:167`) grants **`+4 attack` per threshold
crossed** and emits a `phaseChange` event. That is the entire phase system.
No behaviour changes, no kit changes, no new pattern.

The Crying Man's thresholds (70/45/20) are also **misaligned with his own
ability gates** (66/33), so the phase announcements and the actual kit
unlocks happen at different moments — the "phase" the player is told about
and the phase the fight actually enters are different things.

### Verdict

| Boss | Tier | Why |
|---|---|---|
| The Dead Boy | **T1** | Recognisable threat, one obvious answer: damage it, heal through the AoE. |
| The Lonely Girl | **T1** | Identical, plus `curse`. |
| The Crying Man | **T1** | Identical, plus `curse` and `ice-shards`, one more phase. |

None reaches T2, because T2 requires enemies to affect one another and
removing one to change what another can do. Nothing in these fights does.

The historical design doc states the intent plainly: *"Boss fight is a
gear/level check, not a puzzle."* That was a deliberate MVP decision, and it
is still exactly what ships. The question this audit puts to the human is
whether that intent still holds now that ordinary encounters have moved to
T2/T3.

## 4. The narrative already contains the answer

From the canonical narrative spec §4.1 — the *superseded draft names* are the
useful artefact, because each encoded a floor affiliation the shipped names
deliberately dropped:

| Boss | Draft name | Floor |
|---|---|---|
| The Dead Boy | The Vanguard's **Echo** | 3 |
| The Lonely Girl | The Choir's **Echo** | 4 |
| The Crying Man | The **First Descent** | 5 |

And the internal IDs preserve a progression the fights never express:
`headmasters-echo` → `-remnant` → `-ascendant`.

Two further constraints from the same spec, which any proposal must respect:

- *"Three of the kept, encountered deepest-last."*
- *"The game never explains who they were, and **must not** — no journal, no
  NPC exposition dump, no death-quote reveal."* The floor NPCs gesture
  obliquely and that is *the whole budget*. Notably **Vesper on floor 4 says
  *she* took her voice.**

This is a gift for a mechanical proposal: a **mechanic explains nothing**. It
can carry the escalation without spending a single word of exposition, which
is precisely what the narrative canon demands.

## 5. Proposal — escalate the *kind* of echo, not the numbers

One spine, three mutations. Each boss teaches one rule; the next boss bends
the rule the player just learned. This mirrors the campaign escalation model
already validated on floors 1–5, and it uses the echo/remnant/ascendant motif
that is already in the IDs rather than inventing a new one.

### The Dead Boy (F3) — **self-echo**: what he did, he does again

The rule, stated once and never explained: **his actions repeat.** An ability
resolves, and one round later it echoes at reduced strength.

- **Learned rule:** "What he just did, he is about to do again."
- **Counters:** brace/Defend into the known repeat; burst him below the next
  threshold to change what is in the queue; interrupt the echo if it
  telegraphs.
- **Why it fits:** it is the literal meaning of *echo*, it is the shallowest
  of the three, and it teaches a pattern the next two bosses can violate.
- **Machinery:** reuses the existing wind-up/telegraph vocabulary. The echo
  is a queued repeat, not a new effect kind.

### The Lonely Girl (F4) — **party-echo**: what *you* did, she does

The mutation: she does not echo herself, she echoes **the party**. This is
where "she took her voice" becomes mechanical rather than decorative — on the
floor whose whole identity is voices and singing, the boss steals the party's.

- **Learned rule:** "Whatever we just did, she is going to do back."
- **Counters:** change what you feed her; withhold your strongest action;
  make the copied action a bad one for her.
- **Why it fits:** it inverts the rule the Dead Boy taught, so a player who
  learned Floor 3 arrives with an expectation that is *wrong in a specific,
  legible way* — the single best moment this architecture can produce.
- **Presentation note:** this also gives the Choir floor's `silenceRandom`
  passive a reason to exist beyond turn-tax, and is the natural home for
  fixing §2.3 — a boss who takes voices should have an ability that actually
  takes a voice.

### The Crying Man (F5) — **ascendant**: he echoes the whole fight

The combination: he repeats both his own actions and the party's, or
manipulates accumulated battle state rather than acting fresh each turn.
"Everything that has already happened is his ammunition."

- **Learned rule:** "He is using the whole fight against us, including the
  parts we already won."
- **Counters:** deny him material; change the shape of the fight rather than
  out-damaging it; the two prior rules both apply and now compete.
- **Why it fits:** `-ascendant` and *The First Descent* both point at
  totality, and combining two rules the player already understands is exactly
  the T3 recipe validated on the roaming floors.

### What this buys

Escalation becomes **self → party → total**, which is a change in *kind* at
each step. A player who beat the Dead Boy is *more* prepared for the Lonely
Girl in some ways and *less* in others, which is the definition of the tier
the roaming floors now reach.

## 6. Prerequisite fixes (small, independent of the above)

These stand on their own merits and should be judged separately from §5:

1. **Reconcile "Stolen Quiet."** Decide whether it is a silence or a blind and
   make all three layers agree. Given Vesper's line and the Choir floor, a
   real party-wide *silence* is the stronger option — but silence is a
   powerful effect and would need tuning, so this is a design call, not a
   typo fix.
2. **Collapse or differentiate the duplicate drains.** `memory-drain` and
   `dark-pulse` are the same button. Either merge them, or give one a
   distinct verb so the boss's turns read differently from each other.
3. **Align the Crying Man's phase thresholds with his ability gates** (70/45/20
   vs 66/33), so the announced phase and the actual kit change coincide.
4. **Reconsider the 40% silence tax** (§2.2). Two turns in five spent on a
   single-target silence is a large slice of a climax boss's action economy
   for one repeated effect.

## 7. The open decision this audit cannot make

**Do the boss escorts stay inert?**

The climax tables are currently closed to Formation Chemistry by an explicit
decision this project made: climax fights are self-contained set-pieces, and
the Demon Mage escort was replaced with a Warlock specifically so no roaming
relationship could leak in untuned.

That decision was about **accidental** activation. It is a different question
from whether a boss fight may have **deliberately authored** internal
mechanics. The two are easy to conflate and should not be.

Three options, with the trade the human is actually choosing between:

| Option | Gain | Cost |
|---|---|---|
| **Keep escorts fully inert** | Climax stays a pure duel; zero regression risk | Floors' own casts never appear at their own climaxes; escorts remain HP |
| **Author bespoke boss-only mechanics** (§5) | Full control, no roaming coupling | The most work; new machinery for the echo spine |
| **Let escorts express their floor** (Choir members guard the Lonely Girl, Cistern natives guard the Crying Man) | Cheapest by far — reuses relationships already built and playtested this cycle; makes the climax the payoff for floor literacy | Reopens the surface deliberately closed; needs tuning and re-audit |

The third option is the cheapest and the most thematically apt — a Lonely
Girl guarded by the Choir she silenced is a better fight *and* a better
image — but it directly reverses a decision already taken. **I am flagging
it rather than assuming it.**

## 8. Recommendation

1. Take the §6 fixes regardless — they are correctness, not design.
2. Decide §7 before any §5 work, because it determines how much bespoke
   machinery the echo spine actually needs.
3. If §5 proceeds, build **the Dead Boy first and playtest it alone.**
   The self-echo is the simplest of the three and it is the rule the other
   two mutate; if it does not read in embodied play, the whole spine is wrong
   and the cheapest place to discover that is on one boss, not three.

Every tier claim in this document is grounded in source inspection. Unlike the
roaming-relationship reports in this directory, **none of it is grounded in
embodied play of the boss fights themselves** — the audit was scoped to source
and proposal. Before implementing §5, the three fights should be staged and
played the way the roaming formations were, to confirm the T1 verdict holds at
the table and to see which of the seven near-identical actions a player can
actually tell apart.
