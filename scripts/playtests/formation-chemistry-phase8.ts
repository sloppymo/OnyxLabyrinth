/**
 * Deterministic Formation Chemistry lab.
 *
 * This is an audit harness, not game logic. It drives the pure round-based
 * combat API against the authored Floor 1 table, records lifecycle telemetry,
 * and emits a JSON/Markdown report for the Phase 8 balance review.
 *
 * Run from the repository root:
 *   npx tsx scripts/playtests/formation-chemistry-phase8.ts
 *   N=100 npx tsx scripts/playtests/formation-chemistry-phase8.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  ENCOUNTER_TABLES,
  resolveEncounter,
  rollEncounter,
  type EncounterEntry,
} from "../../src/data/enemies";
import { ALL_SPELLS } from "../../src/data/spells";
import { ITEMS_BY_ID } from "../../src/data/items";
import { createCombatFromEncounter, resolveCombatRound } from "../../src/game/combat";
import { createSeededRng } from "../../src/game/rng";
import { defaultLoadoutForCharacter } from "../../src/game/combat-equipment";
import { createPresetParty, type PresetPartyId } from "../../src/game/preset-parties";
import { applyCombatPartyResult, type Character } from "../../src/game/party";
import {
  createEncounterFamilyMemory,
  encounterRollChance,
  rememberEncounterFamily,
} from "../../src/game/encounters";
import type { CombatEvent, CombatState, PlayerAction, Rng } from "../../src/game/combat-types";

const SPELLS_BY_ID = Object.fromEntries(ALL_SPELLS.map((spell) => [spell.id, spell]));
const F1_ENTRIES = ENCOUNTER_TABLES[1] ?? [];
const N = Number(process.env.N ?? 100);
const OUT_DIR = resolvePath(process.env.OUT_DIR ?? "docs/playtests");
const OUT_JSON = resolvePath(OUT_DIR, "2026-08-15-formation-chemistry-phase8.json");
const OUT_MD = resolvePath(OUT_DIR, "2026-08-15-formation-chemistry-phase8.md");

// These two entries remain lab-only scenarios after the active F1 table
// removed them. Keeping their authored shapes here preserves the evidence
// trail without reintroducing filler encounters into production pacing.
const RELIEF_SCENARIOS: readonly EncounterEntry[] = [
  {
    id: "f1-slime-cluster",
    family: "slime-board",
    weight: 3,
    spawns: [
      { enemyId: "slime", row: "front" },
      { enemyId: "slime", row: "front" },
      { enemyId: "slime", row: "front" },
    ],
  },
  {
    id: "f1-bone-archer-line",
    family: "bone-volley",
    weight: 3,
    spawns: [
      { enemyId: "skeleton", row: "front" },
      { enemyId: "skeleton", row: "front" },
      { enemyId: "skeleton-archer", row: "back" },
    ],
  },
];

const RELIEF_DECISIONS = {
  "f1-slime-cluster": {
    status: "removed",
    reason: "No Split event, split timing, or kill-order decision appeared in the 100-seed policy traces; the default route was simply three weak Slimes.",
  },
  "f1-bone-archer-line": {
    status: "removed",
    reason: "No Archer Volley pressure resolved before Archer death in the 100-seed traces; Skeleton contribution did not create a durable Archer-versus-line decision.",
  },
} as const;

type Policy = "naive" | "default" | "chemistry-aware" | "focused" | "aoe";
type MatrixPolicy = Extract<Policy, "naive" | "default" | "chemistry-aware">;
type PartyArchetype = "balanced" | "physical-heavy" | "magic-heavy" | "defensive";

const PARTY_IDS: Record<PartyArchetype, PresetPartyId> = {
  balanced: "balanced",
  "physical-heavy": "blades",
  "magic-heavy": "glass",
  defensive: "iron",
};

const MATRIX_POLICIES: MatrixPolicy[] = ["naive", "default", "chemistry-aware"];
const RELIEF_POLICIES: Policy[] = ["default", "focused", "aoe"];

interface FightResult {
  entryId: string;
  family: string;
  party: PartyArchetype;
  policy: Policy;
  seed: number;
  result: "victory" | "wipe" | "fled" | "stalled";
  rounds: number;
  enemyActions: number;
  hpLossPct: number;
  hpLossByMember: Record<string, number>;
  spUsed: number;
  consumablesUsed: number;
  koCount: number;
  firstKillId: string | null;
  firstKillName: string | null;
  chemistry: CombatState["chemistryTelemetry"];
  chemistryUses: Record<string, number>;
  guardsIntercepted: number;
  aoeBypasses: number;
  summonsCreated: number;
  consumedBodies: number;
  bespokeEvents: number;
}

interface Aggregate {
  fights: number;
  victories: number;
  wipes: number;
  stalled: number;
  averageRounds: number;
  averageHpLossPct: number;
  averageSpUsed: number;
  averageConsumablesUsed: number;
  averageEnemyActions: number;
  averageKOs: number;
  firstKills: Record<string, number>;
  chemistry: Record<"present" | "eligible" | "telegraphed" | "attempted" | "resolved" | "broken", number>;
  guardsIntercepted: number;
  aoeBypasses: number;
  summonsCreated: number;
  consumedBodies: number;
}

interface CombatRun {
  fight: FightResult;
  finalState: CombatState;
}

type ExpeditionRoute = "normal" | "quiet" | "dead" | "hot";
type ExpeditionMode = "chemistry-aware" | "default" | "no-chemistry-control";

interface ExpeditionResult {
  route: ExpeditionRoute;
  mode: ExpeditionMode;
  seed: number;
  fights: FightResult[];
  gaps: number[];
  completedFights: number;
  wiped: boolean;
  finalHpPct: number;
  finalSpPct: number;
  consumablesUsed: number;
  returnToTownPressure: boolean;
}

interface ExpeditionAggregate {
  expeditions: number;
  completedTen: number;
  wiped: number;
  averageFightsCompleted: number;
  averageFinalHpPct: number;
  averageFinalSpPct: number;
  averageRoundsPerFight: number;
  averageEnemyActionsPerFight: number;
  averageKOsPerExpedition: number;
  averageConsumablesUsed: number;
  returnToTownPressure: number;
  gapMean: number;
  gapMedian: number;
  gapP10: number;
  gapP90: number;
  gapMax: number;
  chemistry: Aggregate["chemistry"];
  chemistryUses: Record<string, number>;
  summonsCreated: number;
  consumedBodies: number;
}

function inventoryEntriesFromCounts(counts: Record<string, number>): { itemId: string; identified: true }[] {
  return Object.entries(counts).flatMap(([itemId, count]) =>
    Array.from({ length: Math.max(0, count) }, () => ({ itemId, identified: true as const }))
  );
}

function prepareParty(archetype: PartyArchetype, policy: Policy): Character[] {
  const party = createPresetParty(PARTY_IDS[archetype]);
  if (policy === "aoe") {
    const mage = party.find((character) => character.class === "Mage");
    if (mage && !mage.knownSpellIds.includes("mage-quake")) {
      mage.knownSpellIds.push("mage-quake");
      mage.maxSp = Math.max(mage.maxSp, 60);
      mage.sp = mage.maxSp;
    }
  }
  return party;
}

function loadoutFor(party: readonly Character[]): Record<string, ReturnType<typeof defaultLoadoutForCharacter>> {
  return Object.fromEntries(party.map((character) => [character.id, defaultLoadoutForCharacter(character)]));
}

function livingEnemies(state: CombatState) {
  return [...state.enemies.front, ...state.enemies.back].filter((enemy) => enemy.currentHp > 0);
}

function lowestHpPartyMember(state: CombatState): Character | undefined {
  return [...state.party]
    .filter((character) => character.hp > 0)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0];
}

function frontFirstTarget(state: CombatState) {
  return livingEnemies(state)[0];
}

function focusedTarget(state: CombatState, entryId: string) {
  const enemies = livingEnemies(state);
  if (entryId === "f1-bone-archer-line") {
    return enemies.find((enemy) => enemy.id === "skeleton-archer") ?? enemies[0];
  }
  return enemies[0];
}

/** Kill the actor that owns a live chemistry contract before its resource. */
function chemistryTarget(state: CombatState) {
  const actorPriority = [
    "crypt-minotaur",
    "crypt-hill-ogre",
    "crypt-warlock",
    "crypt-animated-armor",
    "crypt-hellhound",
    "crypt-demon-mage",
    "crypt-rune-knight",
  ];
  const enemies = livingEnemies(state);
  return actorPriority
    .map((id) => enemies.find((enemy) => enemy.id === id))
    .find((enemy): enemy is NonNullable<typeof enemy> => enemy !== undefined)
    ?? enemies[0];
}

