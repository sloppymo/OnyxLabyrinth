# Combat Relationship Vocabulary — Floors 3–5 Design Spec

Status: **Design phase — partially implemented (see § Source verification)**
Date: 2026-08-19
Authority: `docs/encounter-audit.md` § "Longer-term roadmap"
Validation: `docs/playtests/2026-08-18-f2-targeted-chemistry-verification.md`

## Source verification (2026-08-19, baseline `774c87d`)

Every activation-surface and trigger claim below was re-derived from source
before implementation, per the authoring contract's requirement that the
audit be re-run rather than trusted. Five claims were wrong. **The first
two block F3-R2 (Demon Mage → Spawn Bomb).**

Surfaces were computed by enumerating `ENCOUNTER_TABLES` in
`src/data/enemies.ts` programmatically, not by reading the table by eye.

### Confirmed correct

| Claim | Verified surface |
|---|---|
| `rune-knight` + `lesser-construct` | 0 formations — needs authoring |
| `choir-warden` + `discordant-cantor` | 2 — `f4-choir-armor` (w4), `f4-choir-guardian` (w2) |
| `choir-warden` + `choir-magus` | 0 — Magus guard path stays inert |
| `discordant-cantor` + `iron-chorister` | 0 — Conduct needs authoring |
| `drowned-sentinel` + Caller/Wraith | 1 — `f5-golem-cistern` (w2) contains **both** |
| `undertow-caller` + `flood-brute` | 1 — `f5-flood-brute` (w4) |

### Correction 1 — Spawn Bomb's surface is 14 formations, not 4

The spec counted only formations with a **pre-placed** `demon-spawn`. But
`demon-mage` carries `summon-imp`, whose effect is
`{ kind: "summon", enemyId: "demon-spawn" }` (`enemy-abilities.ts:722`).
`summonEnemyBodies` builds the instance with `{ ...enemyDef }`
(`combat-enemy.ts:326`), which **spreads `chemistryGroups`** — so a summoned
spawn is a fully valid `volatile-spawn` chemistry resource.

**The Demon Mage manufactures its own ammunition.** Every formation
containing a Demon Mage is therefore an activation surface, not just those
with a spawn already placed.

- **Pre-placed (4):** `f3-demon-spawn-mage` (w2), `f4-spawn-brawler` (w2),
  `f5-flood-brute` (w4), `f5-spawn-flood` (w2)
- **Summon-gated (10):** `f3-knight-rune-mage` (w2), `f4-choir-armor` (w4),
  `f4-guardian-mage` (w4), `f4-champion-rune` (w3), `f4-choir-guardian` (w2),
  `f4-viper-mage` (w1), `f5-stone-demon` (w3), `f5-armor-rune` (w2),
  **`f4-lonely-girl`**, **`f5-crying-man`**

### Correction 2 — the two climax boss fights are activation surfaces

The spec recorded "UNINTENDED: None." That is wrong, and it is the most
consequential error in the document.

`demon-mage` is a back-row escort in **both** named climax fights:
`f4-lonely-girl` (table 8) and `f5-crying-man` (table 9).

Those tables are **not** scripted combats. They are reached through
`encounterZones` entries carrying `tableFloorId: 8` / `9`
(`src/content/floors/floor-4.json:2047`, `floor-5.json:2039`), which flow
through `encounterTableFloorId` into the ordinary roaming-encounter path in
`main.ts:776` — the path that hardcodes **`chemistryEnabled: true`**
(`main.ts:803`). The stairs-guardian and NPC paths pass no metadata and
correctly default to `false`; these two do not.

Each guardian zone is a **single cell** whose table holds exactly one
weight-1 entry, so this is not a rare roll: it is *every* Lonely Girl and
*every* Crying Man fight.

Attaching `crypt-spawn-bomb` to `demon-mage` would therefore add an
untuned party-wide fire nuke (`allParty`, power 6, `maxUses: 2`) to both
climax fights, self-fuelled by the escort's own summon. Combined with
Correction 5 below, it arrives specifically in the fight's final phase.

**This is a STOP condition** — an activation surface creating an
unexpected balance problem in authored content the prompt defers to a
later dedicated boss audit. F3-R2 is not implemented pending a decision.

