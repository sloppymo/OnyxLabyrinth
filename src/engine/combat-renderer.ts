// Canvas-based JRPG-style combat scene renderer.
//
// Replaces the old DOM text panel with a two-panel canvas layout:
//   - Top ~18%: bordered message box showing one log entry at a time
//   - Bottom ~82%: battle arena with procedural sprites (party left, enemies right)
//
// All sprites are drawn procedurally (no image assets). Party members are
// humanoid silhouettes color-coded by class; enemies are shape-coded by type.
// Sprite states: idle (bob), attacking (lunge), hit (flash), defeated (fade).
// Attack effects: melee slash line, spell particle burst.
//
// The renderer is driven by CombatController (combat-ui.ts) which sets the
// scene state each frame and calls render().

import type { Character } from "../game/party";
import type { EnemyInstance, CombatEvent } from "../game/combat";
import type { CombatState } from "../game/combat";

// --- Palette ---------------------------------------------------------------
// Reuse the dungeon palette for visual consistency.
const COLORS = {
  bg: "#14110d",
  bgArena: "#0e0d0a",
  amber: "#e0a458",
  amberDim: "#8a6a38",
  warmWhite: "#f5f0e6",
  textDim: "#9a8e7a",
  border: "#3a3025",
  danger: "#c44",
  heal: "#4a4",
  spell: "#48c",
  // Class colors for party silhouettes.
  classFighter: "#c44",
  classMage: "#48c",
  classPriest: "#e0d0a0",
  classThief: "#4a4",
  // Enemy shape colors by category.
  enemyVermin: "#8a7a5a",
  enemyConstruct: "#6a6a6a",
  enemyUndead: "#a0a0b0",
  enemyDemon: "#a44",
  enemyHumanoid: "#7a6a4a",
} as const;

// --- Sprite state ----------------------------------------------------------
export type SpriteState = "idle" | "attacking" | "hit" | "defeated";

export interface SpriteAnim {
  state: SpriteState;
  /** Timestamp (ms) when the current state was entered. */
  stateStart: number;
  /** For "attacking": lunge offset 0→1→0. For "hit": flash intensity. */
  progress: number;
  /** Opacity for defeated fade. */
  opacity: number;
}

// --- Effect system ---------------------------------------------------------
export interface CombatEffect {
  type: "slash" | "spellBurst" | "healBurst";
  /** Screen position. */
  x: number;
  y: number;
  /** Element color for spells. */
  color: string;
  /** Timestamp when the effect started. */
  start: number;
  /** Duration in ms. */
  duration: number;
}

// --- Scene state -----------------------------------------------------------
export interface CombatScene {
  state: CombatState;
  /** Phase label from the controller (e.g. "selectAction", "roundResult"). */
  phase: string;
  /** Index of the currently-acting party member (for the ▶ marker). */
  currentActorIndex: number;
  /** Flash message (e.g. "No spells to cast"). */
  flash: string | null;
  /** Prompt text shown at the bottom. */
  prompt: string;
  /** Available spells/items list for selection phases. */
  selectionList: string | null;
  /** Per-party-member animation state, keyed by character id. */
  partyAnims: Map<string, SpriteAnim>;
  /** Per-enemy animation state, keyed by instance id. */
  enemyAnims: Map<string, SpriteAnim>;
  /** Enemies that died this round (for death animations). Kept here so the
   *  render loop can draw the fade/rotate animation after the enemy is
   *  removed from the living front/back arrays. */
  enemyGraveyard: EnemyInstance[];
  /** Active visual effects (slashes, spell bursts). */
  effects: CombatEffect[];
  /** Message queue: log entries waiting to be revealed. */
  messageQueue: string[];
  /** Parallel event queue: structured events for each message (1:1 with messageQueue). */
  eventQueue: CombatEvent[];
  /** Currently displayed message (or null if queue is empty). */
  currentMessage: string | null;
  /** Timestamp when the current message was first shown. */
  messageStart: number;
  /** Auto-advance delay for messages (ms). */
  messageAdvanceDelay: number;
}

// --- Layout constants ------------------------------------------------------
const MSG_BOX_HEIGHT_RATIO = 0.18;
const SPRITE_W = 48;
const SPRITE_H = 64;
const PARTY_SLOT_SPACING = 70;
const ENEMY_SLOT_SPACING = 70;

// --- Sprite position computation -------------------------------------------

/** Compute screen positions for party members (left side, two rows). */
function partySlotPos(index: number, w: number, h: number): { x: number; y: number } {
  const row = Math.floor(index / 3); // 0 = front, 1 = back
  const col = index % 3;
  const arenaTop = h * MSG_BOX_HEIGHT_RATIO + 20;
  const arenaH = h * (1 - MSG_BOX_HEIGHT_RATIO) - 40;
  const baseX = w * 0.12;
  const baseY = arenaTop + arenaH * 0.55;
  // Front row is lower and closer to center; back row is higher and further left.
  const rowOffsetY = row === 0 ? 0 : -SPRITE_H * 0.7;
  const rowOffsetX = row === 0 ? 0 : -20;
  return {
    x: baseX + col * PARTY_SLOT_SPACING + rowOffsetX,
    y: baseY + rowOffsetY,
  };
}

/** Compute screen positions for enemies (right side, two rows). */
function enemySlotPos(
  index: number,
  total: number,
  row: "front" | "back",
  w: number,
  h: number
): { x: number; y: number } {
  const arenaTop = h * MSG_BOX_HEIGHT_RATIO + 20;
  const arenaH = h * (1 - MSG_BOX_HEIGHT_RATIO) - 40;
  const baseX = w * 0.72;
  const baseY = arenaTop + arenaH * 0.55;
  const rowOffsetY = row === "front" ? 0 : -SPRITE_H * 0.7;
  const rowOffsetX = row === "front" ? 0 : 20;
  // Spread enemies in the row.
  const spread = (index - (total - 1) / 2) * ENEMY_SLOT_SPACING;
  return {
    x: baseX + spread + rowOffsetX,
    y: baseY + rowOffsetY,
  };
}

