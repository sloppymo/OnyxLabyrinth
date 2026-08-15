# Formation Chemistry Phase 8 deterministic lab

Generated 2026-08-15T11:53:01.290Z; N=100. This is evidence, not an automatic balance verdict. Per-fight metrics are in 2026-08-15-formation-chemistry-phase8-traces.csv.

## Encounter gap audit

| Route | Mean | Median | p10 | p90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| normal | 27.69 | 27 | 16 | 40 | 52 |
| quiet | 29.31 | 30 | 16 | 40 | 52 |
| dead | 39.01 | 39 | 36 | 42 | 52 |
| hot | 23.80 | 22 | 15 | 37 | 52 |

## Matrix highlights

| Encounter | Party | Policy | Win | Wipe | Rounds | HP loss | Chem resolved | Chem broken |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| f1-acid-burrow | balanced | naive | 100/100 | 0 | 4.05 | 27.8% | 0 | 0 |
| f1-acid-burrow | balanced | default | 100/100 | 0 | 4.32 | 16.2% | 0 | 0 |
| f1-acid-burrow | balanced | chemistry-aware | 100/100 | 0 | 4.32 | 16.2% | 0 | 0 |
| f1-acid-burrow | physical-heavy | naive | 100/100 | 0 | 4.06 | 23.7% | 0 | 0 |
| f1-acid-burrow | physical-heavy | default | 100/100 | 0 | 4.28 | 21.1% | 0 | 0 |
| f1-acid-burrow | physical-heavy | chemistry-aware | 100/100 | 0 | 4.28 | 21.1% | 0 | 0 |
| f1-acid-burrow | magic-heavy | naive | 100/100 | 0 | 4.16 | 31.3% | 0 | 0 |
| f1-acid-burrow | magic-heavy | default | 100/100 | 0 | 4.53 | 17.4% | 0 | 0 |
| f1-acid-burrow | magic-heavy | chemistry-aware | 100/100 | 0 | 4.53 | 17.4% | 0 | 0 |
| f1-acid-burrow | defensive | naive | 100/100 | 0 | 3.88 | 19.1% | 0 | 0 |
| f1-acid-burrow | defensive | default | 100/100 | 0 | 3.92 | 12.8% | 0 | 0 |
| f1-acid-burrow | defensive | chemistry-aware | 100/100 | 0 | 3.92 | 12.8% | 0 | 0 |
| f1-red-bone-bounty | balanced | naive | 100/100 | 0 | 3.00 | 11.0% | 0 | 0 |
| f1-red-bone-bounty | balanced | default | 100/100 | 0 | 3.02 | 9.5% | 0 | 0 |
| f1-red-bone-bounty | balanced | chemistry-aware | 100/100 | 0 | 3.02 | 9.5% | 0 | 0 |
| f1-red-bone-bounty | physical-heavy | naive | 100/100 | 0 | 3.00 | 8.9% | 0 | 0 |
| f1-red-bone-bounty | physical-heavy | default | 100/100 | 0 | 3.00 | 8.9% | 0 | 0 |
| f1-red-bone-bounty | physical-heavy | chemistry-aware | 100/100 | 0 | 3.00 | 8.9% | 0 | 0 |
| f1-red-bone-bounty | magic-heavy | naive | 100/100 | 0 | 3.00 | 11.8% | 0 | 0 |
| f1-red-bone-bounty | magic-heavy | default | 100/100 | 0 | 3.01 | 10.4% | 0 | 0 |
| f1-red-bone-bounty | magic-heavy | chemistry-aware | 100/100 | 0 | 3.01 | 10.4% | 0 | 0 |
| f1-red-bone-bounty | defensive | naive | 100/100 | 0 | 3.00 | 8.3% | 0 | 0 |
| f1-red-bone-bounty | defensive | default | 100/100 | 0 | 3.00 | 7.8% | 0 | 0 |
| f1-red-bone-bounty | defensive | chemistry-aware | 100/100 | 0 | 3.00 | 7.8% | 0 | 0 |
| f1-orc-leap | balanced | naive | 100/100 | 0 | 2.00 | 4.5% | 0 | 0 |
| f1-orc-leap | balanced | default | 100/100 | 0 | 2.05 | 2.8% | 0 | 0 |
| f1-orc-leap | balanced | chemistry-aware | 100/100 | 0 | 2.05 | 2.8% | 0 | 0 |
| f1-orc-leap | physical-heavy | naive | 100/100 | 0 | 2.00 | 4.4% | 0 | 0 |
| f1-orc-leap | physical-heavy | default | 100/100 | 0 | 2.03 | 4.1% | 0 | 0 |
| f1-orc-leap | physical-heavy | chemistry-aware | 100/100 | 0 | 2.03 | 4.1% | 0 | 0 |
| f1-orc-leap | magic-heavy | naive | 100/100 | 0 | 2.01 | 4.1% | 0 | 0 |
| f1-orc-leap | magic-heavy | default | 100/100 | 0 | 2.07 | 2.5% | 0 | 0 |
| f1-orc-leap | magic-heavy | chemistry-aware | 100/100 | 0 | 2.07 | 2.5% | 0 | 0 |
| f1-orc-leap | defensive | naive | 100/100 | 0 | 2.00 | 3.9% | 0 | 0 |
| f1-orc-leap | defensive | default | 100/100 | 0 | 2.03 | 2.6% | 0 | 0 |
| f1-orc-leap | defensive | chemistry-aware | 100/100 | 0 | 2.03 | 2.6% | 0 | 0 |
| f1-minotaur-slime | balanced | naive | 100/100 | 0 | 2.15 | 4.6% | 0 | 73 |
| f1-minotaur-slime | balanced | default | 100/100 | 0 | 2.15 | 4.2% | 0 | 73 |
| f1-minotaur-slime | balanced | chemistry-aware | 100/100 | 0 | 2.33 | 2.3% | 0 | 70 |
| f1-minotaur-slime | physical-heavy | naive | 100/100 | 0 | 2.08 | 3.3% | 0 | 73 |
| f1-minotaur-slime | physical-heavy | default | 100/100 | 0 | 2.09 | 3.2% | 0 | 73 |
| f1-minotaur-slime | physical-heavy | chemistry-aware | 100/100 | 0 | 2.10 | 2.4% | 0 | 71 |
| f1-minotaur-slime | magic-heavy | naive | 100/100 | 0 | 2.32 | 6.2% | 0 | 75 |
| f1-minotaur-slime | magic-heavy | default | 100/100 | 0 | 2.36 | 5.2% | 0 | 75 |
| f1-minotaur-slime | magic-heavy | chemistry-aware | 100/100 | 0 | 2.41 | 2.5% | 0 | 69 |
| f1-minotaur-slime | defensive | naive | 100/100 | 0 | 2.07 | 3.0% | 0 | 71 |
| f1-minotaur-slime | defensive | default | 100/100 | 0 | 2.07 | 3.0% | 0 | 71 |
| f1-minotaur-slime | defensive | chemistry-aware | 100/100 | 0 | 2.02 | 1.9% | 0 | 70 |
| f1-ogre-toss | balanced | naive | 100/100 | 0 | 2.24 | 10.5% | 40 | 38 |
| f1-ogre-toss | balanced | default | 100/100 | 0 | 2.29 | 7.2% | 41 | 37 |
| f1-ogre-toss | balanced | chemistry-aware | 100/100 | 0 | 2.77 | 7.6% | 0 | 64 |
| f1-ogre-toss | physical-heavy | naive | 100/100 | 0 | 2.16 | 6.8% | 30 | 50 |
| f1-ogre-toss | physical-heavy | default | 100/100 | 0 | 2.20 | 6.7% | 30 | 50 |
| f1-ogre-toss | physical-heavy | chemistry-aware | 100/100 | 0 | 2.46 | 6.8% | 0 | 68 |
| f1-ogre-toss | magic-heavy | naive | 100/100 | 0 | 2.22 | 12.3% | 45 | 32 |
| f1-ogre-toss | magic-heavy | default | 100/100 | 0 | 2.45 | 7.5% | 45 | 32 |
| f1-ogre-toss | magic-heavy | chemistry-aware | 100/100 | 0 | 2.77 | 9.1% | 0 | 64 |
| f1-ogre-toss | defensive | naive | 100/100 | 0 | 2.04 | 3.4% | 16 | 49 |
| f1-ogre-toss | defensive | default | 100/100 | 0 | 2.05 | 2.3% | 16 | 49 |
| f1-ogre-toss | defensive | chemistry-aware | 100/100 | 0 | 2.30 | 3.9% | 0 | 64 |
| f1-warlock-bone-battery | balanced | naive | 100/100 | 0 | 3.00 | 14.7% | 0 | 0 |
| f1-warlock-bone-battery | balanced | default | 100/100 | 0 | 3.18 | 9.7% | 0 | 0 |
| f1-warlock-bone-battery | balanced | chemistry-aware | 100/100 | 0 | 3.18 | 9.7% | 0 | 0 |
| f1-warlock-bone-battery | physical-heavy | naive | 100/100 | 0 | 3.00 | 12.5% | 0 | 0 |
| f1-warlock-bone-battery | physical-heavy | default | 100/100 | 0 | 3.05 | 11.9% | 0 | 0 |
| f1-warlock-bone-battery | physical-heavy | chemistry-aware | 100/100 | 0 | 3.05 | 11.9% | 0 | 0 |
| f1-warlock-bone-battery | magic-heavy | naive | 100/100 | 0 | 3.00 | 16.2% | 0 | 0 |
| f1-warlock-bone-battery | magic-heavy | default | 100/100 | 0 | 3.15 | 9.9% | 0 | 0 |
| f1-warlock-bone-battery | magic-heavy | chemistry-aware | 100/100 | 0 | 3.15 | 9.9% | 0 | 0 |
| f1-warlock-bone-battery | defensive | naive | 100/100 | 0 | 3.00 | 12.5% | 0 | 0 |
| f1-warlock-bone-battery | defensive | default | 100/100 | 0 | 3.08 | 8.6% | 0 | 0 |
| f1-warlock-bone-battery | defensive | chemistry-aware | 100/100 | 0 | 3.08 | 8.6% | 0 | 0 |
| f1-living-shield | balanced | naive | 100/100 | 0 | 3.69 | 18.0% | 94 | 5 |
| f1-living-shield | balanced | default | 100/100 | 0 | 4.00 | 14.7% | 94 | 5 |
| f1-living-shield | balanced | chemistry-aware | 100/100 | 0 | 4.00 | 14.7% | 94 | 5 |
| f1-living-shield | physical-heavy | naive | 100/100 | 0 | 3.39 | 13.5% | 91 | 9 |
| f1-living-shield | physical-heavy | default | 100/100 | 0 | 3.46 | 13.0% | 91 | 9 |
| f1-living-shield | physical-heavy | chemistry-aware | 100/100 | 0 | 3.46 | 13.0% | 91 | 9 |
| f1-living-shield | magic-heavy | naive | 100/100 | 0 | 3.49 | 17.7% | 93 | 6 |
| f1-living-shield | magic-heavy | default | 100/100 | 0 | 3.73 | 10.9% | 94 | 5 |
| f1-living-shield | magic-heavy | chemistry-aware | 100/100 | 0 | 3.73 | 10.9% | 94 | 5 |
| f1-living-shield | defensive | naive | 100/100 | 0 | 3.35 | 13.6% | 90 | 9 |
| f1-living-shield | defensive | default | 100/100 | 0 | 3.43 | 9.4% | 91 | 8 |
| f1-living-shield | defensive | chemistry-aware | 100/100 | 0 | 3.43 | 9.4% | 91 | 8 |
| f1-hunting-pack | balanced | naive | 100/100 | 0 | 2.28 | 2.6% | 0 | 68 |
| f1-hunting-pack | balanced | default | 100/100 | 0 | 2.30 | 2.0% | 0 | 68 |
| f1-hunting-pack | balanced | chemistry-aware | 100/100 | 0 | 2.24 | 2.7% | 0 | 66 |
| f1-hunting-pack | physical-heavy | naive | 100/100 | 0 | 2.23 | 1.9% | 0 | 67 |
| f1-hunting-pack | physical-heavy | default | 100/100 | 0 | 2.23 | 1.9% | 0 | 67 |
| f1-hunting-pack | physical-heavy | chemistry-aware | 100/100 | 0 | 2.15 | 2.5% | 0 | 64 |
| f1-hunting-pack | magic-heavy | naive | 100/100 | 0 | 2.42 | 4.0% | 1 | 66 |
| f1-hunting-pack | magic-heavy | default | 100/100 | 0 | 2.48 | 2.7% | 1 | 66 |
| f1-hunting-pack | magic-heavy | chemistry-aware | 100/100 | 0 | 2.42 | 3.1% | 0 | 64 |
| f1-hunting-pack | defensive | naive | 100/100 | 0 | 2.23 | 2.0% | 0 | 74 |
| f1-hunting-pack | defensive | default | 100/100 | 0 | 2.23 | 2.0% | 0 | 74 |
| f1-hunting-pack | defensive | chemistry-aware | 100/100 | 0 | 2.26 | 2.1% | 0 | 74 |
| f1-spawn-bomb | balanced | naive | 100/100 | 0 | 3.26 | 10.7% | 0 | 69 |
| f1-spawn-bomb | balanced | default | 100/100 | 0 | 3.28 | 8.5% | 0 | 69 |
| f1-spawn-bomb | balanced | chemistry-aware | 100/100 | 0 | 3.28 | 8.5% | 0 | 69 |
| f1-spawn-bomb | physical-heavy | naive | 100/100 | 0 | 3.29 | 9.1% | 0 | 61 |
| f1-spawn-bomb | physical-heavy | default | 100/100 | 0 | 3.29 | 9.1% | 0 | 61 |
| f1-spawn-bomb | physical-heavy | chemistry-aware | 100/100 | 0 | 3.29 | 9.1% | 0 | 61 |
| f1-spawn-bomb | magic-heavy | naive | 100/100 | 0 | 3.35 | 11.7% | 0 | 72 |
| f1-spawn-bomb | magic-heavy | default | 100/100 | 0 | 3.40 | 10.4% | 3 | 69 |
| f1-spawn-bomb | magic-heavy | chemistry-aware | 100/100 | 0 | 3.40 | 10.4% | 3 | 69 |
| f1-spawn-bomb | defensive | naive | 100/100 | 0 | 3.21 | 9.4% | 0 | 61 |
| f1-spawn-bomb | defensive | default | 100/100 | 0 | 3.23 | 8.0% | 0 | 61 |
| f1-spawn-bomb | defensive | chemistry-aware | 100/100 | 0 | 3.23 | 8.0% | 0 | 61 |
| f1-rune-overload | balanced | naive | 100/100 | 0 | 2.13 | 3.1% | 0 | 38 |
| f1-rune-overload | balanced | default | 100/100 | 0 | 2.18 | 2.8% | 0 | 38 |
| f1-rune-overload | balanced | chemistry-aware | 100/100 | 0 | 2.18 | 2.8% | 0 | 38 |
| f1-rune-overload | physical-heavy | naive | 100/100 | 0 | 2.02 | 2.4% | 0 | 37 |
| f1-rune-overload | physical-heavy | default | 100/100 | 0 | 2.02 | 2.4% | 0 | 37 |
| f1-rune-overload | physical-heavy | chemistry-aware | 100/100 | 0 | 2.02 | 2.4% | 0 | 37 |
| f1-rune-overload | magic-heavy | naive | 100/100 | 0 | 2.08 | 2.4% | 0 | 39 |
| f1-rune-overload | magic-heavy | default | 100/100 | 0 | 2.13 | 2.2% | 0 | 39 |
| f1-rune-overload | magic-heavy | chemistry-aware | 100/100 | 0 | 2.13 | 2.2% | 0 | 39 |
| f1-rune-overload | defensive | naive | 100/100 | 0 | 2.00 | 1.8% | 0 | 36 |
| f1-rune-overload | defensive | default | 100/100 | 0 | 2.00 | 1.7% | 0 | 36 |
| f1-rune-overload | defensive | chemistry-aware | 100/100 | 0 | 2.00 | 1.7% | 0 | 36 |
| f1-guarded-bomb | balanced | naive | 99/100 | 1 | 4.16 | 55.6% | 184 | 12 |
| f1-guarded-bomb | balanced | default | 100/100 | 0 | 5.42 | 37.2% | 192 | 24 |
| f1-guarded-bomb | balanced | chemistry-aware | 100/100 | 0 | 6.67 | 19.4% | 102 | 65 |
| f1-guarded-bomb | physical-heavy | naive | 100/100 | 0 | 3.79 | 41.9% | 169 | 18 |
| f1-guarded-bomb | physical-heavy | default | 100/100 | 0 | 4.44 | 37.9% | 170 | 31 |
| f1-guarded-bomb | physical-heavy | chemistry-aware | 100/100 | 0 | 5.88 | 22.9% | 99 | 87 |
| f1-guarded-bomb | magic-heavy | naive | 100/100 | 0 | 4.35 | 55.5% | 170 | 20 |
| f1-guarded-bomb | magic-heavy | default | 97/100 | 3 | 5.80 | 35.9% | 187 | 32 |
| f1-guarded-bomb | magic-heavy | chemistry-aware | 100/100 | 0 | 6.67 | 16.7% | 104 | 72 |
| f1-guarded-bomb | defensive | naive | 100/100 | 0 | 3.67 | 37.4% | 168 | 19 |
| f1-guarded-bomb | defensive | default | 100/100 | 0 | 4.10 | 24.0% | 172 | 22 |
| f1-guarded-bomb | defensive | chemistry-aware | 100/100 | 0 | 5.53 | 12.1% | 101 | 59 |
| f1-wraith-pincer | balanced | naive | 100/100 | 0 | 2.07 | 7.3% | 0 | 0 |
| f1-wraith-pincer | balanced | default | 100/100 | 0 | 2.08 | 6.9% | 0 | 0 |
| f1-wraith-pincer | balanced | chemistry-aware | 100/100 | 0 | 2.08 | 6.9% | 0 | 0 |
| f1-wraith-pincer | physical-heavy | naive | 100/100 | 0 | 2.02 | 5.7% | 0 | 0 |
| f1-wraith-pincer | physical-heavy | default | 100/100 | 0 | 2.02 | 5.7% | 0 | 0 |
| f1-wraith-pincer | physical-heavy | chemistry-aware | 100/100 | 0 | 2.02 | 5.7% | 0 | 0 |
| f1-wraith-pincer | magic-heavy | naive | 100/100 | 0 | 2.04 | 6.9% | 0 | 0 |
| f1-wraith-pincer | magic-heavy | default | 100/100 | 0 | 2.07 | 6.5% | 0 | 0 |
| f1-wraith-pincer | magic-heavy | chemistry-aware | 100/100 | 0 | 2.07 | 6.5% | 0 | 0 |
| f1-wraith-pincer | defensive | naive | 100/100 | 0 | 2.01 | 5.3% | 0 | 0 |
| f1-wraith-pincer | defensive | default | 100/100 | 0 | 2.01 | 5.0% | 0 | 0 |
| f1-wraith-pincer | defensive | chemistry-aware | 100/100 | 0 | 2.01 | 5.0% | 0 | 0 |
| f1-gaze-slime | balanced | naive | 100/100 | 0 | 3.00 | 6.5% | 0 | 0 |
| f1-gaze-slime | balanced | default | 100/100 | 0 | 3.04 | 5.8% | 0 | 0 |
| f1-gaze-slime | balanced | chemistry-aware | 100/100 | 0 | 3.04 | 5.8% | 0 | 0 |
| f1-gaze-slime | physical-heavy | naive | 100/100 | 0 | 3.00 | 4.8% | 0 | 0 |
| f1-gaze-slime | physical-heavy | default | 100/100 | 0 | 3.00 | 4.8% | 0 | 0 |
| f1-gaze-slime | physical-heavy | chemistry-aware | 100/100 | 0 | 3.00 | 4.8% | 0 | 0 |
| f1-gaze-slime | magic-heavy | naive | 100/100 | 0 | 3.00 | 5.1% | 0 | 0 |
| f1-gaze-slime | magic-heavy | default | 100/100 | 0 | 3.01 | 4.8% | 0 | 0 |
| f1-gaze-slime | magic-heavy | chemistry-aware | 100/100 | 0 | 3.01 | 4.8% | 0 | 0 |
| f1-gaze-slime | defensive | naive | 100/100 | 0 | 3.00 | 4.6% | 0 | 0 |
| f1-gaze-slime | defensive | default | 100/100 | 0 | 3.01 | 4.3% | 0 | 0 |
| f1-gaze-slime | defensive | chemistry-aware | 100/100 | 0 | 3.01 | 4.3% | 0 | 0 |
| f1-flame-forge | balanced | naive | 100/100 | 0 | 3.98 | 22.1% | 0 | 0 |
| f1-flame-forge | balanced | default | 100/100 | 0 | 4.42 | 11.5% | 0 | 0 |
| f1-flame-forge | balanced | chemistry-aware | 100/100 | 0 | 4.42 | 11.5% | 0 | 0 |
| f1-flame-forge | physical-heavy | naive | 100/100 | 0 | 3.74 | 16.9% | 0 | 0 |
| f1-flame-forge | physical-heavy | default | 100/100 | 0 | 3.87 | 15.2% | 0 | 0 |
| f1-flame-forge | physical-heavy | chemistry-aware | 100/100 | 0 | 3.87 | 15.2% | 0 | 0 |
| f1-flame-forge | magic-heavy | naive | 98/100 | 2 | 4.25 | 25.9% | 0 | 0 |
| f1-flame-forge | magic-heavy | default | 100/100 | 0 | 4.84 | 12.2% | 0 | 0 |
| f1-flame-forge | magic-heavy | chemistry-aware | 100/100 | 0 | 4.84 | 12.2% | 0 | 0 |
| f1-flame-forge | defensive | naive | 100/100 | 0 | 3.75 | 16.5% | 0 | 0 |
| f1-flame-forge | defensive | default | 100/100 | 0 | 3.85 | 9.2% | 0 | 0 |
| f1-flame-forge | defensive | chemistry-aware | 100/100 | 0 | 3.85 | 9.2% | 0 | 0 |
| f1-solo-guardian | balanced | naive | 100/100 | 0 | 1.87 | 1.7% | 0 | 0 |
| f1-solo-guardian | balanced | default | 100/100 | 0 | 1.88 | 1.6% | 0 | 0 |
| f1-solo-guardian | balanced | chemistry-aware | 100/100 | 0 | 1.88 | 1.6% | 0 | 0 |
| f1-solo-guardian | physical-heavy | naive | 100/100 | 0 | 1.84 | 0.9% | 0 | 0 |
| f1-solo-guardian | physical-heavy | default | 100/100 | 0 | 1.85 | 0.9% | 0 | 0 |
| f1-solo-guardian | physical-heavy | chemistry-aware | 100/100 | 0 | 1.85 | 0.9% | 0 | 0 |
| f1-solo-guardian | magic-heavy | naive | 100/100 | 0 | 1.85 | 1.5% | 0 | 0 |
| f1-solo-guardian | magic-heavy | default | 100/100 | 0 | 1.87 | 1.4% | 0 | 0 |
| f1-solo-guardian | magic-heavy | chemistry-aware | 100/100 | 0 | 1.87 | 1.4% | 0 | 0 |
| f1-solo-guardian | defensive | naive | 100/100 | 0 | 1.76 | 0.9% | 0 | 0 |
| f1-solo-guardian | defensive | default | 100/100 | 0 | 1.76 | 0.7% | 0 | 0 |
| f1-solo-guardian | defensive | chemistry-aware | 100/100 | 0 | 1.76 | 0.7% | 0 | 0 |
| f1-ghostfire-duet | balanced | naive | 100/100 | 0 | 2.00 | 3.4% | 0 | 0 |
| f1-ghostfire-duet | balanced | default | 100/100 | 0 | 2.00 | 3.3% | 0 | 0 |
| f1-ghostfire-duet | balanced | chemistry-aware | 100/100 | 0 | 2.00 | 3.3% | 0 | 0 |
| f1-ghostfire-duet | physical-heavy | naive | 100/100 | 0 | 2.00 | 2.8% | 0 | 0 |
| f1-ghostfire-duet | physical-heavy | default | 100/100 | 0 | 2.00 | 2.8% | 0 | 0 |
| f1-ghostfire-duet | physical-heavy | chemistry-aware | 100/100 | 0 | 2.00 | 2.8% | 0 | 0 |
| f1-ghostfire-duet | magic-heavy | naive | 100/100 | 0 | 2.00 | 3.7% | 0 | 0 |
| f1-ghostfire-duet | magic-heavy | default | 100/100 | 0 | 2.00 | 3.6% | 0 | 0 |
| f1-ghostfire-duet | magic-heavy | chemistry-aware | 100/100 | 0 | 2.00 | 3.6% | 0 | 0 |
| f1-ghostfire-duet | defensive | naive | 100/100 | 0 | 2.00 | 2.9% | 0 | 0 |
| f1-ghostfire-duet | defensive | default | 100/100 | 0 | 2.00 | 2.9% | 0 | 0 |
| f1-ghostfire-duet | defensive | chemistry-aware | 100/100 | 0 | 2.00 | 2.9% | 0 | 0 |

