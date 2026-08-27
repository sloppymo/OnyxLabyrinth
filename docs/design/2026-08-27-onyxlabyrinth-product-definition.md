# OnyxLabyrinth — Product Definition

**Date:** 2026-08-27

**Status:** Canonical target product definition

**Short authority:** [`../CURRENT-PRODUCT-CONTRACT.md`](../CURRENT-PRODUCT-CONTRACT.md)

**Combat corpus:** [`2026-08-26-card-trial-six-school-system.md`](2026-08-26-card-trial-six-school-system.md)

This document defines the game OnyxLabyrinth is becoming. It supersedes older product assumptions about selectable parties, the external Town loop, classic campaign combat, XP, levels, perks, equipment, gold, consumables, punitive recovery, and random-encounter attrition. Those systems may remain in transitional code until their replacements are proven, but they are no longer product requirements and must not shape new content.

The existing gods/Death/lamp/kept narrative remains canon unless this document explicitly retires a gameplay expression of it. In particular, the century-wipe mechanic is retired even though the deathless world remains canon. A combat retry is a checkpoint abstraction, not another century in the story.

Numbers in this document are the canonical first implementation targets. Normal balance iteration may tune damage, Barrier, enemy HP, Mastery thresholds, and timing without reopening the product. Changing the core loops, progression layers, failure model, fixed protagonists, six schools, or retired-system list requires an explicit contract revision.

---

# Part 1 — One-paragraph game pitch

OnyxLabyrinth is a single-player, first-person labyrinth adventure about two fixed protagonists—Old Man, an impossible occult wizard, and Rat King, a grotesque sovereign of vermin—descending through one enormous, inhabited, spatially impossible dungeon. The player explores authored regions, reads architecture, solves environmental puzzles, meets recurring inhabitants, opens shortcuts, and physically discovers cards in memorable places. Battles use two interlocking character decks, exact enemy intents, Front/Back positioning, summons, delayed magic, control, and visible tactical debts. There are no levels, equipment treadmill, party roster, town commute, or random-combat grind: character growth is the expanding and evolving language of the two decks, while the Labyrinth itself is the world, the reward map, and the campaign.

**One-sentence pitch:** Explore an impossible first-person labyrinth with Old Man and Rat King, find cards in strange places, and build two interlocking decks that reshape a visible battlefield.

**Thirty-second pitch:** The gods left, Death left with them, and the last wish in existence is locked at the bottom of a colossal labyrinth. You descend as Old Man and Rat King, exploring huge bridges, drowned cisterns, folded libraries, settlements, chapels, and impossible chambers. The map itself is the draft: cards come from secrets, puzzles, inhabitants, dangerous optional routes, and authored enemies. In combat, Rat King fills and commands the field while Old Man suppresses, predicts, and destroys; their separate decks cooperate through rows, enemy intents, Opened targets, Rats, Crown, Hush, Omens, Resonance, and Blood Price.

**Player fantasy:** “I am penetrating a huge fucked-up place with two bizarre experts, finding powers that belong to locations, and learning how to make their tactics lock together.”

**Primary genre:** Authored first-person dungeon adventure with tactical deck combat.

**Secondary influences:** Grid-based dungeon exploration, immersive environmental puzzle design, character-driven card games, metroidvania-like shortcuts, and authored CRPG encounters.

**Distinctive qualities:**

- A fixed occult wizard and rat monarch rather than a configurable adventuring party.
- One continuous Labyrinth where services, characters, rewards, and civilization are physical geography.
- Two independent decks acting on an interleaved battlefield rather than one generic party hand.
- The map itself as the principal draft and progression surface.
- Transparent fights about changing consequences, not hidden accuracy or stat checks.
- A small set of states whose interactions create depth instead of a large status catalogue.
- Cheap retries supporting demanding authored encounters and puzzles without replay punishment.

---

# Part 2 — Design pillars

## 1. The Labyrinth is the world

**Definition:** There is no recurring external gameplay town. Refuge, trade, worship, gossip, card work, and civilization exist in rooms the player discovers inside the Labyrinth. Regions connect through loops, lifts, bridges, stairs, chutes, and shortcuts so the place feels continuous even when internal floor IDs remain.

**Supports it:** Physical taverns and chapels, recurring NPCs, giant landmarks, refuge travel anchors, quiet cleared routes, region-to-region sightlines, and shortcuts that collapse distance.

**Violates it:** A menu town between expeditions, mandatory post-fight commuting, abstract facility lists, or services that teleport the player out of the dungeon fiction.

## 2. Exploration is progression

**Definition:** Turning a corner should reveal a useful route, a clue, a character, a spectacle, a card, a traversal tool, or a changed understanding of the world. Exploration is not downtime between random fights.

**Supports it:** Authored card locations, optional danger, spatial puzzles, landmarks, secrets, map notes, traversal discoveries, recurring environmental characters, and meaningful alternate routes.

**Violates it:** Empty corridor mileage, generic loot rolls, grind routes, mandatory key-color chains, or encounter frequency that repeatedly erases the player's spatial train of thought.

## 3. Cards are character growth

**Definition:** The main power curve is finding cards, choosing the active twelve for each protagonist, mastering physical card instances, and selecting a small number of rule-changing keystones. Broader possibility replaces stat inflation.

**Supports it:** Functional card branches, cross-school deck construction, cards with memorable locations, and bosses that can be approached through different engines.

**Violates it:** Levels dominating damage, gear obsoleting cards, perk trees duplicating card choices, or currencies that merely delay access to already-found power.

## 4. The duo is one instrument

**Definition:** Old Man and Rat King retain separate turns, decks, resources, and identities, but alter one shared battlefield. Each setup state is useful to its owner before the other protagonist exploits it.

**Supports it:** Shared Opened and Break states, Rat-created hit geometry, Crowned intent routing, Omens that Rat King can fulfill, Hush that protects Blood Price, and partner-dead legal lines.

**Violates it:** Shared-energy soup, partner Assist prompts, a designated “support” hero, setup cards that are blank without the partner, or two solitaire decks whose only link is total damage.

## 5. Read the threat; reshape the consequence

**Definition:** Enemy actions, targets, damage, and special conditions are exact before the player commits. Difficulty comes from choosing among defense, movement, interruption, target priority, delayed effects, and risk—not from guessing hidden intent or missing on an accuracy roll.

**Supports it:** Persistent exact intent rails, post-Barrier HP forecasts, Break thresholds, deterministic targeting arrows, clear trigger order, and boss actions that expose their special rules.

**Violates it:** Hidden/random intents, opaque percentages, unexplained immunities, preview/resolver disagreement, or animations that conceal the tactical result.

## 6. Small vocabulary, deep interactions

**Definition:** A player should read the important battlefield in roughly one glance. Depth comes from statuses modifying actions and each other, not from twenty-five variations of poison and vulnerability.

**Supports it:** Fixed homes for Hush, Crown, Opened, Rats, Omen, Resonance, and recoverable HP; card keywords that transform those states; strict caps and recursion breakers.

**Violates it:** Redundant buffs, multiple shield nouns, generic combo meters, hidden counters, or every school receiving a proprietary builder/spender meter.

## 7. Failure teaches rather than punishes

**Definition:** Loss should invite another plan, not demand repetition of solved exploration. Battles and puzzles may be demanding because retry cost is low and information is trustworthy.

**Supports it:** Pre-encounter checkpoints, instant retry, deck editing on defeat, full ordinary post-fight healing, local puzzle resets, and no consumed permanent resources.

**Violates it:** Corpse recovery, gold loss, item farming, century resets, long corpse runs, random reward rerolls through save friction, or replaying cleared routes after a boss loss.

---

# Part 3 — Final core loop

| Scale | Player activity | Intended result |
|---|---|---|
| **Second to second** | Step, turn, look, compare landmarks, read a wall or intent, select a card, choose a target, move Front/Back, inspect a state. | Every input changes spatial understanding or a visible tactical plan. |
| **Minute to minute** | Enter a space, identify its landmark or threat, choose a route, interact with an object/NPC, bypass or engage a visible encounter, solve a local clue. | The player continually learns what this place is and what the duo can do here. |
| **Twenty minutes** | Explore a connected branch, fight one or two authored battles, find or evolve a card, make progress on a puzzle/thread, and open or glimpse a shortcut. | A complete adventure beat with exploration, tactics, and a durable change. |
| **Region scale** | Establish a refuge/landmark, penetrate hostile subregions, acquire 8–12 meaningful card instances, gain one traversal or rules discovery, close two or more loops, solve a set piece, defeat a miniboss or boss. | The region changes from unknown danger into understood geography while the decks gain a new identity. |
| **Campaign scale** | Cross five connected regions, repeatedly reconfigure two decks, discover the Labyrinth's inhabitants and folded geography, defeat the kept, reach the bottom, and make the wish. | Mastery of place and mastery of the duo converge. |

The canonical high-level flow is:

```text
Title
  ↓
Prologue
  ↓
Labyrinth entrance
  ↓
Kept Gate
  ↓
Abyss bridge + Face
  ↓
First physical refuge
  ↓
Explore → discover → fight → reconfigure → open shortcut
  ↓
Deeper connected region
  ↓
The bottom
```

There is no required `Dungeon → Town → Dungeon` loop. Returning to a refuge is an occasional geographic choice, not the completion step after every excursion.

---

# Part 4 — Player progression

## Final progression architecture

The combat-build complexity budget contains exactly three layers:

1. **Card collection and two active decks.**
2. **Branching Mastery on physical card instances.**
3. **One equipped keystone per protagonist.**

Permanent traversal discoveries are a fourth campaign-facing category, but they expand the map rather than combat power and are not a build layer.

| System | Final decision |
|---|---|
| Character XP | **No.** |
| Character levels | **No.** |
| Max HP growth | **No.** Old Man and Rat King remain at 40 max HP. |
| SP/mana | **No.** Three Energy per hero turn plus fight-local character instruments are sufficient. |
| Active decks | **Exactly 12 cards per hero.** |
| Collection | Character-specific, persistent, no size limit. |
| Duplicate limit | At most two instances of one card definition in an active deck. |
| Card destruction | **No.** Moving a card to the collection is the removal system. |
| Permanent card loss | **No.** |
| Card upgrades | One functional A/B evolution per physical instance through Mastery. |
| Keystones | Rule-changing, non-card school doctrines; one active per hero. |
| Traditional equipment | **No.** |
| Relics/charms | **No at launch.** Deferred only if card/keystone playtests reveal a missing reward class. |
| Gold | **No.** |
| Ordinary inventory | **No.** |
| Consumables | **No.** |
| Puzzle/key objects | Yes, automatically recorded and never sold, dropped, or equipped. |
| Traversal tools | Yes, few, authored, permanent, and used contextually. |

## Active deck and collection rules

- Old Man and Rat King each own a separate persistent collection and an exact 12-card active deck.
- A hero can include only that hero's cards, but may freely mix all three of their schools.
- School is a tag and mechanical identity, not deck legality. A starting school is not selected.
- The active deck may contain at most two physical instances of one definition. Different instances can have different Mastery branches.
- Deck editing is available on any safe exploration tile while no encounter, modal puzzle resolution, or gauntlet fight is active. The player does not need to commute to a refuge to replace a card.
- Boss antechambers, refuges, and gauntlet entrances are always safe deck-edit/checkpoint spaces.
- There is no sideboard size limit and no cost to swap a card.
- Cards cannot be sold, destroyed, or permanently consumed.
- Generated cards are absent at launch. If later added, they exist only for the current fight, grant no Mastery, and disappear afterward.

## Starting decks

The opening decks deliberately teach only Hush, Rats, Opened cracks, Barrier, and movement. Crown, Omen, Resonance, and Blood Price arrive as guaranteed physical discoveries across the first hour rather than as a vocabulary dump in fight one.

**Old Man — 12 cards**

- 2× **Cinder Word** — simple damage plus Hush.
- 2× **Ashen Ward** — dependable Barrier.
- 2× **Staff** — direct Astral-tagged foundation damage.
- 2× **From Afar** — modest Back-row offense/defense.
- 2× **Appointment Kept** — a complete attack whose Omen rider becomes relevant later.
- 2× **Parting Blow** — damage plus printed movement to Back.

**Rat King — 12 cards**

- 2× **Litter the Floor** — damage plus a Ready Rat.
- 2× **Nip** — direct Brood-tagged foundation damage.
- 2× **Open the Rank** — multi-hit Opened construction.
- 2× **Nest Underfoot** — Rat creation plus Barrier.
- 2× **Royal Guard** — complete defense before Crown is discovered.
- 2× **Lunge** — damage plus printed movement to Front.

Foundation-simple cards still carry a school tag and may remain useful; they are not a seventh “basic” school.

## Card acquisition

Cards are physical discoveries first and post-fight abstractions second. The normal campaign distribution is:

| Source | Share of card discoveries | Rule |
|---|---:|---|
| Exact authored world locations | 45% | Named chests, altars, observatories, corpses, strange objects, and visible dangerous routes. |
| Puzzles and secrets | 20% | The card is the payoff for understanding a place. |
| Minibosses, bosses, and unusual combat outcomes | 15% | Authored card/signature, never a routine random three-choice after every fight. |
| NPC favors and one-time trades | 10% | Named exchange or consequence, no universal currency. |
| Seeded curated caches | 10% | Two cards from a small regional pool; the seed is persisted before reveal. |

Routine battles do not automatically produce a random card screen. They may clear access to a physical cache or count toward Mastery. A card should usually retain a remembered place or event.

The first hour contains exactly six guaranteed new card instances—three per hero—spaced across exploration, a puzzle, an NPC/refuge interaction, and one combat reward. The intended first-hour advanced introductions are **A Death Foreseen**, **Star Lance**, and **Three Knocks** for Old Man; **Kneel**, **Bite the Hand**, and **The King Points** for Rat King. Their order is level-authored so the player learns one new instrument at a time.