function actionFor(
  state: CombatState,
  character: Character,
  policy: Policy,
  entryId: string
): PlayerAction {
  const injured = lowestHpPartyMember(state);
  const ratio = injured ? injured.hp / injured.maxHp : 1;
  const potionAvailable = (state.inventory["healing-potion"] ?? 0) > 0;

  if (
    policy !== "naive" &&
    injured &&
    ratio < 0.35 &&
    potionAvailable &&
    character.hp > 0
  ) {
    return { kind: "item", actorId: character.id, itemId: "healing-potion", targetAllyId: injured.id };
  }

  if (
    policy !== "naive" &&
    (policy === "default" || policy === "chemistry-aware" || policy === "aoe") &&
    character.class === "Priest" &&
    injured &&
    ratio < 0.65 &&
    character.knownSpellIds.includes("priest-cure-wounds") &&
    character.sp >= (state.spells["priest-cure-wounds"]?.spCost ?? Number.MAX_SAFE_INTEGER)
  ) {
    return { kind: "cast", actorId: character.id, spellId: "priest-cure-wounds", targetAllyId: injured.id };
  }

  if (
    policy === "aoe" &&
    character.class === "Mage" &&
    livingEnemies(state).length > 1 &&
    character.knownSpellIds.includes("mage-quake") &&
    character.sp >= (state.spells["mage-quake"]?.spCost ?? Number.MAX_SAFE_INTEGER)
  ) {
    return { kind: "cast", actorId: character.id, spellId: "mage-quake" };
  }

  const target =
    policy === "chemistry-aware"
      ? chemistryTarget(state)
      : policy === "focused" || policy === "aoe"
      ? focusedTarget(state, entryId)
      : frontFirstTarget(state);
  return target
    ? { kind: "attack", actorId: character.id, targetInstanceId: target.instanceId }
    : { kind: "defend", actorId: character.id };
}

