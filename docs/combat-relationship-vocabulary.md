# Combat Relationship Vocabulary — Floors 3–5 Design Spec

Status: **Design phase — not yet implemented**
Date: 2026-08-19
Authority: `docs/encounter-audit.md` § "Longer-term roadmap"
Validation: `docs/playtests/2026-08-18-f2-targeted-chemistry-verification.md`

## Purpose

The Floor 2 targeted verification validated the composable-relationships
architecture. The next step is to design the reusable relationship vocabulary
for Floors 3–5 **before implementing any of it**. This document defines the
grammar, the authoring template, and the six relationships selected for the
first propagation pass (two per floor).

## The relationship grammar

Six reusable concepts, mapped to existing machinery:

| Relationship | Meaning | Existing machinery | Player learns |
|---|---|---|---|
| **Protect** | A intercepts direct attacks against B | `guard` effect / `guardAlly` presentation | "Deal with or bypass the protector." |
| **Sustain** | A preferentially keeps B alive | `healer` special + `preferTargetIds` | "These two belong together." |
| **Consume** | A sacrifices B for power | `consumeAlly` effect / `overload` presentation | "Kill the user or deny the resource." |
| **Detonate** | A weaponizes B as explosive | `consumeAlly` + `detonateAlly` presentation | "The weak enemy is ammunition." |
| **Coordinate** | A and B attack as a unit | `packStrike` / `meleeGangUp` presentation | "Their danger depends on both surviving." |
| **Setup → Payoff** | A applies a state that B exploits | **New primitive needed** | "Stop the setup, stop the payoff, or endure the combo." |

The first five are substantially represented by existing systems. **Setup →
Payoff** is the one concept that will likely require more generic machinery,
and it is what Floor 4 (Choir) and Floor 5 (Cistern) need most.

### The critical rule

> **A species relationship must be predictable, visible, and true wherever it appears.**

The `orc-warband` vignette bug demonstrated why: prose must describe the
actual relationship, not merely the visual shape of the formation. Every
relationship in this document carries a **presentation contract** that binds
the vignette to the mechanic.

## The authoring template

Every proposed relationship must fill in this record before implementation:

```
Actors:           [species A] + [species B]
Relationship:     [Protect / Sustain / Consume / Detonate / Coordinate / Setup→Payoff]
Rule:             [one-sentence description of what A does to/with B]
Trigger:          [conditions: both living, cooldown, HP threshold, etc.]
Visible behavior:  [what the player sees — choreography, UI label, combat log]
Player counters:  [concrete strategies the player can use]
Learned rule:     [one sentence the player internalizes for next time]
Presentation contract: [what the vignette may promise, and what it must not]
Machinery:        [reuse existing / new ability / new effect kind / new presentation]
```

If **Player counters** can't be filled with something meaningful, it's flavor.
If **Visible behavior** can't be filled, the mechanic needs presentation work.
If **Learned rule** takes a paragraph, it's too complicated for a roaming
enemy relationship.

## First propagation pass — six relationships

Deliberately limited to two per floor. One reuse, one extension per floor
where possible. The goal is to establish vocabulary, not exhaust it.

---

### Floor 3 — Forge of Ashes: machines and chains

**Floor 3 vocabulary:** charge, fuel, detonate, hunt.

This is the floor where the player realizes relationships can **cascade** —
two known rules operating simultaneously in the same formation.

#### F3-R1: Rune Knight → Lesser Construct — CONSUME (OVERLOAD)

```
Actors:           Rune Knight + Lesser Construct
Relationship:     Consume
Rule:             The Knight charges the construct, then discharges it
                  through the party as lightning damage.
Trigger:          Both living, construct in any row, cooldown 5, max 1 use.
                  Condition: allyPresent { group: "conductive-construct" }.
Visible behavior:  Overload choreography (existing): tether beam from Knight
                  to construct → construct flashes → party-wide lightning
                  discharge. Combat log: "Rune Knight overloads Lesser
                  Construct for X lightning damage!"
Player counters:  Kill the construct (denies the resource). Kill the Knight
                  (stops the user). Spread out (allParty damage). Interrupt
                  the wind-up (1-round telegraph).
Learned rule:     "Rune Knights explode constructs. Kill one or the other."
Presentation contract: Vignette may describe the Knight drawing power from
                  machines. Must NOT describe this if no construct is
                  present in the formation.
Machinery:        REUSE. CRYPT_RUNE_OVERLOAD ability already exists with
                  chemistryId "chem-rune-overload", presentation "overload",
                  targeting group "conductive-construct". The Lesser
                  Construct already has chemistryGroups:
                  ["conductive-construct"]. The only work is adding
                  "crypt-rune-overload" to rune-knight.abilityIds.
```

