# Current Product Contract

**Status: canonical as of 2026-08-27.** This document defines the product OnyxLabyrinth is becoming. It outranks older design notes, shipped legacy behavior, and sunk implementation cost whenever they disagree.

This is a **target contract**, not a claim that every transition below has already shipped. The [full product definition](design/2026-08-27-onyxlabyrinth-product-definition.md) contains the rationale, numeric targets, example content, contradiction audit, and migration plan. `AGENTS.md` remains authoritative for repository safety and implementation constraints.

## Product identity

> OnyxLabyrinth is an authored first-person labyrinth adventure in which Old Man and Rat King explore an impossible dungeon, discover cards and strange inhabitants, build interlocking character decks, solve spatial puzzles, and descend through increasingly impossible regions.

It is not Wizardry with an optional deckbuilder attached. It is not a roguelike run, a party-building RPG, a town-maintenance simulation, or a stack of parallel progression systems.

The four things the product must make exciting are:

1. the Labyrinth to explore;
2. cards to find;
3. combat to understand;
4. Old Man and Rat King to master.

Every surviving player-facing system must strengthen at least one of those four things without weakening the others.

## Canonical campaign

- The protagonists are the fixed duo **Old Man** and **Rat King**.
- There is no character creation, preset party, selectable roster, Reform Party, formation administration, or playable companion system.
- New Game follows **Title → Prologue → Labyrinth entrance → Kept Gate → abyss bridge and Face → first refuge → wider exploration**.
- The Labyrinth is the whole gameplay world. Settlements, services, camps, shops, characters, puzzles, cards, and shortcuts occupy physical places inside it.
- Player-facing areas are named regions rather than numbered content tiers. Internal floor IDs and stairs may remain.
- The opening bridge introduces the Face after the Kept Gate. The same Face appears again deeper in the Labyrinth without a definitive spatial explanation.
- The campaign is authored and persistent, not procedurally regenerated. Target length is 9–12 hours on the critical path and 12–16 hours for a curious first playthrough.

The campaign loop is:

> take bearings → choose a route → explore → discover a place, problem, person, card, or encounter → adapt both decks → win through coordinated card play → open a shortcut or deeper route → continue from the exact explored world state

Refuges create navigational and narrative rhythm. They are not mandatory trips for routine healing or inventory maintenance.

## Canonical combat

- Campaign combat uses the card-combat language proven by Card Trial. **Card Trial is a historical/internal prototype name; in the campaign this is simply combat.**
- Old Man and Rat King each have an independent exact **12-card deck**, draw pile, discard pile, five-card hand, and three-Energy turn.
- A round gives each living hero one turn and resolves enemies through visible, exact intents. Initiative may vary, but the next actions and targets remain readable.
- Player verbs are limited to **play a card, Move, Inspect, Pass, and Retreat when allowed**.
- Front and Back are tactical positions, not party-order administration. Moving costs one Energy and may trigger or fulfill card rules.
- Attacks do not use random accuracy rolls. The uncertainty comes from draw order, declared enemy behavior, and player choices.
- Summons occupy a small visible battlefield capacity. Rats are the only launch summon family.
- Trigger chains resolve through a bounded queue. Cards may not recurse indefinitely.

The shared visible combat language is deliberately small:

- **Intent** — the enemy's exact next action and target.
- **Front / Back** — position, reach, protection, and movement context.
- **Barrier** — temporary damage prevention.
- **Break** — a visible damage deadline on one current enemy intent; reaching it cancels that intent only.
- **Opened** — the singleton target created by three cracks. Each hero's first played damaging card against an already Opened target gains a fracture hit; Opened persists until moved, explicitly consumed, or its target dies.
- **Hush** — intrinsically weakens the next enemy intent; other rules may preserve, consume, or transform it.
- **Crowned** — one enemy is publicly designated as the King's subject, changing Rat targeting, Rat behavior, and Decree interactions.
- **Rats** — subjects with intrinsic end-of-round pressure and Crown awareness; they are useful before a command card arrives.
- **Omen** — a face-up delayed Old Man card in a visible slot that casts automatically when its stated condition occurs.
- **Resonance** — Old Man's Astral Conduit state; holding, crossing thresholds, routing, and consuming it have competing value.
- **Recoverable HP** — Rat King's Blood Price converts current health into visible debt that successful Devour play can restore during the same battle.