## Ten-fight expedition attrition

Balanced party, three starting healing potions, Floor 1 pacing, and the same travel stream for each mode. Return-to-town pressure counts any wipe, KO, failure to reach ten fights, or a tenth-fight return below 35% aggregate HP; this is a guardrail signal, not a new mechanic.

| Route | Mode | Ten fights | Wipes | Pressure | Avg fights | Final HP | Final SP | Potions | Gap mean/med/p90/max | Chem resolved/broken | Summons/consumed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| normal | chemistry-aware | 76/100 | 24 | 51 | 9.63 | 48.9% | 59.2% | 2.46 | 28.41/28/40/46 | 94/194 | 70/1 |
| normal | default | 70/100 | 30 | 62 | 9.33 | 43.7% | 59.9% | 2.61 | 28.44/28/40/46 | 145/164 | 38/55 |
| normal | no-chemistry-control | 71/100 | 29 | 62 | 9.23 | 41.5% | 59.2% | 2.55 | 28.44/28/40/46 | 0/0 | 61/0 |
| quiet | chemistry-aware | 85/100 | 15 | 46 | 9.62 | 60.4% | 59.8% | 2.22 | 29.31/31/40/47 | 92/207 | 66/5 |
| quiet | default | 79/100 | 21 | 54 | 9.48 | 54.4% | 60.8% | 2.37 | 29.35/31/40/47 | 134/185 | 34/48 |
| quiet | no-chemistry-control | 77/100 | 23 | 56 | 9.52 | 51.5% | 57.7% | 2.46 | 29.28/31/40/47 | 0/0 | 75/0 |
| dead | chemistry-aware | 87/100 | 13 | 50 | 9.73 | 57.4% | 60.6% | 2.43 | 39.05/39/42/48 | 90/189 | 54/4 |
| dead | default | 82/100 | 18 | 53 | 9.61 | 55.1% | 60.9% | 2.42 | 39.03/39/42/48 | 123/179 | 30/36 |
| dead | no-chemistry-control | 76/100 | 24 | 56 | 9.50 | 46.7% | 57.6% | 2.52 | 39.04/39/42/48 | 0/0 | 61/0 |
| hot | chemistry-aware | 86/100 | 14 | 55 | 9.68 | 55.7% | 59.2% | 2.31 | 23.96/22/37/47 | 82/180 | 55/2 |
| hot | default | 75/100 | 25 | 71 | 9.56 | 46.7% | 59.8% | 2.49 | 23.93/22/37/47 | 133/152 | 37/50 |
| hot | no-chemistry-control | 78/100 | 22 | 68 | 9.51 | 44.3% | 57.0% | 2.52 | 23.97/22/37/47 | 0/0 | 52/0 |

