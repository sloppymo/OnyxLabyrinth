# Encounter Formation Audit (Phase 1a, revised)

Date: 2026-08-18 (revised same day after review)
Scope: all roaming encounter tables in `src/data/enemies.ts` (`ENCOUNTER_TABLES` floors 1–5).
Out of scope: climax/guardian tables (keys 6, 7, 8, 9 — `f2-forbidden-wing-keepers`, `f3-grand-forge-guardian`, `f4-lonely-girl`, `f5-crying-man`) and Arena tables. Those are authored boss fights, not roaming filler.

## Taxonomy

Every roaming formation is tagged on two independent axes. **Identity** (do I understand what makes this encounter distinctive?) and **Decision** (does understanding it give me at least two plausible responses?). Vignettes serve the first; Formation Chemistry serves the second. A vignette that names a healer does not make "focus-fire the healer" a deeper decision — it makes it a *legible* one. Both are valuable but they are not the same work.

The combat-depth tier:

- **T0 — Filler.** No meaningful identity. "Some dudes."
- **T1 — Readable.** Has a clear priority target or behavior, possibly aided by a vignette. The optimal play is usually obvious once identified (kill the healer, rush the archers). Understanding it gives one right answer.
- **T2 — Interactive.** Enemies meaningfully affect one another (guard, buff, consume, coordinate). The player's targeting order changes the fight, not just its clarity.
- **T3 — Dilemma.** The formation creates competing priorities or multiple plausible responses. Kill the thrower vs kill the ammunition; kill the harvester vs kill the harvest; take the out vs fight for the XP.

The target is not "58% of encounters have bespoke text." The target is: **most common encounters reach T2, and enough reach T3 that the player doesn't settle into autopilot.** Floor 1 contains several T2/T3 encounters. Most later-floor encounters are T0/T1. That gap is the real finding.

Presentation tags (separate from the tier):

- **[V]** — has an authored vignette in `VIGNETTES_BY_FORMATION` (or a family fallback).
- **[out]** — has a timed-out choice (a T3 *encounter-level* decision, though not necessarily a T3 *combat*).
- **[chem]** — has a formal Formation Chemistry mechanic (`consumeAlly`/`guardAlly`/`packStrike`).

A formation can be `[chem]` (T2/T3 combat) without `[V]` (silent mechanic — the interaction happens but nobody names it), or `[V]` (T1 combat, readable) without `[chem]`. The most common gap on Floor 1 is `[chem]` without `[V]`. The universal gap on floors 2–5 is neither.

## Executive summary

| Floor | Roaming | T3 | T2 | T1 | T0 | Authored identity (V) | Authored combat (chem) |
|------:|--------:|---:|---:|---:|---:|----------------------:|----------------------:|
| 1     | 16      | 6  | 2  | 4  | 4  | 6                     | 8                     |
| 2     | 10      | 0  | 0  | 0  | 10 | 0                     | 0                     |
| 3     | 12      | 0  | 0  | 0  | 12 | 0                     | 0                     |
| 4     | 9       | 0  | 0  | 0  | 9  | 0                     | 0                     |
| 5     | 10      | 0  | 0  | 0  | 10 | 0                     | 0                     |
| **Total** | **57** | **6** | **2** | **4** | **45** | **6** | **8** |

**Headline finding:** Formation Chemistry is a Floor 1 showcase. Every chemistry ability is `crypt-*` keyed and only assigned to Floor 1 enemies (`crypt-warlock`, `crypt-demon-mage`, `crypt-rune-knight`, `crypt-minotaur`, `crypt-hill-ogre`, `crypt-animated-armor`, `crypt-hellhound`). The `chemistryGroups` tags (`throwable-slime`, `harvestable-bone`, `volatile-spawn`, `conductive-construct`) are authored on exactly five enemy ids, all Floor 1 (with two carryovers — `lesser-construct` and `demon-spawn` — whose Floor 3 versions lack the matching `crypt-*` casters, so the tags are inert there). All six authored vignettes are Floor 1.

**Consequence:** floors 2–5 are 100% T0. A player who has learned to read Floor 1 formations (kill the warlock before he eats the skeleton, kill the mage before she bombs the spawn) hits Floor 2 and every fight is "some dudes." The campaign's combat-authorship problem is real, measurable, and larger than the original "~20 flat formations" estimate — it is 45 of 57 roaming formations at T0.

