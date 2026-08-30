/**
 * Pure semantic recipe for the Card Trial combat UI.
 *
 * Rules remain in game/card-trial. This module translates the public player
 * view plus controller selection state into one deterministic presentation
 * model consumed by the shared 768×672 DOM stage over both combat painters.
 */

import { CARD_DEFS } from "../game/card-trial/cards";
import {
  cardConsumeRiderDamage,
  cardGuardGain,
  cardPrimaryDamage,
  legalSecondTargetIds,
} from "../game/card-trial/engine";
import { plannedOpenerLabel, planIgnoreRow } from "../game/card-trial/plan";
import type {
  CardTrialPlayerView,
  HandCardView,
  HeroId,
  PlayerRow,
} from "../game/card-trial/types";
import { ENERGY_PER_TURN } from "../game/card-trial/types";
import { ENEMY_SPRITE_DEFS } from "./sprite-manifest";
import type { CardTrialWindowsInput } from "./card-trial-view";

export type CardTrialFocusedControl =
  | { kind: "card"; index: number }
  | { kind: "move" }
  | { kind: "pass" }
  | { kind: "target"; id: string }
  | null;

export interface CardTrialInitiativeTile {
  id: string;
  kind: "hero" | "enemy";
  name: string;
  acting: boolean;
  done: boolean;
  dead: boolean;
  portraitUrl: string | null;
  /** Enemy strips show their first 100×100 frame through a clipped tile. */
  portraitIsStrip: boolean;
}

export interface CardTrialActorUiState {
  id: string;
  kind: "hero" | "enemy";
  name: string;
  hp: number;
  maxHp: number;
  guard: number;
  row: PlayerRow;
  dead: boolean;
  active: boolean;
  plateVisible: boolean;
  legalTarget: boolean;
  selectedTarget: boolean;
  opened: boolean;
  /** Enemy-only Rat King's current public subject. */
  crowned?: boolean;
  /** Enemy-only one-shot intent reduction from Old Man's Hush. */
  hushed?: boolean;
  /** Enemy-only face-up delayed strike from Old Man's Omen. */
  omened?: boolean;
  intentLabel: string | null;
  intentDamage: number | null;
  intentWouldMiss: boolean;
}

export interface CardTrialCardUiState {
  uid: string;
  index: number;
  focused: boolean;
  armed: boolean;
  unavailable: boolean;
  invalidTarget: boolean;
  unavailableReason: string | null;
}

export interface CardTrialUiRecipe {
  phase: CardTrialWindowsInput["phase"];
  activeActorId: string | null;
  activeActorName: string;
  focusedControl: CardTrialFocusedControl;
  selectedCardIndex: number | null;
  armedCardIndex: number | null;
  legalTargetIds: string[];
  selectedTargetId: string | null;
  detailsHeld: boolean;
  turnLabel: string;
  decisionInstruction: string;
  handInstruction: string;
  deckCount: number;
  discardCount: number;
  energy: number;
  maxEnergy: number;
  moveAvailable: boolean;
  moveReason: string | null;
  ratStatus: string;
  initiative: CardTrialInitiativeTile[];
  actors: CardTrialActorUiState[];
  cards: CardTrialCardUiState[];
}

const ASSET_BASE = import.meta.env.BASE_URL ?? "/";

export function cardTrialUiAssetUrl(name: string): string {
  return `${ASSET_BASE}assets/card-trial/ui/${name}.png`;
}

function heroPortrait(id: string): string | null {
  if (id === "rat-king") return cardTrialUiAssetUrl("portrait-rat-king");
  if (id === "old-man") return cardTrialUiAssetUrl("portrait-old-man");
  return null;
}

function enemyPortrait(spriteId: string | undefined): string | null {
  if (!spriteId) return null;
  return ENEMY_SPRITE_DEFS[spriteId]?.idle.url ?? null;
}

export function conciseUnavailableReason(reason: string | null, cost: number): string | null {
  if (!reason) return null;
  if (/not enough energy/i.test(reason)) return `Need ${cost} energy`;
  return reason;
}

function selectedCard(input: CardTrialWindowsInput): { card: HandCardView; index: number } | null {
  if (input.cursor < 0 || input.cursor >= input.view.hand.length) return null;
  return { card: input.view.hand[input.cursor]!, index: input.cursor };
}