// --- Procedural sprite drawing ---------------------------------------------

/** Draw a party member silhouette (humanoid, class-colored). */
function drawPartySprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  char: Character,
  anim: SpriteAnim,
  now: number,
  isCurrent: boolean
): void {
  ctx.save();
  ctx.globalAlpha = anim.opacity;

  // Idle bob: subtle vertical oscillation.
  const bob = anim.state === "idle" ? Math.sin(now / 800 + x * 0.01) * 2 : 0;
  // Attack lunge: shift right toward enemies.
  const lunge = anim.state === "attacking" ? anim.progress * 30 : 0;

  const px = x + lunge;
  const py = y + bob;

  // Hit flash: overlay white.
  const hitFlash = anim.state === "hit" ? 1 - anim.progress : 0;

  // Shadow ellipse.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(px, py + SPRITE_H / 2 + 4, SPRITE_W / 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body color by class.
  const cls = char.class;
  let bodyColor: string;
  switch (cls) {
    case "Fighter": bodyColor = COLORS.classFighter; break;
    case "Mage": bodyColor = COLORS.classMage; break;
    case "Priest": bodyColor = COLORS.classPriest; break;
    case "Thief": bodyColor = COLORS.classThief; break;
    default: bodyColor = COLORS.warmWhite;
  }

  // Defeated: draw lying down (rotated 90°).
  if (anim.state === "defeated") {
    ctx.translate(px, py + SPRITE_H / 3);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-px, -(py + SPRITE_H / 3));
  }

  // Body: rounded rectangle torso.
  ctx.fillStyle = bodyColor;
  roundRect(ctx, px - SPRITE_W / 4, py - SPRITE_H / 4, SPRITE_W / 2, SPRITE_H * 0.6, 6);
  ctx.fill();

  // Head: circle.
  ctx.beginPath();
  ctx.arc(px, py - SPRITE_H / 4 - 8, 10, 0, Math.PI * 2);
  ctx.fill();

  // Class-specific accessory.
  ctx.strokeStyle = COLORS.warmWhite;
  ctx.lineWidth = 1.5;
  if (cls === "Fighter") {
    // Sword line.
    ctx.beginPath();
    ctx.moveTo(px + SPRITE_W / 4, py - SPRITE_H / 6);
    ctx.lineTo(px + SPRITE_W / 4 + 16, py - SPRITE_H / 2);
    ctx.stroke();
  } else if (cls === "Mage") {
    // Staff (vertical line with dot).
    ctx.beginPath();
    ctx.moveTo(px - SPRITE_W / 4 - 4, py + SPRITE_H / 4);
    ctx.lineTo(px - SPRITE_W / 4 - 4, py - SPRITE_H / 2 - 4);
    ctx.stroke();
    ctx.fillStyle = COLORS.spell;
    ctx.beginPath();
    ctx.arc(px - SPRITE_W / 4 - 4, py - SPRITE_H / 2 - 6, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (cls === "Priest") {
    // Cross on chest.
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(px - 1, py - 6, 2, 8);
    ctx.fillRect(px - 4, py - 3, 8, 2);
  } else if (cls === "Thief") {
    // Hood: arc over head.
    ctx.beginPath();
    ctx.arc(px, py - SPRITE_H / 4 - 8, 12, Math.PI, 0);
    ctx.stroke();
  }

  // Hit flash overlay.
  if (hitFlash > 0) {
    ctx.globalAlpha = hitFlash * 0.7;
    ctx.fillStyle = "#fff";
    roundRect(ctx, px - SPRITE_W / 3, py - SPRITE_H / 2, SPRITE_W * 0.67, SPRITE_H, 6);
    ctx.fill();
    ctx.globalAlpha = anim.opacity;
  }

  // Current-actor marker (▶).
  if (isCurrent && anim.state !== "defeated") {
    ctx.fillStyle = COLORS.amber;
    ctx.font = 'bold 14px "FF36", monospace';
    ctx.textAlign = "center";
    ctx.fillText("▶", px, py - SPRITE_H / 2 - 18);
  }

  // Name + HP below sprite.
  ctx.globalAlpha = anim.opacity * 0.9;
  ctx.fillStyle = char.hp <= 0 ? COLORS.danger : COLORS.textDim;
  ctx.font = '10px "FF36", monospace';
  ctx.textAlign = "center";
  const hpText = char.hp <= 0 ? "KO" : `${char.hp}/${char.maxHp}`;
  ctx.fillText(hpText, px, py + SPRITE_H / 2 + 16);

  ctx.restore();
}

/** Draw an enemy silhouette (shape varies by enemy type). */
export function drawEnemySprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  enemy: EnemyInstance,
  anim: SpriteAnim,
  now: number,
  isTargetable: boolean,
  targetIndex: number
): void {
  ctx.save();
  ctx.globalAlpha = anim.opacity;

  const bob = anim.state === "idle" ? Math.sin(now / 700 + x * 0.02) * 2 : 0;
  // Attack lunge: shift left toward party.
  const lunge = anim.state === "attacking" ? anim.progress * -30 : 0;
  const px = x + lunge;
  const py = y + bob;
  const hitFlash = anim.state === "hit" ? 1 - anim.progress : 0;

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(px, py + SPRITE_H / 2 + 4, SPRITE_W / 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Determine enemy shape category from ID.
  const shape = enemyShape(enemy.id);
  const color = enemyColor(enemy.id);

  // Defeated: rotate.
  if (anim.state === "defeated") {
    ctx.translate(px, py + SPRITE_H / 3);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-px, -(py + SPRITE_H / 3));
  }

  ctx.fillStyle = color;
  switch (shape) {
    case "blob":
      // Amorphous blob (acid puddle, dust sprite).
      ctx.beginPath();
      ctx.ellipse(px, py, SPRITE_W / 2.5, SPRITE_H / 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes.
      ctx.fillStyle = "#000";
      ctx.fillRect(px - 8, py - 4, 3, 3);
      ctx.fillRect(px + 5, py - 4, 3, 3);
      break;

    case "insect":
      // Insect (giant rat, paper wasp, rift moth).
      ctx.beginPath();
      ctx.ellipse(px, py, SPRITE_W / 3, SPRITE_H / 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings/legs.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(px + i * 8, py);
        ctx.lineTo(px + i * 18, py - 12);
        ctx.stroke();
      }
      break;

    case "construct":
      // Blocky construct (stone guardian, animated armor, lesser construct).
      roundRect(ctx, px - SPRITE_W / 3, py - SPRITE_H / 3, SPRITE_W * 0.67, SPRITE_H * 0.67, 4);
      ctx.fill();
      // Glowing eyes.
      ctx.fillStyle = enemy.isBoss ? COLORS.danger : COLORS.amber;
      ctx.fillRect(px - 8, py - 8, 4, 4);
      ctx.fillRect(px + 4, py - 8, 4, 4);
      break;

    case "undead":
      // Skeletal/ghostly (failed experiment, headmaster's echo).
      ctx.beginPath();
      ctx.arc(px, py - 6, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px - 6, py + 2, 12, SPRITE_H / 3);
      // Dark eye sockets.
      ctx.fillStyle = "#000";
      ctx.fillRect(px - 6, py - 10, 4, 4);
      ctx.fillRect(px + 2, py - 10, 4, 4);
      break;

    case "humanoid":
      // Humanoid (lab assistant, training dummy, animated book).
      ctx.beginPath();
      ctx.arc(px, py - 12, 9, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, px - SPRITE_W / 4, py - 4, SPRITE_W / 2, SPRITE_H * 0.5, 4);
      ctx.fill();
      break;

    case "demon":
      // Demon (imp).
      ctx.beginPath();
      ctx.arc(px, py - 4, 14, 0, Math.PI * 2);
      ctx.fill();
      // Horns.
      ctx.beginPath();
      ctx.moveTo(px - 10, py - 16);
      ctx.lineTo(px - 14, py - 24);
      ctx.moveTo(px + 10, py - 16);
      ctx.lineTo(px + 14, py - 24);
      ctx.stroke();
      // Eyes.
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(px - 7, py - 6, 4, 4);
      ctx.fillRect(px + 3, py - 6, 4, 4);
      break;

    default:
      // Generic: simple circle.
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fill();
  }

  // Hit flash.
  if (hitFlash > 0) {
    ctx.globalAlpha = hitFlash * 0.7;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, SPRITE_W / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = anim.opacity;
  }

  // Targetable number.
  if (isTargetable) {
    ctx.fillStyle = COLORS.amber;
    ctx.font = 'bold 12px "FF36", monospace';
    ctx.textAlign = "center";
    ctx.fillText(`${targetIndex}.`, px, py - SPRITE_H / 2 - 6);
  }

  // Name + HP.
  ctx.globalAlpha = anim.opacity * 0.8;
  ctx.fillStyle = enemy.currentHp <= 0 ? COLORS.danger : COLORS.textDim;
  ctx.font = '10px "FF36", monospace';
  ctx.textAlign = "center";
  const hpText = enemy.currentHp <= 0 ? "KO" : `${enemy.currentHp}/${enemy.hp}`;
  ctx.fillText(hpText, px, py + SPRITE_H / 2 + 16);

  ctx.restore();
}

// --- Enemy shape/color mapping ---------------------------------------------

type EnemyShape = "blob" | "insect" | "construct" | "undead" | "humanoid" | "demon";

function enemyShape(id: string): EnemyShape {
  // Map enemy IDs to silhouette shapes.
  if (id.includes("rat") || id.includes("wasp") || id.includes("moth") || id.includes("cobweb")) return "insect";
  if (id.includes("puddle") || id.includes("dust") || id.includes("dummy")) return "blob";
  if (id.includes("guardian") || id.includes("armor") || id.includes("construct")) return "construct";
  if (id.includes("experiment") || id.includes("echo")) return "undead";
  if (id.includes("imp") || id.includes("demon")) return "demon";
  return "humanoid";
}

function enemyColor(id: string): string {
  const shape = enemyShape(id);
  switch (shape) {
    case "blob": return COLORS.enemyVermin;
    case "insect": return COLORS.enemyVermin;
    case "construct": return COLORS.enemyConstruct;
    case "undead": return COLORS.enemyUndead;
    case "demon": return COLORS.enemyDemon;
    default: return COLORS.enemyHumanoid;
  }
}

// --- Effect drawing --------------------------------------------------------

function drawEffect(ctx: CanvasRenderingContext2D, effect: CombatEffect, now: number): void {
  const elapsed = now - effect.start;
  const t = Math.min(1, elapsed / effect.duration);
  if (t >= 1) return;

  ctx.save();
  const alpha = 1 - t;
  ctx.globalAlpha = alpha;

  if (effect.type === "slash") {
    // Diagonal slash line that fades.
    const len = 40 + t * 20;
    ctx.strokeStyle = COLORS.warmWhite;
    ctx.lineWidth = 3 - t * 2;
    ctx.beginPath();
    ctx.moveTo(effect.x - len / 2, effect.y - len / 2);
    ctx.lineTo(effect.x + len / 2, effect.y + len / 2);
    ctx.stroke();
    // Spark particles.
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + t * 2;
      const r = t * 25;
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(effect.x + Math.cos(angle) * r - 1, effect.y + Math.sin(angle) * r - 1, 2, 2);
    }
  } else if (effect.type === "spellBurst" || effect.type === "healBurst") {
    // Expanding ring of particles.
    const radius = 10 + t * 30;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Inner particles.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = radius * 0.6;
      ctx.fillStyle = effect.color;
      ctx.fillRect(
        effect.x + Math.cos(angle) * r - 2,
        effect.y + Math.sin(angle) * r - 2,
        4, 4
      );
    }
  }

  ctx.restore();
}