### Correction 3 — Spawn Bomb's real trigger differs from the spec

| Field | Spec claimed | Source (`enemy-abilities.ts:230`) |
|---|---|---|
| condition | `allyPresent { volatile-spawn }` | `notFirstTurn` |
| cooldown | 4 | 3 |
| maxUses | 1 | 2 |
| chemistryChance | — | 0.75 |

Gating is nonetheless **correct**: `combat-ai.ts:198–200` hard-drops any
`consumeAlly` ability whose `chemistryResourceCandidates` list is empty, so
the missing `allyPresent` is belt-and-braces rather than a bug. But the
spec's tempo reasoning was built on half the uses and a longer cooldown
than the ability actually has.

### Correction 4 — guard target priority is not array order

The spec worried that `pickAbilityTargetId` "selects the first valid target
from `guardTargetIds`" and might protect a silly target. It does not.
`combat-ai.ts:141–145` sorts eligible guard targets by `currentHp / hp`
ascending, tie-broken by `instanceId`, and excludes allies already guarded.

The Warden protects the **most-wounded** eligible caster. The concern is
unfounded and needs no tuning decision.

### Correction 5 — `maxAllies: 3` gates the summon loop to late fight

`maxAllies` resolves as `livingAllyCount(s) < cond.count`
(`combat-ai.ts:95–98`), i.e. *fewer than* 3 living allies. In a 5–6 body
formation the Mage cannot begin manufacturing spawns until the party has
already cleared most of the escort. The summon→bomb loop is therefore a
**late-fight** behavior in large formations, not an opening-turn one —
which is why it lands hardest exactly when the party is most attrited.

## Purpose

The Floor 2 targeted verification validated the composable-relationships
architecture. The next step is to design the reusable relationship vocabulary
for Floors 3–5 **before implementing any of it**. This document defines the
grammar, the authoring template, and the six relationships selected for the
first propagation pass (two per floor).

## The relationship grammar

Seven reusable concepts, mapped to existing machinery:

| Relationship | Meaning | Existing machinery | Player learns |
|---|---|---|---|
| **Protect** | A intercepts direct attacks against B | `guard` effect / `guardAlly` presentation | "Deal with or bypass the protector." |
| **Sustain** | A preferentially keeps B alive | `healer` special + `preferTargetIds` | "These two belong together." |
| **Consume** | A sacrifices B for power (B is destroyed) | `consumeAlly` effect / `overload` presentation | "Kill the user or deny the resource." |
| **Detonate** | A weaponizes B as explosive (B is destroyed) | `consumeAlly` + `detonateAlly` presentation | "The weak enemy is ammunition." |
| **Channel** | A draws power from B while B remains alive | **New variant of consumeAlly** (non-destructive) | "Disrupt the connection or endure the drain." |
| **Coordinate** | A and B attack as a unit | `packStrike` / `meleeGangUp` presentation | "Their danger depends on both surviving." |
| **Setup → Payoff** | A applies a state that B exploits | **New primitive needed** | "Stop the setup, stop the payoff, or endure the combo." |

The first five are substantially represented by existing systems. **Channel**
is a non-destructive variant of Consume — the resource survives and can be
used again. **Setup → Payoff** is the one concept that will likely require
more generic machinery, and it is what Floor 4 (Choir) and Floor 5 (Cistern)
need most.

### Taxonomy note: Consume vs Channel vs Detonate

The current `consumeAlly` effect kind destroys the resource (`markConsumed`
sets `currentHp = 0`). This covers both Consume and Detonate — the
difference is presentation (`overload` vs `detonateAlly`), not mechanics.

**Channel** would be a new variant where the resource is *not* destroyed.
The actor draws power through the resource, but the resource remains alive
and can be used again on a later cooldown. This is a more interesting
relationship because the resource isn't "ammunition to be denied" — it's
a "living battery" that persists as an ongoing threat.

If Channel is implemented, Rune Overload should become Channel instead of
Consume, giving it a distinct learned rule from Spawn Bomb. If Channel is
*not* implemented, Rune Overload stays as Consume and the learned rule
remains "Rune Knights explode constructs" — functionally identical to
Detonate, differentiated only by element (lightning vs fire) and
presentation.

