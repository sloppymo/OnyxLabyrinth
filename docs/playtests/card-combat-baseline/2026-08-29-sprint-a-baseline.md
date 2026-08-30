# Sprint A historical baseline (before starter-deck changes)

**Captured:** 2026-08-29, working tree with the live 24-card catalogue, drafts, and simulator. Production decks at capture time were still twelve unique definitions per hero (`RAT_KING_LIST` / `OLD_MAN_LIST`). These figures become historical the moment campaign starters change.

## Focused Vitest

Command: `npx vitest run src/game/card-trial/engine.test.ts src/game/campaign-cards.test.ts src/game/campaign-card-trial.test.ts src/engine/card-trial-ui-model.test.ts src/game/card-trial/sim --reporter=verbose`

Result: **15 files, 105 tests, 0 failures.** Raw log: `2026-08-29-focused-tests.txt`.

(The design note’s “75 tests” was an earlier slice of this same surface.)

## Production simulator (obsolete after Sprint A)

Command: `npm run card-trial:sim -- --config scripts/playtests/card-trial-experiments/production.ts --seeds 1:10 --policy threat-aware --out docs/playtests/card-combat-baseline/production-threat-aware-1-10`

Policy: `threat-aware`. Seeds `1:10`. Ten locked Arena encounters. Full output under `production-threat-aware-1-10/`.

| Encounter | Wins | Wipes | Timeouts |
|---|---:|---:|---:|
| Two Lights | 3 | 0 | 7 |
| Cleaver and Ash | 2 | 0 | 8 |
| Mixed Medium | 0 | 0 | 10 |
| Slow Brute | 1 | 0 | 9 |
| Busy Three | 1 | 0 | 9 |
| Hard Pair | 1 | 0 | 9 |
| Many Intents | 1 | 0 | 9 |
| Both Rows | 1 | 0 | 9 |
| Named Mark | 1 | 0 | 9 |
| The Heap | 0 | 0 | 10 |
| **Total** | **11** | **0** | **89** |

Mean paid moves is 0 on every encounter. Mean hero turns cluster around 2–3.6 before timeout. This is **not** a balance result: headless `legalActions()` still offers Pass while a draft is open, and Pass cannot close the draft, so a drawn source card deadlocks the run.

Do not compare later Sprint A win rates to these numbers. Regenerate after draft picks are first-class actions and production decks come from `activeCampaignDeck(createCampaignCardProgress())`.

## Sprint A regenerated production sim (obsolete the 89-timeout table)

**Captured:** 2026-08-29, after first-class draft picks, 8/12 campaign starters, and authored rewards.

Command: `npm run card-trial:sim -- --config scripts/playtests/card-trial-experiments/production.ts --seeds 1:10 --policy threat-aware --out docs/playtests/card-combat-baseline/sprint-a-production-threat-aware-1-10`

Policy: `threat-aware`. Seeds `1:10`. Ten locked Arena encounters, campaign starter instance ids. Full output under `sprint-a-production-threat-aware-1-10/`.

| Encounter | Wins | Wipes | Timeouts |
|---|---:|---:|---:|
| Two Lights | 10 | 0 | 0 |
| Cleaver and Ash | 10 | 0 | 0 |
| Mixed Medium | 10 | 0 | 0 |
| Slow Brute | 10 | 0 | 0 |
| Busy Three | 10 | 0 | 0 |
| Hard Pair | 10 | 0 | 0 |
| Many Intents | 10 | 0 | 0 |
| Both Rows | 10 | 0 | 0 |
| Named Mark | 10 | 0 | 0 |
| The Heap | 10 | 0 | 0 |
| **Total** | **100** | **0** | **0** |

These are still not a human-feel result. Zero timeouts is the Sprint A result that mattered: the sim can reach the end of a fight. **100/100 wins with 0 wipes cannot discriminate a good deck from a bad one**, so this suite cannot validate any Sprint B reprice until it includes seeds that lose. It also runs campaign starter decks against Arena `ENCOUNTERS`, not Floor 1 formations, so it is not measuring the fights humans will play.

