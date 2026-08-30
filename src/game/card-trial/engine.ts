/**
 * Card Trial PoC rules engine.
 * Deterministic, DOM-free, no campaign combat imports.
 */

import { CARD_DEFS, deckListFor } from "./cards";
import { applyDeclarativeEffects } from "./effects";
import { encounterById } from "./encounters";
import { createShuffleStream, resumeShuffleStream, shuffleInPlace } from "./rng";
import { drawDraftChoices } from "./drafts";
import { hushHalves } from "./plan";
import type {
  CardDef,
  CardId,
  CardInstance,
  CardPlayTargets,
  CardTrialDeckEntry,
  CardTrialRowMode,
  CardTrialEvent,
  CardTrialPlayerView,
  CardTrialResult,
  CardTrialRuleset,
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
  NoRowIntentTargeting,
  PlayCardResult,
  PlayerRow,
  QueueActor,
  ShuffleStream,
  DraftChoiceId,
  DraftView,
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

function rowMode(s: CardTrialState): CardTrialRowMode {
  return s.ruleset?.rowMode ?? "full";
}

function noRowIntentTargeting(s: CardTrialState): NoRowIntentTargeting {
  return s.ruleset?.noRowIntentTargeting ?? "lowest-hp";
}

function oppositeRow(row: PlayerRow): PlayerRow {
  return row === "front" ? "back" : "front";
}

function mintUid(s: CardTrialState, defId: string): string {
  s.uidSeq += 1;
  return `${defId}#${s.uidSeq}`;
}

export function resolveCardDef(s: CardTrialState, id: string): CardDef {
  const production = (CARD_DEFS as Record<string, CardDef | undefined>)[id];
  if (production) return production;
  const extra = s.ruleset?.cards[id];
  if (extra) {
    return {
      id: extra.id as CardId,
      name: extra.name,
      cost: extra.cost,
      hero: extra.hero,
      target: extra.target,
      consume: extra.consume,
      opens: extra.opens,
      text: extra.text,
    };
  }
  throw new Error(`Unknown Card Trial card "${id}"`);
}

function isKnownCard(s: CardTrialState, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CARD_DEFS, id) || !!s.ruleset?.cards[id];
}

function ensureCardStat(
  s: CardTrialState,
  id: string
): { drawn: number; played: number; discarded: number } {
  const stats = s.telemetry.cardStats as Record<string, { drawn: number; played: number; discarded: number }>;
  if (!stats[id]) stats[id] = { drawn: 0, played: 0, discarded: 0 };
  return stats[id];
}

function bumpCardStat(
  s: CardTrialState,
  id: string,
  field: "drawn" | "played" | "discarded"
): void {
  ensureCardStat(s, id)[field] += 1;
}

function deckDefId(entry: CardTrialDeckEntry): string {
  return typeof entry === "string" ? entry : entry.defId;
}

function buildDeck(s: CardTrialState, list: readonly CardTrialDeckEntry[]): CardInstance[] {
  return list.map((entry) => {
    const defId = deckDefId(entry);
    if (!isKnownCard(s, defId)) throw new Error(`Unknown Card Trial card "${defId}"`);
    const uid = typeof entry === "string" ? mintUid(s, defId) : entry.uid;
    return { uid, defId: defId as CardId };
  });
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
  if (rowMode(s) === "none") return;
  if (hero.row === row) return;
  s.entryClock += 1;
  hero.row = row;
  hero.rowEnteredAt = s.entryClock;
}

function currentIntent(enemy: EnemyState): Intent {
  return enemy.cycle[enemy.intentIndex % enemy.cycle.length]!;
}

/** Hush is a one-shot intent modifier, not a damage-over-time stack. */
function effectiveIntentDamage(enemy: EnemyState): number {
  const raw = currentIntent(enemy).damage;
  return enemy.hushed ? hushHalves(raw) : raw;
}

function crownRedirects(s: CardTrialState, enemy: EnemyState, intent = currentIntent(enemy)): boolean {
  return s.crownedEnemyId === enemy.id && intent.kind === "row" && s.heroes[RAT_KING].hp > 0;
}

