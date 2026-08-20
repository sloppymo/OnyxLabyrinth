# OnyxLabyrinth Campaign Combat Blueprint

**Status:** Design phase — no gameplay code changes yet.  
**Revision:** v1.1 — incorporates review feedback: F1 post-1b.1 state, F3/F4/F5 table activation truth, Sentinel one-charge guard, no inert Caller, no summoned-spawn exception, reordered waves, and boss section marked as design sketches.  
**Authority:** `docs/encounter-audit.md`, `docs/combat-relationship-vocabulary.md`, and source-of-truth inspection of `src/data/enemies.ts`, `src/data/enemy-abilities.ts`, `src/game/combat-*.ts`, `src/engine/combat-choreography.ts`, `src/data/spells.ts`, and `src/game/party.ts`.  
**Branch:** `feat/ai-player-harness` (current worktree `/home/sloppymo/OnyxLabyrinth`), clean except for untracked art/docs.

---

## 1. Executive Verdict

**Is the composable relationship architecture the right combat direction? Yes.**

The engine already has everything needed to make enemy species mean something:

- `consumeAlly`/`packStrike`/`guard` effects, `guardTargetIds`/`preferTargetIds`, and a `chemistryEnabled` flag that is now `true` for all random roaming encounters (`src/game/combat-ai.ts:185`, `src/data/enemies.ts:1655`).
- A dedicated multi-actor choreography engine (`src/engine/combat-choreography.ts:2270-2320`) with `throwAlly`, `consumeAlly`, `detonateAlly`, `packStrike`, `guardAlly`, and `overload` styles already wired to VFX and screen shake.
- A session-only family anti-repeat buffer and a family-level vignette fallback (`src/data/enemies.ts:2452`), so species rules can propagate without multiplying one-off scripts.

**Biggest strengths:**

1. *Cheapest lever in the game:* one-line ability-ID changes on enemy definitions propagate a relationship across every formation that contains the matching species (`rune-knight` + `lesser-construct`, `demon-mage` + `demon-spawn`).
2. *Composability works:* `armored-skeleton` + `skeleton-archer` and `lab-assistant` + `failed-experiment` proved that rules attached to species, not formations, scale across F2.
3. *Choreography already understands the language:* adding a new presentation key (`conduct`, `mark`) reuses the existing `CombatEvent.presentation` routing instead of building a second renderer.

**Biggest hidden risks:**

1. *Guard inflation.* Protect is the easiest relationship to add, but every floor could become "kill the wall first." Guarders need higher-than-average durability *and* players must have a visible bypass (area spells/techniques bypass guard per `src/game/combat-spells.ts:63` and `src/game/combat-techniques.ts:290`).
2. *Dense F5 tables.* `f5-flood-brute` and `f5-spawn-flood` already contain `demon-mage + demon-spawn`. Adding Spawn Bomb makes them chemically overcrowded before the Cistern identity ever lands.
3. *Conduct and Undertow are not free.* They require genuine new primitives: a generic `scaling: { kind: "livingAllies", group, perAlly }` field and a new `StatusEffect` / `cure` entry. They should not ship before the F3 reuse wave proves that the existing vocabulary transfers across floors.
4. *The bosses are a repeated kit with bigger numbers.* The Headmaster Echo escalates through stats (`hp: 192 -> 235 -> 285`, `attack: 24 -> 27 -> 31`) and one extra spell each (`curse` on the Girl, `ice-shards` on the Man). That is the campaign's single largest missed opportunity.

---

## 2. Current Campaign Diagnosis

### 2.1 Floor-by-floor combat depth (verified from `src/data/enemies.ts`)

| Floor | Roaming | T3 | T2 | T1 | T0 | Notes |
|------:|--------:|---:|---:|---:|---:|-------|
| 1 | 16 | 6 | 2 | 8 | 0 | Phase 1b.1 shipped the remaining vignettes, so the 4 previously T0 formations now have readable identity hooks (T1). 8 of 16 still have formal chemistry (`consumeAlly`/`guard`/`packStrike`/`overload`). |
| 2 | 10 | 0 | 0* | 0* | 10 | *Three formations now have live species rules: `armored-skeleton + skeleton-archer` (`ARCHER_GUARD`), `lab-assistant + failed-experiment` (`preferTargetIds`), and `displacer-beast` has a vignette. Tiers pending playtest, but the mechanic layer is active. |
| 3 | 12 | 0 | 0 | 0 | 12 | `lesser-construct` and `demon-spawn` carry `chemistryGroups` (`conductive-construct`, `volatile-spawn`), but `rune-knight` and `demon-mage` do not have the matching abilities in their `abilityIds`. All chemistry is inert. |
| 4 | 9 | 0 | 0 | 0 | 9 | Choir enemies have unique visuals and the strongest unrealized identity, but no authored Warden guard, Cantor conduct, or Acolyte/Magus payoff. |
| 5 | 10 | 0 | 0 | 0 | 10 | Native cast (Sentinel, Caller, Wraith, Brute, Revenant, Ice Golem) is strong, but the table pads most packs with generic demons and gives no species rules to the natives. |

### 2.2 Key factual corrections (code wins)

