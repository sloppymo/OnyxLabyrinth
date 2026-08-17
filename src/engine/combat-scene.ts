/**
 * FF6-style combat scene — canvas painter.
 *
 * Choreography (playTurn / updateScene / scene model) lives in
 * combat-choreography.ts. This module imports it and draws; choreography
 * must never import this file.
 */

import type { Character } from "../game/party";
import type { EnemyInstance, SummonedAlly } from "../game/combat-types";
import { statusDrawScale } from "../game/combat-shared";
import { enemySpriteId, getEnemySpriteStrip } from "./enemy-sprite-cache";
import { getPartySpriteStrip } from "./party-sprite-cache";
import { getEffectSprite } from "./effect-sprite-cache";
import {
  ENEMY_SPRITE_DEFS,
  PROCEDURAL_ENEMY_SPRITE_OPT_OUTS,
  type SpriteStrip,
} from "./sprite-manifest";
import { warnAsset } from "./asset-warn";
import combatBgUrl from "../assets/combat-bg.png";
import {
  artFootFromTopFor,
  artTopFromTopFor,
  visualHeadY,
  MARKER_TIP_GAP_PX,
  resolveSlot,
  partySlot,
  enemySlot,
} from "./combat-scene-math";
import {
  COLORS,
  PARTY_SPRITE_SIZE,
  ENEMY_SIZE,
  BOSS_SIZE,
  ANIM_SPEED,
  BARK_MAX_WIDTH_PX,
  POPUP_DURATION,
  HP_PIP_COUNT,
  enemyHpPipsLit,
  enemyStripState,
  effectFrame,
  BOSS_PRESENTATION,
  popupOffsetY,
  animOffset,
  frameIndexFor,
  getAnim,
  findActor,
  sampleProjectilePose,
  getBarksEnabled,
  geoFor,
  toScreenPos,
  setAnimState,
  enemySlotIndex,
  allySlotIndex,
  partyPos,
  enemyPos,
  allyPos,
  type CombatScene,
  type ActorAnim,
  type SceneCursor,
  type SceneEffect,
} from "./combat-choreography";
import {
  sampleZoom,
  sampleEnvironmentLight,
  sampleActorFlash,
} from "./combat-impact-fx";
import { screenShakeOffset } from "./combat-motion";

// Re-export the public choreography API so existing importers keep working.
export {
  enemyIsUndead,
  partyPos,
  enemyPos,
  allyPos,
  createScene,
  playTurn,
  updateScene,
  isPlaybackDone,
  skipPlaybackToEnd,
  absorbDeaths,
  findActor,
  pushBark,
  setBarksEnabled,
  getBarksEnabled,
  setBossIntroNameplate,
  resolveEffectStyle,
  resolveMeleeHitEffect,
  MISS_PRESENTATION,
  collectReferencedEffectIds,
  sampleProjectilePose,
  newActorAnim,
  BARK_DURATION_BASE,
  COLORS,
  PARTY_SPRITE_SIZE,
  ENEMY_SIZE,
  BOSS_SIZE,
  ANIM_SPEED,
  EFFECT_ANIM_SPEED,
  POPUP_DURATION,
  DEATH_FADE_MS,
  BOSS_PRESENTATION,
  enemyStripState,
  effectFrame,
  enemyHpPipsLit,
  HP_PIP_COUNT,
  popupOffsetY,
  animOffset,
  frameIndexFor,
  getAnim,
} from "./combat-choreography";
export type {
  ActorScreenPos,
  ActorSpriteState,
  ActorAnim,
  DamagePopup,
  CombatBark,
  SceneCursor,
  CombatScene,
  SceneEffect,
  Particle,
  LightGlow,
  MeleeHitEffect,
  EffectStyle,
  ChoreoStep,
  Choreography,
} from "./combat-choreography";

/**
 * Canvas paint-order sort key: an actor's static home-slot footY adjusted by
 * its LIVE move offset. Without the offset, a sprite mid-tween away from its
 * home slot (e.g. Orc's Pack Leap leaping deep into party territory) paints
 * in its home row's z-order instead of its actual on-screen position — the
 * Phaser backend already accounts for this via sprite.setDepth on the offset
 * position, so this keeps both backends' paint order in sync.
 */
export function paintOrderFootY(baseFootY: number, anim: ActorAnim | undefined, now: number): number {
  return anim ? baseFootY + animOffset(anim, now).y : baseFootY;
}

// --- Background (painter-owned; DOM Image) ------------------------------------

let combatBgImage: HTMLImageElement | null = null;
function getCombatBg(): HTMLImageElement | null {
  if (!combatBgImage) {
    combatBgImage = new Image();
    combatBgImage.onerror = () => {
      warnAsset(`failed to load combat background: ${combatBgUrl}`);
      combatBgImage = null;
    };
    combatBgImage.src = combatBgUrl;
  }
  return combatBgImage;
}

const warnedMissingEnemySprites = new Set<string>();
const warnedMissingPartySprites = new Set<string>();

