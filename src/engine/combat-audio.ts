/**
 * Maps structured CombatEvents (game/combat.ts) to combat SFX ids and plays
 * them via the shared audio engine. Kept out of audio.ts on purpose — that
 * file is a generic sample player + procedural synth with zero game-layer
 * knowledge; this is the one place that decides "which sound for which
 * combat moment" (public/assets/sfx/combat/README.md documents the actual
 * source files, including the honest note that some mappings are
 * filename-only best-guesses).
 *
 * Layering: one event may emit 1–3 leaf `playCombatSfx` calls (gain-ducked).
 * Never wrap wrappers — the audio spy leaf-patches `playCombatSfx` only.
 */
import type { CombatEvent, CombatState } from "../game/combat-types";
import { spellById, type DamageElement } from "../data/spells";
import { ENEMIES_BY_ID } from "../data/enemies";
import { audio, type CombatSfxId } from "./audio";

const ELEMENT_SFX: Partial<Record<DamageElement, CombatSfxId>> = {
  fire: "elementFire",
  cold: "elementCold",
  lightning: "elementLightning",
  water: "elementWater",
  earth: "elementEarth",
  wind: "elementWind",
  divine: "elementDivine",
  undead: "elementDivine",
  physical: "elementPhysical",
  // Poison-element damage spells (e.g. Poison Spray) reuse the poison-status
  // sound — thematically the closest fit ("Bio"-style venom cast).
  poison: "statusPoison",
};

const STATUS_SFX: Partial<Record<string, CombatSfxId>> = {
  sleep: "statusSleep",
  paralysis: "statusParalysis",
  blind: "statusBlind",
  poison: "statusPoison",
};

/** Spells whose cast telegraph uses an `mp_*_full` charge strip (P2). */
export const FULL_CHARGE_SPELLS = new Set([
  "mage-fireball",
  "mage-immolate",
  "mage-meteor-swarm",
  "mage-spark",
  "mage-disintegrate",
  "mage-gate",
]);

/** Ultimate AoE casts that get a soft tick layer under the element cue. */
const ULTIMATE_AOE_SPELLS = new Set([
  "mage-meteor-swarm",
  "mage-immolate",
  "mage-ice-storm",
  "mage-tempest",
  "mage-freezing-sphere",
]);

export type SfxLayer = { id: CombatSfxId; gainMul?: number };

const MAX_SFX_LAYERS = 3;

export function clampSfxLayers(layers: SfxLayer[]): SfxLayer[] {
  return layers.slice(0, MAX_SFX_LAYERS);
}

/** True when an enemy species has the undead special (display routing only). */
export function enemyIsUndead(enemyId: string): boolean {
  const def = ENEMIES_BY_ID[enemyId];
  return !!def?.special?.some((s) => s.kind === "undead");
}

/** Resolve a spell/item id used on a "cast" event to a CombatSfxId, or null. */
function idForCast(spellId: string, state: CombatState): CombatSfxId | null {
  if (state.items[spellId]) return "itemUse";
  const spell = spellById(spellId) ?? state.spells[spellId];
  if (!spell) return null;
  const eff = spell.effect;
  switch (eff.kind) {
    case "summon":
      return "summonCast";
    case "damage":
      return eff.element ? (ELEMENT_SFX[eff.element] ?? null) : "elementPhysical";
    case "heal":
    case "cure":
    case "resurrect":
    case "massResurrect":
      return "healCast";
    case "buff":
    case "magicScreen":
      return "buffCast";
    case "disable":
    case "fizzleField":
    case "dispelMagic":
      return "debuffCast";
    case "combatStatus":
      return eff.status === "giantStrength" ? "buffCast" : "debuffCast";
    default:
      return null;
  }
}

function actorClass(actorId: string, state: CombatState): string | undefined {
  return state.party.find((c) => c.id === actorId)?.class;
}

/**
 * Leaf SFX layers for one combat event. Callers iterate events once and play
 * every returned layer via `playCombatSfx` (never a second mapper path).
 */