- **`cure` cannot remove `undertow`.** `StatusEffect` is `poison | sleep | paralysis | blind | knockedOut` (`src/game/party.ts:22-27`). `cure` spells accept only `poison | sleep | paralysis | blind` (`src/data/spells.ts:46`). Any design that advertises "cleanse the mark" must first extend both.
- **`rune-knight` (F3-5) does not have `crypt-rune-overload`.** Only `crypt-rune-knight` (F1) does (`src/data/enemies.ts` and `docs/enemy-roster-reference.md`). Adding the existing ability to the F3-5 definition is the entire implementation for F3-R1.
- **`demon-mage` (F3-5) does not have `crypt-spawn-bomb`.** Only `crypt-demon-mage` (F1) does. Adding it enables F3-R2 across F3/F4/F5.
- **`ARCHER_GUARD` already works.** It is a full `guard` effect with `guardTargetIds: ["skeleton-archer"]` and `presentation: "guardAlly"` (`src/data/enemy-abilities.ts:292-307`).
- **Guard intercepts `singleEnemy` player actions; area actions bypass it.** `combat-actions.ts:108`, `combat-spells.ts:63-67`, and `combat-techniques.ts:290` route single-target actions through `interceptEnemyGuard` while area actions only call `noteAreaGuardBypass` for telemetry.
- **Wind-up chemistry can be broken by disable/silence.** `actorDisabled` checks are active in guard validation (`src/game/combat-chemistry.ts:225`) and the existing wind-up/telegraph system is used by `crypt-rune-overload` and `crypt-spawn-bomb` (`src/data/enemy-abilities.ts:230-350`).
- **Bosses share the same base kit.** `headmasters-echo` (Dead Boy), `headmasters-echo-remnant` (Lonely Girl), and `headmasters-echo-ascendant` (Crying Man) all use `echo-of-silence`, `memory-drain`, `anti-magic-field`, `dark-pulse`, `memory-shatter`, and `total-eclipse`. Only the Girl adds `curse`, the Man adds `ice-shards`, and stats/phase counts scale (`src/data/enemies.ts:750-1490`).

### 2.3 Boss diagnosis

The Dead Boy / Lonely Girl / Crying Man are currently a single encounter with three stat blocks. They teach almost nothing distinct from floor trash:

- **What they currently teach/test:** gear check, cure stock for blind, and the existing phase-threshold burst.
- **What is mechanically unique:** very little beyond raw numbers and phase thresholds.
- **What is merely higher numbers:** HP, attack, AC, gold, XP, and one extra late ability.
- **What prior enemy literacy they remix:** none. A boss fight should be where the floor's relationship vocabulary is spoken most loudly; instead they share none of it.

---

## 3. Final Combat Language

### 3.1 Relationship vocabulary

| Relationship | Meaning | Existing machinery | Player learns |
|---|---|---|---|
| **Protect** | A intercepts direct attacks against B. | `guard` effect + `guardTargetIds` (`combat-chemistry.ts:209-328`) | "Kill the wall, go around with AoE, or wait out the token." |
| **Sustain** | A preferentially keeps B alive. | `healer` special + `preferTargetIds` (`combat-ai.ts:460-471`) | "The healer and its patient are a unit." |
| **Consume** | A destroys B for a selfish power spike. | `consumeAlly` + `markConsumed` (`combat-enemy.ts:184`, `combat-chemistry.ts:187-190`) | "Kill the user or deny the resource." |
| **Detonate** | A destroys B for an AoE explosion. | `consumeAlly` with `payoff.target: "allParty"`, `presentation: "detonateAlly"` | "The little one is a bomb." |
| **Coordinate** | A and B strike together for amplified single-target damage. | `packStrike` with `partnerIds` (`combat-enemy.ts:370+`) | "Their danger drops when one is dead." |
| **Channel** *(future)* | A draws repeated power from B without killing B. | New variant of `consumeAlly` | "Disrupt the connection." |
| **Setup → Payoff** | A applies a state; B exploits it. | New `StatusEffect` + damage-conditional payoff | "Cleanse the mark or kill the payoff." |

### 3.2 Rules of adoption

- **Reuse before invent.** Protect, Sustain, Consume, Detonate, and Coordinate already work. Use them first.
- **Species rules, not formation rules.** Attach the behavior to the actor's `abilityIds` or `special` and let composition produce the encounter.
- **Every relationship needs an activation surface.** If no formation currently contains the species pair, either modify a formation or reject the relationship for now.
- **Every relationship needs a counter that already works or is explicitly added.** "Spread out" is not a counter because all-party damage ignores rows; `canReach` always returns true for `singleParty` attacks (`combat-relationship-vocabulary.md` § corrections).

---

## 4. Floor 3 Final Table — Forge of Ashes

**Engine changes:**

1. Add `"crypt-rune-overload"` to `rune-knight.abilityIds` in `src/data/enemies.ts`.
2. Add `"crypt-spawn-bomb"` to `demon-mage.abilityIds` in `src/data/enemies.ts`, *or* author a slightly tuned clone (e.g., `demon-spawn-bomb`) with `maxUses: 1` and `cooldown: 4` so the F3-5 mage can manufacture at most one bomb per combat. The existing `crypt-spawn-bomb` targets `volatile-spawn`; the chemistry group is already on `demon-spawn`.

These abilities already target `chemistryGroups` (`conductive-construct`, `volatile-spawn`) that `lesser-construct` and `demon-spawn` already carry.

### 4.1 Formation edits

