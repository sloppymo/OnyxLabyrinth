# Phase A Relationship Verification — Floors 3/4/5

Date: 2026-08-19
Baseline: `774c87d`
Scope: all four Phase A reuse relationships. Three shipped first; the fourth
(Demon Mage → Spawn Bomb) was blocked on the boss-escort surface, and shipped
after the coordinator ruled that the climax fights stay self-contained
set-pieces — see § A1 below and
`docs/combat-relationship-vocabulary.md` § Source verification, Correction 2.

Verification was done by staging each formation headlessly and reading the
**actual event stream and combat log** the player would see, not by reading
unit-test asserts. The choreography engine is driven by those events, so an
event carrying the right `presentation`, phase, actor and resource/target is
what makes the animation play.

## What shipped

| Floor | Relationship | Type | Machinery | Surface |
|---|---|---|---|---|
| 3 | Rune Knight → Lesser Construct | Consume | `crypt-rune-overload` reused verbatim | `f3-guardian-rune-line` (w3, authored) |
| 4 | Choir Warden → Discordant Cantor | Protect | new `CHOIR_GUARD`, ARCHER_GUARD pattern | `f4-choir-armor` (w4), `f4-choir-guardian` (w2) |
| 5 | Drowned Sentinel → Caller/Wraith | Protect | new `SENTINEL_GUARD`, ARCHER_GUARD pattern | `f5-golem-cistern` (w2) |

No new effect kinds, no new presentations, no new choreography.

## Presentation contract — verified from the event stream

**F3 Rune Overload** emits `presentation=overload` across three phases with
`resource=construct-0` populated on every one:

```
r3  LOG   Rune Knight begins charging Rune Overload!
    EVENT phase=telegraph presentation=overload resource=construct-0
r4  LOG   Rune Knight resolves Rune Overload!
    LOG   Lesser Construct is consumed by Rune Knight!
    LOG   Rune Knight resolves Rune Overload on Aria for 6 damage!  (x4 party)
    EVENT phase=resolve  presentation=overload resource=construct-0
    EVENT phase=consume  presentation=overload resource=construct-0
```

`resourceId` is the field the consume choreography reads
(`combat-choreography.ts:3526`) to place the burst on the correct body, so
the tether/discharge has what it needs. The one-round telegraph is real and
gives the player a window to kill either end.

**F4 / F5 guards** emit `presentation=guardAlly` with both `target` and
`partner` populated, plus the persistent `GUARDED` marker:

```
LOG   Choir Warden guards Discordant Cantor!
EVENT phase=resolve presentation=guardAlly target=cantor-0 partner=warden-0
UI    GUARDED marker on cantor-0
```

`CHEMISTRY_STYLES` keys on `presentation`, not on `chemistryId`, so the two
new `chemistryId`s inherit the proven guard/overload visuals rather than
falling back. Bark profiles key on **enemy id**, and `rune-knight`,
`choir-warden` and `drowned-sentinel` are the canonical production ids the
Floor 1 `crypt-*` variants already alias *to* — so no voice gap was
introduced.

## Legibility measurement (and a correction to my own reading)

First staged run suggested the Sentinel guard did not appear until round 5,
which would have been a real problem — with `maxUses: 1`, a relationship that
arrives after the fight ends is not a relationship. I nearly raised its
selection weight on that basis.

**That reading was an artifact.** The staging harness used a constant rng
(`() => 0.1`), which makes weighted ability selection degenerate — it always
lands on the same branch. Re-measured over 300 seeded trials:

| Relationship | Appears within 8 rounds | Median first fire | p90 |
|---|---|---|---|
| `chem-archer-guard` (F2 baseline) | 100% | r1 | r3 |
| `chem-sentinel-guard` | 96% | **r2** | r4 |
| `chem-choir-guard` | 99% | r2 | r4 |
| `chem-rune-overload` | 97% | r3 (wind-up) | r5 |

The Sentinel guard is in fact the earliest-median of the three new ones,
despite the Sentinel being the slowest actor in the game (agi 4). The weight
change was reverted. Weight 8 measures 95%/median r2 and weight 10 measures
96%/median r2 — indistinguishable, so the conservative original stands.

Bounds are now locked in as tests (>80% appearance within 6 rounds over 100
seeded trials) so a future ability added to any of these species cannot
silently crowd the relationship out of the fight.

**Process note worth keeping:** deterministic rng is right for asserting
*that* a mechanic resolves, and wrong for measuring *when* or *how often*.
Timing claims need a varied seeded stream.

## Difficulty delta of the composition swap

`f3-guardian-rune-line` swapped `stone-guardian` (hp72/atk19/ac16) for
`lesser-construct` (hp56/atk14/ac13) — a weaker body — while the formation
simultaneously gained a party-wide lightning payoff. Measured over 400 seeded
trials, party defending, 6 rounds:

