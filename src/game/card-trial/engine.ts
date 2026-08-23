/**
 * Card Trial PoC rules engine.
 * Deterministic, DOM-free, no campaign combat imports.
 */

import { CARD_DEFS, deckListFor } from "./cards";
import { encounterById } from "./encounters";
import { createShuffleStream, shuffleInPlace } from "./rng";
import type {
  CardId,
  CardInstance,
  CardPlayTargets,
  CardTrialEvent,
  CardTrialPlayerView,
  CardTrialResult,
  CardTrialState,
  CardTrialTelemetry,
  ConsumeKind,
  EnemyState,
  HandCardView,
  HeroId,
  HeroState,
  HeroTurnRecord,
  Intent,
  IntentPreview,
  OpenedRecord,
  PlayCardResult,
  PlayerRow,
  QueueActor,
  ShuffleStream,
} from "./types";
import { DRAW_PER_TURN, ENERGY_PER_TURN, HERO_MAX_HP, MOVE_COST } from "./types";

export const RAT_KING: HeroId = "rat-king";
export const OLD_MAN: HeroId = "old-man";

const HERO_NAMES: Record<HeroId, string> = {
  "rat-king": "Rat King",
  "old-man": "Old Man",
};

function livingEnemies(s: CardTrialState): EnemyState[] {
  return s.enemies.filter((e) => e.hp > 0);
}

function livingHeroes(s: CardTrialState): HeroState[] {
  return ([RAT_KING, OLD_MAN] as const).map((id) => s.heroes[id]).filter((h) => h.hp > 0);
}

function enemyById(s: CardTrialState, id: string): EnemyState | undefined {
  return s.enemies.find((e) => e.id === id);
}

function otherHero(id: HeroId): HeroId {
  return id === RAT_KING ? OLD_MAN : RAT_KING;
}

function oppositeRow(row: PlayerRow): PlayerRow {
  return row === "front" ? "back" : "front";
}

function mintUid(s: CardTrialState, defId: CardId): string {
  s.uidSeq += 1;
  return `${defId}#${s.uidSeq}`;
}

function buildDeck(s: CardTrialState, hero: HeroId): CardInstance[] {
  return deckListFor(hero).map((defId) => ({ uid: mintUid(s, defId), defId }));
}

function emptyTelemetry(): CardTrialTelemetry {
  const cardStats = {} as CardTrialTelemetry["cardStats"];
  for (const id of Object.keys(CARD_DEFS) as CardId[]) {
    cardStats[id] = { drawn: 0, played: 0, discarded: 0 };
  }
  return {
    turns: [],
    opened: [],
    intents: [],
    cardStats,
    moveOpportunityCost: 0,
    guardAbsorbed: 0,
    presentation: {
      decisionMs: [],
      targetChanges: 0,
      targetCancels: 0,
      detailHolds: 0,
      disabledAttempts: 0,
    },
    fights: [],
  };
}

function intentRecord(s: CardTrialState, enemy: EnemyState) {
  let rec = s.telemetry.intents.find((i) => i.enemyId === enemy.id && i.fightId === s.fightId);
  if (!rec) {
    rec = {
      enemyId: enemy.id,
      fightId: s.fightId,
      shown: 0,
      resolved: 0,
      missedEmpty: 0,
      canceledDead: 0,
      highestIndex: 0,
      wrapped: false,
    };
    s.telemetry.intents.push(rec);
  }
  return rec;
}

function markIntentShown(s: CardTrialState): void {
  for (const e of livingEnemies(s)) {
    intentRecord(s, e).shown += 1;
  }
}

function buildQueue(enemies: EnemyState[]): QueueActor[] {
  const fast = enemies
    .filter((e) => e.slot === "fast")
    .sort((a, b) => a.order - b.order)
    .map((e) => ({ kind: "enemy" as const, id: e.id }));
  const slow = enemies
    .filter((e) => e.slot === "slow")
    .sort((a, b) => a.order - b.order)
    .map((e) => ({ kind: "enemy" as const, id: e.id }));
  return [{ kind: "hero", id: RAT_KING }, ...fast, { kind: "hero", id: OLD_MAN }, ...slow];
}

function enterRow(s: CardTrialState, hero: HeroState, row: PlayerRow): void {
  if (hero.row === row) return;
  s.entryClock += 1;
  hero.row = row;
  hero.rowEnteredAt = s.entryClock;
}

function currentIntent(enemy: EnemyState): Intent {
  return enemy.cycle[enemy.intentIndex % enemy.cycle.length]!;
}

function advanceIntent(s: CardTrialState, enemy: EnemyState): void {
  const rec = intentRecord(s, enemy);
  const before = enemy.intentIndex;
  enemy.intentIndex = (enemy.intentIndex + 1) % enemy.cycle.length;
  rec.highestIndex = Math.max(rec.highestIndex, before);
  if (enemy.intentIndex === 0 && before > 0) rec.wrapped = true;
}

export function heroesInRow(s: CardTrialState, row: PlayerRow): HeroState[] {
  return livingHeroes(s).filter((h) => h.row === row);
}

export function singleTargetInRow(s: CardTrialState, row: PlayerRow): HeroState | null {
  const here = heroesInRow(s, row);
  if (here.length === 0) return null;
  if (here.length === 1) return here[0]!;
  here.sort((a, b) => {
    if (a.hp !== b.hp) return a.hp - b.hp;
    return b.rowEnteredAt - a.rowEnteredAt;
  });
  return here[0]!;
}

