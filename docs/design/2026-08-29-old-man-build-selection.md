# Old Man character-build selection

**Date:** 2026-08-29

**Status:** Canonical, additive to the two-hero card-pool architecture. Not a reopening of the deferred six-school system.

**Scope:** Old Man only. Rat King is unaffected and keeps his single fixed starter deck.

## Decision

New Game now presents three authored Old Man starting decks before any campaign state exists. The player picks one for a complete, immediately-understandable playstyle instead of learning one generalist twelve-card teaching deck.

This is a deliberate, narrow reversal of two lines in the product contract: "no character creation... no selectable roster" and "no player-facing school selection." It is not a general roster system, not a return of the deferred six schools, and does not change anything about how Old Man's collection works after New Game. One evolving collection, one active deck, exact 12 cards, two-copy cap, authored place-bound discoveries — all unchanged. The build only fixes what's *in* that collection on day one.

## Why this doesn't reopen the six-school question

The reintroduction gate in `two-hero-card-pools.md` requires the two-pool slice to pass human comprehension testing before six schools return. That gate is untouched:

- There is still exactly one owned collection per hero.
- There is no cross-deck movement, no school-bound legality, no mid-campaign school switch.
- The choice happens once, before the campaign begins, not as an ongoing player-facing system layered over combat.
- No new state noun was added. Every new card uses only Hush, Opened, Barrier, Omen, Energy, and Move — the same seven-noun vocabulary the contract already proves.

## The three builds

Each build is an exact 12-card starting deck: two copies of both Old Man universal basics (`distant-hand`, `pale-ward`), plus six identity cards.

### The Silent Ward — control

> Hush every threat, then finish what you've already turned off.

Two ways to apply Hush, two ways to profit from a target that's already Hushed, and one turn that Hushes the whole enemy formation. Low damage output, high control.

| Card | Cost | Text | Copies |
|---|---:|---|---:|
| `distant-hand` | 1 | Deal 5. Back: gain 3 Barrier. | 2 |
| `pale-ward` | 1 | Gain 7 Barrier. | 2 |
| `the-staff-speaks` | 1 | Deal 6. Hush next intent. | 2 |
| `veil-of-quiet` | 1 | Hush the target's next intent. Gain 3 Barrier. | 2 |
| `the-quiet-after` | 1 | Deal 3. Already Hushed: deal 5 more instead. | 2 |
| `silence-the-hall` | 2 | Hush every enemy's next intent. | 1 |
| `improvised-theorem` | 1 | Reveal 3 Arcane Responses for the target. Choose 1 and pay its printed cost. | 1 |

### The Last Hour — delay

> Open a target, arm the Omen, and let the countdown do the rest.

Every card here creates Opened or interacts with the one Omen slot. Trigger it early for immediate tempo, or hold it to cancel an enemy's intent outright before it happens.

| Card | Cost | Text | Copies |
|---|---:|---|---:|
| `distant-hand` | 1 | Deal 5. Back: gain 3 Barrier. | 2 |
| `pale-ward` | 1 | Gain 7 Barrier. | 2 |
| `the-threshold` | 1 | Arm an Omen: when the target acts, deal 7 before its intent. | 1 |
| `faultline` | 1 | Deal 5. Open the target. | 2 |
| `hasten-the-hour` | 1 | Armed Omen on the target: trigger it, then deal 3. Otherwise, deal 5. | 2 |
| `the-final-word` | 2 | Gain 5 Barrier. Armed Omen: gain 5 more. | 2 |
| `improvised-theorem` | 1 | Reveal 3 Arcane Responses for the target. Choose 1 and pay its printed cost. | 1 |

**Revision (2026-08-29, post-review):** shipped with two problems, fixed before wider use:

