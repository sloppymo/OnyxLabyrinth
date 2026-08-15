# Formation Chemistry final adversarial audit

Date: 2026-08-15  
Authority: `docs/superpowers/specs/2026-08-14-formation-chemistry-synthesis.md` at `64a4cc50c723bb4b1dd3466ff3659b4b55ffd321`  
Implementation branch: `feat/formation-chemistry`  
Verified baseline: `11573958c9a69875317ef952f660ee01dc707420`  
Audit began at: `7fd0ff1c16ec3b45ca3a243973ac818f40d72d22`

## Executive result

**PASS WITH TUNING**

The implementation now conforms to the frozen chemistry contracts, and the feature is substantially
more readable and less interruptive than the old Floor 1 encounter rhythm. The deterministic lab also
shows that chemistry knowledge improves ten-fight expedition outcomes. It is not a clean PASS because
three of the five resource signatures are usually countered before their payoff in the isolated policy
traces, while the rare Guarded Bomb formation is a large difficulty spike for naive and magic-heavy
parties. Those are experience risks, not type-check or resolver failures.

The answer to the primary question is therefore: **yes for readability and exploration rhythm; partly
for tactical depth and memorability; not yet uniformly for organic signature payoff.**

## Repository identity

The audit was run in `/home/sloppymo/OnyxLabyrinth-formation-chemistry-implementation`, not the current
checkout or any experimental worktree. The implementation started from the clean baseline above, on
`feat/formation-chemistry`. The final audit commits are:

- `1012054` — harden chemistry commitment guards and repair AoE guard telemetry.
- `da44ffd` — make the chemistry lab reproducible and target authored counterplay resources.
- `2b2b0bc` — soften the Floor 1 forge variants after measured wipes.
- `7fd0ff1` — restore the legacy Arena roster outside random chemistry.
- `5459194` — persist per-fight chemistry trace metrics.
- `3b9c641` — let the debug fixture surface honor explicit combat fixtures.
- The final report commit is the commit containing this file; the exact final SHA is recorded by the
  final `git rev-parse HEAD` in the handoff.

No experimental implementation branch was cherry-picked wholesale. No push or merge was performed.

## Frozen-contract checklist

| Contract | Result | Evidence |
| --- | --- | --- |
| Compatibility is authored narrow groups or explicit IDs | Pass | `selectorMatches` has no broad-tag path; enemy tests reject untagged future undead/ooze resources. |
| Resource disability does not invalidate passive ammunition | Pass | Candidate filtering removes only dead and reserved instances; the chemistry test consumes a paralyzed resource. |
| Exact resource, partner, and target IDs commit through wind-up | Pass | Primitive tests inspect committed IDs; stale and duplicate reservations are rejected. |
| Dead resource/partner/target breaks without retargeting | Pass | Round and per-turn tests assert Combo Break/fizzle and no replacement selection. |
| Committed use remains spent on break | Pass | `chemistryUses` remains incremented in actor/resource/target interruption tests. |
| Consumption choreography and later-action suppression | Pass | Dedicated consume events, `removalCause: "consumed"`, death-sweep tests, and renderer scenes. |
| Original rewards once; summoned rewards zero | Pass | Reward tests cover XP and gold; trace CSV separates normal and summoned bodies. |
| Fight-wide summon cap 4, row cap 3, delayed summon turns | Pass | Primitive tests cover all three, including no same-beat turn insertion. |
| Guard is bounded, direct-only, non-recursive, and visible | Pass | Attack/spell/technique/ambush, multi-hit, status-only, AoE, death/disable/expiry, preview, and marker tests. |
| Pack Strike reserves both living actors and prevents double action | Pass | Initiative tests cover round/per-turn ordering, partner invalidation, and reservation. |
| Spawn Bomb is immediate but not Mage's first action | Pass | Ability condition is `notFirstTurn`; summon/bomb caps and browser fixture were inspected. |
| Floor 1 alone uses `.05 / 14 / 34 / 52` | Pass | Floor validation/tests plus one-million-step seeded distribution. |
| Floors 2–5, bosses, scripted, NPC, safe zones, and perks remain neutral | Pass | Full `npm run check`, floor validators, save tests, and unchanged fallback path. |
| Arena remains outside random chemistry | Fixed and pass | Audit found Arena reading the new F1 table; `ARENA_ENCOUNTER_TABLES` restores the legacy roster and tests lock it. |
| Family anti-repeat is session-only and resets correctly | Pass | Three-family weighting/fallback and floor/load reset tests. |

