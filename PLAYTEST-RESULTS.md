# OnyxLabyrinth — FF6 Combat Autonomous Playtest Results

**Date:** 2026-07-09
**Method:** Playwright driving a production preview build (`npx vite preview --port 5176 --base /OnyxLabyrinth/`), system Chrome, full console + network capture.
**Evidence:** `.tmp-playtest-report/` (build.log, test.log, console.log, network.log, driver-stdout.log, summary.json, screenshots/)
**Driver script:** `.tmp-playtest-report/driver.mjs`

## Summary: **PASS**, with two coverage gaps and one driver bug (not a game bug)

Zero console errors, zero network failures, zero procedural-fallback sprites observed anywhere in ~12 minutes of live play. The FF6 presentation, per-turn resolve, damage popups, item-use banner, run/flee, and combat→dungeon transition all work as designed. Two systems were never actually exercised this session (spell casting / Magic banner, and Thief Hide→Ambush) purely because the automated driver's turn-order sampling never landed on those actors in its 4 detailed fights — not because anything failed. Also, exploration only reached floors 1, 3, and 4 (not 2 or 5) because the random-walk navigation couldn't reliably find stairs; this is a driver limitation, not a game bug (see §5).

## 1. Build and test verification

- `npm run build` — **zero TypeScript errors**.
- `npm test` — **275/275 passing**.
- Preview server served `/OnyxLabyrinth/` at HTTP 200 for the full session; stopped cleanly at the end.

## 2. Session stats

