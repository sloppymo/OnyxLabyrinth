# Combat Bark System — Content Audit

Status: **content branch, not integrated into combat**. See `docs/COMBAT-BARK-INTEGRATION-CONTRACT.md`
for what a later integration pass needs to do to actually show these lines in a fight.

**Important discovery, read first:** `origin/main` already ships a small, separate,
*integrated* bark MVP (`src/data/combat-barks.ts` / `src/game/combat-barks.ts`, 10
lines across 3 triggers, wired into `combat-actions.ts`/`combat-enemy.ts`/
`combat-eor.ts`/`combat.ts`) from a 2026-07-26 approved spec
(`docs/superpowers/specs/2026-07-26-combat-dialog-barks.md`). This content library
was built to never collide with it (different directory/file names throughout) and
does not modify anything the shipped system touches. See
`docs/COMBAT-BARK-INTEGRATION-CONTRACT.md` §0 for the full comparison and §1 for
how a later pass should reconcile the two. The "Superseded lines" table below
accounts for the shipped system's existing 10 lines so this audit doesn't silently
omit them.

This document is written in two passes:

1. **Voice bible** (below) — written *before* any line of bark content, one row per production
   combat identity. This is the actual Pass 1 deliverable; everything after it is generated
   against this table, not the other way around.
2. **Coverage / quality audit** (bottom sections) — filled in after content and the audit
   script exist.

## Voice bible

Legend — **mode**: `articulate` (normal language) · `fragmentary` (sparse words/phrases,
does not converse) · `vocalization` (creature noise, rare word exceptions where noted) ·
`silent` (no bark, or asterisk sound-beats only).

### Playable classes

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| Fighter | articulate | practical, low patience, pain-tolerant | the fight over, cleanly | a plan longer than one sentence |
| Mage | articulate | brilliant, physically miserable | to not be hit, ever | "let me melee that" without resentment |
| Priest | articulate | competent, overworked, dryly martyred | everyone to stop needing healing | a sermon |
| Thief | articulate | professional opportunist | the valuables, first | to walk past a chest |
| Halberdier | articulate | methodical, reach-obsessed, formal | distance kept, always | to fight anything at melee range on purpose |
| Duelist | articulate | precise, quietly competitive about form | a clean touch, not a brawl | a flourish speech |
| Crusader | articulate | duty-bound, unshowy faith | the job done, God's will noted in passing | to actually preach |

### Companion

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| fifth-chair (Vess) | articulate | guarded survivor, dry gallows humor | to not bury another party | anything sentimental out loud |

### Enemies — Floor 1 (The Flooded Crypt)

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| training-dummy | **silent / excluded** | n/a — debug-only, `floors: []`, no production encounter references it | n/a | anything (intentionally out of scope, see Coverage) |
| slime | vocalization (rare 1-word exceptions) | harmlessly anxious | to keep being slime | a full sentence |
| skeleton | fragmentary | exhausted, resigned, this has happened before | the shift to end | a bone pun (almost ever) |
| red-skeleton | fragmentary (skeleton base + shiny self-awareness) | same as skeleton, faintly aware it's the "special" one | to be left alone despite the gold | to explain why it's worth more |
| skeleton-archer | fragmentary (quieter than skeleton — back row, focused) | patient, terse | a clean shot | to talk mid-draw |

### Enemies — Floor 2 (The Cursed Library)

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| armored-skeleton | fragmentary (skeleton base, more disciplined) | dutiful, front-line | to hold the line | to break formation verbally |
| orc | vocalization / fragmentary hybrid | eager, simple, pack-loyal | a fight, pack intact | a strategy monologue |
| failed-experiment (Feral Scrivener) | fragmentary | broken academic, feral | quiet, or ink | a coherent sentence |
| acid-puddle | vocalization (bubble/hiss only, no word exceptions) | inert, corrosive | to dissolve something | a single word, ever |
| lab-assistant (Cursed Scribe) | articulate | clerical, bureaucratic about healing | the paperwork of survival filed | to sound warm about it |
| displacer-beast (Shelf Stalker) | vocalization (eerie library-echo sound, no words) | feral, unsettling, patient | to vanish and reappear | to speak |
| eyeball-monster (Gaze Wraith) | fragmentary | unsettling, observational | to have seen enough | to blink first |
| ghostfire | fragmentary | whispery, half-there | warmth it can't have | to raise its voice |
| blood-monster | vocalization | feral, hungry | the next wound | to negotiate |
| blood-wraith | fragmentary | hungry whisper | one more drink | to be seen coming |

