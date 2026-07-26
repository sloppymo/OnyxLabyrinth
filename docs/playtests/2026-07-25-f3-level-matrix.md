# Floor 3 level matrix — 2026-07-25 (evening)

Follow-up to [`2026-07-25-per-floor-combat-difficulty.md`](2026-07-25-per-floor-combat-difficulty.md).
That probe flagged floor 3's **40% near-wipe at fixed L8** as a yellow flag
(L8 sits near F3's intended L6–L9 band). This pass remeasures **only floor 3**
at **L6 / L8 / L9** to separate "overtuned trash" from "bad level match / noise."

## Method

- Same harness as the per-floor probe (`scripts/playtests/per-floor-combat-difficulty.mjs`),
  with env overrides: `FLOORS=3 LEVELS=6,8,9 N=10`.
- Non-boss packs only; party Auto + optional Auto-Fast; full HP/SP reset between fights;
  `xp:0` pin so level stays fixed.
- Unseeded RNG (PR-5 still open). N=10 per cell — enough for directional means;
  near-wipe rates still high-variance (see caveats).

## Results

| Level | Band role | N | Mean rounds | Mean HP lost | Near-wipe | Wipe | HP lost/round |
|---|---|---|---|---|---|---|---|
| L6 | Intended entry (~F2–3) | 10/10 | 5.40 | 28.7% | 20% | 0% | 5.3% |
| L8 | Mid band (original probe) | 10/10 | 4.60 | 18.0% | **0%** | 0% | 3.9% |
| L9 | Intended exit toward F4 | 10/10 | 3.70 | 11.1% | 0% | 0% | 3.0% |

Machine-readable: `playtest-screenshots/2026-07-25-f3-level-matrix/report.json`
(local only; gitignored screenshots dir).

## Verdict

**Clear the yellow flag. Do not retune floor 3 from the L8 40% near-wipe headline.**

1. **At intended entry (L6)** trash is spicy but not broken: ~29% mean HP lost,
   20% near-wipe, **zero wipes** in N=10. That is acceptable transition-floor
   texture for this genre under suboptimal party-Auto play.
2. **Difficulty scales cleanly with level** on every continuous metric
   (rounds, HP lost, HP/round) — L6 hardest, L9 easiest. No cliff inside the
   intended band.
3. **The original L8 40% near-wipe did not reproduce** here (0% at N=10, 18%
   mean HP lost vs the earlier 23%). That matches the earlier statistical
   caution: near-wipe is a noisy binary at N≈10–15. Treat the 40% figure as
   one unlucky sample, not a tuning target.

## Caveats

- Party Auto ≠ careful human play — absolute near-wipe rates are biased high;
  relative L6→L9 ordering is the load-bearing signal.
- Gear is whatever `jumpTo({ partyLevel })` leaves (not floor-appropriate shop
  BiS). Real players on F3 may be better or worse geared.
- N=10 near-wipe SE at p=0.2 is ~13pp — the 20% L6 rate is directional only.

## Action

None on encounter tables. Next difficulty work, if any, should be
**per-floor at each floor's own intended level**, not another F3 deep dive.
