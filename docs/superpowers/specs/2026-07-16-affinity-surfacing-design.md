# Affinity Surfacing (P2-9) — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md` item P2-9 — "Spell redundancy; affinity invisible in UI." Designer decision 2026-07-16: **surface affinity, keep the ladders** (audit question #8 answered).

## 1. Problem

Elemental affinity exists and matters (resist ×0.5 / weak ×1.5, applied at spell damage and DoT ticks) but is completely invisible: the damage log prints only a number, and — critically — **combat log lines are never displayed in the FF6 combat UI** (they exist only to parallel the event array). Meanwhile the Mage's elemental ladders (water/earth/wind ×3 tiers, fire/ice lines) present a choice the player has no information to make, so the ladder reads as redundant clones.

## 2. Change: discovered-affinity surfacing

Affinity becomes a **discovery loop** inside each combat: probe with elements, learn what works, exploit it.

**State (`combat.ts`):**
```ts
/** Species-level affinity the party has discovered this combat (enemy name -> elements). */
observedAffinity: Record<string, { weak: string[]; resist: string[] }>;
```
Keyed by enemy **name** (one probe teaches the species, and the enemy window groups by name). Combat-scoped — no persistence, no bestiary (a possible Direction C Analyze synergy later). Initialized in `createCombatState` + the `vfx-vignette.ts` literal.

**Observation (both affinity sites — spell damage, DoT ticks):** when a `weakElement`/`resistElement` special modifies damage and the (name, element, kind) triple is new, record it, log it (for tests/dungeon-side review), and emit a structured event — the FF6 UI needs an event to show anything:

```ts
| { type: "affinityDiscovered"; targetId: string; element: string; kind: "weak" | "resist" }
```

Subsequent procs of the same triple stay silent (the tags carry it).

**Scene (`combat-scene.ts`):** `affinityDiscovered` pops `WEAK!` (bright) or `RESIST` (grey) over the target — same popup channel as MISS/SILENCED/FIZZLE.

**Enemy window (`combat-select-action-view.ts`):** discovered affinities render as tags on the enemy row: `WK fire` / `RES water` (reusing the base `ff6-status-tag` style; text distinguishes polarity — no new CSS since `styles.css` is off-limits this pass).

## 3. Why this resolves the redundancy half

With affinity legible, the elemental ladders stop being redundant: they are the probe→exploit toolkit (cheap T1 elements to scout, ladder nukes to exploit). Audit question #8 ("trim elemental clone ladders?") is answered: **keep them**. Trimming would also have forced a save migration for `knownSpellIds` — avoided entirely.

## 4. Non-goals / noted gaps

- No persistent bestiary, no free pre-fight intel (Direction C's Analyze verb can layer on this state later).
- **Noted gap, not fixed here:** technique elemental damage (Smite/Judgment/Divine Wrath) never applies affinity multipliers at all. Out of P2-9 scope (visibility, not coverage); recorded in the audit.
- No spell/technique/data changes.

## 5. Testing (TDD)

- Spell vs `weakElement` enemy: damage ×1.5, `observedAffinity[name].weak` gains the element, one `affinityDiscovered` event; second cast of the same element adds no new event/entry.
- Spell vs `resistElement` enemy: ×0.5, `resist` bucket, `kind: "resist"` event.
- No affinity special: no observation.
- DoT tick (burn) vs weakElement: tick ×1.5 and observes.
- View: after observation the enemy row shows `WK fire`; resist shows `RES water`.
- Scene: `affinityDiscovered` produces a `WEAK!` popup.

## 6. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — P2-9 → Done; question #8 answered; technique-element affinity gap recorded.
- `docs/AGENT-READING-LIST.md` — spec table row.