function targetFor(input: CardTrialWindowsInput): CardTrialPlayerView["enemies"][number] | null {
  if (input.phase !== "target" && input.phase !== "target2") return null;
  const id = input.targetIds[input.targetCursor];
  return id ? input.view.enemies.find((enemy) => enemy.id === id) ?? null : null;
}

function actingHeroRow(view: CardTrialPlayerView): PlayerRow {
  return view.heroes.find((hero) => hero.id === view.actingHero)?.row ?? "front";
}

/** Presentation-only exact outcome summary derived from the live view. */
export function cardOutcomeSummary(
  card: HandCardView,
  view: CardTrialPlayerView,
  target: CardTrialPlayerView["enemies"][number] | null
): string {
  const row = actingHeroRow(view);
  const ignoreRow = planIgnoreRow(view.rowMode);
  const id = card.defId;
  const damage = cardPrimaryDamage(
    id,
    row,
    !!view.ratRow,
    ignoreRow,
    !!target && view.crownedEnemyId === target.id
  );
  const rider = cardConsumeRiderDamage(id);
  const guard = cardGuardGain(id, row, ignoreRow);
  const targetIsOpened = !!target && view.openedEnemyId === target.id;
  const survivesBase = !!target && damage !== null && target.hp > damage;
  const hasSecondEnemy =
    !!target && legalSecondTargetIds(view.enemies, target.id).length > 0;
  const parts: string[] = [];

  if (id === "fight-dirty" || id === "improvised-theorem") {
    return CARD_DEFS[id].text;
  }
  if (id === "brace" || id === "pale-ward") return `Gain ${guard} Barrier`;
  if (id === "the-staff-speaks") return `Deal ${damage} · Hush next intent`;
  if (id === "the-threshold") return "Arm Omen · strike before target's next intent";
  if (id === "king-of-the-heap") {
    return `Deal ${damage} · Gain ${guard} Barrier · Crown target`;
  }
  if (id === "king's-due") {
    return `Deal ${damage}`;
  }
  if (id === "unlight") return `Deal ${damage} to all enemies`;
  if (id === "send-the-rat" && view.ratRow) {
    return `Rat changes row · Deal ${damage}`;
  }
  if (id === "veil-of-quiet") return `Hush next intent · Gain ${guard} Barrier`;
  if (id === "the-quiet-after") return `Deal ${target?.hushed ? 8 : 3}`;
  if (id === "silence-the-hall") return "Hush every enemy's next intent";
  if (id === "hasten-the-hour") {
    if (target && view.omen?.targetId === target.id) {
      return `Trigger Omen (${view.omen.damage}) · Deal 3`;
    }
    return `Deal ${damage}`;
  }
  if (id === "the-final-word") return `Gain ${(guard ?? 5) + (view.omen ? 5 : 0)} Barrier`;
  if (id === "reckoning-strike") {
    if (targetIsOpened) {
      return `Deal ${(damage ?? 0) + (rider ?? 0)} · Move Front · Consume Opened`;
    }
    return `Deal ${damage}`;
  }
  if (id === "reckoning-ward") {
    if (targetIsOpened) {
      return `Gain ${(guard ?? 0) + 6} Barrier · Move Back · Consume Opened`;
    }
    return `Gain ${guard} Barrier`;
  }
  if (id === "brace-for-it") return `Gain ${guard} Barrier`;
  if (id === "last-litter") {
    return view.ratRow ? `Deal ${(damage ?? 0) + 8} · Consume Rat` : `Deal ${damage}`;
  }
  if (id === "feed-the-king") {
    return view.ratRow
      ? "Crown target · Gain 10 Barrier · Consume Rat"
      : "Crown target · Gain 4 Barrier";
  }
  if (id === "one-more-rat") {
    return view.ratRow
      ? `Deal ${(damage ?? 0) + 6} · Consume Rat · Spawn Rat`
      : `Deal ${damage}`;
  }
  if (damage !== null) parts.push(`Deal ${damage}`);

  const opener = plannedOpenerLabel(id, target?.hp, damage);
  if (id === "from-the-dark") {
    if (opener) parts.push(opener);
    if (!ignoreRow && row === "back" && view.ratRow && survivesBase) parts.push("Rat +3");
  } else if (opener) {
    parts.push(opener);
  } else if ((id === "swarm-the-wound" || id === "full-stop") && targetIsOpened) {
    parts[0] = `Deal ${(damage ?? 0) + (rider ?? 0)}`;
    parts.push("Consume Opened");
  } else if (id === "burst-the-nest" && targetIsOpened) {
    parts.push(`${rider} to other enemies`, "Consume Opened");
  } else if (id === "sever-the-thread" && targetIsOpened && hasSecondEnemy) {
    parts.push(`Second enemy ${rider}`, "Consume Opened");
  } else if (id === "litter" && !view.ratRow) {
    parts.push(`Spawn Rat ${row === "front" ? "Front" : "Back"}`);
  } else if (id === "lunge") {
    if (!ignoreRow) parts.unshift("Move Front");
  } else if (id === "parting-word") {
    if (!ignoreRow) parts.push("Move Back");
  } else if (guard !== null) {
    parts.push(`Gain ${guard} Barrier`);
  }
  return parts.join(" · ") || CARD_DEFS[id].text;
}

