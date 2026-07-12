# Melee Class Techniques & Rage System — Design Spec v1.0

## 1. Overview

Melee classes (Fighter, Thief, Halberdier, Duelist, Crusader) currently have no
active combat abilities — their only options are Attack, Defend, Item, and Run.
All of their "depth" comes from passive perks chosen at levels 3/6/9/12, which
fire automatically with no player input. This makes melee turns mechanically
identical regardless of class.

This spec adds a **Rage** resource system and **Technique** active abilities
that give each melee class a distinct combat identity and real tactical
choices on every turn.

> **v1.0 – Playtest Values:** All rage costs, damage multipliers, proc chances,
> and level thresholds are starting points. Expect tuning after playtesting.

## 2. Goals

- Every melee class has active abilities the player chooses each turn.
- Each class's abilities feel mechanically distinct — not just "damage with
  different flavor text."
- Abilities have trade-offs (damage vs. defense, single-target vs. AoE, raw
  power vs. status effects) so the optimal choice varies by situation.
- The Rage resource creates a pacing layer: you can't spam the best ability
  every turn, so you must choose when to go big and when to build up.
- Casters (Mage, Priest) keep their SP-based spell system unchanged. Crusader
  gets both Rage techniques AND Priest spells — they are the hybrid class.
- The perk system remains separate and passive. Perks modify how techniques
  work (e.g., a perk could reduce technique rage cost or boost technique
  damage); they don't replace techniques.

## 3. Non-Goals

- Replacing the perk system — perks stay passive/reactive.
- Giving Mage or Priest rage-based techniques — they have spells.
- Adding a talent tree or ability choice system — techniques are learned
  automatically at level thresholds, same as spell tier access.
- Final balance tuning — numbers are playtest placeholders.
- Rage persisting between combats — it resets every fight.

## 4. Rage resource system

### 4.1 The Rage pool

Each melee character has a **Rage** value tracked in combat state:

```ts
// On CombatState (combat-only, not persisted on Character):
rageByCharacterId: Record<string, number>;
```

- **Max rage** = `10 + level` (level 1 = 11 max, level 12 = 22 max)
- **Rage starts at 0** at the beginning of each combat.
- Rage is **not persisted** — it resets to 0 when combat ends. No save
  migration needed.
- Crusader tracks rage separately from SP. They can use both resources in
  the same combat (rage for techniques, SP for spells).

### 4.2 Gaining rage

| Trigger | Rage gained |
|---------|-------------|
| Making any attack (hit or miss) | +2 |
| Taking damage from any source | +1 |
| Being attacked but the attack misses (dodge/evade) | +1 |
| An adjacent ally takes damage | +1 (Halberdier and Fighter only — their "protector" identity) |
| Defending | 0 (defending is the "reset" — see below) |

Rage is capped at `maxRage`. Overflow is discarded.

### 4.3 Losing rage

| Trigger | Rage lost |
|---------|-----------|
| Spending it on a technique | Technique's rage cost |
| Defending | All rage (defending = calming down, resetting) |
| Combat ends | All rage (reset for next fight) |

> **Design intent:** Defending is the "I need to survive" option, and it
> costs you your built-up rage. This creates a tension: do you defend to
> survive a big hit, or do you keep your rage and eat the damage so you can
> unleash a technique next turn?

### 4.4 Rage display

The party status window (right window in the FF6 combat layout) shows each
character's rage as a small bar or number below their HP/SP line. Format:

```
Aria   45/52 HP  11/12 RG
Bram   38/48 HP   8/12 RG
```

For casters (Mage, Priest), the rage line is omitted — they don't have rage.

## 5. Technique system

### 5.1 TechniqueDef

A new data type in `src/data/techniques.ts`, parallel to `SpellDef`:

