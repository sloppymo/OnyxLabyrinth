/**
 * Pure layout helpers for the Card Trial sparse battlefield HUD + physical hand.
 * Design space is the 768×672 combat stage. No DOM.
 */

import {
  cardTrialHeroSlot,
  geometryForBackdrop,
  enemySlot,
  artFootFromTopFor,
  artTopFromTopFor,
  resolveSlot,
  visualHeadY,
} from "./combat-scene-math";
import type { HeroId, PlayerRow } from "../game/card-trial/types";
import {
  BOSS_SIZE,
  ENEMY_SIZE,
  PARTY_SIZE,
  animOffset,
  partyActorPos,
  type CombatScene,
} from "./combat-choreography";
import { enemySpriteId } from "./enemy-sprite-cache";
import { ENEMY_SPRITE_DEFS } from "./sprite-manifest";
import type { CardTrialActorUiState } from "./card-trial-ui-model";
import { getPartySpriteStrip } from "./party-sprite-cache";
import { getCardTrialHeroSpriteStrip } from "./card-trial-hero-sprite-cache";
import { statusDrawScale } from "../game/combat-shared";

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

export interface CardTrialActorAnchor {
  id: string;
  kind: "hero" | "enemy";
  x: number;
  drawY: number;
  topY: number;
  footY: number;
  drawSize: number;
  opacity: number;
  mirrored: boolean;
}