**Implementation effort:** ~1 line change (add ability ID). The chemistry,
choreography, AI targeting, and presentation all already work.

#### F3-R2: Demon Mage → Demon Spawn — DETONATE

```
Actors:           Demon Mage + Demon Spawn
Relationship:     Detonate
Rule:             The Mage detonates a Spawn as a fire bomb, consuming it
                  for party-wide fire damage.
Trigger:          Both living, Spawn in any row, cooldown 4, max 1 use.
                  Condition: allyPresent { group: "volatile-spawn" }.
Visible behavior:  Spawn Bomb choreography (existing): Mage pulses → Spawn
                  flashes and is consumed → fire burst on party. Combat
                  log: "Demon Mage detonates Demon Spawn for X fire
                  damage!"
Player counters:  Kill the Spawn (denies ammunition). Kill the Mage (stops
                  the detonator). Resist fire (equipment/spells). Interrupt
                  the wind-up.
Learned rule:     "Demon Mages explode Spawn. The little one is a bomb."
Presentation contract: Vignette may describe the Mage treating Spawn as
                  fuel. Must NOT describe this if no Spawn is present.
Machinery:        REUSE. CRYPT_SPAWN_BOMB ability already exists with
                  chemistryId "chem-spawn-bomb", presentation "detonateAlly",
                  targeting group "volatile-spawn". The Demon Spawn already
                  has chemistryGroups: ["volatile-spawn"]. The only work is
                  adding "crypt-spawn-bomb" to demon-mage.abilityIds.
```

**Implementation effort:** ~1 line change. Same pattern as F3-R1.

#### Floor 3 combination formations

With both relationships active, existing formations like
`f3-demon-spawn-mage` and `f3-knight-rune-mage` become chemically live.
A formation with both a Rune Knight + Construct AND a Demon Mage + Spawn
creates a dual-threat T3: which pair do you disrupt first?

The `f3-werewolf-pack` formation is a separate concern — the pack
relationship (Coordinate) already exists via `hunting-pounce` but the
Werewolf's `abilityIds` don't include the pack-strike ability. That's a
future enhancement, not part of the first pass.

---

### Floor 4 — Null Choir: synchronization

**Floor 4 vocabulary:** protect, conduct, amplify, prepare, resolve.

This should be the most sophisticated enemy-cooperation floor. The Choir
is an orchestra — removing one member changes what the machine can do.

#### F4-R1: Choir Warden → Cantor/Magus — PROTECT

```
Actors:           Choir Warden + Discordant Cantor / Choir Magus
Relationship:     Protect
Rule:             The Warden intercepts direct attacks against the Cantor
                  or Magus, redirecting them to itself.
Trigger:          Both living, guard available (cooldown 4, max 2 uses).
                  Condition: always (when a protected ally exists).
Visible behavior:  Guard choreography (existing): Warden moves to guard
                  position → "GUARDED" popup on ally → INTERCEPT label in
                  target UI when player targets the protected ally → attack
                  redirected. Combat log: "Choir Warden guards Discordant
                  Cantor!" / "Choir Warden intercepts the attack!"
Player counters:  Kill the Warden (removes protection). Bypass guard
                  (spells/AoE ignore guard). Target a non-protected ally.
                  Endure the guard charges (max 2 uses).
Learned rule:     "Wardens protect the Choir's casters. Kill the wall or
                  go around it."
Presentation contract: Vignette may describe the Warden as a shield for
                  the Choir. Must NOT describe protection if no Cantor or
                  Magus is present.
Machinery:        REUSE. ARCHER_GUARD ability pattern: new CHOIR_GUARD
                  ability with effect { kind: "guard", charges: 1,
                  duration: 2 }, presentation "guardAlly", guardTargetIds:
                  ["discordant-cantor", "choir-magus"]. Add to
                  choir-warden.abilityIds. The guard pipeline (AI targeting,
                  resolution, INTERCEPT UI, choreography) is already
                  proven from Floor 2.
```

**Implementation effort:** ~15 lines (new ability def + add to abilityIds).
Same pattern as ARCHER_GUARD.

#### F4-R2: Cantor → Choristers — CONDUCT (NEW RELATIONSHIP)