// --- Message box drawing ---------------------------------------------------

function drawMessageBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene,
  now: number
): void {
  const boxH = h * MSG_BOX_HEIGHT_RATIO;
  const pad = 12;

  // Background.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, boxH);

  // Border.
  ctx.strokeStyle = COLORS.amber;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, boxH - 2);

  // Round header.
  ctx.fillStyle = COLORS.amberDim;
  ctx.font = '11px "FF36", monospace';
  ctx.textAlign = "left";
  const header = `[!] COMBAT — Round ${scene.state.round}${scene.state.isBoss ? " (BOSS)" : ""}`;
  ctx.fillText(header, pad, pad + 11);

  // Current message.
  if (scene.currentMessage) {
    ctx.fillStyle = COLORS.warmWhite;
    ctx.font = '14px "FF36", monospace';
    ctx.textAlign = "left";
    // Word-wrap the message to fit the box width.
    const maxWidth = w - pad * 2 - 20;
    const lines = wrapText(ctx, scene.currentMessage, maxWidth);
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      ctx.fillText(lines[i], pad, pad + 30 + i * 18);
    }

    // Advance indicator (blinking arrow).
    const blink = Math.floor(now / 400) % 2 === 0;
    if (blink && scene.messageQueue.length > 0) {
      ctx.fillStyle = COLORS.amber;
      ctx.fillText("▼", w - pad - 16, boxH - pad - 2);
    }
  } else if (scene.flash) {
    ctx.fillStyle = COLORS.danger;
    ctx.font = '13px "FF36", monospace';
    ctx.fillText(scene.flash, pad, pad + 30);
  }
}