New effects should modify these states or create positional/intent transformations before inventing another status icon. Generic poison/burn/bleed stacks are not the foundation of the new combat system.

### Duo contract

Rat King broadly establishes public conditions, subjects, repeated hits, and action geometry. Old Man broadly suppresses threats, schedules consequences, and cashes out those conditions. The useful shorthand is:

> **Rat King sets them up. Old Man knocks them down.**

That shorthand is not one-way dependency. Old Man also protects Blood Price windows, Hushes dangerous retaliation, places Omens Rat King can fulfill, and changes timing so the King can command safely. Every setup mechanic must provide intrinsic value to its owner before its partner exploits it.

## Canonical protagonists and schools

Old Man is an occult controller, prophet, and catastrophic magician:

- **Ashen Silence** — Hush, intent suppression, seals, anti-magic, and control.
- **The Last Hour** — Omens, delayed resolution, prophecy, and conditional inevitability.
- **Astral Conduit** — Resonance, thresholds, Overchannel, and destructive astral magic.

Rat King is a grotesque sovereign whose body, subjects, and authority reshape the battlefield:

- **Broodcraft** — Rats, repeated pressure, commands, and sacrifice.
- **Crown of Dominion** — Crowned, Decrees, forced attention, movement, and royal control.
- **The Starving Crown** — Blood Price, recoverable health debt, Devour, and deliberately risky power.

Cards may freely mix the three schools belonging to their protagonist. Schools are overlapping mechanical identities, not six sealed decks. Bridge cards and duo interactions are expected. There is no neutral-card pool at launch.

## Canonical progression

There are exactly **three combat-build layers**:

1. **Cards and deck construction.** Find permanent character-specific cards and choose each protagonist's 12-card active deck. The collection is not a consumable inventory. A deck may contain at most two copies of one card definition.
2. **Mastery.** A played physical card instance earns at most one Mastery mark per victorious battle. At its rarity threshold it unlocks one of two functional evolutions. Branches change behavior, not merely numbers, and may be switched at a refuge or boss antechamber.
3. **Keystones.** Each protagonist equips exactly one earned rule-changing keystone. Keystones encourage a build without locking cards or schools.

The world also grants three major authored traversal tools. They open routes and reinterpret familiar spaces; they are world progression, not another combat-build layer.

Canonical progression rules:

- Old Man and Rat King remain at **40 max HP** throughout the campaign.
- There is no character XP, level, stat growth, HP growth, or SP.
- Cards are never permanently destroyed, lost on defeat, or consumed.
- Cards may not be freely duplicated. Authored duplicate finds respect the two-copy deck cap.
- Cards are removed from an active deck by editing it, not destroyed from the collection.
- Deck editing is available on any safe exploration tile; refuges, boss antechambers, and gauntlet entrances are guaranteed safe build points. The post-defeat retry screen is also a deliberate exception.
- The campaign has no dominant relic layer. Relics/charms are deferred and should not be added unless cards plus keystones demonstrably fail to create enough build depth.

The first hour guarantees **six meaningful new cards: three for each protagonist**. Across the campaign, reward placement should be approximately 45% direct world discovery, 20% puzzles/secrets, 15% bosses or unusual combat outcomes, 10% NPC interactions, and 10% persisted curated regional choices. Routine victories do not produce a three-card random draft.

## Canonical exploration and puzzles

- Exploration is primary play, not travel between fights.
- Regions require memorable landmarks, spatial contrast, authored spectacle, optional danger, hidden spaces, and meaningful loops.
- A newly penetrated branch should usually reconnect to a known anchor within 12–20 minutes. Major regions contain at least two meaningful shortcuts.
- Discovered refuges eventually form a limited travel network. Fast travel is refuge-to-refuge only and does not erase local route learning.
- Cards, keystones, traversal tools, shortcuts, people, and understanding are the important exploration rewards.
- Cards should be remembered by place: an observatory, drowned chapel, impossible bridge, sealed nursery, or strange bargain.
- Puzzles use orientation, observation, sound, light, line of sight, height, recurring symbols, enemies, and spatial memory. Colored key-to-door matching is supporting grammar, not the dominant language.
- Main-path puzzles are readable and forgiving. Harder puzzles chiefly protect optional cards, keystones, shortcuts, lore, and unusual encounters.
- Combat cards are never mandatory overworld keys. Traversal tools may solve world problems because they are guaranteed authored acquisitions.
- Puzzle failure costs seconds or changes local state; it does not consume scarce resources or require long replay.

