# Spell Expansion — Design Spec v1.0

## 1. Overview

Expand the spellbook from 36 spells (many of which are interchangeable 1-SP VFX
test spells) to a robust ~53-spell roster where every spell has a distinct
tactical purpose. The game is hard, so buffing, debuffing, status effects, and
summons must be meaningful combat tools — not just flavor.

This spec covers:
- Consolidation of the 11 VFX test cantrips into 4 distinct elemental cantrips
- 28 new spells across all tiers (stat buffs, debuffs, DoT, regen, paralysis,
  more summons, group heals, armor penetration, and more)
- Summon sprite system: recolored enemy sprites for summoned allies
- Balance fixes to existing spells
- Engine work needed, prioritized by effort

> **v1.0 – Playtest Values:** All spell power, SP cost, and proc chance numbers
> are starting points. Expect tuning after playtesting.

## 2. Goals

- Every spell has a reason to be cast over another spell.
- Both classes get real tactical options beyond "deal damage" and "heal."
- Buffs and debuffs matter because enemies hit hard and stats swing combat math.
- Summons are available at multiple tiers, not just tier 5, and look like real
  creatures instead of glowing orbs.
- Status effects (paralysis, poison, sleep, burn, slow) create meaningful
  turn-by-turn decisions.
- The Priest has something to do against living enemies (not just undead).

## 3. Non-Goals

- Terrain/positioning spells that affect the dungeon exploration layer (Knock,
  Create Pit, Teleport) — those are a separate, larger scope.
- Multi-classing or spell trees — spells are learned by tier, same as now.
- Enemy resurrection counterplay (True Death, Soul Bind) — no enemy resurrects
  yet; add the counter when the mechanic exists.
- Final balance tuning — numbers are playtest placeholders.

## 4. Existing spell audit

### 4.1 Current roster (36 spells)

**Mage (25):** 14 real combat spells + 11 VFX test cantrips (all 1 SP, 5 damage,
no secondary effects). The 11 cantrips are functionally identical except for
which VFX plays.

**Priest (11):** 3 heals, 1 cure, 1 resurrect, 1 buff, 1 summon, 3 damage (all
holy/undead-specific or VFX test), 1 utility (Light).

### 4.2 Balance fixes to existing spells

| Spell | Current | Proposed | Reason |
|-------|---------|----------|--------|
| Fireball | 10 SP, 10 dmg, all enemies | 10 SP, **14** dmg, all enemies | Cone of Cold (9 SP, 12 dmg, group) is strictly better. "All enemies" (both rows) justifies a premium but not 2 less damage for 1 more SP. |
| Cone of Cold | 9 SP, 12 dmg, group | Unchanged | Benchmark for tier 3 AoE. |
| Immolate | 15 SP, 25 dmg, single | Unchanged | Benchmark for tier 4 single-target nuke. |
| Ice Storm | 18 SP, 16 dmg, all | Unchanged | Benchmark for tier 4 AoE. |

### 4.3 VFX cantrip consolidation

Cut 11 interchangeable cantrips down to 4, each with a secondary effect that
gives the spell elemental identity:

| Spell | SP | Damage | Secondary effect (10% proc) | Element | VFX |
|-------|-----|--------|------------------------------|---------|-----|
| **Spark** | 1 | 5 lightning | 10% stun (1 round) | Lightning | lightning_blast |
| **Ember** | 1 | 5 fire | 10% burn (2 dmg/round x2) | Fire | fireball / fire_explosion |
| **Frostbite** | 1 | 5 cold | 10% slow (-AGI debuff, 2 rounds) | Cold | ice_burst |
| **Poison Spray** | 1 | 5 poison | 10% poison (3 dmg/round x3) | Poison | red_lightning |

**Removed:** Shock Lance, Cinder Bolt, Ray of Frost, Chill Touch, Chain
Lightning, Flame Burst, Noxious Cloud. Their VFX styles are preserved by the
4 remaining cantrips and higher-tier spells.

> **Migration note:** Characters who knew removed cantrips lose them on load.
> The save migration (v8 → v9) should filter `knownSpellIds` against the new
> spell list and silently drop unknown ids. This is safe — cantrips are 1-SP
> filler, not build-defining.