A normal critical-path playthrough finds roughly 36–42 of the 60 unique school definitions; a curious playthrough finds 45–52; a completionist can obtain all 60. No definition is permanently lost to RNG. A card declined at a seeded cache enters Isobel's “seen formula” backlog; after each region climax, she can reproduce one previously seen but untaken definition. That delay preserves a choice without turning it into permanent save-file regret.

## Mastery

Mastery replaces card XP and applies to each physical card instance.

- After a **victory**, an instance gains 1 Mastery if it was successfully played at least once in that battle.
- An instance gains at most 1 Mastery per battle. Long bosses do not power-level a card.
- Failed or abandoned attempts grant no Mastery. Retry cannot be used as a farm.
- Omen cards qualify when Foretold; their later automatic resolution grants nothing extra.
- Rat bites, Opened fractures, keystones, copies, and triggered effects never grant Mastery.
- Initial evolution targets are Common 3, Uncommon 4, Rare 5, Signature 6 victories.
- At the threshold, the player sees two complete functional branches. Selection occurs after combat or later from the deck screen.
- Each instance has one evolution tier. Upgrades change trigger, geometry, resource policy, cost, movement, or state transformation; they are not simple `+2 damage` levels.
- The active branch can be changed at a discovered refuge or boss antechamber. It cannot be toggled mid-fight or mid-gauntlet. Duplicate instances may carry different branches simultaneously.
- Mastery and branch state persist for the campaign. Arena/Challenge play grants no campaign Mastery.

This model rewards using cards without creating character levels, encounter farming, or irreversible whole-campaign traps.

## Keystones

Keystones are school doctrines: persistent rules displayed beside a protagonist's instrument, never shuffled into the hand.

- Each protagonist may equip exactly one keystone.
- Keystones are found at authored shrines, boss outcomes, NPC threads, and major secrets—not earned by XP.
- A normal playthrough unlocks three or four per protagonist; a completionist can find more.
- Keystones may be swapped at any refuge or boss antechamber, with no fee.
- Keystones encourage a school or bridge two schools but never prohibit off-school cards.
- No second keystone slot unlocks later. More passive slots would recreate a perk tree.

Examples include **Ashen Palimpsest** (departing Hush creates a crack), **The Second Hand** (a constrained second Omen slot), **Broken Orrery** (partial Resonance cash-out while Barrier still burns), **Every Crack Is a Nest** (first Opened each round summons a Rat), **The Crown Walks** (Crown transfers after a subject dies), and **The Debt Collector** (properly negating a Crowned intent Devours recoverable HP).

## Traversal progression

Traversal tools are rare, permanent, and contextual. They are not cards, equipment slots, or consumable inventory. The target campaign uses three major traversal discoveries:

1. **A light/seeing instrument** that reveals hidden seams, inscriptions, and safe footing in authored darkness.
2. **A water/raft instrument** that controls or survives specific currents and opens horizontal/vertical water routes.
3. **A resonance/bell instrument** that activates distant mechanisms and exposes folded relationships between regions.

Exact fiction may change during level authoring. Their product rules may not: each opens several old and new routes, is used from the world rather than a menu, and is never required to make a particular active deck legal.

## Why the old layers are removed

| Removed system | Why it is redundant or harmful | Replacement |
|---|---|---|
| XP and levels | Encourage grind and make numbers, not understanding, solve fights. | Cards, Mastery, keystones, player knowledge. |
| HP/SP growth | Obscures exact combat arithmetic and duplicates Energy/resources. | Fixed 40 HP; three Energy; fight-local instruments. |
| Perk trees | Duplicate branch decisions already carried by cards and keystones. | One card evolution and one keystone slot. |
| Spell learning | Separates Old Man's identity into another menu/resource corpus. | Old Man cards are his magic. |
| Equipment/weapons/armor | Makes fixed protagonists statistically interchangeable and adds comparison maintenance. | Authored card rules and fixed visual identity. |
| Gold | Would exist mainly to delay cards/services and invite farming. | Discovery, favors, and authored one-time services. |
| Ordinary inventory | Adds item-instance bookkeeping unrelated to the new loop. | Card collection plus automatic key-object journal. |
| Consumables | Conflict with cheap retry and create hoarding/save-reload contradictions. | Battle-local defense, full ordinary recovery, checkpoint retry. |
| Persistent buffs/status attrition | Reintroduce commuting and maintenance. | Fight-local state; explicit gauntlets only. |
| Relic slots | Cards and keystones already provide enough build axes. | Deferred, not assumed. |

---

# Part 5 — Combat system

## Campaign combat contract

“Card Trial” is no longer a campaign fiction or a second combat mode. Its rules become **combat**. The Arena may preserve the name internally during migration, but player-facing campaign copy never calls a battle a trial.

Combat uses the existing battlefield presentation: enemies on the left, Old Man and Rat King on the right, live sprite choreography, exact intent information, and visible Front/Back separation. Both Canvas and Phaser may continue to paint the same rules state, but there is one resolver and one forecast contract.

## Initiative and turns

- Default round order is Rat King → fast enemies → Old Man → slow enemies.
- Bosses and authored encounters may change actor order visibly; no initiative roll exists.
- At a hero's turn start, that hero's expiring Barrier clears, five cards are drawn, and Energy becomes 3.
- The player plays cards sequentially, may use paid Move once, then Passes. Unplayed cards discard and Energy becomes 0.
- Empty draw piles shuffle their discard piles using the gameplay RNG stream.
- The partner has no hand and spends no Energy during the acting hero's turn.
- There are no reaction windows, shared Energy, partner borrowing, or instant-speed interrupts.

## Actions

The complete baseline action set is:

- Play a card.
- Spend 1 Energy on **Move** once that hero turn.
- Inspect any card, actor, intent, or instrument.
- Pass.
- Retreat/restart from the pause surface. Retreat grants no Mastery or reward and restores the pre-encounter checkpoint.

There is no separate Attack, Spell, Item, Technique, Defend, or Flee command. Those functions are cards, Move, Barrier, or Retreat.

## Front and Back

- Rat King starts Front; Old Man starts Back. They may share a row.
- Paid Move changes only the active hero's row, costs 1 Energy, and is available once per turn.
- Card-printed movement costs no extra Energy and does not consume paid Move.
- Enemy intents name a row, both rows, or a specific hero. Target arrows and post-Barrier HP update before confirmation.
- A row attack misses if that row is empty and then advances normally.
- If one hero occupies the row, that hero is hit. If both occupy it, the lowest-current-HP hero is hit; ties go to the most recent entrant.
- Enemy formation rows remain visual/authoring information. Ordinary player single-target cards may target any living enemy unless their text says otherwise. The game does not add a second reach grid.

## Draw, discard, and card zones

- Each hero has a 12-card draw pile, discard pile, five-card hand, and any explicit special zone.
- The only launch special zone is Old Man's single Foretold/Omen slot.
- There is no retain, hand manipulation package, discard trigger package, zero-cost cantrip, Energy refund, or generic Expend/Exhaust keyword at launch.
- A three-Energy signature consumes the whole normal turn. Most cards cost 1; 2-cost cards are commitments.
- A card can produce triggered effects, but triggered effects never count as card plays and cannot recursively create another full automatic volley.

## Exact shared vocabulary

The battlefield uses seven shared tactical concepts and four character instruments. No new generic status enters the launch game without removing or consolidating another.

| Visible concept | Exact job | Fixed UI home |
|---|---|---|
| **Front / Back** | Hero positioning and hostile target geometry. | Actor ground lanes and intent arrow. |
| **Barrier** | Temporary damage absorption; clears at that hero's next turn. | Blue segment/value beside HP. |
| **Intent** | Exact next action, target, numbers, traits, and post-Barrier consequence. | Enemy intent plate, always visible. |
| **Break** | Damage deadline attached to one current intent; reaching it cancels that intent only. | Meter beneath that intent. |
| **Opened** | Singleton target made by three cracks; grants one fracture hit per hero turn and may be consumed. | Three cracks / gold fracture on enemy plate. |
| **Hush** | Old Man's capped reduction of the next intent's numerical packets. | Up to three pips on the intent. |
| **Crowned** | Rat King's singleton subject; routes eligible intent targeting and Rat attention. | Crown plus target line on enemy plate. |
| **Rats** | Up to three Ready/Spent subject tokens; finite commands and one grouped end-turn volley. | Three brood sockets split by row. |
| **Omen** | One visible delayed card waiting on a public condition. | Physical card above Old Man's hand. |
| **Resonance** | Old Man's 0–5 held alignment: future Barrier, threshold access, or Overchannel fuel. | Five-point constellation by Old Man. |
| **Recoverable HP** | The portion of Rat King's Blood Price loan he can earn back through Devour. | Striped segment inside his HP bar. |

**Seal** is a binary Hush modifier, not a new meter: it blocks enemy Barrier and causes only one Hush to clear after the next action. **Magnitude**, **Overchannel**, **Devour**, **Foretell**, **Recall**, **Consume Opened**, **Command**, and **Decree** are card verbs/traits, not additional stored resources.

The final game has no generic poison, burn, blind, paralysis, regeneration, buff, debuff, affinity, armor-class, or elemental-resistance icon layer unless a later contract deliberately trades something out. Enemy special behavior should live primarily in exact intent text.

## Opened

- Every positive player-controlled damage packet adds one crack to a non-Opened target for the current round.
- Three cracks create the one Opened target. Opening another target moves the marker and clears the former crack track.
- Cracks reset at round end; Opened itself persists until moved, consumed, or its target dies.
- The first played card from each hero turn that damages a target already Opened gains a final separate 2-damage fracture hit.
- Becoming Opened during a card does not retroactively grant that card's fracture.
- `Consume Opened` performs the printed transformation if the target survives the base sequence, then removes the mark.
- Opened has intrinsic value even if no payoff card arrives; it is never just a token waiting for Old Man.

## Break

- An authored current intent may expose `Break N`.
- Actual HP damage from either hero, Rats, Omens, fractures, and other attributed effects advances it.
- Reaching N marks only that intent Broken. At its slot, none of its effects resolve and it advances normally.
- Progress resets when the intent advances or changes and never spills into the next action.
- Normal encounters show at most one Break meter at once. Bosses expose at most one Breakable beat per cycle and never on consecutive beats.
- Break grants no Energy, draw, stun, or separate reward.

## Hush and Seal

- Hush stacks to 3.
- Each stack reduces every reducible numeric packet in the enemy's next intent by 2, to a floor of half that packet rounded up.
- Reducible packets are damage, Barrier, and healing; it does not erase targets, movement, summons, or other rule text.
- After the enemy completes its action, all Hush normally clears. A Broken action still counts as completed.
- Seal lasts through that action, blocks enemy Barrier, causes only one Hush to clear, and then expires.
- Bosses use the same rules. The half-value floor prevents permanent shutdown without immunity text.

## Rats

- Rat King controls at most three Rats, each Front or Back and Ready or Spent.
- Rats have no HP, hand, Energy, initiative, equipment, or ordinary enemy targeting.
- A summoned Rat enters Ready on Rat King's row.
- At Rat King's turn start, existing Rats Ready.
- Printed **Command** effects use Ready Rats as stated and normally leave them Spent.
- At Rat King's turn end, every Rat still Ready makes one 1-damage Brood bite without becoming Spent. It prefers the Crowned enemy; otherwise it uses Rat King's most recent legal target when row rules allow.
- Summoning at cap Readies one Spent Rat; if all three are Ready, Rat King gains 2 Barrier. A summon is never blank.
- Consuming a Rat removes it. Only text that explicitly cares about removal treats that event as a trigger.
- The grouped volley is one presentation with separate mechanical hits and can never schedule another Brood volley.

## Crowned and Decrees

- Exactly one living enemy may be Crowned. Crown persists until moved or the subject dies.
- Its eligible single-target intent retargets Rat King and updates the forecast immediately.
- Rats prefer the Crowned target regardless of row.
- Row-wide, already-named, and explicitly Sovereign intents cannot redirect. If their owner is Crowned when they resolve, Rat King receives 2 Barrier as tribute.
- Bosses are Crownable; particular Sovereign actions resist only the redirect axis.
- A Decree is a card trait that can trigger authored effects. It is not a stored resource.
- Crown grants no universal bonus damage.

## Omen

- Old Man has one Foretold slot.
- Paying and playing a Foretell card resolves its immediate text, then parks the physical card in that slot and begins watching its exact public condition.
- When fulfilled, the Omen leaves the slot first, then resolves for no Energy after the triggering action and before the next actor.
- Every Omen supplies immediate Foretell value or a useful While Foretold effect.
- If the slot is occupied, another Omen may use only its immediate Invoke/Foretell text and discard; it cannot silently replace the existing card.
- At Old Man's turn start, the player may Recall the current Omen for free once.
- If its bound target dies before another condition, the Omen fizzles and Old Man gains 2 Barrier.
- Omen damage contributes to cracks and Break but receives no Opened fracture and grants no Mastery on trigger.

## Resonance, Magnitude, and Overchannel

- Resonance is 0–5 and lasts only for the fight.
- At Old Man's turn end, held Resonance grants equal Barrier without being spent.
- Gaining Resonance at 5 converts each excess point into 2 immediate Barrier.
- Resonance does not passively add damage. Cards care about held thresholds or offer Overchannel.
- `Magnitude N` checks the card's exact previewed damage sequence, including its one Opened fracture, and performs one qualitative rider if N is reached.
- `Overchannel` is an option printed on specific cards: remove all Old Man Barrier, spend the stated/all Resonance before resolution, and change hit count, target geometry, piercing, Break, or another qualitative property.
- It is not a stance, separate action, or second mana pool.

