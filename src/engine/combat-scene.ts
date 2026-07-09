/**
 * FF6-style combat scene — canvas renderer + turn choreography engine.
 *
 * Layout (mirroring FF6):
 *   - Enemies on the LEFT (front row toward center, back row behind),
 *     party on the RIGHT in two staggered columns of animated sprites
 *     facing left.
 *   - The battle scene fills the whole canvas; the FF6 menu windows are DOM
 *     overlays along the bottom (combat-select-action-view.ts).
 *   - A slim blue banner window at the top shows spell/skill names during
 *     playback (drawn here on the canvas).
 *
 * Rhythm: the controller resolves one turn at a time (per-turn combat API)
 * and hands the turn's structured CombatEvents to playTurn(), which builds a
 * timed choreography: walk forward → attack animation → hurt animation +
 * bouncing damage number at the moment of impact → walk back. No text
 * gating — everything is communicated by animation, damage popups (white =
 * damage, green = heal, purple = poison, "MISS") and the spell banner.
 *
 * Sprites: party members use the animated 100×100 strips from
 * party-sprite-cache (pack art faces RIGHT, so the party is drawn mirrored);
 * enemies use enemy-sprite-cache strips when available and fall back to
 * procedural silhouettes.
 */

import type { Character } from "../game/party";
import type { CombatState, CombatEvent, EnemyInstance, SummonedAlly } from "../game/combat";
import { getEnemySpriteStrip } from "./enemy-sprite-cache";
import { getPartySpriteStrip, type PartySpriteState } from "./party-sprite-cache";
import { getEffectSprite } from "./effect-sprite-cache";
import type { SpriteStrip } from "./sprite-manifest";
import combatBgUrl from "../assets/combat-bg.png";

// --- Palette -----------------------------------------------------------------

const COLORS = {
  dmg: "#f5f0e6",
  crit: "#ffd769",
  heal: "#6fe06f",
  poison: "#c080ff",
  miss: "#c8c4b8",
  sp: "#7fb8f0",
  banner: "#f5f0e6",
  cursor: "#ffd700",
  shadow: "rgba(0,0,0,0.35)",
  // Procedural fallback colors (same family as the old renderer).
  classFighter: "#c44",
  classMage: "#48c",
  classPriest: "#e0d0a0",
  classThief: "#4a4",
  enemyFallback: "#8a7a5a",
  spellBurst: "#48c",
} as const;

// --- Layout ------------------------------------------------------------------

/** Party sprite draw size (px, square). Frames are 100×100 but the character
 *  art only fills ~40% of the frame, so draw large. */
const PARTY_SIZE = 210;
/** Enemy sprite draw size for image strips. */
const ENEMY_SIZE = 300;
/** Vertical spacing between members of a party column. */
const PARTY_ROW_SPACING = 92;
/** Vertical spacing between enemies in a row. */
const ENEMY_ROW_SPACING = 96;

/** Screen position (sprite center) of party member at array index i.
 *  The bottom ~175px of the canvas sits under the DOM menu windows, so all
 *  sprite baselines must stay above that. */
export function partyPos(i: number, w: number, h: number): { x: number; y: number } {
  const front = i < 3;
  const idx = i % 3;
  // FF6 diagonal: each successive member a bit lower and a bit further right.
  const colX = front ? w * 0.66 : w * 0.79;
  const topY = h * 0.23 + (front ? 0 : 26);
  return { x: colX + idx * 12, y: topY + idx * PARTY_ROW_SPACING };
}

/** Screen position (sprite center) of an enemy in its row. */
export function enemyPos(
  idxInRow: number,
  row: "front" | "back",
  w: number,
  h: number
): { x: number; y: number } {
  const colX = row === "front" ? w * 0.31 : w * 0.16;
  const topY = h * 0.26 + (row === "back" ? 30 : 0);
  return { x: colX + idxInRow * 14, y: topY + idxInRow * ENEMY_ROW_SPACING };
}

/** Screen position of a summoned ally (between party and enemies). */
export function allyPos(i: number, w: number, h: number): { x: number; y: number } {
  return { x: w * 0.55, y: h * 0.32 + i * PARTY_ROW_SPACING };
}

// --- Background ----------------------------------------------------------------

let combatBgImage: HTMLImageElement | null = null;
function getCombatBg(): HTMLImageElement | null {
  if (!combatBgImage) {
    combatBgImage = new Image();
    combatBgImage.src = combatBgUrl;
  }
  return combatBgImage;
}

// --- Actor animation state -------------------------------------------------------

/** Extended sprite state (party strips + generic mapping for enemies). */
export type ActorSpriteState = PartySpriteState; // idle|walk|attack|cast|hurt|death

