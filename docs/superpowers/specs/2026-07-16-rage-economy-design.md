# Rage Economy Retune — Design Spec v1.0

**Date:** 2026-07-16
**Context:** Direction B, step 1 of the combat engagement work (`docs/COMBAT-ENGAGEMENT-AUDIT.md`, item P1-5). Follows the Direction A truth pass (`0dd91ee`).
**Decision recorded:** audit open question #5 (rage between fights) → **no carry-over**.

## 1. Problem

Melee techniques almost never appear in real play:

- Rage starts at 0 every combat. With +2 per attack, a typical 2–3 round trash fight yields at most one cheap technique; mid tiers (10–15 rage) need 5+ rounds of pure attacking.
- Defend wipes **all** rage — double punishment (the lost turn plus the lost resource) and anti-synergistic with the Halberdier's Brace identity.
- **Defect:** all five L12 capstones cost 25 rage, but `maxRageForLevel(12) = 10 + 12 = 22`. Battle Cry / Shadow Strike / Phalanx Break / Blade Storm / Divine Wrath are mathematically unusable at the level they are learned (first usable at L15).

## 2. Goals

- Techniques show up in every fight: cheap tier usable on turn 1, mid tiers within a normal fight, capstones reachable in boss-length fights.
- Keep the pacing layer: the best ability still can't be spammed every turn.
- Defend stays a real choice but stops griefing the technique resource.
- Fix the capstone defect.

## 3. Non-goals

- **No rage carry-over between fights.** Rage still resets each combat (start value, not 0 — see below). This keeps the technique spec's original non-goal intact and avoids cross-fight balance risk (alpha-striking every trash pull). Start-of-combat rage achieves the same "techniques show up" outcome without persistence. Audit question #5 is answered by this section.
- No technique cost re-laddering.
- No UI changes (the FF6 party window already shows SP/Rage).
- No save-format changes (rage remains combat-only state).
- No enemy rage/techniques.

## 4. Shipped numbers

| Rule | From | To |
|------|------|----|
| Max rage | `10 + level` | `15 + level` (L1 = 16, L5 = 20, L10 = 25, L12 = 27) |
| Combat-start rage | 0 | `floor(maxRage / 2)` for technique classes (Fighter/Thief/Halberdier/Duelist/Crusader); Mage/Priest stay 0 |
| Defend | wipes all rage | no rage change (Flee likewise — same code path) |
| Ambush | +0 rage | +2 rage (it is an attack; consistency with basic Attack) |

Unchanged gains: attack +2 (hit or miss), taking damage +1, dodging an attack +1, adjacent ally damaged +1 (Fighter/Halberdier), technique use +1. Cap still enforced; overflow discarded.

### Cadence check (attack = +2/turn)

- **L1** (start 8, max 16): Power Attack (5) turn 1; alternates attack/Power Attack from there.
- **L5** (start 10, max 20): Judgment/Flurry/Poison Blade tier turn 1.
- **L10** (start 12, max 25): mid tier turn 1; 20-cost tier by ~round 4–5.
- **L12** (start 13, max 27): capstone (25) by ~round 6–7 of attacking, faster when taking hits.
- Trash fight (2–3 rounds): 1–2 cheap techniques. Boss fight (6–8 rounds): mid-tier rotation plus one capstone if built toward.

Turn-1 technique is the melee answer to turn-1 spells; post-hardness enemies (×1.6 stats, `cffa5f3`) absorb it.

## 5. Touch points

- `src/data/techniques.ts` — `maxRageForLevel` base 10 → 15.
- `src/game/combat.ts` —
  - Combat-start rage init (currently `combat.ts:572`): `startingRageFor(char)` helper = `floor(maxRageForLevel(level) / 2)` for technique classes, 0 otherwise.
  - `resolvePlayerAction`: remove `resetRage` on `defend` and `flee`; add `gainRage(+2)` on `ambush`.
  - `resetRage` becomes dead — delete it.
- No changes to `combat-ui.ts` / `combat-scene.ts` / `combat-select-action-view.ts`.

## 6. Testing (TDD)

In `src/game/techniques.test.ts` / `src/game/combat-turns.test.ts`:

- Combat start: technique classes start at `floor(max/2)`; Mage/Priest start 0.
- `maxRageForLevel` returns 16/20/25/27 at L1/5/10/12; an L12 character can afford their capstone.
- Defend preserves rage; a flee attempt preserves rage.
- Ambush grants +2 rage.
- Rage cap still enforced at the new max.
- Existing tests asserting start-at-0 / defend-wipes are updated to the new contract.

## 7. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — add a status column to the gaps table (Direction A shipped / this work / deferred); mark P1-5 Done; record question #5 as answered.
- `docs/AGENT-READING-LIST.md` — audit row: Direction A no longer "underway"; note the rage economy retune.
- `docs/superpowers/specs/2026-07-11-melee-techniques-design.md` — fix the two drifted lines (§4.1 "starts at 0", §4.3 Defend wipe) to point at this spec.