## Blood Price and Devour

- `Blood Price N` is an optional Rat King card rider. Paying bypasses Barrier, cannot reduce him below 1 HP, and enables a qualitatively different line.
- Paid HP becomes a visible recoverable segment.
- Any later unblocked hostile HP damage erases the same amount of recoverable potential in addition to dealing its normal damage.
- `Devour N` restores only recoverable HP, never ordinary missing HP.
- Rat King's first enemy kill with a played card each turn Devours 2, providing an engine-independent recovery floor.
- Every Blood Price card has a complete safe form. Paying is sometimes wrong and must be forecast against shown enemy actions.

## Summons

Rats are the only systemic player summon family at launch. Authored guest actors may appear in a particular battle, but they do not create a collection, deck, equipment, or command subsystem. Old Man's Grave Host remains a possible future expansion only after the six-school vocabulary proves readable.

## KO, victory, and battle cleanup

- At 0 HP, a hero is knocked out and their future turns are skipped.
- Existing Crown remains but no longer redirects or pays tribute if Rat King is down. Existing Rats remain but do not Ready or volley without his turn. An already-Foretold Omen remains armed and may still resolve after Old Man falls.
- The surviving protagonist may finish the battle alone; every active deck must retain legal partner-dead lines.
- Victory immediately restores both heroes to 40 HP after the result presentation, clears KO, Barrier, Hush, Seal, Opened, Break, Crown, Rats, Omen, Resonance, and recoverable HP, awards eligible Mastery/rewards, and returns to the exact exploration state.
- If both heroes reach 0, the pre-encounter checkpoint is restored. Exact retry rules are in Part 13.

## Trigger safety

- A named automatic effect resolves at most once per root action unless explicitly round-gated.
- One Opened fracture per hero turn.
- One Omen resolution per slot per root event.
- Triggered effects never create another Brood volley.
- The trigger queue has a test assertion ceiling of 32 events. Reaching it is an engine defect, never silent truncation.
- Resolver, forecast, simulator, telemetry, Canvas, and Phaser consume the same order of operations.

---

# Part 6 — Old Man

## Baseline identity

Old Man is an occult wizard, destroyer, controller, and prophet. His three verbs are:

1. Stop things from happening.
2. Make things happen later.
3. Make catastrophically powerful things happen now.

He is not a conventional mana caster. His hand is his spellbook; Energy is his action budget; Hush, Omen, and Resonance are three different relationships with an enemy's future.

## Combat profile

| Axis | Old Man |
|---|---|
| Defense | Prevents exact incoming value with Hush, generates Barrier through wards and held Resonance, and wins time through Omen/Break. |
| Damage | Largest single hits, selective area damage, delayed free casts, Magnitude thresholds, and rare catastrophic cash-outs. |
| Movement | Starts Back. Uses retreat/reposition cards to preserve geometry; enters Front for a deliberate threshold or final commitment, not as his default. |
| Weakness | No ordinary HP healing, fewer cheap hit packets, vulnerable after Overchannel, and can clog his one Omen slot with a bad prophecy. |
| Solo floor | Direct attacks, Barrier, Hush, Recall, and self-created Opened/Break routes remain legal if Rat King is down. |

## Ashen Silence

**Fantasy:** Sound, magic, and intention turn to ash before they complete.

**Primary rule:** Hush alters exact numerical consequences immediately; Seal changes its decay and denies Barrier.

**Decision loop:** Apply Hush for prevention, preserve it through an action, convert some of it into Break/hits, or cash it out for a final word. A good Silence hand asks how much quiet to keep, not merely how fast to reach three stacks.

**Failure:** Over-suppressing a harmless action, spending all Hush before a dangerous beat, or using a whole-turn spell on an intent ordinary damage could already Break.

## The Last Hour

**Fantasy:** The outcome has already been written; the battlefield has not caught up.

**Primary rule:** One physical Foretold card waits in public for a condition Rat King or Old Man can engineer.

**Decision loop:** Foretell for immediate value, bind a credible event, plan around initiative, decide whether to fulfill or defer it, and Recall/force a prophecy that became wrong.

**Failure:** Binding a target that dies too early, parking an unlikely condition, or triggering the right effect at the wrong time. The fizzle Barrier and free Recall make these recoverable mistakes rather than dead-deck disasters.

## Astral Conduit

**Fantasy:** The room becomes an impossible astronomical instrument and then collapses.

**Primary rule:** Resonance is valuable while held, enables Magnitude lines, and can be sacrificed with Barrier through Overchannel.

**Decision loop:** Generate Resonance through useful spells, retain it for recurring defense/thresholds, use Opened and Break to cross qualitative Magnitude values, then choose the one cash-out whose exposed aftermath is survivable.

**Failure:** Spending into overkill, losing a vital Barrier buffer, sitting at cap with no meaningful line, or missing a threshold because target mitigation was read incorrectly.

## Signature card set

These are representative identity anchors, not the complete 30-card Old Man corpus.

| Card | School | Core text/role |
|---|---|---|
| **Cinder Word** | Ashen Silence | Deal 3; Hush 1. The simple control floor. |
| **Cut the Chant** | Ashen Silence | Convert any chosen amount of Hush into Break progress or separate hits. Preserve-versus-spend in one card. |
| **Final Word** | Ashen Silence | Competent base hit, then convert removed Hush into a multi-hit finish. |
| **The Bell Is Gone** | Ashen Silence | Whole-turn Hush 3 + Seal sentence; Break a Spell intent. |
| **Three Knocks** | The Last Hour | Foretell a visible three-card countdown that either protagonist can complete. |
| **A Death Foreseen** | The Last Hour | Barrier now; automatic damage when the bound enemy becomes Opened. The canonical Rat King handoff. |
| **Already Dead** | The Last Hour | While-Foretold defense plus a visible low-HP execution threshold. |
| **Star Lance** | Astral Conduit | Plain hit whose Magnitude threshold becomes a Resonance engine when Opened contributes its fracture. |
| **Falling Heaven** | Astral Conduit | A whole-turn catastrophic spell whose threshold adds a piercing second strike. |
| **Collapse the Constellation** | Astral Conduit | Safe area hit or Overchannel that turns every held Resonance into a separate wave while burning all defense. |

## Likely keystones

- **Ashen Palimpsest:** when Hush leaves an enemy, give it one crack once per enemy per round. Control becomes future Opened setup.
- **The Second Hand:** gain a constrained second Omen slot; only the leftmost Omen may resolve from one root event. This is advanced and should unlock late.
- **Broken Orrery:** when Overchanneling at high Resonance, spend exactly three instead of all, but still remove all Barrier. It changes resource policy without erasing risk.
- **The Unfallen Heaven:** decline the first Magnitude rider in a turn to gain Resonance instead. Present payoff competes with future engine value.

## School-crossing examples

- Cinder Word's branch can gain Resonance against Opened, turning Rat setup into future defense rather than only damage.
- A Hushed enemy acting can fulfill an Omen and reveal a new intent that remains partially Hushed through Seal.
- An Omen may generate Resonance or trigger on Overchannel, placing a delayed cast inside an Astral sequence.
- Falling Heaven can Break an intent rather than merely race HP, creating Rat King's later safe Blood Price window.
- Parallax can trigger a movement Omen while changing an exact hostile target and generating Resonance only when the move mattered.

---

# Part 7 — Rat King

## Baseline identity

Rat King is a grotesque wizard-king whose body, subjects, appetite, and authority are one kingdom. His three verbs are:

1. Fill the battlefield with subjects.
2. Command the battlefield as a sovereign.
3. Consume his kingdom, body, or safety for power.

He is not “the rogue” or a pet class. Rats are finite tactical action inventory; Crown makes the battlefield acknowledge his authority; Blood Price turns his own future health into a visible loan.

## Combat profile

| Axis | Rat King |
|---|---|
| Defense | Barrier from subjects and royal attention, deliberate intent redirection, and recoverable self-payment. |
| Damage | Many small packets, commands, target construction, opportunistic finishers, and risky transformed actions. |
| Movement | Starts Front and profits from staying there, but uses movement to reroute intents, carry brood geometry, or protect a health loan. |
| Weakness | Can exhaust Ready subjects, Crown the wrong threat, accept more pressure than Barrier can cover, or lose recoverable HP before Devouring it. |
| Solo floor | Every summon/command has a no-Rat fallback, Crown has tribute/target value, and every Blood Price card has a complete safe mode. |

## Broodcraft

**Fantasy:** Every crack, sleeve, and floorboard contains another subject.

**Primary rule:** Up to three Rats exist as Ready/Spent, rowed, finite bodies that naturally contribute an end-turn bite.

**Decision loop:** Create useful bodies, decide which to Command now, which to preserve for the Brood volley, which to move, and which to consume for a different shape of value.

**Failure:** Spending every Rat early, splitting them from useful row/target geometry, or liquidating the board into overkill.

## Crown of Dominion

**Fantasy:** Combat itself accepts a filthy constitutional order.

**Primary rule:** One Crowned subject redirects eligible intent attention to Rat King, focuses Rats, and enables Decrees; Sovereign resistance pays tribute rather than blanking the school.

**Decision loop:** Crown the threat whose action/death matters, re-read the changed forecast, choose whether to absorb, Hush, Break, or redirect it, and move Crown when another subject creates a better event.

**Failure:** Protecting Old Man by making Rat King lethal, leaving Crown on an irrelevant target, or spending authority on a target that will die before the planned Omen.

## The Starving Crown

**Fantasy:** Borrow health from the future and eat a path back to it.

**Primary rule:** Optional Blood Price produces recoverable HP; successful tactical play Devours only that debt, while hostile HP damage destroys the opportunity.

**Decision loop:** Compare the exact safe and paid outcomes, borrow only for a qualitative advantage, protect the striped loan, and fulfill Devour before the enemy blackens it.

**Failure:** Treating Blood Price as free damage, paying into a shown lethal line, or consuming useful Rats merely because a recovery number is available.

## Signature card set

These are representative identity anchors, not the complete 30-card Rat King corpus.

| Card | School | Core text/role |
|---|---|---|
| **Litter the Floor** | Broodcraft | Deal 3 and summon a Ready Rat. The basic subject generator is never blank. |
| **Open the Rank** | Broodcraft | Multi-hit sequence that deterministically constructs three cracks and Opens. |
| **Gnawing Court** | Broodcraft | Convert up to two Ready Rats into separate bites with a deterministic no-Rat damage floor. |
| **Tide of Teeth** | Broodcraft | Ready the whole brood and command a coordinated whole-turn attack. |
| **Kneel** | Crown of Dominion | Damage plus Crown. The fundamental declaration. |
| **The King Points** | Crown of Dominion | A Crowned target lets one Rat Ready and bite; no Rat produces fallback damage. |
| **Condemnation** | Crown of Dominion | Damage, then Open a surviving Crowned subject and add a Rat hit/Barrier fallback. |
| **Bite the Hand** | The Starving Crown | Complete safe attack or Blood Price for an extra hit packet. |
| **Crown of Hunger** | The Starving Crown | Crown safely; optionally pay to Open, binding risk and setup. |
| **The Starving Crown** | The Starving Crown | Whole-turn safe catastrophe or severe Blood Price multi-hit gamble with Crowned recovery. |

## Likely keystones

- **Every Crack Is a Nest:** the first enemy Opened each round summons a Rat. Public duo setup becomes board growth under a strict cap.
- **The Crown Walks:** the first Crowned death each round transfers Crown to the highest-HP survivor.
- **Every Decree Has Teeth:** the first Decree each turn Readies and commands one finite Rat bite.
- **The Debt Collector:** the first Crowned intent each round that deals zero HP to Rat King through Barrier/Hush/Break Devours 3.

## School-crossing examples

- Crown gives every remaining Ready Rat a remote target, making a defensive or movement card contribute offense.
- A Decree can Ready a subject now, preserve it for the volley, or spend it through a later Command.
- A Rat can be consumed to reduce Blood Price through a keystone, trigger an Omen, or preserve health; those uses compete.
- Crown of Hunger creates Crowned + Opened at a visible health cost, immediately enabling both protagonists while making the next intent more dangerous.
- Feast on the Wounded Devours while leaving Opened intact, explicitly choosing the partner's future over a Consume payoff now.

---

# Part 8 — Duo synergy

The duo must feel like coordinated cause and effect without becoming a fixed builder/spender script. These are canonical interaction patterns the card corpus and encounter set must support.