```
Actors:           Discordant Cantor + Iron Chorister(s)
Relationship:     Setup → Payoff (CONDUCT)
Rule:             The Cantor begins a phrase (wind-up). Each living
                  Chorister amplifies the phrase, increasing its damage.
                  Killing Choristers weakens the effect. Killing the
                  Cantor cancels it entirely.
Trigger:          Cantor living, at least 1 Chorister living, cooldown 5,
                  max 2 uses. Wind-up: 1-round telegraph.
Visible behavior:  New "conduct" presentation: Cantor raises hands →
                  visible tether/beam to each living Chorister →
                  Choristers glow/pulse → phrase resolves with damage
                  scaled by Chorister count. Combat log: "Discordant
                  Cantor begins a Discordant Phrase! (X Choristers
                  amplifying)" → "Discordant Phrase resolves for Y
                  damage!"
Player counters:  Kill the Cantor (cancels the phrase entirely). Kill
                  Choristers (reduces damage). Brace/Defend during the
                  wind-up. Interrupt the Cantor (disable, silence).
Learned rule:     "Cantors conduct Choristers. More singers = more
                  damage. Kill the conductor or thin the choir."
Presentation contract: Vignette may describe the Cantor leading a choir.
                  Must describe the amplification relationship, not just
                  "they sing."
Machinery:        NEW. This is the one genuinely new relationship type.
                  Requires:
                  - New ability effect kind: "conduct" (or extend
                    "consumeAlly" with a count-based payoff)
                  - New "conduct" presentation: tether to each living
                    Chorister, pulse glow, scaling discharge
                  - New chemistryId: "chem-conduct"
                  - AI logic: Cantor picks this ability when ≥1 Chorister
                    is alive; payoff scales with living Chorister count
                  - The wind-up telegraph gives the party 1 round to
                    respond (kill Cantor, kill Choristers, or brace)
```

**Implementation effort:** Moderate. New effect kind + new presentation.
This is the floor's signature mechanic and the one that most justifies
new engine work. The wind-up system already exists; the new work is the
count-scaling payoff and the multi-tether visual.

#### Floor 4 combination formations

`f4-chorister-magus` with a Warden becomes: Warden protects Magus while
Cantor conducts Choristers. The player must choose: kill the conductor,
thin the choir, break the Warden's guard, or silence the Acolyte. That's
a genuine T3 dilemma built from composable rules.

The Null Acolyte → Choir Magus setup/payoff (Acolyte applies curse, Magus
exploits it) is a natural second-pass enhancement but requires the same
Setup → Payoff machinery as F4-R2. It's listed here as a candidate but
not part of the first propagation pass.

---

### Floor 5 — Weeping Cistern: control and predation

**Floor 5 vocabulary:** drag, expose, protect, drain, exploit.

Floor 5 should not simply have bigger versions of earlier chemistry. Its
native monsters suggest a different language: marking, dragging, and
exploiting compromised party members.

#### F5-R1: Drowned Sentinel → Caller/Wraith — PROTECT

```
Actors:           Drowned Sentinel + Undertow Caller / Cistern Wraith
Relationship:     Protect
Rule:             The Sentinel intercepts direct attacks against the
                  Caller or Wraith, redirecting them to itself.
Trigger:          Both living, guard available (cooldown 5, max 2 uses).
                  Condition: always (when a protected ally exists).
Visible behavior:  Guard choreography (existing, same as F2/F4): Sentinel
                  moves to guard → "GUARDED" popup → INTERCEPT label →
                  attack redirected. Combat log: "Drowned Sentinel guards
                  Undertow Caller!"
Player counters:  Kill the Sentinel (it has 120 HP + 30% physical resist —
                  this is expensive). Bypass guard with spells/AoE. Target
                  a non-protected enemy. Wait out the guard charges.
Learned rule:     "Sentinels protect the Cistern's casters. The wall is
                  thick — consider going around."
Presentation contract: Vignette may describe the Sentinel as a guardian.
                  Must NOT describe protection if no Caller or Wraith is
                  present.
Machinery:        REUSE. Same CHOIR_GUARD pattern: new CISTERN_GUARD
                  ability with guardTargetIds: ["undertow-caller",
                  "cistern-wraith"]. Add to drowned-sentinel.abilityIds.
```

**Implementation effort:** ~15 lines. Same pattern as F4-R1.

#### F5-R2: Undertow Caller → Flood Brute — SETUP → PAYOFF