// --- Drawing ---------------------------------------------------------------------------

/** Soft contact shadow at the foot baseline — plants the sprite on the floor.
 * Ellipse ry must stay in sync with CONTACT_SHADOW_BELOW_FOOT_PX in combat-scene-math.
 */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  spriteWidth: number
): void {
  const rx = Math.max(8, spriteWidth * 0.28);
  const ry = rx * 0.28;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  // Bias the ellipse slightly upward so the dark core sits under the foot
  // plant (half-below centering left squat blobs floating over daylight).
  ctx.ellipse(footX, footY - ry * 0.35, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Small HP-tick readout under an enemy's feet — 4 pips, lit proportionally
 * to currentHp/maxHp. Only drawn once the enemy has taken damage (reads
 * straight off the live EnemyInstance; no separate "damaged" event/state
 * needed since currentHp < maxHp already means "hit at least once").
 */
function drawEnemyHpPips(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  footX: number,
  footY: number,
  spriteWidth: number
): void {
  const lit = enemyHpPipsLit(enemy);
  if (lit === null) return;
  const pipW = 6;
  const gap = 2;
  const totalW = HP_PIP_COUNT * pipW + (HP_PIP_COUNT - 1) * gap;
  const startX = footX - totalW / 2;
  const y = footY + Math.max(4, spriteWidth * 0.08);
  const color =
    enemy.currentHp / enemy.hp <= 0.25
      ? "#f07070"
      : enemy.currentHp / enemy.hp <= 0.5
        ? "#e8a060"
        : "#ffe790";
  ctx.save();
  for (let i = 0; i < HP_PIP_COUNT; i++) {
    ctx.fillStyle = i < lit ? color : "rgba(16, 28, 88, 0.55)";
    ctx.fillRect(startX + i * (pipW + gap), y, pipW, 3);
  }
  ctx.restore();
}

/**
 * Status tints for strip sprites. Do NOT use source-atop + fillRect on the
 * live combat canvas — party draw size is ~300px, so that paints huge green/
 * orange slabs over floor + neighbors. Canvas `filter` only recolors the
 * pixels of this drawImage (transparent padding stays transparent).
 */
const POISON_FILTER = "sepia(0.18) hue-rotate(80deg) saturate(1.25)";
const BURN_FILTER = "sepia(0.22) hue-rotate(-30deg) saturate(1.35)";

/** Fallback-shape washes (procedural ellipses/rects — same geometry, safe). */
const POISON_TINT = "rgba(60, 190, 80, 0.28)";
const BURN_TINT = "rgba(255, 130, 40, 0.28)";

/**
 * Draw one frame of a sprite strip centered at (x, y-baseline), optionally
 * mirrored horizontally. `size` is the square draw size.
 * `tint` is POISON_TINT / BURN_TINT (or undefined).
 */
function drawStripFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  strip: SpriteStrip,
  frame: number,
  x: number,
  y: number,
  size: number,
  mirror: boolean,
  opacity: number,
  tint?: string,
  actorId?: string,
  scene?: CombatScene,
  now?: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  if (tint === POISON_TINT) ctx.filter = POISON_FILTER;
  else if (tint === BURN_TINT) ctx.filter = BURN_FILTER;
  ctx.drawImage(
    img,
    frame * strip.frameWidth,
    0,
    strip.frameWidth,
    strip.frameHeight,
    -size / 2,
    -size / 2,
    size,
    size
  );
  // Actor silhouette flash: additive white/elemental overlay on strong hits.
  if (actorId && scene && now !== undefined) {
    const flash = sampleActorFlash(scene.impact.actorFlashes.get(actorId) ?? null, now);
    if (flash.strength > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = flash.strength * opacity;
      ctx.fillStyle = flash.color;
      // Draw the same sprite frame again as a solid tinted silhouette:
      // we can't easily tint a sprite, so we draw a filled rect over the
      // sprite bounds as a flash glow.
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }
  }
  ctx.restore();
}

/** Procedural fallback for enemies with no image strip. */
function drawEnemyFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  enemy: EnemyInstance,
  anim: ActorAnim,
  now: number,
  size: number = ENEMY_SIZE,
  frozen = false,
  tint?: string
): void {
  const scale = size / ENEMY_SIZE;
  const w = 104 * scale;
  const h = 122 * scale;
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = anim.state === "idle" && !frozen ? Math.sin(now / 700 + x * 0.02) * 2 : 0;
  const py = y + bob;
  if (anim.state === "death") {
    ctx.translate(x, py);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-x, -py);
  }
  ctx.fillStyle = enemy.isBoss ? "#a44" : COLORS.enemyFallback;
  ctx.beginPath();
  ctx.ellipse(x, py - h * 0.25, w / 2.4, h / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes face the party (right).
  ctx.fillStyle = "#14110d";
  ctx.fillRect(x + 6 * scale, py - h * 0.32, 5 * scale, 5 * scale);
  ctx.fillRect(x + 18 * scale, py - h * 0.32, 5 * scale, 5 * scale);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(x, py - h * 0.25, w / 2.4, h / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (anim.state === "hurt") {
    const intensity = anim.hitFlashIntensity || 0.3;
    const sz = 1 + intensity * 0.3;
    ctx.globalAlpha = intensity * 0.5;
    ctx.fillStyle = "#ff4040";
    ctx.beginPath();
    ctx.ellipse(x, py - h * 0.25, (w / 2.2) * sz, (h / 2.8) * sz, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Procedural fallback for party members while sprites are loading. */
function drawPartyFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  char: Character,
  anim: ActorAnim,
  size: number = PARTY_SPRITE_SIZE,
  tint?: string
): void {
  const scale = size / PARTY_SPRITE_SIZE;
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const colors: Record<string, string> = {
    Fighter: COLORS.classFighter,
    Mage: COLORS.classMage,
    Priest: COLORS.classPriest,
    Thief: COLORS.classThief,
    Halberdier: COLORS.classHalberdier,
    Duelist: COLORS.classDuelist,
    Crusader: COLORS.classCrusader,
  };
  ctx.fillStyle = colors[char.class] ?? "#ccc";
  ctx.fillRect(x - 12 * scale, y - 44 * scale, 24 * scale, 36 * scale);
  ctx.beginPath();
  ctx.arc(x, y - 52 * scale, 9 * scale, 0, Math.PI * 2);
  ctx.fill();
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(x - 12 * scale, y - 44 * scale, 24 * scale, 36 * scale);
    ctx.beginPath();
    ctx.arc(x, y - 52 * scale, 9 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw one party member. */
function drawPartyMember(
  ctx: CanvasRenderingContext2D,
  char: Character,
  index: number,
  scene: CombatScene,
  now: number,
  w: number,
  _h: number
): void {
  const anim = getAnim(scene, "party", char.id, now);
  const stripInfo = getPartySpriteStrip(char.class, anim.state);
  const artFoot = artFootFromTopFor({
    hasStrip: !!stripInfo,
    stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
  });
  const artTop = artTopFromTopFor({
    hasStrip: !!stripInfo,
    stripArtTopFromTop: stripInfo?.strip.artTopFromTop,
  });
  const statusScale = statusDrawScale(char.status);
  const slot = toScreenPos(
    resolveSlot(partySlot(index), geoFor(scene.backdropId), {
      spriteHeight: PARTY_SPRITE_SIZE * statusScale,
      canvasWidth: w,
      artFootFromTop: artFoot,
    })
  );
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = PARTY_SPRITE_SIZE * slot.scale * statusScale;

  const isDead = char.hp <= 0 || char.status.includes("knockedOut");
  if (isDead && anim.state !== "death") setAnimState(anim, "death", now);
  if (!isDead && anim.state === "death") setAnimState(anim, "idle", now);

  const hidden = char.status.includes("hidden");

  drawContactShadow(ctx, x, footY, drawSize * 0.45);

  const frozen = char.status.includes("sleep") || char.status.includes("paralysis");
  const poisoned = char.status.includes("poison");
  const tint = poisoned ? POISON_TINT : undefined;

  const opacity = (hidden ? 0.35 : 1) * anim.opacity;
  if (stripInfo) {
    const stateAge = now - anim.stateStart;
    const frame = frozen && anim.state === "idle" ? 0 : frameIndexFor(stripInfo.strip, stateAge, anim.frameRateScale);
    drawStripFrame(ctx, stripInfo.img, stripInfo.strip, frame, x, y, drawSize, true, opacity, tint, char.id, scene, now);
  } else {
    if (
      !warnedMissingPartySprites.has(char.class) &&
      !getPartySpriteStrip(char.class, "idle")
    ) {
      warnedMissingPartySprites.add(char.class);
      warnAsset(
        `party sprite missing for class ${char.class} — using procedural fallback`,
      );
    }
    drawPartyFallback(ctx, x, y, char, anim, drawSize, tint);
    if (anim.state === "hurt" && now - anim.stateStart < 200) {
      const intensity = anim.hitFlashIntensity || 0.3;
      const sz = 1 + intensity * 0.3;
      ctx.save();
      ctx.globalAlpha = intensity * 0.4;
      ctx.fillStyle = "#ff4040";
      ctx.fillRect(
        x - (drawSize / 4) * sz,
        y - (drawSize / 2.4) * sz,
        (drawSize / 2) * sz,
        drawSize * 0.8 * sz
      );
      ctx.restore();
    }
  }

  drawMarkers(
    ctx,
    scene,
    "party",
    char.id,
    x,
    visualHeadY(slot.drawY + off.y, drawSize, artTop),
    now
  );
}

/** Draw one enemy (living or corpse). */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  idxInRow: number,
  scene: CombatScene,
  now: number,
  w: number,
  _h: number
): void {
  const anim = getAnim(scene, "enemy", enemy.instanceId, now);
  if (anim.opacity <= 0) return;
  const baseSize = enemy.isBoss ? BOSS_SIZE : ENEMY_SIZE;
  const spriteId = enemySpriteId(enemy);
  const stripInfo = getEnemySpriteStrip(spriteId, enemyStripState(anim.state));
  const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
  const artFoot = artFootFromTopFor({
    hasStrip,
    stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
  });
  const artTop = artTopFromTopFor({
    hasStrip,
    stripArtTopFromTop: stripInfo?.strip.artTopFromTop,
  });
  const statusScale = statusDrawScale(enemy.status);
  const slot = toScreenPos(
    resolveSlot(enemySlot(idxInRow, enemy.row), geoFor(scene.backdropId), {
      spriteHeight: baseSize * statusScale,
      canvasWidth: w,
      artFootFromTop: artFoot,
    })
  );
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = baseSize * slot.scale * statusScale;

  const frozen = enemy.status.includes("sleep") || enemy.status.includes("paralysis");
  const burning = (scene.state.enemyDots[enemy.instanceId]?.length ?? 0) > 0;
  const tint = burning ? BURN_TINT : enemy.status.includes("poison") ? POISON_TINT : undefined;

  drawContactShadow(ctx, x, footY, drawSize * 0.45);

  // Boss silhouette aura — cheap per-id tint so borrowed trash sprites still
  // read as gatekeepers (Dead Boy / Lonely Girl / Crying Man).
  if (enemy.isBoss) {
    const style = BOSS_PRESENTATION[enemy.id];
    const glow = style?.glow ?? "rgba(180, 60, 60, 0.35)";
    ctx.save();
    const pulse = 0.55 + 0.2 * Math.sin(now / 480);
    ctx.globalAlpha = anim.opacity * pulse;
    const grd = ctx.createRadialGradient(x, y, drawSize * 0.08, x, y, drawSize * 0.55);
    grd.addColorStop(0, glow);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(x, y, drawSize * 0.48, drawSize * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (hasStrip && stripInfo) {
    const { strip, img } = stripInfo;
    const stateAge = now - anim.stateStart;
    let frame: number;
    if (anim.state === "death") {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 675) * strip.frameCount));
    } else if (frozen && anim.state === "idle") {
      frame = 0;
    } else if (strip.loop || anim.state === "idle") {
      frame = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED) % strip.frameCount;
    } else {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED));
    }
    drawStripFrame(ctx, img!, strip, frame, x, y, drawSize, false, anim.opacity, tint, enemy.instanceId, scene, now);
  } else {
    if (
      !ENEMY_SPRITE_DEFS[spriteId] &&
      !PROCEDURAL_ENEMY_SPRITE_OPT_OUTS[spriteId] &&
      !warnedMissingEnemySprites.has(spriteId)
    ) {
      warnedMissingEnemySprites.add(spriteId);
      warnAsset(
        `enemy ${spriteId} has no sprite manifest entry or procedural opt-out`,
      );
    }
    drawEnemyFallback(ctx, x, y, enemy, anim, now, drawSize, frozen, tint);
  }

  drawEnemyHpPips(ctx, enemy, x, footY, drawSize);

  drawMarkers(
    ctx,
    scene,
    "enemy",
    enemy.instanceId,
    x,
    visualHeadY(slot.drawY + off.y, drawSize, artTop),
    now
  );
}