**Decision for this spec:** Rune Overload is currently Consume (the
resolver destroys the construct). The Channel variant is noted as a
future enhancement that would make the relationship more interesting
but is not required for the first propagation pass.

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
Relationship:     [Protect / Sustain / Consume / Channel / Detonate / Coordinate / Setup→Payoff]
Rule:             [one-sentence description of what A does to/with B]
Trigger:          [conditions: both living, cooldown, HP threshold, etc.]
Visible behavior:  [what the player sees — choreography, UI label, combat log]
Player counters:  [concrete strategies the player can use]
Counter verification: [each counter must already work in current combat rules
                  or be explicitly part of the implementation]
Learned rule:     [one sentence the player internalizes for next time]
Presentation contract: [what the vignette may promise, and what it must not]
Activation surface: [every existing formation where this relationship can occur,
                  marked INTENDED / UNINTENDED / NEEDS RETUNE]
Machinery:        [reuse existing / new ability / new effect kind / new presentation]
```

If **Player counters** can't be filled with something meaningful, it's flavor.
If **Counter verification** can't confirm a counter works in current rules,
remove it or mark it as implementation work.
If **Visible behavior** can't be filled, the mechanic needs presentation work.
If **Learned rule** takes a paragraph, it's too complicated for a roaming
enemy relationship.
If **Activation surface** includes formations on other floors, those
formations are now chemically active — decide deliberately, not by accident.

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
Relationship:     Consume (see taxonomy note: Channel variant is a future
                  enhancement; current resolver destroys the construct)
Rule:             The Knight charges the construct, then discharges it
                  through the party as lightning damage. The construct
                  is consumed (destroyed) in the process.
Trigger:          Both living, construct in any row, cooldown 5, max 1 use.
                  Condition: allyPresent { group: "conductive-construct" }.
Visible behavior:  Overload choreography (existing): tether beam from Knight
                  to construct → construct flashes → party-wide lightning
                  discharge. Combat log: "Rune Knight overloads Lesser
                  Construct for X lightning damage!"
Player counters:  Kill the construct (denies the resource). Kill the Knight
                  (stops the user). Interrupt the wind-up (1-round telegraph).
Counter verification: Kill constructs = standard combat. Kill caster =
                  standard combat. Wind-up interrupt = existing wind-up
                  system (disable/silence breaks chemistry). Note: "spread
                  out" is NOT a valid counter — allParty damage is not
                  row-dependent. Removed.
Learned rule:     "Rune Knights explode constructs. Kill one or the other."
                  (If Channel variant is implemented later: "Rune Knights
                  channel through constructs. Disrupt the connection.")
Presentation contract: Vignette may describe the Knight drawing power from
                  machines. Must NOT describe this if no construct is
                  present in the formation.
Activation surface:
                  INTENDED: (none — no existing formation has both
                    rune-knight and lesser-construct. New formations or
                    modifications needed.)
                  NOTE: The conductive-construct group also includes
                    crypt-construct (F1), but no F1 formation has both
                    a rune-knight and a crypt-construct. This relationship
                    is Floor 3 only until formations are authored.
Machinery:        REUSE. CRYPT_RUNE_OVERLOAD ability already exists with
                  chemistryId "chem-rune-overload", presentation "overload",
                  targeting group "conductive-construct". The Lesser
                  Construct already has chemistryGroups:
                  ["conductive-construct"]. The only work is adding
                  "crypt-rune-overload" to rune-knight.abilityIds.
```

**Implementation effort:** ~1 line change (add ability ID). The chemistry,
choreography, AI targeting, and presentation all already work.

