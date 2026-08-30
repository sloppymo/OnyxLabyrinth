# OnyxLabyrinth — Two-Hero Card Pools

**Date:** 2026-08-27  
**Status:** Canonical interim card architecture for the first campaign slice  
**Companion:** [`../CURRENT-PRODUCT-CONTRACT.md`](../CURRENT-PRODUCT-CONTRACT.md)  
**Deferred reference:** [`2026-08-26-card-trial-six-school-system.md`](2026-08-26-card-trial-six-school-system.md)

## Decision

The first campaign implementation has **one evolving, hero-owned card pool per protagonist**:

- Old Man owns an Old Man collection and active deck.
- Rat King owns a Rat King collection and active deck.
- Cards are discovered in the Labyrinth, not selected from six starting schools.
- Cards remain permanently in their owning hero's collection.
- Deck editing moves cards between that hero's collection and active deck.
- The first playable campaign slice uses exact 12-card active decks, matching the frozen Card Trial path.

“One set of cards for each character” means an editable collection with an active deck, not one immutable list and not a return to the legacy spell catalogue.

This decision deliberately defers the player-facing six-school model. The six school names and the existing 36-card catalogue remain valuable authoring and experimentation material, but they are not current campaign legality rules, starting choices, or resolver authority.

## Product goals

The first campaign card system must prove four things before it grows:

1. A player understands why Old Man and Rat King have different cards.
2. Each hero can play a useful turn when the partner is Down.
3. The best turns cross the two separate initiative slots through shared battlefield state.
4. Finding a card in a physical place feels like exploration progression rather than a random reward screen.

The system is successful when a player can explain both decks in plain language and can describe a memorable card discovery by location.

## What is canonical now

### Card ownership

Every campaign card has an explicit owner:

```ts
type CampaignCardOwner = "old-man" | "rat-king";
```

The owner is data, not an inference from prose. A card's rules may refer to shared battlefield state, but the card is still collected and edited by one hero.

The first slice has no:

- player-facing school selection;
- school-bound legality rules;
- neutral/Open card pool;
- Regalia cards;
- cross-deck card movement;
- partner-card borrowing;
- nine school-pairing setup screen.

Those are deferred experiments, not hidden launch rules.

### Deck and collection rules

- Each hero starts with a fixed 12-card teaching deck. The current teaching decks use
  distinct card definitions, including one bounded tactical-draft source per hero.
- The frozen Card Trial path remains exactly 12 active cards, five-card draw, three Energy, and one paid Move.
- A campaign card may have at most two physical copies in one active deck.
- Cards are never permanently destroyed, lost on defeat, or consumed as an exploration resource.
- The Collection has no artificial capacity and is separate from the active deck.
- A card removed from an active deck returns to its owner's Collection.
- Swapping is free at legal build points. The player does not need to sell, discard, or duplicate cards.
- A later deck-size expansion to 10–16 is a tuning question. It is not part of the first-slice contract and must not change the frozen Card Trial test path.

### Core campaign card vocabulary

The first slice should prove only this compact card language:

- **Barrier** — the single temporary damage-absorption state.
- **Front / Back** — the shared positional decision.
- **Opened** — a shared singleton enemy condition created and consumed by card play.
- **Rats** — Rat King's visible subjects with intrinsic end-of-turn pressure.
- **Crowned** — Rat King's visible subject designation and target-priority rule.
- **Hush** — Old Man's visible intent-suppression rule.
- **Omen** — one visible delayed Old Man card slot.

### Bounded tactical drafts

Two live source cards add a controlled gamble inside combat:

- **Fight Dirty** reveals three Dirty Tricks for Rat King's current target.
- **Improvised Theorem** reveals three Arcane Responses for Old Man's current target.

The player chooses one visible option. The options are temporary, sampled without
replacement from a five-card authored pool, and resolve immediately; unchosen options
vanish and none can enter a deck, discard pile, collection, or another draft. Choices are
not post-fight rewards and cannot be chained recursively.

Do not add a second shield noun. `Guard`, `Ward`, `Block`, and `Armour` are not additional mitigation states. `Ward` or `Brace` may remain card names or fiction, but their mechanical result is Barrier.

The following remain outside the first-slice boundary until the core two-pool loop passes human testing:

- Resonance or SPENT;
- Magnitude and Overchannel;
- recoverable Blood Price debt;
- Ready/Spent Rat lifecycle;
- Break and Seal as additional timing machinery;
- Mastery or card XP;
- functional branch-upgrade economy;
- keystone loadouts;
- unbounded/generated-card packages as progression or rewards;
- cross-deck access and Regalia.

The exact future vocabulary may be revisited one mechanic at a time. It must not arrive as a six-school bundle.

## Character card identities