**What this audit is not:** a plan to solve a 45-formation mechanical-depth problem with dialogue. Vignettes give identity (T0→T1). Only Formation Chemistry gives interaction (T1→T2/T3). Phase 1b.1 below finishes Floor 1's identity layer and tests whether vignettes alone meaningfully improve Floor 2. The result of that test determines whether the next pass is more vignettes or more chemistry — that decision is deliberately not prejudged.

## Floor 1 — The Flooded Crypt (16 roaming)

The chemistry floor. 8 formations have formal mechanics (`[chem]`), 6 have vignettes (`[V]`), 2 of those have timed outs (`[out]`). The 4 T0 formations are the unfinished edges. The 6 `[chem]`-without-`[V]` formations have real interaction but silent presentation — the cheapest fix in the game (a vignette makes an existing T2/T3 readable).

| id | composition | tier | tags | note / fix |
|----|-------------|------|------|------------|
| `f1-minotaur-slime` | crypt-minotaur + slime | T3 | [chem][V] | Kill the thrower vs kill the ammunition. The showcase. |
| `f1-warlock-bone-battery` | 2 skeleton + crypt-warlock | T3 | [chem][V] | Kill the harvester vs deny the harvest. |
| `f1-spawn-bomb` | 2 crypt-demon-spawn + crypt-demon-mage | T3 | [chem] | Kill the mage vs kill the spawn. **[V]** — silent T3, needs a vignette. |
| `f1-rune-overload` | crypt-lesser-construct + crypt-rune-knight | T3 | [chem] | Kill the knight vs kill the construct. **[V]** — silent T3. |
| `f1-ogre-toss` | crypt-hill-ogre + skeleton | T3 | [chem] | Kill the ogre vs kill the throw-weight. **[V]** — silent T3. |
| `f1-guarded-bomb` | crypt-animated-armor + crypt-demon-spawn + crypt-demon-mage | T3 | [chem] | Double dilemma (guard + bomb). **[V]** — silent T3. |
| `f1-living-shield` | crypt-animated-armor + crypt-warlock | T2→T3 | [chem] | Guard creates a dilemma (break the guard vs reach the warlock). **[V]** — silent. |
| `f1-hunting-pack` | crypt-hellhound + crypt-werewolf | T2 | [chem] | Pack strike coordinates two actors. **[V]** — silent T2. |
| `f1-red-bone-bounty` | red-skeleton + skeleton + skeleton-archer | T1 | [V][out] | Vignette + timed out. Combat is T1 (kill the archer), the out is a T3 encounter decision. |
| `f1-orc-leap` | 2 crypt-orc | T1 | [V][out] | Vignette + timed out. Combat is T1. |
| `f1-acid-burrow` | acid-puddle + 2 slime | T1 | [V] | Vignette names the puddle; combat is "kill slimes." |
| `f1-solo-guardian` | 1 crypt-stone-guardian | T1 | [V] | Showcase solo; identity via vignette. |
| `f1-wraith-pincer` | crypt-blood-monster + crypt-blood-wraith | T0 | — | **FIX.** Front pins, back drains — a natural T2 if the drain/pincer were formalized; for now **[V]** to lift to T1. |
| `f1-gaze-slime` | 2 slime + crypt-gaze-wraith | T0 | — | **FIX.** Slimes screen for the gaze wraith. **[V]** to lift to T1. |
| `f1-flame-forge` | 2 crypt-lesser-construct + crypt-flame-golem | T0→T1 | — | **FIX.** `forge-bellows` buffs constructs (soft one-directional interaction). **[V]** to name the buff; a formal chemistry link (golem consumes construct for overload) would lift to T2/T3 — deferred. |
| `f1-ghostfire-duet` | 2 crypt-ghostfire | T0 | — | **FIX.** Two drainers, flavor-thin. **[V]** gives identity; no mechanical hook worth pursuing for a duo. |

**Floor 1 verdict:** 4 T0 formations (all **[V]** fixes — no mechanic swaps needed, the mechanics that exist are just silent). 6 `[chem]`-without-`[V]` formations (silent T2/T3 — the cheapest, highest-value fixes in the game: a vignette makes an existing dilemma readable). **10 new F1 vignettes finish the floor's identity layer.** Floor 1 then has 16/16 formations with authored identity and 8/16 with authored combat — an honest split.

