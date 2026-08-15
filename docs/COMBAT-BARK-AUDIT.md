# Combat Bark System — Content Audit

Status: **content branch, not integrated into combat**. See `docs/COMBAT-BARK-INTEGRATION-CONTRACT.md`
for what a later integration pass needs to do to actually show these lines in a fight.

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

See the entity-coverage test (`src/data/combat-barks/coverage.test.ts`) for the machine-checked
version of this section — it is derived from `ALL_ENEMIES` / `CLASSES` / `COMPANIONS_BY_ID`,
not hand-maintained, so it cannot silently drift.

- **training-dummy** is the one intentionally-excluded production `EnemyDef`. It has `floors: []`,
  no `abilityIds`, and no reference anywhere in `src/` outside `enemies.ts` and
  `sprite-manifest.ts` — it is bestiary/tooling scaffolding (Arena/debug use), not a combat
  identity a player meets in the campaign. It gets an explicit `silent`/excluded profile with
  zero lines rather than being invented content to hit a quota.
- `ruined-vanguard` / `hollow-knifeman` / `ash-scribe` / `drowned-cantor` have `floors: []` too,
  but are real production content — the scripted "Party That Returned" fight
  (`game/features.ts` `stairsGuardian`) — and are profiled accordingly.

(Remaining sections — trigger distribution, length distribution, duplicate audit, tone audit,
iconic moments — filled in after content generation and the audit script.)