/** Draw a summoned ally (sprite if available, otherwise glowing orb). */
function drawAlly(
  ctx: CanvasRenderingContext2D,
  ally: SummonedAlly,
  index: number,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  const anim = getAnim(scene, "ally", ally.id, now);
  if (anim.opacity <= 0) return;
  const slot = allyPos(index, w, h, scene.backdropId);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  const footY = slot.footY + off.y;
  const drawSize = ENEMY_SIZE * slot.scale;

  if (ally.spriteId) {
    const stripInfo = getEnemySpriteStrip(ally.spriteId, enemyStripState(anim.state));
    if (stripInfo?.img && stripInfo.img.naturalWidth > 0) {
      drawContactShadow(ctx, x, footY, drawSize * 0.45);
      const { strip, img } = stripInfo;
      const stateAge = now - anim.stateStart;
      let frame: number;
      if (anim.state === "death") {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 675) * strip.frameCount));
      } else if (strip.loop || anim.state === "idle") {
        frame = Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED) % strip.frameCount;
      } else {
        frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps * ANIM_SPEED));
      }
      // Enemy-pack strips face RIGHT; summons fight for the party (center/right
      // of the stage) so mirror them to face LEFT toward the enemy line —
      // same contract as drawPartyMember.
      drawStripFrame(ctx, img, strip, frame, x, y, drawSize, true, anim.opacity, undefined, ally.id, scene, now);
      const artTop = artTopFromTopFor({
        hasStrip: true,
        stripArtTopFromTop: strip.artTopFromTop,
      });
      drawMarkers(
        ctx,
        scene,
        "ally",
        ally.id,
        x,
        visualHeadY(slot.drawY + off.y, drawSize, artTop),
        now
      );
      return;
    }
    if (
      ally.spriteId &&
      !ENEMY_SPRITE_DEFS[ally.spriteId] &&
      !PROCEDURAL_ENEMY_SPRITE_OPT_OUTS[ally.spriteId] &&
      !warnedMissingEnemySprites.has(ally.spriteId)
    ) {
      warnedMissingEnemySprites.add(ally.spriteId);
      warnAsset(
        `ally sprite ${ally.spriteId} has no manifest entry or procedural opt-out`,
      );
    }
  }

  drawContactShadow(ctx, x, footY, drawSize * 0.35);
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = Math.sin(now / 500 + index) * 3 * slot.scale;
  ctx.fillStyle = COLORS.spellBurst;
  ctx.beginPath();
  ctx.arc(x, y + bob, 16 * slot.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.spellBurst;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x + i * 9 * slot.scale, y + bob);
    ctx.lineTo(x + i * 20 * slot.scale, y + bob - 14 * slot.scale);
    ctx.stroke();
  }
  ctx.restore();
  drawMarkers(ctx, scene, "ally", ally.id, x, y - 16 * slot.scale, now);
}