| ID | Current | Proposed | Wt | Tier | Relationships | Rationale |
|---|---|---:|---|---|---|
| `f3-construct-orc-line` | 2 `lesser-construct`, 2 `elite-orc` | 2 `lesser-construct`, `rune-knight`, `elite-orc` | 4 | T2 | **Overload** | Front-loaded fuel; back-row caster. First F3 lesson: "Rune Knights explode constructs." |
| `f3-guardian-rune-line` | `stone-guardian`, `animated-armor`, `rune-knight`, `warlock` | `lesser-construct`, `animated-armor`, `rune-knight`, `warlock` | 3 | T2 | **Overload** | Replaces a generic stone tank with the actual overload fuel. |
| `f3-construct-orc-duo` | `lesser-construct`, `elite-orc` | unchanged | 1 | T1 | — | Simple resource pair; keeps an odd, low-pressure encounter. Does not activate Overload on its own. |
| `f3-demon-spawn-mage` | `black-knight`, `demon`, `demon-spawn`, `demon-mage`, `succubus` | unchanged | 2 | T2/T3 | **Detonate** | The spawn is already present; adding spawn bomb turns this into "kill the mage or the spawn." |
| `f3-minotaur-spawn-rune` | `minotaur`, `demon-brawler`, `demon-spawn`, `rune-knight` | `minotaur`, `demon-spawn`, `demon-mage`, `rune-knight` | 2 | T2 | **Detonate** | Swap the generic brawler for the matching caster so the existing spawn becomes ammunition. |
| `f3-knight-rune-mage` | `ironclad-knight`, `black-knight`, `demon-brawler`, `rune-knight`, `demon-mage` | `ironclad-knight`, `lesser-construct`, `demon-spawn`, `rune-knight`, `demon-mage` | 2 | **T3** | **Overload + Detonate** | The deliberate cascade: two casters, two fuels. Player must choose which pair to break. Rare (weight 2) so it does not dominate. |
| `f3-viper-rune` | `viper-man`, `rune-knight` | unchanged | 1 | T1 | — | Keep the rare recurring viper motif. It does not have a construct, so Overload does not fire. |
| `f3-werewolf-pack` | 4 `werewolf` | unchanged | 4 | T0/T1 | — | No pack relationship implemented. Defer; 4 identical enemies are a pacing outlier. |
| `f3-flame-lava-warlock` | `flame-golem`, 2 `lava-slime`, 2 `warlock` | unchanged | 3 | T1 | — | Fire pressure remains a simple priority target. |
| `f3-hellhound-bat` | 2 `hellhound`, 3 `hellbat` | unchanged | 3 | T1 | — | Screen + paralysis; no formal pack link. |
| `f3-ogre-demon-line` | `big-titty-ogre`, `demon`, `elite-orc`, `demoness` | unchanged | 3 | T1 | — | Front brawl + healer. |
| `f3-demon-champion` | `demon-champion`, `demon`, `demoness`, `succubus` | unchanged | 2 | T1 | — | Two healers behind a champion. |

**Pacing/T-tier target for F3:** ~40% T2/T3, 30% T1, 30% T0/filler. After these edits the chemistry-bearing formations carry weight 4+3+2+2+2 = 13 / 30 total (≈43%). That is an intentional slight overrun for the first pass; if playtesting feels too scripted, convert `f3-knight-rune-mage` to a single-chemistry pack. The common teachers are `f3-construct-orc-line` (w4), `f3-demon-spawn-mage` (w2), and `f3-minotaur-spawn-rune` (w2). The T3 cascade is intentionally rare.

---

## 5. Floor 4 Final Table — Null Choir

**Engine changes:**

1. **New ability `choir-guard`** on `choir-warden`: `effect: { kind: "guard", charges: 1, duration: 2 }`, `guardTargetIds: ["discordant-cantor", "choir-magus"]`, `presentation: "guardAlly"`, `cooldown: 4`, `maxUses: 2`.
2. **New ability `discordant-phrase`** on `discordant-cantor`: wind-up, `target: "allParty"`, `effect: { kind: "damage", power: 8, scaling: { kind: "livingAllies", group: "choir-chorister", perAlly: 6 } }`, `presentation: "conduct"`, `cooldown: 5`, `maxUses: 2`.
3. Add `chemistryGroups: ["choir-chorister"]` to `iron-chorister`.

### 5.1 Formation edits

| ID | Current | Proposed | Wt | Tier | Relationships | Rationale |
|---|---|---:|---|---|---|
| `f4-choir-armor` | `choir-warden`, `animated-armor`, `discordant-cantor`, `demon-mage` | unchanged | 4 | **T2** | **Protect** | Warden guards the Cantor. Becomes the most common F4 teacher. |
| `f4-choir-guardian` | `choir-warden`, `animated-armor`, `stone-guardian`, `discordant-cantor`, `demon-mage`, `warlock` | `choir-warden`, 2 `iron-chorister`, `discordant-cantor`, `choir-magus` | 2 | **T3** | **Protect + Conduct** | The full Choir machine: guard the conductor, singers amplify the phrase, Magus adds fire. Replaces the generic demon/stone/guardian pile. |
| `f4-chorister-magus` | `iron-chorister`, `choir-magus`, `null-acolyte` | 2 `iron-chorister`, `discordant-cantor`, `choir-magus` | 1 | **T2** | **Conduct** | Cantor + two Choristers. Pure Conduct showcase, no guard. |
| `f4-spawn-brawler` | 2 `demon-spawn`, `demon-brawler`, `demon-mage`, `succubus` | unchanged | 2 | T2 | **Detonate** (after F3 change) | Cross-floor Demon Mage + Spawn learned rule appears in F4. |
| `f4-guardian-mage` | `stone-guardian`, `demon-brawler`, 2 `demon-mage`, `succubus` | unchanged | 4 | T1 | — | Generic caster pile; waits for Acolyte→Magus in a later pass. |
| `f4-hellbat-choir` | 5 `hellbat`, `choir-magus`, `null-acolyte` | 2 `iron-chorister`, `discordant-cantor`, `choir-magus`, `null-acolyte` | 3 | **T2** | **Conduct** | Replaces the bat screen with the actual Choir: two Choristers amplify the Cantor's phrase while the Acolyte/Magus add status pressure. No Warden, so the conductor is exposed. |
| `f4-champion-rune` | `demon-champion`, `rune-knight`, `demoness`, `demon-mage` | unchanged | 3 | T1 | — | No construct or spawn present; Overload and Detonate do not fire. Kept as a generic caster/champion pressure pack. |
| `f4-chorister-demon` | `iron-chorister`, `black-knight`, `demon-spawn`, `demoness`, `succubus` | unchanged | 3 | T1 | — | Two healers + a Chorister who has no Cantor to conduct. Defer. |
| `f4-viper-mage` | `viper-man`, `demon-mage` | unchanged | 1 | T1 | — |