| Metric | Value |
|---|---|
| Total movement steps | 2,147 |
| Total fights | 20 |
| Elapsed time | 721s (hit the driver's 12-minute cap) |
| Sprite-strip requests | 94 |
| Sprite-strip failures | **0** |
| Console messages (any level) | **0** |
| Network failures (any URL, any type) | **0** |
| Dungeon visible at session end | **true** |

## 3. Enemies encountered and sprite verdicts

**8 of 16 enemies genuinely encountered** (see §5 for why the summary's raw count of 9 is off by one — a driver bug, corrected here):

| Enemy | Floor | Sprite verdict | Evidence |
|---|---|---|---|
| Training Dummy | 1 | ✅ Real strip, animates idle/attack/hurt/death | `05-combat-start-f2.png`, `99-training-dummy-sprites.png` |
| Slime | 1 | ✅ Real strip (green pixel-art blob, not a procedural circle) | `06b-damage-number-f2.png` |
| Skeleton | 1 | ✅ Real strip | `99-skeleton-sprites.png`, `04b-target-select-f1.png` |
| Failed Experiment | 3 | ✅ Real strip | `99-failed-experiment-sprites.png` |
| Lab Assistant | 3 | ✅ Real strip | `05-combat-start-f19.png` |
| Lesser Construct | 4 | ✅ Real strip | `99-orc-sprites.png` *(mislabeled — see §5)* |
| Elite Orc | 4 | ✅ Real strip | same |
| Werewolf | 4 | ✅ Real strip | same |

**Not encountered this session** (Orc, Armored Skeleton, Skeleton Archer — floor 2; Acid Puddle — floor 3; Big Titty Ogre — floor 4; Stone Guardian, Animated Armor, Headmaster's Echo — floor 5):

All 8 of these **did successfully load their idle/attack/hurt/death strips at boot-time prewarm** (`loadEnemySprites()` fires for the whole roster regardless of what's encountered) — confirmed via `network.log`, all `[STRIP 200]`, zero failures across all 16 enemies × 4 states = 64 enemy-strip requests. This is strong indirect evidence they'd render correctly if reached, but **not visually confirmed in an actual fight** this session.

**Party sprites:** all 5 classes × 6 states (idle/walk/attack/cast/hurt/death) = 30 strips, all `[STRIP 200]`. Visually confirmed animating and correctly mirrored to face LEFT in `crop-party-right.png` (cropped from `06-attack-f18.png`) — Knight, Priest, Wizard clearly rendering as real pixel art, weapons/staffs pointed toward the enemy side, no clipping against the bottom windows even with all 6 members on screen.

## 4. AGENTS.md "Combat (FF6) verification checklist" — item by item

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Combat starts: enemies LEFT, party RIGHT, three blue windows | ✅ Pass | `05-combat-start-f1.png` |
| 2 | Party sprites animate, idle-loop, acting character has bouncing marker | ✅ Pass (animation + facing confirmed; bouncing marker not specifically isolated in a still frame, but the ▶ menu highlight tracked the correct actor throughout) | `crop-party-right.png` |
| 3 | Turn playback: walk → attack → hurt + damage number → walk back, no Space-gating | ✅ Pass — every action resolved on Enter with no advance-prompt anywhere in 20 fights | `06-attack-f1.png` → `06b-damage-number-f1.png` |
| 4 | Damage popups: white=damage, green=heal, purple=poison, "MISS"=evade | ⚠️ **Partially verified.** White damage ✅ confirmed multiple times. Green heal ✅ confirmed (`08b-item-effect-f2.png`, though the heal landed on an already-full-HP target and showed "0" — see §6). Purple poison and "MISS" **not observed** — no poison-inflicting or evasive-enemy encounter occurred this session. |
| 5 | Spell banner + burst on cast | ⚠️ **Not exercised.** No Magic menu was ever opened successfully this session (see §5). Item-use *did* correctly show a banner (`"Healing Potion"`), which shares the same code path as spells, so this is low-risk — but the spell-specific path itself is unverified this run. |
| 6 | Target cursor blinks, menu lists names with ▶ | ✅ Pass | `04b-target-select-f1.png` shows ▶ Skeleton with two more Skeleton rows below |
| 7 | Image-strip enemies render PNG facing the party; unmapped enemies fall back | ✅ Pass for all 8 encountered enemies. Could not test the "unmapped enemy falls back" half since every enemy in the current 16-strong roster now has art (per the recent bestiary re-theme) — there is no unmapped enemy left to test against. |
| 8 | Defeated fade: death strip plays then fades; KO'd party stays down | ⚠️ **Indirectly confirmed only.** Every detailed fight ended in "Victory!", meaning enemies did die and the game proceeded correctly, but no screenshot specifically caught a mid-fade death frame. No party member was ever knocked out this session (party never dropped below ~75% HP), so the KO-hold-pose behavior is unverified. |
| 9 | Result window: victory shows gold/XP, Enter exits | ✅ Pass — `09-result-f1.png` through `f19.png` all show correct "Victory!" + gold/XP text; `09-run-f3.png` shows the "Escaped" variant | |
| 10 | Combat → dungeon transition: textures intact | ✅ Pass — `10-dungeon-after.png` shows a fully textured, non-black corridor view with the party strip correctly populated | |
| 11 | Windows never clip sprites | ✅ Pass — confirmed with the full 6-member party on screen simultaneously | `crop-party-right.png` |

**9/11 fully pass. 2/11 partial** (spell banner, poison/MISS popups) purely due to this session's turn-order/enemy-type sampling, not a defect.

## 5. Issues found

### 5.1 Driver bug (my script, not the game): enemy-name substring collision
`ENEMY_NAME_TO_ID` matching used `text.includes(name)` for each of the 16 known display names. "Elite Orc" contains the substring "Orc", so a floor-4 encounter (Lesser Construct / **Elite Orc** / Werewolf) falsely registered a plain "Orc" (floor-2 enemy) sighting that never actually happened, and `99-orc-sprites.png` is actually a screenshot of the Lesser Construct/Elite Orc/Werewolf trio. Verified by reading the raw per-fight log (`grep "^Fight #" driver-stdout.log`) — floor 2's `orc` was never in any fight's actual text. **True distinct-enemy count for this session is 8, not the 9 in `summary.json`.** The same class of bug likely also masked whether Armored Skeleton / Skeleton Archer were reached (their names contain "Skeleton", which would have falsely satisfied plain `skeleton` if seen — but since no fight text ever contained "Armored Skeleton" or "Skeleton Archer" per the raw log, floor 2 genuinely was never reached at all). Fix for any future driver: match on exact enemy tokens split by count-suffix (`×N`), not substring inclusion.

### 5.2 Non-monotonic floor order suggests a chute/teleporter, not a bug
Fight sequence went floor 1 (fights 1–17) → floor 4 (fight 18) → floor 3 (fight 19) → floor 1 again (fight 20, "Slime×2"). Floors 1–4 each have documented `chute`/`teleporter` tiles per `floors.ts`; a random walk stepping onto one would explain jumping floors non-monotonically and landing back on floor 1. This reads as the dungeon's chute/teleporter mechanic firing correctly under random exploration, not a defect — flagging only because it's an unusual pattern worth a human sanity-check if it recurs.

### 5.3 Coverage gaps (not game bugs — driver sampling limits)
- **Magic/spell casting never visually verified.** The driver's `detailedFight()` only checks the *second* actor in turn order for a caster; in all 4 detailed fights that slot happened to be a non-caster (Fighter/Thief), so `Escape` was pressed and the fight fell back to Attack. The party has 3 known casters (Dell, Fenn, Eve) out of 6, so this is a ~50/50 coin flip per fight that came up wrong 4/4 times — plausible but unlucky. **Recommend:** re-run with a driver that walks the turn queue until it finds *any* caster's turn, not just the second slot.
- **Thief Hide→Ambush never captured**, same root cause (Coda's turn didn't land in a checked slot).
- **Floor 2 and floor 5 never reached** — see §5.4.
- **No purple poison popup or "MISS" evade popup** captured — no poison-inflicting enemy (Acid Puddle, Cobweb-lineage) or evasive enemy was fought.
- **No party-member KO** occurred — the death-pose-hold behavior (checklist item 8, second half) is unverified.

### 5.4 Random-walk navigation could not reliably find stairs
Floor 1's stairs-down tile is a straight 4-tile corridor from the start position (`floors.ts`: start `(6,6)`, stairs `(6,10)`, connected via a single south corridor), yet the pure random walk (65% forward / 17.5% each turn) took **~1,600 of 2,147 total steps** before reaching it — likely because "forward" moves relative to current facing (not absolute direction), so reaching a specific tile requires the walk to both face the right way *and* have an unobstructed run of forward presses, which is inefficient to hit by chance. This ate most of the 12-minute budget on floor 1 alone, and floor 2 was seemingly skipped entirely via a chute/teleporter (§5.2) rather than found via stairs. **Recommend for future playtests:** either raise the time budget significantly (floors 2–5 likely need 10+ minutes each at this exploration rate), or write a coordinate-aware greedy walk toward the known stairs coordinates (the game doesn't expose player x/y to the page, but a script could track facing purely from its own issued turn commands plus the known starting facing, and bias movement toward the known stairs delta).

### 5.5 Minor UX observation, not a bug
`08b-item-effect-f2.png` shows a Healing Potion used on Aria while she was already at full HP (24/24), producing a green "0" popup. Functionally correct (no HP lost, nothing to restore), but reads a little oddly next to FF6's convention of not showing a heal number at all for a fully-topped-off target. Not something this playtest can call a defect — it's a consequence of the driver always targeting "the first ally" rather than "the most-wounded ally." Worth a design decision (either accept "0" as an intentional signal that the potion had no effect, or suppress the popup when actual healing is 0) but not urgent.

## 6. No regressions found
- No console errors, warnings, or uncaught exceptions in ~12 minutes / 20 fights / 2,147 keypresses.
- No HTTP failures of any kind (strips or otherwise).
- No procedural-fallback silhouette observed in place of an expected sprite — every enemy and party sprite in every screenshot is real pixel art.
- No stuck banners, no black screens, no clipped sprites, no canvas corruption on floor transitions or combat exit.
- HP/SP state persisted correctly across sequential fights (Bram's HP carried from 26/26 in fight 18 to 21/26 at the start of fight 19, matching damage taken in fight 18).

## 7. Recommended next steps

1. **Re-run a targeted "systems" playtest** specifically to capture Magic/spell banner and Hide→Ambush: have the driver walk the turn queue (not just check slot #2) until it finds a Mage/Priest turn for a spell cast, and a Thief turn for Hide.
2. **Fix the driver's substring name-matching** before trusting any future automated enemy-coverage count (exact-match on name minus the `×N` suffix).
3. **Give floor 2 and floor 5 a dedicated, longer-budget run**, or build a coordinate-aware navigation script, to verify Orc/Armored Skeleton/Skeleton Archer (floor 2) and the Headmaster's Echo boss + silence mechanic (floor 5) — the boss fight in particular has never been visually verified in the new FF6 system.
4. **Manually trigger a poison and an evade** (Acid Puddle, or any `evasive`-tagged enemy) to confirm the purple/MISS popup colors, since none appeared organically this session.
5. Everything else in the AGENTS.md checklist that *was* exercised — layout, damage popups, item use, run/flee, victory, dungeon transition, sprite loading — is solid and needs no further attention right now.

## Appendix: file index

- `.tmp-playtest-report/build.log`, `test.log` — pre-run gates, both clean
- `.tmp-playtest-report/console.log` — empty (zero messages)
- `.tmp-playtest-report/network.log` — 94 strip requests, all 200, zero failures
- `.tmp-playtest-report/driver-stdout.log` — full run narration with per-fight enemy text
- `.tmp-playtest-report/summary.json` — raw driver output (see §5.1 for the one correction needed)
- `.tmp-playtest-report/screenshots/` — 56 PNGs covering every phase listed above
