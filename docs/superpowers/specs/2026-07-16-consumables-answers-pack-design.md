# Combat Consumables "Answers Pack" — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md`, Direction B "combat consumables." Designer question #7 (expand vs spartan 2-item catalog) answered 2026-07-16: **expand — the answers pack.**

## 1. Rationale

Direction A/B made disables and telegraphs the enemy's central levers, but the party's Item verb was thin: `healing-potion` (heal 30) and `antidote` (cure poison) only. Blind had a spell cure but no item; **paralysis/sleep had no cure of any kind**; non-Priest parties had no revive before T4 Raise Dead. The pack closes those gaps at shop prices, giving every class a real Item turn.

## 2. The pack (shop-stocked via `ALL_ITEMS`, no drop-table changes)

| Item | Effect | Price | Gap it closes |
|------|--------|-------|---------------|
| Eye Drops | cure blind | 30g | Blinding Gaze / Echo of Silence item answer |
| Smelling Salts | cure paralysis | 40g | the **only** paralysis cure in the game |
| Greater Healing Potion | heal 75 | 60g | F3+ attrition (potion heals 30) |
| Phoenix Feather | revive at 25% max HP | 150g | revive before Raise Dead; activates the previously dead `revive` effect kind |

`ItemEffect.cure.status` widened to `"poison" | "blind" | "paralysis" | "sleep"` (the resolver was already generic and clears the matching timer/state after the P1-7 work). The item `revive` resolver changed from flat HP to **percent of max HP** (`Math.max(1, round(maxHp × power / 100))`) — no prior item used `revive`, so no behavior regresses.

## 3. Non-goals

- No sleep cure item (sleep breaks on damage and expires fast; Wake is handled by timers).
- No cure-all, no buff items, no drop-table/loot changes, no dungeon-mode item use changes.
- No UI changes (the combat Item menu and shop are data-driven).

## 4. Testing (TDD, `src/game/combat-turns.test.ts`)

- Eye Drops / Smelling Salts cure their status **and clear its timer**; item consumed.
- Greater Healing Potion heals exactly 75 (uncapped rig).
- Phoenix Feather revives a KO'd ally at 25% max HP with a `revived` event.
- Shop stocks all four.

## 5. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — question #7 answered; Direction B consumables ticked.
- `docs/AGENT-READING-LIST.md` — spec table row.
