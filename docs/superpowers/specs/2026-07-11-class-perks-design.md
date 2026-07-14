# Class Perks and Stat System Refactor — v1.0 Playtest Values

## 1. Overview

Add a **Class Perk** system where each character chooses one of two mutually exclusive perks at levels **3, 6, 9, and 12**. Perks are passive or reaction-based — no new combat buttons. Level-ups happen **immediately after combat** with full HP/SP restoration. Level-12 choices are subclass-defining capstones.

This design also fixes gaps in the existing stat system so that equipment `statBonuses` and perk-based stat modifiers actually affect combat math.

> **v1.0 – Playtest Values:** The structure, hook names, and perk identities are intended to be stable. All percentages, damage modifiers, and trigger chances are starting points and are expected to change after playtesting.

## 2. Goals

- Give every class a distinct build path and at least one memorable "hero moment."
- Make level-ups feel rewarding on the spot (HP/SP restore + perk choice).
- Make all six stats have clear, practical effects in combat and exploration.
- Keep the UI simple: perks trigger automatically through combat hooks.
- Lay a data-driven foundation so future perks can be added without touching combat internals.

## 3. Non-Goals

- Active combat abilities that add new menu options.
- Multi-classing or respec.
- Perks that affect dungeon exploration (trap detection, movement, etc.).
- Final balance tuning — numbers are playtest placeholders.

## 4. Stat System Refactor

Introduce a single source of truth:

```ts
export function effectiveStats(
  character: Character,
  equipment: Loadout,
  perks: PerkDef[]
): Stats;
```

`effectiveStats` returns the character’s final stats after applying, in order:

1. Base `character.stats` (rolled + racial modifiers).
2. Equipment `statBonuses` from armor/weapon.
3. Permanent stat modifiers from chosen perks.

All combat, HP/SP growth, and skill checks read effective stats instead of base stats.

### 4.1 Stat effects after refactor

| Stat | Effect |
|------|--------|
| **STR** | Melee damage base: `effectiveSTR + level + weaponBonus`. |
| **INT** | Mage max SP (`INT * 2`) and SP growth (`INT * 0.5`). Spell damage/heal bonus: `floor(effectiveINT / 4)` for Mage spells. |
| **PIE** | Priest max SP (`PIE * 2`) and SP growth (`PIE * 0.5`). Spell damage/heal bonus: `floor(effectivePIE / 4)` for Priest spells. |
| **VIT** | Max HP (`VIT * 2 + classBonus`) and HP growth per level. |
| **AGI** | Initiative (primary sort). Flee bonus: `+2% per AGI above 10`, capped at +10%. Physical evasion: `+1% per AGI above 10`, capped at 15%. Hidden-character spot check. |
| **LUK** | Initiative tie-breaker. Crit chance: `effectiveLUK / 100`, capped at 25%. Trap avoidance/disarm bonus. |

### 4.2 Formula changes

- **Flee success:** `0.95 + min((effectiveAGI - 10) * 0.02, 0.10)` vs non-boss; bosses remain 0%.
- **Physical evasion:** after enemy special evasion, before blind, apply `min((effectiveAGI - 10) * 0.01, 0.15)`.
- **Spell damage/healing:** add `floor(castingStat / 4)` to the spell’s base power.
- **Crit chance:** cap at 25%.
- **Trap checks:** Thieves use `(level + AGI + LUK) / 3`; others use `LUK / 3`.

## 5. Perk System Overview

- Characters earn a perk choice at **levels 3, 6, 9, and 12**.
- Each tier offers **two mutually exclusive perks**.
- Perks are stored as `perkIds: string[]` on the `Character` object.
- Perks register listeners on combat hooks; the combat engine emits events and perks react.
- Perks never add new actions to the combat menu.

## 6. Level-up Flow

After a victorious combat:

1. Award XP and gold as today.
2. For each living party member whose `xp >= xpForNextLevel(level)`:
   - Apply `levelUpChar` (level, max HP/SP, full restore, new spells).
   - If the new level is 3/6/9/12, add to the perk-pick queue.
3. If the queue is non-empty, open the **Perk Selection Overlay** in dungeon mode.
4. Process characters one at a time: show class, level, tier, and two perk cards.
5. Store the chosen perk id and move to the next character.
6. When the queue is empty, close the overlay and return to the dungeon.

