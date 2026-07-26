# Campaign Progression Sprint — Design Note

**Date:** 2026-07-24 · **Baseline commit:** `a633583` · **Supersedes:** `docs/PROGRESSION-GEAR-AUDIT.md` (2026-07-18) where the two disagree — the audit's findings table is 40% overtaken by shipped work; treat this note as current.

**Pre-flight (re-verified 2026-07-24):** `npm run build` ✅ zero TS errors · `npm test` ✅ 1038/1038 · `npm run floor:validate` ✅ clean on floors 1-5.

This is a decisions document, not a task list — see the companion plan `docs/superpowers/plans/2026-07-24-campaign-progression.md` for the checkbox breakdown.

> **Naming note (2026-07-25):** this doc calls the three floor bosses "the Echo",
> "The Choir's Echo", and "The Drowned Echo". Those names are dead. The
> `EnemyDef` ids are unchanged (`headmasters-echo`, `-remnant`, `-ascendant`) and
> **all the stat/phase reasoning below still holds** — only the display names
> changed, to **The Dead Boy** (F3), **The Lonely Girl** (F4), and **The Crying
> Man** (F5). They also no longer share a sprite. See
> [`2026-07-25-labyrinth-narrative-design.md`](2026-07-25-labyrinth-narrative-design.md) §4.1.

---

## 1. What's changed since the 2026-07-18 audit (re-verified against live code)