function sumTelemetry(
  telemetry: CombatState["chemistryTelemetry"],
  metric: keyof NonNullable<CombatState["chemistryTelemetry"]>
): number {
  return Object.values(telemetry?.[metric] ?? {}).reduce((sum, value) => sum + value, 0);
}

function enemyActionCount(events: CombatEvent[], enemyIds: Set<string>): number {
  return events.reduce((count, event) => {
    if (!event || !("actorId" in event) || !enemyIds.has(event.actorId)) return count;
    if (event.type === "attack" || event.type === "cast" || event.type === "silence" || event.type === "telegraph") {
      return count + 1;
    }
    if (event.type === "chemistry" && (event.phase === "telegraph" || event.phase === "resolve" || event.phase === "intercept")) {
      return count + 1;
    }
    return count;
  }, 0);
}

function runCombat(
  entry: EncounterEntry,
  party: Character[],
  partyArchetype: PartyArchetype,
  policy: Policy,
  rng: Rng,
  inventory: Record<string, number>,
  chemistryEnabled: boolean,
): CombatRun {
  const initialMaxHp = Object.fromEntries(party.map((character) => [character.id, character.maxHp]));
  const initialSp = Object.fromEntries(party.map((character) => [character.id, character.sp]));
  const initialConsumables = inventory["healing-potion"] ?? 0;
  const resolved = resolveEncounter(entry);
  const state0 = createCombatFromEncounter(
    party,
    resolved,
    SPELLS_BY_ID,
    ITEMS_BY_ID,
    loadoutFor(party),
    inventoryEntriesFromCounts(inventory),
    false,
    {
      id: entry.id,
      family: entry.family,
      displayName: entry.displayName,
      chemistryEnabled,
    }
  );
  const enemyNames = new Map(resolved.map(({ enemy }, index) => [`${enemy.id}-${index}`, enemy.name]));
  const enemyIds = new Set([...state0.enemies.front, ...state0.enemies.back].map((enemy) => enemy.instanceId));
  let state = state0;
  let firstKillId: string | null = null;
  let firstKillName: string | null = null;
  for (let step = 0; step < 40 && !state.ended; step++) {
    const actions = state.party
      .filter((character) => character.hp > 0)
      .map((character) => actionFor(state, character, policy, entry.id));
    const previousEventCount = state.events.length;
    state = resolveCombatRound(state, actions, rng);
    for (const event of state.events.slice(previousEventCount)) {
      if (!event || event.type !== "defeated" || !event.wasEnemy || firstKillId) continue;
      firstKillId = event.targetId;
      firstKillName = enemyNames.get(event.targetId) ?? event.targetId;
    }
  }

  const hpLossByMember = Object.fromEntries(
    state.party.map((character) => [character.id, Math.max(0, (initialMaxHp[character.id] ?? character.maxHp) - character.hp)])
  );
  const maxHpTotal = Object.values(initialMaxHp).reduce((sum, hp) => sum + hp, 0);
  const finalHpLoss = Object.values(hpLossByMember).reduce((sum, hp) => sum + hp, 0);
  const chemistry = state.chemistryTelemetry ?? {
    present: {}, eligible: {}, telegraphed: {}, attempted: {}, resolved: {}, broken: {},
  };
  const chemistryEvents = state.events.filter((event): event is Extract<CombatEvent, { type: "chemistry" }> => event?.type === "chemistry");
  const result = state.result ?? (state.ended ? "stalled" : "stalled");
  const fight: FightResult = {
    entryId: entry.id,
    family: entry.family,
    party: partyArchetype,
    policy,
    seed: 0,
    result,
    rounds: state.round,
    enemyActions: enemyActionCount(state.events, enemyIds),
    hpLossPct: maxHpTotal > 0 ? (finalHpLoss / maxHpTotal) * 100 : 0,
    hpLossByMember,
    spUsed: state.party.reduce((sum, character) => sum + Math.max(0, (initialSp[character.id] ?? character.sp) - character.sp), 0),
    consumablesUsed: initialConsumables - (state.inventory["healing-potion"] ?? 0),
    koCount: state.party.filter((character) => character.hp <= 0).length,
    firstKillId,
    firstKillName,
    chemistry,
    chemistryUses: state.chemistryUses ?? {},
    guardsIntercepted: chemistryEvents.filter((event) => event.phase === "intercept").length,
    aoeBypasses: state.events.filter((event) => event?.type === "chemistry" && event.phase === "intercept").length === 0
      ? 0
      : 0,
    summonsCreated: state.enemySummonsCreated ?? 0,
    consumedBodies: chemistryEvents.filter((event) => event.phase === "consume").length,
    bespokeEvents: chemistryEvents.length,
  };
  return { fight, finalState: state };
}