// --- Prompt / selection drawing --------------------------------------------

function drawPrompt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene
): void {
  // The prompt bar height adapts to whether there's a selection list.
  const hasList = !!scene.selectionList;
  const barH = hasList ? 60 : 28;
  const y = h - barH;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, y, w, barH);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();

  ctx.fillStyle = COLORS.amber;
  ctx.font = '12px "FF36", monospace';
  ctx.textAlign = "left";
  ctx.fillText(scene.prompt, 12, y + 18);

  if (scene.selectionList) {
    ctx.fillStyle = COLORS.warmWhite;
    ctx.font = '11px "FF36", monospace';
    const lines = wrapText(ctx, scene.selectionList, w - 24);
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      ctx.fillText(lines[i], 12, y + 18 + 14 + i * 14);
    }
  }
}

// --- Main render function --------------------------------------------------

/** Render the complete combat scene to the canvas. */
export function renderCombat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene,
  now: number
): void {
  const s = scene.state;

  // Clear.
  ctx.fillStyle = COLORS.bgArena;
  ctx.fillRect(0, 0, w, h);

  // Arena background gradient (darker at edges).
  const arenaTop = h * MSG_BOX_HEIGHT_RATIO;
  const grad = ctx.createLinearGradient(0, arenaTop, 0, h);
  grad.addColorStop(0, "#1a1612");
  grad.addColorStop(0.5, "#0e0d0a");
  grad.addColorStop(1, "#080705");
  ctx.fillStyle = grad;
  ctx.fillRect(0, arenaTop, w, h - arenaTop);

  // Ground line (horizon of the arena).
  const groundY = arenaTop + (h - arenaTop) * 0.65;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  // --- Draw enemy sprites ---
  // Draw all enemies (including defeated ones, so the fade animation is
  // visible). Only living enemies get target numbers.
  const allEnemies = [...s.enemies.front, ...s.enemies.back];
  const isTargetPhase = scene.phase === "selectEnemyTarget";

  let targetNum = 0;
  for (const enemy of allEnemies) {
    const isDead = enemy.currentHp <= 0;
    // Skip dead enemies that have no anim entry (never animated = died
    // before any animation was triggered, e.g. from a group spell). This
    // prevents stale corpses from lingering forever.
    if (isDead && !scene.enemyAnims.has(enemy.instanceId)) continue;

    if (!isDead) targetNum++;
    const anim = scene.enemyAnims.get(enemy.instanceId) ?? {
      state: "idle" as SpriteState,
      stateStart: now,
      progress: 0,
      opacity: 1,
    };
    // Compute position among living enemies in the same row.
    const rowEnemies = (enemy.row === "front" ? s.enemies.front : s.enemies.back)
      .filter((e) => e.currentHp > 0);
    const idxInRow = rowEnemies.indexOf(enemy);
    // If the enemy is dead, use its original slot index as fallback.
    const effectiveIdx = idxInRow >= 0 ? idxInRow :
      (enemy.row === "front" ? s.enemies.front : s.enemies.back).indexOf(enemy);
    const pos = enemySlotPos(effectiveIdx, rowEnemies.length || 1, enemy.row, w, h);
    drawEnemySprite(ctx, pos.x, pos.y, enemy, anim, now, isTargetPhase && !isDead, targetNum);
  }

  // Draw graveyard enemies (defeated this round) so the death animation
  // (rotate + fade) is visible even after they're removed from the arrays.
  for (const enemy of scene.enemyGraveyard) {
    if (!scene.enemyAnims.has(enemy.instanceId)) continue;
    const anim = scene.enemyAnims.get(enemy.instanceId)!;
    // Only draw if still animating the defeated state.
    if (anim.state !== "defeated") continue;
    // Use the enemy's original slot position (it's no longer in the arrays).
    // Approximate original index: count living enemies in this row for slot
    // spacing, and use graveyard index within the row as the slot.
    const graveyardInRow = scene.enemyGraveyard.filter(
      (e) => e.row === enemy.row
    );
    const idxInRow = graveyardInRow.indexOf(enemy);
    const livingInRow = (enemy.row === "front" ? s.enemies.front : s.enemies.back)
      .filter((e) => e.currentHp > 0).length;
    const totalSlots = livingInRow + graveyardInRow.length;
    const effectiveIdx = livingInRow + idxInRow;
    const pos = enemySlotPos(effectiveIdx, totalSlots || 1, enemy.row, w, h);
    drawEnemySprite(ctx, pos.x, pos.y, enemy, anim, now, false, 0);
  }

  // --- Draw party sprites ---
  for (let i = 0; i < s.party.length; i++) {
    const char = s.party[i];
    const anim = scene.partyAnims.get(char.id) ?? {
      state: "idle" as SpriteState,
      stateStart: now,
      progress: 0,
      opacity: 1,
    };
    const pos = partySlotPos(i, w, h);
    const isCurrent = i === scene.currentActorIndex &&
      scene.phase !== "ready" &&
      scene.phase !== "roundResult" &&
      scene.phase !== "ended" &&
      scene.phase !== "messageReveal";
    drawPartySprite(ctx, pos.x, pos.y, char, anim, now, isCurrent);
  }

  // --- Draw effects (on top of sprites) ---
  for (const effect of scene.effects) {
    drawEffect(ctx, effect, now);
  }

  // --- Message box (top panel) ---
  drawMessageBox(ctx, w, h, scene, now);

  // --- Prompt (bottom) ---
  drawPrompt(ctx, w, h, scene);
}

