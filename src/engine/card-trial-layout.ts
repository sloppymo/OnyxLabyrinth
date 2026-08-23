/**
 * Pure layout helpers for the Card Trial sparse battlefield HUD + physical hand.
 * Design space is the 768×672 combat stage. No DOM.
 */

import {
  cardTrialHeroSlot,
  enemySlot,
} from "./combat-scene-math";
import type { HeroId, PlayerRow } from "../game/card-trial/types";

export const DESIGN_W = 768;
export const DESIGN_H = 672;

export type CardTextLayoutTier = "short" | "medium" | "long";

export interface ActorHudAnchor {
  x: number;
  y: number;
  side: "above" | "below";
}

/** Art viewport height inside a stable 132×184 card. */
export const CARD_ART_HEIGHT: Record<CardTextLayoutTier, number> = {
  short: 96,
  medium: 80,
  long: 64,
};

export function cardTextLayoutTier(text: string): CardTextLayoutTier {
  const n = text.length;
  if (n <= 28) return "short";
  if (n <= 64) return "medium";
  return "long";
}

/**
 * Distance-decayed neighbor gap. Distance 1 (immediate neighbor) gets
 * `strength`; each further slot multiplies by `falloff`.
 */
export function neighborShiftPx(distance: number, strength: number, falloff: number): number {
  if (distance <= 0) return 0;
  return strength * Math.pow(falloff, distance - 1);
}

export function heroHudAnchor(heroId: HeroId, row: PlayerRow): ActorHudAnchor {
  const slot = cardTrialHeroSlot(row, heroId);
  return {
    x: slot.x,
    y: slot.footYFrac * DESIGN_H + 14,
    side: "below",
  };
}

export function enemyHudAnchor(visualRow: PlayerRow, indexInRow: number): ActorHudAnchor {
  const slot = enemySlot(indexInRow, visualRow);
  return {
    x: slot.x,
    y: slot.footYFrac * DESIGN_H - 36,
    side: "above",
  };
}

export function queueInitials(name: string, id: string): string {
  if (id === "rat-king") return "RK";
  if (id === "old-man") return "OM";
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  return id.slice(0, 2).toUpperCase();
}
