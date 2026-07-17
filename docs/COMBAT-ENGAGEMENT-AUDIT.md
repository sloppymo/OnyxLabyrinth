# Combat engagement audit — OnyxLabyrinth

**Date:** 2026-07-16  
**Context:** Post-hardness pass (`cffa5f3` — ~60% stats + denser packs).  
**Goal:** Identify why combat still feels solved despite harder enemies.

## Executive verdict

The hardness pass fixed the wrong half of the boredom. Enemies now have real stats and real pack shapes — but the decision layer on both sides of the screen is full of placebo verbs, and the two strongest player verbs (100%-success disables, absolute-taunt summons) have no counterplay, no cost curve, and work on bosses. Fights are longer and spikier, but still "solved" from the menu's first frame — Mage casts Web/Sleep, a summon eats 100% of enemy melee, everyone else presses Attack.

The biggest opportunity is not new systems — it's a **truth pass**: make every verb on screen do what it says, give disables diminishing returns, and reconnect counter-magic to the ability system where enemy threat now lives.

## Prioritized gaps

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| P0-1 | Disables never fail (Web/Sleep/Hold/PW:Stun); boss stunlock | P0 | **Done** (Direction A: diminishing returns + boss stagger) |
| P0-2 | Ability priority absolute; ability powers unscaled vs ×1.6 attacks; attack-debuff no-ops | P0 | **Done** (Direction A: power scale + weighted AI + debuffs live) |
| P0-3 | Spell Shield / Silence / Dispel / Ward disconnected from ability path | P0 | **Done** (Direction A: screens/fizzle fields wired) |
| P1-4 | Summons = 100% melee taunt + agi 50 | P1 | **Done** (Direction A: 55% soak, AGI scales with power) |
| P1-5 | Rage starts 0; Defend clears rage; short fights never reach techniques | P1 | **Done** (rage economy retune — see below) |
| P1-6 | 25% crit cap deletes Precision/Blademaster/Feint-on-Attack | P1 | **Done** (Direction A: `critChanceFromLukAndBonuses`) |
| P1-7 | Enemy status durations ignored; slow debuff inert; party blind permanent | P1 | **Done** (Direction A: durations tick, AGI debuff in initiative. 2026-07-16: blind gets `blindTimers` from ability `duration` + Cure Blindness spell; poison gets `poisonState` {damage, duration} — Poison Blade 3/round ×3 per spec, poisonOnHit 2/round ×3, both expire. Note: initiative is the ONLY combat formula that reads enemy AGI — hit/damage/flee never do — so slow is fully wired; nothing inert remains) |
| P2-8 | highDefense + AC double-stack walls out melee | P2 | **Done** (2026-07-16: AC reduction floored at 50% of the swing at all 3 physical sites; backstab/Reach Mastery/armorPen pierce the floor — `2026-07-16-ac-damage-floor-design.md`) |
| P2-9 | Spell redundancy; affinity invisible in UI | P2 | **Done** (2026-07-16: discovered-affinity surfacing — first weak/resist proc per species pops WEAK!/RESIST and adds WK:/RES: tags to the enemy window; ladders kept as the probe→exploit toolkit. Noted gap: technique elemental damage never applies affinity — visibility-only fix, `2026-07-16-affinity-surfacing-design.md`) |
| P2-10 | Reach failures silent (log-only) | P2 | **Done** (Direction A: reach pre-check + miss events) |

## Three engagement directions

### Direction A — "The Truth Pass" (small, 1–3 days) **← implemented first**

Disable diminishing returns + boss stagger; ability power scale + weighted AI; wire debuffs/AGI/counter-magic; crit cap fix; Feint on Attack; summon soak nerf; status durations.

### Direction B — "Telegraphs and answers" (medium)

Wind-up rounds for big enemy abilities (**shipped**); interrupt tools (**shipped** — disable-cancels); ~~rage economy retune~~ (shipped); combat consumables (**shipped** — 4-item answers pack).

### Direction C — "Formation warfare + boss phases" (large) **← complete**