// --- Helpers ---------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
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
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Animation update ------------------------------------------------------

/** Update sprite animation states based on elapsed time. */
export function updateAnimations(scene: CombatScene, now: number): void {
  // Update party anims.
  for (const anim of scene.partyAnims.values()) {
    const elapsed = now - anim.stateStart;
    if (anim.state === "attacking") {
      anim.progress = Math.min(1, elapsed / 300);
      if (anim.progress >= 1) {
        anim.state = "idle";
        anim.stateStart = now;
        anim.progress = 0;
      }
    } else if (anim.state === "hit") {
      anim.progress = Math.min(1, elapsed / 250);
      if (anim.progress >= 1) {
        anim.state = "idle";
        anim.stateStart = now;
        anim.progress = 0;
      }
    } else if (anim.state === "defeated") {
      anim.opacity = Math.max(0.3, 1 - elapsed / 500);
    }
  }

  // Update enemy anims (same logic).
  for (const anim of scene.enemyAnims.values()) {
    const elapsed = now - anim.stateStart;
    if (anim.state === "attacking") {
      anim.progress = Math.min(1, elapsed / 300);
      if (anim.progress >= 1) {
        anim.state = "idle";
        anim.stateStart = now;
        anim.progress = 0;
      }
    } else if (anim.state === "hit") {
      anim.progress = Math.min(1, elapsed / 250);
      if (anim.progress >= 1) {
        anim.state = "idle";
        anim.stateStart = now;
        anim.progress = 0;
      }
    } else if (anim.state === "defeated") {
      anim.opacity = Math.max(0.3, 1 - elapsed / 500);
    }
  }

  // Remove expired effects.
  scene.effects = scene.effects.filter((e) => now - e.start < e.duration);
}

// --- Log-to-animation mapping ----------------------------------------------

/**
 * Parse a log entry and trigger the appropriate sprite animations.
 * This is a heuristic approach — it matches patterns in the log strings
 * produced by combat.ts to determine which sprites to animate.
 *
 * Names can contain spaces (e.g. "Giant Rat", "Stone Guardian"), so we
 * use non-greedy `.+?` instead of `\w+` and anchor on the action keywords.
 */