**Pacing target for F4:** ~43% of weighted packs (4+2+1+3 = 10 / 23 total weight) involve at least one Choir rule for this first pass. The floor should read as an orchestra: remove a part and the sound changes. To reach 50%+, convert another weight-3 pack such as `f4-guardian-mage`; do not claim the current table already does so.

---

## 6. Floor 5 Final Table — Weeping Cistern

**Engine changes:**

1. **New status `undertow`** in `StatusEffect` (`src/game/party.ts:22-27`) and `cure` spell list (`src/data/spells.ts:46`).
2. **New ability `drown-mark`** on `undertow-caller`: `target: "singleParty"`, `effect: { kind: "status", status: "undertow", chance: 1.0, duration: 3 }`, `cooldown: 3`, `maxUses: 2`.
3. **New passive/ability on `flood-brute`** (e.g., `undertow-payoff`): attacks against `undertow` targets deal +8 (or +50%) damage.
4. **New ability `cistern-guard`** on `drowned-sentinel`: `guard` effect, `guardTargetIds: ["undertow-caller", "cistern-wraith"]`, `presentation: "guardAlly"`, `cooldown: 5`, `maxUses: 1`. Start light: the Sentinel is already 120 HP / 21 AC / 30% physical resist, so one intercept is a meaningful wall. Tune up only after playtest.
5. **Warden guard target priority:** when both `discordant-cantor` and `choir-magus` are present, the Warden should prioritize the Cantor (the conductor is the more valuable long-term target). Author `guardTargetIds: ["discordant-cantor", "choir-magus"]` in that order and verify `pickAbilityTargetId` selects the first valid candidate.

### 6.1 Formation edits

| ID | Current | Proposed | Wt | Tier | Relationships | Rationale |
|---|---|---:|---|---|---|
| `f5-golem-cistern` | `ice-golem`, `drowned-sentinel`, `cistern-wraith`, `undertow-caller` | `drowned-sentinel`, `ice-golem`, `flood-brute`, `undertow-caller` | 2 | **T3** | **Protect + Setup→Payoff** | Adds the payoff (Flood Brute) to the existing Caller. Sentinel guards Caller, Brute exploits the mark. No more "Caller with no Brute." |
| `f5-flood-brute` | `flood-brute`, `demon-brawler`, `demon-spawn`, `undertow-caller`, `demon-mage` | `drowned-sentinel`, `flood-brute`, `weeping-revenant`, `undertow-caller`, `cistern-wraith` | 4 | **T3** | **Protect + Setup→Payoff** | Replaces all generic demons with the Cistern cast. Sentinel guards the Caller, Caller marks, Brute cashes out, Wraith and Revenant drain. This is the signature F5 encounter. |
| `f5-minotaur-undertow` | `minotaur`, `demon-brawler`, `undertow-caller` | `minotaur`, `flood-brute`, `undertow-caller` | 1 | **T2** | **Setup→Payoff** | Adds the payoff to the existing Caller. |
| `f5-spawn-flood` | 2 `demon-spawn`, `flood-brute`, 2 `succubus`, `demon-mage` | `flood-brute`, `undertow-caller`, `cistern-wraith`, `weeping-revenant` | 2 | **T2** | **Setup→Payoff + drain pressure** | Removes the generic demon-spawn/succubus/mage padding and replaces it with native Cistern actors. |
| `f5-drowned-sentinel` | `drowned-sentinel`, `rune-knight`, `black-knight`, `warlock`, `succubus` | `drowned-sentinel`, `cistern-wraith`, `weeping-revenant`, `ice-golem`, `succubus` | 4 | **T2** | **Protect + sustain** | Removes the generic demon/knight/warlock padding. Sentinel guards the Wraith; Wraith and Revenant drain; ice-golem provides front pressure; succubus heals. No Undertow Caller, so no inert mark. |
| `f5-hellbat-wraith` | 3 `hellbat`, 2 `hellhound`, `cistern-wraith` | unchanged | 3 | T1 | — | Flying screen + wraith drain. |
| `f5-stone-demon` | 2 `stone-guardian`, `animated-armor`, `demon-mage`, `demoness` | unchanged | 3 | T1 | — | Generic wall/mage/healer pile. No spawn present; keep as variety. |
| `f5-champion-revenant` | `demon-champion`, `minotaur`, `demon-brawler`, `weeping-revenant`, `succubus` | unchanged | 3 | T1 | — | Champion + healer + drain. |
| `f5-armor-rune` | 3 `animated-armor`, `rune-knight`, `demon-mage` | unchanged | 2 | T1 | — | Could overload/detonate if construct and spawn were added, but packing three systems into one rare pack is too dense. Leave as generic pressure. |
| `f5-viper-succubus` | `viper-man`, `succubus` | unchanged | 1 | T1 | — |

**Pacing target for F5:** at least 50% of packs include a native Cistern relationship. Cistern-bearing formations now carry weight 2+4+1+2+4 = 13 / 25 total (52%). Generic demon packs (`f5-stone-demon`, `f5-champion-revenant`) are intentionally kept as variety but should feel like intruders, not the floor's identity.

---

## 7. Activation-Surface Matrix