function applyDamageToHero(
  s: CardTrialState,
  hero: HeroState,
  raw: number,
  events: CardTrialEvent[],
  enemyId: string
): void {
  const absorbed = Math.min(hero.guard, raw);
  hero.guard -= absorbed;
  const hpLoss = raw - absorbed;
  if (hpLoss > 0) hero.hp = Math.max(0, hero.hp - hpLoss);
  events.push({
    type: "intent-hit",
    enemyId,
    targetId: hero.id,
    damage: hpLoss,
    absorbed,
  });
  s.telemetry.guardAbsorbed += absorbed;
  if (hero.hp <= 0) {
    events.push({ type: "defeated", targetId: hero.id, wasEnemy: false });
  }
}

function dealToEnemy(
  s: CardTrialState,
  enemy: EnemyState,
  amount: number,
  actorId: string,
  events: CardTrialEvent[]
): number {
  if (enemy.hp <= 0 || amount <= 0) return 0;
  const dealt = Math.min(enemy.hp, amount);
  enemy.hp -= dealt;
  events.push({ type: "attack", actorId, targetId: enemy.id, damage: dealt });
  if (s.openTurn) s.openTurn.damageDealt += dealt;
  if (enemy.hp <= 0) {
    events.push({ type: "defeated", targetId: enemy.id, wasEnemy: true });
    if (s.opened?.enemyId === enemy.id) {
      finishOpened(s, { diedUnconsumed: s.opened.createdBy !== undefined && true, consumedBy: null });
    }
  }
  return dealt;
}

function finishOpened(
  s: CardTrialState,
  opts: { diedUnconsumed: boolean; consumedBy: HeroId | null }
): void {
  if (!s.opened) return;
  const rec: OpenedRecord = {
    openedCreatedBy: s.opened.createdBy,
    openedConsumedBy: opts.consumedBy,
    lifetimeSlots: s.slotCounter - s.opened.createdAtSlot,
    movedBeforeConsume: s.opened.movedBeforeConsume,
    diedUnconsumed: opts.diedUnconsumed && !opts.consumedBy,
  };
  s.telemetry.opened.push(rec);
  s.opened = null;
}

function applyOpened(s: CardTrialState, enemy: EnemyState, by: HeroId, events: CardTrialEvent[]): void {
  if (s.opened && s.opened.enemyId !== enemy.id) {
    s.opened.movedBeforeConsume = true;
    s.opened.enemyId = enemy.id;
    s.opened.createdBy = by;
    s.opened.createdAtSlot = s.slotCounter;
  } else if (!s.opened) {
    s.opened = {
      enemyId: enemy.id,
      createdBy: by,
      createdAtSlot: s.slotCounter,
      movedBeforeConsume: false,
    };
  }
  events.push({ type: "open", targetId: enemy.id });
}

function consumeOpened(s: CardTrialState, enemy: EnemyState, by: HeroId, events: CardTrialEvent[]): void {
  if (!s.opened || s.opened.enemyId !== enemy.id) return;
  events.push({ type: "consume", targetId: enemy.id });
  s.consumedThisTurn = true;
  finishOpened(s, { diedUnconsumed: false, consumedBy: by });
}

function gainGuard(s: CardTrialState, hero: HeroState, amount: number, events: CardTrialEvent[]): void {
  hero.guard += amount;
  events.push({ type: "guard", actorId: hero.id, amount });
  if (s.openTurn) s.openTurn.guardGained += amount;
}

function drawOne(s: CardTrialState, hero: HeroState): CardInstance | null {
  if (hero.draw.length === 0) {
    if (hero.discard.length === 0) return null;
    shuffleInPlace(hero.discard, s.streams[hero.id]);
    hero.draw = hero.discard;
    hero.discard = [];
  }
  const card = hero.draw.shift();
  if (!card) return null;
  s.telemetry.cardStats[card.defId].drawn += 1;
  return card;
}

function legalConsume(
  s: CardTrialState,
  defId: CardId,
  targetId: string | undefined
): boolean {
  const def = CARD_DEFS[defId];
  if (def.consume === "none") return false;
  if (!s.opened) return false;
  if (def.consume === "second-enemy") {
    if (!targetId || s.opened.enemyId !== targetId) return false;
    return livingEnemies(s).some((e) => e.id !== targetId);
  }
  if (!targetId) return false;
  return s.opened.enemyId === targetId;
}

function consumeCardsInHand(s: CardTrialState, hero: HeroState): CardId[] {
  const out: CardId[] = [];
  for (const c of hero.hand) {
    const def = CARD_DEFS[c.defId];
    if (def.consume === "none") continue;
    if (!s.opened) continue;
    if (def.consume === "second-enemy") {
      if (livingEnemies(s).length >= 2) out.push(c.defId);
    } else {
      out.push(c.defId);
    }
  }
  return out;
}

function closeOpenTurn(s: CardTrialState, discarded: CardId[], energyRemaining: number): void {
  const rec = s.openTurn;
  if (!rec) return;
  rec.cardsDiscarded = discarded;
  rec.energyRemaining = energyRemaining;
  rec.endingRow = s.heroes[rec.hero].row;
  rec.hpLostAfter = 0;
  if (
    rec.paidMove &&
    discarded.some((id) => CARD_DEFS[id].cost === 1)
  ) {
    s.telemetry.moveOpportunityCost += 1;
  }
  if (
    s.openedAtTurnStart &&
    rec.hero &&
    s.consumeCardsAtTurnStart.length > 0 &&
    !s.consumedThisTurn &&
    !s.consumeAttemptedThisTurn
  ) {
    rec.actions.push(
      `openedAvailableButDeclined:${s.consumeCardsAtTurnStart.join(",")}`
    );
  }
  s.telemetry.turns.push(rec);
  s.hpAtHeroTurnEnd[rec.hero] = s.heroes[rec.hero].hp;
  s.lastHeroToAct = rec.hero;
  s.openTurn = null;
}