export interface ActorAnim {
  state: ActorSpriteState;
  stateStart: number;
  /** Screen-space offset tween from the slot position (walk forward/back). */
  moveFromX: number;
  moveFromY: number;
  moveToX: number;
  moveToY: number;
  moveStart: number;
  moveDuration: number;
  opacity: number;
  /** For enemies: fade out after death completes. */
  fadeOutStart: number | null;
}

export function newActorAnim(now: number): ActorAnim {
  return {
    state: "idle",
    stateStart: now,
    moveFromX: 0,
    moveFromY: 0,
    moveToX: 0,
    moveToY: 0,
    moveStart: now,
    moveDuration: 0,
    opacity: 1,
    fadeOutStart: null,
  };
}

/** Current tweened screen offset for an actor. */
function animOffset(anim: ActorAnim, now: number): { x: number; y: number } {
  if (anim.moveDuration <= 0) return { x: anim.moveToX, y: anim.moveToY };
  const t = Math.min(1, (now - anim.moveStart) / anim.moveDuration);
  // Ease in-out.
  const e = t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;
  return {
    x: anim.moveFromX + (anim.moveToX - anim.moveFromX) * e,
    y: anim.moveFromY + (anim.moveToY - anim.moveFromY) * e,
  };
}

function startMove(
  anim: ActorAnim,
  toX: number,
  toY: number,
  duration: number,
  now: number
): void {
  const cur = animOffset(anim, now);
  anim.moveFromX = cur.x;
  anim.moveFromY = cur.y;
  anim.moveToX = toX;
  anim.moveToY = toY;
  anim.moveStart = now;
  anim.moveDuration = duration;
}

function setAnimState(anim: ActorAnim, state: ActorSpriteState, now: number): void {
  anim.state = state;
  anim.stateStart = now;
}

/**
 * Compute the frame index for a strip given the anim state age.
 * Looping strips cycle; non-looping strips hold their last frame.
 */
function frameIndexFor(strip: SpriteStrip, stateAge: number): number {
  const idx = Math.floor((stateAge / 1000) * strip.fps);
  if (strip.loop) return idx % strip.frameCount;
  return Math.min(strip.frameCount - 1, idx);
}

// --- Damage popups ----------------------------------------------------------------

export interface DamagePopup {
  text: string;
  x: number;
  y: number;
  color: string;
  start: number;
  /** Larger text for crits / boss damage. */
  big?: boolean;
}

const POPUP_DURATION = 900;

/** FF6 bounce: quick rise with overshoot, settle, brief hold, fade. */
function popupOffsetY(t: number): number {
  // t in [0,1]. Rise for first 35%, small bounce, hold.
  if (t < 0.2) return -38 * (t / 0.2);
  if (t < 0.35) return -38 + 14 * ((t - 0.2) / 0.15);
  if (t < 0.5) return -24 - 6 * ((t - 0.35) / 0.15);
  return -30;
}

// --- Choreography ------------------------------------------------------------------

interface ChoreoStep {
  at: number; // ms offset from choreo start
  run: (scene: CombatScene, now: number) => void;
  fired: boolean;
}

interface Choreography {
  start: number;
  duration: number;
  steps: ChoreoStep[];
}

// --- Scene state --------------------------------------------------------------------

export interface SceneCursor {
  kind: "enemy" | "party" | "ally";
  id: string;
}

export interface CombatScene {
  state: CombatState;
  partyAnims: Map<string, ActorAnim>;
  enemyAnims: Map<string, ActorAnim>;
  allyAnims: Map<string, ActorAnim>;
  /** Enemies removed from the living arrays but still animating death. */
  enemyCorpses: EnemyInstance[];
  allyCorpses: SummonedAlly[];
  popups: DamagePopup[];
  /** Spell/skill name banner (top window). */
  banner: string | null;
  bannerUntil: number;
  /** Blinking cursor over a selection candidate (target phase). */
  cursor: SceneCursor | null;
  /** The actor whose menu is open (bouncing hand marker). */
  activeActorId: string | null;
  choreo: Choreography | null;
  /** Simple spell burst / projectile effects. */
  effects: SceneEffect[];
}

export interface SceneEffect {
  type: "burst" | "projectile";
  x: number;
  y: number;
  color: string;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  start: number;
  duration: number;
}

export function createScene(state: CombatState): CombatScene {
  return {
    state,
    partyAnims: new Map(),
    enemyAnims: new Map(),
    allyAnims: new Map(),
    enemyCorpses: [],
    allyCorpses: [],
    popups: [],
    banner: null,
    bannerUntil: 0,
    cursor: null,
    activeActorId: null,
    choreo: null,
    effects: [],
  };
}

// --- Actor lookup helpers -------------------------------------------------------------

