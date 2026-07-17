/**
 * Class perk definitions — design doc §7 (v1.0 Playtest Values).
 *
 * Each class offers two mutually exclusive perks at levels 3/6/9/12 (tiers
 * 1-4). Numeric fields on `effect` are read generically by
 * `game/perks.ts`'s `perkModifiers()`; a handful of perks additionally have
 * reactive hook handlers registered in `game/perks.ts` (see the list in that
 * file's header comment). Perks with neither a wired numeric field nor a
 * registered handler are inert placeholders for v1.1 (marked below).
 *
 * All percentages/multipliers here are playtest values, expected to change.
 */

import type { CharacterClass } from "../game/party";
import type { CombatHook, PerkDef, PerkEffect } from "../game/perks";

const TIER_LEVEL: Record<1 | 2 | 3 | 4, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };

function perk(
  id: string,
  cls: CharacterClass,
  tier: 1 | 2 | 3 | 4,
  name: string,
  description: string,
  triggers: CombatHook[],
  effect: PerkEffect,
  tags: string[],
  opts: { oncePerCombat?: boolean; priority?: "normal" | "high" } = {}
): PerkDef {
  return {
    id,
    class: cls,
    tier,
    level: TIER_LEVEL[tier],
    name,
    description,
    triggers,
    effect,
    tags,
    oncePerCombat: opts.oncePerCombat ?? false,
    priority: opts.priority ?? "normal",
  };
}

// ---------------------------------------------------------------------------
// Fighter
// ---------------------------------------------------------------------------

const FIGHTER_PERKS: PerkDef[] = [
  perk(
    "fighter-cleave", "Fighter", 1, "Cleave",
    "25% chance melee attacks also damage an adjacent front-row enemy.",
    ["OnAttackHit"], { chance: 0.25 }, ["offense", "aoe", "melee"]
  ),
  perk(
    "fighter-toughness", "Fighter", 1, "Toughness",
    "+15% max HP.",
    [], { maxHpPercent: 0.15 }, ["defense", "passive"]
  ),
  perk(
    "fighter-protector", "Fighter", 2, "Protector",
    "Allies directly behind you cannot be targeted by single-target melee while you live.",
    ["BeforeAttack"], {}, ["defense", "support", "reactive"]
  ),
  perk(
    "fighter-berserker", "Fighter", 2, "Berserker",
    "+25% melee damage, -15% armor defense.",
    [], { meleeDamageMultiplier: 1.25, damageTakenMultiplier: 1 / 0.85 }, ["offense", "melee"]
  ),
  perk(
    "fighter-vanguard", "Fighter", 3, "Vanguard",
    "You take 10% less physical damage in the front row. (v1.1: extends to front-row allies.)",
    [], { damageTakenMultiplier: 0.9, damageTakenFrontRowOnly: true }, ["defense", "support", "passive"]
  ),
  perk(
    "fighter-last-stand", "Fighter", 3, "Last Stand",
    "First time you drop below 20% HP each combat, counterattack every adjacent enemy.",
    ["AfterDamageTaken"], {}, ["defense", "reactive"], { oncePerCombat: true, priority: "high" }
  ),
  perk(
    "fighter-juggernaut", "Fighter", 4, "Juggernaut",
    "+20% max HP; immune to enemy-inflicted status effects.",
    [], { maxHpPercent: 0.2, statusImmune: true }, ["defense", "passive"]
    // statusImmune is enforced at the enemy status-application sites in
    // combat.ts (abilities and poison-on-hit).
  ),
  perk(
    "fighter-warmaster", "Fighter", 4, "Warmaster",
    "Melee attacks have 35% chance to hit every front-row enemy.",
    ["OnAttackHit"], { chance: 0.35 }, ["offense", "aoe", "melee"]
  ),
];

// ---------------------------------------------------------------------------
// Mage
// ---------------------------------------------------------------------------