export function triggerAnimationsForMessage(
  scene: CombatScene,
  message: string,
  now: number,
  w: number,
  h: number,
  event?: CombatEvent
): void {
  const s = scene.state;
  const allEnemies = [...s.enemies.front, ...s.enemies.back, ...scene.enemyGraveyard];

  // --- Regex fallback (for messages without structured events) ------------

  // Helper: find a party member by name. When multiple party members share
  // a name, prefer the one not currently in an active animation.
  const findParty = (name: string) => {
    const matches = s.party.filter((c) => c.name === name);
    if (matches.length <= 1) return matches[0];
    const idle = matches.find((c) => {
      const anim = scene.partyAnims.get(c.id);
      return !anim || (anim.state === "idle" && anim.progress >= 1);
    });
    return idle ?? matches[0];
  };

  // Helper: find an enemy by name (including graveyard). When multiple
  // enemies share a name, prefer the one not currently in an active
  // animation so duplicate-name encounters animate the correct instance.
  const findEnemy = (name: string) => {
    const matches = allEnemies.filter((e) => e.name === name);
    if (matches.length <= 1) return matches[0];
    const idle = matches.find((e) => {
      const anim = scene.enemyAnims.get(e.instanceId);
      return !anim || (anim.state === "idle" && anim.progress >= 1);
    });
    return idle ?? matches[0];
  };

  // Helper: trigger attack animation on attacker + hit/effect on target.
  const triggerAttack = (attackerName: string, targetName: string) => {
    const partyAttacker = findParty(attackerName);
    const enemyAttacker = findEnemy(attackerName);
    if (partyAttacker) {
      setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    }
    if (enemyAttacker) {
      setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    }

    const enemyTarget = findEnemy(targetName);
    const partyTarget = findParty(targetName);
    if (enemyTarget) {
      setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.warmWhite,
        start: now, duration: 300,
      });
    } else if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.danger,
        start: now, duration: 300,
      });
    }
  };

  // Helper: trigger spell animation on caster + burst on target.
  const triggerSpell = (casterName: string, targetName: string | null, isHeal: boolean) => {
    const partyCaster = findParty(casterName);
    const enemyCaster = findEnemy(casterName);
    if (partyCaster) {
      setAnim(scene.partyAnims, partyCaster.id, "attacking", now);
    }
    if (enemyCaster) {
      setAnim(scene.enemyAnims, enemyCaster.instanceId, "attacking", now);
    }
    if (!targetName) return;

    const enemyTarget = findEnemy(targetName);
    const partyTarget = findParty(targetName);
    if (enemyTarget) {
      setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color: COLORS.spell,
        start: now, duration: 400,
      });
    } else if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: isHeal ? "healBurst" : "spellBurst",
        x: pos.x, y: pos.y,
        color: isHeal ? COLORS.heal : COLORS.danger,
        start: now, duration: 400,
      });
    }
  };

  // Helper: trigger defeated animation.
  const triggerDefeated = (name: string) => {
    const enemy = findEnemy(name);
    const party = findParty(name);
    if (enemy) {
      setAnim(scene.enemyAnims, enemy.instanceId, "defeated", now);
    } else if (party) {
      setAnim(scene.partyAnims, party.id, "defeated", now);
    }
  };

  // Helper: trigger a spell effect burst on a target (no caster animation).
  // Used for per-target spell effect messages like "Fireball hits X for N damage."
  const triggerSpellEffect = (targetName: string, isHeal: boolean) => {
    const enemyTarget = findEnemy(targetName);
    const partyTarget = findParty(targetName);
    if (enemyTarget) {
      setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color: COLORS.spell,
        start: now, duration: 400,
      });
    } else if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: isHeal ? "healBurst" : "spellBurst",
        x: pos.x, y: pos.y,
        color: isHeal ? COLORS.heal : COLORS.danger,
        start: now, duration: 400,
      });
    }
  };

  // Helper: trigger a brief flash on a target (for status effects, misses, etc.).
  const triggerFlash = (targetName: string, color: string) => {
    const enemyTarget = findEnemy(targetName);
    const partyTarget = findParty(targetName);
    if (enemyTarget) {
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color,
        start: now, duration: 300,
      });
    } else if (partyTarget) {
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color,
        start: now, duration: 300,
      });
    }
  };

  // --- ID-based helpers (used by structured event dispatch) ---

  const findPartyById = (id: string) => s.party.find((c) => c.id === id);
  const findEnemyById = (id: string) =>
    allEnemies.find((e) => e.instanceId === id);

  const triggerAttackById = (actorId: string, targetId: string) => {
    const partyAttacker = findPartyById(actorId);
    const enemyAttacker = findEnemyById(actorId);
    if (partyAttacker) setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    if (enemyAttacker) setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);

    const enemyTarget = findEnemyById(targetId);
    const partyTarget = findPartyById(targetId);
    if (enemyTarget) {
      setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.warmWhite,
        start: now, duration: 300,
      });
    } else if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.danger,
        start: now, duration: 300,
      });
    }
  };

  const triggerMissById = (actorId: string, _targetId: string, reason: string) => {
    const partyAttacker = findPartyById(actorId);
    const enemyAttacker = findEnemyById(actorId);
    if (partyAttacker) setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    if (enemyAttacker) setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    // Flash the target if it exists (evade), otherwise just the attacker lunge.
    if (reason === "evade" && _targetId) {
      triggerFlashById(_targetId, COLORS.warmWhite);
    }
  };

  const triggerCastById = (
    actorId: string,
    _spellId: string,
    targetId: string | null,
    damage?: number,
    heal?: number
  ) => {
    const partyCaster = findPartyById(actorId);
    const enemyCaster = findEnemyById(actorId);
    if (partyCaster) setAnim(scene.partyAnims, partyCaster.id, "attacking", now);
    if (enemyCaster) setAnim(scene.enemyAnims, enemyCaster.instanceId, "attacking", now);
    if (!targetId) return;

    const isHeal = heal !== undefined && damage === undefined;
    const enemyTarget = findEnemyById(targetId);
    const partyTarget = findPartyById(targetId);
    if (enemyTarget) {
      setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color: COLORS.spell,
        start: now, duration: 400,
      });
    } else if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: isHeal ? "healBurst" : "spellBurst",
        x: pos.x, y: pos.y,
        color: isHeal ? COLORS.heal : COLORS.danger,
        start: now, duration: 400,
      });
    }
  };

  const triggerSpellEffectById = (
    targetId: string,
    damage?: number,
    heal?: number,
    statusInflicted?: string,
    isBuff?: boolean
  ) => {
    const isHeal = heal !== undefined || isBuff === true || (statusInflicted === undefined && damage === undefined && isBuff === undefined);
    const enemyTarget = findEnemyById(targetId);
    const partyTarget = findPartyById(targetId);
    if (enemyTarget) {
      if (damage !== undefined) setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color: COLORS.spell,
        start: now, duration: 400,
      });
    } else if (partyTarget) {
      if (damage !== undefined) setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: isHeal ? "healBurst" : "spellBurst",
        x: pos.x, y: pos.y,
        color: isHeal ? COLORS.heal : COLORS.danger,
        start: now, duration: 400,
      });
    }
  };

  const triggerDefeatedById = (targetId: string, wasEnemy: boolean) => {
    if (wasEnemy) {
      const enemy = findEnemyById(targetId);
      if (enemy) setAnim(scene.enemyAnims, enemy.instanceId, "defeated", now);
    } else {
      const party = findPartyById(targetId);
      if (party) setAnim(scene.partyAnims, party.id, "defeated", now);
    }
  };

  const triggerRevivedById = (targetId: string) => {
    const party = findPartyById(targetId);
    const enemy = findEnemyById(targetId);
    if (party) setAnim(scene.partyAnims, party.id, "idle", now);
    else if (enemy) setAnim(scene.enemyAnims, enemy.instanceId, "idle", now);
  };

  const triggerDefendById = (actorId: string) => {
    triggerFlashById(actorId, COLORS.warmWhite);
  };

  const triggerFlashById = (targetId: string, color: string) => {
    const enemyTarget = findEnemyById(targetId);
    const partyTarget = findPartyById(targetId);
    if (enemyTarget) {
      const pos = findEnemyPos(s, enemyTarget.instanceId, w, h, scene.enemyGraveyard);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color,
        start: now, duration: 300,
      });
    } else if (partyTarget) {
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: "spellBurst", x: pos.x, y: pos.y, color,
        start: now, duration: 300,
      });
    }
  };

  // --- Structured event dispatch (preferred over regex) -------------------
  if (event) {
    switch (event.type) {
      case "attack":
        triggerAttackById(event.actorId, event.targetId);
        return;
      case "miss":
        triggerMissById(event.actorId, event.targetId, event.reason);
        return;
      case "cast":
        triggerCastById(event.actorId, event.spellId, event.targetId, event.damage, event.heal);
        return;
      case "spellEffect":
        triggerSpellEffectById(event.targetId, event.damage, event.heal, event.statusInflicted, event.isBuff);
        return;
      case "defeated":
        triggerDefeatedById(event.targetId, event.wasEnemy);
        return;
      case "revived":
        triggerRevivedById(event.targetId);
        return;
      case "defend":
        triggerDefendById(event.actorId);
        return;
      case "statusTick":
        triggerFlashById(event.targetId, COLORS.heal);
        return;
      case "statusEnd":
        triggerFlashById(event.targetId, COLORS.warmWhite);
        return;
      case "flee":
        // No per-sprite animation for flee; the message box conveys it.
        return;
      case "silence":
        triggerFlashById(event.targetId, COLORS.spell);
        return;
      case "fizzle":
        triggerFlashById(event.actorId, COLORS.textDim);
        return;
    }
  }

  // --- Pattern matching ---

  // === Spell effect patterns (per-target, from group/all spells) ===
  // These must come BEFORE the generic "X hits Y" and "X attacks Y" patterns
  // because the first capture group is a spell name, not a combatant.

  // "SpellName hits Y for N damage." — group spell damage effect.
  let m = message.match(/^(.+?) hits (.+?) for \d+ damage\./);
  if (m) {
    // If the first capture is a known combatant, it's a melee hit; otherwise
    // it's a spell effect (spell name as first word).
    const actor = findParty(m[1]) ?? findEnemy(m[1]);
    if (actor) {
      triggerAttack(m[1], m[2]);
    } else {
      triggerSpellEffect(m[2], false);
    }
    return;
  }

  // "SpellName heals Y for N HP." — healing spell effect.
  m = message.match(/^(.+?) heals (.+?) for \d+ HP\./);
  if (m) {
    triggerSpellEffect(m[2], true);
    return;
  }

  // "SpellName cures Y of Z." — cure status effect.
  m = message.match(/^(.+?) cures (.+?) of /);
  if (m) {
    triggerSpellEffect(m[2], true);
    return;
  }

  // "SpellName bolsters Y's armor by N." — armor buff.
  m = message.match(/^(.+?) bolsters (.+?)'s armor by /);
  if (m) {
    triggerSpellEffect(m[2], true);
    return;
  }

  // "SpellName resurrects Y with N HP!" — resurrect effect.
  m = message.match(/^(.+?) resurrects (.+?) with /);
  if (m) {
    triggerSpellEffect(m[2], true);
    // Reset the target's defeated animation.
    const partyTarget = findParty(m[2]);
    if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "idle", now);
    }
    return;
  }

  // "X casts Silence on Y!" — silence spell (specific pattern before generic cast).
  m = message.match(/^(.+?) casts Silence on (.+?)!/);
  if (m) {
    triggerSpell(m[1], m[2], false);
    return;
  }

  // === Status effect patterns ===

  // "X is afflicted with Y." — status inflicted.
  m = message.match(/^(.+?) is afflicted with /);
  if (m) {
    triggerFlash(m[1], COLORS.spell);
    return;
  }

  // "X is poisoned!" — poison inflicted.
  m = message.match(/^(.+?) is poisoned!/);
  if (m) {
    triggerFlash(m[1], COLORS.heal);
    return;
  }

  // "X suffers 2 poison damage." — poison tick.
  m = message.match(/^(.+?) suffers \d+ poison damage\./);
  if (m) {
    triggerFlash(m[1], COLORS.heal);
    return;
  }

  // "X is no longer paralyzed." — paralysis ends.
  m = message.match(/^(.+?) is no longer paralyzed\./);
  if (m) {
    triggerFlash(m[1], COLORS.warmWhite);
    return;
  }

  // "X wakes up!" — sleep ends.
  m = message.match(/^(.+?) wakes up!/);
  if (m) {
    triggerFlash(m[1], COLORS.warmWhite);
    return;
  }

  // === Miss/evade patterns ===

  // "X evades Y's attack!" — target evades.
  m = message.match(/^(.+?) evades /);
  if (m) {
    triggerFlash(m[1], COLORS.warmWhite);
    return;
  }

  // "X flits away from Y's swing!" — target evades (flying).
  m = message.match(/^(.+?) flits away from /);
  if (m) {
    triggerFlash(m[1], COLORS.warmWhite);
    return;
  }

  // "X is blind and misses Y." — attacker misses due to blind.
  m = message.match(/^(.+?) is blind and misses /);
  if (m) {
    // Attacker lunges but no target hit.
    const partyAttacker = findParty(m[1]);
    const enemyAttacker = findEnemy(m[1]);
    if (partyAttacker) setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    if (enemyAttacker) setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    return;
  }

  // "X is blind and the spell misses." — spell misses due to blind.
  m = message.match(/^(.+?) is blind and the spell misses\./);
  if (m) {
    const partyAttacker = findParty(m[1]);
    const enemyAttacker = findEnemy(m[1]);
    if (partyAttacker) setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    if (enemyAttacker) setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    return;
  }

  // "X attacks but finds no target." — attacker lunges, no target.
  m = message.match(/^(.+?) attacks but finds no target\./);
  if (m) {
    const partyAttacker = findParty(m[1]);
    const enemyAttacker = findEnemy(m[1]);
    if (partyAttacker) setAnim(scene.partyAnims, partyAttacker.id, "attacking", now);
    if (enemyAttacker) setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    return;
  }

  // "X lands a critical hit!" — no animation (next message has the damage).
  m = message.match(/^(.+?) lands a critical hit!/);
  if (m) {
    // The critical hit message is followed by the damage message, which will
    // trigger the attack animation. No action needed here.
    return;
  }

  // "X defends." — defend action.
  m = message.match(/^(.+?) defends\./);
  if (m) {
    // Subtle flash to acknowledge the defend action.
    triggerFlash(m[1], COLORS.warmWhite);
    return;
  }

  // "X's spell fizzles — this is an anti-magic zone." — spell fizzled.
  m = message.match(/^(.+?)'s spell fizzles/);
  if (m) {
    triggerFlash(m[1], COLORS.textDim);
    return;
  }

  // === Combatant action patterns ===

  // "X attacks Y for N damage." — melee attack (party or enemy).
  m = message.match(/^(.+?) attacks (.+?) for \d+ damage\./);
  if (m) {
    triggerAttack(m[1], m[2]);
    return;
  }

  // "X casts Y at Z for N damage." — enemy spell with target.
  m = message.match(/^(.+?) casts .+? at (.+?) for \d+ damage\./);
  if (m) {
    triggerSpell(m[1], m[2], false);
    return;
  }

  // "X casts Y, healing Z for N HP." — healing spell with target.
  m = message.match(/^(.+?) casts .+?, healing (.+?) for \d+ HP\./);
  if (m) {
    triggerSpell(m[1], m[2], true);
    return;
  }

  // "X casts Y." — spell without explicit target (group/all).
  // Also "X casts Y on Z." for single-target casts.
  m = message.match(/^(.+?) casts (.+)/);
  if (m) {
    const casterName = m[1];
    const rest = m[2];
    // Try to extract target from "on Z" or "at Z".
    const targetMatch = rest.match(/(?:on|at) (.+?)(?:!|\.|,|$)/);
    const targetName = targetMatch ? targetMatch[1].replace(/[!.]$/, "").trim() : null;
    const isHeal = /heal|cure|restore|revive|resurrect/i.test(rest);
    triggerSpell(casterName, targetName, isHeal);
    return;
  }

  // "X is destroyed." / "X is knocked out!" — death.
  m = message.match(/^(.+?) is destroyed\./);
  if (m) {
    triggerDefeated(m[1]);
    return;
  }
  m = message.match(/^(.+?) is knocked out!/);
  if (m) {
    triggerDefeated(m[1]);
    return;
  }

  // "X is revived!" — reset defeated animation.
  m = message.match(/^(.+?) is revived!/);
  if (m) {
    const name = m[1];
    const party = findParty(name);
    const enemy = findEnemy(name);
    if (party) {
      setAnim(scene.partyAnims, party.id, "idle", now);
    } else if (enemy) {
      setAnim(scene.enemyAnims, enemy.instanceId, "idle", now);
    }
    return;
  }

  // "X uses Y on Z, curing W." — item use with target.
  m = message.match(/^(.+?) uses .+? on (.+?),/);
  if (m) {
    triggerSpell(m[1], m[2], /cure|heal|revive/i.test(message));
    return;
  }

  // "X uses Y to revive Z with N HP!" — revive item.
  m = message.match(/^(.+?) uses .+? to revive (.+?) with/);
  if (m) {
    triggerSpell(m[1], m[2], true);
    // Also reset the target's defeated animation.
    const targetName = m[2];
    const partyTarget = findParty(targetName);
    if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "idle", now);
    }
    return;
  }
}

