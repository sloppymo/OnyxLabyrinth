# Combat engagement audit — OnyxLabyrinth

**Date:** 2026-07-16  
**Context:** Post-hardness pass (`cffa5f3` — ~60% stats + denser packs).  
**Goal:** Identify why combat still feels solved despite harder enemies.

## Executive verdict

The hardness pass fixed the wrong half of the boredom. Enemies now have real stats and real pack shapes — but the decision layer on both sides of the screen is full of placebo verbs, and the two strongest player verbs (100%-success disables, absolute-taunt summons) have no counterplay, no cost curve, and work on bosses. Fights are longer and spikier, but still "solved" from the menu's first frame — Mage casts Web/Sleep, a summon eats 100% of enemy melee, everyone else presses Attack.

The biggest opportunity is not new systems — it's a **truth pass**: make every verb on screen do what it says, give disables diminishing returns, and reconnect counter-magic to the ability system where enemy threat now lives.

## Prioritized gaps

| ID | Issue | Severity |
|----|-------|----------|
| P0-1 | Disables never fail (Web/Sleep/Hold/PW:Stun); boss stunlock | P0 |
| P0-2 | Ability priority absolute; ability powers unscaled vs ×1.6 attacks; attack-debuff no-ops | P0 |
| P0-3 | Spell Shield / Silence / Dispel / Ward disconnected from ability path | P0 |
| P1-4 | Summons = 100% melee taunt + agi 50 | P1 |
| P1-5 | Rage starts 0; Defend clears rage; short fights never reach techniques | P1 |
| P1-6 | 25% crit cap deletes Precision/Blademaster/Feint-on-Attack | P1 |
| P1-7 | Enemy status durations ignored; slow debuff inert; party blind permanent | P1 |
| P2-8 | highDefense + AC double-stack walls out melee | P2 |
| P2-9 | Spell redundancy; affinity invisible in UI | P2 |
| P2-10 | Reach failures silent (log-only) | P2 |

## Three engagement directions

### Direction A — "The Truth Pass" (small, 1–3 days) **← implemented first**

Disable diminishing returns + boss stagger; ability power scale + weighted AI; wire debuffs/AGI/counter-magic; crit cap fix; Feint on Attack; summon soak nerf; status durations.

### Direction B — "Telegraphs and answers" (medium)

Wind-up rounds for big enemy abilities; interrupt tools; rage economy retune; combat consumables.

### Direction C — "Formation warfare + boss phases" (large)

In-combat row swap; Echo phase system; Analyze verb; reach perk stubs.

## Open questions (designer)

1. Control: save rolls vs diminishing returns? → **Shipped: diminishing returns (no RNG).**
2. Bosses: immune vs stagger? → **Shipped: 1-round stagger.**
3. Late-game melee fade intentional?
4. Summon identity: taunt-wall vs damage pet?
5. Rage between fights?
6. Party Auto as attrition tax vs hands-on every fight?
7. Expand consumables vs spartan 2-item catalog?
8. Trim elemental clone ladders?
9. Rename placeholder enemies before public?
10. F4/F5 balance now or later?

## Implementation status

| Item | Status |
|------|--------|
| Audit saved | Done |
| Direction A truth pass | **Done** — `combat.ts` + tests (868 passing) |

### Direction A shipped changes

- Disable diminishing returns + boss 1-round stagger (`disableStacks`, `applyDisableToEnemy`)
- Enemy ability power ×1.6 at resolve time; weighted ability vs basic attack
- Attack debuffs, sleep timers, AGI debuffs in initiative; status durations tick
- Party magic screen + fizzle field on enemy arcane abilities; enemy ward on player spell damage
- Probabilistic player cast fizzle (replaces hard level gate)
- Summon melee soak 55% (was 100%); summon AGI scaled from power
- Crit cap via `critChanceFromLukAndBonuses`; Feint/`nextAttackBonuses` on basic attacks
- Shadow Strike auto-crit only when hidden; reach pre-check + miss events
- Technique reach pre-check before spending rage

### Not in Direction A (deferred)

- Rage economy (start rage, Defend clearing rage) — Direction B
- Blind cure, poison scaling, highDefense AC wall — partial / P1–P2
- Consumables, telegraphs, formation swap — Directions B/C