/**
 * Cursor (target selection) and active-actor hand markers.
 * `topY` is the sprite's VISUAL HEAD y (art top, not a drawSize fraction) —
 * the triangle tip hovers MARKER_TIP_GAP_PX above it, FF6-tight.
 */
function drawMarkers(
  ctx: CanvasRenderingContext2D,
  scene: CombatScene,
  kind: SceneCursor["kind"],
  id: string,
  x: number,
  topY: number,
  now: number
): void {
  const isCursor = scene.cursor?.kind === kind && scene.cursor.id === id;
  const isActive = kind === "party" && scene.activeActorId === id;
  const isGuarded = kind === "enemy" && !!scene.state.enemyGuards?.[id];
  if (!isCursor && !isActive && !isGuarded) return;

  if (isGuarded) {
    const guardPulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now / 230));
    ctx.save();
    ctx.globalAlpha = guardPulse;
    ctx.strokeStyle = "#73e7ff";
    ctx.fillStyle = "rgba(55, 177, 220, 0.18)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, topY + 13, 17, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineTo(x + 12, topY + 26);
    ctx.lineTo(x, topY + 32);
    ctx.lineTo(x - 12, topY + 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d9f8ff";
    ctx.fillText("GUARDED", x, topY + 45);
    ctx.restore();
  }

  if (!isCursor && !isActive) return;

  // Bounce + soft opacity pulse (never fully off — hard blink was easy to
  // miss against busy floor art at Deck scale).
  const bounce = Math.sin(now / 180) * 3;
  const pulse = isCursor
    ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 200))
    : 1;
  const fill =
    isCursor && scene.cursor?.kill ? COLORS.cursorKill : COLORS.cursor;
  const y = topY - MARKER_TIP_GAP_PX + bounce;

  ctx.save();
  ctx.globalAlpha = pulse;
  // Soft halo under the triangle for contrast on textured floors.
  if (isCursor) {
    ctx.fillStyle = "rgba(255, 236, 140, 0.45)";
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 14);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#14110d";
  ctx.lineWidth = 2.5;
  // Downward-pointing FF6 hand-ish triangle.
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 12);
  ctx.lineTo(x + 9, y - 12);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}