## 5. New spells (28)

### 5.1 Engine-ready (just add spell data — no code changes)

These use existing `SpellEffect` kinds and target shapes:

| # | Spell | Class | Tier | SP | Target | Effect | Notes |
|---|-------|-------|------|-----|--------|--------|-------|
| 1 | **Hold Person** | Mage | 2 | 6 | Single enemy | Disable: paralysis | `disable` type already supports `"paralysis"` |
| 2 | **Web** | Mage | 2 | 7 | Enemy group | Disable: paralysis | Group paralysis — strong but expensive |
| 3 | **Power Word: Stun** | Mage | 4 | 18 | Single enemy | Disable: paralysis | No-save stun; boss-resistant via existing paralysis immunity |
| 4 | **Lesser Summon** | Mage | 2 | 6 | Self | Summon (power 2) | Early-game summon; sprite: recolored slime |
| 5 | **Summon Fire Elemental** | Mage | 3 | 14 | Self | Summon (power 4) | Mid-game summon; sprite: recolored acid-puddle (red/orange tint) |
| 6 | **Gate** | Mage | 5 | 30 | Self | Summon (power 8) | Boss-tier summon; sprite: recolored stone-guardian (dark/purple tint) |
| 7 | **Shield of Faith** | Priest | 1 | 3 | Single ally | Buff: +armor | Same effect as Bless but single-target, cheaper |
| 8 | **Mass Cure** | Priest | 2 | 8 | All allies | Heal 15 | Group heal — Priest desperately needs this |
| 9 | **Divine Smite** | Priest | 2 | 5 | Single enemy | 12 divine damage | General-purpose nuke (not undead-specific). New element: `"divine"` |
| 10 | **Summon Guardian** | Priest | 2 | 7 | Self | Summon (power 3) | Early summon; sprite: recolored animated-armor (gold/white tint) |
| 11 | **Mass Heal** | Priest | 3 | 15 | All allies | Heal 30 | Strong group heal |
| 12 | **Heal** | Priest | 5 | 25 | Single ally | Heal 999 (full) | Full heal — use very high power, cap at target's maxHp |
| 13 | **Summon Celestial Guardian** | Priest | 4 | 20 | Self | Summon (power 6) | Tanky summon; sprite: recolored animated-armor (blue/white tint) |

### 5.2 Stat buffs & debuffs (small engine extension)

These require extending the `buff` effect kind to support stats beyond `"armor"`,
and adding a new `"debuff"` effect kind for negative stat modifiers on enemies.

**Engine work:**
- Extend `SpellEffect` buff: `{ kind: "buff"; stat: "armor" | "str" | "agi" | "int" | "pie" | "vit" | "luk"; power?: number }`
- Add `SpellEffect` debuff: `{ kind: "debuff"; stat: "str" | "agi" | "int" | "pie" | "vit" | "luk"; power: number; duration: number }`
- Track active buffs/debuffs in `CombatState` (per-character buff list, per-enemy debuff list)
- Apply buff stat modifiers in `effectiveStats()` (already composes equipment + perks — add spell buffs as a third layer)
- Apply debuff stat modifiers to enemy combat math (reduce their effective STR/AGI)
- Tick buff/debuff durations each round; expire when duration reaches 0

| # | Spell | Class | Tier | SP | Target | Effect | Notes |
|---|-------|-------|------|-----|--------|--------|-------|
| 14 | **True Strike** | Mage | 1 | 2 | Single ally | Buff: +STR (3 rounds) | Boosts melee damage for one fighter |
| 15 | **Guidance** | Priest | 1 | 2 | Single ally | Buff: +INT (3 rounds) | Boosts spell power for a Mage |
| 16 | **Haste** | Mage | 1 | 1 | Single ally | Buff: +AGI (3 rounds) | Cantrip — boosts initiative and evasion |
| 17 | **Slow** | Mage | 2 | 5 | Enemy group | Debuff: -AGI (3 rounds) | Reduces enemy initiative and evasion |
| 18 | **Ray of Enfeeblement** | Mage | 2 | 5 | Single enemy | Debuff: -STR (3 rounds) | Reduces enemy melee damage |
| 19 | **Counterspell** | Mage | 3 | 8 | Single enemy | Dispel enemy buffs | Like Dispel Magic but single-target, cheaper, earlier tier |