| # | Setup | Handoff/payoff | Actual decision |
|---:|---|---|---|
| 1 | Rat hits add three cracks and create Opened. | Old Man's Star Lance gains its 2-damage fracture and crosses Magnitude into Resonance. | Preserve Opened for both turns or consume it now. |
| 2 | Rat King Crowns a dangerous single-target attacker. | Old Man Hushes the now-known attack aimed at Rat King. | Protect Old Man by deliberately consolidating risk onto Rat King. |
| 3 | Old Man Foretells **A Death Foreseen** on a durable enemy. | Rat King's Open the Rank or paid Crown of Hunger makes it Opened and casts the Omen. | Fulfill now, defer for better timing, or kill a different threat first. |
| 4 | Rat King Crowns, then Opens, one subject. | **Misfortune Foretold** sees both public states and casts a multi-hit sentence. | Each intermediate state already changes intents/Rats/fractures. |
| 5 | Old Man Foretells **Three Knocks** at `0/3`. | Rat King's defensive Royal Guard can become the third card and fire it before his next action. | A non-damage card changes the damage timeline without an Energy refund. |
| 6 | Old Man applies Hush and Seal to a fast Crowned enemy's newly revealed intent. | Rat King safely pays Blood Price on his following turn and protects the loan with Barrier. | Prevention creates a borrowing window; it does not heal Rat King. |
| 7 | Rat King leaves several Ready Rats instead of Commanding them. | Their grouped Crown-focused volley completes Break after his cards resolve. | Present commands compete with a free finite future volley. |
| 8 | Old Man preloads a fast enemy's Break meter after it acts. | Rat King's small multi-hits finish the threshold before that enemy's next slot. | Large and small damage have different timing jobs. |
| 9 | Rat bites and Opened fracture bring a Breakable intent close to failure. | Old Man routes Falling Heaven elsewhere or uses exactly enough damage to finish Break. | Setup can free the finisher to solve a second target rather than mandate overkill. |
| 10 | Old Man Foretells Funeral Star. | Rat King consumes a Rat during Nest Collapse, causing the delayed area spell after the card resolves. | The Rat is area conversion, lost future bites, and an Omen trigger. |
| 11 | Old Man Foretells **The Road Already Taken**. | Rat King's An Audience changes row, Crowns a target, and triggers the Omen's damage/Hush after movement. | One readable event changes position, target, defense, and timing. |
| 12 | A Sovereign boss intent refuses Crown redirection. | Crown still focuses Rats and pays tribute Barrier; Old Man can Hush it and both heroes can contribute to Break. | Resistance changes one axis without invalidating Dominion. |
| 13 | Crown tribute gives Rat King an exact Barrier buffer. | Old Man may Overchannel because the next threat is routed away; Rat King may Blood Price because his own forecast is covered. | Shared safety is created through targeting, not transferred mana. |
| 14 | Old Man holds Resonance for Barrier and a threshold rather than cashing out. | Rat King uses Crown/Move to keep the shown Back strike off him until the planned collapse turn. | Rat King protects the timing of Old Man's stored catastrophe. |
| 15 | Old Man Overchannels Collapse the Constellation into many separate waves. | The waves Open a survivor and Break its intent, giving Rat King's next turn a safe Hunger line. | The nuke is correct because it changes retaliation, not merely because it is available. |
| 16 | Rat King pays Blood Price and moves Front through a card. | A movement- or Blood-Price-bound Omen casts, helping secure the target before hostile damage can erase the loan. | The risky payment becomes a public event Old Man planned around. |
| 17 | Old Man allows Hush to expire while **Ashen Palimpsest** is active. | The departing Hush creates a crack; Rat King's first hit can now Open earlier. | Letting an enemy act may be better than preserving every stack. |
| 18 | Rat King kills the current Crowned subject with **The Crown Walks** equipped. | Crown transfers, directing remaining Ready Rats and giving Old Man's bound-target decisions a new public subject. | Target order changes the board state that survives the kill. |
| 19 | Rat King uses Feast on the Wounded to Devour debt but leaves Opened intact. | Old Man receives his fracture/Magnitude line on the following turn. | Rat King rejects his own Consume payoff to protect the duet. |
| 20 | Old Man's Omen kills an add before its intent. | Rat King can spend his turn on the boss, preserve Barrier, or use a safer Blood Price mode. | Delayed magic changes Rat King's action budget without granting Energy. |

These interactions are test cases, not mandatory combos. A build may emphasize only several of them, but every school pairing must use at least two shared battlefield relationships and remain viable with either protagonist down.

---

# Part 9 — Card acquisition

## Where cards come from

- **Chests and reliquaries:** visibly authored, usually an exact card whose art/name belongs to the room.
- **Puzzles:** the default reward for optional spatial understanding.
- **Secrets:** high-identity cards, duplicates, or unusual branch-enabling cards.
- **NPCs:** one-time favors, trades, gifts, or consequences; never generic reputation ranks.
- **Minibosses and bosses:** signatures, school-crossing cards, and keystone access.
- **Unusual combat outcomes:** sparing an enemy, Breaking a named action, allowing an Omen-like event, or winning under a special condition may reveal a card; the condition is authored and forecastable, not an invisible grade.
- **Curated caches:** a small persisted two-card choice from a region-specific pool.

## Authored versus random

- Ninety percent of card opportunities are authored by location, character, encounter, or small regional pool.
- Ten percent use seeded selection inside those curated caches.
- A cache commits its seed and offered cards before the choice is shown. Reloading cannot reroll it.
- No routine victory produces a global random draft.
- Declined cache definitions are delayed through Isobel rather than permanently erased.
- Boss/signature rewards are never random.

## Reward cadence

| Campaign period | Target cadence |
|---|---|
| First hour | 6 new instances total, 3 per hero; about one every 8–10 minutes after the bridge/refuge reveal. |
| Rest of Region 1 | 4–6 more instances and the first Mastery evolution. |
| Midgame | One meaningful card opportunity every 15–20 minutes, alternating heroes and sources. |
| Region climax | One exact signature or school-crossing card plus a keystone discovery/choice opportunity. |
| Full normal campaign | 50–60 acquired instances beyond the 24-card starting inventory, with 36–42 unique definitions on the critical path. |

A reward beat should rarely present more than two new full card texts. Three-choice reward screens are reserved for an exceptional authored location with enough calm and context to compare them.

## Duplicates

- Cards are physical instances.
- Duplicate instances may evolve down different branches.
- An active deck holds at most two of one definition.
- Most duplicates are authored; one campaign-wide Isobel favor may duplicate a chosen non-Signature instance.
- Signatures cannot be duplicated unless a later content contract explicitly authors an exception.

## Removal, transformation, and upgrades

- “Removal” means moving a card from the active twelve to the collection. It is free.
- Cards are never permanently destroyed to thin a deck because deck size is fixed and the collection is not shuffled.
- Mastery supplies the normal transformation path.
- Isobel may rebind an already-unlocked Mastery branch at a refuge and performs a few named one-time card transformations. She is not a generic paid upgrade vendor.
- No card is temporarily modified across fights at launch. Fight-local changes disappear with the fight.

## Deck editing and collection management

- The deck screen shows both heroes side by side, exact counts, school tags, current branch, Mastery progress, and a compact interaction summary.
- Swapping preserves the physical instance and its Mastery.
- The screen offers filters by protagonist, school, cost, and interacted state, but no rarity sorting that implies linear power.
- A one-button “restore starter deck” exists as a recovery tool, not an optimization recommendation.
- New cards enter the collection and may be offered as a direct one-for-one swap; the player may decline and continue without losing them.

## Acquisition quality bar

A card placement passes only if at least one is true:

- Its location explains or enriches its fiction.
- Reaching it tests a mechanic the card later manipulates.
- The NPC/encounter that grants it gives the card a remembered relationship.
- The choice meaningfully changes one of the current decks.

“Chest at the end of an otherwise empty corridor” and “random option after Fight 17” are not sufficient reasons by themselves.

---

# Part 10 — Exploration

## World structure

Internal floor IDs remain useful for content packs, saves, renderer themes, and authoring tools. They are not the player's primary mental model. Player-facing navigation uses named **regions** and landmarks inside one continuous Labyrinth.

The initial campaign structure retains and expands five major region identities:

1. **The Hall of Five Wounds** — threshold, Gate, refuge district, mixed materials, first branches.
2. **The Cursed Library** — folded stacks, impossible indexing, the Face's later reappearance.
3. **The Forge of Ashes** — heat, machinery, vertical pressure, authored combat mechanisms.
4. **The Null Choir** — silence, observation, light/rhythm, controlled space.
5. **The Weeping Cistern** — water, chutes, currents, abyss continuity, final descent.

Stairs still exist, but ramps, bridges, lifts, chutes, rafts, and cross-region views prevent “Floor 3” from feeling like a sealed level select. Region names appear on entry and maps; floor numbers stay internal or secondary.

## Landmarks and navigation

Every major branch requires a visually or aurally distinct anchor visible before its decision point: the Kept Gate, a bridge, an impossible shelf wall, a dead bell, a furnace stack, a choir aperture, an upward waterfall, a Face, or a refuge door. Repeated generic corridors may connect landmarks but cannot constitute the branch's identity.

Navigation follows these targets:

- A meaningful landmark, interaction, route decision, or authored detail every 4–8 traversal minutes.
- A local loop-closing shortcut every 10–15 minutes in hostile exploration.
- A major refuge/region return shortcut every 30–45 minutes.
- A safe camp or antechamber every 30–45 minutes.
- A full inhabited refuge roughly every 60–90 minutes, with four major refuge anchors across the campaign.
- No critical route depends on remembering an unmarked one-cell doorway across hours of play.

The automap fills visited space automatically. It shows discovered doors, vertical links, refuges, player notes, known unsolved mechanisms, and manually placed pins. It does not reveal unvisited geometry, secret doors, encounter locations beyond current sight, or puzzle solutions.

## The opening spectacle contract

The opening is a promise about the entire game and follows this authored rhythm:

1. Prologue on a black field.
2. The duo arrives at the Labyrinth threshold; movement and looking are taught through space.
3. The enormous **Kept Gate** is visible within two minutes.
4. A short observation/orientation mechanism opens or permits passage through the Gate. It is a spectacle and a lesson, not a ten-minute tutorial lock.
5. The camera reveals a long, narrow bridge crossing an apparently bottomless black void. No random fight interrupts it.
6. Roughly one third across, the enormous animated **Face** enters the player's sightline and begins commenting nonmodally.
7. The Face reacts to movement direction and repeated staring. The player may ignore it and keep walking.
8. The far side introduces **Surveyors' Rest**, the first physical refuge district, before opening into the wider Hall of Five Wounds.
9. Later, the same Face appears beside a different bridge in/near the Cursed Library and remembers the duo.

The game never confirms whether the Face moved, whether both bridges cross one abyss, or whether the Labyrinth folded around the same void.

The existing Floor 2 bridge geometry, environmental sprite sheet, stateful bark resolver, and abyss ambience are content to relocate/duplicate—not a feature to redesign from scratch.

## Hidden paths and optional content

Secrets use readable irregularity rather than wall-humping:

- A material seam that continues behind a false wall.
- Sound or wind from an apparently closed direction.
- A missing segment in an automap pattern.
- A sightline visible from another height.
- A recurring symbol seen in two regions.
- An NPC clue naming a landmark rather than coordinates.
- A traversal tool that visibly reacts near a compatible mechanism.

Optional content may contain the hardest puzzles, unusual cards, keystones, environmental stories, and elite encounters. It must not contain a mandatory plot object with no redundant clue.

## Shortcuts and fast travel

- Local shortcuts are doors, ladders, lifts, gates, ramps, and bridges opened from the far side.
- Cleared authored encounters do not respawn, so backtracking through understood space becomes calmer.
- Discovering a refuge activates its physical travel anchor: lift, waygate, chained platform, or other location-specific device.
- Using an anchor permits free travel only among already-discovered refuges. There is no anywhere-to-anywhere map teleport.
- The player must traverse every route once before it joins the network.
- Deck editing remains available away from refuges, so the travel network is not mandatory maintenance transport.

## Environmental storytelling

The world explains itself through arrangement and recurrence: beds facing a sealed door, a tavern using shields as trays, a bridge seen from two impossible levels, writing that continues across centuries, architecture from deeper regions bleeding upward, and NPCs who relocate after the player changes a route. Journals are brief artifacts, not lore dumps. The identities of The Dead Boy, The Lonely Girl, and The Crying Man remain deliberately unexplained.

## Backtracking rule

Backtracking is valid when at least one of these changed:

- A shortcut makes the route materially shorter.
- A traversal discovery reveals new geometry.
- An NPC has moved or a refuge has changed.
- A previously seen card cache/puzzle can now be understood.
- A recurring environmental character responds differently.

Walking an unchanged solved corridor solely to heal, buy supplies, identify loot, remove status, or change deck is a product failure.

---

# Part 11 — Puzzles

## Philosophy

Puzzles are compact acts of noticing, orientation, and spatial inference built for the first-person grid presentation. They should make the player look at the world differently, not exhaustively test every wall or maintain a paper spreadsheet.

- A soft observation or navigation problem appears about every 10–15 minutes.
- A substantial multi-step puzzle appears every 30–45 minutes.
- Each region contains one major set-piece puzzle.
- Main-path puzzles target 3–8 minutes once the relevant clues are noticed.
- Optional puzzles may take 10–20 minutes and provide stronger card/keystone rewards.
- No puzzle removes permanent resources or causes a combat-loss penalty.
- A failed input resets only the local mechanism, with immediate feedback and no long animation.

Main-route puzzles have at least three clue layers:

1. A world-facing visual/audio relationship.
2. A nearby inscription, composition, or NPC clue.
3. An optional journal “Notice” that states the inference more plainly after two failed attempts or sustained inspection.

Accessibility supplies subtitles and visible pulses for sound puzzles, high-contrast interactable outlines as an option, and a direct-hint toggle. Asking for a hint is not penalized.

Combat cards are never mandatory world keys. Requiring a particular active card would turn deck editing into traversal tax and could soft-lock a legal build. Permanent traversal tools and the protagonists' contextual abilities may interact with mechanisms because they are always available.

## Ten reusable puzzle patterns