Schools are not player-facing in this phase. Designers may still use these internal lenses when authoring cards.

### Old Man

The Old Man's pool is an occult spellbook organized around three readable behaviors:

- **Control:** Hush, Barrier, and changing the consequence of an enemy intent.
- **Delay:** Omens that provide immediate value and resolve when a visible condition occurs.
- **Catastrophe:** expensive, high-impact attacks that reward correct timing and Opened setup.

Old Man should prefer Back for ordinary exchanges, but some cards may make a deliberate Front commitment worthwhile. His cards must remain playable without Rat King support.

### Rat King

Rat King's pool is a royal vermin arsenal organized around three readable behaviors:

- **Brood:** summon and coordinate Rats that matter before any command card is played.
- **Dominion:** Crown an enemy, manipulate target priority, and create predictable setup for the Old Man.
- **Hunger:** take deliberate short-term risks for tactical power. The first slice may represent this with ordinary HP payment; a recoverable debt system is deferred.

Rat King should prefer Front, but his pool must include a safe line when he cannot remain there. Every summon and command needs an intrinsic no-Rat or low-Rat fallback.

### Duo rule

The shared battlefield is the relationship between the pools:

> Rat King establishes public conditions. Old Man changes their consequence.

That is a shorthand, not a dependency requirement. Both decks must have a solo floor, and every setup card must do something useful before its partner exploits it.

## Card design rules

Every first-slice card must satisfy all of the following:

1. It has a complete, useful effect without waiting for a partner.
2. Its text uses only mechanics that are live in the slice or clearly labels a deferred rider.
3. It has a deterministic forecast that matches resolution.
4. It creates a meaningful choice involving damage, Barrier, position, target, timing, or Opened.
5. It remains legal and understandable when the partner is Down.
6. It has a specific presentation event when it changes a visible state.

Avoid cards that only generate a private counter, only grant a numerical bonus, or only become useful after a six-school pairing is selected.

## Acquisition and rewards

Cards remain exploration rewards:

- named chests and hidden rooms;
- puzzles and environmental discoveries;
- NPC trades and favors;
- authored miniboss or boss rewards;
- unusual combat outcomes when a designer deliberately wants a fight to point toward a card.

Routine encounters do not open a generic three-card reward draft. A reward names its owner
and is added to that hero's Collection atomically after victory. The only current three-card
drafts are the two named in-combat source cards above.

The first hour should deliver roughly six meaningful new card instances, three for each hero, spaced so the player learns one new behavior at a time. The first slice does not need the eventual campaign total; a smaller authored pool is preferable until the card loop is understood.

## Progression boundary

The first campaign slice has one active build layer: cards and deck construction.

Functional card upgrades and keystones remain possible future layers, but they are deferred until base card choices pass comprehension and dominance testing. Mastery/card XP is not part of this interim architecture and must not be introduced as a substitute for weak card design.

No levels, XP, equipment, gold, consumables, relic collection, or parallel numerical power curve may be added to compensate for the smaller card pool.

## Implementation boundary

The existing `src/game/card-trial/six-school-cards.ts` catalogue is preserved as deferred experimental material. It is not the campaign card source for this phase.

The first campaign card catalogue should be a separate, small, explicit source with:

- stable card id;
- owner;
- cost;
- target shape;
- player-facing text;
- structured domain-specific effects;
- optional future upgrade metadata, if present but unreachable;
- presentation/event hints where needed.

Do not make the resolver infer ownership or schools from card text. Do not build a universal effect DSL to support deferred mechanics. Implement the smallest domain-specific effect vocabulary that expresses the first slice and shares one compiled representation between forecast and resolution.

## Acceptance slice

The first campaign proof should contain:

- Old Man and Rat King with distinct 12-card active decks;
- at least one authored card discovery for each hero;
- one card that creates Opened and one that consumes it;
- one Old Man Hush card and one visible Omen;
- one Rat King summon card and one Crown card;
- Barrier previews and exact enemy intents;
- a real placed encounter entered from the dungeon;
- victory, reward persistence, exact dungeon-state return, and save/load;
- defeat retry without card loss;
- deck editing at a safe location.

It does not need school selection, six-school balance, cross-deck movement, Mastery, Resonance, SPENT, Blood Price debt, or a final campaign-sized catalogue.

## Reintroduction gate

The six-school system may be reconsidered only after the two-pool slice has:

- passed a naive-human comprehension test;
- shown that both decks have a satisfying solo floor;
- demonstrated several memorable cross-turn duo interactions;
- produced stable forecast/resolution parity;
- established a reward cadence and deck-editing rhythm;
- shown that the smaller card vocabulary is insufficient for meaningful build variety.

If schools return, they should begin as internal authoring tags or a small content expansion. Player-facing school selection and cross-deck legality require a new explicit product decision.