### 5.3 DoT & regen (medium engine extension)

These require a per-round tick system for ongoing effects.

**Engine work:**
- Add `SpellEffect` DoT: `{ kind: "dot"; element: DamageElement; power: number; duration: number }`
- Add `SpellEffect` regen: `{ kind: "regen"; power: number; duration: number }`
- Track active DoTs on enemies and regen buffs on party members in `CombatState`
- Tick DoT/regen at the start of each round (after initiative, before actions)
- DoT damage is affected by elemental resistances if/when those exist
- Regen heals are flat (not affected by casting stat) to keep them distinct from instant heals

| # | Spell | Class | Tier | SP | Target | Effect | Notes |
|---|-------|-------|------|-----|--------|--------|-------|
| 20 | **Incinerate** | Mage | 3 | 12 | Single enemy | 15 fire damage + burn (5/round x3) | Damage + DoT combo |
| 21 | **Meteor Swarm** | Mage | 5 | 30 | All enemies | 35 fire damage + burn (10/round x3) | Top-tier AoE nuke + DoT |
| 22 | **Regenerate** | Priest | 3 | 12 | Single ally | Heal 20 + regen (5/round x3) | Heal + ongoing recovery |
| 23 | **Mass Regenerate** | Priest | 5 | 28 | All allies | Heal 30 + regen (8/round x3) | Top-tier group recovery |

### 5.4 Reworked cantrip secondary effects (uses DoT/debuff infra)

Once DoT and debuff infrastructure exists, the 4 consolidated cantrips get
their secondary proc effects:

| Cantrip | Secondary effect | Implementation |
|---------|------------------|----------------|
| Spark | 10% stun (paralysis, 1 round) | `disable` effect, proc chance |
| Ember | 10% burn (2/round x2) | `dot` effect, proc chance |
| Frostbite | 10% slow (-AGI, 2 rounds) | `debuff` effect, proc chance |
| Poison Spray | 10% poison (3/round x3) | `dot` effect, proc chance |

**Proc mechanic:** When a cantrip's damage resolves, roll `rng()`. If `< 0.10`,
apply the secondary effect to the target in addition to the damage. This needs
a new `SpellEffect` kind: `{ kind: "damageWithProc"; element: DamageElement; power: number; proc: number; secondary: SpellEffect }` — or simpler, handle it in the
damage resolution code by checking the spell id and rolling.

### 5.5 Larger engine work (do last)

| # | Spell | Class | Tier | SP | Target | Effect | Engine work |
|---|-------|-------|------|-----|--------|--------|-------------|
| 24 | **Stoneskin** | Mage | 3 | 10 | Single ally | Buff: flat damage reduction (-3 per hit, 3 rounds) | New buff kind: `damageReduction` |
| 25 | **Resistance** | Priest | 1 | 2 | Single ally | Buff: +25% elemental resist (3 rounds) | New buff kind: `elementalResist` |
| 26 | **Aid** | Priest | 2 | 5 | Single ally | Heal 10 + temp HP 10 | New mechanic: `tempHp` on Character |
| 27 | **Disintegrate** | Mage | 4 | 20 | Single enemy | 50 physical damage (ignores armor) | New damage flag: `armorPen: true` |
| 28 | **Freezing Sphere** | Mage | 4 | 22 | All enemies | 20 cold damage + paralysis | Damage + disable combo (needs both in one cast) |
| — | **Banishment** | Priest | 3 | 12 | Single enemy | Destroy undead if HP < 25% maxHp | New effect kind: `conditionalKill` |
| — | **Death Ward** | Priest | 4 | 15 | Single ally | Buff: survive at 1 HP once | New buff kind: `deathWard` (similar to Guardian Angel perk) |
| — | **Holy Aura** | Priest | 4 | 18 | All allies | Buff: +armor + regen 3/round (3 rounds) | Multi-effect buff (needs combining buff + regen) |

### 5.6 New mechanics (risky — maybe later)