/** Draw a single effect sprite strip centered at the current origin. */
function drawEffectSprite(
  ctx: CanvasRenderingContext2D,
  effect: SceneEffect,
  type: SceneEffect["type"],
  t: number,
  now: number
): void {
  if (type === "charge") {
    drawChargeSprite(ctx, effect, t, now);
    return;
  }

  if (effect.effect) {
    const sprite = getEffectSprite(effect.effect);
    if (sprite && sprite.img) {
      const strip = sprite.strip;
      const frame = effectFrame(sprite, effect.start, now, type);
      const col = frame % sprite.cols;
      const row = Math.floor(frame / sprite.cols);
      const sx = col * strip.frameWidth;
      const sy = row * strip.frameHeight;
      const scale = effect.scale ?? 1;
      const dw = strip.frameWidth * scale;
      const dh = strip.frameHeight * scale;
      const alpha = type === "burst" ? 1 - t : type === "field" ? 1 - t * 0.5 : 1;

      if (effect.glow && (type === "burst" || type === "field")) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.6;
        const radius = Math.max(dw, dh) * 0.55;
        const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
        grad.addColorStop(0, "rgba(255,255,255,0.85)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.img, sx, sy, strip.frameWidth, strip.frameHeight, -dw / 2, -dh / 2, dw, dh);
      return;
    }
  }

  // Procedural fallback.
  if (type === "projectile") {
    ctx.fillStyle = effect.color;
    ctx.fillRect(-3, -1, 6, 2);
  } else {
    const radius = 12 + t * 36;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + t;
      const r = radius * 0.7;
      ctx.fillStyle = effect.color;
      ctx.fillRect(Math.cos(angle) * r - 2, Math.sin(angle) * r - 2, 4, 4);
    }
  }
}