export function startHeroCardTurn(s: CardTrialState, heroId: HeroId): void {
  const hero = s.heroes[heroId];
  const leftoverGuard = hero.guard;
  hero.guard = 0;
  hero.energy = ENERGY_PER_TURN;
  hero.paidMoveUsed = false;
  hero.hand = [];
  for (let i = 0; i < DRAW_PER_TURN; i++) {
    const card = drawOne(s, hero);
    if (card) hero.hand.push(card);
  }
  s.phase = "hero-turn";
  s.openedAtTurnStart = s.opened?.enemyId ?? null;
  s.consumeCardsAtTurnStart = consumeCardsInHand(s, hero);
  s.consumedThisTurn = false;
  s.consumeAttemptedThisTurn = false;
  const partner = s.heroes[otherHero(heroId)];
  s.openTurn = {
    fightId: s.fightId,
    round: s.round,
    hero: heroId,
    hp: hero.hp,
    partnerHp: partner.hp,
    row: hero.row,
    guard: leftoverGuard,
    startingEnergy: ENERGY_PER_TURN,
    startingHand: hero.hand.map((c) => c.defId),
    enemyHp: Object.fromEntries(s.enemies.map((e) => [e.id, e.hp])),
    openedTarget: s.opened?.enemyId ?? null,
    ratRow: s.rat?.row ?? null,
    pendingIntents: livingEnemies(s).map((e) => formatIntentLabel(e)),
    actions: [],
    cardsPlayed: [],
    paidMove: false,
    cardPrintedMovement: false,
    cardsDiscarded: [],
    energyRemaining: ENERGY_PER_TURN,
    endingRow: hero.row,
    damageDealt: 0,
    guardGained: 0,
    hpLostAfter: 0,
  };
}

function formatIntentLabel(e: EnemyState): string {
  const intent = currentIntent(e);
  if (intent.kind === "row") {
    return `${e.name.toUpperCase()} — our ${intent.row === "front" ? "Front" : "Back"} — ${intent.damage}`;
  }
  if (intent.kind === "both-rows") {
    return `${e.name.toUpperCase()} — both rows — ${intent.damage} each`;
  }
  const who = intent.heroId === RAT_KING ? "Rat King" : "Old Man";
  return `${e.name.toUpperCase()} — ${who} in ${intent.row === "front" ? "Front" : "Back"} — ${intent.damage}`;
}

function checkEnd(s: CardTrialState): boolean {
  if (s.result) return true;
  if (livingEnemies(s).length === 0) {
    s.result = "victory";
    s.phase = "result";
    recordFight(s, "victory");
    return true;
  }
  if (livingHeroes(s).length === 0) {
    s.result = "wipe";
    s.phase = "result";
    recordFight(s, "wipe");
    return true;
  }
  return false;
}

function recordFight(s: CardTrialState, result: CardTrialResult): void {
  attributePostHeroDamage(s);
  s.telemetry.fights.push({
    fightId: s.fightId,
    result,
    rounds: s.round,
    ratKingHp: s.heroes[RAT_KING].hp,
    oldManHp: s.heroes[OLD_MAN].hp,
    enemyTurns: s.telemetry.intents
      .filter((i) => i.fightId === s.fightId)
      .reduce((n, i) => n + i.resolved, 0),
  });
}

function actorAlive(s: CardTrialState, actor: QueueActor): boolean {
  if (actor.kind === "hero") return s.heroes[actor.id as HeroId].hp > 0;
  return (enemyById(s, actor.id)?.hp ?? 0) > 0;
}

function attributePostHeroDamage(s: CardTrialState): void {
  const last = s.lastHeroToAct;
  if (!last) return;
  const rec = [...s.telemetry.turns].reverse().find((t) => t.hero === last && t.hpLostAfter === 0);
  if (!rec) return;
  const now = s.heroes[last].hp;
  const then = s.hpAtHeroTurnEnd[last];
  if (then !== undefined) rec.hpLostAfter = Math.max(0, then - now);
}

export function continueInitiative(s: CardTrialState): CardTrialEvent[] {
  const events: CardTrialEvent[] = [];
  if (s.result) return events;
  while (!s.result) {
    s.queueIndex += 1;
    if (s.queueIndex >= s.queue.length) {
      s.queueIndex = 0;
      s.round += 1;
      markIntentShown(s);
    }
    const actor = s.queue[s.queueIndex];
    if (!actor) break;
    if (!actorAlive(s, actor)) {
      if (actor.kind === "enemy") {
        const e = enemyById(s, actor.id);
        if (e) intentRecord(s, e).canceledDead += 1;
      }
      continue;
    }
    s.slotCounter += 1;
    if (actor.kind === "hero") {
      attributePostHeroDamage(s);
      startHeroCardTurn(s, actor.id as HeroId);
      return events;
    }
    s.phase = "enemy-turn";
    events.push(...resolveEnemyIntent(s, actor.id));
    if (checkEnd(s)) return events;
  }
  return events;
}

