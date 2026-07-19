/**
 * Maps structured CombatEvents (game/combat.ts) to combat SFX ids and plays
 * them via the shared audio engine. Kept out of audio.ts on purpose — that
 * file is a generic sample player + procedural synth with zero game-layer
 * knowledge; this is the one place that decides "which sound for which
 * combat moment" (public/assets/sfx/combat/README.md documents the actual
 * source files, including the honest note that some mappings are
 * filename-only best-guesses).
 */
import type { CombatEvent, CombatState } from "../game/combat-types";
import { spellById, type DamageElement } from "../data/spells";
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
      return "healCast";
    case "buff":
    case "magicScreen":
      return "buffCast";
    case "disable":
    case "fizzleField":
    case "dispelMagic":
      return "debuffCast";
    default:
      return null;
  }
}

function idForEvent(event: CombatEvent, state: CombatState): CombatSfxId | null {
  if (!event) return null;
  switch (event.type) {
    case "attack":
    case "ambush":
    case "techniqueHit":
      return event.crit ? "criticalHit" : "attackHit";
    case "miss":
    case "techniqueMiss":
      return "miss";
    case "cast":
      return idForCast(event.spellId, state);
    case "spellEffect": {
      if (event.statusInflicted) return STATUS_SFX[event.statusInflicted] ?? null;
      if (event.heal !== undefined && event.heal > 0) return "healCast";
      if (event.isBuff) return "buffCast";
      if (event.isDebuff) return "debuffCast";
      return null;
    }
    case "defeated": {
      if (!event.wasEnemy) return "partyKnockedOut";
      const dead = state.justDied.find((e) => e.instanceId === event.targetId);
      return dead?.isBoss ? "bossDefeated" : "enemyDefeated";
    }
    case "revived":
      return "revived";
    case "defend":
      return "defend";
    case "statusTick":
      if (event.status === "poison") return "poisonTick";
      if (event.status === "burn") return "burnTick";
      return null;
    case "flee":
      return event.success ? "flee" : "miss";
    case "silence":
      return "silence";
    case "fizzle":
      return "fizzle";
    case "technique":
      return "technique";
    case "techniqueStatus":
      return STATUS_SFX[event.statusInflicted] ?? null;
    case "techniqueBuff":
      return "buffCast";
    case "telegraph":
      return "bossPhase";
    case "telegraphBreak":
      return "fizzle";
    case "affinityDiscovered":
    case "analyze":
      return "analyze";
    case "phaseChange":
      return "bossPhase";
    // No confident mapping for these — left silent rather than guessed.
    case "hide":
    case "spotted":
    case "incapacitated":
    case "statusEnd":
    default:
      return null;
  }
}

/** Play the SFX (if any) for one combat event. Never throws. */
export function playCombatEventSound(event: CombatEvent, state: CombatState): void {
  const id = idForEvent(event, state);
  if (id) audio.playCombatSfx(id);
}

/** Play the SFX for every event in a batch, in order. */
export function playCombatEventSounds(events: CombatEvent[], state: CombatState): void {
  for (const event of events) playCombatEventSound(event, state);
}