| Relationship | Formation(s) | Status | Notes |
|---|---|---|---|
| **Rune Knight → Construct (Overload)** | `f3-construct-orc-line` | INTENDED | After adding ability and editing formation. |
| | `f3-guardian-rune-line` | INTENDED | Construct replaces stone-guardian. |
| | `f3-construct-orc-duo` | NOT ACTIVATED | No rune-knight present; kept as simple resource pair. |
| | `f3-viper-rune` | NOT ACTIVATED | No construct present; rare viper texture preserved. |
| | `f3-knight-rune-mage` | INTENDED | T3 cascade. |
| | `f4-champion-rune` | UNINTENDED | Has `rune-knight` but no construct. Not activated unless edited. |
| | `f5-armor-rune` | UNINTENDED | Same. |
| **Demon Mage → Spawn (Detonate)** | `f3-demon-spawn-mage` | INTENDED | Existing spawn + mage. |
| | `f3-minotaur-spawn-rune` | INTENDED | Add mage. |
| | `f4-spawn-brawler` | INTENDED | Cross-floor reinforcement. |
| | `f5-flood-brute` | NEEDS RETUNE | Too dense with Caller/Brute if kept. Remove `demon-mage` (done in proposal). |
| | `f5-spawn-flood` | NEEDS RETUNE | Too dense. Remove `demon-mage`/`demon-spawn` (done in proposal). |
| **Warden → Cantor/Magus (Protect)** | `f4-choir-armor` | INTENDED | Core F4 teacher. |
| | `f4-choir-guardian` | INTENDED | T3 guard + conduct. |
| **Cantor → Chorister (Conduct)** | `f4-choir-guardian` | INTENDED | T3 showcase. |
| | `f4-hellbat-choir` | INTENDED | Two Choristers + Cantor + Magus/Acolyte; no Warden. |
| | `f4-chorister-magus` | INTENDED | Pure Conduct. |
| **Sentinel → Caller/Wraith (Protect)** | `f5-golem-cistern` | INTENDED | Core F5 native identity. |
| | `f5-flood-brute` | INTENDED | Sentinel added. |
| | `f5-drowned-sentinel` | INTENDED | Sentinel guards the Cistern Wraith in this pack. |
| **Caller → Brute (Setup→Payoff)** | `f5-flood-brute` | INTENDED | T3 with guard. |
| | `f5-golem-cistern` | INTENDED | Brute added to the Caller; Sentinel guards Caller. |
| | `f5-minotaur-undertow` | INTENDED | Simple payoff. |
| | `f5-spawn-flood` | INTENDED | Native Cistern. |

**Activation re-check after all table edits:** Before any code is written, verify every `INTENDED` row by tracing `abilityConditionMet` and `chemistryResourceCandidates` against the *proposed* composition (not the current one). The `f4-champion-rune` and `f5-golem-cistern` cleanups in this revision came from exactly that re-check; do it once more after any further composition tweaks.

---

## 8. Player-Counter Matrix

| Enemy mechanic | Actual existing counter | Cost / limit | Notes |
|---|---|---|---|
| **Guard / Protect** | Kill guarder | Standard | Guard token consumed on redirect; max uses authored. |
| | Bypass with group/all spells or techniques | SP / rage | `combat-spells.ts:63-67` and `combat-techniques.ts:290` confirm area actions skip `interceptEnemyGuard`. |
| | Wait / status disable | SP / turn | Disabled guarder cannot hold token. |
| **Consume/Detonate** | Kill the resource before ability fires | Standard | `markConsumed` is part of resolve; killing the spawn/construct prevents it. |
| | Kill the user | Standard | Caster dead = no chemistry. |
| | Interrupt wind-up | Sleep/Paralysis/Silence | `crypt-rune-overload` and `crypt-spawn-bomb` have `windUp: true`. |
| **Sustain (healer preference)** | Kill the patient first | Standard | `lab-assistant` heals `failed-experiment` first if wounded. |
| | Kill the healer | Standard | Removes the preference entirely. |
| **Conduct (count-scaling)** | Kill the Cantor | Standard | Cancels wind-up. |
| | Kill Choristers | Standard | Lowers payoff damage. |
| | Brace/Defend | Action | Reduces all-party damage. |
| **Undertow (mark)** | Kill the Caller | Standard | Stops new marks. |
| | Cleanse with `cure` | SP (Priest) | **Requires implementation:** `cure` currently does not include `undertow`. |
| | Kill the Brute | Standard | Stops the payoff. |
| | Defend the marked | Action | Reduces physical payoff. |
| **Anti-Magic Field** | Use physical attacks/items | No SP cost | Casters still vulnerable to melee. |

---

## 9. Choreography Plan

| Relationship | Reuse | Adapt | New | Not needed |
|---|---|---|---|---|
| **Rune Knight Overload** | `overload` key in `CHEMISTRY_STYLES` (`combat-choreography.ts:2313`) | — | — | — |
| **Demon Mage Detonate** | `detonateAlly` key (`combat-choreography.ts:2289`) | — | — | — |
| **Warden/Sentinel Guard** | `guardAlly` (`combat-choreography.ts:2306`) | Color/texture for Choir/Cistern | — | — |
| **Cantor Conduct** | — | — | `conduct` presentation: Cantor raises, tethers to living Choristers, glow per singer, resolves with all-party lightning/chaos burst | Add to `CHEMISTRY_STYLES` and `pushChemistrySteps` logic. |
| **Acolyte→Magus setup/payoff** | — | — | Defer to second pass | — |
| **Undertow mark/payoff** | — | — | `mark` presentation: blue-green aura on party member; `undertow-payoff` enhanced hit flash and larger popup | Add to `CHEMISTRY_STYLES` and status icon. |
| **Sustain / preferTargetIds** | — | — | — | No bespoke animation; a heal popup on the preferred target is sufficient. |

**Tempo note:** `conduct` has a 1-round wind-up, so its choreography should be readable but not longer than ~1.2s. `undertow` mark is a quick cast; the payoff is a normal attack with an enhanced impact frame.

---

## 10. Exploration → Combat Plan

**Existing high-value interactions (verified by the F2 embodied playtest described in project context and `encounter-audit.md` § "combat north star"):**

1. **Traps → paralysis → next combat with 2 party members disabled.** Strongest observed T3 moment.
2. **Cursed equipment auto-equipping** before a fight (e.g., Bloodthirsty Blade) changes target priority and resource use.
3. **Poison from hazards** persists into combat and pressures the Priest's `cure` stock.
4. **Darkness / anti-magic zones** can disable spell counters and force physical-only solutions.
5. **Water/swim failures** can leave the party wet, injured, or low-SP before a fight.