## Floor 2 — The Cursed Library (10 roaming, all T0)

Zero authored anything. The floor has a clear identity (library/lab: failed experiments, lab assistants, eyeball monsters, displacer beasts) but none of it is named in combat, and no enemies interact. Several formations have **soft hooks** — a healer (`lab-assistant` = Cursed Scribe, `mass-heal-ability`), a gaze caster (`eyeball-monster`), a blink-striker (`displacer-beast`). These are priority targets, making them T1-potential with a vignette, but the combat itself stays T1 (one right answer: kill the priority).

| id | composition | weight | tier | soft hook | fix |
|----|-------------|-------:|------|-----------|-----|
| `f2-armored-archer` | 2 armored-skeleton + 2 skeleton-archer | 4 | T0 | archer wall behind armor | **[V]** → T1 (rush the bows) |
| `f2-orc-squad` | 3 orc + skeleton-archer | 4 | T0 | same hook, orc flavor | **[V]** → T1 (family vignette with `armored-line`) |
| `f2-lab-keepers` | failed-experiment + armored-skeleton + lab-assistant + eyeball-monster | 3 | T0 | healer + experiment + gaze | **[V]** → T1; **[chem?]** — see design note below |
| `f2-blood-ghostfire` | 2 blood-monster + blood-wraith + ghostfire | 3 | T0 | drain pressure | defer |
| `f2-mixed-lab` | orc + armored-skeleton + failed-experiment + skeleton-archer + lab-assistant | 3 | T0 | healer in a 5-pack | defer |
| `f2-blood-experiment` | failed-experiment + blood-monster + ghostfire + eyeball-monster + blood-wraith | 2 | T0 | gaze + drain pile | defer |
| `f2-armored-orc-archer` | armored-skeleton + orc + skeleton-archer | 2 | T0 | archer wall variant | defer (family vignette covers it) |
| `f2-displacer-lab` | displacer-beast + failed-experiment + eyeball-monster | 2 | T0 | blink-striker + gaze | **[V]** → T1 (name the blink) |
| `f2-lab-duo` | failed-experiment + lab-assistant | 1 | T0 | tutorial duo | defer |
| `f2-red-armored-archer` | red-skeleton + armored-skeleton + skeleton-archer + lab-assistant | 1 | T0 | archer wall + healer | defer |

**Floor 2 priority fixes (Phase 1b.1):** `f2-armored-archer` (w4), `f2-lab-keepers` (w3), `f2-displacer-lab` (w2). Three vignettes cover the floor's three distinct threats. `f2-orc-squad` (w4) shares a family vignette with `f2-armored-archer` via `VIGNETTES_BY_FAMILY["armored-line"]` — the map exists but is empty; this is its intended use.

### Design note: `f2-lab-keepers` is the prototype

This formation is fertile: failed-experiment + armored-skeleton + lab-assistant + eyeball-monster. The assistant already heals. The design question for Phase 1b.1 is whether a tiny existing-mechanic change can make the assistant↔experiment relationship explicit enough to lift the formation from T1 to T2 — without building new chemistry infrastructure.

If the assistant's `mass-heal-ability` preferentially targets the failed-experiment (or buffs it when at low HP), the player gains a soft dilemma: kill the healer, kill the experiment before it's modified, or burn through both. That's a one-line AI-condition change in `enemy-abilities.ts` or `combat-ai.ts`, not a new primitive. **If it's cheap, do it in 1b.1. If it isn't, ship the vignette alone and note the chemistry as a Phase 2 candidate.** This is the one formation in 1b.1 where a mechanic change is worth exploring.

## Floor 3 — The Forge of Ashes (12 roaming, all T0)

Zero authored. Note: `lesser-construct` and `demon-spawn` on Floor 3 carry the `conductive-construct` / `volatile-spawn` chemistry tags, but the matching `crypt-rune-overload` / `crypt-spawn-bomb` casters are Floor-1-only. Floor 3's `rune-knight` and `demon-mage` have different ability sets. So chemistry does **not** fire on Floor 3 despite the tags — a latent opportunity (Phase 5 could extend chemistry here cheaply by giving `rune-knight` a `rune-overload`-equivalent and `demon-mage` a `spawn-bomb`-equivalent; the `consumeAlly` primitive is generic), but out of scope for Phase 1b.1.