**Activation gap:** No existing formation contains both a Rune Knight and
a Lesser Construct. To activate this relationship, either modify an
existing F3 formation (e.g. `f3-guardian-rune-line` → swap a stone-guardian
for a lesser-construct) or create a new formation. This is authoring work,
not engine work.

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
Activation surface:
                  [SUPERSEDED — see § Source verification, Corrections 1–2.
                  The real surface is 14 formations, not 4, because
                  summon-imp manufactures volatile-spawn ammunition. Two of
                  the 14 are the climax boss fights. The list below is
                  retained only to show what the original audit missed.]
                  INTENDED: f3-demon-spawn-mage (F3 — the obvious target)
                  INTENDED: f4-spawn-brawler (F4 — Spawn + Mage, valid
                    cross-floor activation of a learned rule)
                  NEEDS RETUNE: f5-flood-brute (F5 — already has Caller→Brute
                    setup; adding Spawn Bomb makes it very busy. Consider
                    removing demon-mage or demon-spawn from this formation.)
                  NEEDS RETUNE: f5-spawn-flood (F5 — 2x demon-spawn + mage
                    + brute. Two Spawn Bomb targets plus Brute is a lot.
                    Consider removing demon-mage.)
                  UNINTENDED: WRONG — f4-lonely-girl and f5-crying-man both
                    carry a demon-mage escort and run with chemistry
                    enabled. Eight further summon-gated roaming formations
                    also activate.
                  Cross-floor note: This is a feature. "Demon Mages explode
                    Spawn" should be true on every floor where both appear.
                    The F5 formations need retuning because they already
                    have high chemical density.
```

**STATUS: BLOCKED.** Not implemented. The boss-escort activation
(Correction 2) is a balance change to authored climax content and must be
decided by the dedicated boss audit, not absorbed silently here.

**Implementation effort:** ~1 line change. Same pattern as F3-R1.

**Cross-floor impact:** Adding `crypt-spawn-bomb` to `demon-mage.abilityIds`
activates the Detonate relationship on **4 formations across 3 floors**
(F3, F4, F5). The F3 and F4 activations are intended. The two F5
formations (`f5-flood-brute`, `f5-spawn-flood`) need retuning — they
already have the Caller→Brute relationship and adding Spawn Bomb makes
them chemically overcrowded. Consider replacing the demon-mage in those
formations with a native F5 caster, or removing the demon-spawn.

#### Floor 3 combination formations

With both relationships active, `f3-demon-spawn-mage` becomes chemically
live (Demon Mage + Demon Spawn = Detonate). However, no existing F3
formation has both a Rune Knight and a Lesser Construct — the Overload
relationship requires formation authoring or modification.

A formation with both a Rune Knight + Construct AND a Demon Mage + Spawn
creates a dual-threat T3: which pair do you disrupt first? This requires
authoring a new formation or modifying an existing one (e.g. adding a
Lesser Construct to `f3-knight-rune-mage`).

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
Activation surface:
                  INTENDED: f4-choir-armor (Warden + Cantor — the obvious
                    target)
                  INTENDED: f4-choir-guardian (Warden + Cantor — larger
                    formation, same relationship)
                  NOTE: No existing formation has both choir-warden and
                    choir-magus. The Magus guard path is inert until a
                    formation is authored with both. Consider adding a
                    Warden to f4-chorister-magus or f4-hellbat-choir.
                  Guard target priority: [CORRECTED — see Correction 4.
                    pickAbilityTargetId sorts eligible targets by
                    currentHp/hp ascending, tie-broken by instanceId, and
                    skips allies already guarded (combat-ai.ts:141-145).
                    The Warden protects the most-wounded eligible caster.
                    No array-ordering problem exists and no tuning
                    decision is required.]
```

**Implementation effort:** ~15 lines (new ability def + add to abilityIds).
Same pattern as ARCHER_GUARD.

**Activation gap:** The Magus guard path needs a formation with both
Warden and Magus. The Cantor guard path is immediately active in two
existing F4 formations.

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
Counter verification: Kill caster = standard. Kill allies = standard.
                  Brace = existing defend mechanic. Interrupt = existing
                  wind-up break system (disable/silence breaks chemistry).
                  All counters verified against current rules.
Learned rule:     "Cantors conduct Choristers. More singers = more
                  damage. Kill the conductor or thin the choir."
Presentation contract: Vignette may describe the Cantor leading a choir.
                  Must describe the amplification relationship, not just
                  "they sing."
Activation surface:
                  INTENDED: f4-chorister-demon (Cantor absent — needs
                    modification to add Cantor, or create new formation)
                  INTENDED: f4-chorister-magus (Cantor absent — needs
                    modification to add Cantor, or create new formation)
                  NOTE: No existing formation has both discordant-cantor
                    and iron-chorister. This relationship requires new
                    formation authoring or modification of existing F4
                    formations to include both species.