/** Draw a charge sprite pulsing above a caster. */
function drawChargeSprite(
  ctx: CanvasRenderingContext2D,
  effect: SceneEffect,
  t: number,
  now: number
): void {
  if (effect.effect) {
    const sprite = getEffectSprite(effect.effect);
    if (sprite && sprite.img) {
      const strip = sprite.strip;
      const frame = effectFrame(sprite, effect.start, now, "charge");
      const col = frame % sprite.cols;
      const row = Math.floor(frame / sprite.cols);
      const sx = col * strip.frameWidth;
      const sy = row * strip.frameHeight;
      const scale = (effect.scale ?? 1) * (1 + Math.sin(t * Math.PI * 2) * 0.15);
      const dw = strip.frameWidth * scale;
      const dh = strip.frameHeight * scale;
      ctx.globalAlpha = 0.7 + Math.sin(t * Math.PI * 2) * 0.3;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.img, sx, sy, strip.frameWidth, strip.frameHeight, -dw / 2, -dh / 2, dw, dh);
      return;
    }
  }
  // Procedural fallback.
  const radius = 10 + t * 14;
  ctx.globalAlpha = 0.7 - t * 0.4;
  ctx.fillStyle = effect.color;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Scene effects: spell bursts, projectiles, and field overlays. */
function drawEffects(ctx: CanvasRenderingContext2D, scene: CombatScene, now: number): void {
  for (const effect of scene.effects) {
    const tRaw = (now - effect.start) / effect.duration;
    const t = Math.min(1, Math.max(0, tRaw));
    ctx.save();
    if (effect.type === "burst" || effect.type === "field") {
      ctx.translate(effect.x, effect.y);
      drawEffectSprite(ctx, effect, effect.type, t, now);
    } else if (effect.type === "charge") {
      ctx.translate(effect.x, effect.y - 60);
      drawEffectSprite(ctx, effect, "charge", t, now);
    } else if (effect.type === "projectile") {
      const fromX = effect.fromX ?? effect.x;
      const fromY = effect.fromY ?? effect.y;
      const toX = effect.toX ?? effect.x;
      const toY = effect.toY ?? effect.y;
      const pose = sampleProjectilePose(t, fromX, fromY, toX, toY, {
        apexX: effect.apexX,
        apexY: effect.apexY,
        riseFrac: effect.riseFrac,
      });
      // Slight scale-up while hovering so the sprite is easier to read.
      const drawScale =
        pose.phase === "rise" && effect.riseFrac
          ? (effect.scale ?? 1) * (1 + 0.18 * Math.min(1, t / effect.riseFrac))
          : effect.scale;
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      drawEffectSprite(ctx, { ...effect, scale: drawScale }, "projectile", t, now);
    }
    ctx.restore();
  }
}