// --- Animation helpers -----------------------------------------------------

export function setAnim(
  anims: Map<string, SpriteAnim>,
  id: string,
  state: SpriteState,
  now: number
): void {
  const anim = anims.get(id);
  if (anim) {
    anim.state = state;
    anim.stateStart = now;
    anim.progress = 0;
    if (state === "defeated") {
      anim.opacity = 1; // will fade in update
    } else {
      // Reset opacity for non-defeated states (e.g. revived from KO).
      anim.opacity = 1;
    }
  } else {
    anims.set(id, {
      state,
      stateStart: now,
      progress: 0,
      opacity: 1,
    });
  }
}

function findEnemyPos(
  s: CombatState,
  instanceId: string,
  w: number,
  h: number,
  graveyard: EnemyInstance[] = []
): { x: number; y: number } {
  const all = [...s.enemies.front, ...s.enemies.back, ...graveyard];
  for (let i = 0; i < all.length; i++) {
    if (all[i].instanceId === instanceId) {
      const enemy = all[i];
      // Position among living enemies in the same row (matches render logic).
      const rowEnemies = (enemy.row === "front" ? s.enemies.front : s.enemies.back)
        .filter((e) => e.currentHp > 0);
      const idxInRow = rowEnemies.indexOf(enemy);
      const effectiveIdx = idxInRow >= 0 ? idxInRow :
        (enemy.row === "front" ? s.enemies.front : s.enemies.back).indexOf(enemy);
      return enemySlotPos(effectiveIdx, rowEnemies.length || 1, enemy.row, w, h);
    }
  }
  return { x: w / 2, y: h / 2 };
}

function findPartyPos(
  s: CombatState,
  charId: string,
  w: number,
  h: number
): { x: number; y: number } {
  const idx = s.party.findIndex((c) => c.id === charId);
  if (idx >= 0) return partySlotPos(idx, w, h);
  return { x: w / 2, y: h / 2 };
}