## Final Floor 1 roster

The active roster has 16 entries with total weight 33. The two relief candidates are removed rather than
replaced:

| Entry | Family | Weight |
| --- | --- | ---: |
| `f1-acid-burrow` | acid-anchor | 2 |
| `f1-red-bone-bounty` | red-bone | 2 |
| `f1-orc-leap` | orc-pack | 5 |
| `f1-minotaur-slime` | slime-cannon | 2 |
| `f1-ogre-toss` | ogre-toss | 1 |
| `f1-warlock-bone-battery` | bone-harvest | 2 |
| `f1-living-shield` | living-shield | 2 |
| `f1-hunting-pack` | hunting-pack | 2 |
| `f1-spawn-bomb` | spawn-bomb | 2 |
| `f1-rune-overload` | rune-overload | 2 |
| `f1-guarded-bomb` | guarded-bomb | 1 |
| `f1-wraith-pincer` | wraith-pincer | 2 |
| `f1-gaze-slime` | gaze-slime | 2 |
| `f1-flame-forge` | forge-line | 1 |
| `f1-solo-guardian` | solo-guardian | 2 |
| `f1-ghostfire-duet` | ghostfire-duet | 3 |

`f1-slime-cluster` was removed: 100-seed policy traces produced no Split timing or meaningful board
control; the default line was simply “hit one of three weak Slimes.” `f1-bone-archer-line` was removed:
Archer pressure did not resolve before Archer death and Skeletons did not create a durable Archer-versus-
line decision. The 40%/20% values were treated as investigation heuristics, not pass/fail gates.

## Deterministic combat lab

The lab drives the actual round resolver, not a spreadsheet model:

- 16 active formations × 4 party archetypes × 3 policies × 100 seeds = 19,200 fights.
- 2 removed relief scenarios × 4 archetypes × 3 diagnostic policies × 100 seeds = 2,400 fights.
- 4 route heat profiles × 3 expedition modes × 100 ten-fight expeditions = 1,200 expeditions.
- 33,040 per-fight trace rows were emitted, including the required formation/family/seed/policy,
  result, KO count, rounds, enemy actions, per-member HP loss, SP, consumables, kill order, chemistry
  lifecycle, ability uses, guards, AoE bypasses, summons, normal/summoned consumption, XP, and gold.

Aggregate evidence is in `2026-08-15-formation-chemistry-phase8.json` and `.md`. The full 15 MB CSV is
generated at `docs/playtests/2026-08-15-formation-chemistry-phase8-traces.csv`; it is deliberately kept
as an audit artifact rather than added to the source commit. Two independent N=10 runs matched byte for
byte after generated timestamps were removed.

## Knowledge payoff

The same seeded travel streams were compared across chemistry-aware, default, and no-chemistry-control
policies. Balanced ten-fight expedition results:

| Route | Chemistry-aware | Default | No-chemistry control | Aware final HP / pressure |
| --- | ---: | ---: | ---: | --- |
| normal | 76/100 completed | 70/100 | 71/100 | 48.9% / 51 |
| quiet | 85/100 | 79/100 | 77/100 | 60.4% / 46 |
| dead-rate zone | 87/100 | 82/100 | 76/100 | 57.4% / 50 |
| hot | 86/100 | 75/100 | 78/100 | 55.7% / 55 |

Aware play improves completion and lowers return-to-town pressure in every route. It is not cosmetic at
expedition scale. The same data also says the overall expedition guardrail is still demanding: normal
routes have 51/100 pressure traces and hot routes 55/100 even under the aware policy.

## S-tier scorecard

### Slime Cannon

- Mechanically correct: yes. Exact Slime commitment, no retarget, poison payoff, removal beat, and fizzle
  tests pass.
- Tactical impact: meaningful counterplay. Balanced HP loss fell from 4.6% naive to 2.3% aware and the
  first kill changed from Minotaur to Slime.
- Organic payoff: low in this lab. Aware traces broke 70/100 and resolved 0/100 because the policy killed
  the committed resource. That is successful counterplay, but it makes the bespoke payoff rare.
- Presentation: clear in Canvas and Phaser: live Slime, cannon banner, arc/impact, poison, and removal.
- Repeated-play concern: resource-first becomes rote if every exposure ends before the cannon can resolve.

### Hunting Pack