## Canonical encounters and bosses

- Random step encounters, pity counters, and invisible encounter-rate zones are retired.
- Campaign enemies are finite, authored, visible or strongly foreshadowed, and do not respawn during ordinary play.
- In hostile exploration, target **one to two battles per 20 minutes**, normally two. Quiet discovery stretches may contain none; climactic stretches may contain more.
- Early fights target 2–3 minutes, standard fights 3–5, elites 6–9, and bosses 10–15.
- A full campaign target is roughly 32 expected path fights, 12 optional fights, five minibosses, and three major bosses, subject to playtest tuning.
- Optional fights advertise disproportionate rewards. Cleared routes stay cleared.
- Bosses are authored tactical exams with readable phases and rule changes. They may reduce repeated control, accelerate under lockdown, or convert excess control into another consequence; they do not become immune to Hush, Crowned, movement, summons, or the player's build identity.

When blocked, the player can change both decks, inspect the enemy, try another route, find another card, solve an optional challenge, or learn the fight. Grinding XP or respawning trash is never the answer.

## Canonical health, failure, and saving

- Every ordinary encounter captures the last stable pre-fight tile/facing/world state, sets both heroes to 40 HP, and clears old fight-local state before the first draw.
- Victory fully restores both heroes and clears all fight-local statuses, Rats, Omens, Resonance, and Blood Price debt.
- When one hero reaches 0 HP, that hero is KO for the rest of the battle and takes no future turns; previously placed objects follow their explicit KO rules. Crown remains without redirect/tribute, Rats remain without Ready/volley, and an armed Omen may still resolve. The other hero may still win. There is no ordinary resurrection card or item.
- When both heroes reach 0 HP, the pre-encounter snapshot is restored immediately. **Retry** reconstructs the same undefeated encounter, **Edit Decks and Retry** changes the build first, and **Leave** returns control at the restored tile with the enemy still present.
- Losing a boss follows the same rule. Boss intros may be shortened after the first attempt.
- Defeat never loses cards, Mastery, currency, items, solved exploration, or time spent commuting.
- Explicit gauntlets may persist HP across two or three announced fights. They restore 10 HP to each living hero between fights, return a KO'd hero at 10 HP, checkpoint at the gauntlet entrance, stage rewards until completion, and retry locally.
- The game maintains a rolling exploration autosave, a pre-fight checkpoint, and three manual save slots. Save & Quit is available outside combat.
- Closing mid-combat resumes at the pre-fight state, not halfway through a random hand. Closing during exploration resumes from the latest autosave with world state intact.
- Save convenience is not an exploit concern. Difficulty comes from decisions.

## Canonical refuges, NPCs, and services

- Town mode is replaced by physical inhabited places inside the Labyrinth.
- **Hot Boi's Tavern** is a recurring refuge, rumor exchange, social landmark, and build-safe point—not a mandatory inn heal.
- **Namanda's chapel** interprets strange objects and consequences, provides an in-world keystone review/equip surface, and hosts authored spiritual interactions—not resurrection or status maintenance.
- **Isobel's Iso-Spells** offers a small authored card/service catalog, such as a persisted card choice, Mastery branch work, or a specific transformation. There is no rotating filler inventory.
- Camps are small one-time or evolving expedition scenes, not a separate Camp mode.
- NPC interaction uses authored dialogue, specific exchanges, conditional consequences, recurrence, and movement between known locations.
- Generic Attack, Steal, Barter, Give, disposition meters, faction reputation, and kill persistence are retired as universal systems. Violence or theft may occur only as authored story choices with explicit consequences.
- A lightweight **Threads** journal records named mysteries, favors, last clues, and resolved outcomes. It does not contain levels, chores, objective spam, or “kill 12 rats” tasks.

## Canonical economy and inventory

