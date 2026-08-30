import type { CardId, CardTrialPlayerView, HeroId, IntentPreview } from "../types";
import type { CardTrialPolicy } from "./policy-types";
import { createShuffleStream } from "../rng";

export type { CardTrialPolicy, PolicyContext } from "./policy-types";

function cardView(view: CardTrialPlayerView, uid: string) {
  return view.hand.find((c) => c.uid === uid) ?? null;
}

function isDamagingCard(view: CardTrialPlayerView, uid: string): boolean {
  const card = cardView(view, uid);
  return !!card && card.target !== "none";
}

function actingHeroId(view: CardTrialPlayerView): HeroId | null {
  return view.actingHero;
}

function threatensHero(intent: IntentPreview, heroId: HeroId): boolean {
  if (intent.wouldMiss) return false;
  return intent.consequences.some((c) => c.heroId === heroId && !c.miss && c.postGuard >= 0);
}

function incomingFor(view: CardTrialPlayerView, heroId: HeroId): number {
  let n = 0;
  for (const intent of view.intents) {
    for (const c of intent.consequences) {
      if (c.heroId === heroId && !c.miss) n += c.postGuard;
    }
  }
  return n;
}

export function passPolicy(): CardTrialPolicy {
  return () => ({ kind: "pass" });
}

export function fixedPolicy(mode: "pass" | "damage"): CardTrialPolicy {
  if (mode === "pass") return passPolicy();
  return ({ view, legalActions }) => {
    const hit = legalActions.find((a) => {
      if (a.kind !== "card") return false;
      return isDamagingCard(view, a.cardUid);
    });
    return hit ?? legalActions.find((a) => a.kind === "draft") ?? { kind: "pass" };
  };
}

export function randomLegalPolicy(seed: number): CardTrialPolicy {
  const stream = createShuffleStream(seed * 1009 + 17);
  return ({ legalActions }) => {
    if (legalActions.length === 0) return { kind: "pass" };
    const i = Math.floor(stream.nextUnit() * legalActions.length);
    return legalActions[i]!;
  };
}

/** Kill or chip the enemy currently aiming at the acting hero. */
export function threatFirstPolicy(): CardTrialPolicy {
  return ({ view, legalActions }) => {
    const heroId = actingHeroId(view);
    if (!heroId) return { kind: "pass" };
    const threats = new Set(
      view.intents.filter((i) => threatensHero(i, heroId)).map((i) => i.enemyId),
    );
    const scored = legalActions.map((action) => {
      let score = 0;
      if (action.kind === "card" && action.targetId && threats.has(action.targetId)) {
        const enemy = view.enemies.find((e) => e.id === action.targetId);
        const card = cardView(view, action.cardUid);
        score += 100;
        if (enemy && card && card.target !== "none") {
          const dmg = card.cost === 2 ? 8 : 5;
          if (enemy.hp <= dmg) score += 50;
        }
      }
      if (action.kind === "pass") score -= 1;
      if (action.kind === "move") score -= 5;
      if (action.kind === "draft") score += 1;
      return { action, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.action ?? { kind: "pass" };
  };
}

const GUARD_CARDS: CardId[] = ["brace", "pale-ward", "king-of-the-heap", "last-bastion"];

/** Prefer Guard over raw damage when the next hit exceeds current Guard. */
export function guardAwarePolicy(): CardTrialPolicy {
  return ({ view, legalActions }) => {
    const heroId = actingHeroId(view);
    const hero = view.heroes.find((h) => h.id === heroId);
    if (!hero) return { kind: "pass" };
    const incoming = incomingFor(view, hero.id);
    if (incoming > hero.guard) {
      const guardPlay = legalActions.find((a) => {
        if (a.kind !== "card") return false;
        const card = cardView(view, a.cardUid);
        return !!card && GUARD_CARDS.includes(card.defId as CardId);
      });
      if (guardPlay) return guardPlay;
    }
    return fixedPolicy("damage")({ view, legalActions, rng: () => 0 });
  };
}

const FRONT_CARDS: CardId[] = ["tide", "the-threshold", "king-of-the-heap", "last-bastion"];

/** Value Front bonus cards; do not spend Move first when they are live. */
export function frontAwarePolicy(): CardTrialPolicy {
  return ({ view, legalActions }) => {
    const hero = view.heroes.find((h) => h.id === view.actingHero);
    if (hero?.row === "front") {
      const frontPlay = legalActions.find((a) => {
        if (a.kind !== "card") return false;
        const card = cardView(view, a.cardUid);
        return !!card && FRONT_CARDS.includes(card.defId as CardId);
      });
      if (frontPlay) return frontPlay;
    }
    const withoutMove = legalActions.filter((a) => a.kind !== "move");
    return fixedPolicy("damage")({ view, legalActions: withoutMove.length ? withoutMove : legalActions, rng: () => 0 });
  };
}

/** Prefer Consume on the Opened enemy, then Open, then damage. */
export function openedAwarePolicy(): CardTrialPolicy {
  return ({ view, legalActions }) => {
    const consume = legalActions.find((a) => {
      if (a.kind !== "card" || !view.openedEnemyId || a.targetId !== view.openedEnemyId) return false;
      const card = view.hand.find((c) => c.uid === a.cardUid);
      return !!card && card.consume !== "none" && card.consumeArmed;
    });
    if (consume) return consume;
    const open = legalActions.find((a) => {
      if (a.kind !== "card") return false;
      const card = view.hand.find((c) => c.uid === a.cardUid);
      return !!card?.opens;
    });
    if (open) return open;
    return fixedPolicy("damage")({ view, legalActions, rng: () => 0 });
  };
}

export { beamSearchPolicy } from "./beam";