const MAGE_PERKS: PerkDef[] = [
  perk(
    "mage-spell-echo", "Mage", 1, "Spell Echo",
    "Every third spell is repeated for free on the same target.",
    ["OnSpellResolve"], {}, ["offense", "reactive"]
  ),
  perk(
    "mage-arcane-focus", "Mage", 1, "Arcane Focus",
    "Spells cost 20% less SP.",
    [], { spCostMultiplier: 0.8 }, ["utility", "passive"]
  ),
  perk(
    "mage-glass-cannon", "Mage", 2, "Glass Cannon",
    "+30% spell damage, -15% max HP.",
    [], { spellDamageMultiplier: 1.3, maxHpPercent: -0.15 }, ["offense", "passive"]
  ),
  perk(
    "mage-mana-shield", "Mage", 2, "Mana Shield",
    "20% of incoming damage is deducted from SP instead of HP. (Not yet implemented — v1.1.)",
    ["BeforeDamageTaken"], {}, ["defense", "reactive"]
    // TODO(v1.1): no registered handler yet.
  ),
  perk(
    "mage-chain-caster", "Mage", 3, "Chain Caster",
    "25% chance a single-target damage spell jumps to a second random target.",
    ["OnSpellResolve"], { chance: 0.25 }, ["offense", "aoe", "reactive"]
  ),
  perk(
    "mage-arcane-surge", "Mage", 3, "Arcane Surge",
    "After spending 50 SP in one combat, next spell is free and deals +50% damage.",
    ["OnSpellCast"], {}, ["offense", "reactive"], { oncePerCombat: true }
  ),
  perk(
    "mage-archmage", "Mage", 4, "Archmage",
    "First 3 spells each combat are free; +20% max SP.",
    ["OnSpellCast"], { maxSpPercent: 0.2 }, ["offense", "reactive"]
  ),
  perk(
    "mage-spellbreaker", "Mage", 4, "Spellbreaker",
    "Spells ignore 50% resistance, cannot be reflected, immune to Silence. (Not yet implemented — v1.1.)",
    [], {}, ["offense", "passive"]
    // TODO(v1.1): no resistance/reflect/silence-immunity system to hook into yet.
  ),
];

// ---------------------------------------------------------------------------
// Priest
// ---------------------------------------------------------------------------

const PRIEST_PERKS: PerkDef[] = [
  perk(
    "priest-healers-touch", "Priest", 1, "Healer's Touch",
    "Healing spells restore 30% more HP.",
    [], { healPowerMultiplier: 1.3 }, ["support", "passive"]
  ),
  perk(
    "priest-divine-hammer", "Priest", 1, "Divine Hammer",
    "Melee attacks deal +PIE holy damage.",
    [], { meleeBonusDamageStat: "pie" }, ["offense", "melee", "passive"]
  ),
  perk(
    "priest-martyr", "Priest", 2, "Martyr",
    "Half of all damage adjacent front-row allies take is redirected to you.",
    ["BeforeDamageTaken"], {}, ["defense", "support", "reactive"]
  ),
  perk(
    "priest-turn-undead", "Priest", 2, "Turn Undead",
    "+50% damage vs undead enemies.",
    [], { undeadDamageMultiplier: 1.5 }, ["offense", "passive"]
  ),
  perk(
    "priest-revival", "Priest", 3, "Revival",
    "Revive spells restore the target to 50% max HP.",
    [], { resurrectHpPercent: 0.5 }, ["support", "passive"]
  ),
  perk(
    "priest-guardian-angel", "Priest", 3, "Guardian Angel",
    "First ally who would die each combat survives at 1 HP.",
    ["OnAllyWouldDie"], {}, ["support", "reactive"],
    { oncePerCombat: true, priority: "high" }
  ),
  perk(
    "priest-saint", "Priest", 4, "Saint",
    "Party regains 5% max HP per round. (Healing KO'd allies as revives is v1.1.)",
    ["OnTurnEnd"], {}, ["support", "passive"]
    // Regen is wired directly in combat.ts endRound (no hook needed).
    // TODO(v1.1): heal-as-revive targeting.
  ),
  perk(
    "priest-inquisitor", "Priest", 4, "Inquisitor",
    "+30% damage vs undead/demons. (35% stun on offensive spells is v1.1.)",
    ["OnSpellResolve"],
    { chance: 0.35, undeadDamageMultiplier: 1.3, demonDamageMultiplier: 1.3 },
    ["offense", "reactive"]
    // TODO(v1.1): the 35% stun-on-spell half has no registered handler yet;
    // the undead/demon damage bonus applies via perkModifiers.
  ),
];

// ---------------------------------------------------------------------------
// Thief
// ---------------------------------------------------------------------------