| id | composition | weight | tier | soft hook | fix |
|----|-------------|-------:|------|-----------|-----|
| `f3-construct-orc-line` | 2 lesser-construct + 2 elite-orc | 4 | T0 | construct wall + fire-breath archers | defer to 1b.2 |
| `f3-werewolf-pack` | 4 werewolf | 4 | T0 | none — literal pile of dudes | defer to 1b.2 (see design note) |
| `f3-flame-lava-warlock` | flame-golem + 2 lava-slime + 2 warlock | 3 | T0 | dual warlock caster pressure | defer |
| `f3-hellhound-bat` | 2 hellhound + 3 hellbat | 3 | T0 | hellbat `howl` buffs pack | defer |
| `f3-ogre-demon-line` | big-titty-ogre + demon + elite-orc + demoness | 3 | T0 | demoness heals | defer |
| `f3-guardian-rune-line` | stone-guardian + animated-armor + rune-knight + warlock | 3 | T0 | wall + back casters | defer |
| `f3-demon-spawn-mage` | black-knight + demon + demon-spawn + demon-mage + succubus | 2 | T0 | summon + seduction | defer |
| `f3-minotaur-spawn-rune` | minotaur + demon-brawler + demon-spawn + rune-knight | 2 | T0 | — | defer |
| `f3-knight-rune-mage` | ironclad-knight + black-knight + demon-brawler + rune-knight + demon-mage | 2 | T0 | — | defer |
| `f3-demon-champion` | demon-champion + demon + demoness + succubus | 2 | T0 | champion + two healers | defer |
| `f3-construct-orc-duo` | lesser-construct + elite-orc | 1 | T0 | — | defer |
| `f3-viper-rune` | viper-man + rune-knight | 1 | T0 | — | defer |

**Floor 3 in Phase 1b.1: nothing.** Deferred entirely to 1b.2, pending the Floor 2 playtest result.

### Design note: `f3-werewolf-pack` and the pack primitive

The audit's original suggestion (swap one werewolf for a hellhound with `howl`) makes the pack *legible* but not *interactive* — it's still T1 ("kill the dog first"). The deeper fix is extending the existing `packStrike` primitive: a large homogeneous pack should have a reason to be homogeneous. First werewolf marks prey → others gain something against that target; killing one enrages the rest; `howl` changes their behavior. That's T2/T3, and it's a Phase 2+ chemistry extension, not a Phase 1b content pass. Noted here so the "swap one werewolf" fix is not mistaken for a real solution.

## Floor 4 — The Null Choir (9 roaming, all T0)

Zero authored. The floor has the strongest unrealized identity in the game. The Choir enemies (Warden, Cantor, Acolyte, Chorister, Magus) have real abilities (`discordant-cantor` = lightning/chaos-bolt/anti-magic, `choir-magus` = magma/hellfire/anti-magic, `null-acolyte` = blinding-gaze/curse/ward) — these are priority targets, just silent. But vignettes alone will not satisfy this floor long-term. It's a **choir**; their identity should involve synchronization. This is the floor that most deserves explicit enemy-side combinatorics in a future phase.

| id | composition | weight | tier | soft hook | fix |
|----|-------------|-------:|------|-----------|-----|
| `f4-choir-armor` | choir-warden + animated-armor + discordant-cantor + demon-mage | 4 | T0 | dual caster | defer to 1b.2 |
| `f4-guardian-mage` | stone-guardian + demon-brawler + 2 demon-mage + succubus | 4 | T0 | dual mage + healer | defer |
| `f4-hellbat-choir` | 5 hellbat + choir-magus + null-acolyte | 3 | T0 | magus + acolyte behind screen | defer |
| `f4-chorister-demon` | iron-chorister + black-knight + demon-spawn + demoness + succubus | 3 | T0 | two healers | defer |
| `f4-champion-rune` | demon-champion + rune-knight + demoness + demon-mage | 3 | T0 | champion + healer + mage | defer |
| `f4-choir-guardian` | choir-warden + animated-armor + stone-guardian + discordant-cantor + demon-mage + warlock | 2 | T0 | 6-enemy cluster | defer |
| `f4-spawn-brawler` | 2 demon-spawn + demon-brawler + demon-mage + succubus | 2 | T0 | — | defer |
| `f4-chorister-magus` | iron-chorister + choir-magus + null-acolyte | 1 | T0 | pure-Choir trio (floor identity) | defer to 1b.2 |
| `f4-viper-mage` | viper-man + demon-mage | 1 | T0 | — | defer |