1. **Landmark alignment:** View two distant landmarks through a slit, rotate a bridge/room, or stand at the one tile where their shapes overlap.
2. **Directional sound:** Follow loudness, echo delay, bell count, or water rhythm; visual pulses mirror every audio clue.
3. **Light and shadow:** Open shutters, move occluders, or carry an authored light source so shadows form a route/symbol.
4. **Folded loop:** Enter the same room from different directions to change a wall, reveal impossible overlap, or prove two corridors occupy one place.
5. **Water level and current:** Operate sluices, rafts, rising platforms, and one-way currents to change both horizontal and vertical access.
6. **Sightline mechanism:** Observe or activate a switch from another height/branch; the automap and world view provide complementary information.
7. **Antimagic inversion:** A magical obstruction becomes physical/legible only inside a null field, changing which surfaces or inscriptions exist.
8. **Enemy intent as tool:** In one authored battle, exact attacks can strike a mechanism, break a barrier, or be rerouted; no specific card is required and retreat restores the setup.
9. **Environmental character behavior:** Looking, crossing direction, waiting, or returning changes a recurring character's response and reveals a clue or optional route.
10. **Negative-space mapping:** Explored corridors form an incomplete symbol; the missing stroke identifies a secret seam without requiring exhaustive wall checks.

## Five early-game puzzles

1. **The Kept Gate faces:** Five material wounds are visible around the approach. The player rotates/presses two Gate faces so their seams point toward the matching visible wounds. Wrong input rotates back immediately; the Gate opening is the reward spectacle.
2. **The Face notices:** Repeatedly facing the Face earns escalating responses. One optional line names a bridge landmark behind the player, teaching that turning and looking can reveal usable clues. It does not gate the bridge.
3. **The Cut Bell:** Three silent light pulses travel through the chapel in an order matching three wall reliefs. Repeating that order opens a card niche; audio is flavor, not required evidence.
4. **Paired index marks:** Two library teleporters share asymmetrical shelf marks. Matching the marks closes a shortcut and exposes a cache; both endpoints remain reachable without using the pair.
5. **The upward cistern:** Two nearby sluices change a shallow current and raise a small platform. The short wet route and long dry route both reach the main objective; solving the current yields an optional card.

## Five mid-game puzzles

1. **The impossible catalogue:** Library shelf numbers contradict physical order until the automap reveals that two aisles overlap. Entering the shared room from the “impossible” direction opens a folded archive.
2. **The forge breathes:** Soot direction, pipe vibration, and visible pressure gauges identify which vents must open before a furnace-cycle intent. Incorrect venting produces a harmless reset blast and a clearer soot trail.
3. **The choir without sound:** A sequence is conveyed by mouths, candle extinction, and floor vibration. Subtitles display `[pulse: long/short]`; solving it rotates the Null Choir's central bridge.
4. **The Face below/above:** The later bridge offers a viewpoint where the same Face and an earlier landmark align. Noticing it opens an optional fold route but leaves the abyss mystery unanswered.
5. **The countercurrent:** A raft moves according to current arrows visible from upper walkways. The player changes two gates, rides one-way chutes, and opens a return lift before committing to the long crossing.

## Three major set-piece puzzles

### 1. The Kept Gate

The Gate combines scale, orientation, and first-person observation. Its mechanism is intentionally short; the player learns that landmarks, materials, and looking matter, then receives a huge animation/lighting/bridge reveal. There is no combat or key hunt between understanding and spectacle.

### 2. The Folded Observatory

An observatory spans two player-facing regions and appears impossible on the automap. The player aligns three stellar apertures from different heights, uses the resonance/bell traversal tool to keep each alignment active, and opens a lift that collapses an hour-long route into a refuge-adjacent return. The reward is an Astral/Omen card pair and one of the campaign's strongest spatial revelations.

### 3. The Last Water Stair

The final Cistern descent combines changing water levels, a visible abyss, earlier bridge landmarks, and a non-hostile Face appearance. The player routes current through three chambers, rides the resulting vertical raft, and opens the quiet path to the Crying Man and then the bottom. Failure returns the raft to the current chamber, never the region entrance.

## Gating and failure

- Main progression may be gated by observation puzzles only when clues are redundant and local.
- Optional high-value cards and keystones are the preferred reward for harder puzzles.
- Literal keys may open a few unmistakable authored locks and shortcuts, but cannot be the campaign's dominant language.
- Hazards may move the duo a few tiles, restart a mechanism, or begin an authored encounter. They do not permanently damage the save or consume an item.
- If a main-path puzzle remains unresolved after direct hints, an NPC/refuge thread may reveal the exact operation. The game values continued exploration over prideful obstruction.

---

# Part 12 — NPCs, refuges, and shops

## What replaces Town

Town mode is replaced by physical inhabited places inside the Labyrinth. **Surveyors' Rest** is the first refuge district after the Kept Gate bridge. Hot Boi's Tavern, Namanda's chapel, Isobel's Iso-Spells, survivor camps, hermits, workshops, and later enclaves are discovered rooms connected to ordinary exploration geometry.

A refuge provides:

- A safe encounter-free area and autosave anchor.
- An activated fast-travel point when the location has an appropriate device.
- Authored dialogue and recurring character state.
- Deck, Mastery-branch, and keystone review surfaces.
- Journal/thread reminders and map clues.
- Narrative rest scenes with no required healing/economy transaction.

It does not provide a checklist of Inn/Temple/Shop/Training chores.

## Hot Boi's Tavern

Hot Boi's remains a physical Floor 1 landmark and recurring social anchor.

- Hot Boi offers authored conversation, current-region rumors, and the **Scorchboard**: a small list of named optional Threads, never kill counts.
- The tavern records visible changes after important Floor 1 outcomes and after selected later NPCs relocate there.
- Sitting/resting plays optional duo/NPC scenes, autosaves, and may advance authored dialogue state. It does not heal because ordinary recovery is already automatic.
- Hot Boi never sells generic supplies and no payment screen appears.
- The tavern's map, furniture, hearth, and existing art are retained; its old maintenance functions are not.

## Namanda's chapel

Namanda becomes the primary keystone/meaning service rather than a resurrection and cure vendor.

- A discovered keystone can be examined and equipped at the altar.
- Any unlocked keystone may be swapped there without cost.
- Namanda interprets the deathless world, the kept, and recurring symbols through authored dialogue without explaining the three deep bosses.
- Specific story objects, such as a cracked bell, produce one-time scenes or card/keystone outcomes.
- There is no resurrection, curse removal, paid blessing, long-duration armor buff, or healing transaction.

Boss antechambers also permit keystone swaps so Namanda does not become a commuting requirement.

## Isobel's Iso-Spells

Isobel is the card specialist, not a gold shop.

- She displays the player's collection, Mastery branches, and school relationships in-world.
- She can rebind the active branch of a Mastered instance at a refuge.
- After each region climax, she can reproduce one previously seen but untaken curated-cache definition.
- One authored favor unlocks one non-Signature duplication for the campaign.
- A few named objects allow one-time transformations or trades with exact outcomes.
- Her catalogue never refreshes on a timer, uses no random stock, and charges no currency.

## Camps

- Camps are physical safe rooms, survivor tableaux, or narrative interludes in the maze.
- They may become travel anchors, host a temporary NPC, or provide a clue.
- They autosave and permit deck editing.
- They do not run a separate Camp mode, ration system, rest counter, watch order, or HP/SP restoration economy.
- Existing camp artwork is repurposed as an actual room composition or story backdrop.

## Social interaction contract

Universal social verbs are removed. There is no generic Attack, Steal, Barter, Give, disposition meter, faction reputation, or kill-persistence simulation.

The default NPC interaction is authored **Talk** plus character-specific choices. A particular NPC may expose actions such as Trade, Show Object, Ask About, Challenge, Help, Refuse, or Leave. If violence or theft matters to one story, it is an explicit authored choice with a previewed consequence—not a universal button on every person.

Persistent consequences may change:

- Dialogue and remembered choices.
- Whether an NPC moves to another refuge/region.
- Which optional card, route, or scene is available.
- Which of two mutually exclusive optional outcomes occurs.

They may not silently lock the campaign's critical route, required traversal tool, or only copy of a required card.

There is no global reputation score. Recurring NPCs remember specific acts.

## NPC movement and recurrence

NPCs may relocate after region climaxes, shortcuts, or completed Threads. Their map notes update when the destination becomes known. The Face is the strongest environmental recurrence: same stateful identity, different impossible location, no explanatory quest marker.

## Threads, not a quest checklist

The game keeps a lightweight journal of **Threads** rather than a formal quest economy.

- A Thread records a remembered person, mystery, promise, or unresolved place in one or two sentences.
- It contains discovered clues and optional map notes, not progress bars, objective counters, reward previews, or recommended level.
- The player typically has three to five unresolved Threads, not twenty errands.
- NPCs repeat a natural-language reminder if asked; the HUD does not continuously pin an objective.
- Main-direction Threads clarify known routes. Optional Threads may reward cards, keystones, shortcuts, an NPC relocation, or a scene.
- Good Threads include “Find what happened to the Fourth Surveyor,” “Bring the cracked bell to Namanda,” and “Why does the same Face appear below?”
- Kill counts, collection quotas, daily tasks, and generic bounty repetition are forbidden.
- Completed Threads archive with their outcome so the journal becomes a history of this save.

## Shops

“Shop” may remain a fictional word on a sign. Mechanically, all services are authored, finite, and identity-specific. There is no universal buy/sell interface, stock refresh, appraisal, price curve, or merchant inventory tier.

---

# Part 13 — Failure, healing, and save

## Exact ordinary-combat rules

| Event | Result |
|---|---|
| Ordinary encounter begins | Capture the last stable pre-encounter tile, facing, and world state; set both heroes to 40 HP; clear all fight-local state; then construct the battle. |
| One hero reaches 0 HP | That hero is KO, their future turns skip, and the partner may continue. |
| The KO'd hero's existing objects | Crown persists without redirect/tribute; Rats persist without turns/volley; an armed Omen may still resolve. |
| Surviving hero wins | Victory resolves normally; both heroes restore to 40 afterward. |
| Both heroes reach 0 HP | Defeat; restore the pre-encounter checkpoint and show Retry / Edit Deck / Leave. |
| Ordinary victory | Full heal to 40, clear every fight-local state/status, award victory Mastery/reward, return to exact dungeon state. |
| Ordinary loss | No Mastery, no reward, no consumed resource, no changed encounter/world state. |
| Retreat/restart | Same as loss without defeat presentation. |

There is no persistent ordinary-combat attrition, injury, corpse, resurrection, recovery fee, item loss, gold loss, century advance, or Game Over mode.

The pre-encounter checkpoint is the last stable legal tile/facing before the encounter claimed control, with the enemy and world event still unresolved. **Retry** reconstructs the same encounter immediately with full HP and fresh draw piles. **Edit Deck** opens a no-cost build screen over that checkpoint and then reconstructs the encounter. **Leave** returns control on that tile with the enemy undefeated; if a visible enemy occupies the trigger tile, its collision remains and the player may choose another route. No option advances encounter RNG, commits a reward, or changes the world.

## Bosses

- A boss attempt creates a checkpoint in its safe antechamber with current decks/keystones and full HP.
- Loss offers immediate Retry, Edit Deck, Change Keystone, Leave, and difficulty/assist access.
- Retry begins the boss from its initial state and restores both heroes to 40.
- Victory fully restores afterward and commits the boss, reward, shortcut, and story state atomically.
- Closing the game during a boss returns to the antechamber before the attempt.

## Game close and resume

| Close point | Continue behavior |
|---|---|
| Ordinary dungeon exploration | Resume at the last debounced autosave, normally the exact settled tile/facing and world state. |
| During combat | Resume at the pre-encounter checkpoint; the enemy remains undefeated and both heroes are restored. |
| During a reward choice | Resume the same already-seeded choice. No reroll. |
| During a puzzle animation | Resume at the last stable local mechanism state. |
| During a gauntlet fight | Resume at the most recent gauntlet entrance/interlude checkpoint. |
| At a refuge | Resume in that physical refuge. |

## Autosave

The campaign maintains one rolling autosave. It writes:

- After a successful movement settles, debounced so holding movement does not thrash storage.
- After doors, switches, puzzles, traversal changes, NPC choices, card pickups, deck edits, Mastery/keystone changes, and travel.
- Immediately before combat and atomically after victory/reward resolution.
- On region transition and refuge entry.

Autosave writes never occur halfway through a damage/trigger chain.

## Manual saves

- Three manual slots remain available anywhere outside active combat.
- Manual saving inside a gauntlet records the last stable gauntlet checkpoint, not a half-resolved fight.
- Save-scumming is not treated as a design problem. Authored rewards are fixed and random offers persist before reveal.
- A Save & Quit command writes and returns to title; it does not move the duo to a refuge.

The existing Save menu may be simplified around autosave + three slots but is not removed without an equivalent accessible surface.

## Refuges

Entering a refuge autosaves and clears any noncombat presentation state. Because ordinary battle already ends at full HP and there are no persistent statuses, a refuge does not perform a hidden heal or reset that the player must visit to receive.

## Authored gauntlets

Gauntlets are rare, explicit exceptions—no more than three optional gauntlets plus the final sequence in the target campaign.

- Entry is clearly labeled and creates a full-HP checkpoint.
- A gauntlet contains two or three authored fights.
- HP persists between its fights.
- After each victory, each hero recovers 10 HP up to 40; a KO'd hero returns at 10 HP.
- Barrier, Hush, Seal, Crown, Rats, Omen, Resonance, Opened, Break, and recoverable-HP status clear between fights.
- Unrecovered Blood Price remains real missing HP before the 10-HP recovery; the recoverable stripe itself disappears.
- Interlude checkpoints permit deck and keystone changes while preserving carried HP.
- Mastery and unique rewards are staged and commit only when the gauntlet completes. A failed loop cannot farm them.
- On defeat, the player may Retry the current fight from its interlude HP snapshot, Restart the gauntlet at full HP, or Leave.
- Completing or leaving the gauntlet restores ordinary post-combat rules; completion full-heals and commits rewards.

This creates deliberate short-form attrition without a healing economy or replaying solved exploration.

---

# Part 14 — Economy and inventory

## Explicit decisions