function runFight(entry: EncounterEntry, partyArchetype: PartyArchetype, policy: Policy, seed: number): FightResult {
  const party = prepareParty(partyArchetype, policy);
  const run = runCombat(entry, party, partyArchetype, policy, createSeededRng(seed), { "healing-potion": 3 }, true);
  return { ...run.fight, seed };
}

function aggregate(fights: FightResult[]): Aggregate {
  const chemistryKeys = ["present", "eligible", "telegraphed", "attempted", "resolved", "broken"] as const;
  const result: Aggregate = {
    fights: fights.length,
    victories: fights.filter((fight) => fight.result === "victory").length,
    wipes: fights.filter((fight) => fight.result === "wipe").length,
    stalled: fights.filter((fight) => fight.result === "stalled").length,
    averageRounds: 0,
    averageHpLossPct: 0,
    averageSpUsed: 0,
    averageConsumablesUsed: 0,
    averageEnemyActions: 0,
    averageKOs: 0,
    firstKills: {},
    chemistry: Object.fromEntries(chemistryKeys.map((key) => [key, 0])) as Aggregate["chemistry"],
    guardsIntercepted: 0,
    aoeBypasses: 0,
    summonsCreated: 0,
    consumedBodies: 0,
  };
  if (fights.length === 0) return result;
  for (const fight of fights) {
    result.averageRounds += fight.rounds;
    result.averageHpLossPct += fight.hpLossPct;
    result.averageSpUsed += fight.spUsed;
    result.averageConsumablesUsed += fight.consumablesUsed;
    result.averageEnemyActions += fight.enemyActions;
    result.averageKOs += fight.koCount;
    const firstKill = fight.firstKillName ?? "none";
    result.firstKills[firstKill] = (result.firstKills[firstKill] ?? 0) + 1;
    for (const key of chemistryKeys) result.chemistry[key] += sumTelemetry(fight.chemistry, key);
    result.guardsIntercepted += fight.guardsIntercepted;
    result.aoeBypasses += fight.aoeBypasses;
    result.summonsCreated += fight.summonsCreated;
    result.consumedBodies += fight.consumedBodies;
  }
  result.averageRounds /= fights.length;
  result.averageHpLossPct /= fights.length;
  result.averageSpUsed /= fights.length;
  result.averageConsumablesUsed /= fights.length;
  result.averageEnemyActions /= fights.length;
  result.averageKOs /= fights.length;
  return result;
}