/** Draw loose impact particles behind the scene effects. */
function drawParticles(ctx: CanvasRenderingContext2D, scene: CombatScene): void {
  for (const p of scene.particles) {
    const life = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = 1 - life;
    if (p.glow) {
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - life * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Dialog barks — live-anchored above the speaker, drawn last. */
function drawBarks(
  ctx: CanvasRenderingContext2D,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  if (!getBarksEnabled()) return;
  ctx.font = `19px "FF36", monospace`;
  for (const b of scene.barks) {
    const actor = findActor(scene, b.actorId, w, h);
    if (!actor) continue;
    const anim = getAnim(scene, actor.kind, b.actorId, now);
    if (anim.opacity <= 0) continue;
    const off = animOffset(anim, now);
    const x = actor.x + off.x;
    const y = actor.y + off.y - 36 * actor.scale;
    const metrics = ctx.measureText(b.text);
    if (metrics.width > BARK_MAX_WIDTH_PX) continue;

    const t = Math.min(1, (now - b.start) / b.durationMs);
    const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const dy = popupOffsetY(t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#14110d";
    ctx.strokeText(b.text, x, y + dy);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, x, y + dy);
    ctx.restore();
  }
}

/** FF6-style bouncing damage popups. */
function drawPopups(ctx: CanvasRenderingContext2D, scene: CombatScene, now: number): void {
  for (const p of scene.popups) {
    const t = Math.min(1, (now - p.start) / POPUP_DURATION);
    const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const dy = popupOffsetY(t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${p.big ? 30 : 24}px "FF36", monospace`;
    ctx.textAlign = "center";
    // Black outline for readability, FF6-style.
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#14110d";
    ctx.strokeText(p.text, p.x, p.y + dy);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y + dy);
    ctx.restore();
  }
}

/** FF6 blue gradient window (canvas version, used for the top banner). */
export function drawFF6Window(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const r = 6;
  ctx.save();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#3048b0");
  grad.addColorStop(1, "#101c58");
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e8e8f0";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5068c8";
  ctx.stroke();
  ctx.restore();
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  w: number,
  scene: CombatScene,
  now: number
): void {
  if (!scene.banner) return;
  // Fade in over the first 120ms, out over the last 220ms, and hold slightly
  // under full opacity so the spell effect — not the label — owns the moment.
  const age = now - scene.bannerStart;
  const remaining = scene.bannerUntil - now;
  let alpha = 0.88;
  if (age < 120) alpha *= Math.max(0, age / 120);
  else if (remaining < 220) alpha *= Math.max(0, remaining / 220);
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '22px "FF36", monospace';
  const textW = ctx.measureText(scene.banner).width;
  const boxW = Math.max(220, textW + 56);
  const boxH = 42;
  const x = (w - boxW) / 2;
  const y = 10;
  drawFF6Window(ctx, x, y, boxW, boxH);
  ctx.fillStyle = COLORS.banner;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(scene.banner, w / 2, y + boxH / 2 + 1);
  ctx.restore();
}


/** Larger top plate for boss reveal — lives above the spell banner slot. */
function drawIntroNameplate(
  ctx: CanvasRenderingContext2D,
  w: number,
  scene: CombatScene,
  now: number
): void {
  if (!scene.introNameplate) return;
  const age = now - scene.introNameplateStart;
  const remaining = scene.introNameplateUntil - now;
  let alpha = 0.95;
  if (age < 180) alpha *= Math.max(0, age / 180);
  else if (remaining < 320) alpha *= Math.max(0, remaining / 320);
  if (alpha <= 0.01) return;
  const style =
    (scene.introBossId && BOSS_PRESENTATION[scene.introBossId]) || {
      tag: "BOSS",
      accent: "#e07070",
      glow: "rgba(180, 60, 60, 0.35)",
      subtitle: "",
    };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '28px "FF36", monospace';
  const nameW = ctx.measureText(scene.introNameplate).width;
  ctx.font = '14px "FF36", monospace';
  const tagW = ctx.measureText(style.tag).width;
  const subW = style.subtitle ? ctx.measureText(style.subtitle).width : 0;
  const boxW = Math.max(300, Math.max(nameW, tagW, subW) + 80);
  const boxH = style.subtitle ? 78 : 64;
  const x = (w - boxW) / 2;
  const y = 12;
  // Accent rim — unique per boss so the plate isn't a generic red BOSS chip.
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 1, y - 1, boxW + 2, boxH + 2);
  drawFF6Window(ctx, x, y, boxW, boxH);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.accent;
  ctx.font = '14px "FF36", monospace';
  ctx.fillText(style.tag, w / 2, y + 16);
  ctx.fillStyle = COLORS.banner;
  ctx.font = '28px "FF36", monospace';
  ctx.fillText(scene.introNameplate, w / 2, y + (style.subtitle ? 40 : 42));
  if (style.subtitle) {
    ctx.fillStyle = style.accent;
    ctx.globalAlpha = alpha * 0.85;
    ctx.font = '12px "FF36", monospace';
    ctx.fillText(style.subtitle, w / 2, y + 62);
  }
  ctx.restore();
}


// --- Main render -----------------------------------------------------------------------

export function renderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene,
  now: number
): void {
  const s = scene.state;

  ctx.save();

  // Apply screen shake as a whole-scene jitter. The amount decays in
  // updateScene; ±amount/2 keeps even the max (8) comfortable.
  if (scene.screenShake.amount > 0) {
    const a = scene.screenShake.amount;
    const shake = screenShakeOffset(a, now);
    ctx.translate(shake.x, shake.y);
  }

  // Bounded impact zoom: scale around the impact focus point.
  // Applied before all drawing so the entire scene zooms together.
  const zoom = sampleZoom(scene.impact.zoom, now);
  if (zoom.scale > 1.001) {
    ctx.translate(zoom.focusX, zoom.focusY);
    ctx.scale(zoom.scale, zoom.scale);
    ctx.translate(-zoom.focusX, -zoom.focusY);
  }

  // Background: prefer the baked arena room backdrop (current floor tileset),
  // fall back to the static combat-bg.png image, then a plain gradient.
  const backdrop = scene.backdrop;
  if (backdrop) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(backdrop, 0, 0, w, h);
  } else {
    // Fall back to the static combat-bg.png gradient image.
    const bg = getCombatBg();
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0d0b08");
      grad.addColorStop(1, "#1f1b14");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Elemental environmental lighting: dim the backdrop during prelude,
  // then flash + floor/rim glow on impact.  Drawn after background but
  // before sprites so actors sit on top of the lighting.
  const envLight = sampleEnvironmentLight(scene.impact.environment, now);
  if (envLight.active) {
    // Backdrop dim (multiply-like via dark overlay).
    if (envLight.backdropDim > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = envLight.backdropDim;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Screen flash (additive, very brief).
    if (envLight.screenFlashStrength > 0) {
      const flashColor = scene.impact.environment?.color ?? "#ffffff";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = envLight.screenFlashStrength;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Floor glow (additive radial from impact source point on the floor).
    if (envLight.floorStrength > 0) {
      const floorColor = scene.impact.environment?.color ?? "#ffffff";
      const srcX = scene.impact.environment?.sourceX ?? w * 0.5;
      const srcY = scene.impact.environment?.sourceY ?? h * 0.7;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = envLight.floorStrength * 0.5;
      const grad = ctx.createRadialGradient(srcX, srcY, 0, srcX, srcY, w * 0.5);
      grad.addColorStop(0, floorColor);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Rim light (additive top vignette).
    if (envLight.rimStrength > 0) {
      const rimColor = scene.impact.environment?.color ?? "#ffffff";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = envLight.rimStrength * 0.3;
      const grad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
      grad.addColorStop(0, rimColor);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h * 0.4);
      ctx.restore();
    }
  }

  // Floor illumination: additive radial glows under impacts, drawn before
  // sprites so bursts light the ground and sprite bottoms.
  if (scene.lightGlows.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of scene.lightGlows) {
      const p = (now - g.start) / g.duration;
      if (p < 0 || p >= 1) continue;
      const alpha = (1 - p) * 0.35;
      const r = g.radius * (0.6 + p * 0.5);
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      grad.addColorStop(0, g.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // Combatants sorted by footY ascending (farther first) — see
  // paintOrderFootY for why the live offset matters. Contact shadows draw
  // inside each draw* call immediately before the sprite.
  type DrawCmd = { footY: number; draw: () => void };
  const cmds: DrawCmd[] = [];

  s.enemies.back.forEach((e) => {
    const slot = enemySlotIndex(scene, "back", e.instanceId);
    const pos = enemyPos(slot, "back", w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.enemyAnims.get(e.instanceId), now),
      draw: () => drawEnemy(ctx, e, slot, scene, now, w, h),
    });
  });
  s.enemies.front.forEach((e) => {
    const slot = enemySlotIndex(scene, "front", e.instanceId);
    const pos = enemyPos(slot, "front", w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.enemyAnims.get(e.instanceId), now),
      draw: () => drawEnemy(ctx, e, slot, scene, now, w, h),
    });
  });
  scene.enemyCorpses.forEach((e) => {
    const slot = scene.enemySlots.get(e.instanceId) ?? enemySlotIndex(scene, e.row, e.instanceId);
    const pos = enemyPos(slot, e.row, w, h, scene.backdropId, e.isBoss ? BOSS_SIZE : ENEMY_SIZE);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.enemyAnims.get(e.instanceId), now),
      draw: () => drawEnemy(ctx, e, slot, scene, now, w, h),
    });
  });
  s.summonedAllies.forEach((a) => {
    const slot = allySlotIndex(scene, a.id);
    const pos = allyPos(slot, w, h, scene.backdropId);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.allyAnims.get(a.id), now),
      draw: () => drawAlly(ctx, a, slot, scene, now, w, h),
    });
  });
  scene.allyCorpses.forEach((a) => {
    const idx = scene.allySlots.get(a.id) ?? allySlotIndex(scene, a.id);
    const pos = allyPos(idx, w, h, scene.backdropId);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.allyAnims.get(a.id), now),
      draw: () => drawAlly(ctx, a, idx, scene, now, w, h),
    });
  });
  for (let i = 0; i < s.party.length; i++) {
    const char = s.party[i]!;
    // Visual stand position keys off the dense in-combat rank (i), not the
    // roster's formationSlot (0-3, front 0-1 / back 2-3) — matches
    // findActor's convention.
    const pos = partyPos(i, w, h, scene.backdropId);
    cmds.push({
      footY: paintOrderFootY(pos.footY, scene.partyAnims.get(char.id), now),
      draw: () => drawPartyMember(ctx, char, i, scene, now, w, h),
    });
  }

  cmds.sort((a, b) => a.footY - b.footY);
  for (const c of cmds) c.draw();

  // Overlay VFX (effects, particles, popups, banners) stay above combatants.
  drawEffects(ctx, scene, now);
  drawParticles(ctx, scene);
  drawPopups(ctx, scene, now);
  drawBarks(ctx, scene, now, w, h);

  // Banner window (top center). Round number now lives in the enemy-column
  // header of the unified footer window, not a separate canvas pill.
  // Intro nameplate owns the top slot while it's up so spell banners don't
  // stack on top of the boss reveal.
  if (scene.introNameplate) {
    drawIntroNameplate(ctx, w, scene, now);
  } else {
    drawBanner(ctx, w, scene, now);
  }

  // Sticky FAST / AUTO cues (top-right).
  if (scene.showFastCue || scene.showAutoCue) {
    ctx.save();
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    let x = w - 16;
    if (scene.showFastCue) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - 56, 8, 64, 22);
      ctx.fillStyle = "#ffe566";
      ctx.fillText("FAST", x, 12);
      x -= 72;
    }
    if (scene.showAutoCue) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - 56, 8, 64, 22);
      ctx.fillStyle = "#7ec8ff";
      ctx.fillText("AUTO", x, 12);
    }
    ctx.restore();
  }

  ctx.restore();
}
