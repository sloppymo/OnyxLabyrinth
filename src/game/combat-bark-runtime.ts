/**
 * Runtime bridge for the additive combat-bark library.
 *
 * The shipped MVP bark path remains in combat-barks.ts. This module owns only
 * the library's opportunity -> eligibility -> governor -> selector path, and
 * emits the same structured bark event consumed by the shared choreography.
 * It never reads or advances the gameplay RNG stream.
 */

import type {
  BarkLandmark,
  CombatBarkRuntimeState,
  CombatBarkTelemetryState,
  CombatEvent,
  CombatState,
} from "./combat-types";
import type { Character } from "./party";
import type { CombatBarkLine, CombatBarkTrigger, ChemistryId } from "../data/combat-bark-library/types";
import {
  barkLineKey,
  eligibleCombatBarks,
  selectCombatBark,
  type SelectBarkInput,
} from "./combat-bark-library";
import {
  barkLandmarkForTrigger,
  barkPriority as policyBarkPriority,
  libraryBarkCanInterrupt,
} from "../data/combat-bark-policy";

const ORDINARY_ROUND_COOLDOWN = 2;
const SPEAKER_ROUND_COOLDOWN = 3;
const TRIGGER_ROUND_COOLDOWN = 2;
const RECENT_LINE_LIMIT = 6;
const USED_LINE_LIMIT = 128;
const UNIQUE_LINE_LIMIT = 128;

let librarySerial = 0;
let libraryRng: () => number = mulberry32(1);

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reset the library stream once per combat, separate from gameplay RNG. */
export function resetCombatBarkLibraryRng(seed?: number): void {
  librarySerial += 1;
  const chosen = seed ?? ((librarySerial * 0x9e3779b9) >>> 0);
  libraryRng = mulberry32(chosen >>> 0);
}

/** Test/preview seam; never used by gameplay code. */
export function setCombatBarkLibraryRngForTests(rng: () => number): void {
  libraryRng = rng;
}

export function barkPriority(trigger: CombatBarkTrigger): number {
  return policyBarkPriority(trigger, "library");
}

export function createCombatBarkRuntimeState(): CombatBarkRuntimeState {
  return {
    combatStartObserved: false,
    lastSelectedRound: -999,
    lastSelectedPriority: 0,
    lastSpeakerRound: {},
    lastTriggerRound: {},
    usedLineKeys: [],
    recentLineKeys: [],
    telemetry: createTelemetry(),
  };
}

function createTelemetry(): CombatBarkTelemetryState {
  return {
    opportunities: {},
    eligible: {},
    selected: {},
    suppressed: {},
    suppressionReasons: {},
    lines: {},
    uniqueLines: [],
  };
}

function runtimeFor(state: CombatState): CombatBarkRuntimeState {
  if (!state.barkRuntime) state.barkRuntime = createCombatBarkRuntimeState();
  return state.barkRuntime;
}

function increment(
  record: Partial<Record<CombatBarkTrigger, number>>,
  key: CombatBarkTrigger
): void {
  record[key] = (record[key] ?? 0) + 1;
}

