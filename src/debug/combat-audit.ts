import type { InventoryEntry } from "../types";
import type { Character } from "../game/party";
import type { CombatEvent, CombatState } from "../game/combat-types";
import type { RecoveryPathAnalysis } from "../game/recovery";

/** Debug-only provenance for a combat start. It is never saved or read by gameplay. */
export type CombatAuditSource =
  | "random"
  | "climax"
  | "trap"
  | "npc"
  | "stairsGuardian"
  | "arena"
  | "debug";

export interface CombatAuditContext {
  source: CombatAuditSource;
  tableId: number | null;
}

export interface CombatAuditStep {
  floorId: number;
  x: number;
  y: number;
  /** Whether the destination cell was already explored before this step. */
  exploredBefore: boolean;
  exploredTileCountBefore: number;
  floorExploredFractionBefore: number;
  safeZone: boolean;
  authoredEventKind?: string;
  tile?: string;
}

export interface CombatAuditRecovery {
  kind: "floorStart" | "camp" | "town" | "eventHeal";
  floorId: number;
  x?: number;
  y?: number;
}

export interface CombatAuditWipeRecovery {
  encounter: number | null;
  failed: { floorId: number; x: number; y: number; facing: number };
  storedLastDungeon: { floorId: number; x: number; y: number; facing: number };
  reentry: {
    actual: { floorId: number; x: number; y: number; facing: number };
    legalWalkableTile: boolean;
    tile?: string;
    tileFiresEvent: boolean;
    immediateCombatRetrigger: boolean;
    safeLandingExact: boolean;
    safeLandingReason: string;
    path: RecoveryPathAnalysis;
  } | null;
}

interface PartyCondition {
  id: string;
  name: string;
  class: Character["class"];
  level: number;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
}

interface CombatAuditRecord {
  encounter: number;
  source: CombatAuditSource;
  floorId: number;
  x: number;
  y: number;
  tableId: number | null;
  formation: { front: string[]; back: string[] };
  partyComposition: PartyCondition[];
  hpSpEntering: PartyCondition[];
  hpSpLeaving: PartyCondition[];
  consumablesUsed: Record<string, number>;
  rounds: number;
  damageReceived: number;
  damageReceivedByCharacter: Record<string, number>;
  healingReceived: number;
  healingReceivedByCharacter: Record<string, number>;
  charactersKOd: string[];
  result: CombatState["result"] | null;
  stepsSincePreviousCombat: number;
  distanceFromPreviousSafeRest: number;
  previousSafeRest: CombatAuditRecovery | null;
  stepsSincePreviousWipe: number | null;
  exploredBefore: boolean;
  exploredTileCountBefore: number;
  floorExploredFractionBefore: number;
  immediateBeforeAuthoredEvent: boolean;
  authoredEventKind?: string;
  previousTile?: string;
  climaxId?: string;
}

export interface CombatAuditSnapshot {
  records: CombatAuditRecord[];
  wipeRecoveries: CombatAuditWipeRecovery[];
  pending: boolean;
  stepsSincePreviousCombat: number;
  distanceFromPreviousSafeRest: number;
  stepsSincePreviousWipe: number | null;
  lastRecovery: CombatAuditRecovery | null;
}

export interface CombatAuditStart {
  combat: CombatState;
  context: CombatAuditContext;
  floorId: number;
  x: number;
  y: number;
  party: Character[];
  inventory: InventoryEntry[];
}

function condition(character: Character): PartyCondition {
  return {
    id: character.id,
    name: character.name,
    class: character.class,
    level: character.level,
    hp: character.hp,
    maxHp: character.maxHp,
    sp: character.sp,
    maxSp: character.maxSp,
  };
}

function inventoryCounts(inventory: InventoryEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of inventory) counts[item.itemId] = (counts[item.itemId] ?? 0) + 1;
  return counts;
}

function positiveIncomingDamage(
  event: CombatEvent,
  partyIds: Set<string>
): { targetId: string; damage: number } | null {
  if (!event || !("targetId" in event) || typeof event.targetId !== "string") return null;
  if (!partyIds.has(event.targetId)) return null;
  if (!("damage" in event) || typeof event.damage !== "number" || event.damage <= 0) return null;
  if (
    event.type !== "attack" &&
    event.type !== "ambush" &&
    event.type !== "cast" &&
    event.type !== "spellEffect" &&
    event.type !== "statusTick" &&
    event.type !== "techniqueHit"
  ) {
    return null;
  }
  return { targetId: event.targetId, damage: event.damage };
}

function positiveHealing(
  event: CombatEvent,
  partyIds: Set<string>
): { targetId: string; healing: number } | null {
  if (!event || !("targetId" in event) || typeof event.targetId !== "string") return null;
  if (!partyIds.has(event.targetId)) return null;
  if (!("heal" in event) || typeof event.heal !== "number" || event.heal <= 0) return null;
  if (event.type !== "cast" && event.type !== "spellEffect") return null;
  return { targetId: event.targetId, healing: event.heal };
}