~~In-combat row swap~~ (**shipped** 2026-07-16 — Move verb swaps/slides rows for the actor's turn, `2026-07-16-row-swap-design.md`); ~~Echo phase system~~ (**shipped** 2026-07-16 — 3 phases at 66/33%, attack bump, phase abilities incl. telegraphed `total-eclipse`); ~~Analyze verb~~ (**shipped** 2026-07-16 — affinity + trait intel via Y skill list / `n`); ~~reach perk stubs~~ (**shipped** 2026-07-16 — Sweep/Lunge wired via `effectiveWeaponRange`).

## Open questions (designer)

1. Control: save rolls vs diminishing returns? → **Shipped: diminishing returns (no RNG).**
2. Bosses: immune vs stagger? → **Shipped: 1-round stagger.**
3. Late-game melee fade intentional? → **Answered 2026-07-16: accept current trajectory; verify in F4/F5 playtest.** Capstones usable + AC floor + reach perks keep melee healthy on paper; no preemptive buff.
4. Summon identity: taunt-wall vs damage pet? → **Answered 2026-07-16: keep the partial-taunt bruiser** (55% soak + real attacks).
5. Rage between fights? → **Answered 2026-07-16: no carry-over.** Rage starts at half pool each fight instead (`docs/superpowers/specs/2026-07-16-rage-economy-design.md`).
6. Party Auto as attrition tax vs hands-on every fight? → **Answered 2026-07-16: keep as attrition tax** (Auto repeats last command; suboptimal play is the price of speed).
7. Expand consumables vs spartan 2-item catalog? → **Answered 2026-07-16: expand** — the 4-item "answers pack" (Eye Drops, Smelling Salts — the only paralysis cure, Greater Healing Potion, Phoenix Feather revive; `2026-07-16-consumables-answers-pack-design.md`).
8. Trim elemental clone ladders? → **Answered 2026-07-16: no — kept.** With affinity surfaced (P2-9), the ladders are the probe→exploit toolkit, not redundancy. Trimming would also have required a `knownSpellIds` save migration.
9. Rename placeholder enemies before public? → **Answered 2026-07-16: rename crude display names only.** `Big Titty Ogre` → `Hill Ogre` (id `big-titty-ogre` unchanged — sprites/tables/saves untouched). Other names are genre-normal.
10. F4/F5 balance now or later? → **Deferred (documented): later.** F1–F3 systems (hardness, truth pass, telegraphs, affinity) should settle in playtest before tuning F4/F5 numbers against them.

## Implementation status

| Item | Status |
|------|--------|
| Audit saved | Done |
| Direction A truth pass | **Done** — `combat.ts` + tests (868 passing) |
| Direction B step 1: rage economy retune | **Done** — start at half pool, Defend keeps rage, L12 capstones usable (`2026-07-16-rage-economy-design.md`) |
| Direction B step 2: telegraph wind-ups | **Done** — 7 big abilities telegraph a round ahead; disables (incl. boss stagger) cancel (`2026-07-16-telegraph-windups-design.md`) |
| Direction C step 1: Analyze verb | **Done** — turn-cost intel verb (Y skill list / `n`); reveals affinity + trait tags per species (`2026-07-16-analyze-verb-design.md`) |
| Direction C step 2: Echo boss phases | **Done** — 3 phases at 66/33% HP; +4 attack per phase; `memory-shatter` (P2) + telegraphed `total-eclipse` (P3) (`2026-07-16-echo-boss-phases-design.md`) |
| Direction C step 3: in-combat row swap | **Done** — Move verb (Y skill list / `v`); swap or slide rows for the actor's turn; formation normalizes + persists (`2026-07-16-row-swap-design.md`) |

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

- ~~Rage economy (start rage, Defend clearing rage)~~ — shipped (Direction B step 1, 2026-07-16)
- ~~Blind cure, poison scaling~~ — shipped 2026-07-16 (blind timers + Cure Blindness; poison state with damage/duration); highDefense AC wall still deferred (P2-8)
- Consumables, telegraphs, formation swap — Directions B/C