**Minimal recommended improvements:**

- **Guarantee that F5 carries its conditions forward.** `f5-flood-brute` as the signature T3 encounter should sometimes appear *after* the party has been weakened by the cistern's water hazards or cursed chests. Do not change the encounter; change the frequency with which the surrounding dungeon creates the condition.
- **Do not add a new meta-system.** The existing `GameState` already holds status, loadout, and map state. The design work is ensuring these consequences reach the encounter roller or nearby encounter zones, not inventing new resources.
- **Avoid "encounter punishment" without warning.** Exploration consequences should be readable before the fight (visible status icons, cursed weapon text) so the player can adapt, not just suffer.

---

## 11. Boss Trilogy Redesign — Design Sketches

**Status of this section:** The boss concepts below are *design sketches*, not approved implementation. They preserve the floor-vocabulary escalation (Dead Boy introduces a rule, Lonely Girl mutates it through enemy relationships, Crying Man weaponizes party state), but the exact escort compositions, ability effects, and counter-verification must be finalized in a dedicated boss-design pass before any code is written.

### 11.1 Core problem

The three Headmaster Echo bosses (`headmasters-echo`, `-remnant`, `-ascendant`) currently share six abilities and differ mostly by stats and one extra spell. They do not remix the floor's relationship vocabulary and therefore do not feel like the campaign's thesis.

### 11.2 Recommended mechanical arc

| Boss | Floor | Central thesis | Signature mechanic | Relationship remix | Counters |
|---|---|---|---|---|---|
| **The Dead Boy** | 3 | *Silence and stolen memory.* | `stolen-quiet` applies `blind` and counts as a "memory." At 3 memories the boss casts `Total Eclipse` regardless of HP. | Detonate/Consume: his minions (Animated Armors, Ironclad Knight) are constructs he can overload when damaged. | Cure Blind, Magic Screen, burst before memory 3, silence/disable the boss to delay wind-ups. |
| **The Lonely Girl** | 4 | *A choir of one.* | Starts with `choir-warden` + 2 `iron-chorister` guards. While any Chorister lives, her `discordant-phrase` is amplified. When all minions die, she gains a permanent +attack crescendo and spams `curse`. | Protect + Conduct: the boss is the Cantor; her guards are the Choristers. | Kill the Warden first, then thin Choristers, then burst the Girl; silence her to cancel the phrase. |
| **The Crying Man** | 5 | *The party is the weapon.* | Each round marks one party member with `drowned` (a reskin of `undertow` for the boss fight). His `flood-brute` and `undertow-caller` minions exploit the mark; at phase 4 he consumes all marks for a massive heal + `Total Eclipse`. | Setup→Payoff: he turns the player's own party state into ammunition. | Cleanse, kill the Caller, kill the Brute, or burst the boss before he reaches phase 4. |

**Open design questions for the boss pass:**
- Dead Boy's "construct escorts become overload fuel" only works if `animated-armor` / `ironclad-knight` are added to the `conductive-construct` chemistry group. Is that a relationship contract we want? If not, replace the escort with `lesser-construct` or use a different rule (e.g., he gains a memory when a party member is blinded, regardless of escorts).
- Lonely Girl's `choir-warden + 2 iron-chorister` escort needs to fit the encounter narrative and the available sprites.
- Crying Man's mark must be cleansable and the payoff must be clearly tied to `flood-brute`/`undertow-caller` escorts; otherwise the counter list is invalid.

### 11.3 Trilogy escalation

1. **Dead Boy** teaches the player that *statuses can be resources for the boss* (memories).
2. **Lonely Girl** teaches that *enemy minions are not just HP padding; they are the boss's instrument* (amplification).
3. **Crying Man** teaches that *the player's own party state can be turned against them* (marks on party members).

### 11.4 Implementation shape

- Keep the existing phase-threshold system (`combat-eor.ts:168-185`). Each boss gets one unique phase-gated ability:
  - Dead Boy: `memory-echo` (gain memory when a party member is blinded).
  - Lonely Girl: `solo-crescendo` (+attack and permanent curse when all allies dead).
  - Crying Man: `drown-consume` (heal + all-party damage based on number of `drowned` party members, phase 4).
- Remix the existing `consumeAlly` and guard/undertow machinery rather than writing bespoke boss scripts.
- Keep the existing `silenceRandom` / `anti-magic-field` baseline so the bosses still feel related, but make the unique rule the memorable part.

---

## 12. Red-Team Findings

1. **Demon-mage self-manufactures its own ammunition.** `demon-mage` already has `summon-imp` (`summon` a `demon-spawn` when `<=3` allies). With `crypt-spawn-bomb` added, a mage can summon a spawn, then detonate it. **Do not exclude summoned spawns from Spawn Bomb:** a Demon Spawn is a bomb regardless of origin. Control the loop with tuning instead of an invisible exception: create a new `demon-spawn-bomb` ability for F3-5 `demon-mage` with `maxUses: 1`, `cooldown: 4`, and a lower AI `weight` (or keep `crypt-spawn-bomb` but reduce `maxUses` globally only if F1 can afford the nerf). The earliest realistic loop is turn 1 summon → turn 4 detonate, which is readable.
2. **AoE trivializes guard if guarders are fragile.** Wardens/Sentinels have high HP and AC, but a Mage's group spell ignores the redirect. This is an intended counter, but it means casters become the most valuable party members against Protect formations. **Mitigation:** keep non-Protect enemies threatening enough that the Mage cannot ignore them, and ensure not every formation is Protect.
3. **Overload + Detonate in the same pack is high burst.** The F3 T3 cascade (`f3-knight-rune-mage`) can deliver 8 lightning + 6 fire to the entire party if both abilities resolve. Because it is weight 2 and wind-ups can be broken, this is acceptable, but it should not become common.
4. **Conduct requires wind-up readability.** If the Cantor's phrase is not visibly telegraphed, players will treat it as random AoE. The `conduct` presentation must show the tether to living Choristers before the resolve beat.
5. **Undertow without cleanse is unfair.** The player must have a real counter. Either extend `cure` to `undertow` (recommended) or do not ship Undertow.
6. **F5 common packs are already large and durable.** Adding guard + mark + payoff to `f5-flood-brute` (weight 4) risks long fights. Watch average combat duration; if it exceeds ~5 rounds, reduce pack size or HP.
7. **Bosses still have the same bark pool.** If the Dead Boy, Lonely Girl, and Crying Man share the `headmasters-echo` speaker, their combat barks will sound identical. Boss-specific barks by `id`/`name` are needed for the redesign to land.