function crownPaysTribute(s: CardTrialState, enemy: EnemyState, intent = currentIntent(enemy)): boolean {
  return s.crownedEnemyId === enemy.id && intent.kind !== "row" && s.heroes[RAT_KING].hp > 0;
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

/** Deterministic replacement for a row-targeted single hit in the no-row arm. */
function singleTargetWithoutRows(s: CardTrialState): HeroState | null {
  const living = livingHeroes(s);
  if (living.length === 0) return null;
  let target = living[0]!;
  for (const candidate of living.slice(1)) {
    if (candidate.hp < target.hp) target = candidate;
  }
  return target;
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
    if (s.omen?.targetId === enemy.id) {
      events.push({ type: "omen-fizzled", targetId: enemy.id });
      s.omen = null;
    }
    clearCrown(s, enemy.id, "defeated", events);
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

/**
 * Rat King's single public subject. Keeping the id on the fight (rather than
 * sprinkling booleans over enemies) makes replacement and defeat explicit and
 * guarantees that the forecast can never show two crowns at once.
 */
function applyCrown(s: CardTrialState, enemy: EnemyState, events: CardTrialEvent[]): void {
  if (enemy.hp <= 0 || s.crownedEnemyId === enemy.id) return;
  if (s.crownedEnemyId) {
    events.push({ type: "crown-cleared", targetId: s.crownedEnemyId, reason: "replaced" });
  }
  s.crownedEnemyId = enemy.id;
  events.push({ type: "crowned", targetId: enemy.id });
}

function clearCrown(
  s: CardTrialState,
  enemyId: string,
  reason: "replaced" | "defeated",
  events: CardTrialEvent[]
): void {
  if (s.crownedEnemyId !== enemyId) return;
  s.crownedEnemyId = null;
  events.push({ type: "crown-cleared", targetId: enemyId, reason });
}

function applyHush(enemy: EnemyState, events: CardTrialEvent[]): void {
  enemy.hushed = true;
  events.push({ type: "hush-applied", targetId: enemy.id });
}

function armOmen(
  s: CardTrialState,
  enemy: EnemyState,
  by: HeroId,
  events: CardTrialEvent[]
): void {
  s.omen = { targetId: enemy.id, createdBy: by, damage: 7 };
  events.push({ type: "omen-armed", targetId: enemy.id, damage: 7 });
}

/**
 * Consumes and resolves the Omen armed on `enemy`, if any. Shared by the
 * automatic pre-intent trigger and any card (e.g. `hasten-the-hour`) that
 * manually triggers it. Returns whether an Omen actually fired.
 */
function triggerOmenOn(
  s: CardTrialState,
  enemy: EnemyState,
  events: CardTrialEvent[]
): boolean {
  const armed = s.omen?.targetId === enemy.id ? s.omen : null;
  if (!armed) return false;
  s.omen = null;
  events.push({ type: "omen-triggered", targetId: enemy.id, damage: armed.damage });
  dealToEnemy(s, enemy, armed.damage, "omen", events);
  return true;
}

function openDraft(
  s: CardTrialState,
  hero: HeroState,
  sourceCard: CardInstance,
  pool: NonNullable<CardDef["draft"]>,
  target: EnemyState,
  events: CardTrialEvent[]
): void {
  const draftStreamState = s.draftStream.getState();
  const choices = drawDraftChoices(pool, s.draftStream);
  s.draftRollback = {
    sourceCard,
    energy: hero.energy,
    draftStreamState,
  };
  s.draft = {
    heroId: hero.id,
    sourceId: sourceCard.defId,
    pool,
    targetId: target.id,
    choices,
  };
  events.push({
    type: "draft-opened",
    actorId: hero.id,
    sourceId: sourceCard.defId,
    targetId: target.id,
    choices: s.draft.choices.map((choice) => ({ ...choice })),
  });
}

function restoreDraftOfferLost(
  s: CardTrialState,
  hero: HeroState,
  draft: NonNullable<CardTrialState["draft"]>
): PlayCardResult {
  const rollback = s.draftRollback;
  const events: CardTrialEvent[] = [
    {
      type: "offer-lost",
      actorId: hero.id,
      sourceId: draft.sourceId,
      targetId: draft.targetId,
    },
  ];
  if (rollback) {
    s.draftStream = resumeShuffleStream(rollback.draftStreamState);
    hero.energy = rollback.energy + CARD_DEFS[draft.sourceId].cost;
    const discardIdx = hero.discard.findIndex((card) => card.uid === rollback.sourceCard.uid);
    if (discardIdx >= 0) hero.discard.splice(discardIdx, 1);
    if (!hero.hand.some((card) => card.uid === rollback.sourceCard.uid)) {
      hero.hand.push(rollback.sourceCard);
    }
    const stats = s.telemetry.cardStats[draft.sourceId];
    if (stats && stats.played > 0) stats.played -= 1;
  }
  s.draft = null;
  s.draftRollback = null;
  s.events.push(...events);
  return { ok: false, reason: "OFFER LOST", events };
}

function biteWithRat(
  s: CardTrialState,
  target: EnemyState,
  amount: number,
  events: CardTrialEvent[]
): void {
  if (!s.rat || target.hp <= 0) return;
  events.push({ type: "rat-bite", targetId: target.id, damage: amount });
  dealToEnemy(s, target, amount, RAT_KING, events);
}

function resolveDraftChoiceEffect(
  s: CardTrialState,
  hero: HeroState,
  choiceId: DraftChoiceId,
  target: EnemyState,
  events: CardTrialEvent[]
): void {
  const hit = (amount: number) => dealToEnemy(s, target, amount, hero.id, events);
  switch (choiceId) {
    case "low-blow": {
      const locked = s.opened?.enemyId === target.id;
      if (locked) consumeOpened(s, target, hero.id, events);
      hit(5 + (locked ? 4 : 0));
      break;
    }
    case "pocket-sand":
      if (target.hp > 0) applyHush(target, events);
      if (rowMode(s) !== "none") {
        enterRow(s, hero, "back");
        events.push({ type: "hero-move", actorId: hero.id, row: "back", via: "card" });
        if (s.openTurn) s.openTurn.cardPrintedMovement = true;
      }
      break;
    case "rat-in-the-sleeve":
      if (s.rat) biteWithRat(s, target, 4, events);
      else {
        s.rat = { row: hero.row };
        events.push({ type: "spawn-rat", row: hero.row });
      }
      break;
    case "royal-ambush":
      if (target.hp > 0) applyCrown(s, target, events);
      if (target.hp > 0 && s.rat) biteWithRat(s, target, 3, events);
      break;
    case "feast-on-the-fallen": {
      const locked = target.hp > 0 && s.opened?.enemyId === target.id;
      if (locked) consumeOpened(s, target, hero.id, events);
      gainGuard(s, hero, locked ? 5 : 2, events);
      break;
    }
    case "silence-the-room":
      if (target.hp > 0) applyHush(target, events);
      break;
    case "distant-judgment":
      hit(4);
      gainGuard(s, hero, 4, events);
      break;
    case "fracture-script":
      if (target.hp > 0) applyOpened(s, target, hero.id, events);
      break;
    case "late-verdict":
      if (target.hp > 0) {
        if (s.omen) applyHush(target, events);
        else armOmen(s, target, hero.id, events);
      }
      break;
    case "unmake-the-threat": {
      const locked = s.opened?.enemyId === target.id;
      if (locked) consumeOpened(s, target, hero.id, events);
      hit(6);
      break;
    }
  }
}

function consumeOpened(s: CardTrialState, enemy: EnemyState, by: HeroId, events: CardTrialEvent[]): void {
  if (!s.opened || s.opened.enemyId !== enemy.id) return;
  events.push({ type: "consume", targetId: enemy.id });
  s.consumedThisTurn = true;
  finishOpened(s, { diedUnconsumed: false, consumedBy: by });
}

/** Lock Opened before any damage so a lethal base hit cannot drop the rider. */
function lockConsumeIfArmed(
  s: CardTrialState,
  enemy: EnemyState,
  by: HeroId,
  consumeNow: boolean,
  events: CardTrialEvent[]
): boolean {
  if (!consumeNow) return false;
  if (!s.opened || s.opened.enemyId !== enemy.id) return false;
  consumeOpened(s, enemy, by, events);
  return true;
}

/** Consume the singleton Rat. Currently the only way it can ever leave the field. */
function consumeRat(s: CardTrialState, events: CardTrialEvent[]): void {
  if (!s.rat) return;
  s.rat = null;
  events.push({ type: "rat-consumed" });
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
  bumpCardStat(s, card.defId, "drawn");
  return card;
}

function legalConsume(
  s: CardTrialState,
  defId: string,
  targetId: string | undefined
): boolean {
  const def = resolveCardDef(s, defId);
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
    const def = resolveCardDef(s, c.defId);
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
    discarded.some((id) => resolveCardDef(s, id).cost === 1)
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
  s.draft = null;
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
    pendingIntents: livingEnemies(s).map((e) => formatIntentLabel(e, s)),
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

function formatIntentLabel(e: EnemyState, s?: CardTrialState): string {
  const intent = currentIntent(e);
  const damage = effectiveIntentDamage(e);
  const redirected = !!s && crownRedirects(s, e, intent);
  const tribute = !!s && crownPaysTribute(s, e, intent);
  const suffix = tribute ? " · tribute +2 Barrier" : "";
  if (s && rowMode(s) === "none") {
    if (intent.kind === "row") {
      return redirected
        ? `${e.name.toUpperCase()} — Rat King (CROWN) — ${damage}`
        : `${e.name.toUpperCase()} — one hero — ${damage}`;
    }
    if (intent.kind === "both-rows") {
      return `${e.name.toUpperCase()} — both heroes — ${damage}${suffix}`;
    }
    const who = intent.heroId === RAT_KING ? "Rat King" : "Old Man";
    return `${e.name.toUpperCase()} — ${who} — ${damage}${suffix}`;
  }
  if (intent.kind === "row") {
    return redirected
      ? `${e.name.toUpperCase()} — Rat King (CROWN) — ${damage}`
      : `${e.name.toUpperCase()} — our ${intent.row === "front" ? "Front" : "Back"} — ${damage}`;
  }
  if (intent.kind === "both-rows") {
    return `${e.name.toUpperCase()} — both rows — ${damage} each${suffix}`;
  }
  const who = intent.heroId === RAT_KING ? "Rat King" : "Old Man";
  return `${e.name.toUpperCase()} — ${who} in ${intent.row === "front" ? "Front" : "Back"} — ${damage}${suffix}`;
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

  // An Omen resolves before the marked enemy's next intent. If the prophecy
  // kills its target, that intent never happens; this is the payoff for
  // committing a turn and occupying the single visible Omen slot.
  if (triggerOmenOn(s, enemy, events)) {
    if (enemy.hp <= 0) {
      advanceIntent(s, enemy);
      s.events.push(...events);
      return events;
    }
  }

  const rec = intentRecord(s, enemy);
  rec.resolved += 1;
  const intent = currentIntent(enemy);
  const intentDamage = effectiveIntentDamage(enemy);
  const hushActive = !!enemy.hushed;
  if (hushActive) {
    events.push({
      type: "hush-triggered",
      targetId: enemy.id,
      rawDamage: intent.damage,
      damage: intentDamage,
    });
  }
  events.push({ type: "banner", text: formatIntentLabel(enemy, s), actorId: enemy.id });
  if (hushActive) enemy.hushed = false;

  // A Crowned enemy's ordinary row strike is redirected to the King. Other
  // intent shapes keep their authored target geometry, but the sovereign pays
  // the King a small visible tribute in Barrier when they resolve.
  const redirectsToKing = crownRedirects(s, enemy, intent);
  if (crownPaysTribute(s, enemy, intent)) {
    const king = s.heroes[RAT_KING];
    king.guard += 2;
    events.push({ type: "guard", actorId: RAT_KING, amount: 2 });
    events.push({ type: "crown-tribute", targetId: RAT_KING, amount: 2, sourceId: enemy.id });
  }

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

  if (rowMode(s) === "none") {
    if (intent.kind === "row") {
      if (redirectsToKing) {
        applyDamageToHero(s, s.heroes[RAT_KING], intentDamage, events, enemy.id);
      } else if (noRowIntentTargeting(s) === "both-heroes") {
        const living = livingHeroes(s);
        if (living.length === 0) {
          events.push({ type: "intent-miss", enemyId: enemy.id });
          rec.missedEmpty += 1;
        } else {
          for (const h of living) applyDamageToHero(s, h, intentDamage, events, enemy.id);
        }
      } else {
        const target = singleTargetWithoutRows(s);
        if (!target) {
          events.push({ type: "intent-miss", enemyId: enemy.id });
          rec.missedEmpty += 1;
        } else {
          applyDamageToHero(s, target, intentDamage, events, enemy.id);
        }
      }
    } else if (intent.kind === "both-rows") {
      const living = livingHeroes(s);
      if (living.length === 0) {
        events.push({ type: "intent-miss", enemyId: enemy.id });
        rec.missedEmpty += 1;
      } else {
        for (const h of living) applyDamageToHero(s, h, intentDamage, events, enemy.id);
      }
    } else {
      const hero = s.heroes[intent.heroId];
      if (hero.hp <= 0) {
        events.push({ type: "intent-miss", enemyId: enemy.id });
        rec.missedEmpty += 1;
      } else {
        applyDamageToHero(s, hero, intentDamage, events, enemy.id);
      }
    }
  } else if (intent.kind === "row") {
    if (redirectsToKing) {
      applyDamageToHero(s, s.heroes[RAT_KING], intentDamage, events, enemy.id);
    } else {
    hitRow(intent.row, intentDamage, false);
    }
  } else if (intent.kind === "both-rows") {
    hitRow("front", intentDamage, true);
    hitRow("back", intentDamage, true);
  } else {
    const hero = s.heroes[intent.heroId];
    if (hero.hp <= 0 || hero.row !== intent.row) {
      events.push({ type: "intent-miss", enemyId: enemy.id });
      rec.missedEmpty += 1;
    } else {
      applyDamageToHero(s, hero, intentDamage, events, enemy.id);
    }
  }

  advanceIntent(s, enemy);
  s.events.push(...events);
  return events;
}

export interface AssembleFightInput {
  fightId: number;
  fightName: string;
  seed: number;
  enemies: ReadonlyArray<Omit<EnemyState, "hp" | "intentIndex">>;
  decks: Record<HeroId, readonly CardTrialDeckEntry[]>;
  telemetry?: CardTrialTelemetry;
  setup?: FightSetup;
  ruleset?: CardTrialRuleset | null;
}

export interface FightSetup {
  rows?: Partial<Record<HeroId, PlayerRow>>;
  hp?: Partial<Record<HeroId, number>>;
  rat?: { row: PlayerRow } | null;
  opened?: { enemyId: string; createdBy: HeroId } | null;
  crowned?: string | null;
  hushed?: Record<string, boolean>;
  omen?: { targetId: string; createdBy: HeroId; damage?: number } | null;
  enemyHp?: Record<string, number>;
  intentIndex?: Record<string, number>;
  hands?: Partial<Record<HeroId, readonly string[]>>;
}

function applyFightSetup(s: CardTrialState, setup: FightSetup): void {
  if (setup.rows) {
    for (const id of [RAT_KING, OLD_MAN] as const) {
      const row = setup.rows[id];
      if (row) enterRow(s, s.heroes[id], row);
    }
  }
  if (setup.hp) {
    for (const id of [RAT_KING, OLD_MAN] as const) {
      const hp = setup.hp[id];
      if (hp !== undefined) {
        s.heroes[id].hp = Math.max(0, Math.min(s.heroes[id].maxHp, hp));
        s.hpAtHeroTurnEnd[id] = s.heroes[id].hp;
      }
    }
  }
  if (setup.rat !== undefined) {
    s.rat = setup.rat
      ? { row: rowMode(s) === "none" ? "front" : setup.rat.row }
      : null;
  }
  if (setup.enemyHp) {
    for (const e of s.enemies) {
      const hp = setup.enemyHp[e.id];
      if (hp !== undefined) e.hp = Math.max(0, Math.min(e.maxHp, hp));
    }
  }
  if (setup.intentIndex) {
    for (const e of s.enemies) {
      const idx = setup.intentIndex[e.id];
      if (idx !== undefined) e.intentIndex = idx;
    }
  }
  if (setup.opened !== undefined) {
    if (!setup.opened) s.opened = null;
    else {
      const target = enemyById(s, setup.opened.enemyId);
      if (!target || target.hp <= 0) {
        throw new Error(`Opened setup target "${setup.opened.enemyId}" is missing or dead`);
      }
      s.opened = {
        enemyId: setup.opened.enemyId,
        createdBy: setup.opened.createdBy,
        createdAtSlot: s.slotCounter,
        movedBeforeConsume: false,
      };
    }
  }
  if (setup.crowned !== undefined) {
    if (!setup.crowned) s.crownedEnemyId = null;
    else {
      const target = enemyById(s, setup.crowned);
      if (!target || target.hp <= 0) {
        throw new Error(`Crowned setup target "${setup.crowned}" is missing or dead`);
      }
      s.crownedEnemyId = target.id;
    }
  }
  if (setup.hushed) {
    for (const e of s.enemies) {
      if (setup.hushed[e.id] !== undefined) e.hushed = !!setup.hushed[e.id];
    }
  }
  if (setup.omen !== undefined) {
    if (!setup.omen) s.omen = null;
    else {
      const target = enemyById(s, setup.omen.targetId);
      if (!target || target.hp <= 0) {
        throw new Error(`Omen setup target "${setup.omen.targetId}" is missing or dead`);
      }
      s.omen = {
        targetId: target.id,
        createdBy: setup.omen.createdBy,
        damage: setup.omen.damage ?? 7,
      };
    }
  }
}

function applyForcedHands(s: CardTrialState, hands: NonNullable<FightSetup["hands"]>): void {
  for (const id of [RAT_KING, OLD_MAN] as const) {
    const wanted = hands[id];
    if (!wanted) continue;
    const hero = s.heroes[id];
    hero.discard.push(...hero.hand);
    hero.hand = [];
    for (const defId of wanted) {
      const card = pullFromPiles(hero, defId);
      if (!card) throw new Error(`Forced hand missing ${defId} for ${id}`);
      hero.hand.push(card);
    }
    if (s.openTurn && s.openTurn.hero === id) {
      s.openTurn.startingHand = hero.hand.map((c) => c.defId);
    }
  }
}

/**
 * Shared fight assembler. Production `createFight` and the headless sim factory
 * both go through here so custom decks cannot drift off the locked init path.
 */
export function assembleFight(input: AssembleFightInput): CardTrialState {
  const seed = input.seed;
  const fightId = input.fightId;
  const streams: Record<HeroId, ShuffleStream> = {
    "rat-king": createShuffleStream(seed * 17 + fightId * 31 + 3),
    "old-man": createShuffleStream(seed * 19 + fightId * 37 + 7),
  };
  const s: CardTrialState = {
    fightId,
    fightName: input.fightName,
    seed,
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
    enemies: input.enemies.map((e) => ({
      ...e,
      spriteId: e.spriteId || "training-dummy",
      hp: e.maxHp,
      intentIndex: 0,
    })),
    opened: null,
    omen: null,
    draft: null,
    crownedEnemyId: null,
    rat: null,
    queue: [],
    queueIndex: -1,
    phase: "hero-turn",
    result: null,
    streams,
    draftStream: createShuffleStream(seed * 41 + fightId * 59 + 13),
    draftRollback: null,
    entryClock: 2,
    slotCounter: 0,
    uidSeq: 0,
    events: [],
    telemetry: input.telemetry ?? emptyTelemetry(),
    openTurn: null,
    openedAtTurnStart: null,
    consumeCardsAtTurnStart: [],
    consumedThisTurn: false,
    consumeAttemptedThisTurn: false,
    lastHeroToAct: null,
    hpAtHeroTurnEnd: { "rat-king": HERO_MAX_HP, "old-man": HERO_MAX_HP },
    ruleset: input.ruleset ?? null,
  };
  if (s.ruleset) {
    for (const id of Object.keys(s.ruleset.cards)) ensureCardStat(s, id);
  }
  if (rowMode(s) === "none") {
    // Keep the legacy row fields populated for structural compatibility, but
    // expose one inert location to policies and ignore all row transitions.
    s.heroes[RAT_KING].row = "front";
    s.heroes[OLD_MAN].row = "front";
    s.heroes[RAT_KING].rowEnteredAt = 1;
    s.heroes[OLD_MAN].rowEnteredAt = 1;
  }
  s.queue = buildQueue(s.enemies);
  for (const heroId of [RAT_KING, OLD_MAN] as const) {
    const deck = buildDeck(s, input.decks[heroId]);
    shuffleInPlace(deck, s.streams[heroId]);
    s.heroes[heroId].draw = deck;
  }
  if (input.setup) applyFightSetup(s, input.setup);
  markIntentShown(s);
  continueInitiative(s);
  if (input.setup?.hands) applyForcedHands(s, input.setup.hands);
  if (s.openTurn) {
    s.openTurn.hp = s.heroes[s.openTurn.hero].hp;
    s.openTurn.partnerHp = s.heroes[otherHero(s.openTurn.hero)].hp;
    s.openTurn.row = s.heroes[s.openTurn.hero].row;
    s.openTurn.openedTarget = s.opened?.enemyId ?? null;
    s.openTurn.ratRow = s.rat?.row ?? null;
    s.openTurn.enemyHp = Object.fromEntries(s.enemies.map((e) => [e.id, e.hp]));
  }
  return s;
}

export function createFight(
  fightId: number,
  opts?: { seed?: number; telemetry?: CardTrialTelemetry }
): CardTrialState {
  const enc = encounterById(fightId);
  return assembleFight({
    fightId,
    fightName: enc.name,
    seed: opts?.seed ?? 1,
    enemies: enc.enemies,
    decks: {
      "rat-king": deckListFor("rat-king"),
      "old-man": deckListFor("old-man"),
    },
    telemetry: opts?.telemetry,
  });
}

export function nextFight(prev: CardTrialState, fightId: number): CardTrialState {
  return createFight(fightId, { seed: prev.streams["rat-king"].getState(), telemetry: prev.telemetry });
}

function pullFromPiles(hero: HeroState, defId: string): CardInstance | null {
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
    // This authored adversarial fixture predates the duplicate-trimming
    // starter deck and intentionally asks for two Nips to isolate row math.
    // Keep the fixture's hand stable without putting a second Nip back into
    // the live 12-card campaign deck.
    const card = pullFromPiles(rk, id) ?? (
      id === "nip" ? { uid: mintUid(s, id), defId: id } : null
    );
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
  if (s.draft) return { ok: false, reason: "Choose a draft card" };
  if (rowMode(s) === "none") return { ok: false, reason: "Rows disabled in this simulation" };
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

/**
 * Resolve the primary damage printed by a Card Trial card.
 *
 * This is part of the rules layer so presentation code cannot grow a second
 * damage table that drifts away from resolveCardEffect(). `ratExists` is only
 * relevant to Send the Rat, whose fallback attack is weaker when the token is
 * absent. `targetCrowned` is used only by King's Due; callers that do not
 * have a target keep the uncrowned value.
 */
export function cardPrimaryDamage(
  id: CardId,
  row: PlayerRow,
  ratExists = false,
  ignoreRow = false,
  targetCrowned = false
): number | null {
  const front = !ignoreRow && row === "front";
  switch (id) {
    case "nip": return 5;
    case "fight-dirty": return null;
    case "open-the-rank": return 4;
    case "from-the-dark": return 4;
    case "swarm-the-wound": return 5;
    case "burst-the-nest": return 8;
    case "litter": return 4;
    case "send-the-rat": return ratExists ? 5 : 4;
    case "tide": return 4 + (front ? 2 : 0);
    case "lunge": return 5;
    case "king-of-the-heap": return 7 + (front ? 3 : 0);
    case "the-staff-speaks": return 6;
    case "faultline": return 5;
    case "marrow-divide": return 4;
    case "full-stop": return 8;
    case "sever-the-thread": return 5;
    case "the-threshold": return null;
    case "distant-hand": return 5;
    case "parting-word": return 4;
    case "unlight": return 4;
    case "last-bastion": return 8 + (front ? 3 : 0);
    case "improvised-theorem": return null;
    case "brace":
    case "pale-ward":
      return null;
    case "veil-of-quiet": return null;
    case "the-quiet-after": return 3;
    case "silence-the-hall": return null;
    case "hasten-the-hour": return 5;
    case "the-final-word": return null;
    case "reckoning-strike": return 5;
    case "reckoning-ward": return null;
    case "brace-for-it": return null;
    case "last-litter": return 5;
    case "feed-the-king": return null;
    case "one-more-rat": return 6;
    case "king's-due": return targetCrowned ? 8 : 4;
  }
}

/**
 * Guard printed on a card given the hero's current row. Rules-layer source of
 * truth (like cardPrimaryDamage) so presentation cannot grow a second Guard
 * table that drifts away from resolveCardEffect().
 */
export function cardGuardGain(id: CardId, row: PlayerRow, ignoreRow = false): number | null {
  switch (id) {
    case "brace": return 6;
    case "pale-ward": return 7;
    case "king-of-the-heap": return 8;
    case "last-bastion": return 9;
    case "distant-hand": return !ignoreRow && row === "back" ? 3 : null;
    case "veil-of-quiet": return 3;
    case "brace-for-it": return 12;
    case "reckoning-ward": return 4;
    case "feed-the-king": return 4;
    case "tide": return 2;
    default: return null;
  }
}

/**
 * Extra damage a card's Consume Opened rider prints. Same-target riders add
 * to the primary target, splash riders hit every other enemy, and the
 * second-enemy rider hits the chosen second target. Rules-layer source of
 * truth for the same drift reason as cardGuardGain().
 */
export function cardConsumeRiderDamage(id: CardId): number | null {
  switch (id) {
    case "swarm-the-wound": return 4;
    case "full-stop": return 8;
    case "burst-the-nest": return 4;
    case "sever-the-thread": return 5;
    case "reckoning-strike": return 5;
    default: return null;
  }
}

/**
 * Returns the ids of all living enemies other than the primary target. This is
 * the single source of truth for both the engine's second-target validation and
 * the UI's outcome preview, preventing the two from drifting apart if future
 * targeting restrictions change.
 */
export function legalSecondTargetIds(
  enemies: ReadonlyArray<{ id: string; hp: number }>,
  primaryTargetId?: string
): string[] {
  if (!primaryTargetId) return [];
  return enemies
    .filter((e) => e.hp > 0 && e.id !== primaryTargetId)
    .map((e) => e.id);
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
  if (s.draft) return "Choose a draft card";
  const def = resolveCardDef(s, card.defId);
  if (hero.energy < def.cost) return `Not enough energy (costs ${def.cost})`;
  if (def.target === "single-enemy" && livingEnemies(s).length === 0) return "No enemy";
  if (def.id === "the-threshold" && s.omen) return "Omen slot occupied";
  return null;
}

export function playCard(s: CardTrialState, uid: string, targets: CardPlayTargets = {}): PlayCardResult {
  if (s.draft) return { ok: false, reason: "Choose a draft card", events: [] };
  const hero = actingHero(s);
  if (!hero) return { ok: false, reason: "Not your turn", events: [] };
  const idx = hero.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return { ok: false, reason: "Card not in hand", events: [] };
  const card = hero.hand[idx]!;
  const def = resolveCardDef(s, card.defId);
  const why = cardDisabledReason(s, hero, card);
  if (why) return { ok: false, reason: why, events: [] };

  if (def.target === "single-enemy") {
    if (!targets.targetId) return { ok: false, reason: "Choose a target", events: [] };
    const target = enemyById(s, targets.targetId);
    if (!target || target.hp <= 0) return { ok: false, reason: "Invalid target", events: [] };
  }

  const consumeNow = legalConsume(s, def.id, targets.targetId);
  if (def.consume === "second-enemy" && consumeNow) {
    if (!targets.secondTargetId) {
      return { ok: false, reason: "Choose a second enemy", events: [], needsSecondTarget: true };
    }
    if (targets.secondTargetId === targets.targetId) {
      return { ok: false, reason: "Second enemy must be different", events: [], needsSecondTarget: true };
    }
    const legalSeconds = legalSecondTargetIds(s.enemies, targets.targetId);
    if (!legalSeconds.includes(targets.secondTargetId)) {
      return { ok: false, reason: "Invalid second target", events: [], needsSecondTarget: true };
    }
  }

  hero.energy -= def.cost;
  hero.hand.splice(idx, 1);
  hero.discard.push(card);
  bumpCardStat(s, def.id, "played");
  if (s.openTurn) {
    s.openTurn.cardsPlayed.push(def.id);
    s.openTurn.actions.push(`play:${def.id}`);
    s.openTurn.energyRemaining = hero.energy;
  }

  const events: CardTrialEvent[] = [{ type: "banner", text: def.name, actorId: hero.id, cardId: def.id }];
  const extra = s.ruleset?.cards[card.defId];
  if (def.draft && targets.targetId) {
    openDraft(s, hero, card, def.draft, enemyById(s, targets.targetId)!, events);
  } else if (extra) {
    applyDeclarativeEffects(extra.effects, declarativeApi(s, hero, targets, events));
  } else {
    resolveCardEffect(s, hero, def.id, targets, consumeNow, events);
  }
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

/** Resolve the player's pick from the one visible temporary draft. */
export function resolveDraftChoice(
  s: CardTrialState,
  choiceId: DraftChoiceId
): PlayCardResult {
  const hero = actingHero(s);
  const draft = s.draft;
  if (!hero || !draft || draft.heroId !== hero.id) {
    return { ok: false, reason: "No draft to choose from", events: [] };
  }
  const choice = draft.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) return { ok: false, reason: "That draft card is gone", events: [] };
  if (hero.energy < choice.cost) {
    return { ok: false, reason: `Not enough energy (costs ${choice.cost})`, events: [] };
  }
  const target = enemyById(s, draft.targetId);
  if (!target || target.hp <= 0) {
    return restoreDraftOfferLost(s, hero, draft);
  }

  hero.energy -= choice.cost;
  if (s.openTurn) {
    s.openTurn.actions.push(`draft:${choice.id}`);
    s.openTurn.energyRemaining = hero.energy;
  }
  s.draft = null;
  s.draftRollback = null;
  const events: CardTrialEvent[] = [
    // Keep the source card id on the presentation banner so a generated Old
    // Man response still receives magical card-spell choreography.
    { type: "banner", text: choice.name, actorId: hero.id, cardId: draft.sourceId },
    {
      type: "draft-picked",
      actorId: hero.id,
      sourceId: draft.sourceId,
      choiceId: choice.id,
      targetId: target.id,
    },
  ];
  resolveDraftChoiceEffect(s, hero, choice.id, target, events);
  s.events.push(...events);
  checkEnd(s);
  return { ok: true, events };
}

function declarativeApi(
  s: CardTrialState,
  hero: HeroState,
  targets: CardPlayTargets,
  events: CardTrialEvent[]
) {
  const enemy = (id: string | undefined) => (id ? enemyById(s, id) : undefined);
  const hit = (id: string, n: number) => {
    const e = enemyById(s, id);
    if (e) dealToEnemy(s, e, n, hero.id, events);
  };
  return {
    heroRow: () => hero.row,
    primary: () => {
      const e = enemy(targets.targetId);
      return e ? { id: e.id, hp: e.hp } : undefined;
    },
    second: () => {
      const e = enemy(targets.secondTargetId);
      return e ? { id: e.id, hp: e.hp } : undefined;
    },
    living: () => livingEnemies(s).map((e) => ({ id: e.id, hp: e.hp })),
    openedPrimary: () => !!targets.targetId && s.opened?.enemyId === targets.targetId,
    ratExists: () => !!s.rat,
    intentAimsAtHeroRow: () =>
      livingEnemies(s).some((e) => {
        const intent = currentIntent(e);
        if (rowMode(s) === "none") {
          if (intent.kind === "row") {
            return noRowIntentTargeting(s) === "both-heroes" || singleTargetWithoutRows(s)?.id === hero.id;
          }
          if (intent.kind === "both-rows") return true;
          return intent.heroId === hero.id;
        }
        if (intent.kind === "row") return intent.row === hero.row;
        if (intent.kind === "both-rows") return true;
        return intent.heroId === hero.id && intent.row === hero.row;
      }),
    hit,
    bite: (id: string, n: number) => {
      const e = enemyById(s, id);
      if (!e || !s.rat) return;
      events.push({ type: "rat-bite", targetId: e.id, damage: n });
      dealToEnemy(s, e, n, "rat", events);
    },
    open: (id: string) => {
      const e = enemyById(s, id);
      if (e && e.hp > 0) applyOpened(s, e, hero.id, events);
    },
    consume: (id: string) => {
      const e = enemyById(s, id);
      if (e) consumeOpened(s, e, hero.id, events);
    },
    guard: (amount: number) => gainGuard(s, hero, amount, events),
    moveHero: (row: PlayerRow | "other") => {
      if (rowMode(s) === "none") return;
      const dest = row === "other" ? oppositeRow(hero.row) : row;
      enterRow(s, hero, dest);
      events.push({ type: "hero-move", actorId: hero.id, row: dest, via: "card" });
      if (s.openTurn) s.openTurn.cardPrintedMovement = true;
    },
    spawnRat: () => {
      if (!s.rat) {
        s.rat = { row: hero.row };
        events.push({ type: "spawn-rat", row: hero.row });
      }
    },
    moveRat: () => {
      if (rowMode(s) === "none") return;
      if (!s.rat) return;
      s.rat.row = oppositeRow(s.rat.row);
      events.push({ type: "rat-move", row: s.rat.row });
    },
  };
}

function resolveCardEffect(
  s: CardTrialState,
  hero: HeroState,
  id: CardId,
  targets: CardPlayTargets,
  consumeNow: boolean,
  events: CardTrialEvent[]
): void {
  const ignoreRow = rowMode(s) === "none";
  const target = targets.targetId ? enemyById(s, targets.targetId) : undefined;
  const hit = (enemy: EnemyState, n: number) => dealToEnemy(s, enemy, n, hero.id, events);
  const primaryDamage = cardPrimaryDamage(
    id,
    hero.row,
    !!s.rat,
    ignoreRow,
    !!target && s.crownedEnemyId === target.id
  );
  const riderDamage = cardConsumeRiderDamage(id) ?? 0;
  const printedGuard = cardGuardGain(id, hero.row, ignoreRow);
  const gainPrintedGuard = () => {
    if (printedGuard !== null) gainGuard(s, hero, printedGuard, events);
  };
  const hitPrimary = (enemy: EnemyState) => {
    if (primaryDamage !== null) hit(enemy, primaryDamage);
  };
  const bite = (enemy: EnemyState, n: number) => {
    events.push({ type: "rat-bite", targetId: enemy.id, damage: n });
    dealToEnemy(s, enemy, n, "rat", events);
  };

  switch (id) {
    case "nip":
      if (target) hitPrimary(target);
      break;
    case "fight-dirty":
    case "improvised-theorem":
      // Draft cards are intercepted by playCard before the base resolver.
      break;
    case "brace":
      gainPrintedGuard();
      break;
    case "open-the-rank":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "from-the-dark":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
        if (!ignoreRow && hero.row === "back" && s.rat && target.hp > 0) bite(target, 3);
      }
      break;
    case "swarm-the-wound":
      if (target) {
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        hit(target, (primaryDamage ?? 0) + (locked ? riderDamage : 0));
      }
      break;
    case "burst-the-nest":
      if (target) {
        const primaryId = target.id;
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        hitPrimary(target);
        if (locked) {
          for (const other of livingEnemies(s).filter((e) => e.id !== primaryId)) {
            hit(other, riderDamage);
          }
        }
      }
      break;
    case "litter":
      if (target) hitPrimary(target);
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
        hitPrimary(target);
      }
      break;
    case "tide":
      if (target) hitPrimary(target);
      gainPrintedGuard();
      break;
    case "lunge": {
      if (rowMode(s) !== "none") {
        enterRow(s, hero, "front");
        events.push({ type: "hero-move", actorId: hero.id, row: "front", via: "card" });
        if (s.openTurn) s.openTurn.cardPrintedMovement = true;
      }
      if (target) hitPrimary(target);
      break;
    }
    case "king-of-the-heap":
      if (target) hitPrimary(target);
      gainPrintedGuard();
      if (target && target.hp > 0) applyCrown(s, target, events);
      break;
    case "the-staff-speaks":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0) applyHush(target, events);
      }
      break;
    case "pale-ward":
      gainPrintedGuard();
      break;
    case "faultline":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "marrow-divide":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0) applyOpened(s, target, hero.id, events);
      }
      break;
    case "full-stop":
      if (target) {
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        hit(target, (primaryDamage ?? 0) + (locked ? riderDamage : 0));
      }
      break;
    case "sever-the-thread":
      if (target) {
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        hitPrimary(target);
        if (locked) {
          const second = enemyById(s, targets.secondTargetId!);
          if (second) hit(second, riderDamage);
        }
      }
      break;
    case "the-threshold":
      if (target && !s.omen) armOmen(s, target, hero.id, events);
      break;
    case "distant-hand":
      if (target) hitPrimary(target);
      gainPrintedGuard();
      break;
    case "parting-word":
      if (target) hitPrimary(target);
      if (rowMode(s) !== "none") {
        enterRow(s, hero, "back");
        events.push({ type: "hero-move", actorId: hero.id, row: "back", via: "card" });
        if (s.openTurn) s.openTurn.cardPrintedMovement = true;
      }
      break;
    case "unlight":
      for (const e of livingEnemies(s)) hitPrimary(e);
      break;
    case "last-bastion":
      if (target) hitPrimary(target);
      gainPrintedGuard();
      break;

    // --- Old Man build-exclusive signature cards ------------------------
    case "veil-of-quiet":
      if (target) applyHush(target, events);
      gainPrintedGuard();
      break;
    case "the-quiet-after":
      if (target) hit(target, target.hushed ? 8 : 3);
      break;
    case "silence-the-hall":
      for (const e of livingEnemies(s)) applyHush(e, events);
      break;
    case "hasten-the-hour":
      if (target) {
        if (triggerOmenOn(s, target, events)) {
          if (target.hp > 0) hit(target, 3);
        } else {
          hitPrimary(target);
        }
      }
      break;
    case "the-final-word":
      gainGuard(s, hero, s.omen ? 10 : 5, events);
      break;
    case "reckoning-strike": {
      if (target) {
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        if (locked) {
          enterRow(s, hero, "front");
          events.push({ type: "hero-move", actorId: hero.id, row: "front", via: "card" });
          if (s.openTurn) s.openTurn.cardPrintedMovement = true;
        }
        hit(target, (primaryDamage ?? 0) + (locked ? riderDamage : 0));
      }
      break;
    }
    case "reckoning-ward": {
      if (target) {
        const locked = lockConsumeIfArmed(s, target, hero.id, consumeNow, events);
        if (locked) {
          enterRow(s, hero, "back");
          events.push({ type: "hero-move", actorId: hero.id, row: "back", via: "card" });
          if (s.openTurn) s.openTurn.cardPrintedMovement = true;
        }
        gainGuard(s, hero, (printedGuard ?? 0) + (locked ? 6 : 0), events);
      }
      break;
    }
    case "brace-for-it":
      gainPrintedGuard();
      break;
    case "last-litter":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0 && s.rat) {
          consumeRat(s, events);
          hit(target, 8);
        }
      }
      break;
    case "feed-the-king":
      if (target && target.hp > 0) applyCrown(s, target, events);
      if (s.rat) {
        consumeRat(s, events);
        gainGuard(s, hero, 10, events);
      } else {
        gainGuard(s, hero, 4, events);
      }
      break;
    case "one-more-rat":
      if (target) {
        hitPrimary(target);
        if (target.hp > 0 && s.rat) {
          consumeRat(s, events);
          hit(target, 6);
          s.rat = { row: hero.row };
          events.push({ type: "spawn-rat", row: hero.row });
        }
      }
      break;
    case "king's-due":
      if (target) hitPrimary(target);
      break;
  }
}

