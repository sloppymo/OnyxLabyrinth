/**
 * Spell application: the effect-kind dispatcher behind Cast (and consumable
 * items that reuse spell effects), plus target resolution for offensive and
 * supportive spells. Covers damage (with elemental affinity + screens),
 * heal/regen, disable, cure, buff, resurrect, magic screens, fizzle fields,
 * dispel, and summons. Operates on the already-cloned CombatState.
 */

import type { Character } from "./party";
import { charRow } from "./party";
import type { SpellDef } from "../data/spells";
import { perkModifiers, perksForCharacter } from "./perks";
import {
  effStatsFor,
  tagDamageMultiplier,
  warlordDamageMultiplier,
  wakeOnDamage,
  applyDisableToEnemy,
  observeAffinity,
  findEnemy,
} from "./combat-shared";
import type {
  CombatEvent,
  CombatState,
  EnemyInstance,
  PlayerAction,
  Rng,
  SummonedAlly,
} from "./combat-types";

export function applySpell(
  s: CombatState,
  caster: Character,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>,
  rng: Rng,
  log: (m: string) => void,
  emit: (m: string, e: CombatEvent) => void,
  powerMultiplier = 1
): void {
  const eff = spell.effect;
  const effStats = effStatsFor(s, caster);
  const castingStat =
    caster.class === "Mage"
      ? effStats.int
      : caster.class === "Priest" || caster.class === "Crusader"
      ? effStats.pie
      : 0;
  const castingBonus = Math.floor(castingStat / 4);

  switch (eff.kind) {
    case "damage": {
      // Perk spell-damage multiplier (Glass Cannon +30%).
      const casterMods = perkModifiers(perksForCharacter(caster), effStats);
      const spellMult = casterMods.spellDamageMultiplier;
      // halberdier-warlord: +20% damage while adjacent to a living Warlord
      // holder — applies to spell damage too, not just melee.
      const warlordMult = warlordDamageMultiplier(s, caster);
      for (const t of spellTargets(s, spell, action)) {
        // "undead" element only damages undead enemies (Sacred Flame, Sunburst).
        if (eff.element === "undead" && !t.special.some((sp) => sp.kind === "undead")) {
          emit(
            `${spell.name} has no effect on ${t.name} — not undead.`,
            {
              type: "spellEffect",
              spellId: spell.id,
              targetId: t.instanceId,
              statusInflicted: "no effect",
            }
          );
          continue;
        }
        // Undead / demon damage bonuses (Turn Undead, Judge, Inquisitor).
        const tagMult = tagDamageMultiplier(casterMods, t);
        const raw = Math.max(
          1,
          Math.round((eff.power + castingBonus) * powerMultiplier * spellMult * tagMult * warlordMult)
        );
        // Enemy AC reduces spell damage too (less than physical — half AC).
        const reduced = Math.max(1, raw - Math.floor(t.ac / 2));
        // Elemental affinity: resist (x0.5) / weak (x1.5) based on the target's special.
        // mage-spellbreaker: spells ignore half of the resistance penalty
        // (x0.5 -> x0.75); weakness bonuses are untouched.
        let final = reduced;
        if (eff.element) {
          const affinity = t.special.find(
            (sp) => (sp.kind === "resistElement" || sp.kind === "weakElement") && sp.element === eff.element
          );
          if (affinity) {
            const isResist = affinity.kind !== "weakElement";
            const hasSpellbreaker =
              isResist && perksForCharacter(caster).some((p) => p.id === "mage-spellbreaker");
            const affinityMult = isResist ? (hasSpellbreaker ? 0.75 : 0.5) : 1.5;
            final = Math.max(1, Math.round(reduced * affinityMult));
            observeAffinity(s, t, affinity.kind === "weakElement" ? "weak" : "resist", eff.element, log, emit);
          }
        }
        if (s.enemyMagicScreens[t.row] > 0) {
          final = Math.max(1, Math.round(final * 0.5));
        }
        t.currentHp -= final;
        emit(
          `${spell.name} hits ${t.name} for ${final} damage.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, damage: final }
        );
        wakeOnDamage(t, log);
        // Over-time followup (e.g. Meteor Swarm burn): recorded per enemy
        // instance and ticked at the end of each round.
        if (eff.followup?.kind === "dot" && t.currentHp > 0) {
          const dots = (s.enemyDots[t.instanceId] ??= []);
          const existing = dots.find((d) => d.spellId === spell.id);
          if (existing) {
            existing.duration = eff.followup.duration;
            existing.power = eff.followup.power;
          } else {
            dots.push({
              element: eff.followup.element,
              power: eff.followup.power,
              duration: eff.followup.duration,
              spellId: spell.id,
            });
          }
          emit(
            `${t.name} is burning!`,
            { type: "spellEffect", spellId: spell.id, targetId: t.instanceId, statusInflicted: "burn" }
          );
        }
      }
      break;
    }
    case "heal": {
      // priest-healers-touch: healing spells restore 30% more HP.
      const healMult = perkModifiers(
        perksForCharacter(caster),
        effStats
      ).healPowerMultiplier;
      const healPower = Math.max(
        1,
        Math.round((eff.power + castingBonus) * powerMultiplier * healMult)
      );
      // Single-target heals can also mend a summoned ally (they hold the
      // front line and soak hits). Summons have no statuses, so cure /
      // resurrect stay party-only.
      if (spell.target === "singleAlly" && action.targetAllyId) {
        const summon = s.summonedAllies.find(
          (a) => a.id === action.targetAllyId && a.hp > 0
        );
        if (summon) {
          const before = summon.hp;
          summon.hp = Math.min(summon.maxHp, summon.hp + healPower);
          emit(
            `${spell.name} heals ${summon.name} for ${summon.hp - before} HP.`,
            { type: "spellEffect", spellId: spell.id, targetId: summon.id, heal: summon.hp - before }
          );
          break;
        }
      }
      for (const t of allyTargets(s, spell, action, caster)) {
        const before = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + healPower);
        emit(
          `${spell.name} heals ${t.name} for ${t.hp - before} HP.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, heal: t.hp - before }
        );
        if (t.status.includes("knockedOut") && t.hp > 0) {
          t.status = t.status.filter((st) => st !== "knockedOut");
          emit(`${t.name} is revived!`, { type: "revived", targetId: t.id });
        }
        // Over-time followup (e.g. Mass Regenerate): flat per-round healing,
        // deliberately unaffected by casting stat (design doc §5.3).
        if (eff.followup?.kind === "regen" && t.hp > 0) {
          s.regenBuffs[t.id] = {
            power: eff.followup.power,
            duration: eff.followup.duration,
            spellId: spell.id,
          };
          emit(
            `${t.name} is regenerating.`,
            { type: "spellEffect", spellId: spell.id, targetId: t.id, isBuff: true }
          );
        }
      }
      break;
    }
    case "disable": {
      for (const t of spellTargets(s, spell, action)) {
        applyDisableToEnemy(s, t, eff.status, spell, emit);
      }
      break;
    }
    case "cure": {
      for (const t of allyTargets(s, spell, action, caster)) {
        t.status = t.status.filter((st) => st !== eff.status);
        if (eff.status === "poison") delete s.poisonState[t.id];
        else if (eff.status === "blind") delete s.blindTimers[t.id];
        else if (eff.status === "paralysis") delete s.paralysisTimers[t.id];
        else if (eff.status === "sleep") delete s.sleepTimers[t.id];
        emit(
          `${spell.name} cures ${t.name} of ${eff.status}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, statusCured: eff.status }
        );
      }
      break;
    }
    case "buff": {
      const amount = eff.power ?? 3;
      for (const t of allyTargets(s, spell, action, caster)) {
        s.armorBuffs[t.id] = (s.armorBuffs[t.id] ?? 0) + amount;
        emit(
          `${spell.name} bolsters ${t.name}'s armor by ${amount}.`,
          { type: "spellEffect", spellId: spell.id, targetId: t.id, isBuff: true }
        );
      }
      break;
    }
    case "resurrect": {
      // priest-revival: revive spells restore the target to 50% max HP
      // instead of the base 1 HP.
      const revivePct = perkModifiers(
        perksForCharacter(caster),
        effStats
      ).resurrectHpPercent;
      for (const t of allyTargets(s, spell, action, caster)) {
        if (!t.status.includes("knockedOut")) continue;
        t.hp = Math.max(1, Math.round(t.maxHp * revivePct));
        t.status = t.status.filter((st) => st !== "knockedOut");
        emit(
          `${spell.name} resurrects ${t.name} with ${t.hp} HP!`,
          { type: "revived", targetId: t.id }
        );
      }
      break;
    }
    case "magicScreen": {
      s.magicScreen += eff.power;
      emit(
        `${spell.name} raises a magic screen around the party (strength ${s.magicScreen}).`,
        { type: "spellEffect", spellId: spell.id, targetId: caster.id, isBuff: true }
      );
      break;
    }
    case "fizzleField": {
      // Target row is determined by the spell action; default to front.
      const targetRow = action.targetRow ?? "front";
      s.enemyFizzleFields[targetRow] += eff.power;
      emit(
        `${spell.name} surrounds the enemy ${targetRow} row with a fizzle field (strength ${s.enemyFizzleFields[targetRow]}).`,
        { type: "spellEffect", spellId: spell.id, isDebuff: true }
      );
      break;
    }
    case "dispelMagic": {
      const clearedEnemyScreens = s.enemyMagicScreens.front + s.enemyMagicScreens.back;
      const clearedEnemyFizzles = s.enemyFizzleFields.front + s.enemyFizzleFields.back;
      const clearedPartyFizzle = s.partyFizzleField;
      s.enemyMagicScreens = { front: 0, back: 0 };
      s.enemyFizzleFields = { front: 0, back: 0 };
      s.partyFizzleField = 0;
      const clearedTotal = clearedEnemyScreens + clearedEnemyFizzles + clearedPartyFizzle;
      emit(
        clearedTotal > 0
          ? `${spell.name} dispels enemy screens and fizzle fields.`
          : `${spell.name} finds no magic to dispel.`,
        { type: "spellEffect", spellId: spell.id, isBuff: true }
      );
      break;
    }
    case "summon": {
      const MAX_ALLIES = 3;
      const power = eff.power;
      s.summonCounter += 1;
      const ally: SummonedAlly = {
        id: `summon-${s.summonCounter}`,
        name: eff.allyName ?? "Summoned Ally",
        hp: power * 6,
        maxHp: power * 6,
        attack: power * 3,
        ac: Math.max(1, Math.floor(power / 2)),
        agi: 8 + power * 3,
        row: "front",
        spriteId: eff.spriteId,
      };
      if (s.summonedAllies.length >= MAX_ALLIES) {
        s.summonedAllies.shift();
      }
      s.summonedAllies.push(ally);
      emit(
        `${spell.name} summons a ${ally.name} to fight for the party!`,
        { type: "spellEffect", spellId: spell.id, targetId: ally.id, isBuff: true }
      );
      break;
    }
  }
  void rng;
}

