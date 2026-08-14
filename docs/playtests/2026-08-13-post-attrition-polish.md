# Post-attrition validation and Floors 1–3 player-experience polish

Date: 2026-08-13
Branch: `polish/floors1-3-recovery-and-presentation`
Base: `origin/main` at `1157395`

## Decision

No enemy stat, encounter-table weight, or global encounter-rate change was
justified. The attack-first baseline made ordinary attrition look worse because
it never healed, cast defensive spells, or spent consumables. The tactical
comparison still found the Grand Forge formation to be the dominant threat, but
the parties generally arrived at that authored fight with meaningful HP rather
than being destroyed by random route combat.

The production P1 fix in this pass is recovery safety and retry friction:
exact wipe coordinates are used only when the current floor copy says they are
ordinary, legal, connected floor. Otherwise a small local search finds the
nearest safe cell. This preserves danger while removing accidental returns to
chests, stairs, events, void, or stale geometry.

## Recovery tail

`stepsSincePreviousWipe` is the number of physical dungeon steps before the next
audited encounter after a wipe. It measures the meaningful retry tail; it is
not the BFS distance from the safe landing to the failed cell. The latter was
0 for ordinary exact landings and 1 for Grand Forge's trophy chest, where the
resolver correctly moved the party to `(9,12)`.

The ten longest observed tails in the post-fix seed-101 Auto runs were:

| Steps | Party / encounter | Failed-next encounter | Classification |
| ---: | --- | --- | --- |
| 49 | All Trades / F3 | Grand Forge `(9,13)` | Legitimate F2 recovery → stairs → F3 capstone route |
| 48 | Shield Wall / F2 | ordinary `(9,11)` | Legitimate F1 recovery and return through current progression |
| 36 | Shield Wall / F2 | furnace guardian `(12,8)` | Legitimate already-explored forbidden-wing approach |
| 34 | Shield Wall / F2 | furnace approach `(11,7)` | Legitimate approach to the authored climax |
| 32 | All Trades / F3 | ordinary werewolf `(2,9)` | Legitimate F2→F3 route after recovery |
| 27 | Shield Wall / F3 | Grand Forge `(9,13)` | Legitimate retry approach after an ordinary F3 wipe |
| 12 | Shield Wall / F3 | ordinary `(2,11)` | Legitimate foundry route |
| 10 | All Trades / F2 | furnace guardian `(12,8)` | Legitimate forbidden-wing route |
| 10 | All Steel / F3 | Grand Forge `(9,13)` | Legitimate capstone retry |
| 8 | Shield Wall / F1 | F1 guardian `(18,21)` | Legitimate authored guardian approach |

No bad recovery coordinate, locked-door bypass, one-way trap, incompatible Z,
void landing, or instant combat retrigger was observed. Every completed
re-entry record reported a legal ordinary tile. The final record in runs that
exceeded the configured wipe budget has `reentry: null` because the driver
stopped immediately after recording the wipe; it is not an unverified landing.

## Auto versus tactical measurement

The earlier controlled baseline used Q attack-first Auto across All Trades,
Shield Wall, and All Steel on seeds 101 and 202: 71 encounters, 15 wipes, and
an ordinary encounter gap median of 17.5 steps. Floor 3 ordinary encounters
were the pressure point at 115.8 average incoming damage and a five-round
median. Party wipes were 5/22, 5/25, and 5/24 respectively.

The tactical driver used normal movement and progression, then modeled a
competent but imperfect player: material healing, one Priest defensive layer,
Mage screen/area damage where affordable, SP conservation, critical potions,
and fleeing only from a collapsing ordinary fight. Playback was accelerated,
not combat resolution. The audit records healing events by target in addition
to HP/SP entry/exit and consumable deltas; the detailed Shield Wall replay
spent 868 HP of healing, 118 SP, and six healing consumables across 12 fights.

| Party / seed | Ordinary fights | Ordinary mean damage | Wipes | Tactical resources | Grand Forge arrival / result |
| --- | ---: | ---: | ---: | --- | --- |
| All Trades / 101 | 9 | 67.2 | 4 | HP/SP and consumables recorded | `78/65/20/65`; wipe in guardian |
| Shield Wall / 101 | 7 | 27.6 | 2 | detailed replay: 868 HP healing, 118 SP, 5 healing + 1 greater potion | `74/56/45/52`; victory after two failed attempts |
| All Steel / 101 | 7 | 36.4 | 4 | HP/SP and consumables recorded | `64/65/32/60` on retries; wipe in guardian |
| Shield Wall / 202 | 8 | 35.5 | 4 | HP/SP and consumables recorded | `73/80/56/48` on retries; wipe in guardian |