function anims(scene: CombatScene, kind: SceneCursor["kind"]): Map<string, ActorAnim> {
  return kind === "enemy"
    ? scene.enemyAnims
    : kind === "ally"
      ? scene.allyAnims
      : scene.partyAnims;
}

function getAnim(scene: CombatScene, kind: SceneCursor["kind"], id: string, now: number): ActorAnim {
  const map = anims(scene, kind);
  let a = map.get(id);
  if (!a) {
    a = newActorAnim(now);
    map.set(id, a);
  }
  return a;
}

/** Resolve an actor id (character / enemy instance / summon) to kind + position. */
export function findActor(
  scene: CombatScene,
  id: string,
  w: number,
  h: number
): { kind: SceneCursor["kind"]; x: number; y: number } | null {
  const s = scene.state;
  const pi = s.party.findIndex((c) => c.id === id);
  if (pi >= 0) {
    const p = partyPos(pi, w, h);
    return { kind: "party", ...p };
  }
  for (const row of ["front", "back"] as const) {
    const list = s.enemies[row];
    const idx = list.findIndex((e) => e.instanceId === id);
    if (idx >= 0) {
      const p = enemyPos(idx, row, w, h);
      return { kind: "enemy", ...p };
    }
  }
  const corpseIdx = scene.enemyCorpses.findIndex((e) => e.instanceId === id);
  if (corpseIdx >= 0) {
    const e = scene.enemyCorpses[corpseIdx];
    // Corpses keep their last row slot (end of row).
    const living = scene.state.enemies[e.row].length;
    const p = enemyPos(living + corpseIdx, e.row, w, h);
    return { kind: "enemy", ...p };
  }
  const ai = s.summonedAllies.findIndex((a) => a.id === id);
  if (ai >= 0) {
    const p = allyPos(ai, w, h);
    return { kind: "ally", ...p };
  }
  // Ally corpses keep drawing after removal from summonedAllies (matching
  // how they're rendered: at slots after the living allies).
  const allyCorpseIdx = scene.allyCorpses.findIndex((a) => a.id === id);
  if (allyCorpseIdx >= 0) {
    const p = allyPos(s.summonedAllies.length + allyCorpseIdx, w, h);
    return { kind: "ally", ...p };
  }
  return null;
}

// --- Choreography construction ----------------------------------------------------------

const APPROACH_MS = 220;
const ATTACK_MS = 560;
const IMPACT_AT = APPROACH_MS + ATTACK_MS * 0.55;
const RETURN_MS = 220;
const CAST_MS = 600;
const CAST_IMPACT = CAST_MS * 0.65;
const MULTI_TARGET_STAGGER = 90;
const DEATH_FADE_MS = 700;

function step(at: number, run: (scene: CombatScene, now: number) => void): ChoreoStep {
  return { at, run, fired: false };
}

/** How far an attacker steps toward the other side (party steps left, enemies right). */
function approachDelta(kind: SceneCursor["kind"]): number {
  return kind === "enemy" ? 70 : -70;
}

/** Push a damage/heal/miss popup over an actor. */
function pushPopup(
  scene: CombatScene,
  id: string,
  text: string,
  color: string,
  now: number,
  w: number,
  h: number,
  big = false
): void {
  const actor = findActor(scene, id, w, h);
  if (!actor) return;
  // Jitter x slightly so stacked popups (multi-hit) don't overlap exactly.
  const jitter = (scene.popups.length % 3) * 10 - 10;
  scene.popups.push({
    text,
    x: actor.x + jitter,
    y: actor.y - 55,
    color,
    start: now,
    big,
  });
}

/** Trigger hurt anim + popup on a target at impact. */
function impactSteps(
  t: number,
  targetId: string,
  text: string,
  color: string,
  w: number,
  h: number,
  hurt = true,
  big = false
): ChoreoStep[] {
  return [
    step(t, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (actor && hurt) {
        setAnimState(getAnim(scene, actor.kind, targetId, now), "hurt", now);
      }
      pushPopup(scene, targetId, text, color, now, w, h, big);
    }),
    // Return the target to idle after the hurt strip finishes (unless dead —
    // a later "defeated" step overrides).
    step(t + 450, (scene, now) => {
      const actor = findActor(scene, targetId, w, h);
      if (!actor) return;
      const anim = getAnim(scene, actor.kind, targetId, now);
      if (anim.state === "hurt") setAnimState(anim, "idle", now);
    }),
  ];
}

/**
 * Build and start the choreography for one resolved turn.
 * `events` are the structured CombatEvents appended by that turn (nulls are
 * log-only lines and are skipped — FF6 minimal text). Returns the total
 * playback duration in ms.
 */