| Spell | Class | Tier | SP | Target | Effect | Risk |
|-------|-------|------|-----|--------|--------|------|
| **Haste (tier 3)** | Mage | 3 | 12 | All allies | Buff: +AGI to all (NOT extra turns) | Safe if it's just a stat buff. Do NOT implement extra turns. |
| **Time Stop** | Mage | 5 | 40 | Self | Mage acts twice next round | High-risk. 40 SP means you can't also nuke. Self-only, not party-wide. |

> **Design rule:** Haste and Time Stop must never grant literal extra full turns
> to the whole party. Haste is a stat buff (+AGI). Time Stop is a self-only
> double action at extreme cost. If these prove broken in playtesting, cut them.

## 6. Summon sprite system

### 6.1 Current state

Summoned allies are drawn as glowing orbs (`drawAlly()` in `combat-scene.ts`).
The `SummonedAlly` interface has no sprite field — it's just stats + name.

### 6.2 Proposed changes

Extend `SummonedAlly` with an optional `spriteId` field:

```ts
export interface SummonedAlly {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  ac: number;
  agi: number;
  row: Row;
  spriteId?: string;  // enemy sprite id to render, falls back to orb
}
```

When `spriteId` is set, `drawAlly()` loads the sprite strip via
`getEnemySpriteStrip(spriteId)` and draws it the same way enemies are drawn
(but positioned at the ally slot, between party and enemies).

### 6.3 Recolored sprite plan

Recolor existing enemy sprite PNGs using a simple hue-shift or tint script.
No new art needed — just programmatic recoloring of existing strips.

| Summon spell | Base sprite | Recolor | Result |
|-------------|-------------|---------|--------|
| Lesser Summon (Mage T2) | `slime` | Blue tint | "Summoned Slime" — weak HP, low attack |
| Summon Fire Elemental (Mage T3) | `acid-puddle` | Red/orange tint | "Fire Elemental" — medium HP, decent attack |
| Gate (Mage T5) | `stone-guardian` | Dark purple tint | "Eldritch Guardian" — high HP, high attack |
| Summon Guardian (Priest T2) | `animated-armor` | Gold/white tint | "Holy Guardian" — tanky, low damage |
| Summon Celestial Guardian (Priest T4) | `animated-armor` | Blue/white tint | "Celestial Guardian" — high HP, high AC |
| Conjure Elemental (Mage T5, existing) | `failed-experiment` | Green tint | "Summoned Elemental" — replaces orb |
| Summon Celestial (Priest T5, existing) | `skeleton` | White/gold tint | "Summoned Celestial" — replaces orb |

### 6.4 Recoloring implementation

A Node script (`scripts/recolor-sprites.mjs`) that:
1. Reads each base sprite PNG from `public/assets/enemies/<id>/`.
2. Applies a hue rotation / color overlay using `sharp` or a pure-canvas approach.
3. Writes the recolored strips to `public/assets/enemies/summon-<name>/`.
4. Registers the new sprite ids in `sprite-manifest.ts`.

The recolored sprites are static assets — generated once, committed to the repo,
and served from `public/assets/enemies/summon-*/` like any other enemy sprite.

### 6.5 Summon stat scaling

Current formula (keep, extend with `spriteId` and `name`):

```
hp = power * 6
attack = power * 3
ac = max(1, floor(power / 2))
agi = 50  (acts before most enemies)
```

| Spell | Power | HP | Attack | AC | Sprite |
|-------|-------|-----|--------|-----|--------|
| Lesser Summon | 2 | 12 | 6 | 1 | Slime (blue) |
| Summon Guardian | 3 | 18 | 9 | 1 | Animated Armor (gold) |
| Summon Fire Elemental | 4 | 24 | 12 | 2 | Acid Puddle (red) |
| Summon Celestial Guardian | 6 | 36 | 18 | 3 | Animated Armor (blue) |
| Conjure Elemental (existing) | 5 | 30 | 15 | 2 | Failed Experiment (green) |
| Summon Celestial (existing) | 5 | 30 | 15 | 2 | Skeleton (white) |
| Gate | 8 | 48 | 24 | 4 | Stone Guardian (purple) |

Max 3 summoned allies at once (existing cap). New summons replace the oldest
if at cap (existing behavior).

## 7. Full spellbook after expansion (53 spells)

### 7.1 Mage (29 spells)

