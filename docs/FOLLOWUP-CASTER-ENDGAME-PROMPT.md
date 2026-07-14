# Prompt: Caster Endgame Verbs (T6–T7 Honesty)

> **Status (2026-07-13):** **Done — Path A.** Mage T6 Meteor Swarm + Disintegrate, T7 Freezing Sphere; Priest T6 Mass Regenerate, T7 Holy Aura. Unlock capped via `maxContentSpellTier()`. DoT / armor-pen / Time Stop remain deferred (existing effect kinds only).

You are a senior game/systems engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).

## Context (post 2026-07-13 combat UX + perk delivery)
- Phase A/B/C of `docs/FOLLOWUP-COMBAT-UX-PERKS-PROMPT.md` shipped.
- Remaining product gap (reading-list #3): spell unlock formula can open **T6–T7**, but live content stopped at **tier 5**.
- Goal: casters keep meaningful new verbs at L9+, OR the unlock curve stops promising content that does not exist.

## Do this (pick ONE path, implement fully)

### Path A — Fill the empty tiers (preferred if design doc already names spells)
1. Add a **small** T6–T7 set for Mage and Priest matching the design-doc verbs, not new fantasy.
2. Wire resolution + `CombatEvent`s so they animate.
3. Keep utility spells out of combat lists (`isUtilitySpell`).

### Path B — Honest unlock curve
1. Cap spell unlocks at the highest tier that has real defs.
2. Update any UI/copy that implies higher tiers exist.

## Constraints
- No encounter-rate retunes, flee/poison balance, arena camera unification, corridor math.
- No perk rebalance pass.
- `npm run build` and `npm test` must pass.

## Verification
1. Arena L9+/L12 Mage/Priest: Magic list shows real T6+ spells (or capped list).
2. Cast at least one new spell; damage/heal popup + banner fire.
3. Summarize: path chosen, spells added vs unlocks capped, files touched.
