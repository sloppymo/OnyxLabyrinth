# Floor 1 Definitive Pass — session report (2026-08-06)

> **Historical entry-flow note (2026-08-27):** This report predates the fixed
> Old Man + Rat King campaign duo. Replace its default-party confirmation step
> with direct prologue → Edgehollow when replaying the pass.

Scope: the "OnyxLabyrinth Floor 1 Definitive Pass" implementation prompt (10 phases, A–J).
This document is the honest state of one session's work against that prompt, per its own
§9 deliverable requirements. Read this before continuing the work or claiming any phase
beyond what's listed here as done.

## Repository state

- **Branch:** `floor1/definitive-pass`, created in the existing worktree
  `/home/sloppymo/OnyxLabyrinth-hotbois-tavern`, branched from
  `origin/floor1/raft-tavern-redesign` @ `f6a8d8c` (PR #26, open, unmerged).
- **PRs #26 and #32 remain open on `main` and this branch is a superset of both** —
  `origin/fix/stair-reciprocity` (PR #32) was merged into it as the first commit.
  Whoever picks this up needs to decide what happens to #26/#32 themselves; this branch
  does not close or supersede them on GitHub.
- **Nothing pushed. Nothing merged to `main`. Working tree clean.**
- Commits on top of the PR #26 base, in order:
  1. `70d0826` — merge `fix/stair-reciprocity` (Phase A: reciprocal stairs).
  2. `ff6869b` — Phase G: The Party That Returned capstone (initial version).
  3. `16b2234` — fix: restore floor-1.json's indentation (my own tooling mistake in
     commit 2, corrected immediately after).
  4. `fb3d70a` — fix: seal the stairs guardian's edge so fleeing can't bypass the fight
     (a real bug found via testing, not part of the original design).
  5. `22d1082` — fix: gate Fifth Chair on the raft too, and fix the shield quest
     equipped-item soft-lock.
  6. `b74b454` — refactor: dedupe Fifth Chair unlock check; docs: this report (first draft,
     written before the manual playthrough below).
  7. `8d1fc3f` — fix: two bugs found by the manual playthrough performed after the first
     draft of this report — see **Manual playthrough** below. Both are now fixed and
     re-verified live, not just unit-tested.

## §7 minimum-shippable scorecard

| # | Requirement | Status |
|---|---|---|
| 1 | Raft progression route works without softlocks | **Done** (inherited from PR #26, re-verified) |
| 2 | Reciprocal stairs work in both directions | **Done** (PR #32, merged in) |
| 3 | Camp no longer provides unlimited free full restoration | **Not started** |
| 4 | Hot Boi's is persistent, useful, and reactive | **Not started beyond PR #26's baseline** (no new reactivity added) |
| 5 | Last Lantern is an authored encounter, not an NPC checkbox | **Not started** — still exactly the checkbox quest the prompt describes replacing |
| 6 | A Last Lantern outcome visibly changes Hot Boi's | **Not started** (depends on #5) |
| 7 | Warden Sphere has a visible Floor 1 payoff | **Not started** |
| 8 | Shield quest cannot become permanently impossible | **Partially done** — the *equipped* case is fixed (see below); *selling/discarding* the shield still leaves the quest stuck forever, unchanged from before. No keep/abandon resolution exists. |
| 9 | Vess has an authored identity and distinct combat behavior | **Partially done** — recruitment gating is now correct (Last Lantern + raft), but Vess still has no Opening trait, no bespoke dialogue beyond what PR #26 shipped, and no combat identity. Phase F untouched. |
| 10 | Player observes Vess in an ordinary encounter before the climax | **Not started** |
| 11 | Returned party blocks the first descent exactly once | **Done** — this is the session's main deliverable |
| 12 | Returning from Floor 2 never retriggers the returned party | **Done** — covered by both the tile-inert check and the sealed-edge fix |
| 13 | Regional encounters communicate different lessons | **Not started** |
| 14 | Early economy supports supplies, rest, ordinary purchases | **Not started** (no Camp Supply item exists) |
| 15 | Old saves migrate safely | **Done for what shipped this session** (v15→v16); v16→v17 (Camp) and beyond don't exist yet because Camp doesn't exist yet |
| 16 | Full repository verification gate passes | **Done** — see Verification below |
| 17 | Final playthrough matches the described arc | **Done for the slice this session built** — tavern → raft dock → guardian fight (flee/re-engage/win) → descend → return, live-verified in a real browser (see Manual playthrough below). The *rest* of the described arc (Last Lantern encounter, Vess demonstration battle, etc.) isn't built yet, so it can't be part of a full-arc playthrough. |

**Net: items 1, 2, 11, 12, 15, 16, 17 fully done; 8 and 9 partially done; 3, 4, 5, 6, 7, 10, 13,
14 not started; 17 unverified.**

## What was implemented

### Phase A — reconciled, not built
PR #26 (raft/tavern/quests/companion) and PR #32 (reciprocal stairs) were independently
complete and merged cleanly with no conflicts. This was almost free — the actual Phase A
work here was verification (`npm run check` on the merged result), not implementation.

### Phase G — "The Party That Returned" (the main deliverable)

A one-time scripted fight blocks the single-tile chokepoint at (18,21) on Floor 1,
between the raft's landing dock (17,21) and the stairs_down at (19,21).

**Two independent mechanisms combine to make this unbypassable:**
- A new `TileFeature` value `"guardian"` on (18,21) triggers an intro dialog (three lines,
  paginated) and a forced combat the moment the party arrives there.
- The edge from (18,21) toward the stairs is authored **`"barred"`** (not `"wall"` —
  see the reachability note below) via a new `StairsGuardianDef.blocksDir` field, and only
  flips to `"door"` (both sides, via the existing `unlockedDoors` mechanism) on an actual
  combat victory.

This second mechanism exists because of a bug I found and fixed mid-session: the tile
trigger alone only fires on **arrival**. A party that fled the fight was left standing on
(18,21) with the encounter unresolved, and the very next step east reached the stairs and
transitioned to Floor 2 having never won. The sealed edge closes that gap — see
`fb3d70a`.

**Enemies** (`src/data/enemies.ts`, `floors: []` so they never enter random encounter
tables): Ruined Vanguard (front, tanky, `phalanx-guard` ability — reused, not new),
Hollow Knifeman (front, fast, targets the lowest-HP% living party member via one new
`EnemyAbilityDef.preferWounded` flag), Ash Scribe (back, `caster`/fire special — reused),
Drowned Cantor (back, `healer`/`curse` — both reused). Sprites all reuse existing strips:
`armored-skeleton`, `skeleton`, `warlock`, `ghostfire` respectively — no new art.

**Persistence:** `GameState.clearedStairsGuardians: string[]` (save v16). Migration
v15→v16: parties with `deepestFloorReached >= 2` under the old rules are marked
pre-cleared (both the flag *and* the door-edge keys — marking the flag alone would have
loaded with "done" recorded but the tile still physically sealed).

**Tests:** `src/game/floor1-returned-party.test.ts`, 14 tests covering the prompt's 12
mandatory staircase edge cases plus content-shape assertions, including the fled-player
case. Three pre-existing reachability tests (`floors.test.ts`,
`floor1-raft-pocket.test.ts`) were updated because their BFS helpers didn't know a
`"barred"` edge could be resolved by combat as well as by keys — they now assert the raft
alone is no longer sufficient and add the guardian-cleared case explicitly.

### Two additional §7 fixes (not part of the original phase order — pulled forward because
they were cheap and already broken)

- **Fifth Chair gate:** previously appeared as soon as Last Lantern completed, with no
  check that the party had the raft. Now gated on both, via a single
  `fifthChairUnlocked()` helper used by both `scorchboardEntries` (visibility) and
  `acceptScorchboardQuest` (defense in depth against the UI ever being bypassed).
- **Shield quest soft-lock:** "A Shield Left Behind" only ever checked
  `state.inventory` for `shield+1`, never `state.equipment` — equipping the shield, the
  ordinary thing to do with it, made the quest permanently unwinnable. Its own
  `failPolicy` text already admitted this. `hasShieldLeftBehind` /
  `consumeShieldLeftBehind` (`game/tavern.ts`) now check and consume from either
  location, preferring an inventory copy when both exist.
  **This does not fix the sold/discarded case** — if the shield leaves the party
  entirely, the quest still sticks forever. That's the documented remaining limitation in
  `failPolicy`, not an oversight.

## Four latent bugs found (worth flagging loudly for whoever continues this)

Two found by unit testing before the playthrough, two found only by the playthrough
itself — the split is itself the argument for never skipping the live pass.

1. **`cloneFloor()` in `src/data/floors.ts` silently drops any newly added `FloorDef`
   field.** It's a hand-written field-by-field copy, not a spread. Adding a field to
   `FloorDef` requires updating it in *four* places (`FloorDef` itself, `cloneFloor`,
   `floorDefToMap`, `mapToFloorDef`) plus `parseFloorMapJSON`'s parser — miss `cloneFloor`
   specifically and the field silently reads as `undefined` on every floor loaded at
   runtime (both fresh games and saves), even though the static content and the type
   system both look correct. My own `stairsGuardian` field hit exactly this; a unit test
   caught it (`handleTileFeature` returning `null` instead of the expected trigger).
   Nothing else in the test suite would have caught it — the omission doesn't fail any
   existing test.

2. **Suspected (unverified) pre-existing bug: `save.ts`'s `unlockedDoors` restore loop
   only reopens the *one* side of an edge matching each stored key, never its reciprocal.**
   `openBarredGate` (traversal.ts) opens both sides of an edge at runtime but records only
   one key (`${floorId}:${x}:${y}:${dir}`) into `unlockedDoors`. On save/load, the restore
   loop sets `floor.grid[y][x][dir] = "door"` for each stored key and nothing else — so
   the far side never gets restored. I hit this directly building the guardian edge (fixed
   it there by storing both keys) but **did not check whether the one pre-existing barred
   gate on Floor 1 — at (3,21) — has the same asymmetry after a save/load round trip.** I
   did not fix this and did not verify it's actually broken; flagging it as worth a
   dedicated test before anyone relies on barred-gate state surviving a reload.

3. **FIXED. `main.ts`'s `onMove()` guardian-trigger handling only existed in the
   safe-zone branch, not the (near-identical, duplicated) main branch.** A `replace_all`
   edit against what looked like two byte-identical code blocks silently matched only
   one. Since the guardian tile is not in a safe zone, the trigger never fired in real
   play — confirmed dead in the browser before the fix, confirmed live after it. Nothing
   in `features.test.ts` or `floor1-returned-party.test.ts` could have caught this: both
   test `handleTileFeature` directly, never `main.ts`'s `onMove` wiring. **This is the
   single clearest argument in this whole report for why "all tests pass" is not the same
   claim as "the feature works."**

4. **FIXED, and pre-existing (not introduced this session).
   `DungeonDialogController` (`engine/dungeon-dialog.ts`) had no renderer at all, ever.**
   It correctly routed keys and flipped `state.mode`, but nothing anywhere in the
   codebase read its `currentPage`/`pageCount`/`selectedIndex` getters to paint them —
   no DOM container, no CSS, no test file. This affects the pre-existing chute
   point-of-no-return warning from PR #26 as much as the new guardian intro: a player
   stepping onto either trigger would see the corridor keep rendering with zero visual
   indication a modal was open, while their next keypress was silently consumed by it.
   Fixed by giving the controller a `panel` + a `render()` built on the existing
   `FF6Window` library (the same component `npc-ui.ts`/`trap-prompt-ui.ts` already use),
   and wiring `showMode("dialog", ...)` at the `main.ts` call sites. Live-verified working
   for both the guardian intro and the barred-edge blocked message.

## State and migration

Save is at **v16**. New field: `clearedStairsGuardians: string[]`. Migration v15→v16
(see `game/save.ts`) auto-clears for `deepestFloorReached >= 2` and seeds both
`unlockedDoors` keys for the guardian edge. Following this repo's established convention
(one migration step per shipped feature, visible in the v4→v16 chain already in the
file), Phase B (Camp Supply) would want v17 and Phase D (Last Lantern rewrite) would want
v18 whenever they're built — don't try to collapse them into one bump ahead of time.

## Verification

Commands run, exact tail output (from this session's transcript, not paraphrased):

```
$ npm run check
...
 Test Files  101 passed (101)
      Tests  2074 passed (2074)
...
=== Floor 1: The Hall of Five Wounds ===
OK (no issues)
=== Floor 2: The Cursed Library ===
OK (no issues)
=== Floor 3: The Forge of Ashes ===
OK (no issues)
=== Floor 4: The Null Choir ===
OK (no issues)
=== Floor 5: The Weeping Cistern ===
OK (no issues)

> floor:export-check
OK (floor exports match generated output)
```

`npm run build` passes with zero TypeScript errors (both the app and tools/editor
checks). No pre-existing failures were inherited or worked around.

## Manual playthrough: **performed after the first draft of this report**

The first draft of this report said the playthrough was the largest gap and had not been
done. It has now been done, in a real Chromium tab against a production preview build
(`npx vite preview`), driving the `?debug=1` surface. It found two real, previously-
unverified bugs (see below) that no unit test could have caught, fixed both, and
re-verified the entire capstone flow live afterward.

**Sequence actually driven, primary path real (keyboard input, real rendering), setup
positioning via `__onyxDebug.jumpTo`/`loadSave` where noted as secondary debugging:**

1. Title → New Game → skip prologue (Escape) → confirm default party (Enter) → Town →
   Enter Dungeon. Real corridor rendering confirmed (chest sprite, textures, party HUD).
2. Real one-step walk onto Hot Boi's tile (10,24) — tavern panel opens correctly:
   greeting text, ambient description, Talk/Rest/Rumors/Scorchboard/Companions/Leave menu
   all live-verified. **Scorchboard live-confirmed the Fifth Chair fix**: only "The Last
   Lantern" and "A Shield Left Behind" show on a fresh save with no raft — Fifth Chair
   correctly hidden.
3. **Secondary debugging** (`loadSave` to grant `keyItems:["raft"]`, `jumpTo` to (17,21)):
   positioned at the raft's toDock rather than manually re-walking the chute/raft loop,
   which PR #26's own test suite already covers exhaustively.
4. Real step east onto the guardian tile (18,21) — **found bug #1 here**: nothing
   happened. Debug event log showed the `feature` event fired correctly but no dialog or
   combat followed. Root-caused, fixed, rebuilt, re-verified: the guardian-trigger
   handling had only been added to `onMove`'s safe-zone branch, not its main branch (see
   "Two latent bugs" below, now three).
5. Retried — **found bug #2**: `state.mode` correctly flipped to `"dialog"` but nothing
   rendered on screen at all (`#combat-panel` empty, `display:none`). Root-caused: the
   entire `DungeonDialogController` had no renderer anywhere in the codebase, a
   pre-existing gap from PR #26 (it also affects the chute point-of-no-return warning).
   Built a minimal renderer on the existing `FF6Window` library, re-verified live: intro
   text now paginates and displays correctly across all three lines.
6. Confirmed combat launch: all four enemies visible with correct names/HP/sprites
   (Ruined Vanguard 34/34, Hollow Knifeman 22/22, Ash Scribe 20/20, Drowned Cantor
   18/18), turn order strip, party HUD, action palette (Atk/Def/Magic/Tech) all rendering
   correctly; a real round resolved (Coda took 7 damage, Dell took a further hit on
   re-fight).
7. **Fled** (`__onyxDebug.exitDebugCombat("fled")`) — party left standing on the guardian
   tile, `clearedStairsGuardians` still empty. Real step east attempted:
   **visibly blocked** — "A barred gate blocks the way. It cannot be opened from this
   side." rendered correctly (this message uses the same fixed renderer).
8. Repositioned to the guardian tile and re-approached for real — **fight re-triggered
   correctly** (fresh intro dialog, fresh combat, confirming a fled fight isn't
   permanently stuck open or permanently bypassed).
9. **Won** (`__onyxDebug.exitDebugCombat("victory")`) — verified in one query:
   `clearedStairsGuardians` gained the id, the edge flipped to `"door"` on both sides,
   `greater-healing-potion` appeared in inventory, and the victory line ("The four of
   them go still and do not rise...") rendered in the message band.
10. Real step east onto and through the now-open stairs — **descended to Floor 2**
    ("The Cursed Library"), confirmed via snapshot (`floor.id === 2`, landed on that
    floor's `stairs_up` per the Phase A reciprocal-stairs fix).
11. Real steps to leave and re-enter the Floor 2 stairs_up tile, ascending back —
    **landed exactly on Floor 1's (19,21) stairs_down**, the correct reciprocal tile,
    with `clearedStairsGuardians` still intact across the round trip.
12. Real walk west through the now-inert guardian tile (18,21), approaching from the
    stairs side — **silent, no retrigger, no message**, confirming the "safe to
    re-cross after clearing" requirement.
13. **Real save/load round trip** through the app's own `dumpSave`/`loadSave` (the actual
    `serialize`/`deserialize` functions, not a mock): `clearedStairsGuardians`, the opened
    edge, position, and mode all survived intact. Save version confirmed at 16.

**Not covered by this playthrough** (acceptable gaps, not required for this session's
scope): recruiting Vess and fighting with her present (requires the full Last
Lantern + raft quest chain by hand, or further save-state seeding — Vess has no combat
identity yet regardless per Phase F being unstarted, so her presence wouldn't change
anything about the guardian fight itself); the Camp/shop/save-menu screens unrelated to
this capstone; audio (no speakers in this environment, cues were not checked).

## Balance assumptions — stated as assumptions, not measurements

The four new enemies' stats (34/22/20/18 HP, attack 4–9, AC 2–6) were calibrated by
comparison against existing floor-2-tier enemies in `data/enemies.ts` (Armored Skeleton,
Orc, Warlock, Ghostfire), not measured against an actual party in combat. The prompt's
"a reasonably prepared first-time party can win in approximately one or two attempts"
target is **unvalidated**. `__onyxDebug.startCombat` or Arena mode (once the guardian's
spawns are testable there) is the cheap way to check this before shipping — I did not do
it this session.

## Known limitations (be direct)

- **Phases B, D, E, F, H, I, J are not started.** This is not "mostly done" — six of ten
  phases have no code at all.
- **Last Lantern is still the exact NPC-checkbox quest** ("accept quest, speak to Sister
  Caldris, return for gold") the prompt explicitly asked to replace with an authored
  encounter. Nothing here touches it.
- **Camp still fully restores the party for free**, anywhere outside a few hazard tiles.
  No Camp Supply item, no partial-recovery mechanic, no encounter risk on rest.
- **The shield quest's sold/discarded case is still a genuine soft-lock** (the quest
  never resolves). Only the equipped case was fixed this session; the `failPolicy` text
  was updated to describe this narrower, accurate scope rather than claim more than what
  shipped.
- **Vess has no combat identity.** She recruits correctly (with the corrected gate) and
  fights as an ordinary AI-controlled summoned ally, but the "Opening" trait, bespoke
  dialogue lines (pre-raft, post-capstone, defeat-and-return), and the guaranteed
  demonstration battle before the climax are all unbuilt.
- **No regional encounter identity, no Red Skeleton gold audit, no crypt-key loop
  evaluation, no sensory/environmental polish pass.**
- **The Warden Sphere has no payoff of any kind.**

## Recommended next session order

Following the same "cheapest ship-blockers first" logic that guided this session:
Camp (Phase B, self-contained, ~1 new item + 1 file rewrite + 1 save bump) is the next
best-value item on the §7 list — but per the advisor consulted mid-session, it should be
attempted only with enough budget to finish it completely; a half-migrated Camp (new item
seeded in some starting-inventory paths but not others, or a save migration without a
matching UI update) is worse than leaving it untouched, which is why it wasn't started
here.