The failed tactical runs were failing at the same authored Grand Forge
formation, not routinely on the route before it. The successful Shield Wall
attempt left `20/29/33/11` HP and remained a meaningful, costly victory. This
supports the intended distinction: ordinary combat creates pressure and the
capstone remains frightening. It does not support a global nerf.

## Production changes

- `src/game/recovery.ts`: reusable safe-landing and traversable-path analysis;
  rejects void, interactive tiles, authored events, invalid volume/clearance,
  and cells without a legal connected exit.
- `src/main.ts`: applies runtime state before resolving wipe re-entry, records
  the audit result, and autosaves the actual legal landing. The Town/Inn/Game
  Over flow remains unchanged.
- `src/game/abyss-face.ts`: arms the first bark at the threshold and presents
  it on the first direct look, producing silence → exposure → face → line.
- `src/data/floors.ts`: one green bridge-masonry threshold cell remains at the
  library mouth; authored wall framing was added near the Floor 3 reward.
- `src/content/floors/floor-1.json`: lexicon-key chest gets a writing-plaque
  wall feature and Isobel receives the existing approved portrait metadata.
- `src/main.ts`: opened reward text uses an instant complete message so the
  full key/item list is readable before it is dismissed.
- `src/engine/npc-portraits.ts`, `npc-dialogue-view.ts`, and `styles.css`:
  Isobel uses the contained shop sprite as a deliberate portrait card;
  missing-art NPCs use a compact identity card instead of a giant initial.
- `src/game/floor-map.ts`: JSON floor packs now preserve NPC portrait side,
  portrait id, and dialogue accent metadata.
- `scripts/playtests/floor1-guardian-current.mjs`: current-map replacement for
  the retired Proving Depths smoke test.

## Browser evidence

- Bridge → library threshold and first library cells: `output/playwright/post-polish-bridge-final/` (WebGL and Canvas, 11 captures each).
- First face reveal after the silent beat: `.../webgl/09-speaking-face.png` and `.../canvas/09-speaking-face.png`.
- F1 lexicon-key and F3 forge-key approaches/reward resolution:
  `output/playwright/reward-framing/`.
- Isobel contained portrait and Vestra fallback:
  `playtest-screenshots/npc-portrait-dialogue/05-isobel-portrait.png` and
  `05b-vestra-silhouette-fallback.png`.

All relevant browser runs reported zero page errors. Canvas and WebGL both
preserved the abyss void block and bridge composition.

## Verification

- `npm run check`: passed — 122 test files, 2,357 tests, TypeScript/build,
  floor validation, and regenerated export drift check.
- Floor 1 current guardian: passed; fleeing leaves the barrier barred.
- Floor 2 Cursed Library: passed, including save/load and wipe re-entry.
- Floor 3 Duelist's Vigil: passed all three guardian/recruitment legs.
- Reward framing: passed both key chests and full reward-text checks.
- Cinematic dialogue: passed Kazeharu, Isobel, Vestra fallback, narrow
  viewports, reduced motion, and no browser errors.
- Abyss bridge: passed WebGL and Canvas, including void collision and the
  combat-free first crossing.

The only floor-validation output remains the existing Floor 1 Namanda warning
set (missing bundled `namanda` tileset and intentional zone overlaps); no new
errors were introduced.

## Remaining issues

- Genuine remaining balance question: the Grand Forge formation is still very
  difficult for All Trades and All Steel under the tactical approximation. It
  was deliberately left unchanged because arrivals were not routinely wrecked
  by ordinary encounters and Shield Wall demonstrated a viable victory.
- Unverified: a human player using every class technique, row swap, and camp
  decision may outperform this tactical model. That is a follow-up measurement
  question, not grounds for changing numbers from this sample.
- Optional: a dedicated Isobel head-and-shoulders portrait could replace the
  contained shop sprite later, but the current card is production art and no
  longer reads as a giant placeholder initial.
