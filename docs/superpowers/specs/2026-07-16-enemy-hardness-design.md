# Enemy hardness pass (~60% + denser packs)

**Status:** Approved 2026-07-16  
**Goal:** Combat feels threatening; enemies get turns because packs can match party size.

## Fixes (identity)

| Enemy | Change |
|-------|--------|
| Gaze Wraith | Add `undead` |
| Hellhound, Hellbat | Add `demon`, fire resist, water weak |
| Skeleton Archer | Remove `flying` |
| Failed Experiment | Add `poisonOnHit` |

## Stat scale

All combat enemies (not Training Dummy):

- HP, attack, AC, XP, gold × **1.6** (round)
- AGI × **1.25** (round)
- Boss uses the same multipliers
- Hellbat: after scale, extra bump so deep-floor trash is not F1-sized (~HP 24 / ATK 9)

## Pack density

| Floor | Typical size | Cap |
|-------|--------------|-----|
| 1 | 3–4 | 4 |
| 2 | 4–5 | 5 |
| 3+ | 4–6 | 6 |

Two-enemy packs become rare (low weight). Acid Puddle is no longer a solo spawn. Prefer front+back mixes.

## Out of scope

Encounter rates/pity, `enemy-abilities.ts` power numbers, party size/starting HP.
