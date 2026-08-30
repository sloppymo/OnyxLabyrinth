# Cross-hero combo catalogue

**Date:** 2026-08-29

**Status:** Reference. A validated set of turn-by-turn card sequences using only live vocabulary, plus the prompt methodology that produced them. Not product authority, not a rules change — every card and mechanic here already exists.

**Scope:** The 24 locked Rat King/Old Man cards, both draft pools (`dirty-tricks`, `arcane-responses`), and the three Old Man build-exclusive decks (see [`2026-08-29-old-man-build-selection.md`](2026-08-29-old-man-build-selection.md)).

## Why this exists

An LLM asked to "invent fun synergies" for a card game free-associates and tends to either invent new mechanics or restate an obvious combo (Faultline → Full Stop) as if it were a discovery. Treating it as a **closed-world puzzle** instead — fixed vocabulary, fixed turn structure, a forced output shape, and an explicit ban on new nouns — produces something checkable. This doc is the result of that pass plus this session's own verification of it against the actual source.

## The method (reusable)

Give a fresh model — different from the one that wrote the catalogue, or a clean chat with no design-doc context — a packet containing:

- Printed card text from `cards.ts` and `drafts.ts` (and the three Old Man builds if day-one lines matter).
- Turn rules in one paragraph: two initiative slots (Rat King, then Old Man, then enemies), 5-card hand, 3 Energy, one paid Move, one Opened, one Crown, one Rat boolean, one Omen slot.
- What each state actually does in the resolver: Hush halves the *current* intent's damage and clears when that intent resolves; Consume is locked pre-damage so a lethal base hit can't drop the rider; Litter's damage is unconditional, only the *spawn* is gated on no Rat existing.
- Illegal inventions: six schools, a second Rat, Mastery, relics, SP, Resonance, cards that move between decks, any new status noun.

Ask for a fixed shape per sequence — name, cards in order with who plays them and Energy remaining, battlefield before/after, one sentence on why it's interesting, what happens if the partner is Down, whether it needs a build or a discovered card — and three explicit classes with a quota (Banked, Same-hero burst, Draft spike), so the model can't just dump twenty Opened-then-Consume lines. Ban "new mechanic" and "wouldn't it be cool if." Require a setup turn and a payoff turn — "deal 8, Consume 8" on one card is a card, not a combination.

Judge it in two passes, and don't let the model score itself:
- **Taste pass** (a person, ~10 minutes): would you remember this line after the fight?
- **Machine pass**: force the sequence into a real fight via `assembleFight`'s `decks` override and check the actual event log — did Opened exist at payoff, did the draft option cost what it printed, did the second copy of a single-slot card no-op.

## Turn rules recap

Rat King and Old Man each get an independent 3-Energy turn with a 5-card hand drawn from their own 12-card deck. Cards read left to right per turn; multiple cards can be played by the same hero in the same turn as long as Energy allows. Initiative order is Rat King, then Old Man, then living enemies resolve their exact intents in turn-queue order.

## The thirteen sequences

### Banked (plant on one hero, spend on the other)

**1. Leftover crack** — Opening-hour, Last Hour, not fragile
Old Man: Faultline on A (1, →2 left). Rat King: Swarm the Wound on A (1, →2 left).
A takes 5, then 5+4; Opened created then consumed. *Grins because* the Last Hour build has no card of its own that can ever consume Opened — Rat King is the only one who can spend what Old Man plants. Partner Down: both cards are still flat 5s alone; the bonus is the only thing that needs the pair.

**2. Walk through the King's door** — Opening-hour, Reckoning
Rat King: Open the Rank on A (1, →2). Old Man: Reckoning Strike on A (1, →2).
A takes 4, then 5+5; Old Man moves to Front only because the consume fired. *Grins because* Consume here is a forced repositioning, not just a damage rider — contrast with Full Stop's plain 16. Partner Down: Open the Rank still Opens; Reckoning Strike still hits 5 and stays put with nothing to consume.

**3. Sand for the Quiet** — Opening-hour, Silent Ward, fragile (Pocket Sand is a 50/50 Safe)
Rat King: Fight Dirty → Pocket Sand on A (1+0, →2). Old Man: The Quiet After on A (1, →2).
A is Hushed and takes 8 (already-Hushed bonus); Rat King moves to Back. *Grins because* the King's free coin-flip trick is exactly Silent Ward's "already Hushed" condition, and it also pulls him out of the front line for free. Partner Down: Pocket Sand still Hushes and moves; Quiet After is a plain 3 without the Hush.