| Question | Decision |
|---|---|
| Gold? | **No.** Remove it from player-facing state and new saves after migration. |
| Merchant prices? | **None.** Services use authored favors, milestones, or named objects. |
| Buy/sell loop? | **No.** |
| Consumables? | **No.** |
| Weapons? | **No mechanical weapons.** Character art/animations retain their iconic implements. |
| Armor? | **No.** |
| Equipment screen? | **No.** |
| Relics/charms? | **No at launch.** |
| Ordinary loot bag? | **No.** |
| Card collection? | **Yes, separate from inventory.** |
| Puzzle objects? | **Yes, automatic key-object journal.** |
| Literal keys? | A few authored keys may remain, but they are contextual landmarks/shortcut tools rather than a color-key progression spine. |
| Traversal tools? | **Yes, three major permanent contextual tools.** |

## Key-object journal

Important objects appear in a compact journal section with their image, origin, and currently understood use. They cannot be equipped, sold, discarded, stacked, or manually transferred. When consumed by an authored mechanism, the journal records the result rather than simply deleting all evidence that the object existed.

Examples include a cracked bell, a named seal, a gate component, a surveyor's lens, or a story object an NPC recognizes. A generic `red-key` or `furnace-key` may survive internally for migration, but player-facing copy should favor a specific object and location.

## Why no currency survives

Without equipment, consumables, resurrection, inn fees, and generic card packs, gold would have only two jobs: delaying cards the player already found or pricing convenience. Both weaken the core identity. Authored one-time choices produce better memory and require no grind/farming safety valve.

The Arena therefore grants no campaign gold, cards, Mastery, or other farmable progression.

---

# Part 15 — Encounter pacing, bosses, and difficulty

## Encounter model

Random step encounters are retired. Campaign combat uses a hybrid of:

- Visible stationary packs or silhouettes guarding authored space.
- Simple visible patrols on fixed local routes.
- Clearly foreshadowed scripted encounters at mechanisms, chests, and region beats.
- Rare authored ambushes—at most one untelegraphed ambush per region, and never during a major navigation/puzzle explanation.
- Optional elites/minibosses occupying dangerous branches.

The first implementation may use static encounter billboards and trigger volumes rather than full roaming AI. The product requirement is player-readable placement and finite persistence, not sophisticated overworld enemy behavior.

Defeated campaign encounters remain defeated. They do not respawn on refuge use, region transition, save/load, or time. This prevents grind, preserves spatial accomplishment, and makes return travel calmer.

## Numeric rhythm

| Context | Target |
|---|---|
| Ordinary hostile exploration | **1–2 battles per 20 minutes; target 2.** |
| Spectacle, refuge, or substantial puzzle stretch | 0–1 battle per 20 minutes. |
| Explicit gauntlet | 2–3 battles in 15–25 minutes. |
| Early battle length | 2–3 minutes. |
| Standard battle length | 3–5 minutes. |
| Elite/miniboss length | 6–9 minutes. |
| Major boss length | 10–15 minutes, usually 3–6 rounds. |
| Mandatory/likely campaign encounters | Approximately 32. |
| Optional ordinary/elites | Approximately 12. |
| Region miniboss/set-piece combats | 5, about one per region. |
| Major kept bosses | 3: The Dead Boy, The Lonely Girl, The Crying Man. |

No hostile non-gauntlet stretch should force more than three battles in 20 minutes. If card battles regularly exceed five minutes, density must fall before rewards or animation speed are used to disguise the pacing problem.

Thirty to forty percent of non-boss encounters should be bypassable, deferrable, or attached to optional branches. Critical encounters exist to author tactical teaching and climaxes, not to enforce combat grind.

## Safe zones

Refuges, major bridge spectacles, boss antechambers, and explicit puzzle-learning chambers contain no encounters. Their boundaries are communicated through architecture, inhabitants, light, and sound rather than a hidden rate multiplier.

## Boss cadence

- A miniboss or authored combat climax occurs roughly every 60–90 minutes.
- A major boss occurs roughly every 2–3 hours after the opening region.
- The final campaign contains three major kept bosses rather than one boss per numbered floor by obligation.
- Optional elites supply additional deck tests without bloating the main route.

## Boss compatibility philosophy

Bosses are authored tactical events that test habits while preserving every core verb.

| Mechanic | Boss contract |
|---|---|
| Opened | Works normally. Phase changes do not silently clear it. |
| Hush | Works on every numeric action with the same half-value floor. No blanket control immunity. |
| Seal | Blocks compatible Barrier and changes Hush decay; expires normally. |
| Crowned | Boss can always be Crowned. Specific Sovereign beats resist redirect and pay tribute. |
| Break | At most one nonconsecutive Breakable beat per cycle. No permanent lock. |
| Rats | Work normally; bosses do not sweep them through hidden rules. Authored intents may create explicit tactical pressure around them. |
| Omens | Boss scripts include events that every equipped Omen can plausibly observe. No “Omen immune” tag. |
| Resonance/Overchannel | Works normally; boss retaliation makes cash-out timing the decision. |
| Blood Price/Devour | Works normally; boss decks include non-kill Devour routes because adds are not guaranteed. |

Phase transitions preserve public states unless the transition's visible, forecast text explicitly transforms one. If a boss destroys or consumes a state, the action must itself be a tactical beat with compensation or counterplay—not a cutscene purge.

Every boss is validated against all nine broad Old Man-school × Rat King-school emphases. A pairing need not be equally fast, but it must have a credible line. A boss that requires one exact card or makes one school blank fails review.

## Difficulty target

Standard is challenging, transparent, and retry-friendly:

- Ordinary informed fights should produce an 80–90% first-attempt win rate.
- Elites should produce a 60–75% first-attempt win rate.
- A blind major boss should produce roughly a 35–60% first-attempt win rate, with most engaged players succeeding within three attempts through learning or deck changes.
- Later difficulty comes from interacting intents, target priority, sequencing, and phase rules—not large HP multipliers alone.

There is no grinding solution. A blocked player can:

- Change either deck.
- Change a Mastery branch or keystone at the antechamber.
- Learn the intent cycle and alter sequencing.
- Explore another available branch for cards.
- Solve an optional puzzle/thread.
- Lower difficulty or enable an assist.

## Difficulty settings and assists

Three settings may be changed outside active combat and apply to the next attempt:

- **Story:** enemy damage ×0.75; puzzle direct hints become available immediately; all rules and card text remain the same.
- **Standard:** authored baseline.
- **Severe:** enemy damage ×1.10 and HP ×1.15; exact intents remain visible; no new immunities or hidden information.

Independent assists control animation speed, hold-to-confirm, card text expansion, high-contrast states, sound-puzzle visual pulses, and hint delay. No achievement or content is withheld for using them.

---

# Part 16 — Campaign structure

The target is a 9–12 hour critical-path campaign and a 12–16 hour curious/completionist campaign. This is an authored adventure, not an endless run or procedural roguelike.

| Phase | Approx. time | Exploration/content role | Combat/progression role | Climax |
|---|---:|---|---|---|
| **Prologue and threshold** | 0–20 min | Establish gods/Death/lamp, movement, Kept Gate, bridge, Face. | No build choice before context; no random fight. | Gate opens and abyss is revealed. |
| **Hall of Five Wounds / Surveyors' Rest** | 20–120 min | First refuge, five material wounds, dry/wet routes, chapel, Isobel, Hot Boi, Namanda, local shortcuts. | Teach Energy, exact intents, rows, Barrier, Rats, Hush, cracks/Opened. Deliver six first-hour cards and first Mastery. | Region guardian/miniboss opens the first deep route and refuge return. |
| **Cursed Library** | 1.5–2 hr | Folded stacks, impossible catalogue, later Face appearance, first major travel anchor. | Crown and Omen become normal deck tools; introduce one Break intent and first keystones. | Authored guardian/elite and Folded Observatory access; no need to force a kept boss here. |
| **Forge of Ashes** | 1.5–2.5 hr | Machinery, heat, vents, vertical loops, first explicit gauntlet option. | Resonance, Magnitude, Overchannel, Blood Price, Devour; first mature six-school builds. | **The Dead Boy** as first major kept boss; major shortcut upward. |
| **Null Choir** | 1.5–2.5 hr | Silence/light/rhythm, moving inhabitants, larger optional branches, second/third refuge network. | More conditional intents, Sovereign Crown beats, advanced Omens, first serious school-crossing keystones. | **The Lonely Girl** and a changed refuge/NPC state. |
| **Weeping Cistern** | 2–3 hr | Water/raft/chutes, abyss continuity, Last Water Stair, deepest shortcuts, final camps. | Full corpus, authored gauntlet, phase-heavy encounters, no new foundational vocabulary. | **The Crying Man**, quiet bottom/lamp room, fixed wish ending. |

## Unlock rhythm

- Hush, Rats, Opened, Barrier, rows, and exact intents are present in the starter decks.
- Omen, Crowned, Resonance, and Blood Price each receive one guaranteed introductory card in the first hour, one at a time.
- All six schools are meaningfully buildable by the end of the Cursed Library.
- Mastery begins in Region 1; first evolution occurs before its climax.
- The first keystone appears near the end of Region 1 or early Library, after the underlying state is understood.
- Traversal discoveries land approximately at the Hall/Library boundary, Forge/Choir boundary, and Choir/Cistern boundary.
- The final region adds encounter combinations and card corpus depth, not another resource meter.

## Story scope

The current gods/Death/lamp/kept canon and wish ending remain. Edgehollow may remain in the prologue as the offscreen settlement at the mouth, but it is not a gameplay mode. The century wipe is not part of the new loop. The campaign does not explain the Face or the former identities of the three kept bosses.

---

# Part 17 — Onboarding

Onboarding is authored through space, enemy composition, fixed first draws, and reward order. Text explains controls and definitions only; it never tells the player the intended strategy.

## First 60 minutes

| Time | Beat | Teaches |
|---:|---|---|
| 0–5 min | Prologue, then direct control at threshold. | Premise; look, move, interact. |
| 5–10 min | Kept Gate approach and short facing/material mechanism. | Orientation, observation, world interaction, automap trace. |
| 10–15 min | Gate opens; uninterrupted abyss bridge. | Scale, landmarks, nonmodal environmental character; turning/staring has meaning. |
| 15–22 min | Surveyors' Rest, optional Hot Boi conversation, and first authored NPC card (1/6). | Refuges are rooms, journal Threads, autosave, physical services, and cards can belong to people. No menu town tour. |
| 22–28 min | First visible single enemy, fixed friendly draw, and an exact cache it guarded (2/6). | Cards are actions; draw five, three Energy, target, Pass, exact intent. Enemy attack cannot kill; combat can reveal a physical reward without a random draft. |
| 28–35 min | Second fight with one row threat. | Barrier versus 1-Energy Move; Rat King Front, Old Man Back; printed movement remains available. |
| 35–42 min | A simple exploration puzzle reveals two new card instances (4/6). | The map gives cards; collection and direct one-for-one swap. |
| 42–50 min | A landmark discovery grants one card before a two-enemy fight (5/6). | Place can teach a card; target priority, Rat hit geometry, singleton Opened, partner handoff. |
| 50–60 min | First optional branch card (6/6) and a shortcut back toward Rest. | Exploration choice, the fourth advanced instrument, persistent world change. |

By minute 60, the player should have encountered all four pillars in action: exciting place, found card, readable fight, distinctive duo. They do not need to understand all six school engines yet.

## Teaching rules

- The first intent is always visible and named before a card can be played.
- The first time Barrier is focused, preview shows raw damage → absorbed → HP result.
- The first paid Move previews lost card opportunity and updated target arrows.
- Printed movement explicitly leaves the Move control available.
- The first Opened marker animates its three cracks joining and states `Opened stays` after the next eligible card.
- The Rat is labeled as a Ready/Spent subject with no HP or initiative, preventing unit-interception assumptions.
- New character instruments enter one at a time through guaranteed cards and a short safe tooltip attached to the physical discovery.
- The first Blood Price choice cannot be lethal and presents safe/paid outcomes side by side.
- The first Omen uses an easy, visible condition and grants immediate Barrier.
- The first Resonance card demonstrates held Barrier before any Overchannel card appears.
- The first Crowned enemy uses an eligible single-target intent so its intrinsic targeting change is obvious before Sovereign exceptions arrive.
- The first Break meter appears only after the player already understands exact intents and ordinary damage.

## Map onboarding

The automap opens once automatically at the first two-route junction, then never steals focus again. It labels the Gate and Surveyors' Rest, shows visited tiles only, and demonstrates a manual pin when the player sees a locked mechanism. No tutorial asks the player to hand-map coordinates.

## Tutorial failure

If a player loses either first combat, Retry restarts immediately with the same fixed draw. A one-line optional hint names the missed information surface (`Look at the intent`, `Barrier keeps your row`, or `Move changes its target`); it does not prescribe a card order.

---

# Part 18 — What gets cut