function runMatrix(): { fights: FightResult[]; aggregates: Record<string, Aggregate> } {
  const fights: FightResult[] = [];
  const aggregates: Record<string, Aggregate> = {};
  for (const [entryIndex, entry] of F1_ENTRIES.entries()) {
    for (const [partyIndex, party] of (Object.keys(PARTY_IDS) as PartyArchetype[]).entries()) {
      for (const [policyIndex, policy] of MATRIX_POLICIES.entries()) {
        const cell: FightResult[] = [];
        for (let i = 0; i < N; i++) {
          const seed = 0x8f1c0000 + entryIndex * 100000 + partyIndex * 1000 + policyIndex * 100 + i;
          const fight = runFight(entry, party, policy, seed);
          fights.push(fight);
          cell.push(fight);
        }
        aggregates[`${entry.id}|${party}|${policy}`] = aggregate(cell);
      }
    }
  }
  return { fights, aggregates };
}

function runRelief(): { fights: FightResult[]; aggregates: Record<string, Aggregate> } {
  const fights: FightResult[] = [];
  const aggregates: Record<string, Aggregate> = {};
  for (const entry of RELIEF_SCENARIOS) {
    const entryId = entry.id;
    for (const party of Object.keys(PARTY_IDS) as PartyArchetype[]) {
      for (const policy of RELIEF_POLICIES) {
        const cell: FightResult[] = [];
        for (let i = 0; i < N; i++) {
          const seed = 0x9a2e0000 + (entryId === "f1-bone-archer-line" ? 500000 : 0) + party.charCodeAt(0) * 1000 + policy.charCodeAt(0) * 100 + i;
          const fight = runFight(entry, party, policy, seed);
          fights.push(fight);
          cell.push(fight);
        }
        aggregates[`${entry.id}|${party}|${policy}`] = aggregate(cell);
      }
    }
  }
  return { fights, aggregates };
}

const EXPEDITION_ROUTES: Record<ExpeditionRoute, number> = {
  normal: 1,
  quiet: 0.8,
  dead: 0,
  hot: 1.65,
};

const EXPEDITION_MODES: ExpeditionMode[] = [
  "chemistry-aware",
  "default",
  "no-chemistry-control",
];

function expeditionPolicy(mode: ExpeditionMode): Policy {
  return mode === "chemistry-aware" ? "chemistry-aware" : "default";
}