### Enemies — Floor 3 (The Forge of Ashes)

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| elite-orc | fragmentary (orc base, terser, veteran) | professional aggression | the kill counted | to explain tactics |
| lesser-construct | silent | inert, mechanical | its next task | anything |
| werewolf | vocalization | predatory, focused | the mark down | to howl a threat in words |
| big-titty-ogre (Hill Ogre) | fragmentary | simple, strong, easily amused by throwing things | something heavy to throw | a complete sentence |
| stone-guardian | silent (rare 1-word exception) | disciplined, immovable | the line held | to explain the order it's holding |
| animated-armor | silent (rare 1-word exception — nobody's home, but Living Shield earns "Fine.") | dutiful, empty | the hit to land on it, not the caster | to sound alive |
| headmasters-echo / -remnant / -ascendant ("The Dead Boy" / "The Lonely Girl" / "The Crying Man") | articulate but sparse, one throughline across all three | a child's grief, echoing and escalating | to be remembered, or to stop being alone | anything long — dread comes from restraint |
| flame-golem | silent | stoked, patient | the forge fed | anything |
| lava-slime | vocalization (slime base, short-tempered from heat) | irritable, hot | to be left alone | to cool off willingly |
| hellhound | vocalization | demonic hound, eager | the hunt | words |
| hellbat | vocalization (sparsest of the flock) | skittish flier | to get one hit and leave | to land and talk |
| black-knight | articulate | grim, disciplined soldier, someone home inside the armor | the duel over on its terms | to boast |
| viper-man (black-knight kit, rare "shiny") | articulate (black-knight base + faint awareness of its own gold value) | same as black-knight, mildly smug about the payout | to be worth the trouble | to explain the poison |
| minotaur | fragmentary | big, simple, direct | something to grab and throw | to narrate the throw |
| warlock | articulate | tired professional occultist | resources, disposable ones | to cackle |
| demon | articulate/fragmentary hybrid | blunt lower demon | the kill | to philosophize |
| demoness | articulate | clinical, efficient, faintly seductive without trying hard | the mess cleaned up | to flirt as a bit |
| ironclad-knight | articulate (black-knight family, colder) | grim professional | the formation intact | to banter |
| rune-knight | articulate | controlled, deliberate | the charge to land | to rush |
| demon-brawler | fragmentary | brutish, short-fused | the next hit in | to plan |
| demon-spawn | fragmentary — spec-mandated sparse single words | small, scared, disposable and knows it | to not be picked | more than three words at once |
| demon-champion | articulate | proud elite commander | respect, or a kill | to grovel |
| demon-mage | articulate | clinical demon caster, treats minions as inventory | the burst to land | to hesitate before spending a Spawn |
| succubus | articulate | bored, seductive, unimpressed | this to be easy | to try hard at the seduction bit |

### Enemies — Floor 4 (The Null Choir)

All five share a liturgical register — clipped, ritual cadence, call-and-response undertones —
differentiated by role.

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| choir-warden | articulate | disciplined front-line zealot | the line held, quietly | to raise its voice |
| discordant-cantor | articulate | unsettling melodic caster | the verse to land wrong on purpose | to sing sweetly |
| null-acolyte | articulate | fanatic, hushed | silence enforced | to explain the doctrine |
| iron-chorister | articulate | heavy undead zealot, aggressive | the charge blessed | to sound gentle |
| choir-magus | articulate | ritual fire caster | the rite completed | to rush the incantation |

### Enemies — Floor 5 (The Weeping Cistern)

| id | mode | baseline | wants | never says |
|---|---|---|---|---|
| drowned-sentinel | fragmentary (heavy, sparse, waterlogged) | inert, waiting | the post held | to explain why it's still standing |
| cistern-wraith | fragmentary | cold, drowned whisper | warmth taken from someone else | to raise its voice |
| weeping-revenant | fragmentary | grief-fragment | to stop weeping | a full sentence |
| flood-brute | vocalization | brutish, waterlogged strongman | something to break | to negotiate |
| undertow-caller | articulate | water-cult priest, intelligent | the tide to answer | to sound uncertain |
| ice-golem | silent | frozen, patient | the frost to hold | anything |

### Scripted uniques — "The Party That Returned" (Floor 1 capstone, `floors: []`)

A ruined four-person party mirroring the player's own Fighter/Thief/Mage/Priest roles.
Written **against** the PC voice profiles above on purpose: same short words the living party
says, hollowed out and wrong.

| id | mirrors | mode | baseline | wants | never says |
|---|---|---|---|---|---|
| ruined-vanguard | Fighter | fragmentary | a Fighter's practicality, worn down to instinct | to protect a line that's already lost | to acknowledge it's dead |
| hollow-knifeman | Thief | fragmentary | a Thief's opportunism, hollowed to hunger | the wounded one | to charm about it |
| ash-scribe | Mage | fragmentary | a Mage's irritation, burnt down to embers | quiet | to cast anything grand |
| drowned-cantor | Priest | fragmentary | a Priest's healing reflex, still firing | to heal someone who can't be healed | to admit it's futile |

## Coverage

See the entity-coverage test (`src/data/combat-bark-library/coverage.test.ts`) for the
machine-checked version of this section — it is derived from `ALL_ENEMIES` / `CLASSES` /
`COMPANIONS_BY_ID`, not hand-maintained, so it cannot silently drift.

- **training-dummy** is the one intentionally-excluded production `EnemyDef`. It has `floors: []`,
  no `abilityIds`, and no reference anywhere in `src/` outside `enemies.ts` and
  `sprite-manifest.ts` — it is bestiary/tooling scaffolding (Arena/debug use), not a combat
  identity a player meets in the campaign. It gets an explicit `silent`/excluded profile with
  zero lines rather than being invented content to hit a quota.
- `ruined-vanguard` / `hollow-knifeman` / `ash-scribe` / `drowned-cantor` have `floors: []` too,
  but are real production content — the scripted "Party That Returned" fight
  (`game/features.ts` `stairsGuardian`) — and are profiled accordingly.
- **55 of 56** production `EnemyDef`s profiled + 1 documented exclusion = full accounting.
  All 7 playable classes profiled. The 1 companion (`fifth-chair` / Vess) profiled.

## Superseded lines (shipped MVP → this library)

The existing `src/data/combat-barks.ts` (10 lines, 3 triggers) is **not modified or
deleted** by this branch. This table exists so this audit doesn't silently omit it.

| Existing line | Speaker | Old trigger | Status here |
|---|---|---|---|
| "Burn, fiend!" | Mage (fire spell) | `beforeSpell` | Not carried forward — violates this library's own tone rules ("Fake Shakespeare" / villain-quip register). Mage's `spellCast` pool has its own fire-flavored lines instead. |
| "Gyaaah!" / "Nnngh!" | any party (heavyHit) | `heavyHit` | Not carried forward as-is (generic, not class-differentiated). Every class has its own `takeHeavyHit` pool instead. |
| "Let this be the last time." | any party (death/KO) | `death` | Not carried forward as-is. Every class has its own `ko` pool instead. |
| "The forge remembers." / "Stay." | headmasters-echo | `beforeSpell` | **Carried forward verbatim** into `spellCast`. |
| "The ash settles." | headmasters-echo | `death` | **Carried forward verbatim** into `death`. |
| "Don't leave." / "Read me." | headmasters-echo-remnant | `beforeSpell` | **Carried forward verbatim** into `spellCast`. |
| "The page turns." | headmasters-echo-remnant | `death` | **Carried forward verbatim** into `death`. |
| "We were kept." / "Listen." | headmasters-echo-ascendant | `beforeSpell` | **Carried forward verbatim** into `spellCast`. |
| "The crying stops." | headmasters-echo-ascendant | `death` | **Carried forward verbatim** into `death`. |

The sections below (Coverage/Trigger distribution/Length distribution/Duplicate audit/Tone
audit/Voice-mode conformance) are machine-generated — regenerate with
`npx tsx scripts/audit-combat-barks.ts` after any content change. Do not hand-edit between
the markers.

<!-- AUDIT:GENERATED:START -->

## Coverage (generated)

| metric | value |
| --- | --- |
| Production EnemyDefs | 56 |
| Enemy profiles | 55 |
| Intentionally-excluded enemies | 1 |
| Missing enemy profiles (should be 0) | 0 |
| Playable classes | 7 |
| Class profiles | 7 |
| Missing class profiles (should be 0) | 0 |
| Companions | 1 |
| Companion profiles | 1 |
| Missing companion profiles (should be 0) | 0 |
| Total bark lines | 852 |
| Lines — enemy | 482 |
| Lines — class (PC) | 336 |
| Lines — companion | 34 |
| Lines tagged to a chemistry moment | 60 |

## Trigger distribution (generated)

| trigger | line count |
| --- | --- |
| combatStart | 123 |
| takeHit | 85 |
| abilityUse | 82 |
| death | 59 |
| rare | 52 |
| lowHp | 45 |
| basicAttack | 43 |
| takeHeavyHit | 42 |
| attackMiss | 37 |
| kill | 35 |
| allyDefeated | 34 |
| chemistrySelected | 24 |
| criticalHit | 22 |
| victory | 21 |
| healed | 17 |
| ko | 17 |
| revived | 17 |
| bossPhase | 16 |
| returningEncounter | 11 |
| healCast | 11 |
| spellCast | 10 |
| chemistryResolve | 10 |
| chemistryTelegraph | 8 |
| allyLowHp | 7 |
| chemistryWitness | 7 |
| flee | 6 |
| chemistryBreak | 5 |
| guardActivated | 3 |
| enemyDefeated | 2 |
| guardIntercept | 1 |

## Length distribution (generated)

| metric | value |
| --- | --- |
| Mean | 11.0 |
| Median | 10 |
| p90 | 19 |
| >28 chars (past the working cap) | 0 |
| >45 chars (past the accepted exception ceiling) | 0 |
| >80 chars (hard-fail threshold) | 0 |

Longest 10 lines:

| chars | speaker | trigger | text |
| --- | --- | --- | --- |
| 28 | Halberdier | takeHit | That's what the line is for. |
| 28 | Duelist | rare | This is a brawl, not a duel. |
| 28 | discordant-cantor | rare | Harmony was never the point. |
| 27 | Halberdier | chemistrySelected | That's a range problem now. |
| 27 | fifth-chair | rare | Further than my last party. |
| 27 | iron-chorister | rare | Gentle was never the order. |
| 26 | Halberdier | rare | This is why range matters. |
| 26 | fifth-chair | victory | Everyone's still standing. |
| 26 | undertow-caller | rare | The deep does not forgive. |
| 25 | Thief | combatStart | Let's get this over with. |

## Duplicate audit (generated)

85 distinct lines reused by more than one speaker; 
71 of those are outside the generic-allow-list (short universal words like "Fine."/"Again."/"No.") and were reviewed by hand.

| line | speaker count | speakers | classification |
| --- | --- | --- | --- |
| Fine. | 12 | Fighter, Priest, Thief, Duelist, Crusader, fifth-chair, skeleton, armored-skeleton, animated-armor, warlock, ruined-vanguard, drowned-cantor | intentional generic |
| Ready. | 10 | Fighter, Mage, Priest, Thief, Halberdier, Duelist, Crusader, skeleton-archer, black-knight, viper-man | intentional generic |
| There. | 10 | Fighter, Priest, Thief, Halberdier, Duelist, Crusader, fifth-chair, skeleton, demoness, succubus | reviewed |
| Hold. | 10 | Fighter, Halberdier, armored-skeleton, stone-guardian, black-knight, rune-knight, demon-mage, choir-warden, drowned-sentinel, ruined-vanguard | intentional generic |
| ... | 10 | slime, skeleton, skeleton-archer, ghostfire, blood-wraith, rune-knight, cistern-wraith, headmasters-echo, headmasters-echo-remnant, headmasters-echo-ascendant | intentional generic |
| Again. | 9 | Fighter, Priest, Thief, Crusader, skeleton, red-skeleton, armored-skeleton, ruined-vanguard, drowned-cantor | intentional generic |
| No. | 9 | Fighter, Mage, Priest, Halberdier, Duelist, Crusader, slime, skeleton, demon-spawn | intentional generic |
| Noted. | 8 | Fighter, Priest, Halberdier, Crusader, lab-assistant, black-knight, viper-man, choir-warden | intentional generic |
| Rude. | 7 | Mage, Thief, skeleton, red-skeleton, warlock, demoness, hollow-knifeman | reviewed |
| Good. | 6 | Fighter, Mage, Priest, Halberdier, Crusader, fifth-chair | reviewed |
| Missed. | 5 | Fighter, Priest, fifth-chair, skeleton, ironclad-knight | reviewed |
| Hold still. | 5 | Fighter, Mage, Priest, skeleton-archer, minotaur | reviewed |
| Hm. | 5 | Fighter, Priest, fifth-chair, skeleton-archer, succubus | reviewed |
| Done. | 5 | Fighter, Mage, Priest, Crusader, fifth-chair | intentional generic |
| Finally. | 5 | Mage, Thief, skeleton, red-skeleton, armored-skeleton | intentional generic |
| Begin. | 5 | black-knight, viper-man, ironclad-knight, demon-mage, choir-warden | reviewed |
| Not again. | 4 | Fighter, fifth-chair, skeleton, headmasters-echo-ascendant | reviewed |
| Thank you. | 4 | Mage, Priest, Crusader, warlock | reviewed |
| Ow. | 4 | Priest, slime, skeleton, armored-skeleton | reviewed |
| *snarl* | 4 | displacer-beast, blood-monster, werewolf, hellhound | reviewed |
| Hnh. | 4 | big-titty-ogre, minotaur, demon, demon-brawler | intentional generic |
| Struck. | 4 | black-knight, viper-man, ironclad-knight, choir-warden | reviewed |
| Forward. | 4 | black-knight, viper-man, ironclad-knight, iron-chorister | reviewed |
| Hexed. | 4 | demoness, succubus, null-acolyte, undertow-caller | reviewed |
| Here we go. | 3 | Fighter, skeleton, red-skeleton | reviewed |
| Thanks. | 3 | Fighter, Thief, fifth-chair | reviewed |
| Next. | 3 | Fighter, Priest, Thief | reviewed |
| Oh. | 3 | Fighter, slime, demon-spawn | reviewed |
| Of course. | 3 | Mage, Priest, skeleton | reviewed |
| Appreciated. | 3 | Priest, Halberdier, Crusader | reviewed |
| Mine. | 3 | Thief, blood-wraith, hollow-knifeman | reviewed |
| Endured. | 3 | Crusader, black-knight, choir-warden | intentional generic |
| Rise. | 3 | Crusader, demon-mage, choir-magus | reviewed |
| Wait. | 3 | slime, minotaur, demon-spawn | intentional generic |
| *grunt* | 3 | orc, big-titty-ogre, flood-brute | reviewed |
| Cold. | 3 | ghostfire, cistern-wraith, ash-scribe | intentional generic |
| Bashed. | 3 | black-knight, ironclad-knight, iron-chorister | reviewed |
| Screen up. | 3 | warlock, demon-mage, discordant-cantor | reviewed |
| Better. | 2 | Fighter, Mage | reviewed |
| Get behind me. | 2 | Fighter, ruined-vanguard | reviewed |
| Naturally. | 2 | Fighter, Crusader | reviewed |
| Of course there's more. | 2 | Fighter, fifth-chair | reviewed |
| You again. | 2 | Fighter, headmasters-echo | reviewed |
| Yeah. | 2 | Fighter, Crusader | reviewed |
| Not ideal. | 2 | Mage, warlock | reviewed |
| Recalculating. | 2 | Mage, rune-knight | reviewed |
| Great. | 2 | Mage, ash-scribe | reviewed |
| As expected. | 2 | Mage, ironclad-knight | reviewed |
| There's more. | 2 | Mage, Priest | reviewed |
| Again? | 2 | Mage, skeleton | intentional generic |
| Fine. FINE. | 2 | Mage, Priest | reviewed |
| Let's begin. | 2 | Priest, warlock | reviewed |
| Damn. | 2 | Thief, Halberdier | reviewed |
| Cleared. | 2 | Thief, Halberdier | reviewed |
| Unlucky. | 2 | Thief, hollow-knifeman | reviewed |
| This job. | 2 | Thief, Crusader | reviewed |
| Positions. | 2 | Halberdier, ironclad-knight | reviewed |
| Clean. | 2 | Duelist, black-knight | reviewed |
| Adequate. | 2 | Duelist, demon-mage | reviewed |
| As ordained. | 2 | Crusader, choir-magus | reviewed |
| Still standing. Barely. | 2 | Crusader, armored-skeleton | reviewed |
| As it should be. | 2 | Crusader, demon-champion | reviewed |
| Back? | 2 | Crusader, skeleton | reviewed |
| Still here. | 2 | fifth-chair, skeleton | reviewed |
| Why. | 2 | slime, weeping-revenant | reviewed |
| *roar* | 2 | orc, flood-brute | reviewed |
| *hiss* | 2 | failed-experiment, acid-puddle | reviewed |
| Ward raised. | 2 | lab-assistant, rune-knight | reviewed |
| Closed. | 2 | lab-assistant, eyeball-monster | reviewed |
| Seen. | 2 | eyeball-monster, null-acolyte | reviewed |
| Nothing. | 2 | elite-orc, iron-chorister | reviewed |
| *low growl* | 2 | werewolf, hellhound | reviewed |
| ...oh. | 2 | big-titty-ogre, minotaur | reviewed |
| Parried. | 2 | black-knight, viper-man | reviewed |
| Hard-fought. | 2 | black-knight, viper-man | reviewed |
| Honorably ended. | 2 | black-knight, viper-man | reviewed |
| Come here. | 2 | minotaur, warlock | reviewed |
| Miscalculated. | 2 | warlock, demon-mage | reviewed |
| Burn. | 2 | warlock, demon-mage | reviewed |
| Irritating. | 2 | warlock, demon-mage | reviewed |
| Unnecessary. | 2 | demoness, succubus | reviewed |
| Now. | 2 | rune-knight, demon-brawler | reviewed |
| Listen. | 2 | discordant-cantor, headmasters-echo-ascendant | reviewed |
| ...finally. | 2 | weeping-revenant, ash-scribe | reviewed |
| More. | 2 | headmasters-echo, headmasters-echo-ascendant | reviewed |

## Tone audit (generated)

No forbidden-phrase matches found in the shipped content.


## Voice-mode conformance (generated)

All `vocalization`/`silent` profile lines are asterisk-actions or <=2 words.


<!-- AUDIT:GENERATED:END -->

## Editorial review (hand-curated aggregate)

The task's "weakest lines" requirement, reported as aggregate findings rather than a
scratchpad dump (the working notes were not preserved) — real fixes made during this branch:

- **Comma sweep:** run twice — once on the initial 675-line library (22 lines, 4
  rewritten: Priest's `ko` line `"...oh, that's ironic."` → `"Ironic."`, the clearest
  case of explaining its own joke instead of trusting the situation; Mage's
  `basicAttack` `"Fine, physically, then."` → `"Fine. Physically."`; two Null Choir
  `death` lines tightened), and again after the content-depth expansion pass added
  ~30 more comma-bearing lines (40 of 852 final, 4.7%). The second pass caught several
  that read as more "written" than their neighbors and cut them to single words in the
  same register: undertow-caller's `"Blind, as the deep is."` → `"Blinded."`,
  null-acolyte's `"Ward, kept."` → `"Warded."`, demon-champion's
  `"Beneath me, but fine."` → `"Beneath me."`. Most held up as natural clipped speech
  ("En garde, I suppose.", "Inelegant, but effective.") rather than padding.
- **Length-cap regression from the expansion pass, caught and fixed:** the content-depth
  expansion (17 articulate enemies + 3 PC classes) introduced 3 lines that crept past the
  28-char working cap (up to 38 chars) — the enforced test ceiling is 45, so these would
  have shipped silently. Caught by re-running the length audit after expansion, not by a
  test failure; all 3 shortened (e.g. demon-champion's `allyDefeated` line
  `"Beneath a champion's notice, that loss."`, 40 chars, → `"A minor loss."`, 13). Final
  library: 0 lines over 28 characters.
- **Mass-duplication diversification:** the first audit run flagged 4 Null Choir enemies
  sharing one identical `takeHit` line with zero variation, and the black-knight/
  ironclad-knight/rune-knight family sharing identical `combatStart`/`takeHit` text despite
  being distinct kits (unlike viper-man, which legitimately shares black-knight's rig per
  `enemies.ts`). Both rewritten — see the two `content(barks):` cleanup commits.
- **Fire-caster overload:** "Burn." was shared verbatim by 5 unrelated fire casters
  (elite-orc, warlock, demon, demon-mage, choir-magus). Diversified to 2 primary hellfire
  users (warlock, demon-mage); the other 3 got distinct verbs (Scorch./Fire./Kindled.).
- **Tone-audit false positive resolved:** the first pass's naive substring match flagged
  "Jesus." for containing "sus". Fixed by switching the tone scanner to word-boundary
  regex (`scripts/audit-combat-barks.ts` / `lint.ts`) rather than deleting a
  spec-mandated gold-standard line.
- **Trigger split-brain resolved:** an early `chemistryVictim` trigger and
  `chemistryResolve` both existed for the same moment (a chemistry payoff landing on its
  target). Every actual victim line (Slime's "nooooooo", Demon Spawn's "Oh.") had already
  landed on `chemistryResolve`; `chemistryVictim` was deleted rather than kept unused,
  after its one user (skeleton/bone-harvest) was moved onto `chemistryResolve`.
- **Remaining duplicate lines** (see Duplicate audit above) are short universal reaction
  words ("Fine.", "Ready.", "There.") or natural shared vocabulary within an intentional
  archetype family (black-knight-kit soldiers sharing "Forward."/"Struck.", curse-casters
  sharing "Hexed."). None were rewritten — see the Duplication policy note in the original
  task brief: this is the accepted pattern, not the suspicious one.

No lines were found to contain internet slang, fourth-wall breaks, Marvel-quip structure,
or fake-Shakespeare filler in either audit pass (tone audit: 0 hits on both runs).

## Iconic moments (hand-curated)

The ~20-30 bark moments most likely to be remembered — chosen for context, not cleverness.
Not all are jokes; some simply define a voice perfectly.

1. **Slime, thrown (Slime Cannon, `chemistryResolve`):** "nooooooo" — the whole joke is that
   nothing else needed to be written.
2. **Skeleton, selected for Bone Harvest:** "No." then "Again?" — undead already tired of dying twice.
3. **Skeleton, party returns after a wipe (`returningEncounter`):** "Back?"
4. **Demon Spawn, selected for Spawn Bomb:** "Not me." / "No." — small, scared, correct.
5. **Demon Spawn, detonating:** "Oh." — no scream, just acceptance.
6. **Mage, catastrophic hit (`takeHeavyHit`):** "Jesus." — the one composure break in an
   otherwise clinical voice.
7. **Minotaur, grabbing the Slime:** "Come here." then "Wait." then "Hah!" — the whole bit told
   in three one/two-word lines.
8. **Thief, obvious trap:** "Probably trapped." (`chemistrySelected`, bone-harvest) — genre
   awareness without saying the word "trope."
9. **Fighter, boss phase transition:** "Naturally."
10. **Priest, healing the same mistake again:** "Again." (healCast, `priest-cure-wounds`)
11. **Vess (companion), ally down:** "No. Not this party too." — the one line where her
    backstory actually surfaces, exactly once.
12. **Warlock, Bone Harvest resolves:** "Thank you." — chilling specifically because it's polite.
13. **Animated Armor, Living Shield activates:** "Fine." — the one word an empty suit of armor
    is allowed all game.
14. **The Dead Boy, low HP:** "Don't." — restraint carrying the dread, not volume.
15. **Ruined Vanguard (dead Fighter-echo), death:** "...still fine." — the exact word the living
    Fighter says, wrong because it's a corpse saying it.
16. **Hollow Knifeman, combat start:** "Mine." — a Thief's opportunism with the wit burned out.
17. **Ash Scribe, take hit:** "Great." — dead Mage sarcasm, same word, no one left to hear it.
18. **Drowned Cantor, heal cast:** "Rest." — a Priest's reflex firing for someone who can't wake up.
19. **Duelist, Ogre Toss:** "Inelegant, but effective." — the one class that would actually judge
    the *form* of a chemistry kill.
20. **Halberdier, Slime Cannon:** "That's a range problem now." — reach-obsession applied to the
    dumbest possible scenario.
21. **Crusader, Bone Harvest:** "A mercy, technically." — dry justification, not a joke.
22. **Rune Knight, chemistry breaks:** "..." — the disciplined caster has nothing to say when the
    plan fails, which says everything.
23. **Demon Mage, chemistry breaks:** "Wasteful." — clinical to the last, doesn't mourn the Spawn.
24. **Companion Vess, rare:** "Not losing another chair." — the game's one sentimental line,
    earned by twenty other dry ones.
25. **The Crying Man, boss phase (3rd threshold):** "There's always more." — the throughline's
    most fractured moment, still not comedic.