| System | Decision | Why | Replacement / reusable content |
|---|---|---|---|
| Town mode | **CUT** | Breaks Labyrinth continuity and creates commute. | Edgehollow remains prologue fiction; town art becomes physical refuge/settlement scenes. |
| Camp mode | **CUT / REPURPOSE** | Separate status/heal menu is maintenance. | Physical safe camps, dialogue, autosave, art backdrop. |
| Game Over mode | **CUT** | Punitive/canonical century flow contradicts instant learning retry. | In-combat defeat overlay and pre-encounter checkpoint. Existing art may frame a rare story beat, not routine loss. |
| Classic campaign combat | **CUT after parity gate** | The campaign needs one combat language. | Card combat; retain enemy/party strips, VFX, audio, choreography, backdrops. |
| Classic spells | **CUT / REPURPOSE** | Duplicate cards and SP. | Names, VFX, art, and fiction become Old Man cards/intents. |
| XP | **CUT** | Enables grind and numerical bypass. | Cards, Mastery, player learning. |
| Levels | **CUT** | Duplicate difficulty/power curve and HP growth. | Fixed stats; broader deck possibilities. |
| Perks | **CUT / HARVEST** | Duplicate card branches and passive complexity. | Strong concepts may become cards or one-slot keystones. |
| Equipment | **CUT** | Maintenance and identity dilution. | Fixed protagonist presentation and rule-changing cards. |
| Armor | **CUT** | Duplicates Barrier and hidden mitigation. | Barrier + exact intents. |
| Weapons | **CUT** | Duplicates attack cards and stat progression. | Iconic visual weapons remain in sprites/card art. |
| SP | **CUT** | Resource soup beside Energy, Resonance, and Blood Price. | Energy and fight-local instruments. |
| Gold | **CUT** | No remaining core purchase loop; invites farming. | Authored discoveries, favors, milestones. |
| Ordinary inventory | **CUT / REPURPOSE** | Per-instance item bookkeeping is irrelevant. | Card collection and automatic key-object journal. |
| Consumables | **CUT** | Hoarding and retry contradictions. | Full ordinary recovery and battle-local defense. |
| Recovery/corpse loop | **CUT** | Replays solved content. | Pre-fight checkpoint. |
| Resurrection | **CUT** | No persistent death/injury. | KO lasts only for current fight. |
| Century wipe gameplay | **CUT** | Makes every tactical retry a huge fictional event and returns to retired town. | Deathless lore remains; retries are noncanonical checkpoint abstraction. |
| Persistent buffs | **CUT** | Create maintenance, SP, and backtracking. | Fight-local states and permanent traversal discoveries. |
| Generic NPC Attack | **CUT** | Makes every authored character a simulation target and creates content/state cost. | Explicit one-off Challenge/violence choices when authored. |
| Generic NPC Steal | **CUT** | Bookkeeping and tonal noise without systemic payoff. | Authored theft/choice only if a specific story earns it. |
| Generic Barter/Give | **CUT / REPURPOSE** | Universal verbs imply universal content. | Named one-time Trade/Show Object/Favor choices. |
| Disposition | **CUT** | Invisible meter and generic simulation burden. | NPCs remember explicit authored choices. |
| Reputation/factions | **CUT** | Adds a progression ledger outside the core. | Recurring-character consequences. |
| Formal quest log | **REPURPOSE** | Checklist objectives encourage chores. | Lightweight Threads journal with clues, reminders, map notes. |
| Tavern | **KEEP / REPURPOSE** | Strong physical identity and social anchor. | Hot Boi's remains in-world; no inn economy. |
| Temple | **KEEP / REPURPOSE** | Strong location/art, weak maintenance role. | Namanda's chapel for keystones, objects, and story. |
| Shops | **REPURPOSE** | Generic stock/prices need gold and repeat visits. | Isobel and specialists offer finite authored card services/trades. |
| Save menu | **KEEP / SIMPLIFY** | Approachability requires explicit safety. | One autosave + three manual slots + Save & Quit. |
| Random encounters | **CUT** | Interrupt exploration and encourage grind. | Visible/authored finite encounters and rare signposted ambushes. |
| Arena | **KEEP / REPURPOSE** | Useful challenge, sandbox, balance, and regression surface. | Player-facing Challenge/Arena with no campaign rewards; “Card Trial” fiction retires. |
| Companions | **CUT** | Undermines fixed-duo identity and adds roster/deck ownership. | Authored noncontrollable guest actors only; Rats are summons, not companions. |
| Selectable party/formation admin | **CUT** | Already retired and contradicts the protagonists. | Fixed duo; tactical Front/Back occurs only in combat. |
| Traditional relic slots | **DEFER** | Third/fourth build axis beyond cards + Mastery + keystones. | Add only if playtest proves a missing exploration reward category. |
| Crafting | **DO NOT ADD** | Converts discoveries into materials and menus. | Exact cards, transformations, favors. |
| Metaprogression | **DO NOT ADD** | This is an authored campaign, not repeated failed runs. | Campaign save progression only. |

---

# Part 19 — Implementation transition plan

## Repository reality on 2026-08-27

The proposed starting sequence in the originating brief is already partly complete on the current branch:

- `f2100d9` — **fixed-duo runtime cleanup is committed**, not merely an uncommitted change.
- `1cf4560` — **a real campaign Card Trial lifecycle is committed**: authored dungeon encounter → card battle → victory → persistent card collection reward → exact dungeon position return → save/load persistence.
- Classic combat still exists for legacy paths such as certain scripted/NPC/Arena flows.
- Town, Camp, Game Over, XP, levels, perks, equipment, gold, inventory, classic spells, and random encounter pacing still exist in code and/or content.
- The worktree contains unrelated in-progress Card Trial engine/types/effects/simulation/art changes. They must be preserved and committed only in their own verified scope; never use blanket `git add -A`, restore, or clean operations.

The vertical-slice proof should be extended, not reimplemented.

## Migration principles

1. Product authority changes before legacy code is deleted. Transitional code is allowed; new feature work must follow the target contract.
2. Retire entry paths before physically deleting shared engines/assets.
3. Replace one durable state owner at a time and migrate saves at each step.
4. Preserve art, audio, sprites, choreography, encounters, maps, NPC writing, and environment work unless the content itself contradicts the new game.
5. Do not balance the whole five-region campaign against the frozen 24-card PoC. Prove the onboarding/36-card rules slice first.
6. Every deletion phase has a call-site grep, save migration, focused tests, `npm run check`, and production browser evidence.

## Ordered plan

### 0. Canonize the product

- Land this full definition, rewrite `CURRENT-PRODUCT-CONTRACT.md`, and refresh the reading-list authority.
- Mark older progression, town, century-wipe, classic-combat, and Card-Trial-isolation documents as historical/transitional when touched.
- Do not rewrite every old document; use clear authority banners and links.

**Exit:** future agents can distinguish canonical target, live transitional behavior, and retired design.

### 1. Protect and stabilize current branch work

- Audit the unrelated dirty Card Trial effects/simulation/art files.
- Commit them only by explicit path after their intended test/build gate, or move the work to its existing feature branch workflow.
- Re-run the committed campaign vertical-slice driver and focused save/adapter tests from a known baseline.

**Exit:** no product migration depends on unowned or ambiguous dirty changes.

### 2. Turn the campaign adapter into a durable campaign seam

- Add persistent active decks per hero rather than always instantiating locked prototype decks.
- Add the pre-encounter checkpoint, full-restore ordinary victory, Retry/Edit Deck/Leave defeat flow, and mid-combat resume rule.
- Make reward commit atomic and seed persisted choices before presentation.
- Keep classic combat reachable for paths not yet migrated.

**Exit:** normal authored dungeon battles obey the new save, failure, deck, and healing contract.

### 3. Build the New OnyxLabyrinth vertical slice

- Implement the Part 20 route with Kept Gate, bridge/Face, Surveyors' Rest, physical card pickup, one puzzle, one standard campaign card battle, one reward, a shortcut, and a miniboss.
- Reuse/duplicate the existing bridge, Face, tavern, Namanda, Isobel, battle stage, sprites, and map art.
- Prove exact exploration state return and Continue behavior at every seam.

**Exit:** a 45–75 minute playable demonstrates the whole new product sentence without Town/XP/gear being necessary for that slice.

### 4. Implement the six-school rules slice declaratively

- Build the 36-card first-playable subset from the six-school document, not 36 card-ID branches in one resolver.
- Implement central hit attribution, cracks/Opened, Break, Hush/Seal, Rats/Crown, Omen, Resonance/Magnitude/Overchannel, and recoverable HP in staged layers.
- Forecast/UI lands with each rule; a mechanic that cannot show its exact consequence does not advance.
- Add nine broad school-pair fixtures, partner-dead tests, trigger-loop assertions, and simulator coverage.

**Exit:** every school has intrinsic value, the vocabulary reads on the real battlefield, and no pairing is obviously nonfunctional.

### 5. Migrate every combat entry type

In order:

1. Ordinary placed campaign encounters.
2. Scripted chest/guardian encounters.
3. Optional elite and NPC-specific authored challenges that survive the social-system cut.
4. Region minibosses.
5. Major bosses, defeat retry, phase transitions, rewards, and final ending.
6. Arena/Challenge sandbox.

The classic campaign combat route remains available behind a developer fallback until these pass. Once all production campaign call sites use card combat, remove the player-facing classic route but keep shared presentation assets/choreography.

**Exit:** one campaign combat language, with classic combat unreachable in normal play.

### 6. Replace durable progression and saves

- Add active decks, card instances, Mastery, branch, keystone, key-object journal, and traversal discovery to a new save version.
- Stop writing XP, level growth, SP, gear, perk, gold, consumable, and ordinary inventory changes from new gameplay.
- Migrate legacy saves by preserving position, exploration, doors, NPC/story state, keys, killed/looted compatibility, and deepest region.
- Grant a deterministic card/keystone starter bundle based on deepest reached region; set both protagonists to fixed 40 HP. Do not attempt a one-to-one gold/gear-to-card exchange.
- Keep deprecated serialized fields readable for at least one migration version, then remove them after load fixtures prove conversion.

**Exit:** a new save can complete the slice without legacy progression fields; representative old saves convert safely.

### 7. Replace hubs and maintenance modes

- Move required useful surfaces into Surveyors' Rest, Hot Boi's, Namanda's chapel, Isobel's, camps, boss antechambers, and the safe deck screen.
- Remove Town, Camp, and Game Over routes only after their retained functions have physical/retry replacements.
- Reuse their art as in-world rooms/backdrops and remove buy/sell/inn/temple/training/equipment flows.
- Update title/Continue so New Game goes Prologue → Labyrinth entrance and Continue returns to the saved world/checkpoint.

**Exit:** no external mode is required for campaign maintenance or progression.

### 8. Replace random pacing and rebuild rewards region by region

- Author finite encounter placements and persistence for the vertical slice first.
- Remove step-roll and pity logic from that region, measure the 1–2/20-minute target, then convert later regions.
- Replace weapon/armor/consumable/gold chests with exact cards, key objects, Threads, shortcuts, environmental outcomes, and occasional empty storytelling remains.
- Preserve the physical chest landmark after looting.
- Move/duplicate the Face to the opening bridge and author its later recognition state.

**Exit:** all campaign regions use finite authored encounters and the map-as-draft reward grammar.

### 9. Expand content after the rules pass

- Add the remaining 24 school definitions in small batches.
- Add Mastery branches only after base-card choice is understood.
- Add simple keystones before advanced second-slot/egg/redirect experiments.
- Rebuild boss scripts around compatibility rules and validate all pairings.
- Place traversal tools, Threads, card caches, refuges, and shortcuts across all five regions.

**Exit:** full campaign power curve comes from possibility, not numbers.

### 10. Physically delete retired code

- Remove unreachable classic combat rules/UI, XP/level/perk/equipment/economy/inventory/consumable/persistent-spell modules, Town/Camp/Game Over controllers, random encounter roll logic, and generic social simulation only after production references are zero.
- Keep compatibility IDs/migration translators as long as supported old saves require them.
- Preserve shared sprite caches, animation strips, effects, audio, battlefield renderers, map content, and repurposed art.
- Update AGENTS/file maps/tests in the same scoped deletion commits.

**Exit:** source topology matches product intent rather than carrying a hidden second RPG.

## Verification gates

Every transition phase requires the proportional focused tests and build. Before a phase is declared complete:

- `npm run check` passes, aside from no knowingly unrelated failure being silently reclassified.
- The production browser proves Title → Prologue → world → encounter → battle → reward → exact world return → save/load.
- Defeat, retry, close-mid-combat, deck edit, one-KO victory, boss, and gauntlet checkpoints have explicit tests when their phase lands.
- Campaign Card combat is visually inspected on the supported Phaser backend and the intentional Canvas rollback where that fallback remains supported.
- No renderer change is accepted without the repository's required corridor captures.

---

# Part 20 — First playable target

## New OnyxLabyrinth vertical slice

The next target is a polished 45–75 minute campaign slice:

```text
Title
  ↓
Prologue
  ↓
Labyrinth threshold
  ↓
Kept Gate observation mechanism
  ↓
Gate opening + massive abyss bridge
  ↓
Face encounter
  ↓
Surveyors' Rest / Hot Boi introduction
  ↓
two-route exploration branch
  ↓
small environmental puzzle
  ↓
physical card discovery + deck swap
  ↓
campaign card battle
  ↓
victory, Mastery/reward, exact dungeon return
  ↓
loop-closing shortcut
  ↓
authored miniboss / region-climax beat
```

## Absolutely required

- Fixed Old Man + Rat King, no creation/roster flow.
- New Game skips external Town and enters the Labyrinth after prologue.
- Kept Gate and bridge read at intended scale; no encounter interrupts the reveal.
- Existing Face art/animation/stateful nonmodal behavior works on the opening bridge.
- One physical refuge room works, with Hot Boi dialogue and autosave; no healing/shop chore.
- Two persistent 12-card active decks and character-specific collections.
- Starter combat vocabulary: exact intents, 3 Energy, draw five, Front/Back, paid Move, Barrier, Rats, Hush, cracks/Opened.
- At least one introductory Crown/Omen/Resonance/Blood Price discovery appears, but the slice need not contain every advanced rule in every fight.
- One visible authored standard encounter and one authored miniboss; both remain defeated.
- Campaign battle uses the real card stage, live sprites, target/intent forecast, and shared choreography.
- Ordinary victory full-heals and returns to exact tile/facing/world state.
- Defeat supports Retry, Edit Deck, and Leave from a pre-fight checkpoint.
- A physical card pickup persists through save/load and can be swapped into the active deck.
- One card gains/approaches Mastery through victory; a minimal branch choice may be included if stable.
- One environmental puzzle with local reset and optional hint.
- One shortcut materially reduces return distance.
- Continue works from exploration, pre-fight checkpoint, post-reward, and refuge.

