# Combat Bark Exposure Audit

Date: 2026-08-15  
Machine-readable source: [`docs/playtests/2026-08-15-combat-bark-exposure.json`](../playtests/2026-08-15-combat-bark-exposure.json)  
Runner: `npm run playtest:combat-barks`

## Method

The lab drives the real `resolveCombatRound` resolver with real `EnemyDef`s,
real party objects, real spell definitions, and independent seeded streams for
combat and bark selection. It does not model combat with a spreadsheet.

The final pass covered:

- 8 formations: six ordinary/family samples, Party That Returned, and the
  three-boss-throughline representative;
- 4 parties: balanced, physical-heavy, magic-heavy, defensive;
- 3 policies: chemistry-aware, naive/frontline, default/auto;
- 100 seeds per cell;
- 9,600 total fights;
- both the legacy bark path and the new library path in the same resolver.

Formation Chemistry is explicitly dormant on this branch. The chemistry-aware
policy therefore cannot demonstrate chemistry counterplay yet; that is a
scope boundary, not evidence that the eventual chemistry-aware player policy
has no value.

## Overall exposure

| Metric | Result |
| --- | ---: |
| Library opportunities | 518,633 |
| Eligible library opportunities | 378,460 |
| Library bark events selected/queued | 49,358 |
| Legacy bark events | 4,837 |
| Mean library events per fight | 5.14 |
| Mean legacy events per fight | 0.50 |
| Mean total bark events per fight | 5.65 |
| Opportunity-to-selection suppression | 90.5% |
| Fights with zero library events | 0 / 9,600 |
| Fights with four or more library events | 5,922 / 9,600 (61.7%) |
| Library line uses | 49,358 |
| Unique line keys exposed across cells | 2,529 cell-local exposures |
| Mean unique library lines per fight | 4.95 |

“Selected/queued” is the resolver-side displayed metric: the event was emitted
for the shared choreography. The renderer still has a final active-bark/window
collision guard, so the stage can drop a lower-priority event at an identical
timestamp. The real-stage preview and production smoke checks below verify the
actual paint path; future telemetry should add a renderer acknowledgement if
we need a single exact selected-versus-painted counter.

The zero-bark count is not a recommendation that every fight must speak. It is
an artifact of this matrix using profiles with combat-start or death pools.
The governor suppresses 90.5% of opportunities, and silent/vocalization-only
profiles remain eligible to produce no conventional speech.

## Displayed trigger distribution

Across all cells, the selected library events were:

| Trigger | Events |
| --- | ---: |
| death | 17,842 |
| basicAttack | 15,325 |
| combatStart | 9,600 |
| takeHit | 3,217 |
| criticalHit | 1,857 |
| bossPhase | 1,200 |
| healCast | 225 |
| healed | 38 |
| attackMiss | 36 |
| abilityUse | 18 |

This confirms the main exposure risk: death and ordinary attack lines dominate
what players hear. More content should not be added indiscriminately to rare
triggers such as `abilityUse`; the high-frequency basic/death pools are where
editorial restraint and later targeted rewriting matter most.

## Formation shape

The lab is an exposure instrument, not a balance certification. Its generated
party stats make the first two sample formations intentionally short, while
the frozen sample is a known high-attrition baseline formation. Representative
ranges across party and policy cells were:

| Formation | Mean rounds | Mean library events |
| --- | ---: | ---: |
| F1 skeleton line | 2.0 | 3.00 |
| F1 slime/skeleton | 2.0 | 3.00 |
| F2 warlock line | 2.0 | 3.00 |
| F3 construct line | 6.3–11.8 | 5.23–7.58 |
| F4 choir line | 6.3–11.5 | 5.00–7.77 |
| F5 frozen line | 15.3–20.0 | 7.82–10.99 |
| Party That Returned | 4.0–4.8 | 5.00–5.66 |
| Dead Boy boss sample | 5.8–10.7 | 4.70–6.69 |

The F5 HP-loss and round outliers are not a bark-driven balance change and
were not tuned here. They are recorded so a future content/balance pass does
not mistake the bark presentation experiment for an encounter rebalance.

## Priority and repetition findings

The first run found 2,400 instances of the Dead Boy’s `bossPhase` line
`"More."` across the matrix: two phase opportunities per 100-fight cell for
each applicable policy/party combination. The line is now
`oncePerCombat`; the rerun reduced boss-phase exposure to 1,200 and removed the
second identical beat from each fight.

The highest aggregate line counts after that fix are mostly a consequence of
the 9,600-fight cross-product, not 2,000 uses in one encounter. The meaningful
hotspots to watch in a single ordinary fight are:

- duplicated short skeleton death reactions when multiple instances share the
  profile;
- Priest basic-attack lines (`If I must.`, `Not my preference.`);
- Crusader basic-attack lines (`There.`, `For what it's worth.`);
- sparse enemy reactions such as `*groan*`, which should remain sparse rather
  than be expanded into sentences.

The runtime keeps exact-line recent history and suppresses most ordinary
opportunities. It is not yet a substitute for a renderer acknowledgement or a
long human session at real encounter composition.

## Knowledge payoff

No valid aware-versus-naive chemistry conclusion can be drawn from this branch:
all three policy rows run with Chemistry disabled, and therefore resolve the
same combat choices apart from the lab’s deliberately isolated policy hook.
This is explicitly reported rather than presenting identical rows as proof
that the future chemistry system is cosmetic.

For bark presentation itself, the policy governor is independent of player
policy. That is intentional: knowing the game should not be required to make
the dialogue system quiet.

## Follow-up thresholds

Before normal gameplay rollout, run a second exposure pass on actual Floor 1
encounter compositions after Chemistry supplies its event stream. Review:

1. painted rather than merely queued bark count;
2. barks per ten ordinary fights at normal speed;
3. repeated enemy-family death lines;
4. PC basic-attack line fatigue, especially Priest and Crusader;
5. whether chemistry telegraphs displace ordinary flavor rather than stack
   beside it.

The current evidence supports a controlled integration prototype with the
governor enabled. It does not justify bulk content expansion or a final claim
that the system is ready for every live encounter composition.