function runExpedition(
  partyArchetype: PartyArchetype,
  mode: ExpeditionMode,
  route: ExpeditionRoute,
  seed: number,
): ExpeditionResult {
  const policy = expeditionPolicy(mode);
  let party = prepareParty(partyArchetype, policy);
  let inventory: Record<string, number> = { "healing-potion": 3 };
  const initialMaxHp = party.reduce((sum, character) => sum + character.maxHp, 0);
  const initialSp = party.reduce((sum, character) => sum + character.sp, 0);
  const travelRng = createSeededRng((seed ^ 0x5eeda11) >>> 0);
  const memory = createEncounterFamilyMemory(1);
  const fights: FightResult[] = [];
  const gaps: number[] = [];
  let stepsSinceEncounter = 0;

  for (let fightIndex = 0; fightIndex < 10; fightIndex++) {
    let entry: EncounterEntry | null = null;
    let gap = 0;
    while (gap < 52) {
      gap += 1;
      stepsSinceEncounter += 1;
      const chance = encounterRollChance(0.05 * EXPEDITION_ROUTES[route], stepsSinceEncounter, {
        cooldown: 14,
        pityStart: 34,
        pityForce: 52,
      });
      if (travelRng() < chance) {
        entry = rollEncounter(1, {
          recentFamilies: memory.recentFamilies,
          rng: travelRng,
        });
        if (entry) rememberEncounterFamily(memory, entry.family, 1);
        break;
      }
    }
    if (!entry) break;

    gaps.push(gap);
    stepsSinceEncounter = 0;
    const combatSeed = (seed + 0x100000 + fightIndex * 0x10001) >>> 0;
    const run = runCombat(
      entry,
      party,
      partyArchetype,
      policy,
      createSeededRng(combatSeed),
      inventory,
      mode !== "no-chemistry-control",
    );
    fights.push({ ...run.fight, seed: combatSeed });
    party = applyCombatPartyResult(run.finalState.party);
    inventory = { ...run.finalState.inventory };
    if (run.finalState.result !== "victory") break;
  }

  const finalHp = party.reduce((sum, character) => sum + Math.max(0, character.hp), 0);
  const finalSp = party.reduce((sum, character) => sum + Math.max(0, character.sp), 0);
  const finalHpPct = initialMaxHp > 0 ? (finalHp / initialMaxHp) * 100 : 0;
  const finalSpPct = initialSp > 0 ? (finalSp / initialSp) * 100 : 100;
  const wiped = fights.at(-1)?.result === "wipe";
  const hadKo = fights.some((fight) => fight.koCount > 0);
  return {
    route,
    mode,
    seed,
    fights,
    gaps,
    completedFights: fights.length,
    wiped,
    finalHpPct,
    finalSpPct,
    consumablesUsed: 3 - (inventory["healing-potion"] ?? 0),
    // Pressure means a wipe, a KO, failure to reach ten fights, or a party
    // returning from the tenth fight below the initial 35% HP guardrail.
    returnToTownPressure: wiped || hadKo || fights.length < 10 || finalHpPct < 35,
  };
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index]!;
}

function aggregateExpeditions(results: ExpeditionResult[]): ExpeditionAggregate {
  const allFights = results.flatMap((result) => result.fights);
  const chemistryKeys = ["present", "eligible", "telegraphed", "attempted", "resolved", "broken"] as const;
  const chemistry = Object.fromEntries(chemistryKeys.map((key) => [key, 0])) as Aggregate["chemistry"];
  const chemistryUses: Record<string, number> = {};
  for (const fight of allFights) {
    for (const key of chemistryKeys) chemistry[key] += sumTelemetry(fight.chemistry, key);
    for (const [key, count] of Object.entries(fight.chemistryUses)) {
      chemistryUses[key] = (chemistryUses[key] ?? 0) + count;
    }
  }
  const gaps = results.flatMap((result) => result.gaps);
  const fightCount = Math.max(1, allFights.length);
  const expeditionCount = Math.max(1, results.length);
  return {
    expeditions: results.length,
    completedTen: results.filter((result) => result.completedFights >= 10 && !result.wiped).length,
    wiped: results.filter((result) => result.wiped).length,
    averageFightsCompleted: results.reduce((sum, result) => sum + result.completedFights, 0) / expeditionCount,
    averageFinalHpPct: results.reduce((sum, result) => sum + result.finalHpPct, 0) / expeditionCount,
    averageFinalSpPct: results.reduce((sum, result) => sum + result.finalSpPct, 0) / expeditionCount,
    averageRoundsPerFight: allFights.reduce((sum, fight) => sum + fight.rounds, 0) / fightCount,
    averageEnemyActionsPerFight: allFights.reduce((sum, fight) => sum + fight.enemyActions, 0) / fightCount,
    averageKOsPerExpedition: results.reduce((sum, result) => sum + result.fights.reduce((n, fight) => n + fight.koCount, 0), 0) / expeditionCount,
    averageConsumablesUsed: results.reduce((sum, result) => sum + result.consumablesUsed, 0) / expeditionCount,
    returnToTownPressure: results.filter((result) => result.returnToTownPressure).length,
    gapMean: gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0,
    gapMedian: quantile(gaps, 0.5),
    gapP10: quantile(gaps, 0.1),
    gapP90: quantile(gaps, 0.9),
    gapMax: gaps.length > 0 ? Math.max(...gaps) : 0,
    chemistry,
    chemistryUses,
    summonsCreated: allFights.reduce((sum, fight) => sum + fight.summonsCreated, 0),
    consumedBodies: allFights.reduce((sum, fight) => sum + fight.consumedBodies, 0),
  };
}