const THIEF_PERKS: PerkDef[] = [
  perk(
    "thief-ambusher", "Thief", 1, "Ambusher",
    "First attack each combat is always a critical hit.",
    ["BeforeAttack"], {}, ["offense", "reactive"], { oncePerCombat: true }
  ),
  perk(
    "thief-trap-sense", "Thief", 1, "Trap Sense",
    "+20% disarm chance; traps deal -30% damage.",
    [], { trapDisarmBonusPercent: 0.2, trapDamageMultiplier: 0.7 }, ["utility", "passive"]
  ),
  perk(
    "thief-backstab", "Thief", 2, "Backstab",
    "Back-row attacks ignore 25% enemy AC.",
    [], {}, ["offense", "passive"]
    // Wired directly in combat.ts resolveAttack's AC-reduction step.
  ),
  perk(
    "thief-smoke-bomb", "Thief", 2, "Smoke Bomb",
    "Flee always succeeds while the party's HP is below 30% (bosses excepted).",
    [], {}, ["utility", "passive"]
    // Wired directly in combat.ts's flee resolution (smokeBombFleeActive).
  ),
  perk(
    "thief-assassin", "Thief", 3, "Assassin",
    "+25% crit chance vs enemies with status effects.",
    [], {}, ["offense", "passive"]
    // Wired directly in combat.ts resolveAttack's crit step (allowed to
    // exceed the normal 25% crit cap).
  ),
  perk(
    "thief-shadow-dance", "Thief", 3, "Shadow Dance",
    "After using Hide twice in one combat, next Hide attack ignores 50% defense. (Not yet implemented — v1.1.)",
    ["OnHide"], {}, ["offense", "reactive"]
    // TODO(v1.1): no registered handler yet.
  ),
  perk(
    "thief-shadow", "Thief", 4, "Shadow",
    "Permanently hidden at combat start; first attack each round from Hide auto-crits.",
    ["OnCombatStart", "BeforeAttack"], {}, ["offense", "reactive"]
  ),
  perk(
    "thief-swindler", "Thief", 4, "Swindler",
    "Shop buy prices are 20% cheaper. (35% steal-on-attack is v1.1.)",
    ["OnAttackHit"], { chance: 0.35, shopDiscountPercent: 0.2 }, ["offense", "utility"]
    // TODO(v1.1): the steal-on-attack side has no registered handler (no
    // steal economy exists); the shop discount applies via town-ui.ts.
  ),
];

// ---------------------------------------------------------------------------
// Halberdier
// ---------------------------------------------------------------------------

const HALBERDIER_PERKS: PerkDef[] = [
  perk(
    "halberdier-reach-mastery", "Halberdier", 1, "Reach Mastery",
    "Melee attacks ignore 2 points of enemy AC.",
    [], { acFlatIgnore: 2 }, ["offense", "passive"]
  ),
  perk(
    "halberdier-phalanx", "Halberdier", 1, "Phalanx",
    "+15% defense while in front row.",
    [], { damageTakenMultiplier: 0.85, damageTakenFrontRowOnly: true }, ["defense", "passive"]
  ),
  perk(
    "halberdier-impale", "Halberdier", 2, "Impale",
    "25% chance attacks hit both front-row enemies.",
    ["OnAttackHit"], { chance: 0.25 }, ["offense", "aoe"]
  ),
  perk(
    "halberdier-brace", "Halberdier", 2, "Brace",
    "Defending reduces incoming damage by 60% instead of the usual 50%.",
    [], { defendReduction: 0.6 }, ["defense", "passive"]
  ),
  perk(
    "halberdier-sweep", "Halberdier", 3, "Sweep",
    "Your melee attacks have polearm reach: any row from any row, at full damage.",
    [], {}, ["offense", "passive"]
    // Wired: effectiveWeaponRange in combat.ts treats all weapons as medium.
  ),
  perk(
    "halberdier-hold-the-line", "Halberdier", 3, "Hold the Line",
    "When an ally directly behind you is attacked, counter-attack for 50% damage.",
    ["AfterDamageTaken"], {}, ["defense", "reactive"]
  ),
  perk(
    "halberdier-sentinel", "Halberdier", 4, "Sentinel",
    "You take 20% less physical damage in the front row. (v1.1: extends to the whole party.)",
    [], { damageTakenMultiplier: 0.8, damageTakenFrontRowOnly: true }, ["defense", "passive"]
  ),
  perk(
    "halberdier-warlord", "Halberdier", 4, "Warlord",
    "Allies adjacent to you gain +20% damage. (Not yet implemented — v1.1.)",
    [], {}, ["support", "passive"]
    // TODO(v1.1): adjacency-based party buff not wired in yet.
  ),
];

// ---------------------------------------------------------------------------
// Duelist
// ---------------------------------------------------------------------------