- **Gold: no.**
- **Weapons, armor, and ordinary equipment: no.**
- **Consumable stockpiles: no.**
- **Ordinary loot inventory and encumbrance: no.**
- **Relic slots: no at launch.**
- Keys, inscriptions, puzzle objects, story objects, and traversal tools survive in an automatic key-object journal and cannot be sold, dropped, or consumed accidentally.
- Exchanges use authored costs: another object, a route consequence, a mutually exclusive card choice, a solved favor, or a specific sacrifice. There is no disguised universal secondary currency.

## Retired systems

The following are retired as product concepts even while some remain in transitional code:

- external Town gameplay loop and Town mode;
- separate Camp and Game Over modes;
- classic campaign combat and classic spell/technique progression;
- XP, levels, stats as growth, HP/SP growth, perk trees;
- equipment, weapons, armor, gold, ordinary inventory, consumables;
- persistent post-combat buffs and long-term attrition;
- corpse recovery, resurrection maintenance, century-advance-on-wipe, and wipe-to-town punishment;
- random step encounters, encounter pity, respawn farming, and procedural runs;
- generic social simulation and universal hostile NPC verbs;
- player-facing party, roster, and formation-management terminology.

Useful art, maps, sprites, VFX, audio, choreography, encounters, characters, and writing from retired modes should be repurposed. Retiring a system is not an instruction to throw away its authored assets.

## Do not reintroduce

Do not add any of the following without first replacing this contract through an explicit product decision:

- selectable characters, custom protagonists, roster management, or playable companions;
- levels, gear, gold, relic collections, or metaprogression as parallel power curves;
- town commuting or mandatory maintenance after ordinary fights;
- punitive defeat, corpse runs, resource loss on retry, or replay of solved exploration;
- random post-fight card drafts as the main reward stream;
- procedural campaign structure, crafting, or account-wide progression;
- shared hero Energy, shared hands, partner-card access, combo meters, or reaction stacks;
- hidden/random enemy intents, random accuracy, blanket boss immunities, or status-icon proliferation;
- combat-card checks that gate required environmental progression;
- proprietary setup tokens that do nothing before their payoff, resources with only one use, or upgrades that only add a number;
- a seventh school, broader summon zoo, or another progression layer before the six-school game passes human comprehension and dominance testing.

## Transitional implementation reality

The canonical target must be migrated safely rather than pretended into existence:

- Commit `f2100d9` locked the runtime campaign to Old Man and Rat King.
- Commit `1cf4560` established the first campaign card lifecycle: dungeon encounter → card battle → victory → persistent card reward → return to the exact dungeon state → save/load.
- Classic combat, Town/Camp/Game Over, XP/perks/equipment/gold, random encounters, persistent spells, and generic NPC simulation still exist in the repository. Their presence is migration debt, not permission to extend them.
- The current campaign adapter is a foundation to harden. Every encounter entry type, boss path, failure path, reward path, save migration, and return path must reach parity before its legacy equivalent is deleted.
- Internal `Character[]`, `GameState.party`, class names, historical enemy IDs, floor IDs, and deprecated save fields may remain temporarily for compatibility. They are not player-facing product definitions.
- `old-man` and `rat-king` are stable protagonist IDs. Legacy saves normalize to the duo; do not widen that compatibility contract casually.
- Arena may survive as a nonprogressing challenge and test surface. It does not own campaign fiction or an independent balance economy.
- Legacy assets should be moved into physical refuges, authored encounters, and card combat before their obsolete screen controllers are removed.

Migration order is: stabilize the existing duo/card lifecycle; build and human-test the opening vertical slice; implement the six-school declarative rules; migrate all combat entry types; migrate saves and durable progression; replace hubs and random pacing; rebuild authored rewards; then delete unreachable legacy code.

## Deferred, not promised

- Any relic/charm layer.
- Default Rat interception.
- More than one Omen slot except through a tested late keystone.
- Grave Host or any seventh school.
- Generated-card packages, enemy-on-enemy targeting, and other high-complexity rule families.
- Campaign-affecting challenge modes, New Game Plus, daily runs, or metaprogression.

There are no unresolved product-architecture questions blocking implementation. Remaining open work is content and tuning: exact card/enemy numbers, final traversal-tool names and placements, region layouts, puzzle solutions, authored card locations, and which deferred card ideas survive testing. Those questions may tune this game; they may not quietly restore a retired one.
