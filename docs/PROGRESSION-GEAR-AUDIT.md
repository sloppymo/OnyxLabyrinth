# Progression / Scaling / Perk / Gear Audit

**Date:** 2026-07-18 · **Scope:** analysis + recommendations only — **no balance numbers or combat math were changed in this pass.** Every recommendation below is *proposed, not implemented*.

Companion deliverable: the FF6-style Equip screen (Part B of `FOLLOWUP-PROGRESSION-GEAR-AUDIT-PROMPT.md`) shipped alongside this audit; finding **A7** motivates it directly.

---

## Summary — the three biggest risks to campaign pacing

1. **The XP curve is not "linear" — it is effectively flat, and it is the single dominant balance defect.** `xpForNextLevel(level) = level * 20` (`src/game/leveling.ts:16-18`) is compared against a character's **lifetime-cumulative XP, which is never spent or reset on level-up** (`src/main.ts:445` loops `while (char.xp >= xpForNextLevel(char.level))`; nothing anywhere decrements `c.xp`). So the *total* XP to reach level L is just `20·(L−1)`: **L12 — the last perk tier — costs 220 lifetime XP.** Meanwhile every living party member receives the **full, unsplit** encounter XP sum (`src/main.ts:434-437`), and a single floor-1 fight already pays 18-44 XP. Consequence: the party hits L2 after one fight (the "~5-8 Floor 1 fights to level 2" comment at `leveling.ts:15` is stale), crosses the entire L3/6/9/12 perk ladder **on floor 1** (~200 XP ≈ 6-7 fights), and a thorough floor-1 clear lands around **L15-18** before the stairs down. Since level feeds both HP growth and flat melee damage (`base = effSTR + level + weaponBonus`, `src/game/combat.ts:1973`) with no level cap, character power inflates without bound against a static bestiary. **Nothing on floors 2-5 can ever be "impossible"; floor-5 trash is trivial before the player ever sees floor 2.**

2. **Gear and gold stop mattering mid-campaign.** The shop never stocks above tier 2 (`getShopBuyList` filters `dropFloorTier <= 2`, `src/engine/town-ui.ts:324-330`); items top out at tier-3 `+2` (`src/data/items.ts:61-90`); floor-4/5 chests hand-author the *same* tier-3 caps (`great-sword+2`, `plate-mail+2`) plus, oddly, tier-1 gear (`rapier+1`, `dagger+1` on floor 5 — `src/content/floors/floor-5.json`). Gold income peaks on floors 3-5 (~100-230g/fight) exactly when there is nothing left to buy.