const DUELIST_PERKS: PerkDef[] = [
  perk(
    "duelist-precision", "Duelist", 1, "Precision",
    "+12% crit chance.",
    [], { critChanceBonus: 0.12 }, ["offense", "passive"]
  ),
  perk(
    "duelist-parry", "Duelist", 1, "Parry",
    "+10% physical evasion.",
    [], { evasionBonusPercent: 0.1 }, ["defense", "passive"]
  ),
  perk(
    "duelist-riposte", "Duelist", 2, "Riposte",
    "When an enemy misses you, counter-attack for 75% damage.",
    ["OnAttackMiss"], {}, ["defense", "reactive"]
    // Wired directly in combat.ts's enemy-attack evade branch.
  ),
  perk(
    "duelist-perfect-timing", "Duelist", 2, "Perfect Timing",
    "After landing a critical hit, your next attack cannot miss.",
    ["OnCriticalHit", "BeforeAttack"], {}, ["offense", "reactive"]
  ),
  perk(
    "duelist-lunge", "Duelist", 3, "Lunge",
    "Short-range weapons reach any row without penalty.",
    [], {}, ["offense", "passive"]
    // Wired: effectiveWeaponRange in combat.ts treats short weapons as medium.
  ),
  perk(
    "duelist-momentum", "Duelist", 3, "Momentum",
    "Each consecutive hit on the same target grants +5% damage; resets on miss or target switch.",
    ["BeforeAttack", "OnAttackMiss"], {}, ["offense", "reactive"]
  ),
  perk(
    "duelist-blademaster", "Duelist", 4, "Blademaster",
    "Crits deal triple damage; +15% crit chance.",
    [], { critChanceBonus: 0.15, critDamageMultiplier: 3 }, ["offense", "passive"]
  ),
  perk(
    "duelist-swashbuckler", "Duelist", 4, "Swashbuckler",
    "+15% flee/evasion; 40% chance melee attacks strike twice.",
    ["OnAttackHit"], { chance: 0.4, evasionBonusPercent: 0.15, fleeBonusPercent: 0.15 },
    ["offense", "defense"]
  ),
];

// ---------------------------------------------------------------------------
// Crusader
// ---------------------------------------------------------------------------

const CRUSADER_PERKS: PerkDef[] = [
  perk(
    "crusader-smite", "Crusader", 1, "Smite",
    "Melee attacks deal +PIE holy damage.",
    [], { meleeBonusDamageStat: "pie" }, ["offense", "melee", "passive"]
  ),
  perk(
    "crusader-battle-cleric", "Crusader", 1, "Battle Cleric",
    "Healing spells cost 20% less SP.",
    [], { spCostMultiplier: 0.8, spCostAppliesTo: "heal" }, ["support", "passive"]
  ),
  perk(
    "crusader-holy-shield", "Crusader", 2, "Holy Shield",
    "Defending grants +20% defense for 2 rounds. (Not yet implemented — v1.1.)",
    ["OnDefend"], {}, ["defense", "reactive"]
    // TODO(v1.1): no registered handler yet.
  ),
  perk(
    "crusader-zealot", "Crusader", 2, "Zealot",
    "+20% melee damage, -10% max SP.",
    [], { meleeDamageMultiplier: 1.2, maxSpPercent: -0.1 }, ["offense", "passive"]
  ),
  perk(
    "crusader-retribution", "Crusader", 3, "Retribution",
    "When an adjacent ally is attacked, the attacker takes your PIE as holy damage.",
    ["AfterDamageTaken"], {}, ["defense", "reactive"]
  ),
  perk(
    "crusader-judge", "Crusader", 3, "Judge",
    "+35% damage vs undead/demon enemies.",
    [], { undeadDamageMultiplier: 1.35, demonDamageMultiplier: 1.35 },
    ["offense", "passive"]
  ),
  perk(
    "crusader-paladin", "Crusader", 4, "Paladin",
    "Once per combat, survive a lethal blow at 1 HP. (Party-wide 10% damage reduction is v1.1.)",
    ["AfterDamageTaken"], {}, ["defense", "support", "reactive"],
    { oncePerCombat: true, priority: "high" }
  ),
  perk(
    "crusader-dark-templar", "Crusader", 4, "Dark Templar",
    "+25% melee damage; melee hits heal you for 15% of damage dealt. Healing spells cost 30% more SP.",
    ["OnAttackHit"],
    { meleeDamageMultiplier: 1.25, spCostMultiplier: 1.3, spCostAppliesTo: "heal" },
    ["offense", "passive"]
  ),
];

export const ALL_PERKS: PerkDef[] = [
  ...FIGHTER_PERKS,
  ...MAGE_PERKS,
  ...PRIEST_PERKS,
  ...THIEF_PERKS,
  ...HALBERDIER_PERKS,
  ...DUELIST_PERKS,
  ...CRUSADER_PERKS,
];
