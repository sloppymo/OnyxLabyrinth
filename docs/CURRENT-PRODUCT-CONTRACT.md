# Current Product Contract

**Status: canonical as of 2026-08-27.** This document defines the product OnyxLabyrinth is becoming. It outranks older design notes, shipped legacy behavior, and sunk implementation cost whenever they disagree.

This is a **target contract**, not a claim that every transition below has already shipped. The [full product definition](design/2026-08-27-onyxlabyrinth-product-definition.md) contains the rationale, numeric targets, example content, contradiction audit, and migration plan. The [two-hero card-pool decision](design/2026-08-27-two-hero-card-pools.md) supersedes its older six-school/card-architecture sections for current campaign work. `AGENTS.md` remains authoritative for repository safety and implementation constraints.

## Product identity

> OnyxLabyrinth is an authored first-person labyrinth adventure in which Old Man and Rat King explore an impossible dungeon, discover cards and strange inhabitants, build interlocking character decks, solve spatial puzzles, and descend through increasingly impossible regions.

It is not Wizardry with an optional deckbuilder attached. It is not a roguelike run, a party-building RPG, a town-maintenance simulation, or a stack of parallel progression systems.

The four things the product must make exciting are:

1. the Labyrinth to explore;
2. cards to find;
3. combat to understand;
4. Old Man and Rat King to master.

Every surviving player-facing system must strengthen at least one of those four things without weakening the others.

## Canonical first-campaign card architecture

The first campaign implementation uses **one evolving, hero-owned card pool per protagonist**. This is a deliberate simplification of the deferred six-school design, not a return to the legacy spell list.

- Old Man and Rat King each have a persistent collection and an active deck. A “set of cards for each character” means an editable collection, not one immutable deck.
- Cards have an explicit owner: `old-man` or `rat-king`. There is no player-facing school selection, neutral pool, Open/Bound/Regalia legality, or cross-deck movement in the first campaign slice. The starting build selections below are not school selection: they only pick the *starting* contents of each hero's one collection, which then evolves through discovery exactly as described here.
- The frozen Card Trial path keeps its exact 12-card active decks, five-card draw, three Energy, and paid Move. A larger deck cap is an uncommitted later tuning question, not a reason to block the slice.
- Cards are found in authored places and meaningful encounters, remain permanently in the owning hero’s collection, and may be swapped into or out of the active deck at safe build points.
- Card text must be useful when the partner is Down. Duo synergy should come from shared battlefield state and timing, not from cards that are blank without the other hero.
- Internal authoring notes may group cards by control, delay, burst, brood, dominion, or hunger. Those groups are not player-facing schools and do not create deck-selection rules.

Two source cards add a deliberately bounded risk/reward verb without creating a second
progression system:

- **Fight Dirty** (Rat King) reveals three temporary Dirty Tricks; the player chooses one
  for the current target and the other two vanish.
- **Improvised Theorem** (Old Man) reveals three temporary Arcane Responses; the player
  chooses one for the current target and the other two vanish.

The choices are sampled without replacement from small authored pools, are shown together,
do not enter either deck or discard pile, cannot recurse into another draft, and resolve
before the hero can take another action. This is a combat decision surface, not a random
post-fight reward screen.

The first slice proves only the smallest coherent card language: **Barrier, Front/Back, Opened, Rats, Crowned, Hush, and one Omen slot**. Resonance/SPENT, Magnitude/Overchannel, Blood Price debt, Ready/Spent Rat lifecycle, Mastery, cross-deck access, Regalia, and player-facing six-school selection are deferred until the two-pool combat loop passes human testing.

## Canonical starting build selection

**Added 2026-08-30. This is a deliberate, narrow reversal of the earlier blanket "no character creation" and "no player-facing school selection" language for the two fixed protagonists.**

New Game presents exactly three authored Old Man starting decks and then exactly three authored Rat King starting decks before any campaign state exists. The player picks one for each hero; each choice fixes only that hero's *starting* collection/active deck. Everything downstream is unchanged: one evolving collection per hero, one active deck per hero, authored place-bound discoveries, exact 12-card decks, and the two-copy cap. Choosing a build is not selecting a school, is not creating a character, and does not gate which cards either hero can later discover.