function incrementReason(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function entityFor(state: CombatState, actorId: string):
  | { speakerId: string; isParty: true; character: Character }
  | { speakerId: string; isParty: false; enemyId: string }
  | null {
  const character = state.party.find((c) => c.id === actorId);
  if (character) return { speakerId: character.class, isParty: true, character };
  const enemy = findEnemyLike(state, actorId);
  if (enemy) return { speakerId: enemy.id, isParty: false, enemyId: enemy.id };
  const ally = state.summonedAllies.find((entry) => entry.id === actorId)
    ?? state.justDiedAllies.find((entry) => entry.id === actorId);
  if (ally) return { speakerId: ally.id, isParty: false, enemyId: ally.id };
  return null;
}

function findEnemyLike(state: CombatState, actorId: string) {
  return (
    state.enemies.front.find((e) => e.instanceId === actorId) ??
    state.enemies.back.find((e) => e.instanceId === actorId) ??
    state.justDied.find((e) => e.instanceId === actorId)
  );
}

function actorName(state: CombatState, actorId: string): string {
  const character = state.party.find((c) => c.id === actorId);
  if (character) return character.name;
  const enemy = findEnemyLike(state, actorId);
  if (enemy) return enemy.name;
  const ally = state.summonedAllies.find((a) => a.id === actorId);
  return ally?.name ?? actorId;
}

function targetEnemyId(state: CombatState, targetId: string | undefined): string | undefined {
  return targetId ? findEnemyLike(state, targetId)?.id : undefined;
}

function isBossLegacyLine(entity: ReturnType<typeof findEnemyLike>): boolean {
  return !!entity?.isBoss && entity.id.startsWith("headmasters-echo");
}

function isHighPriority(trigger: CombatBarkTrigger): boolean {
  return libraryBarkCanInterrupt(trigger);
}

function shouldSuppress(
  runtime: CombatBarkRuntimeState,
  speakerId: string,
  trigger: CombatBarkTrigger,
  priority: number,
  round: number
): string | null {
  const high = isHighPriority(trigger);
  if (runtime.lastSelectedRound === round && priority <= runtime.lastSelectedPriority) {
    return "same-round-lower-priority";
  }
  if (!high && round - runtime.lastSelectedRound < ORDINARY_ROUND_COOLDOWN) {
    return "global-round-cooldown";
  }
  const speakerRound = runtime.lastSpeakerRound[speakerId];
  if (!high && speakerRound !== undefined && round - speakerRound < SPEAKER_ROUND_COOLDOWN) {
    return "speaker-round-cooldown";
  }
  const triggerRound = runtime.lastTriggerRound[trigger];
  if (!high && triggerRound !== undefined && round - triggerRound < TRIGGER_ROUND_COOLDOWN) {
    return "trigger-round-cooldown";
  }
  return null;
}

function rememberLine(runtime: CombatBarkRuntimeState, key: string, line: CombatBarkLine): void {
  if (line.oncePerCombat && !runtime.usedLineKeys.includes(key)) {
    runtime.usedLineKeys.push(key);
    if (runtime.usedLineKeys.length > USED_LINE_LIMIT) runtime.usedLineKeys.shift();
  }
  runtime.recentLineKeys = runtime.recentLineKeys.filter((entry) => entry !== key);
  runtime.recentLineKeys.push(key);
  if (runtime.recentLineKeys.length > RECENT_LINE_LIMIT) runtime.recentLineKeys.shift();
}

function rememberTelemetry(runtime: CombatBarkRuntimeState, key: string): void {
  runtime.telemetry.lines[key] = (runtime.telemetry.lines[key] ?? 0) + 1;
  if (!runtime.telemetry.uniqueLines.includes(key)) {
    runtime.telemetry.uniqueLines.push(key);
    if (runtime.telemetry.uniqueLines.length > UNIQUE_LINE_LIMIT) {
      runtime.telemetry.uniqueLines.shift();
    }
  }
}

export interface LibraryBarkOpportunity {
  /** Runtime instance id used by the renderer; speakerId is the profile id. */
  actorId: string;
  speakerId: string;
  trigger: CombatBarkTrigger;
  abilityId?: string;
  chemistryId?: ChemistryId;
  status?: string;
  sourceEnemyId?: string;
  targetEnemyId?: string;
  landmark?: BarkLandmark;
}

/**
 * Try to turn one opportunity into a library bark event. The caller supplies
 * the raw event writer so a generated bark is not recursively observed.
 */
export function offerLibraryBark(
  state: CombatState,
  opportunity: LibraryBarkOpportunity,
  emitRaw: (message: string, event: CombatEvent) => void
): boolean {
  const runtime = runtimeFor(state);
  const priority = barkPriority(opportunity.trigger);
  increment(runtime.telemetry.opportunities, opportunity.trigger);

  const baseInput: Omit<SelectBarkInput, "rng"> = {
    speakerId: opportunity.speakerId,
    trigger: opportunity.trigger,
    abilityId: opportunity.abilityId,
    chemistryId: opportunity.chemistryId,
    status: opportunity.status,
    sourceEnemyId: opportunity.sourceEnemyId,
    targetEnemyId: opportunity.targetEnemyId,
    alreadyUsed: new Set(runtime.usedLineKeys),
    recentlyUsed: new Set(runtime.recentLineKeys),
  };
  let eligible = eligibleCombatBarks(baseInput);
  if (eligible.length === 0) {
    // A one-line profile should eventually be allowed to speak again. This
    // fallback only happens when the recent-line window blocked every option.
    eligible = eligibleCombatBarks({ ...baseInput, recentlyUsed: [] });
  }
  if (eligible.length === 0) {
    incrementReason(runtime.telemetry.suppressionReasons, "no-eligible-line");
    return false;
  }
  increment(runtime.telemetry.eligible, opportunity.trigger);

  const suppression = shouldSuppress(
    runtime,
    opportunity.speakerId,
    opportunity.trigger,
    priority,
    state.round
  );
  if (suppression) {
    increment(runtime.telemetry.suppressed, opportunity.trigger);
    incrementReason(runtime.telemetry.suppressionReasons, suppression);
    return false;
  }

  const line = selectCombatBark(
    {
      ...baseInput,
      rng: libraryRng,
      recentlyUsed: runtime.recentLineKeys,
    },
    undefined
  ) ?? selectCombatBark(
    {
      ...baseInput,
      rng: libraryRng,
      recentlyUsed: [],
    },
    undefined
  );
  if (!line) {
    increment(runtime.telemetry.suppressed, opportunity.trigger);
    incrementReason(runtime.telemetry.suppressionReasons, "selector-empty");
    return false;
  }

  const key = barkLineKey(opportunity.speakerId, opportunity.trigger, line);
  rememberLine(runtime, key, line);
  rememberTelemetry(runtime, key);
  increment(runtime.telemetry.selected, opportunity.trigger);
  runtime.lastSelectedRound = state.round;
  runtime.lastSelectedPriority = priority;
  runtime.lastSpeakerRound[opportunity.speakerId] = state.round;
  runtime.lastTriggerRound[opportunity.trigger] = state.round;

  const speaker = actorName(state, opportunity.actorId);
  emitRaw(`${speaker}: "${line.text}"`, {
    type: "bark",
    actorId: opportunity.actorId,
    trigger: opportunity.trigger,
    text: line.text,
    source: "library",
    landmark: opportunity.landmark ?? barkLandmarkForTrigger(opportunity.trigger),
    speaker,
  });
  return true;
}

/** Let the first resolved action carry the optional combat-start line. */
export function ensureCombatStartBark(
  state: CombatState,
  actorId: string,
  emitRaw: (message: string, event: CombatEvent) => void
): void {
  const runtime = runtimeFor(state);
  if (runtime.combatStartObserved) return;
  runtime.combatStartObserved = true;
  const entity = entityFor(state, actorId);
  if (!entity) return;
  offerLibraryBark(state, {
    actorId,
    speakerId: entity.speakerId,
    trigger: "combatStart",
    landmark: "anticipation",
  }, emitRaw);
}

/** Observe ordinary structured combat events and create low-volume library opportunities. */
export function observeCombatEvent(
  state: CombatState,
  event: CombatEvent,
  emitRaw: (message: string, event: CombatEvent) => void
): void {
  if (!event || event.type === "bark") return;

  switch (event.type) {
    case "attack":
    case "ambush": {
      const actor = entityFor(state, event.actorId);
      if (actor) {
        offerLibraryBark(state, {
          actorId: event.actorId,
          speakerId: actor.speakerId,
          trigger: event.crit ? "criticalHit" : "basicAttack",
          landmark: event.crit ? "contact" : "anticipation",
          targetEnemyId: targetEnemyId(state, event.targetId),
        }, emitRaw);
      }
      const target = entityFor(state, event.targetId);
      if (target && !event.crit && (!target.isParty || event.damage < maxHpFor(state, event.targetId) * 0.35)) {
        offerLibraryBark(state, {
          actorId: event.targetId,
          speakerId: target.speakerId,
          trigger:
            !target.isParty && event.damage >= maxHpFor(state, event.targetId) * 0.35
              ? "takeHeavyHit"
              : "takeHit",
          landmark: "reaction",
          sourceEnemyId: actor && !actor.isParty ? actor.enemyId : undefined,
          targetEnemyId: target.isParty ? undefined : target.enemyId,
        }, emitRaw);
      }
      break;
    }
    case "miss":
    case "techniqueMiss": {
      const actor = entityFor(state, event.actorId);
      if (actor) {
        offerLibraryBark(state, {
          actorId: event.actorId,
          speakerId: actor.speakerId,
          trigger: "attackMiss",
          landmark: "contact",
          targetEnemyId: targetEnemyId(state, event.targetId),
        }, emitRaw);
      }
      break;
    }
    case "technique": {
      const actor = entityFor(state, event.actorId);
      if (actor) {
        offerLibraryBark(state, {
          actorId: event.actorId,
          speakerId: actor.speakerId,
          trigger: "abilityUse",
          abilityId: event.techniqueId,
          targetEnemyId: targetEnemyId(state, event.targetId ?? undefined),
          landmark: "anticipation",
        }, emitRaw);
      }
      break;
    }
    case "techniqueHit": {
      if (!event.crit) break;
      const actor = entityFor(state, event.actorId);
      if (actor) {
        offerLibraryBark(state, {
          actorId: event.actorId,
          speakerId: actor.speakerId,
          trigger: "criticalHit",
          abilityId: event.techniqueId,
          landmark: "contact",
        }, emitRaw);
      }
      break;
    }
    case "cast": {
      const actor = entityFor(state, event.actorId);
      if (actor && !actor.isParty) {
        const trigger = actorIsBoss(state, event.actorId) ? "spellCast" : "abilityUse";
        offerLibraryBark(state, {
          actorId: event.actorId,
          speakerId: actor.speakerId,
          trigger,
          abilityId: event.spellId,
          sourceEnemyId: actor.enemyId,
          targetEnemyId: targetEnemyId(state, event.targetId ?? undefined),
          landmark: "release",
        }, emitRaw);
      }
      break;
    }
    case "spellEffect": {
      if (!event.targetId) break;
      const target = entityFor(state, event.targetId);
      if (!target) break;
      if (event.heal !== undefined || event.isBuff || event.statusCured !== undefined) {
        offerLibraryBark(state, {
          actorId: event.targetId,
          speakerId: target.speakerId,
          trigger: event.heal !== undefined ? "healed" : "buffed",
          status: event.statusCured,
          landmark: "reaction",
        }, emitRaw);
      } else if (event.statusInflicted) {
        offerLibraryBark(state, {
          actorId: event.targetId,
          speakerId: target.speakerId,
          trigger: "statusApplied",
          status: event.statusInflicted,
          landmark: "reaction",
        }, emitRaw);
      }
      break;
    }
    case "defeated": {
      const entity = entityFor(state, event.targetId);
      if (!entity) break;
      if (event.wasEnemy) {
        const enemy = findEnemyLike(state, event.targetId);
        if (!enemy || isBossLegacyLine(enemy)) break;
        offerLibraryBark(state, {
          actorId: event.targetId,
          speakerId: entity.speakerId,
          trigger: "death",
          landmark: "settle",
        }, emitRaw);
      }
      // Party KO lines remain on the proven legacy path for now.
      break;
    }
    case "revived": {
      const entity = entityFor(state, event.targetId);
      if (entity) offerLibraryBark(state, { actorId: event.targetId, speakerId: entity.speakerId, trigger: "revived", landmark: "settle" }, emitRaw);
      break;
    }
    case "phaseChange": {
      const entity = entityFor(state, event.actorId);
      if (entity) offerLibraryBark(state, { actorId: event.actorId, speakerId: entity.speakerId, trigger: "bossPhase", landmark: "reaction" }, emitRaw);
      break;
    }
    default:
      break;
  }
}

function maxHpFor(state: CombatState, actorId: string): number {
  const entity = entityFor(state, actorId);
  if (!entity) return 100;
  if (entity.isParty) return entity.character.maxHp;
  return findEnemyLike(state, actorId)?.hp ?? 100;
}

function actorIsBoss(state: CombatState, actorId: string): boolean {
  return !!findEnemyLike(state, actorId)?.isBoss;
}

/** Build a context for the legacy beforeSpell hook's library fallback. */
export function offerLibrarySpellBark(
  state: CombatState,
  actorId: string,
  spellId: string,
  isHeal: boolean,
  targetId: string | null | undefined,
  emitRaw: (message: string, event: CombatEvent) => void
): boolean {
  const entity = entityFor(state, actorId);
  if (!entity) return false;
  return offerLibraryBark(state, {
    actorId,
    speakerId: entity.speakerId,
    trigger: isHeal ? "healCast" : "spellCast",
    abilityId: spellId,
    targetEnemyId: targetEnemyId(state, targetId ?? undefined),
    landmark: "release",
  }, emitRaw);
}

/** Snapshot used by the deterministic exposure report and preview. */
export function barkRuntimeTelemetry(state: CombatState): CombatBarkTelemetryState {
  return state.barkRuntime?.telemetry ?? createTelemetry();
}