**Floor 4 in Phase 1b.1: nothing.** Deferred entirely.

### Design note: the Null Choir deserves chemistry, not just vignettes

Long-term design space (Phase 2+, not 1b): Cantor begins a phrase → Choristers strengthen it; kill the Cantor → Choir loses coordination; Acolyte applies a condition → Magus cashes it out; Wardens protect whichever singer is currently "leading"; multiple Choir enemies alive alters spell properties. This floor is the natural second home for Formation Chemistry after Floor 1. Noted for the roadmap, not for this pass.

## Floor 5 — The Weeping Cistern (10 roaming, all T0)

Zero authored. The floor has its own elite roster (Drowned Sentinel, Cistern Wraith, Weeping Revenant, Flood Brute, Undertow Caller) with a coherent drain/gaze/curse theme — but the formations keep padding them with generic demons (demon-brawler, demon-spawn, demon-mage, succubus). By the final floor, "fuck, it's an Undertow Caller" should be the reaction, not "okay, demon mage again." The native cast should carry far more of the table. That's a composition redesign (Phase 2+), not a vignette pass.

| id | composition | weight | tier | soft hook | fix |
|----|-------------|-------:|------|-----------|-----|
| `f5-flood-brute` | flood-brute + demon-brawler + demon-spawn + undertow-caller + demon-mage | 4 | T0 | caller curse + brute charge | defer to 1b.2 |
| `f5-drowned-sentinel` | drowned-sentinel + rune-knight + black-knight + warlock + succubus | 4 | T0 | sentinel wall + back casters | defer |
| `f5-hellbat-wraith` | 3 hellbat + 2 hellhound + cistern-wraith | 3 | T0 | wraith draining behind screen | defer |
| `f5-stone-demon` | 2 stone-guardian + animated-armor + demon-mage + demoness | 3 | T0 | wall + mage + healer | defer |
| `f5-champion-revenant` | demon-champion + minotaur + demon-brawler + weeping-revenant + succubus | 3 | T0 | champion + revenant drain + healer | defer |
| `f5-armor-rune` | 3 animated-armor + rune-knight + demon-mage | 2 | T0 | — | defer |
| `f5-spawn-flood` | 2 demon-spawn + flood-brute + 2 succubus + demon-mage | 2 | T0 | — | defer |
| `f5-golem-cistern` | ice-golem + drowned-sentinel + cistern-wraith + undertow-caller | 2 | T0 | pure-Cistern quartet (floor identity) | defer to 1b.2 |
| `f5-minotaur-undertow` | minotaur + demon-brawler + undertow-caller | 1 | T0 | — | defer |
| `f5-viper-succubus` | viper-man + succubus | 1 | T0 | — | defer |

**Floor 5 in Phase 1b.1: nothing.** Deferred entirely.

### Design note: Floor 5 should lean on its native cast

Long-term (Phase 2+): reduce generic-demon padding, increase native-cistern combinations. The native cast is interesting; the formations don't trust it. Not a Phase 1b concern.

## Phase 1b.1 — authorized scope

| Work | Formations | New vignettes | Mechanic changes |
|------|-----------|--------------|------------------|
| Finish Floor 1 identity | 6 silent `[chem]` + 4 T0 | 10 | 0 |
| Floor 2 identity test | `f2-armored-archer` (+ `f2-orc-squad` via family), `f2-lab-keepers`, `f2-displacer-lab` | 3 (one family-level) | 0–1 (lab-keepers assistant↔experiment, only if cheap) |
| **Total Phase 1b.1** | 13 formations | **13 vignettes** | **0–1** |

### Acceptance criterion

> **Do not promote any formation above T1 unless the player has at least two plausible tactical responses after understanding the mechanic.**

This prevents tier inflation from "an enemy has a buff/heal interaction" — that's readability, not a decision. A formation earns T2/T3 only when understanding it opens more than one viable play.

