# Rat King build selection

**Date:** 2026-08-30

**Status:** Canonical, additive to the two-hero card-pool architecture. This
does not reopen the deferred six-school system.

## Decision

New Game presents three authored Rat King starting decks after the player
chooses Old Man's deck and before campaign state is created. The choice fixes
only Rat King's initial collection and active deck. Both heroes still have one
evolving collection, an exact twelve-card active deck, and a two-copy cap.

Arena keeps the locked `RAT_KING_LIST`; these campaign starters are not Arena
decks.

## The three decks

Every deck contains the five-card core: `nip`×2, `brace`×2, and
`fight-dirty`×1.

### The Nest (`nest`)

`litter`×2, `send-the-rat`×2, `last-litter`×1, `feed-the-king`×1,
`one-more-rat`×1.

The Rat is created, repositioned, and then spent for damage, Barrier, or a
fresh Rat. Each sacrifice is optional, so a hand with more than one payoff is
not a forced sequence.

### Open the Rank (`open-rank`)

`litter`×1, `from-the-dark`×2, `swarm-the-wound`×2,
`burst-the-nest`×2.

This is the revised version of the proposal. The original two
`open-the-rank` copies were replaced by one `litter` and one additional
`burst-the-nest`: `from-the-dark` is the reliable opener, while a consumed
Opened target can be cashed out either as focused damage or as a splash across
the other living enemies. The Rat producer also prevents the deck's Rat rider
from depending solely on a random Dirty Tricks result.

### King of the Heap (`king-of-heap`)

`tide`×2, `lunge`×2, `king-of-the-heap`×2, `king's-due`×1.

Tide is now `Deal 4. Gain 2 Barrier. Front: +2 damage.` King's Due is
`Deal 4. Crowned target: deal 8 instead.` The deck therefore has a real
choice between Front damage, Barrier, the two-Energy Heap payoff, and saving a
Crown for King's Due. Crown tribute remains conditional on the crowned enemy's
actual queued intent shape; this deck does not assume every enemy has a
non-row intent.

## Balance and distinction checks

- The Nest's Rat is a singleton. Drawing two producers is not a dead draw:
  the second `litter` still deals 4, and drawing multiple sacrifice cards is
  an option set rather than a requirement to consume the Rat immediately.
- Open the Rank's two opener copies are distinct from its two consume modes.
  `burst-the-nest` is a two-Energy splash commitment and is not strictly better
  than one-Energy `swarm-the-wound`'s focused line.
- King's Due is below `nip` on an uncrowned target (4 vs. 5) and above it on
  the crowned target (8 vs. 5), so its condition is a real tradeoff. Revised
  Tide is 4/6 damage plus 2 Barrier, while `nip` is 5 damage; neither strictly
  dominates the other. `king-of-the-heap` remains a two-Energy 7/10 damage,
  8-Barrier Crown card.
- Build B shares the broad Opened-then-consume shape of Old Man's Reckoning,
  but its splash rider, Rat producer, Back-row bite, and one-Energy focused
  consumer produce a different multi-enemy/subject-management decision.

## Migration and implementation

`CampaignCardProgress.ratKingBuildId` records the selection. Saves written
before this feature have no field and normalize to `legacy`, whose starter is
the verbatim pre-feature Rat King list. Invalid active decks fall back to the
starter identified by the saved build id. The serialized save shape advances
from v20 to v21 and assigns `legacy` while migrating v20 records.

The title flow is **Title → Old Man build selection → Rat King build selection
→ Prologue**. Esc from Rat King's screen returns to Old Man's screen; Esc from
there returns to Title. No campaign state is created until both choices are
confirmed.

The new card is intentionally unmapped in the card-art manifest and uses the
existing reserved card-fill fallback until an illustration is authored.
