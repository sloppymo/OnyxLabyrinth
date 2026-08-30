# Card Trial session notes

Sprint A gate requires three to five human sessions on the repaired catalogue before Sprint B. This file is the protocol those sessions must fill. **Do not invent session results.** As of 2026-08-29 the implementation agent completed automated and browser verification only.

## Sprint A status

- Automated: `npm run build`, `npm test`, campaign/engine/UI-model/simulator suites, production sim seeds 1–10 with **0 draft timeouts**.
- Browser: `scripts/playtests/card-trial-sprint-a-verify.mjs` (card play, draft pick, routine vs authored pending rewards, collection swap).
- Review of load-bearing Sprint A fixes (draft soft-lock, positional-id migration, collection cap, 8/12 starters): **closed**. Sprint B not started.
- Human sessions: **not run**. Sprint B stays blocked.

## Expected confirmations (not new bugs)

Sprint A kept live permanent numbers. Log these as confirmations or Sprint B evidence, not fresh defects:

- Testers defaulting to The Staff Speaks (Deal 6 + Hush) or never noticing Tide’s Front +3 is evidence for the Sprint B reprice, not a new finding.
- A second Litter doing nothing is the live one-Rat Boolean (`if no Rat exists`). Sprint B is the row/summon rewrite that addresses it.

The production sim’s 100/100 wins is a **measurement problem**, not a catalogue pass. Zero timeouts proved drafts can finish a fight. A suite where every seed wins cannot discriminate decks, so it cannot validate a Sprint B reprice until it includes seeds that lose. It also runs campaign starters against Arena `ENCOUNTERS`, not Floor 1 formations — it is not measuring what these human sessions play.

## Session protocol

Play the **campaign** starter decks (eight unique / twelve physical per hero), not the Arena unique-12 lobby lists. Use New Game, then real Floor 1 fights. At least one session should include Fight Dirty or Improvised Theorem so a draft actually opens.

Record one block per tester:

Session ID:

Tester experience level:

Fights played:

### Sprint A questions (required)

Whether players understand Opened creation versus consumption:

Whether they preserve Opened deliberately:

Whether a discovery causes an active-deck edit (Collection only until they swap):

Whether draft options feel like bargains rather than random failure:

Whether Hush, Omen, and Crown are readable:

Whether the opening hand and five-card draw feel manageable:

### Observed behavior

First hesitation:

First Move:

First Hold-I:

Opened understanding:

Consume understanding:

Targeting:

Turn clarity:

Observed confusion:

Observed delight:

Moments they felt stuck:

Telemetry anomalies:

### Tester explanations

What did Front/Back mean?

What did Opened mean?

What did Consume mean?

How did they decide to Move?

### Follow-up classification

BUG:

POLISH:

DESIGN QUESTION FOR HUMANS:

BALANCE QUESTION FOR HUMANS:

## Do not start Sprint B if

Drafts still deadlock, saves lose decks, or authored rewards still feel like random card drops. Human answers above are the remaining Sprint A gate.
