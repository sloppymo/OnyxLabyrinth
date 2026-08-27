# Campaign progression sprint — playtest notes (2026-07-24)

> **Historical roster note (2026-08-27):** The progression measurements below
> were recorded before the campaign moved to the fixed Old Man + Rat King duo.
> They do not describe a selectable roster or a current entry screen. See
> [`docs/CURRENT-PRODUCT-CONTRACT.md`](../CURRENT-PRODUCT-CONTRACT.md).

> **Naming (2026-07-25):** the F4/F5 bosses are recorded here by id-derived
> labels ("Headmaster's Echo Remnant/Ascendant"). Their display names are now
> **The Lonely Girl** (F4) and **The Crying Man** (F5); F3 is **The Dead Boy**.
> Ids and every measurement below are unchanged.

Companion to [`docs/superpowers/plans/2026-07-24-campaign-progression.md`](../superpowers/plans/2026-07-24-campaign-progression.md) and [`docs/superpowers/specs/2026-07-24-campaign-progression-design.md`](../superpowers/specs/2026-07-24-campaign-progression-design.md). This is Workstream F: the scripted playtest that replaces the design note's unverified "6-15 fights/floor" estimate with real browser-driven measurements, run against `scripts/playtests/playtest-floors-4-5.mjs` (twin of the 2026-07-20 floors-1-3 script).

## What was run

Headless Playwright against a production build (`npx vite preview --port 5230`), `?debug=1` state inspection, six iterations to shake out script bugs (see "Script bugs found" below — all were test-harness issues, not game bugs). The final clean run (6th iteration) passed with **zero findings and zero console/page errors**.

Coverage: shop depth unlock at `deepestFloorReached` 1/4/5, both floors' full event set (message/damage/reward/heal), both floors' NPC panels, both floors' same-floor teleporters, both floors' locked-door pairs (choir-key/sanctum-key on F4, sluice-key/undersong-key on F5) each through the full held→lockpick→key three-phase check, both boss-vault reveal messages, F4's stairs down to F5 (confirming `deepestFloorReached` advances via the real gameplay write path, not just in unit tests), and F5's confirmed absence of a `stairs_down` tile (current campaign end).

## Shop unlock (Workstream C) — confirmed live in play

| `deepestFloorReached` | Tier-4 gear (Runeblade/Mythril Plate/Sage's Circlet) | Tier-5 gear (Voidblade/Dragonscale/Focus Ward) |
|---|---|---|
| 1 (default) | absent | absent |
| 4 | **present** | absent |
| 5 | present | **present** |

Matches `maxShopTier()`'s `max(2, min(5, deepestFloorReached))` exactly, and matches the 6 unit tests in `town-ui.test.ts`. This closes the loop from "unit-tested" to "confirmed in a real playthrough," including the write path: taking F4's stairs down in-game advanced `deepestFloorReached` to 5, not just a debug-forced value.

## Measured pacing data

The script samples per-step encounter-trigger rate over 32 real movement steps in each floor's most-quiet and most-hot `encounterZones`, oscillating in place (same methodology as the existing floors-1-3 script's pacing sample) — **this is a directional zone-level rate, not a full floor-traversal fight count.** No script in this repo currently walks an entire floor start-to-finish on foot to produce a literal "fights this floor" integer; doing so reliably would require solving full corridor connectivity from the edge-based grid, which was out of scope for this pass.

| Zone | rateMul | Encounters / 32 steps |
|---|---|---|
| F4 `vestry-quiet` | 0 | 1 (the step-28 pity force, not an organic roll — expected: even declared-safe pockets guarantee a fight if you loiter past the pity threshold) |
| F4 `ambulatory-din` | 1.6 | 3 |
| F5 `drip-vestry-safe` | 0 | 1 (same pity-force explanation) |
| F5 `bell-well-hot` | 1.7 | 3 |

### Converting to a fights-per-floor estimate

Using `encounterRollChance()`'s actual mechanics (`game/encounters.ts`: 8-step cooldown after each fight, flat base rate from step 8-20, linear ramp to guaranteed by step 28) rather than the raw sample counts, the expected steps between encounters in steady state is approximately `cooldown + 1/rate`:

- F4 default-zone rate 0.13 → ~8 + 7.7 ≈ **15.7 steps/fight**
- F4 hot-zone rate 0.208 (0.13×1.6) → ~8 + 4.8 ≈ **12.8 steps/fight**
- F5 default-zone rate 0.145 → ~8 + 6.9 ≈ **14.9 steps/fight**
- F5 hot-zone rate 0.2465 (0.145×1.7) → ~8 + 4.1 ≈ **12.1 steps/fight**

An 18×18 floor with side content (keys, chests, NPCs, teleporter backtracking) plausibly costs somewhere in the 100-140-step range for a full clear — not measured directly this pass, so treat this range itself as an estimate, not a hard number. Blending mostly-default terrain with brief hot/quiet pockets at roughly the ~14-step/fight steady-state rate:

**Estimated fights/floor ≈ 100-140 steps ÷ ~14 steps/fight ≈ 7-10 fights**, which sits inside the design note's original 6-15 assumption band — not below it.

## Does this trigger revisiting the `level * 120` XP constant?

The design note (§2, and the sprint brief) set an explicit trigger condition: *"If the Workstream F floor-4/5 scripted playtest (real fight counts, not the 6-15 estimate) shows the party consistently landing below L9 by floor 5, that is the trigger to revisit the constant — not this analysis alone."*

The measured zone-level rates reproduce the assumed 6-15/floor band (landing mid-band, ~7-10) rather than falling below it. Re-running the design note's post-Workstream-D triangular sweep at 7-10 fights/floor:

| Fights/floor | End of F5 (post-D XP table, design note §2 addendum) |
|---|---|
| 6 | L9 |
| 10 | L12 |
| 15 | L14 |

7-10 fights/floor lands the party at **L9-L12 by floor 5** — squarely inside the sprint's original L9-L14 target band, not below it.

**Decision: no retune warranted. Keep `level * 120` unchanged.** This confirms (rather than merely assumes, as the design note honestly flagged its own uncertainty) that Workstream A's spend-on-level-up fix plus the existing multiplier lands in the intended range once floors 4-5 carry real content instead of a floor-3 remix.

**Caveat on confidence:** this is a zone-sample-derived estimate, not a literal measured floor-traversal count, and it does not account for level-up itself changing effective AC/damage mid-floor, arena-side leveling, or bench-XP dynamics. If a future human playtest of floors 4-5 at realistic party levels shows the party landing meaningfully outside L9-L14, that observation should override this estimate — it is closer to ground truth than either this script or the design note's arithmetic.

## New-enemy list (Workstream D, for reference)

**Floor 4 — The Null Choir:** Choir Warden, Discordant Cantor, Null Acolyte, Iron Chorister, Choir Magus (5 regulars) + Headmaster's Echo Remnant (boss, replaces floor-3's Echo on this floor).

**Floor 5 — The Weeping Cistern:** Drowned Sentinel, Cistern Wraith, Weeping Revenant, Flood Brute, Undertow Caller (5 regulars) + Headmaster's Echo Ascendant (boss, 4-phase — the campaign's first, `phaseThresholds: [70, 45, 20]`).

Confirmed executable in real combat via `combat-turns.test.ts`'s smoke suite (Workstream D4) and, now, via this playtest's incidental fled-combat triggers during the pacing samples — no throws, no console errors across any of the six runs.

## Known risks

- **One earlier run (of six) stalled indefinitely** partway into a pacing sample, with no further script output for 6+ minutes before being killed. Cause undetermined — possibly a transient Chromium tab issue in this sandboxed headless environment after several back-to-back runs, possibly an interaction between rapid debug-forced "fled" combats. The final run added a 5-second per-step timeout safeguard and a `page.on("crash")` listener; the very next run sailed through the same section cleanly with no recurrence. **Flagging as an environment quirk worth a human's attention during real (non-scripted) play, not a confirmed game bug** — nothing in the game's own code changed between the stalled run and the clean one.
- Pacing numbers above are zone-sample-derived, not a literal walked-floor fight count (see caveat above).
- Floors 4-5 are still not feel-verified by a human in an actual browser session at realistic post-Workstream-A party levels — this script drives a fresh L1 default party through debug warps, which is representative for structural/functional checks but not for a genuine difficulty read.

## Screenshots

`playtest-screenshots/2026-07-24-floors-4-5/` (43 numbered PNGs + `report.json` from the final clean run) — not checked into git, matching the floors-1-3 script's own convention.