## 7. Perk Tables (v1.0 Playtest Values)

> All percentages and modifiers in this section are **Playtest Values (Subject to Balance)**.

### 7.1 Fighter

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Cleave** — 25% chance melee attacks also damage an adjacent front-row enemy. | **Toughness** — +15% max HP. |
| 2 | 6 | **Protector** — Allies directly behind you cannot be targeted by single-target melee while you live. | **Berserker** — +25% melee damage, -15% armor defense. |
| 3 | 9 | **Vanguard** — Front-row allies take 10% less physical damage. | **Last Stand** — First time you drop below 20% HP each combat, counterattack every adjacent enemy. |
| 4 | 12 | **Juggernaut** — Immune to status effects; +20% max HP. | **Warmaster** — Melee attacks have 35% chance to hit every front-row enemy. |

### 7.2 Mage

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Spell Echo** — Every third spell is repeated for free on the same target. | **Arcane Focus** — Spells cost 20% less SP. |
| 2 | 6 | **Glass Cannon** — +30% spell damage, -15% max HP. | **Mana Shield** — 20% of incoming damage is deducted from SP instead of HP. |
| 3 | 9 | **Chain Caster** — 25% chance a damaging spell jumps to a second random target. | **Arcane Surge** — After spending 50 SP in one combat, next spell is free and deals +50% damage. |
| 4 | 12 | **Archmage** — First 3 spells each combat are free; +20% max SP. | **Spellbreaker** — Spells ignore 50% resistance, cannot be reflected, immune to Silence. |

### 7.3 Priest

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Healer’s Touch** — Healing spells restore 30% more HP. | **Divine Hammer** — Melee attacks deal +PIE holy damage. |
| 2 | 6 | **Martyr** — Half of all damage adjacent front-row allies take is redirected to you. | **Turn Undead** — +50% damage vs undead. |
| 3 | 9 | **Revival** — Revive spells restore target to 50% HP. | **Guardian Angel** — First ally who would die each combat survives at 1 HP. |
| 4 | 12 | **Saint** — Party regains 5% max HP per round; healing spells can target KO’d allies as revives. | **Inquisitor** — Offensive spells have 35% chance to stun for 1 round; +30% damage vs undead/demons. |

### 7.4 Thief

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Ambusher** — First attack each combat is always a critical hit. | **Trap Sense** — +20% disarm chance; traps deal -30% damage. |
| 2 | 6 | **Backstab** — Back-row attacks ignore 25% enemy AC. | **Smoke Bomb** — Flee always succeeds if HP is below 30%. |
| 3 | 9 | **Assassin** — +25% crit chance vs enemies with status effects. | **Shadow Dance** — After using Hide twice in one combat, next Hide attack ignores 50% defense. |
| 4 | 12 | **Shadow** — Permanently hidden at combat start; first attack each round from Hide auto-crits. | **Swindler** — 35% chance to steal consumables/materials/rare drops on attack; shops 20% cheaper. |

### 7.5 Halberdier

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Reach Mastery** — Polearm attacks ignore 2 points of enemy AC. | **Phalanx** — +15% defense while in front row. |
| 2 | 6 | **Impale** — 25% chance attacks hit both front-row enemies. | **Brace** — Defending reduces next hit by 60% instead of 30%. |
| 3 | 9 | **Sweep** — Back-row polearm attacks reach any row at full damage. | **Hold the Line** — When an ally directly behind you is attacked, counter-attack for 50% damage. |
| 4 | 12 | **Sentinel** — Enemies deal -20% damage while you are alive in the front row. | **Warlord** — Allies adjacent to you gain +20% damage. |

### 7.6 Duelist

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Precision** — +12% crit chance. | **Parry** — +10% physical evasion. |
| 2 | 6 | **Riposte** — When an enemy misses you, counter-attack for 75% damage. | **Perfect Timing** — If your previous attack crit, your next attack cannot miss. |
| 3 | 9 | **Lunge** — Short-range weapons reach any row without penalty. | **Momentum** — Each consecutive hit on the same target grants +5% damage; resets on miss or target switch. |
| 4 | 12 | **Blademaster** — Crits deal triple damage; +15% crit chance. | **Swashbuckler** — Attacks have 40% chance to strike twice; +15% flee/evasion. |

