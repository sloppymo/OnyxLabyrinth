# Campaign Progression Sprint — Implementation Plan

**Goal:** Turn "excellent combat prototype + solid F1-3 tutorial dungeon" into a coherent five-floor campaign: perk tiers land as spaced decisions instead of a floor-1/2 dump, gold and gear matter through floors 4-5, floors 4-5 have distinct threat instead of denser floor-3 remixes, plus two small high-value polish items (auto-equip, deep-water tell).

**Architecture:** Pure data/logic changes in `src/game/` (leveling, save, equipment) and `src/data/` (enemies, items already mostly done, floor JSON), one new `GameState` field, no renderer/combat-math/encounter-rate changes. Design note with full rationale and re-verified numbers: `docs/superpowers/specs/2026-07-24-campaign-progression-design.md` — **read it before touching code**, it corrects several audit claims that are now stale.

**Tech stack:** TypeScript + Vite, Vitest, `tsx` floor-tool CLI. No new dependencies.

**Baseline (2026-07-24, commit `a633583`):** build clean, 1038/1038 tests, floor:validate clean on floors 1-5.

**Global constraints (from `AGENTS.md`, do not violate):**
1. No combat math / encounter rate / map geometry changes beyond what's explicitly scoped here.
2. Outside-combat damage still floors at 1 HP.
3. NPCs stay additive-only (not touched this sprint).
4. Inventory stays `InventoryEntry[]`; `reconcileInventoryAfterCombat` for post-combat sync.
5. Cursed-gear rules in `combat-equipment.ts` (`equipItem`/`manualEquip`/`forceEquip`) are not to be weakened by the range-aware auto-equip change.
6. Build zero-TS-error gate before any task is marked done; relevant Vitest suite green.
7. Conventional commits; **do not commit unless the human asks**, per session norms — this plan tracks progress via checkboxes, not commits.
8. No renderer/combat-scene touches.

**Sequencing (fixed — do not reorder):** A must land and be tested before D is tuned. B and E are independent/parallel-safe. C depends on A's field addition for the save migration but is otherwise independent; do together with D since new gear should matter against new enemies.

---

## Workstream A — XP semantics (ship first)

### Task A1: Spend XP on level-up — ✅ DONE 2026-07-24
**Files touched:** `src/game/leveling.ts` (new `cumulativeXpToReachLevel` + `applyLevelUps` pure helpers), `src/main.ts` (endCombat now calls `applyLevelUps` instead of inlining the while-loop; Arena target-level path annotated as exempt), `src/game/leveling.test.ts` (+7 tests).

- [x] Regression tests added: exact-cost level-up spends to 0; remainder carries forward; Echo's 320 XP stops at L2 not L3+ (the proof-of-fix test); multi-level-up in one call; perk-tier collection; no-op when short.
- [x] `applyLevelUps` is a pure, directly-testable helper in `leveling.ts` (not inlined in `main.ts`) — returns `{ character, tiersCrossed }`, letting `main.ts` stay a thin caller. This also means the save migration (A2) can reuse `cumulativeXpToReachLevel` without duplicating the sum.
- [x] Confirmed the Arena target-level path (`main.ts` ~1358) never touches `char.xp` and needed no change; added a comment explaining why.
- [x] `npm run build` clean, `npx vitest run src/game/leveling.test.ts` 16/16 green.

**Acceptance:** verified via the design note's re-run arithmetic (§2) — spend-on-level-up switches the curve from linear (L12 at 1,320 lifetime XP, producing the L37-L92 blowout) to triangular (L12 at 7,920 cumulative XP), landing in the target band across the plausible fight-count range. Real-fight-count confirmation is Task F1.