/** Debug-only evidence tracker; it cannot affect save/load or combat resolution. */
export class CombatAudit {
  private records: CombatAuditRecord[] = [];
  private active: {
    start: CombatAuditStart;
    formation: { front: string[]; back: string[] };
    stepsSincePreviousCombat: number;
    distanceFromPreviousSafeRest: number;
    previousSafeRest: CombatAuditRecovery | null;
    stepsSincePreviousWipe: number | null;
    lastStep: CombatAuditStep | null;
  } | null = null;
  private stepsSincePreviousCombat = 0;
  private distanceFromPreviousSafeRest = 0;
  private stepsSincePreviousWipe: number | null = null;
  private lastRecovery: CombatAuditRecovery | null = null;
  private lastStep: CombatAuditStep | null = null;
  private nextEncounter = 1;
  private wipeRecoveries: CombatAuditWipeRecovery[] = [];

  noteStep(step: CombatAuditStep): void {
    this.stepsSincePreviousCombat++;
    this.distanceFromPreviousSafeRest++;
    if (this.stepsSincePreviousWipe !== null) this.stepsSincePreviousWipe++;
    if (step.safeZone || step.authoredEventKind === "heal") {
      const recovery: CombatAuditRecovery = {
        kind: step.authoredEventKind === "heal" ? "eventHeal" : "floorStart",
        floorId: step.floorId,
        x: step.x,
        y: step.y,
      };
      this.distanceFromPreviousSafeRest = 0;
      this.lastRecovery = recovery;
    }
    this.lastStep = step;
    if (this.active) this.active.lastStep = step;
  }

  noteRecovery(recovery: CombatAuditRecovery): void {
    this.distanceFromPreviousSafeRest = 0;
    this.lastRecovery = { ...recovery };
  }

  beginCombat(input: CombatAuditStart): void {
    // Arena/debug fights are useful for other diagnostics but are not natural
    // campaign measurements, so do not disturb route distances with them.
    if (input.context.source === "arena" || input.context.source === "debug") return;
    const lastStep = this.lastStep;
    this.active = {
      start: input,
      formation: {
        front: input.combat.enemies.front.map((enemy) => enemy.id),
        back: input.combat.enemies.back.map((enemy) => enemy.id),
      },
      stepsSincePreviousCombat: this.stepsSincePreviousCombat,
      distanceFromPreviousSafeRest: this.distanceFromPreviousSafeRest,
      previousSafeRest: this.lastRecovery ? { ...this.lastRecovery } : null,
      stepsSincePreviousWipe: this.stepsSincePreviousWipe,
      lastStep,
    };
    this.stepsSincePreviousCombat = 0;
  }

  endCombat(result: CombatState): void {
    const active = this.active;
    if (!active) return;
    this.active = null;

    const { start } = active;
    const partyIds = new Set(start.party.map((character) => character.id));
    const damageReceivedByCharacter: Record<string, number> = {};
    let damageReceived = 0;
    const healingReceivedByCharacter: Record<string, number> = {};
    let healingReceived = 0;
    for (const event of result.events) {
      const incoming = positiveIncomingDamage(event, partyIds);
      if (incoming) {
        damageReceived += incoming.damage;
        damageReceivedByCharacter[incoming.targetId] =
          (damageReceivedByCharacter[incoming.targetId] ?? 0) + incoming.damage;
      }
      const healing = positiveHealing(event, partyIds);
      if (healing) {
        healingReceived += healing.healing;
        healingReceivedByCharacter[healing.targetId] =
          (healingReceivedByCharacter[healing.targetId] ?? 0) + healing.healing;
      }
    }

    const defeated = new Set<string>();
    for (const event of result.events) {
      if (event?.type === "defeated" && !event.wasEnemy && partyIds.has(event.targetId)) {
        defeated.add(event.targetId);
      }
    }
    for (const character of result.party) {
      if (character.hp <= 0) defeated.add(character.id);
    }

    const before = inventoryCounts(start.inventory);
    const used: Record<string, number> = {};
    for (const [itemId, count] of Object.entries(before)) {
      const delta = count - (result.inventory[itemId] ?? 0);
      if (delta > 0) used[itemId] = delta;
    }

    const previousStep = active.lastStep;
    this.records.push({
      encounter: this.nextEncounter++,
      source: start.context.source,
      floorId: start.floorId,
      x: start.x,
      y: start.y,
      tableId: start.context.tableId,
      formation: active.formation,
      partyComposition: start.party.map(condition),
      hpSpEntering: start.party.map(condition),
      hpSpLeaving: result.party.map(condition),
      consumablesUsed: used,
      rounds: Math.max(0, result.round),
      damageReceived,
      damageReceivedByCharacter,
      healingReceived,
      healingReceivedByCharacter,
      charactersKOd: [...defeated],
      result: result.result ?? null,
      stepsSincePreviousCombat: active.stepsSincePreviousCombat,
      distanceFromPreviousSafeRest: active.distanceFromPreviousSafeRest,
      previousSafeRest: active.previousSafeRest,
      stepsSincePreviousWipe: active.stepsSincePreviousWipe,
      exploredBefore: previousStep?.exploredBefore ?? false,
      exploredTileCountBefore: previousStep?.exploredTileCountBefore ?? 0,
      floorExploredFractionBefore: previousStep?.floorExploredFractionBefore ?? 0,
      immediateBeforeAuthoredEvent: Boolean(previousStep?.authoredEventKind || result.climaxId),
      authoredEventKind: previousStep?.authoredEventKind,
      previousTile: previousStep?.tile,
      climaxId: result.climaxId,
    });
    if (result.result === "wipe") this.stepsSincePreviousWipe = 0;
  }