---

## 13. Implementation Backlog

### P0 — required before next playtest

| # | Task | Player benefit | Complexity | Reused | New | Dependencies | Verification |
|---|---|---|---|---|---|---|---|
| 1 | Add `crypt-rune-overload` to `rune-knight.abilityIds` | F3 Overload rule live | Trivial | ability, choreography | — | — | Unit test in `combat-pack-rune.test.ts` pattern; targeted F3 simulation |
| 2 | Add Spawn Bomb ability to `demon-mage.abilityIds` | F3-F5 Detonate rule live | Trivial | ability, choreography | — | — | Unit test; verify `f3-demon-spawn-mage` and `f4-spawn-brawler` |
| 3 | Modify 3 F3 formations for Overload/Detonate | First cross-floor species rules | Small | — | — | #1, #2 | `npm run check`; deterministic combat test |
| 4 | Retune `f5-flood-brute`, `f5-spawn-flood`, `f5-golem-cistern`, and `f5-drowned-sentinel` to remove generic demon padding | F5 identity before new primitives | Small | — | — | #2 | `floor:check`; encounter table test |
| 5 | Add `CHOIR_GUARD` to `choir-warden` and verify `f4-choir-armor` / `f4-choir-guardian` | F4 Protect rule live | Small | guard pipeline | one ability def | — | `combat-guard.test.ts` pattern; UI "INTERCEPT" check |
| 6 | Add `cistern-guard` to `drowned-sentinel` (maxUses 1) | F5 Protect rule live | Small | guard pipeline | one ability def | — | Guard redirect test with Sentinel/Caller; one-charge tuning |

### P1 — highest-value next

| # | Task | Player benefit | Complexity | Reused | New | Dependencies | Verification |
|---|---|---|---|---|---|---|---|
| 7 | Add generic `scaling: livingAllies` to effect system + `discordant-phrase` + `choir-chorister` group | F4 Conduct rule | Medium | wind-up, damage | scaling resolver, `conduct` presentation | #5, #6 | Unit test: damage scales with living Choristers |
| 8 | Author 1-2 F4 formations with Cantor + Chorister | F4 T3 machine | Small | — | — | #7 | Playtest: kill conductor vs thin choir vs silence |
| 9 | Implement `undertow` status, `drown-mark`, brute payoff, and `cure` extension | F5 Setup→Payoff | Medium | status system, damage | new status, mark presentation, payoff condition | #6 | Unit test: mark applied, Brute bonus damage, Priest cleanses |
| 10 | Author 2 F5 formations with Caller + Brute | F5 T3 native identity | Small | — | — | #9 | Playtest |

### P2 — polish/presentation

| # | Task | Player benefit | Complexity |
|---|---|---|---|
| 11 | Add `conduct` and `mark` choreography to `CHEMISTRY_STYLES` and `combat-choreography.ts` | Visible cooperation | Medium |
| 12 | Add family/formation vignettes for F3-F5 relationships | Pre-fight readability | Medium |
| 13 | F3 werewolf pack behavior (`packStrike` or howl-driven) | Make the 4-pack feel like a pack | Medium (deferred from P0) |

### DEFER

- **Channel (non-destructive Rune Overload).** Interesting, but adds a third Consume-like rule before Consume and Detonate are proven across floors.
- **Acolyte → Magus setup/payoff.** Second-pass F4 content; wait until Conduct is proven.
- **Werewolf/Hellhound pack Coordinate.** Pack is currently only on `crypt-hellhound`. Extend only after F3 is stable.
- **Whole fixed-four playable-cast redesign.** Out of scope for this combat pass.

### REJECT

- **Add 30 bespoke formation mechanics.** The species-rule model is already the better architecture.
- **Replace the entire encounter table with hand-scripted fights.** Stat scaling and pack-size growth are not the problem; composition and rules are.
- **Give every boss the same six abilities with bigger numbers.** The current boss kit is the thing being fixed, not the template to keep.

---

## 14. Implementation Waves

**Wave 1 — F3 Reuse + F5 Retune (1-2 days, low risk)**
- Enable `crypt-rune-overload` on `rune-knight` and add a Spawn Bomb ability to `demon-mage`.
- Modify `f3-construct-orc-line`, `f3-guardian-rune-line`, `f3-demon-spawn-mage`, `f3-minotaur-spawn-rune`, and `f3-knight-rune-mage`.
- Retune `f5-flood-brute`, `f5-spawn-flood`, `f5-golem-cistern`, and `f5-drowned-sentinel` to remove generic demon padding.
- **Hard STOP.** Do not proceed to Wave 2 until Wave 1 passes targeted verification. The remaining waves are planning-only until this gate is met.
- **Stop condition:** `npm run check` passes; targeted combat tests show Overload/Detonate fire in F3; no F5 formation becomes unwinnable.

**Wave 2 — Reused Protect: Choir Warden + Drowned Sentinel (1 day)**
- Add `CHOIR_GUARD` to `choir-warden` and verify `f4-choir-armor` / `f4-choir-guardian`.
- Add `cistern-guard` to `drowned-sentinel` and verify `f5-golem-cistern` / `f5-flood-brute` / `f5-drowned-sentinel`.
- **Stop condition:** UI shows "INTERCEPT" when targeting guarded Cantor/Caller; AI chooses guard when a valid target is present; Sentinel with one charge does not over-tank.