function resolveEnemyIntent(s: CardTrialState, enemyId: string): CardTrialEvent[] {
  const events: CardTrialEvent[] = [];
  const enemy = enemyById(s, enemyId);
  if (!enemy || enemy.hp <= 0) {
    if (enemy) intentRecord(s, enemy).canceledDead += 1;
    return events;
  }
  const rec = intentRecord(s, enemy);
  rec.resolved += 1;
  const intent = currentIntent(enemy);
  events.push({ type: "banner", text: formatIntentLabel(enemy), actorId: enemy.id });

  const hitRow = (row: PlayerRow, damage: number, wide: boolean) => {
    const here = heroesInRow(s, row);
    if (here.length === 0) {
      events.push({ type: "intent-miss", enemyId: enemy.id });
      rec.missedEmpty += 1;
      return;
    }
    if (wide) {
      for (const h of here) applyDamageToHero(s, h, damage, events, enemy.id);
      return;
    }
    const target = singleTargetInRow(s, row);
    if (target) applyDamageToHero(s, target, damage, events, enemy.id);
  };

  if (intent.kind === "row") {
    hitRow(intent.row, intent.damage, false);
  } else if (intent.kind === "both-rows") {
    hitRow("front", intent.damage, true);
    hitRow("back", intent.damage, true);
  } else {
    const hero = s.heroes[intent.heroId];
    if (hero.hp <= 0 || hero.row !== intent.row) {
      events.push({ type: "intent-miss", enemyId: enemy.id });
      rec.missedEmpty += 1;
    } else {
      applyDamageToHero(s, hero, intent.damage, events, enemy.id);
    }
  }

  advanceIntent(s, enemy);
  s.events.push(...events);
  return events;
}

export function createFight(
  fightId: number,
  opts?: { seed?: number; telemetry?: CardTrialTelemetry }
): CardTrialState {
  const enc = encounterById(fightId);
  const seed = opts?.seed ?? 1;
  const streams: Record<HeroId, ShuffleStream> = {
    "rat-king": createShuffleStream(seed * 17 + fightId * 31 + 3),
    "old-man": createShuffleStream(seed * 19 + fightId * 37 + 7),
  };
  const s: CardTrialState = {
    fightId,
    fightName: enc.name,
    round: 1,
    heroes: {
      "rat-king": {
        id: RAT_KING,
        name: HERO_NAMES[RAT_KING],
        hp: HERO_MAX_HP,
        maxHp: HERO_MAX_HP,
        guard: 0,
        row: "front",
        rowEnteredAt: 1,
        draw: [],
        discard: [],
        hand: [],
        energy: 0,
        paidMoveUsed: false,
      },
      "old-man": {
        id: OLD_MAN,
        name: HERO_NAMES[OLD_MAN],
        hp: HERO_MAX_HP,
        maxHp: HERO_MAX_HP,
        guard: 0,
        row: "back",
        rowEnteredAt: 2,
        draw: [],
        discard: [],
        hand: [],
        energy: 0,
        paidMoveUsed: false,
      },
    },
    enemies: enc.enemies.map((e) => ({ ...e, hp: e.maxHp, intentIndex: 0 })),
    opened: null,
    rat: null,
    queue: [],
    queueIndex: -1,
    phase: "hero-turn",
    result: null,
    streams,
    entryClock: 2,
    slotCounter: 0,
    uidSeq: 0,
    events: [],
    telemetry: opts?.telemetry ?? emptyTelemetry(),
    openTurn: null,
    openedAtTurnStart: null,
    consumeCardsAtTurnStart: [],
    consumedThisTurn: false,
    consumeAttemptedThisTurn: false,
    lastHeroToAct: null,
    hpAtHeroTurnEnd: { "rat-king": HERO_MAX_HP, "old-man": HERO_MAX_HP },
  };
  s.queue = buildQueue(s.enemies);
  for (const heroId of [RAT_KING, OLD_MAN] as const) {
    const deck = buildDeck(s, heroId);
    shuffleInPlace(deck, s.streams[heroId]);
    s.heroes[heroId].draw = deck;
  }
  markIntentShown(s);
  continueInitiative(s);
  return s;
}

export function nextFight(prev: CardTrialState, fightId: number): CardTrialState {
  return createFight(fightId, { seed: prev.streams["rat-king"].getState(), telemetry: prev.telemetry });
}

function pullFromPiles(hero: HeroState, defId: CardId): CardInstance | null {
  const fromDraw = hero.draw.findIndex((c) => c.defId === defId);
  if (fromDraw >= 0) {
    const [card] = hero.draw.splice(fromDraw, 1);
    return card ?? null;
  }
  const fromDisc = hero.discard.findIndex((c) => c.defId === defId);
  if (fromDisc >= 0) {
    const [card] = hero.discard.splice(fromDisc, 1);
    return card ?? null;
  }
  return null;
}

/**
 * Spec §9 adversarial triangle: RK Front, OM Back, Rat Front, Ash Opened,
 * hand Heap / Nip / Nip / Tide / Swarm, energy 3, intents index 0.
 */
export function createAdversarialTriangle(opts?: { seed?: number }): CardTrialState {
  const s = createFight(2, { seed: opts?.seed ?? 99 });
  // Undo the auto-drawn opening hand and rebuild the locked five.
  const rk = s.heroes[RAT_KING];
  rk.discard.push(...rk.hand);
  rk.hand = [];
  const wanted: CardId[] = [
    "king-of-the-heap",
    "nip",
    "nip",
    "tide",
    "swarm-the-wound",
  ];
  for (const id of wanted) {
    const card = pullFromPiles(rk, id);
    if (!card) throw new Error(`triangle: missing ${id}`);
    rk.hand.push(card);
  }
  rk.energy = ENERGY_PER_TURN;
  rk.paidMoveUsed = false;
  rk.guard = 0;
  rk.row = "front";
  rk.rowEnteredAt = 1;
  s.heroes[OLD_MAN].row = "back";
  s.heroes[OLD_MAN].rowEnteredAt = 2;
  s.heroes[OLD_MAN].hp = HERO_MAX_HP;
  rk.hp = HERO_MAX_HP;
  s.rat = { row: "front" };
  const ash = enemyById(s, "ash")!;
  ash.hp = 22;
  s.opened = {
    enemyId: "ash",
    createdBy: RAT_KING,
    createdAtSlot: s.slotCounter,
    movedBeforeConsume: false,
  };
  for (const e of s.enemies) e.intentIndex = 0;
  if (s.openTurn) {
    s.openTurn.startingHand = rk.hand.map((c) => c.defId);
    s.openTurn.openedTarget = "ash";
    s.openTurn.ratRow = "front";
    s.openTurn.pendingIntents = livingEnemies(s).map((e) => formatIntentLabel(e));
  }
  s.openedAtTurnStart = "ash";
  s.consumeCardsAtTurnStart = consumeCardsInHand(s, rk);
  s.consumedThisTurn = false;
  s.consumeAttemptedThisTurn = false;
  s.phase = "hero-turn";
  s.queueIndex = 0;
  return s;
}

