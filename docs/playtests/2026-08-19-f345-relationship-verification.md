# Phase A Relationship Verification — Floors 3/4/5

Date: 2026-08-19
Baseline: `774c87d`
Scope: the three Phase A reuse relationships that shipped. The fourth
(Demon Mage → Spawn Bomb) is blocked and was not implemented — see
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