```
Actors:           Undertow Caller + Flood Brute
Relationship:     Setup → Payoff
Rule:             The Caller marks a party member (applies "Doom" or
                  "Undertow" status). The Brute deals greatly increased
                  damage against marked targets.
Trigger:          Both living, Caller uses mark ability (cooldown 3,
                  max 2 uses). Brute's attacks check for marked targets
                  and gain bonus damage.
Visible behavior:  New "mark" presentation: Caller casts → target gets
                  a visible "DOOM" status icon and purple aura → Brute
                  visibly targets the marked character with enhanced
                  attack (red flash, larger damage popup). Combat log:
                  "Undertow Caller marks Aria with Doom!" / "Flood Brute
                  exploits Doom on Aria for X damage!"
Player counters:  Kill the Caller (stops new marks). Cleanse the mark
                  (Priest spell). Defend/protect the marked character.
                  Kill the Brute (stops the payoff). Position the marked
                  character in the back row (if Brute can't reach).
Learned rule:     "Callers mark targets. Brutes destroy marked targets.
                  Cleanse the mark or kill the Caller."
Presentation contract: Vignette may describe the Caller dragging
                  someone down and the Brute finishing them. Must
                  describe the mark/exploit relationship, not just
                  "they fight together."
Machinery:        NEW (but lighter than F4-R2). Requires:
                  - New status effect: "doom" (or reuse "curse" with
                    a new flag)
                  - Caller ability: singleParty, applies "doom" status,
                    cooldown 3, maxUses 2
                  - Brute ability or passive: attacks against "doom"ed
                    targets gain bonus damage (e.g. +50% or flat +8)
                  - New "mark" presentation: purple aura on target,
                    enhanced impact VFX when Brute hits a marked target
                  - This is simpler than F4-R2 because it's a binary
                    state (marked or not), not a count-scaling effect
```

**Implementation effort:** Moderate. New status + mark ability + damage
modifier. The status system already exists; the new work is the
damage-against-marked-targets check and the visual aura.

#### Floor 5 combination formations

`f5-minotaur-undertow` with a Sentinel becomes: Sentinel protects the
Caller while the Caller marks a party member for the Brute. The player
must break the Sentinel's guard to reach the Caller, or cleanse the mark
before the Brute acts, or kill the Brute before it can exploit.

#### Floor 5 demon padding reduction

Per the earlier audit finding, Floor 5 should reduce generic demon
padding. The native vocabulary (Drowned Sentinel, Cistern Wraith, Weeping
Revenant, Flood Brute, Undertow Caller) is strong enough to carry the
floor. The desired player reaction is "oh fuck, Caller plus Brute," not
"another demon mage."

---

## Implementation priority

| Priority | Relationship | Floor | Effort | Type |
|---|---|---|---|---|
| 1 | Rune Knight → Construct | 3 | ~1 line | Reuse |
| 1 | Demon Mage → Spawn | 3 | ~1 line | Reuse |
| 2 | Warden → Cantor/Magus | 4 | ~15 lines | Reuse |
| 2 | Sentinel → Caller/Wraith | 5 | ~15 lines | Reuse |
| 3 | Cantor → Choristers | 4 | Moderate | New (conduct) |
| 3 | Caller → Flood Brute | 5 | Moderate | New (mark) |

The two Priority 1 items are nearly free — the abilities and chemistry
groups already exist, they just need to be added to the enemy abilityIds.
They could ship immediately and provide instant validation that the
Floor 1 chemistry transfers to Floor 3.

The two Priority 2 items follow the proven ARCHER_GUARD pattern and need
only a new ability definition with existing guard machinery.

The two Priority 3 items are the genuinely new mechanics. They should be
designed and prototyped after the reuse items are validated.

## What this document does NOT cover

- **Vignette authoring.** Each relationship needs a matching family
  vignette, but that comes after the mechanic is proven. The presentation
  contract in each template is the constraint.
- **Pack relationship for Werewolves.** The `f3-werewolf-pack` formation
  should eventually earn the word "pack" via `packStrike` choreography,
  but the Werewolf's current abilities (`hunting-pounce`, `rending-claw`)
  don't include the pack-strike ability. This is a future enhancement.
- **Acolyte → Magus setup/payoff.** Listed as a candidate for Floor 4
  but requires the same Setup → Payoff machinery as F4-R2. Second pass.
- **Exploration consequences.** Documented separately as a combat north
  star in `docs/encounter-audit.md`. The two systems are complementary:
  chemistry determines the problem; exploration determines the condition.