### Task A2: Save v11 — XP residual migration + `deepestFloorReached` — ✅ DONE 2026-07-24
**Files touched:** `src/types/index.ts` (`deepestFloorReached: number` on `GameState`), `src/game/state.ts` (`createGameState` defaults it to the starting floor's id), `src/game/features.ts` (`transitionToFloor` — the single shared floor-change site for stairs/teleporters/chutes — takes the max, never lowers it), `src/game/save.ts` (`SAVE_VERSION` → 11, v10→v11 migration, serialize/deserialize), `src/game/save.test.ts` (+4 tests).

- [x] `deepestFloorReached` added to `GameState`, defaulted in `createGameState`, updated at the one shared `transitionToFloor` call site (confirmed Arena doesn't route through it — Arena's floor cycling is a local `ArenaController` field, not `GameState.floor`, so it correctly can't leak into shop-unlock progression).
- [x] v10→v11 migration: recomputes each character's `xp` as residual-toward-next-level via `cumulativeXpToReachLevel(c.level)` (shared helper from A1, not duplicated), and backfills `deepestFloorReached` from the save's `floorId`.
- [x] Tests: round-trip of `deepestFloorReached`; **realistic** v10 migration case (level-6 character, `xp=650` — the value any real old save actually has at that level, since old level/xp were always in sync post-combat) migrates to `xp=0`, level unchanged; a second edge-case test with an unrealistically high `xp=2000` confirms the clamp never goes negative and never cascades. `deepestFloorReached` backfill from `floorId`.
- [x] `npm run build` clean, `npx vitest run src/game/save.test.ts` 25/25 green, full `npm test` 1049/1049 green, `npm run floor:validate` clean.

**Acceptance:** confirmed, with an honest caveat — the migration is effectively a **reset of in-level XP progress to 0 for every character above level 1** (levels themselves are preserved). Real old saves can't cascade into a level-up burst either way (old and new curves share the same per-level cost for a character's *current* level; the divergence only compounds looking several levels ahead), so this was a deliberate fairness choice — don't let cheap old-economy XP buy free progress under the new, steeper economy — not a bug-avoidance hack. Documented in the `save.ts` migration comment and in the design note.

---

## Workstream B — Range-aware auto-equip — ✅ DONE 2026-07-24

### Task B1: Veto unreachable weapons in auto-equip
**Files touched:** `src/game/combat-equipment.ts` (new exported `weaponIsReachable`; `isBetterEquip`/`equipItem` gained an optional `holder?: Character` param; `findBestEquipTarget` skips unreachable weapon candidates), `src/engine/town-ui.ts` + `src/game/features.ts` (all 5 `equipItem`/buy-confirm/Optimum/chest-pickup call sites now pass the holder), `src/game/combat-equipment.test.ts` (new file, 12 tests).

- [x] Regression test written and passing: back-row Mage + Staff offered a Mace is correctly refused by `isBetterEquip`/`equipItem`, and `findBestEquipTarget` routes the Mace to a reachable front-row candidate instead — even though the Mage's current weapon score was weaker.
- [x] Reused `canReach`/`effectiveWeaponRange` from `combat-reach.ts` verbatim (perk reach overrides like Sweep/Lunge are honored for free). `holder` is optional and defaults to the old ATK/DEF-only behavior when omitted — no caller broke.
- [x] `findBestEquipTarget` skips unreachable weapon candidates entirely (armor unaffected — armor has no `range`).
- [x] `manualEquip`/`manualUnequip`/`forceEquip` untouched; the cursed-item auto-equip path (`features.ts`) now benefits incidentally (a cursed close-range weapon can no longer clamp onto a back-row character who could never use it) without any change to curse-removal rules.
- [x] `npm run build` clean, `npx vitest run src/game/combat-equipment.test.ts` 12/12, full `npm test` 1061/1061 green.

**Acceptance:** confirmed — buying/looting a close-range weapon no longer auto-equips onto a back-row caster in a way that zeroes their Attack reach; front-row/close-range routing for melee classes is unaffected (covered by a dedicated regression test).

---

## Workstream C — Shop depth unlock + gold sink (do with D) — ✅ DONE 2026-07-24

### Task C1: Shop stock gated by `deepestFloorReached`
**Files touched:** `src/engine/town-ui.ts` (new `maxShopTier()` helper + `getShopBuyList` filter change), `src/engine/town-ui.test.ts` (+6 tests), `src/game/features.test.ts` (+2 tests, added on review).

- [x] Implemented as `Math.max(2, Math.min(5, deepestFloorReached))` — floors 1-2 keep today's tier-≤2 cap exactly (regression-tested), tier 3 unlocks at floor 3 reached, tier 4 at floor 4, tier 5 at floor 5. Gated on `deepestFloorReached`, not current floor — verified with a dedicated "backtracked to floor 1's town, deepestFloorReached still 5" test.
- [x] Tests confirm the exact item-id boundaries: `great-sword` (tier 3) absent until floor 3; `runeblade`/`mythril-plate`/`sages-circlet` (tier 4) absent until floor 4; `voidblade`/`dragonscale-mail`/`focus-ward` (tier 5) absent until floor 5.
- [x] Gold income recomputed directly from live `ENCOUNTER_TABLES`/`ENEMIES_BY_ID` (weighted avg gold/fight: F1 19.2, F2 63.2, F3 165.9, F4 206.4, F5 215.2). Checked existing tier-4/5 prices (Runeblade+2 1200g, Voidblade+2 1500g, Mythril Plate+2 960g, Dragonscale Mail+2 1200g, Sage's Circlet 300g, Focus Ward 320g) against the design note's 6-15-fights/floor cumulative-income range (~2,000-6,700g through floor 4-5) — reasonable, not grossly mismatched. **No price changes made.**
- [x] `npm run build` clean, `npx vitest run src/engine/town-ui.test.ts` 19/19, full `npm test` 1067/1067 green.
- [x] **Added on review** (advisor flagged the shop tests all set `state.deepestFloorReached` directly, which verifies the *read* but not the *write* — `transitionToFloor`'s `Math.max(state.deepestFloorReached, floorCopy.id)` is the one-liner that actually makes C function in real play, and had no test): two tests in `features.test.ts` calling the real `transitionToFloor` — descending floor 1→4 advances `deepestFloorReached` to 4; backtracking 4→3 moves `floor.id` back but leaves `deepestFloorReached` at 4.

**Acceptance:** confirmed — after reaching floor 4, shop stock includes floor-4 tier gear; floor 1-2 shop behavior is byte-identical to today (explicit regression test); the write path that advances `deepestFloorReached` in real play is now directly tested, not just the read path.

### Task C2: Strip floor-5 tier-1 filler loot
**Files touched:** `src/content/floors/floor-5.json`.

- [x] Replaced `rapier+1` (13,4) → `great-sword+1` (tier 3 weapon) and `dagger+1` (4,6) → `plate-mail+1` (tier 3 armor, also diversifying floor 5's loot away from all-weapons). Floor-4's tier-2 `long-sword+1`/`mace+2` were left alone — the design note only flagged floor-5's tier-1 drops specifically, and tier-2 loot next to a floor-4 tier-4 relic (`sages-circlet`) is defensible variety, not the embarrassment tier-1 was.
- [x] `npm run floor:validate` clean on all 5 floors.

**Acceptance:** confirmed — `floor:validate` clean; no tier-1 gear drops survive on floor 5.

---

## Workstream D — Floors 4-5 enemy tier (after A, ideally with C) — ✅ DONE 2026-07-24

### Task D1: New/elite `EnemyDef`s exclusive to floors 4-5
**Files touched:** `src/data/enemies.ts` (10 new `EnemyDef`s), `src/engine/sprite-manifest.ts` (4 new entries reusing existing knight strips).

- [x] Added exactly 10 new floor-exclusive `EnemyDef`s, 5 per floor, thematically matched to each floor's name/flavor:
  - **Floor 4 "The Null Choir"** (`floors: [4]`): `choir-warden` (front tank, hp105/atk22/ac20), `discordant-cantor` (back lightning caster, hp54/atk11/ac9), `null-acolyte` (back silence support, hp48/atk9/ac7), `iron-chorister` (front aggressor, hp82/atk26/ac15), `choir-magus` (back fire caster, hp60/atk13/ac9).
  - **Floor 5 "The Weeping Cistern"** (`floors: [5]`): `drowned-sentinel` (front tank, hp120/atk25/ac21 — new campaign ceiling), `cistern-wraith` (back cold flyer, hp52/atk10/ac8, first use of the previously-unused `ice-shards` ability), `weeping-revenant` (back drain, hp50/atk10/ac6), `flood-brute` (front heavy attacker, hp92/atk28/ac13 — new attack ceiling), `undertow-caller` (back cold caster, hp56/atk11/ac9).
  - Tanks/brawlers exceed the floor-3 ceiling (Stone Guardian hp72/atk19/ac16) on every axis; casters are intentionally squishier, matching the existing floor-3 pattern (warlock/demon-mage are far weaker than Stone Guardian too) — they trade HP for new ability combinations instead.
  - All `abilityIds` verified programmatically against `ENEMY_ABILITIES_BY_ID` (loose `string[]` typing means a typo wouldn't be caught by `tsc`) — zero bad references.
  - 4 of the 10 (the front-row tank/knight archetypes) got sprite-manifest entries reusing existing knight strips (`stone-guardian`, `animated-armor`, `ironclad-knight`, `black-knight`) as intentional "tougher variant, not new art" reskins; the 6 casters fall back to the procedural renderer, matching `AGENTS.md`'s "not every enemy has art" norm.
- [x] Regression tests in `enemies.test.ts`: floor-exclusivity count (≥10 non-floor-3 enemies, ≥5 per floor) and a roster-ceiling check (max hp/attack/ac among the new regulars exceeds Stone Guardian on every axis — checks the roster's peak, not every individual member, since the caster tradeoff is intentional).

### Task D2: Echo escalation across floors 3/4/5
**Files touched:** `src/data/enemies.ts` (`HEADMASTERS_ECHO.floors` narrowed to `[3]`; two new `EnemyDef`s), `src/engine/sprite-manifest.ts` (2 new entries reusing the Echo's own strip — same character, not new art), `ENCOUNTER_TABLES[4]`/`[5]` climax formations, `src/data/enemies.test.ts` (updated the pre-existing "boss on every deep floor" test, which asserted the exact bug this fixes).

- [x] `headmasters-echo-remnant` ("The Choir's Echo," floor 4 only): hp235/atk27/ac15, same core kit + `curse`, same 2-phase `phaseThresholds: [66, 33]`.
- [x] `headmasters-echo-ascendant` ("The Drowned Echo," floor 5 only): hp285/atk31/ac17, core kit + `curse` + `ice-shards` (ties it to the Cistern's theme), and a genuine **4-phase** `phaseThresholds: [70, 45, 20]` (vs. the original's 3 phases) — the true campaign climax, not a repeat.
- [x] Floor 3's `headmasters-echo` is completely unchanged in stats/kit, now `floors: [3]` only.
- [x] Updated both climax formation entries in `ENCOUNTER_TABLES[4]`/`[5]`.
- [x] Test: strictly increasing `hp`/`attack` across the three variants, plus `floors` exclusivity per variant (`[3]`/`[4]`/`[5]`).

### Task D3: Retarget floor 4-5 encounter tables
**Files touched:** `src/data/enemies.ts` `ENCOUNTER_TABLES[4]`/`[5]`.

- [x] 5 of 8 regular formations per floor now include at least one new floor-exclusive elite; 3 of 8 per floor kept as pure floor-3 remixes for seasoning/familiarity, matching the brief. Existing "denser casters" (F4) / "heavy pressure" (F5) code comments preserved and still accurate.
- [x] `npm run floor:validate` clean on all 5 floors; `npm test` 1093/1093 green (including the updated/new `enemies.test.ts` assertions).

### Task D4 (added during review): combat-execution smoke tests
A second advisor pass flagged that D1-D3 were verified only by build/floor:validate/data-shape tests — none of them actually *run* the new content through combat resolution, and `ice-shards` (used by 3 of the new enemies) had never had any enemy assigned to it before this workstream (0 references anywhere in `enemies.ts` pre-sprint), and `headmasters-echo-ascendant` is the game's first 4-phase boss (every prior boss had ≤3). "Never executed" is a correctness risk a green build cannot rule out.

**Files touched:** `src/game/combat-turns.test.ts` (+13 tests, new "new floor 4-5 enemy tier — combat smoke" describe block).

- [x] `it.each` soak test: 8 real rounds of `resolveCombatRound` against every one of the 10 new regular `EnemyDef`s (built from live `ENEMIES_BY_ID`, not synthetic fixtures) — asserts no throw and finite/non-negative HP throughout.
- [x] Dedicated 24-round soak against `cistern-wraith` (one of `ice-shards`'s three carriers) asserting the event log actually contains a `{ type: "cast", spellId: "ice-shards" }` entry — this is a **positive** assertion that the ability fired, not just "didn't crash." It passed on the first run.
- [x] `headmasters-echo-remnant` (F4 boss): 10-round soak, no throw.
- [x] `headmasters-echo-ascendant` (F5 boss): direct HP-checkpoint test (same pattern as the existing "boss phases" describe block, but against the real def) driving `currentHp` through all three real thresholds (`[70, 45, 20]`) in sequence — confirms `bossPhases` reaches 4 and `attack` accumulates all three +4 bumps (+12 total) without throwing. This is the first real exercise of a 4-phase boss in the codebase.
- [x] `npm run build` clean, `npx vitest run src/game/combat-turns.test.ts` 107/107, full `npm test` 1106/1106 green.

**Acceptance (D, whole workstream):** confirmed structurally (data shape, floor exclusivity, escalating Echo stats) **and now confirmed executable** (every new enemy and both new boss variants have run real combat rounds without error, including the previously-dormant `ice-shards` ability and the campaign's first 4-phase boss). **Still not feel-verified against post-A1 party levels in actual play** — that remains Workstream F's job (extend the playtest script, measure real fight counts, confirm floors 4-5 read as harder than floor 3 for a party in the design note's L9-L14 expected range, now re-corrected in the design note §2 addendum for D's own XP shift). Flagging this honestly rather than claiming a balance pass that hasn't been played.

---

## Workstream E — Deep-water pre-entry tell (small, parallel-safe) — ✅ DONE 2026-07-24

### Task E1: Warning before F1's depth-4 water tile
**Files touched:** `src/data/floors.ts` (floor 1 `events` + two new `"event"` tiles).

- [x] Mapped the room geometry precisely: `(10,6)` (the depth-4 tile) has exactly two open cardinal neighbors — `(10,5)` north and `(9,6)` west (the room's south/east edges are solid walls). Placed a one-time message event on **both**, so the warning fires regardless of which direction the player approaches from — a single-tile placement would have missed one of the two real approach routes.
- [x] Reused the existing `EventDef` `kind: "message"` shape verbatim (default `once: true`), no new event kind or plumbing.
- [x] Water damage/swim-chance math completely untouched — verified via diff (only `events`/`setTile` additions, `waters[]` array unchanged).
- [x] `npm run build` clean, `npm run floor:validate` clean, full `npm test` 1061/1061 green.

**Acceptance:** confirmed — a player walking the flooded-gallery side path toward (10,6) gets a readable warning ("the water turns black and bottomless... brace yourself, or turn back") before the depth-4 sink from either approach direction; damage numbers unchanged.

---

## Workstream F — Verification & docs (last)

### Task F1: Extend the playtest script to floors 4-5
**Files:** new script based on `scripts/playtests/playtest-floors-1-3.mjs` (twin it rather than editing in place, per the original brief), or extend it if the driver structure supports floor 4-5 cleanly.

- [ ] Critical-path smoke: stairs, key gates (`choir-key`/`sanctum-key` on F4, `sluice-key`/`undersong-key` on F5 per the JSON grepped in this pass), shop unlock check at `deepestFloorReached` 4 and 5, at least one on-foot (non-`warp()`) segment.
- [ ] **Capture actual fight counts per floor** during the walk (via `?debug=1` state inspection or explicit encounter logging) — this is the number that replaces the design note's 6-15 estimate with real data. Re-run the design note's XP-to-level table with the measured counts and record the delta.

### Task F2: Playtest notes
**Files:** `docs/playtests/2026-07-24-progression-sprint-notes.md` (or dated to actual completion date).

- [ ] Pre/post XP measurements (design note estimate vs. F1's measured reality), shop unlock behavior confirmed, new-enemy list, known risks, and — important — whether the measured fight-count means the ×120 constant needs revisiting (design note §2 explicitly makes this the trigger condition).

### Task F3: Update status docs
**Files:** `docs/AGENT-READING-LIST.md`, `docs/PROGRESSION-GEAR-AUDIT.md`.

- [ ] Add a row/note pointing future agents at this plan + design note as current, and mark the audit's findings table superseded per §1 of the design note (don't delete the audit — it's still useful history — just flag staleness the way the reading list already does for other superseded docs).

---

## Definition of done

- [ ] A-F implemented with tests as specified per task.
- [ ] `npm run build` and `npm test` green at the end of every workstream boundary, not just at the very end.
- [ ] `npm run floor:validate` clean after any floor JSON/data change.
- [ ] `docs/AGENT-READING-LIST.md` and `docs/PROGRESSION-GEAR-AUDIT.md` updated.
- [ ] Playtest notes with measured (not estimated) XP pacing.
- [ ] No `AGENTS.md` hard-rule regressions (combat math, encounter rates, map geometry, outside-combat 1-HP floor, cursed-gear rules all untouched except where explicitly scoped).
- [ ] Final summary for the human: what shipped, measured pacing numbers, files changed, tests added, residual risks (perk tier 5, remaining `TODO(v1.1)` perk stubs, human playtest of floors 4-5).
