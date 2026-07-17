# In-Combat Row Swap — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md`, Direction C final item. Designer decision 2026-07-16: **moving costs the actor's whole turn** (not free-per-round, not Defend-bundled).

## 1. Problem

Formation (front slots 0-2 / back slots 3-5) is fixed at combat start, but rows are load-bearing: enemies target the front row first, close weapons only reach from the front, protectors guard specific slots, and front-row-only damage perks exist. A party that mis-arranged at the door has no recourse mid-fight.

## 2. The verb

**Action:** `{ kind: "move"; actorId: string; targetAllyId?: string }` — the actor's whole turn.

- **Swap** (`targetAllyId`): trade rows with a living ally in the opposite row.
- **Slide** (no target): take the first empty slot in the opposite row (small parties / death-emptied rows). Fires immediately without further UI.

**Implementation core:** swaps and slides reorder the `s.party` array and then normalize `c.formationSlot = arrayIndex` for all members. The combat scene derives party screen positions from the array on every render, so sprites relocate on the next frame with **zero scene changes**; reach, front-first enemy targeting, protector adjacency, and front-row perks all recompute from the same invariant.

**Feedback:** log-only (null `CombatEvent`) — the reposition is visible on the next rendered frame; no animation. Swaps **persist after combat** (same `Character.formationSlot` the dungeon uses).

**Guardrails:** swap partner must be living and in the opposite row; slide requires a free slot. Failures log a message and change nothing (turn not spent on engine-level validation — the UI pre-filters). Move is never stored for Repeat/Party Auto.

## 3. UI

- Y skill list: class skills (techniques / Hide-Ambush) → Analyze → **Move**.
- Keyboard: `v` (fires the same path as the menu entry).
- Confirming Move: free slot in the other row → fires immediately; otherwise opens the ally target list filtered to living opposite-row members.
- No view/scene/layout changes; no new palette slot.

## 4. Non-goals

- No party-wide formation screen, no swap animation, no enemy row mechanics.
- No Auto/Repeat support for Move.
- No changes to out-of-combat formation editing.

## 5. Testing (TDD)

- Swap: slots and array order exchange; `formationSlot` normalized; reach/targeting flip (fighter to back = close-weapon can't reach; moved member no longer front-targeted).
- Validation: KO'd partner and same-row partner rejected (state unchanged).
- Slide into an empty slot; slide rejected when the row is full.
- Round-path parity (`resolveCombatRound`).
- UI: Move entry in the Y list for a Mage; free-slot immediate fire; full-row opens ally select; swap lands on confirm.
- `v` shortcut fires the move.

## 6. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — Direction C marked complete.
- `docs/AGENT-READING-LIST.md` — spec table row + audit row.