export function canPaidMove(s: CardTrialState): { ok: boolean; reason: string | null } {
  if (s.phase !== "hero-turn" || s.result) return { ok: false, reason: "Not your turn" };
  const hero = actingHero(s);
  if (!hero) return { ok: false, reason: "Not your turn" };
  if (hero.paidMoveUsed) return { ok: false, reason: "Move already used" };
  if (hero.energy < MOVE_COST) return { ok: false, reason: "Need 1 energy" };
  return { ok: true, reason: null };
}

export function actingHero(s: CardTrialState): HeroState | null {
  if (s.phase !== "hero-turn") return null;
  const actor = s.queue[s.queueIndex];
  if (!actor || actor.kind !== "hero") return null;
  return s.heroes[actor.id as HeroId];
}

export function paidMove(s: CardTrialState): PlayCardResult {
  const gate = canPaidMove(s);
  if (!gate.ok) return { ok: false, reason: gate.reason ?? "Cannot move", events: [] };
  const hero = actingHero(s)!;
  hero.energy -= MOVE_COST;
  hero.paidMoveUsed = true;
  enterRow(s, hero, oppositeRow(hero.row));
  const events: CardTrialEvent[] = [
    { type: "hero-move", actorId: hero.id, row: hero.row, via: "paid" },
  ];
  if (s.openTurn) {
    s.openTurn.paidMove = true;
    s.openTurn.actions.push(`move:${hero.row}`);
    s.openTurn.energyRemaining = hero.energy;
  }
  s.events.push(...events);
  return { ok: true, events };
}

function cardDisabledReason(s: CardTrialState, hero: HeroState, card: CardInstance): string | null {
  const def = CARD_DEFS[card.defId];
  if (hero.energy < def.cost) return `Not enough energy (costs ${def.cost})`;
  if (def.target === "single-enemy" && livingEnemies(s).length === 0) return "No enemy";
  return null;
}

export function playCard(s: CardTrialState, uid: string, targets: CardPlayTargets = {}): PlayCardResult {
  const hero = actingHero(s);
  if (!hero) return { ok: false, reason: "Not your turn", events: [] };
  const idx = hero.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return { ok: false, reason: "Card not in hand", events: [] };
  const card = hero.hand[idx]!;
  const def = CARD_DEFS[card.defId];
  const why = cardDisabledReason(s, hero, card);
  if (why) return { ok: false, reason: why, events: [] };

  if (def.target === "single-enemy") {
    if (!targets.targetId) return { ok: false, reason: "Choose a target", events: [] };
    const target = enemyById(s, targets.targetId);
    if (!target || target.hp <= 0) return { ok: false, reason: "Invalid target", events: [] };
  }

  const consumeNow = legalConsume(s, def.id, targets.targetId);
  if (def.consume === "second-enemy" && consumeNow && !targets.secondTargetId) {
    return { ok: false, reason: "Choose a second enemy", events: [], needsSecondTarget: true };
  }
  if (def.consume === "second-enemy" && consumeNow && targets.secondTargetId === targets.targetId) {
    return { ok: false, reason: "Second enemy must be different", events: [], needsSecondTarget: true };
  }
  if (def.consume === "second-enemy" && consumeNow) {
    const second = enemyById(s, targets.secondTargetId!);
    if (!second || second.hp <= 0) {
      return { ok: false, reason: "Invalid second target", events: [], needsSecondTarget: true };
    }
  }

  hero.energy -= def.cost;
  hero.hand.splice(idx, 1);
  hero.discard.push(card);
  s.telemetry.cardStats[def.id].played += 1;
  if (s.openTurn) {
    s.openTurn.cardsPlayed.push(def.id);
    s.openTurn.actions.push(`play:${def.id}`);
    s.openTurn.energyRemaining = hero.energy;
  }

  const events: CardTrialEvent[] = [{ type: "banner", text: def.name, actorId: hero.id }];
  resolveCardEffect(s, hero, def.id, targets, consumeNow, events);
  if (consumeNow) {
    s.consumeAttemptedThisTurn = true;
    if (!s.consumedThisTurn) {
      s.openTurn?.actions.push(`consumeCardPlayedBaseKilledTarget:${def.id}`);
    }
  }
  s.events.push(...events);
  checkEnd(s);
  return { ok: true, events };
}