Machinery:        NEW — but mechanically generic, visually bespoke.
                  The resolver should NOT get a "conduct" effect kind.
                  Instead, add a generic scaling field to the existing
                  ability/effect system:

                    scaling: {
                      kind: "livingAllies",
                      group: "choir-chorister",   // new chemistry group
                      perAlly: 6,                  // +6 damage per singer
                    }

                  This is reusable: a future necromancer could scale with
                    living skeletons. A swarm controller could scale with
                    living insects. A boss could draw power from crystals.
                    None of them has to "conduct."

                  The bespoke part is the presentation:

                    presentation: "conduct"

                  ...which renders the Cantor-specific tether/glow/discharge
                  choreography. The mechanic is generic; the fiction is in
                  the presentation, not the resolver.

                  Also requires:
                  - New chemistry group: "choir-chorister" on iron-chorister
                  - New chemistryId: "chem-conduct"
                  - AI logic: Cantor picks this ability when ≥1 ally in
                    the "choir-chorister" group is alive
                  - The wind-up telegraph gives the party 1 round to
                    respond (kill Cantor, kill Choristers, or brace)
```

**Implementation effort:** Moderate. New generic `scaling` field on
ability effects + new "conduct" presentation. The wind-up system already
exists; the new work is the count-scaling payoff resolver and the
multi-tether visual. The scaling field is reusable engine infrastructure;
the presentation is bespoke Choir fiction.

**Activation gap:** No existing formation has both a Cantor and a
Chorister. This relationship requires new formation authoring. Consider
modifying `f4-chorister-magus` to add a Cantor, or creating a new
`f4-choir-conduct` formation with Cantor + 2-3 Choristers.

#### Floor 4 combination formations

The ideal Choir combination formation (Warden + Cantor + Choristers +
Magus) does not exist in the current tables. To create the full
orchestra T3, a new formation must be authored — e.g.
`f4-choir-orchestra` with Warden, Cantor, 2x Chorister, Magus. The
player must choose: kill the conductor, thin the choir, break the
Warden's guard, or silence the Magus. That's a genuine T3 dilemma
built from composable rules — but it requires the formation to exist.

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
Activation surface:
                  INTENDED: f5-golem-cistern (Sentinel + Caller + Wraith —
                    both guard targets present, the ideal formation)
                  NOTE: f5-drowned-sentinel has a Sentinel but no Caller
                    or Wraith. The guard ability is inert there (no valid
                    target). This is fine — the relationship is
                    conditionally active, not always-on.
                  NOTE: No other F5 formation has a Sentinel. This
                    relationship is currently active in exactly one
                    formation, which is appropriate for a first pass.
```

**Implementation effort:** ~15 lines. Same pattern as F4-R1.

**Activation surface is clean:** Only `f5-golem-cistern` has both a
Sentinel and a guard target. No cross-floor activation — Sentinel is
Floor 5 only. No retuning needed.

#### F5-R2: Undertow Caller → Flood Brute — SETUP → PAYOFF