- Mechanically correct: yes. Exact Werewolf partner, shared target, partner reservation, convergence, and
  initiative parity tests pass.
- Tactical impact: currently weak in isolated traces. Aware and default balanced HP loss was 2.7% versus
  2.0%, with 0/100 resolved aware and 66/100 broken; the first-kill identity changed to Werewolf but the
  fight outcome barely moved.
- Presentation: clear convergence and shared target in both renderers; no partner double-action observed.
- Repeated-play concern: likely to read as “kill either hound” rather than a meaningful cooperation puzzle
  unless organic fights last long enough for the signature to matter.

### Spawn Bomb

- Mechanically correct: yes. First Mage action is not Bomb, exact Spawn consumption, immediate AoE, caps,
  and no summon/consume loop pass tests.
- Tactical impact: moderate. Preemptive Spawn cleanup is especially valuable in Guarded Bomb; standalone
  `f1-spawn-bomb` aware/default balanced loss was identical at 8.5% and both broke 69/100.
- Presentation: strongest immediate read in the browser: short SPAWN BOMB banner, correct Spawn flash,
  party-wide impacts, and the consumed body disappears.
- Repeated-play concern: good once, potentially rote if the first action discovery never matters after the
  player learns to remove Spawn immediately.

### Living Shield

- Mechanically correct: yes. Balanced tests recorded 94/100 guard resolutions and 5 breaks.
- Tactical impact: strongest isolated result. Balanced loss dropped from 18.0% naive to 14.7% default/aware;
  direct hits are intercepted while status-only and AoE bypasses remain available.
- Presentation: marker, guarded target, preview text, INTERCEPT event/banner, and AoE bypass were viewed
  in Canvas and Phaser. The caster remains selectable.
- Repeated-play quality: good, provided the UI marker remains visible before every action selection.

### Rune Overload

- Mechanically correct: yes. Exact construct charge, live killable battery, delayed lightning, consume beat,
  and battery-break tests pass.
- Tactical impact: currently weak in the short isolated traces. Aware/default both killed the Construct
  first and resolved 0/100; standalone balanced loss was 2.8% aware/default.
- Presentation: clear tether/CHARGED state, construct collapse, lightning discharge, correct aliases, and
  no corpse lookup failure in both renderers.
- Repeated-play concern: the battery decision is legible, but the fight often ends before it becomes a
  decision rather than a tutorial presentation.

## Difficulty shape and tuning

The lab found two concrete balance defects and they were fixed:

1. The original F1 Forge values produced balanced naive 80.1% HP loss and magic-heavy naive 86.3% loss,
   with 2.58 and 3.02 average KOs respectively. The explicit F1 construct/golem variants were softened.
   Final balanced aware/default loss is 11.5%, and magic-heavy aware/default is 12.2%.
2. Arena was selecting the new random Floor 1 Crypt table. A legacy Arena table is now explicit and tested.

Final tuned `f1-flame-forge` is 3.98–4.84 rounds for balanced/magic-heavy naive/default cells, rather than
an HP sponge. The remaining spike is `f1-guarded-bomb`: balanced naive is 55.6% HP loss with one wipe,
default is 37.2%, while aware is 19.4% over 6.67 rounds. It is weight 1/33, and informed play avoids
wipes, but it remains the first balance item for human playtesting. I did not hide this with a generic
scaling rule or campaign-wide HP changes.

Target-priority diversity is mixed. Slime Cannon and Hunting Pack clearly change first-kill identity;
most other formations still converge on the front resource/enabler. That is acceptable for the current
16-entry experiment roster, but it is not evidence that every chemistry relationship has two equally good
lines.

## Pacing and expedition attrition

The old fallback model (`.05 / 8 / 20 / 28`) produced a seeded one-million-step reference distribution
of mean 18.25, median 21, p90 24, max 28. Floor 1 now uses the authored `.05 / 14 / 34 / 52` profile.
The exact theoretical normal profile is mean 27.69, median 27, p90 40, max 52. A separate one-million-
step seeded sample measured mean 27.70, median 27, p90 40, max 50; the finite sample did not hit the
allowed hard cap, but the implementation forces at 52. The lab's route profiles were:

| Route | Mean | Median | p10 | p90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| normal | 27.69 | 27 | 16 | 40 | 52 |
| quiet | 29.31 | 30 | 16 | 40 | 52 |
| dead-rate | 39.01 | 39 | 36 | 42 | 52 |
| hot | 23.80 | 22 | 15 | 37 | 52 |