export function playTurn(
  scene: CombatScene,
  events: CombatEvent[],
  spellNameFor: (spellId: string) => string,
  now: number,
  w: number,
  h: number
): number {
  const steps: ChoreoStep[] = [];
  let t = 0;

  // Track whether the acting entity walked forward so we only walk back once.
  let approachedId: string | null = null;
  let approachedKind: SceneCursor["kind"] | null = null;

  const approach = (actorId: string): void => {
    const actor = findActor(scene, actorId, w, h);
    if (!actor) return;
    approachedId = actorId;
    approachedKind = actor.kind;
    const dx = approachDelta(actor.kind);
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, actor.kind, actorId, n);
        setAnimState(a, "walk", n);
        startMove(a, dx, 0, APPROACH_MS, n);
      })
    );
  };

  const returnHome = (): void => {
    if (!approachedId || !approachedKind) return;
    const id = approachedId;
    const kind = approachedKind;
    steps.push(
      step(t, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        setAnimState(a, "walk", n);
        startMove(a, 0, 0, RETURN_MS, n);
      }),
      step(t + RETURN_MS, (sc, n) => {
        const a = getAnim(sc, kind, id, n);
        if (a.state === "walk") setAnimState(a, "idle", n);
      })
    );
    t += RETURN_MS;
    approachedId = null;
    approachedKind = null;
  };

  const attackAnim = (actorId: string): void => {
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        setAnimState(getAnim(sc, actor.kind, actorId, n), "attack", n);
      }),
      step(t + ATTACK_MS, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        if (a.state === "attack") setAnimState(a, "idle", n);
      })
    );
  };

  const castAnim = (actorId: string): void => {
    steps.push(
      step(t, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        setAnimState(getAnim(sc, actor.kind, actorId, n), "cast", n);
      }),
      step(t + CAST_MS, (sc, n) => {
        const actor = findActor(sc, actorId, w, h);
        if (!actor) return;
        const a = getAnim(sc, actor.kind, actorId, n);
        if (a.state === "cast") setAnimState(a, "idle", n);
      })
    );
  };

  const showBanner = (text: string, durationMs: number): void => {
    steps.push(
      step(t, (sc, n) => {
        sc.banner = text;
        sc.bannerUntil = n + durationMs;
      })
    );
  };

  // Whether a cast event is in flight; its spellEffect events land at a
  // shared impact time with a stagger.
  let pendingImpactBase: number | null = null;
  let pendingImpactCount = 0;

  for (const evt of events) {
    if (!evt) continue;

    switch (evt.type) {
      case "attack":
      case "ambush": {
        const isRanged = evt.type === "attack" && evt.range === "long";
        if (isRanged) {
          // Ranged: no approach; fire a projectile from attacker to target.
          attackAnim(evt.actorId);
          const impact = t + ATTACK_MS * 0.55;
          steps.push(
            step(t + ATTACK_MS * 0.2, (sc, n) => {
              const from = findActor(sc, evt.actorId, w, h);
              const to = findActor(sc, evt.targetId, w, h);
              if (!from || !to) return;
              sc.effects.push({
                type: "projectile",
                x: from.x, y: from.y,
                fromX: from.x, fromY: from.y,
                toX: to.x, toY: to.y,
                color: COLORS.dmg,
                start: n,
                duration: impact - (t + ATTACK_MS * 0.2),
              });
            })
          );
          steps.push(
            ...impactSteps(
              impact,
              evt.targetId,
              `${evt.damage}`,
              evt.crit === true ? COLORS.crit : COLORS.dmg,
              w,
              h,
              true,
              evt.crit === true
            )
          );
          t += ATTACK_MS + 200;
        } else {
          approach(evt.actorId);
          const base = t;
          steps.push(
            step(base + APPROACH_MS, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
            }),
            step(base + APPROACH_MS + ATTACK_MS, (sc, n) => {
              const actor = findActor(sc, evt.actorId, w, h);
              if (!actor) return;
              const a = getAnim(sc, actor.kind, evt.actorId, n);
              if (a.state === "attack") setAnimState(a, "idle", n);
            })
          );
          steps.push(
            ...impactSteps(
              base + IMPACT_AT,
              evt.targetId,
              `${evt.damage}`,
              evt.crit === true ? COLORS.crit : COLORS.dmg,
              w,
              h,
              true,
              evt.crit === true
            )
          );
          t = base + APPROACH_MS + ATTACK_MS;
          returnHome();
        }
        break;
      }

      case "miss": {
        if (evt.reason === "noTarget") break;
        approach(evt.actorId);
        const base = t;
        steps.push(
          step(base + APPROACH_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            setAnimState(getAnim(sc, actor.kind, evt.actorId, n), "attack", n);
          })
        );
        if (evt.targetId) {
          steps.push(
            ...impactSteps(base + IMPACT_AT, evt.targetId, "MISS", COLORS.miss, w, h, false)
          );
        }
        steps.push(
          step(base + APPROACH_MS + ATTACK_MS, (sc, n) => {
            const actor = findActor(sc, evt.actorId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.actorId, n);
            if (a.state === "attack") setAnimState(a, "idle", n);
          })
        );
        t = base + APPROACH_MS + ATTACK_MS;
        returnHome();
        break;
      }

      case "cast": {
        showBanner(spellNameFor(evt.spellId), CAST_MS + 900);
        castAnim(evt.actorId);
        pendingImpactBase = t + CAST_IMPACT;
        pendingImpactCount = 0;
        // Enemy casts carry their damage/heal directly on the cast event.
        if (evt.targetId && (evt.damage !== undefined || evt.heal !== undefined)) {
          const isHeal = evt.heal !== undefined;
          const text = isHeal ? `${evt.heal}` : `${evt.damage}`;
          steps.push(
            step(pendingImpactBase, (sc, n) => {
              const target = findActor(sc, evt.targetId!, w, h);
              if (target) {
                sc.effects.push({
                  type: "burst",
                  x: target.x, y: target.y,
                  color: isHeal ? COLORS.heal : COLORS.spellBurst,
                  start: n, duration: 400,
                });
              }
            }),
            ...impactSteps(pendingImpactBase, evt.targetId, text, isHeal ? COLORS.heal : COLORS.dmg, w, h, !isHeal)
          );
          pendingImpactCount++;
        }
        t += CAST_MS;
        break;
      }

      case "spellEffect": {
        // Lands at the pending cast's impact time (staggered per target),
        // or immediately if there was no cast event (item use etc.).
        const impactAt =
          pendingImpactBase !== null
            ? pendingImpactBase + pendingImpactCount * MULTI_TARGET_STAGGER
            : t;
        pendingImpactCount++;
        const targetId = evt.targetId;
        if (!targetId) {
          // Field-wide spells (fizzle field, dispel) have no single target:
          // burst over the affected side so the cast is visibly doing
          // something. Debuffs land on the enemy side, buffs on the party.
          const fieldX = evt.isDebuff ? w * 0.26 : w * 0.72;
          steps.push(
            step(impactAt, (sc, n) => {
              sc.effects.push({
                type: "burst",
                x: fieldX,
                y: h * 0.42,
                color: evt.isDebuff ? COLORS.poison : COLORS.heal,
                start: n,
                duration: 500,
              });
            })
          );
          t = Math.max(t, impactAt + 300);
          break;
        }
        const isHeal = evt.heal !== undefined || evt.isBuff === true || evt.statusCured !== undefined;
        const text =
          evt.damage !== undefined
            ? `${evt.damage}`
            : evt.heal !== undefined
              ? `${evt.heal}`
              : evt.statusInflicted
                ? evt.statusInflicted.toUpperCase()
                : evt.statusCured
                  ? "CURED"
                  : evt.isBuff
                    ? "UP"
                    : evt.isDebuff
                      ? "DOWN"
                      : "";
        steps.push(
          step(impactAt, (sc, n) => {
            const target = findActor(sc, targetId, w, h);
            if (target) {
              sc.effects.push({
                type: "burst",
                x: target.x, y: target.y,
                color: isHeal ? COLORS.heal : COLORS.spellBurst,
                start: n, duration: 400,
              });
            }
          })
        );
        if (text) {
          steps.push(
            ...impactSteps(
              impactAt,
              targetId,
              text,
              isHeal ? COLORS.heal : evt.damage !== undefined ? COLORS.dmg : COLORS.poison,
              w,
              h,
              evt.damage !== undefined
            )
          );
        }
        t = Math.max(t, impactAt + 300);
        break;
      }

      case "defeated": {
        const targetId = evt.targetId;
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, targetId, w, h);
            const kind: SceneCursor["kind"] = actor?.kind ?? (evt.wasEnemy ? "enemy" : "party");
            const a = getAnim(sc, kind, targetId, n);
            setAnimState(a, "death", n);
            // Enemies and summoned allies fade out after the death plays;
            // KO'd party members hold the death pose.
            if (kind !== "party") {
              a.fadeOutStart = n + 450;
            }
          })
        );
        t += evt.wasEnemy ? DEATH_FADE_MS : 450;
        break;
      }

      case "revived": {
        steps.push(
          step(t, (sc, n) => {
            const actor = findActor(sc, evt.targetId, w, h);
            if (!actor) return;
            const a = getAnim(sc, actor.kind, evt.targetId, n);
            a.opacity = 1;
            a.fadeOutStart = null;
            setAnimState(a, "idle", n);
            pushPopup(sc, evt.targetId, "REVIVED", COLORS.heal, n, w, h);
          })
        );
        t += 400;
        break;
      }

      case "defend": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "GUARD", COLORS.sp, n, w, h))
        );
        t += 350;
        break;
      }

      case "statusTick": {
        steps.push(
          ...impactSteps(t, evt.targetId, `${evt.damage}`, COLORS.poison, w, h, false)
        );
        t += 250;
        break;
      }

      case "statusEnd":
        break;

      case "flee": {
        if (!evt.success) showBanner("Can't run away!", 900);
        t += 500;
        break;
      }

      case "silence": {
        showBanner("Silence", 900);
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.targetId, "SILENCED", COLORS.poison, n, w, h))
        );
        t += 500;
        break;
      }

      case "fizzle": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "FIZZLE", COLORS.miss, n, w, h))
        );
        t += 400;
        break;
      }

      case "hide": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "HIDDEN", COLORS.sp, n, w, h))
        );
        t += 350;
        break;
      }

      case "spotted": {
        steps.push(
          step(t, (sc, n) => pushPopup(sc, evt.actorId, "SPOTTED!", COLORS.miss, n, w, h))
        );
        t += 350;
        break;
      }
    }
  }

  returnHome();

  // Give trailing popups a beat to play out.
  const duration = t + 260;
  scene.choreo = { start: now, duration, steps };
  return duration;
}