export function idsForEvent(event: CombatEvent, state: CombatState): SfxLayer[] {
  if (!event) return [];
  switch (event.type) {
    case "attack":
    case "ambush":
    case "techniqueHit": {
      const layers: SfxLayer[] = [{ id: event.crit ? "criticalHit" : "attackHit" }];
      const cls = actorClass(event.actorId, state);
      if (cls === "Priest") {
        layers.push({ id: "elementDivine", gainMul: 0.5 });
      } else if (cls === "Mage") {
        layers.push({ id: "elementPhysical", gainMul: event.crit ? 0.5 : 0.45 });
      }
      return clampSfxLayers(layers);
    }
    case "miss":
    case "techniqueMiss":
      return [{ id: "miss" }];
    case "cast": {
      if (event.cardPresentation === "rat") return [{ id: "summonCast" }];
      const primary = idForCast(event.spellId, state);
      if (!primary) return [];
      const layers: SfxLayer[] = [{ id: primary }];
      if (FULL_CHARGE_SPELLS.has(event.spellId)) {
        layers.push({ id: "bossPhase", gainMul: 0.4 });
      }
      if (ULTIMATE_AOE_SPELLS.has(event.spellId)) {
        const spell = spellById(event.spellId) ?? state.spells[event.spellId];
        const el =
          spell?.effect.kind === "damage" ? spell.effect.element : undefined;
        if (el === "fire") layers.push({ id: "burnTick", gainMul: 0.35 });
        else if (el === "cold") layers.push({ id: "elementCold", gainMul: 0.3 });
        else if (el === "wind") layers.push({ id: "elementWind", gainMul: 0.3 });
        else layers.push({ id: "burnTick", gainMul: 0.3 });
      }
      return clampSfxLayers(layers);
    }
    case "spellEffect": {
      if (event.cardPresentation === "opened") return [{ id: "debuffCast" }];
      if (event.cardPresentation === "consume-opened") return [{ id: "technique" }];
      if (event.statusInflicted) {
        const id = STATUS_SFX[event.statusInflicted];
        return id ? [{ id }] : [];
      }
      if (event.heal !== undefined && event.heal > 0) return [{ id: "healCast" }];
      if (event.isBuff) return [{ id: "buffCast" }];
      if (event.isDebuff) return [{ id: "debuffCast" }];
      return [];
    }
    case "defeated": {
      if (!event.wasEnemy) return [{ id: "partyKnockedOut" }];
      const dead = state.justDied.find((e) => e.instanceId === event.targetId);
      const layers: SfxLayer[] = [
        { id: dead?.isBoss ? "bossDefeated" : "enemyDefeated" },
      ];
      if (dead && enemyIsUndead(dead.id)) {
        layers.push({ id: "statusPoison", gainMul: 0.4 });
      }
      return clampSfxLayers(layers);
    }
    case "revived":
      return [{ id: "revived" }];
    case "defend":
      return [{ id: "defend" }];
    case "statusTick":
      if (event.status === "poison") return [{ id: "poisonTick" }];
      if (event.status === "burn") return [{ id: "burnTick" }];
      return [];
    case "flee":
      return [{ id: event.success ? "flee" : "miss" }];
    case "silence":
      return clampSfxLayers([
        { id: "silence" },
        { id: "fizzle", gainMul: 0.35 },
      ]);
    case "fizzle":
      return [{ id: "fizzle" }];
    case "technique":
      return [{ id: "technique" }];
    case "techniqueStatus": {
      const id = STATUS_SFX[event.statusInflicted];
      return id ? [{ id }] : [];
    }
    case "techniqueBuff":
      return [{ id: "buffCast" }];
    case "telegraph":
      return [{ id: "bossPhase" }];
    case "telegraphBreak":
      return [{ id: "fizzle" }];
    case "chemistry": {
      if (event.phase === "break") return [{ id: "fizzle" }];
      if (event.phase === "telegraph") return [{ id: "bossPhase" }];
      if (event.chemistryId === "chem-bone-harvest") return [{ id: "healCast" }];
      if (event.presentation === "detonateAlly") return [{ id: "elementFire" }];
      if (event.presentation === "overload") return [{ id: "elementLightning" }];
      if (event.presentation === "throwAlly") return [{ id: "statusPoison" }];
      return [{ id: "elementPhysical" }];
    }
    case "affinityDiscovered":
    case "analyze":
      return clampSfxLayers([
        { id: "analyze" },
        { id: "fizzle", gainMul: 0.35 },
      ]);
    case "phaseChange":
      return [{ id: "bossPhase" }];
    case "hide":
    case "spotted":
    case "incapacitated":
    case "statusEnd":
    case "rowAdvance":
    default:
      return [];
  }
}

/** Play the SFX layer(s) for one combat event. Never throws. */
export function playCombatEventSound(event: CombatEvent, state: CombatState): void {
  for (const layer of idsForEvent(event, state)) {
    audio.playCombatSfx(layer.id, { gainMul: layer.gainMul });
  }
}

/** Play the SFX for every event in a batch, in order. */
export function playCombatEventSounds(events: CombatEvent[], state: CombatState): void {
  for (const event of events) playCombatEventSound(event, state);
}