/** Resolve enemy instances targeted by an offensive spell. */
function spellTargets(
  s: CombatState,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>
): EnemyInstance[] {
  const all = [...s.enemies.front, ...s.enemies.back].filter((e) => e.currentHp > 0);
  switch (spell.target) {
    case "singleEnemy": {
      const t = action.targetInstanceId ? findEnemy(s, action.targetInstanceId) : undefined;
      return t ? [t] : [];
    }
    case "groupEnemies": {
      // "Group" = one row (prefer front if it has living members, else back).
      const front = s.enemies.front.filter((e) => e.currentHp > 0);
      return front.length > 0 ? front : s.enemies.back.filter((e) => e.currentHp > 0);
    }
    case "allEnemies":
      return all;
    default:
      return [];
  }
}

/** Resolve party members targeted by a supportive spell. */
function allyTargets(
  s: CombatState,
  spell: SpellDef,
  action: Extract<PlayerAction, { kind: "cast" }>,
  caster: Character
): Character[] {
  const living = s.party.filter((c) => c.hp > 0 || c.status.includes("knockedOut"));
  switch (spell.target) {
    case "self":
      return [caster];
    case "singleAlly": {
      const id = action.targetAllyId ?? caster.id;
      const t = s.party.find((c) => c.id === id);
      return t ? [t] : [];
    }
    case "groupAllies": {
      // Target one row of allies (front if any living, else back).
      const front = living.filter((c) => charRow(c) === "front");
      return front.length > 0 ? front : living.filter((c) => charRow(c) === "back");
    }
    case "allAllies":
      return living;
    default:
      return [];
  }
}