```ts
export type TechniqueTarget =
  | "self"
  | "singleEnemy"
  | "singleAlly"
  | "rowEnemies"    // all enemies in one row (front or back — player picks)
  | "allFrontEnemies"
  | "allEnemies"
  | "allAllies";

export type TechniqueEffect =
  | { kind: "damage"; multiplier: number; armorPen?: number; element?: DamageElement }
  | { kind: "multiHit"; hits: number; multiplier: number; randomTarget?: boolean }
  | { kind: "damageWithStatus"; multiplier: number; status: "paralysis" | "poison" | "slow"; statusChance: number; statusDuration?: number }
  | { kind: "damageWithExecute"; multiplier: number; executeThreshold: number }  // kill if HP < threshold%
  | { kind: "buff"; stat: "armor" | "str" | "agi"; power: number; duration: number; target: "self" | "allAllies" | "allFrontAllies" }
  | { kind: "debuff"; stat: "armor" | "agi"; power: number; duration: number; target: "singleEnemy" | "allEnemies" }
  | { kind: "heal"; power: number }  // Crusader's Lay on Hands
  | { kind: "counterStance"; multiplier: number }  // next attack against you triggers counter
  | { kind: "taunt"; armorBonus: number; duration: number }  // force targeting + buff
  | { kind: "buffNextAttack"; critChanceBonus: number; hitChanceBonus?: number; duration: number }  // Feint, etc.
  | { kind: "rageGrant"; amount: number }  // Battle Cry — give rage to allies
  | { kind: "damageBuff"; multiplier: number; duration: number; target: "self" | "allAllies" };  // Battle Cry damage buff

export interface TechniqueDef {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;       // level at which the technique is learned
  rageCost: number;
  target: TechniqueTarget;
  effect: TechniqueEffect;
  description: string;
}
```

### 5.2 Learning techniques

Techniques are **learned automatically** when a character reaches the required
level. No choice point — unlike perks, every character of a class gets the same
techniques. This keeps the system simple and avoids another UI overlay.

A character's available techniques = all techniques for their class where
`level <= character.level`.

### 5.3 The Technique menu option

The combat menu for melee classes gains a new entry:

| Class | Menu options |
|-------|-------------|
| Fighter | Attack · **Technique** · Defend · Item · Run |
| Thief | Attack · **Technique** · Hide/Ambush · Defend · Item · Run |
| Halberdier | Attack · **Technique** · Defend · Item · Run |
| Duelist | Attack · **Technique** · Defend · Item · Run |
| Crusader | Attack · **Technique** · Magic · Defend · Item · Run |
| Mage | Attack · Magic · Defend · Item · Run (unchanged) |
| Priest | Attack · Magic · Defend · Item · Run (unchanged) |

Selecting "Technique" opens a sub-list (same UI pattern as the Magic spell
list) showing all known techniques with their rage cost. Unaffordable
techniques (rage cost > current rage) are greyed out. A detail panel shows
the highlighted technique's effect and description.

### 5.4 Technique resolution

Techniques resolve through a new `resolveTechnique()` function in `combat.ts`,
parallel to `resolveCast()`. The function:

1. Checks rage cost (should already be validated by the UI, but double-check).
2. Deducts rage from the character.
3. Resolves the technique effect based on its `kind`.
4. Emits `CombatEvent`s for the scene renderer (attack animation, damage
   popups, status effect VFX).
5. Dispatches perk hooks (`OnAttackHit`, `OnAttackMiss`, etc.) so perks like
   Cleave and Warmaster can interact with technique attacks.

Most technique effects reuse existing combat mechanics:
- **damage**: Calls `resolveAttack` with a damage multiplier parameter.
- **multiHit**: Calls `resolveAttack` N times, each at the multiplier.
- **damageWithStatus**: Calls `resolveAttack`, then rolls `statusChance` and
  applies the status if successful.
- **damageWithExecute**: Calls `resolveAttack`, then checks if target HP %
  is below `executeThreshold`; if so, set HP to 0.
- **buff/debuff**: Applies a temporary stat modifier (same system as spell
  buffs from Phase 2 of the spell expansion).