#### Tier 1 (6)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Fire Bolt | 3 | One enemy | 10 fire damage |
| Arcane Ward | 3 | Self | Buff: +armor |
| Wayfinder | 2 | Self | Detect (utility) |
| Spark | 1 | One enemy | 5 lightning + 10% stun |
| Ember | 1 | One enemy | 5 fire + 10% burn |
| Frostbite | 1 | One enemy | 5 cold + 10% slow |
| Poison Spray | 1 | One enemy | 5 poison + 10% poison |
| True Strike | 2 | Single ally | Buff: +STR (3 rounds) |
| Haste | 1 | Single ally | Buff: +AGI (3 rounds) |

#### Tier 2 (6)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Burning Hands | 6 | Enemy group | 8 fire damage |
| Sleep | 5 | One enemy | Inflict sleep |
| Hold Person | 6 | One enemy | Inflict paralysis |
| Web | 7 | Enemy group | Inflict paralysis (group) |
| Slow | 5 | Enemy group | Debuff: -AGI (3 rounds) |
| Ray of Enfeeblement | 5 | One enemy | Debuff: -STR (3 rounds) |
| Lesser Summon | 6 | Self | Summon (power 2) |

#### Tier 3 (5)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Fireball | 10 | All enemies | 14 fire damage |
| Cone of Cold | 9 | Enemy group | 12 cold damage |
| Counterspell | 8 | Single enemy | Dispel enemy buffs |
| Incinerate | 12 | One enemy | 15 fire + burn 5/round x3 |
| Stoneskin | 10 | Single ally | Buff: DR -3/hit (3 rounds) |
| Summon Fire Elemental | 14 | Self | Summon (power 4) |

#### Tier 4 (5)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Immolate | 15 | One enemy | 25 fire damage |
| Ice Storm | 18 | All enemies | 16 cold damage |
| Levitate | 8 | Self | Levitation 30t (utility) |
| Disintegrate | 20 | One enemy | 50 physical (ignores armor) |
| Freezing Sphere | 22 | All enemies | 20 cold + paralysis |
| Power Word: Stun | 18 | One enemy | Paralysis (no save) |

#### Tier 5 (6)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Spell Shield | 12 | All allies | Magic screen (5) |
| Silence | 20 | Enemy group | Fizzle field (5) |
| Dispel Magic | 18 | All enemies | Dispel |
| Conjure Elemental | 25 | All allies | Summon (power 5) |
| Meteor Swarm | 30 | All enemies | 35 fire + burn 10/round x3 |
| Gate | 30 | Self | Summon (power 8) |
| Time Stop | 40 | Self | Mage acts twice next round |

### 7.2 Priest (24 spells)

#### Tier 1 (6)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Light | 3 | Self | Light 40t (utility) |
| Cure Wounds | 3 | Single ally | Heal 12 |
| Sacred Flame | 4 | One enemy | 8 holy (undead) damage |
| Guiding Bolt | 1 | One enemy | 5 lightning damage |
| Guidance | 2 | Single ally | Buff: +INT (3 rounds) |
| Shield of Faith | 3 | Single ally | Buff: +armor |
| Resistance | 2 | Single ally | Buff: +25% elemental resist (3 rounds) |

#### Tier 2 (5)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Cure Serious Wounds | 6 | Single ally | Heal 30 |
| Neutralize Poison | 5 | Single ally | Cure poison |
| Mass Cure | 8 | All allies | Heal 15 |
| Divine Smite | 5 | One enemy | 12 divine damage |
| Aid | 5 | Single ally | Heal 10 + temp HP 10 |
| Summon Guardian | 7 | Self | Summon (power 3) |

#### Tier 3 (5)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Cure Critical Wounds | 10 | Single ally | Heal 60 |
| Bless | 9 | All allies | Buff: +armor |
| Mass Heal | 15 | All allies | Heal 30 |
| Regenerate | 12 | Single ally | Heal 20 + regen 5/round x3 |
| Banishment | 12 | One enemy | Kill undead if HP < 25% |

#### Tier 4 (5)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Raise Dead | 15 | Single ally | Resurrect |
| Sunburst | 18 | All enemies | 18 holy (undead) damage |
| Death Ward | 15 | Single ally | Buff: survive at 1 HP once |
| Holy Aura | 18 | All allies | Buff: +armor + regen 3/round (3 rounds) |
| Summon Celestial Guardian | 20 | Self | Summon (power 6) |