### 7.7 Crusader

| Tier | Level | Perk A | Perk B |
|------|-------|--------|--------|
| 1 | 3 | **Smite** — Melee attacks deal +PIE holy damage. | **Battle Cleric** — Healing spells cost 20% less SP. |
| 2 | 6 | **Holy Shield** — Defending grants +20% defense for 2 rounds. | **Zealot** — +20% melee damage, -10% max SP. |
| 3 | 9 | **Retribution** — When an adjacent ally is attacked, attacker takes PIE holy damage. | **Judge** — +35% damage vs undead/demon enemies. |
| 4 | 12 | **Paladin** — Once per combat, survive a lethal blow at 1 HP; party takes 10% less damage while you live. | **Dark Templar** — Melee attacks heal you for 15% of damage; +25% damage, but healing spells cost 30% more SP. |

## 8. Structured Perk Schema

Perks are authored in code/data as objects matching this schema. The schema is used for both implementation and documentation.

```yaml
id: warmaster
class: Fighter
tier: 4
level: 12
name: Warmaster
description: >
  Melee attacks have a 35% chance to strike every front-row enemy.

triggers:
  - OnAttack

conditions:
  - actor.weapon.type == "melee"
  - targetRow == "front"
  - frontRowEnemies.length > 1

effect:
  chance: 0.35
  attackAllFrontRow: true

tags:
  - offense
  - aoe
  - melee
  - passive

stacking: independent
oncePerCombat: false
priority: normal
```

### 8.1 Example: activated passive

```yaml
id: guardian-angel
class: Priest
tier: 3
level: 9
name: Guardian Angel
description: >
  The first ally who would die each combat survives at 1 HP.

triggers:
  - OnAllyWouldDie

conditions:
  - triggeredThisCombat == false
  - ally.hp - incomingDamage <= 0

effect:
  preventDeath: true
  setHp: 1
  consumedForCombat: true

tags:
  - support
  - revive
  - reactive

stacking: independent
oncePerCombat: true
priority: high
```

### 8.2 Schema field definitions

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique kebab-case identifier. |
| `class` | `CharacterClass` | Which class can take this perk. |
| `tier` | 1–4 | Perk tier. |
| `level` | number | Character level required. |
| `name` | string | Display name. |
| `description` | string | Player-facing description. |
| `triggers` | `CombatHook[]` | Hooks this perk listens to. |
| `conditions` | string[] | Human-readable condition list for design reference. Each perk implements its own predicate in code. |
| `effect` | `Record<string, unknown>` | Structured effect parameters interpreted by the perk handler. |
| `tags` | string[] | Filter/presentation metadata. |
| `stacking` | `"independent"` | How duplicates across party members stack (only `independent` for v1.0). |
| `oncePerCombat` | boolean | Whether the perk consumes itself for the rest of combat. |
| `priority` | `"normal" \| "high"` | Hook ordering hint for conflicting effects. |

## 9. Combat Hook Names

Perks subscribe to a fixed set of combat hooks. The combat engine emits events on these hooks; perk listeners inspect context and apply effects.

```
OnCombatStart
OnCombatEnd

OnTurnStart
OnTurnEnd

BeforeAttack
AfterAttack
OnAttackHit
OnAttackMiss
OnCriticalHit
OnKill

BeforeDamageTaken
AfterDamageTaken
OnAllyWouldDie

OnSpellCast
OnSpellResolve

OnHide
OnDefend
OnRevive
OnHeal

OnStatusApplied
OnStatusRemoved
```

## 10. Data Model / State Changes

### 10.1 Character type

```ts
interface Character {
  // ... existing fields ...
  perkIds: string[]; // chosen perks
}
```

### 10.2 New types