Actual ten-fight traversal gaps were normal 28.41/28/40/46, quiet 29.31/31/40/47, dead-rate
39.05/39/42/48, and hot 23.96/22/37/47 (mean/median/p90/max). Safe-zone tests confirm the encounter
clock pauses in authored safe zones; a rate-zero non-safe zone still allows pity pressure by design.

The larger gap improves exploration continuity, and aware parties survive more fights, but the expedition
audit is not gentle enough to call the balance settled. Recovery, potion economy, and hot-route pressure
need human confirmation after the Guarded Bomb tuning decision.

## Economy and exploit attacks

The adversarial tests attempted original-resource consumption, summoned-resource consumption, repeated
Spawn creation/detonation, Split-style repeated use, interrupted wind-ups, party wipe during commitment,
and duplicate reservation. Results:

- Original encounter bodies award XP and gold at most once, including when consumed.
- Summoned enemy bodies have `rewardEligible: false`; XP and gold remain zero.
- A consumed use is spent on break; there is no re-selection or reward duplication.
- Fight-wide summon cap is four, row cap is three, and new bodies join the next legal turn.
- Across the final matrix, 913 normal and 24 summoned bodies were recorded as consumed; the reward tests
  separately assert the summoned XP/gold path is zero.

## Browser presentation audit

I forced explicit fixtures through the debug surface after fixing its previously ignored optional combat
argument, then viewed both production renderers. The exact scenes inspected were:

- Canvas: Slime Cannon, Hunting Pack, Spawn Bomb, Living Shield marker, Rune Overload charge/impact.
- Phaser: Slime Cannon, Hunting Pack, Spawn Bomb, Living Shield marker, Rune Overload charge/impact.
- Existing shared choreography scenes: Bone Harvest, Ogre Toss, Pack Leap, Combo Break, Living Shield direct
  intercept and AoE bypass.

Observed results: correct sprite aliases, live resource until the consume beat, no teleporting, correct
paint order during Pack Leap, no corpse lookup errors, no row-cap overlap, no duplicate ordinary banners,
and Canvas/Phaser choreography parity. Phaser capture emitted only benign GPU/readback warnings; there
were zero JavaScript console errors. The trace CSV does not measure wall-clock animation duration, so the
remaining human question is whether the signatures stay pleasant on the 5th/10th/20th exposure.

One audit-only issue was found and fixed: old browser scripts passed an explicit combat fixture to
`__onyxDebug.startCombat`, but the helper ignored the argument and rolled a random encounter. The helper
now honors an explicit fixture while retaining the zero-argument live-table behavior.

## Regression verification

The exact final-tree gate was run after the audit fixes:

```text
npm run check                 PASS
test:typecheck                PASS
npm run build                 PASS (zero TypeScript errors)
Vitest                        2398 passed / 2398
floor:validate                PASS; existing Floor 1 content warnings only
floor:export-check            PASS
```

The full test suite includes chemistry primitives, both combat APIs, rewards, summons, guard paths,
initiative, anti-repeat, Arena isolation, save/load, bosses, scripted fights, NPC combat, Floors 2–5,
safe-zone behavior, reach, perks, and floor export parity.

## Remaining risks

1. `f1-guarded-bomb` still creates a sharp naive/magic-heavy attrition spike. Tune chemistry chance/power
   or its authored composition only after human playtest confirms whether its warning and rarity justify it.
2. Slime Cannon, Hunting Pack, and Rune Overload are visually memorable but often countered before payoff
   in the default short-fight traces. Verify that organic Floor 1 exposure produces enough successful
   resolutions without turning resource-first play into a rote answer.
3. Ten-fight expeditions remain pressure-heavy even with the aware policy. Do not solve this by inflating
   enemy HP; inspect signature frequency, counterplay power, and recovery cost first.
4. During the per-turn UI, the controller owns its immutable next `CombatState` while the debug
   `GameState.combat` reference remains the initial object until combat ends. Browser telemetry must use
   the controller snapshot/events, not that stale debug reference. This is a test-surface caveat, not a
   player-facing combat defect.

## Final assessment

Formation Chemistry is ready for a focused human Floor 1 playtest, not for an unqualified “done” label.
It demonstrably improves encounter spacing, makes player knowledge matter at expedition scale, and has
the required readable shared presentations. The next decision should be evidence-led tuning of Guarded
Bomb and organic signature frequency/payoff, followed by the requested repeated-exposure human session.