export function endHeroTurn(s: CardTrialState): CardTrialEvent[] {
  if (s.draft) return [];
  const hero = actingHero(s);
  if (!hero) return [];
  const discarded = hero.hand.map((c) => c.defId);
  for (const c of hero.hand) {
    bumpCardStat(s, c.defId, "discarded");
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
  const intentDamage = effectiveIntentDamage(e);
  const label = formatIntentLabel(e, s);
  const redirectsToKing = crownRedirects(s, e, intent);
  const paysTribute = crownPaysTribute(s, e, intent);
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

  if (rowMode(s) === "none") {
    if (intent.kind === "row") {
      rawDamage = intentDamage;
      if (redirectsToKing) {
        wouldMiss = false;
        pushHero(s.heroes[RAT_KING], intentDamage, false);
      } else if (noRowIntentTargeting(s) === "both-heroes") {
        const living = livingHeroes(s);
        wouldMiss = living.length === 0;
        if (living.length === 0) {
          for (const h of livingHeroes(s)) pushHero(h, intent.damage, true);
        } else {
          for (const h of living) pushHero(h, intentDamage, false);
        }
      } else {
        const target = singleTargetWithoutRows(s);
        wouldMiss = !target;
        if (target) pushHero(target, intentDamage, false);
        else for (const h of livingHeroes(s)) pushHero(h, intentDamage, true);
      }
    } else if (intent.kind === "both-rows") {
      rawDamage = intentDamage;
      const living = livingHeroes(s);
      wouldMiss = living.length === 0;
      for (const h of living) pushHero(h, intentDamage, false);
    } else {
      rawDamage = intentDamage;
      const hero = s.heroes[intent.heroId];
      const miss = hero.hp <= 0;
      wouldMiss = miss;
      pushHero(hero, intentDamage, miss);
    }
  } else if (intent.kind === "row") {
    rawDamage = intentDamage;
    if (redirectsToKing) {
      pushHero(s.heroes[RAT_KING], intentDamage, false);
    } else {
      missIfEmpty = true;
      const t = singleTargetInRow(s, intent.row);
      wouldMiss = !t;
      if (t) pushHero(t, intentDamage, false);
      else {
        for (const h of livingHeroes(s)) pushHero(h, intent.damage, true);
      }
    }
  } else if (intent.kind === "both-rows") {
    rawDamage = intentDamage;
    missIfEmpty = heroesInRow(s, "front").length === 0 || heroesInRow(s, "back").length === 0;
    wouldMiss = heroesInRow(s, "front").length === 0 && heroesInRow(s, "back").length === 0;
    for (const row of ["front", "back"] as const) {
      const here = heroesInRow(s, row);
      if (here.length === 0) continue;
      for (const h of here) pushHero(h, intentDamage, false);
    }
  } else {
    rawDamage = intentDamage;
    const hero = s.heroes[intent.heroId];
    const miss = hero.hp <= 0 || hero.row !== intent.row;
    wouldMiss = miss;
    missIfEmpty = miss;
    pushHero(hero, intentDamage, miss);
  }

  return {
    enemyId: e.id,
    enemyName: e.name,
    label,
    rawDamage,
    consequences,
    missIfEmpty,
    wouldMiss,
    ...(paysTribute ? { tribute: { heroId: RAT_KING, amount: 2 } } : {}),
  };
}

export function playerView(s: CardTrialState): CardTrialPlayerView {
  const hero = actingHero(s);
  const move = hero ? canPaidMove(s) : { ok: false, reason: "Not your turn" as string | null };
  const hand: HandCardView[] = (hero?.hand ?? []).map((c) => {
    const def = resolveCardDef(s, c.defId);
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
      target: def.target,
      disabled: !!reason,
      disabledReason: reason,
      consumeArmed,
      consumeDimmed,
    };
  });
  const draft: DraftView | null = s.draft
    ? {
        heroId: s.draft.heroId,
        sourceId: s.draft.sourceId,
        sourceName: CARD_DEFS[s.draft.sourceId].name,
        targetId: s.draft.targetId,
        targetName: enemyById(s, s.draft.targetId)?.name ?? s.draft.targetId,
        choices: s.draft.choices.map((choice) => ({
          ...choice,
          disabled: !!hero && hero.energy < choice.cost,
          disabledReason: hero && hero.energy < choice.cost
            ? `Not enough energy (costs ${choice.cost})`
            : null,
        })),
      }
    : null;
  return {
    fightId: s.fightId,
    fightName: s.fightName,
    round: s.round,
    actingHero: hero?.id ?? null,
    phase: s.phase,
    result: s.result,
    rowMode: rowMode(s),
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
      spriteId: e.spriteId,
      hp: e.hp,
      maxHp: e.maxHp,
      opened: s.opened?.enemyId === e.id,
      hushed: !!e.hushed,
      crowned: s.crownedEnemyId === e.id,
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
    crownedEnemyId: s.crownedEnemyId,
    omen: s.omen
      ? {
          targetId: s.omen.targetId,
          targetName: enemyById(s, s.omen.targetId)?.name ?? s.omen.targetId,
          damage: s.omen.damage,
        }
      : null,
    draft,
    ratRow: s.rat?.row ?? null,
    intents: intentPreviews(s),
    pileCountsOnly: true,
  };
}

export function handCard(s: CardTrialState, defId: string): CardInstance | undefined {
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
  const stand = t.cardStats["last-bastion"];
  lines.push(`King of the Heap drawn ${heap.drawn} played ${heap.played} discarded ${heap.discarded}`);
  lines.push(`Last Bastion drawn ${stand.drawn} played ${stand.played} discarded ${stand.discarded}`);
  const endingFront = turns.filter((x) => x.endingRow === "front").length;
  const endingBack = turns.filter((x) => x.endingRow === "back").length;
  lines.push(`Turn endings Front ${endingFront} / Back ${endingBack}`);
  lines.push("");
  lines.push("## Guard");
  const guardCards = ["brace", "pale-ward", "king-of-the-heap", "last-bastion", "distant-hand"] as const;
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