**Wave 3 — F4 Conduct (2-3 days)**
- Implement generic `scaling: livingAllies`.
- Add `discordant-phrase` and `choir-chorister` group.
- Author `f4-choir-guardian` / `f4-hellbat-choir` / `f4-chorister-magus` with Cantor + Chorister.
- **Stop condition:** Damage scales correctly with 0/1/2/3 Choristers; playtest confirms a meaningful target-order dilemma.

**Wave 4 — F5 Undertow (2-3 days)**
- Add `undertow` status and extend `cure`.
- Add `drown-mark` to `undertow-caller` and payoff passive to `flood-brute`.
- Author `f5-flood-brute`, `f5-minotaur-undertow`, `f5-spawn-flood`, `f5-golem-cistern`.
- **Stop condition:** Cleanse is a real counter; the T3 encounter is winnable but scary.

**Wave 5 — Boss Trilogy (dedicated design pass, then 3-4 days)**
- Run a dedicated boss-design pass; the current boss section contains sketches, not approved implementation.
- Author per-boss specs, targeted `combat-boss.test.ts` fixtures, and unique bark sets.
- Implement and playtest Dead Boy / Lonely Girl / Crying Man around floor vocabulary.
- **Stop condition:** Each boss feels distinct in a blind playtest; a player can describe what each one does differently.

---

## 15. Do Not Build List

1. **Do not implement Channel now.** It is a more interesting Consume, but it competes with the simpler "kill the user or the resource" rule the player is still learning.
2. **Do not add a generic "enemy trait" system.** `chemistryGroups` is already the narrow, authored membership model. Do not broaden it to auto-inferred traits.
3. **Do not author 20 new vignettes before the chemistry is visible.** Vignettes are the third layer (identity), not the second (mechanic).
4. **Do not replace the current `StatusEffect` enum with a broad tag system just for Undertow.** Extend the existing enum and `cure`.
5. **Do not give the F3 `demon-mage` an unlimited summon-to-detonate loop.** Cap `spawn-bomb` uses, cooldown, and AI weight with a tuned ability — but do not add an invisible exception that says freshly summoned spawns are not bombs.
6. **Do not make every F4 pack a full Choir orchestra.** Variety requires some generic packs; the floor identity comes from *frequency*, not *universality*.
7. **Do not redesign the player cast (classes/perks) to match this combat pass.** The current seven-class party creation is not being changed here; counters must work with existing Mage/Priest/Crusader tools.
8. **Do not increase boss HP/attack as a substitute for design.** The Dead Boy/Lonely Girl/Crying Man need distinct rules, not bigger numbers.

---

## 16. Self-Critique

- **Did I create complexity because I could?** Conduct and Undertow are the only new primitives. Everything else reuses `consumeAlly`, `guard`, or `packStrike`. That is justified by the activation-surface gaps, not by breadth.
- **Did I confuse readability with depth?** T1 is still the floor, not the ceiling. Most common packs remain T1/T2; the T3 cascades are rare (weight 1-2).
- **Did I overuse guard?** Protect appears in F2 (armored skeleton), F4 (Choir Warden), and F5 (Drowned Sentinel). That is once per floor after F1 — acceptable, especially because each has a different presentation and counter context.
- **Did I leave simple encounters for pacing?** Yes. `f3-werewolf-pack`, `f3-flame-lava-warlock`, `f3-construct-orc-duo`, `f3-viper-rune`, `f4-guardian-mage`, `f4-champion-rune`, `f4-chorister-demon`, and `f5-hellbat-wraith` remain T1.
- **Did I design counters that do not exist?** "Cleanse Undertow" is flagged as requiring `cure` extension; it is not advertised without implementation.
- **Did I make the endgame exhausting?** F5 T3s are intentionally weight 2-4, not every pack. The native cast is being concentrated, not expanded.

---

## 17. The 10 Highest-Leverage Changes In Order

1. **Add a Spawn Bomb ability to `demon-mage.abilityIds`.** It is nearly one line, it already works, and it activates a cross-floor learned rule in four formations immediately.
2. **Add `crypt-rune-overload` to `rune-knight.abilityIds` and edit `f3-construct-orc-line` to include the knight.** This creates the second F3 rule with existing machinery.
3. **Retune `f5-flood-brute`, `f5-spawn-flood`, `f5-golem-cistern`, and `f5-drowned-sentinel` to remove generic demon padding.** These common packs are the biggest source of F5 identity dilution and chemical overcrowding.
4. **Add `CHOIR_GUARD` to `choir-warden`.** It turns the strongest unrealized floor identity into readable Protect with no new engine work.
5. **Add `cistern-guard` to `drowned-sentinel` (one charge, playtest).** It gives the F5 native cast its first species rule and reuses the proven guard pipeline; Sentinel is tanky enough that one intercept is the right starting point.
6. **Implement generic `scaling: livingAllies` and `discordant-phrase` for F4 Conduct.** This is the smallest engine primitive that unlocks the Choir's central fantasy.
7. **Implement `undertow` status, mark, brute payoff, and `cure` extension.** This is the only genuinely new primitive for F5; it must be real before the floor feels like predation.
8. **Author the F3 cascade formation (`f3-knight-rune-mage`).** It is the first intentional T3 built from two learned rules, testing whether composability scales.
9. **Redesign the three Headmaster Echo bosses around floor vocabulary.** They are currently the campaign's biggest missed opportunity and the natural capstone for the combat language.
10. **Author a dedicated per-boss mechanical spec and `combat-boss.test.ts` fixtures before implementing any boss code.** The current boss section contains sketches, not approved implementation; the biggest risk is shipping another stat-inflated kit.