3. **Floors 4-5 are density-scaled floor-3 content, not a new tier.** Zero new `EnemyDef`s: every enemy appearing on floors 4/5 also lists floor 3 (`src/data/enemies.ts` — e.g. stone-guardian :299, animated-armor :317, black-knight :481), and `ENCOUNTER_TABLES[4]`/`[5]` (`enemies.ts:1047-1233`) only re-mix them at 5-6-spawn density. The climax formation on both floors reuses `headmasters-echo`. Bigger packs raise round *count*, not threat, because flat armor already nullifies their physical damage (see A5's damage-taken math). Together with (1) and (2): **the game's difficulty peaks mid-floor-3 and declines from there.**

---

## Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A1 | XP thresholds are lifetime totals; marginal level cost is a constant 20 XP | **Critical** | Not implemented — recommendation only |
| A2 | Perk cadence collapses with A1; 4 tiers may be thin for 5 floors even after fixing it | High (blocked on A1) | Not implemented |
| A3 | Stat inflation: perk stacking is bounded (~×1.5-1.9); the real inflation lever is uncapped `level` | Medium | Not implemented |
| A4 | Floors 4-5 reuse the floor-3 bestiary at higher density — content gap | High | Not implemented |
| A5 | Gear hard-stops at tier 3; shop stops at tier 2; floors 4-5 balanced around gear that doesn't exist | High | Not implemented |
| A6 | Gold economy: scarcity early, dead stat by floor 3 | Medium-High | Not implemented |
| A7 | Auto-equip makes objectively worse-than-human choices (range/row-blind) | Medium | UI mitigation shipped (Part B); logic fix not implemented |

### A1 — XP curve (Critical)

**Evidence.** `src/game/leveling.ts:16-18` (`level * 20`); `src/main.ts:445-450` (level-up loop compares lifetime `xp`, never subtracts); `src/main.ts:434-437` ("Generous XP: each living member gets the full enemy XP (no 6-way split)"); repo-wide grep confirms no `xp -=`/reset outside character creation. Threshold to reach L: 20·(L−1) → L3=40, L6=100, L9=160, **L12=220**, L15=280.

**Numbers.** Floor-1 encounter XP (summing `ENCOUNTER_TABLES[1]` spawns): 18-44/fight. Floor 2: ~60-130. Floor 3: ~120-230. Floors 4-5: ~150-260. The Echo alone: 320 (`enemies.ts:344`) — one boss kill takes a fresh L1 character past the entire perk ladder. Encounter pacing (8-12% base rate, pity-forced by step 28 per `game/encounters.ts`) guarantees roughly 6-15 fights per floor, so by end of floor 1 the party sits ~L11-18.

**"At what level does a full-party floor-5 clear become trivial vs impossible?"** Trivial: ~L10-12 (see A5's swing math — the hardest floor-5 pack dies in ~2 rounds; the Echo in 1-2). Impossible: never — under current semantics the party cannot arrive at floor 5 *below* ~L12 without deliberately fleeing every encounter, and even a suicidally-rushed lower-level party can grind any single fight into +several levels.

**Proposed direction (pick one lever first, then playtest; do not stack all three blind):**
1. **Spend XP on level-up** (subtract `xpForNextLevel` in the `main.ts` loop) — restores the intended triangular curve (L12 ≈ 1,320 cumulative) with a one-line semantic change and makes the roster's `XP x/y` display mean what players assume. This alone is probably ~80% of the fix. Requires a save-compat thought: existing saves carry inflated lifetime XP.
2. **Re-split XP** (divide by living members, or by 6) — the `leveling.ts:15` comment's "5-8 fights to level 2" matches split-XP math almost exactly; the "generous" no-split change is what broke the comment.
3. Retune the multiplier (e.g. `level * 40`+) only *after* 1/2, if pacing still runs hot.

### A2 — Perk-tier cadence vs. campaign length (High; blocked on A1)

**Evidence.** `PERK_TIER_LEVELS` 3/6/9/12 (`src/game/perks.ts:138-143`); queue-based overlay (`main.ts:447-449`, `perk-select-ui.ts`). Under current XP semantics, multiple tiers frequently arrive **in the same post-combat queue** — the mutually-exclusive "irreversible bet" structure still functions mechanically, but its pacing intent (a spaced decision every ~3 levels) is gone: players make 2-4 permanent choices back-to-back on floor 1 with placeholder numbers (design doc caveat) and no play experience between them.

**Proposed direction.** Fix A1 first — cadence judgments made against broken pacing are noise. After that: 4 choices across 5 floors + phase boss is *thin but workable* if L12 lands near the campaign's end; if the retuned curve has players at L12 mid-floor-4, add a **5th tier at L15** (capstone-grade, one per class pair) rather than compressing spacing — compression would pile more placeholder-number bets early, which is the current problem in miniature. 22 `TODO(v1.1)` perk stubs should be wired before any new tier is designed.

### A3 — Stat inflation ceiling (Medium)

**Evidence.** `effectiveStats()` deliberately uncapped above 18 (`src/game/effective-stats.ts:10-13`); `meleeDamageMultiplier` stacks multiplicatively across perks (`src/game/perks.ts:272`).

**Worst-case stack, checked against tier exclusivity:** perks in the same tier are mutually exclusive, so the maximum multiplicative melee stack any single character can assemble is **Crusader**: Zealot (T2, ×1.2) · Dark Templar (T4, ×1.25) = **×1.5** (`src/data/perks.ts`). Fighter caps at ×1.25 (Berserker). The crit path is stronger: **Duelist** Precision (T1, +12%) + Blademaster (T4, +15%, crits ×3) on LUK 18 → `min(0.95, min(0.25, .18) + .27)` = 45% crit at ×3 (`critChanceFromLukAndBonuses`, combat.ts:1996-2008) ≈ **×1.9 expected melee**. No shipped item defines `statBonuses` (checked all of `src/data/items.ts`) — so equipment currently *cannot* push stats past 18; that half of the uncapped design is latent, not live.

**Sanity check vs. the Echo (hp192/ac13).** L12 Crusader, STR 18, Great Sword+2: base = 18+12+9 = 39; ×1.5 ≈ 58; AC floor: `min(13, 29)` = full 13 applies → ~45/swing ±20% before crits. Six actors → the boss's 192 HP is gone in round 1-2, before the 66%/33% phases (`enemies.ts:352`) can matter. But note: **the same math at ×1.0 perks is ~26/swing — still a 2-round boss kill for a 6-member L12 party.** The AC-50%-floor formula isn't what's being trivialized; unbounded `+level` (A1) is.

**Proposed direction.** Keep stats uncapped (it's a deliberate, documented design and perk exclusivity bounds the multiplier). Revisit only when tier-4/5 gear starts using `statBonuses` (A5); at that point decide a soft cap (diminishing returns past ~22) rather than a hard clamp. Any crit/multiplier retune belongs to the post-A1 playtest.

### A4 — Enemy power curve, floors 4-5 (High)

**Evidence.** See Summary #3. Additional: floor-4/5-exclusive stat lines don't exist — the toughest non-boss enemy on floor 5 (stone-guardian hp72/atk19/ac16) is a floor-3 spawn; hellbat (hp24) appears on all of 3/4/5.

**Verdict: content gap, not intentional pacing.** Density is the only knob being turned, and density doesn't threaten a party whose tank takes 1-8 damage/hit (A5 math). Caster-heavy packs (floor 4's design note says "denser casters") are the one real pressure vector since abilities bypass armor — that's a reasonable *seasoning* but not a tier.

**Proposed direction.** Add a floor-4/5 stat tier: either ~8-12 new `EnemyDef`s or elite variants of the floor-3 roster (~+50% hp, +4-6 atk, +2-4 ac, upgraded ability kits). Do it **together with** A5's gear tier and **after** A1's XP fix — new numbers tuned against today's level inflation would be obsolete the day A1 lands.

### A5 — Gear progression hard-stops at tier 3 (High)

**Evidence.** `weapon()`/`armor()` generate tiers 1-3 only (`src/data/items.ts:61-90`); ceiling: Great Sword+2 ATK+9 / Plate Mail+2 DEF+8, Shield+2 +4, Helm+2 +3 → **max flat DEF 15**. `dropsForFloor()` (`items.ts:245-249`) is **dead code** — nothing calls it; all chest loot is hand-authored per floor, and floors 4-5 re-drop tier-3 caps plus tier-1 filler (`src/content/floors/floor-4.json`, `floor-5.json`). Shop stock caps at tier ≤2 (`town-ui.ts:327-330`), so tier-3 gear is *chest-drop-only* — the store the player visits between floors literally never improves after floor 2.

**Quantified, tier-3-maxed vs. floor-5 tables** (at L12, i.e. post-A1-fix levels): expected damage/swing vs. stone-guardian ac16: base 39 → AC floored at `min(16, ~19)` → ~16-30 after variance, ~2-3 swings to kill hp72. Damage taken: demon-champion atk19 ×0.8-1.2 = 15-23, minus 15 flat (`damageReductionFor`, combat.ts:3409-3435) → **1-8 per melee swing** into a ~260-HP fighter (VIT 16: 40 base + ~20/level × 11). Physical threat is effectively zero for the tank; the back row (Robe+2, DEF 3) takes 12-20. Enemy *abilities* (hellfire, dark-pulse) are the only meaningful damage. So floors 4-5 aren't even "balanced around gear the game doesn't sell" — they're balanced around nothing; existing gear already nullifies them.

**Proposed direction.** Prefer **relic-style tier 4-5** (named uniques with `statBonuses` — finally exercising the dormant field — and effect hooks: elemental strikes, ability-damage reduction, row-ignoring weapons) over extending `+0/+1/+2` to `+3/+4` raw inflation. Distribute: floor-4/5 chest exclusives + a shop tier that unlocks by deepest-floor-reached (this is also the A6 gold sink). Ability-damage mitigation is the interesting new axis, since flat DEF already solved physical.

### A6 — Gold economy (Medium-High)

**Evidence.** Start 100g (`src/game/state.ts:32`). Income/fight (summing table spawns, `src/data/enemies.ts`): floor 1 ≈ 8-45g · floor 2 ≈ 40-110g · floor 3 ≈ 100-190g · floors 4-5 ≈ 120-230g · Echo 800g. Chests award items, never gold (`awardTreasure`, `src/game/features.ts:244-324`). Sinks: shop (full +2 tier-2 kit for 6 members ≈ 6,000-7,000g at `tier*100/80 × (1+plus)` pricing), appraisal 50g, Remove Curse 100g, consumables 20-150g. Swindler's live discount (`town-ui.ts:863-865`) only deepens the late-game surplus.

**Shape of the curve:** floors 1-2 income (~600-1,500g total) covers maybe a quarter of the kit players want — real scarcity, arguably too tight; floors 3-5 income (~4,000-7,000g+) arrives after the last shoppable upgrade, so gold degenerates into a score counter. The 800g boss drop buys nothing the party wants by the time it drops.

**Proposed direction.** The primary fix is a purchasable tier 4-5 (A5) priced to absorb floor-3-5 income (~1,500-3,000g per relic-grade piece). Secondary options: floor-scaled service pricing, an enhancement/reroll service, or buyable trinkets. Model prices against the per-floor income figures above; account for Swindler (-percentage) when setting the top bracket. No numeric changes made in this pass.

### A7 — Auto-equip correctness (Medium — UI mitigation shipped, logic unchanged)

**Evidence.** `isBetterEquip` compares only raw `attackBonus`/`defenseBonus` (`src/game/combat.ts:352-359`); `findBestEquipTarget` picks the party member with the *weakest current bonus* in the slot (`combat.ts:410-433`). Neither considers weapon `range` vs. the character's row, class fit, or `statBonuses`.

**Concrete worse-than-human case (real today, not hypothetical):** the back-row Mage holds a Staff (ATK+2, **medium** range). Buy a Mace (ATK+4, **close**): `findBestEquipTarget` selects the Mage (weakest weapon), `isBetterEquip` approves (4 > 2), and the Mage now holds a close-range weapon in the back row — which `canReach` (`combat.ts:95-121`) rejects for **both enemy rows**, i.e. the Mage's Attack command can no longer hit *anything*. The shop's compare panel even presents this as an upgrade. Similarly, Bows (long) are never preferentially routed to back-row members. The `statBonuses` blindness is currently latent (no shipped item uses the field) but becomes live the moment A5's relic gear lands.

**Cursed edge:** `findBestEquipTarget` can select a curse-locked holder; `equipItem` then silently no-ops and the purchase falls to inventory — benign but unexplained to the player.

**Direction.** (a) Shipped this pass (Part B): a manual Equip screen so the player can see loadouts and fix bad assignments — with per-slot stat deltas and an explicit warning when a candidate weapon can't attack from the character's row. (b) Recommended, not implemented: make `findBestEquipTarget`/`isBetterEquip` range-aware (a weapon that `canReach` nothing from the holder's row is never "better") — a small, self-contained fix in `combat.ts` that should get its own approved pass since it changes purchase-time behavior.

---

## Recommended sequencing

1. **A1** XP semantics (spend-on-level + optionally re-split) — everything else is tuned against its outcome.
2. **A7b** range-aware auto-equip (small, self-contained, high player-visible value).
3. **A5 + A6 together** — tier-4/5 relic gear as the gold sink, shop tier unlocked by depth.
4. **A4** floor-4/5 enemy tier, tuned against the post-A1 curve and the new gear.
5. **A2** perk tier 5 / cadence, last — it depends on where the fixed curve actually lands players.