function resolveCardEffect(
  s: CardTrialState,
  hero: HeroState,
  id: CardId,
  targets: CardPlayTargets,
  consumeNow: boolean,
  events: CardTrialEvent[]
): void {
  const target = targets.targetId ? enemyById(s, targets.targetId) : undefined;
  const hit = (enemy: EnemyState, n: number) => dealToEnemy(s, enemy, n, hero.id, events);
  const bite = (enemy: EnemyState, n: number) => {
    events.push({ type: "rat-bite", targetId: enemy.id, damage: n });
    dealToEnemy(s, enemy, n, "rat", events);
  };

  switch (id) {
    case "nip":
      if (target) hit(target, 5);
      break;
    case "brace":
      gainGuard(s, hero, 6, events);
      break;
    case "open-the-rank":
      if (target) {
        hit(target, 4);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "from-the-dark":
      if (target) {
        hit(target, 4);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
        if (hero.row === "back" && s.rat && target.hp > 0) bite(target, 3);
      }
      break;
    case "swarm-the-wound":
      if (target) {
        hit(target, 5);
        if (consumeNow && target.hp > 0) {
          consumeOpened(s, target, hero.id, events);
          hit(target, 4);
        }
      }
      break;
    case "burst-the-nest":
      if (target) {
        const primaryId = target.id;
        hit(target, 8);
        if (consumeNow) {
          if (s.opened?.enemyId === primaryId) consumeOpened(s, target, hero.id, events);
          for (const other of livingEnemies(s).filter((e) => e.id !== primaryId)) {
            hit(other, 4);
          }
        }
      }
      break;
    case "litter":
      if (target) hit(target, 4);
      if (!s.rat) {
        s.rat = { row: hero.row };
        events.push({ type: "spawn-rat", row: hero.row });
      }
      break;
    case "send-the-rat":
      if (s.rat && target) {
        s.rat.row = oppositeRow(s.rat.row);
        events.push({ type: "rat-move", row: s.rat.row });
        bite(target, 5);
      } else if (target) {
        hit(target, 4);
      }
      break;
    case "tide":
      if (target) hit(target, 5 + (hero.row === "front" ? 3 : 0));
      break;
    case "lunge": {
      enterRow(s, hero, "front");
      events.push({ type: "hero-move", actorId: hero.id, row: "front", via: "card" });
      if (s.openTurn) s.openTurn.cardPrintedMovement = true;
      if (target) hit(target, 5);
      break;
    }
    case "king-of-the-heap":
      if (target) hit(target, 7 + (hero.row === "front" ? 3 : 0));
      gainGuard(s, hero, 8, events);
      break;
    case "staff":
      if (target) hit(target, 6);
      break;
    case "ward":
      gainGuard(s, hero, 7, events);
      break;
    case "crack":
      if (target) {
        hit(target, 5);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "split-bone":
      if (target) {
        hit(target, 4);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "full-stop":
      if (target) {
        hit(target, 8);
        if (consumeNow && target.hp > 0) {
          consumeOpened(s, target, hero.id, events);
          hit(target, 8);
        }
      }
      break;
    case "cut-the-line":
      if (target) hit(target, 5);
      if (consumeNow && target) {
        consumeOpened(s, target, hero.id, events);
        const second = enemyById(s, targets.secondTargetId!);
        if (second) hit(second, 5);
      }
      break;
    case "threshold":
      if (target) hit(target, 5 + (hero.row === "front" ? 4 : 0));
      break;
    case "from-afar":
      if (target) hit(target, 5);
      if (hero.row === "back") gainGuard(s, hero, 3, events);
      break;
    case "parting-blow":
      if (target) hit(target, 4);
      enterRow(s, hero, "back");
      events.push({ type: "hero-move", actorId: hero.id, row: "back", via: "card" });
      if (s.openTurn) s.openTurn.cardPrintedMovement = true;
      break;
    case "extinguish":
      for (const e of livingEnemies(s)) hit(e, 4);
      break;
    case "stand-and-die":
      if (target) hit(target, 8 + (hero.row === "front" ? 3 : 0));
      gainGuard(s, hero, 9, events);
      break;
  }
}

export function endHeroTurn(s: CardTrialState): CardTrialEvent[] {
  const hero = actingHero(s);
  if (!hero) return [];
  const discarded = hero.hand.map((c) => c.defId);
  for (const c of hero.hand) {
    s.telemetry.cardStats[c.defId].discarded += 1;
    hero.discard.push(c);
  }
  hero.hand = [];
  const leftover = hero.energy;
  hero.energy = 0;
  closeOpenTurn(s, discarded, leftover);
  if (checkEnd(s)) return [];
  return continueInitiative(s);
}

export function intentPreviews(s: CardTrialState): IntentPreview[] {
  return livingEnemies(s).map((e) => previewIntent(s, e));
}

function previewIntent(s: CardTrialState, e: EnemyState): IntentPreview {
  const intent = currentIntent(e);
  const label = formatIntentLabel(e);
  const target: IntentPreview["target"] =
    intent.kind === "row"
      ? { kind: "row", row: intent.row }
      : intent.kind === "both-rows"
        ? { kind: "both-rows" }
        : { kind: "hero", heroId: intent.heroId, row: intent.row };
  const consequences: IntentPreview["consequences"] = [];
  let wouldMiss = false;
  let missIfEmpty = false;
  let rawDamage = 0;

  const pushHero = (hero: HeroState, raw: number, miss: boolean) => {
    const post = miss ? 0 : Math.max(0, raw - hero.guard);
    consequences.push({
      heroId: hero.id,
      heroName: hero.name,
      postGuard: post,
      lethal: !miss && post >= hero.hp,
      miss,
    });
  };

  if (intent.kind === "row") {
    rawDamage = intent.damage;
    missIfEmpty = true;
    const t = singleTargetInRow(s, intent.row);
    wouldMiss = !t;
    if (t) pushHero(t, intent.damage, false);
    else {
      for (const h of livingHeroes(s)) pushHero(h, intent.damage, true);
    }
  } else if (intent.kind === "both-rows") {
    rawDamage = intent.damage;
    missIfEmpty = heroesInRow(s, "front").length === 0 || heroesInRow(s, "back").length === 0;
    wouldMiss = heroesInRow(s, "front").length === 0 && heroesInRow(s, "back").length === 0;
    for (const row of ["front", "back"] as const) {
      const here = heroesInRow(s, row);
      if (here.length === 0) continue;
      for (const h of here) pushHero(h, intent.damage, false);
    }
  } else {
    rawDamage = intent.damage;
    const hero = s.heroes[intent.heroId];
    const miss = hero.hp <= 0 || hero.row !== intent.row;
    wouldMiss = miss;
    missIfEmpty = miss;
    pushHero(hero, intent.damage, miss);
  }

  return {
    enemyId: e.id,
    enemyName: e.name,
    label,
    target,
    rawDamage,
    consequences,
    missIfEmpty,
    wouldMiss,
  };
}

export function playerView(s: CardTrialState): CardTrialPlayerView {
  const hero = actingHero(s);
  const move = hero ? canPaidMove(s) : { ok: false, reason: "Not your turn" as string | null };
  const hand: HandCardView[] = (hero?.hand ?? []).map((c) => {
    const def = CARD_DEFS[c.defId];
    const reason = hero ? cardDisabledReason(s, hero, c) : "Not your turn";
    const consumeArmed = !!(hero && legalConsume(s, def.id, s.opened?.enemyId));
    const consumeDimmed = def.consume !== "none" && !consumeArmed;
    return {
      uid: c.uid,
      defId: def.id,
      name: def.name,
      cost: def.cost,
      text: def.text,
      opens: def.opens,
      consume: def.consume,
      disabled: !!reason,
      disabledReason: reason,
      consumeArmed,
      consumeDimmed,
    };
  });
  return {
    fightId: s.fightId,
    fightName: s.fightName,
    round: s.round,
    actingHero: hero?.id ?? null,
    phase: s.phase,
    result: s.result,
    energy: hero?.energy ?? 0,
    hand,
    moveAvailable: move.ok,
    moveDisabledReason: move.reason,
    drawCount: hero?.draw.length ?? 0,
    discardCount: hero?.discard.length ?? 0,
    heroes: ([RAT_KING, OLD_MAN] as const).map((id) => {
      const h = s.heroes[id];
      return {
        id: h.id,
        name: h.name,
        hp: h.hp,
        maxHp: h.maxHp,
        guard: h.guard,
        row: h.row,
        dead: h.hp <= 0,
      };
    }),
    enemies: s.enemies.map((e) => ({
      id: e.id,
      name: e.name,
      hp: e.hp,
      maxHp: e.maxHp,
      opened: s.opened?.enemyId === e.id,
      dead: e.hp <= 0,
      visualRow: e.visualRow,
    })),
    queue: s.queue.map((q, i) => {
      if (q.kind === "hero") {
        const h = s.heroes[q.id as typeof RAT_KING | typeof OLD_MAN];
        return {
          id: h.id,
          kind: "hero" as const,
          name: h.name,
          acting: i === s.queueIndex,
          done: i < s.queueIndex,
          dead: h.hp <= 0,
        };
      }
      const e = s.enemies.find((en) => en.id === q.id);
      return {
        id: q.id,
        kind: "enemy" as const,
        name: e?.name ?? q.id,
        acting: i === s.queueIndex,
        done: i < s.queueIndex,
        dead: !e || e.hp <= 0,
      };
    }),
    openedEnemyId: s.opened?.enemyId ?? null,
    ratRow: s.rat?.row ?? null,
    intents: intentPreviews(s),
    pileCountsOnly: true,
  };
}

export function handCard(s: CardTrialState, defId: CardId): CardInstance | undefined {
  const hero = actingHero(s);
  return hero?.hand.find((c) => c.defId === defId);
}

export function summarizeTelemetry(t: CardTrialTelemetry): string {
  const lines: string[] = ["# Card Trial run"];
  lines.push(`Fights: ${t.fights.length}`);
  for (const f of t.fights) {
    lines.push(
      `  Fight ${f.fightId}: ${f.result} · rounds ${f.rounds} · RK ${f.ratKingHp} HP · OM ${f.oldManHp} HP · enemy turns ${f.enemyTurns}`
    );
  }
  const turns = t.turns;
  const avgPlayed =
    turns.length === 0 ? 0 : turns.reduce((n, x) => n + x.cardsPlayed.length, 0) / turns.length;
  const unusedEnergy = turns.filter((x) => x.energyRemaining > 0).length;
  const rkMoves = turns.filter((x) => x.hero === RAT_KING && x.paidMove).length;
  const omMoves = turns.filter((x) => x.hero === OLD_MAN && x.paidMove).length;
  const stayedFront = turns.filter((x) => {
    const threatened = x.pendingIntents.some((label) => /our Front/i.test(label));
    return x.row === "front" && !x.paidMove && x.endingRow === "front" && threatened;
  }).length;
  const emptyMisses = t.intents.reduce((n, i) => n + i.missedEmpty, 0);
  const canceled = t.intents.reduce((n, i) => n + i.canceledDead, 0);
  const namedHits = turns.flatMap((x) => x.pendingIntents).filter((p) => /Rat King in |Old Man in /.test(p)).length;
  const bothRowShown = turns.flatMap((x) => x.pendingIntents).filter((p) => /both rows/i.test(p)).length;
  lines.push("");
  lines.push("## Position");
  lines.push(`Paid Moves: Rat King ${rkMoves}, Old Man ${omMoves}`);
  lines.push(`Move opportunity-cost events: ${t.moveOpportunityCost}`);
  lines.push(`Turns remaining in threatened Front: ${stayedFront}`);
  lines.push(`Empty-row misses: ${emptyMisses}`);
  const heap = t.cardStats["king-of-the-heap"];
  const stand = t.cardStats["stand-and-die"];
  lines.push(`King of the Heap drawn ${heap.drawn} played ${heap.played} discarded ${heap.discarded}`);
  lines.push(`Stand and Die drawn ${stand.drawn} played ${stand.played} discarded ${stand.discarded}`);
  const endingFront = turns.filter((x) => x.endingRow === "front").length;
  const endingBack = turns.filter((x) => x.endingRow === "back").length;
  lines.push(`Turn endings Front ${endingFront} / Back ${endingBack}`);
  lines.push("");
  lines.push("## Guard");
  const guardCards = ["brace", "ward", "king-of-the-heap", "stand-and-die", "from-afar"] as const;
  const guardPlayed = guardCards.reduce((n, id) => n + t.cardStats[id].played, 0);
  const guardGained = turns.reduce((n, x) => n + x.guardGained, 0);
  lines.push(`Guard cards played: ${guardPlayed}`);
  lines.push(`Guard gained: ${guardGained}`);
  lines.push(`Damage absorbed by Guard: ${t.guardAbsorbed}`);
  lines.push(`Stay-in-Front turns with leftover Guard next turn: ${turns.filter((x) => x.endingRow === "front" && x.guardGained > 0).length}`);
  lines.push("");
  lines.push("## Presentation signals");
  const decisions = t.presentation.decisionMs;
  const averageDecision = decisions.length === 0
    ? 0
    : decisions.reduce((sum, ms) => sum + ms, 0) / decisions.length;
  lines.push(`Decision samples: ${decisions.length} · average ${(averageDecision / 1000).toFixed(1)}s · longest ${(Math.max(0, ...decisions) / 1000).toFixed(1)}s`);
  lines.push(`Target changes: ${t.presentation.targetChanges} · target cancels: ${t.presentation.targetCancels}`);
  lines.push(`Details held: ${t.presentation.detailHolds} · disabled attempts: ${t.presentation.disabledAttempts}`);
  lines.push("");
  lines.push("## Energy");
  lines.push(`Hero turns: ${turns.length}`);
  lines.push(`Average cards played per hero turn: ${avgPlayed.toFixed(2)}`);
  lines.push(`Turns ending with unused energy: ${unusedEnergy}`);
  lines.push(`Move opportunity-cost events: ${t.moveOpportunityCost}`);
  lines.push("Per-card drawn/played/discarded:");
  for (const [id, st] of Object.entries(t.cardStats)) {
    if (st.drawn + st.played + st.discarded === 0) continue;
    lines.push(`  ${id}: ${st.drawn}/${st.played}/${st.discarded}`);
  }
  lines.push("");
  lines.push("## Opened");
  const declined = turns.filter((x) => x.actions.some((a) => a.startsWith("openedAvailableButDeclined")));
  const creates = t.opened.length;
  const consumes = t.opened.filter((o) => o.openedConsumedBy).length;
  const sameHero = t.opened.filter((o) => o.openedConsumedBy && o.openedConsumedBy === o.openedCreatedBy).length;
  const partner = t.opened.filter((o) => o.openedConsumedBy && o.openedConsumedBy !== o.openedCreatedBy).length;
  lines.push(`Creates: ${creates} · consumes: ${consumes} · same-hero: ${sameHero} · partner: ${partner}`);
  lines.push(`openedAvailableButDeclined turns: ${declined.length}`);
  for (const x of declined) {
    const action = x.actions.find((a) => a.startsWith("openedAvailableButDeclined"));
    lines.push(`  ${x.hero} fight ${x.fightId} r${x.round}: ${action}`);
  }
  const baseKilled = turns.filter((x) =>
    x.actions.some((a) => a.startsWith("consumeCardPlayedBaseKilledTarget"))
  );
  lines.push(`consumeCardPlayedBaseKilledTarget turns: ${baseKilled.length}`);
  for (const x of baseKilled) {
    const action = x.actions.find((a) => a.startsWith("consumeCardPlayedBaseKilledTarget"));
    lines.push(`  ${x.hero} fight ${x.fightId} r${x.round}: ${action}`);
  }
  lines.push(`Died unconsumed: ${t.opened.filter((o) => o.diedUnconsumed).length}`);
  lines.push(`Moved before consumption: ${t.opened.filter((o) => o.movedBeforeConsume).length}`);
  for (const o of t.opened) {
    lines.push(
      `  Opened by ${o.openedCreatedBy}` +
        (o.openedConsumedBy ? ` consumed by ${o.openedConsumedBy}` : o.diedUnconsumed ? " died unconsumed" : " leftover") +
        ` · lifetime slots ${o.lifetimeSlots}` +
        (o.movedBeforeConsume ? " · moved" : "")
    );
  }
  lines.push("");
  lines.push("## Intent behavior");
  lines.push(`Empty-row misses: ${emptyMisses}`);
  lines.push(`Canceled because enemy died: ${canceled}`);
  lines.push(`Both-row intents shown on hero turns: ${bothRowShown}`);
  lines.push(`Named-hero intents shown on hero turns: ${namedHits}`);
  lines.push("Intent cycle penetration:");
  for (const i of t.intents) {
    lines.push(
      `  ${i.enemyId} fight ${i.fightId}: shown ${i.shown} resolved ${i.resolved} miss-empty ${i.missedEmpty} canceled ${i.canceledDead} highestIndex ${i.highestIndex} wrapped ${i.wrapped}`
    );
  }
  return lines.join("\n");
}

export function currentActorId(s: CardTrialState): string | null {
  return s.queue[s.queueIndex]?.id ?? null;
}

export type { ConsumeKind, HeroTurnRecord };