- **heal**: Heals the target (same math as spell heals, but using STR+PIE
  instead of INT/PIE for Crusader's Lay on Hands).
- **counterStance**: Sets a flag on the character (`counterStance: { multiplier }`)
  in combat state. When the character is attacked, the counter triggers and
  the flag is cleared.
- **taunt**: Sets a flag (`taunting: true`) on the character + applies an
  armor buff. Enemy AI checks for taunting characters and prioritizes them.
- **buffNextAttack**: Sets a flag (`nextAttackBonus: { critChance, hitChance }`)
  that modifies the next `resolveAttack` call, then is consumed.
- **rageGrant**: Adds rage to all allies.
- **damageBuff**: Applies a temporary damage multiplier buff to the party.

### 5.5 Technique VFX

Techniques use the same VFX system as spells. Each technique gets an entry in
the `SPELL_OVERRIDES` map (or a new `TECHNIQUE_OVERRIDES` map) in
`combat-scene.ts` to define its visual style. Melee techniques generally use
weapon-attack VFX (slash, impact) rather than spell VFX (fireball, ice burst).

## 6. Class technique rosters

### 6.1 Fighter — "War Techniques"

**Identity:** The Fighter is the frontline tank-brute. Their techniques focus
on raw damage output, drawing enemy attacks, and controlling the front row.
They hit hard, they take hits, and they protect the party by being the biggest
threat on the battlefield.

| Ability | Rage | Lvl | Target | Effect | Description |
|---------|------|-----|--------|--------|-------------|
| **Power Attack** | 5 | 1 | Single enemy | 2x weapon damage | A devastating overhead blow that sacrifices finesse for raw power. |
| **Shield Bash** | 8 | 3 | Single enemy | 1x damage + 25% paralysis (1 round) | Slam the shield into a foe, potentially stunning them senseless. |
| **Taunt** | 3 | 5 | Self | Force enemies to target you next round + +3 armor (2 rounds) | Draw the enemy's attention with a battle challenge. |
| **Whirlwind** | 15 | 7 | All front-row enemies | 1.5x damage to each | A spinning strike that hits every adjacent foe. |
| **Crushing Blow** | 20 | 10 | Single enemy | 3x damage, ignores 50% AC | A massive overhead strike that shatters armor and bone alike. |
| **Battle Cry** | 25 | 12 | All allies | +3 rage to all allies, +10% damage buff (2 rounds) | A rallying shout that fills allies with fury. |

**Unique mechanics:** Taunt (enemy targeting override), Battle Cry (rage
granting — the only ability that gives rage to other party members).

### 6.2 Thief — "Shadow Arts"

**Identity:** The Thief is the opportunistic striker. Their techniques focus on
critical hits, status effects, and exploiting weakened enemies. They don't hit
as hard as the Fighter, but they hit where it hurts most — and they set up
enemies for devastating follow-up attacks.

| Ability | Rage | Lvl | Target | Effect | Description |
|---------|------|-----|--------|--------|-------------|
| **Quick Slash** | 3 | 1 | Single enemy | 1.5x damage, +10% crit chance | A fast cut that finds the gap in a foe's guard. |
| **Feint** | 5 | 3 | Self | Next attack auto-hits + +25% crit chance (1 round) | Fake out the enemy, leaving them open to a devastating follow-up. |
| **Poison Blade** | 8 | 5 | Single enemy | 1x damage + inflicts poison (3/round x3) | Coat the blade with venom before striking. |
| **Caltrops** | 12 | 7 | All enemies | 1x damage + 15% slow (-AGI, 2 rounds) | Scatter spikes beneath the enemy formation. |
| **Throat Slash** | 20 | 10 | Single enemy | 3x damage vs enemies < 30% HP (execute) | Finish a wounded foe before they can recover. |
| **Shadow Strike** | 25 | 12 | Single enemy | Auto-crit from hidden, 2x crit multiplier, ignores all AC | The ultimate backstab — only usable from Hide. |

**Unique mechanics:** Feint (buff-next-attack with guaranteed hit + crit),
Throat Slash (execute threshold), Shadow Strike (conditional on hidden status,
requires Hide/Ambush setup).

### 6.3 Halberdier — "Polearm Techniques"

**Identity:** The Halberdier is the reach specialist and formation controller.
Their techniques exploit polearm range to hit enemies other melee classes
can't reach, and they manipulate the formation — both the enemy's and the
party's. They are the defensive counterpart to the Fighter's offensive role.

| Ability | Rage | Lvl | Target | Effect | Description |
|---------|------|-----|--------|--------|-------------|
| **Sweep** | 5 | 1 | One enemy row (player picks) | 1x damage to all enemies in that row | A wide arc with the polearm that clears a row. |
| **Brace** | 3 | 3 | Self | Counter stance: next melee hit against you is reflected at 50% damage | Plant the haft and prepare to receive a charge. |
| **Impale** | 10 | 5 | Single enemy column | 2x damage to front and back row enemy in the same column | Drive the spear through two enemies at once. |
| **Pike Wall** | 15 | 7 | All front-row allies | +2 armor buff (2 rounds) | Form a defensive spear line that turns aside attacks. |
| **Pole Vault** | 20 | 10 | Single enemy (any row) | 2.5x damage, ignores all range penalties | Leap over the front line to strike a distant foe. |
| **Phalanx Break** | 25 | 12 | One enemy row (player picks) | 3x damage to all enemies in that row + 25% paralysis (1 round) | Shatter the enemy formation with overwhelming force. |

**Unique mechanics:** Sweep and Phalanx Break (row-targeting — player picks
which row), Brace (counter stance that reflects melee damage), Impale (column
targeting — hits both rows in one column), Pike Wall (buffs other front-row
allies, not self).

### 6.4 Duelist — "Blade Forms"

**Identity:** The Duelist is the precision fighter. Their techniques focus on
multi-hit combos, critical hits, and evasive counter-attacks. They are the
highest-skill melee class — their abilities reward setup (Feint → Flurry →
Perfect Strike) and punish enemies who attack them.

| Ability | Rage | Lvl | Target | Effect | Description |
|---------|------|-----|--------|--------|-------------|
| **Lunge** | 3 | 1 | Single enemy (any row) | 1.5x damage, reaches any row, +15% hit chance | A quick forward thrust that closes distance instantly. |
| **Riposte** | 5 | 3 | Self | Counter stance: next enemy attack triggers a free 1.5x counter | Ready the blade to punish any who dare attack. |
| **Flurry** | 10 | 5 | Single enemy | 3 hits at 0.75x damage each (2.25x total) | A barrage of rapid strikes that overwhelms defenses. |
| **Disarm** | 12 | 7 | Single enemy | 0.5x damage + enemy loses 2 AC (3 rounds) | Strike the enemy's weapon arm, leaving them vulnerable. |
| **Perfect Strike** | 20 | 10 | Single enemy | Auto-crit, 2.5x crit multiplier, ignores AC | The duelist's masterstroke — a single flawless blow. |
| **Blade Storm** | 25 | 12 | Random enemies | 5 hits at 1x damage each, each hit +5% crit (cumulative) | A whirlwind of steel that strikes everything nearby. |

**Unique mechanics:** Flurry (multi-hit on single target), Riposte (counter
stance that triggers on being attacked, not on being hit — punishes attackers
even if they miss), Disarm (AC debuff — the only technique that reduces enemy
armor), Blade Storm (multi-hit on random targets with escalating crit chance).

### 6.5 Crusader — "Holy Techniques"

**Identity:** The Crusader is the holy warrior — a hybrid who channels divine
power through their blade. Their techniques blend melee damage with healing
and anti-undead power. They have fewer raw damage techniques than the Fighter,
but their utility (healing, buffing, undead-slaying) makes them the most
versatile melee class. They also have access to Priest spells via SP, making
them the only class that manages two resources.

| Ability | Rage | Lvl | Target | Effect | Description |
|---------|------|-----|--------|--------|-------------|
| **Smite** | 3 | 1 | Single enemy | 1.5x damage + PIE holy bonus damage | Channel divine power into the blade. |
| **Lay on Hands** | 5 | 3 | Single ally | Heal for (STR + PIE) × 2 HP | Touch an ally to mend their wounds with holy power. |
| **Judgment** | 10 | 5 | Single enemy | 2x divine damage, +50% vs undead | Divine wrath made manifest in steel. |
| **Aura of Protection** | 15 | 7 | All allies | +2 armor buff (2 rounds) | Project a shield of faith over the entire party. |
| **Banishing Strike** | 20 | 10 | Single enemy | 2x damage + if undead and < 25% HP, instant kill | Send the undead to their final rest. |
| **Divine Wrath** | 25 | 12 | All enemies | 2x divine damage + 25% paralysis (1 round) | Heaven's fury unleashed upon the wicked. |

**Unique mechanics:** Lay on Hands (rage-cost heal — the only technique that
heals, and it uses STR+PIE instead of INT/PIE), Judgment (divine element
damage — general-purpose, not undead-only, but +50% vs undead), Banishing
Strike (conditional instant kill vs undead), Divine Wrath (AoE divine damage +
stun). The Crusader's dual-resource nature (rage + SP) means they must choose
each turn: spend rage on a technique, or spend SP on a Priest spell.

## 7. Class identity summary

| Class | Core mechanic | Playstyle | Unique to this class |
|-------|--------------|-----------|---------------------|
| **Fighter** | Raw damage + aggro control | Hit hard, take hits, protect the party by being the biggest threat | Taunt (force targeting), Battle Cry (grant rage to allies), Whirlwind (AoE front row) |
| **Thief** | Crits + status + execute | Set up with Feint/Hide, then unleash devastating crits and executes | Feint (guaranteed next-hit crit), Throat Slash (execute), Shadow Strike (requires hidden), Poison Blade (DoT from melee) |
| **Halberdier** | Reach + formation control | Hit enemies nobody else can reach; defend the front line | Sweep/Phalanx Break (row-targeted AoE), Brace (damage reflection), Impale (column hit), Pike Wall (buff allies) |
| **Duelist** | Multi-hit + counter | Build combos, punish attackers, stack crits for massive single hits | Flurry (multi-hit single target), Riposte (counter on being attacked), Disarm (AC debuff), Blade Storm (escalating crit multi-hit) |
| **Crusader** | Hybrid melee + divine | Choose between rage techniques and SP spells each turn; heal, buff, and smite | Lay on Hands (rage-cost heal), Judgment (divine damage), Banishing Strike (undead execute), dual-resource management |

## 8. Perk interactions

Perks remain passive and can modify how techniques work. Examples:

| Perk | Interaction with techniques |
|------|---------------------------|
| Fighter-Cleave (25% chance attack hits adjacent enemy) | Also triggers on technique attacks — Power Attack can cleave |
| Fighter-Berserker (+25% melee damage) | Boosts technique damage too |
| Fighter-Warmaster (35% chance attack hits all front-row) | Can trigger on technique attacks |
| Thief-Assassin (+25% crit vs status-affected enemies) | Boosts technique crits vs poisoned/slowed enemies |
| Thief-Shadow (auto-hidden at combat start) | Enables Shadow Strike on turn 1 |
| Halberdier-Reach Mastery (ignore 2 AC) | Stacks with technique armor pen |
| Duelist-Blademaster (crits deal triple damage) | Makes Perfect Strike and Blade Storm terrifying |
| Duelist-Momentum (+5% per consecutive hit) | Flurry and Blade Storm build momentum fast |
| Crusader-Smite (+PIE holy damage on melee) | Stacks with the Smite technique's holy bonus |
| Crusader-Zealot (+20% melee damage) | Boosts technique damage |

This interaction is automatic — perks already hook into `OnAttackHit`,
`BeforeAttack`, etc. As long as `resolveTechnique` dispatches the same hooks
as `resolveAttack`, existing perks work without changes.

## 9. Enemy rage

Enemies do NOT have rage or techniques. This is a player-only system. Enemy
tactical variety comes from their existing special abilities (healer, caster,
flying, evasive, slowGroup, resistPhysical, etc.) and the AI's targeting
logic.

> **Future consideration:** If we want boss enemies to have techniques, we can
> extend the system later. But for v1, keeping it player-only simplifies
> implementation and AI.

## 10. Data structure

### 10.1 `src/data/techniques.ts`

```ts
export const FIGHTER_TECHNIQUES: TechniqueDef[] = [ /* 6 entries */ ];
export const THIEF_TECHNIQUES: TechniqueDef[] = [ /* 6 entries */ ];
export const HALBERDIER_TECHNIQUES: TechniqueDef[] = [ /* 6 entries */ ];
export const DUELIST_TECHNIQUES: TechniqueDef[] = [ /* 6 entries */ ];
export const CRUSADER_TECHNIQUES: TechniqueDef[] = [ /* 6 entries */ ];

export const ALL_TECHNIQUES: TechniqueDef[] = [
  ...FIGHTER_TECHNIQUES,
  ...THIEF_TECHNIQUES,
  ...HALBERDIER_TECHNIQUES,
  ...DUELIST_TECHNIQUES,
  ...CRUSADER_TECHNIQUES,
];

export function techniquesForClass(cls: CharacterClass, level: number): TechniqueDef[] {
  return ALL_TECHNIQUES.filter((t) => t.class === cls && t.level <= level);
}

export function techniqueById(id: string): TechniqueDef | undefined {
  return ALL_TECHNIQUES.find((t) => t.id === id);
}
```

### 10.2 Combat state additions

```ts
// On CombatState:
rageByCharacterId: Record<string, number>;
// Counter/stance flags:
counterStances: Record<string, { multiplier: number }>;  // by character id
tauntingIds: string[];  // characters currently taunting
nextAttackBonuses: Record<string, { critChance: number; hitChance?: number }>;
```

These are combat-only — not persisted, not on `Character`. Reset each combat.

### 10.3 PlayerAction addition

```ts
| { kind: "technique"; actorId: string; techniqueId: string; targetInstanceId?: string; targetAllyId?: string; targetRow?: Row }
```

## 11. UI changes

### 11.1 Party status window

Add rage display for melee classes. Format options:

**Option A (compact):** Add rage to the existing HP/SP line:
```
Aria  Fighter  45/52  RG 11/12
```

**Option B (bar):** Small rage bar below the HP line, colored red/orange.

Recommended: Option A for simplicity, matching the existing text-based layout.

### 11.2 Technique menu

When "Technique" is selected, the middle window (normally enemy names) is
replaced by the technique list, same pattern as the Magic spell list:

```
Power Attack      5 RG
Shield Bash       8 RG
Taunt             3 RG
Whirlwind        15 RG  (greyed out if rage < 15)
Crushing Blow    20 RG  (greyed out)
Battle Cry       25 RG  (greyed out)
```

The spell detail panel pattern is reused: hovering a technique shows its
effect summary and description in the same panel location.

### 11.3 Target selection

After selecting a technique, target selection works the same as spell target
selection:
- `singleEnemy` → enemy list with cursor
- `singleAlly` → ally list (for Lay on Hands)
- `rowEnemies` → row selection (front/back), same as Web spell
- `allEnemies` / `allAllies` / `allFrontEnemies` → no target selection, resolves immediately
- `self` → no target selection

## 12. Combat event types

New `CombatEvent` variants for technique resolution:

```ts
| { type: "technique"; actorId: string; techniqueId: string; targetId?: string }
| { type: "techniqueHit"; actorId: string; techniqueId: string; targetId: string; damage: number; crit: boolean }
| { type: "techniqueMiss"; actorId: string; techniqueId: string; targetId: string }
| { type: "techniqueStatus"; actorId: string; techniqueId: string; targetId: string; statusInflicted: string }
```

The combat scene renderer handles these the same way as cast/spellEffect
events — walk animation, attack sprite, damage popup, status VFX.

## 13. Save migration

**No save migration needed.** Techniques are learned by level, not stored on
the character. Rage is combat-only and never persisted. The only new state
is on `CombatState`, which is never saved (combat saves convert to dungeon
mode on load).

## 14. Implementation plan

### Phase 1: Core rage system + Technique action type
1. Add `rageByCharacterId` to `CombatState`, initialize to 0.
2. Add rage gain hooks in `resolveAttack` (+2 on attack), damage-taken path
   (+1 on hit), and evade path (+1 on miss).
3. Add rage reset on defend (lose all rage) and combat end.
4. Add `maxRage(character)` helper: `10 + character.level`.
5. Add `TechniqueDef` type and `src/data/techniques.ts` with all 30 techniques.
6. Add `{ kind: "technique" }` to `PlayerAction`.
7. Add `resolveTechnique()` in `combat.ts`.
8. Add "Technique" to `menuEntriesForCharacter()` for melee classes.
9. Add technique selection sub-menu in `combat-ui.ts` (reuse spell selection pattern).
10. Add rage display to party status window.
11. Add technique detail panel (reuse spell detail panel pattern).

### Phase 2: Technique effects
1. Implement `damage` effect (multiplier on resolveAttack).
2. Implement `multiHit` effect (N resolveAttack calls).
3. Implement `damageWithStatus` (attack + status roll).
4. Implement `buff` / `debuff` (stat modifiers — depends on Phase 2 of spell
   expansion for the buff/debuff tracking system).
5. Implement `counterStance` (flag + check in enemy attack resolution).
6. Implement `taunt` (flag + enemy AI targeting override).
7. Implement `buffNextAttack` (flag + check in resolveAttack).
8. Implement `rageGrant` (add rage to allies).
9. Implement `damageBuff` (temporary multiplier on party damage).
10. Implement `heal` (Crusader's Lay on Hands).
11. Implement `damageWithExecute` (attack + conditional kill).

### Phase 3: UI polish & VFX
1. Add technique VFX overrides in `combat-scene.ts`.
2. Add technique-specific combat events for the renderer.
3. Add rage bar visual (if using Option B).
4. Add technique description text for all 30 abilities.
5. Grey out unaffordable techniques in the selection list.

### Phase 4: Testing
1. Test rage gain/loss for each trigger.
2. Test rage cap (can't exceed maxRage).
3. Test rage reset on defend and combat end.
4. Test each technique effect for correct damage/status/buff.
5. Test multi-hit (Flurry, Blade Storm) — each hit resolves separately.
6. Test counter stance (Brace, Riposte) — triggers on next attack, then clears.
7. Test taunt (enemy AI targets taunting character).
8. Test execute (Throat Slash, Banishing Strike) — kills at threshold, doesn't kill above.
9. Test technique-perk interactions (Cleave on Power Attack, etc.).
10. Test Crusader dual-resource (can cast spells AND use techniques in same combat).

## 15. Technique count summary

| Class | Techniques | Levels learned |
|-------|-----------|----------------|
| Fighter | 6 | 1, 3, 5, 7, 10, 12 |
| Thief | 6 | 1, 3, 5, 7, 10, 12 |
| Halberdier | 6 | 1, 3, 5, 7, 10, 12 |
| Duelist | 6 | 1, 3, 5, 7, 10, 12 |
| Crusader | 6 | 1, 3, 5, 7, 10, 12 |
| **Total** | **30** | |

Combined with the spell expansion (34 spells after Phase 1), the game will
have 64 active abilities across all classes.