function focusFor(input: CardTrialWindowsInput): CardTrialFocusedControl {
  if (input.phase === "target" || input.phase === "target2") {
    const id = input.targetIds[input.targetCursor];
    return id ? { kind: "target", id } : null;
  }
  if (input.phase !== "hand") return null;
  if (input.cursor < input.view.hand.length) return { kind: "card", index: input.cursor };
  if (input.cursor === input.view.hand.length) return { kind: "move" };
  if (input.cursor === input.view.hand.length + 1) return { kind: "pass" };
  return null;
}

function instructionFor(
  input: CardTrialWindowsInput,
  activeName: string,
  cardSelection: ReturnType<typeof selectedCard>,
  target: ReturnType<typeof targetFor>
): { decision: string; hand: string } {
  if (input.phase === "target" || input.phase === "target2") {
    const decision = input.phase === "target2" ? "Choose a second enemy" : "Choose an enemy";
    if (!cardSelection) return { decision, hand: decision };
    const outcome = cardOutcomeSummary(cardSelection.card, input.view, target);
    const targetName = target?.name ?? "No legal target";
    return {
      decision,
      hand: `${cardSelection.card.name} → ${targetName} · ${outcome}`,
    };
  }
  if (input.phase === "playback") {
    const label = input.playbackLabel ? `Resolving ${input.playbackLabel}` : "Resolving action";
    return { decision: label, hand: label };
  }
  if (input.phase === "draft") {
    const draft = input.view.draft;
    return {
      decision: "Choose an improvised card",
      hand: draft ? `${draft.sourceName} · choose one temporary answer` : "Choose an answer",
    };
  }
  if (input.phase === "result") return { decision: "Fight complete", hand: "Fight complete" };
  if (input.view.energy <= 0) return { decision: "Ending turn", hand: "No energy remaining" };

  const focus = focusFor(input);
  if (focus?.kind === "move") {
    const row = actingHeroRow(input.view);
    const destination = row === "front" ? "Back" : "Front";
    const label = input.view.moveAvailable
      ? `Move to ${destination} · 1 energy`
      : input.view.moveDisabledReason ?? "Move unavailable";
    return { decision: "Choose an action", hand: label };
  }
  if (focus?.kind === "pass") return { decision: "Choose an action", hand: `End ${activeName}'s turn` };
  return { decision: "Choose an action", hand: "" };
}