/** True when the current choreography (if any) has fully played out. */
export function isPlaybackDone(scene: CombatScene, now: number): boolean {
  if (!scene.choreo) return true;
  return now - scene.choreo.start >= scene.choreo.duration;
}

/**
 * Sync scene bookkeeping after a turn's state swap: move enemies/allies that
 * died this turn into the corpse lists so their death animations can play
 * even though they're gone from the living arrays.
 */
export function absorbDeaths(scene: CombatScene, state: CombatState): void {
  scene.state = state;
  for (const e of state.justDied) {
    if (!scene.enemyCorpses.some((c) => c.instanceId === e.instanceId)) {
      scene.enemyCorpses.push(e);
    }
  }
  for (const a of state.justDiedAllies) {
    if (!scene.allyCorpses.some((c) => c.id === a.id)) {
      scene.allyCorpses.push(a);
    }
  }
}

// --- Per-frame update ---------------------------------------------------------------

export function updateScene(scene: CombatScene, now: number): void {
  // Fire due choreography steps.
  if (scene.choreo) {
    const elapsed = now - scene.choreo.start;
    for (const s of scene.choreo.steps) {
      if (!s.fired && elapsed >= s.at) {
        s.fired = true;
        s.run(scene, now);
      }
    }
    if (elapsed >= scene.choreo.duration) {
      scene.choreo = null;
    }
  }

  // Death fade-outs.
  for (const map of [scene.enemyAnims, scene.allyAnims]) {
    for (const anim of map.values()) {
      if (anim.fadeOutStart !== null && now >= anim.fadeOutStart) {
        anim.opacity = Math.max(0, 1 - (now - anim.fadeOutStart) / DEATH_FADE_MS);
      }
    }
  }

  // Purge fully faded corpses.
  scene.enemyCorpses = scene.enemyCorpses.filter((e) => {
    const anim = scene.enemyAnims.get(e.instanceId);
    return !anim || anim.opacity > 0;
  });
  scene.allyCorpses = scene.allyCorpses.filter((a) => {
    const anim = scene.allyAnims.get(a.id);
    return !anim || anim.opacity > 0;
  });

  // Expire popups and effects.
  scene.popups = scene.popups.filter((p) => now - p.start < POPUP_DURATION);
  scene.effects = scene.effects.filter((e) => now - e.start < e.duration);

  // Expire banner.
  if (scene.banner && now >= scene.bannerUntil) scene.banner = null;
}

