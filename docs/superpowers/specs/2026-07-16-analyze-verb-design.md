# Analyze Verb — Design Spec v1.0

**Date:** 2026-07-16
**Context:** `docs/COMBAT-ENGAGEMENT-AUDIT.md`, Direction C step 1. Builds on P2-9's `observedAffinity` (affinity tags) and Direction B's telegraph tags. Designer decisions 2026-07-16: revelation scope = **affinity + traits** (no exact HP); placement = **Y skill list for every class**.

## 1. Problem

The party has no way to learn enemy traits except trial and error. Flying/evasive/highDefense/resistPhysical/poisonOnHit drive the core "should I even melee this?" decision but are invisible; elemental affinity is only learnable by spending hits on probes. Direction C calls for an Analyze verb — spend a turn, get intel.

## 2. The verb

**Action:** `{ kind: "analyze"; actorId: string; targetInstanceId: string }` — costs the actor's whole turn, no SP, no rage, works in both combat APIs (`resolvePlayerAction` shared).

**Effect (`resolveAnalyze`):** marks the target's species in `CombatState.analyzedEnemies` (`Record<string, true>`, name-keyed — one Analyze covers the species, matching the grouped enemy window), and records all of its `weakElement`/`resistElement` specials into `observedAffinity` (P2-9 state, no per-element popup spam). Emits one structured event:

```ts
| { type: "analyze"; actorId: string; targetId: string }
```

**Answers stay answers:** Analyze is never picked by Party Auto and is skipped by Repeat (same guard as Item/Flee).

## 3. Input (palette-first)

The controller palette is the real input path (the classic `menuEntriesForCharacter` menu is demo-only, kept consistent — see §6).

- **Y (skill) becomes a list for every class.** `buildPalette` no longer disables the skill slot (Analyze always exists). Melee: techniques then Analyze. Thief: Hide/Ambush then Analyze. Mage/Priest: just Analyze.
- **Keyboard:** `n` shortcut alongside the legacy `t/m/i/r` letters.
- Confirming Analyze opens the standard enemy target cursor; a single living enemy skips targeting.

## 4. Surfacing

- **Trait tags** on the enemy row once the species is analyzed, derived from `special`:
  `FLY` flying, `EVA` evasive, `DEF` highDefense, `PHYS%` resistPhysical (percent shown), `PSN+` poisonOnHit, `UND` undead, `DMN` demon, `CST` caster, `HLH` healer, `SIL` silenceRandom.
  Tag order: statuses → affinity (WK/RES) → traits → ⚡charge.
- **Scene:** `analyze` event shows an "Analyze" banner (same path as telegraph).
- **HP stays a fuzzy descriptor** (deliberate — exact HP would trivialize execute thresholds and kill flavor).

## 5. Testing (TDD)

- Resolver: marks `analyzedEnemies`, records weak+resist into `observedAffinity`, emits `analyze` event, idempotent, no-target guard, round-path parity.
- Palette: skill slot enabled for Mage/Priest.
- combat-ui: Y list contents per class (fighter = techniques + Analyze; mage = Analyze only); Analyze → target select → turn fires and marks state.
- View: trait tags only for analyzed species; `menuEntriesForCharacter` includes Analyze (hint tests updated).
- Scene: `analyze` event → banner.

## 6. Non-goals

- Exact HP display, boss phases, in-combat row swap, reach perk stubs (later Direction C items).
- No Analyze perks/hooks, no SP cost, no use limit.
- The demo menu (`menuEntriesForCharacter`) gains the Analyze entry + `n` shortcut for consistency; the vfx demo itself is unchanged otherwise.

## 7. Doc updates (same delivery)

- `docs/COMBAT-ENGAGEMENT-AUDIT.md` — Direction C step 1 row.
- `docs/AGENT-READING-LIST.md` — spec table row.