```ts
interface PerkDef {
  id: string;
  class: CharacterClass;
  tier: 1 | 2 | 3 | 4;
  level: number;
  name: string;
  description: string;
  triggers: CombatHook[];
  effect: PerkEffect;
  tags: string[];
  oncePerCombat: boolean;
  priority: "normal" | "high";
}

type CombatHook =
  | "OnCombatStart"
  | "OnCombatEnd"
  | "OnTurnStart"
  | "OnTurnEnd"
  | "BeforeAttack"
  | "AfterAttack"
  | "OnAttackHit"
  | "OnAttackMiss"
  | "OnCriticalHit"
  | "OnKill"
  | "BeforeDamageTaken"
  | "AfterDamageTaken"
  | "OnAllyWouldDie"
  | "OnSpellCast"
  | "OnSpellResolve"
  | "OnHide"
  | "OnDefend"
  | "OnRevive"
  | "OnHeal"
  | "OnStatusApplied"
  | "OnStatusRemoved";
```

### 10.3 Effective stats

```ts
export function effectiveStats(
  character: Character,
  loadout: Loadout,
  perks: PerkDef[]
): Stats;
```

Perks that modify stats contribute a `statModifiers` object; `effectiveStats` sums base + equipment + perk modifiers.

## 11. UI/UX: Perk Selection Overlay

After combat, if any characters reached a perk tier, a modal overlay appears over the dungeon view.

### 11.1 Layout

- Header: `<Character Name> — Level X <Class> — Choose a Tier N Perk`
- Two large cards side-by-side, each showing:
  - Perk name
  - Icon placeholder
  - Description
  - Tag chips (Offense / Defense / Support / Reactive)
- Footer hint: `[←/→] select  [Enter] confirm`

### 11.2 Flow

- Player navigates between the two cards with arrow keys.
- Pressing Enter confirms the choice and advances to the next character in the queue.
- When the queue is empty, the overlay closes and dungeon input resumes.

## 12. Save/Load

- Add `perkIds: string[]` to each saved character (save format v6).
- Migration: older saves load with `perkIds: []`.
- Perks do not permanently alter base stats; `effectiveStats` recomputes them on load.

## 13. Testing Plan

- **Stat refactor:** Unit tests for `effectiveStats` covering base, equipment, racial, and perk modifiers.
- **Combat hooks:** Unit tests for the hook dispatcher and for representative perks (Warmaster, Guardian Angel, Last Stand).
- **Level-up flow:** Test that XP gain after combat triggers level-up, HP/SP restore, and perk queue correctly.
- **Perk data:** Test that every `PerkDef` has required fields and valid hooks.
- **Save/load:** Test migration from v5 to v6 and round-trip persistence.
- **UI:** Test that the overlay renders both choices and stores the selected perk id.

## 14. Open Questions / Balance Notes

- Action-economy perks (Spell Echo, Warmaster, Chain Caster, Riposte, Flurry/Swashbuckler) need close monitoring; a 20% damage perk is usually weaker than an extra action.
- The `+PIE holy damage` perks assume a new damage type or visual flag; if holy damage is not implemented, treat it as untyped bonus damage for v1.0.
- Shop discount from Swindler interacts with the town economy; consider capping discount stacking.
- Some capstones (Shadow, Paladin) may require new status/tracking fields in `CombatState`.

---

**Document status:** v1.0 — Playtest Values. Mechanics are stable; numbers are expected to evolve.

## Implementation status (code vs this doc — 2026-07-13, post combat-depth pass)

| Area | Status |
|------|--------|
| Post-combat level-up + perk queue | **Shipped** (`main.ts` `endCombat`) for dungeon **and** Arena |
| Overlay UI | **Shipped** (`perk-select-ui.ts`); confirm with explicit ←/→ then Enter |
| `effectiveStats` / `perkModifiers` | **Shipped** (now incl. heal power, resurrect %, undead/demon multipliers, flat AC ignore, defend %, status immunity, shop discount) |
| Reactive hooks (`dispatchHook`) | **~19 live** — list at top of `src/game/perks.ts` (added Chain Caster, Perfect Timing, Swashbuckler, Dark Templar; Smoke Bomb is wired directly in `combat.ts` flee resolution) |
| Data stubs | **10 `TODO(v1.1)`** comments in `src/data/perks.ts` — all need genuinely new systems (resistance/reflect/silence immunity/steal economy/party-wide auras); UI copy says so |
| Final balance numbers | **Not done** — sheet % now mostly live, but no balance pass has tuned them |

Authoritative navigation: [`docs/AGENT-READING-LIST.md`](../AGENT-READING-LIST.md).