// --- Drawing ---------------------------------------------------------------------------

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw one frame of a sprite strip centered at (x, y-baseline), optionally
 * mirrored horizontally. `size` is the square draw size.
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
  opacity: number
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
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
  ctx.restore();
}

/** Map an actor sprite state onto the enemy strip keys (no walk/cast strips). */
function enemyStripState(state: ActorSpriteState): "idle" | "attacking" | "hit" | "defeated" {
  switch (state) {
    case "attack":
    case "cast":
    case "walk":
      return "attacking";
    case "hurt":
      return "hit";
    case "death":
      return "defeated";
    default:
      return "idle";
  }
}

/** Procedural fallback for enemies with no image strip. */
function drawEnemyFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  enemy: EnemyInstance,
  anim: ActorAnim,
  now: number
): void {
  const w = 104;
  const h = 122;
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = anim.state === "idle" ? Math.sin(now / 700 + x * 0.02) * 2 : 0;
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
  ctx.fillRect(x + 6, py - h * 0.32, 5, 5);
  ctx.fillRect(x + 18, py - h * 0.32, 5, 5);
  if (anim.state === "hurt") {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, py - h * 0.25, w / 2.2, h / 2.8, 0, 0, Math.PI * 2);
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
  anim: ActorAnim
): void {
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const colors: Record<string, string> = {
    Fighter: COLORS.classFighter,
    Mage: COLORS.classMage,
    Priest: COLORS.classPriest,
    Thief: COLORS.classThief,
    Ninja: COLORS.classThief,
  };
  ctx.fillStyle = colors[char.class] ?? "#ccc";
  ctx.fillRect(x - 12, y - 44, 24, 36);
  ctx.beginPath();
  ctx.arc(x, y - 52, 9, 0, Math.PI * 2);
  ctx.fill();
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
  h: number
): void {
  const anim = getAnim(scene, "party", char.id, now);
  const slot = partyPos(index, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;

  const isDead = char.hp <= 0 || char.status.includes("knockedOut");
  if (isDead && anim.state !== "death") setAnimState(anim, "death", now);
  if (!isDead && anim.state === "death") setAnimState(anim, "idle", now);

  const hidden = char.status.includes("hidden");

  drawShadow(ctx, x, y + PARTY_SIZE * 0.34, PARTY_SIZE * 0.26);

  const stripInfo = getPartySpriteStrip(char.class, anim.state);
  const opacity = (hidden ? 0.35 : 1) * anim.opacity;
  if (stripInfo) {
    const stateAge = now - anim.stateStart;
    const frame = frameIndexFor(stripInfo.strip, stateAge);
    // Pack art faces right; the party faces LEFT toward the enemies.
    drawStripFrame(ctx, stripInfo.img, stripInfo.strip, frame, x, y, PARTY_SIZE, true, opacity);
  } else {
    drawPartyFallback(ctx, x, y, char, anim);
  }

  // Hurt flash overlay.
  if (anim.state === "hurt" && now - anim.stateStart < 200) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - PARTY_SIZE / 4, y - PARTY_SIZE / 2.4, PARTY_SIZE / 2, PARTY_SIZE * 0.8);
    ctx.restore();
  }

  // The character art only fills the middle of the frame, so anchor the
  // marker just above the visible sprite, not the frame edge.
  drawMarkers(ctx, scene, "party", char.id, x, y - PARTY_SIZE * 0.26, now);
}