### Stop condition and the 1b.2 decision

**Then STOP.** Run `npm run check`. Playtest Floor 2. Answer:

> Do these three fights feel different because of the vignette, or because the combat itself behaves differently?

The result drives the next phase cleanly:

- **If Floor 2 still feels rote after the three vignettes:** stop vignette expansion. Move directly to Formation Chemistry (extending primitives to F2–F5, starting with the lab-keepers relationship and the Floor 3 chemistry tags that are already inert but wired). The vignettes still ship — they made the encounters easier to remember, which is real value — but they did not solve the deeper combat problem, and more dialogue will not either.
- **If Floor 2 feels substantially more memorable and varied:** continue a limited identity pass (the deferred F2–F5 formations), but still schedule chemistry afterward. T1 is never "done" — it's a floor, not a ceiling. The likely answer is that vignettes help memorability without solving combat depth, which still makes Phase 1b.1 successful.

This decision is not prejudged. The audit's job was to show the problem is real and measurable. It is. The cure is not assumed.

## The choreography finding (discovered during Phase 1b.1)

The audit originally measured two gaps: mechanical depth (T0–T3) and identity (vignettes). A third gap was discovered while inspecting the combat choreography engine (`src/engine/combat-choreography.ts`): **visual choreography**.

Floor 1 doesn't just behave more interestingly — it *looks* like its enemies are aware of each other. The choreography engine routes a `presentation` field on each `CombatEvent` to bespoke multi-actor animation sequences with dedicated timing, movement tweens, VFX sprites, and screen shake. The existing vocabulary:

| Presentation | What the player sees | Used by |
|-------------|----------------------|---------|
| `throwAlly` | Resource pulled to caster → projectile arc to target → body removed on impact | Ogre Toss, Slime Cannon |
| `consumeAlly` | Resource grabbed in place → burst VFX on resource → caster flash | Bone Harvest |
| `detonateAlly` | Command pulse from mage → large fire explosion + screen shake on spawn | Spawn Bomb |
| `guardAlly` | Shield burst on guarded ally → guard marker persists | Living Shield |
| `packStrike` | Partner moves into strike position → shared slash burst → both recoil | Hunting Pack |
| `overload` | Tether/charge between knight and construct → lightning discharge + shake | Rune Overload |
| `meleeGangUp` | Attacker mounts ally → leaps past front line → strikes → leaps back (1.4s) | Orc Pack Leap |

**Floors 2–5 use none of this.** Every F2–F5 fight uses generic cast/melee animations. The enemies look like independent actors standing beside one another. This is the third leg of the "pile of dudes" problem: mechanical depth drops, enemy identity drops, *and* visual choreography drops — all at the Floor 1→2 boundary.

**This makes chemistry propagation vastly higher leverage than the audit originally estimated.** The expensive visual vocabulary already exists. New chemistry does not mean new rendering architecture — it means authoring new combat events and mapping them onto existing choreography vocabulary (with bespoke presentation only when a new relationship genuinely deserves it). The `presentation` field is the extension point; the choreography engine, both render backends, and the VFX sprite library are already built.

### Revised north star

> **Enemy formations should behave like small machines.** Each actor has a role. Remove one part and the machine changes. And when the machine does something, the animation should show the relationship — not merely show four individual attacks.

Design rule going forward:

> **If two enemies are supposed to be cooperating, the player should be able to see them cooperate.** Not just a stat buff, a combat log line, or an HP change. One actor moves, gestures, feeds, protects, mounts, sacrifices, channels, throws, or otherwise affects the other.

### What this means for Phase 1b.2

The expected playtest result is now sharper: the vignettes will help the player *understand* the F2 formations, but the formations will still feel visually and tactically flatter than Floor 1 — because the enemies don't visibly interact. That's the experiment working as designed.

After that result, Phase 1b.2 is **chemistry propagation, not more dialogue**. The target: make 3 Floor 2 formations achieve the same complete stack as good Floor 1 formations:

> authored composition → readable pre-fight clue (vignette) → actual enemy interaction (chemistry) → multi-actor choreography (existing or new presentation) → tactical consequence

Not ten formations. Three. The three F2 chemistry targets:

1. **`f2-lab-keepers`** — assistant actively stabilizes/augments the failed experiment. The player sees the assistant physically interact with it (move to experiment → treatment VFX → experiment visibly changes). Uses a new `treatAlly` or reused `consumeAlly`-style presentation. The vignette already names the relationship; the combat now proves it.

2. **`f2-armored-archer`** (armored-line family) — front line visibly protects or enables the archers. A guard/intercept relationship (reuses `guardAlly` presentation). The player decides whether to break protection, bypass it, or endure ranged pressure.

3. **`f2-displacer-lab`** — the contrast case: a strongly authored *individual enemy behavior* encounter, not ally chemistry. The Displacer Beast's vanish/blink changes targeting while the eyeball creates a competing priority. Tests whether the choreography vocabulary extends to solo-enemy identity, not just cooperation.

Those three tell whether the Floor 1 formula scales. If yes, the roadmap below propagates it floor by floor.

### Phase 1b.2 — implemented (commit `aeb6e67`)

The three experimental conditions shipped with a deliberate scope correction: **author content on the existing language, don't enlarge it.**

**A. Chemistry gate decoupled.** `chemistryEnabled: tableId === 1` → `chemistryEnabled: true` for all random roaming encounters. The `chemistryId` on individual abilities is the real gate. NPC/Arena/scripted/debug combats still default to `false`. No table-number list to maintain.

**B. `f2-armored-archer` — full chemistry via guard reuse.** New `ARCHER_GUARD` ability (`effect: guard`, `presentation: guardAlly`, `guardTargetIds: ["skeleton-archer"]`). Reuses the complete guard pipeline — AI targeting, resolution, choreography, VFX. Zero new choreography. The `guardTargetIds` check makes it inert in formations without a skeleton-archer.

**C. `f2-lab-keepers` — minimal preferential heal (no new primitive).** Added optional `preferTargetIds` to the `healer` `EnemySpecial`. The healer AI sorts wounded allies with preferred IDs first, then by `currentHp`. Lab Assistant gets `preferTargetIds: ["failed-experiment"]`. No new effect kind, no new presentation, no new choreography. Tests whether a minimal behavioral relationship reads without new engine machinery.

**D. `f2-displacer-lab` — control case, no changes.** Vignette + existing `vanish`/`blink-strike`. Tests whether strong individual enemy identity + vignette is enough without any chemistry.

### The composability finding (discovered during 1b.2 implementation)

Both changes are attached at the **enemy-definition level**, not the formation level. `ARCHER_GUARD` is on `armored-skeleton`, so any formation containing both an armored skeleton and a skeleton archer can express the protection relationship — not just `f2-armored-archer`, but also `f2-armored-orc-archer` and `f2-red-armored-archer`. Likewise, `lab-assistant.preferTargetIds` affects every formation containing both a lab assistant and a failed experiment — `f2-lab-keepers`, `f2-mixed-lab`, `f2-lab-duo`.

This is **better design** than one-off formation scripts. The system is now defining **composable enemy relationships**:

> Armored Skeleton + Archer = protection behavior.
> Lab Assistant + Failed Experiment = caretaker behavior.

A formation becomes interesting because its parts interact according to reusable rules, not because it has a bespoke scripted mechanic. The player can learn these rules through play and arrive at later formations with expectations — "that armor is probably going to cover the archer" — which is **enemy literacy**. This is a far stronger content model than authoring 30 special encounter mechanics.

The most scalable design principle discovered: **two individually understandable T2 relationships can combine into a T3 formation without inventing another mechanic.** If a later formation has both an armored-skeleton/archer guard pair AND a lab-assistant/experiment caretaker pair, the player faces a real dilemma — armor? archer? assistant? experiment? — built entirely from composable species-level rules.

This changes the future chemistry pass from "author 30 special encounter mechanics" to "give enemy species a small vocabulary of composable relationships, then build formations by combining them."

### Playtest protocol (Floor 2)

Run Floor 2. For each of the three encounters, answer:

1. **What did I notice first?**
2. **What did I want to kill first?**
3. **Did anything make me change that plan?** (This is the killer — T3 isn't just listing three strategies, it's when battle state makes you reconsider the strategy you came in with.)
4. **Can I describe what these enemies were doing together afterward?**
5. **Did I learn a reusable rule about these enemies?** (After seeing armored-skeleton + archer once, do you automatically expect the armor to cover the archer next time? If yes, that's enemy literacy — the composable-relationships model is working.)

**T2 is already good combat content.** Not every random encounter needs to be a chess puzzle. A healthy deck contains: straightforward learned relationships (T2) + occasionally conflicting relationships (T3 dilemmas). The target is not "every fight is T3" — it's "enough fights are T3 that the player doesn't settle into autopilot."

## Longer-term roadmap (revised after choreography + composability findings)

The campaign's tactical escalation curve, now that both the choreography vocabulary and the composable-relationships model are understood:

- **Floor 1** teaches chemistry (grab, throw, detonate, guard, pack, overload — all with bespoke animation). Species-level relationships: crypt-minotaur + slime, crypt-warlock + skeleton, crypt-demon-mage + demon-spawn, etc.
- **Floor 2** introduces mixed priority + the first non-F1 composable relationships (armored-skeleton → archer guard, lab-assistant → failed-experiment caretaker). The playtest determines whether these read and whether the composability model scales.
- **Floor 3** introduces chained/industrial interactions. `lesser-construct` and `demon-spawn` already carry chemistry tags but lack the matching casters — giving `rune-knight` a `rune-overload`-equivalent and `demon-mage` a `spawn-bomb`-equivalent reuses the existing `overload`/`detonateAlly` choreography directly. The `f3-werewolf-pack` extends `packStrike` (mark prey, enrage on kill, `howl` behavior shift) — a homogeneous pack should earn the word *pack*. New species relationships: rune-knight + lesser-construct, demon-mage + demon-spawn, hellhound + werewolf.
- **Floor 4** becomes coordinated enemy "composition." The Null Choir is the floor that most deserves enemy-side combinatorics: Cantor begins a phrase → Choristers strengthen it; kill the Cantor → Choir loses coordination; Acolyte applies a condition → Magus cashes it out; Wardens protect whichever singer is "leading." New `choirPhrase`/`crescendo` presentations may be needed, but the choreography extension point is the same `presentation` field. Species relationships: choir-warden → cantor/magus guard, cantor → chorister buff, acolyte → magus condition setup.
- **Floor 5** weaponizes all of it under attrition pressure, leaning on its native cast (Drowned Sentinel, Cistern Wraith, Weeping Revenant, Flood Brute, Undertow Caller) rather than generic-demon padding. Species relationships: undertow-caller → cistern-wraith condition setup, flood-brute → drowned-sentinel guard. Composition work + chemistry, not vignettes.

The future chemistry pass is now understood as: **give enemy species a small vocabulary of composable relationships, then build formations by combining them.** Not 30 bespoke formation scripts. The formations become interesting because their parts interact according to reusable rules the player has learned.

Family vignettes remain useful for identity coverage (`VIGNETTES_BY_FAMILY["armored-line"]` is now populated), but the depth work is chemistry + choreography, not more dialogue.

## Notes for Phase 1b.1 execution

- **Voice consistency:** all new vignettes follow the existing rules in `encounter-vignettes.ts` — 1–2 intros (class-keyed speakers), 2–3 repeat one-liners, optional timed out only where there's a natural "out." The six F1 vignettes are the style reference.
- **The 6 silent `[chem]` vignettes** (`f1-ogre-toss`, `f1-living-shield`, `f1-hunting-pack`, `f1-spawn-bomb`, `f1-rune-overload`, `f1-guarded-bomb`) must *name the mechanic in banter* — the player should understand from the vignette that the warlock is going to eat the skeleton, the mage is going to bomb the spawn, etc. This is the point of authoring them: the T3 dilemma already exists, the vignette makes it visible before the fight starts.
- **The 4 T0 vignettes** (`f1-wraith-pincer`, `f1-gaze-slime`, `f1-flame-forge`, `f1-ghostfire-duet`) name a soft hook to lift T0→T1. They do not create interaction. That's honest.
- **Family vignette for `armored-line`:** populate `VIGNETTES_BY_FAMILY["armored-line"]` with a shared pool. `f2-armored-archer` (w4) and `f2-orc-squad` (w4) both resolve to it. `f2-armored-orc-archer` (w2, deferred) inherits it for free. This is the first use of the family map and the test of whether it prevents content explosion.