```
Actors:           Undertow Caller + Flood Brute
Relationship:     Setup → Payoff
Rule:             The Caller marks a party member (applies "Undertow"
                  status). The Brute deals greatly increased damage
                  against marked targets.
Trigger:          Both living, Caller uses mark ability (cooldown 3,
                  max 2 uses). Brute's attacks check for marked targets
                  and gain bonus damage.
Visible behavior:  New "mark" presentation: Caller casts → target gets
                  a visible "UNDERTOW" status icon and blue-green aura
                  → Brute visibly targets the marked character with
                  enhanced attack (red flash, larger damage popup).
                  Combat log: "Undertow Caller marks Aria with
                  Undertow!" / "Flood Brute exploits Undertow on Aria
                  for X damage!"
Player counters:  Kill the Caller (stops new marks). Cleanse the mark
                  (Priest spell — requires implementation, see below).
                  Defend/protect the marked character. Kill the Brute
                  (stops the payoff).
Counter verification: Kill caster = standard. Kill Brute = standard.
                  Defend = existing defend mechanic. Cleanse = REQUIRES
                  IMPLEMENTATION: the current `cure` spell effect only
                  handles "poison" | "sleep" | "paralysis" | "blind".
                  "Undertow" is a new status that must be added to both
                  `StatusEffect` and the `cure` effect kind. If cleanse
                  is not implemented, remove it from the counter list
                  and mark it as implementation work.
                  REMOVED: "Position the marked character in the back
                  row (if Brute can't reach)" — row-based targeting
                  restrictions have been removed (`canReach` always
                  returns true). The Brute can hit any party member
                  regardless of row. This is not a valid counter.
Learned rule:     "Callers mark targets. Brutes destroy marked targets.
                  Cleanse the mark or kill the Caller."
Presentation contract: Vignette may describe the Caller dragging
                  someone down and the Brute finishing them. Must
                  describe the mark/exploit relationship, not just
                  "they fight together."
Activation surface:
                  INTENDED: f5-flood-brute (Caller + Brute — the
                    obvious target formation)
                  NOTE: f5-minotaur-undertow has a Caller but no Brute.
                    The mark ability is inert there (no payoff partner).
                    This is fine — the Caller can still mark, but
                    without a Brute the mark has no exploit. Consider
                    whether the mark should have a minor standalone
                    effect (e.g. slow/defense down) so the Caller is
                    not useless without a Brute.
                  NOTE: f5-golem-cistern has a Caller but no Brute.
                    Same as above.
                  NOTE: f5-spawn-flood has a Brute but no Caller. The
                    Brute's bonus-damage passive is inert there (no one
                    to apply the mark). This is fine.
Machinery:        NEW (but lighter than F4-R2). Requires:
                  - New status effect: "undertow" (added to
                    `StatusEffect` union in `src/game/party.ts`)
                  - Extend `cure` effect kind to include "undertow"
                    (in `src/data/spells.ts` and `src/game/combat-spells.ts`)
                    — OR use a separate debuff tracking system like
                    `attackDebuffs` instead of a StatusEffect, avoiding
                    the cleanse contract entirely. Design decision.
                  - Caller ability: singleParty, applies "undertow"
                    status, cooldown 3, maxUses 2
                  - Brute ability or passive: attacks against
                    "undertow"ed targets gain bonus damage (e.g. +50%
                    or flat +8)
                  - New "mark" presentation: blue-green aura on target,
                    enhanced impact VFX when Brute hits a marked target
                  - This is simpler than F4-R2 because it's a binary
                    state (marked or not), not a count-scaling effect
                  - Name: "Undertow" not "Doom" — Doom carries RPG
                    baggage (countdown to instant death). Undertow is
                    thematic to the Weeping Cistern and more memorable.
```

**Implementation effort:** Moderate. New status + mark ability + damage
modifier + cleanse extension. The status system already exists; the new
work is the damage-against-marked-targets check, the visual aura, and
the cleanse contract.

**Cleanse contract decision:** If "Undertow" is a `StatusEffect`, the
`cure` spell effect must be extended to recognize it. If it's a separate
debuff (like `attackDebuffs`), no cleanse is needed but the counter list
changes — "cleanse" becomes "wait for duration to expire." The
StatusEffect path is more consistent with the existing system and gives
the Priest a meaningful counter. Recommended: StatusEffect + cure
extension.

**Standalone Caller usefulness:** In formations with a Caller but no
Brute (`f5-minotaur-undertow`, `f5-golem-cistern`), the mark is inert.
Consider giving the mark a minor standalone effect (e.g. -2 AC while
marked) so the Caller is not useless without a Brute. This is a tuning
decision, not a mechanical requirement.

#### Floor 5 combination formations

`f5-golem-cistern` (Sentinel + Caller + Wraith) activates the Sentinel
guard. Adding a Flood Brute to this formation would create the full
T3: Sentinel protects the Caller while the Caller marks a party member
for the Brute. The player must break the Sentinel's guard to reach the
Caller, or cleanse the mark before the Brute acts, or kill the Brute
before it can exploit. This requires formation modification (adding a
Brute to `f5-golem-cistern` or creating a new formation).

#### Floor 5 demon padding reduction