1. `the-threshold` at ×2 fought itself — Omen is a single global slot, and the engine already refuses a second `the-threshold` while one is armed (`cardDisabledReason` → "Omen slot occupied"). Drawing both copies in the same hand meant one was flatly unplayable. Cut to ×1.
2. `hasten-the-hour`'s no-Omen branch applied Opened, but **no card in this deck ever consumes Opened** (`full-stop`/`reckoning-strike`, the only Opened-consumers in the game at the time, both belong to The Reckoning). That branch was pure dead value on exactly the turn the Omen combo whiffs. Changed to a flat `deal 5` — self-contained, no downstream dependency — and the card's `opens` flag dropped to `false` to match.

The freed `the-threshold` slot became a second `the-final-word`, which reinforces the Omen payoff this build is actually about and gives it a defensive floor closer to the other two builds. Note `faultline` still applies Opened here and nothing in this deck consumes that either — left alone deliberately, since removing it would gut the deck's flat damage floor and adding an Opened-consumer would blur into The Reckoning's identity. `faultline`'s Opened application is inert in this build; it is kept purely for its 5-damage base rate.

### The Reckoning — burst

> Open the door, then walk through it at full force.

Big single-target payoffs built around consuming Opened: burn it for damage and commit to Front, or bank it for Barrier and fall back to Back. Every card in the deck touches the same door.

| Card | Cost | Text | Copies |
|---|---:|---|---:|
| `distant-hand` | 1 | Deal 5. Back: gain 3 Barrier. | 2 |
| `pale-ward` | 1 | Gain 7 Barrier. | 2 |
| `full-stop` | 2 | Deal 8. Consume Opened: deal 8 more to that enemy. | 2 |
| `marrow-divide` | 1 | Deal 4. Open the target. | 2 |
| `reckoning-strike` | 1 | Deal 5. Consume Opened: move to Front and deal 5 more. | 2 |
| `improvised-theorem` | 1 | Reveal 3 Arcane Responses for the target. Choose 1 and pay its printed cost. | 1 |

**Revision (2026-08-29, cross-hero combo review):** the deck's own "opener, then consume" sequence (`marrow-divide` → `reckoning-strike`) was flagged as a shrug, not a story, in [`2026-08-29-cross-hero-combo-catalogue.md`](2026-08-29-cross-hero-combo-catalogue.md) — the mandatory single line of play, run exactly as printed, with no decision at the payoff step. The deck's sole `brace-for-it` copy was cut for `reckoning-ward`, a new card mirroring `reckoning-strike` number-for-number (4→10 Barrier on consume vs. 5→10 damage) but banking Barrier and retreating to Back instead of dealing damage and advancing to Front. Consuming Opened is now a real choice between two opposite payoffs, not the deck's only option, and it also gives The Reckoning an internal defensive line instead of relying on one flat-Barrier card. `brace-for-it` is unaffected mechanically (still implemented, tested, dominance-checked) but is now unreachable in play — not in any build starter, and not an authored floor reward (`../campaign-card-rewards.ts`).

## Dominance checks performed before shipping

Every new card was checked against its build-mates and the two universal basics for the free-rider dominance pattern named in the 2026-08-29 combat-revision review (a card matching a baseline and adding a bonus with no cost). None found:

- `veil-of-quiet` trades `the-staff-speaks`' damage for Barrier — a real axis trade, not dominance.
- `the-quiet-after` only beats `the-staff-speaks` on an already-Hushed target; `the-staff-speaks` wins on a fresh one. State-dependent, not dominance.
- `hasten-the-hour`'s no-Omen branch (flat 5 dmg) matches `faultline`'s base rate at the same cost with no rider — a fair floor, since its upside is entirely in the Omen-trigger branch (3 + a banked 7).
- `the-final-word` (10 Barrier for 2, conditional) is below `pale-ward`'s 7-for-1 rate even at its ceiling; its niche is rewarding a banked Omen, not raw efficiency.
- `reckoning-strike`'s consume branch (10 total, forces Front) is deliberately worse in raw magnitude than `full-stop`'s consume branch (16 total, no position cost) — cheap-and-risky vs. expensive-and-safe, not one card beating the other outright.
- `reckoning-ward` mirrors `reckoning-strike` number-for-number (4→10 on consume vs. 5→10) but trades the payoff axis (Barrier, not damage) and the move direction (Back, not Front) — same shape, opposite intent, not a strictly better or worse version of the same card.