export function buildCardTrialUiRecipe(input: CardTrialWindowsInput): CardTrialUiRecipe {
  const activeQueueActor = input.view.queue.find((actor) => actor.acting && !actor.dead) ?? null;
  const activeActorId = activeQueueActor?.id ?? input.view.actingHero;
  const activeActorName = activeQueueActor?.name ??
    input.view.heroes.find((hero) => hero.id === input.view.actingHero)?.name ??
    "Actor";
  const focus = focusFor(input);
  const cardSelection = selectedCard(input);
  const targeting = input.phase === "target" || input.phase === "target2";
  const decisionPhase = input.phase === "hand" || targeting;
  const selectedTarget = targetFor(input);
  const selectedCardIndex = input.phase === "hand" && cardSelection ? cardSelection.index : null;
  const armedCardIndex = targeting && cardSelection ? cardSelection.index : null;
  const instruction = instructionFor(input, activeActorName, cardSelection, selectedTarget);
  const legalTargets = targeting ? [...input.targetIds] : [];
  const selectedTargetId = targeting ? selectedTarget?.id ?? null : null;
  const enemyById = new Map(input.view.enemies.map((enemy) => [enemy.id, enemy]));

  const initiative = input.view.queue.map((actor): CardTrialInitiativeTile => {
    const enemy = actor.kind === "enemy" ? enemyById.get(actor.id) : null;
    return {
      ...actor,
      portraitUrl: actor.kind === "hero"
        ? heroPortrait(actor.id)
        : enemyPortrait(enemy?.spriteId),
      portraitIsStrip: actor.kind === "enemy",
    };
  });

  const actors: CardTrialActorUiState[] = [
    ...input.view.heroes.map((hero): CardTrialActorUiState => {
      const active = activeActorId === hero.id && input.phase !== "result";
      return {
        id: hero.id,
        kind: "hero",
        name: hero.name,
        hp: hero.hp,
        maxHp: hero.maxHp,
        guard: hero.guard,
        row: hero.row,
        dead: hero.dead,
        active,
        plateVisible: !hero.dead && active && decisionPhase,
        legalTarget: false,
        selectedTarget: false,
        opened: false,
        crowned: false,
        hushed: false,
        omened: false,
        intentLabel: null,
        intentDamage: null,
        intentWouldMiss: false,
      };
    }),
    ...input.view.enemies.map((enemy): CardTrialActorUiState => {
      const intent = input.view.intents.find((candidate) => candidate.enemyId === enemy.id) ?? null;
      const active = activeActorId === enemy.id && input.phase !== "result";
      const selectedTarget = selectedTargetId === enemy.id;
      return {
        id: enemy.id,
        kind: "enemy",
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        guard: 0,
        row: enemy.visualRow,
        dead: enemy.dead,
        active,
        plateVisible: !enemy.dead && ((active && decisionPhase) || selectedTarget),
        legalTarget: legalTargets.includes(enemy.id),
        selectedTarget,
        opened: enemy.opened,
        crowned: enemy.crowned,
        hushed: !!enemy.hushed,
        omened: input.view.omen?.targetId === enemy.id,
        intentLabel: intent?.label ?? null,
        intentDamage: intent?.rawDamage ?? null,
        intentWouldMiss: intent?.wouldMiss ?? false,
      };
    }),
  ];

  const cards = input.view.hand.map((card, index): CardTrialCardUiState => ({
    uid: card.uid,
    index,
    focused: selectedCardIndex === index,
    armed: armedCardIndex === index,
    unavailable: card.disabled,
    invalidTarget: armedCardIndex === index && legalTargets.length === 0,
    unavailableReason: conciseUnavailableReason(card.disabledReason, card.cost),
  }));

  return {
    phase: input.phase,
    activeActorId,
    activeActorName,
    focusedControl: focus,
    selectedCardIndex,
    armedCardIndex,
    legalTargetIds: legalTargets,
    selectedTargetId,
    detailsHeld: !!input.detailsHeld,
    turnLabel: `${activeActorName}'s turn`,
    decisionInstruction: instruction.decision,
    handInstruction: instruction.hand,
    deckCount: input.view.drawCount,
    discardCount: input.view.discardCount,
    energy: input.view.energy,
    maxEnergy: ENERGY_PER_TURN,
    moveAvailable: input.view.moveAvailable,
    moveReason: input.view.moveDisabledReason,
    ratStatus: input.view.ratRow ?? "Not summoned",
    initiative,
    actors,
    cards,
  };
}

export function oppositePlayerRow(row: PlayerRow): PlayerRow {
  return row === "front" ? "back" : "front";
}

export function heroNameForId(view: CardTrialPlayerView, id: HeroId): string {
  return view.heroes.find((hero) => hero.id === id)?.name ?? id;
}