**4. Name him, then turn him down** — Discovery (`king-of-the-heap` isn't in the starter), needs Old Man on Staff
Rat King: King of the Heap on A, Front (2, →1). Old Man: The Staff Speaks on A (1, →2).
A is Crowned and Hushed, takes 16 total, King banks 8 Barrier. *Grins because* Crown decides who eats the next row-intent; Hush decides how hard it lands — you authored the incoming hit twice. Partner Down: Heap still Crowns, but the redirect needs the King alive to receive it; Staff still Hushes alone.

### Same-hero burst (legal, marked as not duo play)

**5. Hush is a damage card if you spend it now** — Opening-hour, Silent Ward
Old Man only: The Staff Speaks on A (1, →2), then The Quiet After on A (1, →1), same turn.
A takes 6 then 8, still Hushed until its own intent resolves. Must be the same turn — if A acts first, Hush is gone and Quiet After is a plain 3.

**6. Fire the clock yourself** — Opening-hour, Last Hour
Old Man only: The Threshold on A (1, →2), Hasten the Hour on A (1, →1).
Omen slot empties immediately; A takes 7 then 3. The delayed-strike card doubles as an on-demand burst if you're willing to spend the same turn on it.

**7. The slot is a shield** — Opening-hour, Last Hour — **machine-verified this session**
Old Man only: The Threshold on A (1, →2), The Final Word (2, →0).
Confirmed against the live resolver: Omen stays armed on A (`damage: 7`), Old Man's guard lands at exactly 10, A takes 0 from either card. *Grins because* you never fire the prophecy — the occupied Omen slot itself is the payoff, not a means to one. It also denies a second Threshold cast for as long as it sits there, which reads as a bug when it happens to you and a feature when you do it on purpose.

**8. Cheap consume, expensive Front** — Opening-hour, Reckoning
Old Man only: Marrow Divide on A (1, →2), Reckoning Strike on A (1, →1).
Opened created and consumed in the same turn; A takes 4 then 10; Old Man ends on Front with 1 Energy spare. Not actually fragile in the "needs prior state" sense — the setup is this sequence's own first card — but it's the deliberately cheaper, riskier sibling of Full Stop's 16-for-2. See #13 for why this is no longer the deck's only option at the payoff step.

**13. The door swings both ways** — Opening-hour, Reckoning — **new card, engine-verified this session**
Old Man: Marrow Divide on A (1, →2), then a choice: Reckoning Strike on A (1, →1) or Reckoning Ward on A (1, →1).
This is the fix for #8's "correct, not a story" verdict. `reckoning-ward` (new, replacing the deck's single `brace-for-it` copy — see [`2026-08-29-old-man-build-selection.md`](2026-08-29-old-man-build-selection.md)) mirrors Reckoning Strike number-for-number: 4 Barrier base, consume Opened for 6 more (10 total, same as Reckoning Strike's 5→10), but banks Barrier and retreats to Back instead of dealing damage and advancing to Front. *Grins because* the same opener now has two payoffs that consume the same Opened slot for opposite ends — walk through the door, or close it behind you — so the "cheap consume, expensive Front" line from #8 is now a decision with a real opportunity cost, not the deck's only move. Both branches were driven through `assembleFight`/`playCard` this session and hit exactly 4 / 14 cumulative Barrier and 4 / 10 damage respectively, matching their printed text.

### Draft spike (the free draft option is the third action)

Context options (Royal Ambush, Fracture Script) are never rolled — they're guaranteed every time their source card is drafted. Safe and Greedy options are each a 50/50 pick between two. Greedy options cost 1, so they can only be the spike if the draft source is played first or second, not third.

**9. Always-on coronation** — Opening-hour, all three cards are in the Rat King starter
Rat King: Litter on A (1, →2, spawns Rat since none existed), Open the Rank on A (1, →1), Fight Dirty → Royal Ambush on A (1+0, →0).
A ends Opened, Crowned, and bitten, having taken 4+4+3 — three different pieces of shared state landed on one locked target from cards a Floor 1 player already has. Partner Down: entirely Rat King; the Crown redirect still wants him alive for later intents.

**10. Lunge, then unsay it** — Opening-hour, fragile (Pocket Sand 50/50)
Rat King: Lunge on A (1, →2, moves to Front), Brace (1, →1), Fight Dirty → Pocket Sand on A (1+0, →0).
A is Hushed, Rat King ends on Back with 6 Barrier — the paid Front move from Lunge is revoked for free by the draft's Safe. If Pocket Sand doesn't come up, Royal Ambush (guaranteed) or Rat in the Sleeve are the fallback thirds.

**11. Crack from the theorem** — Opening-hour, Reckoning
Old Man: Distant Hand on A (1, →2), Pale Ward (1, →1), Improvised Theorem → Fracture Script on A (1+0, →0).
A is Opened via the free Context slot, not a spent Marrow Divide, banking 7 or 10 Barrier depending on row. *Grins because* it's a timing read, not a text collision — you use the free draft to Open and keep your real 2-cost payoffs (Full Stop, Brace for It) in hand for a later turn.

**12. Prophecy, then a coin-flip mute** — Opening-hour, Last Hour, fragile (Silence the Room 50/50) — **machine-verified this session**
Old Man: The Threshold on A (1, →2), Distant Hand on A (1, →1), Improvised Theorem → Silence the Room on A (1+0, →0).
Confirmed against the live event log: `omen-triggered` fires strictly before `hush-triggered`; A survives the Omen at 28 HP (35 after Distant Hand, minus 7); its own intent then resolves through Hush for `Math.ceil(5/2) = 3` instead of 5, exactly as claimed. Partner Down: still an Old Man-only line; if Fracture Script comes up instead of Silence the Room, A gets Opened instead — banked for the King later (see #1).

## Taste pass

| # | Verdict | Note |
|---|---|---|
| 1 Leftover crack | Grin | The "dead" Opened is the point |
| 2 Walk through the door | Grin | Front as a cost, not just a position |
| 3 Sand for the Quiet | Grin if Pocket Sand hits, else shrug | Real duo line, gated by a coin flip |
| 4 Name him, then mute | Grin | Needs the discovered card |
| 5 Staff → Quiet After | Grin for Silent Ward specifically | Same-hero only |
| 6 Fire the clock | Grin | |
| 7 Slot is a shield | **Best of the twelve** | Reframes a restriction as an asset; machine-verified |
| 8 Marrow → Reckoning Strike | Shrug (superseded by #13) | Correct, not a story, on its own |
| 9 Litter + Open + Ambush | Grin | Three states on one Floor-1 target |
| 10 Lunge then unsay | Grin if Sand hits | |
| 11 Theorem Opens | Grin (upgraded from an initial "shrug-plus") | Timing insight, not a text collision |
| 12 Omen + coin-flip Hush | Grin when Safe hits | Machine-verified sequencing |
| 13 Door swings both ways | Grin | Fixes #8; same shape, opposite payoff, real choice |

Explicitly excluded as tutorial noise, not combos: Marrow Divide → Full Stop, Open the Rank → Swarm the Wound. They're correct and dull.

## Verification notes (this session)

Checked every sequence against `cards.ts`, `drafts.ts`, `campaign-cards.ts`'s `CAMPAIGN_STARTER_DECKS`, and the live resolver in `engine.ts`. Findings:

- All card text, all Energy math, and all Opening-hour/Discovery labels check out exactly against source.
- The draft-pool structure claim (Context always guaranteed, Safe/Greedy each a 50/50 between two) is correct — confirmed against `DRAFT_POOL_SLOTS` in `drafts.ts`.
- Two inaccuracies found, neither corrupting an actual sequence: the packet's own stated rule "Litter does nothing if a Rat already exists" is wrong (the 4 damage is unconditional; only the spawn is gated) — harmless here since Litter is only used once, with no Rat yet in play. Sequence #8's "fragile" tag is a mislabel — its precondition is created by its own first card, same self-contained shape as #1/#2, not "needs state from outside this line."
- #7 and #12 — the two with the trickiest sequencing — were driven through the real engine via `assembleFight`/`playCard`/`resolveDraftChoice` and matched their claims exactly, including the precise Hush-halving arithmetic in #12. The scratch test used to verify this was not kept; the results are recorded above.

## Open items

- **Job 2 (invent one new card for the shrug pile) is done.** `reckoning-ward` was added and swapped into The Reckoning's starter deck in place of `brace-for-it`; see #13 and [`2026-08-29-old-man-build-selection.md`](2026-08-29-old-man-build-selection.md) for the full change and its one side effect (`brace-for-it` is now implemented but unreachable in play).
- This catalogue is opening-hour/early-collection focused by construction (11 of 13 sequences need nothing outside a Floor 1 starter, and the doc says so explicitly). A second pass restricted to discovered cards (`from-the-dark`, `burst-the-nest`, `send-the-rat`, `sever-the-thread`, `unlight`, `last-bastion`) was deliberately not run here.
- Not re-verified: the Crown-redirect claim in #4 ("the redirect needs the King alive to receive it") is plausible given Crown's tribute mechanic but wasn't driven through a fight this session.