## Migration safety

Save data records `CampaignCardProgress.oldManBuildId`. A save with no such field (anything written before this feature existed) normalizes to build id `"legacy"`, which is a verbatim, never-edited copy of the exact starter deck Old Man always had:

`the-staff-speaks` ×2, `pale-ward` ×2, `faultline` ×2, `distant-hand` ×2, `improvised-theorem`, `full-stop`, `the-threshold`, `parting-word`.

This id is never offered on the selection screen — it exists only so `normalizeCampaignCardProgress`'s invalid-deck repair path falls back to the exact build a save was created with, never a different one. See `campaign-cards.test.ts`'s "Old Man build selection" suite for the regression coverage, including the specific scenario a naive migration would get wrong: an old save with no `oldManBuildId` field and an otherwise-valid deck must repair to the legacy list, not silently reset to a different build's cards.

## Implementation notes

- `src/game/old-man-builds.ts` owns the build data: `OldManBuildId`, `OLD_MAN_BUILD_STARTERS`, `OLD_MAN_BUILDS` (the three selectable defs with name/tagline/mechanics copy).
- `src/engine/old-man-build-select-ui.ts` is the New Game screen controller (`OldManBuildSelectController`), wired into `main.ts`'s `title.newGame` handler ahead of `createGameState()`. It follows the `PrologueController` ownership pattern: a real title-mode screen, not a `UiStack` overlay. Canceling (Esc) returns to Title with zero side effects, since no campaign state exists yet at that point.
- `controller-route.ts` gained one `BaseRouteKind` variant (`old_man_build_select`) with the same `assertUnhandledRoute` exhaustiveness guard every other base route has.
- The 7 new card definitions live in `src/game/card-trial/cards.ts` alongside the locked 24, clearly commented as build-exclusive and never added to `OLD_MAN_LIST`. `resolveCardEffect`, `cardPrimaryDamage`, `cardGuardGain`, and `cardConsumeRiderDamage` in `engine.ts` gained one case each; the manual Omen-trigger path used by `hasten-the-hour` reuses a `triggerOmenOn()` helper extracted from the existing automatic pre-intent trigger, not a parallel implementation.
- `cardOutcomeSummary()` in `card-trial-ui-model.ts` gained explicit forecast branches for all 7 cards. `hasten-the-hour`'s no-longer-opens after the revision above, so its forecast branch reports the flat damage directly rather than going through `plannedOpenerLabel()`.
- `CARD_ART_FILES` became `Partial<Record<CardId, string>>`; the 7 new cards have no art yet and fall back to the existing "reserved aperture" card-fill behavior already designed for unmapped ids. They render as a blank thumbnail on the build-select screen and in a real hand.
- Test coverage: `src/game/card-trial/old-man-build-cards.test.ts` (all 7 cards' rules, including the Omen-on-a-different-enemy edge case) and the "Old Man build selection" suite in `campaign-cards.test.ts` (starter construction, save round-trip, and the legacy-migration safety scenario above).
- Browser-verified end to end with `scripts/playtests/verify-old-man-build-select.mjs`: title → New Game → build-select screen (all three builds render, keyboard navigation updates the detail panel, thumbnails/costs/×2 badges display correctly) → confirm → prologue → town, with the chosen build's exact deck landing in `campaignCards` and zero console/page errors.

## Open items

- **Art.** The 7 build-exclusive cards have no production illustration. They are playable and forecast-correct with the placeholder fill; a future pass should commission art matching the existing card-art style guide.
- **Rat King.** No build choice yet, as scoped. A follow-up should design his three builds the same way once Old Man's are validated in play.
- **Balance.** These dominance checks are static analysis, the same caveat that applies to every other un-playtested card in this project — they are not a substitute for the human sessions the broader combat-revision review is waiting on.
