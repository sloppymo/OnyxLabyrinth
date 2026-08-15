/**
 * Deterministic combat-bark exposure lab.
 *
 * This drives the real round resolver with real EnemyDefs and CombatState;
 * it does not model combat with a spreadsheet. Bark RNG is injected through
 * its presentation-only seam, while combat keeps its own seeded stream.
 *
 * Run:
 *   npx tsx scripts/playtests/combat-bark-exposure-2026-08-15.ts
 *
 * Set BARK_EXPOSURE_SEEDS to a smaller value for a quick local pass. The
 * checked-in report uses the default 100 seeds per formation/party/policy
 * cell. Chemistry fields are explicitly dormant on this baseline because no
 * Chemistry mechanics are imported into this integration branch.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ENEMIES_BY_ID } from "../../src/data/enemies";
import { ALL_SPELLS } from "../../src/data/spells";
import { createCharacter, type CharacterClass } from "../../src/game/party";
import {
  createCombatState,
  resolveCombatRound,
} from "../../src/game/combat";
import { createSeededRng } from "../../src/game/rng";
import type { CombatEvent, CombatState, EnemyInstance, PlayerAction } from "../../src/game/combat-types";
import {
  barkRuntimeTelemetry,
  setCombatBarkLibraryRngForTests,
} from "../../src/game/combat-bark-runtime";

const SPELLS = Object.fromEntries(ALL_SPELLS.map((spell) => [spell.id, spell]));
const SEEDS_PER_CELL = Number(process.env.BARK_EXPOSURE_SEEDS ?? 100);
const MAX_ROUNDS = 20;

type PartyStyle = "balanced" | "physical-heavy" | "magic-heavy" | "defensive";
type Policy = "chemistry-aware" | "naive/frontline" | "default/auto";

interface FormationSpec {
  id: string;
  family: string;
  enemyIds: readonly string[];
  rows?: readonly ("front" | "back")[];
  boss?: boolean;
}

interface FightMetrics {
  formationId: string;
  family: string;
  seed: number;
  party: PartyStyle;
  policy: Policy;
  api: "round-based";
  victory: boolean;
  wipe: boolean;
  fled: boolean;
  rounds: number;
  koCount: number;
  hpLost: number;
  hpLossPercent: number;
  spMpUsed: number;
  consumablesUsed: number;
  firstEnemyKilled: string | null;
  enemyKillOrder: string[];
  enemyActions: number;
  playerActions: number;
  chemistryPresent: boolean;
  chemistryEligible: boolean;
  chemistryTelegraphed: number;
  chemistryAttempted: number;
  chemistryResolved: number;
  chemistryBrokenByPlayer: number;
  signatureAbilityUsage: Record<string, number>;
  guardInterceptions: number;
  aoeGuardBypass: number;
  summonsCreated: number;
  summonsConsumed: number;
  normalEnemiesConsumed: number;
  rewardsEarned: { xp: number; gold: number };
  barkOpportunities: number;
  barkOpportunitiesByTrigger: Record<string, number>;
  barkEligible: number;
  barkEligibleByTrigger: Record<string, number>;
  barkDisplayed: number;
  legacyBarkDisplayed: number;
  barkDisplayedByTrigger: Record<string, number>;
  barkSuppressed: number;
  barkSuppressedByTrigger: Record<string, number>;
  barkSuppressionReasons: Record<string, number>;
  barkDisplayedBySpeaker: Record<string, number>;
  barkLineCounts: Record<string, number>;
  barkLinesSeen: number;
  barkUniqueLines: number;
  barkRounds: number[];
  averageRoundsBetweenBarks: number | null;
  presentationDurationMs: null;
}

interface CellSummary {
  formationId: string;
  family: string;
  party: PartyStyle;
  policy: Policy;
  fights: number;
  victories: number;
  wipes: number;
  flees: number;
  meanRounds: number;
  medianRounds: number;
  p90Rounds: number;
  meanHpLossPercent: number;
  p90HpLossPercent: number;
  koRate: number;
  meanBarkOpportunities: number;
  meanBarkDisplayed: number;
  meanLegacyBarkDisplayed: number;
  totalLineUses: number;
  uniqueLinesExposed: number;
  meanUniqueLinesPerFight: number;
  barkSuppressionRate: number;
  opportunitiesByTrigger: Record<string, number>;
  eligibleByTrigger: Record<string, number>;
  suppressedByTrigger: Record<string, number>;
  barkCountHistogram: Record<string, number>;
  meanRoundsBetweenBarks: number | null;
  averageSecondsBetweenBarks: null;
  battlesWithZeroBarks: number;
  battlesWithFourOrMoreBarks: number;
  displayedBySpeaker: Record<string, number>;
  displayedByTrigger: Record<string, number>;
  repeatedLineKeys: Record<string, number>;
  sampleFight: FightMetrics;
}

const FORMATIONS: readonly FormationSpec[] = [
  { id: "f1-skeleton-line", family: "undead", enemyIds: ["skeleton", "skeleton-archer"], rows: ["front", "back"] },
  { id: "f1-slime-skeleton", family: "ooze-undead", enemyIds: ["slime", "skeleton"], rows: ["front", "front"] },
  { id: "f2-warlock-line", family: "caster", enemyIds: ["warlock", "armored-skeleton"], rows: ["back", "front"] },
  { id: "f3-construct-line", family: "construct", enemyIds: ["stone-guardian", "animated-armor"], rows: ["front", "front"] },
  { id: "f4-choir-line", family: "choir", enemyIds: ["choir-warden", "discordant-cantor"], rows: ["back", "front"] },
  { id: "f5-frozen-line", family: "frozen", enemyIds: ["ice-golem", "drowned-sentinel"], rows: ["front", "back"] },
  { id: "returned-party", family: "returned-party", enemyIds: ["ruined-vanguard", "hollow-knifeman", "ash-scribe", "drowned-cantor"], rows: ["front", "front", "back", "back"] },
  { id: "boss-dead-boy", family: "boss-throughline", enemyIds: ["headmasters-echo"], rows: ["back"], boss: true },
];

const PARTY_CLASSES: Record<PartyStyle, readonly CharacterClass[]> = {
  balanced: ["Fighter", "Mage", "Priest", "Thief"],
  "physical-heavy": ["Fighter", "Halberdier", "Duelist", "Thief"],
  "magic-heavy": ["Mage", "Mage", "Priest", "Crusader"],
  defensive: ["Fighter", "Crusader", "Priest", "Halberdier"],
};

const POLICIES: readonly Policy[] = ["chemistry-aware", "naive/frontline", "default/auto"];
const PARTIES: readonly PartyStyle[] = ["balanced", "physical-heavy", "magic-heavy", "defensive"];

function partyFor(style: PartyStyle) {
  return PARTY_CLASSES[style].map((cls, index) => {
    const c = createCharacter(`pc-${index}`, `${cls} ${index + 1}`, "Human", "Neutral", cls, index);
    const caster = cls === "Mage" || cls === "Priest";
    c.stats = {
      str: style === "physical-heavy" ? 15 : 12,
      vit: style === "defensive" ? 15 : 12,
      agi: style === "physical-heavy" ? 13 : 11,
      int: style === "magic-heavy" && cls === "Mage" ? 17 : 12,
      pie: style === "magic-heavy" && cls === "Priest" ? 17 : 12,
      luk: 10,
    };
    c.maxHp = style === "defensive" ? 120 : 100;
    c.hp = c.maxHp;
    c.maxSp = caster ? 120 : 0;
    c.sp = c.maxSp;
    c.knownSpellIds = cls === "Mage" ? ["mage-spark", "mage-fire-bolt"] : cls === "Priest" ? ["priest-heal"] : [];
    return c;
  });
}

function enemiesFor(spec: FormationSpec): { front: EnemyInstance[]; back: EnemyInstance[] } {
  const front: EnemyInstance[] = [];
  const back: EnemyInstance[] = [];
  for (const [index, id] of spec.enemyIds.entries()) {
    const def = ENEMIES_BY_ID[id];
    if (!def) throw new Error(`Exposure formation references missing enemy: ${id}`);
    const row = spec.rows?.[index] ?? (def.rowPreference === "back" ? "back" : "front");
    const instance: EnemyInstance = {
      ...def,
      special: [...def.special],
      abilityIds: def.abilityIds ? [...def.abilityIds] : undefined,
      instanceId: `${id}-${index}`,
      currentHp: def.hp,
      row,
      status: [],
    };
    (row === "front" ? front : back).push(instance);
  }
  return { front, back };
}

function targetFor(state: CombatState, policy: Policy): string | undefined {
  const living = [...state.enemies.front, ...state.enemies.back].filter((enemy) => enemy.currentHp > 0);
  if (living.length === 0) return undefined;
  if (policy === "chemistry-aware") {
    return [...living].sort((a, b) => b.attack - a.attack || a.instanceId.localeCompare(b.instanceId))[0]?.instanceId;
  }
  return living[0]?.instanceId;
}

function actionFor(state: CombatState, actorId: string, partyStyle: PartyStyle, policy: Policy): PlayerAction {
  const actor = state.party.find((character) => character.id === actorId);
  const target = targetFor(state, policy);
  if (!actor || actor.hp <= 0 || !target) return { kind: "defend", actorId };
  if (actor.class === "Mage" && actor.sp >= 4 && partyStyle === "magic-heavy") {
    return { kind: "cast", actorId, spellId: "mage-spark", targetInstanceId: target };
  }
  if (actor.class === "Priest" && actor.sp >= 3 && partyStyle === "defensive") {
    const wounded = [...state.party].filter((character) => character.hp > 0 && character.hp < character.maxHp * 0.75).sort((a, b) => a.hp - b.hp)[0];
    if (wounded) return { kind: "cast", actorId, spellId: "priest-heal", targetAllyId: wounded.id };
  }
  return { kind: "attack", actorId, targetInstanceId: target };
}

function sumRecord(record: Record<string, number> | Partial<Record<string, number>>): number {
  return Object.values(record).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function incrementRecord(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) incrementRecord(target, key, value);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
}

type NonNullCombatEvent = Exclude<CombatEvent, null>;

function eventSlice(state: CombatState, cursor: number): NonNullCombatEvent[] {
  const events: NonNullCombatEvent[] = [];
  for (const event of state.events.slice(cursor)) {
    if (event !== null) events.push(event);
  }
  return events;
}

function runFight(spec: FormationSpec, partyStyle: PartyStyle, policy: Policy, seed: number): FightMetrics {
  const party = partyFor(partyStyle);
  const initialHp = party.reduce((sum, character) => sum + character.maxHp, 0);
  const initialSp = party.reduce((sum, character) => sum + character.sp, 0);
  const state = createCombatState(party, enemiesFor(spec), !!spec.boss, SPELLS);
  const gameplayRng = createSeededRng(seed * 7919 + 17);
  setCombatBarkLibraryRngForTests(createSeededRng(seed * 1543 + 31));
  const enemyNames = new Map([...state.enemies.front, ...state.enemies.back].map((enemy) => [enemy.instanceId, enemy.name]));
  const initialEnemyIds = new Set(enemyNames.keys());
  let current = state;
  let cursor = 0;
  const barkRounds: number[] = [];
  const displayedBySpeaker: Record<string, number> = {};
  const displayedByTrigger: Record<string, number> = {};
  const signatureAbilityUsage: Record<string, number> = {};
  let legacyBarkDisplayed = 0;
  const enemyKillOrder: string[] = [];
  let enemyActions = 0;
  let playerActions = 0;

  for (let round = 0; round < MAX_ROUNDS && !current.ended; round++) {
    const actions = current.party.filter((character) => character.hp > 0).map((character) => actionFor(current, character.id, partyStyle, policy));
    const next = resolveCombatRound(current, actions, gameplayRng);
    const events = eventSlice(next, cursor);
    cursor = next.events.length;
    for (const event of events) {
      const actorIsEnemy = initialEnemyIds.has(event.type === "defeated" ? event.targetId : "actorId" in event ? event.actorId : "");
      if ((event.type === "attack" || event.type === "ambush" || event.type === "cast") && actorIsEnemy) enemyActions++;
      if ((event.type === "attack" || event.type === "ambush" || event.type === "cast" || event.type === "technique" || event.type === "techniqueHit") && !actorIsEnemy) playerActions++;
      if (event.type === "cast" || event.type === "technique" || event.type === "techniqueHit") incrementRecord(signatureAbilityUsage, event.type);
      if (event.type === "defeated" && event.wasEnemy && initialEnemyIds.has(event.targetId)) {
        enemyKillOrder.push(enemyNames.get(event.targetId) ?? event.targetId);
      }
      if (event.type === "bark") {
        if (event.source === "legacy") {
          legacyBarkDisplayed++;
        } else {
          barkRounds.push(next.round);
          incrementRecord(displayedBySpeaker, event.speaker ?? event.actorId);
          incrementRecord(displayedByTrigger, event.trigger);
        }
      }
    }
    current = next;
  }

  const telemetry = barkRuntimeTelemetry(current);
  const barkDisplayed = sumRecord(telemetry.selected);
  const barkOpportunities = sumRecord(telemetry.opportunities);
  const barkEligible = sumRecord(telemetry.eligible);
  const barkSuppressed = sumRecord(telemetry.suppressed);
  const koCount = current.party.filter((character) => character.hp <= 0).length;
  const hpLost = Math.max(0, initialHp - current.party.reduce((sum, character) => sum + Math.max(0, character.hp), 0));
  const lineCounts = telemetry.lines;
  const normalEnemiesConsumed = 0;
  const averageRoundsBetweenBarks = barkRounds.length > 1
    ? barkRounds.slice(1).reduce((sum, round, index) => sum + round - barkRounds[index]!, 0) / (barkRounds.length - 1)
    : null;

  return {
    formationId: spec.id,
    family: spec.family,
    seed,
    party: partyStyle,
    policy,
    api: "round-based",
    victory: current.result === "victory",
    wipe: current.result === "wipe",
    fled: current.result === "fled",
    rounds: current.round,
    koCount,
    hpLost,
    hpLossPercent: initialHp > 0 ? hpLost / initialHp : 0,
    spMpUsed: Math.max(0, initialSp - current.party.reduce((sum, character) => sum + character.sp, 0)),
    consumablesUsed: 0,
    firstEnemyKilled: enemyKillOrder[0] ?? null,
    enemyKillOrder,
    enemyActions,
    playerActions,
    chemistryPresent: false,
    chemistryEligible: false,
    chemistryTelegraphed: 0,
    chemistryAttempted: 0,
    chemistryResolved: 0,
    chemistryBrokenByPlayer: 0,
    signatureAbilityUsage,
    guardInterceptions: 0,
    aoeGuardBypass: 0,
    summonsCreated: 0,
    summonsConsumed: 0,
    normalEnemiesConsumed,
    rewardsEarned: { xp: current.xpEarned, gold: current.goldEarned },
    barkOpportunities,
    barkOpportunitiesByTrigger: { ...telemetry.opportunities },
    barkEligible,
    barkEligibleByTrigger: { ...telemetry.eligible },
    barkDisplayed,
    legacyBarkDisplayed,
    barkSuppressed,
    barkDisplayedByTrigger: displayedByTrigger,
    barkSuppressedByTrigger: { ...telemetry.suppressed },
    barkSuppressionReasons: { ...telemetry.suppressionReasons },
    barkDisplayedBySpeaker: displayedBySpeaker,
    barkLineCounts: { ...telemetry.lines },
    barkLinesSeen: sumRecord(lineCounts),
    barkUniqueLines: telemetry.uniqueLines.length,
    barkRounds,
    averageRoundsBetweenBarks,
    presentationDurationMs: null,
  };
}

function summarize(fights: FightMetrics[]): CellSummary {
  const rounds = fights.map((fight) => fight.rounds);
  const hpLoss = fights.map((fight) => fight.hpLossPercent);
  const displayedBySpeaker: Record<string, number> = {};
  const displayedByTrigger: Record<string, number> = {};
  const opportunitiesByTrigger: Record<string, number> = {};
  const eligibleByTrigger: Record<string, number> = {};
  const suppressedByTrigger: Record<string, number> = {};
  const barkCountHistogram: Record<string, number> = {};
  const repeatedLineKeys: Record<string, number> = {};
  const allLineUses = new Map<string, number>();
  for (const fight of fights) {
    mergeRecord(displayedBySpeaker, fight.barkDisplayedBySpeaker);
    mergeRecord(displayedByTrigger, fight.barkDisplayedByTrigger);
    mergeRecord(opportunitiesByTrigger, fight.barkOpportunitiesByTrigger);
    mergeRecord(eligibleByTrigger, fight.barkEligibleByTrigger);
    mergeRecord(suppressedByTrigger, fight.barkSuppressedByTrigger);
    incrementRecord(barkCountHistogram, String(fight.barkDisplayed));
  }
  for (const fight of fights) {
    for (const [key, count] of Object.entries(fight.barkLineCounts)) {
      allLineUses.set(key, (allLineUses.get(key) ?? 0) + count);
    }
  }
  for (const [key, count] of allLineUses) if (count > 1) repeatedLineKeys[key] = count;
  const opportunities = fights.reduce((sum, fight) => sum + fight.barkOpportunities, 0);
  const suppressed = fights.reduce((sum, fight) => sum + fight.barkSuppressed, 0);
  return {
    formationId: fights[0]!.formationId,
    family: fights[0]!.family,
    party: fights[0]!.party,
    policy: fights[0]!.policy,
    fights: fights.length,
    victories: fights.filter((fight) => fight.victory).length,
    wipes: fights.filter((fight) => fight.wipe).length,
    flees: fights.filter((fight) => fight.fled).length,
    meanRounds: rounds.reduce((sum, value) => sum + value, 0) / fights.length,
    medianRounds: percentile(rounds, 0.5),
    p90Rounds: percentile(rounds, 0.9),
    meanHpLossPercent: hpLoss.reduce((sum, value) => sum + value, 0) / fights.length,
    p90HpLossPercent: percentile(hpLoss, 0.9),
    koRate: fights.reduce((sum, fight) => sum + (fight.koCount > 0 ? 1 : 0), 0) / fights.length,
    meanBarkOpportunities: opportunities / fights.length,
    meanBarkDisplayed: fights.reduce((sum, fight) => sum + fight.barkDisplayed, 0) / fights.length,
    meanLegacyBarkDisplayed: fights.reduce((sum, fight) => sum + fight.legacyBarkDisplayed, 0) / fights.length,
    totalLineUses: fights.reduce((sum, fight) => sum + fight.barkLinesSeen, 0),
    uniqueLinesExposed: allLineUses.size,
    meanUniqueLinesPerFight: fights.reduce((sum, fight) => sum + fight.barkUniqueLines, 0) / fights.length,
    barkSuppressionRate: opportunities > 0 ? suppressed / opportunities : 0,
    opportunitiesByTrigger,
    eligibleByTrigger,
    suppressedByTrigger,
    barkCountHistogram,
    meanRoundsBetweenBarks: fights.filter((fight) => fight.averageRoundsBetweenBarks !== null).length > 0
      ? fights.filter((fight) => fight.averageRoundsBetweenBarks !== null).reduce((sum, fight) => sum + (fight.averageRoundsBetweenBarks ?? 0), 0) / fights.filter((fight) => fight.averageRoundsBetweenBarks !== null).length
      : null,
    averageSecondsBetweenBarks: null,
    battlesWithZeroBarks: fights.filter((fight) => fight.barkDisplayed === 0).length,
    battlesWithFourOrMoreBarks: fights.filter((fight) => fight.barkDisplayed >= 4).length,
    displayedBySpeaker,
    displayedByTrigger,
    repeatedLineKeys,
    sampleFight: fights[0]!,
  };
}

function main(): void {
  const cells: CellSummary[] = [];
  let fightCount = 0;
  for (const formation of FORMATIONS) {
    for (const party of PARTIES) {
      for (const policy of POLICIES) {
        const fights = Array.from({ length: SEEDS_PER_CELL }, (_, index) => runFight(formation, party, policy, index + 1));
        cells.push(summarize(fights));
        fightCount += fights.length;
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    seedsPerCell: SEEDS_PER_CELL,
    fightCount,
    resolver: "resolveCombatRound",
    chemistry: "dormant on this branch; no Formation Chemistry code imported",
    metricSchema: Object.keys(cells[0]?.sampleFight ?? {}),
    cells,
  };
  const output = resolve(dirname(new URL(import.meta.url).pathname), "../../docs/playtests/2026-08-15-combat-bark-exposure.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const totalOpportunities = cells.reduce((sum, cell) => sum + cell.meanBarkOpportunities * cell.fights, 0);
  const totalDisplayed = cells.reduce((sum, cell) => sum + cell.meanBarkDisplayed * cell.fights, 0);
  console.log(`Wrote ${output}`);
  console.log(`${fightCount} fights; ${Math.round(totalOpportunities)} library opportunities; ${Math.round(totalDisplayed)} displayed; suppression ${((1 - totalDisplayed / Math.max(1, totalOpportunities)) * 100).toFixed(1)}%`);
}

main();