## Relief evidence

The two relief entries were removed from the active roster after the 100-seed traces below. The numeric figures are diagnostic heuristics, not pass/fail gates; the qualitative decision was that neither encounter established its intended tactical premise.

| Encounter | Decision | Evidence |
| --- | --- | --- |
| f1-slime-cluster | removed | No Split event, split timing, or kill-order decision appeared in the 100-seed policy traces; the default route was simply three weak Slimes. |
| f1-bone-archer-line | removed | No Archer Volley pressure resolved before Archer death in the 100-seed traces; Skeleton contribution did not create a durable Archer-versus-line decision. |

| Lab scenario | Party | Policy | Win | Rounds | HP loss | First kills |
| --- | --- | --- | ---: | ---: | ---: | --- |
| f1-slime-cluster | balanced | default | 100/100 | 3.01 | 10.1% | Slime:100 |
| f1-slime-cluster | balanced | focused | 100/100 | 3.03 | 11.3% | Slime:100 |
| f1-slime-cluster | balanced | aoe | 100/100 | 1.00 | 0.0% | Slime:100 |
| f1-slime-cluster | physical-heavy | default | 100/100 | 3.01 | 10.1% | Slime:100 |
| f1-slime-cluster | physical-heavy | focused | 100/100 | 3.01 | 10.1% | Slime:100 |
| f1-slime-cluster | physical-heavy | aoe | 100/100 | 3.01 | 10.1% | Slime:100 |
| f1-slime-cluster | magic-heavy | default | 100/100 | 3.02 | 10.7% | Slime:100 |
| f1-slime-cluster | magic-heavy | focused | 100/100 | 3.02 | 12.8% | Slime:100 |
| f1-slime-cluster | magic-heavy | aoe | 100/100 | 1.00 | 0.0% | Slime:100 |
| f1-slime-cluster | defensive | default | 100/100 | 3.01 | 8.3% | Slime:100 |
| f1-slime-cluster | defensive | focused | 100/100 | 3.02 | 9.0% | Slime:100 |
| f1-slime-cluster | defensive | aoe | 100/100 | 3.01 | 8.3% | Slime:100 |
| f1-bone-archer-line | balanced | default | 100/100 | 3.00 | 9.9% | Skeleton:100 |
| f1-bone-archer-line | balanced | focused | 100/100 | 3.00 | 4.6% | Skeleton Archer:100 |
| f1-bone-archer-line | balanced | aoe | 100/100 | 1.00 | 0.0% | Skeleton Archer:72, Skeleton:28 |
| f1-bone-archer-line | physical-heavy | default | 100/100 | 3.00 | 8.7% | Skeleton:100 |
| f1-bone-archer-line | physical-heavy | focused | 100/100 | 3.00 | 4.0% | Skeleton Archer:100 |
| f1-bone-archer-line | physical-heavy | aoe | 100/100 | 3.00 | 4.0% | Skeleton Archer:100 |
| f1-bone-archer-line | magic-heavy | default | 100/100 | 3.01 | 9.6% | Skeleton:100 |
| f1-bone-archer-line | magic-heavy | focused | 100/100 | 3.00 | 5.0% | Skeleton Archer:100 |
| f1-bone-archer-line | magic-heavy | aoe | 100/100 | 1.00 | 0.0% | Skeleton Archer:65, Skeleton:35 |
| f1-bone-archer-line | defensive | default | 100/100 | 3.01 | 7.6% | Skeleton:100 |
| f1-bone-archer-line | defensive | focused | 100/100 | 3.00 | 3.8% | Skeleton Archer:100 |
| f1-bone-archer-line | defensive | aoe | 100/100 | 3.00 | 3.8% | Skeleton Archer:100 |
