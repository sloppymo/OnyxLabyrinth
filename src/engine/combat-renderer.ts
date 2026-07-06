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

import type { Character, CharacterClass } from "../game/party";
import type { EnemyInstance } from "../game/combat";
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
  /** Active visual effects (slashes, spell bursts). */
  effects: CombatEffect[];
  /** Message queue: log entries waiting to be revealed. */
  messageQueue: string[];
  /** Currently displayed message (or null if queue is empty). */
  currentMessage: string | null;
  /** Timestamp when the current message was first shown. */
  messageStart: number;
  /** Auto-advance delay for messages (ms). */
  messageAdvanceDelay: number;
  /** Whether the message is waiting for keypress to advance. */
  messageWaitingForInput: boolean;
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
  const cls = char.class as CharacterClass;
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
function drawEnemySprite(
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
  const y = h - 28;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, y, w, 28);
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
  const allEnemies = [...s.enemies.front, ...s.enemies.back];
  const isTargetPhase = scene.phase === "selectEnemyTarget";

  // Assign sequential target numbers to living enemies.
  let targetNum = 0;
  for (const enemy of allEnemies) {
    if (enemy.currentHp <= 0) continue;
    targetNum++;
    const anim = scene.enemyAnims.get(enemy.instanceId) ?? {
      state: "idle" as SpriteState,
      stateStart: now,
      progress: 0,
      opacity: 1,
    };
    // Compute position: count living enemies in the same row before this one.
    const rowEnemies = (enemy.row === "front" ? s.enemies.front : s.enemies.back)
      .filter((e) => e.currentHp > 0 || e === enemy);
    const idxInRow = rowEnemies.indexOf(enemy);
    const livingInRow = rowEnemies.filter((e) => e.currentHp > 0);
    const pos = enemySlotPos(idxInRow, livingInRow.length, enemy.row, w, h);
    drawEnemySprite(ctx, pos.x, pos.y, enemy, anim, now, isTargetPhase, targetNum);
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
 */
export function triggerAnimationsForMessage(
  scene: CombatScene,
  message: string,
  now: number,
  w: number,
  h: number
): void {
  const s = scene.state;

  // "X attacks Y" — party member attacks enemy.
  let m = message.match(/^(\w+) attacks (.+?)(?:!|\.)/);
  if (m) {
    const attackerName = m[1];
    const targetName = m[2].replace(/[!.]$/, "");
    // Find party member by name.
    const attacker = s.party.find((c) => c.name === attackerName);
    if (attacker) {
      setAnim(scene.partyAnims, attacker.id, "attacking", now);
    }
    // Find enemy by name.
    const target = findEnemyByName(s, targetName);
    if (target) {
      setAnim(scene.enemyAnims, target.instanceId, "hit", now);
      const pos = findEnemyPos(s, target.instanceId, w, h);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.warmWhite,
        start: now, duration: 300,
      });
    }
    return;
  }

  // "X casts Y" — spell effect.
  m = message.match(/^(\w+) casts (.+)/);
  if (m) {
    const casterName = m[1];
    const caster = s.party.find((c) => c.name === casterName);
    const enemyCaster = [...s.enemies.front, ...s.enemies.back].find((e) => e.name === casterName);
    if (caster) {
      setAnim(scene.partyAnims, caster.id, "attacking", now);
    }
    if (enemyCaster) {
      setAnim(scene.enemyAnims, enemyCaster.instanceId, "attacking", now);
    }
    // Spell burst at target (try to find target name in message).
    const targetMatch = message.match(/on (.+?)(?:!|\.)/);
    if (targetMatch) {
      const targetName = targetMatch[1].replace(/[!.]$/, "");
      const enemyTarget = findEnemyByName(s, targetName);
      const partyTarget = s.party.find((c) => c.name === targetName);
      if (enemyTarget) {
        setAnim(scene.enemyAnims, enemyTarget.instanceId, "hit", now);
        const pos = findEnemyPos(s, enemyTarget.instanceId, w, h);
        scene.effects.push({
          type: "spellBurst", x: pos.x, y: pos.y, color: COLORS.spell,
          start: now, duration: 400,
        });
      } else if (partyTarget) {
        setAnim(scene.partyAnims, partyTarget.id, "hit", now);
        const pos = findPartyPos(s, partyTarget.id, w, h);
        const isHeal = /heal|cure|restore/i.test(message);
        scene.effects.push({
          type: isHeal ? "healBurst" : "spellBurst",
          x: pos.x, y: pos.y,
          color: isHeal ? COLORS.heal : COLORS.danger,
          start: now, duration: 400,
        });
      }
    }
    return;
  }

  // "X is defeated" / "X is destroyed" — enemy death.
  m = message.match(/(\w+) (?:is defeated|is destroyed|falls|is knocked out)/);
  if (m) {
    const name = m[1];
    const enemy = findEnemyByName(s, name);
    const party = s.party.find((c) => c.name === name);
    if (enemy) {
      setAnim(scene.enemyAnims, enemy.instanceId, "defeated", now);
    } else if (party) {
      setAnim(scene.partyAnims, party.id, "defeated", now);
    }
    return;
  }

  // Enemy attacks party member: "X hits Y for N damage" or "X strikes Y".
  m = message.match(/^(\w+) hits (\w+)/);
  if (!m) m = message.match(/^(\w+) strikes (\w+)/);
  if (!m) m = message.match(/^(\w+) bites (\w+)/);
  if (m) {
    const attackerName = m[1];
    const targetName = m[2];
    const enemyAttacker = [...s.enemies.front, ...s.enemies.back].find((e) => e.name === attackerName);
    const partyTarget = s.party.find((c) => c.name === targetName);
    if (enemyAttacker) {
      setAnim(scene.enemyAnims, enemyAttacker.instanceId, "attacking", now);
    }
    if (partyTarget) {
      setAnim(scene.partyAnims, partyTarget.id, "hit", now);
      const pos = findPartyPos(s, partyTarget.id, w, h);
      scene.effects.push({
        type: "slash", x: pos.x, y: pos.y, color: COLORS.danger,
        start: now, duration: 300,
      });
    }
  }
}

// --- Animation helpers -----------------------------------------------------

function setAnim(
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
    }
  } else {
    anims.set(id, {
      state,
      stateStart: now,
      progress: 0,
      opacity: state === "defeated" ? 1 : 0,
    });
  }
}

function findEnemyByName(s: CombatState, name: string): EnemyInstance | undefined {
  return [...s.enemies.front, ...s.enemies.back].find((e) => e.name === name);
}

function findEnemyPos(
  s: CombatState,
  instanceId: string,
  w: number,
  h: number
): { x: number; y: number } {
  const all = [...s.enemies.front, ...s.enemies.back];
  for (let i = 0; i < all.length; i++) {
    if (all[i].instanceId === instanceId) {
      const rowEnemies = (all[i].row === "front" ? s.enemies.front : s.enemies.back)
        .filter((e) => e.currentHp > 0 || e === all[i]);
      const idxInRow = rowEnemies.indexOf(all[i]);
      const livingInRow = rowEnemies.filter((e) => e.currentHp > 0);
      return enemySlotPos(idxInRow, livingInRow.length, all[i].row, w, h);
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
