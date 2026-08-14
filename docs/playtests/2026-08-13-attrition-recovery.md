# Floors 1–3 attrition and recovery balance pass

Date: 2026-08-13

This pass measured the natural campaign loop before changing combat balance. The
browser driver used normal party creation, BFS movement through the authored
map, real locks/chests/chutes/rafts/stairs, and the real combat UI. It did not
use `jumpTo()`, mutate inventory or progression, or force a combat result.
RNG was seeded with 101 and 202.

The combat policy was held constant across parties: `Q` attack-first Auto,
with Tab/Escape only shortening presentation playback. This isolates party and
formation effects, but it is intentionally not an optimized spell/item player.
The audit still records SP and consumables; no consumables were consumed and
the Auto policy did not spend healing SP.

## Baseline findings

The six baseline runs produced 71 audited encounters, 15 wipes, and 83 party
KO events. Ten of the 58 random encounters wiped the party; five of 13
authored capstone encounters wiped it.

| Measure | Floor 1 | Floor 2 | Floor 3 |
| --- | ---: | ---: | ---: |
| Audited encounters, including retries | 42 | 16 | 13 |
| Wipes | 4 | 5 | 6 |
| Ordinary encounter mean damage | 10.5 | 43.9 | 115.8 |
| Ordinary encounter median rounds | 2 | 4 | 5 |
| Median steps between encounters | 19.5 | 14 | 8 |

The encounter gaps do not point to a global encounter-rate failure: ordinary
encounters had a 17.5-step median gap and respected the cooldown. Floor 3 is a
localized pressure point, with a median gap of 8 steps, but the larger driver is
damage and fight duration once a formation starts.

The most disproportionate ordinary formations were:

- `big-titty-ogre + demon + elite-orc + demoness`: 176 damage and a wipe;
- `stone-guardian + animated-armor + rune-knight + warlock`: 182 damage and a wipe;
- `flame-golem + 2 lava-slimes + 2 warlocks`: 154–159 damage in observed runs,
  including a wipe.

The Floor 3 Grand Forge formation dealt 112–243 damage over 5–14 rounds and
wiped every observed attack-only attempt. By contrast, the Floor 1 guardian
was mixed (five victories and one wipe across the baseline records), and the
Floor 2 guardian was also mixed (three victories and two wipes). That supports
keeping the capstones distinct instead of applying a global enemy nerf.

Party composition did not produce a clear universal winner under the fixed
policy:

| Party | Baseline fights | Wipes | Ordinary mean damage |
| --- | ---: | ---: | ---: |
| All Trades | 22 | 5 | 33.4 |
| Shield Wall | 25 | 5 | 29.4 |
| All Steel | 24 | 5 | 47.9 |

All Steel reached the Floor 3 route in the first seed but had no healing magic;
Shield Wall and All Trades had healing-capable members but Auto did not invoke
them. This makes healing/resource availability a real confounder, not evidence
that the default party alone is defective. A later pass should measure manual
healing and camp use separately before changing party or spell balance.

## Recovery finding and fix

The clearest P1 was retry traversal. Before the fix, a wipe returned the party
to town and reset `lastDungeon` to the current floor's start tile. After the
Inn recovery, the party replayed the solved route and its encounters.

The fix stores the failed combat's floor, coordinates, and facing as
`lastDungeon` before reviving the party. The game still sends the party through
the game-over screen and town/Inn, so danger and recovery remain explicit; the
next dungeon entry resumes at the failed encounter region.

On the seed-101 after-fix runs, the next audited encounters after a wipe were
4–51 steps away from the wipe, rather than requiring a full floor replay. The
All Trades and All Steel runs reached the Floor 3 Grand Forge guardian within
the two-wipe test budget. They still wiped at that authored guardian under
attack-only Auto, which is expected evidence for a separate capstone/manual-
healing investigation, not a reason to flatten ordinary combat.

No enemy stats, encounter weights, encounter rates, party definitions, or
capstone formations were changed in this pass.

## Verification

- `npm run check`: passed — 121 test files, 2,352 tests, floor validation, and
  floor export check all passed.
- Natural seeded campaign driver: zero browser console errors in the saved
  baseline and after-fix runs.
- `floor2-cursed-library.mjs`: passed all checks, including save/load and wipe
  re-entry.
- `floor3-duelists-vigil.mjs`: passed all three guardian legs and save/load.
- `floor2-abyss-bridge.mjs`: both WebGL and Canvas runs passed; void crossing
  stayed blocked and browser errors were empty.
- The legacy `smoke-floor-1-proving-depths.mjs` remains archived because it
  expects the retired “The Proving Depths” 25×32 map, while the current Floor 1
  is “The Hall of Five Wounds” at 28×41. It is replaced for active regression
  use by `scripts/playtests/floor1-guardian-current.mjs`, which targets the
  current guardian and verifies its barrier after fleeing.

## Recommendation

Keep the retry checkpoint. Do not change global encounter rate or enemy damage
from the Auto baseline alone. The tactical follow-up and presentation results
are recorded in `docs/playtests/2026-08-13-post-attrition-polish.md`.
