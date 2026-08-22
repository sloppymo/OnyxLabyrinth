# Card Trial PoC — skeptical review / ten-fight brief

Review **this** prototype, not the withdrawn sixteen-ability wrapper.

Canonical spec: `docs/superpowers/specs/2026-08-21-card-trial-poc-design.md`  
Pointer: `docs/design/rat-king-old-man-card-trial.md`

## Job

Decide whether the locked loop is fun in OnyxLabyrinth’s combat scene. Do not invent Card #25. Do not reopen mixed hands, shared energy, intercepting rats in v1, campaign integration, or drafting.

## Locked loop (do not “fix” by replacing it)

- Two heroes, two decks, separate energy turns on initiative (draw 5, 3 energy, discard rest).
- Move is 1 energy, our Front/Back, empty row = miss. Card-printed movement does not consume the Move utility.
- Shared-row single-target: lowest current HP; HP tie → most recent entrant of that row.
- Guard until that hero’s next turn. Stay-in-row 2-costs exist so threatened Front can stay desirable.
- One Opened tag; only `Consume Opened` consumes it. Burst may consume with no other enemies; Cut the Line’s Consume exists only with a second enemy.
- Rat: one token, no intercept in v1.
- 40/40 HP, full restore between Arena fights.
- Exact intents with post-Guard / lethal readout. Fast/slow enemy slots, no initiative RNG in v1. An enemy advances its cycle after its slot resolves, including on an empty-row miss.

## Read

- `AGENTS.md`
- The spec above
- `docs/AGENT-READING-LIST.md` (status banners)
- If present on the checkout: Death/Birth worldbuilding, animation source maps (`feat/ai-player-harness`)

Art and those five docs may be missing on `main`. That is a checkout issue.

## Test

Run or table-play the **Cleaver 40 + Ash 22** triangle (spec §9) and the ten-fight plan (spec §10).

Ask:

1. Are there three plausible lines, or one answer?
2. Does Front stay desirable?
3. Does each deck work with the partner dead?
4. Is Opened a bonus, or a wait-for-Old-Man script?
5. Is 11 damage actually 11 at 40 HP?
6. Are five cards homework?

## Verdict

One of: proceed as written / proceed after number tweaks only / do not build this. No new systems to rescue a failed loop.