export interface CardTrialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardTrialActorIndicatorLayout {
  id: string;
  visible: boolean;
  plate: CardTrialRect;
  ring: CardTrialRect;
  edgeCue: CardTrialRect;
  marker: { x: number; y: number };
  arrow: { x: number; y: number };
  targetLabel: { x: number; y: number };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function liveOffset(scene: CombatScene, kind: "hero" | "enemy", id: string, now: number) {
  const anim = kind === "hero" ? scene.partyAnims.get(id) : scene.enemyAnims.get(id);
  return anim ? { ...animOffset(anim, now), opacity: anim.opacity } : { x: 0, y: 0, opacity: 1 };
}

/**
 * Resolve every living Card Trial actor from the same formation slots and
 * choreography offsets used by Canvas and Phaser. Mirroring is metadata only:
 * it never changes the semantic x/footY anchor.
 */
export function cardTrialActorAnchors(scene: CombatScene, now: number): CardTrialActorAnchor[] {
  if (scene.state.partyFormation?.kind !== "card-trial-rows") return [];
  const anchors: CardTrialActorAnchor[] = [];

  scene.state.party.forEach((actor, index) => {
    if (actor.hp <= 0 || actor.status.includes("knockedOut")) return;
    const anim = scene.partyAnims.get(actor.id);
    const stripInfo = anim
      ? getCardTrialHeroSpriteStrip(actor.id, anim.state) ??
        getPartySpriteStrip(actor.class, anim.state)
      : getPartySpriteStrip(actor.class, "idle");
    const statusScale = statusDrawScale(actor.status);
    const artFoot = artFootFromTopFor({
      hasStrip: !!stripInfo,
      stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
    });
    const artTop = artTopFromTopFor({
      hasStrip: !!stripInfo,
      stripArtTopFromTop: stripInfo?.strip.artTopFromTop,
    });
    const pos = partyActorPos(
      scene.state,
      index,
      actor.id,
      DESIGN_W,
      DESIGN_H,
      scene.backdropId,
      {
        spriteHeight: PARTY_SIZE * statusScale,
        artFootFromTop: artFoot,
      }
    );
    const off = liveOffset(scene, "hero", actor.id, now);
    const drawSize = PARTY_SIZE * pos.scale * statusScale;
    anchors.push({
      id: actor.id,
      kind: "hero",
      x: pos.x + off.x,
      drawY: pos.drawY + off.y,
      topY: visualHeadY(pos.drawY + off.y, drawSize, artTop),
      footY: pos.footY + off.y,
      drawSize,
      opacity: off.opacity,
      mirrored: true,
    });
  });

  for (const row of ["back", "front"] as const) {
    scene.state.enemies[row].forEach((enemy, rowIndex) => {
      if (enemy.currentHp <= 0) return;
      const spriteId = enemySpriteId(enemy);
      const sprite = ENEMY_SPRITE_DEFS[spriteId]?.idle;
      const hasStrip = !!sprite;
      const artFoot = artFootFromTopFor({
        hasStrip,
        stripArtFootFromTop: sprite?.artFootFromTop,
      });
      const artTop = artTopFromTopFor({
        hasStrip,
        stripArtTopFromTop: sprite?.artTopFromTop,
      });
      const baseSize = enemy.isBoss ? BOSS_SIZE : ENEMY_SIZE;
      const stableIndex = scene.enemySlots.get(enemy.instanceId) ?? rowIndex;
      const pos = resolveSlot(
        enemySlot(stableIndex, row),
        geometryForBackdrop(scene.backdropId),
        {
          spriteHeight: baseSize,
          canvasWidth: DESIGN_W,
          artFootFromTop: artFoot,
        }
      );
      const off = liveOffset(scene, "enemy", enemy.instanceId, now);
      const drawSize = baseSize * pos.scale;
      anchors.push({
        id: enemy.instanceId,
        kind: "enemy",
        x: pos.x + off.x,
        drawY: pos.drawY + off.y,
        topY: visualHeadY(pos.drawY + off.y, drawSize, artTop),
        footY: pos.footY + off.y,
        drawSize,
        opacity: off.opacity,
        mirrored: false,
      });
    });
  }
  return anchors;
}

function intersects(a: CardTrialRect, b: CardTrialRect, gap = 4): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function plateSize(actor: CardTrialActorUiState): { width: number; height: number } {
  const nameWidth = actor.name.length * 6 + 26;
  return {
    width: clamp(nameWidth, actor.kind === "hero" ? 92 : 84, 116),
    height: 38,
  };
}

function plateCandidates(
  anchor: CardTrialActorAnchor,
  actor: CardTrialActorUiState,
  size: { width: number; height: number }
): CardTrialRect[] {
  const centerX = clamp(anchor.x, size.width / 2 + 8, DESIGN_W - size.width / 2 - 8);
  // A selected target reserves a compact arrow lane between its plate and
  // sprite. All other plates stay tight to the actor so the arena remains
  // visually dominant.
  const arrowLane = actor.selectedTarget ? 38 : 0;
  const preferredY = clamp(anchor.topY - size.height - 8 - arrowLane, 92, 410 - size.height);
  const side = anchor.x < DESIGN_W / 2 ? -1 : 1;
  const lateral = clamp(centerX + side * (size.width * 0.66), size.width / 2 + 8, DESIGN_W - size.width / 2 - 8);
  return [
    { x: centerX - size.width / 2, y: preferredY, ...size },
    { x: centerX - size.width / 2, y: clamp(preferredY - size.height - 5, 92, 410 - size.height), ...size },
    { x: lateral - size.width / 2, y: preferredY, ...size },
    { x: centerX - size.width / 2, y: clamp(anchor.footY + 8, 92, 410 - size.height), ...size },
  ];
}

/**
 * Deterministic actor plate collision resolution plus indicator geometry.
 * Far actors claim their preferred position first; nearer actors shift along
 * the same ordered candidate list rather than using screenshot-specific nudges.
 */
export function layoutCardTrialActorIndicators(
  anchors: readonly CardTrialActorAnchor[],
  actors: readonly CardTrialActorUiState[]
): CardTrialActorIndicatorLayout[] {
  const semantic = new Map(actors.map((actor) => [actor.id, actor]));
  const occupied: CardTrialRect[] = [];
  const sorted = [...anchors].sort((a, b) => a.footY - b.footY || a.x - b.x || a.id.localeCompare(b.id));
  const layouts: CardTrialActorIndicatorLayout[] = [];

  for (const anchor of sorted) {
    const actor = semantic.get(anchor.id);
    if (!actor) continue;
    const size = plateSize(actor);
    const candidates = plateCandidates(anchor, actor, size);
    const plate = candidates.find((candidate) => occupied.every((rect) => !intersects(candidate, rect))) ?? candidates[0]!;
    if (actor.plateVisible) occupied.push(plate);

    const ringWidth = clamp(anchor.drawSize * 0.38, 72, 112);
    const ringHeight = clamp(ringWidth * 0.3, 22, 34);
    const bodyWidth = clamp(anchor.drawSize * 0.38, 62, 118);
    const bodyHeight = clamp(anchor.footY - anchor.topY + 8, 52, 138);
    layouts.push({
      id: anchor.id,
      visible: !actor.dead && anchor.opacity > 0.02,
      plate,
      ring: {
        x: anchor.x - ringWidth / 2,
        y: anchor.footY - ringHeight * 0.58,
        width: ringWidth,
        height: ringHeight,
      },
      edgeCue: {
        x: anchor.x - bodyWidth / 2,
        y: anchor.topY - 2,
        width: bodyWidth,
        height: bodyHeight,
      },
      marker: {
        x: anchor.x,
        y: anchor.topY - 12,
      },
      arrow: {
        x: anchor.x,
        y: anchor.topY - 27,
      },
      targetLabel: {
        x: plate.x + plate.width / 2,
        y: plate.y - 13,
      },
    });
  }
  return layouts;
}