Per the earlier audit finding, Floor 5 should reduce generic demon
padding. The native vocabulary (Drowned Sentinel, Cistern Wraith, Weeping
Revenant, Flood Brute, Undertow Caller) is strong enough to carry the
floor. The desired player reaction is "oh fuck, Caller plus Brute," not
"another demon mage."

---

## Implementation priority

| Priority | Relationship | Floor | Effort | Type | Activation |
|---|---|---|---|---|---|
| 1 | Demon Mage → Spawn | 3 | ~1 line | Reuse | 4 formations (F3-F5), 2 need retune |
| 1 | Warden → Cantor | 4 | ~15 lines | Reuse | 2 formations (F4) |
| 1 | Sentinel → Caller/Wraith | 5 | ~15 lines | Reuse | 1 formation (F5) |
| 2 | Rune Knight → Construct | 3 | ~1 line + formation work | Reuse | 0 formations — needs authoring |
| 2 | Cantor → Choristers | 4 | Moderate + formation work | New (generic scaling) | 0 formations — needs authoring |
| 2 | Caller → Flood Brute | 5 | Moderate | New (mark) | 1 formation (F5) |

### Revised implementation order

The original priority assumed all reuse items could ship immediately.
The activation-surface audit reveals that some relationships have no
existing formation to activate in. The revised order:

**Step 1 — Ship the four reuse cases that have formations:**
1. Demon Mage → Spawn (add ability ID; 4 formations activate, 2 F5 need retune)
2. Warden → Cantor (new guard ability; 2 F4 formations activate)
3. Sentinel → Caller/Wraith (new guard ability; 1 F5 formation activates)
4. Rune Knight → Construct (add ability ID; needs new/modified F3 formation)

Play them. Validate that the learned rules transfer across floors.

**Step 2 — Implement Conduct as the first generic count-scaled relationship:**
- Add `scaling: { kind: "livingAllies", group, perAlly }` to the effect system
- Add `"conduct"` presentation
- Author a formation with Cantor + Choristers
- Play it.

**Step 3 — Implement Undertow as the first cross-actor setup/payoff:**
- Add `"undertow"` to `StatusEffect`
- Extend `cure` to handle `"undertow"`
- Add Caller mark ability + Brute bonus-damage passive
- Add `"mark"` presentation
- Play it.

This progression teaches the engine one new idea at a time: reuse →
generic scaling → cross-actor status interaction.

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
- **Formation authoring.** Several relationships have no existing
  formation to activate in (Rune Knight + Construct, Cantor + Chorister,
  Warden + Magus). Creating or modifying formations is authoring work
  that should follow mechanic validation.
- **F5 demon padding reduction.** Noted as a design goal but not
  specified here. The F5 formations that gain Demon Mage → Spawn
  chemistry (`f5-flood-brute`, `f5-spawn-flood`) should be retuned by
  replacing demon-mage or demon-spawn with native F5 casters.
- **Exploration consequences.** Documented separately as a combat north
  star in `docs/encounter-audit.md`. The two systems are complementary:
  chemistry determines the problem; exploration determines the condition.

## Campaign escalation summary

The resulting campaign grammar is not just "later floors have harder
chemistry." It's a progression in **how enemy cooperation works**:

> **Floor 1:** enemies manipulate each other (grab, throw, detonate,
> guard, pack, overload — all bespoke animation).
> **Floor 2:** recognizable species relationships emerge (armored guard,
> lab caretaker — minimal new machinery).
> **Floor 3:** familiar relationships coexist and cascade (overload +
> detonate in the same formation — reuse, no new mechanics).
> **Floor 4:** enemies synchronize into a system (conduct: the orchestra
> where removing one member changes what the machine can do).
> **Floor 5:** enemies manipulate *your party state* to set one another
> up (undertow: the mark that the Brute exploits — cooperation through
> the player's body, not just between enemies).

Each floor teaches the engine one new idea:
- F3: rules transfer across floors (no new engine work).
- F4: generic count-scaled relationships (`scaling: livingAllies`).
- F5: cross-actor setup/payoff through party state (new status +
  damage modifier).

Combined with the principle that fights inherit consequences from
exploration, the two-axis system is:

> **The formation determines the problem.**
> **The dungeon determines the condition under which you have to solve it.**

That is much richer than simply scaling stats and pack size.