| Audit claim | Current reality | Effect on scope |
|---|---|---|
| A1: `xpForNextLevel = level * 20`, never spent | `src/game/leveling.ts:26` is now `level * 120` (`main.ts:453` comment: "restores originally-intended pacing"). **Still never spent** — confirmed by re-reading `main.ts:453-458`; only one call site in the whole codebase drives XP-based leveling (grep confirms `awardCombatXp`/`xpForNextLevel` used nowhere else for combat leveling; the Arena "level party to target level" path at `main.ts:1358` bypasses XP entirely, so there's no second site to keep in sync). | **A1 is still critical — see §2, the ×120 patch did not fix the structural bug, it only slowed it.** |
| Full unsplit XP to all 6 | `src/game/active-roster.ts`: active (top 4 by formation) get 100%, living bench get 25%, KO'd get 0%. Party size is 4-of-6 per fight. | Already shipped; no further work needed here. Bench-split is *a* lever but not *the* lever — see §2. |
| No tier 4-5 gear | `src/data/items.ts:105-143`: `RUNEBLADES`/`VOIDBLADES` (weapons), `MYTHRIL_PLATES`/`DRAGONSCALE_MAILS` (armor), plus **`SAGES_CIRCLET`/`FOCUS_WARD`** — named relics that are the first items in the game to use `statBonuses` (int/pie and luk/agi respectively). | A5's "gear doesn't exist" is **resolved**. |
| Floors 4-5 chests re-drop tier-3 caps + tier-1 filler | `src/content/floors/floor-4.json` (16,7)/(15,16) already drop `sages-circlet`, `runeblade+2`+`mythril-plate+2`; `floor-5.json` (7,13)/(14,17) already drop `focus-ward`, `voidblade+2`+`dragonscale-mail+2`. **But** floor-5 (13,4)/(4,6) still drop `rapier+1`/`dagger+1` — tier-1 filler survives verbatim as the audit described. | Loot-table work for A5 is **90% done**. Remaining: strip the two tier-1 drops on floor 5. |
| Shop caps at `dropFloorTier <= 2` | `src/engine/town-ui.ts:365` — unchanged, confirmed live. | **A5/C's actual remaining gap**: the shop, not the item data or loot tables. |
| Auto-equip range/row-blind | `src/game/combat-equipment.ts` `isBetterEquip`/`findBestEquipTarget` — read verbatim, unchanged from the audit's description. Still compares only `attackBonus`/`defenseBonus`, no `range`/row/`statBonuses` awareness. | **A7b still fully open, unchanged scope.** |
| Floors 4-5 are density-scaled floor-3 remixes, zero new `EnemyDef`s | Confirmed by grep: every enemy listed on floor 4 or 5 also lists floor 3 (`floors: [3,4,5]` or `[3,5]`) — there is not one `EnemyDef` with `floors` excluding 3. **Worse than described:** `HEADMASTERS_ECHO` (`enemies.ts:337-355`) is the *same object* — hp192/atk24/ac13/xp320/gold800, `phaseThresholds: [66,33]` — used verbatim as the climax formation on floors 3, 4, **and** 5. There is no floor-scaling multiplier anywhere in `data/enemies.ts` or `game/encounters.ts`; only pack density and composition change between floor tables. | **A4 fully open**, and the framing should be corrected from "reused boss" to "byte-identical boss, zero mechanical escalation across 3 floors" — narrative flavor text differs per floor's climax comment, stats do not. |

**Net re-scope:** Workstream C shrinks substantially (gear tier + most loot placement already shipped); Workstream A is *more* urgent than the audit implied, not less — see §2. B and D are unchanged in size. D is now the single largest remaining content workstream.

---

## 2. Workstream A — the XP curve, worked from real data (do not skip re-deriving this)

**The critical correction:** the ×120 patch changed the *constant*, not the *shape*. The level-up loop (`main.ts:453`) is:

```ts
while (char.xp >= xpForNextLevel(char.level)) {
  char = levelUpChar(char, state.equipment[char.id]);   // xp is NEVER decremented
}
```

Since `char.xp` is lifetime-cumulative and compared against a **flat per-level threshold** (`level * 120`), the level reached for a given lifetime XP total `X` is simply `floor(X / 120) + 1` once past the early levels — i.e. still a **linear curve**, just six times slower than the pre-patch version. It is not the triangular "spend on level-up" curve the audit's A1 recommendation describes; that recommendation was never implemented, only the multiplier retune (option 3 in the audit, done in isolation, out of order) was.

**Verified with the actual `xpForNextLevel` function** (`/tmp/.../xp_curve_check.mjs`, run against live code):

| Lifetime XP | Level reached (current shipped, flat) |
|---|---|
| 240 | 3 |
| 600 | 6 |
| 960 | 9 |
| 1320 | 12 |
| 2572 | **22** |

And **real per-floor XP**, computed by weighting `ENCOUNTER_TABLES[floor]` formation XP by formation `weight` (script reads `src/data/enemies.ts` directly, so this includes the Echo formations at their true low weight, not hand-picked):

| Floor | Avg XP/fight (weighted) | Range |
|---|---|---|
| 1 | 34.5 | 18-44 |
| 2 | 76.9 | 43-120 |
| 3 | 171.5 | 73-534 |
| 4 | 217.5 | 131-535 |
| 5 | 227.8 | 121-560 |

Using the audit's own (unverified — no hard step-count data exists in this repo) estimate of **6-15 fights per floor**, cumulative lifetime XP and the level it produces **today**:

| Fights/floor | End of F2 | End of F3 | End of F5 |
|---|---|---|---|
| 6 | 668 XP → **L6** | 1697 XP → **L15** | 4369 XP → **L37** |
| 10 | 1114 XP → **L10** | 2829 XP → **L24** | 7282 XP → **L61** |
| 15 | 1671 XP → **L14** | 4244 XP → **L36** | 10923 XP → **L92** |

**This confirms A1 is still the dominant defect, unfixed.** The exact numbers moved (it now takes until roughly floor 2 instead of floor 1 to blow the perk ladder), but the shape — unbounded level growth against a static bestiary, uncapped forever — is identical to what the audit described, and the level-37-to-92 range at floor 5 is not a rounding error, it is the compounding nature of an unspent, unbounded, linear-in-total-XP counter across 30-75 accumulated fights.

**Fix: implement the audit's original A1 recommendation for real** — subtract `xpForNextLevel(oldLevel)` from `char.xp` on every level-up (the "spend on level-up" lever was proposed, never applied). This switches the effective curve from linear to triangular (`Σ level*120`):

| Level | Cumulative XP needed (triangular) |
|---|---|
| 3 | 360 |
| 6 | 1,800 |
| 9 | 4,320 |
| 12 | 7,920 |
| 15 | 12,600 |

Re-running the same fights/floor sweep **with spend-on-level applied**:

| Fights/floor | End of F1 | End of F2 | End of F3 | End of F4 | End of F5 |
|---|---|---|---|---|---|
| 6 | L2 | L3 | L5 | L7 | **L9** |
| 10 | L2 | L4 | L7 | L9 | **L11** |
| 15 | L3 | L5 | L8 | L11 | **L14** |

This lands squarely in the sprint brief's acceptance ballpark (L3 early/mid, L6 ~F2-3, L9 ~F3-4, L12 late F4/F5) across the plausible fight-count range, without retuning the ×120 constant. **Decision: keep `level * 120`, add spend-on-level-up. Do not retune the multiplier as part of this sprint** — the arithmetic is close enough to the target band that retuning now would be guessing twice. If the Workstream F floor-4/5 scripted playtest (real fight counts, not the 6-15 estimate) shows the party consistently landing below L9 by floor 5, that is the trigger to revisit the constant — not this analysis alone.

**⚠️ Superseded by Workstream D (2026-07-24, same day):** the table above was computed against the floor 4-5 `ENCOUNTER_TABLES` as they stood *before* D added the new floor-4/5 elite tier and escalated the Echo variants (§1/§4 below). D's new enemies carry meaningfully higher `xp` than what they partly replaced (elites 60-88 xp vs. the demon-mage/rune-knight ~42-48 they're mixed among; the boss climax went 320 → 380 (remnant, F4) / 460 (ascendant, F5)). Re-measured post-D weighted-average XP/fight: **floor 4 now 245.0** (was 217.5, +12.6%), **floor 5 now 265.0** (was 227.8, +16.3%) — floors 1-3 unchanged. Re-running the same triangular sweep with the corrected floor-4/5 averages:

| Fights/floor | End of F3 | End of F4 | End of F5 |
|---|---|---|---|
| 6 | L5 | L7 | **L9** (was L9 — unchanged) |
| 10 | L7 | L9 | **L12** (was L11 — now lands exactly on the L12 target) |
| 15 | L8 | L11 | **L14** (was L14 — unchanged) |

The shift is small and, if anything, nudges the mid-scenario slightly closer to the intended "L12 near late floor 4/5" target rather than away from it — still no multiplier retune warranted. Flagging this only so nobody (including a future tuning pass) treats the original pre-D table above as the current source of truth; **this box is the current one.** Both tables remain superseded-pending-F1's actual measured fight counts either way.

**Bench XP:** leave the active-100%/bench-25% split as-is. It's already shipped, already a real lever, and stacking a second untested change (re-splitting active XP) on top of spend-on-level in the same pass would make the post-change measurement impossible to attribute. Per the audit's own sequencing note: one lever, then measure.

**Implementation note:** only one call site needs the change (`main.ts:453-458`); there is no second combat-XP-driven level-up path to keep in sync (the Arena target-level setup at `main.ts:1358` sets levels directly, ignores `char.xp` entirely, and is unaffected by this change).

---

## 3. Flagged decisions (recommend-and-proceed — flag if you'd choose differently)

### 3a. Save migration
Bump `SAVE_VERSION` (`src/game/save.ts:32`, currently 10) to **11**, one migration step covering both of the following, since both are one-time character/state-shape changes:

1. **XP residual conversion.** For each character on load: recompute `cumulativeXpToReachLevel(c.level)` under the *new* triangular formula (`Σ_{lv=1}^{level-1} xpForNextLevel(lv)`) and set `c.xp = max(0, c.xp - cumulativeXpToReachLevel(c.level))`. **Do not** leave lifetime XP untouched — under the new spend-on-level loop, an untouched large lifetime total would immediately cascade through every level-up threshold on the character's very next combat, firing a stack of perk-tier overlays retroactively in one sitting, which is exactly the "back-to-back placeholder bets" problem A2 flags. Recomputing the residual keeps the character at their current (already-played) level and just resets what "progress to next level" means, with no in-place level jump.
2. **`deepestFloorReached` backfill** (new field, see §3c): for existing saves, backfill to `state.floor.id` at load time. This is a known approximation (a save made after backtracking to floor 1 will under-report), documented as such in the migration comment — acceptable since it only affects shop unlock for saves that predate this sprint, and self-corrects the next time that party actually reaches its deepest floor again.

### 3b. Echo staying on floors 3/4/5
Recommendation: **keep Echo as a recurring nemesis across 3/4/5, framed as escalating** (the existing per-floor climax comments already gesture at this — "still singing through drowned voices" on F5) but make the escalation **mechanically real**, not just narrative. Concretely (Workstream D): give the floor-4 and floor-5 Echo encounters distinct stat/ability overrides (e.g. a `floorOverrides` map on the encounter entry, or two new `EnemyDef`s — `headmasters-echo-remnant` / `headmasters-echo-ascendant` — reusing the same sprite and identity but with the tier appropriate to their floor). This is cheaper than inventing three unrelated bosses, preserves the "same nemesis, worse each time" story already implied by the flavor text, and directly fixes the byte-identical-stats finding in §1. Floor 5's version should be the true campaign climax (hardest stats, most abilities); floor 3's stays as originally tuned.

### 3c. Shop unlock field design
No `deepestFloorReached` (or equivalent) field exists on `GameState` today — `state.floor.id` is the *current* floor and is unsafe to gate shop stock on, since nothing prevents a party from returning to town after floor 1 while having reached floor 4. **Add `deepestFloorReached: number` to `GameState`** (`src/game/state.ts`, defaulted to `1`), updated wherever floor transitions happen (`transitionToFloor` or equivalent in `main.ts`/`features.ts` — take the max, never lower it), persisted in save (§3a). Shop's `getShopBuyList` gates `dropFloorTier` against `deepestFloorReached` instead of a hardcoded `<= 2`. Suggested unlock curve (tune against real gold-income figures in Workstream C, don't hardcode without checking): tier 3 unlocks at floor 3, tier 4 at floor 4, tier 5 at floor 5.

---

## 4. Re-scoped workstream summaries