#### Tier 5 (3)
| Spell | SP | Target | Effect |
|-------|-----|--------|--------|
| Summon Celestial | 25 | All allies | Summon (power 5) |
| Heal | 25 | Single ally | Full heal to max HP |
| Mass Regenerate | 28 | All allies | Heal 30 + regen 8/round x3 |

## 8. New damage element: Divine

`Divine Smite` deals `"divine"` damage, which is NOT the same as `"undead"`.
- `"undead"` damage is the existing holy element that only matters against
  undead enemies (Skeletons, etc.) — it's effectively a situational bonus.
- `"divine"` damage is general-purpose — it hits everything for full damage,
  with no elemental resistance or weakness interaction (yet).

Add `"divine"` to the `DamageElement` union:

```ts
export type DamageElement = "fire" | "cold" | "physical" | "undead" | "lightning" | "poison" | "divine";
```

In `combat-display.ts`, add `divine: "Divine"` to `ELEMENT_LABELS`.

## 9. Implementation priority

### Phase 1: Engine-ready batch (12 spells + balance fixes + cantrip consolidation)
**Effort:** Low — just spell data + save migration + sprite recoloring script.
**Impact:** High — immediately gives both classes more tools.

1. Consolidate 11 cantrips → 4 (remove 7 spell defs, update party loadouts).
2. Add `"divine"` to `DamageElement`.
3. Add 12 engine-ready spells (Hold Person, Web, Power Word: Stun, Lesser
   Summon, Summon Fire Elemental, Gate, Shield of Faith, Mass Cure, Divine
   Smite, Summon Guardian, Mass Heal, Heal, Summon Celestial Guardian).
4. Fix Fireball damage (10 → 14).
5. Bump `SAVE_VERSION` to 9, add v8→v9 migration (filter removed spell ids).
6. Write `scripts/recolor-sprites.mjs`, generate 7 recolored sprite sets.
7. Extend `SummonedAlly` with `spriteId`, update `drawAlly()` to use sprites.
8. Update default party loadouts with new spells.
9. Update tests.

### Phase 2: Stat buffs & debuffs (6 spells + cantrip secondary effects)
**Effort:** Medium — extend `SpellEffect`, track buffs/debuffs in combat state.
**Impact:** High — makes tactical buffing/debuffing viable.

1. Extend `buff` effect to support all stats.
2. Add `debuff` effect kind.
3. Track active buffs (per character) and debuffs (per enemy) in `CombatState`.
4. Apply buffs in `effectiveStats()`, apply debuffs to enemy math.
5. Tick durations each round.
6. Add 6 stat buff/debuff spells (True Strike, Guidance, Haste, Slow, Ray of
   Enfeeblement, Counterspell).
7. Add cantrip proc secondary effects (Spark stun, Ember burn, Frostbite slow,
   Poison Spray poison).

### Phase 3: DoT & regen (4 spells)
**Effort:** Medium — per-round tick system.
**Impact:** Medium — makes elemental choice matter, gives Priest ongoing recovery.

1. Add `dot` and `regen` effect kinds.
2. Track active DoTs (per enemy) and regen buffs (per character) in `CombatState`.
3. Tick at round start.
4. Add 4 spells (Incinerate, Meteor Swarm, Regenerate, Mass Regenerate).

### Phase 4: Larger engine work (8 spells)
**Effort:** High — new mechanics (temp HP, armor pen, conditional kill, etc.).
**Impact:** Medium — high-tier payoff spells.

1. Stoneskin (damage reduction buff).
2. Resistance (elemental resist buff).
3. Aid (temp HP).
4. Disintegrate (armor penetration).
5. Freezing Sphere (damage + disable combo).
6. Banishment (conditional kill).
7. Death Ward (survive at 1 HP).
8. Holy Aura (multi-effect buff).

### Phase 5: New mechanics (2 spells — risky)
**Effort:** High — fundamental combat flow changes.
**Impact:** Risky — could break balance.