  noteWipeCheckpoint(input: {
    failed: { floorId: number; x: number; y: number; facing: number };
    storedLastDungeon: { floorId: number; x: number; y: number; facing: number };
  }): void {
    const latest = this.records.at(-1);
    this.wipeRecoveries.push({
      encounter: latest?.result === "wipe" ? latest.encounter : null,
      failed: { ...input.failed },
      storedLastDungeon: { ...input.storedLastDungeon },
      reentry: null,
    });
  }

  noteDungeonReentry(input: {
    actual: { floorId: number; x: number; y: number; facing: number };
    legalWalkableTile: boolean;
    tile?: string;
    tileFiresEvent: boolean;
    immediateCombatRetrigger: boolean;
    safeLandingExact: boolean;
    safeLandingReason: string;
    path: RecoveryPathAnalysis;
  }): void {
    const recovery = [...this.wipeRecoveries].reverse().find((entry) => entry.reentry === null);
    if (!recovery) return;
    recovery.reentry = {
      actual: { ...input.actual },
      legalWalkableTile: input.legalWalkableTile,
      tile: input.tile,
      tileFiresEvent: input.tileFiresEvent,
      immediateCombatRetrigger: input.immediateCombatRetrigger,
      safeLandingExact: input.safeLandingExact,
      safeLandingReason: input.safeLandingReason,
      path: {
        ...input.path,
        crossedStairs: [...input.path.crossedStairs],
        crossedEvents: [...input.path.crossedEvents],
        cells: input.path.cells.map((cell) => ({ ...cell })),
      },
    };
  }

  snapshot(): CombatAuditSnapshot {
    return {
      records: this.records.map((record) => ({
        ...record,
        formation: {
          front: [...record.formation.front],
          back: [...record.formation.back],
        },
        partyComposition: record.partyComposition.map((member) => ({ ...member })),
        hpSpEntering: record.hpSpEntering.map((member) => ({ ...member })),
        hpSpLeaving: record.hpSpLeaving.map((member) => ({ ...member })),
        consumablesUsed: { ...record.consumablesUsed },
        damageReceivedByCharacter: { ...record.damageReceivedByCharacter },
        healingReceivedByCharacter: { ...record.healingReceivedByCharacter },
        charactersKOd: [...record.charactersKOd],
        previousSafeRest: record.previousSafeRest ? { ...record.previousSafeRest } : null,
      })),
      wipeRecoveries: this.wipeRecoveries.map((recovery) => ({
        ...recovery,
        failed: { ...recovery.failed },
        storedLastDungeon: { ...recovery.storedLastDungeon },
        reentry: recovery.reentry
          ? {
              ...recovery.reentry,
              actual: { ...recovery.reentry.actual },
              path: {
                ...recovery.reentry.path,
                crossedStairs: [...recovery.reentry.path.crossedStairs],
                crossedEvents: [...recovery.reentry.path.crossedEvents],
                cells: recovery.reentry.path.cells.map((cell) => ({ ...cell })),
              },
            }
          : null,
      })),
      pending: this.active !== null,
      stepsSincePreviousCombat: this.stepsSincePreviousCombat,
      distanceFromPreviousSafeRest: this.distanceFromPreviousSafeRest,
      stepsSincePreviousWipe: this.stepsSincePreviousWipe,
      lastRecovery: this.lastRecovery ? { ...this.lastRecovery } : null,
    };
  }

  clear(): void {
    this.records = [];
    this.wipeRecoveries = [];
    this.active = null;
    this.stepsSincePreviousCombat = 0;
    this.distanceFromPreviousSafeRest = 0;
    this.stepsSincePreviousWipe = null;
    this.lastRecovery = null;
    this.lastStep = null;
    this.nextEncounter = 1;
  }
}