function runExpeditions(): {
  results: ExpeditionResult[];
  aggregates: Record<string, ExpeditionAggregate>;
} {
  const results: ExpeditionResult[] = [];
  const aggregates: Record<string, ExpeditionAggregate> = {};
  const routes = Object.keys(EXPEDITION_ROUTES) as ExpeditionRoute[];
  for (const [routeIndex, route] of routes.entries()) {
    for (const mode of EXPEDITION_MODES) {
      const cell: ExpeditionResult[] = [];
      for (let i = 0; i < N; i++) {
        // Keep the travel stream identical across modes so the control and
        // chemistry-aware rows compare the same authored encounter sequence.
        const seed = 0xa11d0000 + routeIndex * 100000 + i;
        const result = runExpedition("balanced", mode, route, seed);
        results.push(result);
        cell.push(result);
      }
      aggregates[`${route}|${mode}`] = aggregateExpeditions(cell);
    }
  }
  return { results, aggregates };
}

function runGapAudit(): Record<string, { mean: number; median: number; p10: number; p90: number; max: number }> {
  const profiles = [
    ["normal", 1],
    ["quiet", 0.8],
    ["dead", 0],
    ["hot", 1.65],
  ] as const;
  const output: Record<string, { mean: number; median: number; p10: number; p90: number; max: number }> = {};
  for (const [name, multiplier] of profiles) {
    const gapProbabilities: number[] = [];
    let survival = 1;
    for (let gap = 1; gap <= 52; gap++) {
      const chance = Math.max(0, Math.min(1, 0.05 * multiplier));
      const p = gap < 14 ? 0 : gap >= 52 ? 1 : gap < 34 ? chance : chance + (1 - chance) * ((gap - 34) / 18);
      gapProbabilities.push(p * survival);
      survival *= 1 - p;
    }
    const normalized = gapProbabilities.map((value, index) => ({ gap: index + 1, value }));
    const mean = normalized.reduce((sum, item) => sum + item.gap * item.value, 0);
    const quantile = (q: number) => {
      let cdf = 0;
      for (const item of normalized) {
        cdf += item.value;
        if (cdf >= q) return item.gap;
      }
      return 52;
    };
    output[name] = { mean, median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9), max: 52 };
  }
  return output;
}