| Composition | Avg party damage taken | Formation total HP |
|---|---:|---:|
| Before (stone-guardian) | 89.0 | 210 |
| After (lesser-construct) | 88.5 | 194 |

**Threat delta: −0.5% — sideways.** The formation gains a relationship at
essentially no cost to its damage output. Its total HP drops 7.6%, so it dies
slightly faster; the Overload payoff offsets the weaker wall almost exactly.
This is the intended shape — the formation became *more interesting* without
becoming harder or softer in a way that would need rebalancing around it.

## Two protection behaviors on the same actor — flagged, unresolved

Both new guard carriers **already had** `phalanx-guard`, and in staged play it
fires on the same allies a round before the intercept:

```
r1  Choir Warden uses Phalanx Guard, boosting Discordant Cantor's ac!
r3  Choir Warden guards Discordant Cantor!
```

So the same actor now expresses protection toward the same ally through two
mechanics with **different counters** — the AC buff is unavoidable and just
makes the target tanky, while the intercept is consumable and eats exactly one
attack. The legibility measurement above proves the intercept *appears*; it
does not prove a human can tell the two apart.

If they read as the same thing, the learned rule ("Wardens protect the Choir's
casters") is delivered muddily and the intercept's distinct counter is lost.
This cannot be resolved headlessly. Flagged for embodied play, not changed.

## Tuning notes (not acted on)

- Rune Overload lands **6 damage per party member** after defense at power 8.
  For a Floor 3 party this is light for a one-shot, wind-up, resource-consuming
  ability. Worth a look during balance work, deliberately not tuned here — the
  relationship's job in this pass was to exist and read correctly.
- The Magus branch of `CHOIR_GUARD.guardTargetIds` is authored but inert: no
  formation pairs Warden with Magus, and none was invented to exercise it.
- `rune-knight` also appears in F4/F5 formations. The Overload rides along
  there and stays inert only because `lesser-construct` is `floors: [3]`.
  Adding a construct to any F4/F5 formation would activate it — that is a data
  consequence, not a guard.

## A1 — Demon Mage → Demon Spawn (added after the boss decision)

The coordinator ruled that the climax fights stay self-contained set-pieces.
The boss surfaces were closed **by composition**, then Spawn Bomb was
propagated globally as originally scoped.

### Boss closure

`f4-lonely-girl` and `f5-crying-man` now escort a **Warlock** instead of a
Demon Mage. Warlock is the closest body in the roster:

| | Demon Mage | Warlock |
|---|---|---|
| hp / atk / ac / agi | 26 / 5 / 3 / 11 | 29 / 6 / 3 / 10 |
| row | back | back |
| special | caster-fire, resistFire, weakWater, demon | caster-fire, resistFire, weakWater |
| abilities | hellfire, **summon-imp**, anti-magic-field | hellfire, **chaos-bolt**, anti-magic-field |

The swap trades the summon for direct damage and drops the `demon` tag (both
fights retain other demon bodies, so anti-demon gear keeps targets). Both
bosses already carry `anti-magic-field` themselves, so the escort's antimagic
was redundant regardless. Warlock has no `chemistryGroups` and is an actor in
no planned relationship, so it cannot re-open this surface during Phase B or C.

Re-audited after the change: both boss tables report **CLOSED** — zero
bombers, zero `summon-imp` carriers, zero `volatile-spawn` bodies. A test now
fails if any boss escort ever gains a chemistry ability at all.

### Difficulty delta of the boss escort swap

Changing authored climax composition needs a number, not an assurance. 300
seeded trials per fight, party focus-firing, 10 rounds:

| Fight | Escort | Party damage taken / 10r | Formation HP |
|---|---|---:|---:|
| `f4-lonely-girl` | demon-mage (before) | 94.2 | 450 |
| `f4-lonely-girl` | warlock (after) | 93.3 | 453 |
| `f5-crying-man` | demon-mage (before) | 93.3 | 526 |
| `f5-crying-man` | warlock (after) | 94.0 | 529 |

**−0.9% and +0.8% — both sideways.** Neither climax fight got measurably
easier or harder.

**Caveat, stated plainly:** `summons/fight` measured 0.00 in both fights,
because the default measurement party cannot kill escorts fast enough to
bring a 5–6 body formation under the `maxAllies: 3` threshold. So this
measurement confirms the *direct* swap (stat line, hellfire, antimagic,
chaos-bolt vs summon-imp) is difficulty-neutral, but it does **not** exercise
the summon→bomb loop — which is exactly the behaviour that made the surface
dangerous. A real endgame party *does* thin the escort, which is when the
loop would have opened. The swap's value is therefore not visible in this
number; the number only establishes it cost nothing.

### Resulting surface

12 non-boss formations (plus the 2 pre-existing Floor 1 crypt ones):

- **Pre-placed ammunition (4):** `f3-demon-spawn-mage` (w2),
  `f4-spawn-brawler` (w2), `f5-flood-brute` (w4), `f5-spawn-flood` (w2)
- **Summon-gated (8):** `f3-knight-rune-mage` (w2), `f4-choir-armor` (w4),
  `f4-guardian-mage` (w4), `f4-champion-rune` (w3), `f4-choir-guardian` (w2),
  `f4-viper-mage` (w1), `f5-stone-demon` (w3), `f5-armor-rune` (w2)

### The prompt's tuning questions, answered with numbers

300 seeded trials per formation, 8 rounds.

| Formation | Bombs/fight | Max | Fires at all |
|---|---:|---:|---:|
| `f3-demon-spawn-mage` | 0.78 | 1 | 78% |
| `f5-flood-brute` | 0.64 | 1 | 64% |
| `f4-spawn-brawler` | 0.17 | 1 | 17% |
| `f5-spawn-flood` | 0.14 | 1 | 14% |
| `f4-guardian-mage` (**two** Mages) | 0.00 | 1 | 0% |
| `f4-viper-mage` (2 bodies, w1) | 0.99 | 2 | 88% |

- **Does more than one Demon Mage spam?** No. `f4-guardian-mage` fields two
  bombers and produced 0.00 bombs/fight, max 1 across 300 trials —
  `maxAllies: 3` rarely opens in a 5-body formation.
- **Are the two F5 formations overcrowded, as the spec claimed?** No. Both
  sit under one bomb per fight with a max of 1. **No retune needed** — the
  spec's "NEEDS RETUNE" flag was unfounded.
- **Can the Mage enter an annoying summon→bomb→summon loop?** Only in small
  formations, where `maxAllies` opens immediately. `f4-viper-mage` (two
  bodies, weight 1 — the rarest entry on its table) fires 88% with 1.36
  summons. That is the species fantasy working where it should.
- **Does the counter work?** Yes, and measurably. Switching the party from
  defending to fighting drops `f4-spawn-brawler` from 1.14 bombs/fight to
  0.17, and `f5-spawn-flood` from 0.95 to 0.14 — the party kills the
  ammunition before it can be spent. "Kill the spawn" is a real counter, not
  a theoretical one.

**Measurement caveat worth keeping:** a defending party never kills anything,
so `maxAllies` never opens and the summon-gated surface looks inert. The
first pass of this measurement was wrong for that reason. Tempo questions
need a party that actually fights.

### Cross-floor literacy — verified

Everything the player perceives is **identical** between the Floor 1 fight
that teaches the rule and the Floor 3/4/5 fights that should trigger
recognition:

| Perceived channel | Floor 1 | Floor 3+ |
|---|---|---|
| Ability name | "Spawn Bomb" | "Spawn Bomb" |
| Presentation key | `detonateAlly` | `detonateAlly` |
| Element / VFX | fire | fire |
| Log wording | "X resolves Spawn Bomb!" / "Y is consumed by X!" | identical |
| `resourceId` on burst | populated | populated |

The only difference is the enemy display name (`Crypt Demon Mage` vs `Demon
Mage`) — the deliberate Floor 1 low-power variant naming, whose voice is
already aliased to the production profile. Same ability, same animation, same
wording, same-named species family.

The summon→bomb loop reads cleanly in the log on its own:

```
Demon Mage summons Demon Spawn!
Demon Mage resolves Spawn Bomb!
Demon Spawn is consumed by Demon Mage!
Demon Mage resolves Spawn Bomb on Aria for 4 damage!   (x4 party)
```

This is the strongest cross-floor literacy case of the four relationships,
because the ability is reused *verbatim* rather than re-implemented.

### Tuning note

Spawn Bomb lands **4 damage per party member** after defense (power 6), and
Rune Overload lands 6 (power 8). Both are light for wind-up /
resource-consuming abilities that destroy one of the enemy's own bodies. The
relationships read correctly; whether they *threaten* enough is a balance
question flagged for the human, deliberately not tuned here.

## Open question for the human

The four playtest questions (what did I notice first / what did I want to kill
first / did anything change the plan / can I describe what they were doing)
are **not** answered here. Headless staging verifies the presentation contract
— that the right thing happens and the right events fire — but it cannot
answer whether the relationship *reads* to a human at the table, or whether it
produces a genuine T2/T3 decision. Those four questions and the cross-floor
literacy check need embodied play.

Claimed tier, pending that: all three are **T2** (removing one actor changes
what another can do). None is claimed as T3.
