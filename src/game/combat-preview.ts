/**
 * Pre-roll action previews for the combat UI (Attack / damage-spell forecasts
 * shown on the targeting line). Read-only over CombatState: they compute
 * knowable pre-roll facts only — no crits, no reactive hooks — so
 * `guaranteedKill` never overclaims.
 */

import type { Character } from "./party";
import { charRow } from "./party";
import type { EnemySpecial } from "../data/enemies";
import type { SpellDef } from "../data/spells";
import { perkModifiers, perksForCharacter } from "./perks";
import { effStatsFor, tagDamageMultiplier, effectiveEnemyAc } from "./combat-shared";
import { canReach, effectiveWeaponRange } from "./combat-reach";
import type { ActionPreview, CombatState, EnemyInstance, WeaponRange } from "./combat-types";

function emptyPreview(flags: Partial<ActionPreview> = {}): ActionPreview {
  return {
    hitChance: 0,
    minDamage: 0,
    maxDamage: 0,
    guaranteedKill: false,
    ...flags,
  };
}

/** Physical damage at a fixed variance factor (0.8–1.2), excluding crits/hooks. */
function previewPhysicalDamageAtVariance(
  s: CombatState,
  actor: Character,
  target: EnemyInstance,
  weaponRange: WeaponRange,
  variance: number
): number {
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const effStats = effStatsFor(s, actor);
  const mods = perkModifiers(perksForCharacter(actor), effStats);
  const weaponBonus = weapon?.attackBonus ?? 0;
  const attackDebuff = s.attackDebuffs[actor.id]?.penalty ?? 0;
  const base = Math.max(1, effStats.str + actor.level + weaponBonus - attackDebuff);
  const isThief = actor.class === "Thief";
  const rowMultiplier =
    charRow(actor) === "back" && weaponRange === "close" && !isThief ? 0.4 : 1;
  let damage =
    Math.max(1, Math.round(base * rowMultiplier * variance * mods.meleeDamageMultiplier)) +
    mods.meleeBonusDamage;

  damage = Math.max(1, Math.round(damage * tagDamageMultiplier(mods, target)));

  const acIgnoreFactor =
    charRow(actor) === "back" && perksForCharacter(actor).some((p) => p.id === "thief-backstab")
      ? 0.75
      : 1;
  const flooredAc = Math.min(effectiveEnemyAc(s, target), Math.floor(damage / 2));
  const acReduction = Math.max(0, Math.round((flooredAc - mods.acFlatIgnore) * acIgnoreFactor));
  damage = Math.max(1, damage - acReduction);

  if (target.special.some((sp) => sp.kind === "highDefense")) {
    damage = Math.max(1, Math.round(damage * 0.5));
  }
  const resist = target.special.find(
    (sp): sp is Extract<EnemySpecial, { kind: "resistPhysical" }> => sp.kind === "resistPhysical"
  );
  if (resist) {
    damage = Math.max(1, Math.round(damage * (1 - resist.percent / 100)));
  }
  return damage;
}

/** Forecast a basic Attack against one enemy (knowable pre-roll facts only). */
export function previewAttack(
  s: CombatState,
  actor: Character,
  target: EnemyInstance
): ActionPreview {
  const loadout = s.loadout[actor.id];
  const weapon = loadout?.weapon;
  const weaponRange: WeaponRange = effectiveWeaponRange(actor, weapon?.range ?? "close");

  if (!canReach(actor.formationSlot, weaponRange, target.row)) {
    return emptyPreview({ unreachable: true });
  }

  const nextBonus = s.nextAttackBonuses[actor.id];
  const forcedHit = nextBonus?.hitChance !== undefined && nextBonus.hitChance >= 1;

  let hitChance = 1;
  if (!forcedHit) {
    if (target.special.some((sp) => sp.kind === "evasive")) hitChance *= 0.8;
    if (target.special.some((sp) => sp.kind === "flying") && weaponRange === "close") {
      hitChance *= 0.85;
    }
    if (actor.status.includes("blind")) hitChance *= 0.5;
  }

  const minDamage = previewPhysicalDamageAtVariance(s, actor, target, weaponRange, 0.8);
  const maxDamage = previewPhysicalDamageAtVariance(s, actor, target, weaponRange, 1.2);
  const guaranteedKill = hitChance >= 1 && minDamage >= target.currentHp;
  return { hitChance, minDamage, maxDamage, guaranteedKill };
}

/** Forecast a single-target damage spell (no crits; fizzle odds in hitChance). */
export function previewSpellDamage(
  s: CombatState,
  caster: Character,
  spell: SpellDef,
  target: EnemyInstance
): ActionPreview {
  if (spell.effect.kind !== "damage") {
    return emptyPreview({ noEffect: true });
  }
  const eff = spell.effect;

  if (s.inAntimagic) {
    return emptyPreview();
  }

  let hitChance = 1;
  if (s.partyFizzleField > 0) {
    const fizzleChance = s.partyFizzleField / (s.partyFizzleField + caster.level);
    hitChance = Math.max(0, 1 - fizzleChance);
  }

  if (eff.element === "undead" && !target.special.some((sp) => sp.kind === "undead")) {
    return emptyPreview({ noEffect: true, hitChance });
  }

  const effStats = effStatsFor(s, caster);
  const castingStat =
    caster.class === "Mage"
      ? effStats.int
      : caster.class === "Priest" || caster.class === "Crusader"
        ? effStats.pie
        : 0;
  const castingBonus = Math.floor(castingStat / 4);
  const casterMods = perkModifiers(perksForCharacter(caster), effStats);
  const spellMult = casterMods.spellDamageMultiplier;
  const tagMult = tagDamageMultiplier(casterMods, target);
  const powerMultiplier = 1; // Arcane Surge not simulated (reactive)
  const raw = Math.max(
    1,
    Math.round((eff.power + castingBonus) * powerMultiplier * spellMult * tagMult)
  );
  let final = Math.max(1, raw - Math.floor(target.ac / 2));
  if (eff.element) {
    const affinity = target.special.find(
      (sp) =>
        (sp.kind === "resistElement" || sp.kind === "weakElement") && sp.element === eff.element
    );
    if (affinity) {
      const isResist = affinity.kind !== "weakElement";
      const hasSpellbreaker =
        isResist && perksForCharacter(caster).some((p) => p.id === "mage-spellbreaker");
      const affinityMult = isResist ? (hasSpellbreaker ? 0.75 : 0.5) : 1.5;
      final = Math.max(1, Math.round(final * affinityMult));
    }
  }
  if (s.enemyMagicScreens[target.row] > 0) {
    final = Math.max(1, Math.round(final * 0.5));
  }

  const guaranteedKill = hitChance >= 1 && final >= target.currentHp;
  return { hitChance, minDamage: final, maxDamage: final, guaranteedKill };
}