/** Draw one enemy (living or corpse). */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: EnemyInstance,
  idxInRow: number,
  scene: CombatScene,
  now: number,
  w: number,
  h: number
): void {
  const anim = getAnim(scene, "enemy", enemy.instanceId, now);
  if (anim.opacity <= 0) return;
  const slot = enemyPos(idxInRow, enemy.row, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;

  drawShadow(ctx, x, y + ENEMY_SIZE * 0.3, ENEMY_SIZE * 0.24);

  const stripInfo = getEnemySpriteStrip(enemy.id, enemyStripState(anim.state));
  if (stripInfo?.img && stripInfo.img.naturalWidth > 0) {
    const { strip, img } = stripInfo;
    const stateAge = now - anim.stateStart;
    let frame: number;
    if (anim.state === "death") {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 450) * strip.frameCount));
    } else if (strip.loop || anim.state === "idle") {
      frame = Math.floor((stateAge / 1000) * strip.fps) % strip.frameCount;
    } else {
      frame = Math.min(strip.frameCount - 1, Math.floor((stateAge / 1000) * strip.fps));
    }
    // Enemy strips are authored facing RIGHT — exactly toward the party in
    // the FF6 layout (enemies left, party right) — so no mirroring.
    drawStripFrame(ctx, img, strip, frame, x, y, ENEMY_SIZE, false, anim.opacity);
  } else {
    drawEnemyFallback(ctx, x, y, enemy, anim, now);
  }

  // Hurt flash.
  if (anim.state === "hurt" && now - anim.stateStart < 200) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y, ENEMY_SIZE / 2.6, ENEMY_SIZE / 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMarkers(ctx, scene, "enemy", enemy.instanceId, x, y - ENEMY_SIZE * 0.24, now);
}