1. Haste (tier 3, +AGI to all allies — NOT extra turns).
2. Time Stop (tier 5, self-only double action, 40 SP).

> **Do not implement Phase 5 until Phases 1-4 are playtested and balanced.**

## 10. Spell description panel

All new spells get `description` fields for the in-game spell detail panel
(`buildSpellDetailWindow` in `combat-select-action-view.ts`). The panel
auto-generates the mechanical summary line via `spellEffectSummary()` — new
effect kinds (debuff, dot, regen, damageReduction, elementalResist, etc.) need
cases added to that function.

Example descriptions:

| Spell | Description |
|-------|-------------|
| Hold Person | "Freezes a single enemy in place, preventing all action." |
| Web | "Envelops an enemy group in sticky strands, paralyzing them." |
| True Strike | "Channels arcane energy into an ally's muscles, boosting their strength." |
| Slow | "Saps the speed from an enemy group, making them sluggish and easy to hit." |
| Incinerate | "Engulfs a single foe in roaring flame that continues to burn." |
| Mass Cure | "Washes the entire party in healing light, mending minor wounds." |
| Divine Smite | "Channels divine wrath into a single target, harming living and undead alike." |
| Lesser Summon | "Calls a small slime to fight at the party's side." |
| Gate | "Tears open a portal to another plane, calling forth a powerful guardian." |

## 11. Save migration (v8 → v9)

The v8→v9 migration must:
1. Filter each character's `knownSpellIds` against the new `ALL_SPELLS` list.
   Any id that no longer exists (removed cantrips) is silently dropped.
2. No spell id renames in this migration — all existing spell ids that survive
   the cut keep their ids.

```ts
if (version === 8) {
  // v8 → v9: cantrip consolidation removed 7 spell ids; filter them out.
  const validIds = new Set(ALL_SPELLS.map((s) => s.id));
  const oldParty = (ser.party as Array<Record<string, unknown>> | undefined) ?? [];
  ser.party = oldParty.map((c) => ({
    ...c,
    knownSpellIds: ((c.knownSpellIds as string[] | undefined) ?? []).filter(
      (id) => validIds.has(id)
    ),
  }));
  version = 9;
}
```

## 12. Testing plan

- **Phase 1:** Test each new summon spell creates a `SummonedAlly` with correct
  stats and `spriteId`. Test that `drawAlly()` renders the sprite when present
  and falls back to the orb when absent. Test save migration filters removed
  cantrip ids. Test Fireball does 14 damage.
- **Phase 2:** Test stat buffs modify `effectiveStats()`. Test debuffs reduce
  enemy combat math. Test buff/debuff expiry after N rounds. Test cantrip proc
  chances (use seeded RNG).
- **Phase 3:** Test DoT ticks for correct damage each round. Test regen heals
  correct amount. Test expiry. Test DoT + regen don't interact with each other.
- **Phase 4:** Test temp HP absorbs damage before real HP. Test armor pen
  ignores AC. Test conditional kill threshold. Test Death Ward triggers once.
- **Phase 5:** Test Haste is a stat buff only (no extra turn). Test Time Stop
  gives exactly one extra action to the Mage only.

---

## Shipping status note (2026-07-13, updated post combat-depth pass)

Consult `src/data/spells.ts` for the live corpus. Combat spells now ship through **tier 7** (T6–T7 are a small endgame set: Meteor Swarm, Disintegrate, Freezing Sphere / Mass Regenerate, Holy Aura). Unlock via `ceil(level/2)` is also capped by `maxContentSpellTier()` so empty tiers cannot silently reopen.

**§5.3 DoT/regen is now live** as an optional `followup` field on `damage`/`heal` effects (rather than standalone `dot`/`regen` kinds): `mage-meteor-swarm` applies its design burn (10/round ×3, respects elemental resist/weakness), `priest-mass-regenerate` its regen (8/round ×3), and single-target `priest-regenerate` (T3, heal 20 + 5/round ×3) shipped as the one extra design spell. Ticks run in end-of-round status processing on `CombatState.enemyDots`/`regenBuffs` and emit structured events. Incinerate, §5.4 cantrip procs, and §5.6 Time Stop remain deferred. Index: [`docs/AGENT-READING-LIST.md`](../AGENT-READING-LIST.md).