- Old Man's three builds are **The Silent Ward** (Hush/control), **The Last Hour** (Opened/Omen), and **The Reckoning** (Opened-consuming burst). Each is an exact 12-card starting deck built from eight unique definitions, two universal Old Man basics (`distant-hand`, `pale-ward`) plus build-specific cards and signature cards that use only the already-live card vocabulary — Hush, Opened, Barrier, Omen, Energy, Move.
- Rat King's three builds are **The Nest** (Rat production and sacrifice), **Open the Rank** (Opened focus and splash), and **King of the Heap** (Front, Crown, and Barrier). Each is an exact 12-card starting deck built from the five-card Rat King core (`nip`×2, `brace`×2, `fight-dirty`×1) plus seven identity cards. The build-specific cards use only Rat, Opened, Crown, Front/Back, Barrier, Energy, and the bounded Dirty Tricks draft; `king's-due` is a conditional Crown payoff, not a new status system.
- Build-exclusive signature cards are never added to `OLD_MAN_LIST` and never appear in Arena; Arena keeps fighting with the original locked 12-unique-card PoC deck.
- A save records both choices (`CampaignCardProgress.oldManBuildId` and `CampaignCardProgress.ratKingBuildId`). A save written before this feature existed has no Rat King field and is treated as build id `"legacy"` — the exact fixed starter deck Rat King already had — so no existing save's deck is silently rewritten. The same legacy fallback remains for Old Man.
- This is not a reopening of the six-school system: there is still exactly one owned collection per hero, no cross-deck movement, and no school-bound legality. See the school-selection line above.
- Full design rationale, all six decks' exact card lists, and the dominance/balance checks performed before shipping are in [`design/2026-08-30-rat-king-build-selection.md`](design/2026-08-30-rat-king-build-selection.md) and [`design/2026-08-29-old-man-build-selection.md`](design/2026-08-29-old-man-build-selection.md).

## Canonical campaign

- The protagonists are the fixed duo **Old Man** and **Rat King**.
- There is no preset party, selectable roster, Reform Party, formation administration, or playable companion system. **Exception (added 2026-08-30):** New Game lets the player choose one of three authored starting decks for each fixed protagonist — see "Canonical starting build selection" below. These are one-time starting-collection choices, not character creation, a roster, or a companion system.
- New Game follows **Title → Old Man build selection → Rat King build selection → Prologue → Labyrinth entrance → Kept Gate → abyss bridge and Face → first refuge → wider exploration**. Build selection runs once, before any campaign state exists; canceling either screen returns to the preceding selection (or Title) with no campaign side effect.
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

### First-slice combat boundary

The destination combat vocabulary below describes possible future content. For the first campaign slice, only Intent, Front/Back, Barrier, Opened, Hush, Crowned, Rats, and one Omen slot are in scope. Do not make the deferred Astral, Blood Price, Mastery, school-selection, or cross-deck systems reachable from the campaign entry point. The live slice should prove two hero-owned decks and this compact core language before adding another progression or resource layer.

The shared visible combat language is deliberately small:

- **Intent** — the enemy's exact next action and target.
- **Front / Back** — position, reach, protection, and movement context.
- **Barrier** — temporary damage prevention.
- **Break** *(post-slice)* — a visible damage deadline on one current enemy intent; reaching it cancels that intent only.
- **Opened** — the singleton target created by three cracks. Each hero's first played damaging card against an already Opened target gains a fracture hit; Opened persists until moved, explicitly consumed, or its target dies.
- **Hush** — intrinsically weakens the next enemy intent; other rules may preserve, consume, or transform it.
- **Crowned** — one enemy is publicly designated as the King's subject, changing Rat targeting, Rat behavior, and Decree interactions.
- **Rats** — subjects with intrinsic end-of-round pressure and Crown awareness; they are useful before a command card arrives.
- **Omen** — a face-up delayed Old Man card in a visible slot that casts automatically when its stated condition occurs.
- **Resonance** *(post-slice)* — Old Man's Astral Conduit state; holding, crossing thresholds, routing, and consuming it have competing value.
- **Recoverable HP** *(post-slice)* — Rat King's Blood Price converts current health into visible debt that successful Devour play can restore during the same battle.

New effects should modify these states or create positional/intent transformations before inventing another status icon. Generic poison/burn/bleed stacks are not the foundation of the new combat system.

### Duo contract

Rat King broadly establishes public conditions, subjects, repeated hits, and action geometry. Old Man broadly suppresses threats, schedules consequences, and cashes out those conditions. The useful shorthand is:

> **Rat King sets them up. Old Man knocks them down.**

That shorthand is not one-way dependency. Old Man also protects dangerous Rat King lines, Hushes retaliation, places Omens Rat King can fulfill, and changes timing so the King can command safely. Future Blood Price windows must follow the same rule. Every setup mechanic must provide intrinsic value to its owner before its partner exploits it.

## Canonical protagonists and card identities

Old Man is an occult controller, prophet, and catastrophic magician. His current card pool is organized around three non-player-facing identities:

- **Ashen Silence** — Hush, intent suppression, seals, anti-magic, and control.
- **The Last Hour** — Omens, delayed resolution, prophecy, and conditional inevitability.
- **Astral Conduit** — Resonance, thresholds, Overchannel, and destructive astral magic.

The live Old Man teaching deck uses these canonical card IDs and names:

| ID | Name |
| --- | --- |
| `the-staff-speaks` | The Staff Speaks |
| `pale-ward` | Pale Ward |
| `faultline` | Faultline |
| `marrow-divide` | Marrow Divide |
| `full-stop` | Full Stop |
| `sever-the-thread` | Sever the Thread |
| `the-threshold` | The Threshold |
| `distant-hand` | Distant Hand |
| `parting-word` | Parting Word |
| `unlight` | Unlight |
| `last-bastion` | Last Bastion |
| `improvised-theorem` | Improvised Theorem |

These IDs replace the retired prototype names in campaign decks, rewards, art
paths, and test fixtures. No compatibility aliases are maintained. Barrier is
the player-facing name for temporary damage absorption; the Card Trial
implementation may retain internal `guard` field/event names until that
internal vocabulary is migrated separately.

Rat King is a grotesque sovereign whose body, subjects, and authority reshape the battlefield. His current card pool is organized around three non-player-facing identities:

- **Broodcraft** — Rats, repeated pressure, commands, and sacrifice.
- **Crown of Dominion** — Crowned, Decrees, forced attention, movement, and royal control.
- **The Starving Crown** — Blood Price, recoverable health debt, Devour, and deliberately risky power.

The names above are authoring lenses only for the current campaign. Do not expose school selection, school-bound deck legality, nine school pairings, or cross-deck card movement until a later contract revision explicitly reintroduces them. The first campaign has one owned card pool per hero, with cards discovered and edited directly.

## Canonical progression

There are exactly **three eventual combat-build layers**, but only Cards are in the first campaign slice:

1. **Cards and deck construction.** Find permanent cards owned by one protagonist and choose that hero’s exact 12-card active deck for the first slice. The collection is not a consumable inventory. A deck may contain at most two copies of one card definition.
2. **Functional card upgrades (DEFERRED).** A card may eventually take one named behavior-changing branch. No card XP or repetition reward is part of the current campaign slice.
3. **Keystones (DEFERRED).** A later slice may add a small number of permanent rule-changing keystones. They are not required to prove the two-pool card loop.

The world also grants three major authored traversal tools. They open routes and reinterpret familiar spaces; they are world progression, not another combat-build layer.

Canonical progression rules:

- Old Man and Rat King remain at **40 max HP** throughout the campaign.
- There is no character XP, level, stat growth, HP growth, or SP.
- Cards are never permanently destroyed, lost on defeat, or consumed.
- Cards may not be freely duplicated. Authored duplicate finds respect the two-copy deck cap.
- Cards are removed from an active deck by editing it, not destroyed from the collection.
- Deck editing is available on any safe exploration tile; refuges, boss antechambers, and gauntlet entrances are guaranteed safe build points. The post-defeat retry screen is also a deliberate exception.
- The campaign has no dominant relic layer. Relics/charms are deferred and should not be added unless cards plus later keystones demonstrably fail to create enough build depth.

The first hour guarantees **six meaningful new cards: three for each protagonist**. Across the campaign, reward placement should be approximately 45% direct world discovery, 20% puzzles/secrets, 15% bosses or unusual combat outcomes, 10% NPC interactions, and 10% persisted curated regional choices. Routine victories do not produce a three-card random draft.

### Deferred six-school content

The six-school document and `src/game/card-trial/six-school-cards.ts` remain useful experimental material, but they are **not current campaign authority**. They must not drive school selection, cross-deck legality, a six-school reward table, Mastery, or a campaign resolver while the two-pool slice is being proven. Their 36 definitions are a preserved design checkpoint, not a shipping card count.

## Canonical exploration and puzzles

- Exploration is primary play, not travel between fights.
- Regions require memorable landmarks, spatial contrast, authored spectacle, optional danger, hidden spaces, and meaningful loops.
- A newly penetrated branch should usually reconnect to a known anchor within 12–20 minutes. Major regions contain at least two meaningful shortcuts.
- Discovered refuges eventually form a limited travel network. Fast travel is refuge-to-refuge only and does not erase local route learning.
- Cards, future keystones, traversal tools, shortcuts, people, and understanding are the important exploration rewards.
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
- Victory fully restores both heroes and clears all fight-local statuses, Rats, and Omens. Deferred resource systems must not leak out of combat.
- When one hero reaches 0 HP, that hero is KO for the rest of the battle and takes no future turns; previously placed objects follow their explicit KO rules. Crown remains without redirect/tribute, Rats remain without Ready/volley, and an armed Omen may still resolve. The other hero may still win. There is no ordinary resurrection card or item.
- When both heroes reach 0 HP, the pre-encounter snapshot is restored immediately. **Retry** reconstructs the same undefeated encounter, **Edit Decks and Retry** changes the build first, and **Leave** returns control at the restored tile with the enemy still present.
- Losing a boss follows the same rule. Boss intros may be shortened after the first attempt.
- Defeat never loses cards, currency, items, solved exploration, or time spent commuting.
- Explicit gauntlets may persist HP across two or three announced fights. They restore 10 HP to each living hero between fights, return a KO'd hero at 10 HP, checkpoint at the gauntlet entrance, stage rewards until completion, and retry locally.
- The game maintains a rolling exploration autosave, a pre-fight checkpoint, and three manual save slots. Save & Quit is available outside combat.
- Closing mid-combat resumes at the pre-fight state, not halfway through a random hand. Closing during exploration resumes from the latest autosave with world state intact.
- Save convenience is not an exploit concern. Difficulty comes from decisions.

## Canonical refuges, NPCs, and services

- Town mode is replaced by physical inhabited places inside the Labyrinth.
- **Hot Boi's Tavern** is a recurring refuge, rumor exchange, social landmark, and build-safe point—not a mandatory inn heal.
- **Namanda's chapel** interprets strange objects and consequences, provides an in-world card-removal surface, and hosts authored spiritual interactions—not resurrection or status maintenance.
- **Isobel's Iso-Spells** offers a small authored card-discovery or card-editing surface. There is no rotating filler inventory and no school-selection screen.
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
- XP, levels, stats as growth, HP/SP growth, perk trees, and card Mastery;
- equipment, weapons, armor, gold, ordinary inventory, consumables;
- persistent post-combat buffs and long-term attrition;
- corpse recovery, resurrection maintenance, century-advance-on-wipe, and wipe-to-town punishment;
- random step encounters, encounter pity, respawn farming, and procedural runs;
- generic social simulation and universal hostile NPC verbs;
- player-facing party, roster, and formation-management terminology.

Useful art, maps, sprites, VFX, audio, choreography, encounters, characters, and writing from retired modes should be repurposed. Retiring a system is not an instruction to throw away its authored assets.

## Do not reintroduce

Do not add any of the following without first replacing this contract through an explicit product decision:

- selectable characters, custom protagonists, roster management, or playable companions beyond the one exception named above (Old Man's three authored starting-deck choices, which is not a roster or a companion system);
- levels, gear, gold, relic collections, or metaprogression as parallel power curves;
- town commuting or mandatory maintenance after ordinary fights;
- punitive defeat, corpse runs, resource loss on retry, or replay of solved exploration;
- random post-fight card drafts as the main reward stream;
- procedural campaign structure, crafting, or account-wide progression;
- shared hero Energy, shared hands, partner-card access, combo meters, or reaction stacks;
- hidden/random enemy intents, random accuracy, blanket boss immunities, or status-icon proliferation;
- combat-card checks that gate required environmental progression;
- proprietary setup tokens that do nothing before their payoff, resources with only one use, or upgrades that only add a number;
- a seventh school, broader summon zoo, or another progression layer before the two-pool campaign slice passes human comprehension and dominance testing. Reintroducing the six-school experiment also requires an explicit contract revision.

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

Migration order is: stabilize the existing duo/card lifecycle; define the two hero-owned card pools; build and human-test the opening vertical slice; add only the proven core card rules; migrate all combat entry types; migrate saves and durable progression; replace hubs and random pacing; rebuild authored rewards; then delete unreachable legacy code. Revisit six-school content only after this slice passes.

## Deferred, not promised

- Any relic/charm layer.
- Default Rat interception.
- More than one Omen slot except through a tested late keystone.
- Player-facing six-school selection, school-bound deck rules, cross-deck cards, Regalia, and the 60-card school corpus.
- Mastery/card XP as a progression layer.
- Resonance/SPENT, Magnitude/Overchannel, Blood Price debt, Ready/Spent Rat lifecycle, Break/Seal, and other advanced school-only mechanics until the core two-pool slice passes.
- Grave Host or any seventh school.
- Unbounded/generated-card packages as progression or rewards, enemy-on-enemy targeting,
  and other high-complexity rule families. The two bounded in-combat drafts named above
  are canonical and do not count as a second progression layer.
- Campaign-affecting challenge modes, New Game Plus, daily runs, or metaprogression.

No unresolved product-architecture question blocks the current two-pool implementation. The explicit future question is whether a player-facing six-school layer earns reintroduction after human testing. Remaining open work is content and tuning: exact card/enemy numbers, final traversal-tool names and placements, region layouts, puzzle solutions, authored card locations, and which deferred card ideas survive testing. Those questions may tune this game; they may not quietly restore a retired one.