/** Draw a summoned ally (simple glowing elemental). */
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
  const slot = allyPos(index, w, h);
  const off = animOffset(anim, now);
  const x = slot.x + off.x;
  const y = slot.y + off.y;
  drawShadow(ctx, x, y + 26, 20);
  ctx.save();
  ctx.globalAlpha = anim.opacity;
  const bob = Math.sin(now / 500 + index) * 3;
  ctx.fillStyle = COLORS.spellBurst;
  ctx.beginPath();
  ctx.arc(x, y + bob, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.spellBurst;
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(x + i * 9, y + bob);
    ctx.lineTo(x + i * 20, y + bob - 14);
    ctx.stroke();
  }
  ctx.restore();
  drawMarkers(ctx, scene, "ally", ally.id, x, y - 32, now);
}

/** Cursor (target selection) and active-actor hand markers. */
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
  if (!isCursor && !isActive) return;

  const blink = Math.floor(now / 260) % 2 === 0;
  if (isCursor && !blink) return;

  const bounce = isActive ? Math.sin(now / 180) * 3 : 0;
  ctx.save();
  ctx.fillStyle = COLORS.cursor;
  ctx.strokeStyle = "#14110d";
  ctx.lineWidth = 2;
  const y = topY - 10 + bounce;
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

/** Scene effects: spell bursts and projectiles. */
function drawEffects(ctx: CanvasRenderingContext2D, scene: CombatScene, now: number): void {
  for (const effect of scene.effects) {
    const tRaw = (now - effect.start) / effect.duration;
    const t = Math.min(1, tRaw);
    ctx.save();
    if (effect.type === "burst") {
      ctx.globalAlpha = 1 - t;
      const radius = 12 + t * 36;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + t;
        const r = radius * 0.7;
        ctx.fillStyle = effect.color;
        ctx.fillRect(effect.x + Math.cos(angle) * r - 2, effect.y + Math.sin(angle) * r - 2, 4, 4);
      }
    } else if (effect.type === "projectile") {
      const img = getEffectSprite("arrow");
      const fromX = effect.fromX ?? effect.x;
      const fromY = effect.fromY ?? effect.y;
      const toX = effect.toX ?? effect.x;
      const toY = effect.toY ?? effect.y;
      const cx = fromX + (toX - fromX) * t;
      const cy = fromY + (toY - fromY) * t;
      if (img) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -40, -40, 80, 80);
      } else {
        ctx.fillStyle = effect.color;
        ctx.fillRect(cx - 3, cy - 1, 6, 2);
      }
    }
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

/** Small FF6 window in the top-left showing the current round. */
function drawRoundIndicator(ctx: CanvasRenderingContext2D, scene: CombatScene): void {
  const round = scene.state.round;
  if (round <= 0) return;
  ctx.save();
  ctx.font = '14px "FF36", monospace';
  const text = `Round ${round}`;
  const boxW = ctx.measureText(text).width + 28;
  const boxH = 28;
  drawFF6Window(ctx, 8, 8, boxW, boxH);
  ctx.fillStyle = COLORS.banner;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8 + boxW / 2, 8 + boxH / 2 + 1);
  ctx.restore();
}

function drawBanner(ctx: CanvasRenderingContext2D, w: number, scene: CombatScene): void {
  if (!scene.banner) return;
  ctx.save();
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

// --- Main render -----------------------------------------------------------------------

export function renderScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: CombatScene,
  now: number
): void {
  const s = scene.state;

  // Background.
  const bg = getCombatBg();
  if (bg?.complete && bg.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#1a1612");
    grad.addColorStop(1, "#080705");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Enemies: back row first, then front (front overlaps back).
  s.enemies.back.forEach((e, i) => drawEnemy(ctx, e, i, scene, now, w, h));
  s.enemies.front.forEach((e, i) => drawEnemy(ctx, e, i, scene, now, w, h));
  // Corpses still fading out (kept at end-of-row slots).
  scene.enemyCorpses.forEach((e, i) => {
    const living = e.row === "front" ? s.enemies.front.length : s.enemies.back.length;
    drawEnemy(ctx, e, living + i, scene, now, w, h);
  });

  // Summoned allies.
  s.summonedAllies.forEach((a, i) => drawAlly(ctx, a, i, scene, now, w, h));
  scene.allyCorpses.forEach((a, i) =>
    drawAlly(ctx, a, s.summonedAllies.length + i, scene, now, w, h)
  );

  // Party: back column first.
  for (let i = 3; i < s.party.length; i++) drawPartyMember(ctx, s.party[i], i, scene, now, w, h);
  for (let i = 0; i < Math.min(3, s.party.length); i++) {
    drawPartyMember(ctx, s.party[i], i, scene, now, w, h);
  }

  // Effects + popups on top.
  drawEffects(ctx, scene, now);
  drawPopups(ctx, scene, now);

  // Banner window (top center) + round indicator (top left).
  drawBanner(ctx, w, scene);
  drawRoundIndicator(ctx, scene);
}