## May remain deferred or simulated

- The full 60-card corpus; use the onboarding decks plus a small validated subset.
- Full Mastery branch coverage; one representative branch is sufficient.
- Keystone collection UI; one fixed/demo keystone may remain disabled.
- Full travel network; only the first anchor needs to activate.
- All five regions and later boss scripts.
- Final card art for rules still under test; readable templated cards are acceptable.
- Complete NPC relocation/Thread system; one Hot Boi Thread proves the shape.
- Legacy save conversion beyond focused fixtures.
- Physical deletion of Town/Camp/classic combat/progression modules; they may remain unreachable from the slice.
- Sophisticated roaming-enemy AI; static visible authored placements pass.

## Acceptance criteria

- A naive player can state within one sentence what each protagonist generally does after the two battles.
- They find the first card without a post-fight random draft and can put it into a deck.
- They identify at least two noncombat reasons to explore the branch.
- The 45–75 minute path contains no required maintenance return, random encounter, XP/level screen, equipment comparison, gold price, or consumable decision.
- Losing the miniboss and retrying takes under 20 seconds to return to a decision-ready state.
- Opening-to-miniboss produces at least one memorable place, one card, one puzzle inference, and one duo interaction.
- Production evidence has no page errors, save divergence, position drift, missing assets, or preview/resolver mismatch.

The existing committed campaign adapter already proves the central combat lifecycle. This target proves that the surrounding product is worth building.

---

# Part 21 — Contradiction audit

| Potential contradiction | Resolution |
|---|---|
| No attrition, but Inn/Temple/healing services survive. | Healing economy is removed. Refuges provide geography, narrative, build review, travel, and save—not required restoration. |
| Cards are progression, but levels/gear still dominate power. | XP, levels, stat growth, equipment, perks, and SP are retired. Fixed 40 HP preserves arithmetic. |
| Exploration is central, but step-random fights interrupt it. | Random rolls/pity are replaced by finite visible/authored encounters at 1–2 per hostile 20 minutes. |
| Town is gone, but services require repeated return to one refuge. | Deck editing is available on safe tiles; boss antechambers support branch/keystone changes; travel links discovered refuges. |
| Failure is cheap, but consumables/rewards are lost on retry. | Consumables are removed; state and rewards commit only on victory; loss restores pre-fight checkpoint. |
| Fixed protagonists, but generic gear makes them interchangeable. | Gear is removed; school cards and fixed instruments express identity. |
| Blood Price is free because ordinary fights full-heal. | It remains dangerous inside the current fight; hostile damage erases recovery. Explicit gauntlets carry unpaid missing HP under special rules. |
| Full healing makes refuges pointless. | Refuges are characters, shortcuts, travel anchors, Threads, card/keystone meaning, and world change—not a heal button. |
| No gold, but shops still exist. | “Shop” is fiction; Isobel and specialists provide finite authored services/favors with no prices or refreshing stock. |
| The map is the draft, but all rewards are deterministic and sterile. | Most cards are authored; 10% use seeded curated caches, and declined definitions return later without reroll exploitation. |
| Progression is nonrandom, but card choice has no consequence. | Exact deck size, delayed declined options, physical duplicates, Mastery branches, and one keystone slot create opportunity cost. |
| Mastery rewards card use, but players can grind it. | Finite nonrespawning encounters and one victory-only mark per card instance per battle prevent efficient farming; Arena grants none. |
| Puzzles use cards, but deck freedom is promised. | Active combat cards never gate traversal. Permanent contextual tools are always available. |
| Fixed HP removes a feeling of power. | Power is broader action grammar, stronger interaction density, mastered branches, and player knowledge; enemy design shifts qualitatively rather than only inflating. |
| Bosses should resist control, but Hush/Crown must remain useful. | Intent-specific floors/Sovereign/Break cadence constrain one axis while leaving intrinsic effects and fallback tribute intact. |
| Save anywhere trivializes random choices. | Choices seed and persist before reveal; save convenience is not treated as an adversary. |
| Gauntlet attrition contradicts cheap failure. | Attrition is short, labeled, locally checkpointed; current-fight retry does not replay completed fights, and full restart is optional. |
| Deathless-world lore demands a century on every defeat. | Routine defeat is noncanonical checkpoint retry. The world lore remains; the century-wipe gameplay expression retires. |
| Same Face on multiple bridges could be explained by fast travel/layout. | Both placements remain authored, remembered, and unexplained; internal floor structure is not exposed as an answer. |
| Six schools risk becoming six sealed decks. | No school selection or legality lock; one home tag per card, cross-school text, mixed active decks, and bridge keystones. |
| Many states violate the small-vocabulary pillar. | Seven shared concepts and four fixed character instruments occupy stable UI homes; remaining terms are verbs/traits, and generic RPG statuses are removed. |
| Nonrespawning encounters reduce return-trip tension. | This is intentional: cleared geography becomes owned. New tension comes from unopened branches, authored patrols, mechanisms, and bosses—not repopulation. |
| Arena could become a progression farm. | Arena grants no campaign cards, Mastery, gold, or durable rewards. |

No unresolved contradiction justifies retaining a legacy system.

---

# Part 22 — Complexity budget

## Essential systems

| System | Why it earns complexity |
|---|---|
| First-person grid exploration and automap | Core spatial fantasy and world comprehension. |
| Authored regions, landmarks, vertical links, and shortcuts | Makes the Labyrinth worth exploring and backtracking meaningful. |
| Environmental puzzles and traversal tools | Converts observation into progression. |
| Fixed Old Man + Rat King | Product identity and all authored character design. |
| Two 12-card decks and collections | Main combat/progression language. |
| Exact intents, Energy, initiative, Front/Back, Move, Barrier | Core tactical decision loop. |
| Shared states: Opened, Break, Hush, Crowned | Duo cooperation and enemy interaction. |
| Character instruments: Rats, Omen, Resonance, recoverable HP | The six-school identities. |
| Per-card Mastery branches | One compact long-term card growth layer. |
| One keystone slot per hero | One compact specialization layer. |
| Authored finite encounters and bosses | Pacing, teaching, and memorable tactical content. |
| Refuges and authored NPC interactions | Civilization as geography and narrative recurrence. |
| Checkpoint/autosave/manual save/retry | Makes demanding content approachable. |

## Useful, constrained systems

| System | Constraint |
|---|---|
| Threads journal | Natural-language clues only; no counters/reward ledger. |
| Refuge fast-travel network | Physical discovered anchors only; no unvisited/anywhere teleport. |
| Curated random card caches | 10% of opportunities, persisted before reveal, region-limited. |
| Authored gauntlets | Rare, 2–3 fights, local retry, no healing economy. |
| Difficulty settings and accessibility assists | Preserve exact rules/information; adjust damage/HP/hints only. |
| Arena/Challenge mode | No campaign rewards; sandbox/test/challenge surface. |
| Key-object journal | Named important objects only; no bag management. |

## Questionable and deferred

| System | Decision condition |
|---|---|
| Relics/charms | Add only if players repeatedly want a non-card exploration reward and keystones cannot serve it. |
| Old Man Grave Host | Expansion only after Rats/Omen vocabulary is proven readable; one or two durable charges, not another swarm. |
| Second Omen slot | Late keystone/experiment only; default remains one. |
| Rat interception | One printed card experiment only if subjects feel decorative; never default behavior. |
| Enemy-on-enemy redirection | Add after forecast/resolver trust and single-enemy fallback tests. |
| Generated cards | Add only with explicit recursion/draw limits and no new permanent collection layer. |
| More difficulty modes | Only if three settings fail accessibility needs. |

## Redundant or forbidden

- Character XP, levels, stats, HP/SP growth.
- Perk/skill trees.
- Equipment, weapons, armor, appraisal, curses.
- Gold, buy/sell, stock refresh, crafting materials.
- Consumables, ration/healing stockpiles.
- Persistent combat statuses and utility-spell buff upkeep.
- External Town, Inn, Temple, Training, and Camp maintenance loops.
- Selectable roster, party creation, formation administration, companions.
- Generic NPC disposition, reputation, stealing, attack, barter, kill simulation.
- Random step encounters, respawn farming, procedural campaign runs.
- Shared Energy, partner hand access, combo meter, reaction stack.
- Traditional relic-slot suite, metaprogression, crafting.

The budget favors more cards, encounters, puzzles, rooms, and interactions within these essential systems—not new menu categories.

---

# Part 23 — Final product contract

## CANONICAL

- OnyxLabyrinth is an authored first-person labyrinth adventure with tactical deck combat.
- The fixed campaign protagonists are **Old Man** and **Rat King**. There is no character creation, roster, selectable party, Reform Party, or companion system.
- New Game flows **Title → Prologue → Labyrinth entrance → Kept Gate → abyss bridge/Face → first physical refuge → exploration**.
- The Labyrinth is the entire gameplay world. Services, settlements, shops, camps, characters, cards, puzzles, and shortcuts are physical places inside it.
- Campaign combat is card combat. “Card Trial” is an internal/historical prototype name, not a separate campaign fiction.
- Each protagonist has a separate exact 12-card deck, collection, hand, discard, 3-Energy turn, and character identity. Decks may freely mix that protagonist's three schools.
- Old Man's schools are **Ashen Silence**, **The Last Hour**, and **Astral Conduit**.
- Rat King's schools are **Broodcraft**, **Crown of Dominion**, and **The Starving Crown**.
- The combat language centers on exact intents, Front/Back, Move, Barrier, Break, Opened, Hush, Crowned, Rats, Omen, Resonance, and recoverable Blood Price HP.
- Rat King broadly sets up public states and action geometry; Old Man broadly suppresses, predicts, and resolves them. Every setup has intrinsic owner value.
- The only combat-build progression layers are card collection/deck construction, one branching Mastery evolution per physical card instance, and one active keystone per protagonist.
- Old Man and Rat King remain at 40 max HP. Ordinary combat begins effectively full, victory fully restores, and no fight-local status persists.
- One hero at 0 HP is KO for the fight. Both at 0 restore the pre-encounter checkpoint and offer immediate Retry/Edit Deck/Leave.
- Campaign encounters are finite, authored, visible or clearly foreshadowed, and do not respawn. Hostile exploration targets 1–2 fights per 20 minutes.
- Exploration rewards gameplay: cards, Mastery opportunities, keystones, traversal tools, shortcuts, NPC state, and environmental understanding.
- Most cards have exact authored locations; a small minority use persisted curated regional choices. Routine victory does not open a random draft.
- Refuges are navigation/narrative/build anchors, not mandatory healing or shopping stops.
- Saves favor convenience: rolling autosave, three manual slots, Save & Quit, pre-fight checkpoints, and no concern about “save-scumming.”
- Internal `Character[]`, `GameState.party`, legacy IDs, floor IDs, and deprecated save fields may remain temporarily for migration. They do not define the player-facing product.

## RETIRED

- External Town gameplay loop and Town mode.
- Separate Camp and Game Over modes.
- Classic campaign combat once all entry types reach parity.
- Traditional spells/SP, XP, levels, stat/HP growth, perks, equipment, weapons, armor, gold, ordinary inventory, consumables, persistent buffs, corpse recovery, resurrection, and century-wipe gameplay.
- Random step encounters and encounter-rate/pity progression.
- Generic NPC Attack, Steal, Barter, Give, disposition, reputation, and kill simulation.
- Player-facing party/roster terminology where “duo,” “Old Man,” or “Rat King” is correct.

## DO NOT REINTRODUCE

- A selectable party, custom characters, roster management, or playable companions.
- Levels/gear/currency as a second dominant power curve.
- A town commute or required service return after ordinary combat.
- Punitive loss, corpse runs, lost currency/items, or replay of solved exploration.
- Random card drafts after every battle, procedural campaign runs, or account metaprogression.
- Crafting, generic relic slots, shared hero Energy/hands, combo meters, reaction stacks, hidden/random intents, accuracy rolls, blanket boss immunities, or status-icon proliferation.
- Combat-card requirements for environmental progression.
- Cards that are blank proprietary builders, resources with only one use, or upgrade branches distinguished only by numbers.

## TRANSITIONAL

- The fixed-duo refactor and first campaign card-combat lifecycle are already committed and are foundations to extend.
- Classic combat, Town/Camp/Game Over, legacy progression/economy, random encounters, and generic NPC systems remain implemented until replacements pass their gates.
- Valuable legacy art, sprites, VFX, audio, maps, encounters, choreography, and writing should be repurposed rather than discarded.
- Legacy saves must be migrated before deprecated fields and IDs are removed.

## DEFERRED

- Relics/charms.
- Grave Host or any seventh school.
- Default Rat interception.
- More than one Omen slot outside a late keystone.
- Generated-card packages, enemy-on-enemy redirection, and other high-complexity rules until the base six-school game passes human comprehension tests.
- Additional campaign/metagame modes beyond the nonprogressing Arena/Challenge surface.

## OPEN DESIGN QUESTIONS

There are no open product-architecture questions that block implementation. Remaining questions are content and tuning work:

- Exact card/enemy numbers after simulation and naive-human play.
- Final names/placements for the three traversal tools and some refuge anchors.
- Final region layouts, optional Threads, puzzle solutions, and card locations.
- Which deferred keystones/cards survive readability and dominance tests.

Those questions may tune the game described here. They may not quietly restore a retired system.