- **A (XP):** as §2 — spend-on-level-up only, keep ×120, single call site, save migration.
- **B (auto-equip):** unchanged from the original brief — `isBetterEquip`/`findBestEquipTarget` need a range/row reachability veto. Confirmed still fully open.
- **C (shop + gold sink):** **shrunk.** Gear data and floor-4/5 relic loot placement are already shipped (§1). Remaining work: `deepestFloorReached` field (§3c) + shop filter change, strip floor-5's two tier-1 filler drops (`rapier+1` at (13,4), `dagger+1` at (4,6) in `floor-5.json`), and a pricing sanity check against real per-floor gold income (recompute from `enemies.ts` gold fields the same way §2 recomputed XP — don't reuse the audit's gold estimates blindly, though they weren't contradicted by anything found in this pass).
- **D (floor 4-5 enemy tier):** **unchanged size, now the largest remaining workstream.** New/elite `EnemyDef`s per §1, plus the Echo-escalation fix per §3b. Must be sequenced after A lands (tune against the triangular curve's expected levels, not today's L37-L92 inflation) and ideally alongside C (new gear should matter against the new enemies).
- **E (deep-water tell):** unchanged from the original brief; not re-touched in this pass. F1-3 playtest (2026-07-20) confirms the mechanic and design intent are sound, only the pre-entry warning is missing.
- **F (verification/docs):** unchanged, plus: this design note's arithmetic should be re-run against **actual** measured fight counts from a scripted floor-4/5 playtest (extending `scripts/playtests/playtest-floors-1-3.mjs`) rather than the 6-15 estimate, since that estimate is the single biggest source of uncertainty in this whole document.

---

## 5. Workstream C follow-up — gold sink sizing check (2026-07-24, post-ship)

§4's Workstream C note flagged one open item: "a pricing sanity check against real per-floor gold income... don't reuse the audit's gold estimates blindly." The plan's checkbox pass did a coarse version (per-item prices vs. a rough income range, "reasonable, not grossly mismatched"). This is the fuller version — full party kit cost, not just per-item price, and it also closes `PROGRESSION-GEAR-AUDIT.md`'s **A6 (gold economy)**, whose status was never updated after the shop-tier-unlock work shipped.

**Expected gold income**, computed by weighting `ENCOUNTER_TABLES`/`ENEMIES_BY_ID` gold fields by real spawn weight (not eyeballed ranges), split into steady trash income and the rare boss-pack encounter (weight 1 in each table, ~3-6% chance per fight, worth 979-1,252g when it lands):

| Floor | Trash EV/fight | Boss pack gold | P(≥1 boss over 8.5 fights) | Expected floor income |
|---|---|---|---|---|
| 1 | 20g | 8g | 40% | ~172g |
| 2 | 64g | 46g | 33% | ~559g |
| 3 | 138g | 979g | 25% | ~1,417g |
| 4 | 188g | 1,079g | 31% | ~1,937g |
| 5 | 202g | 1,252g | 31% | ~2,115g |

Cumulative (start 100g, 8.5 fights/floor — the mid of Workstream F's measured 7-10/floor range): **~272g by end of F1, ~832g by F2, ~2,249g by F3, ~4,186g by F4, ~6,300g by F5.**

**Full 6-member kit cost**, weapon + body + shield + helm, from real `ItemDef.price` fields:

| | Per character | ×6 |
|---|---|---|
| Tier-3 ceiling (pre-sprint max), all +2 | 2,340g | 14,040g |
| Tier-5 ceiling (new), all +2 | 3,320g | 19,920g |
| Realistic staircase (buy base tier, trade in previous for 50%, tier 1→5, weapon+body only) | 1,800g | 10,800g |

Even the cheapest realistic path to fully re-gear the party (~10,800g, ignoring shield/helm/accessories) exceeds total campaign income through floor 5 (~6,300g) by ~1.7×; the maxed ceiling exceeds it by ~3×. Before this sprint the problem ran the other way — gold income (4-7k by floor 3-5, per the original audit) outran the tier-2 shop ceiling (~6,480g full kit) with nothing left to buy. Now there is always a further upgrade in reach and full BiS is realistically a multi-playthrough goal, not a floor-5 guarantee — the intended shape for a shop-tier-unlock sink.

Two mitigating details worth keeping in mind, not follow-up work: the floor-4 and floor-5 boss chests each hand out one free maxed weapon+armor+accessory set (`runeblade+2`/`mythril-plate+2`/`sages-circlet` on F4; `voidblade+2`/`dragonscale-mail+2`/`focus-ward` on F5), so players aren't buying their *first* BiS piece, only backfilling the other five characters or a second copy. And `SAGES_CIRCLET`/`FOCUS_WARD` are flat-priced one-offs (300g/320g) rather than a scaling `+0/+1/+2` line like every other slot — a minor, likely-intentional asymmetry.

**Decision: no price changes. Mark A6 fixed** — resolved as a byproduct of the shop-tier-unlock work (A5/Workstream C), not a change made in this pass.
