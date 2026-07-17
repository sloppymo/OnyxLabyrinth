# AC Damage Floor (P2-8) — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md` item P2-8 — "highDefense + AC double-stack walls out melee." Designer decision 2026-07-16: **soften via AC cap**, not a weaker halve, not leave-as-is.

## 1. Problem

Physical damage subtracts enemy AC **flat**, then `highDefense` **halves** the remainder (`combat.ts` `resolveAttack`, `resolveAmbush`, `dealTechniqueDamage`). Against the five `highDefense` enemies (Animated Armor AC 19, Flame Golem AC 10, Black Knight AC 16, +2 more), a level-6 Fighter's ~28 base becomes `(28 − 19) × 0.5 ≈ 5` per hit against 64 HP. The designed counters (armor-pen techniques) unlock at L10-12 while the first wall appears on F3, so at the relevant level melee's Attack is a placebo verb.

## 2. Change

At all three physical-damage sites, the enemy's AC value (after Disarm debuffs) is floored at 50% of the pre-AC damage; perk/technique penetration then applies **on top of** the floored value:

```ts
const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
// then: backstab factor / Reach Mastery flat ignore / technique armor pen
damage = Math.max(1, damage - acReduction);
```

- Only binds in wall cases (AC > half the incoming swing); normal combats are numerically untouched.
- **Penetration pierces the floor** (decision refined during implementation): applying the cap *after* perk reductions masked Backstab/Reach Mastery to zero against walls — penetration that stops working exactly when it matters is another placebo, which this pass exists to eliminate. So the floor applies to the enemy's AC stat, and backstab's ×0.75, Reach Mastery's −2, and technique `armorPen` reduce the floored value.
- `highDefense` halve and `resistPhysical` multiply after, as today.
- Spell damage untouched (it never read AC).
- No data changes (enemy ACs, highDefense set, technique defs all unchanged).

## 3. Worked examples

| Scenario | Before | After |
|----------|--------|-------|
| 28 base vs Animated Armor (AC 19, highDefense) | (28−19)×0.5 = 5 | (28−14)×0.5 = 7 |
| 40 base vs Black Knight (AC 16, highDefense) | (40−16)×0.5 = 12 | unchanged (16 < 20, cap doesn't bind) |
| 21 base vs AC 19, no highDefense | 2 | 21−10 = 11 |
| 21 base vs AC 5 | 16 | unchanged |
| 11 raw vs AC 8, with Backstab / Reach Mastery | 5 / 5 | 7 / 8 (penetration pierces the floor) |

## 4. Non-goals

- No change to the highDefense multiplier (stays 0.5), enemy AC values, or the armor-pen techniques.
- No new player-facing UI.

## 5. Testing (TDD, `src/game/combat-turns.test.ts`)

Deterministic rigs (explicit `str`/`luk` set, variance-neutral rng):

- Basic attack vs AC 19 wall: 21 base → 11 damage (was 2).
- Basic attack vs normal AC: unchanged (cap doesn't bind).
- highDefense still halves after the cap: 21 base vs AC 19 + highDefense → 6.
- Technique path (Poison Blade, ×1): same wall → 11 damage.
- Ambush path (×2 built-in): low-STR rig shows the cap binding (22 base → 11 damage, was 3).

## 6. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — P2-8 row → Done (cap mechanism).
- `docs/AGENT-READING-LIST.md` — spec table row.