function markdown(report: Record<string, unknown>): string {
  const matrix = report.matrix as { aggregates: Record<string, Aggregate> };
  const relief = report.relief as { aggregates: Record<string, Aggregate> };
  const expeditions = report.expeditions as { aggregates: Record<string, ExpeditionAggregate> };
  const lines = [
    "# Formation Chemistry Phase 8 deterministic lab",
    "",
    `Generated ${report.generatedAt}; N=${report.n}. This is evidence, not an automatic balance verdict.`,
    "",
    "## Encounter gap audit",
    "",
    "| Route | Mean | Median | p10 | p90 | Max |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [route, values] of Object.entries(report.gaps as Record<string, { mean: number; median: number; p10: number; p90: number; max: number }>)) {
    lines.push(`| ${route} | ${values.mean.toFixed(2)} | ${values.median} | ${values.p10} | ${values.p90} | ${values.max} |`);
  }
  lines.push("", "## Matrix highlights", "", "| Encounter | Party | Policy | Win | Wipe | Rounds | HP loss | Chem resolved | Chem broken |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const [key, value] of Object.entries(matrix.aggregates)) {
    const [entry, party, policy] = key.split("|");
    lines.push(`| ${entry} | ${party} | ${policy} | ${value.victories}/${value.fights} | ${value.wipes} | ${value.averageRounds.toFixed(2)} | ${value.averageHpLossPct.toFixed(1)}% | ${value.chemistry.resolved} | ${value.chemistry.broken} |`);
  }
  lines.push(
    "",
    "## Ten-fight expedition attrition",
    "",
    "Balanced party, three starting healing potions, Floor 1 pacing, and the same travel stream for each mode. Return-to-town pressure counts any wipe, KO, failure to reach ten fights, or a tenth-fight return below 35% aggregate HP; this is a guardrail signal, not a new mechanic.",
    "",
    "| Route | Mode | Ten fights | Wipes | Pressure | Avg fights | Final HP | Final SP | Potions | Gap mean/med/p90/max | Chem resolved/broken | Summons/consumed |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |",
  );
  for (const [key, value] of Object.entries(expeditions.aggregates)) {
    const [route, mode] = key.split("|");
    lines.push(`| ${route} | ${mode} | ${value.completedTen}/${value.expeditions} | ${value.wiped} | ${value.returnToTownPressure} | ${value.averageFightsCompleted.toFixed(2)} | ${value.averageFinalHpPct.toFixed(1)}% | ${value.averageFinalSpPct.toFixed(1)}% | ${value.averageConsumablesUsed.toFixed(2)} | ${value.gapMean.toFixed(2)}/${value.gapMedian}/${value.gapP90}/${value.gapMax} | ${value.chemistry.resolved}/${value.chemistry.broken} | ${value.summonsCreated}/${value.consumedBodies} |`);
  }
  lines.push("", "## Relief evidence", "", "The two relief entries were removed from the active roster after the 100-seed traces below. The numeric figures are diagnostic heuristics, not pass/fail gates; the qualitative decision was that neither encounter established its intended tactical premise.", "", "| Encounter | Decision | Evidence |", "| --- | --- | --- |");
  for (const [entry, decision] of Object.entries(RELIEF_DECISIONS)) {
    lines.push(`| ${entry} | ${decision.status} | ${decision.reason} |`);
  }
  lines.push("", "| Lab scenario | Party | Policy | Win | Rounds | HP loss | First kills |", "| --- | --- | --- | ---: | ---: | ---: | --- |");
  for (const [key, value] of Object.entries(relief.aggregates)) {
    const [entry, party, policy] = key.split("|");
    const firstKills = Object.entries(value.firstKills).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name}:${count}`).join(", ");
    lines.push(`| ${entry} | ${party} | ${policy} | ${value.victories}/${value.fights} | ${value.averageRounds.toFixed(2)} | ${value.averageHpLossPct.toFixed(1)}% | ${firstKills} |`);
  }
  return `${lines.join("\n")}\n`;
}

const matrix = runMatrix();
const relief = runRelief();
const expeditions = runExpeditions();
const report = {
  generatedAt: new Date().toISOString(),
  n: N,
  roster: F1_ENTRIES.map((entry) => ({ id: entry.id, family: entry.family, weight: entry.weight })),
  gaps: runGapAudit(),
  matrix,
  relief,
  reliefDecisions: RELIEF_DECISIONS,
  expeditions,
};

// Keep the committed artifact reviewable. The harness still holds every
// trace while it runs (and the Markdown report records the aggregate lab),
// but checking in all 21,600 pretty-printed traces would produce a multi-
// million-line generated diff. Re-run this script when trace-level data is
// needed rather than making the repository carry it permanently.
const persistedReport = {
  generatedAt: report.generatedAt,
  n: report.n,
  roster: report.roster,
  gaps: report.gaps,
  matrix: { fightCount: matrix.fights.length, aggregates: matrix.aggregates },
  relief: { fightCount: relief.fights.length, aggregates: relief.aggregates },
  reliefDecisions: report.reliefDecisions,
  expeditions: { expeditionCount: expeditions.results.length, aggregates: expeditions.aggregates },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify(persistedReport, null, 2)}\n`);
writeFileSync(OUT_MD, markdown(report));
console.log(JSON.stringify({ outJson: OUT_JSON, outMarkdown: OUT_MD, fights: matrix.fights.length + relief.fights.length, expeditions: expeditions.results.length }, null, 2));
